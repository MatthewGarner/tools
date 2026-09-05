/* Hero-layout checks for the three DSL tools: rail collapse, zoom, URL state, stacking. */
import {chromium, devices} from 'playwright';
import {trackErrors, report, tally, pickExample, until} from './_harness.mjs';
import {EXAMPLES as PROXY_EXAMPLES} from '../../proxy/example.js';

const TWO_THEORIES = pickExample(PROXY_EXAMPLES, 'Two theories');

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

/* `deep` marks the three tools that walk the WHOLE workspace contract. The other
   ten keep only the parts that can differ per tool (2026-08-18).

   The reasoning, because the reduction is the risk: the `[` keymap and the four
   zoom endpoints are assets/workspace.js's behaviour, identical in every importer
   (initWorkspace owns both) — thirteen repetitions of them bought one shared module
   tested thirteen times, at 52 page loads and 1.3 checks/second, the worst
   cost-per-unique-thing in the chain. What is NOT shared is the per-tool SHAPE, so
   the deep set is chosen to differ in exactly those dimensions: tree (no source
   trigger, plain width), gauge (a source trigger AND a view trigger, tab hidden
   when narrow), paths (its artefact shares the stage with a receipt column, the one
   tool whose width invariant is arithmetic rather than a floor).

   TWO checks the first version of this reduction moved here and should not have,
   both restored to all thirteen (review, 2026-08-18):

   - The URL round-trip of the collapsed flag was justified as shared-module
     behaviour. It is not: workspace.js writes no hash at all (five exports, none
     touching location), and each app.js carries its OWN serialisation, in two
     divergent conventions — why/map/wardley write `state.e = ws.collapsed() ? 0 : 1`
     while the other ten write `if(ws.collapsed()) state.e = 0`. Every deep tool is
     the second convention, so trimming it left the first with no witness anywhere.
     Per-tool code gets a per-tool check.
   - The desktop width floor is a per-tool invariant, not a shared one — /paths/'s
     receipt-column branch exists precisely because width varies. Gating it on the
     deep set left /timeline/ with no upper-width bound at all: it is the one tool
     that takes the physical-size-floor branch below, which any unchanged width
     satisfies, so a regression capping it at 700px would have passed everything.

   `case` was in the deep set and is not any more: it is declared identically to
   `tree` on every dimension the walk branches on (no source, no view, no receipt),
   so it walked the shared module a fourth time and bought nothing. The coverage
   guard at the foot of this file could not see that — see its comment.

   The narrow-stacking check stays on ALL thirteen deliberately. `narrowTab` is
   real per-tool markup, not shared behaviour, and its TRUE branch belongs only to
   why/map/wardley — all three in the reduced set. Every deep tool is narrowTab
   false, so trimming it would have left that branch with no witness anywhere in
   the chain (checked: `#railtab` appears in no other suite's assertions). */
const TOOLS = [
  {path: '/tree/', chip: 'Bid or no bid', deep: true},
  {path: '/why/', chip: 'Reading retention', source: 'Edit tree source'},
  {path: '/roadmap/', source: 'Edit roadmap source', narrowTab: true, chip: 'Reading app roadmap'},
  {path: '/map/', chip: 'Assumption map', source: 'Edit map source'},
  {path: '/gauge/', chip: 'Q3 commitment review', view: '#viewreveal', source: 'Edit questions', narrowTab: false, deep: true},   // Narrow stacks the visible question source; no duplicate trigger.
  {path: '/timeline/', chip: 'App launch programme', source: 'Show source editor', narrowTab: false},
  {path: '/wardley/', chip: 'Lantern platform', source: 'Edit landscape source'},
  /* Bets keeps source open for editing, but its fit advisory has a named manual
     reader route. That route must release the hidden editor's layout height; a
     zero-width CodeMirror otherwise rewraps into a many-thousand-pixel phantom
     row behind the Field. */
  {path: '/bets/', chip: 'Lantern portfolio', reader: 'manual'},
  {path: '/energy/risk/', chip: 'Route to market', source: 'Show source editor', narrowTab: false, reader: true},
  {path: '/energy/cycles/', chip: 'Wexcombe base case', source: 'Show source editor', narrowTab: false, reader: true},
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
  {path: '/case/', chip: 'Morrow · paid tier', source: 'Edit source', narrowTab: false, receiptColumn: true},
  {path: '/paths/', chip: 'Lantern', source: 'Edit Paths plan source', narrowTab: false, receiptColumn: true, deep: true},
  {path: '/proxy/', chip: TWO_THEORIES.name, source: 'Show source editor', narrowTab: false, reader: true},
];

