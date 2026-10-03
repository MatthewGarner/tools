import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateState} from '../../embed/core/schema.js';
import {readExperiment} from '../../lab/dist/model-kit/session-state.js';
import {embedFragment} from '../../embed/core/definition.js';
import {encodeArticleFragment,decodeArticleFragment} from '../../embed/core/codec.js';
import {definition as teamsDefinition} from '../../embed/definitions/lab-teams.js';
const routes=['authority','context','consistency','alignment','possibilities','clocks'];
export async function verifyWorkplaceModels(browser,base,out){
 for(const route of routes){
  const {definition}=await import('../../embed/definitions/lab-'+route+'.js');
  const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const key='thinking-lab:'+route+':v1';
  await page.goto(base+'/lab/'+route+'/');await page.locator('#app[data-experiment-ready=true]').waitFor();
  await page.locator('#experiment-pin').click();const pinned=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key));
  const select=page.locator('#experiment-body select').first();const options=await select.locator('option').evaluateAll(nodes=>nodes.filter(n=>!n.disabled&&n.value!=='').map(n=>n.value));
  const previous=await select.inputValue(),next=options.find(value=>value!==previous);assert.ok(next!==undefined,route+' has a meaningful native choice');
  await select.selectOption(next);
  await page.waitForFunction(({key,before})=>localStorage.getItem(key)!==before,{key,before:JSON.stringify(pinned)});
  const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key));validateState(definition,saved.state);assert.deepEqual(saved.pinned,pinned.state);assert.notDeepEqual(saved.state,pinned.state);
  await page.locator('#experiment-undo').click();assert.deepEqual(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)).state,pinned.state);
  await page.locator('#experiment-redo').click();assert.deepEqual(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)),saved);
  await page.reload();await page.locator('#app[data-experiment-ready=true]').waitFor();assert.equal(await page.locator('#experiment-clear').isVisible(),true);
  await page.locator('.experiment-files summary').click();
  const download=page.waitForEvent('download');await page.locator('#experiment-json').click();const data=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));assert.deepEqual(readExperiment(definition,route,data),saved);
  const original=await page.evaluate(key=>localStorage.getItem(key),key);
  await page.locator('#experiment-import').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...data,format:'different'}))});
  await page.getByRole('status').filter({hasText:'Import rejected'}).waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),original);
  const svgDownload=page.waitForEvent('download');await page.locator('#experiment-svg').click();const svg=fs.readFileSync(await(await svgDownload).path(),'utf8');assert.match(svg,/<svg/);assert.doesNotMatch(svg,/\b(?:NaN|Infinity|undefined)\b/);
  const pngDownload=page.waitForEvent('download');await page.locator('#experiment-png').click();const png=fs.readFileSync(await(await pngDownload).path());assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.length>1000);
  await page.locator('#experiment-share').click();const link=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(link.includes('#article:'));
  const shared=await context.newPage();await shared.goto(link);await shared.locator('#app[data-experiment-ready=true]').waitFor();
  assert.match(await shared.locator('#experiment-storage-note').textContent(),/Shared example/);assert.equal(await shared.locator('#experiment-clear').isVisible(),false);
  await shared.locator('#experiment-pin').click();assert.equal(await shared.evaluate(key=>localStorage.getItem(key),key),original,'shared comparisons must not overwrite saved personal work');
  await shared.close();
  // Concurrent personal edits cannot silently replace another tab's work.
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify({...saved,pinned:null})),{key,saved});
  const external=await page.evaluate(key=>localStorage.getItem(key),key);await page.locator('#experiment-reset').click();
  assert.match(await page.locator('#experiment-status').textContent(),/another tab/);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),external);
  if(out)await page.screenshot({path:path.join(out,route+'-native.png'),fullPage:true});
  assert.deepEqual(errors,[],route+' native errors');await context.close();
 }
 // Editing several assumptions in a disclosure must keep that panel and focus.
 // A valid import may also recover a corrupt save even when it equals the
 // displayed default; equality must not skip writing the replacement bytes.
 const recovery=await browser.newContext({serviceWorkers:'block'}),edit=await recovery.newPage();
 await edit.goto(base+'/lab/consistency/');await edit.locator('#app[data-experiment-ready=true]').waitFor();
 await edit.locator('#workload-assumptions summary').click();await edit.locator('#jobs-0').fill('11');await edit.locator('#jobs-0').dispatchEvent('change');
 assert.equal(await edit.locator('#workload-assumptions').getAttribute('open'),'');assert.equal(await edit.locator('#jobs-0').inputValue(),'11');assert.equal(await edit.evaluate(()=>document.activeElement.id),'jobs-0');
 await edit.locator('#jobs-1').fill('12');await edit.locator('#jobs-1').dispatchEvent('change');assert.equal(await edit.locator('#workload-assumptions').getAttribute('open'),'');
 const {definition:consistency}=await import('../../embed/definitions/lab-consistency.js');
 await edit.evaluate(()=>localStorage.setItem('thinking-lab:consistency:v1','{broken'));await edit.reload();await edit.locator('#app[data-experiment-ready=true]').waitFor();
 assert.match(await edit.locator('#experiment-status').textContent(),/preserved/);
 await edit.locator('.experiment-files summary').click();
 await edit.locator('#experiment-import').setInputFiles({name:'recovered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'thinking-lab-consistency',version:1,state:consistency.initialState,pinned:null}))});
 await edit.getByRole('status').filter({hasText:'Experiment imported'}).waitFor();
 assert.deepEqual(JSON.parse(await edit.evaluate(()=>localStorage.getItem('thinking-lab:consistency:v1'))),{state:consistency.initialState,pinned:null});await recovery.close();
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 await page.goto(base+'/lab/teams/');await page.locator('#relationship-view').waitFor();
 const row=page.locator('#owner-customer').locator('..').locator('..');const before=parseFloat(await row.locator('td').last().textContent());
 await page.locator('#owner-customer').selectOption('none');const after=parseFloat(await row.locator('td').last().textContent());assert.ok(after>before,'unowned translation is uncovered even when another role absorbs freed time');
 await page.locator('#pin').click();await page.locator('#relationship-view').selectOption('funding');await page.locator('#relationship-test').selectOption('c');
 await page.reload();await page.locator('#relationship-view').waitFor();assert.equal(await page.locator('#relationship-view').inputValue(),'funding');assert.equal(await page.locator('#relationship-test').inputValue(),'c');
 const save=JSON.parse(await page.evaluate(()=>localStorage.getItem('thinking-lab:teams:v1')));assert.equal(save.baseline.relationships.maps.funding.test,'b');assert.equal(save.relationships.maps.funding.test,'c');
 const original=await page.evaluate(()=>localStorage.getItem('thinking-lab:teams:v1')),article=await context.newPage();
 await article.goto(base+'/embed/lab-teams/v2/'+embedFragment({state:teamsDefinition.initialState,view:'maps',controls:['map','owner-customer','ari']}));await article.locator('#embed[data-embed-state=ready]').waitFor();
 const beforeLink=await article.locator('.embed-footer a').getAttribute('href');await article.locator('#control-owner-customer').selectOption('0');
 await article.waitForFunction(href=>document.querySelector('.embed-footer a')?.getAttribute('href')!==href,beforeLink);
 await article.goto(await article.locator('.embed-footer a').getAttribute('href'));await article.locator('#owner-customer').waitFor();assert.equal(await article.locator('#owner-customer').inputValue(),'none');
 await article.locator('#owner-funding').selectOption('none');assert.equal(decodeArticleFragment(new URL(article.url()).hash,{tool:'lab-teams',version:2}).relationships.owners.funding,'none');
 assert.equal(await article.evaluate(()=>localStorage.getItem('thinking-lab:teams:v1')),original);
 const legacy=structuredClone(teamsDefinition.initialState);delete legacy.relationships;delete legacy.baseline.relationships;
 await article.goto('about:blank');await article.goto(base+'/lab/teams/#'+encodeArticleFragment({tool:'lab-teams',version:1,state:legacy}));await article.locator('#relationship-view').waitFor();
 await article.locator('#owner-customer').selectOption('none');assert.equal(decodeArticleFragment(new URL(article.url()).hash,{tool:'lab-teams',version:2}).relationships.owners.customer,'none');
 assert.equal(await article.evaluate(()=>localStorage.getItem('thinking-lab:teams:v1')),original);
 await context.close();console.log('PASS six workplace models: native changes, independent comparisons, Undo/Redo, reload, actual JSON/SVG/PNG exports, rejected imports, private/shared isolation and concurrent edit protection; Teams maps and coordination.');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {chromium}=await import('playwright');const browser=await chromium.launch();try{await verifyWorkplaceModels(browser,process.env.BASE||'http://localhost:8087');}finally{await browser.close();}
}
