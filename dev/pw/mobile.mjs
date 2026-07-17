/* Mobile foundations gate: phone-width first-run behaviour for in-scope tools.
   Run from dev/pw with both servers up (:8087 tools, :8089 energy), or point
   BASE/EBASE at other servers — same env-knob convention as the sibling suites. */
import {chromium, devices} from 'playwright';
import {readFile} from 'node:fs/promises';
import {report} from './_harness.mjs';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from '../tool-dirs.mjs';
import {END_STATES, measureEndState, assertEndState, LEGIBLE_FLOOR} from './end-states.mjs';

const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';
// Every tool is swept for phone h-scroll / <16px-fields / scaffold parity — the
// list is DERIVED from tool-dirs.mjs so a new tool can never be silently forgotten
// (merit-order once was, living only in CONTAINERS below). AUTOLOAD and CONTAINERS
// are name-keyed metadata; a coverage guard asserts every key is a real tool.
const ALL = [
  ...TOOL_DIRS.map(d => [d, T + '/' + d + '/']),
  ...ENERGY_TOOL_DIRS.map(d => [d, E + '/' + d + '/']),
];
const ALL_NAMES = new Set(ALL.map(([n]) => n));
// the subset that renders a default SVG example on first-run (gets the extra
// autoload check). NB canvas-output tools (fermi, frequency) also autoload but
// draw to <canvas> — the SVG-presence check below can't see them, so they're out.
const AUTOLOAD_NAMES = new Set(['roadmap', 'tree', 'why', 'map', 'wardley', 'bets', 'cycles', 'risk',
  'gauge', 'timeline', 'signal-vs-noise']);
const AUTOLOAD = ALL.filter(([n]) => AUTOLOAD_NAMES.has(n));

let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});

for(const [name, url] of ALL){
  const page = await ctx.newPage();
  // a swallowed goto used to leave the page on about:blank and let the checks
  // below pass VACUOUSLY (docSW≤vw trivially true) — a dead server read green
  const loaded = await page.goto(url, {waitUntil: 'networkidle'}).then(() => true).catch(() => false);
  if(!loaded){ ok(false, name + ': page loads'); await page.close(); continue; }
  await page.waitForTimeout(900);
  // clientWidth is the stable layout-viewport width; innerWidth expands to fit
  // overflowing content on mobile, which masks exactly the h-scroll we're testing for.
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `${name}: no page-level horizontal scroll (${docSW} <= ${vw})`);
  // A visible editable field under 16px makes iOS Safari zoom the page on focus. Guard it.
  const tiny = await page.evaluate(() => {
    for(const el of document.querySelectorAll('input[type=text],input[type=number],input:not([type]),textarea,.cm-content')){
      if(el.offsetParent === null) continue;
      if(parseFloat(getComputedStyle(el).fontSize) < 16) return (el.id || el.className.toString().slice(0, 20) || el.tagName);
    }
    return null;
  });
  ok(tiny === null, `${name}: no <16px editable field (iOS zoom-on-focus)${tiny ? ' — ' + tiny : ''}`);
  /* page-scaffold parity: the per-tool style.css must carry the house page
     (a tool once shipped with Times New Roman on a transparent body) */
  const parity = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const probe = document.createElement('div');
    probe.style.color = bg;
    document.body.appendChild(probe);
    const bgResolved = getComputedStyle(probe).color;
    probe.remove();
    const h1 = document.querySelector('h1');
    return {
      font: cs.fontFamily.includes('-apple-system') || cs.fontFamily.includes('system-ui'),
      bg: cs.backgroundColor === bgResolved,
      h1: h1 ? getComputedStyle(h1).fontFamily.includes('Charter') : false,   // no h1 is a FAIL, not a vacuous pass
    };
  });
  ok(parity.font, `${name}: body wears the system font stack`);
  ok(parity.bg, `${name}: body background is the token --bg`);
  ok(parity.h1, `${name}: h1 wears Charter`);
  /* Rule 2 (mobile input): every tool that mounts the shared CodeMirror editor
     must surface a ≥44px, always-enabled ↶ Undo on a coarse pointer — phones
     have no ⌘Z, and edit-in-place promises undoable rewrites. DERIVED from the
     mounted editor (not a hand-kept list), so a new DSL tool that forgets
     mountTouchUndo fails here. */
  const undo = await page.evaluate(() => {
    if(!document.querySelector('#cmhost .cm-editor')) return 'no-editor';
    const b = document.querySelector('.actions .touch-undo');
    if(!b) return 'missing';
    const r = b.getBoundingClientRect();
    if(getComputedStyle(b).display === 'none' || r.height === 0) return 'hidden-on-coarse';
    if(r.height < 44) return 'undersized:' + Math.round(r.height) + 'px';
    if(b.disabled) return 'disabled';
    if((b.getAttribute('aria-label') || '') !== 'Undo') return 'unlabelled';
    return 'ok';
  });
  if(undo !== 'no-editor') ok(undo === 'ok', `${name}: coarse-pointer ↶ Undo in the actions row (${undo})`);
  await page.close();
}

for(const [name, url] of AUTOLOAD){
  const page = await ctx.newPage();
  const loaded = await page.goto(url, {waitUntil: 'networkidle'}).then(() => true).catch(() => false);
  if(!loaded){ ok(false, name + ': page loads'); await page.close(); continue; }
  await page.waitForTimeout(1000);
  const hash = await page.evaluate(() => location.hash);
  const hasOutput = await page.evaluate(() =>
    !!document.querySelector('.stage svg, .preview svg, #chartwrap svg, #stage svg, main svg'));
  ok(hasOutput, `${name}: renders a default example on phone first-run`);
  ok(hash === '', `${name}: URL not polluted by auto-load (hash="${hash}")`);
  await page.close();
}

