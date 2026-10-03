import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {trackErrors} from './_harness.mjs';
const base=process.env.BASE||'http://localhost:8087';
const browser=await chromium.launch();
const routes=(process.env.TEMPLATE_LAB_ROUTES??'reframe,mixer,constraints,analogy,objections,interventions,questions,answers,family,scenes,territory,disagreement').split(',').filter(Boolean);
const records=page=>page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('mg:template:v1:')).map(key=>JSON.parse(localStorage.getItem(key))));
async function saveTemplate(page,name){
  await page.getByRole('button',{name:'Templates',exact:true}).click();
  const dialog=page.locator('.mg-template-dialog');await dialog.getByRole('button',{name:'Save current as template',exact:true}).click();
  await dialog.getByLabel('Template name').fill(name);await dialog.getByRole('button',{name:'Save template',exact:true}).click();
  await dialog.getByRole('button',{name:'Make default',exact:true}).waitFor();return dialog;
}
try{
  for(const route of routes){
    const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await ctx.newPage(),errors=trackErrors(page);
    await page.goto(`${base}/lab/${route}/`);const field=page.locator(route==='interventions'?'#work-problem':'#problem');await field.fill('Reusable review question');
    const dialog=await saveTemplate(page,'Weekly review');await dialog.getByRole('button',{name:'Make default',exact:true}).click();await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});
    const record=(await records(page))[0],key=`thinking-lab:${route}:v1`,collection=route==='reframe'?'sessions':'workspaces';
    await field.fill('Current work to preserve');
    await page.waitForFunction(({key,collection})=>JSON.parse(localStorage.getItem(key))?.[collection]?.some(w=>w.problem==='Current work to preserve'),{key,collection});
    const original=await page.evaluate(({key})=>JSON.parse(localStorage.getItem(key)).activeId,{key});
    await page.getByRole('button',{name:'New',exact:true}).click();await page.waitForFunction(({key,collection})=>JSON.parse(localStorage.getItem(key))?.[collection]?.length===2,{key,collection});
    assert.equal(await field.inputValue(),'Reusable review question',route+' default applied');
    let saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.notEqual(saved.activeId,original);assert.equal(saved[collection].find(w=>w.id===original).problem,'Current work to preserve');assert.deepEqual((await records(page))[0],record,'template content remains fixed');
    await page.getByRole('button',{name:'Templates',exact:true}).click();await page.locator('.mg-template-dialog').getByRole('button',{name:'Start blank',exact:true}).click();await page.waitForFunction(({key,collection})=>JSON.parse(localStorage.getItem(key))?.[collection]?.length===3,{key,collection});assert.equal(await field.inputValue(),'');
    await page.getByRole('button',{name:'Templates',exact:true}).click();const manage=page.locator('.mg-template-dialog');await manage.getByRole('button',{name:'Rename',exact:true}).click();await manage.getByLabel('Template name').fill('Weekly <review>');await manage.getByRole('button',{name:'Save template',exact:true}).click();await manage.getByText('Weekly <review>',{exact:true}).waitFor();assert.equal(await manage.locator('review').count(),0);
    await manage.getByRole('button',{name:'Delete',exact:true}).click();await manage.getByRole('button',{name:'Delete template',exact:true}).click();assert.equal((await records(page)).length,0);assert.equal(await page.evaluate(route=>localStorage.getItem(`mg:template-default:v1:lab:${route}`),route),null);
    assert.deepEqual(errors,[],route);await ctx.close();console.log('PASS personal template/default/new/blank/preservation/rename/delete: '+route);
  }
  const ctx=await browser.newContext({serviceWorkers:'block'}),page=await ctx.newPage(),errors=trackErrors(page);
  // Fermi's authoring fields are intentionally hidden until Edit is requested.
  await page.goto(base+'/fermi/');await page.getByRole('button',{name:'Edit formula & ranges',exact:true}).click();await page.locator('#estimatequestion').fill('Reusable estimate');let dialog=await saveTemplate(page,'Estimate template');await dialog.getByRole('button',{name:'Make default',exact:true}).click();await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});
  await page.locator('#estimatequestion').fill('Unfinished estimate');await page.getByRole('button',{name:'New from template',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#estimatequestion')?.value==='Reusable estimate');
  const copies=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('mg:recent:v1:tools:')).map(key=>JSON.parse(localStorage.getItem(key))));assert.equal(copies.length,1);assert.equal(copies[0].name,'Unfinished estimate');
  await page.getByRole('button',{name:'Templates',exact:true}).click();dialog=page.locator('.mg-template-dialog');await dialog.getByRole('button',{name:'Save current as template',exact:true}).click();await dialog.getByLabel('Template name').fill('Will fail');await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};});await dialog.getByRole('button',{name:'Save template',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Nothing was saved'}).waitFor();assert.equal((await records(page)).length,1);assert.deepEqual(errors,[]);await ctx.close();console.log('PASS original model template preserves outgoing draft and reports failed writes');
  if(process.env.TEMPLATE_SCREENSHOTS){
    await mkdir(process.env.TEMPLATE_SCREENSHOTS,{recursive:true});
    for(const width of [390,1280])for(const colorScheme of ['light','dark']){
      const ctx=await browser.newContext({viewport:{width,height:900},colorScheme,serviceWorkers:'block'}),page=await ctx.newPage();await page.goto(base+'/lab/objections/');await page.locator('#problem').fill('Reusable review');const dialog=await saveTemplate(page,'My decision review');await dialog.getByRole('button',{name:'Make default',exact:true}).click();await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.ok((await dialog.boundingBox()).width<=width);await page.screenshot({path:`${process.env.TEMPLATE_SCREENSHOTS}/templates-${width}-${colorScheme}.png`});await ctx.close();
    }
  }
}finally{await browser.close();}
