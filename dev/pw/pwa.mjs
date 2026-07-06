/* PWA checks: manifest + icons, service worker, full-precache cold-offline
   sweep (every tool must work offline WITHOUT having been visited — the
   installed-app path), an Android (Pixel 7) spot check, and the ENERGY origin
   (its own worker/manifest) served via serve.mjs's host-rewrite emulation.
   Run from dev/pw: node pwa.mjs  (server on :8087; spawns :8089 itself) */
import {chromium, devices} from 'playwright';
import {spawn} from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8087';
const esrv = spawn('node', ['../serve.mjs', '8089', '--origin=energy'], {stdio: 'pipe'});
await new Promise(res => esrv.stdout.on('data', d => { if(String(d).includes('serving')) res(); }));
const EBASE = 'http://localhost:8089';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

async function installAndWait(page){
  await page.goto(BASE + '/', {waitUntil: 'networkidle'});
  await page.evaluate(() => navigator.serviceWorker.ready);
  /* precache is allSettled during install — poll for a deep asset to land */
  await page.waitForFunction(async () =>
    !!(await caches.match('/roadmap/vendor/codemirror.js')) &&
    !!(await caches.match('/timeline/app.js')), null, {timeout: 20000});
}

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/', {waitUntil: 'networkidle'});
  check('manifest link present', await page.locator('link[rel="manifest"]').count() === 1);
  const mf = await page.evaluate(async () => {
    const r = await fetch('/manifest.webmanifest');
    return r.ok ? r.json() : null;
  });
  check('manifest: standalone + 3 icons incl. maskable', !!mf && mf.display === 'standalone' &&
    mf.icons.length === 3 && mf.icons.some(i => i.purpose === 'maskable'));
  check('apple-touch + capable metas', await page.locator('link[rel="apple-touch-icon"]').count() === 1 &&
    await page.locator('meta[name="apple-mobile-web-app-capable"]').count() === 1);
  await installAndWait(page);
  check('service worker active + suite precached', true);

  /* cold offline: no tool page has been visited in this context */
  await ctx.setOffline(true);
  const TOOLS = [
    ['/fermi/', async p => { await p.getByRole('button', {name: 'Weekly meeting, annual cost'}).click(); await p.waitForTimeout(500); return (await p.locator('#p50').innerText()).length > 0; }],
    ['/rank/', async p => { await p.getByRole('button', {name: 'Ops & infra backlog'}).click(); await p.waitForTimeout(500); return await p.locator('.rankbar').count() === 7; }],
    ['/roadmap/', async p => { await p.getByRole('button', {name: 'Habit app roadmap'}).click(); await p.waitForTimeout(500); return await p.locator('#preview svg').count() === 1; }],
    ['/why/', async p => { await p.getByRole('button', {name: 'Habit retention'}).click(); await p.waitForTimeout(500); return await p.locator('#preview svg').count() === 1; }],
    ['/tree/', async p => { await p.getByRole('button', {name: 'Bid or no bid'}).click(); await p.waitForTimeout(500); return await p.locator('#preview svg').count() === 1; }],
    ['/map/', async p => { await p.getByRole('button', {name: 'Assumption map'}).click(); await p.waitForTimeout(500); return await p.locator('#preview svg').count() === 1; }],
    ['/gauge/', async p => { await p.getByRole('button', {name: 'Q3 commitment review'}).click(); await p.waitForTimeout(500); return await p.locator('#preview .gform .q').count() === 3; }],
    ['/flow/', async p => { await p.waitForTimeout(600); return await p.locator('#verdictwrap svg').count() === 1; }],
    ['/timeline/', async p => { await p.getByRole('button', {name: 'App launch programme'}).click(); await p.waitForTimeout(500); return await p.locator('#preview svg').count() === 1; }],
  ];
  for(const [path, probe] of TOOLS){
    const p = await ctx.newPage();
    let ok = false;
    try{
      await p.goto(BASE + path, {waitUntil: 'domcontentloaded', timeout: 8000});
      ok = await probe(p);
    }catch(e){ ok = false; }
    check('cold offline: ' + path + ' fully works', ok);
    await p.close();
  }
  await ctx.close();
}

/* Android spot check: install on a Pixel, then offline reload */
{
  const ctx = await browser.newContext({...devices['Pixel 7']});
  const page = await ctx.newPage();
  await installAndWait(page);
  await ctx.setOffline(true);
  await page.reload({waitUntil: 'domcontentloaded'});
  check('Pixel 7: landing offline after install', await page.locator('a.tool').count() >= 9);
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '/gauge/', {waitUntil: 'domcontentloaded'});
  await p2.getByRole('button', {name: 'Q3 commitment review'}).tap();
  await p2.waitForTimeout(500);
  check('Pixel 7: gauge compose cold offline', await p2.locator('#preview .gform .q').count() === 3);
  await ctx.close();
}

/* ---- energy origin: its own PWA, cold offline ---- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(EBASE + '/', {waitUntil: 'networkidle'});
  const mf = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  check('energy manifest: Energy tools, standalone, maskable', mf.short_name === 'Energy tools' &&
    mf.display === 'standalone' && mf.icons.some(i => i.purpose === 'maskable'));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () =>
    !!(await caches.match('/risk/app.js')) && !!(await caches.match('/cycles/app.js')) && !!(await caches.match('/assets/series.js')),
    null, {timeout: 20000});
  check('energy SW active + precached', true);
  await ctx.setOffline(true);
  const p2 = await ctx.newPage();
  let ok = false;
  try{
    await p2.goto(EBASE + '/risk/', {waitUntil: 'domcontentloaded', timeout: 8000});
    await p2.getByRole('button', {name: 'Route to market'}).click();
    await p2.waitForTimeout(600);
    ok = await p2.locator('#preview svg').count() === 1;
  }catch(e){ ok = false; }
  check('energy: /risk/ cold offline fully works', ok);
  await p2.close();
  const p3 = await ctx.newPage();
  let ok2 = false;
  try{
    await p3.goto(EBASE + '/cycles/', {waitUntil: 'domcontentloaded', timeout: 8000});
    await p3.getByRole('button', {name: 'Wexcombe base case'}).click();
    await p3.waitForTimeout(1000);
    ok2 = await p3.locator('#preview svg').count() === 1;
  }catch(e){ ok2 = false; }
  check('energy: /cycles/ cold offline fully works', ok2);
  await p3.close();
  await ctx.close();
}

console.log(results.join('\n'));
esrv.kill();
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