/* Reader-first workspaces are a new, deliberately transient arrival state. The
   ordinary shared-module walk below opens the source and exercises its historic
   collapse/zoom contract; this dedicated pass protects what that old walk cannot:
   arrive on the whole artefact, retain a shareable URL, then return to a real
   CodeMirror authoring surface without the reader reclaiming the rail. */
for(const {path, reader} of TOOLS.filter(t => t.reader)){
  /* Bets exposes its reader through the Fit advisory at its normal authoring
     width, so exercise that named route where the guard honestly appears. */
  const page = await browser.newPage({viewport: reader === 'manual' ? {width:1280, height:900} : {width:1440, height:900}, reducedMotion:'reduce'});
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    window.__readerArrivalStates = [];
    const watch = () => {
      const ws = document.getElementById('workspace');
      if(!ws || ws.dataset.readerWatched) return;
      ws.dataset.readerWatched = 'true';
      const note = () => window.__readerArrivalStates.push(ws.dataset.workspaceView || 'unset');
      new MutationObserver(note).observe(ws, {attributes:true, attributeFilter:['class', 'data-workspace-view']});
      note();
    };
    watch();
    new MutationObserver(watch).observe(document, {childList:true, subtree:true});
  });
  await page.goto(BASE + path, {waitUntil:'networkidle'});
  if(reader === 'manual'){
    await page.getByRole('button', {name:'Open reading view'}).click();
  }
  const ready = await until(() => page.evaluate(() => {
    const ws = document.getElementById('workspace'), svg = document.querySelector('#preview svg');
    return !!(ws?.dataset.workspaceView === 'reading' && svg?.getBoundingClientRect().width);
  }));
  await page.waitForTimeout(350);       // clears the intentional rail transition before measuring its final state
  const arrival = await page.evaluate(() => {
    const ws = document.getElementById('workspace');
    const svg = document.querySelector('#preview svg');
    const preview = document.getElementById('preview');
    const tab = document.getElementById('railtab');
    const advisory = document.querySelector('.fit-readability-advisory');
    const stage = document.querySelector('.stage');
    const s = svg?.getBoundingClientRect(), p = preview?.getBoundingClientRect(), q = stage?.getBoundingClientRect();
    const lastChildBottom = stage ? Math.max(...[...stage.children].map(child => child.getBoundingClientRect().bottom)) : 0;
    return {state:ws?.dataset.workspaceView, rail:document.querySelector('.rail')?.getBoundingClientRect(),
      stage:q && {bottom:q.bottom, lastChildBottom},
      svg:s && {left:s.left, right:s.right, width:s.width}, preview:p && {left:p.left, right:p.right},
      hash:location.hash, tabLabel:tab?.getAttribute('aria-label'), tabExpanded:tab?.getAttribute('aria-expanded'),
      tabControls:tab?.getAttribute('aria-controls'), advisory:!!advisory && !advisory.hidden,
      transitions:window.__readerArrivalStates || []};
  });
  check(path + ' reader: waits for a complete guarded artefact', ready);
  check(path + ' reader: opens on the artefact, not a collapsed rail', arrival.state === 'reading' && arrival.rail?.width <= 1);
  check(path + ' reader: preserves the full SVG in a reader pane', !!arrival.svg && !!arrival.preview &&
    arrival.svg.width >= arrival.preview.right - arrival.preview.left - 1);
  check(path + ' reader: releases the hidden source from the layout row', !!arrival.stage &&
    arrival.stage.bottom - arrival.stage.lastChildBottom <= 24);
  check(path + ' reader: exposes Show source editor without an advisory', arrival.tabLabel === 'Show source editor' &&
    arrival.tabExpanded === 'false' && arrival.tabControls === 'cmhost' && !arrival.advisory);
  check(path + ' reader: never persists a collapse or flashes one at arrival', arrival.hash === '' &&
    !arrival.transitions.includes('collapsed'));
  if(!ready){
    check(path + ' reader: exposes an operable source return', false);
    check(path + ' reader: no console/page errors' + (errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''), errors.length === 0);
    await page.close();
    continue;
  }
  await page.getByRole('button', {name:'Show source editor'}).click();
  const editorFocused = await until(() => page.evaluate(() => document.activeElement?.classList.contains('cm-content')));
  const before = await page.locator('.cm-content').textContent();
  await page.locator('.cm-content').press('End');
  await page.locator('.cm-content').press(' ');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(600);
  const after = await page.locator('.cm-content').textContent();
  const authoring = await page.evaluate(async () => {
    const {readHashState} = await import('/assets/series.js');
    return {state:document.getElementById('workspace')?.dataset.workspaceView,
      hash:await readHashState(), rail:document.querySelector('.rail')?.getBoundingClientRect().width || 0};
  });
  check(path + ' reader: Show source editor moves focus into CodeMirror', editorFocused);
  check(path + ' reader: edit/undo remains expanded and leaves no e=0', before === after && authoring.state === 'expanded' &&
    authoring.rail > 0 && authoring.hash?.e !== 0);
  await page.locator('#railtab').click();
  await page.waitForTimeout(500);
  const explicitCollapseURL = page.url();
  const p2 = await browser.newPage({viewport: {width:1440, height:900}, reducedMotion:'reduce'});
  await p2.addInitScript(() => {
    window.__incomingReaderStates = [];
    const watch = () => {
      const ws = document.getElementById('workspace');
      if(!ws || ws.dataset.incomingReaderWatched) return;
      ws.dataset.incomingReaderWatched = 'true';
      const note = () => window.__incomingReaderStates.push(ws.dataset.workspaceView || 'unset');
      new MutationObserver(note).observe(ws, {attributes:true, attributeFilter:['class', 'data-workspace-view']});
      note();
    };
    watch();
    new MutationObserver(watch).observe(document, {childList:true, subtree:true});
  });
  await p2.goto(explicitCollapseURL, {waitUntil:'networkidle'});
  await p2.waitForTimeout(450);
  const explicit = await p2.evaluate(async () => {
    const {readHashState} = await import('/assets/series.js');
    return {state:document.getElementById('workspace')?.dataset.workspaceView,
      rail:document.querySelector('.rail')?.getBoundingClientRect().width || 0, hash:await readHashState(),
      transitions:window.__incomingReaderStates || []};
  });
  check(path + ' reader: an explicit e=0 wins without a reader flash', explicit.state === 'collapsed' && explicit.rail <= 1 &&
    explicit.hash?.e === 0 && !explicit.transitions.includes('reading'));
  await p2.close();
  check(path + ' reader: no console/page errors' + (errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''), errors.length === 0);
  await page.close();
}

