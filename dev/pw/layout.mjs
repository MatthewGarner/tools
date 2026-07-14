/* Hero-layout checks for the three DSL tools: rail collapse, zoom, URL state, stacking. */
import {chromium, devices} from 'playwright';
import {trackErrors, report, tally} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

const TOOLS = [
  {path: '/tree/', chip: 'Bid or no bid'},
  {path: '/why/', chip: 'Habit retention'},
  {path: '/roadmap/', chip: 'Habit app roadmap'},
  {path: '/map/', chip: 'Assumption map'},
  {path: '/gauge/', chip: 'Q3 commitment review', view: '#viewreveal'},   // SVG lives in the reveal view
  {path: '/timeline/', chip: 'App launch programme'},
  {path: '/wardley/', chip: 'Habitat platform'},
  {path: '/bets/', chip: 'Habitat portfolio'},
  {path: '/energy/risk/', chip: 'Route to market'},
  {path: '/energy/cycles/', chip: 'Wexcombe base case'},
];

for(const {path, chip, view} of TOOLS){
  const page = await browser.newPage({viewport: {width: 1720, height: 1000}});
  const errors = trackErrors(page);
  await page.goto(BASE + path, {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: chip}).click();
  await page.waitForTimeout(500);
  if(view){ await page.locator(view).click(); await page.waitForTimeout(400); }

  const svgW = async () => (await page.locator('#preview svg').boundingBox()).width;
  check(path + ' rail visible by default', await page.locator('.rail').isVisible());
  const before = await svgW();
  await page.locator('#railtab').click();
  await page.waitForTimeout(500);
  check(path + ' collapse hides rail', !(await page.locator('.rail').isVisible()));
  const after = await svgW();
  check(path + ' diagram grows on collapse (' + Math.round(before) + '→' + Math.round(after) + ')', after > before * 1.2);
  check(path + ' fills most of viewport (' + Math.round(after) + 'px)', after > 1500);

  /* URL round-trip of collapsed state */
  await page.waitForTimeout(300);
  const url = page.url();
  const p2 = await browser.newPage({viewport: {width: 1720, height: 1000}});
  await p2.goto(url, {waitUntil: 'networkidle'});
  await p2.waitForTimeout(600);
  check(path + ' collapsed state round-trips', !(await p2.locator('.rail').isVisible()));
  await p2.close();

  /* keyboard toggle */
  await page.keyboard.press('[');
  await page.waitForTimeout(300);
  check(path + ' [ reopens rail', await page.locator('.rail').isVisible());

  /* zoom */
  const fitW = await svgW();
  await page.locator('.zoomctl button', {hasText: '+'}).click();
  await page.locator('.zoomctl button', {hasText: '+'}).click();
  await page.waitForTimeout(200);
  await page.waitForTimeout(350);
  const zoomedW = (await page.locator('#preview svg').evaluate(s => s.getBoundingClientRect().width));
  check(path + ' zoom + enlarges beyond fit', zoomedW > fitW * 1.05 || zoomedW > (await page.locator('.preview').evaluate(p => p.clientWidth)));
  await page.locator('.zoomctl button', {hasText: 'Fit'}).click();
  await page.waitForTimeout(500);
  check(path + ' Fit restores', Math.abs((await svgW()) - fitW) < 8);

  /* narrow stacking */
  await page.setViewportSize({width: 800, height: 900});
  await page.waitForTimeout(300);
  check(path + ' narrow: rail stacks and tab hides', await page.locator('.rail').isVisible() &&
    !(await page.locator('#railtab').isVisible()));
  check(path + ' no console/page errors', errors.length === 0);
  await page.close();
}

/* coarse pointers get the indent bar on the indented DSLs (tree/why) */
{
  const ctx = await browser.newContext({...devices['iPhone 13'], colorScheme: 'light'});
  const page = await ctx.newPage();
  await page.goto(BASE + '/tree/', {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: 'Bid or no bid'}).click();
  await page.waitForTimeout(500);
  check('/tree/ coarse: indent bar visible', await page.locator('.cm-indentbar').isVisible());
  const before = await page.evaluate(() => localStorage.getItem('tree-src'));
  await page.locator('.cm-content').tap();
  await page.getByRole('button', {name: 'Indent line'}).tap();
  await page.waitForTimeout(300);
  const mid = await page.evaluate(() => localStorage.getItem('tree-src'));
  await page.getByRole('button', {name: 'Outdent line'}).tap();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('/tree/ coarse: indent/outdent buttons edit the text', mid !== before && after === before);
  await ctx.close();
}

/* ---- Fit fits the fold, but never at the cost of legibility (2026-07-13) ----
   Fit caps the board's width by its own aspect so the whole artefact lands in view.
   Two ways that can go wrong, neither visible to a phone suite (real phones are
   coarse-pointer and open at natural size, so they never take the Fit branch):
     - a NARROW desktop window (fine pointer, < the 520px bucket) gets the tall
       narrow-relayout artefact, whose aspect × fold crushed it to a fraction of
       the pane — a 120px-wide roadmap;
     - any board the cap would shrink past legibility should keep its size and let
       the user scroll instead.
   So: below the bucket the board still fills its pane, and on a laptop it never
   renders below 70% of the pane. */
for(const [label, viewport, minFill] of [
  ['narrow window', {width: 420, height: 800}, 0.9],
  ['laptop', {width: 1440, height: 900}, 0.7],
]){
  for(const {path, chip, view} of TOOLS){
    const page = await browser.newPage({viewport});
    const errors = trackErrors(page);
    await page.goto(BASE + path, {waitUntil: 'networkidle'});
    if(view) await page.locator(view).waitFor({timeout: 3000}).catch(() => {});
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const pv = document.querySelector('.preview'), svg = pv && pv.querySelector('svg');
      if(!svg) return null;
      return {svg: svg.getBoundingClientRect().width, pane: pv.clientWidth};
    });
    if(m && m.pane > 0)
      check(`${path} ${label}: board is not crushed (${Math.round(m.svg)}px of ${m.pane}px pane)`,
        m.svg >= m.pane * minFill);
    check(`${path} ${label}: no console/page errors`, errors.length === 0);
    await page.close();
  }
}

console.log(results.join('\n'));
await browser.close();
report('layout', {...tally(results), min: 60});
