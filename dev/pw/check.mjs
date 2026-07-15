import {chromium} from 'playwright';
import {trackErrors, report, tally} from './_harness.mjs';

const BASE = (process.env.BASE || 'http://localhost:8087') + '/roadmap/';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = trackErrors(page);

const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

await page.goto(BASE, {waitUntil: 'networkidle'});
check('page loads with editor mounted', await page.locator('.cm-editor').count() === 1);

// load example via chip
await page.getByRole('button', {name: 'Habit app roadmap'}).click();
await page.waitForTimeout(300);
check('example renders SVG preview', await page.locator('#preview svg').count() === 1);
check('swimlanes render', (await page.locator('#preview svg text', {hasText: 'Growth'}).count()) >= 1);

// syntax highlighting present (heading token gets a highlight class)
const hlCount = await page.locator('.cm-editor [class*="ͼ"]').count();
check('syntax highlighting active (' + hlCount + ' styled spans)', hlCount > 5);

// type at end: add an item, preview updates
await page.locator('.cm-content').click();
await page.keyboard.press('Meta+ArrowDown'); // end of doc
await page.keyboard.press('Enter');
await page.keyboard.type('Platform: Parity check item [risk]');
await page.waitForTimeout(400);
check('typed item appears in preview', (await page.locator('#preview svg').innerHTML()).includes('Parity check item'));

// typing latency: time 20 keystrokes
const t0 = Date.now();
await page.keyboard.type(' plus some more typed text here', {delay: 0});
const typed = Date.now() - t0;
check('30 chars typed in ' + typed + 'ms (<1500ms)', typed < 1500);

// Alt+ArrowUp moves line (wait out the debounce so the baseline is current)
await page.waitForTimeout(400);
const before = await page.evaluate(() => localStorage.getItem('roadmap-src'));
await page.keyboard.press('Alt+ArrowUp');
await page.waitForTimeout(400);
const after = await page.evaluate(() => localStorage.getItem('roadmap-src'));
check('Alt+ArrowUp moves the line', before !== after);

// undo works — ControlOrMeta so it's Cmd on macOS (local) and Ctrl on Linux (CI);
// CodeMirror binds undo to the OS modifier, so a hardcoded Meta fails on Linux
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(400);
const undone = await page.evaluate(() => localStorage.getItem('roadmap-src'));
check('Cmd+Z undoes', undone === before);

// snapshot + compare shows badges
await page.getByRole('button', {name: 'Snapshot'}).click();
await page.locator('.cm-content').click();
await page.keyboard.press('Meta+ArrowDown');
await page.keyboard.press('Enter');
await page.keyboard.type('Core: Brand new initiative');
await page.waitForTimeout(400);
await page.locator('#snapsel').selectOption({index: 1});
await page.waitForTimeout(400);
check('compare shows NEW badge', (await page.locator('#preview svg').innerHTML()).includes('>NEW<'));

// wip warning: load a 7-item NOW doc via URL hash. Pinned to style: grid — a
// plain now/next/later doc otherwise resolves to the board live view (its own
// WIP flag reads "N · OVER WIP", not the chart's "N ITEMS" this test checks).
const wipDoc = 'style: grid\nNOW\n' + Array.from({length:7}, (_, i) => 'Item number ' + i).join('\n') + '\nNEXT\nx';
const wipPage = await browser.newPage();
await wipPage.goto(BASE + '#' + Buffer.from(wipDoc, 'utf8').toString('base64'), {waitUntil: 'networkidle'});
await wipPage.waitForTimeout(400);
check('WIP warning fires', (await wipPage.locator('#warns').innerText()).includes('Now has 7 items in flight (wip: 6).'));
check('WIP flag in svg', (await wipPage.locator('#preview svg').innerHTML()).includes('7 ITEMS'));
await wipPage.close();

// URL round trip
const url = page.url();
const page2 = await browser.newPage();
await page2.goto(url, {waitUntil: 'networkidle'});
await page2.waitForTimeout(400);
check('URL round-trips into second tab', (await page2.locator('#preview svg').count()) === 1 &&
  (await page2.locator('#preview svg').innerHTML()).includes('Brand new initiative'));

// dark theme renders
await page2.emulateMedia({colorScheme: 'dark'});
await page2.waitForTimeout(400);
/* ocean scheme dark surfaces (derived in render.scheme) */
check('dark theme re-renders svg', (await page2.locator('#preview svg').innerHTML()).includes('#1c2b35') ||
  (await page2.locator('#preview svg').innerHTML()).includes('#16222b'));