// Phone width-reclamation gate (Camp A): workspace.css's "16px prose / 10px
// surface" block must land the tool surface at >=90% of the viewport width on a
// phone — under the desktop framing chain it sat at ~78% (24px gutters + card
// padding + side borders). Measured on a workspace AUTOLOAD tool: the rendered
// .stage SVG and the open rail's .cm-editor, both against the layout viewport.
// Nothing else asserts the reclaim; a regression of the shared block (a
// re-added gutter, side border or fat padding) fails here.
{
  const page = await ctx.newPage();
  const loaded = await page.goto(T + '/wardley/', {waitUntil: 'networkidle'}).then(() => true).catch(() => false);
  if(!loaded){ ok(false, 'wardley: width-reclaim page loads'); }
  else {
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const svg = document.querySelector('.stage .preview svg');
      const ed = document.querySelector('.rail .cm-editor');
      return {vw,
        svg: svg ? svg.getBoundingClientRect().width : 0,
        ed: ed ? ed.getBoundingClientRect().width : 0};
    });
    ok(m.svg / m.vw >= 0.90,
      `wardley: stage surface reclaims >=90% of phone width (${Math.round(m.svg)}/${m.vw} = ${(m.svg / m.vw * 100).toFixed(1)}%)`);
    ok(m.ed / m.vw >= 0.90,
      `wardley: editor rail reclaims >=90% of phone width (${Math.round(m.ed)}/${m.vw} = ${(m.ed / m.vw * 100).toFixed(1)}%)`);
  }
  await page.close();
}

// Camp B analogue of the gate above, on the pre-module card-band tools: their
// .wrap had NO horizontal padding (page.css's body pads 40px 0), so h1/tagline
// prose sat FLUSH at 0px, and the surfaces stopped short of the edge. The
// per-tool "16px prose / full-bleed card" blocks must give prose a >=15px
// reading gutter AND land the histogram surface at >=90% of the viewport.
// fermi is the sentinel (worst offender; its canvas is the hero surface).
{
  const page = await ctx.newPage();
  const loaded = await page.goto(T + '/fermi/', {waitUntil: 'networkidle'}).then(() => true).catch(() => false);
  if(!loaded){ ok(false, 'fermi: width-reclaim page loads'); }
  else {
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const h1 = document.querySelector('h1');
      const card = document.querySelector('.card');
      const hist = document.querySelector('#hist');
      return {vw,
        h1Left: h1 ? h1.getBoundingClientRect().left : -1,
        card: card ? card.getBoundingClientRect().width : 0,
        hist: hist ? hist.getBoundingClientRect().width : 0};
    });
    ok(m.h1Left >= 15,
      `fermi: prose keeps a reading gutter, not flush at the glass (h1 left ${m.h1Left.toFixed(1)}px >= 15)`);
    ok(m.card / m.vw >= 0.98,
      `fermi: card band full-bleeds to the viewport edge (${Math.round(m.card)}/${m.vw} = ${(m.card / m.vw * 100).toFixed(1)}%)`);
    ok(m.hist / m.vw >= 0.90,
      `fermi: histogram surface reclaims >=90% of phone width (${Math.round(m.hist)}/${m.vw} = ${(m.hist / m.vw * 100).toFixed(1)}%)`);
  }
  await page.close();
}

// Tablet-band gutter gate (2026-07-17): the phone reclamation fixed <=640, but
// the 8 pre-module tools' own .wrap had NO horizontal padding, so prose sat
// FLUSH at 0px from 640px right up to each tool's max-width (720-1040). The
// gutter now lives unconditionally on each base .wrap; assert it at 700px —
// inside every tool's flush zone — so the bug can't silently return.
const PREMODULE = [
  ['fermi', T + '/fermi/'], ['duel', T + '/duel/'],
  ['signal-vs-noise', T + '/signal-vs-noise/'], ['rank', T + '/rank/'],
  ['alarm', T + '/alarm/'], ['flow', T + '/flow/'],
  ['intraday', E + '/intraday/'], ['premortem', T + '/premortem/'],
];
for(const [n] of PREMODULE) ok(ALL_NAMES.has(n), `PREMODULE metadata "${n}" is a known tool`);
{
  const tctx = await browser.newContext({viewport: {width: 700, height: 900}, reducedMotion: 'reduce'});
  for(const [name, url] of PREMODULE){
    const page = await tctx.newPage();
    const loaded = await page.goto(url, {waitUntil: 'networkidle'}).then(() => true).catch(() => false);
    if(!loaded){ ok(false, name + ': tablet-band page loads'); await page.close(); continue; }
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const h1 = document.querySelector('h1');
      return {vw: de.clientWidth, sw: de.scrollWidth,
        h1Left: h1 ? h1.getBoundingClientRect().left : -1};
    });
    ok(m.h1Left >= 15,
      `${name}: prose keeps a reading gutter at tablet width (h1 left ${m.h1Left.toFixed(1)}px >= 15 @700)`);
    ok(m.sw <= m.vw + 1, `${name}: no page h-scroll at tablet width (${m.sw} <= ${m.vw})`);
    await page.close();
  }
  await tctx.close();
}

