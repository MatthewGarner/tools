/* Test actual released hosts, not just metadata rows. No app storage/network code belongs here. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {validateCatalogue,embedFragment} from '../../embed/core/definition.js';
import {evidenceDirectory} from './session.mjs';
const base=process.env.BASE||'http://localhost:8089';
const catalogue=validateCatalogue(JSON.parse(fs.readFileSync(new URL('../../embed/catalogue.json',import.meta.url),'utf8')));
const latest=[...new Map(catalogue.tools.slice().sort((a,b)=>a.version-b.version).map(entry=>[entry.id,entry])).values()];
const evidence=evidenceDirectory('standard-embeds'),browser=await chromium.launch();
const timings=[];
try{
  const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    window.embedSideEffects=[];
    for(const name of ['getItem','setItem','removeItem','clear'])Storage.prototype[name]=function(){window.embedSideEffects.push('storage:'+name);throw Error('Article storage is disabled');};
    const fetch=window.fetch;window.fetch=(...args)=>{window.embedSideEffects.push('fetch');return fetch(...args);};
    window.WebSocket=function(){window.embedSideEffects.push('socket');throw Error('Article network sessions are disabled');};
    window.mainThreadLags=[];let previous=performance.now();setInterval(()=>{const now=performance.now();window.mainThreadLags.push(now-previous);previous=now;},20);
  });
  const page=await context.newPage();let errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  for(const entry of latest){
    console.log('Checking '+entry.id);errors=[];
    for(const [width,theme]of [[900,'light'],[390,'dark']]){
      await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme});
      const started=Date.now();await page.goto(base+entry.route);
      await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('#embed')?.dataset.embedState),{},{timeout:15000});
      assert.equal(await page.locator('#embed').getAttribute('data-embed-state'),'ready',entry.id+': '+await page.locator('[role="alert"]').textContent());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,entry.id+' page overflow');
      assert.deepEqual(await page.evaluate(()=>window.embedSideEffects),[],entry.id+' side effects');
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      const href=await page.locator('.embed-footer a').getAttribute('href');const expected=entry.fullTool.url.replace('https://tools.matthewgarner.me',new URL(base).origin);assert.ok(href?.startsWith(expected+'#'),entry.id+' complete handoff');
      await page.screenshot({path:path.join(evidence,entry.id+'-'+width+'-'+theme+'.png'),fullPage:true});
      timings.push({tool:entry.id,width,ms:Date.now()-started,maxMainThreadInterval:Math.round(await page.evaluate(()=>Math.max(...window.mainThreadLags)))});
    }
    assert.deepEqual(errors,[],entry.id+' browser errors');
    const selected=entry.views[entry.defaultView].defaultControls??entry.views[entry.defaultView].controls;
    const id=selected.find(id=>entry.controls[id].type!=='action'),control=entry.controls[id];
    if(control){
      const input=page.locator('#control-'+id),before=await page.locator('.embed-footer a').getAttribute('href');
      if(control.type==='textarea'){
        const wrapper=input.locator('..');await wrapper.locator('summary').click();await input.fill((await input.inputValue())+'\n');await wrapper.getByRole('button',{name:'Apply changes',exact:true}).click();
      }else if(['range','number'].includes(control.type)){
        const value=Number(await input.inputValue()),next=value===control.max?control.min:Math.min(control.max,value+control.step);
        await input.evaluate((node,{next,event})=>{node.value=String(next);node.dispatchEvent(new Event(event,{bubbles:true}));},{next,event:control.commit?'change':'input'});
      }else if(control.type==='select'){
        const current=Number(await input.inputValue());await input.selectOption(String((current+1)%control.options.length));
      }else if(control.type==='checkbox')await input.setChecked(!await input.isChecked());
      else {const value=await input.inputValue();await input.fill(Number.isFinite(Number(value))?String(Number(value)+1):value+' example');if(control.commit)await input.press('Tab');}
      await page.waitForFunction(before=>{const href=document.querySelector('.embed-footer a')?.getAttribute('href');return href&&href!==before||!document.querySelector('[role="alert"]').hidden;},before,{timeout:15000});
      assert.equal(await page.locator('[role="alert"]').isVisible(),false,entry.id+': valid reader control should render');
      assert.notEqual(await page.locator('.embed-footer a').getAttribute('href'),before,entry.id+' current-state handoff');
      await page.getByRole('button',{name:'Reset example',exact:true}).click();
      await page.waitForFunction(before=>document.querySelector('.embed-footer a')?.getAttribute('href')===before,before);
      assert.deepEqual(await page.evaluate(()=>window.embedSideEffects),[],entry.id+' control side effects');
    }
  }
  const flow=latest.find(entry=>entry.id==='flow');
  for(const state of ['#%FF',embedFragment({state:{...flow.initialState,d:999},view:flow.defaultView,controls:['demand']}),embedFragment({state:flow.initialState,view:'missing',controls:[]}),embedFragment({state:flow.initialState,view:flow.defaultView,controls:['missing']})]){
    // Fragments are boot inputs; a hash-only goto does not create a new document.
    await page.goto('about:blank');await page.goto(base+flow.route+state);await page.locator('[role="alert"]:visible').waitFor();assert.equal(await page.locator('#embed').getAttribute('data-embed-state'),'error');assert.equal(await page.locator('.embed-footer a[href]').count(),0);
  }
  // An invalid source edit cannot replace the last working picture or handoff.
  const wardley=latest.find(entry=>entry.id==='wardley');await page.goto(base+wardley.route);await page.locator('#embed[data-embed-state=ready]').waitFor();
  const before=await page.locator('.embed-footer a').getAttribute('href');await page.locator('.embed-source summary').click();await page.locator('textarea').fill('');await page.getByRole('button',{name:'Apply changes',exact:true}).click();await page.locator('[role="alert"]:visible').waitFor();assert.equal(await page.locator('.embed-footer a').getAttribute('href'),before);assert.ok(await page.locator('.embed-stage svg').count());
  // The browser security boundary rejects executable output even if a future adapter regresses.
  for(const markup of ['<img src="x" onerror="alert(1)">','<script>alert(1)</script>','<style>@import "https://example.com/x";</style><p>Bad</p>','<svg><image href="https://example.com/x"/></svg>']){
    await page.goto('about:blank');await page.goto(base+flow.route);await page.locator('#embed[data-embed-state=ready]').waitFor();
    await page.evaluate(async({route,markup})=>{const {mount}=await import('/embed/runtime/mount.js');const {definition}=await import(route);const copy={...definition,views:{...definition.views,[definition.defaultView]:{...definition.views[definition.defaultView],render:()=>({html:markup,summary:'Unsafe output'})}}};await mount(copy);},{route:'/'+flow.definition,markup});
    await page.locator('[role="alert"]:visible').waitFor();assert.equal(await page.locator('#embed').getAttribute('data-embed-state'),'error');
  }
  // Returning to cached state must cancel obsolete work, not merely hide its result.
  const workerContext=await browser.newContext({serviceWorkers:'block'});
  await workerContext.addInitScript(()=>{window.workersStarted=0;window.workersStopped=0;const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.workersStarted++;}terminate(){window.workersStopped++;super.terminate();}};});
  const workerPage=await workerContext.newPage(),cycles=latest.find(entry=>entry.id==='energy-cycles');
  await workerPage.goto(base+cycles.route);await workerPage.locator('#embed[data-embed-state=ready]').waitFor();
  assert.equal(await workerPage.evaluate(()=>window.workersStarted),1);
  const original=await workerPage.locator('.embed-footer a').getAttribute('href');
  await workerPage.locator('.embed-source summary').click();const source=workerPage.locator('textarea');await source.fill((await source.inputValue())+'\n');await workerPage.getByRole('button',{name:'Apply changes',exact:true}).click();
  await workerPage.locator('.embed-stage[aria-busy=true]').waitFor();
  // One animation frame starts the new projection; waiting on its missing link alone is earlier.
  await workerPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await workerPage.getByRole('button',{name:'Reset example',exact:true}).click();
  await workerPage.waitForFunction(url=>document.querySelector('.embed-footer a')?.getAttribute('href')===url,original);
  assert.equal(await workerPage.evaluate(()=>window.workersStopped),1,'cached reset cancels the obsolete calculation');
  await workerPage.reload();await workerPage.locator('#embed[data-embed-state=ready]').waitFor();
  await workerContext.close();
  const blockedContext=await browser.newContext();await blockedContext.route('**/project-worker.js',route=>route.abort());
  const blockedPage=await blockedContext.newPage();await blockedPage.goto(base+cycles.route);await blockedPage.locator('[role="alert"]:visible').waitFor();assert.equal(await blockedPage.locator('#embed').getAttribute('data-embed-state'),'error');await blockedContext.close();
  fs.writeFileSync(path.join(evidence,'timings.json'),JSON.stringify(timings,null,2));
  console.log('PASS '+latest.length+' released tools: desktop/light, phone/dark, isolated memory-only state, reader controls, reset, current-state links, malformed states, invalid edits and unsafe output. Evidence '+evidence);
  await context.close();
}finally{await browser.close();}