// markdown import round trip
await page2.getByRole('button', {name: 'Import markdown'}).click();
await page2.locator('#importarea').fill('## Imported Plan\n### Now\n- **Core:** Imported item _(in progress)_ — with note');
await page2.getByRole('button', {name: 'Convert'}).click();
await page2.waitForTimeout(400);
const impSvg = await page2.locator('#preview svg').innerHTML();
check('markdown import renders', impSvg.includes('Imported item') && impSvg.includes('Imported Plan'));

// drag-and-drop: drag "Full offline mode" (NEXT/Platform) into LATER/Platform.
// This is the CHART's own lane x horizon cell drag (data-cell), a different
// gesture from the horizon-band drag register/board share below — pin Grid
// explicitly so it keeps testing the chart regardless of what a plain
// now/next/later doc resolves to by default (board, since e11f0c1).
{
  const dragPage = await browser.newPage();
  await dragPage.goto(BASE + '?v=drag', {waitUntil: 'networkidle'});
  await dragPage.getByRole('button', {name: 'Habit app roadmap'}).click();
  await dragPage.waitForTimeout(400);
  await dragPage.getByRole('button', {name: 'Grid'}).click();
  await dragPage.waitForTimeout(400);
  const textBefore = await dragPage.evaluate(() => localStorage.getItem('roadmap-src'));
  const card = dragPage.locator('#preview svg g[data-line]', {hasText: 'Full offline mode'});
  const cell = dragPage.locator('#preview svg rect[data-cell="2|Platform"]');
  const from = await card.boundingBox();
  const to = await cell.boundingBox();
  await dragPage.mouse.move(from.x + from.width/2, from.y + 10);
  await dragPage.mouse.down();
  await dragPage.mouse.move(to.x + to.width/2, to.y + to.height/2, {steps: 12});
  await dragPage.mouse.up();
  await dragPage.waitForTimeout(500);
  const textAfter = await dragPage.evaluate(() => localStorage.getItem('roadmap-src'));
  const laterIdx = textAfter.split('\n').findIndex(l => l.trim() === 'LATER');
  const movedIdx = textAfter.split('\n').findIndex(l => l.includes('Full offline mode'));
  check('drag moves line under LATER in the text', movedIdx > laterIdx && laterIdx > 0);
  check('drag changed the doc', textAfter !== textBefore);
  check('no text selected after drag', (await dragPage.evaluate(() => window.getSelection().toString())) === '');
  // one undo restores the pre-drag doc (ControlOrMeta: Cmd on macOS, Ctrl on Linux/CI)
  await dragPage.locator('.cm-content').click();
  await dragPage.keyboard.press('ControlOrMeta+z');
  await dragPage.waitForTimeout(500);
  const textUndone = await dragPage.evaluate(() => localStorage.getItem('roadmap-src'));
  check('Cmd+Z undoes the drag', textUndone === textBefore);
  await dragPage.close();
}

// register: drag a whole row onto another horizon's band (Task 7). The drop
// target is the horizon BAND (rect[data-hdrop]), painted UNDER its rows (A2)
// — the item keeps its OWN lane, unlike the chart drop which also targets a
// lane. Rows resolved BY TITLE, never data-line (a line number is a property
// of the example doc, not a stable identity).
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Habit app roadmap'}).click();
  await p.waitForTimeout(400);
  await p.getByRole('button', {name: 'Register'}).click();
  await p.waitForTimeout(400);
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));

  const rowOf = title => p.locator('#preview svg g[data-edit="cardmenu"]').filter({hasText: title}).first();
  // "Smart reminders" starts under NEXT — drag it onto NOW's band (data-hdrop="0")
  const hit = await rowOf('Smart reminders').locator('rect[data-hit]').boundingBox();
  const band = await p.locator('#preview svg rect[data-hdrop="0"]').boundingBox();
  await p.mouse.move(hit.x + 8, hit.y + 4);
  await p.mouse.down();
  await p.mouse.move(band.x + band.width / 2, band.y + band.height / 2, {steps: 12});
  await p.mouse.up();
  await p.waitForTimeout(500);
  const tMove = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const nowIdx = tMove.split('\n').findIndex(l => l.trim() === 'NOW');
  const nextIdx = tMove.split('\n').findIndex(l => l.trim() === 'NEXT');
  const movedIdx = tMove.split('\n').findIndex(l => l.includes('Smart reminders'));
  check('register: dragging a row onto a horizon band moves it under that horizon',
    movedIdx > nowIdx && movedIdx < nextIdx);
  check('register: no text selected after the drag', (await p.evaluate(() => window.getSelection().toString())) === '');
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  await p.waitForTimeout(500);
  const tUndo = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register: one undo restores the pre-drag baseline', tUndo === baseline);
  await p.close();
}