/* Fine-pointer windows can be narrowed after arriving in reading mode. The
   stacked layout has no rail tab, so it must restore source rather than leave it
   hidden by a stale presentation state. One shared workspace instance proves the
   responsive transition; initial coarse arrivals are covered below for all four. */
{
  const page = await browser.newPage({viewport:{width:1440, height:900}, reducedMotion:'reduce'});
  await page.goto(BASE + '/proxy/', {waitUntil:'networkidle'});
  await until(() => page.evaluate(() => document.getElementById('workspace')?.dataset.workspaceView === 'reading'));
  await page.setViewportSize({width:800, height:900});
  await page.waitForTimeout(350);
  const stacked = await page.evaluate(() => ({state:document.getElementById('workspace')?.dataset.workspaceView,
    rail:document.querySelector('.rail')?.getBoundingClientRect().width || 0,
    tab:document.getElementById('railtab') && getComputedStyle(document.getElementById('railtab')).display}));
  check('reader fine-pointer resize: stacked layout restores the source rail', stacked.state === 'expanded' && stacked.rail > 0 && stacked.tab === 'none');
  await page.close();
}

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
    const receipt = page.locator(path === '/case/' ? '#inspector' : '.overview-receipt').first();
    const receiptBox = await receipt.count() ? await receipt.boundingBox() : null;
    check(path + ' artefact fills its stage beside the receipt (svg ' + Math.round(after) +
      ' = stage ' + Math.round(stageW) + ')', Math.abs(after - stageW) < 12);
    check(path + ' artefact + receipt reach a sibling\'s width (' + Math.round(after) + ' + ' +
      Math.round(receiptBox?.width || 0) + ')', !!receiptBox && after + receiptBox.width > 1500);
  } else if(path === '/roadmap/') {
    /* Chapter starts at its 1440px composition width beside source, then uses
       the full reading stage. That useful 13% growth is smaller than the old
       generic 20% heuristic; assert the actual reading geometry instead. */
    const stageW = (await page.locator('#preview').boundingBox()).width;
    check(path + ' Chapter preserves its composition width and fills the reading stage (' +
      Math.round(before) + '→' + Math.round(after) + ' = ' + Math.round(stageW) + ')',
      before >= 1440 && after > before && Math.abs(after - stageW) < 12);
    check(path + ' fills most of viewport (' + Math.round(after) + 'px)', after > 1500);
  } else if(path === '/timeline/') {
    // Observatory reflows its track to the available live width. Native/export
    // intents retain their own dimensions; live type stays at its reading floor.
    const stageW = (await page.locator('#preview').boundingBox()).width;
    check(path + ' Observatory reflows to fill the stage without shrinking text',
      minReadable >= 1 && before >= 760 && after > before && Math.abs(after - stageW) < 12);
  } else {
    check(path + ' diagram grows on collapse or holds its physical-size floor (' + Math.round(before) + '→' + Math.round(after) + ')',
      after > before * 1.2 || (minReadable >= 1 && Math.abs(after - before) < 8));
    check(path + ' fills most of viewport (' + Math.round(after) + 'px)', after > 1500);
  }

  /* URL round-trip of the collapsed flag — ALL thirteen, because the serialisation
     lives in each app.js and comes in two conventions. See the TOOLS comment. */
  await page.waitForTimeout(300);
  {
    const url = page.url();
    const p2 = await browser.newPage({viewport: {width: 1720, height: 1000}});
    await p2.goto(url, {waitUntil: 'networkidle'});
    await p2.waitForTimeout(600);
    check(path + ' collapsed state round-trips', !(await p2.locator('.rail').isVisible()));
    await p2.close();
  }

  /* The shared-module walk (the `[` keymap and four zoom endpoints) runs on the
     deep set only — see the TOOLS comment. Everything a tool can differ in has
     already run above, and the narrow-stacking check below runs for all. */
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

