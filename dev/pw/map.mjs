/* Map deep suite: real mouse drag writes @ x,y; tray placement; zone-rename
   edit-in-place (insert path); undo restores. */
import {chromium} from 'playwright';
import {trackErrors, report, tally, pickExample} from './_harness.mjs';
import {EXAMPLES} from '../../map/examples.js';
import {parse} from '../../map/parse.js';

const BASE = process.env.BASE || 'http://localhost:8087';
const ASSUMPTION_MAP = pickExample(EXAMPLES, 'Assumption map');
const STAKEHOLDER_GRID = pickExample(EXAMPLES, 'Stakeholder grid');
const FUTURES_MATRIX = pickExample(EXAMPLES, 'Futures matrix');

/* The tray item is the one line with no @ position — found via the REAL parser
   rather than retyped, so an edit to the example's doc text propagates instead
   of leaving a stale regex behind. */
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trayItem = parse(ASSUMPTION_MAP.src).items.find(it => it.x === null);
const trayPlacedRe = new RegExp(escapeRegex(trayItem.label) + ' @ (4\\d|5\\d),(4\\d|5\\d)');
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const errors = trackErrors(page);
await page.goto(BASE + '/map/', {waitUntil: 'networkidle'});

const doc = () => page.evaluate(() => localStorage.getItem('map-src'));
const dragTo = async (sel, fx, fy) => {
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  const from = await page.locator(sel).first().boundingBox();
  const plane = await page.locator('#preview svg rect[data-plane]').boundingBox();
  const tx = plane.x + plane.width * fx, ty = plane.y + plane.height * (1 - fy);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for(let i = 1; i <= 8; i++)
    await page.mouse.move(from.x + (tx - from.x) * i / 8, from.y + (ty - from.y) * i / 8);
  await page.mouse.up();
  await page.waitForTimeout(400);
};

/* ---- drag a placed card: @ x,y rewrites ---- */
await page.getByRole('button', {name: 'Edit map source'}).click();
await page.getByRole('button', {name: ASSUMPTION_MAP.name}).click();
await page.waitForTimeout(600);
const before = await doc();
check('baseline: card at 30,90', before.includes('@ 30,90'));
await dragTo('#preview svg g[data-line="3"]', 0.8, 0.3);   // "Readers finish the first book they start"
const after = await doc();
const m = after.split('\n')[3].match(/@ (\d+),(\d+)/);
check('drag: line rewrote @ x,y', !!m && !after.includes('@ 30,90'));
check('drag: landed near 80,30', !!m && Math.abs(+m[1] - 80) <= 3 && Math.abs(+m[2] - 30) <= 3);
check('drag: re-rendered without console errors', errors.length === 0);

/* ---- undo restores in one step ---- */
await page.locator('.cm-content').click();
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
await page.waitForTimeout(400);
check('undo: original position restored', (await doc()).includes('@ 30,90'));

/* ---- tray placement writes @ into the unpositioned line ---- */
check('tray: unplaced card present', await page.locator('#preview svg g[data-tray]').count() === 1);
await dragTo('#preview svg g[data-tray]', 0.5, 0.5);
const placed = await doc();
check('tray: line gained a position', trayPlacedRe.test(placed));
check('tray: tray emptied', await page.locator('#preview svg g[data-tray]').count() === 0);

/* ---- zone rename via edit-in-place (preset cell → insert path) ---- */
await page.getByRole('button', {name: STAKEHOLDER_GRID.name}).click();
await page.waitForTimeout(600);
await page.locator('#preview svg [data-edit="zonename"][data-zone="c:2,2"]').click();
await page.waitForTimeout(200);
await page.locator('.eip-input').fill('inner circle');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const renamed = await doc();
check('zone rename: inserted a zone 2,2: line', renamed.includes('zone 2,2: inner circle'));
check('zone rename: label re-rendered',
  (await page.locator('#preview svg').innerHTML()).includes('INNER CIRCLE'));

/* ---- axis rename preserves end labels ---- */
await page.getByRole('button', {name: FUTURES_MATRIX.name}).click();
await page.waitForTimeout(600);
/* the x-axis label sits low enough to need a scroll; do it explicitly and
   settle before clicking — locator.click()'s built-in scroll-then-click can
   still be mid-scroll when it dispatches, landing the click nowhere (same
   race check-eip.mjs's settledTap works around for mobile contexts). */
const axisX = page.locator('#preview svg [data-edit="axis"][data-axis="x"]');
await axisX.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await axisX.click();
await page.waitForTimeout(200);
await page.locator('.eip-input').fill('Licensing pressure');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
check('axis rename: label rewritten, end labels kept',
  (await doc()).includes('x: Licensing pressure (loose → strict)'));

/* ---- add item from the ghost, remove from the × ---- */
await page.getByRole('button', {name: ASSUMPTION_MAP.name}).click();
await page.waitForTimeout(600);
await page.locator('[data-edit="additem"]').click();
await page.waitForTimeout(200);
await page.locator('.eip-input').fill('Suite-added item');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
check('add item: line landed in the text', (await doc()).includes('Suite-added item'));
await page.locator('[data-edit="removeitem"]').last().click();
await page.waitForTimeout(500);
check('remove item: line gone', !(await doc()).includes('Suite-added item'));

check('suite: no console errors', errors.length === 0);
if(errors.length) results.push(...errors.slice(0, 3));
console.log(results.join('\n'));
await browser.close();
report('map', {...tally(results), min: 12});   // ~90% of 14 measured 2026-08-16
