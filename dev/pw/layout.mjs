/* Hero-layout checks for the three DSL tools: rail collapse, zoom, URL state, stacking. */
import {chromium, devices} from 'playwright';
import {trackErrors, report, tally, pickExample} from './_harness.mjs';
import {EXAMPLES as PROXY_EXAMPLES} from '../../proxy/example.js';

const TWO_THEORIES = pickExample(PROXY_EXAMPLES, 'Two theories');

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

/* `deep` marks the four tools that walk the WHOLE workspace contract. The other
   nine keep only the parts that can differ per tool (2026-08-18).

   The reasoning, because the reduction is the risk: rail collapse, the URL
   round-trip of the collapsed flag, the `[` keymap and the four zoom endpoints are
   assets/workspace.js's behaviour, identical in every importer — thirteen
   repetitions of it bought one shared module tested thirteen times, at 52 page
   loads and 1.3 checks/second, the worst cost-per-unique-thing in the chain.
   What is NOT shared is the per-tool SHAPE, so the deep four are chosen to differ
   in exactly those dimensions: tree (no source trigger, plain width), gauge (a
   source trigger AND a view trigger, tab hidden when narrow), case (opens with the
   rail already expanded), paths (its artefact shares the stage with a receipt
   column, the one tool whose width invariant is arithmetic rather than a floor).

   The narrow-stacking check stays on ALL thirteen deliberately. `narrowTab` is
   real per-tool markup, not shared behaviour, and its TRUE branch belongs only to
   why/map/wardley — all three in the reduced set. Every deep tool is narrowTab
   false, so trimming it would have left that branch with no witness anywhere in
   the chain (checked: `#railtab` appears in no other suite's assertions). */
const TOOLS = [
  {path: '/tree/', chip: 'Bid or no bid', deep: true},
  {path: '/why/', chip: 'Reading retention', source: 'Edit tree source'},
  {path: '/roadmap/', chip: 'Reading app roadmap'},
  {path: '/map/', chip: 'Assumption map', source: 'Edit map source'},
  {path: '/gauge/', chip: 'Q3 commitment review', view: '#viewreveal', source: 'Edit questions', narrowTab: false, deep: true},   // Narrow stacks the visible question source; no duplicate trigger.
  {path: '/timeline/', chip: 'App launch programme'},
  {path: '/wardley/', chip: 'Lantern platform', source: 'Edit landscape source'},
  {path: '/bets/', chip: 'Lantern portfolio'},
  {path: '/energy/risk/', chip: 'Route to market'},
  {path: '/energy/cycles/', chip: 'Wexcombe base case'},
  /* Added 2026-08-16. All three import assets/workspace.js and have done since they
     shipped; this list had never caught up, so the rail/collapse/zoom behaviour of
     three tools — paths the largest page in the suite — was never exercised.

     case and proxy open with the rail EXPANDED (their railtab reads "Hide source
     editor"), so neither needs a source trigger. paths opens COLLAPSED and its railtab
     is labelled "Edit Paths plan source", so it takes the gauge shape: a source
     trigger, but narrowTab:false, because at 800px its rail stacks visibly while the
     tab itself is hidden.

     Every one of those facts was measured against the running page. A first attempt
     guessed the label; a second removed the trigger entirely on the strength of a
     visibility probe that used offsetParent and reported the opposite of the truth. */
  {path: '/case/', chip: 'Wexcombe augmentation', deep: true},
  {path: '/paths/', chip: 'Lantern', source: 'Edit Paths plan source', narrowTab: false, receiptColumn: true, deep: true},
  {path: '/proxy/', chip: TWO_THEORIES.name},
];

/* Runs for every tool, deep or not: `narrowTab` is per-tool markup rather than
   shared-module behaviour, and its true branch lives only in the reduced set. */
async function narrowStacks(page, path, narrowTab){
  await page.setViewportSize({width: 800, height: 900});
  await page.waitForTimeout(300);
  check(path + ' narrow: rail stacks with an appropriate source control', await page.locator('.rail').isVisible() &&
    (narrowTab ? await page.locator('#railtab').isVisible() : !(await page.locator('#railtab').isVisible())));
}

