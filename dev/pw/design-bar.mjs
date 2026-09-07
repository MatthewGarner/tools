import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {decodeHash} from '../../assets/series.js';
const base = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const context = await browser.newContext({viewport:{width:1440,height:1000}, reducedMotion:'reduce', serviceWorkers:'block'});
await context.grantPermissions(['clipboard-read','clipboard-write']);
const page = await context.newPage();
let failed = 0;
async function test(name, run){try{await run(); console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.message);}}
await test('Fermi invalid model disables verdict copy and explains recovery outside source',async()=>{
  await page.goto(base+'/fermi/');
  await page.locator('#results').waitFor({state:'visible'});
  await page.locator('#editmodel').click();
  await page.locator('#formula').fill('attendees *');
  await page.locator('#err').waitFor({state:'visible'});
  await page.locator('#returntoreview').click();
  assert.equal(await page.getByRole('button',{name:'Copy the verdict',exact:true}).isDisabled(),true);
  assert.match(await page.locator('#estimate-status').innerText(),/expression ends early/i);
  await page.locator('#editmodel').click();
  await page.locator('#chips').getByRole('button',{name:'Weekly meeting, annual cost'}).click();
  await page.waitForFunction(()=>!document.querySelector('#results').classList.contains('is-stale'));
  assert.equal(await page.getByRole('button',{name:'Copy the verdict',exact:true}).isDisabled(),false);
});
await test('Rank fast copy carries current model and ranking, and removal is recoverable',async()=>{
  await page.goto(base+'/rank/');
  await page.locator('#rrows .rrow').first().waitFor();
  const effort=page.getByRole('spinbutton',{name:'Reading reminders effort score',exact:true});
  await effort.fill('9');
  // Copy before the 400ms URL debounce; the export must take its own snapshot.
  await page.locator('#copydoc').click();
  const markdown=await page.evaluate(()=>navigator.clipboard.readText());
  const url=markdown.match(/\[live table\]\(([^)]+)\)/)?.[1];
  const state=await decodeHash(new URL(url).hash.slice(1));
  assert.equal(state?.i.find(row=>row[0]==='Reading reminders')?.at(-1),9);
  const recipient=await context.newPage();await recipient.goto(url);
  assert.equal(await recipient.getByRole('spinbutton',{name:'Reading reminders effort score',exact:true}).inputValue(),'9');await recipient.close();
  await page.getByRole('button',{name:'Remove Resume position',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Remove Resume position',exact:true}).count(),0);
  await page.getByRole('button',{name:'Undo removal',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Remove Resume position',exact:true}).count(),1);
});
await test('Roadmap undo works after diagram editing without moving into source',async()=>{
  await page.goto(base+'/roadmap/');
  const label=page.locator('#preview [data-edit="title"][data-raw="Curated shelves"]').first();
  await label.click();
  const input=page.locator('.eip-input');
  await input.fill('Offline library pilot');await input.press('Enter');
  await page.locator('#preview [data-raw="Offline library pilot"]').first().waitFor();
  await page.keyboard.press('ControlOrMeta+z');
  await page.locator('#preview [data-raw="Curated shelves"]').first().waitFor({timeout:2500});
  assert.equal(await page.getByRole('button',{name:'Undo',exact:true}).isVisible(),true);
});
await test('Document start and sharing actions are independent of source',async()=>{
  for(const tool of ['timeline','map','why','wardley','paths','proxy']){
    await page.goto(base+'/'+tool+'/');
    await page.locator('#preview svg').waitFor();
    await page.getByRole('button',{name:'Start your own',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#preview svg')?.textContent.includes('Your'));
    await page.getByRole('button',{name:'Copy model link',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Model link copied'}).waitFor();
    const url=await page.evaluate(()=>navigator.clipboard.readText());
    const model=await decodeHash(new URL(url).hash.slice(1));
    assert.match(model.t,/Your/i,tool+' links the starter');
    const recipient=await context.newPage();await recipient.goto(url);
    await recipient.waitForFunction(()=>document.querySelector('#preview svg')?.textContent.includes('Your'));
    await recipient.close();
    await page.locator('.document-examples summary').click();
    await page.locator('#chips button').first().click();
    assert.equal(await page.locator('.document-examples').evaluate(el=>el.open),false);
  }
});
await browser.close();
process.exitCode=failed?1:0;
