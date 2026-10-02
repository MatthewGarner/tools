import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BASE||'http://localhost:8087';
const browser = await chromium.launch({headless:true});
try {
const context = await browser.newContext({acceptDownloads:true, viewport:{width:1440,height:1000}, reducedMotion:'reduce'});
const page = await context.newPage();
const errors=[]; page.on('pageerror', error => errors.push(error.message));
await page.goto(base+'/backup/');
await page.evaluate(() => {localStorage.setItem('roadmap-src','current draft');localStorage.setItem('thinking-lab:reframe:v1','{damaged recovery');localStorage.setItem('credential','secret');});
await page.reload();
const download = page.waitForEvent('download');
await page.getByRole('button',{name:'Download saved work',exact:true}).click();
const archive = JSON.parse(await readFile(await (await download).path(), 'utf8'));
assert.deepEqual(archive.entries.map(x=>x.key),['roadmap-src','thinking-lab:reframe:v1']);
assert.equal(archive.entries[1].value,'{damaged recovery');
const incoming={format:'matthew-garner-saved-work',version:1,origin:'https://thinking-lab-experiments.matthewg12.chatgpt.site',createdAt:'2026-10-01T12:00:00.000Z',entries:[{key:'roadmap-src',value:'incoming draft'},{key:'thinking-lab:constraints:v1',value:'new workspace'},{key:'premortem:example-lantern',value:'{"title":"<img src=x onerror=alert(1)>"}'}]};
const file={name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))};
await page.locator('#backup-file').setInputFiles(file);
await page.locator('#preview').waitFor({state:'visible'});
assert.equal(await page.locator('#preview img').count(),0);
assert.equal(await page.locator('#preview-heading').evaluate(el=>el===document.activeElement),true);
await page.getByRole('button',{name:'Import 2 new items',exact:true}).click();
assert.equal(await page.evaluate(()=>localStorage.getItem('roadmap-src')),'current draft');
assert.equal(await page.evaluate(()=>localStorage.getItem('thinking-lab:constraints:v1')),'new workspace');
await page.locator('#backup-file').setInputFiles(file);
await page.getByLabel('Replace with the file’s version',{exact:true}).check();
assert.equal(await page.locator('#apply').isDisabled(),true);
const recoveryDownload = page.waitForEvent('download');
await page.getByRole('button',{name:'Download pre-import backup',exact:true}).first().click();
const recovery=JSON.parse(await readFile(await (await recoveryDownload).path(),'utf8'));
assert.equal(recovery.entries.find(x=>x.key==='roadmap-src').value,'current draft');
await page.getByLabel('I have saved the pre-import backup').check();
await page.locator('#apply').click();
assert.equal(await page.evaluate(()=>localStorage.getItem('roadmap-src')),'incoming draft');
assert.equal(await page.evaluate(()=>localStorage.getItem('credential')),'secret');
await page.locator('#backup-file').setInputFiles(file);
const other=await context.newPage();await other.goto(base+'/backup/');
await other.evaluate(()=>localStorage.setItem('roadmap-src','changed in other tab'));
await page.waitForFunction(()=>document.getElementById('status').textContent.includes('another tab'));
assert.equal(await page.locator('#apply').isDisabled(),true);
await page.getByRole('button',{name:'Preview again'}).click();
for(const [name,width,height,theme] of [['desktop-light',1440,1000,'light'],['desktop-dark',1440,1000,'dark'],['phone-light',390,844,'light'],['phone-dark',390,844,'dark']]){
  await page.setViewportSize({width,height}); await page.emulateMedia({colorScheme:theme});
  await page.evaluate(()=>document.fonts.ready);
  if(process.env.SUITE_SCREENSHOTS)await page.screenshot({path:`${process.env.SUITE_SCREENSHOTS}/backup-${name}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${name}`);
}
assert.deepEqual(errors,[]);
console.log('Backup browser flow passed: real export/recovery downloads, raw-value import, conflict preservation/replacement, escaped names, cross-tab stale preview, focus, and four overflow-free screenshots.');
// Keep these production-host journeys fully local: no backup leaves the browser.
// A successful import is misleading if that host redirects the model elsewhere.
for(const host of ['tools.matthewgarner.me','energy.matthewgarner.me']) {
  const local = await browser.newContext({serviceWorkers:'block'});
  await local.route(`https://${host}/**`, async route => {
    const url = new URL(route.request().url());
    await route.fulfill({response:await local.request.get(base+url.pathname+url.search)});
  });
  const destination = await local.newPage();await destination.goto(`https://${host}/backup/`);
  const mixed={...incoming,entries:[{key:'cycles-src',value:'energy draft'},{key:'roadmap-src',value:'product draft'},{key:'thinking-lab:reframe:v1',value:'lab workspace'}]};
  await destination.locator('#backup-file').setInputFiles({name:'mixed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mixed))});
  await destination.locator('#apply').click();
  const values=await destination.evaluate(()=>[localStorage.getItem('cycles-src'),localStorage.getItem('roadmap-src'),localStorage.getItem('thinking-lab:reframe:v1')]);
  assert.deepEqual(values,host.startsWith('tools.')?[null,'product draft','lab workspace']:['energy draft',null,null],'only work that can reopen on this host is imported');
  const link=destination.locator('#other-addresses a');
  assert.equal(await link.getAttribute('href'),host.startsWith('tools.')?'https://energy.matthewgarner.me/backup/':'https://tools.matthewgarner.me/backup/');
  assert.equal(await link.isVisible(),true,'remaining destination stays visible after importing compatible work');
  await local.close();
}
console.log('PASS mixed backups keep Energy work on Energy and give a working destination for remaining items');
for(const [origin,key] of [[base,'roadmap-src'],[process.env.EBASE||process.env.ENERGY_BASE||'http://localhost:'+(process.env.EPORT||8089),'cycles-src']]) {
  const offline=await browser.newContext({acceptDownloads:true,serviceWorkers:'allow'}),op=await offline.newPage();
  await op.goto(origin+'/');
  await op.evaluate(()=>navigator.serviceWorker.ready);
  await op.evaluate(k=>localStorage.setItem(k,'A draft to recover offline'),key);
  await offline.setOffline(true);await op.goto(origin+'/backup/');
  const saved=op.waitForEvent('download');await op.getByRole('button',{name:'Download saved work',exact:true}).click();
  const copy=JSON.parse(await readFile(await (await saved).path(),'utf8'));
  assert.deepEqual(copy.entries,[{key,value:'A draft to recover offline'}]);
  await offline.close();
}
console.log('PASS cold-offline backup downloads on both installed-app origins');
} finally {await browser.close();}