// Narrow no-overflow gate: the four tools whose charts/tables were just
// re-laid-out must not let their INNER render container overflow sideways —
// that's the "no sideways pan" guarantee this effort delivers. Page-level
// scroll is already covered above; this checks the container itself, since
// a workspace shell can clip page overflow while the container inside it
// still overflows (e.g. an oversized SVG or a fixed-width table row).
const CONTAINERS = [
  ['cycles', E + '/cycles/', ['#preview']],
  ['risk', E + '/risk/', ['#preview']],
  ['merit-order', E + '/merit-order/', ['#chartwrap']],
  ['rank', T + '/rank/', ['.tblwrap']],
  ['intraday', E + '/intraday/', ['#stackwrap', '#pricewrap']],
  ['wardley', T + '/wardley/', ['#preview']],
  ['bets', T + '/bets/', ['#preview']],
  ['roadmap', T + '/roadmap/', ['#preview']],
  ['timeline', T + '/timeline/', ['#preview']],   // Ship 2 narrow relayout: #preview must not overflow sideways
  ['gauge', T + '/gauge/', ['#preview']],   // reveal overlay narrow relayout: was a fixed-960 pan that truncated its verdict
  ['why', T + '/why/', ['#preview']],
  ['signal-vs-noise', T + '/signal-vs-noise/', ['#stage']],   // grid relayouts 3→2→1 cols; #stage svg is width:100%
  ['alarm', T + '/alarm/', ['#gate', '#distwrap']],   // canvas re-flows to width, SVG is responsive
  // (duel not listed: its readout is hidden until Start, so a load-time container
  // check is a trivial pass; the ALL loop covers the visible setup's page h-scroll,
  // and the two-up duel cards stack via a pure CSS grid under 640px — can't pan)
  // (premortem not listed: the register is (a) behind wizard nav — not present at
  // load — and (b) an INTENTIONAL scroll container (a dense 6-col data table, the
  // plan's exports-pinned-wide exception), so the generic no-overflow assertion is
  // the wrong check. The bespoke register-phase walk below verifies the real
  // invariant: that scroll is contained inside .registerwrap and never blows out
  // the page body.)
];

// coverage guard: every name-keyed metadata entry must be a real (derived) tool —
// a rename, typo, or removed tool fails loud here instead of silently skipping checks
for(const n of AUTOLOAD_NAMES) ok(ALL_NAMES.has(n), `AUTOLOAD metadata "${n}" is a known tool`);
for(const [n] of CONTAINERS) ok(ALL_NAMES.has(n), `CONTAINERS metadata "${n}" is a known tool`);

for(const [name, url, selectors] of CONTAINERS){
  const page = await ctx.newPage();
  const loaded = await page.goto(url, {waitUntil: 'networkidle'}).then(() => true).catch(() => false);
  if(!loaded){ ok(false, name + ': page loads'); await page.close(); continue; }
  await page.waitForTimeout(1000);
  for(const sel of selectors){
    const found = await page.evaluate((s) => !!document.querySelector(s), sel);
    if(!found){
      ok(false, `${name}: container ${sel} not found on page`);
      continue;
    }
    const {sw, cw} = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return {sw: el.scrollWidth, cw: el.clientWidth};
    }, sel);
    ok(sw <= cw + 2, `${name}: ${sel} no horizontal overflow (${sw} <= ${cw})`);
  }
  await page.close();
}

// bets Quadrant view (view 2): toggling to it on a phone must land the same
// narrow relayout guarantee the board already gets above — no page-level
// h-scroll, and the #preview container itself doesn't overflow sideways.
{
  const page = await ctx.newPage();
  await page.goto(T + '/bets/', {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(600);
  const chip = page.getByRole('button', {name: 'Habitat portfolio'});
  if(await chip.count()) await chip.click();
  await page.waitForTimeout(600);
  await page.getByRole('button', {name: 'Quadrant'}).click();
  await page.waitForTimeout(400);
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `bets: quadrant view — no page-level h-scroll (${docSW} <= ${vw})`);
  const {sw, cw} = await page.evaluate(() => {
    const el = document.querySelector('#preview');
    return {sw: el.scrollWidth, cw: el.clientWidth};
  });
  ok(sw <= cw + 2, `bets: quadrant view — #preview no horizontal overflow (${sw} <= ${cw})`);
  // the quadrant is an interaction-reached SVG (view is app state, not URL-encodable, so
  // it can't join END_STATES) — but the same shrink-to-fit could wreck it, so reuse the
  // legibility measure on the surface this block already drove to.
  const q = await measureEndState(page, '#preview', null);
  ok(q.minFont != null && q.minFont >= LEGIBLE_FLOOR,
    `bets: quadrant view — smallest text stays legible (${q.minFont != null ? q.minFont.toFixed(1) : '?'}px >= ${LEGIBLE_FLOOR})`);
  await page.close();
}

// rank robustness shuffle on a phone: the header (with the desktop weight sliders) is
// display:none below 640px, so the drag-weights mechanism relies on the #wstrip surface —
// which must be visible, ≥44px, and actually re-rank the rows when dragged.
{
  const page = await ctx.newPage();
  await page.goto(T + '/rank/', {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(700);
  // Test the FIRST-LOAD default (no chip click): it must open on a real contested example
  // whose ranking re-sorts under a weight drag — the old identical-rows default never did.
  const strip = await page.$$eval('#wstrip .wslider', els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  ok(strip.length >= 2, `rank: phone weight strip present on first load (${strip.length} sliders)`);
  ok(strip.every(h => h >= 44), `rank: phone weight sliders ≥44px (${strip.join(',')})`);
  const knifeOnLoad = await page.$$eval('#rrows .rrow.knife', els => els.length);
  ok(knifeOnLoad >= 1, `rank: a knife-edge pill shows on first load (${knifeOnLoad})`);
  const before = await page.$$eval('#rrows .rrow', els => els.map(e => e.dataset.itemIdx).join(','));
  const sliders = await page.$$('#wstrip .wslider');
  // zero the FIRST weight (Value) — removing the dominant criterion re-sorts a benefit/effort ranking
  if(sliders.length){ await sliders[0].evaluate(el => { el.value = el.min; el.dispatchEvent(new Event('input', {bubbles:true})); }); }
  await page.waitForTimeout(200);
  const after = await page.$$eval('#rrows .rrow', els => els.map(e => e.dataset.itemIdx).join(','));
  ok(before !== after, `rank: dragging a phone weight re-ranks the rows`);
  await page.close();
}

// timeline phone behaviour (Ship 2 SUPERSEDES Ship 1's coarse-pointer pan): below
// 520px the board RELAYOUTS into stacked rows on a shared axis (the house "relayout,
// not pan" bar), so the whole board fits the pane and there is no horizontal pan. The
// [data-next] marker still rides the "Next up" milestone (kept for parity and for
// wide-but-coarse contexts where panToToday still applies). Assert the narrow relayout
// is what a phone gets, it fits sideways, and the next-up milestone is in view.
{
  const doc = 'title: Pan\ntoday: 2026-07-06\nApp: Kickoff 2026-07-10 [done]\nApp: Far launch 2027-08-01 .. 2027-11-01';
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify({t: doc}))), 'binary').toString('base64');
  const page = await ctx.newPage();
  await page.goto(T + '/timeline/#' + hash, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const pv = document.querySelector('#preview');
    const svg = pv && pv.querySelector('svg');
    const next = pv && pv.querySelector('[data-next]');
    if(!pv || !svg || !next) return null;
    const p = pv.getBoundingClientRect(), n = next.getBoundingClientRect();
    return {narrow: svg.hasAttribute('data-narrow'), nc: n.left + n.width / 2,
      pL: p.left, pR: p.left + p.width, sw: pv.scrollWidth, cw: pv.clientWidth};
  });
  ok(m !== null, 'timeline: the phone board renders with a [data-next] milestone marker');
  ok(m && m.narrow, 'timeline: below 520px the board relayouts to the narrow stack (not a wide pan-board)');
  ok(m && m.sw <= m.cw + 2,
    `timeline: the narrow board fits the pane — no horizontal pan (${m ? Math.round(m.sw) : '?'} <= ${m ? Math.round(m.cw) : '?'})`);
  ok(m && m.nc >= m.pL - 1 && m.nc <= m.pR + 1,
    `timeline: the next-up milestone is horizontally in view` +
    (m ? ` (center ${Math.round(m.nc)} in [${Math.round(m.pL)}, ${Math.round(m.pR)}])` : ''));
  await page.close();
}

