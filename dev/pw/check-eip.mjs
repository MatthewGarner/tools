/* Edit-in-place browser checks (tree). */
import {chromium, devices} from 'playwright';
import {readFileSync} from 'node:fs';
import {decodeHash} from '../../assets/series.js';
import {trackErrors, report, tally, until, untilValue} from './_harness.mjs';
const BASE = (process.env.BASE || 'http://localhost:8087') + '/tree/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
const errors = trackErrors(page);
const results = [];
const check = (name, ok) => {
  const result = (ok ? 'PASS ' : 'FAIL ') + name;
  results.push(result);
  if(!ok) console.error(result); // keep actionable failures visible in long CI logs
};

/* ONE undo, waited for by condition rather than by 500ms — 2026-08-18.

   Eleven blocks defined this same three-line shape and 67 call sites each paid a
   flat half-second for it, which is ~34s of the suite that caps every parallel run.

   The wait is "the doc has LEFT the state the edit put it in", never "the doc has
   arrived at the baseline": arrival is exactly what the check() after every call
   asserts, so polling for it would be polling the assertion. An undo writes the
   whole document in one setItem, so there is no intermediate value to catch — the
   write this poll observes IS the write the assertion then reads.

   A stuck undo therefore costs 4s and fails the caller's own check by name, rather
   than passing on a doc that never moved. */
/* One shape for the thirteen copies this replaced. The dedup was worth having; the
   SPEEDUP that came with it was not, and is withdrawn here.

   The trailing 500ms is NOT a settle and must never be converted to a poll: it is
   CodeMirror's newGroupDelay boundary. Without it the next edit merges into the
   undo's history group, so a LATER single undo pops more than the test expects and
   lands somewhere other than the baseline it compares against. Replacing it with
   `untilValue(v => v !== was)` returns after the ~120ms write debounce — four times
   too early — which passed locally twice AND passed a full 13-suite gate, then
   failed on CI: `bets: Escape on the kill default-insert restores the exact
   baseline`, 597 PASS / 1 FAIL, run 32203358738. Slower hardware widened the window.
   check-eip is the one suite neither the author nor the review re-ran, and this is
   what was hiding in it. Cost of honesty: ~190s → ~212s.

   There is NO storage poll here, and adding one is the second thing CI rejected.
   The review suggested reading a `was` baseline after the click as a free hardening;
   it is not free. Any await between the .cm-content click and Ctrl+Z is a page
   round-trip, and that click can commit an open edit-in-place input — give the
   commit time to land and Ctrl+Z pops the BLUR-COMMIT instead of the edit under
   test. Fast and serial, the round-trip is too quick to matter; loaded or on CI it
   is not. Measured: with the poll, `bets: Escape on the kill default-insert restores
   the exact baseline` failed on CI (isolated shard) and on both local 3-lane runs,
   while main passed 598/0 under the identical load. Without it, this helper is
   behaviourally identical to the thirteen copies it replaced — a pure dedup, which
   is all it was ever worth. */
async function undoStep(pg, focus){
  const focused = focus && await focus();
  if(!focused) await pg.locator('.cm-content').click();
  await pg.keyboard.press('ControlOrMeta+z');
  await pg.waitForTimeout(500);
}

/* Roadmap deliberately folds its source while the reading surface has room to
   breathe. Tests that return to source must use the same visible control as an
   author, rather than force a click on an intentionally hidden editor. */
async function focusRoadmapSource(pg){
  const source = pg.locator('.cm-content');
  if(!(await source.isVisible())){
    await pg.locator('#railtab').click();
    await source.waitFor({state: 'visible'});
  }
  await source.click({force:true});
  return true;
}

/* Card titles can wrap in the final layouts, so their rendered text is not a
   stable selector. `data-raw` is the authored identity exposed for the edit
   target; use it to find the card independently of its line breaks. */
const roadmapCard = (pg, title) => pg.locator(
  '#preview svg g[data-edit="cardmenu"]:has([data-edit="title"][data-raw="' + title + '"])').first();

/* Mobile-emulated contexts: locator.click() scrolls-then-clicks as one step, and a
   trailing scroll-settle event can still land AFTER the click dispatches — racing
   edit-in-place's own scroll-closes-the-popover guard shut before we ever act on it.
   Scrolling first and waiting it out, then clicking raw coordinates, avoids the race
   (real touches never fight their own just-finished scroll this way). */
async function settledTap(page, loc){
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await loc.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return box;
}

/* Tap a point inside `box` that really belongs to the card-menu target.
   Was a fixed +8/+4 "top-left padding sliver", which is a CLIENT-pixel offset —
   so it silently changed meaning the moment the artefact's fit-scale changed
   (Swiss 6b's metrics row shortened the stage, the SVG fitted smaller, and 8
   client px reached past the padding onto the nested rename target). Scan a few
   candidate points instead and take the first whose top element still resolves
   to the cardmenu — scale-independent, and it fails loudly if none does. */
async function tapCardMenu(p, box, line = null){
  const pts = [[4, 3], [8, 4], [3, 2], [box.width - 6, 4], [box.width / 2, 3]];
  for(const [dx, dy] of pts){
    const x = box.x + dx, y = box.y + dy;
    const onMenu = await p.evaluate(([x, y, line]) => {
      const el = document.elementFromPoint(x, y);
      const g = el && el.closest('[data-edit^="cardmenu"]');
      const own = el && el.closest('[data-edit]');
      if(!g || own !== g) return false;
      return line == null || g.getAttribute('data-line') === String(line);
    }, [x, y, line]);
    if(onMenu){ await p.mouse.click(x, y); return; }
  }
  throw new Error('tapCardMenu: no point inside the card resolved to the cardmenu target (line ' + line + ')');
}


await page.goto(BASE, {waitUntil: 'networkidle'});
await page.getByRole('button', {name: 'Bid or no bid'}).click();
await page.waitForTimeout(500);
const before = await page.evaluate(() => localStorage.getItem('tree-src'));
const rec0 = (await page.locator('#preview svg').innerHTML()).includes('Submit bid');

/* B3 (I-7): Win's own probability is now a HOT (load-bearing) number — the priced-insistence
   walk supersedes this popover on it (a tap binds the slider instead, checked below). So the
   plain edit-in-place popover flows below now target Lose's probability ("p=rest"), which
   loadBearing() never marks hot (a "rest" share is never a real, draggable range) — a stable,
   always-non-hot target regardless of which numbers happen to be load-bearing in this fixture. */
await page.locator('[data-edit="prob"][data-raw="rest"]').first().click();
check('overlay opens prefilled', await until(async () => (await page.locator('.eip-input').inputValue() === 'rest')));
await page.locator('.eip-input').fill('0.5');
await page.keyboard.press('Enter');
const after = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    after => (after.includes('(p=0.5)') && !after.includes('(p=rest)')));
check('editor text updated', after.includes('(p=0.5)') && !after.includes('(p=rest)'));
const svg = await page.locator('#preview svg').innerHTML();
check('recommendation recomputes (Submit bid still leads on these numbers)',
  svg.includes('VERDICT') && /VERDICT[\s\S]{0,400}Choose Submit bid/.test(svg));
check('one undo reverts the edit', await (async () => {
  await undoStep(page);
  return (await page.evaluate(() => localStorage.getItem('tree-src'))) === before;
})());

// invalid input shakes and stays open
await page.locator('[data-edit="prob"][data-raw="rest"]').first().click();
await page.locator('.eip-input').fill('7');
await page.keyboard.press('Enter');
check('invalid input stays open with .invalid', await until(async () => (await page.locator('.eip-input.invalid').count() === 1)));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('escape closes', await page.locator('.eip-input').count() === 0);

// B3 (I-2): a HOT number's tap supersedes the popover entirely — it binds the persistent
// slider instead, never a second overlay.
await page.locator('[data-edit="prob"][data-hot]').first().click();
await page.waitForTimeout(200);
check('tree: a hot number does not open the text popover',
  await page.locator('.eip-input').count() === 0 && await page.locator('.eip-pop').count() === 0);
check('tree: a hot number binds the persistent slider instead', await page.locator('#explorebar').isVisible());

// label edit
await page.locator('[data-edit="label"]', {hasText: 'No bid'}).click();
await page.locator('.eip-input').fill('Walk away');
await page.keyboard.press('Enter');
check('label rename lands in text and diagram', await until(async () => ((await page.evaluate(() => localStorage.getItem('tree-src'))).includes('Walk away') &&
  (await page.locator('#preview svg').innerHTML()).includes('Walk away'))));

