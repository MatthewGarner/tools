/* Edit-in-place browser checks (tree). */
import {chromium, devices} from 'playwright';
import {trackErrors, report, tally} from './_harness.mjs';
const BASE = (process.env.BASE || 'http://localhost:8087') + '/tree/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
const errors = trackErrors(page);
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

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

await page.goto(BASE, {waitUntil: 'networkidle'});
await page.getByRole('button', {name: 'Bid or no bid'}).click();
await page.waitForTimeout(500);
const before = await page.evaluate(() => localStorage.getItem('tree-src'));
const rec0 = (await page.locator('#preview svg').innerHTML()).includes('Submit bid');

// click the probability, replace with a value that flips the recommendation
await page.locator('[data-edit="prob"]').first().click();
await page.waitForTimeout(200);
check('overlay opens prefilled', await page.locator('.eip-input').inputValue() === '0.3-0.45');
await page.locator('.eip-input').fill('0.02');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const after = await page.evaluate(() => localStorage.getItem('tree-src'));
check('editor text updated', after.includes('(p=0.02)') && !after.includes('0.3-0.45'));
const svg = await page.locator('#preview svg').innerHTML();
check('recommendation flipped to No bid', svg.includes('RECOMMENDED') && /RECOMMENDED[\s\S]{0,200}No bid/.test(svg));
check('one undo reverts the edit', await (async () => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(500);
  return (await page.evaluate(() => localStorage.getItem('tree-src'))) === before;
})());

