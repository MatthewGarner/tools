/* Mobile foundations gate: phone-width first-run behaviour for in-scope tools.
   Run from dev/pw with both servers up (:8087 tools, :8089 energy), or point
   BASE/EBASE at other servers — same env-knob convention as the sibling suites. */
import {chromium, devices} from 'playwright';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from '../tool-dirs.mjs';

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
  'gauge', 'timeline']);
const AUTOLOAD = ALL.filter(([n]) => AUTOLOAD_NAMES.has(n));

let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});

for(const [name, url] of ALL){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
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
      h1: h1 ? getComputedStyle(h1).fontFamily.includes('Charter') : true,
    };
  });
  ok(parity.font, `${name}: body wears the system font stack`);
  ok(parity.bg, `${name}: body background is the token --bg`);
  ok(parity.h1, `${name}: h1 wears Charter`);
  await page.close();
}

for(const [name, url] of AUTOLOAD){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(1000);
  const hash = await page.evaluate(() => location.hash);
  const hasOutput = await page.evaluate(() =>
    !!document.querySelector('.stage svg, .preview svg, #chartwrap svg, main svg'));
  ok(hasOutput, `${name}: renders a default example on phone first-run`);
  ok(hash === '', `${name}: URL not polluted by auto-load (hash="${hash}")`);
  await page.close();
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
  ['why', T + '/why/', ['#preview']],
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
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
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
  const touchAction = await page.evaluate(() => {
    const g = document.querySelector('#preview svg g[data-edit="cardmenu"][data-line="4"]');
    return g ? getComputedStyle(g).touchAction : null;
  });
  ok(touchAction !== null && touchAction !== 'none',
    `roadmap: card group keeps touch-action:${touchAction} on a coarse pointer (vertical scroll isn't blocked)`);

  // drag does not start on touch: app.js gates the drag pointerdown handler
  // on matchMedia('(pointer: fine)') — this whole context reports coarse
  // (devices['iPhone 13']), so a drag gesture over the card must produce no
  // ghost and leave the source text untouched, regardless of which Playwright
  // input API dispatches the events.
  const cardBody = page.locator('#preview svg g[data-edit="cardmenu"][data-line="4"] rect[data-hit]');
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
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
