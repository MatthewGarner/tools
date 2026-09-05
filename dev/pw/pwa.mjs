/* PWA checks: manifest + icons, service worker, full-precache cold-offline
   sweep (every tool must work offline WITHOUT having been visited — the
   installed-app path), an Android (Pixel 7) spot check, and the ENERGY origin
   (its own worker/manifest) served via serve.mjs's host-rewrite emulation.
   Run from dev/pw: node pwa.mjs  (server on :8087; the energy origin defaults
   to :8089 via the EPORT env knob — reused if already alive, e.g. another
   suite's session server, else self-spawned). */
import {chromium, devices} from 'playwright';
import {report, tally, pickExample, until, openRoadmapSource} from './_harness.mjs';
import {spawn} from 'node:child_process';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from '../tool-dirs.mjs';
import {EXAMPLES as RANK_EXAMPLES} from '../../rank/examples.js';

const OPS_INFRA_BACKLOG = pickExample(RANK_EXAMPLES, 'Ops & infra backlog');

const BASE = process.env.BASE || 'http://localhost:8087';
const EPORT = process.env.EPORT || 8089;     // knob so the self-spawned energy origin can
                                              // avoid a port another session already holds
const EBASE = 'http://localhost:' + EPORT;
/* reuse an energy origin that's already up (e.g. mobile.mjs's session server) — a
   silent bind failure here used to hang the unsettled await with 0 PASS */
let esrv = null;
const alive = await fetch(EBASE + '/').then(r => r.ok).catch(() => false);
if(!alive){
  esrv = spawn('node', ['../serve.mjs', String(EPORT), '--origin=energy'], {stdio: 'pipe'});
  await Promise.race([
    new Promise(res => esrv.stdout.on('data', d => { if(String(d).includes('serving')) res(); })),
    new Promise((_, rej) => setTimeout(() => rej(new Error(':' + EPORT + ' failed to start — port taken?')), 8000)),
  ]);
}
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

/* What these probes mean to prove is that the tool's OWN flow ran offline — and for
   the DSL tools that is directly observable rather than guessable. The first-run
   autoload renders under assets/mobile.js's persistence suppression, so `<tool>-src`
   stays NULL until a genuine interaction; the chip click is that interaction, and
   app.js persists in the same tick it paints. So storage turning non-null means this
   click's refresh has run.
   Polling the rendered `#preview svg` instead would be the "already true before the
   action" trap: eleven of these tools autoload an artefact, so the svg is on screen
   before the click and the wait would do nothing at all. */