/* card menu: tap a node marker (the invisible >=44px data-hit rect, not the
   ~7px visible mark) → menu → Rename/Edit value or probability/Add/Remove
   each commit a real source change, one undo apiece; a node tap opens the
   NEW menu, not the old node-<kind> add/remove-only popover (superseded, no
   longer emitted at all). "Submit bid" (decision, srcLine 4) carries a
   value; "Outcome" (chance, srcLine 5) carries neither a value of its own
   nor an incoming probability — its own PARENT ("Submit bid") is
   decision-kind, so there is nothing for a p= annotation to mean on this
   node's own line (parse.js only assigns p to children of a chance parent),
   and its "Edit probability…" row is OMITTED outright (the unset-edit fix
   batch, Part 2 — an honest omission, not a dead click); its Rename/Add/
   Remove are still live. "Win" (leaf, srcLine 6) carries both a probability
   and a value on its own line — every row is live. Each action gets its own
   round trip: commit, assert, ONE Meta+z, assert full revert to the
   pre-menu baseline before the next action starts clean. */
{
  check('tree: the old node-<kind> popover target is gone',
    (await page.evaluate(() => document.querySelectorAll('#preview svg [data-edit^="node-"]').length)) === 0);

  const marker = line => page.locator('#preview svg g[data-edit^="cardmenu-"][data-line="' + line + '"] rect[data-hit]');
  const tapMarker = async line => {
    const box = await marker(line).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  const t0 = await page.evaluate(() => localStorage.getItem('tree-src'));
  const undo = () => undoStep(page);

  // decision node ("Submit bid", srcLine 4): Rename, Edit value, Add option, Remove branch
  await tapMarker(4);
  check('tree: decision marker tap opens the menu with the expected rows', await until(async () => ((await page.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit value…|Explore payoff…|＋ Add option|Remove branch')));

  await page.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('tree: decision menu Rename opens the label input prefilled', await until(async () => (await page.locator('.eip-input').inputValue() === 'Submit bid')));
  await page.locator('.eip-input').fill('Place bid');
  await page.keyboard.press('Enter');
  const tRename = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tRename => (tRename.includes('Place bid: -150k') && !tRename.includes('Submit bid: -150k')));
  check('tree: decision menu Rename commits the new label', tRename.includes('Place bid: -150k') && !tRename.includes('Submit bid: -150k'));
  await undo();
  check('tree: one undo restores the pre-rename baseline (decision)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(4);
  await page.locator('.eip-pop button', {hasText: 'Edit value…'}).click();
  check('tree: decision menu Edit value opens the value input prefilled', await until(async () => (await page.locator('.eip-input').inputValue() === '-150k')));
  await page.locator('.eip-input').fill('-200k');
  await page.keyboard.press('Enter');
  const tValue = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tValue => (tValue.includes('Submit bid: -200k')));
  check('tree: decision menu Edit value commits the new value', tValue.includes('Submit bid: -200k'));
  await undo();
  check('tree: one undo restores the pre-value baseline (decision)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(4);
  await page.locator('.eip-pop button', {hasText: 'Add option'}).click();
  const tAdd = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tAdd => (tAdd.includes('New option: 0')));
  check('tree: decision menu Add option inserts a new option line', tAdd.includes('New option: 0'));
  await undo();
  check('tree: one undo restores the pre-add baseline (decision)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(4);
  await page.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await page.waitForTimeout(600);
  const tDecRemove = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: decision menu Remove branch drops the option and its whole subtree',
    !tDecRemove.includes('Submit bid') && !tDecRemove.includes('Outcome') && !tDecRemove.includes('Win (p='));
  await undo();
  check('tree: one undo restores the removed option (decision)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  // chance node ("Outcome", srcLine 5): its own PARENT ("Submit bid") is
  // decision-kind, so "Edit probability…" is omitted outright (Part 2, the
  // unset-edit fix batch) — Rename and Remove branch still work.
  await tapMarker(5);
  check('tree: chance marker tap opens the menu WITHOUT Edit probability… (its parent is decision-kind, not chance)', await until(async () => ((await page.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|＋ Add outcome|Remove branch')));

  await page.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('tree: chance menu Rename opens the label input prefilled', await until(async () => (await page.locator('.eip-input').inputValue() === 'Outcome')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await tapMarker(5);
  await page.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await page.waitForTimeout(600);
  const tChanceRemove = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: chance menu Remove branch drops the whole subtree', !tChanceRemove.includes('Win') && !tChanceRemove.includes('Lose'));
  await undo();
  check('tree: one undo restores the removed subtree (chance)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  // leaf node ("Win", srcLine 6): Rename, Edit value, Add outcome, Remove — every row live
  await tapMarker(6);
  check('tree: leaf marker tap opens the menu with the expected rows', await until(async () => ((await page.locator('.eip-pop button').allInnerTexts()).join('|') ===
      'Rename…|Edit value…|Edit probability…|Explore success odds…|Explore payoff…|＋ Add outcome|Remove')));

  await page.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('tree: leaf menu Rename opens the label input prefilled', await until(async () => (await page.locator('.eip-input').inputValue() === 'Win')));
  await page.locator('.eip-input').fill('Won');
  await page.keyboard.press('Enter');
  const tLeafRename = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tLeafRename => (tLeafRename.includes('Won (p=0.3-0.45)') && !tLeafRename.includes('Win (p=0.3-0.45)')));
  check('tree: leaf menu Rename commits the new label', tLeafRename.includes('Won (p=0.3-0.45)') && !tLeafRename.includes('Win (p=0.3-0.45)'));
  await undo();
  check('tree: one undo restores the pre-rename baseline (leaf)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(6);
  await page.locator('.eip-pop button', {hasText: 'Edit value…'}).click();
  check('tree: leaf menu Edit value opens the value input prefilled', await until(async () => (await page.locator('.eip-input').inputValue() === '2M to 5M')));
  await page.locator('.eip-input').fill('3M to 6M');
  await page.keyboard.press('Enter');
  const tLeafValue = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tLeafValue => (tLeafValue.includes('Win (p=0.3-0.45): 3M to 6M')));
  check('tree: leaf menu Edit value commits the new value', tLeafValue.includes('Win (p=0.3-0.45): 3M to 6M'));
  await undo();
  check('tree: one undo restores the pre-value baseline (leaf)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(6);
  await page.locator('.eip-pop button', {hasText: 'Add outcome'}).click();
  const tLeafAdd = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tLeafAdd => (tLeafAdd.includes('New outcome')));
  check('tree: leaf menu Add outcome grows a first child under the leaf', tLeafAdd.includes('New outcome'));
  await undo();
  check('tree: one undo restores the pre-add baseline (leaf)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(6);
  await page.locator('.eip-pop button.danger', {hasText: 'Remove'}).click();
  await page.waitForTimeout(600);
  const tLeafRemove = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: leaf menu Remove drops the node', !tLeafRemove.includes('Win (p=0.3-0.45)'));
  await undo();
  check('tree: one undo restores the removed leaf', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  /* regression: the >=44px marker hit rect must NOT swallow this node's own
     short label/value/prob text. drawEdge places the label/value/prob band
     just above-left of the marker; a box centred on the marker stole the tap
     for a bare "0" value (Lose srcLine 7, No bid srcLine 8), so the direct
     field editor never opened. Assert elementFromPoint at each field centre
     resolves to the FIELD, not the cardmenu hit rect — the geometry the bug
     turned on — then that tapping it opens the input, not the menu. */
  for(const line of [7, 8]){
    const hit = await page.evaluate(l => {
      const t = document.querySelector('#preview svg [data-edit="value"][data-line="' + l + '"]');
      if(!t) return 'no-tspan';
      const r = t.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const e = el && el.closest('[data-edit]');
      return e ? e.getAttribute('data-edit') : 'none';
    }, line);
    check('tree: bare "0" value at line ' + line + ' is directly tappable (marker hit rect does not steal it)', hit === 'value');
  }
  {
    const box = await page.locator('#preview svg [data-edit="value"][data-line="8"]').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    check('tree: tapping the bare "0" value binds the persistent slider (it is load-bearing), not the value editor', await until(async () => (await page.locator('.eip-pop').count() === 0 && await page.locator('.eip-input').count() === 0 &&
      await page.locator('#explorebar').isVisible())));
    check('tree: the bound slider carries a real min/max track for this value', await page.evaluate(() => {
      const r = document.getElementById('exploreRange');
      return isFinite(parseFloat(r.min)) && isFinite(parseFloat(r.max)) && parseFloat(r.max) > parseFloat(r.min);
    }));
    await page.locator('#exploreClose').click();
    await page.waitForTimeout(150);
    check('tree: closing the slider hides the explore bar', !(await page.locator('#explorebar').isVisible()));
  }

  /* root node ("Bid decision", srcLine 3 — a DECISION root here): the explicit
     root's card menu is reduced to Add-only — no Rename/Edit/Remove. Remove is
     the whole-tree-deletion hazard (the root IS the tree); Rename/Edit were
     dead rows (the root marker has no incoming edge, so no label/value/prob
     tspan exists for it). The root's ＋ Add is the only way to add a top-level
     node anywhere in the tool, so Add must still work exactly as before. The
     label's noun tracks the root's kind (decision → option, chance/leaf →
     outcome), matching what childLineFor actually inserts. */
  await tapMarker(3);
  check('tree: decision-root marker tap opens an Add-only menu (exactly "＋ Add option", no Rename/Edit/Remove)', await until(async () => ((await page.locator('.eip-pop button').allInnerTexts()).join('|') === '＋ Add option')));
  check('tree: root menu offers no Remove (whole-tree deletion hazard closed)',
    await page.locator('.eip-pop button.danger').count() === 0);

  await page.locator('.eip-pop button', {hasText: 'Add option'}).click();
  const tRootAdd = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tRootAdd => (tRootAdd === t0 + '\n  New option: 0'));
  check('tree: decision-root menu Add option appends a new top-level option after the whole subtree',
    tRootAdd === t0 + '\n  New option: 0');
  await undo();
  check('tree: one undo restores the pre-add baseline (decision root)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  // a non-root node still gets its full menu — the root change is scoped to the root only
  await tapMarker(4);
  check('tree: a non-root (decision) marker still opens its full unchanged menu', await until(async () => ((await page.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit value…|Explore payoff…|＋ Add option|Remove branch')));
  await page.keyboard.press('Escape');

  /* non-decision root: a FRESH single-line root ("Just a number: 5") parses as
     LEAF-kind — this is the primary mobile build-a-tree starting point. Its
     Add row must read "＋ Add outcome" (NOT "option"), because childLineFor on
     a leaf/chance root inserts "New outcome (p=…)"; the label must match the
     insertion. Rewrite the whole editor to that one line, then round-trip. */
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('Just a number: 5');
  const tLeafRoot = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    async tLeafRoot => (tLeafRoot === 'Just a number: 5' &&
    (await page.locator('#preview svg g[data-edit="cardmenu-root-leaf"][data-line="0"]').count()) === 1));
  check('tree: fresh single-line root really is a leaf-kind root at line 0',
    tLeafRoot === 'Just a number: 5' &&
    (await page.locator('#preview svg g[data-edit="cardmenu-root-leaf"][data-line="0"]').count()) === 1);

  await tapMarker(0);
  check('tree: leaf-root marker tap opens an Add-only menu reading exactly "＋ Add outcome" (not "option")', await until(async () => ((await page.locator('.eip-pop button').allInnerTexts()).join('|') === '＋ Add outcome')));
  check('tree: leaf-root menu offers no Remove',
    await page.locator('.eip-pop button.danger').count() === 0);

  await page.locator('.eip-pop button', {hasText: 'Add outcome'}).click();
  const tLeafRootAdd = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tLeafRootAdd => (tLeafRootAdd === tLeafRoot + '\n  New outcome (p=rest): 0'));
  check('tree: leaf-root menu Add outcome inserts an OUTCOME line (label matches insertion)',
    tLeafRootAdd === tLeafRoot + '\n  New outcome (p=rest): 0');
  await undo();
  check('tree: one undo restores the pre-add baseline (leaf root)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === tLeafRoot);

  /* two-undo add+rename sequence (mirrors why's own coverage): rename the
     fresh label after Add outcome, then two undos restore the exact pre-add
     baseline — proves the insert lands as its own isolated undo group even
     when a rename follows it immediately (wave 2A: insertAndSelect now tags
     its dispatch so it can never merge into a preceding edit). */
  await tapMarker(0);
  await page.locator('.eip-pop button', {hasText: 'Add outcome'}).click();
  check('tree: Add outcome opens the fresh inline label field, prefilled', await until(async () => ((await page.locator('.eip-input').inputValue()).includes('New outcome'))));
  await page.locator('.eip-input').fill('Renamed outcome');
  await page.keyboard.press('Enter');
  check('tree: Enter commits the renamed outcome label', await until(async () => ((await page.evaluate(() => localStorage.getItem('tree-src'))).includes('Renamed outcome'))));
  await undo();
  await undo();
  check('tree: two undo steps restore the pre-add baseline (leaf root, rename then creation)',
    (await page.evaluate(() => localStorage.getItem('tree-src'))) === tLeafRoot);

  /* IMPLICIT root: two top-level lines that carry (p=…) parse (zero warnings)
     to a synthetic wrapper of kind='chance' at line -1. It DISPLAYS as chance,
     but childLineFor(-1) is kind-blind and always inserts a top-level
     "New option: 0" — so the label must be pinned to "＋ Add option", not the
     "outcome" the chance kind would otherwise imply. This is the case the
     explicit-leaf test missed. */
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('Option A (p=0.5): 10\nOption B (p=rest): 20');
  const tImplicit = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    async tImplicit => (tImplicit === 'Option A (p=0.5): 10\nOption B (p=rest): 20' &&
    (await page.locator('#preview svg g[data-edit="cardmenu-root-decision"][data-line="-1"]').count()) === 1));
  check('tree: two (p=…) tops parse to an implicit chance root, but its menu kind is pinned to root-decision at line -1',
    tImplicit === 'Option A (p=0.5): 10\nOption B (p=rest): 20' &&
    (await page.locator('#preview svg g[data-edit="cardmenu-root-decision"][data-line="-1"]').count()) === 1);

  await tapMarker(-1);
  check('tree: implicit-root marker tap opens an Add-only menu reading exactly "＋ Add option" (NOT outcome, despite the chance kind)', await until(async () => ((await page.locator('.eip-pop button').allInnerTexts()).join('|') === '＋ Add option')));
  check('tree: implicit-root menu offers no Remove',
    await page.locator('.eip-pop button.danger').count() === 0);

  await page.locator('.eip-pop button', {hasText: 'Add option'}).click();
  const tImplicitAdd = await untilValue(() => page.evaluate(() => localStorage.getItem('tree-src')),
    tImplicitAdd => (tImplicitAdd === tImplicit + '\nNew option: 0'));
  check('tree: implicit-root menu Add option inserts an OPTION line (label matches childLineFor(-1) insertion)',
    tImplicitAdd === tImplicit + '\nNew option: 0');
  await undo();
  check('tree: one undo restores the pre-add baseline (implicit root)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === tImplicit);
}

check('no console/page errors', errors.length === 0);

/* ---- tree: cardmenu-decision "Edit value…" on a node with NO value yet
   (the unset-edit fix batch, Part 2) — a decision node's own line carries no
   trailing money amount when every branching happens further down the tree.
   render.js emits no inline data-edit="value" target at all in that case, so
   the row must fall back to opening the same interaction anchored at the
   card-menu trigger (assets/edit-in-place.js's opens-row fallback, Part 1),
   landing in a fresh empty input rather than doing nothing. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('Root\n  Branch A\n    Sub1: 10\n    Sub2: 20\n  Branch B: 5');
  await p.waitForTimeout(700);
  const before = await p.evaluate(() => localStorage.getItem('tree-src'));
  // "Branch A" is srcLine 1 by construction (line 0 is the root) — the
  // card-menu <g> itself carries no label text (unlike roadmap's single-
  // group card markup), so tree tests key off the known line, same idiom
  // as tapMarker above.
  const line = 1;
  check('tree: "Branch A" has no inline value target (no value authored yet)',
    (await p.locator('#preview svg [data-edit="value"][data-line="' + line + '"]').count()) === 0);

  const box = await p.locator('#preview svg g[data-edit^="cardmenu-"][data-line="' + line + '"] rect[data-hit]').boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await p.locator('.eip-pop button', {hasText: 'Edit value…'}).click();
  check('tree: Edit value… on a valueless decision node opens an EMPTY input (not silence)', await until(async () => (await p.locator('.eip-input').count() === 1 && await p.locator('.eip-input').inputValue() === '')));
  await p.locator('.eip-input').fill('8k');
  await p.keyboard.press('Enter');
  const after = await untilValue(() => p.evaluate(() => localStorage.getItem('tree-src')),
    after => (after.includes('Branch A: 8k') && !after.includes('Branch B: 8k')));
  check('tree: commit appends the value annotation, keeping the rest of the line intact',
    after.includes('Branch A: 8k') && !after.includes('Branch B: 8k'));
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  check('tree: one undo reverts the value-set edit', await until(async () => ((await p.evaluate(() => localStorage.getItem('tree-src'))) === before)));
  check('tree valueless-decision: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- tree: prob set-when-unset through the NORMAL INLINE target, not the
   fallback (review pass, unset-edit fix batch) — a chance parent with two or
   more children lacking p= gets each one defaulted to p={0,0} WITH A WARNING
   (parse.js's finalise()): a real, editable p but no "(p=...)" text on the
   line yet, so the rendered target's own data-raw is already "" — no missing
   target here, the fallback never engages. The sibling under test carries a
   colon INSIDE ITS LABEL ("Note: sub label") specifically to lock the P1 fix
   (applies.prob must anchor on the true value colon, not the label's own). ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('Chance\n  A (p=0.4): 10\n  Note: sub label: 20\n  B: 30');
  await p.waitForTimeout(700);
  const before = await p.evaluate(() => localStorage.getItem('tree-src'));

  // srcLine 2 = "  Note: sub label: 20" — real p (defaulted 0), no annotation yet
  check('tree: the parse-defaulted sibling already carries an inline prob target with an empty raw',
    await p.locator('#preview svg [data-edit="prob"][data-line="2"][data-raw=""]').count() === 1);
  await p.locator('#preview svg [data-edit="prob"][data-line="2"]').click();
  check('tree: clicking it opens the plain input, prefilled empty (not the slider, not silence)', await until(async () => (await p.locator('.eip-input').count() === 1 && await p.locator('.eip-input').inputValue() === '')));
  await p.locator('.eip-input').fill('0.25');
  await p.keyboard.press('Enter');
  const after = await untilValue(() => p.evaluate(() => localStorage.getItem('tree-src')),
    after => (after.includes('Note: sub label (p=0.25): 20')));
  check('tree: the annotation lands right before the TRUE value colon — the label’s own colon is untouched',
    after.includes('Note: sub label (p=0.25): 20'));
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  check('tree: one undo reverts the prob-set edit', await until(async () => ((await p.evaluate(() => localStorage.getItem('tree-src'))) === before)));
  check('tree prob set-when-unset (inline): no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- why: popover status + cycle assumption ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Edit tree source'}).click();
  await p.getByRole('button', {name: 'Reading retention'}).click();
  /* Status owns one canonical hit target. The visible label is no longer also
     an edit target, so exercise the actual SVG affordance rather than relying
     on a particular element type. */
  await p.locator('[data-edit="status"][data-raw="testing"]').first().click();
  check('why: status popover opens', await until(async () => (await p.locator('.eip-pop').count() === 1)));
  await p.locator('.eip-pop button', {hasText: 'delivering'}).click();
  const t1 = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    t1 => (t1.includes('Reading reminders [delivering]')));
  check('why: popover commit rewrites tag', t1.includes('Reading reminders [delivering]'));
  const a0 = await p.locator('[data-edit="astatus"][data-raw="untested"]').first();
  await a0.click();
  const t2 = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    t2 => (t2.includes('? readers will invite friends [testing]')));
  check('why: assumption cycles untested→testing', t2.includes('? readers will invite friends [testing]'));
  /* two setup edits landed back to back with no undo between them (t1, t2) — CodeMirror's
     history groups same-source edits dispatched within its newGroupDelay (500ms) into ONE
     undo step. `baseline` below is captured AFTER both; without a real gap here, the first
     round-trip edit below could merge backward into t2 (or t1+t2), and one undo would revert
     past `baseline`. Fast polling closed the natural gap the old fixed sleeps used to leave —
     restore it explicitly rather than relying on incidental Playwright latency. */
  await p.waitForTimeout(700);

  /* ---- card menu: tap the card BODY (the invisible-fill data-hit rect, which
     IS the card rect itself here — why is a drop-in, no wrapper <g>) opens
     Rename/Status/Add/Remove. "Reading reminders" (srcLine 5, a solution) carries
     both a label and a status pill so every row is live; each action gets its
     own round trip: commit, assert, ONE Meta+z, assert full revert back to the
     pre-menu baseline before the next action starts clean. ---- */
  const cardBody = line => p.locator('#preview svg rect[data-edit^="cardmenu"][data-line="' + line + '"][data-hit]');
  /* solution cards stack label + status pill + assumption rows, so the card's
     geometric centre (Playwright's default .click() target) usually lands on
     assumption text painted on top of the rect — tap the top-left padding
     sliver instead, above every card kind's first text baseline. */
  const tapCard = async line => {
    const body = cardBody(line);
    await body.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await tapCardMenu(p, await body.boundingBox(), line);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('why-src'));
  const undo = () => undoStep(p);

  /* "Reading reminders" (srcLine 5) carries two assumptions (srcLine 6 "readers
     want a nudge mid-commute" [testing], srcLine 7 "reading time is
     detectable" [holds]) — the dynamic solutionMenu composer inserts one
     submenu row per assumption, in source order, between ＋ Add assumption
     and Remove branch. */
  await tapCard(5);
  check('why: solution card tap opens the menu with base rows + one row per assumption, in order', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
    'Inspect…|Rename…|Status…|＋ Add assumption|? readers want a nudge mid-commute · testing|? reading time is detectable · holds|Remove branch')));

  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('why: menu Rename opens the label input prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === 'Reading reminders')));
  await p.locator('.eip-input').fill('Smart nudges');
  await p.keyboard.press('Enter');
  const tRename = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    tRename => (tRename.includes('Smart nudges') && !tRename.includes('Reading reminders')));
  check('why: menu Rename commits the new label', tRename.includes('Smart nudges') && !tRename.includes('Reading reminders'));
  await undo();
  check('why: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(5);
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  check('why: menu Status opens the status options popover', await until(async () => (await p.locator('.eip-pop button', {hasText: 'delivering'}).count() === 1)));
  await p.locator('.eip-pop button', {hasText: 'shipped'}).click();   // current is 'delivering' (set above) — pick a distinct value so this is a real commit
  const tStatus = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    tStatus => (tStatus.includes('Reading reminders [shipped]')));
  check('why: menu Status pick commits the new status', tStatus.includes('Reading reminders [shipped]'));
  await undo();
  check('why: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(5);
  await p.locator('.eip-pop button', {hasText: 'Add assumption'}).click();
  const tAdd = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    tAdd => (tAdd.includes('New assumption')));
  check('why: menu Add assumption inserts a new assumption line', tAdd.includes('New assumption'));
  await undo();
  check('why: one undo restores the pre-add baseline', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  /* ---- action-menu keyboard semantics (ledger 34): role=menu/menuitem, plus
     ArrowUp/ArrowDown roving focus (wrapping) and Home/End to first/last, on
     top of the existing Tab trap + Escape-to-close. Read-only — commits
     nothing, closes via Escape. ---- */
  await tapCard(5);
  check('why: card menu popover carries role=menu with menuitem rows', await until(async () => ((await p.locator('.eip-pop').getAttribute('role')) === 'menu' &&
    (await p.locator('.eip-pop button').first().getAttribute('role')) === 'menuitem')));
  const menuLabels = await p.locator('.eip-pop button').allInnerTexts();
  const focusedLabel = () => p.evaluate(() => document.activeElement && document.activeElement.textContent);
  check('why: menu opens with focus on the first row', (await focusedLabel()) === menuLabels[0]);
  await p.keyboard.press('ArrowDown');
  check('why: ArrowDown moves roving focus to the second row', (await focusedLabel()) === menuLabels[1]);
  await p.keyboard.press('End');
  check('why: End jumps roving focus to the last row', (await focusedLabel()) === menuLabels[menuLabels.length - 1]);
  await p.keyboard.press('ArrowDown');
  check('why: ArrowDown wraps from the last row back to the first', (await focusedLabel()) === menuLabels[0]);
  await p.keyboard.press('Home');
  check('why: Home jumps roving focus back to the first row (no-op here, already first)', (await focusedLabel()) === menuLabels[0]);
  await p.keyboard.press('ArrowUp');
  check('why: ArrowUp wraps from the first row to the last', (await focusedLabel()) === menuLabels[menuLabels.length - 1]);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  check('why: Escape closes the popover without committing', await p.locator('.eip-pop').count() === 0);

  /* ---- assumption sub-menu: tap an assumption row → a nested popover with
     the four ASSUMPTION_CYCLE states (current one carries .on) plus a danger
     "Remove assumption", targeting the ASSUMPTION's own srcLine — the
     solution's line must stay untouched. ---- */
  await tapCard(5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'readers want a nudge mid-commute'}).click();
  check('why: assumption sub-popover lists the four cycle states plus a danger Remove', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'untested|testing|holds|broken|Remove assumption')));
  check('why: assumption sub-popover marks the current status with .on',
    (await p.locator('.eip-pop button.on').innerText()) === 'testing');
  check('why: only one state is marked current', await p.locator('.eip-pop button.on').count() === 1);

  await p.locator('.eip-pop button', {hasText: 'holds'}).click();
  const tAstatus = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    tAstatus => (tAstatus.includes('? readers want a nudge mid-commute [holds]')));
  check('why: picking a different state rewrites the ASSUMPTION line',
    tAstatus.includes('? readers want a nudge mid-commute [holds]'));
  check("why: the solution's own line is untouched by the assumption edit",
    /Reading reminders \[\w+\]/.test(tAstatus) && tAstatus.match(/Reading reminders \[(\w+)\]/)[1] ===
    baseline.match(/Reading reminders \[(\w+)\]/)[1]);
  await undo();
  check('why: one undo restores the pre-status baseline (assumption)', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'readers want a nudge mid-commute'}).click();
  await p.locator('.eip-pop button.danger', {hasText: 'Remove assumption'}).click();
  const tRemoveA = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    tRemoveA => (!tRemoveA.includes('readers want a nudge mid-commute') &&
    tRemoveA.includes('reading time is detectable') && tRemoveA.includes('Reading reminders')));
  check('why: Remove assumption drops just that assumption line',
    !tRemoveA.includes('readers want a nudge mid-commute') &&
    tRemoveA.includes('reading time is detectable') && tRemoveA.includes('Reading reminders'));
  await undo();
  check('why: one undo restores the removed assumption', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  /* zero-assumption solution: exactly the four base rows (no submenu rows) */
  await tapCard(12);   // "Curated shelves [shipped]" — no assumption children
  check('why: a zero-assumption solution shows exactly the four base rows', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Inspect…|Rename…|Status…|＋ Add assumption|Remove branch')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  await tapCard(5);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: menu Remove branch drops the solution (and its assumptions)',
    !tRemove.includes('Reading reminders') && !tRemove.includes('readers want a nudge mid-commute'));
  await undo();
  check('why: one undo restores the removed branch', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  /* ---- outcome + opportunity cards: these have no status field, so their
     menus must not offer a dead Status… row. Add inserts a default then opens
     the NEW label inside the artefact (not the DSL); Escape removes that exact
     untouched default. ---- */
  await tapCard(1);   // outcome: "Improve 90-day retention"
  check('why: outcome card menu carries only real actions', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Inspect…|Rename…|＋ Add opportunity|Remove branch')));
  await p.locator('.eip-pop button', {hasText: 'Add opportunity'}).click();
  const tOutAdd = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    async tOutAdd => (tOutAdd.includes('New opportunity') && await p.locator('.eip-input').inputValue() === 'New opportunity' &&
    !(await p.evaluate(() => !!document.activeElement?.closest('.cm-editor')))));
  check('why: outcome Add opens the fresh inline artifact field, not the DSL',
    tOutAdd.includes('New opportunity') && await p.locator('.eip-input').inputValue() === 'New opportunity' &&
    !(await p.evaluate(() => !!document.activeElement?.closest('.cm-editor'))));
  await p.keyboard.press('Escape'); check('why: Escape cancels the untouched default opportunity', await until(async () => ((await p.evaluate(() => localStorage.getItem('why-src'))) === baseline)));
  await tapCard(1);
  await p.locator('.eip-pop button', {hasText: 'Add opportunity'}).click();
  await p.locator('.eip-input').fill('Retention value is unclear');
  await p.keyboard.press('Enter'); check('why: Enter commits the in-place opportunity name', await until(async () => ((await p.evaluate(() => localStorage.getItem('why-src'))).includes('Retention value is unclear'))));
  await undo();   // ONE undo: reverts the rename, the add itself remains
  /* hash coherence: after add → rename → undo, location.hash (400ms debounce)
     must decode to a model that round-trips this exact source — a fresh page
     loading that same URL should land on the identical document, not the
     stale pre-undo (or pre-add) state. */
  /* Poll only for what is knowable HERE: the source has settled away from baseline.
     This predicate used to also reference hashDoc, which is const-declared four lines
     BELOW — so every iteration threw a TDZ ReferenceError that untilValue's catch
     swallowed, and the "wait" was a silent 4s run to the ceiling that never evaluated
     its condition once. The hashDoc comparison belongs to the check() below, which
     still makes it. */
  const afterAddUndo = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    v => v !== baseline);
  /* This 700ms SLEEP stays, and no poll replaces it. The precondition is location.hash
     having been rewritten behind its own 400ms debounce (see the comment above), and
     every cheap predicate for that is already true before the debounce fires: two equal
     href reads agree instantly precisely BECAUSE the rewrite has not started, which
     hands the fresh page below a stale hash and fails this check for the wrong reason
     (tried, and it failed exactly that way). The predicate that used to sit here
     referenced a const declared four lines below it, threw TDZ every iteration, and was
     swallowed by untilValue's catch — so this wait was an accidental 4s ceiling run all
     along. 700ms is the honest version of it. */
  await p.waitForTimeout(700);
  const hrefAfterAddUndo = await p.evaluate(() => location.href);
  const hashPage = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  await hashPage.goto(hrefAfterAddUndo);
  const hashDoc = await untilValue(() => hashPage.evaluate(() => localStorage.getItem('why-src')),
    hashDoc => (hashDoc === afterAddUndo && afterAddUndo !== baseline));
  check('why: location.hash after add→rename→undo decodes a model that round-trips the source',
    hashDoc === afterAddUndo && afterAddUndo !== baseline);
  await hashPage.close();
  await undo();   // the second undo: removes the add itself, back to baseline
  check('why: two undo steps restore the named add (rename, then creation)', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(16);   // opportunity leaf "Progress feels invisible" — no children, safe to remove alone
  check('why: opportunity card menu carries no dead Status action', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Inspect…|Rename…|＋ Add solution|Remove branch')));
  await p.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await p.waitForTimeout(600);
  const tOppRemove = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: opportunity menu Remove branch drops the opportunity', !tOppRemove.includes('Progress feels invisible'));
  await undo();
  check('why: one undo restores the removed opportunity', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  check('why: export render has no edit affordances', await p.evaluate(async () => {
    const [{parse}, {project}, {renderCausalField}] = await Promise.all([
      import('/why/parse.js'), import('/why/project.js'), import('/why/render-causal-field.js')]);
    const m = parse(localStorage.getItem('why-src'));
    const svg = renderCausalField(m, project(m), {colors: {}, measure: () => 50, dark: false});
    return !svg.includes('cardmenu-') && !svg.includes('removeassump');
  }));
  check('why: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- why: the visible stacked copy must not eclipse its own hit geometry.
   Click a wrapped solution's SECOND painted label line and its visible state
   word — not a transparent corner rect — and prove each opens its intended
   non-writing control. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const source = 'title: Hit geometry\noutcome: Retention\n  Losing your place\n    A deliberately long solution label that wraps across the Field rail for direct hit testing [testing]';
  const seed = {t: source, v: 'ost', e: 1};
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(seed))), 'binary').toString('base64');
  await p.goto(BASE.replace('/tree/', '/why/#') + hash, {waitUntil: 'networkidle'});
  await p.waitForTimeout(700);
  const baseline = await p.evaluate(() => localStorage.getItem('why-src'));
  const secondLine = p.locator('#preview svg g[data-causal-node="3"] text:not([data-edit]):not([data-causal-state])').first();
  const secondBox = await secondLine.boundingBox();
  await p.mouse.click(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
  check('why: visible second Field label line opens its row menu without a source write', await until(async () =>
    (await p.locator('.eip-pop').count() === 1 && (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline)));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  const state = p.locator('#preview svg [data-causal-state="testing"]');
  const stateBox = await state.boundingBox();
  await p.mouse.click(stateBox.x + stateBox.width / 2, stateBox.y + stateBox.height / 2);
  check('why: visible Field state word opens its marked status picker without a source write', await until(async () =>
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'candidate|testing|delivering|shipped|parked' &&
    (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline));
  await p.close();
}

/* ---- why: Delivery Lens keeps the Causal Field's truthful per-kind menus.
   A solution carries Rename/Status/Add-assumption; an unaddressed opportunity
   carries Rename/Add-solution and never a false solution-status picker. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Edit tree source'}).click();
  await p.getByRole('button', {name: 'Reading retention'}).click();
  await p.locator('#viewmap').click();
  await p.waitForTimeout(500);

  const cardBody = line => p.locator('#preview svg rect[data-edit="cardmenu-solution"][data-line="' + line + '"][data-hit]');
  const tapCard = async line => {
    const body = cardBody(line);
    await body.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await tapCardMenu(p, await body.boundingBox(), line);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('why-src'));
  const undo = () => undoStep(p);

  await tapCard(5);
  check('why Delivery Lens: solution row keeps the complete solution menu', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
    'Inspect…|Rename…|Status…|＋ Add assumption|? readers want a nudge mid-commute · testing|? reading time is detectable · holds|Remove branch')));

  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('why Delivery Lens: menu Rename opens the label input prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === 'Reading reminders')));
  await p.locator('.eip-input').fill('Smart nudges');
  await p.keyboard.press('Enter');
  const tRename = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    tRename => (tRename.includes('Smart nudges') && !tRename.includes('Reading reminders')));
  check('why Delivery Lens: menu Rename commits the source label', tRename.includes('Smart nudges') && !tRename.includes('Reading reminders'));
  await undo();
  check('why Delivery Lens: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(5);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why Delivery Lens: menu Remove branch drops the solution (and its assumptions)',
    !tRemove.includes('Reading reminders') && !tRemove.includes('readers want a nudge mid-commute'));
  await undo();
  check('why Delivery Lens: one undo restores the removed branch', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  const opportunity = p.locator('#preview svg rect[data-edit="cardmenu-opportunity"][data-line="16"][data-hit]');
  await tapCardMenu(p, await opportunity.boundingBox(), 16);
  check('why Delivery Lens: an unaddressed opportunity has only opportunity actions', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
    'Inspect…|Rename…|＋ Add solution|Remove branch')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  /* Both views retain their distinct reading geometry but share the same
     per-kind source actions. Switch back and confirm a Causal Field solution
     still shows its full
     dynamic Rename/Status/Add/assumptions/Remove set (the OST block above
     already exercises each row end to end; this just proves the two views
     coexist on one page load without one clobbering the other). Nothing in
     this map-view block permanently mutated "Reading reminders"'s two
     assumptions, so both submenu rows still show their original statuses. */
  await p.locator('#viewost').click();
  await p.waitForTimeout(500);
  const causalCardBody = p.locator('#preview svg rect[data-edit="cardmenu-solution"][data-line="5"][data-hit]');
  await tapCardMenu(p, await causalCardBody.boundingBox(), 5);
  check('why Delivery Lens: switching back to Causal Field retains the full solution menu', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
    'Inspect…|Rename…|Status…|＋ Add assumption|? readers want a nudge mid-commute · testing|? reading time is detectable · holds|Remove branch')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  check('why Delivery Lens: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: title edit + status popover ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Reading app roadmap'}).click();
  await p.waitForTimeout(500);
  /* The flagship is a plain now/next/later doc → the CHART, whose own markup
     this block exercises (the lane×horizon cell-ghost additem, the cell drag,
     a card menu with no Lane… row). Board's edit/drag coverage lives in the
     dedicated board blocks elsewhere in this file. */
  await p.locator('[data-edit="title"]', {hasText: 'Resume where you left off'}).first().click();
  await p.locator('.eip-input').fill('Resume shield');
  await p.keyboard.press('Enter');
  const t = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    t => (t.includes('Resume shield [doing]')));
  check('roadmap: title rename lands', t.includes('Resume shield [doing]'));
  await p.locator('[data-edit="status"][data-raw="risk"]').first().click();
  await p.locator('.eip-pop button', {hasText: 'blocked'}).click();
  const t2 = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    t2 => (t2.includes('[blocked]')));
  check('roadmap: status popover rewrites tag', t2.includes('[blocked]'));

  /* add via the cell ghost */
  await p.locator('[data-edit="additem"][data-lane="Growth"][data-col="Next"]').click();
  await p.locator('.eip-input').fill('EIP suite added');
  await p.keyboard.press('Enter');
  const t3 = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    t3 => (t3.includes('Growth: EIP suite added')));
  check('roadmap: cell ghost adds a lane-prefixed item', t3.includes('Growth: EIP suite added'));
  /* three setup edits (t, t2, t3) landed back to back with no undo between them —
     CodeMirror groups same-source edits dispatched within its newGroupDelay (500ms)
     into ONE undo step. `baseline` below is captured after all three; without a real
     gap here the first round-trip edit could merge backward past it (see the why
     block's identical fix above for the mechanism). */
  await p.waitForTimeout(700);

  /* ---- card menu: tap the card BODY (the invisible data-hit rect, not a
     field) opens the menu; "Resume shield" carries both a note and a status so
     the Edit-note/Status rows aren't vacuous. Each action gets its own round
     trip: commit, assert, ONE Meta+z, assert full revert back to the pre-menu
     baseline before the next action starts clean.

     The card is found by its TITLE, not by a hard-coded data-line: srcLine is a
     property of the shipped example, and pinning it here means any edit to that
     example (adding `headline:` did exactly this) breaks the suite for reasons
     that have nothing to do with edit-in-place. ---- */
  const lineOfCard = async title => roadmapCard(p, title).getAttribute('data-line');
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  /* tap the top-left padding sliver, not the rect centre: the card paints its
     title/note/status text over the hit rect, and Playwright's default .click()
     targets the centre — on Linux (subtly different font metrics) that lands on
     the text element and the menu never opens. Same fix the why suite uses. */
  const tapCard = async title => {
    const line = await lineOfCard(title);
    await tapCardMenu(p, await cardBody(line).boundingBox(), line);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const undo = () => undoStep(p, () => focusRoadmapSource(p));

  await tapCard("Resume shield");
  check('roadmap: card body tap opens the menu with the expected rows', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit note…|Status…|Condition…|Move to…|Inspect item|Remove item')));

  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('roadmap: menu Rename opens the title input prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === 'Resume shield')));
  await p.locator('.eip-input').fill('Resume anchor');
  await p.keyboard.press('Enter');
  const tRename = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tRename => (tRename.includes('Resume anchor [doing]') && !tRename.includes('Resume shield')));
  check('roadmap: menu Rename commits the new title', tRename.includes('Resume anchor [doing]') && !tRename.includes('Resume shield'));
  await undo();
  check('roadmap: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  await tapCard("Resume shield");
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  check('roadmap: menu Status opens the status options popover', await until(async () => (await p.locator('.eip-pop button', {hasText: 'blocked'}).count() === 1)));
  await p.locator('.eip-pop button', {hasText: 'blocked'}).click();
  const tStatus = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tStatus => (tStatus.includes('Resume shield [blocked]')));
  check('roadmap: menu Status pick commits the new status', tStatus.includes('Resume shield [blocked]'));
  await undo();
  check('roadmap: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  /* Move to… row: a sub-popover lists the model's horizons (current one
     marked `on`); picking a different one is the phone replacement for
     dragging the card across columns — same undo/round-trip contract as
     every other menu row. */
  await tapCard("Resume shield");
  await p.locator('.eip-pop button', {hasText: 'Move to…'}).click();
  check('roadmap: Move to… submenu lists the model’s horizons', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Now|Next|Later')));
  check('roadmap: Move to… marks the item’s current horizon',
    (await p.locator('.eip-pop button.on').innerText()) === 'Now');
  await p.locator('.eip-pop button', {hasText: 'Next'}).click();
  const tMove = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tMove => (tMove.indexOf('Resume shield [doing]') > tMove.indexOf('NEXT') && tMove.indexOf('NEXT') > tMove.indexOf('NOW')));
  check('roadmap: Move to… Next relocates the item into the NEXT section',
    tMove.indexOf('Resume shield [doing]') > tMove.indexOf('NEXT') && tMove.indexOf('NEXT') > tMove.indexOf('NOW'));
  await undo();
  check('roadmap: one undo restores the pre-move baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  await tapCard("Resume shield");
  await p.locator('.eip-pop button.danger', {hasText: 'Remove item'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: menu Remove drops the card', !tRemove.includes('Resume shield'));
  await undo();
  check('roadmap: one undo restores the removed card', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  /* Start the drag proof from the complete fixture again. The menu cases above
     deliberately exercise a sequence of text transactions; drag only needs the
     chart's own lane×horizon geometry, so it should not inherit their layout
     history. */
  await p.getByRole('button', {name: 'Reading app roadmap'}).click();
  await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    t => (t.includes('Platform: Sync engine rewrite') && t.includes('Growth: Home-screen widget gallery')));
  await until(async () => (await roadmapCard(p, 'Resume where you left off').count()) === 1);

  /* real mouse drag: "Sync engine rewrite" (Platform/Now) dropped into
     Platform/Next moves it (byte-preserved line, relocated after the NEXT
     header) and must NOT leave a card menu open (proves suppressClick).
  Resolved by title, not by srcLine — see lineOfCard above. */
  const dragSrc = await cardBody(await lineOfCard('Sync engine rewrite')).boundingBox();
  const dragDst = await p.locator('#preview svg rect[data-cell="1|Platform"]').boundingBox();
  const dragStart = {x: dragSrc.x + dragSrc.width / 2, y: dragSrc.y + 10};
  const dragEnd = {x: dragDst.x + dragDst.width / 2, y: dragDst.y + dragDst.height / 2};
  await p.mouse.move(dragStart.x, dragStart.y);
  await p.mouse.down();
  for(let i = 1; i <= 8; i++)
    await p.mouse.move(dragStart.x + (dragEnd.x - dragStart.x) * i / 8,
      dragStart.y + (dragEnd.y - dragStart.y) * i / 8);
  await p.mouse.up();
  const tDrag = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tDrag => (tDrag.indexOf('Sync engine rewrite') > tDrag.indexOf('NEXT')));
  check('roadmap: real drag moves the card into the NEXT section',
    tDrag.indexOf('Sync engine rewrite') > tDrag.indexOf('NEXT'));
  check('roadmap: drag does not open the card menu', await p.locator('.eip-pop').count() === 0);

  check('roadmap: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: Status…/Edit note… on a CHART item with neither set yet (the
   unset-edit fix batch, Part 1) — the chart renderer (roadmap/render.js)
   emits NO inline data-edit="status"/"note" target at all for a status-less/
   note-less card (unlike register/board/focus, which always emit an
   empty-raw target for these fields — see the narrow-register block below),
   so both rows used to resolve to nothing. They now fall back to the shared
   card-menu trigger (assets/edit-in-place.js's opens-row fallback) and open
   the real picker/input instead. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Reading app roadmap'}).click();
  await p.waitForTimeout(500);

  const title = 'Home-screen widget gallery';   // NEXT/Growth: shipped with no status, no note
  const lineOfCard = async t => p.locator('#preview svg [data-edit="title"][data-raw="' + t + '"]')
    .first().getAttribute('data-line');
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tapCard = async t => {
    const line = await lineOfCard(t);
    await tapCardMenu(p, await cardBody(line).boundingBox(), line);
  };
  const line = await lineOfCard(title);
  check('roadmap: the chart renders neither a status nor a note target for this item',
    (await p.locator('#preview svg [data-edit="status"][data-line="' + line + '"]').count()) === 0 &&
    (await p.locator('#preview svg [data-edit="note"][data-line="' + line + '"]').count()) === 0);

  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const undo = () => undoStep(p, () => focusRoadmapSource(p));

  // (a) Status… — must open the real options picker, never silence
  await tapCard(title);
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  check('roadmap: Status… on an unset item opens the status picker (not silence)', await until(async () => (await p.locator('.eip-pop button', {hasText: 'doing'}).count() === 1)));
  await p.locator('.eip-pop button', {hasText: 'doing'}).click();
  const tStatus = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tStatus => (tStatus.includes(title + ' [doing]')));
  check('roadmap: picking a status writes the bracket tag onto the item’s own line',
    tStatus.includes(title + ' [doing]'));
  await undo();
  check('roadmap: one undo reverts the status-set edit', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // (b) Edit note… — must open an empty input, never silence
  await tapCard(title);
  await p.locator('.eip-pop button', {hasText: 'Edit note…'}).click();
  check('roadmap: Edit note… on an unset item opens an EMPTY input (not silence)', await until(async () => (await p.locator('.eip-input').count() === 1 && await p.locator('.eip-input').inputValue() === '')));
  await p.locator('.eip-input').fill('now shipping in beta');
  await p.keyboard.press('Enter');
  const tNote = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tNote => (tNote.includes(title + ' -- now shipping in beta')));
  check('roadmap: the typed note lands as " -- note" on the item’s own line',
    tNote.includes(title + ' -- now shipping in beta'));
  await undo();
  check('roadmap: one undo reverts the note-set edit', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  check('roadmap unset-status/note: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: "Runs until…" — the coarse-pointer half of the edge drag
   (Task 9). Same submenu machinery as "Move to…": picking a column commits
   the same setSpan text rewrite a right-edge drag would. The row must appear
   ONLY on a time axis and only when there's more than one column to choose
   from — on a now/next/later doc it must not appear at all. Cards resolved
   by TITLE, never by data-line (see the desktop block above). ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('horizons: quarterly from Q3 2026 x4\nQ3 2026\n' +
    'Core: Sync engine rewrite [doing] x2\n');
  await p.waitForTimeout(700);

  const lineOfCard = async title => roadmapCard(p, title).getAttribute('data-line');
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  /* the top-left padding sliver the other blocks tap is INSIDE the left-edge
     span handle on a spanning card (Task 8's data-span-edge rects paint last,
     so they sit on top of the card body in their ~12px bands at each end) —
     tap the horizontal centre near the top instead, clear of both handles. */
  const tapCard = async title => {
    const box = await cardBody(await lineOfCard(title)).boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + 4);
  };

  await tapCard('Sync engine rewrite');
  check('roadmap: the card menu offers Runs until… on a time axis', await until(async () => (await p.locator('.eip-pop button', {hasText: 'Runs until…'}).count() === 1)));

  await p.locator('.eip-pop button', {hasText: 'Runs until…'}).click();
  check('roadmap: Runs until… lists this item’s start column through the board’s last', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Q3 2026|Q4 2026|Q1 2027|Q2 2027')));
  check('roadmap: Runs until… marks the current end',
    (await p.locator('.eip-pop button.on').innerText()) === 'Q4 2026');

  // pick the THIRD column (Q1 2027) — commits x3
  await p.locator('.eip-pop button', {hasText: 'Q1 2027'}).click();
  const src = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    src => (/Sync engine rewrite \[doing\] x3/.test(src)));
  check('roadmap: Runs until… picking the third column commits x3 into the source',
    /Sync engine rewrite \[doing\] x3/.test(src));

  /* An item running PAST the board has no row for its true end, so NOTHING may be
     marked current — an `on` row is still clickable, and tapping the row the menu
     itself calls "current" would commit the last visible column as the end and
     silently shorten the work. x6 on a 4-column board must not become x4. */
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: Big programme x6\n');
  await p.waitForTimeout(700);
  await tapCard('Big programme');
  await p.locator('.eip-pop button', {hasText: 'Runs until…'}).click();
  await p.waitForTimeout(200);
  check('roadmap: an off-board span marks NO row as current (its true end is not on the list)',
    await p.locator('.eip-pop button.on').count() === 0);
  await p.locator('.eip-pop button', {hasText: 'Q2 2027'}).click();   // the last visible column
  const offSrc = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    offSrc => (/Big programme x4/.test(offSrc)));
  check('roadmap: picking the last visible column on an off-board span is an explicit choice (x4), not a silent truncation of x6',
    /Big programme x4/.test(offSrc));

  // now/next/later doc: NOT a time axis — the row must not appear at all
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('NOW\nCore: Sync engine rewrite [doing]\n');
  await p.waitForTimeout(700);
  await tapCard('Sync engine rewrite');
  await p.waitForTimeout(200);
  check('roadmap: no Runs until… without a time axis',
    await p.locator('.eip-pop button', {hasText: 'Runs until…'}).count() === 0);

  check('roadmap: no console/page errors (Runs until…)', errs.length === 0);
  await p.close();
}

/* ---- roadmap: conditional bets — Resolve…/Condition…/What-if… menu rows
   (A5). A dedicated bets doc: "Ship reminders" declares the bet, "Fallback
   plan" is its [unless] rider (drops once the bet WINS), "Depends on it" is
   its [if] rider, "Unrelated item" carries no bet/cond (the Condition… target
   for a fresh set). Cards resolved by TITLE (see the desktop block above). ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('NOW\nCore: Ship reminders [bet: reminders]\n' +
    'Growth: Fallback plan [unless reminders]\nPlatform: Unrelated item\n' +
    'NEXT\nCore: Depends on it [if reminders]\n');
  await p.waitForTimeout(700);

  const lineOfCard = async title => roadmapCard(p, title).getAttribute('data-line');
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tapCard = async title => {
    const line = await lineOfCard(title);
    await tapCardMenu(p, await cardBody(line).boundingBox(), line);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const undo = () => undoStep(p, () => focusRoadmapSource(p));

  // ---- Resolve… ----
  await tapCard('Ship reminders');
  check('roadmap: a bet item’s menu offers Resolve… but no "unresolve" while unresolved', await until(async () => ((await p.locator('.eip-pop button', {hasText: 'Resolve…'}).count()) === 1)));
  await p.locator('.eip-pop button', {hasText: 'Resolve…'}).click();
  check('roadmap: Resolve… submenu lists paid off/didn\'t pay off, no reopen row yet', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === "paid off|didn't pay off")));
  await p.locator('.eip-pop button', {hasText: /^paid off$/}).click();
  const tWon = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tWon => (tWon.includes('[bet: reminders won]')));
  check('roadmap: Resolve… paid off writes the resolution onto the [bet: …] token',
    tWon.includes('[bet: reminders won]'));
  const svgWon = await p.locator('#preview svg').innerHTML();
  const plainWon = svgWon.replace(/<[^>]+>/g, ' ');
  check('roadmap: resolving paid off drops the [unless] fallback and the board says so',
    /not needed\s*—\s*reminders paid off/.test(plainWon) && plainWon.includes('Fallback plan'));
  /* the "paid off" edit above and "reopen" below are TWO edits with no undo between
     them, and the check just below expects TWO SEPARATE undos to unwind them — so
     they must land in two distinct CodeMirror undo groups, not merge into one (see
     the why/roadmap-setup fixes above for the newGroupDelay mechanism). */
  await p.waitForTimeout(700);

  await tapCard('Ship reminders');
  await p.locator('.eip-pop button', {hasText: 'Resolve…'}).click();
  check('roadmap: Resolve… on a resolved bet offers paid off (marked on)/didn\'t pay off/reopen', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === "paid off|didn't pay off|reopen" &&
    (await p.locator('.eip-pop button.on').innerText()) === 'paid off')));
  await p.locator('.eip-pop button', {hasText: 'reopen'}).click();
  const tUnresolved = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tUnresolved => (tUnresolved.includes('[bet: reminders]') && !tUnresolved.includes('won')));
  check('roadmap: Resolve… unresolve clears the outcome, keeping the bare declaration',
    tUnresolved.includes('[bet: reminders]') && !tUnresolved.includes('won'));
  await undo(); await undo();
  check('roadmap: two undos restore the pre-resolve baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- What-if… (view-state only — the text must never change) ----
  await tapCard('Ship reminders');
  check('roadmap: an unresolved bet item’s menu offers the two What if… rows plus clear preview', await until(async () => ((await p.locator('.eip-pop button', {hasText: 'What if:'}).allInnerTexts()).join('|') ===
    "What if: it pays off|What if: it doesn't" &&
    (await p.locator('.eip-pop button', {hasText: 'clear preview'}).count()) === 1)));
  await p.locator('.eip-pop button', {hasText: 'What if: it pays off'}).click();
  await p.waitForTimeout(400);
  check('roadmap: What if: it pays off does NOT touch the source text', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);
  check('roadmap: What if: it pays off shows the preview chip',
    !(await p.locator('#whatifchip').isHidden()) &&
    (await p.locator('#whatifchip').innerText()).includes('reminders') &&
    (await p.locator('#whatifchip').innerText()).includes('pays off'));
  const svgPreview = await p.locator('#preview svg').innerHTML();
  const plainPreview = svgPreview.replace(/<[^>]+>/g, ' ');
  check('roadmap: the previewed world drops the fallback in the LIVE board too',
    /not needed\s*—\s*reminders paid off/.test(plainPreview) && plainPreview.includes('Fallback plan'));

  await tapCard('Ship reminders');
  check('roadmap: the "pays off" row now reads on', await until(async () => ((await p.locator('.eip-pop button', {hasText: 'What if: it pays off'}).getAttribute('class') || '').includes('on'))));
  await p.locator('.eip-pop button', {hasText: 'clear preview'}).click();
  await p.waitForTimeout(400);
  check('roadmap: clear preview hides the chip and restores the text world', await p.locator('#whatifchip').isHidden());
  check('roadmap: no source text ever changed across the what-if flow',
    (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- Condition… ----
  await tapCard('Unrelated item');
  check('roadmap: a non-bet item’s menu offers Condition… (≥1 bet declared)', await until(async () => ((await p.locator('.eip-pop button', {hasText: 'Condition…'}).count()) === 1)));
  await p.locator('.eip-pop button', {hasText: 'Condition…'}).click();
  check('roadmap: Condition… lists if/unless for the declared bet, no clear row yet', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'if reminders|unless reminders')));
  await p.locator('.eip-pop button', {hasText: 'if reminders'}).click();
  const tCond = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tCond => (tCond.includes('Unrelated item [if reminders]')));
  check('roadmap: picking "if reminders" writes the condition token onto the item’s own line',
    tCond.includes('Unrelated item [if reminders]'));
  /* tCond and tClear below are two edits with no undo between them, and the checks
     after tClear expect TWO SEPARATE undos to unwind them one at a time — same
     newGroupDelay hazard as the resolve/reopen pair above. */
  await p.waitForTimeout(700);

  await tapCard('Unrelated item');
  await p.locator('.eip-pop button', {hasText: 'Condition…'}).click();
  check('roadmap: Condition… now marks "if reminders" on and offers "clear condition"', await until(async () => ((await p.locator('.eip-pop button.on').innerText()) === 'if reminders' &&
    (await p.locator('.eip-pop button', {hasText: 'clear condition'}).count()) === 1)));
  await p.locator('.eip-pop button', {hasText: 'clear condition'}).click();
  const tClear = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tClear => (tClear.includes('Unrelated item\n') || /Unrelated item\s*$/m.test(tClear)));
  check('roadmap: clear condition removes the token', tClear.includes('Unrelated item\n') || /Unrelated item\s*$/m.test(tClear));
  await undo();
  check('roadmap: one undo restores the just-cleared condition', (await p.evaluate(() => localStorage.getItem('roadmap-src'))).includes('Unrelated item [if reminders]'));
  await undo();
  check('roadmap: a second undo restores the pre-condition baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  check('roadmap conditional bets: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: conditional bets, additions (test-quality audit 2026-08-09) —
   exports ignore an active preview, the chip's full contract (a11y role,
   copy, multi-bet listing, reset clears everything), keyboard cycling
   surviving a repaint with no re-tabbing (F3 regression), and the menu rows'
   NEGATIVE cases (no Condition… with zero bets declared anywhere; no
   Resolve…/What-if… on an item that carries no bet of its own). Same doc
   shape as the block above, but with a SECOND bet so the chip's multi-
   preview listing has something real to list. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('NOW\nCore: Ship reminders [bet: reminders]\n' +
    'Growth: Fallback plan [unless reminders]\nPlatform: Unrelated item\n' +
    'NEXT\nCore: Depends on it [if reminders]\nCore: Second bet [bet: launch]\n' +
    'Core: Launch rider [if launch]\n');
  await p.waitForTimeout(700);

  const lineOfCard = async title => roadmapCard(p, title).getAttribute('data-line');
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tapCard = async title => {
    const line = await lineOfCard(title);
    const body = cardBody(line);
    await body.scrollIntoViewIfNeeded();   // the Export disclosure can leave the page scrolled
    await tapCardMenu(p, await body.boundingBox(), line);
  };

  // ---- (a) exports ignore an active preview: the download/copy path reads
  // `model`, never the previewed `projected` — arm a what-if, then pull the
  // REAL SVG through the page's own Download SVG button and prove it still
  // states the true unresolved fork (both branch tags), never the preview's
  // dropped-looking world. ----
  await tapCard('Ship reminders');
  await p.locator('.eip-pop button', {hasText: 'What if: it pays off'}).click();
  await p.waitForTimeout(400);
  check('exports-ignore-preview: the chip confirms a preview really is active first',
    !(await p.locator('#whatifchip').isHidden()));
  await p.locator('details:has(summary:text("Export"))').first().locator('summary').click();
  await p.waitForTimeout(150);
  const [dl] = await Promise.all([
    p.waitForEvent('download', {timeout: 8000}),
    p.locator('#dlsvg').click(),
  ]);
  const exportedSvg = readFileSync(await dl.path(), 'utf8');
  check('exports-ignore-preview: the downloaded SVG carries BOTH branch tags (the true open fork)',
    exportedSvg.includes('if reminders') && exportedSvg.includes('unless reminders'));
  check('exports-ignore-preview: the downloaded SVG carries no preview-only dropped state',
    !exportedSvg.includes('not needed —'));
  await p.locator('details:has(summary:text("Export"))').first().locator('summary').click();   // close it — it sits over the canvas at this viewport
  check('chip: role="status" so a world flip is announced to assistive tech', await until(async () => ((await p.locator('#whatifchip').getAttribute('role')) === 'status')));
  check('chip: carries the fixed "exports show all paths" reassurance',
    (await p.locator('#whatifchip').innerText()).includes('exports show all paths'));
  await tapCard('Second bet');
  await p.locator('.eip-pop button', {hasText: "What if: it doesn't"}).click();
  const chipText = await untilValue(() => p.locator('#whatifchip').innerText(),
    chipText => (chipText.includes('reminders') && chipText.includes('pays off') &&
    chipText.includes('launch') && chipText.includes("doesn't pay off")));
  check('chip: lists every armed preview, not just the most recent',
    chipText.includes('reminders') && chipText.includes('pays off') &&
    chipText.includes('launch') && chipText.includes("doesn't pay off"));
  await p.locator('#whatifchip button', {hasText: 'reset'}).click();
  await p.waitForTimeout(400);
  check('chip: reset hides the chip', await p.locator('#whatifchip').isHidden());
  await tapCard('Ship reminders');
  await p.waitForTimeout(200);
  check('chip: reset actually cleared BOTH bets\' previews, not just one — "pays off" no longer marked on',
    !((await p.locator('.eip-pop button', {hasText: 'What if: it pays off'}).getAttribute('class') || '').includes('on')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  await tapCard('Second bet');
  await p.waitForTimeout(200);
  check('chip: reset cleared the SECOND bet\'s preview too — "it doesn\'t" no longer marked on',
    !((await p.locator('.eip-pop button', {hasText: "What if: it doesn't"}).getAttribute('class') || '').includes('on')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);

  // ---- (c) keyboard: focus the capsule's what-if hit rect once, then
  // Enter×3 cycles unresolved→won→lost→unresolved with focus staying on the
  // SAME rect throughout — no re-tabbing (F3 regression guard). ----
  const wi = p.locator("#preview svg rect[data-whatif='reminders']").first();
  await wi.focus();
  check('keyboard: the what-if rect is the focused element after Tab-equivalent focus',
    await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-whatif')) === 'reminders');
  await p.keyboard.press('Enter');
  check('keyboard Enter #1: cycles to "pays off" and the chip says so', await until(async () => ((await p.locator('#whatifchip').innerText()).includes('pays off'))));
  check('keyboard Enter #1: focus survived the repaint, still on the SAME rect (no re-tab)',
    await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-whatif')) === 'reminders');
  await p.keyboard.press('Enter');
  check('keyboard Enter #2: cycles to "doesn\'t pay off"', await until(async () => ((await p.locator('#whatifchip').innerText()).includes("doesn't pay off"))));
  check('keyboard Enter #2: focus still on the same rect',
    await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-whatif')) === 'reminders');
  await p.keyboard.press('Enter');
  check('keyboard Enter #3: cycles back to cleared (chip hides, or drops "reminders" from its listing)', await until(async () => ((await p.locator('#whatifchip').isHidden()) || !(await p.locator('#whatifchip').innerText()).includes('reminders'))));
  check('keyboard Enter #3: focus still on the same rect after a full cycle, no Tab needed at any step',
    await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-whatif')) === 'reminders');

  // ---- (d) menu negatives ----
  // no bets declared anywhere → no Condition… row on ANY item.
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('NOW\nCore: Plain item\nNEXT\nCore: Another one\n');
  await p.waitForTimeout(700);
  await tapCard('Plain item');
  await p.waitForTimeout(200);
  check('menu negative: zero bets declared anywhere → no Condition… row',
    (await p.locator('.eip-pop button', {hasText: 'Condition…'}).count()) === 0);
  check('menu negative: zero bets declared → no Resolve… row either',
    (await p.locator('.eip-pop button', {hasText: 'Resolve…'}).count()) === 0);
  await p.keyboard.press('Escape');

  // a doc WITH a bet, but tapping the item that carries neither bet nor
  // cond of its own → Resolve…/What-if… absent (those are bet-item-only),
  // Condition… present (≥1 bet exists elsewhere to condition on).
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('NOW\nCore: Ship reminders [bet: reminders]\nGrowth: Plain neighbour\n');
  await p.waitForTimeout(700);
  await tapCard('Plain neighbour');
  await p.waitForTimeout(200);
  check('menu negative: a non-bet item never offers Resolve…',
    (await p.locator('.eip-pop button', {hasText: 'Resolve…'}).count()) === 0);
  check('menu negative: a non-bet item never offers What if…',
    (await p.locator('.eip-pop button', {hasText: 'What if:'}).count()) === 0);
  check('menu positive (contrast): the SAME non-bet item DOES offer Condition… once a bet exists elsewhere',
    (await p.locator('.eip-pop button', {hasText: 'Condition…'}).count()) === 1);

  check('roadmap conditional bets (additions): no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: REGISTER — inline cell edits (title/lane/note/status), the
   headerless-horizon "+add" fix (A4), and the coarse-pointer Lane… menu row
   (A10). A dedicated quarterly doc: the xN token exercises addNote's
   after-the-token ordering (A1's regression guard) and the time axis means
   "Runs until…" sits in the menu alongside Lane… — both accounted for below.
   Q4 2026 carries a written header with no items (a legitimate Move to…
   target); Q1 2027 carries NO header anywhere in the source — the headerless
   case A4 fixes. Rows resolved by TITLE, never data-line (see the desktop
   block above). Each action gets its own round trip: commit, assert, ONE
   Meta+z, assert full revert to the pre-menu baseline before the next action
   starts clean. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText(
    'title: Register test\n' +
    'style: register\n' +
    'horizons: quarterly from Q3 2026 x4\n' +
    '\n' +
    'Q3 2026\n' +
    'Core: Rename target\n' +
    'Lane-less target\n' +
    'Core: Note-less target\n' +
    'Core: Spanning target x2\n' +
    'Core: Status-less target\n' +
    '\n' +
    'Q4 2026\n');
  await p.waitForTimeout(700);

  const rowOf = title => roadmapCard(p, title);
  /* tap the top-left padding sliver, not the rect centre: the row paints its
     title/lane/status/note text over the hit rect, and a centred click can
     land on that text instead (same fix the chart block above uses). */
  const tapCard = async title => {
    const box = await rowOf(title).locator('rect[data-hit]').boundingBox();
    await tapCardMenu(p, box);
  };
  const undo = () => undoStep(p, () => focusRoadmapSource(p));
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));

  // ---- rename via the title cell ----
  await p.locator('[data-edit="title"]', {hasText: 'Rename target'}).first().click();
  await p.locator('.eip-input').fill('Renamed OK');
  await p.keyboard.press('Enter');
  const tRename = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tRename => (tRename.includes('Core: Renamed OK') && !tRename.includes('Rename target')));
  check('register: title-cell rename lands in the source',
    tRename.includes('Core: Renamed OK') && !tRename.includes('Rename target'));
  await undo();
  check('register: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- add a lane to a laneless row (setLane) ----
  await rowOf('Lane-less target').locator('[data-edit="lane"]').click();
  await p.locator('.eip-input').fill('Growth');
  await p.keyboard.press('Enter');
  const tLane = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tLane => (tLane.includes('Growth: Lane-less target')));
  check('register: lane-cell edit adds "Lane: " to a laneless row', tLane.includes('Growth: Lane-less target'));
  await undo();
  check('register: one undo restores the pre-lane baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- add a note through the quiet row menu (addNote) ----
  await tapCard('Note-less target');
  await p.locator('.eip-pop button', {hasText: 'Edit note…'}).click();
  await p.locator('.eip-input').fill('first note');
  await p.keyboard.press('Enter');
  const tNote = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tNote => (tNote.includes('Core: Note-less target -- first note')));
  check('register: Edit note… adds " -- " to a note-less row', tNote.includes('Core: Note-less target -- first note'));
  await undo();
  check('register: one undo restores the pre-note baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- add a note to a row carrying an xN span: the note must land AFTER
  // the token (A1's regression guard — the bug it guards against would have
  // produced "Spanning target -- keeps span x2", silently destroying the span) ----
  await tapCard('Spanning target');
  await p.locator('.eip-pop button', {hasText: 'Edit note…'}).click();
  await p.locator('.eip-input').fill('keeps span');
  await p.keyboard.press('Enter');
  const tSpanNote = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tSpanNote => (/Core: Spanning target x2 -- keeps span/.test(tSpanNote)));
  check('register: note on a spanning row lands AFTER xN, preserving the span (A1 regression guard)',
    /Core: Spanning target x2 -- keeps span/.test(tSpanNote));
  await undo();
  check('register: one undo restores the pre-span-note baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- set a status through the quiet row menu (addStatus) ----
  await tapCard('Status-less target');
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  await p.locator('.eip-pop button', {hasText: 'risk'}).click();
  const tStatus = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tStatus => (tStatus.includes('Core: Status-less target [risk]')));
  check('register: Status… adds "[status]" to a status-less row', tStatus.includes('Core: Status-less target [risk]'));
  await undo();
  check('register: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- change horizon via the row menu "Move to…" ----
  await tapCard('Rename target');
  await p.locator('.eip-pop button', {hasText: 'Move to…'}).click();
  check('register: Move to… submenu lists the model’s horizons', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Q3 2026|Q4 2026|Q1 2027|Q2 2027')));
  await p.locator('.eip-pop button', {hasText: 'Q4 2026'}).click();
  const tMove = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tMove => (tMove.indexOf('Rename target') > tMove.indexOf('Q4 2026') && tMove.indexOf('Q4 2026') > tMove.indexOf('Q3 2026')));
  check('register: Move to… relocates the row into the target horizon',
    tMove.indexOf('Rename target') > tMove.indexOf('Q4 2026') && tMove.indexOf('Q4 2026') > tMove.indexOf('Q3 2026'));
  await undo();
  check('register: one undo restores the pre-move baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- Move to… an EMPTY, HEADERLESS horizon: Q1 2027 has no header line
  // anywhere in the source (same shape A4 fixed for "+add", now fixed for the
  // move path too — moveHorizon ensures the header before delegating to
  // moveItem). Pre-fix this was a SILENT no-op: the popover closed as though
  // it worked and the source was untouched — proven here by asserting the row
  // actually leaves Q3 2026 and lands under Q1 2027, not just "no crash" ----
  const preMoveEmpty = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: baseline is restored and Q1 2027 has no literal header yet',
    preMoveEmpty === baseline && !preMoveEmpty.includes('Q1 2027'));
  await tapCard('Rename target');
  await p.locator('.eip-pop button', {hasText: 'Move to…'}).click();
  await p.locator('.eip-pop button', {hasText: 'Q1 2027'}).click();
  const tMoveEmpty = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tMoveEmpty => (/Q1 2027\s*\nCore: Rename target/.test(tMoveEmpty)));
  check('register: Move to… a headerless horizon creates the header and relocates the row (not a silent no-op)',
    /Q1 2027\s*\nCore: Rename target/.test(tMoveEmpty));
  const movedRow = await rowOf('Rename target').innerHTML();
  check('register: the moved row is grouped under Q1 2027 in the rendered table, not left under Q3 2026',
    movedRow.includes('Q1 2027') && !movedRow.includes('Q3 2026'));
  await undo();
  check('register: one undo removes BOTH the synthesised header and the move (one transaction)',
    (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- +add into an EMPTY, HEADERLESS horizon (A4): Q1 2027 has no header
  // line anywhere in the source before this click — the item must land under
  // THAT horizon (proves ensureHorizonHeader ran), not misfiled into Q4 2026
  // (the last WRITTEN header, where the pre-fix bug would silently drop it) ----
  const preAdd = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: baseline is restored and the target horizon has no literal header yet',
    preAdd === baseline && !preAdd.includes('Q1 2027'));
  await p.locator('[data-edit="additem"][data-col="Q1 2027"]').click();
  await p.locator('.eip-input').fill('New headerless item');
  await p.keyboard.press('Enter');
  const tAdd = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tAdd => (/Q1 2027\s*\nNew headerless item/.test(tAdd)));
  check('register: the missing header is created and the item lands right after it',
    /Q1 2027\s*\nNew headerless item/.test(tAdd));
  const addedRow = await rowOf('New headerless item').innerHTML();
  check('register: the new item is grouped under Q1 2027 in the rendered table, not misfiled into Q4 2026',
    addedRow.includes('Q1 2027') && !addedRow.includes('Q4 2026'));
  await undo();
  check('register: one undo removes BOTH the synthesised header and the item (one transaction)',
    (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- the Lane… menu row (A10): register only, reachable via the row menu
  // for coarse pointers that reroute in-card field taps ----
  await tapCard('Rename target');
  check('register: the card menu offers a Lane… row', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
      'Rename…|Edit note…|Status…|Lane…|Move to…|Runs until…|Inspect item|Remove item')));
  await p.locator('.eip-pop button', {hasText: 'Lane…'}).click();
  check('register: Lane… opens the lane input prefilled with the current lane', await until(async () => (await p.locator('.eip-input').inputValue() === 'Core')));
  await p.locator('.eip-input').fill('Ops');
  await p.keyboard.press('Enter');
  const tMenuLane = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tMenuLane => (tMenuLane.includes('Ops: Rename target') && !tMenuLane.includes('Core: Rename target')));
  check('register: Lane… commits the new lane',
    tMenuLane.includes('Ops: Rename target') && !tMenuLane.includes('Core: Rename target'));
  await undo();
  check('register: one undo restores the pre-Lane-menu baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  check('register: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: BOARD — direct title/lane edits plus quiet menu note/status edits and the
   +add-into-an-EMPTY-HEADERLESS-column path (ensureHorizonHeader), mirroring
   the register block above onto the board's own card markup: paintBoardCard
   emits the same data-edit targets (title/note/lane/status/additem) inside
   the same cardmenu <g> wrapper, so the shared edit-in-place plumbing is what's
   under test here, not new markup. A default now/next/later doc where only
   NOW/NEXT carry a header line — LATER stays headerless, the common real
   shape the code comments call out — so the "+add to Later" click exercises
   ensureHorizonHeader exactly like register's headerless case did. Cards
   resolved by TITLE, never data-line. Each action gets its own round trip:
   commit, assert, ONE Meta+z, assert full revert to the pre-action baseline
   before the next action starts clean. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText(
    'title: Board test\n' +
    'style: board\n' +
    '\n' +
    'NOW\n' +
    'Core: Rename target\n' +
    'Lane-less target\n' +
    'Core: Note-less target\n' +
    'Core: Status-less target\n' +
    '\n' +
    'NEXT\n' +
    'Core: Existing next item\n');
  await p.waitForTimeout(700);

  const rowOf = title => roadmapCard(p, title);
  const tapCard = async title => {
    const box = await rowOf(title).locator('rect[data-hit]').boundingBox();
    await tapCardMenu(p, box);
  };
  const undo = () => undoStep(p, () => focusRoadmapSource(p));
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));

  // ---- rename via the card's title field ----
  await p.locator('[data-edit="title"]', {hasText: 'Rename target'}).first().click();
  await p.locator('.eip-input').fill('Renamed OK');
  await p.keyboard.press('Enter');
  const tRename = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tRename => (tRename.includes('Core: Renamed OK') && !tRename.includes('Rename target')));
  check('board: title edit lands in the source',
    tRename.includes('Core: Renamed OK') && !tRename.includes('Rename target'));
  await undo();
  check('board: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- the lane tag on a laneless card (setLane) ----
  await rowOf('Lane-less target').locator('[data-edit="lane"]').click();
  await p.locator('.eip-input').fill('Growth');
  await p.keyboard.press('Enter');
  const tLane = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tLane => (tLane.includes('Growth: Lane-less target')));
  check('board: lane-tag edit adds "Lane: " to a laneless card', tLane.includes('Growth: Lane-less target'));
  await undo();
  check('board: one undo restores the pre-lane baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- Edit note… keeps an empty card free of ghost controls (addNote) ----
  await tapCard('Note-less target');
  await p.locator('.eip-pop button', {hasText: 'Edit note…'}).click();
  await p.locator('.eip-input').fill('first note');
  await p.keyboard.press('Enter');
  const tNote = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tNote => (tNote.includes('Core: Note-less target -- first note')));
  check('board: Edit note… adds " -- " to a note-less card', tNote.includes('Core: Note-less target -- first note'));
  await undo();
  check('board: one undo restores the pre-note baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- Status… keeps an empty card free of ghost controls (addStatus) ----
  await tapCard('Status-less target');
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  await p.locator('.eip-pop button', {hasText: 'risk'}).click();
  const tStatus = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tStatus => (tStatus.includes('Core: Status-less target [risk]')));
  check('board: Status… adds "[status]" to a status-less card', tStatus.includes('Core: Status-less target [risk]'));
  await undo();
  check('board: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- "＋ add to Later": Later is an EMPTY, HEADERLESS column (no header
  // line anywhere in the source) — proves ensureHorizonHeader is wired into
  // the board's +add path too, not just register's. Pre-fix this would
  // misfile the item into NEXT (the last WRITTEN header) instead of creating
  // Later's header — a silent no-op the same shape A4 fixed. ----
  const preAdd = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('board: baseline is restored and Later has no literal header yet',
    preAdd === baseline && !preAdd.includes('Later'));
  await p.locator('[data-edit="additem"][data-col="Later"]').click();
  await p.locator('.eip-input').fill('New headerless card');
  await p.keyboard.press('Enter');
  const tAdd = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tAdd => (/Later\s*\nNew headerless card/.test(tAdd)));
  check('board: the missing Later header is created and the item lands right after it',
    /Later\s*\nNew headerless card/.test(tAdd));
  check('board: the new item renders as a card, filed under Later (not lost)',
    (await rowOf('New headerless card').count()) === 1);
  await undo();
  check('board: one undo removes BOTH the synthesised header and the item (one transaction)',
    (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  check('board: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: FOCUS — the live lens (Task 6). A quarterly doc so the rail
   carries a WRITTEN horizon (Q4 2026, with items), a WRITTEN empty horizon
   (Q1 2027, "Nothing scheduled" + add row) and a HEADERLESS horizon (Q2 2027,
   no header line anywhere in the source) — the same headerless-horizon shape
   A4 fixed for register/board, now proven on focus's own +add path. No
   `focus:` key is written, so focusHeroIndex falls back to the first
   NON-EMPTY horizon (Q3 2026) — the hero. Density is Matt's 2026-07-15 call
   (see render-focus.js): the HERO card gets full inline edit targets
   (title/note/status/lane), the RAIL row stays a clean ranked index (rename
   only) with status reachable through a card-menu "Status…" submenu instead.
   Rows/cards resolved by TITLE, never data-line. Each action gets its own
   round trip: commit, assert, ONE Meta+z, assert full revert to the
   pre-action baseline before the next action starts clean. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText(
    'title: Focus test\n' +
    'style: focus\n' +
    'horizons: quarterly from Q3 2026 x4\n' +
    '\n' +
    'Q3 2026\n' +
    'Core: Hero rename target\n' +
    'Lane-less hero target\n' +
    'Core: Note-less hero target\n' +
    'Core: Status-less hero target\n' +
    '\n' +
    'Q4 2026\n' +
    'Core: Rail rename target\n' +
    'Core: Rail status target\n' +
    '\n' +
    'Q1 2027\n');
  await p.waitForTimeout(700);

  const cardOf = title => roadmapCard(p, title);
  const tapCard = async title => {
    const box = await cardOf(title).locator('rect[data-hit]').boundingBox();
    await tapCardMenu(p, box);
  };
  const undo = () => undoStep(p, () => focusRoadmapSource(p));
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));

  // ================= HERO: full inline edit targets =================

  // ---- rename via the hero card's title ----
  await p.locator('[data-edit="title"]', {hasText: 'Hero rename target'}).first().click();
  await p.locator('.eip-input').fill('Hero renamed OK');
  await p.keyboard.press('Enter');
  const tRename = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tRename => (tRename.includes('Core: Hero renamed OK') && !tRename.includes('Hero rename target')));
  check('focus hero: title-cell rename lands in the source',
    tRename.includes('Core: Hero renamed OK') && !tRename.includes('Hero rename target'));
  await undo();
  check('focus hero: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- tap the hero card's lane tag → set a lane (setLane) ----
  await cardOf('Lane-less hero target').locator('[data-edit="lane"]').click();
  await p.locator('.eip-input').fill('Growth');
  await p.keyboard.press('Enter');
  const tLane = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tLane => (tLane.includes('Growth: Lane-less hero target')));
  check('focus hero: lane-tag edit adds "Lane: " to a laneless hero card', tLane.includes('Growth: Lane-less hero target'));
  await undo();
  check('focus hero: one undo restores the pre-lane baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- Edit note… keeps an empty hero free of ghost controls (addNote) ----
  await tapCard('Note-less hero target');
  await p.locator('.eip-pop button', {hasText: 'Edit note…'}).click();
  await p.locator('.eip-input').fill('first note');
  await p.keyboard.press('Enter');
  const tNote = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tNote => (tNote.includes('Core: Note-less hero target -- first note')));
  check('focus hero: Edit note… adds " -- " to a note-less hero card', tNote.includes('Core: Note-less hero target -- first note'));
  await undo();
  check('focus hero: one undo restores the pre-note baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- Status… keeps an empty hero free of ghost controls (addStatus) ----
  await tapCard('Status-less hero target');
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  await p.locator('.eip-pop button', {hasText: 'risk'}).click();
  const tStatus = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tStatus => (tStatus.includes('Core: Status-less hero target [risk]')));
  check('focus hero: Status… adds "[status]" to a status-less hero card', tStatus.includes('Core: Status-less hero target [risk]'));
  await undo();
  check('focus hero: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ================= RAIL: clean index (rename only) + Status… submenu =================

  // ---- rename via the rail row's title ----
  await p.locator('[data-edit="title"]', {hasText: 'Rail rename target'}).first().click();
  await p.locator('.eip-input').fill('Rail renamed OK');
  await p.keyboard.press('Enter');
  const tRailRename = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tRailRename => (tRailRename.includes('Core: Rail renamed OK') && !tRailRename.includes('Rail rename target')));
  check('focus rail: title-cell rename lands in the source',
    tRailRename.includes('Core: Rail renamed OK') && !tRailRename.includes('Rail rename target'));
  await undo();
  check('focus rail: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- the clean rail: no inline status/lane/note target on a rail row ----
  const railLine = await cardOf('Rail status target').getAttribute('data-line');
  check('focus rail: no inline status target on a rail row (clean index)',
    (await p.locator('[data-line="' + railLine + '"][data-edit="status"]').count()) === 0);
  check('focus rail: no inline lane target on a rail row (clean index)',
    (await p.locator('[data-line="' + railLine + '"][data-edit="lane"]').count()) === 0);
  check('focus rail: no inline note target on a rail row (clean index)',
    (await p.locator('[data-line="' + railLine + '"][data-edit="note"]').count()) === 0);

  // ---- the rail row's card menu → Status… submenu → "At risk" (the submenu commit path) ----
  await tapCard('Rail status target');
  check('focus rail: the card menu offers a Status… submenu row (no inline status target to open)', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).includes('Status…'))));
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  check('focus rail: the Status… submenu lists the four statuses by their labels', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Done|In progress|At risk|Blocked')));
  await p.locator('.eip-pop button', {hasText: 'At risk'}).click();
  const tRailStatus = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tRailStatus => (tRailStatus.includes('Core: Rail status target [risk]')));
  check('focus rail: Status… → At risk commits "[risk]" onto the rail item\'s own line (submenu commit path)',
    tRailStatus.includes('Core: Rail status target [risk]'));
  await undo();
  check('focus rail: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ================= LENS: a rail header commits focus: and re-heros =================

  // ---- click a rail header → focus: <horizon> is written, and that horizon's
  // items become hero cards (full inline edit targets, e.g. a "+ note" ghost
  // that a rail row never carries) ----
  check('focus lens: baseline has no focus: key yet', !baseline.includes('focus:'));
  await p.locator('[data-lens="Q4 2026"]').click();
  const tLens = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tLens => (/focus:\s*Q4 2026/.test(tLens)));
  check('focus lens: clicking a rail header writes focus: <horizon>', /focus:\s*Q4 2026/.test(tLens));
  check('focus lens: the newly-focused horizon\'s items render as hero cards (gain a note edit target)',
    (await cardOf('Rail rename target').locator('[data-edit="note"]').count()) === 1);
  await undo();
  check('focus lens: one undo restores the pre-lens baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- keyboard path: focus (Tab-equivalent) a rail header, then press Enter — same commit ----
  await p.locator('[data-lens="Q1 2027"]').focus();
  await p.keyboard.press('Enter');
  const tLensKb = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tLensKb => (/focus:\s*Q1 2027/.test(tLensKb)));
  check('focus lens: Enter on a focused rail header also commits focus: (keyboard path)',
    /focus:\s*Q1 2027/.test(tLensKb));
  await undo();
  check('focus lens: one undo restores the pre-keyboard-lens baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- "＋ add" into a HEADERLESS rail horizon (Q2 2027 has no header line
  // anywhere in the source) — proves ensureHorizonHeader is wired into
  // focus's own +add path too, not just register/board's ----
  const preAdd = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('focus rail: baseline is restored and Q2 2027 has no literal header yet',
    preAdd === baseline && !preAdd.includes('Q2 2027'));
  await p.locator('[data-edit="additem"][data-col="Q2 2027"]').click();
  await p.locator('.eip-input').fill('New headerless rail item');
  await p.keyboard.press('Enter');
  const tAdd = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    tAdd => (/Q2 2027\s*\nNew headerless rail item/.test(tAdd)));
  check('focus rail: the missing Q2 2027 header is created and the item lands right after it',
    /Q2 2027\s*\nNew headerless rail item/.test(tAdd));
  check('focus rail: the new item renders as a rail row, filed under Q2 2027 (not lost)',
    (await cardOf('New headerless rail item').count()) === 1);
  await undo();
  check('focus rail: one undo removes BOTH the synthesised header and the item (one transaction)',
    (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  check('focus: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: the Lane… row must NOT appear on a plain now/next/later CHART
   doc (no style: line → the chart, the default working surface). The chart has
   no data-edit="lane" target at all, so an `opens` row there would resolve to
   nothing (A10's negative case). This also guards the default: board-live's
   Lane… row must NOT leak onto a plain doc — it appears only on explicit
   style:board. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('NOW\nCore: Ship it\n');
  await p.waitForTimeout(700);

  const line = await p.locator('#preview svg g[data-edit="cardmenu"]')
    .filter({hasText: 'Ship it'}).first().getAttribute('data-line');
  const box = await p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]').boundingBox();
  await tapCardMenu(p, box, line);
  check('roadmap: the Lane… row does not appear on a chart (now/next/later) doc', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit note…|Status…|Move to…|Inspect item|Remove item')));

  check('roadmap: no console/page errors (chart Lane… absence)', errs.length === 0);
  await p.close();
}

/* ---- roadmap: narrow Register preserves its own editing surface. It no
   longer falls back to the generic chart: its lane target remains real, while
   the card menu provides the same action for a concise resting artifact. ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const p = await mctx.newPage();
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('style: register\n\nNOW\nShip it\n');
  await p.waitForTimeout(700);

  const line = await p.locator('#preview svg g[data-edit="cardmenu"]')
    .filter({hasText: 'Ship it'}).first().getAttribute('data-line');
  check('roadmap narrow-register: the Register row retains its inline lane target',
    (await p.locator('#preview svg [data-edit="lane"][data-line="' + line + '"]').count()) === 1);

  const cardLocator = p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  await cardLocator.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const cardBox = await cardLocator.boundingBox();
  await tapCardMenu(p, cardBox, line);
  check('roadmap narrow-register: the menu still offers Lane… (the MODEL is register-styled)', await until(async () => (await p.locator('.eip-pop button', {hasText: 'Lane…'}).count() === 1)));

  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  await p.locator('.eip-pop button', {hasText: 'Lane…'}).click();
  check('roadmap narrow-register: Lane… opens an EMPTY input (not silence)', await until(async () => (await p.locator('.eip-input').count() === 1 && await p.locator('.eip-input').inputValue() === '')));
  await p.locator('.eip-input').fill('Core');
  await p.keyboard.press('Enter');
  const after = await untilValue(() => p.evaluate(() => localStorage.getItem('roadmap-src')),
    after => (/^Core: Ship it$/m.test(after)));
  check('roadmap narrow-register: commit sets the "Lane: " prefix on the item’s own line', /^Core: Ship it$/m.test(after));
  await focusRoadmapSource(p);
  await p.keyboard.press('ControlOrMeta+z');
  check('roadmap narrow-register: one undo reverts the lane-set edit', await until(async () => ((await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline)));

  check('roadmap narrow-register: no console/page errors', errs.length === 0);
  await mctx.close();
}

/* ---- roadmap narrow (mobile-emulated): card menu away-listener leak proof —
   tap a card, open Rename, then tap INTO the input itself; the popover's
   away-pointerdown listener must not treat that as an outside click ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  await mpage.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'Reading app roadmap'}).click();
  await mpage.waitForTimeout(600);

  /* coarse menu-first redirect: tap the CENTRE of the title text itself — a
     [data-edit="title"] field that shares the card's own srcLine (unlike
     map's readout panel, which lives elsewhere). Fix 1's data-menu redirect
     must catch that tap on the field and open the card menu instead of the
     title editor (proving the redirect, not just the always-menu top-left
     tap the rest of this block uses). */
  /* resolved from the card's TITLE, not a hard-coded srcLine — see the desktop
     block above: pinning the shipped example's line numbers makes this suite a
     hostage of that example's content. */
  const mLine = await mpage.locator('#preview svg g[data-edit="cardmenu"]')
    .filter({hasText: 'Resume where you left off'}).first().getAttribute('data-line');
  {
    const titleField = mpage.locator('#preview svg [data-edit="title"][data-line="' + mLine + '"]').first();
    await titleField.scrollIntoViewIfNeeded();
    await mpage.waitForTimeout(300);
    const titleBox = await titleField.boundingBox();
    await mpage.mouse.click(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    check('roadmap: coarse title-field tap opens the menu, not the title editor', await until(async () => (await mpage.locator('.eip-pop').count() === 1)));
    await mpage.keyboard.press('Escape');
    await mpage.waitForTimeout(200);
  }

  const mCardBody = mpage.locator('#preview svg g[data-edit="cardmenu"][data-line="' + mLine + '"] rect[data-hit]');
  /* tap the top-left padding sliver, not settledTap's centre: the card paints
     its title over the hit rect and the centre lands on that text on Linux (same
     off-glyph concern the map-narrow block below handles manually). */
  await mCardBody.scrollIntoViewIfNeeded();
  await mpage.waitForTimeout(300);
  const mCardBox = await mCardBody.boundingBox();
  await mpage.mouse.click(mCardBox.x + 8, mCardBox.y + 4);
  check('roadmap narrow: tap opens the card menu', await until(async () => (await mpage.locator('.eip-pop').count() === 1)));
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Rename…'}));
  check('roadmap narrow: menu Rename opens the input', await until(async () => (await mpage.locator('.eip-input').count() === 1)));

  const ib = await mpage.locator('.eip-input').boundingBox();
  await mpage.touchscreen.tap(ib.x + ib.width / 2, ib.y + ib.height / 2);
  check('roadmap narrow: a touch INTO the input does not dismiss it (away-listener leak)', await until(async () => (await mpage.locator('.eip-input').count() === 1)));

  await mpage.locator('.eip-input').fill('Resume point');
  await mpage.keyboard.press('Enter');
  check('roadmap narrow: commit lands after the away-tap proof', await until(async () => ((await mpage.evaluate(() => localStorage.getItem('roadmap-src'))).includes('Resume point [doing]'))));
  check('roadmap narrow: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- map: card menu (tap card body → menu; rename/field/remove; real drag
   suppresses the menu) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/map/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Edit map source'}).click();
  await p.getByRole('button', {name: 'Assumption map'}).click();
  await p.waitForTimeout(600);

  /* "Readers finish the first book they start" (srcLine 3) carries a `test:` field so the
     Edit-field row isn't vacuous. Unlike roadmap, map's data-hit rect is snug
     around the capsule (same width as the label) — its geometric CENTRE
     lands on a glyph, which both fails Playwright's actionability check and
     would (for real) open the label editor instead of the menu. Tap the
     left padding strip instead (card padding is 8px; x+4 clears any glyph). */
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tapCard = async line => {
    if(await p.locator('.cm-content').isVisible()){
      await p.getByRole('button', {name: 'Hide source editor'}).click();
      await p.waitForTimeout(100);
    }
    const box = await cardBody(line).boundingBox();
    await p.mouse.click(box.x + 4, box.y + box.height / 2);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('map-src'));
  const undo = () => undoStep(p, async () => {
    if(!(await p.locator('.cm-content').isVisible()))
      await p.getByRole('button', {name: 'Edit map source'}).click();
  });

  await tapCard(3);
  check('map: card body tap opens the menu with the expected rows', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit field…|Inspect…|Move…|Remove')));

  /* Review-first selection is deliberately a menu action, not an accidental
     edit. Its receipt must be closable, escapeable, and able to hand the
     reader straight to the authored source without changing that source. */
  await p.locator('.eip-pop button', {hasText: 'Inspect…'}).click();
  check('map: Inspect opens the textual decision receipt beside the artefact', await until(async () => (!(await p.locator('#margin').isHidden()) &&
    await p.locator('#margin').getByRole('heading', {name: 'Readers finish the first book they start'}).count() === 1)));
  await p.locator('#margin button', {hasText: 'Close'}).click();
  check('map: closing the receipt restores focus to the originating menu target', await until(async () => (await p.evaluate(() => document.activeElement?.dataset.edit === 'cardmenu' && document.activeElement?.dataset.line === '3'))));

  await tapCard(3);
  await p.locator('.eip-pop button', {hasText: 'Inspect…'}).click();
  await p.keyboard.press('Escape');
  check('map: Escape closes the receipt and restores its menu focus', await until(async () => (await p.locator('#margin').isHidden() &&
    await p.evaluate(() => document.activeElement?.dataset.edit === 'cardmenu' && document.activeElement?.dataset.line === '3'))));

  await tapCard(3);
  await p.locator('.eip-pop button', {hasText: 'Inspect…'}).click();
  await p.locator('#margin button', {hasText: 'Edit source'}).click();
  check('map: receipt source handoff clears selection and focuses the DSL line', await until(async () => (await p.locator('#margin').isHidden() &&
    await p.evaluate(() => document.activeElement?.closest('.cm-editor') && !document.getElementById('workspace').classList.contains('collapsed')))));

  await tapCard(3);
  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('map: menu Rename opens the label input prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === 'Readers finish the first book they start')));
  await p.locator('.eip-input').fill('Readers finish what they start each night');
  await p.keyboard.press('Enter');
  const tRename = await untilValue(() => p.evaluate(() => localStorage.getItem('map-src')),
    tRename => (tRename.includes('Readers finish what they start each night') && !tRename.includes('Readers finish the first book they start')));
  check('map: menu Rename commits the new label', tRename.includes('Readers finish what they start each night') && !tRename.includes('Readers finish the first book they start'));
  await undo();
  check('map: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  await tapCard(3);
  await p.locator('.eip-pop button', {hasText: 'Edit field…'}).click();
  check('map: menu Edit field opens the field input prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === 'watch 5 onboarding sessions')));
  await p.locator('.eip-input').fill('watch 8 onboarding sessions');
  await p.keyboard.press('Enter');
  const tField = await untilValue(() => p.evaluate(() => localStorage.getItem('map-src')),
    tField => (tField.includes('test: watch 8 onboarding sessions')));
  check('map: menu Edit field commits the new value', tField.includes('test: watch 8 onboarding sessions'));
  await undo();
  check('map: one undo restores the pre-field baseline', (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  await tapCard(3);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('map-src'));
  check('map: menu Remove drops the card', !tRemove.includes('Readers finish the first book they start'));
  await undo();
  check('map: one undo restores the removed card', (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  /* Move…: the menu row arms a one-shot tap-the-plane placement (built for
     coarse pointers, but not gated — it works with a mouse too) */
  await tapCard(3);
  await p.locator('.eip-pop button', {hasText: 'Move…'}).click();
  /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
  await new Promise(r => setTimeout(r, 250));
  check('map: Move… arms the placement hint and commits nothing', await until(async () => (await p.locator('.placehint').count() === 1 &&
    (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline)));
  const plane0 = await p.locator('#preview svg rect[data-plane]').boundingBox();
  await p.mouse.click(plane0.x + plane0.width * 0.25, plane0.y + plane0.height * 0.25);
  check('map: the place-tap writes @ 25,75 as one text edit', await until(async () => ((await p.evaluate(() => localStorage.getItem('map-src'))).includes('Readers finish the first book they start @ 25,75'))));
  check('map: placement disarms after the tap', await p.locator('.placehint').count() === 0);
  await undo();
  check('map: one undo restores the pre-move baseline',
    (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  /* an off-plane tap cancels the armed placement without a write */
  await tapCard(3);
  await p.locator('.eip-pop button', {hasText: 'Move…'}).click();
  /* Prove the placement ARMED before the off-plane tap, or the cancel check below is
     vacuous: "no .placehint + storage unchanged" is ALSO the pre-arm state, and
     mouse.click at raw coordinates auto-waits for nothing (unlike a locator click),
     so a tap landing before the placement UI attached would satisfy it having
     cancelled nothing. This replaces a bare waitForTimeout(250) that the conversion
     dropped — asserting the precondition beats sleeping through it. The phone
     equivalent below already does this via the .placehint .btn box. */
  check('map: Move… armed the placement before the off-plane tap',
    await until(async () => await p.locator('.placehint').count() === 1));
  await p.mouse.click(plane0.x + plane0.width / 2, plane0.y - 40);
  /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
  await new Promise(r => setTimeout(r, 250));
  check('map: an off-plane tap cancels the placement, nothing written', await until(async () => (await p.locator('.placehint').count() === 0 &&
    (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline)));

  /* tray items get the same menu with Place on map… — the unplaced item's
     only non-drag placement path */
  const trayHit = p.locator('#preview svg g[data-tray] rect[data-hit]');
  const trayBox = await trayHit.boundingBox();
  await p.mouse.click(trayBox.x + 4, trayBox.y + trayBox.height / 2);
  check('map: tray card menu offers only reachable actions, including Place on map…', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Inspect…|Place on map…|Remove')));
  await p.locator('.eip-pop button', {hasText: 'Place on map…'}).click();
  await p.mouse.click(plane0.x + plane0.width * 0.6, plane0.y + plane0.height * 0.3);
  check('map: placing the tray item writes @ 60,70 (leaves the tray)', await until(async () => ((await p.evaluate(() => localStorage.getItem('map-src'))).includes('Legal sign-off on publisher licensing @ 60,70'))));
  await undo();
  check('map: one undo restores the pre-place baseline',
    (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  /* real mouse drag: "Abandoned books drive churn" (@ 75,80) dropped near
     the plane centre rewrites its position and must NOT open a card menu */
  const plane = await p.locator('#preview svg rect[data-plane]').boundingBox();
  const dragSrc = await cardBody(4).boundingBox();
  const tx = plane.x + plane.width * 0.5, ty = plane.y + plane.height * 0.5;
  await p.mouse.move(dragSrc.x + dragSrc.width / 2, dragSrc.y + dragSrc.height / 2);
  await p.mouse.down();
  for(let i = 1; i <= 8; i++)
    await p.mouse.move(dragSrc.x + (tx - dragSrc.x) * i / 8, dragSrc.y + (ty - dragSrc.y) * i / 8);
  await p.mouse.up();
  const tDrag = await untilValue(() => p.evaluate(() => localStorage.getItem('map-src')),
    tDrag => (/Abandoned books drive churn @ \d+,\d+/.test(tDrag) && !tDrag.includes('Abandoned books drive churn @ 75,80')));
  check('map: real drag moves the card (position rewritten)',
    /Abandoned books drive churn @ \d+,\d+/.test(tDrag) && !tDrag.includes('Abandoned books drive churn @ 75,80'));
  check('map: drag does not open the card menu', await p.locator('.eip-pop').count() === 0);

  check('map: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- map narrow (mobile-emulated): card menu away-listener leak proof ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  await mpage.goto(BASE.replace('/tree/', '/map/'), {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'Edit map source'}).click();
  await mpage.getByRole('button', {name: 'Assumption map'}).click();
  await mpage.waitForTimeout(600);

  /* coarse menu-first redirect: tap the CENTRE of the label text itself — a
     [data-edit="label"] field that shares the card's own srcLine — and
     confirm it redirects to the card menu, not the label editor. */
  {
    const labelField = mpage.locator('#preview svg [data-edit="label"][data-line="3"]').first();
    await labelField.scrollIntoViewIfNeeded();
    await mpage.waitForTimeout(300);
    const labelBox = await labelField.boundingBox();
    await mpage.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
    check('map: coarse label-field tap opens the menu, not the label editor', await until(async () => (await mpage.locator('.eip-pop').count() === 1)));
    await mpage.keyboard.press('Escape');
    await mpage.waitForTimeout(200);
  }

  /* Fields deliberately stay out of the live plane. The item's menu carries
     the authored value/key instead, so the exact edit remains available without
     reintroducing a second visual readout. */
  {
    const fieldMenu = mpage.locator('#preview svg g[data-edit="cardmenu"][data-line="3"] rect[data-hit]');
    await fieldMenu.scrollIntoViewIfNeeded();
    await mpage.waitForTimeout(300);
    const fieldBox = await fieldMenu.boundingBox();
    await mpage.mouse.click(fieldBox.x + 4, fieldBox.y + fieldBox.height / 2);
    await mpage.locator('.eip-pop button', {hasText: 'Edit field…'}).click();
    check('map: coarse menu keeps the authored field editable without a visual readout', await until(async () =>
      (await mpage.locator('.eip-pop').count() === 0 && await mpage.locator('.eip-input').count() === 1 &&
       await mpage.locator('.eip-input').inputValue() === 'watch 5 onboarding sessions')));
    await mpage.keyboard.press('Escape');
    await mpage.waitForTimeout(200);
  }

  /* same off-glyph tap concern as the desktop block above: map's data-hit
     rect is snug around the capsule, so settledTap's centre tap would land
     on the label glyph — scroll-settle, then tap the left padding strip. */
  const mCardBody = mpage.locator('#preview svg g[data-edit="cardmenu"][data-line="3"] rect[data-hit]');
  await mCardBody.scrollIntoViewIfNeeded();
  await mpage.waitForTimeout(300);
  const mCardBox = await mCardBody.boundingBox();
  await mpage.mouse.click(mCardBox.x + 4, mCardBox.y + mCardBox.height / 2);
  check('map narrow: tap opens the card menu', await until(async () => (await mpage.locator('.eip-pop').count() === 1)));
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Rename…'}));
  check('map narrow: menu Rename opens the input', await until(async () => (await mpage.locator('.eip-input').count() === 1)));

  const ib = await mpage.locator('.eip-input').boundingBox();
  await mpage.touchscreen.tap(ib.x + ib.width / 2, ib.y + ib.height / 2);
  check('map narrow: a touch INTO the input does not dismiss it (away-listener leak)', await until(async () => (await mpage.locator('.eip-input').count() === 1)));

  await mpage.locator('.eip-input').fill('Reading sessions get shorter');
  await mpage.keyboard.press('Enter');
  check('map narrow: commit lands after the away-tap proof', await until(async () => ((await mpage.evaluate(() => localStorage.getItem('map-src'))).includes('Reading sessions get shorter'))));
  check('map narrow: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- why narrow (mobile-emulated): coarse menu-first redirect ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  await mpage.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'Edit tree source'}).click();
  await mpage.getByRole('button', {name: 'Reading retention'}).click();
  await mpage.waitForTimeout(600);

  /* "Reading reminders" (srcLine 5) is a solution card: tap its LABEL text
     (a [data-edit="label"] field that shares the card's own srcLine — unlike
     its assumption rows, which are authored on THEIR OWN line and correctly
     stay direct, same as map's readout panel). The label sits fully inside
     the card rect's hit area, so the redirect must find the same-line
     data-menu rect and open the card menu instead of the label editor. */
  const labelField = mpage.locator('#preview svg [data-edit="label"][data-line="5"]').first();
  await labelField.scrollIntoViewIfNeeded();
  await mpage.waitForTimeout(300);
  const labelBox = await labelField.boundingBox();
  await mpage.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  check('why: coarse label-field tap opens the menu, not the label editor', await until(async () => (await mpage.locator('.eip-pop').count() === 1)));
  await mpage.keyboard.press('Escape');
  await mpage.waitForTimeout(200);
  check('why narrow: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- risk (energy) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/energy/risk/', {waitUntil: 'networkidle'});
  const source = p.getByRole('button', {name: 'Show source editor'});
  await source.waitFor({state: 'visible', timeout: 3000}).catch(() => {});
  if(await source.isVisible()) await source.click();
  await p.getByRole('button', {name: 'Route to market'}).click();
  await p.waitForTimeout(600);
  const before = await p.evaluate(() => localStorage.getItem('risk-src'));
  await p.locator('[data-field="level"]').first().click();
  check('risk: overlay opens prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === '70')));
  await p.locator('.eip-input').fill('90');
  await p.keyboard.press('Enter');
  const after = await untilValue(() => p.evaluate(() => localStorage.getItem('risk-src')),
    after => (after.includes('floor: 90') && !after.includes('floor: 70')));
  check('risk: floor level rewrite lands', after.includes('floor: 90') && !after.includes('floor: 70'));
  check('risk: diagram re-rendered', (await p.locator('#preview svg').innerHTML()).includes('Floor 90'));
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  check('risk: one undo reverts', await until(async () => ((await p.evaluate(() => localStorage.getItem('risk-src'))) === before)));
  check('risk: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- cycles (energy) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/energy/cycles/', {waitUntil: 'networkidle'});
  const source = p.getByRole('button', {name: 'Show source editor'});
  await source.waitFor({state: 'visible', timeout: 3000}).catch(() => {});
  if(await source.isVisible()) await source.click();
  await p.getByRole('button', {name: 'Wexcombe base case'}).click();
  await p.waitForTimeout(1000);
  const before = await p.evaluate(() => localStorage.getItem('cycles-src'));
  await p.locator('[data-field="budget"]').first().click();
  check('cycles: overlay prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === '6000')));
  await p.locator('.eip-input').fill('3000');
  await p.keyboard.press('Enter');
  check('cycles: budget rewrite lands', await until(async () => ((await p.evaluate(() => localStorage.getItem('cycles-src'))).includes('cycles: 3000 over 15yr'))));
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  check('cycles: one undo reverts', await until(async () => ((await p.evaluate(() => localStorage.getItem('cycles-src'))) === before)));
  check('cycles: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- wardley: name edit, stage cycle, drag writes text, vertical no-op ---- */
{
  const wpage = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const werrors = trackErrors(wpage);
  await wpage.goto((process.env.BASE || 'http://localhost:8087') + '/wardley/', {waitUntil: 'networkidle'});
  await wpage.getByRole('button', {name: 'Edit landscape source'}).click();
  await wpage.waitForTimeout(500);
  const focusWardleySource = async () => {
    if(!(await wpage.locator('.cm-content').isVisible()))
      await wpage.getByRole('button', {name: 'Edit landscape source'}).click();
    await wpage.locator('.cm-content').click();
  };
  const openWideWardleyMenu = async raw => {
    const menu = wpage.locator('[data-edit="componentmenu"][data-raw="' + raw + '"]').first();
    /* Desktop menus are deliberately quiet while a claim is being read. The
       claim's visible title is the real hover corridor; the ensuing click
       still lands on the isolated 44px menu target, never an invisible live
       plane. The bridge simply keeps the pair's hover envelope continuous. */
    await wpage.locator('[data-title-hit][data-raw="' + raw + '"]').first().hover();
    await menu.click();
  };

  // name edit commits to the editor text and every edge mention
  await wpage.locator('[data-edit="name"][data-raw="Catalogue DB"]').first().click();
  check('wardley: name editor opens prefilled', await until(async () => (await wpage.locator('.eip-input').inputValue() === 'Catalogue DB')));
  await wpage.locator('.eip-input').fill('Postgres');
  await wpage.keyboard.press('Enter');
  const wsrc = await untilValue(() => wpage.evaluate(() => localStorage.getItem('wardley-src')),
    wsrc => (wsrc.includes('Postgres @ commodity') && wsrc.includes('-> Postgres') && !wsrc.includes('Catalogue DB')));
  check('wardley: rename hits declaration + edges', wsrc.includes('Postgres @ commodity') && wsrc.includes('-> Postgres') && !wsrc.includes('Catalogue DB'));

  // stage cycle: click the pill rect steps custom -> product
  // the text element covers the pill centre (that's the name target) — cycle stage from the capsule's edge
  await wpage.locator('rect[data-edit="stage"][data-raw="custom"]').first().click({position: {x: 8, y: 13}});
  const wsrc2 = await untilValue(() => wpage.evaluate(() => localStorage.getItem('wardley-src')),
    wsrc2 => (wsrc2.includes('Recommendations @ product')));
  check('wardley: stage cycle writes the next stage word', wsrc2.includes('Recommendations @ product'));

  // real mouse drag writes a numeric position; Cmd+Z restores it
  const pill = wpage.locator('#preview svg g[data-drag="evo"]', {hasText: 'Library'}).first();
  const box = await pill.boundingBox();
  await wpage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await wpage.mouse.down();
  await wpage.mouse.move(box.x + box.width / 2 - 180, box.y + box.height / 2, {steps: 8});
  await wpage.mouse.up();
  const wsrc3 = await untilValue(() => wpage.evaluate(() => localStorage.getItem('wardley-src')),
    wsrc3 => (/Library @ 0\.\d+/.test(wsrc3)));
  check('wardley: drag writes @ 0.NN', /Library @ 0\.\d+/.test(wsrc3));
  await focusWardleySource();
  await wpage.keyboard.press('ControlOrMeta+z');
  const wsrc4 = await untilValue(() => wpage.evaluate(() => localStorage.getItem('wardley-src')),
    wsrc4 => (wsrc4.includes('Library @ product')));
  check('wardley: Cmd+Z undoes the drag', wsrc4.includes('Library @ product'));

  // vertical drag leaves the text untouched
  const pill2 = wpage.locator('#preview svg g[data-drag="evo"]', {hasText: 'Recommendations'}).first();
  const box2 = await pill2.boundingBox();
  await wpage.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await wpage.mouse.down();
  await wpage.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2 + 140, {steps: 6});
  await wpage.mouse.up();
  const wsrc5 = await untilValue(() => wpage.evaluate(() => localStorage.getItem('wardley-src')),
    wsrc5 => (wsrc5 === wsrc4));
  check('wardley: vertical drag is a no-op on the text', wsrc5 === wsrc4);

  // add zone: the Field keeps desktop add controls quiet until their row is
  // engaged; hover activates the real stage-specific 44px plane, then a click
  // opens an empty EIP input → type Cache → Enter. This must not regress to an
  // always-live invisible control that steals a normal field click.
  const customAdd = wpage.locator('[data-edit="additem"][data-stage="custom"]').first();
  await wpage.locator('[data-strategic-add-row] [data-add-bridge]').hover();
  await customAdd.click();
  check('wardley: add zone opens the eip-input', await until(async () => (await wpage.locator('.eip-input').count() === 1)));
  await wpage.locator('.eip-input').fill('Cache');
  await wpage.keyboard.press('Enter');
  await wpage.waitForTimeout(500);
  const wsrc7 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  const lines7 = wsrc7.split(/\r?\n/);
  const cacheIdx = lines7.findIndex(l => l.trim() === 'Cache @ custom');
  const firstEdgeIdx7 = lines7.findIndex(l => l.includes('->'));
  check('wardley: add zone inserts the component before the edge block (only blanks between)',
    cacheIdx >= 0 && firstEdgeIdx7 > cacheIdx &&
    lines7.slice(cacheIdx + 1, firstEdgeIdx7).every(l => l.trim() === ''));
  check('wardley: added component renders in the map',
    (await wpage.locator('#preview svg').innerHTML()).includes('Cache'));
  check('wardley: pre-entry add returns focus to the fresh artifact component, not the editor', await wpage.evaluate(() =>
    document.activeElement?.dataset.edit === 'name' &&
    document.activeElement?.dataset.raw === 'Cache' &&
    !document.activeElement.closest('.cm-editor')));

  // component menu: tap Cache's ⋯ → danger row removes the declaration + any edge mentions
  await openWideWardleyMenu('Cache');
  check('wardley: component menu exposes an accessible evolution alternative before dependency and danger actions', await until(async () => ((await wpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Evolution…|Needs…|Inspect…|Remove component')));
  await wpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}).click();
  await wpage.waitForTimeout(500);
  const wsrc8 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: remove component drops the declaration', !wsrc8.includes('Cache @ custom'));
  check('wardley: remove component leaves no edge remnant', !wsrc8.includes('-> Cache'));

  // CM keymaps need focus first (this section's existing pattern); ONE undo
  // must round-trip the whole removal (applyLineOps' single-dispatch proof)
  await focusWardleySource();
  await wpage.keyboard.press('ControlOrMeta+z');
  const wsrc9 = await untilValue(() => wpage.evaluate(() => localStorage.getItem('wardley-src')),
    wsrc9 => (wsrc9 === wsrc7));
  check('wardley: one undo restores the full pre-removal text (applyLineOps one history event)', wsrc9 === wsrc7);

  // remove a LINKED component (Recommendations sits in two chains) — this is the
  // multi-op removal (declaration delete + edge splices/deletes) that
  // applyLineOps exists for; the earlier Cache remove was single-op
  await openWideWardleyMenu('Recommendations');
  await wpage.waitForTimeout(200);
  await wpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}).click();
  await wpage.waitForTimeout(500);
  const wsrc10 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: linked remove splices the chains (no -> Recommendations, no Recommendations ->, no declaration)',
    !/->\s*recommendations|recommendations\s*->|recommendations\s*@/i.test(wsrc10));
  // the 3-chain "… -> Library -> Recommendations -> <end>" must splice to
  // "… -> Library -> <end>" — endpoint name is whatever earlier steps
  // renamed it to, so assert the join, not the name
  check('wardley: the 3-chain kept its ends after the splice', /reading\s*->\s*library\s*->\s*\S/i.test(wsrc10));
  await wpage.locator('.cm-content').click();
  await wpage.keyboard.press('ControlOrMeta+z');
  check('wardley: one undo restores the multi-op removal (single dispatch)', await until(async () => ((await wpage.evaluate(() => localStorage.getItem('wardley-src'))) === wsrc9)));

  // narrow: a TAP on the ghost's strip places it, comment kept before //
  await wpage.setViewportSize({width: 430, height: 900});
  await wpage.waitForTimeout(600);
  const ghostTrack = wpage.locator('#preview svg g[data-strip=""]', {has: wpage.locator('circle[stroke-dasharray]')}).first().locator('[data-track]');
  await ghostTrack.scrollIntoViewIfNeeded();
  await wpage.waitForTimeout(200);
  const gb = await ghostTrack.boundingBox();
  await wpage.mouse.click(gb.x + gb.width * 0.6, gb.y + gb.height / 2);
  const wsrc6 = await untilValue(() => wpage.evaluate(() => localStorage.getItem('wardley-src')),
    wsrc6 => (/Analytics pipeline @ 0\.\d+\s+\/\//.test(wsrc6)));
  check('wardley: tap-to-place writes @ before the trailing comment', /Analytics pipeline @ 0\.\d+\s+\/\//.test(wsrc6));
  check('wardley: no console/page errors', werrors.length === 0);
  await wpage.close();
}

/* ---- wardley narrow (mobile-emulated): add-card, focus opt-out, tap-to-place,
   remove — a 430px DESKTOP viewport (above) still reports pointer:fine, so the
   focus-opt-out assertion needs a real touch-emulated context. ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  await mpage.goto((process.env.BASE || 'http://localhost:8087') + '/wardley/', {waitUntil: 'networkidle'});
  await mpage.waitForTimeout(600);

  /* The narrow ledger's evolution strip is a precise direct manipulation
     target; the row title and its contextual menu are different controls.
     Keep this as a real coarse-pointer event-topology check: either tap must
     open its intended EIP route without moving the ruler or writing source. */
  const sourceBeforePhoneControl = () => mpage.evaluate(() => localStorage.getItem('wardley-src'));
  const titleBeforePhoneControl = await sourceBeforePhoneControl();
  await settledTap(mpage, mpage.locator('[data-title-hit][data-edit="name"][data-raw="Library"]').first());
  check('wardley narrow: visible title opens Rename without placing the ruler', await until(async () =>
    (await mpage.locator('.eip-input').count() === 1 && await mpage.locator('.eip-input').inputValue() === 'Library')));
  await new Promise(r => setTimeout(r, 250));
  check('wardley narrow: title tap writes nothing', (await sourceBeforePhoneControl()) === titleBeforePhoneControl);
  await mpage.keyboard.press('Escape');
  const menuBeforePhoneControl = await sourceBeforePhoneControl();
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Library"]').first());
  check('wardley narrow: visible menu opens without placing the ruler', await until(async () =>
    (await mpage.locator('.eip-pop button', {hasText: 'Needs…'}).count() === 1)));
  await new Promise(r => setTimeout(r, 250));
  check('wardley narrow: menu tap writes nothing', (await sourceBeforePhoneControl()) === menuBeforePhoneControl);
  await mpage.keyboard.press('Escape');

  // tap the "+ Add component" card (no data-stage on narrow) → type Inbox → Enter
  await settledTap(mpage, mpage.locator('[data-edit="additem"]').first());
  await mpage.locator('.eip-input').fill('Inbox');
  await mpage.keyboard.press('Enter');
  const msrc = await untilValue(() => mpage.evaluate(() => localStorage.getItem('wardley-src')),
    msrc => (/^Inbox$/m.test(msrc)));
  check('wardley narrow: add-card inserts Inbox as an unplaced ghost (no stage)', /^Inbox$/m.test(msrc));
  check('wardley narrow: coarse-pointer add opts OUT of editor focus', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));

  // tap Inbox's ghost strip at ~70% along its track
  const inboxTrack = mpage.locator('#preview svg g[data-strip=""][data-name="Inbox"] [data-track]');
  await inboxTrack.scrollIntoViewIfNeeded();
  await mpage.waitForTimeout(300);
  const itb = await inboxTrack.boundingBox();
  await mpage.mouse.click(itb.x + itb.width * 0.7, itb.y + itb.height / 2);
  const msrc2 = await untilValue(() => mpage.evaluate(() => localStorage.getItem('wardley-src')),
    msrc2 => (/Inbox @ 0\.(6[89]|7[01]?)\b/.test(msrc2)));
  check('wardley narrow: tap-to-place at ~70% writes @ 0.68-0.71', /Inbox @ 0\.(6[89]|7[01]?)\b/.test(msrc2));

  // remove Inbox via the card's ⋯ menu
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Inbox"]').first());
  await mpage.waitForTimeout(200);
  await settledTap(mpage, mpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}));
  await mpage.waitForTimeout(600);
  const msrc3 = await mpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley narrow: remove via the card menu drops Inbox', !/\bInbox\b/.test(msrc3));

  /* ---- mobile-input wardley stage: EDGES become phone-editable. The ⋯ menu
     grows a Needs… submenu — every OTHER component as a marked toggle row
     (on = "this -> that" exists); a tap toggles the edge via addEdge/removeEdge,
     the chain-splitting rewrite. State here is the pristine Lantern example
     (the Inbox add/place/remove round-tripped). ---- */
  const wSrc = () => mpage.evaluate(() => localStorage.getItem('wardley-src'));
  // open Library's ⋯ → the menu carries Needs… above the danger Remove
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Library"]').first());
  check('wardley needs: the ⋯ menu shows a keyboard evolution operation, Needs… and Remove', await until(async () => (await mpage.locator('.eip-pop button', {hasText: 'Evolution…'}).count() === 1 &&
    await mpage.locator('.eip-pop button', {hasText: 'Needs…'}).count() === 1 &&
    await mpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}).count() === 1)));
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Evolution…'}));
  check('wardley evolution: menu offers every named ruler position', await until(async () =>
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Genesis|Custom|Product|Commodity'));
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Custom'}));
  check('wardley evolution: keyboard/menu choice writes the selected evolution claim', await until(async () =>
    (await wSrc()).includes('Library @ custom')));
  await settledTap(mpage, mpage.locator('.stage .actions .touch-undo'));
  check('wardley evolution: one touch undo restores the selected evolution claim', await until(async () => (await wSrc()) === msrc3));
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Library"]').first());
  // open the checklist: 6 other components, existing deps marked, anchor + self absent
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Needs…'}));
  check('wardley needs: checklist lists every OTHER component (anchor + self absent)', await until(async () => (await mpage.locator('.eip-pop button').count() === 6 &&
    await mpage.locator('.eip-pop button', {hasText: 'Library'}).count() === 0 &&
    await mpage.locator('.eip-pop button', {hasText: 'Reading'}).count() === 0)));
  check('wardley needs: exactly the existing deps are marked on',
    (await mpage.locator('.eip-pop button.on').allInnerTexts()).sort().join('|') ===
    'Notification service|Recommendations');
  /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
  await new Promise(r => setTimeout(r, 250));
  check('wardley needs: opening menu + checklist commits NOTHING (no silent commit)',
    (await wSrc()) === msrc3);
  check('wardley needs: no page h-scroll with the checklist open', await mpage.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1));

  // toggle OFF the MID-CHAIN pair: Library -> Recommendations sits in the
  // middle of "Reading -> Library -> Recommendations -> Catalogue DB" —
  // the split must leave both halves as their own chains
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Recommendations'}));
  const wsrc1 = await untilValue(() => wSrc(),
    wsrc1 => (/^Reading -> Library$/m.test(wsrc1) &&
    /^Recommendations -> Catalogue DB$/m.test(wsrc1) &&
    !/Library\s*->\s*Recommendations/.test(wsrc1)));
  check('wardley needs: mid-chain toggle OFF splits the chain into two 2-node chains',
    /^Reading -> Library$/m.test(wsrc1) &&
    /^Recommendations -> Catalogue DB$/m.test(wsrc1) &&
    !/Library\s*->\s*Recommendations/.test(wsrc1));
  /* Phone is a source-order ledger, not the wide Field's metric header. Prove
     the redraw through the factual dependency rows it is designed to expose. */
  check('wardley needs: the phone ledger redraws the removed dependency facts',
    await until(async () => {
      const library = await mpage.locator('#preview svg g[data-drag][data-name="Library"]').textContent();
      const recommendations = await mpage.locator('#preview svg g[data-drag][data-name="Recommendations"]').textContent();
      return library.includes('NEEDS · Notification service') && !library.includes('Recommendations') &&
        recommendations.includes('NEEDED BY · Book clubs');
    }));
  check('wardley needs: coarse toggle does NOT focus the editor', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));
  await settledTap(mpage, mpage.locator('.stage .actions .touch-undo'));
  check('wardley needs: ONE ↶ Undo restores the split chain (single dispatch)', await until(async () => ((await wSrc()) === msrc3)));

  // toggle ON: Book clubs gains "needs Catalogue DB" — a fresh 2-node line appends
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Book clubs"]').first());
  await mpage.waitForTimeout(200);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Needs…'}));
  await mpage.waitForTimeout(200);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Catalogue DB'}));
  const wsrc2 = await untilValue(() => wSrc(),
    wsrc2 => (/^Book clubs -> Catalogue DB$/m.test(wsrc2)));
  check('wardley needs: toggle ON appends the edge as its own line',
    /^Book clubs -> Catalogue DB$/m.test(wsrc2));
  check('wardley needs: the phone ledger redraws the added dependency fact',
    await until(async () => {
      const bookClubs = await mpage.locator('#preview svg g[data-drag][data-name="Book clubs"]').textContent();
      return /NEEDS · [\s\S]*Catalogue DB(?=NEEDED BY ·)/.test(bookClubs) && !bookClubs.includes('NEEDED BY · Catalogue DB');
    }));

  // WIDE map, still coarse (tablet-shaped): the added edge is a drawn arrow,
  // and the same menu path removes it — the single-edge-line case in browser
  await mpage.setViewportSize({width: 1194, height: 834});
  check('wardley needs: the wide map draws the added edge (10 arrows)', await until(async () => (await mpage.locator('#preview svg .edge').count() === 10)));
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Book clubs"]').first());
  await mpage.waitForTimeout(200);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Needs…'}));
  check('wardley needs: wide checklist marks the just-added dep on', await until(async () => (await mpage.locator('.eip-pop button.on', {hasText: 'Catalogue DB'}).count() === 1)));
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Catalogue DB'}));
  check('wardley needs: wide toggle OFF deletes the whole single-edge line (back to baseline)', await until(async () => ((await wSrc()) === msrc3 &&
    await mpage.locator('#preview svg .edge').count() === 9)));
  await mpage.setViewportSize({width: 390, height: 844});   // back to phone for the blocks below
  await mpage.waitForTimeout(600);
  check('wardley narrow: no console/page errors', merrors.length === 0);

  /* ---- mobile-input PILOT: /timeline's narrow relayout is now fully phone-
     editable ("the card is the control"). Every milestone row is a data-menu
     cardmenu; tapping it opens Rename/Dates/Status…/Lane…/note/Remove — no
     silent commit on a coarse tap. ＋ Add to <lane> capsules close each lane.
     Same round-trip contract as the tree/why blocks above: commit, assert, ONE
     touch-Undo, assert full revert to the pre-menu baseline before the next
     action starts clean. ---- */
  await mpage.goto((process.env.BASE || 'http://localhost:8087') + '/timeline/', {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'App launch programme'}).click();
  /* This settle stays a sleep. The poll that replaced it waited for the narrow
     relayout to RENDER, which happens before the example's text reaches
     localStorage through the editor's debounce — so the baseline below captured
     the PREVIOUS document, and every "commits NOTHING" and one-Undo check that
     compares against it failed. Same class as tlTapCard's box: the poll's
     condition was true earlier than the state the assertions depend on. */
  await mpage.waitForTimeout(800);
  const tlNarrow = await untilValue(() => mpage.evaluate(() => {
    const svg = document.querySelector('#preview svg');
    return {narrow: !!(svg && svg.hasAttribute('data-narrow')),
      menus: document.querySelectorAll('#preview svg g[data-edit="cardmenu"][data-menu]').length};
  }),
    /* poll for the FULL assertion, not just `narrow`: data-narrow can land before the
       cardmenu groups do, and the counts below are read from this same snapshot. */
    tlNarrow => (tlNarrow.narrow && tlNarrow.menus === 7));
  check('timeline narrow: the phone preview is the narrow relayout (data-narrow)', tlNarrow.narrow);
  check('timeline narrow: every milestone row is now a data-menu cardmenu (the pilot landed)', tlNarrow.menus === 7);

  const tlHit = line => mpage.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tlTapCard = async line => {
    const h = tlHit(line);
    await h.scrollIntoViewIfNeeded();
    /* This sleep stays. A box that EXISTS is not a box that has STOPPED MOVING:
       scrollIntoViewIfNeeded returns before the scroll settles, so polling for the
       box's existence succeeds immediately at stale coordinates and the raw
       mouse.click below lands on a neighbouring card — which commits an edit, breaks
       "a coarse card tap commits NOTHING", and corrupts the baseline every following
       Undo check compares against. Cost 11 failures during the 2026-08-17 conversion:
       the poll's condition was already true before the action, the one case the
       conversion rules say to leave alone. */
    await mpage.waitForTimeout(300);
    const b = await h.boundingBox();
    await mpage.mouse.click(b.x + 24, b.y + b.height / 2);   // left of the diamonds — the title/sub band
    await mpage.waitForTimeout(300);
  };
  const tlUndo = async () => {
    await settledTap(mpage, mpage.locator('.stage .actions .touch-undo'));
    await mpage.waitForTimeout(600);
  };
  const tlSrc = () => mpage.evaluate(() => localStorage.getItem('timeline-src'));
  const tlBase = await tlSrc();

  // Feature freeze (App, srcLine 1): the full menu, no silent commit
  await tlTapCard(1);
  check('timeline narrow: milestone tap opens the card menu with the expected rows (one popover)',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Dates…|Status…|Lane…|Add note…|Remove milestone' &&
    await mpage.locator('.eip-pop').count() === 1);
  /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
  await new Promise(r => setTimeout(r, 250));
  check('timeline narrow: a coarse card tap commits NOTHING on its own (menu-first, no silent step)',
    (await tlSrc()) === tlBase);

  // Status… → marked picker (none/done/risk); pick risk — a real rewrite, no bare-tap step
  await mpage.locator('.eip-pop button', {hasText: 'Status…'}).click();
  check('timeline narrow: Status… opens a marked picker (none current), not a blind step', await until(async () => ((await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'none|done|risk|fixed' &&
    (await mpage.locator('.eip-pop button.on').innerText()) === 'none')));
  await mpage.locator('.eip-pop button', {hasText: 'risk'}).click();
  check('timeline narrow: Status pick commits [risk]', await until(async () => (/App: Feature freeze [^\n]*\[risk\]/.test(await tlSrc()))));
  await tlUndo();
  check('timeline narrow: one Undo reverts the status', (await tlSrc()) === tlBase);

  // Lane… → submenu (existing lanes + New lane…); pick Marketing → rewrites the prefix
  await tlTapCard(1);
  await mpage.locator('.eip-pop button', {hasText: 'Lane…'}).click();
  check('timeline narrow: Lane… lists the model’s lanes (current marked) + New lane…', await until(async () => ((await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'App|Marketing|Compliance|New lane…' &&
    (await mpage.locator('.eip-pop button.on').innerText()) === 'App')));
  await mpage.locator('.eip-pop button', {hasText: 'Marketing'}).click();
  check('timeline narrow: Lane… pick rewrites the lane prefix', await until(async () => (/^Marketing: Feature freeze\b/m.test(await tlSrc()))));
  await tlUndo();
  check('timeline narrow: one Undo reverts the lane', (await tlSrc()) === tlBase);

  // ＋ Add to App capsule → inserts a lane-prefixed milestone; coarse add opts OUT of editor focus
  await settledTap(mpage, mpage.locator('#preview svg g[data-edit="additem"][data-lane="App"]'));
  await mpage.locator('.eip-input').fill('Pen test');
  await mpage.keyboard.press('Enter');
  check('timeline narrow: ＋ Add to App inserts a lane-prefixed dated milestone', await until(async () => (/^App: Pen test \d{4}-\d{2} \.\. \d{4}-\d{2}$/m.test(await tlSrc()))));
  check('timeline narrow: coarse-pointer add opts OUT of editor focus', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));
  await tlUndo();
  check('timeline narrow: one Undo removes the added milestone', (await tlSrc()) === tlBase);

  // Remove milestone → danger action drops the line; Undo restores it
  await tlTapCard(1);
  await mpage.locator('.eip-pop button.danger', {hasText: 'Remove milestone'}).click();
  await mpage.waitForTimeout(600);
  check('timeline narrow: Remove milestone drops the row', !/Feature freeze/.test(await tlSrc()));
  await tlUndo();
  check('timeline narrow: one Undo restores the removed milestone', (await tlSrc()) === tlBase);

  check('timeline narrow: no h-scroll with the edit targets added', await mpage.evaluate(() => {
    const pv = document.getElementById('preview');
    return pv.scrollWidth <= pv.clientWidth + 1;
  }));
  check('timeline narrow: no console/page errors', merrors.length === 0);

  /* ---- mobile-input STAGE (bets): the narrow board's cards are the control.
     Tap a card → Rename/values/kill/Remove menu (no silent commit); ＋ Add bet
     capsules close each group and ＋ Add group closes the board. Same
     round-trip contract as the timeline pilot block above: commit, assert,
     ONE touch-Undo, assert full revert before the next action. ---- */
  await mpage.goto((process.env.BASE || 'http://localhost:8087') + '/bets/', {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'Lantern portfolio'}).click();
  await mpage.waitForTimeout(800);   // stays — see the timeline block: render precedes the localStorage write
  const btNarrow = await untilValue(() => mpage.evaluate(() => ({
    narrow: !!document.querySelector('#preview svg [data-narrow]'),
    menus: document.querySelectorAll('#preview svg g[data-edit="cardmenu"][data-menu]').length,
    addbets: document.querySelectorAll('#preview svg [data-edit="addbet"]').length,
    addgroups: document.querySelectorAll('#preview svg [data-edit="addgroup"]').length,
  })),
    /* poll for the FULL assertion — see the timeline block: data-narrow can precede
       the cardmenus, and menus/addbets/addgroups are read from this snapshot. */
    btNarrow => (btNarrow.narrow && btNarrow.menus === 5 && btNarrow.addbets === 2 && btNarrow.addgroups === 1));
  check('bets narrow: the phone preview is the narrow relayout (data-narrow)', btNarrow.narrow);
  check('bets narrow: every bet card is a data-menu cardmenu', btNarrow.menus === 5);
  check('bets narrow: a ＋ Add bet capsule per group + one ＋ Add group at the foot',
    btNarrow.addbets === 2 && btNarrow.addgroups === 1);

  const btHit = line => mpage.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const btTapCard = async line => {
    const h = btHit(line);
    await h.scrollIntoViewIfNeeded();
    await mpage.waitForTimeout(300);   // stays — see tlTapCard: existence is not stability
    const b = await h.boundingBox();
    await mpage.mouse.click(b.x + 10, b.y + 6);   // the card's top padding sliver
    await mpage.waitForTimeout(300);
  };
  const btSrc = () => mpage.evaluate(() => localStorage.getItem('bets-src'));
  const btBase = await btSrc();

  /* The visible odds glyph itself—not the hidden menu plane—must route to
     the coarse row menu. This guards the 44px menu-first contract against a
     later direct-value target or SVG hit-order regression. */
  await settledTap(mpage, mpage.locator('#preview svg g[data-row="bet"]').filter({hasText: 'Referral flow v2'}).getByText('40–60%', {exact: true}));
  check('bets narrow: visible odds tap opens the coarse menu, not a direct field',
    await mpage.locator('.eip-pop').count() === 1 && await mpage.locator('.eip-input').count() === 0);
  await new Promise(r => setTimeout(r, 250));
  check('bets narrow: visible odds tap commits NOTHING on its own', (await btSrc()) === btBase);
  await mpage.keyboard.press('Escape');

  // Referral flow v2 (srcLine 5): the full six-row menu, no silent commit
  await btTapCard(5);
  check('bets narrow: card tap opens the menu with the expected rows (one popover)',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') ===
      'Rename…|Edit stake…|Edit odds…|Edit payoff…|Edit kill criterion…|Remove bet' &&
    await mpage.locator('.eip-pop').count() === 1);
  /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
  await new Promise(r => setTimeout(r, 250));
  check('bets narrow: a coarse card tap commits NOTHING on its own (menu-first)', (await btSrc()) === btBase);

  // Rename… routes to the name target's input, prefilled; commit rewrites only the name
  await mpage.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('bets narrow: Rename… opens prefilled with the bet name', await until(async () => (await mpage.locator('.eip-input').inputValue() === 'Referral flow v2')));
  await mpage.locator('.eip-input').fill('Referral spine');
  await mpage.keyboard.press('Enter');
  check('bets narrow: Rename commits — attrs survive the rewrite', await until(async () => (/^  Referral spine: stake 80, odds 40-60%, payoff 300-500$/m.test(await btSrc()))));
  await tlUndo();
  check('bets narrow: one Undo reverts the rename', (await btSrc()) === btBase);

  // ＋ Add bet into Growth bets (the capsule carries the GROUP's srcLine, 4):
  // lands after the group's last bet block, typed name replaces the placeholder
  await settledTap(mpage, mpage.locator('#preview svg g[data-edit="addbet"][data-line="4"]'));
  await mpage.locator('.eip-input').fill('Pen test');
  await mpage.keyboard.press('Enter');
  check('bets narrow: ＋ Add bet inserts a parseable placeholder into the group', await until(async () => ((await btSrc()).split(/\r?\n/)[8] === '  Pen test: stake 50, odds 40-60%, payoff 100-200')));
  check('bets narrow: coarse-pointer add opts OUT of editor focus', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));
  check('bets narrow: focus lands on the fresh bet\'s own 44px menu route (positive assertion)',
    await until(() => mpage.evaluate(() => {
      const el = document.activeElement;
      return !!el && el.dataset && el.dataset.edit === 'cardmenu' && el.dataset.line === '9';
    })));
  await tlUndo();
  check('bets narrow: one Undo removes the added bet', (await btSrc()) === btBase);

  // ＋ Add group closes the board
  await settledTap(mpage, mpage.locator('#preview svg g[data-edit="addgroup"]'));
  await mpage.locator('.eip-input').fill('Ops bets');
  await mpage.keyboard.press('Enter');
  check('bets narrow: ＋ Add group appends a heading at the foot', await until(async () => (/\nOps bets\s*$/.test(await btSrc()))));
  await tlUndo();
  check('bets narrow: one Undo removes the added group', (await btSrc()) === btBase);

  // Remove bet: the danger action deletes the bet line AND its kill child
  await btTapCard(5);
  await mpage.locator('.eip-pop button.danger', {hasText: 'Remove bet'}).click();
  await mpage.waitForTimeout(600);
  const btRemoved = await btSrc();
  check('bets narrow: Remove bet drops the line and its kill child',
    !/Referral flow v2/.test(btRemoved) && !/Signups per referral/.test(btRemoved));
  await tlUndo();
  check('bets narrow: one Undo restores the removed bet', (await btSrc()) === btBase);

  // a value edit still works through the menu (the stage didn't regress values)
  await btTapCard(5);
  await mpage.locator('.eip-pop button', {hasText: 'Edit odds…'}).click();
  await mpage.locator('.eip-input').fill('35-55');
  await mpage.keyboard.press('Enter');
  check('bets narrow: menu value edit still commits', await until(async () => ((await btSrc()).includes('odds 35-55%'))));
  await tlUndo();
  check('bets narrow: one Undo reverts the value edit', (await btSrc()) === btBase);

  check('bets narrow: no h-scroll with the capsules + targets added', await mpage.evaluate(() => {
    const pv = document.getElementById('preview');
    return pv.scrollWidth <= pv.clientWidth + 1;
  }));
  check('bets narrow: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- mobile-input TAIL (energy/cycles): each band's ⋯ (a 44px top-right card
   menu) exposes the OPTIONAL-key structure — add/remove charge/second/drift/
   discount/augment — while the num pills stay directly editable. A ghost band
   shows a one-tap dashed ＋ capsule instead (add is non-destructive, visible,
   undoable → no confirm). Coarse taps: the SVG pans, so tap by scrolling the
   target to centre then clicking fresh coords (Playwright touch clicks get eaten
   by the pan handler; scrollIntoViewIfNeeded hangs on an SVG <g>). Same
   round-trip contract as the timeline pilot: commit, assert, ONE touch-Undo,
   assert full revert before the next action. Served on the tools origin at
   /energy/cycles/ (files sit physically there). ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  const BASEU = (process.env.BASE || 'http://localhost:8087');
  await mpage.goto(BASEU + '/energy/cycles/', {waitUntil: 'networkidle'});
  const source = mpage.getByRole('button', {name: 'Show source editor'});
  await source.waitFor({state: 'visible', timeout: 3000}).catch(() => {});
  if(await source.isVisible()) await source.click();
  await mpage.getByRole('button', {name: 'Wexcombe base case'}).click();
  await mpage.waitForTimeout(900);
  const cySrc = () => mpage.evaluate(() => localStorage.getItem('cycles-src'));
  // scroll the target to centre, then click fresh viewport coords (see block note)
  /* cycles renders through a worker: while a render is pending the preview is
     inert and taps are (correctly) rejected as stale. Fixed sleeps outlast the
     worker locally but not on a loaded CI runner — so settle on !inert, not on
     wall-clock (first red: the price ⋯ menu, CI eip shard, 2026-08-04). */
  const cySettle = () => mpage.waitForFunction(
    () => !document.getElementById('preview')?.inert, null, {timeout: 10_000});
  const cyTap = async sel => {
    await cySettle();
    const pt = await mpage.evaluate(s => { const g = document.querySelector(s); if(!g) return null;
      g.scrollIntoView({block: 'center'}); const r = g.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }, sel);
    if(!pt) return false;
    await mpage.waitForTimeout(150);
    await mpage.mouse.click(pt.x, pt.y);
    await mpage.waitForTimeout(300);
    await cySettle();
    return true;
  };
  /* a still-open floating eip field can sit exactly over the scrolled actions
     row (post ux-polish geometry) and swallow the undo tap — dismiss it first
     the way a user would (an away pointerdown commits-and-closes; the add has
     already landed, so this keeps it). */
  const cyDismiss = async () => { await mpage.evaluate(() => {
    document.querySelector('input.eip-input')?.blur();   // blur = commit-and-close (untouched → keep)
  }); await mpage.waitForTimeout(250); };
  const cyUndo = async () => { await cyDismiss(); await cyTap('.stage .actions .touch-undo'); await mpage.waitForTimeout(400); await cySettle(); };
  const cyBase = await cySrc();

  const cyInfo = await mpage.evaluate(() => ({
    narrow: (document.querySelector('#preview svg')?.getAttribute('width') | 0) < 520,
    menus: document.querySelectorAll('#preview svg [data-edit="cardmenu"][data-menu]').length,
    hits: [...document.querySelectorAll('#preview svg [data-edit="cardmenu"] [data-hit]')]
      .map(r => { const b = r.getBoundingClientRect(); return Math.round(b.width) >= 44 && Math.round(b.height) >= 44; }),
  }));
  check('cycles narrow: the phone preview is the narrow relayout', cyInfo.narrow);
  check('cycles narrow: three band ⋯ card menus (data-menu)', cyInfo.menus === 3);
  check('cycles narrow: every ⋯ hit rect is ≥44px', cyInfo.hits.length === 3 && cyInfo.hits.every(Boolean));

  // band 2 (second): the ⋯ opens a one-row menu; a coarse tap commits NOTHING
  await cyTap('[data-edit="cardmenu"][data-band="second"] [data-hit]');
  check('cycles narrow: second ⋯ opens exactly Remove second cycle (one popover)',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Remove second cycle' &&
    await mpage.locator('.eip-pop').count() === 1);
  /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
  await new Promise(r => setTimeout(r, 250));
  check('cycles narrow: opening the ⋯ menu commits nothing (menu-first)', (await cySrc()) === cyBase);
  await mpage.locator('.eip-pop button.danger', {hasText: 'Remove second cycle'}).click();
  await mpage.waitForTimeout(500);
  check('cycles narrow: Remove second cycle drops the second: line', !/^second:/m.test(await cySrc()));
  await cyUndo();
  check('cycles narrow: one Undo restores the second cycle', (await cySrc()) === cyBase);

  // band 1 (price): charge is explicit in the example → a Remove row
  await cyTap('[data-edit="cardmenu"][data-band="price"] [data-hit]');
  check('cycles narrow: price ⋯ offers Remove charge (charge explicit in the example)',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Remove charge (use 45% default)');
  await mpage.keyboard.press('Escape');
  await mpage.waitForTimeout(150);

  // band 3 (life): drift + discount present → removes; plus Remove augmentation
  await cyTap('[data-edit="cardmenu"][data-band="life"] [data-hit]');
  check('cycles narrow: life ⋯ offers Remove drift/discount/augmentation',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') ===
    'Remove drift|Remove discount|Remove augmentation');
  await mpage.locator('.eip-pop button.danger', {hasText: 'Remove augmentation'}).click();
  await mpage.waitForTimeout(500);
  check('cycles narrow: Remove augmentation drops the augment: line', !/^augment:/m.test(await cySrc()));
  await cyUndo();
  check('cycles narrow: one Undo restores augmentation', (await cySrc()) === cyBase);

  // ADD via the ghost capsule: remove second → band 2 becomes a ＋ capsule → one-tap re-adds
  await cyTap('[data-edit="cardmenu"][data-band="second"] [data-hit]');
  await mpage.locator('.eip-pop button.danger', {hasText: 'Remove second cycle'}).click();
  await mpage.waitForTimeout(500);
  const cyGhost = await cySrc();
  const addedCapsule = await cyTap('[data-edit="addkey"][data-key="second"]');
  check('cycles narrow: the emptied band shows a ＋ Add second cycle capsule', addedCapsule);
  check('cycles narrow: tapping the ＋ capsule one-taps second back (no popover)',
    /^second:\s*35\.\.60%$/m.test(await cySrc()) && await mpage.locator('.eip-pop').count() === 0);
  check('cycles narrow: the added key lands canonically (after spread/charge)',
    (await cySrc()).split('\n').findIndex(l => /^second:/.test(l)) >= 3);
  check('cycles narrow: coarse-pointer add opts OUT of editor focus', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));
  await cyUndo();  // undo the add
  check('cycles narrow: one Undo removes the re-added second', (await cySrc()) === cyGhost);
  await cyUndo();  // undo the earlier remove → back to baseline
  check('cycles narrow: a second Undo restores the original remove', (await cySrc()) === cyBase);

  check('cycles narrow: no h-scroll with the ⋯ menus + capsules', await mpage.evaluate(() => {
    const pv = document.getElementById('preview');
    return pv.scrollWidth <= pv.clientWidth + 1;
  }));
  check('cycles narrow: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- mobile-input TAIL (energy/risk): each structure row's ⋯ opens the edits
   it owns — Rename, insure limit add/remove, Remove structure — while the num
   pills stay directly editable and the whole card still toggles the focus verdict
   by an empty-area tap. Merchant is the baseline (no menu). A ＋ Add structure
   capsule opens a Floor/Toll/Insure picker (the kind choice IS the commit step).
   Also proves the editField append fix (editing a share/fee a floor omitted was a
   silent no-op). Tap via scroll-to-centre + mouse.click (see the cycles block).
   Same commit/assert/ONE-Undo/revert contract. Served at /energy/risk/. ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  const BASEU = (process.env.BASE || 'http://localhost:8087');
  const rkEnc = t => Buffer.from(JSON.stringify({t}), 'utf8').toString('base64');
  const RKDOC = `title: Route to market — Wexcombe 100MW/2h
merchant: 60..180

floor: 70 share 60% fee 5
toll: 95
insure: premium 6 attach 65 limit 30`;
  const rkSrc = () => mpage.evaluate(() => localStorage.getItem('risk-src'));
  const rkTap = async sel => {
    const pt = await mpage.evaluate(s => { const g = document.querySelector(s); if(!g) return null;
      g.scrollIntoView({block: 'center'}); const r = g.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }, sel);
    if(!pt) return false;
    await mpage.waitForTimeout(150); await mpage.mouse.click(pt.x, pt.y); await mpage.waitForTimeout(300); return true;
  };
  const rkBtn = async txt => { await mpage.locator('.eip-pop button', {hasText: txt}).click(); await mpage.waitForTimeout(400); };
  const rkUndo = async () => { await rkTap('.stage .actions .touch-undo'); await mpage.waitForTimeout(400); };

  await mpage.goto(BASEU + '/energy/risk/#' + rkEnc(RKDOC), {waitUntil: 'networkidle'});
  await mpage.waitForTimeout(900);
  const rkBase = await rkSrc();

  const rkInfo = await mpage.evaluate(() => ({
    narrow: (document.querySelector('#preview svg')?.getAttribute('width') | 0) < 520,
    menus: document.querySelectorAll('#preview svg [data-edit="cardmenu"][data-menu]').length,
    merchantMenu: document.querySelectorAll('#preview svg [data-edit="cardmenu"][data-kind="merchant"]').length,
    hits: [...document.querySelectorAll('#preview svg [data-edit="cardmenu"] [data-hit]')]
      .map(r => { const b = r.getBoundingClientRect(); return Math.round(b.width) >= 44 && Math.round(b.height) >= 44; }),
  }));
  check('risk narrow: the phone preview is the narrow relayout', rkInfo.narrow);
  check('risk narrow: three structure ⋯ menus, merchant has none', rkInfo.menus === 3 && rkInfo.merchantMenu === 0);
  check('risk narrow: every ⋯ hit rect is ≥44px', rkInfo.hits.length === 3 && rkInfo.hits.every(Boolean));

  // insure ⋯: Rename / Remove limit / Remove structure; no silent commit
  await rkTap('[data-edit="cardmenu"][data-kind="insure"] [data-hit]');
  check('risk narrow: insure ⋯ shows Rename / Remove limit / Remove structure',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Remove limit|Remove structure');
  /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
  await new Promise(r => setTimeout(r, 250));
  check('risk narrow: opening the ⋯ menu commits nothing', (await rkSrc()) === rkBase);
  await rkBtn('Remove limit');
  check('risk narrow: Remove limit strips the limit clause', /^insure: premium 6 attach 65$/m.test(await rkSrc()));
  // re-open → now offers ＋ Add limit → appends the default (0.25·span = 30)
  await rkTap('[data-edit="cardmenu"][data-kind="insure"] [data-hit]');
  check('risk narrow: with limit gone the menu offers ＋ Add limit',
    (await mpage.locator('.eip-pop button').allInnerTexts()).some(t => /Add limit/.test(t)));
  await rkBtn('Add limit');
  check('risk narrow: ＋ Add limit appends limit 30', /^insure: premium 6 attach 65 limit 30$/m.test(await rkSrc()));
  await rkUndo(); await rkUndo();
  check('risk narrow: two Undos restore the insure baseline', (await rkSrc()) === rkBase);

  // Rename the toll via the ⋯ menu → Rename…
  await rkTap('[data-edit="cardmenu"][data-kind="toll"] [data-hit]');
  await rkBtn('Rename…');
  await mpage.locator('.eip-input').fill('Fixed PPA');
  await mpage.keyboard.press('Enter');
  check('risk narrow: Rename writes the quoted label', await until(async () => (/^toll: 95 "Fixed PPA"$/m.test(await rkSrc()))));
  await rkUndo();
  check('risk narrow: one Undo reverts the rename', (await rkSrc()) === rkBase);

  // Remove structure (toll)
  await rkTap('[data-edit="cardmenu"][data-kind="toll"] [data-hit]');
  await rkBtn('Remove structure');
  check('risk narrow: Remove structure drops the toll line', !/^toll:/m.test(await rkSrc()));
  await rkUndo();
  check('risk narrow: one Undo restores the toll', (await rkSrc()) === rkBase);

  // ＋ Add structure → picker (Floor/Toll/Insure); pick Insure → a merchant-derived leg
  await rkTap('[data-edit="addleg"]');
  check('risk narrow: ＋ Add structure opens a Floor/Toll/Insure picker (no silent add)',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Floor|Toll|Insure' &&
    (await rkSrc()) === rkBase);
  await rkBtn('Insure');
  check('risk narrow: picking Insure appends a merchant-derived leg', /^insure: premium 6 attach 66$/m.test(await rkSrc()));
  check('risk narrow: default add opens the fresh in-artifact label, never CodeMirror',
    await mpage.locator('.eip-input').count() === 1 && !(await mpage.evaluate(() =>
      document.activeElement?.closest('.cm-editor'))));
  await mpage.keyboard.press('Escape'); check('risk narrow: Escape cancels the untouched added leg', await until(async () => ((await rkSrc()) === rkBase)));
  await rkTap('[data-edit="addleg"]'); await rkBtn('Insure');
  await mpage.locator('.eip-input').fill('Named cover'); await mpage.keyboard.press('Enter'); check('risk narrow: naming the new leg is a second, in-artifact edit', await until(async () => (/insure: premium 6 attach 66 "Named cover"$/m.test(await rkSrc()))));
  await rkUndo(); await rkUndo();
  check('risk narrow: two Undos revert named creation (name, then leg)', (await rkSrc()) === rkBase);

  // the whole card still toggles the focus verdict via an empty-area tap (data-focus)
  const vBefore = await mpage.evaluate(() => document.getElementById('verdict').textContent);
  await rkTap('#preview svg [data-focus="2"]');
  check('risk narrow: an empty-card tap still toggles the focus verdict',
    (await mpage.evaluate(() => document.getElementById('verdict').textContent)) !== vBefore);

  check('risk narrow: no h-scroll with the ⋯ menus + capsule', await mpage.evaluate(() => {
    const pv = document.getElementById('preview');
    return pv.scrollWidth <= pv.clientWidth + 1;
  }));
  check('risk narrow: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- risk APPEND FIX (own fresh context): a floor written WITHOUT share/fee
   renders a share pill (100%) whose edit used to be a silent no-op. editField
   now appends the clause. Isolated context so no prior focus/scroll state can
   deflect the pill tap. ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  const enc = t => Buffer.from(JSON.stringify({t}), 'utf8').toString('base64');
  await mpage.goto((process.env.BASE || 'http://localhost:8087') +
    '/energy/risk/#' + enc('title: Bare floor\nmerchant: 60..180\n\nfloor: 70'), {waitUntil: 'networkidle'});
  await mpage.waitForTimeout(800);
  const pt = await mpage.evaluate(() => { const g = document.querySelector('[data-edit="num"][data-field="share"]');
    g.scrollIntoView({block: 'center'}); const r = g.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
  await mpage.waitForTimeout(150);
  await mpage.mouse.click(pt.x, pt.y);
  check('risk append-fix: the absent-share pill opens an input (prefilled 100)', await until(async () => (await mpage.locator('.eip-input').count() === 1 && await mpage.locator('.eip-input').inputValue() === '100')));
  await mpage.locator('.eip-input').fill('75');
  await mpage.keyboard.press('Enter');
  check('risk append-fix: editing an absent share now WRITES it (was a silent no-op)', await until(async () => (/^floor: 70 share 75%$/m.test(await mpage.evaluate(() => localStorage.getItem('risk-src'))))));
  check('risk append-fix: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- timeline desktop: per-lane add zone opens empty, typed value replaces
   the dated placeholder (not "New milestone" — that would test nothing) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  /* Three milestones exercise the live board composition. Sparse timelines use
     their single global add affordance; this block specifically covers the
     per-lane ghost zone. */
  const seed = {t: 'title: Pen test doc\nGrid: Existing item 2026-08 .. 2026-10\nGrid: Existing item two 2026-11 .. 2026-12\nGrid: Existing item three 2027-01 .. 2027-02\n'};
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(seed))), 'binary').toString('base64');
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/timeline/#' + hash, {waitUntil: 'networkidle'});
  await p.waitForTimeout(500);
  /* The live-wide artefact holds its physical type floor and can pan. Settle
     that programmatic pan before tapping; otherwise the scroll-close handler
     correctly dismisses the input that Playwright opened during auto-scroll. */
  const gridAdd = p.locator('[data-edit="additem"][data-lane="Grid"]').first();
  await gridAdd.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const gridAddBox = await gridAdd.boundingBox();
  await p.mouse.click(gridAddBox.x + gridAddBox.width / 2, gridAddBox.y + gridAddBox.height / 2);
  check('timeline: lane zone opens the eip-input empty', await until(async () => (await p.locator('.eip-input').inputValue() === '')));
  await p.locator('.eip-input').fill('Pen test');
  await p.keyboard.press('Enter');
  const t = await untilValue(() => p.evaluate(() => localStorage.getItem('timeline-src')),
    t => (/^Grid: Pen test \d{4}-\d{2} \.\. \d{4}-\d{2}$/m.test(t)));
  check('timeline: lane add writes a lane-prefixed dated placeholder, typed value in',
    /^Grid: Pen test \d{4}-\d{2} \.\. \d{4}-\d{2}$/m.test(t));
  check('timeline: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- bets: direct odds/kill cell edits + undo, and the coarse-pointer card
   menu (edit-stake via menu; Kill criterion… re-opens an existing kill field
   or inserts a fresh child line for a bet with none) — mirrors roadmap's
   card-menu shape (tap the row's data-hit rect, ONE undo per action, back
   to a captured baseline before the next action starts clean). ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/bets/', {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Lantern portfolio'}).click();
  await p.waitForTimeout(500);
  const baseline = await p.evaluate(() => localStorage.getItem('bets-src'));
  const undo = () => undoStep(p);

  // direct odds edit on "Referral flow v2" (srcLine 5): commits + re-renders
  await p.locator('[data-edit="odds"][data-line="5"]').click();
  check('bets: odds cell opens prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === '40–60%')));
  await p.locator('.eip-input').fill('35-55');
  await p.keyboard.press('Enter');
  const tOdds = await untilValue(() => p.evaluate(() => localStorage.getItem('bets-src')),
    tOdds => (tOdds.includes('odds 35-55%') && !tOdds.includes('odds 40-60%')));
  check('bets: odds edit commits to the editor text', tOdds.includes('odds 35-55%') && !tOdds.includes('odds 40-60%'));
  check('bets: board re-renders the new odds', (await p.locator('#preview svg').innerHTML()).includes('35–55%'));
  await undo();
  check('bets: one undo restores the pre-odds-edit baseline', (await p.evaluate(() => localStorage.getItem('bets-src'))) === baseline);

  // direct kill edit on the same bet's kill child (srcLine 6): an empty value REMOVES the line
  await p.locator('[data-edit="kill"][data-line="6"]').click();
  check('bets: kill field opens prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === 'Signups per referral stay under 0.3 by 2026-09-15')));
  await p.locator('.eip-input').fill('');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tKill = await p.evaluate(() => localStorage.getItem('bets-src'));
  check('bets: empty kill value removes the kill line', !/kill:.*Signups per referral/.test(tKill));
  check('bets: the bet now reads NO KILL CRITERION', (await p.locator('#preview svg').innerHTML()).includes('NO KILL CRITERION'));
  await undo();
  check('bets: one undo restores the removed kill line', (await p.evaluate(() => localStorage.getItem('bets-src'))) === baseline);

  // coarse-pointer card menu: tap the row's own hit rect (not a sub-cell) on
  // "Paid acquisition push" (srcLine 7) — the top-left padding sliver, same
  // dodge-the-text-element trick roadmap's suite uses
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tapCard = async line => {
    await tapCardMenu(p, await cardBody(line).boundingBox(), line);
  };
  await tapCard(7);
  check('bets: card menu shows the six rows (Rename + values + dynamic kill + Remove)', await until(async () => ((await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
      'Rename…|Edit stake…|Edit odds…|Edit payoff…|Edit kill criterion…|Remove bet')));

  // Rename… routes to the wide ledger's (edit-gated) name target
  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  check('bets: menu Rename opens the name input prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === 'Paid acquisition push')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  await tapCard(7);
  await p.locator('.eip-pop button', {hasText: 'Edit stake…'}).click();
  check('bets: menu Edit stake opens the stake input prefilled', await until(async () => (await p.locator('.eip-input').inputValue() === '220')));
  await p.locator('.eip-input').fill('200');
  await p.keyboard.press('Enter');
  const tStake = await untilValue(() => p.evaluate(() => localStorage.getItem('bets-src')),
    tStake => (tStake.includes('stake 200,') && !tStake.includes('stake 220,')));
  check('bets: menu Edit stake commits the new value', tStake.includes('stake 200,') && !tStake.includes('stake 220,'));
  await undo();
  check('bets: one undo restores the pre-menu-edit baseline', (await p.evaluate(() => localStorage.getItem('bets-src'))) === baseline);

  // menu Edit kill criterion… re-opens the EXISTING kill field for a bet that has one
  await tapCard(7);
  await p.locator('.eip-pop button', {hasText: 'Edit kill criterion…'}).click();
  check('bets: menu Edit kill criterion reopens the existing kill field', await until(async () => (await p.locator('.eip-input').inputValue() === 'CAC exceeds £40 for two consecutive months')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  // menu Add kill criterion… on a bare bet ("Sync engine rewrite", srcLine 11 —
  // NO KILL CRITERION today, so the label flips) inserts a fresh child line
  await tapCard(11);
  await p.locator('.eip-pop button', {hasText: 'Add kill criterion…'}).click();
  const tNewKill = await untilValue(() => p.evaluate(() => localStorage.getItem('bets-src')),
    tNewKill => (tNewKill.split(/\r?\n/).includes('    kill: reason')));
  check('bets: menu Kill criterion on a bare bet inserts a fresh kill child line',
    tNewKill.split(/\r?\n/).includes('    kill: reason'));
  await undo();
  check('bets: one undo removes the inserted kill placeholder', (await p.evaluate(() => localStorage.getItem('bets-src'))) === baseline);

  /* ---- Escape on the kill default-insert: the wave-2A contract. Escape must
     leave the doc EXACTLY at baseline (a clean undo() pop, not a forward
     removeLine dispatch), and — the regression this actually guards against —
     a SUBSEQUENT undo must never resurrect the cancelled placeholder (which a
     forward removeLine would have left sitting on the undo stack for Ctrl+Z
     to reverse). ---- */
  await tapCard(11);
  await p.locator('.eip-pop button', {hasText: 'Add kill criterion…'}).click();
  const midInsert = await untilValue(() => p.evaluate(() => localStorage.getItem('bets-src')),
    midInsert => (midInsert.split(/\r?\n/).includes('    kill: reason')));
  check('bets: kill default-insert lands the placeholder before Escape',
    midInsert.split(/\r?\n/).includes('    kill: reason'));
  /* The source write and openAt() are deliberately separate phases: the latter
     waits for the debounced render to expose the fresh kill target. Storage can
     therefore contain the placeholder before the input exists, especially when
     parallel suites delay rAF. Escape is an input contract, so synchronize on
     that input instead of racing it from the earlier source-write witness. */
  check('bets: kill default-insert opens its cancellable input before Escape',
    await until(async () => (await p.locator('.eip-input').inputValue() === 'reason')));
  await p.keyboard.press('Escape');
  const afterEscape = await untilValue(() => p.evaluate(() => localStorage.getItem('bets-src')),
    afterEscape => (afterEscape === baseline));
  check('bets: Escape on the kill default-insert restores the exact baseline', afterEscape === baseline);
  await undo();
  const afterSubsequentUndo = await p.evaluate(() => localStorage.getItem('bets-src'));
  check('bets: a subsequent undo after Escape-cancel does not resurrect the placeholder',
    !afterSubsequentUndo.split(/\r?\n/).includes('    kill: reason'));

  check('bets: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- bets: desktop (fine-pointer) addbet variant — the same ＋ Add bet flow
   at a narrow (<520px) width but via a REAL mouse click with no touch
   emulation, proving the narrow relayout's add affordance works without a
   touch device attached. Also the positive focus assertion: after add,
   document.activeElement IS the fresh bet's own rendered name field, not
   merely "something outside CodeMirror". ---- */
{
  const dp = await browser.newPage({viewport: {width: 420, height: 900}});
  const derrs = trackErrors(dp);
  await dp.goto((process.env.BASE || 'http://localhost:8087') + '/bets/', {waitUntil: 'networkidle'});
  await dp.getByRole('button', {name: 'Lantern portfolio'}).click();
  check('bets desktop-narrow: a fine-pointer narrow viewport still relayouts (data-narrow)', await until(async () => (await dp.evaluate(() => !!document.querySelector('#preview svg [data-narrow]')))));
  await dp.locator('#preview svg g[data-edit="addbet"][data-line="4"]').click();
  await dp.locator('.eip-input').fill('Fine pointer add');
  await dp.keyboard.press('Enter');
  const dAfter = await untilValue(() => dp.evaluate(() => localStorage.getItem('bets-src')),
    dAfter => (dAfter.split(/\r?\n/).some(l => l.trim() === 'Fine pointer add: stake 50, odds 40-60%, payoff 100-200')));
  check('bets desktop-narrow: ＋ Add bet (mouse click, no touch) inserts a parseable placeholder',
    dAfter.split(/\r?\n/).some(l => l.trim() === 'Fine pointer add: stake 50, odds 40-60%, payoff 100-200'));
  check('bets desktop-narrow: focus lands on the fresh bet\'s OWN rendered field (positive assertion)',
    await until(() => dp.evaluate(() => {
      const el = document.activeElement;
      return !!el && el.dataset && el.dataset.edit === 'name' && el.dataset.raw === 'Fine pointer add';
    })));
  check('bets desktop-narrow: no console/page errors', derrs.length === 0);
  await dp.close();
}

/* ---- PHONE gate (coarse pointer, mobile-input Stage 0). Rule 1: a bare tap
   on the diagram must NEVER commit a text change silently — a multi-value
   cycle opens a marked options popover, a ['×'] remove cycle opens a danger
   confirm, and the card-menu redirect keeps winning where a data-menu sibling
   covers the tap. Rule 2: the ↶ touch Undo button reverts a real commit
   through the editor's history. This is the behavioural check that would have
   caught the original /why silent [testing]→[holds] rewrite. Fine-pointer
   behaviour is locked by the desktop blocks above (they click cycle targets
   and expect the INSTANT step). ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const sliverTap = async (p, loc) => {   // top-left padding sliver — same dodge-the-text trick as the desktop blocks
    await loc.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    const box = await loc.boundingBox();
    await tapCardMenu(p, box);
  };

  /* why: the astatus multi-value cycle (the original trap) */
  {
    const p = await mctx.newPage();
    const errs = trackErrors(p);
    await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
    await p.getByRole('button', {name: 'Edit tree source'}).click();
    await p.getByRole('button', {name: 'Reading retention'}).click();
    await p.waitForTimeout(700);
    const baseline = await p.evaluate(() => localStorage.getItem('why-src'));
    await settledTap(p, p.locator('[data-edit="astatus"][data-raw="testing"]').first());
    check('phone why: astatus tap opens the cycle popover — no instant commit', await until(async () => (await p.locator('.eip-pop').count() === 1)));
    check('phone why: doc text UNCHANGED while the popover is open',
      (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);
    check('phone why: popover lists the four states with the current one marked',
      (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'untested|testing|holds|broken' &&
      (await p.locator('.eip-pop button.on').innerText()) === 'testing');
    await p.locator('.eip-pop button', {hasText: 'holds'}).click();
    const picked = await untilValue(() => p.evaluate(() => localStorage.getItem('why-src')),
    picked => (picked.includes('? readers want a nudge mid-commute [holds]')));
    check('phone why: picking commits EXACTLY the picked value (not "next in cycle")',
      picked.includes('? readers want a nudge mid-commute [holds]'));
    /* Rule 2: the touch Undo button reverts through the editor's history */
    await settledTap(p, p.locator('.actions .touch-undo'));
    check('phone why: ↶ Undo reverts the popover commit', await until(async () => ((await p.evaluate(() => localStorage.getItem('why-src'))) === baseline)));
    /* the data-menu redirect still wins where a menu sibling covers the tap */
    await sliverTap(p, p.locator('#preview svg rect[data-edit^="cardmenu"][data-hit]').first());
    check('phone why: card-body tap opens exactly ONE menu popover (redirect wins, nothing double-fires)', await until(async () => (await p.locator('.eip-pop').count() === 1 &&
      await p.locator('.eip-pop button', {hasText: 'Rename…'}).count() === 1)));
    /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
    await new Promise(r => setTimeout(r, 250));
    check('phone why: menu open commits nothing',
      (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);
    /* away-dismiss: a pointerdown anywhere outside the popover closes it.
       Synthetic on body — a coordinate tap risks hitting the crumb link or
       another [data-edit] target, and a locator click scroll-closes first. */
    await p.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})));
    check('phone why: away pointerdown dismisses the popover without a commit', await until(async () => (await p.locator('.eip-pop').count() === 0 &&
      (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline)));
    check('phone why: no console/page errors', errs.length === 0);
    await p.close();
  }

  /* focus fix (Matt's report, 2026-07-16): a coarse add-from-diagram or touch Undo
     must NOT pull focus into the DSL editor — that raises the soft keyboard over the
     artefact you're editing in place. why adds through the SHARED insertAndSelect
     default (unlike wardley, which opts out explicitly), so it's the honest guard for
     the shared path. The wardley coarse block above only proves wardley's own opt-out. */
  {
    const p = await mctx.newPage();
    const errs = trackErrors(p);
    await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
    await p.getByRole('button', {name: 'Edit tree source'}).click();
    await p.getByRole('button', {name: 'Reading retention'}).click();
    await p.waitForTimeout(700);
    const inCm = () => p.evaluate(() => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.cm-editor')));
    await sliverTap(p, p.locator('#preview svg rect[data-edit^="cardmenu"][data-hit]').first());
    await p.locator('.eip-pop button', {hasText: /Add/}).first().click();
    await p.waitForTimeout(600);
    check('phone why: coarse add-from-diagram does NOT focus the DSL editor (no soft-keyboard jump)', !(await inCm()));
    await settledTap(p, p.locator('.actions .touch-undo'));
    await p.waitForTimeout(600);
    check('phone why: coarse ↶ Undo does NOT focus the DSL editor', !(await inCm()));
    check('phone why (focus block): no console/page errors', errs.length === 0);
    await p.close();
  }

  /* Map's Field contract keeps destructive controls out of the resting artefact.
     A coarse item tap opens its one contextual menu; the menu owns Remove and Undo
     restores the authored line. The standalone ['×'] cycle-popover is proved on
     timeline-tablet below. */
  {
    const p = await mctx.newPage();
    const errs = trackErrors(p);
    await p.goto(BASE.replace('/tree/', '/map/'), {waitUntil: 'networkidle'});
    await p.getByRole('button', {name: 'Edit map source'}).click();
    await p.getByRole('button', {name: 'Assumption map'}).click();
    await p.waitForTimeout(700);
    const baseline = await p.evaluate(() => localStorage.getItem('map-src'));
    check('phone map: Field keeps destructive remove marks out of the resting map',
      (await p.locator('[data-edit="removeitem"]').count()) === 0);
    await settledTap(p, p.locator('#preview svg g[data-edit="cardmenu"] rect[data-hit]').first());
    check('phone map: item tap opens the one contextual MENU (not a silent removal)', await until(async () => (await p.locator('.eip-pop').count() === 1 &&
      await p.locator('.eip-pop button', {hasText: 'Rename…'}).count() === 1 &&
      await p.locator('.eip-pop button.danger', {hasText: 'Remove'}).count() === 1)));
    check('phone map: doc text UNCHANGED while the menu is open',
      (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);
    await p.locator('.eip-pop button.danger', {hasText: 'Remove'}).click();
    const removed = await untilValue(() => p.evaluate(() => localStorage.getItem('map-src')),
    removed => (removed !== baseline &&
      removed.split('\n').length === baseline.split('\n').length - 1));
    check('phone map: the menu Remove commits the removal', removed !== baseline &&
      removed.split('\n').length === baseline.split('\n').length - 1);
    await settledTap(p, p.locator('.actions .touch-undo'));
    check('phone map: ↶ Undo restores the removed line', await until(async () => ((await p.evaluate(() => localStorage.getItem('map-src'))) === baseline)));

    /* Move… (mobile-input map stage): the card menu arms a ONE-SHOT
       tap-the-plane placement — the coarse repositioning path (the fine drag
       needs a mouse). The tap's client coords map through the plane rect's
       live getBoundingClientRect, so the coarse 100% zoom + pan are already
       in the maths; assert the written @ x,y lands within ±2 of the tap. */
    const mHit = p.locator('#preview svg g[data-edit="cardmenu"][data-line="3"] rect[data-hit]');
    await mHit.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    const mBox = await mHit.boundingBox();
    await p.mouse.click(mBox.x + 4, mBox.y + mBox.height / 2);
    check('phone map: the card menu offers Move…', await until(async () => (await p.locator('.eip-pop button', {hasText: 'Move…'}).count() === 1)));
    await p.locator('.eip-pop button', {hasText: 'Move…'}).click();
    /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
    await new Promise(r => setTimeout(r, 250));
    check('phone map: Move… arms the hint (with a Cancel), commits nothing', await until(async () => (await p.locator('.placehint').count() === 1 &&
      await p.locator('.placehint .btn', {hasText: 'Cancel'}).count() === 1 &&
      (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline)));
    /* tap a point inside plane ∩ preview clip ∩ viewport (the plane is wider
       than the phone; only the visible part is tappable, as for a real thumb) */
    const plane = await p.locator('#preview svg rect[data-plane]').boundingBox();
    const pvBox = await p.locator('#preview').boundingBox();
    const vp = p.viewportSize();
    const x0 = Math.max(plane.x, pvBox.x, 0) + 12, x1 = Math.min(plane.x + plane.width, pvBox.x + pvBox.width, vp.width) - 12;
    const y0 = Math.max(plane.y, pvBox.y, 0) + 12, y1 = Math.min(plane.y + plane.height, pvBox.y + pvBox.height, vp.height) - 12;
    const tapX = (x0 + x1) / 2, tapY = (y0 + y1) / 2;
    const expX = Math.round((tapX - plane.x) / plane.width * 100);
    const expY = Math.round((1 - (tapY - plane.y) / plane.height) * 100);
    await p.touchscreen.tap(tapX, tapY);
    await p.waitForTimeout(700);
    const mPlaced = (await p.evaluate(() => localStorage.getItem('map-src'))).match(/Readers finish the first book they start @ (\d+),(\d+)/);
    check('phone map: the place-tap writes @ x,y within ±2 of the tapped point',
      mPlaced && Math.abs(+mPlaced[1] - expX) <= 2 && Math.abs(+mPlaced[2] - expY) <= 2);
    check('phone map: placement disarms after the tap', await p.locator('.placehint').count() === 0);
    check('phone map: coarse place does NOT focus the editor (no soft-keyboard jump)',
      await p.evaluate(() => !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.cm-editor'))));
    check('phone map: no page h-scroll while placing',
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await settledTap(p, p.locator('.actions .touch-undo'));
    check('phone map: ↶ Undo reverts the placement', await until(async () => ((await p.evaluate(() => localStorage.getItem('map-src'))) === baseline)));

    /* the armed state is escapable (no silent trap): Cancel disarms, no write */
    await mHit.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    const mBox2 = await mHit.boundingBox();
    await p.mouse.click(mBox2.x + 4, mBox2.y + mBox2.height / 2);
    await p.locator('.eip-pop button', {hasText: 'Move…'}).click();
    const cBox = await untilValue(() => p.locator('.placehint .btn').boundingBox(),
    cBox => (cBox.height >= 44));
    check('phone map: the hint Cancel is a >=44px target', cBox.height >= 44);
    await p.touchscreen.tap(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2);
    check('phone map: Cancel disarms without a write', await until(async () => (await p.locator('.placehint').count() === 0 &&
      (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline)));

    check('phone map: no console/page errors', errs.length === 0);
    await p.close();
  }

  /* roadmap at 390: the narrow chart's card menu opens (a sample of the
     narrow-relayout tools keeping their tap-to-edit entry point) */
  {
    const p = await mctx.newPage();
    const errs = trackErrors(p);
    await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
    await p.getByRole('button', {name: 'Reading app roadmap'}).click();
    /* This 700ms settle stays a sleep. Twice now a poll has been put here and twice it
       broke: it must cover the example's text reaching localStorage through the
       editor's debounce AND the narrow chart re-rendering its tap targets, and no
       cheap predicate covers both — polling the source for two equal reads returns
       during the pre-write window, so the baseline captures the PREVIOUS document and
       every check comparing against it fails. The confused predicate this replaced
       (a copy of the check below, requiring a popover not yet opened) only worked by
       accident, because running out its 4000ms ceiling happened to wait long enough. */
    await p.waitForTimeout(700);
    const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
    await sliverTap(p, p.locator('#preview svg g[data-edit="cardmenu"] rect[data-hit]').first());
    /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
    await new Promise(r => setTimeout(r, 250));
    check('phone roadmap: narrow-chart card tap opens the menu, commits nothing', await until(async () => (await p.locator('.eip-pop').count() === 1 &&
      (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline)));
    await p.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})));
    await p.waitForTimeout(250);
    check('phone roadmap: no console/page errors', errs.length === 0);
    await p.close();
  }

  /* Rule 3 mechanism: a kind may declare inputmode and it lands on the input.
     No tool opts in yet, so drive the shared module directly with a synthetic
     kind — this guards the plumbing until the first real opt-in. */
  {
    const p = await mctx.newPage();
    await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
    const im = await p.evaluate(async () => {
      const {attachEditInPlace} = await import('/assets/edit-in-place.js');
      const host = document.createElement('div');
      host.innerHTML = '<span data-edit="n" data-line="0" data-raw="42">42</span>';
      document.body.appendChild(host);
      attachEditInPlace(host, {kinds: {n: {inputmode: 'decimal'}}, onCommit(){}});
      host.querySelector('[data-edit]').dispatchEvent(new MouseEvent('click', {bubbles: true}));
      const input = document.querySelector('.eip-input');
      return input ? input.inputMode : 'no-input';
    });
    check('phone: a kind\'s declared inputmode lands on the edit input (Rule 3)', im === 'decimal');
    await p.close();
  }

  await mctx.close();
}

/* ---- timeline at coarse-WIDE (tablet): the Stage-0 [IMPORTANT] fix — the wide
   timing mark owns a real 44px target and opens the marked picker instead of
   silently stepping. Its text rail owns the contextual menu; the standalone ×
   sits outside that rail and retains its explicit one-row confirmation. ---- */
{
  const tctx = await browser.newContext({...devices['iPad Pro 11 landscape'], reducedMotion: 'reduce'});
  const p = await tctx.newPage();
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/timeline/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'App launch programme'}).click();
  /* 700ms settle stays — see the roadmap tablet block above for why no poll works
     here (debounced write + narrow re-render, and the old predicate only "worked" by
     exhausting its ceiling). */
  await p.waitForTimeout(700);
  const baseline = await p.evaluate(() => localStorage.getItem('timeline-src'));
  const statusHit = p.locator('rect[data-edit="status"][data-hit]').first();
  const statusBox = await untilValue(() => statusHit.boundingBox(), b => b && b.width >= 44 && b.height >= 44);
  check('tablet timeline: a timing mark owns a 44px coarse target', statusBox.width >= 44 && statusBox.height >= 44);
  await statusHit.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const statusEdge = await statusHit.boundingBox();
  await p.mouse.click(statusEdge.x + 1, statusEdge.y + statusEdge.height / 2);
  check('tablet timeline: a coarse status tap opens the marked picker — NO silent step', await until(async () => (await p.locator('.eip-pop').count() === 1 &&
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'none|done|risk|fixed' &&
    (await p.evaluate(() => localStorage.getItem('timeline-src'))) === baseline)));
  await p.locator('.eip-pop button', {hasText: 'risk'}).click();
  const stepped = await untilValue(() => p.evaluate(() => localStorage.getItem('timeline-src')),
    stepped => (stepped !== baseline && /\[risk\]/.test(stepped)));
  check('tablet timeline: picking a status commits it (no blind step)', stepped !== baseline && /\[risk\]/.test(stepped));
  await settledTap(p, p.locator('.actions .touch-undo'));
  check('tablet timeline: ↶ Undo reverts the picked status', await until(async () => ((await p.evaluate(() => localStorage.getItem('timeline-src'))) === baseline)));

  /* The standalone ['×'] is outside the contextual rail, so its explicit
     one-row confirmation remains the direct delete route rather than redirecting
     through the card menu. */
  const base2 = await p.evaluate(() => localStorage.getItem('timeline-src'));
  await settledTap(p, p.locator('[data-edit="removeitem"]').first());
  check('tablet timeline: × opens a one-row danger confirm outside the card-menu rail', await until(async () => (await p.locator('.eip-pop button.danger').count() === 1 &&
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Remove')));
  check('tablet timeline: doc UNCHANGED while the × confirm is open — no silent removal',
    (await p.evaluate(() => localStorage.getItem('timeline-src'))) === base2);
  await p.locator('.eip-pop button.danger').click();
  check('tablet timeline: confirming × removes the milestone line', await until(async () => ((await p.evaluate(() => localStorage.getItem('timeline-src'))) !== base2)));
  await settledTap(p, p.locator('.actions .touch-undo'));
  check('tablet timeline: ↶ Undo restores the removed milestone', await until(async () => ((await p.evaluate(() => localStorage.getItem('timeline-src'))) === base2)));

  check('tablet timeline: no console/page errors', errs.length === 0);
  await p.close();
  await tctx.close();
}

/* ---- mobile-input TAIL, LAST stage (gauge): the ODD ONE OUT — its compose
   surface is an HTML participant form, not an SVG diagram, so attachEditInPlace
   (surface-agnostic) drives phone-first question AUTHORING. Every affordance is
   an undoable TEXT rewrite; config keys stay editor-only. No per-card ⋯ menu —
   every edit is a direct visible target (qtext/qtype/unit/opt/rmopt/addopt +
   removeq + the addq picker). Compose boots in reveal view, so switch to Form
   first. Same commit/assert/ONE-Undo/revert contract as the other tails. Also
   asserts the shared .eip-input 16px coarse floor (the phone bar's iOS-zoom rule,
   assets/workspace.css — global, so proving it here guards every tool). ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  const BASEU = (process.env.BASE || 'http://localhost:8087');
  const GDOC = `title: Q3 commitment review
names: off

We ship the referral loop :: prob
Weeks to migrate billing :: range weeks
Pick the Q3 bet :: chips Offline downloads | Book clubs | Onboarding polish`;
  const gEnc = t => Buffer.from(JSON.stringify({t}), 'utf8').toString('base64');
  const gSrc = () => mpage.evaluate(() => localStorage.getItem('gauge-src'));
  const gTap = async sel => {
    const pt = await mpage.evaluate(s => { const g = document.querySelector(s); if(!g) return null;
      g.scrollIntoView({block: 'center'}); const r = g.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }, sel);
    if(!pt) return false;
    await mpage.waitForTimeout(150); await mpage.mouse.click(pt.x, pt.y); await mpage.waitForTimeout(300); return true;
  };
  const gBtn = async txt => { await mpage.locator('.eip-pop button', {hasText: txt}).click(); await mpage.waitForTimeout(400); };
  const gUndo = async () => { await gTap('.stage .actions .touch-undo'); await mpage.waitForTimeout(400); };
  const inCm = () => mpage.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.cm-editor'));

  await mpage.goto(BASEU + '/gauge/#' + gEnc(GDOC), {waitUntil: 'networkidle'});
  await mpage.waitForTimeout(500);
  // Narrow mode stacks the visible question source below the artefact; the
  // collapsed desktop trigger is deliberately absent to avoid a duplicate path.
  if(await mpage.locator('#railtab').isVisible()) await mpage.locator('#railtab').click();
  await mpage.locator('#viewform').click();     // compose boots in reveal view
  const gBase = await untilValue(() => gSrc(),
    async gBase => (gBase === GDOC &&
    await mpage.locator('.formpreview .gform [data-edit]').count() > 0));
  check('gauge: the compose form is the editable authoring surface', gBase === GDOC &&
    await mpage.locator('.formpreview .gform [data-edit]').count() > 0);
  check('gauge: no per-card ⋯ menu (every edit is a direct target)',
    await mpage.locator('.formpreview [data-menu]').count() === 0);

  // --- edit question TEXT: no silent commit, round-trip, one Undo ---
  await gTap('[data-edit="qtext"][data-line="3"]');
  check('gauge: qtext opens the eip-input prefilled', await mpage.locator('.eip-input').inputValue() === 'We ship the referral loop');
  const eipFs = await mpage.evaluate(() => { const i = document.querySelector('.eip-input'); return i ? parseFloat(getComputedStyle(i).fontSize) : 0; });
  check('gauge: shared .eip-input is ≥16px on coarse (no iOS zoom — assets/workspace.css)', eipFs >= 16);
  await mpage.keyboard.press('Escape');
  check('gauge: Escaping the qtext editor commits nothing', await until(async () => ((await gSrc()) === gBase)));
  await gTap('[data-edit="qtext"][data-line="3"]');
  await mpage.locator('.eip-input').fill('Ship the loop by Q3');
  await mpage.keyboard.press('Enter');
  check('gauge: qtext edit rewrites the text, keeps the kind tail', await until(async () => (/^Ship the loop by Q3 :: prob$/m.test(await gSrc()))));
  check('gauge: a coarse text edit does NOT focus the DSL editor', !(await inCm()));
  await gUndo();
  check('gauge: one Undo reverts the qtext edit', (await gSrc()) === gBase);

  // --- change TYPE: a picker, nothing commits on a bare tap ---
  await gTap('[data-edit="qtype"][data-line="3"]');
  check('gauge: qtype opens a prob/range/chips picker with prob marked',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'prob|range|chips' &&
    (await mpage.locator('.eip-pop button.on').innerText()) === 'prob');
  /* the negative half of this assertion needs the write debounce to ELAPSE: polling returns a frame after the action, so "nothing was written" would be read before a regressive late write could land. 250ms > the editor's 120ms debounce. */
  await new Promise(r => setTimeout(r, 250));
  check('gauge: opening the type picker commits nothing (menu-first)', (await gSrc()) === gBase);
  await gBtn('range');
  check('gauge: →range supplies a placeholder unit', /^We ship the referral loop :: range units$/m.test(await gSrc()));
  await gUndo();
  check('gauge: one Undo reverts the type change', (await gSrc()) === gBase);

  // --- edit UNIT on the range question ---
  await gTap('[data-edit="unit"][data-line="4"]');
  check('gauge: unit pill opens prefilled with the current unit', await mpage.locator('.eip-input').inputValue() === 'weeks');
  await mpage.locator('.eip-input').fill('months');
  await mpage.keyboard.press('Enter');
  check('gauge: unit edit rewrites the range tail', await until(async () => (/^Weeks to migrate billing :: range months$/m.test(await gSrc()))));
  await gUndo();
  check('gauge: one Undo reverts the unit edit', (await gSrc()) === gBase);

  // --- chip options: add (one-tap), rename, remove (coarse danger confirm) ---
  await gTap('[data-edit="addopt"][data-line="5"]');
  check('gauge: ＋ Add option one-taps a 4th option (no popover)',
    /:: chips Offline downloads \| Book clubs \| Onboarding polish \| Option D$/m.test(await gSrc()) &&
    await mpage.locator('.eip-pop').count() === 0);
  check('gauge: coarse add-option opts OUT of editor focus', !(await inCm()));
  await gUndo();
  check('gauge: one Undo removes the added option', (await gSrc()) === gBase);

  await gTap('[data-edit="opt"][data-line="5"][data-opt="0"]');
  check('gauge: chip option opens prefilled with its label', await mpage.locator('.eip-input').inputValue() === 'Offline downloads');
  await mpage.locator('.eip-input').fill('Resume v2');
  await mpage.keyboard.press('Enter');
  check('gauge: option rename rewrites just that option', await until(async () => (/:: chips Resume v2 \| Book clubs \| Onboarding polish$/m.test(await gSrc()))));
  await gUndo();
  check('gauge: one Undo reverts the option rename', (await gSrc()) === gBase);

  await gTap('[data-edit="rmopt"][data-line="5"][data-opt="1"]');
  check('gauge: removing an option opens a one-row danger confirm (no silent removal)',
    await mpage.locator('.eip-pop button.danger').count() === 1 &&
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Remove' &&
    (await gSrc()) === gBase);
  await mpage.locator('.eip-pop button.danger').click();
  check('gauge: confirming drops that option', await until(async () => (/:: chips Offline downloads \| Onboarding polish$/m.test(await gSrc()))));
  await gUndo();
  check('gauge: one Undo restores the removed option', (await gSrc()) === gBase);

  // --- add QUESTION via the ＋ Add picker (type choice IS the commit) ---
  await gTap('[data-edit="addq"]');
  check('gauge: ＋ Add question opens a Probability/Range/Chips picker (no silent add)',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Probability|Range|Chips' &&
    (await gSrc()) === gBase);
  await gBtn('Chips');
  check('gauge: picking Chips appends a 2-option chips question',
    /\nNew question :: chips Option A \| Option B$/.test(await gSrc()));
  check('gauge: default question opens its fresh in-artifact name field, not CodeMirror',
    await mpage.locator('.eip-input').count() === 1 && !(await inCm()));
  await mpage.keyboard.press('Escape'); check('gauge: Escape cancels the untouched new question', await until(async () => ((await gSrc()) === gBase)));
  await gTap('[data-edit="addq"]'); await gBtn('Chips');
  await mpage.locator('.eip-input').fill('Where should we invest?'); await mpage.keyboard.press('Enter'); check('gauge: naming the new question is a second in-artifact edit', await until(async () => (/\nWhere should we invest\? :: chips Option A \| Option B$/.test(await gSrc()))));
  await gUndo(); await gUndo();
  check('gauge: two Undos revert named question creation (name, then question)', (await gSrc()) === gBase);

  // --- remove QUESTION: coarse danger confirm ---
  await gTap('[data-edit="removeq"][data-line="3"]');
  check('gauge: removing a question opens a one-row danger confirm (no silent removal)',
    await mpage.locator('.eip-pop button.danger').count() === 1 && (await gSrc()) === gBase);
  await mpage.locator('.eip-pop button.danger').click();
  await mpage.waitForTimeout(400);
  check('gauge: confirming drops the question line', !/We ship the referral loop/.test(await gSrc()));
  await gUndo();
  check('gauge: one Undo restores the removed question', (await gSrc()) === gBase);

  check('gauge: no page h-scroll on the compose form at phone width', await mpage.evaluate(() => {
    const pv = document.getElementById('preview');
    return pv.scrollWidth <= pv.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
  }));
  check('gauge: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- paths overview receipt + Focus lens + explicit Tree inspector: Overview
   uses the evaluator-backed impact receipt while Tree retains its editable
   legacy receipt and source-rewrite behavior during the staged migration. ---- */
{
  const pctx = await browser.newContext({viewport:{width:1440, height:900}, reducedMotion:'reduce'});
  const p = await pctx.newPage();
  const perrors = trackErrors(p);
  const root = process.env.BASE || 'http://localhost:8087';
  const src = () => p.locator('#cmhost').textContent();
  await p.goto(root + '/paths/', {waitUntil:'networkidle'});
  await p.waitForTimeout(500);
  const autoFoldHash = await decodeHash((await p.evaluate(() => location.hash)).slice(1));
  check('paths: automatic review folding never persists an editor preference in the URL',
    !autoFoldHash || !Object.hasOwn(autoFoldHash, 'e'));
  check('paths: the unstyled document opens the parallel overview with a deterministic receipt',
    await p.locator('[data-kind="roadmap-grid"]').count() === 1 &&
    await p.locator('#overview-receipt[data-decision-key="pricing"]').isVisible() &&
    /changes directly with this answer/i.test(await p.locator('#overview-receipt').innerText()) &&
    /also needs/i.test(await p.locator('#overview-receipt').innerText()) &&
    await p.locator('#decision-inspector').isHidden());
  check('paths: injected Fit advice cannot displace the roadmap or desktop receipt rail',
    await p.evaluate(() => {
      const live = document.querySelector('#overview-live');
      const main = document.querySelector('.overview-main');
      const preview = document.querySelector('#preview');
      const receipt = document.querySelector('#overview-receipt');
      const advice = document.querySelector('.fit-readability-advisory');
      const mainBox = main?.getBoundingClientRect();
      const previewBox = preview?.getBoundingClientRect();
      const receiptBox = receipt?.getBoundingClientRect();
      return live?.dataset.receiptLayout === 'rail' && (!advice || advice.parentElement === main) &&
        Math.abs(mainBox.x - previewBox.x) < 1 && previewBox.right <= receiptBox.left;
    }));
  const overviewQuestion = p.locator('[data-kind="attention-decision"][data-decision-key="groups"]');
  await overviewQuestion.focus();
  await overviewQuestion.press('Enter');
  check('paths: overview keyboard selection updates and focuses the evaluator-backed live receipt', await until(async () => (await p.locator('#overview-receipt[data-decision-key="groups"]').isVisible() &&
    await p.locator('[data-kind="attention-decision"][data-decision-key="groups"][data-selected="true"]').count() === 1 &&
    await p.evaluate(() => document.activeElement?.id) === 'overview-receipt-title' &&
    await p.locator('#decision-inspector').isHidden())));
  check('paths: decision selection announces the selected question and current state',
    /Selected question: Will people invite three friends without prompting\?. Unanswered — due/.test(
      await p.locator('#summary').innerText()));

  await p.locator('#overview-receipt [data-open-closeout]').click();
  check('paths: Brief desktop Close-out is a full selected-decision layer, not the receipt rail', await until(async () => (await p.evaluate(() => {
      const live = document.querySelector('#overview-live').getBoundingClientRect();
      const receipt = document.querySelector('#overview-receipt').getBoundingClientRect();
      const host = document.querySelector('#overview-live');
      return host.dataset.mode === 'closeout' && receipt.width >= live.width - 1 &&
        getComputedStyle(document.querySelector('#overview-receipt')).position === 'static';
    }))));
  await p.locator('#overview-receipt [data-return-closeout]').click();
  check('paths: returning from Brief Close-out restores the roadmap and its normal receipt rail', await until(async () => (await p.evaluate(() => {
      const host = document.querySelector('#overview-live');
      const main = document.querySelector('.overview-main').getBoundingClientRect();
      const receipt = document.querySelector('#overview-receipt').getBoundingClientRect();
      return host.dataset.mode === 'overview' && !document.querySelector('#preview').hidden &&
        getComputedStyle(document.querySelector('#overview-receipt')).position === 'sticky' &&
        main.right <= receipt.left && document.activeElement?.hasAttribute('data-open-closeout');
    }))));

  await p.locator('#overview-receipt [data-open-focus]').click();
  check('paths: Open focus is a deliberate local lens with stable selected decision', await until(async () => (await p.locator('#focus-lens').isVisible() && await p.locator('#preview').isHidden() &&
    await p.evaluate(() => document.activeElement?.id) === 'focus-lens-title' &&
    /Will people invite three friends/.test(await p.locator('#focus-lens-title').innerText()))));
  check('paths: Focus names yes/no as counterfactuals and exposes compound outcomes',
    await p.locator('#focus-lens .focus-branch').count() === 2 &&
    /If answered yes/.test(await p.locator('#focus-lens').innerText()) &&
    /If answered no/.test(await p.locator('#focus-lens').innerText()) &&
    /AND · requires Groups = yes and Pricing = no/.test(await p.locator('#focus-lens').innerText()) &&
    /Counterfactual — not today’s plan/.test(await p.locator('#focus-lens').innerText()));
  check('paths: Focus states honest export semantics',
    /local counterfactual lens; exports remain the selected full plan artefact/i.test(
      await p.locator('#view-method').innerText()));
  await p.locator('details.action-disclosure').evaluate(element => { element.open = true; });
  const focusDownload = p.waitForEvent('download');
  await p.locator('#dlsvg').click();
  const focusFile = await focusDownload;
  const focusSvg = await (await import('node:fs/promises')).readFile(await focusFile.path(), 'utf8');
  check('paths: Focus export remains the selected full overview with the rich receipt',
    focusSvg.includes('data-kind="roadmap-grid"') &&
    focusSvg.includes('data-kind="overview-receipt" data-decision-key="groups"') &&
    focusSvg.includes('CHANGES DIRECTLY WITH THIS ANSWER') &&
    !focusSvg.includes('data-kind="tree-body"'));
  await p.keyboard.press('Escape');
  check('paths: Escape returns to Overview, preserves selection and returns focus to the opener', await until(async () => (await p.locator('#preview').isVisible() && await p.locator('#focus-lens').isHidden() &&
    await p.locator('#overview-receipt[data-decision-key="groups"]').isVisible() &&
    await p.evaluate(() => document.activeElement?.hasAttribute('data-open-focus')))));

  await p.setViewportSize({width:390, height:844});
  check('paths: phone Overview keeps the agenda and omits the embedded SVG receipt', await until(async () => (await p.locator('[data-kind="roadmap-agenda"]').count() === 1 &&
    await p.locator('#preview [data-kind="overview-receipt"]').count() === 0 &&
    await p.locator('#overview-receipt').isHidden())));
  const phoneDecision = p.locator('[data-select-decision][data-decision-key="groups"]');
  await phoneDecision.click();
  await p.locator('#overview-receipt').waitFor({state:'visible'});
  check('paths: phone selection opens the rich receipt as a labelled modal bottom sheet',
    await p.locator('#overview-receipt').getAttribute('role') === 'dialog' &&
    await p.locator('#overview-receipt').getAttribute('aria-modal') === 'true' &&
    await p.locator('#overview-receipt').getAttribute('aria-labelledby') === 'overview-receipt-title' &&
    /latest reading/i.test(await p.locator('#overview-receipt').innerText()) &&
    /changes directly with this answer/i.test(await p.locator('#overview-receipt').innerText()) &&
    await p.evaluate(() => document.activeElement?.id) === 'overview-receipt-title');
  check('paths: phone receipt removes every background sibling from assistive navigation',
    await p.evaluate(() => {
      const host = document.querySelector('#overview-receipt');
      let branch = host;
      while(branch?.parentElement){
        const parent = branch.parentElement;
        for(const sibling of parent.children){
          if(sibling === branch) continue;
          if(!sibling.inert || sibling.getAttribute('aria-hidden') !== 'true') return false;
        }
        branch = parent;
        if(parent === document.body) break;
      }
      return true;
    }));
  await p.keyboard.press('Tab');
  check('paths: phone receipt traps focus inside the sheet',
    await p.evaluate(() => document.activeElement?.hasAttribute('data-receipt-close')));
  await p.keyboard.press('Tab');
  check('paths: phone receipt advances to its source doorway inside the focus trap',
    await p.evaluate(() => document.activeElement?.hasAttribute('data-edit-decision-source')));
  await p.keyboard.press('Tab');
  check('paths: phone receipt advances to its Close-out control inside the focus trap',
    await p.evaluate(() => document.activeElement?.hasAttribute('data-open-closeout')));
  await p.keyboard.press('Tab');
  check('paths: phone receipt wraps its three-control focus trap',
    await p.evaluate(() => document.activeElement?.hasAttribute('data-receipt-close')));
  await p.locator('#overview-receipt [data-open-closeout]').click();
  check('paths: phone Close-out remains the selected receipt sheet', await until(async () => (await p.locator('#overview-live').getAttribute('data-mode') === 'overview' &&
    await p.locator('#overview-receipt[data-closeout-detail="true"]').isVisible() &&
    /Learning close-out/i.test(await p.locator('#overview-receipt').innerText()))));
  await p.keyboard.press('Escape');
  check('paths: phone Escape returns from Close-out to its receipt opener', await until(async () => (await p.locator('#overview-receipt[data-closeout-detail="true"]').count() === 0 &&
    await p.locator('#overview-receipt[data-decision-key="groups"]').isVisible() &&
    await p.evaluate(() => document.activeElement?.hasAttribute('data-open-closeout')))));
  await p.locator('#overview-receipt [data-receipt-close]').click();
  check('paths: Close dismisses the phone sheet and returns focus to its decision', await until(async () => (await p.locator('#overview-receipt').isHidden() &&
    await p.evaluate(() => document.activeElement?.dataset.decisionKey) === 'groups' &&
    await p.evaluate(() => !document.querySelector('.overview-main').inert &&
      !document.querySelector('.overview-main').hasAttribute('aria-hidden')))));
  await p.keyboard.press('Enter');
  await p.locator('#overview-receipt').waitFor({state:'visible'});
  await p.keyboard.press('Escape');
  check('paths: Escape dismisses the phone sheet and returns focus to its decision', await until(async () => (await p.locator('#overview-receipt').isHidden() &&
    await p.evaluate(() => document.activeElement?.dataset.decisionKey) === 'groups')));

  await p.setViewportSize({width:901, height:900});
  check('paths: a 901px viewport keeps a readable selected artefact without a forced phone sheet', await until(async () => (await p.locator('#overview-live').getAttribute('data-receipt-layout') !== 'sheet' &&
    await p.locator('#preview svg').evaluate(svg => svg.scrollWidth <= svg.clientWidth + 1) &&
    await p.locator('#focus-lens').isHidden())));

  await p.setViewportSize({width:1100, height:900});
  check('paths: constrained non-narrow desktop folds source and keeps the Brief plus decision margin readable', await until(async () => (await p.locator('#workspace').evaluate(el => el.classList.contains('collapsed')) &&
    await p.locator('#overview-live').getAttribute('data-receipt-layout') === 'rail' &&
    await p.locator('[data-kind="roadmap-grid"]').count() === 1 &&
    await p.locator('#overview-receipt').isVisible())));
  await p.locator('[data-select-decision][data-decision-key="groups"]').click();
  await p.waitForTimeout(150);
  check('paths: selecting a constrained-desktop decision updates the readable decision margin',
    await p.locator('#overview-receipt[data-layout="rail"][data-decision-key="groups"]').isVisible() &&
    await p.locator('#overview-receipt [data-receipt-close]').count() === 0);
  await p.locator('#overview-receipt [data-open-focus]').click();
  check('paths: Focus remains a deliberate local lens after review folding', await until(async () => (await p.locator('#focus-lens').isVisible() &&
    await p.locator('#focus-lens .focus-branch').count() === 2)));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  await p.setViewportSize({width:1700, height:900});
  check('paths: resizing across the receipt boundary reflows overlay into the rail', await until(async () => (await p.evaluate(() => {
      const main = document.querySelector('.overview-main').getBoundingClientRect();
      const receipt = document.querySelector('#overview-receipt').getBoundingClientRect();
      return document.querySelector('#overview-live').dataset.receiptLayout === 'rail' &&
        getComputedStyle(document.querySelector('#overview-receipt')).position === 'sticky' &&
        main.right <= receipt.left;
    }))));

  await p.setViewportSize({width:1280, height:900});

  await p.getByRole('button', {name:'Question lens'}).click();
  check('paths: visible Question lens switch edits the source and makes two answer outcomes explicit', await until(async () => (/style: question/.test(await src()) &&
    await p.locator('[data-kind="question-lens"]').count() === 1 &&
    await p.locator('[data-kind="question-outcome"][data-outcome="yes"]').count() === 1 &&
    await p.locator('[data-kind="question-outcome"][data-outcome="no"]').count() === 1 &&
    await p.locator('#decision-inspector').isHidden())));
  const dependencyQuestion = p.locator('[data-kind="parallel-question"][data-decision-key="groups"]');
  await dependencyQuestion.click();
  check('paths: Question lens shares selection with a visible current-state receipt', await until(async () => (await dependencyQuestion.getAttribute('data-selected') === 'true' &&
    await p.locator('#overview-receipt').isVisible() &&
    await p.locator('#overview-receipt .receipt-state').count() === 1 &&
    await p.locator('#overview-receipt .receipt-next').count() === 1 &&
    await p.locator('[data-kind="question-receipt"][data-decision-key="groups"]').count() === 1)));
  await p.locator('#overview-receipt [data-open-closeout]').click();
  check('paths: Close-out stays inside the selected receipt and not a fifth whole-plan view', await until(async () => (await p.locator('#overview-live').getAttribute('data-mode') === 'closeout' &&
    /Learning close-out/i.test(await p.locator('#overview-receipt').innerText()) &&
    /Author-stated contents/i.test(await p.locator('#overview-receipt').innerText()) &&
    await p.locator('[data-paths-view="closeout"]').count() === 0)));
  await p.keyboard.press('Escape');
  check('paths: Close-out returns to its originating four-view receipt', await until(async () => (await p.locator('#overview-live').getAttribute('data-mode') !== 'closeout' &&
    await p.locator('#overview-receipt[data-decision-key="groups"]').isVisible() &&
    await p.evaluate(() => document.activeElement?.hasAttribute('data-open-closeout')))));
  await p.locator('details.action-disclosure').evaluate(element => { element.open = true; });
  const dependenciesDownload = p.waitForEvent('download');
  await p.locator('#dlsvg').click();
  const dependenciesFile = await dependenciesDownload;
  const dependenciesSvg = await (await import('node:fs/promises')).readFile(await dependenciesFile.path(), 'utf8');
  check('paths: Question lens export is the wide answer comparison, never Brief or Tree',
    dependenciesSvg.includes('data-kind="question-lens"') &&
    dependenciesSvg.includes('data-kind="question-outcome" data-outcome="yes"') &&
    /<title[^>]*>[^<]*question lens[^<]*groups/i.test(dependenciesSvg) &&
    !dependenciesSvg.includes('data-kind="roadmap-grid"') && !dependenciesSvg.includes('data-kind="tree-body"'));
  await p.setViewportSize({width:390, height:844});
  await p.waitForTimeout(400);
  await p.locator('details.paths-more-views').evaluate(element => { element.open = true; });
  check('paths: phone More views menu is anchored inside the view strip',
    await p.evaluate(() => {
      const strip = document.querySelector('.paths-views')?.getBoundingClientRect();
      const menu = document.querySelector('.paths-more-views > div')?.getBoundingClientRect();
      return !!strip && !!menu && menu.left >= strip.left - 1 && menu.right <= strip.right + 1;
    }));
  await p.locator('details.paths-more-views').evaluate(element => { element.open = false; });
  check('paths: phone Question lens stacks its readable outcomes without duplicate receipt sheet',
    await p.locator('[data-kind="question-lens-narrow"]').count() === 1 &&
    await p.locator('[data-kind="question-outcome"]').count() === 2 &&
    await p.locator('#overview-receipt').isHidden());
  await p.setViewportSize({width:1000, height:900});
  check('paths: review folding gives Question lens its full readable comparison, not a cropped export canvas', await until(async () => (await p.locator('[data-kind="question-lens"]').count() === 1 &&
    await p.locator('#preview svg').evaluate(svg => svg.scrollWidth <= svg.clientWidth + 1))));
  await p.setViewportSize({width:1280, height:900});

  await p.getByRole('button', {name:'Conditions'}).click();
  check('paths: visible Conditions switch edits source and opens a connector-free parallel atlas', await until(async () => (/style: conditions/.test(await src()) &&
    await p.locator('[data-kind="conditions-atlas"]').count() === 1 &&
    await p.locator('[data-kind="conditions-decision-header"]').count() >= 1 &&
    await p.locator('#preview path').count() === 0 &&
    await p.locator('#overview-receipt').isVisible() &&
    await p.locator('#overview-receipt .receipt-next').count() === 1)));
  await p.setViewportSize({width:390, height:844});
  check('paths: phone Conditions becomes a readable agenda-style atlas with 44px questions', await until(async () => (await p.locator('[data-kind="conditions-narrow-atlas"]').count() === 1 &&
    await p.locator('[data-kind="conditions-narrow-decision"] [data-hit]').count() >= 1 &&
    await p.locator('#overview-receipt').isHidden())));
  await p.setViewportSize({width:1100, height:900});
  check('paths: review folding gives Conditions its full readable audit, not cropped decision columns', await until(async () => (await p.locator('[data-kind="conditions-atlas"]').count() === 1 &&
    await p.locator('#preview svg').evaluate(svg => svg.scrollWidth <= svg.clientWidth + 1))));
  await p.setViewportSize({width:1280, height:900});
  await p.waitForTimeout(400);

  await p.locator('details.paths-more-views').evaluate(element => { element.open = true; });
  await p.getByRole('button', {name:'Tree'}).click();
  await p.waitForTimeout(500);
  const question = p.locator('[data-select-decision][data-decision-key="groups"]');
  await question.focus();
  await question.press('Enter');
  await p.locator('#decision-inspector').waitFor({state:'visible'});
  check('paths: wide question is a keyboard-operable parsed-decision target',
    await question.getAttribute('role') === 'button' && /^\d+$/.test(await question.getAttribute('data-line')));
  check('paths: keyboard selection moves focus to the expanded inspector',
    await p.evaluate(() => document.activeElement?.id) === 'decision-inspector-title' &&
    await p.locator('[data-select-decision][data-decision-key="groups"]').getAttribute('aria-expanded') === 'true');
  check('paths: selection opens the complete decision receipt',
    await p.locator('#decision-inspector [data-edit]').count() === 10 &&
    (await p.locator('#decision-inspector h2').innerText()) === 'groups');

  await p.keyboard.press('Escape');
  check('paths: Tree Escape clears the decision margin and restores its question focus', await until(async () => (await p.locator('#decision-inspector').isHidden() &&
    await p.evaluate(() => document.activeElement?.dataset.decisionKey) === 'groups')));
  await question.press('Enter');
  await p.locator('#decision-inspector').waitFor({state:'visible'});
  await p.locator('#decision-inspector [data-edit-decision-source]').click();
  check('paths: Decision margin exposes the exact named source line through a deliberate author action', await until(async () => (await p.evaluate(() => !document.querySelector('#workspace').classList.contains('collapsed') &&
      [...document.querySelectorAll('.cm-activeLine')].some(line => /decision groups:/.test(line.textContent))))));
  await p.locator('#railtab').click();
  await question.press('Enter');
  await p.locator('#decision-inspector').waitFor({state:'visible'});

  const before = await src();
  await p.locator('#decision-inspector [data-edit="question"]').click();
  check('paths: question opens the shared EIP input prefilled',
    await p.locator('.eip-input').inputValue() === 'Will people invite three friends without prompting?');
  await p.locator('.eip-input').fill('Will people invite four friends?');
  await p.keyboard.press('Enter');
  check('paths: inspector edit rewrites source and refreshes the receipt', await until(async () => ((await src()).includes('question: Will people invite four friends?') &&
    (await p.locator('#decision-inspector [data-edit="question"]').innerText()) === 'Will people invite four friends?')));
  check('paths: the same decision remains selected after its source refresh',
    await p.locator('[data-select-decision][data-decision-key="groups"][data-selected="true"]').count() === 1 &&
    await p.locator('#decision-inspector').isVisible());
  await p.locator('#railtab').click();
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  check('paths: one Undo reverts the inspector text edit', await until(async () => ((await src()) === before)));
  await p.locator('#railtab').click();
  /* Wait for src to SETTLE — two consecutive equal reads — and nothing more. This
     predicate was originally a copy of the check() below, which also tests
     `.eip-input`'s draft text; but `.eip-input` does not exist until the
     [data-answer-direction="no"] click on the NEXT line, and inputValue() on a
     zero-match locator does not fail fast — it blocks for the full 30s action
     timeout, which untilValue's try/catch then swallowed. The check still passed, so
     the only symptom was ~30s of dead time per run inside a conversion whose entire
     point is to remove dead time. */
  /* A plain read, deliberately. The preceding check already polled this source to a
     known state, so there is nothing left to settle — and the "two consecutive equal
     reads" idiom would be a no-op here anyway: two reads agree instantly whenever a
     pending write has not STARTED, which is the very case a settle is meant to cover. */
  const beforeAnswer = await src();
  await p.locator('#decision-inspector [data-answer-direction="no"]').click();
  check('paths: Answer no opens an auditable dated draft and writes nothing yet',
    (await src()) === beforeAnswer && /^no \d{4}-\d{2}-\d{2} -- $/.test(await p.locator('.eip-input').inputValue()));
  await p.locator('.eip-input').fill('no 2026-08-11 -- experiment G-42');
  await p.keyboard.press('Enter');
  check('paths: confirming the dated receipt writes no bare answer', await until(async () => ((await src()).includes('  answer: no 2026-08-11 -- experiment G-42') &&
    await p.locator('#decision-inspector [data-answer-direction="no"]').getAttribute('aria-pressed') === 'true')));
  check('paths: inspector arms show real affected work and explicit empty state',
    await p.locator('#decision-inspector .inspector-arm').count() === 2 &&
    /if so[\s\S]*friend invite prompt[\s\S]*if not/i.test(await p.locator('#decision-inspector .inspector-arms').innerText()));
  await p.locator('#decision-inspector [data-clear-answer]').click();
  check('paths: Clear answer removes the authored answer without losing selection', await until(async () => (!(await src()).includes('  answer: no') && await p.locator('#decision-inspector').isVisible())));

  await p.setViewportSize({width:390, height:844});
  await p.waitForTimeout(400);
  const narrow = p.locator('[data-kind="outline-question"][data-decision-key="groups"]');
  check('paths: narrow question keeps keyboard semantics and a 44px row target',
    await narrow.getAttribute('tabindex') === '0' &&
    await narrow.locator('[data-hit]').getAttribute('height') === '44');

  /* The view key switches the renderer, not the semantic projection. Prove the
     phone relayout, inspector exclusion and — most importantly — that exports
     are routed through the selected WIDE renderer rather than serialising the
     narrow preview or silently retaining Tree. */
  await p.locator('details.paths-more-views').evaluate(element => { element.open = true; });
  await p.getByRole('button', {name:'Plans'}).click();
  check('paths: More views Plans switches to the semantic phone relayout and removes the Tree inspector', await until(async () => (await p.locator('[data-kind="plans-narrow"]').count() === 1 &&
    await p.locator('#decision-inspector').isHidden() &&
    /wide matrix/.test(await p.locator('#view-method').innerText()))));
  await p.locator('details.action-disclosure').evaluate(element => { element.open = true; });
  const plansDownload = p.waitForEvent('download');
  await p.locator('#dlsvg').click();
  const plansFile = await plansDownload;
  const plansSvg = await (await import('node:fs/promises')).readFile(await plansFile.path(), 'utf8');
  check('paths: a phone Plans export is the wide matrix, never the narrow stack or Tree',
    plansSvg.includes('data-kind="plans-matrix"') &&
    !plansSvg.includes('data-kind="plans-narrow"') && !plansSvg.includes('data-kind="tree-body"'));

  await p.locator('details.paths-more-views').evaluate(element => { element.open = true; });
  await p.getByRole('button', {name:'Tree'}).click();
  await p.waitForTimeout(500);
  await p.locator('details.action-disclosure').evaluate(element => { element.open = true; });
  const treeDownload = p.waitForEvent('download');
  await p.locator('#dlsvg').click();
  const treeFile = await treeDownload;
  const treeSvg = await (await import('node:fs/promises')).readFile(await treeFile.path(), 'utf8');
  check('paths: switching back keeps Tree exports Tree-only',
    treeSvg.includes('data-kind="tree-body"') && !treeSvg.includes('data-kind="plans-matrix"'));
  check('paths: no console/page errors', perrors.length === 0);
  await pctx.close();
}

console.log(results.join('\n'));
await browser.close();
report('check-eip', {...tally(results), min: 537});   // ~90% of 598 measured 2026-08-16; the old 480 was ~90% of 536 and the suite has grown since
