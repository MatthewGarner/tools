/* Case interaction regression: live exhibit links are one focus stop each and
   the artefact owns the case-level edits it visibly offers. */
import {chromium} from 'playwright';
import {trackErrors, report, tally} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const errors = trackErrors(page), results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);
const doc = () => page.evaluate(() => localStorage.getItem('case-src'));

await page.goto(BASE + '/case/', {waitUntil: 'networkidle'});
await page.getByRole('button', {name: 'Wexcombe augmentation'}).click();
await page.waitForTimeout(500);

const exhibits = (await doc()).split('\n').filter(line => /\s->\s+\S+/.test(line)).length;
const links = page.locator('#preview svg a');
check('one live link per exhibit', await links.count() === exhibits);
check('each live link combines its pill and open arrow', await links.evaluateAll(as =>
  as.every(a => a.textContent.includes('↗') && !a.querySelector('[data-edit]'))));
check('wrapped question is a single edit target', await page.locator('#preview svg [data-edit="question"]').count() === 1);

await page.locator('#preview svg [data-edit="status"]').click();
await page.waitForTimeout(150);
check('status opens a marked choice menu', await page.locator('.eip-pop button.on', {hasText: 'open'}).count() === 1);
await page.locator('.eip-pop button', {hasText: 'parked'}).click();
await page.waitForTimeout(450);
check('status edit commits through the artefact', (await doc()).includes('status: parked'));

await page.locator('#preview svg [data-edit="note"]').first().click();
await page.waitForTimeout(150);
await page.locator('.eip-input').fill('decision-ready evidence');
await page.keyboard.press('Enter');
await page.waitForTimeout(450);
check('note edit commits through the artefact', (await doc()).includes('// decision-ready evidence'));

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
await page.waitForTimeout(150);
check('keyboard Enter opens the same input a click would', await page.locator('.eip-input').count() === 1);
await page.keyboard.type('Renamed via keyboard');
await page.keyboard.press('Enter');
await page.waitForTimeout(450);
const afterKeyboardEdit = await doc();
check('keyboard-only edit commits through the artefact', afterKeyboardEdit.includes('Renamed via keyboard'));

/* ---- undo check: post-edit undo restores the exact prior source ---- */
await page.locator('.cm-content').click();
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(500);
const afterUndo = await doc();
check('undo restores the exact prior source', afterUndo === beforeKeyboardEdit && afterUndo !== afterKeyboardEdit);

/* ---- add-note e2e: the ghost "+ note" affordance on an exhibit with no
   note yet creates a real "// note" line — "Habitat 2.0 launch"'s Revenue
   model row is the one exhibit with no note across either example. ---- */
await page.getByRole('button', {name: 'Habitat 2.0 launch'}).click();
await page.waitForTimeout(500);
const addNoteTarget = page.locator('#preview svg [data-edit="note"][data-raw=""]').first();
check('a "+ note" ghost target exists for an exhibit with no note', await addNoteTarget.count() === 1);
await addNoteTarget.click();
await page.waitForTimeout(150);
await page.keyboard.type('added via the ghost target');
await page.keyboard.press('Enter');
await page.waitForTimeout(450);
check('the ghost "+ note" target commits a real // note line', (await doc()).includes('// added via the ghost target'));

check('no console or page errors', errors.length === 0);

await browser.close();
console.log(results.join('\n'));
report('case', {...tally(results), min: 13});
