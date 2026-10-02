/* Identity migration contracts: the global control must never become a tool
   action or change a model. Existing suites cover each tool's domain behaviour. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.BASE||'http://localhost:8087';
const energy=process.env.EBASE||process.env.ENERGY_BASE||'http://localhost:8089';
const browser=await chromium.launch();
try{
  for(const url of [base+'/',energy+'/',base+'/lab/knowledge/',base+'/timeline/',base+'/rank/',base+'/gauge/',energy+'/frequency/']){
    const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light',reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.locator('html[data-mg-ready]').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('[data-mg-theme-reset]').isVisible(),false,'system default stays quiet');
    const mast=page.locator('.mg-masthead');
    assert.equal(await mast.locator('button').count(),1,'tool actions stay outside global navigation');
    assert.deepEqual(await mast.locator('nav a').allTextContents(),['Writing','Tools Lab','Now']);
    assert.ok(await mast.locator('a[aria-current]').count());
    const geometry=await mast.locator('a,button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return [r.width,r.height,r.left,r.right];}));
    assert.ok(geometry.every(([w,h,left,right])=>w>=44&&h>=44&&left>=0&&right<=390),url+' masthead targets and reflow');
    // Wait for the existing model persistence queue before testing the appearance
    // action; otherwise a boot-time URL write could be misattributed to the toggle.
    if(!url.endsWith(':8087/')&&!url.endsWith(':8089/')) await page.waitForTimeout(650);
    const before=await page.evaluate(()=>({hash:location.hash,inputs:[...document.querySelectorAll('input,textarea,select:not([data-mg-theme-choice])')].map(x=>[x.id,x.value])}));
    await page.getByRole('button',{name:/^Appearance:/}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    const after=await page.evaluate(()=>({hash:location.hash,inputs:[...document.querySelectorAll('input,textarea,select:not([data-mg-theme-choice])')].map(x=>[x.id,x.value])}));
    assert.deepEqual(after,before,url+' theme preserves model and inputs');
    await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await page.locator('[data-mg-theme-reset]').click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    assert.equal(await page.locator('[data-mg-theme-reset]').isVisible(),false,'reset disappears after restoring the system preference');
    assert.equal(await page.getByRole('button',{name:/^Appearance:/}).evaluate(el=>el===document.activeElement),true,'focus returns to appearance after reset');
    await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    assert.deepEqual(errors,[],url);console.log('PASS identity: '+url);await context.close();
  }
  const nojs=await browser.newContext({javaScriptEnabled:false,colorScheme:'dark',viewport:{width:320,height:800}});
  const page=await nojs.newPage();await page.goto(base+'/');
  assert.equal(await page.locator('.mg-nav a').count(),3);
  assert.equal(await page.locator('.mg-appearance').isVisible(),false);
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(36, 33, 44)');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await nojs.close();console.log('PASS identity: no-JS navigation, system dark and narrow reflow');
}finally{await browser.close();}