const persisted = (p, key) => until(() => p.evaluate(k => localStorage.getItem(k), key));
const shown = (p, sel) => until(() => p.locator(sel).count());
async function showSourceIfReading(page, timeout = 5000){
  const source = page.getByRole('button', {name: 'Show source editor'});
  await source.waitFor({state: 'visible', timeout}).catch(() => {});
  if(await source.isVisible()) await source.click();
}

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
    /* fermi has no source key; its P50 reads an em dash until the model actually
       runs, so "no longer the placeholder" is the honest wait for a computed result */
    ['/fermi/', async p => { await p.getByRole('button', {name:'Edit formula & ranges'}).click(); await p.getByRole('button', {name: 'Weekly meeting, annual cost'}).click(); await until(() => p.locator('#p50').innerText().then(t => t.trim().length > 0 && t.trim() !== '—')); return (await p.locator('#p50').innerText()).length > 0; }],
    /* rank has no source key and DOES autoload a table, so ".rankbar exists" is
       already true before the click — measured: 5 bars on screen against this
       example's 7. Waiting for the count to CHANGE is the precondition; the check
       then asserts what it changed TO. (Should a future example edit make the two
       counts equal, this degrades to a 4s wait and a correct pass — never a false
       green.) */
    ['/rank/', async p => { const was = await p.locator('.rankbar').count(); await p.getByRole('button', {name: OPS_INFRA_BACKLOG.name}).click(); await until(() => p.locator('.rankbar').count().then(n => n !== was)); return await p.locator('.rankbar').count() === OPS_INFRA_BACKLOG.items.length; }],
    ['/roadmap/', async p => { await openRoadmapSource(p); await p.getByRole('button', {name: 'Reading app roadmap'}).click(); await persisted(p, 'roadmap-src'); return await p.locator('#preview svg').count() === 1; }],
    ['/why/', async p => { await p.getByRole('button', {name: 'Edit tree source'}).click(); await p.getByRole('button', {name: 'Reading retention'}).click(); await persisted(p, 'why-src'); return await p.locator('#preview svg').count() === 1; }],
    ['/tree/', async p => { await p.getByRole('button', {name: 'Bid or no bid'}).click(); await persisted(p, 'tree-src'); return await p.locator('#preview svg').count() === 1; }],
    ['/map/', async p => { await p.getByRole('button', {name: 'Edit map source'}).click(); await p.getByRole('button', {name: 'Assumption map'}).click(); await persisted(p, 'map-src'); return await p.locator('#preview svg').count() === 1; }],
    ['/gauge/', async p => { await p.locator('#railtab').click(); await p.getByRole('button', {name: 'Q3 commitment review'}).click(); await persisted(p, 'gauge-src'); return await p.locator('#preview svg').count() === 1; }],
    ['/flow/', async p => { await shown(p, '#verdictwrap svg'); return await p.locator('#verdictwrap svg').count() === 1; }],
    ['/timeline/', async p => { await showSourceIfReading(p); await p.getByRole('button', {name: 'App launch programme'}).click(); await persisted(p, 'timeline-src'); return await p.locator('#preview svg').count() === 1; }],
    ['/wardley/', async p => { await p.getByRole('button', {name: 'Edit landscape source'}).click(); await p.getByRole('button', {name: 'Lantern platform'}).click(); await persisted(p, 'wardley-src'); return await p.locator('#preview svg').count() === 1; }],
    ['/bets/', async p => { await p.getByRole('button', {name: 'Lantern portfolio'}).click(); await persisted(p, 'bets-src'); return await p.locator('#preview svg').count() === 1; }],
    /* the gate canvas is sized by the first paint, so width>100 is false until it runs */
    ['/alarm/', async p => { await until(() => p.locator('#gate').evaluate(c => c.width > 100)); return await p.locator('#distwrap svg').count() === 1 && await p.locator('#gate').evaluate(c => c.width > 100); }],
    ['/duel/', async p => { await p.locator('#start').click(); await shown(p, '#duelwrap [data-pick]'); return await p.locator('#duelwrap [data-pick]').count() === 2; }],
    ['/premortem/', async p => { await shown(p, '#phasepanel [data-field="title"]'); return await p.locator('#phasepanel [data-field="title"]').count() === 1; }],
    ['/proxy/', async p => { await shown(p, '#preview svg'); return await p.locator('#preview svg').count() === 1; }],
    /* Added 2026-08-16 — the sweep had covered 15 of 18 TOOL_DIRS since these three
       shipped, and paths is the largest page in the suite. The coverage assertion
       below is what stops it falling behind a fourth time. */
    ['/signal-vs-noise/', async p => { await shown(p, 'svg'); return await p.locator('svg').count() >= 1; }],
    ['/case/', async p => { await p.getByRole('button', {name: 'Wexcombe augmentation'}).click(); await persisted(p, 'case-src'); return await p.locator('#preview svg').count() === 1; }],
    /* paths keeps its rail collapsed, so the chip row is in the DOM but not clickable
       until the railtab is opened — the same shape smoke.mjs handles for wardley/map.
       KEPT SLEEP (2026-08-18): the branch below turns on isVisible(), and during the
       rail's collapse animation that probe reports the OPPOSITE of the truth — it
       answered "visible", the railtab was never clicked, and the chip click then spent
       Playwright's full 30s timeout being told "element is not stable" / "not visible".
       Waiting for the element to be attached is not waiting for the layout to settle,
       and settled-ness is what this branch reads. The post-click wait below IS a poll. */
    ['/paths/', async p => { await p.waitForTimeout(600); if(!await p.locator('#chips').isVisible()) await p.locator('#railtab').click(); await p.locator('#chips').waitFor({state: 'visible', timeout: 5000}); await p.getByRole('button', {name: 'Lantern', exact: true}).click(); await persisted(p, 'paths-src'); return await p.locator('#preview svg').count() === 1; }],
  ];
  /* Coverage: the offline promise is "every tool works after one online open", so a
     tool missing from this list is an unkept promise, not a gap in a test. Derived
     from tool-dirs.mjs rather than remembered — the list had sat at 15 of 18 since
     signal-vs-noise, case and paths shipped. */
  {
    const missing = TOOL_DIRS.filter(d => !TOOLS.some(([path]) => path === '/' + d + '/'));
    check('cold-offline sweep covers every tool' + (missing.length ? ' — missing ' + missing.join(' ') : ''),
      missing.length === 0);
  }
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
  await shown(p2, '#preview svg'); // gauge autoloads the first example onto the sample reveal
  check('Pixel 7: gauge compose cold offline', await p2.locator('#preview svg').count() === 1);
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
  await page.waitForFunction(async (dirs) =>
    (await Promise.all(dirs.map(d => caches.match('/' + d + '/app.js')))).every(Boolean) &&
    !!(await caches.match('/assets/series.js')),
    ENERGY_TOOL_DIRS, {timeout: 20000});
  check('energy SW active + precached', true);
  await ctx.setOffline(true);
  const p2 = await ctx.newPage();
  let ok = false;
  try{
    await p2.goto(EBASE + '/risk/', {waitUntil: 'domcontentloaded', timeout: 8000});
    await showSourceIfReading(p2);
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
    await showSourceIfReading(p3);
    await p3.getByRole('button', {name: 'Wexcombe base case'}).click();
    await p3.waitForTimeout(1000);
    ok2 = await p3.locator('#preview svg').count() === 1;
  }catch(e){ ok2 = false; }
  check('energy: /cycles/ cold offline fully works', ok2);
  await p3.close();
  const p4 = await ctx.newPage();
  let ok3 = false;
  try{
    await p4.goto(EBASE + '/frequency/', {waitUntil: 'domcontentloaded', timeout: 8000});
    await p4.getByRole('button', {name: 'Battery stack'}).click();
    await p4.waitForTimeout(2500);
    ok3 = await p4.locator('#trace').count() === 1 && (await p4.locator('#verdict').innerText()).trim().length > 0;
  }catch(e){ ok3 = false; }
  check('energy: /frequency/ cold offline fully works', ok3);
  await p4.close();
  const p5 = await ctx.newPage();
  let ok4 = false;
  try{
    await p5.goto(EBASE + '/merit-order/', {waitUntil: 'domcontentloaded', timeout: 8000});
    await p5.getByRole('button', {name: 'GB today'}).click();
    await p5.waitForTimeout(1200);
    ok4 = await p5.locator('#chartwrap svg').count() === 1 && (await p5.locator('#verdict').innerText()).trim().length > 0;
  }catch(e){ ok4 = false; }
  check('energy: /merit-order/ cold offline fully works', ok4);
  await p5.close();
  const p6 = await ctx.newPage();
  let ok5 = false;
  try{
    await p6.goto(EBASE + '/intraday/', {waitUntil: 'domcontentloaded', timeout: 8000});
    await p6.waitForTimeout(800);   // no example button to click — the page boots alive
    ok5 = await p6.locator('#pricewrap svg').count() === 1 && await p6.locator('#stackwrap svg').count() === 1 &&
      (await p6.locator('#verdict').innerText()).trim().length > 0;
  }catch(e){ ok5 = false; }
  check('energy: /intraday/ cold offline fully works', ok5);
  await p6.close();
  await ctx.close();
}

console.log(results.join('\n'));
esrv && esrv.kill();
await browser.close();
report('pwa', {...tally(results), min: 28});   // ~90% of 32 measured 2026-08-16 (signal-vs-noise, case, paths added)