// register: drag into an EMPTY, HEADERLESS horizon — proves ensureHorizonHeader
// (A4) is wired into the drop path, not just the "Move to…"/+add paths. Q1 2027
// has no header line anywhere in the source before the drop.
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText(
    'title: Register drag test\n' +
    'style: register\n' +
    'horizons: quarterly from Q3 2026 x4\n' +
    '\n' +
    'Q3 2026\n' +
    'Core: Drag into the void\n');
  await p.waitForTimeout(700);
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register (headerless): baseline has no literal Q1 2027 header yet', !baseline.includes('Q1 2027'));

  const rowOf = title => p.locator('#preview svg g[data-edit="cardmenu"]').filter({hasText: title}).first();
  const hit = await rowOf('Drag into the void').locator('rect[data-hit]').boundingBox();
  const band = await p.locator('#preview svg rect[data-hdrop="2"]').boundingBox();   // Q1 2027, index 2
  await p.mouse.move(hit.x + 8, hit.y + 4);
  await p.mouse.down();
  await p.mouse.move(band.x + band.width / 2, band.y + band.height / 2, {steps: 12});
  await p.mouse.up();
  await p.waitForTimeout(500);
  const tMove = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register (headerless): the drop creates the header and relocates the row (A4, not a silent no-op)',
    /Q1 2027\s*\nCore: Drag into the void/.test(tMove));
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  await p.waitForTimeout(500);
  const tUndo = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('register (headerless): one undo removes BOTH the synthesised header and the move (one transaction)',
    tUndo === baseline);
  await p.close();
}

// board: drag a card from NOW onto NEXT's column band (rect[data-hdrop="1"]).
// The board reuses register's drop machinery (inBandView includes 'board' in
// app.js), so the drop target is the horizon BAND, not a lane cell — the
// dragged card keeps its OWN lane, same as register's row-drag. Rows resolved
// BY TITLE, never data-line.
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText(
    'title: Board drag test\n' +
    'style: board\n' +
    '\n' +
    'NOW\n' +
    'Growth: Draggable card\n' +
    'Core: Stays put\n' +
    '\n' +
    'NEXT\n' +
    'Core: Existing next item\n' +
    '\n' +
    'LATER\n' +
    'Core: Existing later item\n');
  await p.waitForTimeout(700);
  const baseline = await p.evaluate(() => localStorage.getItem('roadmap-src'));

  const rowOf = title => p.locator('#preview svg g[data-edit="cardmenu"]').filter({hasText: title}).first();
  const hit = await rowOf('Draggable card').locator('rect[data-hit]').boundingBox();
  const band = await p.locator('#preview svg rect[data-hdrop="1"]').boundingBox();   // NEXT
  await p.mouse.move(hit.x + 8, hit.y + 4);
  await p.mouse.down();
  await p.mouse.move(band.x + band.width / 2, band.y + band.height / 2, {steps: 12});
  await p.mouse.up();
  await p.waitForTimeout(500);
  const tMove = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const lines = tMove.split('\n');
  const nextIdx = lines.findIndex(l => l.trim() === 'NEXT');
  const laterIdx = lines.findIndex(l => l.trim() === 'LATER');
  const movedIdx = lines.findIndex(l => l.includes('Draggable card'));
  check('board: dragging a card onto a column band moves it under that column',
    movedIdx > nextIdx && movedIdx < laterIdx);
  check('board: the moved card keeps its own lane', lines[movedIdx].trim() === 'Growth: Draggable card');
  check('board: no text selected after the drag', (await p.evaluate(() => window.getSelection().toString())) === '');
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+z');
  await p.waitForTimeout(500);
  const tUndo = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('board: one undo restores the pre-drag baseline', tUndo === baseline);
  await p.close();
}

// screenshots for the visual record
await page.screenshot({path: 'parity-light.png', fullPage: true});
await page2.screenshot({path: 'parity-dark.png', fullPage: true});