// timeline phone-export exception (Fable): below 520px the PREVIEW is the narrow
// relayout, but Download SVG must still export the WIDE board — exports never set
// ctx.width. The renderer half is unit-tested; this closes the app-wiring half (a
// future width leak into svgString/ctx() would otherwise ship a phone-sized export).
{
  const ectx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce', acceptDownloads: true});
  const page = await ectx.newPage();
  await page.goto(T + '/timeline/', {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => !!document.querySelector('#preview svg[data-narrow]')),
    'timeline: the phone PREVIEW is the narrow relayout (precondition for the export check)');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlsvg')]);
  const svg = await readFile(await dl.path(), 'utf8');
  const w = parseInt((svg.match(/<svg[^>]*width="(\d+)"/) || [])[1] || '0', 10);
  ok(!/data-narrow/.test(svg), 'timeline: phone Download SVG is the WIDE board (no data-narrow), not the narrow preview');
  ok(w > 520, `timeline: phone Download SVG keeps the wide board width (${w} > 520)`);
  await page.close();
  await ectx.close();
}

// End-state legibility gate (shared table + measurement in end-states.mjs; webkit.mjs
// runs the same on real Safari). Every check above only sees each tool's FIRST render;
// this drives tools to their interaction-reached payoff and gates its legibility.
for(const es of END_STATES){
  const base = es.origin === 'E' ? E : T;
  const page = await ctx.newPage();
  const loaded = await page.goto(base + es.path, {waitUntil: 'networkidle'}).then(() => true).catch(() => false);
  if(!loaded){ ok(false, `${es.name}: end-state page loads`); await page.close(); continue; }
  await page.waitForTimeout(800);
  await assertEndState(page, ok, es.name, await measureEndState(page, es.sel, es.readySel), es.sel);
  await page.close();
}

