/* Edit-in-place browser checks (tree). */
import {chromium} from 'playwright';
const BASE = (process.env.BASE || 'http://localhost:8087') + '/tree/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

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

check('no page errors', errors.length === 0);

/* ---- why: popover status + cycle assumption ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Habitat retention'}).click();
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
  check('why: no page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: title edit + status popover ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
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
  check('roadmap: no page errors', errs.length === 0);
  await p.close();
}

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