/* typing latency: a 150-item doc must re-render fast after a keystroke */
{
  const doc = 'title: Big\ndate: 2026-07-06\nNOW\n' +
    Array.from({length: 50}, (_, i) => 'Lane' + (i % 5) + ': Item number ' + i + ' with a name').join('\n') +
    '\nNEXT\n' + Array.from({length: 50}, (_, i) => 'Lane' + (i % 5) + ': Next item ' + i).join('\n') +
    '\nLATER\n' + Array.from({length: 50}, (_, i) => 'Lane' + (i % 5) + ': Later item ' + i).join('\n');
  const p = await browser.newPage();
  await p.goto(BASE + '#' + Buffer.from(doc, 'utf8').toString('base64'), {waitUntil: 'networkidle'});
  await p.waitForTimeout(600);
  const ms = await p.evaluate(() => new Promise(res => {
    const pv = document.getElementById('preview');
    const t0 = performance.now();
    new MutationObserver((_, obs) => { obs.disconnect(); res(performance.now() - t0); })
      .observe(pv, {childList: true, subtree: true});
    const cm = document.querySelector('.cm-content');
    cm.dispatchEvent(new KeyboardEvent('keydown', {key: 'x'}));
    document.querySelector('.cm-line').textContent += 'x';
    setTimeout(() => res(9999), 3000);
  }));
  check('150-item doc: keystroke → re-render in ' + Math.round(ms) + 'ms (budget 1000)', ms < 1000);
  await p.close();
}

/* A spanning card is drawn at its start column but paints across the ones after it —
   and a transparent rect is a PAINTED hit target. Emitted per-column, the NEXT
   column's drop-zone lands ON TOP of the bar and makes it pointer-dead: no card
   menu, no edit-in-place, no edge handle, over everything past its first column.
   Bytes cannot see this (the SVG is identical either way), so it is checked here.
   Both properties must hold at once: the bar is grabbable across its whole length,
   AND every column it crosses still accepts a drop. */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('horizons: monthly from Jul 2026 x6\nJul 2026\nA: Long bar one x4\nA: Short\n');
  await p.waitForTimeout(700);
  const probe = await p.evaluate(() => [0, 1, 2, 3].map(h => {
    const cell = document.querySelector('#preview svg rect[data-cell="' + h + '|A"]');
    if(!cell) return {h, card: false, drop: false};
    const b = cell.getBoundingClientRect();
    const stack = document.elementsFromPoint(b.x + b.width / 2, b.y + 12);
    return {h,
      card: !!stack[0].closest('g[data-line]'),
      drop: stack.some(e => e.matches && e.matches('rect[data-cell="' + h + '|A"]'))};
  }));
  check('roadmap: a span is grabbable across every column it covers (drop-zones do not occlude it)',
    probe.every(o => o.card));
  check('roadmap: every column a span crosses still accepts a drop',
    probe.every(o => o.drop));
  await p.close();
}

