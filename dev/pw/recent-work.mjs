import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {TOOL_DIRS,ENERGY_TOOL_DIRS} from '../tool-dirs.mjs';
import {decodeHash,encodeHash} from '../../assets/series.js';
const base=process.env.BASE||'http://localhost:8087', energy=process.env.EBASE||process.env.ENERGY_BASE||'http://localhost:'+(process.env.EPORT||8089);
const browser=await chromium.launch();
const records=page=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mg:recent:v1:')).map(k=>JSON.parse(localStorage.getItem(k))).sort((a,b)=>a.savedAt-b.savedAt));
async function save(page,name){
 await page.locator('.recent-save').click();const dialog=page.locator('.recent-dialog');await dialog.waitFor();
 await dialog.getByLabel('Copy name').fill(name);await dialog.getByRole('button',{name:'Save copy',exact:true}).click();await dialog.waitFor({state:'detached'});
 return (await records(page)).at(-1);
}
const contextOptions={viewport:{width:1280,height:900},reducedMotion:'reduce',serviceWorkers:'block'};
try{
 // Every shipped tool's real capture callback must produce a restorable model.
 for(const [origin,tools] of [[base,TOOL_DIRS],[energy,ENERGY_TOOL_DIRS]])for(const tool of tools){
  const ctx=await browser.newContext(contextOptions),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/'+tool+'/');await page.locator('.recent-save').waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal((await records(page)).length,0,tool+' visits/examples never populate Recent work');
  const first=await save(page,tool+' original'),state=await decodeHash(first.hash);assert.ok(state&&typeof state==='object',tool+' encoded state');
  if(tool==='gauge'){assert.equal(state.id,undefined);assert.equal(state.key,undefined);assert.equal(typeof state.t,'string');}
  // Leave the instrument first: hash-only navigation does not rerun its boot.
  await page.getByRole('link',{name:'Your work',exact:true}).click();
  assert.equal(new URL(page.url()).origin,origin,'Recent work stays with its browser storage');
  await page.getByRole('link',{name:new RegExp(tool+' original')}).click();await page.locator('.recent-save').waitFor();
  const second=await save(page,tool+' reopened'),restored=await decodeHash(second.hash);
  // Premortem deliberately mints new identifiers and normalises optional fields.
  if(tool==='premortem'){assert.equal(restored.title,state.title);assert.equal(restored.entries.length,state.entries.length);assert.notEqual(restored.id,state.id);assert.ok(await page.locator('#importstrip').isVisible());}
  else assert.deepEqual(restored,state,tool+' reopened snapshot round trip');
  assert.equal((await records(page))[0].name,tool+' original',tool+' save never mutates an earlier snapshot');
  assert.deepEqual(errors,[],tool);console.log('PASS Recent work capture and reopen: '+tool);await ctx.close();
 }
 const ctx=await browser.newContext(contextOptions),page=await ctx.newPage();
 await page.goto(energy+'/frequency/');await page.locator('.recent-save').waitFor();
 // Same event turn as the edit: a debounced location.hash would still be stale.
 await page.evaluate(()=>{const i=document.querySelector('#inertia');i.value='155';i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.recent-save').click();});
 await page.locator('.recent-dialog').waitFor();await page.getByLabel('Copy name').fill('Fresh edit');await page.locator('.recent-dialog').getByRole('button',{name:'Save copy',exact:true}).click();
 await page.locator('.recent-dialog').waitFor({state:'detached'});assert.equal((await decodeHash((await records(page))[0].hash)).i,155);
 for(let i=2;i<=4;i++)await save(page,'Grid '+i);
 await page.goto(energy+'/');assert.equal(await page.locator('.recent-list li').count(),3);await page.getByRole('button',{name:'Show all (4)'}).click();assert.equal(await page.locator('.recent-list li').count(),4);
 await page.getByLabel('Manage Fresh edit',{exact:true}).click();await page.getByRole('button',{name:'Rename Fresh edit',exact:true}).click();await page.getByLabel('Copy name').fill('<b>My grid</b>');await page.getByRole('button',{name:'Save name',exact:true}).click();
 await page.getByRole('link',{name:/<b>My grid<\/b>/}).waitFor();assert.equal(await page.locator('.recent-name b').count(),0);
 await page.getByLabel('Manage Grid 2',{exact:true}).click();await page.getByRole('button',{name:'Remove Grid 2',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('.recent-list li').count(),4);
 await page.getByLabel('Manage Grid 2',{exact:true}).click();await page.getByRole('button',{name:'Remove Grid 2',exact:true}).click();await page.getByRole('button',{name:'Remove copy',exact:true}).click();assert.equal(await page.locator('.recent-list li').count(),3);
 const other=await ctx.newPage();await other.goto(energy+'/frequency/');await save(other,'Other tab');await page.getByRole('link',{name:/Other tab/}).waitFor();await other.close();
 await page.goto(base+'/');assert.equal(await page.locator('.recent-open').count(),0,'separate origins');
 await page.goto(base+'/energy/');await page.evaluate(async()=>{const {recentStore}=await import('/assets/recent-store.js');recentStore(localStorage,'energy').add({id:'preview',tool:'frequency',name:'Preview',hash:btoa(JSON.stringify({i:155})),savedAt:Date.now()});});await page.reload();
 assert.ok((await page.locator('.recent-open').getAttribute('href')).startsWith('/energy/frequency/'),'combined preview keeps local Energy route');await page.goto(base+'/');assert.equal(await page.locator('.recent-open').count(),0,'scopes stay separate on one origin');
 console.log('PASS Recent work fresh edits, rename/remove, multiple tabs and origin isolation');
 await ctx.close();
 const organised=await browser.newContext(contextOptions),wp=await organised.newPage();
 await wp.goto(base+'/lab/objections/');await wp.locator('#problem').fill('Which support change should we try?');
 await wp.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='Saved in this browser');
 const saved=await wp.evaluate(()=>localStorage.getItem('thinking-lab:objections:v1'));
 await wp.goto(base+'/');await wp.getByRole('link',{name:/Which support change should we try/}).waitFor();
 const workRow=wp.locator('.work-list li').filter({hasText:'Which support change should we try?'});
 assert.match(await workRow.textContent(),/Updated/);
 await workRow.getByLabel('Manage Which support change should we try?',{exact:true}).click();await workRow.getByRole('button',{name:'Pin Which support change should we try?',exact:true}).click();
 // Wrapped select labels include option text in getByLabel; use the control's accessible name.
 await wp.getByRole('combobox',{name:'Show',exact:true}).selectOption('pinned');assert.equal(await wp.locator('.work-list li').count(),1);
 await wp.getByLabel('Manage Which support change should we try?',{exact:true}).click();await wp.getByRole('button',{name:'Rename Which support change should we try?',exact:true}).click();
 await wp.getByRole('textbox',{name:'Name in Your work',exact:true}).fill('Friday review');await wp.getByRole('button',{name:'Save name',exact:true}).click();
 assert.equal(await wp.evaluate(()=>localStorage.getItem('thinking-lab:objections:v1')),saved,'catalogue name preserves authored question');
 await wp.getByLabel('Manage Friday review',{exact:true}).click();await wp.getByRole('button',{name:'Archive Friday review',exact:true}).click();assert.equal(await wp.locator('.work-list li').count(),0);
 await wp.getByRole('combobox',{name:'Show',exact:true}).selectOption('archived');await wp.getByRole('link',{name:/Friday review/}).waitFor();
 await wp.getByLabel('Manage Friday review',{exact:true}).click();await wp.getByRole('button',{name:'Restore Friday review',exact:true}).click();assert.equal(await wp.locator('.work-list li').count(),0);
 await wp.getByRole('combobox',{name:'Show',exact:true}).selectOption('active');await wp.getByRole('link',{name:/Friday review/}).click();assert.equal(await wp.locator('#problem').inputValue(),'Which support change should we try?');
 await organised.close();console.log('PASS Work management: changed-save dates, names, pins, reversible archive and exact native resume');
 const fail=await browser.newContext(contextOptions),fp=await fail.newPage();await fp.goto(base+'/flow/');await fp.locator('.recent-save').waitFor();
 await fp.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
 await fp.locator('.recent-save').click();await fp.locator('.recent-dialog').getByRole('button',{name:'Save copy',exact:true}).click();await fp.getByRole('alert').filter({hasText:'Nothing was saved'}).waitFor();assert.equal((await records(fp)).length,0);
 await fp.getByRole('button',{name:'Cancel',exact:true}).click();// Native dialog close dispatches asynchronously; assert restored focus once it has run.
 await fp.waitForFunction(()=>document.activeElement===document.querySelector('.recent-save'));await fail.close();console.log('PASS Recent work quota failure and keyboard focus');
 // A partial Duel setup and a mid-turn Signal exercise are work, too.
 const special=await browser.newContext(contextOptions),sp=await special.newPage();await sp.goto(base+'/duel/');await sp.locator('.recent-save').waitFor();await sp.locator('#question').fill('My draft');await sp.locator('#items').fill('One\nTwo');const draft=await save(sp,'Draft');await sp.goto(base+'/');await sp.goto(base+'/duel/#'+draft.hash);await sp.locator('.recent-save').waitFor();assert.equal(await sp.locator('#items').inputValue(),'One\nTwo');assert.equal(await sp.locator('#setupcard').isVisible(),true);
 await sp.goto(base+'/signal-vs-noise/');await sp.locator('.recent-save').waitFor();await sp.locator('#next').click();const run=await save(sp,'In progress');await sp.goto(base+'/');await sp.goto(base+'/signal-vs-noise/#'+run.hash);await sp.locator('.recent-save').waitFor();assert.equal(await sp.locator('#reveal').isVisible(),true);assert.match(await sp.locator('#next').textContent(),/Go to quarter 2/);await special.close();console.log('PASS Recent work unfinished Duel and Signal sessions');
 // Installed-app contract: a never-visited instrument can open from the shelf offline.
 for(const [origin,tool] of [[base,'flow'],[energy,'frequency']]){
  const offline=await browser.newContext({...contextOptions,serviceWorkers:'allow'}),op=await offline.newPage();await op.goto(origin+'/'+tool+'/');await op.locator('.recent-save').waitFor();await save(op,'Offline model');await op.evaluate(()=>navigator.serviceWorker.ready);await op.goto(origin+'/');await op.locator('.recent-open').waitFor();await offline.setOffline(true);await op.locator('.recent-open').click();await op.locator('.recent-save').waitFor();assert.equal(new URL(op.url()).pathname,'/'+tool+'/');await save(op,'Offline revision');assert.equal((await records(op)).length,2);await offline.close();
 }
 console.log('PASS Recent work offline on both installed-app origins');
 if(process.env.RECENT_SCREENSHOTS)await mkdir(process.env.RECENT_SCREENSHOTS,{recursive:true});
 for(const [label,origin] of [['tools',base],['energy',energy]])for(const width of [390,1280])for(const theme of ['light','dark']){
  const visual=await browser.newContext({...contextOptions,viewport:{width,height:900},colorScheme:theme}),vp=await visual.newPage();await vp.goto(origin+(label==='tools'?'/product/':'/'));await vp.evaluate(()=>document.fonts.ready);
  assert.equal(await vp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.RECENT_SCREENSHOTS)await vp.screenshot({path:process.env.RECENT_SCREENSHOTS+'/'+label+'-'+width+'-'+theme+'-empty.png'});
  await vp.evaluate(async scope=>{const {recentStore}=await import('/assets/recent-store.js');const tool=scope==='tools'?'flow':'frequency';const names=scope==='tools'?['Team capacity review','Launch plan — October','Support queue scenarios']:['Winter battery scenario','Low-inertia grid','Morning dispatch'];for(let i=0;i<names.length;i++)recentStore(localStorage,scope).add({id:'visual'+i,tool,name:names[i],hash:btoa('{}'),savedAt:Date.now()+i});},label);await vp.reload();await vp.evaluate(()=>document.fonts.ready);
  const boxes=await vp.locator('.recent-open,.recent-manage summary').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.width,r.height,r.left,r.right];}));assert.ok(boxes.every(([w,h,l,r])=>w>=44&&h>=44&&l>=0&&r<=width));assert.equal(await vp.locator('.catalogue-row').count(),label==='tools'?17:5);
  if(process.env.RECENT_SCREENSHOTS)await vp.screenshot({path:process.env.RECENT_SCREENSHOTS+'/'+label+'-'+width+'-'+theme+'-saved.png'});await visual.close();
 }
 console.log('PASS Recent work/catalogues: complete inventory, phone targets and both themes');
}finally{await browser.close();}