// premortem register-phase walk: the register is behind the wizard, so drive a
// fresh doc to a populated REGISTER on a phone and prove the dense table's own
// horizontal scroll stays inside .registerwrap and never blows out the page body
// (the wizard phase panels must reflow, not scroll — covered incidentally here).
{
  // fresh context: premortem is localStorage-backed, so a shared ctx would land
  // on its saved-list home instead of a new FRAME.
  const pctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const page = await pctx.newPage();
  await page.goto(T + '/premortem/', {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(500);
  await page.fill('[data-field="title"]', 'Habitat phone launch');
  await page.fill('[data-field="question"]', 'It flopped. Why?');
  await page.click('#next'); await page.waitForTimeout(120);
  await page.click('[data-act="skiptimer"]'); await page.waitForTimeout(120);
  for(const t of ['Sign-up too slow on 3G', 'Push permission denied', 'Costs overshoot']){
    await page.fill('[data-add="entry"]', t); await page.press('[data-add="entry"]', 'Enter'); await page.waitForTimeout(80);
  }
  await page.click('#next'); await page.waitForTimeout(100);   // CLUSTER
  await page.click('#next'); await page.waitForTimeout(100);   // SCORE
  await page.locator('.scrow').first().locator('[data-p="lo"]').fill('30');
  await page.locator('.scrow').first().locator('[data-p="hi"]').fill('60');
  await page.locator('.scrow').first().locator('[data-impact="lo"]').fill('100');
  await page.locator('.scrow').first().locator('[data-impact="hi"]').fill('400');
  await page.waitForTimeout(120);
  await page.click('#next'); await page.waitForTimeout(100);   // ACTIONS
  await page.click('#next'); await page.waitForTimeout(100);   // VOTE
  await page.click('#next'); await page.waitForTimeout(250);   // REGISTER
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `premortem: register phase — no page-level h-scroll (${docSW} <= ${vw})`);
  const reg = await page.evaluate(() => {
    const w = document.querySelector('.registerwrap');
    if(!w) return null;
    return {clipped: getComputedStyle(w).overflowX === 'auto' || getComputedStyle(w).overflowX === 'scroll',
            contained: w.clientWidth <= document.documentElement.clientWidth + 1};
  });
  ok(reg && reg.clipped, 'premortem: register table scroll is confined to .registerwrap (overflow-x)');
  ok(reg && reg.contained, 'premortem: .registerwrap fits within the viewport width');
  // Stage 2: the FAB board's three columns must STACK on a phone (narrow relayout,
  // not pan). Switch to the board face, add cards, assert single-column + no h-scroll.
  await page.click('[data-view="board"]'); await page.waitForTimeout(150);
  await page.fill('[data-add-kind="assumption"]', 'Users grant push permission');
  await page.press('[data-add-kind="assumption"]', 'Enter'); await page.waitForTimeout(120);
  await page.fill('[data-add-kind="fact"]', 'iOS is 70% of installs');
  await page.press('[data-add-kind="fact"]', 'Enter'); await page.waitForTimeout(120);
  const board = await page.evaluate(() => {
    const b = document.querySelector('.board');
    const cols = getComputedStyle(b).gridTemplateColumns.split(' ').filter(Boolean).length;
    return {oneCol: cols === 1, docSW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth};
  });
  ok(board.oneCol, 'premortem: FAB board stacks to one column on a phone (narrow relayout)');
  ok(board.docSW <= board.vw + 1, `premortem: board face — no page-level h-scroll (${board.docSW} <= ${board.vw})`);
  await page.close();
  await pctx.close();
}

// WIDENED cardmenu gate: on phone width, every non-ghost card exposes a
// data-hit tap rect at least 44px on its long axis, and no two tap rects
// intersect — a thumb must be able to land on exactly one card. Measures
// [data-hit] (the tap target), NOT the [data-edit] group bbox — the map
// group's bbox unions its leader line, which would mask a too-small hit rect.
const WIDENED = [['roadmap', T + '/roadmap/', 'Habit app roadmap'],
                 ['map', T + '/map/', 'Assumption map'],
                 ['why', T + '/why/', 'Habit retention'],
                 ['tree', T + '/tree/', 'Bid or no bid'],
                 ['bets', T + '/bets/', 'Habitat portfolio']];

for(const [name, url, chip] of WIDENED){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(400);
  const b = page.getByRole('button', {name: chip});
  if(await b.count()) await b.click();
  await page.waitForTimeout(600);
  const {hits, cards} = await page.evaluate(() => ({
    hits: [...document.querySelectorAll('#preview svg [data-hit]')]
      .map(el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; }),
    cards: document.querySelectorAll('#preview svg [data-edit^="cardmenu"]').length,
  }));
  ok(cards > 0, `${name}: cards carry a cardmenu target`);
  ok(hits.length >= cards, `${name}: every cardmenu card has a data-hit tap rect`);
  ok(hits.every(r => Math.max(r.w, r.h) >= 44), `${name}: every card tap rect long-axis >= 44px`);
  const overlap = hits.some((a, i) => hits.some((b2, j) => j > i &&
    a.x < b2.x + b2.w && b2.x < a.x + a.w && a.y < b2.y + b2.h && b2.y < a.y + a.h));
  ok(!overlap, `${name}: no two card tap rects intersect`);
  await page.close();
}

// tree B4 — coarse-pointer priced-insistence entry (Fable I-4 replaced the
// per-number 44px hit-rect assertion with these). On a coarse pointer a hot
// number's own tspan doesn't open the slider directly — edit-in-place.js
// redirects the tap to the node's own card-menu marker ([data-menu]), whose
// menu (B3's exploreRowsFor) carries an "Explore…" row that binds the ONE
// persistent slider. This walks that whole path on a deliberately TALL tree
// (6 near-identical options ⇒ every branch sits on a knife-edge, so several
// numbers are load-bearing and the topmost one sits many rows above the
// fold) — proving B4's sticky bottom bar, not the old in-flow placement,
// is what keeps the slider on screen: "below the tree" would otherwise land
// the bar hundreds of px past the bottom of an 844px-tall phone viewport.
{
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const doc = 'title: Six-way pick\n\nRoot decision\n' + letters.map(x =>
    `  Option ${x}: -10k\n    Chance ${x}\n      Win ${x} (p=0.4-0.6): 100k to 200k\n      Lose ${x} (p=rest): 0\n`
  ).join('');
  const hash = Buffer.from(JSON.stringify({t: doc})).toString('base64');
  const page = await ctx.newPage();
  await page.goto(T + '/tree/#' + hash, {waitUntil: 'networkidle'}).catch(() => {});
  await page.waitForTimeout(1000);

  const top = await page.evaluate(() => {
    const hots = [...document.querySelectorAll('#preview svg [data-hot]')];
    if(!hots.length) return null;
    let best = null, bestTop = Infinity;
    for(const el of hots){
      const r = el.getBoundingClientRect();
      if(r.top < bestTop){ bestTop = r.top; best = {line: el.dataset.line, kind: el.dataset.edit}; }
    }
    return best;
  });
  ok(top !== null, 'tree: the tall 6-option fixture renders at least one load-bearing (hot) number');

  if(top){
    const marker = page.locator(`#preview svg [data-menu][data-line="${top.line}"]`);
    ok(await marker.count() === 1,
      `tree: the topmost hot number's own node carries exactly one card-menu marker (line ${top.line})`);
    await marker.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await marker.locator('[data-hit]').boundingBox();
    if(box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);

    const rowTexts = await page.locator('.eip-pop button').allInnerTexts();
    const exploreRows = rowTexts.filter(t => t.startsWith('Explore'));
    ok(exploreRows.length >= 1,
      `tree: the marker's card menu carries an "Explore…" row (${JSON.stringify(rowTexts)})`);

    if(exploreRows.length){
      await page.locator('.eip-pop button', {hasText: exploreRows[0]}).click();
      await page.waitForTimeout(300);

      ok(await page.locator('#explorebar').isVisible(),
        'tree: #explorebar un-hides after the coarse-pointer card-menu Explore… row');

      const geom = await page.evaluate(() => {
        const bar = document.getElementById('explorebar');
        const range = document.getElementById('exploreRange');
        const close = document.getElementById('exploreClose');
        const b = bar.getBoundingClientRect(), rr = range.getBoundingClientRect(), cr = close.getBoundingClientRect();
        return {
          top: b.top, bottom: b.bottom, left: b.left, right: b.right,
          vw: document.documentElement.clientWidth, vh: window.innerHeight,
          min: range.min, max: range.max,
          rangeH: rr.height, rangeW: rr.width, closeH: cr.height, closeW: cr.width,
        };
      });
      ok(geom.top >= -1 && geom.bottom <= geom.vh + 1 && geom.left >= -1 && geom.right <= geom.vw + 1,
        `tree: #explorebar sits fully inside the layout viewport after tapping the TOPMOST hot number on a tall ` +
        `tree (bar top ${geom.top.toFixed(0)}, bottom ${geom.bottom.toFixed(0)} vs viewport height ${geom.vh}) — ` +
        `the sticky bottom bar, not the old off-screen in-flow placement`);
      ok(geom.min !== '' && geom.max !== '' && geom.min !== geom.max,
        `tree: #exploreRange was bound with a real min/max track (${geom.min}..${geom.max})`);
      ok(geom.rangeH >= 44, `tree: the slider thumb/track is >=44px tall on a coarse pointer (${geom.rangeH.toFixed(1)}px)`);
      ok(geom.closeH >= 44 && geom.closeW >= 44,
        `tree: .explore-close stays >=44px inside the sticky bar (${geom.closeW.toFixed(0)}x${geom.closeH.toFixed(0)})`);

      const vw = await page.evaluate(() => document.documentElement.clientWidth);
      const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
      ok(docSW <= vw + 1, `tree: no page-level horizontal scroll on the tall fixture with the explore bar shown (${docSW} <= ${vw})`);
    }
  }
  await page.close();
}

