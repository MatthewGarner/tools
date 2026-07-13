/* Signature-motion behavioral suite — motion ON (the screenshot/edit suites force
   reduced-motion). Proves: the reveal draws, plays ONLY when the whole element is
   in view (never off-screen), doesn't re-fire on theme, the FLIP glides + settles,
   and reduced-motion yields the final frame. Run from dev/pw with a server up
   (BASE knob; energy tools via /energy/<tool>/ on the same base, like smoke). */
import {chromium} from 'playwright';
import {trackErrors} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);
const $count = (page, sel) => page.evaluate(s => document.querySelectorAll(s).length, sel);
const hasGo = (page, sel) => page.$eval(sel, el => el.classList.contains('mo-go')).catch(() => false);

async function open(path, opts = {}){
  const page = await browser.newPage(opts);
  const errors = trackErrors(page);
  await page.goto(BASE + path, {waitUntil: 'networkidle'});
  return {page, errors};
}
/* scroll a container fully into view + wait for the reveal to play */
async function reveal(page, sel){
  await page.$eval(sel, el => el.scrollIntoView({block: 'center'}));
  await page.waitForFunction(s => document.querySelector(s)?.classList.contains('mo-go'), sel, {timeout: 3000}).catch(() => {});
  await page.waitForTimeout(50);
}

/* ---- draw showcases: the curves draw once the element is in view ---- */
for(const [name, path, container] of [['alarm', '/alarm/', '#distwrap'], ['flow', '/flow/', '#verdictwrap']]){
  const {page, errors} = await open(path, {viewport: {width: 1100, height: 700}});
  await reveal(page, container);
  check(name + ': hero strokes DRAW when in view (.mo-draw >= 1)', await $count(page, container + ' .mo-draw') >= 1);
  check(name + ': container is playing (.mo-go)', await hasGo(page, container));
  await page.waitForTimeout(1300);
  check(name + ': reveal cleans up (no .mo-* after settle)', await $count(page, container + ' .mo-draw, ' + container + ' .mo-fade') === 0);
  check(name + ': no console errors', errors.length === 0);
  await page.close();
}

/* ---- THE guarantee: a below-the-fold element does NOT animate on load; it stays
   pre-hidden until scrolled fully into view, THEN draws ---- */
{
  const {page, errors} = await open('/flow/', {viewport: {width: 900, height: 480}});   // small → readout below fold
  await page.waitForTimeout(200);
  check('only-when-seen: flow readout is below the fold at load',
    await page.$eval('#verdictwrap', el => el.getBoundingClientRect().top > innerHeight));
  check('only-when-seen: NOT playing at load (no .mo-go)', !(await hasGo(page, '#verdictwrap')));
  check('only-when-seen: the curve is pre-hidden (dashoffset > 0) at load',
    await page.$eval('#verdictwrap polyline[stroke-width]', el => parseFloat(getComputedStyle(el).strokeDashoffset) > 0.5).catch(() => false));
  await reveal(page, '#verdictwrap');
  check('only-when-seen: plays once scrolled fully into view (.mo-go + .mo-draw)',
    (await hasGo(page, '#verdictwrap')) && (await $count(page, '#verdictwrap .mo-draw') >= 1));
  check('only-when-seen: no console errors', errors.length === 0);
  await page.close();
}

/* ---- merit-order: fade reveal in view + FLIP glide on a stack change ---- */
{
  const {page, errors} = await open('/energy/merit-order/', {viewport: {width: 1100, height: 820}});
  await reveal(page, '#chartwrap');
  check('merit-order: fade reveal plays in view (.mo-go)', await hasGo(page, '#chartwrap'));
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

/* ---- timeline: fade reveal in view + NO re-reveal on theme toggle ---- */
{
  const {page, errors} = await open('/timeline/', {viewport: {width: 1200, height: 820}});
  await reveal(page, '#preview');
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

for(const r of results) console.log(r);
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
