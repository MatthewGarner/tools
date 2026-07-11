/* Edit-in-place browser checks (tree). */
import {chromium, devices} from 'playwright';
import {trackErrors} from './_harness.mjs';
const BASE = (process.env.BASE || 'http://localhost:8087') + '/tree/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
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
  await page.keyboard.press('Meta+z');
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
    await page.keyboard.press('Meta+z');
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
}

check('no console/page errors', errors.length === 0);

/* ---- why: popover status + cycle assumption ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
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
    await p.keyboard.press('Meta+z');
    await p.waitForTimeout(500);
  };

  await tapCard(5);
  await p.waitForTimeout(200);
  check('why: solution card tap opens the menu with the expected rows',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Status…|＋ Add assumption|Remove branch');

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

/* ---- roadmap: title edit + status popover ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
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
     field) opens the menu; "Streak shield" (srcLine 4) carries both a note
     and a status so the Edit-note/Status rows aren't vacuous. Each action
     gets its own round trip: commit, assert, ONE Meta+z, assert full revert
     back to the pre-menu baseline before the next action starts clean. ---- */
  const cardBody = line => p.locator('#preview svg g[data-edit="cardmenu"][data-line="' + line + '"] rect[data-hit]');
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const undo = async () => {
    await p.locator('.cm-content').click();
    await p.keyboard.press('Meta+z');
    await p.waitForTimeout(500);
  };

  await cardBody(4).click();
  await p.waitForTimeout(200);
  check('roadmap: card body tap opens the menu with the expected rows',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === 'Rename…|Edit note…|Status…|Remove item');

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

  await cardBody(4).click();
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

  await cardBody(4).click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove item'}).click();
  await p.waitForTimeout(600);
  const tRemove = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: menu Remove drops the card', !tRemove.includes('Streak shield'));
  await undo();
  check('roadmap: one undo restores the removed card', (await p.evaluate(() => localStorage.getItem('roadmap-src'))) === baseline);

  /* real mouse drag: "Sync engine rewrite" (Platform/Now, srcLine 7) dropped
     into Platform/Next moves it (byte-preserved line, relocated after the
     NEXT header) and must NOT leave a card menu open (proves suppressClick) */
  const dragSrc = await cardBody(7).boundingBox();
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

/* ---- roadmap narrow (mobile-emulated): card menu away-listener leak proof —
   tap a card, open Rename, then tap INTO the input itself; the popover's
   away-pointerdown listener must not treat that as an outside click ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13']});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  await mpage.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'Habit app roadmap'}).click();
  await mpage.waitForTimeout(600);

  const mCardBody = mpage.locator('#preview svg g[data-edit="cardmenu"][data-line="4"] rect[data-hit]');
  await settledTap(mpage, mCardBody);
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
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
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
    await p.keyboard.press('Meta+z');
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
  const mctx = await browser.newContext({...devices['iPhone 13']});
  const mpage = await mctx.newPage();
  const merrors = trackErrors(mpage);
  await mpage.goto(BASE.replace('/tree/', '/map/'), {waitUntil: 'networkidle'});
  await mpage.getByRole('button', {name: 'Assumption map'}).click();
  await mpage.waitForTimeout(600);

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

/* ---- risk (energy) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
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
  await p.keyboard.press('Meta+z');
  await p.waitForTimeout(500);
  check('risk: one undo reverts', (await p.evaluate(() => localStorage.getItem('risk-src'))) === before);
  check('risk: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- cycles (energy) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
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
  await p.keyboard.press('Meta+z');
  await p.waitForTimeout(700);
  check('cycles: one undo reverts', (await p.evaluate(() => localStorage.getItem('cycles-src'))) === before);
  check('cycles: no console/page errors', errs.length === 0);
  await p.close();
}

/* ---- wardley: name edit, stage cycle, drag writes text, vertical no-op ---- */
{
  const wpage = await browser.newPage({viewport: {width: 1500, height: 1000}});
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
  await wpage.keyboard.press('Meta+z');
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
  await wpage.keyboard.press('Meta+z');
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
  await wpage.keyboard.press('Meta+z');
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
  const mctx = await browser.newContext({...devices['iPhone 13']});
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
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
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

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
