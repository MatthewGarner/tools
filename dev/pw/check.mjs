import {chromium} from 'playwright';
import {trackErrors} from './_harness.mjs';

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

// wip warning: load a 7-item NOW doc via URL hash
const wipDoc = 'NOW\n' + Array.from({length:7}, (_, i) => 'Item number ' + i).join('\n') + '\nNEXT\nx';
const wipPage = await browser.newPage();
await wipPage.goto(BASE + '#' + Buffer.from(wipDoc, 'utf8').toString('base64'), {waitUntil: 'networkidle'});
await wipPage.waitForTimeout(400);
check('WIP warning fires', (await wipPage.locator('#warns').innerText()).includes('not a strategy'));
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

// drag-and-drop: drag "Full offline mode" (NEXT/Platform) into LATER/Platform
{
  const dragPage = await browser.newPage();
  await dragPage.goto(BASE + '?v=drag', {waitUntil: 'networkidle'});
  await dragPage.getByRole('button', {name: 'Habit app roadmap'}).click();
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

console.log(results.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) || errors.length ? 1 : 0);
