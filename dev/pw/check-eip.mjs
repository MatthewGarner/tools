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

/* ---- roadmap: the Lane… row must NOT appear on a plain now/next/later
   CHART doc (no style: line → board default) — the chart has no
   data-edit="lane" target at all, so an `opens` row there would resolve to
   nothing (A10's negative case). ---- */
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
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit field…|Remove');

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
  check('wardley: component menu shows the danger row',
    (await wpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Remove component');
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
  check('wardley narrow: no console/page errors', merrors.length === 0);

  /* ---- clamp check (same mobile context): a milestone label near the right
     screen edge on /timeline/ — its eip-input must stay inside the viewport.
     Scroll to bring the RIGHTMOST label's right edge near the pane's right
     edge (not to scrollWidth — the plot has trailing margin past the last
     label, which would scroll every label off the left of the view). ---- */
  await mpage.goto((process.env.BASE || 'http://localhost:8087') + '/timeline/', {waitUntil: 'networkidle'});
  await mpage.waitForTimeout(700);
  const edgeLabel = await mpage.evaluate(() => {
    const prev = document.getElementById('preview');
    prev.scrollLeft = 0;
    const pr0 = prev.getBoundingClientRect();
    const labels = [...prev.querySelectorAll('svg [data-edit="label"]')];
    let best = null, bestRight = -Infinity;
    for(const el of labels){
      const r = el.getBoundingClientRect();
      const right = (r.left - pr0.left) + r.width;
      if(right > bestRight){ bestRight = right; best = el; }
    }
    if(!best) return null;
    const r0 = best.getBoundingClientRect();
    prev.scrollLeft = Math.max(0, (r0.left - pr0.left) + r0.width - prev.clientWidth + 40);
    const r1 = best.getBoundingClientRect();
    return {x: r1.left, y: r1.top, w: r1.width, h: r1.height};
  });
  check('timeline narrow: a milestone label sits near the scrolled-right edge', !!edgeLabel);
  if(edgeLabel){
    const vp = mpage.viewportSize();
    await mpage.mouse.click(edgeLabel.x + edgeLabel.w / 2, edgeLabel.y + edgeLabel.h / 2);
    await mpage.waitForTimeout(300);
    const ib = await mpage.locator('.eip-input').boundingBox();
    check('timeline narrow: eip-input clamps within the viewport', !!ib &&
      ib.x >= 0 && ib.x + ib.width <= vp.width + 1 && ib.y >= 0 && ib.y + ib.height <= vp.height + 1);
    await mpage.keyboard.press('Escape');
    await mpage.waitForTimeout(200);
  }
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
  check('bets: card menu shows the four rows',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Edit stake…|Edit odds…|Edit payoff…|Kill criterion…');

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

  // menu Kill criterion… re-opens the EXISTING kill field for a bet that has one
  await tapCard(7);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Kill criterion…'}).click();
  await p.waitForTimeout(200);
  check('bets: menu Kill criterion reopens the existing kill field',
    await p.locator('.eip-input').inputValue() === 'CAC exceeds £40 for two consecutive months');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  // menu Kill criterion… on a bare bet ("Sync engine rewrite", srcLine 11 —
  // NO KILL CRITERION today) inserts a fresh child line instead
  await tapCard(11);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Kill criterion…'}).click();
  await p.waitForTimeout(400);
  const tNewKill = await p.evaluate(() => localStorage.getItem('bets-src'));
  check('bets: menu Kill criterion on a bare bet inserts a fresh kill child line',
    tNewKill.split(/\r?\n/).includes('    kill: reason'));
  await undo();
  check('bets: one undo removes the inserted kill placeholder', (await p.evaluate(() => localStorage.getItem('bets-src'))) === baseline);

  check('bets: no console/page errors', errs.length === 0);
  await p.close();
}

console.log(results.join('\n'));
await browser.close();
report('check-eip', {...tally(results), min: 85});
