/* Design audit regressions: receipts survive delivery; coarse controls expose
   the same edits as the chart without requiring a precise hit. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const BASE=process.env.BASE || 'http://localhost:8087';
const route=tool=>`${BASE}/energy/${tool}/`;
const browser=await chromium.launch();
try{
 for(const tool of ['cycles','risk','frequency','merit-order','intraday']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(route(tool)); await page.locator('#verdict:not([hidden])').waitFor();
  if(['cycles','risk'].includes(tool)){
   await page.locator('#preview:not([inert]) svg').waitFor();
   assert.equal(await page.locator('.document-actions .start').count(),1);
   await page.getByRole('button',{name:'Edit assumption',exact:true}).click();
   await page.locator('.eip-input').waitFor();
   assert.doesNotMatch((await page.locator('[role=status]').allTextContents()).join(' '),/can.t be edited/);
   await page.keyboard.press('Escape');
  }else{
   const range=page.locator('input[type=range]').first();
   assert.ok((await range.boundingBox()).height>=44,'full slider lane must be hittable');
   await range.focus(); await page.keyboard.press('ArrowRight');
   await page.waitForFunction(()=>document.querySelector('.energy-outcome').textContent.length>20);
   assert.equal(await page.locator('.energy-outcome').isVisible(),true);
  }
  if(['merit-order','intraday'].includes(tool)){
   await page.getByRole('button',{name:'Inspect plant',exact:true}).click();
   await page.locator('.mo-callout').waitFor(); await page.keyboard.press('Escape');
  }
  if(tool==='frequency'){
   await page.locator('[data-preset="stack"]').click();
   await page.waitForFunction(()=>document.querySelector('#effinertia').textContent.includes('= 100'));
  }
  await page.locator('#copylink').click(); await page.waitForFunction(()=>document.querySelector('#copylink').textContent==='Copied model link');
  const link=await page.evaluate(()=>navigator.clipboard.readText()); assert.ok(new URL(link).hash.length>10);
  const expectedVerdict=await page.locator('#verdict').textContent();
  const recipient=await context.newPage(); await recipient.goto(route(tool)+new URL(link).hash); await recipient.locator('#verdict:not([hidden])').waitFor();
  await recipient.waitForFunction(expected=>document.querySelector('#verdict').textContent===expected,expectedVerdict);
  await recipient.close();
  await page.getByText('Export',{exact:true}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#dlsvg').click()]);
  const stream=await download.createReadStream();let svg='';for await(const chunk of stream) svg+=chunk;
  if(tool==='frequency'){ assert.match(svg,/80 GVA·s synchronous/); assert.match(svg,/= 100 GVA·s effective inertia/); }
  assert.match(svg,/data-receipt="true"/); assert.match(svg,/ILLUSTRATIVE MODEL/);
  assert.match(svg,/href="https:\/\/energy.matthewgarner.me\//);
  assert.deepEqual(errors,[]); console.log(`PASS Energy ${tool}: edit controls, phone feedback, recipient and complete SVG receipt`);
  await context.close();
 }
}finally{await browser.close();}
