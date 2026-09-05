/* Real touch edits, source persistence and export recovery in the Chapter shell. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {waitChapterSource} from './chapter-state.mjs';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(5000);
const base=process.env.BASE||'http://localhost:8087';
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const saved=expected=>waitChapterSource(page,expected);
async function source(src){
  if(await page.locator('.workspace').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#railtab').tap();
  await page.locator('.cm-content').fill(src);
  await saved(src);
  await page.locator('#railtab').tap();
}
const card=()=>page.locator('[data-item-title="Resume your reading"]');
async function settledTap(target,position){
  await target.scrollIntoViewIfNeeded();
  // Native touch scroll settles before a person taps; the shared popover closes on scroll.
  await page.waitForTimeout(300);
  await target.tap(position?{position}:{});
}
async function note(value, target=card()){
  const title=await target.getAttribute('data-item-title');
  await settledTap(target,{x:12,y:12});
  await page.getByRole('menuitem',{name:'Edit note…',exact:true}).tap();
  await page.getByRole('textbox',{name:'Edit note',exact:true}).fill(value);
  await page.getByRole('textbox',{name:'Edit note',exact:true}).press('Enter');
  await page.waitForFunction(({title,value})=>[...document.querySelectorAll('[data-item-title]')].some(el=>el.dataset.itemTitle===title&&el.dataset.noteRaw===value),{title,value});
}
try{
  await page.goto(base+'/roadmap/');
  await page.waitForFunction(()=>document.querySelector('#fontstatus').hidden);
  for(const style of ['focus','board','grid','register']){
    const src=`title: Touch review\nstyle: ${style}\nfont: Chapter\naccent: #254C3D\nNOW\nCore: Resume your reading [doing] -- Original commentary\nNEXT\nPlatform: Offline downloads\nLATER\nCore: Book clubs`;
    await source(src);
    if(style==='focus'){
      // Two deliberate controls are two undo steps even inside CM's typing group delay.
      await page.locator('#fontchoice').selectOption('DM Sans');
      await page.locator('#accentchoice').evaluate(el=>{el.value='#663b59';el.dispatchEvent(new Event('change',{bubbles:true}));});
      const changed=src.replace('font: Chapter','font: DM Sans').replace('#254C3D','#663b59');
      await saved(changed);
      await page.getByRole('button',{name:'Undo',exact:true}).tap();
      await saved(src.replace('font: Chapter','font: DM Sans'));
      await page.getByRole('button',{name:'Undo',exact:true}).tap();await saved(src);
      console.log('independent typography and accent undo');
      if(process.env.CHAPTER_UNDO_ONLY)break;
      await note('Available without a connection.',page.locator('[data-item-title="Offline downloads"]'));
      await saved(src.replace('Platform: Offline downloads','Platform: Offline downloads -- Available without a connection.'));
      await page.getByRole('button',{name:'Undo',exact:true}).tap();await saved(src);
      console.log('Spotlight supporting item commentary edit and undo');
    }
    await note('Pick up on any device.');await saved(src.replace('Original commentary','Pick up on any device.'));
    await page.getByRole('button',{name:'Undo',exact:true}).tap();await saved(src);
    await note('Ready for the deck.');const revised=src.replace('Original commentary','Ready for the deck.');await saved(revised);
    await page.reload();await saved(revised);
    await page.waitForFunction(()=>document.querySelector('[data-item-title="Resume your reading"]')?.dataset.noteRaw==='Ready for the deck.');
    const add=page.getByRole('button',{name:'Add item to Now',exact:true});
    // Reload may expose restored item text before the responsive paint installs
    // its Add target. Measure the target only after that paint makes it visible.
    await add.waitFor({state:'visible'});
    assert.ok((await add.boundingBox()).height>=44);
    await settledTap(add);await page.getByRole('textbox',{name:'Edit additem',exact:true}).fill('New initiative');await page.getByRole('textbox',{name:'Edit additem',exact:true}).press('Enter');
    await saved(revised.replace('\nNEXT','\nNew initiative\nNEXT'));
    await page.getByRole('button',{name:'Undo',exact:true}).tap();await saved(revised);
    console.log(style+' touch edit, undo, reload and add');
  }
  if(!process.env.CHAPTER_UNDO_ONLY)await source('title: Export recovery\nheadline: '+('Very long framing '.repeat(1000))+'\nNOW\nKeep this item -- Keep this commentary');
  if(!process.env.CHAPTER_UNDO_ONLY){
  await page.locator('#exportdeck').tap();
  assert.ok(await page.locator('#slideerror').isVisible());
  assert.match(await page.locator('#slideerror').textContent(),/Shorten the headline/);
  assert.equal(await page.locator('#slidedownload').isVisible(),false);
  console.log('oversized framing has an actionable export error');
  }
  assert.deepEqual(errors,[]);
}catch(error){console.error('Editor at failure:',await page.evaluate(async()=>{const {EditorView}=await import('/roadmap/vendor/codemirror.js');return EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString();}));throw error;}finally{await browser.close();}
