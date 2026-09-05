/* Chapter integration: real font metrics, live source edits and complete exports.
   BASE=http://localhost:8095 node dev/pw/chapter.mjs
   Screenshots are evidence for inspection, not a replacement for assertions. */
import {chromium} from 'playwright';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encodeHash} from '../../assets/series.js';
import {waitChapterSource} from './chapter-state.mjs';
const base=process.env.BASE || 'http://localhost:8087';
// CI runs on Linux; evidence must use the host's writable temporary directory.
const out=process.env.CHAPTER_OUTPUT || join(tmpdir(),'chapter-evidence');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
const report=[];
try{
 await page.goto(base+'/roadmap/');
 await page.waitForFunction(()=>document.querySelector('#fontstatus').hidden && document.querySelector('#preview svg'));
 const duplicateStyle='style: board\nNOW\nCore: Read together\nstyle: focus';
 if(await page.locator('.workspace').evaluate(el=>el.classList.contains('collapsed')))await page.locator('#railtab').click();
 await page.locator('.cm-content').fill(duplicateStyle);
 await waitChapterSource(page,duplicateStyle);
 await page.locator('#stylepicker [data-style="grid"]').click();
 const canonicalStyle='NOW\nCore: Read together\nstyle: grid';
 await waitChapterSource(page,canonicalStyle);
 await page.waitForFunction(()=>document.querySelector('#preview svg')?.getAttribute('data-chapter-layout')==='grid');
 await page.locator('.cm-content').focus();
 await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');
 await waitChapterSource(page,duplicateStyle);
 await page.waitForFunction(()=>document.querySelector('#stylepicker [aria-pressed="true"]')?.dataset.style==='focus');
 await page.locator('#stylepicker [data-style="grid"]').click();
 await waitChapterSource(page,canonicalStyle);
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#fontstatus').hidden && document.querySelector('#preview svg')?.getAttribute('data-chapter-layout')==='grid');
 await waitChapterSource(page,canonicalStyle);
 for(const fixture of ['sparse','crowded','quarterly','export-70-spanning'])for(const font of ['Chapter','DM Sans'])for(const style of ['focus','board','register','grid'])for(const theme of ['light','dark']){
  const key=[fixture,font.replace(' ','-'),style,theme].join('-');
  if(process.env.CHAPTER_CASE && !key.includes(process.env.CHAPTER_CASE))continue;
  const source=readFileSync(new URL('../../roadmap/tests/fixtures/'+(fixture.startsWith('export-')?'':'chapter-')+fixture+'.txt',import.meta.url),'utf8').replace(/^style:.*$/m,'')+'\nstyle: '+style+'\nfont: '+font;
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({colorScheme:theme});
  if(await page.locator('#slidepreviewdialog').evaluate(el=>el.open))await page.locator('#slidepreviewdialog').getByRole('button',{name:'Close',exact:true}).click();
  if(fixture.startsWith('export-')){
   // CodeMirror virtualizes a large source: filling its visible contenteditable
   // after a phone scroll can replace only a document slice. Use the real URL
   // handoff for this export fixture and still assert the complete editor state.
   // A distinct query forces a document load; a hash-only navigation does not rerun boot.
   await page.goto(base+'/roadmap/?export-test='+encodeURIComponent(key)+'#'+await encodeHash({t:source,e:0}));
   await page.waitForFunction(()=>document.querySelector('#fontstatus').hidden && document.querySelector('#preview svg'));
  }else{
   if(await page.locator('.workspace').evaluate(el=>el.classList.contains('collapsed')))await page.locator('#railtab').click();
   await page.locator('.cm-content').fill(source);
  }
  await waitChapterSource(page,source);
  await page.waitForFunction(style=>document.querySelector('#preview svg')?.getAttribute('data-chapter-layout')===style,style);
  await page.waitForFunction(theme=>document.querySelector('#preview svg > rect')?.getAttribute('fill')===(theme==='dark'?'#171A18':'#F6F3ED'),theme);
  assert.equal(await page.locator('#stylepicker [aria-pressed="true"]').getAttribute('data-style'),style,key+' DSL and picker agree');
  if(!await page.locator('.workspace').evaluate(el=>el.classList.contains('collapsed')))await page.locator('#railtab').click();
  assert.equal(await page.locator('#verdict').isVisible(),false,key+' automatic diagnosis belongs in the editing view');
  const diagnostics=await page.evaluate(async source=>{
   const [{parse},{renderChapterPages},{layoutChapter},{measure}]=await Promise.all([import('/roadmap/parse.js'),import('/roadmap/chapter-svg.js'),import('/roadmap/chapter-layout.js'),import('/assets/app-common.js')]);
   const model=parse(source),ctx={measure,today:'2026-09-04'};
   const set=renderChapterPages(model,ctx);
   return {appearances:set.plan.pages.flatMap(p=>p.sourceItemIndices),minTitle:Math.min(...set.plan.pages.flatMap(p=>layoutChapter(p.model,{...ctx,slide:true,sourceModel:model}).rows.flatMap(r=>r.blocks.filter(b=>b.kind==='title').map(b=>b.size)))),complete:set.complete,count:model.items.length,pages:set.pages.length,overflow:set.plan.pages.filter(p=>!p.geometryComplete).map(p=>p.model.items.map(i=>i.title)),fontsReady:document.fonts.check('24px "DM Sans"') && document.fonts.check('38px "Instrument Serif"'),geometry:set.plan.pages.map(p=>{const l=layoutChapter(p.model,{...ctx,slide:true,sourceModel:model});return {fits:l.fits,bottom:l.contentBottom}})};
  },source);
  assert.ok(diagnostics.fontsReady,key+' fonts');assert.ok(diagnostics.complete,key+' complete '+JSON.stringify(diagnostics));
  if(fixture==='crowded' && style==='grid')assert.ok(diagnostics.pages<=3,key+' should use free column space before adding slides');
  if(fixture==='quarterly' && style==='grid')assert.equal(diagnostics.pages,2,key+' should not orphan one item on an extra slide');
  if(fixture==='export-70-spanning'){
   assert.ok(diagnostics.pages<=({grid:7,board:6,focus:8,register:9}[style]),key+' keeps the approved compact density');
   assert.equal(new Set(diagnostics.appearances).size,70,key+' retains every source item');
   if(style!=='grid')assert.equal(diagnostics.appearances.length,70,key+' never repeats work');
   assert.ok(diagnostics.minTitle>=20,key+' retains the approved title floor');
  }
  if(fixture==='sparse')assert.equal(diagnostics.pages,1,key+' sparse plan should be a single composed slide');
  await page.locator('#exportdeck').click();
  assert.equal(await page.locator('#slidecanvas svg').getAttribute('width'),'1920');
  assert.equal(await page.locator('#slidecanvas svg').getAttribute('data-chapter-layout'),style,key+' export and selected view agree');
  await page.locator('#slidecanvas svg').screenshot({path:out+'/'+key+'-slide.png'});
  for(let i=1;i<diagnostics.pages;i++){
    await page.locator('#slidenext').click();
    assert.equal(await page.locator('#slideposition').innerText(),`Slide ${i+1} of ${diagnostics.pages}`);
    await page.locator('#slidecanvas svg').screenshot({path:out+'/'+key+'-slide-'+(i+1)+'.png'});
  }
  await page.locator('#slidepreviewdialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('#preview svg').screenshot({path:out+'/'+key+'-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('#preview svg')?.getAttribute('data-min-readable-scale')==='1');
  assert.ok(await page.locator('#railtab').isVisible(),key+' phone source return must remain available');
  const phone=await page.evaluate(()=>{const svg=document.querySelector('#preview svg'),r=svg.getBoundingClientRect();return {width:r.width,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,rows:svg.querySelectorAll('[data-item-title]').length};});
  assert.ok(phone.pageWidth<=phone.viewport+1,key+' phone page overflows');assert.ok(phone.width<=390,key+' phone artifact overflows');
  if(style!=='board')assert.equal(phone.rows,diagnostics.count,key+' phone item coverage');
  await page.screenshot({path:out+'/'+key+'-phone.png',fullPage:true});
  report.push({key,...diagnostics,phone});console.log(key,diagnostics.pages+' slides');
 }
 assert.deepEqual(errors,[],'Browser errors');
}finally{writeFileSync(out+'/report'+(process.env.CHAPTER_CASE?'-'+process.env.CHAPTER_CASE:'')+'.json',JSON.stringify({report,errors},null,2));await browser.close();}
