/* Observatory: source-backed presentation, actual starts, inspection and complete decks. */
import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// CI uses the shared 8087 origin; evidence belongs in the host's writable temp directory.
const BASE=process.env.BASE||'http://localhost:8087',out=process.env.TIMELINE_EVIDENCE||join(tmpdir(),'timeline-qa');mkdirSync(out,{recursive:true});
const source=`title: Lantern — launch forecast
style: field
font: Chapter
accent: #315D48
today: 2026-09-05
App: Beta cut 2026-09-18 .. 2026-10-02 [started: 2026-08-10]
App: Store review 2026-10-19 .. 2026-11-16 // External review timing
Assurance: Privacy audit 2026-10-12 .. 2026-11-23 [started: 2026-08-24] // Independent assessment
Launch: Campaign ready 2026-11-02 .. 2026-11-16
Launch: Launch forecast 2026-11-20 .. 2026-12-11
Launch: Conference 2026-12-15 [fixed]`;
const enc=t=>Buffer.from(JSON.stringify({t,e:0})).toString('base64');
const browser=await chromium.launch();const errors=[],evidence=[];
async function ready(page,count=6){await page.waitForFunction(n=>document.querySelectorAll('#preview [data-field-item]').length===n,count);}
async function open(t,options={}){const c=await browser.newContext({viewport:{width:1440,height:1024},reducedMotion:'reduce',...options});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/timeline/#'+enc(t),{waitUntil:'networkidle'});await ready(p,t.includes('Milestone 23')?24:6);return [p,c];}
try{
 for(const theme of ['light','dark'])for(const phone of [false,true]){
  const [page,c]=await open(source,{colorScheme:theme,...(phone?devices['iPhone 13']:{})});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page fits viewport');
  await page.getByRole('button',{name:'Inspect milestone: Privacy audit',exact:true}).click();
  await page.locator('#inspector').waitFor({state:'visible'});
  const detail=await page.locator('#inspector').innerText();assert.match(detail,/24 Aug 2026/);assert.match(detail,/12 days/);assert.match(detail,/7 weeks at P50 · 13 weeks at P90/);
  await page.waitForFunction(()=>document.querySelector('[data-selection]'));
  await page.screenshot({path:`${out}/${theme}-${phone?'phone':'desktop'}-focus.png`,fullPage:false});
  if(phone)assert.equal(await page.locator('#inspector').getAttribute('role'),'dialog');
  await page.getByRole('button',{name:'Close milestone details'}).click();
  await page.getByRole('button',{name:'Export deck',exact:true}).click();
  await page.locator('#slidepreviewdialog').waitFor({state:'visible'});assert.match(await page.locator('#slideposition').innerText(),/Slide 1 of 1/);
  assert.equal(await page.locator('#slidecanvas svg').getAttribute('width'),'1920');
  if(!phone){const download=page.waitForEvent('download');await page.locator('#slidedownload').click();await (await download).saveAs(`${out}/${theme}-slide.png`);}
  await page.locator('#slideclose').click();
  for(const style of ['review','decisions','register','field']){
   await page.locator(`#stylepicker [data-style="${style}"]`).click();
   await page.waitForFunction(s=>document.querySelector('#preview svg')?.dataset.direction===s,style);
   const state=await page.evaluate(async()=>{const {decodeHash}=await import('/assets/series.js');return decodeHash(location.hash.slice(1));});
   // Hash persistence is debounced; observable canonical source follows next.
   await page.waitForFunction(s=>localStorage.getItem('timeline-src')?.includes('style: '+s),style);
   assert.equal(await page.locator('#preview [data-field-item]').count(),6);
   await page.screenshot({path:`${out}/${theme}-${phone?'phone':'desktop'}-${style}.png`,fullPage:false});
  }
  await page.locator('.appearance summary').click();await page.locator('#fontchoice').selectOption('DM Sans');
  await page.waitForFunction(()=>document.querySelector('#preview svg')?.dataset.font==='DM Sans');
  await page.locator('#themechoice').selectOption(theme==='light'?'dark':'light');
  await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme==='light'?'dark':'light');
  await page.locator('.appearance summary').click();
  await page.getByRole('button',{name:'Inspect milestone: Privacy audit',exact:true}).click();
  await page.getByRole('button',{name:'Edit milestone',exact:true}).click();
  await page.locator('#inspectform [name=started]').fill('2026-08-17');await page.getByRole('button',{name:'Save changes'}).click();
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent.includes('19 days'));
  if(phone){await page.getByRole('button',{name:'Close milestone details'}).click();await page.locator('.touch-undo').click();}
  else{await page.getByRole('button',{name:'Close milestone details'}).click();await page.getByRole('button',{name:'Edit source',exact:true}).click();await page.locator('.cm-content').focus();await page.keyboard.press('ControlOrMeta+z');}
  await page.waitForFunction(()=>document.querySelector('[data-field-item="assurance|privacy audit"]')?.dataset.fieldStartedDay==='2026-08-24');
  evidence.push({theme,phone,inspection:true,config:true,startsUndo:true,deck:true});await c.close();
 }
 const busy=`title: Six quarter programme\ntoday: 2026-09-05\n`+Array.from({length:24},(_,i)=>`Lane ${i%4}: Milestone ${i} 2026-10 .. 2028-03 // Complete commentary ${i}`).join('\n');
 const [page,c]=await open(busy);
 await page.getByRole('button',{name:'Export deck',exact:true}).click();
 const pages=Number((await page.locator('#slideposition').innerText()).match(/of (\d+)/)[1]);assert.ok(pages>1);
 const seen=new Set(),domains=new Set();for(let i=0;i<pages;i++){for(const key of await page.locator('#slidecanvas [data-field-item]').evaluateAll(els=>els.map(el=>el.dataset.fieldItem)))seen.add(key);domains.add(await page.locator('#slidecanvas svg').evaluate(el=>el.dataset.domainLo+' '+el.dataset.domainHi));if(i<pages-1)await page.locator('#slidenext').click();}
 assert.equal(seen.size,24);assert.equal(domains.size,1);
 const download=page.waitForEvent('download');await page.locator('#slidedownload').click();await(await download).saveAs(`${out}/six-quarter-slides.zip`);
 evidence.push({sixQuarters:true,pages,complete:seen.size});await c.close();
 assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify({passed:true,evidence,errors},null,2));console.log('PASS Timeline Observatory: themes, phone, four views, source controls, starts, undo, complete PNG and ZIP exports.');
}finally{await browser.close();}
