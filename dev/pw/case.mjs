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

const links = page.locator('#preview svg a');
check('one live link per exhibit', await links.count() === 4);
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
check('no console or page errors', errors.length === 0);

await browser.close();
console.log(results.join('\n'));
report('case', {...tally(results), min: 7});
