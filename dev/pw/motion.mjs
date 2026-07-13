/* Signature-motion behavioral suite — motion ON (unlike the screenshot suites,
   which force reduced-motion). Proves: the reveal draws + fires once, doesn't
   re-fire on theme, the FLIP glides + settles, and reduced-motion yields the
   final frame. Run from dev/pw with a server up (BASE knob; energy tools are
   reached via /energy/<tool>/ on the same base, like smoke). */
import {chromium, devices} from 'playwright';
import {trackErrors} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);
const $count = (page, sel) => page.evaluate(s => document.querySelectorAll(s).length, sel);

async function open(path, opts = {}){
  const page = await browser.newPage(opts);
  const errors = trackErrors(page);
  await page.goto(BASE + path, {waitUntil: 'networkidle'});
  return {page, errors};
}

/* ---- draw actually happens (Fable's #1 de-risk) ---- */
for(const [name, path, container] of [['alarm', '/alarm/', '#distwrap'], ['flow', '/flow/', '#verdictwrap']]){
  const {page, errors} = await open(path);
  await page.waitForTimeout(120);
  check(name + ': hero strokes DRAW on load (.mo-draw >= 1)', await $count(page, container + ' .mo-draw') >= 1);
  await page.waitForTimeout(1300);
  check(name + ': reveal cleans up (no .mo-* after settle)', await $count(page, container + ' .mo-draw, ' + container + ' .mo-fade') === 0);
  check(name + ': no console errors', errors.length === 0);
  await page.close();
}

/* ---- merit-order: reveal (fade) on load + FLIP glide on a stack change ---- */
{
  const {page, errors} = await open('/energy/merit-order/');
  await page.waitForTimeout(120);
  check('merit-order: fade reveal on load (.mo-fade >= 1)', await $count(page, '#chartwrap .mo-fade') >= 1);
  await page.waitForTimeout(1300);
  const chip = await page.$('#conditions .chip:not(.on)') || await page.$('#worlds .chip:not(.on)') || await page.$('#presets .chip:not(.on)');
  await chip.click();
  await page.waitForTimeout(10);
  check('merit-order: bars FLIP on a stack change (.mo-flip present)', await $count(page, '#chartwrap g[data-plant].mo-flip') >= 1);
  await page.waitForTimeout(400);
  const settled = await page.evaluate(() => [...document.querySelectorAll('#chartwrap g[data-plant]')]
    .every(g => { const t = getComputedStyle(g).transform; return !t || t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'; }));
  check('merit-order: FLIP settles to identity', settled);
  check('merit-order: no console errors', errors.length === 0);
  await page.close();
}

/* ---- timeline: fade reveal on load + NO re-reveal on theme toggle ---- */
{
  const {page, errors} = await open('/timeline/');
  await page.waitForTimeout(120);
  check('timeline: fade reveal on load (.mo-fade >= 1)', await $count(page, '#preview .mo-fade') >= 1);
  await page.waitForTimeout(1300);
  await page.evaluate(() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; });
  await page.waitForTimeout(120);
  check('timeline: theme toggle does NOT re-reveal (.mo-* stays 0)', await $count(page, '#preview .mo-fade, #preview .mo-draw') === 0);
  check('timeline: no console errors', errors.length === 0);
  await page.close();
}

/* ---- reduced-motion yields the final frame (a11y + screenshot determinism) ---- */
{
  const {page, errors} = await open('/alarm/', {reducedMotion: 'reduce'});
  await page.waitForTimeout(120);
  check('reduced-motion: no reveal classes ever', await $count(page, '#distwrap .mo-draw, #distwrap .mo-fade') === 0);
  const opaque = await page.evaluate(() => [...document.querySelectorAll('#distwrap path[fill="none"][stroke]')]
    .every(p => getComputedStyle(p).opacity === '1' && (getComputedStyle(p).strokeDasharray === 'none' || !getComputedStyle(p).strokeDasharray)));
  check('reduced-motion: curves render at full opacity, undashed (final frame)', opaque);
  check('reduced-motion: no console errors', errors.length === 0);
  await page.close();
}

/* ---- reveal survives a phone-width boot (the ResizeObserver bucket race) ---- */
{
  const ctx = await browser.newContext({...devices['iPhone 13']});
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto(BASE + '/alarm/', {waitUntil: 'networkidle'});
  await page.waitForTimeout(200);
  check('phone boot: reveal survives (.mo-draw present at t+200ms)', await $count(page, '#distwrap .mo-draw') >= 1);
  check('phone boot: no console errors', errors.length === 0);
  await ctx.close();
}

for(const r of results) console.log(r);
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
