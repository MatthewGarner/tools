/* Case interaction regression: live exhibit links are one focus stop each and
   the artefact owns the case-level edits it visibly offers. */
import {chromium} from 'playwright';
import {trackErrors, report, tally, until, untilValue} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const errors = trackErrors(page), results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);
const doc = () => page.evaluate(() => localStorage.getItem('case-src'));
/* app.js's doRefresh paints the preview and THEN writes localStorage in the same
   tick, so a doc visible in storage is a doc already on screen — that ordering is
   what lets these polls read either side and mean the same thing. */
const popOpen = () => until(() => page.locator('.eip-pop button').count());
const inputOpen = () => until(() => page.locator('.eip-input').count());

await page.goto(BASE + '/case/', {waitUntil: 'networkidle'});
await page.getByRole('button', {name: 'Wexcombe augmentation'}).click();
/* Wexcombe IS EXAMPLES[0], so the chip re-loads a doc that is already on screen and
   the TEXT never changes. What does change is persistence: the first-run autoload
   runs under assets/mobile.js's suppression, so `case-src` stays NULL until a real
   interaction re-enables it. Storage becoming non-null is therefore the one signal
   that this click's own refresh has run — and doRefresh paints before it persists,
   so it also means the artefact on screen is this document's.
   (Polling the rendered links instead was already true from the autoload paint, and
   left doc() null: exactly the "condition satisfied before the action armed" class.) */
await until(doc);

const exhibits = (await doc()).split('\n').filter(line => /\s->\s+\S+/.test(line)).length;
const links = page.locator('#preview svg a');
check('one live link per exhibit', await links.count() === exhibits);
check('each live link combines its pill and open arrow', await links.evaluateAll(as =>
  as.every(a => a.textContent.includes('↗') && !a.querySelector('[data-edit]'))));
check('wrapped question is a single edit target', await page.locator('#preview svg [data-edit="question"]').count() === 1);

await page.locator('#preview svg [data-edit="status"]').click();
await popOpen();
check('status opens a marked choice menu', await page.locator('.eip-pop button.on', {hasText: 'open'}).count() === 1);
await page.locator('.eip-pop button', {hasText: 'parked'}).click();
await untilValue(doc, d => d.includes('status: parked'));
check('status edit commits through the artefact', (await doc()).includes('status: parked'));

await page.locator('#preview svg [data-edit="note"]').first().click();
await inputOpen();
await page.locator('.eip-input').fill('decision-ready evidence');
await page.keyboard.press('Enter');
await untilValue(doc, d => d.includes('// decision-ready evidence'));
check('note edit commits through the artefact', (await doc()).includes('// decision-ready evidence'));

/* KEPT SLEEP — a CodeMirror history-group boundary, not a settle.
   CodeMirror merges doc changes made within newGroupDelay (500ms) of each other
   into ONE undo step. The keyboard edit below is the one whose SINGLE-undo
   isolation the 'undo restores the exact prior source' check asserts, so it must
   land more than 500ms after the note commit above. No predicate can express
   this: the state the assertion depends on is the history stack's shape, which
   is not observable — and every observable signal (storage, DOM, input value)
   is already settled. Removing this sleep made one undo revert BOTH edits and
   turned that check red; that is how the number below was arrived at. */
await page.waitForTimeout(550);

/* ---- keyboard-only flow: Tab reaches a real edit target (proves the
   tabindex wiring, not just a coded focus() call), Enter opens it exactly
   as a click would, typing + Enter commits. ---- */
/* Clicking body does not reliably move DOM focus in headless Chromium: it can
   leave the prior in-artifact control active, making the subsequent 40 Tab
   presses test an arbitrary point in the focus order. Blur deliberately so
   this remains a real keyboard traversal from the document, not a focus(). */
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Escape');
let tabbedTo = null;
for(let i = 0; i < 40; i++){
  await page.keyboard.press('Tab');
  tabbedTo = await page.evaluate(() => document.activeElement?.dataset?.edit || null);
  if(tabbedTo === 'label') break;
}
check('Tab reaches an exhibit label edit target for real', tabbedTo === 'label');
const beforeKeyboardEdit = await doc();
await page.keyboard.press('Enter');
await inputOpen();
check('keyboard Enter opens the same input a click would', await page.locator('.eip-input').count() === 1);
await page.keyboard.type('Renamed via keyboard');
await page.keyboard.press('Enter');
await untilValue(doc, d => d.includes('Renamed via keyboard'));
const afterKeyboardEdit = await doc();
check('keyboard-only edit commits through the artefact', afterKeyboardEdit.includes('Renamed via keyboard'));

/* ---- undo check: post-edit undo restores the exact prior source ---- */
await page.locator('.cm-content').click();
await page.keyboard.press('ControlOrMeta+z');
/* wait for the doc to LEAVE the edited state, not to arrive at the baseline: the
   arrival is what the check below asserts, and polling on the assertion itself
   would let a wrong-but-eventually-right restore look identical to a correct one.
   The undo writes the whole doc in one setItem, so there is no intermediate. */
await untilValue(doc, d => d !== afterKeyboardEdit);
const afterUndo = await doc();
check('undo restores the exact prior source', afterUndo === beforeKeyboardEdit && afterUndo !== afterKeyboardEdit);

/* ---- add-note e2e: the ghost "+ note" affordance on an exhibit with no
   note yet creates a real "// note" line — "Lantern 2.0 launch"'s Revenue
   model row is the one exhibit with no note across either example. ---- */
await page.getByRole('button', {name: 'Lantern 2.0 launch'}).click();
/* a genuinely different document this time, so the doc swap IS the precondition */
await untilValue(doc, d => d.includes('title: Lantern 2.0 launch'));
const addNoteTarget = page.locator('#preview svg [data-edit="note"][data-raw=""]').first();
check('a "+ note" ghost target exists for an exhibit with no note', await addNoteTarget.count() === 1);
await addNoteTarget.click();
await inputOpen();
await page.keyboard.type('added via the ghost target');
await page.keyboard.press('Enter');
await untilValue(doc, d => d.includes('// added via the ghost target'));
check('the ghost "+ note" target commits a real // note line', (await doc()).includes('// added via the ghost target'));

check('no console or page errors', errors.length === 0);

await browser.close();
console.log(results.join('\n'));
report('case', {...tally(results), min: 13});