// roadmap coarse-pointer gate (Task 3): the drag affordance is a fine-pointer
// (mouse) feature only — on a phone it must NOT arm (it would fight the
// narrow stack's vertical swipe-to-scroll) and its CSS touch-action:none must
// not be applied here either. The "Move to…" card-menu row is the phone
// replacement, and it must still relocate a card across horizons.
{
  const page = await ctx.newPage();
  await page.goto(T + '/roadmap/', {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(400);
  const chip = page.getByRole('button', {name: 'Habit app roadmap'});
  if(await chip.count()) await chip.click();
  await page.waitForTimeout(600);

  // no touch-action block: style.css gates touch-action:none to
  // @media (pointer: fine), so a card group on this coarse-emulated context
  // keeps the default (scrollable) value instead.
  // The card is found by its TITLE: its srcLine belongs to the shipped example,
  // and hard-coding it made this suite break when that example gained a line.
  const cardLine = await page.locator('#preview svg g[data-edit="cardmenu"]')
    .filter({hasText: 'Streak freeze'}).first().getAttribute('data-line');
  const touchAction = await page.evaluate(line => {
    const g = document.querySelector('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"]');
    return g ? getComputedStyle(g).touchAction : null;
  }, cardLine);
  ok(touchAction !== null && touchAction !== 'none',
    `roadmap: card group keeps touch-action:${touchAction} on a coarse pointer (vertical scroll isn't blocked)`);

  // drag does not start on touch: app.js gates the drag pointerdown handler
  // on matchMedia('(pointer: fine)') — this whole context reports coarse
  // (devices['iPhone 13']), so a drag gesture over the card must produce no
  // ghost and leave the source text untouched, regardless of which Playwright
  // input API dispatches the events.
  const cardBody = page.locator('#preview svg g[data-edit="cardmenu"][data-line="' + cardLine + '"] rect[data-hit]');
  const cardBox = await cardBody.boundingBox();
  const beforeDrag = await page.evaluate(() => localStorage.getItem('roadmap-src'));
  await page.mouse.move(cardBox.x + 8, cardBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + 8, cardBox.y + 220, {steps: 8});
  const ghostDuring = await page.locator('.dragghost').count();
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterDrag = await page.evaluate(() => localStorage.getItem('roadmap-src'));
  ok(ghostDuring === 0, 'roadmap: a coarse-pointer drag gesture never shows the drag ghost');
  ok(beforeDrag === afterDrag, 'roadmap: a coarse-pointer drag gesture does not move the card');

  // Move to… still works: tap the card body (top-left padding sliver, not the
  // title text) → Move to… → a different horizon → the item relocates.
  await cardBody.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await cardBody.boundingBox();
  await page.mouse.click(box.x + 8, box.y + 4);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button', {hasText: 'Move to…'}).click();
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button', {hasText: 'Next'}).click();
  await page.waitForTimeout(600);
  const moved = await page.evaluate(() => localStorage.getItem('roadmap-src'));
  ok(moved.includes('Streak freeze') && moved.indexOf('Streak freeze') > moved.indexOf('NEXT') &&
    moved.indexOf('NEXT') > moved.indexOf('NOW'),
    'roadmap: Move to… relocates the card into a different horizon on a coarse pointer');
  await page.close();
}

// roadmap register phone fallback + the mobile-export exception (Task 8): on a
// phone-width `style: register` doc the preview falls back to the chart's narrow
// STACK — the register table can't fit a phone — but Download SVG still exports
// the REGISTER, because export is keyed off effectiveStyle, not the rendered
// preview (the whole point of routing exports through plainStyleSvg).
{
  const doc = 'title: Habitat — Product Roadmap\nstyle: register\nhorizons: Now, Next, Later\n\n' +
    'NOW\nCore: Streak freeze [doing] -- top-requested\nGrowth: Referral flow [risk]\n\n' +
    'NEXT\nCore: Smart reminders\n\nLATER\nCore: Accountability circles';
  const seed = {t: doc};
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(seed))), 'binary').toString('base64');
  // fresh context (explicit acceptDownloads) so the Download SVG blob is captured
  const rctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce', acceptDownloads: true});
  const page = await rctx.newPage();
  await page.goto(T + '/roadmap/#' + hash, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(700);

  // (1) FALLBACK: the preview is the chart's narrow STACK (g[data-line] cards),
  // NOT the live register (whose edit-mode drop bands are data-hdrop). A7: the
  // narrow chart emits no data-cell, so anchor on g[data-line] present +
  // [data-hdrop] absent (the live register would carry the bands; the stack won't).
  const fb = await page.evaluate(() => ({
    lines: document.querySelectorAll('#preview svg g[data-line]').length,
    hdrop: document.querySelectorAll('#preview svg [data-hdrop]').length,
  }));
  ok(fb.lines > 0, `roadmap: register on a phone falls back to the chart stack (${fb.lines} g[data-line] cards)`);
  ok(fb.hdrop === 0, 'roadmap: register phone fallback is the chart, not the live register (no data-hdrop bands)');
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `roadmap: register phone fallback — no page-level h-scroll (${docSW} <= ${vw})`);
  // the Register chip still reflects the RESOLVED style (syncStylePicker) even
  // though the preview shows the stack — the doc is still a register doc.
  const chipOn = await page.evaluate(() =>
    !!document.querySelector('#stylepicker [data-style="register"].on'));
  ok(chipOn, 'roadmap: Register chip stays active on a phone (the doc is still a register)');

  // (2) THE MOBILE-EXPORT EXCEPTION (Matt's explicit requirement): Download SVG
  // exports the REGISTER TABLE, not the chart the preview is showing. Read the
  // downloaded blob and assert the register header (ITEM/HORIZON) is present and
  // no data-cell (which would mean the chart leaked into the export).
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dlsvg'),
  ]);
  const svg = await readFile(await dl.path(), 'utf8');
  ok(svg.includes('>ITEM<') && svg.includes('>HORIZON<'),
    'roadmap: phone Download SVG exports the register table (ITEM/HORIZON header), not the stack');
  ok(!svg.includes('data-cell'),
    'roadmap: phone register export is the table, not the chart (no data-cell)');
  await page.close();
  await rctx.close();
}