for(const {path, chip, view, source, receiptColumn = false, narrowTab = !!source, deep = false} of TOOLS){
  const page = await browser.newPage({viewport: {width: 1720, height: 1000}});
  const errors = trackErrors(page);
  await page.goto(BASE + path, {waitUntil: 'networkidle'});
  if(source) await page.getByRole('button', {name: source}).click();
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
  /* A density artefact may declare a 1:1 physical-size floor so type never
     becomes smaller than its authored size. In that case it deliberately pans
     at both rail widths rather than growing; every other board should expand. */
  const minReadable = +(await page.locator('#preview svg').getAttribute('data-min-readable-scale') || 0);
  if(receiptColumn){
    /* Brief lays its artefact and the selected-decision receipt out as SIBLING grid
       columns, so this tool alone reaches a smaller svg than the 1624-1875px the
       others do. That was recorded here on 2026-08-16 as a KNOWN GAP said to be
       "capped somewhere between the pane and the renderer"; measuring it on
       2026-08-17 showed the opposite, and Matt reviewed the result and accepts the
       layout. At a 1720px viewport, collapsed: svg 1270 = stage 1270 EXACTLY, with a
       350px receipt and a 16px gap making up the 1636px /proxy/ reaches with no
       second panel. Nothing is clamped — app.js:336's `metrics.width - 366` is that
       same 350 + 16, and app.js:1090 says the wide rail is part of the composition.

       So the invariant is not a threshold, it is the arithmetic: the artefact fills
       its own stage, and artefact + receipt reach the width a sibling reaches. Both
       sides are measured live, so a regression that shrank the artefact without
       giving the width to the receipt (or vice versa) fails here. */
    const stageW = (await page.locator('#preview').boundingBox()).width;
    /* count() first: boundingBox() on a locator that matches nothing waits out the
       full timeout and rejects, which would CRASH the suite where a vanished receipt
       should read as a clean FAIL. */
    const receipt = page.locator('.overview-receipt').first();
    const receiptBox = await receipt.count() ? await receipt.boundingBox() : null;
    check(path + ' artefact fills its stage beside the receipt (svg ' + Math.round(after) +
      ' = stage ' + Math.round(stageW) + ')', Math.abs(after - stageW) < 12);
    check(path + ' artefact + receipt reach a sibling\'s width (' + Math.round(after) + ' + ' +
      Math.round(receiptBox?.width || 0) + ')', !!receiptBox && after + receiptBox.width > 1500);
  } else {
    check(path + ' diagram grows on collapse or holds its physical-size floor (' + Math.round(before) + '→' + Math.round(after) + ')',
      after > before * 1.2 || (minReadable >= 1 && Math.abs(after - before) < 8));
    if(deep) check(path + ' fills most of viewport (' + Math.round(after) + 'px)', after > 1500);
  }

  /* The shared-module walk (URL round-trip, `[` keymap, four zoom endpoints) runs
     on the deep four only — see the TOOLS comment. Everything a tool can differ in
     has already run above, and the narrow-stacking check below runs for all. */
  if(!deep){
    /* narrowStacks asserts the rail is VISIBLE once stacked, so it needs the rail
       open — the deep path reaches it after `[` has reopened it. Reopening here is
       what the first version of this reduction got wrong: it ran the check straight
       off the collapse and failed all ten shallow tools. 600ms clears the rail's
       0.28s reopen transition, the same margin the `[` check below uses. */
    await page.locator('#railtab').click();
    await page.waitForTimeout(600);
    await narrowStacks(page, path, narrowTab);
    check(path + ' no console/page errors', errors.length === 0);
    await page.close();
    continue;
  }

  /* URL round-trip of collapsed state */
  await page.waitForTimeout(300);
  const url = page.url();
  const p2 = await browser.newPage({viewport: {width: 1720, height: 1000}});
  await p2.goto(url, {waitUntil: 'networkidle'});
  await p2.waitForTimeout(600);
  check(path + ' collapsed state round-trips', !(await p2.locator('.rail').isVisible()));
  await p2.close();

  /* keyboard toggle. 600ms (was 300) clears the rail's 0.28s reopen visibility
     transition with margin — 300ms lost the race under CI parallel load and flaked
     '[ reopens rail' recurrently (confirmed pass serially each time). */
  await page.keyboard.press('[');
  await page.waitForTimeout(600);
  check(path + ' [ reopens rail', await page.locator('.rail').isVisible());

  /* zoom */
  const fitW = await svgW();
  await page.locator('.zoomctl button', {hasText: '+'}).click();
  await page.locator('.zoomctl button', {hasText: '+'}).click();
  await page.waitForTimeout(200);
  await page.waitForTimeout(350);
  const zoomedW = (await page.locator('#preview svg').evaluate(s => s.getBoundingClientRect().width));
  check(path + ' zoom + enlarges beyond fit', zoomedW > fitW * 1.05 || zoomedW > (await page.locator('.preview').evaluate(p => p.clientWidth)));
  await page.locator('.zoomctl button', {hasText: '100%'}).click();
  for(let i = 0; i < 5; i++) await page.locator('.zoomctl button', {hasText: '+'}).click();
  check(path + ' zoom has a disabled maximum endpoint', await page.locator('.zoomctl button', {hasText: '+'}).isDisabled());
  await page.locator('.zoomctl button', {hasText: '100%'}).click();
  for(let i = 0; i < 4; i++) await page.locator('.zoomctl button', {hasText: '−'}).click();
  check(path + ' zoom has a disabled minimum endpoint', await page.locator('.zoomctl button', {hasText: '−'}).isDisabled());
  await page.locator('.zoomctl button', {hasText: 'Fit'}).click();
  await page.waitForTimeout(500);
  check(path + ' Fit restores', Math.abs((await svgW()) - fitW) < 8);

  /* narrow stacking */
  await narrowStacks(page, path, narrowTab);
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

/* Coverage: workspace behaviour is a promise made by every tool that imports the
   shared module, so membership is derived from the imports rather than remembered.
   The list had sat at 10 of 13 since case, paths and proxy shipped. */
{
  const {readFileSync, existsSync} = await import('node:fs');
  const {TOOL_DIRS, ENERGY_TOOL_DIRS} = await import('../tool-dirs.mjs');
  const all = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS.map(d => 'energy/' + d)];
  const uses = all.filter(d => {
    const p = new URL('../../' + d + '/app.js', import.meta.url);
    return existsSync(p) && readFileSync(p, 'utf8').includes('assets/workspace.js');
  });
  const missing = uses.filter(d => !TOOLS.some(t => t.path === '/' + d + '/'));
  check('layout covers every workspace tool' + (missing.length ? ' — missing ' + missing.join(' ') : ''),
    missing.length === 0);
}

/* Coverage of the REDUCTION itself (2026-08-18). The list above is derived and
   guarded; the deep SET is hand-picked, so it is now the thing that can rot — mark
   one more tool shallow and a whole shape silently stops being walked. This asserts
   that the four still differ in every dimension the deep walk branches on: a source
   trigger present AND absent, a view trigger, and a receipt column present AND
   absent. (narrowTab is deliberately not here — narrowStacks runs for all thirteen,
   so the walk no longer branches on it.) */
{
  const deepSet = TOOLS.filter(t => t.deep);
  const both = (label, f) => deepSet.some(f) && deepSet.some(t => !f(t)) ? null : label;
  const gaps = [
    both('a source trigger present and absent', t => !!t.source),
    both('a receipt column present and absent', t => !!t.receiptColumn),
    deepSet.some(t => !!t.view) ? null : 'a view trigger',
  ].filter(Boolean);
  check('the deep walk still covers every shape it branches on' +
    (gaps.length ? ' — missing ' + gaps.join('; ') : ''), gaps.length === 0);
}

console.log(results.join('\n'));
await browser.close();
report('layout', {...tally(results), min: 134});   // ~90% of 149 measured 2026-08-18 (was 189 of 211; the shared-module walk narrowed to the deep four)