// invalid input shakes and stays open
await page.locator('[data-edit="prob"]').first().click();
await page.waitForTimeout(200);
await page.locator('.eip-input').fill('7');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
check('invalid input stays open with .invalid', await page.locator('.eip-input.invalid').count() === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('escape closes', await page.locator('.eip-input').count() === 0);

// label edit
await page.locator('[data-edit="label"]', {hasText: 'No bid'}).click();
await page.waitForTimeout(200);
await page.locator('.eip-input').fill('Walk away');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
check('label rename lands in text and diagram',
  (await page.evaluate(() => localStorage.getItem('tree-src'))).includes('Walk away') &&
  (await page.locator('#preview svg').innerHTML()).includes('Walk away'));

/* card menu: tap a node marker (the invisible >=44px data-hit rect, not the
   ~7px visible mark) → menu → Rename/Edit value or probability/Add/Remove
   each commit a real source change, one undo apiece; a node tap opens the
   NEW menu, not the old node-<kind> add/remove-only popover (superseded, no
   longer emitted at all). "Submit bid" (decision, srcLine 4) carries a
   value; "Outcome" (chance, srcLine 5) carries neither a value nor a
   probability of its own (those live on ITS children, Win/Lose) — so its
   Edit-probability row is a documented dead no-op here, same accepted
   pattern as why's fieldless Status rows; its Rename/Add/Remove are still
   live. "Win" (leaf, srcLine 6) carries both a probability and a value on
   its own line — every row is live. Each action gets its own round trip:
   commit, assert, ONE Meta+z, assert full revert to the pre-menu baseline
   before the next action starts clean. */
{
  check('tree: the old node-<kind> popover target is gone',
    (await page.evaluate(() => document.querySelectorAll('#preview svg [data-edit^="node-"]').length)) === 0);

  const marker = line => page.locator('#preview svg g[data-edit^="cardmenu-"][data-line="' + line + '"] rect[data-hit]');
  const tapMarker = async line => {
    const box = await marker(line).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  const t0 = await page.evaluate(() => localStorage.getItem('tree-src'));
  const undo = async () => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(500);
  };

  // decision node ("Submit bid", srcLine 4): Rename, Edit value, Add option, Remove branch
  await tapMarker(4);
  await page.waitForTimeout(200);
  check('tree: decision marker tap opens the menu with the expected rows',
    (await page.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit value…|＋ Add option|Remove branch');

  await page.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await page.waitForTimeout(200);
  check('tree: decision menu Rename opens the label input prefilled', await page.locator('.eip-input').inputValue() === 'Submit bid');
  await page.locator('.eip-input').fill('Place bid');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const tRename = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: decision menu Rename commits the new label', tRename.includes('Place bid: -150k') && !tRename.includes('Submit bid: -150k'));
  await undo();
  check('tree: one undo restores the pre-rename baseline (decision)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(4);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button', {hasText: 'Edit value…'}).click();
  await page.waitForTimeout(200);
  check('tree: decision menu Edit value opens the value input prefilled', await page.locator('.eip-input').inputValue() === '-150k');
  await page.locator('.eip-input').fill('-200k');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const tValue = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: decision menu Edit value commits the new value', tValue.includes('Submit bid: -200k'));
  await undo();
  check('tree: one undo restores the pre-value baseline (decision)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(4);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button', {hasText: 'Add option'}).click();
  await page.waitForTimeout(600);
  const tAdd = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: decision menu Add option inserts a new option line', tAdd.includes('New option: 0'));
  await undo();
  check('tree: one undo restores the pre-add baseline (decision)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(4);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await page.waitForTimeout(600);
  const tDecRemove = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: decision menu Remove branch drops the option and its whole subtree',
    !tDecRemove.includes('Submit bid') && !tDecRemove.includes('Outcome') && !tDecRemove.includes('Win (p='));
  await undo();
  check('tree: one undo restores the removed option (decision)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  // chance node ("Outcome", srcLine 5): Rename works; Edit probability is a
  // documented dead row; Remove branch drops the whole Win/Lose subtree
  await tapMarker(5);
  await page.waitForTimeout(200);
  check('tree: chance marker tap opens the menu with the expected rows',
    (await page.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit probability…|＋ Add outcome|Remove branch');

  await page.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await page.waitForTimeout(200);
  check('tree: chance menu Rename opens the label input prefilled', await page.locator('.eip-input').inputValue() === 'Outcome');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await tapMarker(5);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button', {hasText: 'Edit probability…'}).click();
  await page.waitForTimeout(200);
  check('tree: chance Edit probability is a documented dead no-op (Outcome carries no p of its own) — no popup opens',
    await page.locator('.eip-input').count() === 0 && await page.locator('.eip-pop').count() === 0);

  await tapMarker(5);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await page.waitForTimeout(600);
  const tChanceRemove = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: chance menu Remove branch drops the whole subtree', !tChanceRemove.includes('Win') && !tChanceRemove.includes('Lose'));
  await undo();
  check('tree: one undo restores the removed subtree (chance)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  // leaf node ("Win", srcLine 6): Rename, Edit value, Add outcome, Remove — every row live
  await tapMarker(6);
  await page.waitForTimeout(200);
  check('tree: leaf marker tap opens the menu with the expected rows',
    (await page.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit value…|＋ Add outcome|Remove');

  await page.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await page.waitForTimeout(200);
  check('tree: leaf menu Rename opens the label input prefilled', await page.locator('.eip-input').inputValue() === 'Win');
  await page.locator('.eip-input').fill('Won');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const tLeafRename = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: leaf menu Rename commits the new label', tLeafRename.includes('Won (p=0.3-0.45)') && !tLeafRename.includes('Win (p=0.3-0.45)'));
  await undo();
  check('tree: one undo restores the pre-rename baseline (leaf)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(6);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button', {hasText: 'Edit value…'}).click();
  await page.waitForTimeout(200);
  check('tree: leaf menu Edit value opens the value input prefilled', await page.locator('.eip-input').inputValue() === '2M to 5M');
  await page.locator('.eip-input').fill('3M to 6M');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const tLeafValue = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: leaf menu Edit value commits the new value', tLeafValue.includes('Win (p=0.3-0.45): 3M to 6M'));
  await undo();
  check('tree: one undo restores the pre-value baseline (leaf)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(6);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button', {hasText: 'Add outcome'}).click();
  await page.waitForTimeout(600);
  const tLeafAdd = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: leaf menu Add outcome grows a first child under the leaf', tLeafAdd.includes('New outcome'));
  await undo();
  check('tree: one undo restores the pre-add baseline (leaf)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  await tapMarker(6);
  await page.waitForTimeout(200);
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
    await page.waitForTimeout(200);
    check('tree: tapping the bare "0" value opens the value editor, not the card menu',
      await page.locator('.eip-pop').count() === 0 && await page.locator('.eip-input').count() === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
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
  await page.waitForTimeout(200);
  check('tree: decision-root marker tap opens an Add-only menu (exactly "＋ Add option", no Rename/Edit/Remove)',
    (await page.locator('.eip-pop button').allInnerTexts()).join('|') === '＋ Add option');
  check('tree: root menu offers no Remove (whole-tree deletion hazard closed)',
    await page.locator('.eip-pop button.danger').count() === 0);

  await page.locator('.eip-pop button', {hasText: 'Add option'}).click();
  await page.waitForTimeout(600);
  const tRootAdd = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: decision-root menu Add option appends a new top-level option after the whole subtree',
    tRootAdd === t0 + '\n  New option: 0');
  await undo();
  check('tree: one undo restores the pre-add baseline (decision root)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === t0);

  // a non-root node still gets its full menu — the root change is scoped to the root only
  await tapMarker(4);
  await page.waitForTimeout(200);
  check('tree: a non-root (decision) marker still opens its full unchanged menu',
    (await page.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit value…|＋ Add option|Remove branch');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  /* non-decision root: a FRESH single-line root ("Just a number: 5") parses as
     LEAF-kind — this is the primary mobile build-a-tree starting point. Its
     Add row must read "＋ Add outcome" (NOT "option"), because childLineFor on
     a leaf/chance root inserts "New outcome (p=…)"; the label must match the
     insertion. Rewrite the whole editor to that one line, then round-trip. */
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('Just a number: 5');
  await page.waitForTimeout(700);
  const tLeafRoot = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: fresh single-line root really is a leaf-kind root at line 0',
    tLeafRoot === 'Just a number: 5' &&
    (await page.locator('#preview svg g[data-edit="cardmenu-root-leaf"][data-line="0"]').count()) === 1);

  await tapMarker(0);
  await page.waitForTimeout(200);
  check('tree: leaf-root marker tap opens an Add-only menu reading exactly "＋ Add outcome" (not "option")',
    (await page.locator('.eip-pop button').allInnerTexts()).join('|') === '＋ Add outcome');
  check('tree: leaf-root menu offers no Remove',
    await page.locator('.eip-pop button.danger').count() === 0);

  await page.locator('.eip-pop button', {hasText: 'Add outcome'}).click();
  await page.waitForTimeout(600);
  const tLeafRootAdd = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: leaf-root menu Add outcome inserts an OUTCOME line (label matches insertion)',
    tLeafRootAdd === tLeafRoot + '\n  New outcome (p=rest): 0');
  await undo();
  check('tree: one undo restores the pre-add baseline (leaf root)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === tLeafRoot);

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
  await page.waitForTimeout(700);
  const tImplicit = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: two (p=…) tops parse to an implicit chance root, but its menu kind is pinned to root-decision at line -1',
    tImplicit === 'Option A (p=0.5): 10\nOption B (p=rest): 20' &&
    (await page.locator('#preview svg g[data-edit="cardmenu-root-decision"][data-line="-1"]').count()) === 1);

  await tapMarker(-1);
  await page.waitForTimeout(200);
  check('tree: implicit-root marker tap opens an Add-only menu reading exactly "＋ Add option" (NOT outcome, despite the chance kind)',
    (await page.locator('.eip-pop button').allInnerTexts()).join('|') === '＋ Add option');
  check('tree: implicit-root menu offers no Remove',
    await page.locator('.eip-pop button.danger').count() === 0);

  await page.locator('.eip-pop button', {hasText: 'Add option'}).click();
  await page.waitForTimeout(600);
  const tImplicitAdd = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: implicit-root menu Add option inserts an OPTION line (label matches childLineFor(-1) insertion)',
    tImplicitAdd === tImplicit + '\nNew option: 0');
  await undo();
  check('tree: one undo restores the pre-add baseline (implicit root)', (await page.evaluate(() => localStorage.getItem('tree-src'))) === tImplicit);
}

check('no console/page errors', errors.length === 0);

/* ---- why: popover status + cycle assumption ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Habit retention'}).click();
  await p.waitForTimeout(500);
  await p.locator('text[data-edit="status"][data-raw="testing"]').first().click();
  await p.waitForTimeout(200);
  check('why: status popover opens', await p.locator('.eip-pop').count() === 1);
  await p.locator('.eip-pop button', {hasText: 'delivering'}).click();
  await p.waitForTimeout(600);
  const t1 = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: popover commit rewrites tag', t1.includes('Smart reminders [delivering]'));
  const a0 = await p.locator('[data-edit="astatus"][data-raw="untested"]').first();
  await a0.click();
  await p.waitForTimeout(600);
  const t2 = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: assumption cycles untested→testing', t2.includes('? users will invite friends [testing]'));

  /* ---- card menu: tap the card BODY (the invisible-fill data-hit rect, which
     IS the card rect itself here — why is a drop-in, no wrapper <g>) opens
     Rename/Status/Add/Remove. "Smart reminders" (srcLine 5, a solution) carries
     both a label and a status pill so every row is live; each action gets its
     own round trip: commit, assert, ONE Meta+z, assert full revert back to the
     pre-menu baseline before the next action starts clean. ---- */
  const cardBody = line => p.locator('#preview svg rect[data-edit^="cardmenu"][data-line="' + line + '"][data-hit]');
  /* solution cards stack label + status pill + assumption rows, so the card's
     geometric centre (Playwright's default .click() target) usually lands on
     assumption text painted on top of the rect — tap the top-left padding
     sliver instead, above every card kind's first text baseline. */
  const tapCard = async line => {
    const box = await cardBody(line).boundingBox();
    await p.mouse.click(box.x + 8, box.y + 4);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('why-src'));
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+z');
    await p.waitForTimeout(500);
  };

  /* "Smart reminders" (srcLine 5) carries two assumptions (srcLine 6 "users
     want to be interrupted at work" [testing], srcLine 7 "habit time is
     detectable" [holds]) — the dynamic solutionMenu composer inserts one
     submenu row per assumption, in source order, between ＋ Add assumption
     and Remove branch. */
  await tapCard(5);
  await p.waitForTimeout(200);
  check('why: solution card tap opens the menu with base rows + one row per assumption, in order',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
    'Rename…|Status…|＋ Add assumption|? users want to be interrupted at work · testing|? habit time is detectable · holds|Remove branch');

  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await p.waitForTimeout(200);
  check('why: menu Rename opens the label input prefilled', await p.locator('.eip-input').inputValue() === 'Smart reminders');
  await p.locator('.eip-input').fill('Smart nudges');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tRename = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: menu Rename commits the new label', tRename.includes('Smart nudges') && !tRename.includes('Smart reminders'));
  await undo();
  check('why: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  await p.waitForTimeout(200);
  check('why: menu Status opens the status options popover', await p.locator('.eip-pop button', {hasText: 'delivering'}).count() === 1);
  await p.locator('.eip-pop button', {hasText: 'shipped'}).click();   // current is 'delivering' (set above) — pick a distinct value so this is a real commit
  await p.waitForTimeout(600);
  const tStatus = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: menu Status pick commits the new status', tStatus.includes('Smart reminders [shipped]'));
  await undo();
  check('why: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Add assumption'}).click();
  await p.waitForTimeout(600);
  const tAdd = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: menu Add assumption inserts a new assumption line', tAdd.includes('New assumption'));
  await undo();
  check('why: one undo restores the pre-add baseline', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  /* ---- assumption sub-menu: tap an assumption row → a nested popover with
     the four ASSUMPTION_CYCLE states (current one carries .on) plus a danger
     "Remove assumption", targeting the ASSUMPTION's own srcLine — the
     solution's line must stay untouched. ---- */
  await tapCard(5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'users want to be interrupted at work'}).click();
  await p.waitForTimeout(200);
  check('why: assumption sub-popover lists the four cycle states plus a danger Remove',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'untested|testing|holds|broken|Remove assumption');
  check('why: assumption sub-popover marks the current status with .on',
    (await p.locator('.eip-pop button.on').innerText()) === 'testing');
  check('why: only one state is marked current', await p.locator('.eip-pop button.on').count() === 1);

  await p.locator('.eip-pop button', {hasText: 'holds'}).click();
  await p.waitForTimeout(600);
  const tAstatus = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: picking a different state rewrites the ASSUMPTION line',
    tAstatus.includes('? users want to be interrupted at work [holds]'));
  check("why: the solution's own line is untouched by the assumption edit",
    /Smart reminders \[\w+\]/.test(tAstatus) && tAstatus.match(/Smart reminders \[(\w+)\]/)[1] ===
    baseline.match(/Smart reminders \[(\w+)\]/)[1]);
  await undo();
  check('why: one undo restores the pre-status baseline (assumption)', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'users want to be interrupted at work'}).click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove assumption'}).click();
  await p.waitForTimeout(600);
  const tRemoveA = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: Remove assumption drops just that assumption line',
    !tRemoveA.includes('users want to be interrupted at work') &&
    tRemoveA.includes('habit time is detectable') && tRemoveA.includes('Smart reminders'));
  await undo();
  check('why: one undo restores the removed assumption', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  /* zero-assumption solution: exactly the four base rows (no submenu rows) */
  await tapCard(12);   // "Habit templates library [shipped]" — no assumption children
  await p.waitForTimeout(200);
  check('why: a zero-assumption solution shows exactly the four base rows',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Status…|＋ Add assumption|Remove branch');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  await tapCard(5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: menu Remove branch drops the solution (and its assumptions)',
    !tRemove.includes('Smart reminders') && !tRemove.includes('users want to be interrupted at work'));
  await undo();
  check('why: one undo restores the removed branch', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  /* ---- outcome + opportunity cards: the guard-widen review flagged that
     cardmenu-outcome/-opportunity do NOT start with 'card-', so without
     widening the onCommit guard their Add/Remove rows would silently fall
     through to the label rewrite instead of acting. Prove each kind's menu
     carries its own Add label AND that Add/Remove actually commit. Status…
     is a dead row on these two (no status pill on outcomes/opportunities) —
     same accepted no-op as roadmap's note-less "Edit note…" row. ---- */
  await tapCard(1);   // outcome: "Improve 90-day retention"
  await p.waitForTimeout(200);
  check('why: outcome card menu carries the outcome Add label',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Status…|＋ Add opportunity|Remove branch');
  await p.locator('.eip-pop button', {hasText: 'Add opportunity'}).click();
  await p.waitForTimeout(600);
  const tOutAdd = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: outcome menu Add opportunity inserts a new opportunity line', tOutAdd.includes('New opportunity'));
  await undo();
  check('why: one undo restores the pre-add baseline (outcome)', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(16);   // opportunity leaf "Progress feels invisible" — no children, safe to remove alone
  await p.waitForTimeout(200);
  check('why: opportunity card menu carries the opportunity Add label',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Status…|＋ Add solution|Remove branch');
  await p.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await p.waitForTimeout(600);
  const tOppRemove = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: opportunity menu Remove branch drops the opportunity', !tOppRemove.includes('Progress feels invisible'));
  await undo();
  check('why: one undo restores the removed opportunity', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  check('why: export render has no edit affordances', await p.evaluate(async () => {
    const [{parse}, {project}, {renderOst}] = await Promise.all([
      import('/why/parse.js'), import('/why/project.js'), import('/why/render-ost.js')]);
    const m = parse(localStorage.getItem('why-src'));
    const svg = renderOst(m, project(m), {colors: {}, measure: () => 50, dark: false});
    return !svg.includes('cardmenu-') && !svg.includes('removeassump');
  }));
  check('why: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- why: map view card menu (roadmap-rendered cards carry a bare
   data-edit="cardmenu", not the OST view's cardmenu-outcome/-opportunity/
   -solution split — roadmap/render.js doesn't know why's node kinds. Fix 2
   registers a single generic `cardmenu` kind {Rename…, Remove branch} for
   it and widens the onCommit guard from startsWith('cardmenu-') to
   startsWith('cardmenu') so the bare kind's ✖-sentinels reach the same
   subtree-removal path OST uses (keyed on data-line = e.node.srcLine, which
   render-map.js sets from the underlying why node — same source line
   numbering as the OST view). "Smart reminders" (srcLine 5) lands in the
   NEXT column since it's [testing]; "Streak freeze" is [delivering] → NOW.
   Both are real (non-ghost) cards; the LATER-column ghost chips
   ("Habits feel like chores", "Progress feels invisible") render with no
   data-edit="cardmenu" at all (render.js skips it for c.it.ghost) so they
   can't open a menu — not exercised here, that's the renderer's own
   contract, not this fix's. ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Habit retention'}).click();
  await p.waitForTimeout(500);
  await p.locator('#viewmap').click();
  await p.waitForTimeout(500);

  /* same off-glyph concern as the OST block above and the roadmap block
     below (this IS roadmap's own card renderer): tap the top-left padding
     sliver, not the geometric centre, since the title/note text paints
     over the invisible-fill data-hit rect. */
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tapCard = async line => {
    const box = await cardBody(line).boundingBox();
    await p.mouse.click(box.x + 8, box.y + 4);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('why-src'));
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+z');
    await p.waitForTimeout(500);
  };

  await tapCard(5);
  await p.waitForTimeout(200);
  check('why map: card body tap opens the menu with exactly Rename/Remove',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Remove branch');

  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await p.waitForTimeout(200);
  check('why map: menu Rename opens the title input prefilled', await p.locator('.eip-input').inputValue() === 'Smart reminders');
  await p.locator('.eip-input').fill('Smart nudges');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tRename = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why map: menu Rename commits the new title', tRename.includes('Smart nudges') && !tRename.includes('Smart reminders'));
  await undo();
  check('why map: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  await tapCard(5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove branch'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why map: menu Remove branch drops the solution (and its assumptions)',
    !tRemove.includes('Smart reminders') && !tRemove.includes('users want to be interrupted at work'));
  await undo();
  check('why map: one undo restores the removed branch', (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);

  /* regression proof: the widened guard (startsWith('cardmenu-') →
     startsWith('cardmenu')) must not disturb the OST view's per-kind menus —
     switch back and confirm a cardmenu-solution card still shows its full
     dynamic Rename/Status/Add/assumptions/Remove set (the OST block above
     already exercises each row end to end; this just proves the two views
     coexist on one page load without one clobbering the other). Nothing in
     this map-view block permanently mutated "Smart reminders"'s two
     assumptions, so both submenu rows still show their original statuses. */
  await p.locator('#viewost').click();
  await p.waitForTimeout(500);
  const ostCardBody = p.locator('#preview svg rect[data-edit^="cardmenu"][data-line="5"][data-hit]');
  const ostBox = await ostCardBody.boundingBox();
  await p.mouse.click(ostBox.x + 8, ostBox.y + 4);
  await p.waitForTimeout(200);
  check('why map: switching back to OST still opens the full cardmenu-solution menu',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
    'Rename…|Status…|＋ Add assumption|? users want to be interrupted at work · testing|? habit time is detectable · holds|Remove branch');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  check('why map: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: title edit + status popover ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Habit app roadmap'}).click();
  await p.waitForTimeout(500);
  /* The flagship is a plain now/next/later doc → the CHART, whose own markup
     this block exercises (the lane×horizon cell-ghost additem, the cell drag,
     a card menu with no Lane… row). Board's edit/drag coverage lives in the
     dedicated board blocks elsewhere in this file. */
  await p.locator('[data-edit="title"]', {hasText: 'Streak freeze'}).first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Streak shield');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const t = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: title rename lands', t.includes('Streak shield [doing]'));
  await p.locator('[data-edit="status"][data-raw="risk"]').first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'blocked'}).click();
  await p.waitForTimeout(600);
  const t2 = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: status popover rewrites tag', t2.includes('[blocked]'));

  /* add via the cell ghost */
  await p.locator('[data-edit="additem"][data-lane="Growth"][data-col="Next"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('EIP suite added');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const t3 = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: cell ghost adds a lane-prefixed item', t3.includes('Growth: EIP suite added'));

  /* ---- card menu: tap the card BODY (the invisible data-hit rect, not a
     field) opens the menu; "Streak shield" carries both a note and a status so
     the Edit-note/Status rows aren't vacuous. Each action gets its own round
     trip: commit, assert, ONE Meta+z, assert full revert back to the pre-menu
     baseline before the next action starts clean.

     The card is found by its TITLE, not by a hard-coded data-line: srcLine is a
     property of the shipped example, and pinning it here means any edit to that
     example (adding `headline:` did exactly this) breaks the suite for reasons
     that have nothing to do with edit-in-place. ---- */
  const lineOfCard = async title => p.locator('#preview svg g[data-edit="cardmenu"]')
    .filter({hasText: title}).first().getAttribute('data-line');
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  /* tap the top-left padding sliver, not the rect centre: the card paints its
     title/note/status text over the hit rect, and Playwright's default .click()
     targets the centre — on Linux (subtly different font metrics) that lands on
     the text element and the menu never opens. Same fix the why suite uses. */
  const tapCard = async title => {
    const box = await cardBody(await lineOfCard(title)).boundingBox();
    await p.mouse.click(box.x + 8, box.y + 4);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+z');
    await p.waitForTimeout(500);
  };

  await tapCard("Streak shield");
  await p.waitForTimeout(200);
  check('roadmap: card body tap opens the menu with the expected rows',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit note…|Status…|Move to…|Remove item');

  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await p.waitForTimeout(200);
  check('roadmap: menu Rename opens the title input prefilled', await p.locator('.eip-input').inputValue() === 'Streak shield');
  await p.locator('.eip-input').fill('Streak anchor');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tRename = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: menu Rename commits the new title', tRename.includes('Streak anchor [doing]') && !tRename.includes('Streak shield'));
  await undo();
  check('roadmap: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  await tapCard("Streak shield");
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  await p.waitForTimeout(200);
  check('roadmap: menu Status opens the status options popover', await p.locator('.eip-pop button', {hasText: 'blocked'}).count() === 1);
  await p.locator('.eip-pop button', {hasText: 'blocked'}).click();
  await p.waitForTimeout(600);
  const tStatus = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: menu Status pick commits the new status', tStatus.includes('Streak shield [blocked]'));
  await undo();
  check('roadmap: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  /* Move to… row: a sub-popover lists the model's horizons (current one
     marked `on`); picking a different one is the phone replacement for
     dragging the card across columns — same undo/round-trip contract as
     every other menu row. */
  await tapCard("Streak shield");
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Move to…'}).click();
  await p.waitForTimeout(200);
  check('roadmap: Move to… submenu lists the model’s horizons',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Now|Next|Later');
  check('roadmap: Move to… marks the item’s current horizon',
    (await p.locator('.eip-pop button.on').innerText()) === 'Now');
  await p.locator('.eip-pop button', {hasText: 'Next'}).click();
  await p.waitForTimeout(600);
  const tMove = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: Move to… Next relocates the item into the NEXT section',
    tMove.indexOf('Streak shield [doing]') > tMove.indexOf('NEXT') && tMove.indexOf('NEXT') > tMove.indexOf('NOW'));
  await undo();
  check('roadmap: one undo restores the pre-move baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  await tapCard("Streak shield");
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove item'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: menu Remove drops the card', !tRemove.includes('Streak shield'));
  await undo();
  check('roadmap: one undo restores the removed card', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  /* real mouse drag: "Sync engine rewrite" (Platform/Now) dropped into
     Platform/Next moves it (byte-preserved line, relocated after the NEXT
     header) and must NOT leave a card menu open (proves suppressClick).
     Resolved by title, not by srcLine — see lineOfCard above. */
  const dragSrc = await cardBody(await lineOfCard('Sync engine rewrite')).boundingBox();
  const dragDst = await p.locator('#preview svg rect[data-cell="1|Platform"]').boundingBox();
  await p.mouse.move(dragSrc.x + dragSrc.width / 2, dragSrc.y + dragSrc.height / 2);
  await p.mouse.down();
  for(let i = 1; i <= 8; i++)
    await p.mouse.move(dragSrc.x + (dragDst.x + dragDst.width / 2 - dragSrc.x) * i / 8,
      dragSrc.y + (dragDst.y + dragDst.height / 2 - dragSrc.y) * i / 8);
  await p.mouse.up();
  await p.waitForTimeout(600);
  const tDrag = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: real drag moves the card into the NEXT section',
    tDrag.indexOf('Sync engine rewrite') > tDrag.indexOf('NEXT'));
  check('roadmap: drag does not open the card menu', await p.locator('.eip-pop').count() === 0);

  check('roadmap: no console/page errors', errs.length === 0);
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
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('horizons: quarterly from Q3 2026 x4\nQ3 2026\n' +
    'Core: Sync engine rewrite [doing] x2\n');
  await p.waitForTimeout(700);

  const lineOfCard = async title => p.locator('#preview svg g[data-edit="cardmenu"]')
    .filter({hasText: title}).first().getAttribute('data-line');
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
  await p.waitForTimeout(200);
  check('roadmap: the card menu offers Runs until… on a time axis',
    await p.locator('.eip-pop button', {hasText: 'Runs until…'}).count() === 1);

  await p.locator('.eip-pop button', {hasText: 'Runs until…'}).click();
  await p.waitForTimeout(200);
  /* the item runs Q3 2026 -> Q4 2026 (x2): the submenu lists Q3 2026, Q4 2026,
     Q1 2027, Q2 2027 (its own start through the board's last column), with
     Q4 2026 (the current end) marked `on`. */
  check('roadmap: Runs until… lists this item’s start column through the board’s last',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Q3 2026|Q4 2026|Q1 2027|Q2 2027');
  check('roadmap: Runs until… marks the current end',
    (await p.locator('.eip-pop button.on').innerText()) === 'Q4 2026');

  // pick the THIRD column (Q1 2027) — commits x3
  await p.locator('.eip-pop button', {hasText: 'Q1 2027'}).click();
  await p.waitForTimeout(600);
  const src = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: Runs until… picking the third column commits x3 into the source',
    /Sync engine rewrite \[doing\] x3/.test(src));

  /* An item running PAST the board has no row for its true end, so NOTHING may be
     marked current — an `on` row is still clickable, and tapping the row the menu
     itself calls "current" would commit the last visible column as the end and
     silently shorten the work. x6 on a 4-column board must not become x4. */
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: Big programme x6\n');
  await p.waitForTimeout(700);
  await tapCard('Big programme');
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Runs until…'}).click();
  await p.waitForTimeout(200);
  check('roadmap: an off-board span marks NO row as current (its true end is not on the list)',
    await p.locator('.eip-pop button.on').count() === 0);
  await p.locator('.eip-pop button', {hasText: 'Q2 2027'}).click();   // the last visible column
  await p.waitForTimeout(600);
  const offSrc = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: picking the last visible column on an off-board span is an explicit choice (x4), not a silent truncation of x6',
    /Big programme x4/.test(offSrc));

  // now/next/later doc: NOT a time axis — the row must not appear at all
  await p.locator('.cm-content').click();
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
  await p.locator('.cm-content').click();
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

  const rowOf = title => p.locator('#preview svg g[data-edit="cardmenu"]').filter({hasText: title}).first();
  /* tap the top-left padding sliver, not the rect centre: the row paints its
     title/lane/status/note text over the hit rect, and a centred click can
     land on that text instead (same fix the chart block above uses). */
  const tapCard = async title => {
    const box = await rowOf(title).locator('rect[data-hit]').boundingBox();
    await p.mouse.click(box.x + 8, box.y + 4);
  };
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+z');
    await p.waitForTimeout(500);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));

  // ---- rename via the title cell ----
  await p.locator('[data-edit="title"]', {hasText: 'Rename target'}).first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Renamed OK');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tRename = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: title-cell rename lands in the source',
    tRename.includes('Core: Renamed OK') && !tRename.includes('Rename target'));
  await undo();
  check('register: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- add a lane to a laneless row (setLane) ----
  await rowOf('Lane-less target').locator('[data-edit="lane"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Growth');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tLane = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: lane-cell edit adds "Lane: " to a laneless row', tLane.includes('Growth: Lane-less target'));
  await undo();
  check('register: one undo restores the pre-lane baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- add a note to a note-less row (addNote) ----
  await rowOf('Note-less target').locator('[data-edit="note"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('first note');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tNote = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: note-cell edit adds " -- " to a note-less row', tNote.includes('Core: Note-less target -- first note'));
  await undo();
  check('register: one undo restores the pre-note baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- add a note to a row carrying an xN span: the note must land AFTER
  // the token (A1's regression guard — the bug it guards against would have
  // produced "Spanning target -- keeps span x2", silently destroying the span) ----
  await rowOf('Spanning target').locator('[data-edit="note"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('keeps span');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tSpanNote = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: note on a spanning row lands AFTER xN, preserving the span (A1 regression guard)',
    /Core: Spanning target x2 -- keeps span/.test(tSpanNote));
  await undo();
  check('register: one undo restores the pre-span-note baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- set a status on a status-less row (addStatus) ----
  await rowOf('Status-less target').locator('[data-edit="status"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'risk'}).click();
  await p.waitForTimeout(600);
  const tStatus = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: status-cell pick adds "[status]" to a status-less row', tStatus.includes('Core: Status-less target [risk]'));
  await undo();
  check('register: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- change horizon via the row menu "Move to…" ----
  await tapCard('Rename target');
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Move to…'}).click();
  await p.waitForTimeout(200);
  check('register: Move to… submenu lists the model’s horizons',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Q3 2026|Q4 2026|Q1 2027|Q2 2027');
  await p.locator('.eip-pop button', {hasText: 'Q4 2026'}).click();
  await p.waitForTimeout(600);
  const tMove = await p.evaluate(() => localStorage.getItem('roadmap-src'));
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
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Move to…'}).click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Q1 2027'}).click();
  await p.waitForTimeout(600);
  const tMoveEmpty = await p.evaluate(() => localStorage.getItem('roadmap-src'));
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
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('New headerless item');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tAdd = await p.evaluate(() => localStorage.getItem('roadmap-src'));
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
  await p.waitForTimeout(200);
  check('register: the card menu offers a Lane… row',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
      'Rename…|Edit note…|Status…|Lane…|Move to…|Runs until…|Remove item');
  await p.locator('.eip-pop button', {hasText: 'Lane…'}).click();
  await p.waitForTimeout(200);
  check('register: Lane… opens the lane input prefilled with the current lane',
    await p.locator('.eip-input').inputValue() === 'Core');
  await p.locator('.eip-input').fill('Ops');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tMenuLane = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: Lane… commits the new lane',
    tMenuLane.includes('Ops: Rename target') && !tMenuLane.includes('Core: Rename target'));
  await undo();
  check('register: one undo restores the pre-Lane-menu baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  check('register: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: BOARD — inline card edits (title/lane/note/status) and the
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
  await p.locator('.cm-content').click();
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

  const rowOf = title => p.locator('#preview svg g[data-edit="cardmenu"]').filter({hasText: title}).first();
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+z');
    await p.waitForTimeout(500);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));

  // ---- rename via the card's title field ----
  await p.locator('[data-edit="title"]', {hasText: 'Rename target'}).first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Renamed OK');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tRename = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('board: title edit lands in the source',
    tRename.includes('Core: Renamed OK') && !tRename.includes('Rename target'));
  await undo();
  check('board: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- the lane tag on a laneless card (setLane) ----
  await rowOf('Lane-less target').locator('[data-edit="lane"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Growth');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tLane = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('board: lane-tag edit adds "Lane: " to a laneless card', tLane.includes('Growth: Lane-less target'));
  await undo();
  check('board: one undo restores the pre-lane baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- "+ note" on a note-less card (addNote) ----
  await rowOf('Note-less target').locator('[data-edit="note"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('first note');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tNote = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('board: "+ note" adds " -- " to a note-less card', tNote.includes('Core: Note-less target -- first note'));
  await undo();
  check('board: one undo restores the pre-note baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- "+ status" on a status-less card (addStatus) ----
  await rowOf('Status-less target').locator('[data-edit="status"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'risk'}).click();
  await p.waitForTimeout(600);
  const tStatus = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('board: "+ status" adds "[status]" to a status-less card', tStatus.includes('Core: Status-less target [risk]'));
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
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('New headerless card');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tAdd = await p.evaluate(() => localStorage.getItem('roadmap-src'));
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
  await p.locator('.cm-content').click();
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

  const cardOf = title => p.locator('#preview svg g[data-edit="cardmenu"]').filter({hasText: title}).first();
  const tapCard = async title => {
    const box = await cardOf(title).locator('rect[data-hit]').boundingBox();
    await p.mouse.click(box.x + 8, box.y + 4);
  };
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+z');
    await p.waitForTimeout(500);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));

  // ================= HERO: full inline edit targets =================

  // ---- rename via the hero card's title ----
  await p.locator('[data-edit="title"]', {hasText: 'Hero rename target'}).first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Hero renamed OK');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tRename = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('focus hero: title-cell rename lands in the source',
    tRename.includes('Core: Hero renamed OK') && !tRename.includes('Hero rename target'));
  await undo();
  check('focus hero: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- tap the hero card's lane tag → set a lane (setLane) ----
  await cardOf('Lane-less hero target').locator('[data-edit="lane"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Growth');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tLane = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('focus hero: lane-tag edit adds "Lane: " to a laneless hero card', tLane.includes('Growth: Lane-less hero target'));
  await undo();
  check('focus hero: one undo restores the pre-lane baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- "+ note" on a note-less hero card (addNote) ----
  await cardOf('Note-less hero target').locator('[data-edit="note"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('first note');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tNote = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('focus hero: "+ note" adds " -- " to a note-less hero card', tNote.includes('Core: Note-less hero target -- first note'));
  await undo();
  check('focus hero: one undo restores the pre-note baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- "+ status" on a status-less hero card (addStatus) ----
  await cardOf('Status-less hero target').locator('[data-edit="status"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'risk'}).click();
  await p.waitForTimeout(600);
  const tStatus = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('focus hero: "+ status" adds "[status]" to a status-less hero card', tStatus.includes('Core: Status-less hero target [risk]'));
  await undo();
  check('focus hero: one undo restores the pre-status baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ================= RAIL: clean index (rename only) + Status… submenu =================

  // ---- rename via the rail row's title ----
  await p.locator('[data-edit="title"]', {hasText: 'Rail rename target'}).first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Rail renamed OK');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tRailRename = await p.evaluate(() => localStorage.getItem('roadmap-src'));
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
  await p.waitForTimeout(200);
  check('focus rail: the card menu offers a Status… submenu row (no inline status target to open)',
    (await p.locator('.eip-pop button').allInnerTexts()).includes('Status…'));
  await p.locator('.eip-pop button', {hasText: 'Status…'}).click();
  await p.waitForTimeout(200);
  check('focus rail: the Status… submenu lists the four statuses by their labels',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Done|In progress|At risk|Blocked');
  await p.locator('.eip-pop button', {hasText: 'At risk'}).click();
  await p.waitForTimeout(600);
  const tRailStatus = await p.evaluate(() => localStorage.getItem('roadmap-src'));
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
  await p.waitForTimeout(600);
  const tLens = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('focus lens: clicking a rail header writes focus: <horizon>', /focus:\s*Q4 2026/.test(tLens));
  check('focus lens: the newly-focused horizon\'s items render as hero cards (gain a note edit target)',
    (await cardOf('Rail rename target').locator('[data-edit="note"]').count()) === 1);
  await undo();
  check('focus lens: one undo restores the pre-lens baseline', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  // ---- keyboard path: focus (Tab-equivalent) a rail header, then press Enter — same commit ----
  await p.locator('[data-lens="Q1 2027"]').focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tLensKb = await p.evaluate(() => localStorage.getItem('roadmap-src'));
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
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('New headerless rail item');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tAdd = await p.evaluate(() => localStorage.getItem('roadmap-src'));
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
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('NOW\nCore: Ship it\n');
  await p.waitForTimeout(700);

  const line = await p.locator('#preview svg g[data-edit="cardmenu"]')
    .filter({hasText: 'Ship it'}).first().getAttribute('data-line');
  const box = await p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]').boundingBox();
  await p.mouse.click(box.x + 8, box.y + 4);
  await p.waitForTimeout(200);
  check('roadmap: the Lane… row does not appear on a chart (now/next/later) doc',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit note…|Status…|Move to…|Remove item');

  check('roadmap: no console/page errors (chart Lane… absence)', errs.length === 0);
  await p.close();
}

/* ---- roadmap narrow (mobile-emulated): card menu away-listener leak proof —
   tap a card, open Rename, then tap INTO the input itself; the popover's
   away-pointerdown listener must not treat that as an outside click ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  await mpage.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'Habit app roadmap'}).click();
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
    .filter({hasText: 'Streak freeze'}).first().getAttribute('data-line');
  {
    const titleField = mpage.locator('#preview svg [data-edit="title"][data-line="' + mLine + '"]').first();
    await titleField.scrollIntoViewIfNeeded();
    await mpage.waitForTimeout(300);
    const titleBox = await titleField.boundingBox();
    await mpage.mouse.click(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await mpage.waitForTimeout(200);
    check('roadmap: coarse title-field tap opens the menu, not the title editor',
      await mpage.locator('.eip-pop').count() === 1);
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
  await mpage.waitForTimeout(200);
  check('roadmap narrow: tap opens the card menu', await mpage.locator('.eip-pop').count() === 1);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Rename…'}));
  await mpage.waitForTimeout(200);
  check('roadmap narrow: menu Rename opens the input', await mpage.locator('.eip-input').count() === 1);

  const ib = await mpage.locator('.eip-input').boundingBox();
  await mpage.touchscreen.tap(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await mpage.waitForTimeout(300);
  check('roadmap narrow: a touch INTO the input does not dismiss it (away-listener leak)',
    await mpage.locator('.eip-input').count() === 1);

  await mpage.locator('.eip-input').fill('Streak point');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  check('roadmap narrow: commit lands after the away-tap proof',
    (await mpage.evaluate(() => localStorage.getItem('roadmap-src'))).includes('Streak point [doing]'));
  check('roadmap narrow: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- map: card menu (tap card body → menu; rename/field/remove; real drag
   suppresses the menu) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/map/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Assumption map'}).click();
  await p.waitForTimeout(600);

  /* "Users will log habits daily" (srcLine 3) carries a `test:` field so the
     Edit-field row isn't vacuous. Unlike roadmap, map's data-hit rect is snug
     around the capsule (same width as the label) — its geometric CENTRE
     lands on a glyph, which both fails Playwright's actionability check and
     would (for real) open the label editor instead of the menu. Tap the
     left padding strip instead (card padding is 8px; x+4 clears any glyph). */
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tapCard = async line => {
    const box = await cardBody(line).boundingBox();
    await p.mouse.click(box.x + 4, box.y + box.height / 2);
  };
  const baseline = await p.evaluate(() => localStorage.getItem('map-src'));
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+z');
    await p.waitForTimeout(500);
  };

  await tapCard(3);
  await p.waitForTimeout(200);
  check('map: card body tap opens the menu with the expected rows',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit field…|Move…|Remove');

  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await p.waitForTimeout(200);
  check('map: menu Rename opens the label input prefilled', await p.locator('.eip-input').inputValue() === 'Users will log habits daily');
  await p.locator('.eip-input').fill('Users log habits nightly');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tRename = await p.evaluate(() => localStorage.getItem('map-src'));
  check('map: menu Rename commits the new label', tRename.includes('Users log habits nightly') && !tRename.includes('Users will log habits daily'));
  await undo();
  check('map: one undo restores the pre-rename baseline', (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  await tapCard(3);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Edit field…'}).click();
  await p.waitForTimeout(200);
  check('map: menu Edit field opens the field input prefilled', await p.locator('.eip-input').inputValue() === 'watch 5 onboarding sessions');
  await p.locator('.eip-input').fill('watch 8 onboarding sessions');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tField = await p.evaluate(() => localStorage.getItem('map-src'));
  check('map: menu Edit field commits the new value', tField.includes('test: watch 8 onboarding sessions'));
  await undo();
  check('map: one undo restores the pre-field baseline', (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  await tapCard(3);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('map-src'));
  check('map: menu Remove drops the card', !tRemove.includes('Users will log habits daily'));
  await undo();
  check('map: one undo restores the removed card', (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  /* Move…: the menu row arms a one-shot tap-the-plane placement (built for
     coarse pointers, but not gated — it works with a mouse too) */
  await tapCard(3);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Move…'}).click();
  await p.waitForTimeout(250);
  check('map: Move… arms the placement hint and commits nothing',
    await p.locator('.placehint').count() === 1 &&
    (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);
  const plane0 = await p.locator('#preview svg rect[data-plane]').boundingBox();
  await p.mouse.click(plane0.x + plane0.width * 0.25, plane0.y + plane0.height * 0.25);
  await p.waitForTimeout(600);
  check('map: the place-tap writes @ 25,75 as one text edit',
    (await p.evaluate(() => localStorage.getItem('map-src'))).includes('Users will log habits daily @ 25,75'));
  check('map: placement disarms after the tap', await p.locator('.placehint').count() === 0);
  await undo();
  check('map: one undo restores the pre-move baseline',
    (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  /* an off-plane tap cancels the armed placement without a write */
  await tapCard(3);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Move…'}).click();
  await p.waitForTimeout(250);
  await p.mouse.click(plane0.x + plane0.width / 2, plane0.y - 40);
  await p.waitForTimeout(400);
  check('map: an off-plane tap cancels the placement, nothing written',
    await p.locator('.placehint').count() === 0 &&
    (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  /* tray items get the same menu with Place on map… — the unplaced item's
     only non-drag placement path */
  const trayHit = p.locator('#preview svg g[data-tray] rect[data-hit]');
  const trayBox = await trayHit.boundingBox();
  await p.mouse.click(trayBox.x + 4, trayBox.y + trayBox.height / 2);
  await p.waitForTimeout(200);
  check('map: tray card menu offers Place on map…',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit field…|Place on map…|Remove');
  await p.locator('.eip-pop button', {hasText: 'Place on map…'}).click();
  await p.waitForTimeout(250);
  await p.mouse.click(plane0.x + plane0.width * 0.6, plane0.y + plane0.height * 0.3);
  await p.waitForTimeout(600);
  check('map: placing the tray item writes @ 60,70 (leaves the tray)',
    (await p.evaluate(() => localStorage.getItem('map-src'))).includes('Legal sign-off on health claims @ 60,70'));
  await undo();
  check('map: one undo restores the pre-place baseline',
    (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

  /* real mouse drag: "Streak anxiety drives churn" (@ 75,80) dropped near
     the plane centre rewrites its position and must NOT open a card menu */
  const plane = await p.locator('#preview svg rect[data-plane]').boundingBox();
  const dragSrc = await cardBody(4).boundingBox();
  const tx = plane.x + plane.width * 0.5, ty = plane.y + plane.height * 0.5;
  await p.mouse.move(dragSrc.x + dragSrc.width / 2, dragSrc.y + dragSrc.height / 2);
  await p.mouse.down();
  for(let i = 1; i <= 8; i++)
    await p.mouse.move(dragSrc.x + (tx - dragSrc.x) * i / 8, dragSrc.y + (ty - dragSrc.y) * i / 8);
  await p.mouse.up();
  await p.waitForTimeout(500);
  const tDrag = await p.evaluate(() => localStorage.getItem('map-src'));
  check('map: real drag moves the card (position rewritten)',
    /Streak anxiety drives churn @ \d+,\d+/.test(tDrag) && !tDrag.includes('Streak anxiety drives churn @ 75,80'));
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
    await mpage.waitForTimeout(200);
    check('map: coarse label-field tap opens the menu, not the label editor',
      await mpage.locator('.eip-pop').count() === 1);
    await mpage.keyboard.press('Escape');
    await mpage.waitForTimeout(200);
  }

  /* the hit-rect gate: a readout-panel field tap shares its card's
     data-line but sits far outside the menu's hit-rect (a different plane
     entirely), so it must keep its direct value edit rather than redirect. */
  {
    const roField = mpage.locator('#preview svg text[data-edit="field"]').first();
    await roField.scrollIntoViewIfNeeded();
    await mpage.waitForTimeout(300);
    const roBox = await roField.boundingBox();
    await mpage.mouse.click(roBox.x + roBox.width / 2, roBox.y + roBox.height / 2);
    await mpage.waitForTimeout(200);
    check('map: coarse readout field tap opens the value editor, not the menu',
      await mpage.locator('.eip-pop').count() === 0 && await mpage.locator('.eip-input').count() === 1);
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
  await mpage.waitForTimeout(200);
  check('map narrow: tap opens the card menu', await mpage.locator('.eip-pop').count() === 1);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Rename…'}));
  await mpage.waitForTimeout(200);
  check('map narrow: menu Rename opens the input', await mpage.locator('.eip-input').count() === 1);

  const ib = await mpage.locator('.eip-input').boundingBox();
  await mpage.touchscreen.tap(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await mpage.waitForTimeout(300);
  check('map narrow: a touch INTO the input does not dismiss it (away-listener leak)',
    await mpage.locator('.eip-input').count() === 1);

  await mpage.locator('.eip-input').fill('Habit logging cools off');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  check('map narrow: commit lands after the away-tap proof',
    (await mpage.evaluate(() => localStorage.getItem('map-src'))).includes('Habit logging cools off'));
  check('map narrow: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- why narrow (mobile-emulated): coarse menu-first redirect ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  await mpage.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'Habit retention'}).click();
  await mpage.waitForTimeout(600);

  /* "Smart reminders" (srcLine 5) is a solution card: tap its LABEL text
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
  await mpage.waitForTimeout(200);
  check('why: coarse label-field tap opens the menu, not the label editor',
    await mpage.locator('.eip-pop').count() === 1);
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
  await p.getByRole('button', {name: 'Route to market'}).click();
  await p.waitForTimeout(600);
  const before = await p.evaluate(() => localStorage.getItem('risk-src'));
  await p.locator('[data-field="level"]').first().click();
  await p.waitForTimeout(200);
  check('risk: overlay opens prefilled', await p.locator('.eip-input').inputValue() === '70');
  await p.locator('.eip-input').fill('90');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => localStorage.getItem('risk-src'));
  check('risk: floor level rewrite lands', after.includes('floor: 90') && !after.includes('floor: 70'));
  check('risk: diagram re-rendered', (await p.locator('#preview svg').innerHTML()).includes('Floor 90'));
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  await p.waitForTimeout(500);
  check('risk: one undo reverts', (await p.evaluate(() => localStorage.getItem('risk-src'))) === before);
  check('risk: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- cycles (energy) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/energy/cycles/', {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Wexcombe base case'}).click();
  await p.waitForTimeout(1000);
  const before = await p.evaluate(() => localStorage.getItem('cycles-src'));
  await p.locator('[data-field="budget"]').first().click();
  await p.waitForTimeout(200);
  check('cycles: overlay prefilled', await p.locator('.eip-input').inputValue() === '6000');
  await p.locator('.eip-input').fill('3000');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1000);
  check('cycles: budget rewrite lands', (await p.evaluate(() => localStorage.getItem('cycles-src'))).includes('cycles: 3000 over 15yr'));
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  await p.waitForTimeout(700);
  check('cycles: one undo reverts', (await p.evaluate(() => localStorage.getItem('cycles-src'))) === before);
  check('cycles: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- wardley: name edit, stage cycle, drag writes text, vertical no-op ---- */
{
  const wpage = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const werrors = trackErrors(wpage);
  await wpage.goto((process.env.BASE || 'http://localhost:8087') + '/wardley/', {waitUntil: 'networkidle'});
  await wpage.waitForTimeout(500);

  // name edit commits to the editor text and every edge mention
  await wpage.locator('text[data-edit="name"]', {hasText: 'User DB'}).first().click();
  await wpage.waitForTimeout(200);
  check('wardley: name editor opens prefilled', await wpage.locator('.eip-input').inputValue() === 'User DB');
  await wpage.locator('.eip-input').fill('Postgres');
  await wpage.keyboard.press('Enter');
  await wpage.waitForTimeout(500);
  const wsrc = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: rename hits declaration + edges', wsrc.includes('Postgres @ commodity') && wsrc.includes('-> Postgres') && !wsrc.includes('User DB'));

  // stage cycle: click the pill rect steps custom -> product
  // the text element covers the pill centre (that's the name target) — cycle stage from the capsule's edge
  await wpage.locator('rect[data-edit="stage"][data-raw="custom"]').first().click({position: {x: 8, y: 13}});
  await wpage.waitForTimeout(400);
  const wsrc2 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: stage cycle writes the next stage word', wsrc2.includes('Streak engine @ product'));

  // real mouse drag writes a numeric position; Cmd+Z restores it
  const pill = wpage.locator('#preview svg g[data-drag="evo"]', {hasText: 'Habit builder'}).first();
  const box = await pill.boundingBox();
  await wpage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await wpage.mouse.down();
  await wpage.mouse.move(box.x + box.width / 2 - 180, box.y + box.height / 2, {steps: 8});
  await wpage.mouse.up();
  await wpage.waitForTimeout(500);
  const wsrc3 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: drag writes @ 0.NN', /Habit builder @ 0\.\d+/.test(wsrc3));
  await wpage.keyboard.press('ControlOrMeta+z');
  await wpage.waitForTimeout(400);
  const wsrc4 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: Cmd+Z undoes the drag', wsrc4.includes('Habit builder @ product'));

  // vertical drag leaves the text untouched
  const pill2 = wpage.locator('#preview svg g[data-drag="evo"]', {hasText: 'Streak engine'}).first();
  const box2 = await pill2.boundingBox();
  await wpage.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await wpage.mouse.down();
  await wpage.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2 + 140, {steps: 6});
  await wpage.mouse.up();
  await wpage.waitForTimeout(400);
  const wsrc5 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: vertical drag is a no-op on the text', wsrc5 === wsrc4);

  // add zone: tap the CUSTOM stage's ghost "+" → eip-input opens empty → type Cache → Enter
  await wpage.locator('[data-edit="additem"][data-stage="custom"]').first().click();
  await wpage.waitForTimeout(200);
  check('wardley: add zone opens the eip-input', await wpage.locator('.eip-input').count() === 1);
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
  check('wardley: fine-pointer add focuses the editor', await wpage.evaluate(() =>
    !!document.activeElement && !!document.activeElement.closest('.cm-editor')));

  // component menu: tap Cache's ⋯ → danger row removes the declaration + any edge mentions
  await wpage.locator('[data-edit="componentmenu"][data-raw="Cache"]').first().click();
  await wpage.waitForTimeout(200);
  check('wardley: component menu shows Needs… then the danger row',
    (await wpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Needs…|Remove component');
  await wpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}).click();
  await wpage.waitForTimeout(500);
  const wsrc8 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: remove component drops the declaration', !wsrc8.includes('Cache @ custom'));
  check('wardley: remove component leaves no edge remnant', !wsrc8.includes('-> Cache'));

  // CM keymaps need focus first (this section's existing pattern); ONE undo
  // must round-trip the whole removal (applyLineOps' single-dispatch proof)
  await wpage.locator('.cm-content').click();
  await wpage.keyboard.press('ControlOrMeta+z');
  await wpage.waitForTimeout(500);
  const wsrc9 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: one undo restores the full pre-removal text (applyLineOps one history event)', wsrc9 === wsrc7);

  // remove a LINKED component (Streak engine sits in two chains) — this is the
  // multi-op removal (declaration delete + edge splices/deletes) that
  // applyLineOps exists for; the earlier Cache remove was single-op
  await wpage.locator('[data-edit="componentmenu"][data-raw="Streak engine"]').first().click();
  await wpage.waitForTimeout(200);
  await wpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}).click();
  await wpage.waitForTimeout(500);
  const wsrc10 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: linked remove splices the chains (no -> Streak engine, no Streak engine ->, no declaration)',
    !/->\s*streak engine|streak engine\s*->|streak engine\s*@/i.test(wsrc10));
  // the 3-chain "… -> Habit builder -> Streak engine -> <end>" must splice to
  // "… -> Habit builder -> <end>" — endpoint name is whatever earlier steps
  // renamed it to, so assert the join, not the name
  check('wardley: the 3-chain kept its ends after the splice', /habit tracking\s*->\s*habit builder\s*->\s*\S/i.test(wsrc10));
  await wpage.locator('.cm-content').click();
  await wpage.keyboard.press('ControlOrMeta+z');
  await wpage.waitForTimeout(500);
  check('wardley: one undo restores the multi-op removal (single dispatch)',
    (await wpage.evaluate(() => localStorage.getItem('wardley-src'))) === wsrc9);

  // narrow: a TAP on the ghost's strip places it, comment kept before //
  await wpage.setViewportSize({width: 430, height: 900});
  await wpage.waitForTimeout(600);
  const ghostTrack = wpage.locator('#preview svg g[data-strip=""]', {has: wpage.locator('circle[stroke-dasharray]')}).first().locator('[data-track]');
  const gb = await ghostTrack.boundingBox();
  await wpage.mouse.click(gb.x + gb.width * 0.6, gb.y + 4);
  await wpage.waitForTimeout(500);
  const wsrc6 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
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

  // tap the "+ Add component" card (no data-stage on narrow) → type Inbox → Enter
  await settledTap(mpage, mpage.locator('[data-edit="additem"]').first());
  await mpage.waitForTimeout(200);
  await mpage.locator('.eip-input').fill('Inbox');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  const msrc = await mpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley narrow: add-card inserts Inbox as an unplaced ghost (no stage)', /^Inbox$/m.test(msrc));
  check('wardley narrow: coarse-pointer add opts OUT of editor focus', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));

  // tap Inbox's ghost strip at ~70% along its track
  const inboxTrack = mpage.locator('#preview svg g[data-strip=""][data-name="Inbox"] [data-track]');
  await inboxTrack.scrollIntoViewIfNeeded();
  await mpage.waitForTimeout(300);
  const itb = await inboxTrack.boundingBox();
  await mpage.mouse.click(itb.x + itb.width * 0.7, itb.y + itb.height / 2);
  await mpage.waitForTimeout(600);
  const msrc2 = await mpage.evaluate(() => localStorage.getItem('wardley-src'));
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
     the chain-splitting rewrite. State here is the pristine Habitat example
     (the Inbox add/place/remove round-tripped). ---- */
  const wSrc = () => mpage.evaluate(() => localStorage.getItem('wardley-src'));
  // open Habit builder's ⋯ → the menu carries Needs… above the danger Remove
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Habit builder"]').first());
  await mpage.waitForTimeout(200);
  check('wardley needs: the ⋯ menu shows the Needs… row',
    await mpage.locator('.eip-pop button', {hasText: 'Needs…'}).count() === 1 &&
    await mpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}).count() === 1);
  // open the checklist: 6 other components, existing deps marked, anchor + self absent
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Needs…'}));
  await mpage.waitForTimeout(200);
  check('wardley needs: checklist lists every OTHER component (anchor + self absent)',
    await mpage.locator('.eip-pop button').count() === 6 &&
    await mpage.locator('.eip-pop button', {hasText: 'Habit builder'}).count() === 0 &&
    await mpage.locator('.eip-pop button', {hasText: 'Habit tracking'}).count() === 0);
  check('wardley needs: exactly the existing deps are marked on',
    (await mpage.locator('.eip-pop button.on').allInnerTexts()).sort().join('|') ===
    'Notification service|Streak engine');
  check('wardley needs: opening menu + checklist commits NOTHING (no silent commit)',
    (await wSrc()) === msrc3);
  check('wardley needs: no page h-scroll with the checklist open', await mpage.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1));

  // toggle OFF the MID-CHAIN pair: Habit builder -> Streak engine sits in the
  // middle of "Habit tracking -> Habit builder -> Streak engine -> User DB" —
  // the split must leave both halves as their own chains
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Streak engine'}));
  await mpage.waitForTimeout(600);
  const wsrc1 = await wSrc();
  check('wardley needs: mid-chain toggle OFF splits the chain into two 2-node chains',
    /^Habit tracking -> Habit builder$/m.test(wsrc1) &&
    /^Streak engine -> User DB$/m.test(wsrc1) &&
    !/Habit builder\s*->\s*Streak engine/.test(wsrc1));
  check('wardley needs: the map redraws with one fewer dependency',
    await mpage.locator('#preview svg text', {hasText: '8 dependencies'}).count() === 1);
  check('wardley needs: coarse toggle does NOT focus the editor', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));
  await settledTap(mpage, mpage.locator('.stage .actions .touch-undo'));
  await mpage.waitForTimeout(600);
  check('wardley needs: ONE ↶ Undo restores the split chain (single dispatch)',
    (await wSrc()) === msrc3);

  // toggle ON: Social feed gains "needs User DB" — a fresh 2-node line appends
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Social feed"]').first());
  await mpage.waitForTimeout(200);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Needs…'}));
  await mpage.waitForTimeout(200);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'User DB'}));
  await mpage.waitForTimeout(600);
  const wsrc2 = await wSrc();
  check('wardley needs: toggle ON appends the edge as its own line',
    /^Social feed -> User DB$/m.test(wsrc2));
  check('wardley needs: the map redraws with the new dependency counted',
    await mpage.locator('#preview svg text', {hasText: '10 dependencies'}).count() === 1);

  // WIDE map, still coarse (tablet-shaped): the added edge is a drawn arrow,
  // and the same menu path removes it — the single-edge-line case in browser
  await mpage.setViewportSize({width: 1194, height: 834});
  await mpage.waitForTimeout(800);
  check('wardley needs: the wide map draws the added edge (10 arrows)',
    await mpage.locator('#preview svg .edge').count() === 10);
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Social feed"]').first());
  await mpage.waitForTimeout(200);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'Needs…'}));
  await mpage.waitForTimeout(200);
  check('wardley needs: wide checklist marks the just-added dep on',
    await mpage.locator('.eip-pop button.on', {hasText: 'User DB'}).count() === 1);
  await settledTap(mpage, mpage.locator('.eip-pop button', {hasText: 'User DB'}));
  await mpage.waitForTimeout(600);
  check('wardley needs: wide toggle OFF deletes the whole single-edge line (back to baseline)',
    (await wSrc()) === msrc3 &&
    await mpage.locator('#preview svg .edge').count() === 9);
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
  await mpage.waitForTimeout(800);
  const tlNarrow = await mpage.evaluate(() => {
    const svg = document.querySelector('#preview svg');
    return {narrow: !!(svg && svg.hasAttribute('data-narrow')),
      menus: document.querySelectorAll('#preview svg g[data-edit="cardmenu"][data-menu]').length};
  });
  check('timeline narrow: the phone preview is the narrow relayout (data-narrow)', tlNarrow.narrow);
  check('timeline narrow: every milestone row is now a data-menu cardmenu (the pilot landed)', tlNarrow.menus === 7);

  const tlHit = line => mpage.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const tlTapCard = async line => {
    const h = tlHit(line);
    await h.scrollIntoViewIfNeeded();
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
  check('timeline narrow: a coarse card tap commits NOTHING on its own (menu-first, no silent step)',
    (await tlSrc()) === tlBase);

  // Status… → marked picker (none/done/risk); pick risk — a real rewrite, no bare-tap step
  await mpage.locator('.eip-pop button', {hasText: 'Status…'}).click();
  await mpage.waitForTimeout(250);
  check('timeline narrow: Status… opens a marked picker (none current), not a blind step',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'none|done|risk' &&
    (await mpage.locator('.eip-pop button.on').innerText()) === 'none');
  await mpage.locator('.eip-pop button', {hasText: 'risk'}).click();
  await mpage.waitForTimeout(600);
  check('timeline narrow: Status pick commits [risk]', /App: Feature freeze [^\n]*\[risk\]/.test(await tlSrc()));
  await tlUndo();
  check('timeline narrow: one Undo reverts the status', (await tlSrc()) === tlBase);

  // Lane… → submenu (existing lanes + New lane…); pick Marketing → rewrites the prefix
  await tlTapCard(1);
  await mpage.locator('.eip-pop button', {hasText: 'Lane…'}).click();
  await mpage.waitForTimeout(250);
  check('timeline narrow: Lane… lists the model’s lanes (current marked) + New lane…',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'App|Marketing|Compliance|New lane…' &&
    (await mpage.locator('.eip-pop button.on').innerText()) === 'App');
  await mpage.locator('.eip-pop button', {hasText: 'Marketing'}).click();
  await mpage.waitForTimeout(600);
  check('timeline narrow: Lane… pick rewrites the lane prefix', /^Marketing: Feature freeze\b/m.test(await tlSrc()));
  await tlUndo();
  check('timeline narrow: one Undo reverts the lane', (await tlSrc()) === tlBase);

  // ＋ Add to App capsule → inserts a lane-prefixed milestone; coarse add opts OUT of editor focus
  await settledTap(mpage, mpage.locator('#preview svg g[data-edit="additem"][data-lane="App"]'));
  await mpage.waitForTimeout(200);
  await mpage.locator('.eip-input').fill('Pen test');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  check('timeline narrow: ＋ Add to App inserts a lane-prefixed dated milestone',
    /^App: Pen test \d{4}-\d{2} \.\. \d{4}-\d{2}$/m.test(await tlSrc()));
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
  await mpage.getByRole('button', {name: 'Habitat portfolio'}).click();
  await mpage.waitForTimeout(800);
  const btNarrow = await mpage.evaluate(() => ({
    narrow: !!document.querySelector('#preview svg [data-narrow]'),
    menus: document.querySelectorAll('#preview svg g[data-edit="cardmenu"][data-menu]').length,
    addbets: document.querySelectorAll('#preview svg [data-edit="addbet"]').length,
    addgroups: document.querySelectorAll('#preview svg [data-edit="addgroup"]').length,
  }));
  check('bets narrow: the phone preview is the narrow relayout (data-narrow)', btNarrow.narrow);
  check('bets narrow: every bet card is a data-menu cardmenu', btNarrow.menus === 5);
  check('bets narrow: a ＋ Add bet capsule per group + one ＋ Add group at the foot',
    btNarrow.addbets === 2 && btNarrow.addgroups === 1);

  const btHit = line => mpage.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const btTapCard = async line => {
    const h = btHit(line);
    await h.scrollIntoViewIfNeeded();
    await mpage.waitForTimeout(300);
    const b = await h.boundingBox();
    await mpage.mouse.click(b.x + 10, b.y + 6);   // the card's top padding sliver
    await mpage.waitForTimeout(300);
  };
  const btSrc = () => mpage.evaluate(() => localStorage.getItem('bets-src'));
  const btBase = await btSrc();

  // Referral flow v2 (srcLine 5): the full six-row menu, no silent commit
  await btTapCard(5);
  check('bets narrow: card tap opens the menu with the expected rows (one popover)',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') ===
      'Rename…|Edit stake…|Edit odds…|Edit payoff…|Edit kill criterion…|Remove bet' &&
    await mpage.locator('.eip-pop').count() === 1);
  check('bets narrow: a coarse card tap commits NOTHING on its own (menu-first)', (await btSrc()) === btBase);

  // Rename… routes to the name target's input, prefilled; commit rewrites only the name
  await mpage.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await mpage.waitForTimeout(250);
  check('bets narrow: Rename… opens prefilled with the bet name',
    await mpage.locator('.eip-input').inputValue() === 'Referral flow v2');
  await mpage.locator('.eip-input').fill('Referral spine');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  check('bets narrow: Rename commits — attrs survive the rewrite',
    /^  Referral spine: stake 80, odds 40-60%, payoff 300-500$/m.test(await btSrc()));
  await tlUndo();
  check('bets narrow: one Undo reverts the rename', (await btSrc()) === btBase);

  // ＋ Add bet into Growth bets (the capsule carries the GROUP's srcLine, 4):
  // lands after the group's last bet block, typed name replaces the placeholder
  await settledTap(mpage, mpage.locator('#preview svg g[data-edit="addbet"][data-line="4"]'));
  await mpage.waitForTimeout(200);
  await mpage.locator('.eip-input').fill('Pen test');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  check('bets narrow: ＋ Add bet inserts a parseable placeholder into the group',
    (await btSrc()).split(/\r?\n/)[8] === '  Pen test: stake 50, odds 40-60%, payoff 100-200');
  check('bets narrow: coarse-pointer add opts OUT of editor focus', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));
  await tlUndo();
  check('bets narrow: one Undo removes the added bet', (await btSrc()) === btBase);

  // ＋ Add group closes the board
  await settledTap(mpage, mpage.locator('#preview svg g[data-edit="addgroup"]'));
  await mpage.waitForTimeout(200);
  await mpage.locator('.eip-input').fill('Ops bets');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  check('bets narrow: ＋ Add group appends a heading at the foot', /\nOps bets\s*$/.test(await btSrc()));
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
  await mpage.waitForTimeout(250);
  await mpage.locator('.eip-input').fill('35-55');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  check('bets narrow: menu value edit still commits', (await btSrc()).includes('odds 35-55%'));
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
  await mpage.getByRole('button', {name: 'Wexcombe base case'}).click();
  await mpage.waitForTimeout(900);
  const cySrc = () => mpage.evaluate(() => localStorage.getItem('cycles-src'));
  // scroll the target to centre, then click fresh viewport coords (see block note)
  const cyTap = async sel => {
    const pt = await mpage.evaluate(s => { const g = document.querySelector(s); if(!g) return null;
      g.scrollIntoView({block: 'center'}); const r = g.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }, sel);
    if(!pt) return false;
    await mpage.waitForTimeout(150);
    await mpage.mouse.click(pt.x, pt.y);
    await mpage.waitForTimeout(300);
    return true;
  };
  const cyUndo = async () => { await cyTap('.stage .actions .touch-undo'); await mpage.waitForTimeout(400); };
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
  await mpage.waitForTimeout(400);
  check('risk narrow: Rename writes the quoted label', /^toll: 95 "Fixed PPA"$/m.test(await rkSrc()));
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
  check('risk narrow: coarse-pointer add opts OUT of editor focus', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));
  await rkUndo();
  check('risk narrow: one Undo removes the added leg', (await rkSrc()) === rkBase);

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
  await mpage.waitForTimeout(300);
  check('risk append-fix: the absent-share pill opens an input (prefilled 100)',
    await mpage.locator('.eip-input').count() === 1 && await mpage.locator('.eip-input').inputValue() === '100');
  await mpage.locator('.eip-input').fill('75');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(400);
  check('risk append-fix: editing an absent share now WRITES it (was a silent no-op)',
    /^floor: 70 share 75%$/m.test(await mpage.evaluate(() => localStorage.getItem('risk-src'))));
  check('risk append-fix: no console/page errors', merrors.length === 0);
  await mctx.close();
}

/* ---- timeline desktop: per-lane add zone opens empty, typed value replaces
   the dated placeholder (not "New milestone" — that would test nothing) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  const errs = trackErrors(p);
  const seed = {t: 'title: Pen test doc\nGrid: Existing item 2026-08 .. 2026-10\n'};
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(seed))), 'binary').toString('base64');
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/timeline/#' + hash, {waitUntil: 'networkidle'});
  await p.waitForTimeout(500);
  await p.locator('[data-edit="additem"][data-lane="Grid"]').first().click();
  await p.waitForTimeout(200);
  check('timeline: lane zone opens the eip-input empty', await p.locator('.eip-input').inputValue() === '');
  await p.locator('.eip-input').fill('Pen test');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const t = await p.evaluate(() => localStorage.getItem('timeline-src'));
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
  await p.getByRole('button', {name: 'Habitat portfolio'}).click();
  await p.waitForTimeout(500);
  const baseline = await p.evaluate(() => localStorage.getItem('bets-src'));
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+z');
    await p.waitForTimeout(500);
  };

  // direct odds edit on "Referral flow v2" (srcLine 5): commits + re-renders
  await p.locator('[data-edit="odds"][data-line="5"]').click();
  await p.waitForTimeout(200);
  check('bets: odds cell opens prefilled', await p.locator('.eip-input').inputValue() === '40–60%');
  await p.locator('.eip-input').fill('35-55');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tOdds = await p.evaluate(() => localStorage.getItem('bets-src'));
  check('bets: odds edit commits to the editor text', tOdds.includes('odds 35-55%') && !tOdds.includes('odds 40-60%'));
  check('bets: board re-renders the new odds', (await p.locator('#preview svg').innerHTML()).includes('35–55%'));
  await undo();
  check('bets: one undo restores the pre-odds-edit baseline', (await p.evaluate(() => localStorage.getItem('bets-src'))) === baseline);

  // direct kill edit on the same bet's kill child (srcLine 6): an empty value REMOVES the line
  await p.locator('[data-edit="kill"][data-line="6"]').click();
  await p.waitForTimeout(200);
  check('bets: kill field opens prefilled', await p.locator('.eip-input').inputValue() === 'Signups per referral stay under 0.3 by 2026-09-15');
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
    const box = await cardBody(line).boundingBox();
    await p.mouse.click(box.x + 8, box.y + 4);
  };
  await tapCard(7);
  await p.waitForTimeout(200);
  check('bets: card menu shows the six rows (Rename + values + dynamic kill + Remove)',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') ===
      'Rename…|Edit stake…|Edit odds…|Edit payoff…|Edit kill criterion…|Remove bet');

  // Rename… routes to the wide ledger's (edit-gated) name target
  await p.locator('.eip-pop button', {hasText: 'Rename…'}).click();
  await p.waitForTimeout(200);
  check('bets: menu Rename opens the name input prefilled',
    await p.locator('.eip-input').inputValue() === 'Paid acquisition push');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  await tapCard(7);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Edit stake…'}).click();
  await p.waitForTimeout(200);
  check('bets: menu Edit stake opens the stake input prefilled', await p.locator('.eip-input').inputValue() === '220');
  await p.locator('.eip-input').fill('200');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const tStake = await p.evaluate(() => localStorage.getItem('bets-src'));
  check('bets: menu Edit stake commits the new value', tStake.includes('stake 200,') && !tStake.includes('stake 220,'));
  await undo();
  check('bets: one undo restores the pre-menu-edit baseline', (await p.evaluate(() => localStorage.getItem('bets-src'))) === baseline);

  // menu Edit kill criterion… re-opens the EXISTING kill field for a bet that has one
  await tapCard(7);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Edit kill criterion…'}).click();
  await p.waitForTimeout(200);
  check('bets: menu Edit kill criterion reopens the existing kill field',
    await p.locator('.eip-input').inputValue() === 'CAC exceeds £40 for two consecutive months');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  // menu Add kill criterion… on a bare bet ("Sync engine rewrite", srcLine 11 —
  // NO KILL CRITERION today, so the label flips) inserts a fresh child line
  await tapCard(11);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Add kill criterion…'}).click();
  await p.waitForTimeout(400);
  const tNewKill = await p.evaluate(() => localStorage.getItem('bets-src'));
  check('bets: menu Kill criterion on a bare bet inserts a fresh kill child line',
    tNewKill.split(/\r?\n/).includes('    kill: reason'));
  await undo();
  check('bets: one undo removes the inserted kill placeholder', (await p.evaluate(() => localStorage.getItem('bets-src'))) === baseline);

  check('bets: no console/page errors', errs.length === 0);
  await p.close();
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
    await p.mouse.click(box.x + 8, box.y + 4);
  };

  /* why: the astatus multi-value cycle (the original trap) */
  {
    const p = await mctx.newPage();
    const errs = trackErrors(p);
    await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
    await p.getByRole('button', {name: 'Habit retention'}).click();
    await p.waitForTimeout(700);
    const baseline = await p.evaluate(() => localStorage.getItem('why-src'));
    await settledTap(p, p.locator('[data-edit="astatus"][data-raw="testing"]').first());
    await p.waitForTimeout(250);
    check('phone why: astatus tap opens the cycle popover — no instant commit',
      await p.locator('.eip-pop').count() === 1);
    check('phone why: doc text UNCHANGED while the popover is open',
      (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);
    check('phone why: popover lists the four states with the current one marked',
      (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'untested|testing|holds|broken' &&
      (await p.locator('.eip-pop button.on').innerText()) === 'testing');
    await p.locator('.eip-pop button', {hasText: 'holds'}).click();
    await p.waitForTimeout(700);
    const picked = await p.evaluate(() => localStorage.getItem('why-src'));
    check('phone why: picking commits EXACTLY the picked value (not "next in cycle")',
      picked.includes('? users want to be interrupted at work [holds]'));
    /* Rule 2: the touch Undo button reverts through the editor's history */
    await settledTap(p, p.locator('.actions .touch-undo'));
    await p.waitForTimeout(600);
    check('phone why: ↶ Undo reverts the popover commit',
      (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);
    /* the data-menu redirect still wins where a menu sibling covers the tap */
    await sliverTap(p, p.locator('#preview svg rect[data-edit^="cardmenu"][data-hit]').first());
    await p.waitForTimeout(250);
    check('phone why: card-body tap opens exactly ONE menu popover (redirect wins, nothing double-fires)',
      await p.locator('.eip-pop').count() === 1 &&
      await p.locator('.eip-pop button', {hasText: 'Rename…'}).count() === 1);
    check('phone why: menu open commits nothing',
      (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);
    /* away-dismiss: a pointerdown anywhere outside the popover closes it.
       Synthetic on body — a coordinate tap risks hitting the crumb link or
       another [data-edit] target, and a locator click scroll-closes first. */
    await p.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})));
    await p.waitForTimeout(250);
    check('phone why: away pointerdown dismisses the popover without a commit',
      await p.locator('.eip-pop').count() === 0 &&
      (await p.evaluate(() => localStorage.getItem('why-src'))) === baseline);
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
    await p.getByRole('button', {name: 'Habit retention'}).click();
    await p.waitForTimeout(700);
    const inCm = () => p.evaluate(() => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.cm-editor')));
    await sliverTap(p, p.locator('#preview svg rect[data-edit^="cardmenu"][data-hit]').first());
    await p.waitForTimeout(250);
    await p.locator('.eip-pop button', {hasText: /Add/}).first().click();
    await p.waitForTimeout(600);
    check('phone why: coarse add-from-diagram does NOT focus the DSL editor (no soft-keyboard jump)', !(await inCm()));
    await settledTap(p, p.locator('.actions .touch-undo'));
    await p.waitForTimeout(600);
    check('phone why: coarse ↶ Undo does NOT focus the DSL editor', !(await inCm()));
    check('phone why (focus block): no console/page errors', errs.length === 0);
    await p.close();
  }

  /* map: the coarse card-menu REDIRECT branch. map's items carry BOTH a small ×
     removeitem cycle AND a cardmenu whose hit-rect covers it — so a coarse tap on
     the × is redirected to the card menu (line ~284 in edit-in-place.js) rather
     than firing the ['×'] cycle popover. Confirm: the redirect wins (a menu, not a
     bare × confirm), nothing commits on open, its danger Remove removes the line,
     and ↶ Undo restores it. The standalone ['×'] cycle-popover (no menu sibling)
     is proved on timeline-tablet below. */
  {
    const p = await mctx.newPage();
    const errs = trackErrors(p);
    await p.goto(BASE.replace('/tree/', '/map/'), {waitUntil: 'networkidle'});
    await p.getByRole('button', {name: 'Assumption map'}).click();
    await p.waitForTimeout(700);
    const baseline = await p.evaluate(() => localStorage.getItem('map-src'));
    await settledTap(p, p.locator('[data-edit="removeitem"]').first());
    await p.waitForTimeout(250);
    check('phone map: × tap redirects to the card MENU (not a silent removal, not a bare × confirm)',
      await p.locator('.eip-pop').count() === 1 &&
      await p.locator('.eip-pop button', {hasText: 'Rename…'}).count() === 1 &&
      await p.locator('.eip-pop button.danger', {hasText: 'Remove'}).count() === 1);
    check('phone map: doc text UNCHANGED while the menu is open',
      (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);
    await p.locator('.eip-pop button.danger', {hasText: 'Remove'}).click();
    await p.waitForTimeout(700);
    const removed = await p.evaluate(() => localStorage.getItem('map-src'));
    check('phone map: the menu Remove commits the removal', removed !== baseline &&
      removed.split('\n').length === baseline.split('\n').length - 1);
    await settledTap(p, p.locator('.actions .touch-undo'));
    await p.waitForTimeout(600);
    check('phone map: ↶ Undo restores the removed line',
      (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

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
    await p.waitForTimeout(250);
    check('phone map: the card menu offers Move…',
      await p.locator('.eip-pop button', {hasText: 'Move…'}).count() === 1);
    await p.locator('.eip-pop button', {hasText: 'Move…'}).click();
    await p.waitForTimeout(300);
    check('phone map: Move… arms the hint (with a Cancel), commits nothing',
      await p.locator('.placehint').count() === 1 &&
      await p.locator('.placehint .btn', {hasText: 'Cancel'}).count() === 1 &&
      (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);
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
    const mPlaced = (await p.evaluate(() => localStorage.getItem('map-src'))).match(/Users will log habits daily @ (\d+),(\d+)/);
    check('phone map: the place-tap writes @ x,y within ±2 of the tapped point',
      mPlaced && Math.abs(+mPlaced[1] - expX) <= 2 && Math.abs(+mPlaced[2] - expY) <= 2);
    check('phone map: placement disarms after the tap', await p.locator('.placehint').count() === 0);
    check('phone map: coarse place does NOT focus the editor (no soft-keyboard jump)',
      await p.evaluate(() => !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.cm-editor'))));
    check('phone map: no page h-scroll while placing',
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await settledTap(p, p.locator('.actions .touch-undo'));
    await p.waitForTimeout(600);
    check('phone map: ↶ Undo reverts the placement',
      (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

    /* the armed state is escapable (no silent trap): Cancel disarms, no write */
    await mHit.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    const mBox2 = await mHit.boundingBox();
    await p.mouse.click(mBox2.x + 4, mBox2.y + mBox2.height / 2);
    await p.waitForTimeout(250);
    await p.locator('.eip-pop button', {hasText: 'Move…'}).click();
    await p.waitForTimeout(300);
    const cBox = await p.locator('.placehint .btn').boundingBox();
    check('phone map: the hint Cancel is a >=44px target', cBox.height >= 44);
    await p.touchscreen.tap(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2);
    await p.waitForTimeout(300);
    check('phone map: Cancel disarms without a write',
      await p.locator('.placehint').count() === 0 &&
      (await p.evaluate(() => localStorage.getItem('map-src'))) === baseline);

    check('phone map: no console/page errors', errs.length === 0);
    await p.close();
  }

  /* roadmap at 390: the narrow chart's card menu opens (a sample of the
     narrow-relayout tools keeping their tap-to-edit entry point) */
  {
    const p = await mctx.newPage();
    const errs = trackErrors(p);
    await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
    await p.getByRole('button', {name: 'Habit app roadmap'}).click();
    await p.waitForTimeout(700);
    const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
    await sliverTap(p, p.locator('#preview svg g[data-edit="cardmenu"] rect[data-hit]').first());
    await p.waitForTimeout(250);
    check('phone roadmap: narrow-chart card tap opens the menu, commits nothing',
      await p.locator('.eip-pop').count() === 1 &&
      (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);
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
   status target is now the real state list, so a COARSE tap opens the marked
   picker instead of silently stepping (the ['cycle'] sentinel's mis-tap trap is
   closed); a fine click still steps (proved by the desktop lane block + node
   tests). The × removeitem cycle keeps its one-row danger confirm. ---- */
{
  const tctx = await browser.newContext({...devices['iPad Pro 11 landscape'], reducedMotion: 'reduce'});
  const p = await tctx.newPage();
  const errs = trackErrors(p);
  await p.goto(BASE.replace('/tree/', '/timeline/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'App launch programme'}).click();
  await p.waitForTimeout(700);
  const baseline = await p.evaluate(() => localStorage.getItem('timeline-src'));
  await settledTap(p, p.locator('[data-edit="status"]').first());
  await p.waitForTimeout(400);
  check('tablet timeline: a coarse status tap opens the marked picker — NO silent step',
    await p.locator('.eip-pop').count() === 1 &&
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'none|done|risk' &&
    (await p.evaluate(() => localStorage.getItem('timeline-src'))) === baseline);
  await p.locator('.eip-pop button', {hasText: 'risk'}).click();
  await p.waitForTimeout(600);
  const stepped = await p.evaluate(() => localStorage.getItem('timeline-src'));
  check('tablet timeline: picking a status commits it (no blind step)', stepped !== baseline && /\[risk\]/.test(stepped));
  await settledTap(p, p.locator('.actions .touch-undo'));
  await p.waitForTimeout(600);
  check('tablet timeline: ↶ Undo reverts the picked status',
    (await p.evaluate(() => localStorage.getItem('timeline-src'))) === baseline);

  /* the standalone ['×'] cycle popover (Rule 1's remove branch): timeline has NO
     card menu, so its × removeitem has no data-menu sibling — the redirect can't
     fire and openCyclePopover(isRemove) IS the path. A bare tap must open a
     one-row danger confirm, commit NOTHING until confirmed, then remove on tap. */
  const base2 = await p.evaluate(() => localStorage.getItem('timeline-src'));
  await settledTap(p, p.locator('[data-edit="removeitem"]').first());
  await p.waitForTimeout(300);
  check('tablet timeline: × tap opens a one-row danger confirm (cycle-popover fallback, no menu sibling)',
    await p.locator('.eip-pop button.danger').count() === 1 &&
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Remove');
  check('tablet timeline: doc UNCHANGED while the × confirm is open — no silent removal',
    (await p.evaluate(() => localStorage.getItem('timeline-src'))) === base2);
  await p.locator('.eip-pop button.danger').click();
  await p.waitForTimeout(600);
  check('tablet timeline: confirming × removes the milestone line',
    (await p.evaluate(() => localStorage.getItem('timeline-src'))) !== base2);
  await settledTap(p, p.locator('.actions .touch-undo'));
  await p.waitForTimeout(600);
  check('tablet timeline: ↶ Undo restores the removed milestone',
    (await p.evaluate(() => localStorage.getItem('timeline-src'))) === base2);

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
Pick the Q3 bet :: chips Streak overhaul | Social feed | Onboarding polish`;
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
  await mpage.locator('#viewform').click();     // compose boots in reveal view
  await mpage.waitForTimeout(500);
  const gBase = await gSrc();
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
  await mpage.waitForTimeout(200);
  check('gauge: Escaping the qtext editor commits nothing', (await gSrc()) === gBase);
  await gTap('[data-edit="qtext"][data-line="3"]');
  await mpage.locator('.eip-input').fill('Ship the loop by Q3');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(400);
  check('gauge: qtext edit rewrites the text, keeps the kind tail',
    /^Ship the loop by Q3 :: prob$/m.test(await gSrc()));
  check('gauge: a coarse text edit does NOT focus the DSL editor', !(await inCm()));
  await gUndo();
  check('gauge: one Undo reverts the qtext edit', (await gSrc()) === gBase);

  // --- change TYPE: a picker, nothing commits on a bare tap ---
  await gTap('[data-edit="qtype"][data-line="3"]');
  check('gauge: qtype opens a prob/range/chips picker with prob marked',
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'prob|range|chips' &&
    (await mpage.locator('.eip-pop button.on').innerText()) === 'prob');
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
  await mpage.waitForTimeout(400);
  check('gauge: unit edit rewrites the range tail', /^Weeks to migrate billing :: range months$/m.test(await gSrc()));
  await gUndo();
  check('gauge: one Undo reverts the unit edit', (await gSrc()) === gBase);

  // --- chip options: add (one-tap), rename, remove (coarse danger confirm) ---
  await gTap('[data-edit="addopt"][data-line="5"]');
  check('gauge: ＋ Add option one-taps a 4th option (no popover)',
    /:: chips Streak overhaul \| Social feed \| Onboarding polish \| Option D$/m.test(await gSrc()) &&
    await mpage.locator('.eip-pop').count() === 0);
  check('gauge: coarse add-option opts OUT of editor focus', !(await inCm()));
  await gUndo();
  check('gauge: one Undo removes the added option', (await gSrc()) === gBase);

  await gTap('[data-edit="opt"][data-line="5"][data-opt="0"]');
  check('gauge: chip option opens prefilled with its label', await mpage.locator('.eip-input').inputValue() === 'Streak overhaul');
  await mpage.locator('.eip-input').fill('Streak v2');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(400);
  check('gauge: option rename rewrites just that option', /:: chips Streak v2 \| Social feed \| Onboarding polish$/m.test(await gSrc()));
  await gUndo();
  check('gauge: one Undo reverts the option rename', (await gSrc()) === gBase);

  await gTap('[data-edit="rmopt"][data-line="5"][data-opt="1"]');
  check('gauge: removing an option opens a one-row danger confirm (no silent removal)',
    await mpage.locator('.eip-pop button.danger').count() === 1 &&
    (await mpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Remove' &&
    (await gSrc()) === gBase);
  await mpage.locator('.eip-pop button.danger').click();
  await mpage.waitForTimeout(400);
  check('gauge: confirming drops that option', /:: chips Streak overhaul \| Onboarding polish$/m.test(await gSrc()));
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
  check('gauge: coarse add-question opts OUT of editor focus', !(await inCm()));
  await gUndo();
  check('gauge: one Undo removes the added question', (await gSrc()) === gBase);

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

console.log(results.join('\n'));
await browser.close();
report('check-eip', {...tally(results), min: 100});