// roadmap FOCUS phone fallback + the mobile-export exception: on a phone-width
// `style: focus` doc the preview falls back to the chart's narrow STACK (the
// hero+rail lens can't fit a phone), but Download SVG still exports the live
// FOCUS artefact — export is keyed off the explicit model.style, not the
// rendered preview (plainStyleSvg, viewport-independent).
{
  const doc = 'title: Habitat — Product Roadmap\nstyle: focus\nhorizons: Now, Next, Later\n\n' +
    'NOW\nCore: Streak freeze [doing] -- top-requested\nGrowth: Referral flow [risk]\n\n' +
    'NEXT\nCore: Smart reminders\n\nLATER\nCore: Accountability circles';
  const seed = {t: doc};
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(seed))), 'binary').toString('base64');
  const fctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce', acceptDownloads: true});
  const page = await fctx.newPage();
  await page.goto(T + '/roadmap/#' + hash, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(700);
  // FALLBACK: the chart's narrow stack (g[data-line] cards), NOT the live focus
  // lens (whose edit-mode markup is data-hdrop bands + data-lens headers).
  const fb = await page.evaluate(() => ({
    lines: document.querySelectorAll('#preview svg g[data-line]').length,
    hdrop: document.querySelectorAll('#preview svg [data-hdrop]').length,
    lens: document.querySelectorAll('#preview svg [data-lens]').length,
  }));
  ok(fb.lines > 0, `roadmap: focus on a phone falls back to the chart stack (${fb.lines} g[data-line] cards)`);
  ok(fb.hdrop === 0 && fb.lens === 0, 'roadmap: focus phone fallback is the chart, not the live lens (no data-hdrop/data-lens)');
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `roadmap: focus phone fallback — no page-level h-scroll (${docSW} <= ${vw})`);
  const chipOn = await page.evaluate(() => !!document.querySelector('#stylepicker [data-style="focus"].on'));
  ok(chipOn, 'roadmap: Focus chip stays active on a phone (the doc is still a focus doc)');
  // THE MOBILE-EXPORT EXCEPTION: Download SVG exports the live FOCUS artefact
  // (hero content), not the chart the preview shows — and carries no chart
  // data-cell and no edit markup (edit:false export path).
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlsvg')]);
  const svg = await readFile(await dl.path(), 'utf8');
  ok(svg.includes('Streak freeze') && !svg.includes('data-cell'),
    'roadmap: phone Download SVG exports the live focus artefact (hero content), not the chart stack');
  ok(!svg.includes('data-edit') && !svg.includes('data-hdrop'),
    'roadmap: phone focus export is the plain artefact (no edit markup)');
  await page.close();
  await fctx.close();
}

// why OST narrow relayout gate (Task 4): on phone width the OST view must be
// a single-column indented outline (cards clustered near the left margin),
// not the wide left-to-right box tree (cards spread across ~600px+). Card
// x-positions only vary by the clamped indent (depth<=3 * 16px + a little
// slack), so a small spread proves the stack, not the tree.
{
  const page = await ctx.newPage();
  await page.goto(T + '/why/', {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(400);
  const chip = page.getByRole('button', {name: 'Habit retention'});
  if(await chip.count()) await chip.click();
  await page.waitForTimeout(600);
  const stack = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('#preview svg rect[data-hit]')]
      .map(el => el.getBoundingClientRect());
    const xs = rects.map(r => r.x);
    return {count: rects.length, spread: rects.length ? Math.max(...xs) - Math.min(...xs) : 0};
  });
  ok(stack.count >= 3, `why: OST narrow renders multiple cards (${stack.count})`);
  ok(stack.spread <= 60,
    `why: OST narrow is a single-column indented stack, not the wide LTR tree (card x-spread ${stack.spread}px)`);
  await page.close();
}