/* A phone already gives source its own card below the artefact. Reader-first is
   therefore desktop presentation, not a second mobile mode. */
{
  for(const device of ['iPhone 13', 'Pixel 7']){
    const ctx = await browser.newContext({...devices[device], colorScheme:'light', reducedMotion:'reduce'});
    for(const {path} of TOOLS.filter(t => t.reader)){
      const page = await ctx.newPage();
      await page.goto(BASE + path, {waitUntil:'networkidle'});
      await page.waitForTimeout(450);
      const mobile = await page.evaluate(() => {
        const ws = document.getElementById('workspace'), rail = document.querySelector('.rail');
        const pv = document.getElementById('preview'), de = document.documentElement, tab = document.getElementById('railtab');
        return {state:ws?.dataset.workspaceView, railVisible:!!rail && getComputedStyle(rail).visibility !== 'hidden',
          sourceBelow:!!rail && !!pv && rail.getBoundingClientRect().top >= pv.getBoundingClientRect().bottom - 1,
          readerControlVisible:!!tab && getComputedStyle(tab).display !== 'none', noOverflow:de.scrollWidth <= innerWidth + 1};
      });
      check(path + ' ' + device + ': remains source-below, not reader mode',
        mobile.state === 'expanded' && mobile.railVisible && mobile.sourceBelow && !mobile.readerControlVisible);
      check(path + ' ' + device + ': has no document horizontal overflow', mobile.noOverflow);
      await page.close();
    }
    await ctx.close();
  }
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
   that the deep set still differs in every dimension the deep walk branches on: a
   source trigger present AND absent, a view trigger, and a receipt column present
   AND absent. (narrowTab is deliberately not here — narrowStacks runs for all
   thirteen, so the walk no longer branches on it.)

   KNOWN LIMIT, and it has already bitten once (review, 2026-08-18): this guard sees
   only DECLARED fields, and they are literals in the same array rather than derived
   from the product — so it is strictly weaker than its sibling above, which reads
   app.js's imports. It cannot notice a tool whose claimed distinction was never
   declared. That is exactly how `case` sat in the deep set justified by "opens with
   the rail already expanded": an undeclared property, and one `tree` shares, so the
   guard read the two as identical and stayed green while a fourth tool walked the
   shared module for nothing. Adding a tool here means declaring what makes it
   different, or it is not different. */
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
report('layout', {...tally(results), min: 146});   // ~90% of 162 measured 2026-08-18 (was 189 of 211; the shared-module walk narrowed to the deep three, and the review restored the round-trip and width floor to all thirteen)