/* the three drag gestures (Task 8). Cards are resolved by TITLE, never by
   data-line — line numbers are a property of the example doc, not a stable
   identity (the deck build's lesson). Each gesture gets its own fresh page
   and doc: moveItem renumbers OTHER lines on a drop, so chaining gestures on
   one page would make each step's geometry depend on the previous step. */
{
  /* right-edge widen (x2 -> x3) — and the SAME gesture is how a PLAIN card
     BECOMES a span: Task 4's early return in drawSpanDecoration nearly deleted
     the right handle from a 1-column card, so this path has no other test. */
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('horizons: quarterly from Q3 2026 x4\nQ3 2026\n' +
    'Core: Sync engine rewrite [doing] x2\nCore: Smart reminders\n');
  await p.waitForTimeout(700);

  const bar = p.locator('#preview svg g[data-edit="cardmenu"]', {hasText: 'Sync engine rewrite'});
  const barLine = await bar.first().getAttribute('data-line');
  const rEdge = p.locator('#preview svg rect[data-span-edge="r"][data-line="' + barLine + '"]');
  const edgeBox = await rEdge.boundingBox();
  const q1Cell = await p.locator('#preview svg rect[data-cell="2|Core"]').boundingBox();   // Q1 2027
  await p.mouse.move(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
  await p.mouse.down();
  await p.mouse.move(q1Cell.x + q1Cell.width / 2, q1Cell.y + q1Cell.height / 2, {steps: 10});
  await p.mouse.up();
  await p.waitForTimeout(500);
  let src = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: right-edge drag widens the span (x2 -> x3)',
    /Sync engine rewrite \[doing\] x3/.test(src));

  const plain = p.locator('#preview svg g[data-edit="cardmenu"]', {hasText: 'Smart reminders'});
  const plainLine = await plain.first().getAttribute('data-line');
  const plainEdge = p.locator('#preview svg rect[data-span-edge="r"][data-line="' + plainLine + '"]');
  const plainBox = await plainEdge.boundingBox();
  const q4Cell = await p.locator('#preview svg rect[data-cell="1|Core"]').boundingBox();   // Q4 2026
  await p.mouse.move(plainBox.x + plainBox.width / 2, plainBox.y + plainBox.height / 2);
  await p.mouse.down();
  await p.mouse.move(q4Cell.x + q4Cell.width / 2, q4Cell.y + q4Cell.height / 2, {steps: 10});
  await p.mouse.up();
  await p.waitForTimeout(500);
  src = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: a plain card\'s right edge creates a span (Smart reminders -> x2)',
    /Smart reminders x2/.test(src));
  await p.close();
}
{
  /* left edge: moves the start, holds the end — dragged earlier, it LENGTHENS
     the item (Q4-start x2 becomes Q3-start x3; the end, Q1 2027, is untouched) */
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('horizons: quarterly from Q3 2026 x4\nQ3 2026\nQ4 2026\n' +
    'Core: Long haul project [doing] x2\n');
  await p.waitForTimeout(700);

  const bar = p.locator('#preview svg g[data-edit="cardmenu"]', {hasText: 'Long haul project'});
  const barLine = await bar.first().getAttribute('data-line');
  const lEdge = p.locator('#preview svg rect[data-span-edge="l"][data-line="' + barLine + '"]');
  const edgeBox = await lEdge.boundingBox();
  const q3Cell = await p.locator('#preview svg rect[data-cell="0|Core"]').boundingBox();   // Q3 2026
  await p.mouse.move(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
  await p.mouse.down();
  await p.mouse.move(q3Cell.x + q3Cell.width / 2, q3Cell.y + q3Cell.height / 2, {steps: 10});
  await p.mouse.up();
  await p.waitForTimeout(500);
  const src = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const lines = src.split('\n');
  const q4Idx = lines.findIndex(l => l.trim() === 'Q4 2026');
  const itemIdx = lines.findIndex(l => l.includes('Long haul project'));
  check('roadmap: left-edge drag lengthens the item and holds its end (x2 -> x3)',
    /Long haul project \[doing\] x3/.test(src));
  check('roadmap: left-edge drag moved the item under its new (earlier) start',
    itemIdx >= 0 && itemIdx < q4Idx);
  await p.close();
}
{
  /* middle drag: today's card move, UNCHANGED — the xN token travels with the
     line, so duration is preserved for free */
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}, reducedMotion: 'reduce'});
  await p.goto(BASE, {waitUntil: 'networkidle'});
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.press('Delete');
  await p.keyboard.insertText('horizons: quarterly from Q3 2026 x4\nQ3 2026\n' +
    'Core: Sync engine rewrite [doing] x2\nQ1 2027\n');
  await p.waitForTimeout(700);

  const bar = p.locator('#preview svg g[data-edit="cardmenu"]', {hasText: 'Sync engine rewrite'});
  const box = await bar.first().boundingBox();
  const q1Cell = await p.locator('#preview svg rect[data-cell="2|Core"]').boundingBox();   // Q1 2027
  await p.mouse.move(box.x + box.width / 2, box.y + 10);   // grab well clear of either edge handle
  await p.mouse.down();
  await p.mouse.move(q1Cell.x + q1Cell.width / 2, q1Cell.y + q1Cell.height / 2, {steps: 12});
  await p.mouse.up();
  await p.waitForTimeout(500);
  const src = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  const lines = src.split('\n');
  const q1Idx = lines.findIndex(l => l.trim() === 'Q1 2027');
  const itemIdx = lines.findIndex(l => l.includes('Sync engine rewrite'));
  check('roadmap: middle drag preserves the duration (still x2)',
    /Sync engine rewrite \[doing\] x2/.test(src));
  check('roadmap: middle drag actually moved the item (now under Q1 2027)',
    itemIdx >= 0 && itemIdx > q1Idx);
  await p.close();
}

check('no stray console/page errors', errors.length === 0);   // was folded into the exit condition
console.log(results.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
report('check', {...tally(results), min: 8});