// why deep-tree depth clamp (Task 4): a deliberately 5-level-deep opportunity
// chain (opportunities nest freely — only solution/assumption depth is
// warned) must not collapse to zero-width or blow out the page. Loaded via
// the hash-state boot path (the reliable way to seed an exact fixture,
// vs. fighting CodeMirror's literal-space indentation over keyboard.type).
{
  const deepDoc = 'title: Deep chain\noutcome: Grow retention\n  Users forget mid-afternoon habits\n' +
    '    Notifications feel spammy\n      Users mute after first week\n        Frequency too high\n' +
    '          Smart batching [testing]\n            ? batching preserves timing';
  const seed = {t: deepDoc, v: 'ost'};
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(seed))), 'binary').toString('base64');
  const page = await ctx.newPage();
  await page.goto(T + '/why/#' + hash, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(700);
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `why: deep-tree fixture — no page-level h-scroll (${docSW} <= ${vw})`);
  const deep = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('#preview svg rect[data-hit]')]
      .map(el => el.getBoundingClientRect());
    return {count: rects.length, minW: rects.length ? Math.min(...rects.map(r => r.width)) : 0,
      xs: [...new Set(rects.map(r => Math.round(r.x)))]};
  });
  ok(deep.count >= 6, `why: deep-tree fixture renders every depth as its own card (${deep.count})`);
  ok(deep.minW >= 100, `why: deep-tree fixture — even the deepest clamped card stays legible (min width ${Math.round(deep.minW)}px)`);
  // depths 3, 4 and 5 share ONE indent (the clamp) — so distinct x positions
  // should be 4 (depths 0,1,2, and the shared 3+ indent), not 6.
  ok(deep.xs.length === 4, `why: deep-tree fixture clamps depth>=3 to a single shared indent (${deep.xs.length} distinct x positions)`);
  await page.close();
}

// why map-view narrow outcome-band-heading gate (whole-branch review fix):
// roadmap's renderNarrow never read model.laneGroups, so a MULTI-outcome
// tree lost its outcome grouping entirely at phone width — every lane
// rendered as an identical muted sub-label with no heading tying it to an
// outcome. A two-outcome tree must show BOTH accent/serif band headings in
// the narrow map view; this assertion fails against the pre-fix renderer.
{
  const multiDoc = 'title: H2 product bets\noutcome: Improve 90-day retention\n  Users forget mid-afternoon habits\n' +
    '    Smart reminders [testing]\n      ? users want interruptions\noutcome: Grow referral revenue\n' +
    '  Sharing feels braggy\n    Private progress cards [delivering]\n      ? cards get shared [testing]\n' +
    '  No reason to invite others\n';
  const seed = {t: multiDoc, v: 'map'};
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(seed))), 'binary').toString('base64');
  const page = await ctx.newPage();
  await page.goto(T + '/why/#' + hash, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(700);
  const map = await page.locator('#preview svg').innerHTML();
  ok(map.includes('IMPROVE 90-DAY RETENTION'), 'why: narrow map view shows the first outcome band heading');
  ok(map.includes('GROW REFERRAL REVENUE'), 'why: narrow map view shows the second outcome band heading (multi-outcome grouping preserved at phone width)');
  await page.close();
}

// why: solution card-menu overflow reachability (coarse). "Smart reminders"
// (srcLine 5, the default "Habit retention" example) carries two assumptions,
// so its dynamic solutionMenu shows six rows — assert the LAST one (Remove
// branch) still renders reachable and clickable within the viewport (the
// .eip-pop max-height/overflow-y rule), and that the per-assumption
// sub-popover's status/remove buttons are all finger-size (>= 44px).
{
  const page = await ctx.newPage();
  await page.goto(T + '/why/', {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(400);
  const chip = page.getByRole('button', {name: 'Habit retention'});
  if(await chip.count()) await chip.click();
  await page.waitForTimeout(600);
  const cardBody = page.locator('#preview svg rect[data-edit^="cardmenu-solution"][data-line="5"][data-hit]');
  await cardBody.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box0 = await cardBody.boundingBox();
  await page.mouse.click(box0.x + 8, box0.y + 4);
  await page.waitForTimeout(300);

  const rowTexts = await page.locator('.eip-pop button').allInnerTexts();
  ok(rowTexts.length === 6, `why: solution menu shows base rows + one per assumption on phone (${rowTexts.length})`);

  const vw = await page.evaluate(() => window.innerWidth);
  const vh = await page.evaluate(() => window.innerHeight);
  const lastBox = await page.locator('.eip-pop button').last().boundingBox();
  ok(!!lastBox && lastBox.y >= 0 && lastBox.y + lastBox.height <= vh + 1,
    'why: last row (Remove branch) is vertically within the viewport (the overflow-y rule)');
  ok(!!lastBox && lastBox.x >= 0 && lastBox.x + lastBox.width <= vw + 1,
    'why: last row (Remove branch) is horizontally within the viewport');

  // sub-popover: tap an assumption row, check the four states + danger Remove render finger-size
  await page.locator('.eip-pop button', {hasText: 'users want to be interrupted at work'}).click();
  await page.waitForTimeout(300);
  const subHeights = await page.locator('.eip-pop button').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
  ok(subHeights.length === 5, `why: assumption sub-popover shows 4 states + Remove assumption on phone (${subHeights.length})`);
  ok(subHeights.every(h => h >= 44), `why: every sub-popover button is >= 44px tall (min ${subHeights.length ? Math.min(...subHeights) : 'n/a'})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // clickable: the last row actually commits and closes the popover on tap
  await page.mouse.click(box0.x + 8, box0.y + 4);
  await page.waitForTimeout(300);
  await page.locator('.eip-pop button', {hasText: 'Remove branch'}).click();
  await page.waitForTimeout(400);
  ok(await page.locator('.eip-pop').count() === 0, 'why: Remove branch row is clickable and closes the popover');
  await page.close();
}

await browser.close();
report('mobile', {pass, fail, min: ALL.length * 3});   // ≥3 checks/tool; catches a crash or empty derived list
