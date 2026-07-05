/* Smoke checks for every tool + the landing page. The quality bar: each tool
   loads, its primary flow produces output, and the console stays clean.
   (The roadmap tool has its own deeper suite in check.mjs.) */
import {chromium} from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

async function freshPage(path, theme = 'light'){
  const page = await browser.newPage({colorScheme: theme});
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + path, {waitUntil: 'networkidle'});
  return {page, errors};
}

/* ---- landing ---- */
{
  const {page, errors} = await freshPage('/');
  check('landing: seven tool cards', await page.locator('a.tool').count() === 7);
  const hrefs = await page.locator('a.tool').evaluateAll(as => as.map(a => a.getAttribute('href')));
  for(const href of hrefs){
    const resp = await page.request.get(BASE + href);
    check('landing: ' + href + ' resolves', resp.status() === 200);
  }
  check('landing: no console errors', errors.length === 0);
  await page.close();
}

/* ---- fermi ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/fermi/', theme);
  await page.getByRole('button', {name: 'Weekly meeting, annual cost'}).click();
  await page.waitForTimeout(600);
  const p50 = (await page.locator('#p50').innerText()).trim();
  check('fermi(' + theme + '): example produces a P50 (' + p50 + ')', p50.length > 0 && p50 !== '—');
  check('fermi(' + theme + '): histogram canvas painted', await page.locator('#hist').evaluate(c => c.width > 100));
  check('fermi(' + theme + '): sensitivity section shows', await page.locator('#sens .srow').count() > 1);
  check('fermi(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- rank ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/rank/', theme);
  await page.getByRole('button', {name: 'Ops & infra backlog'}).click();
  await page.waitForTimeout(600);
  const rows = await page.locator('#rows tr').count();
  check('rank(' + theme + '): table renders rows (' + rows + ')', rows === 7);   // the bug that shipped
  const verdict = (await page.locator('#verdict').innerText()).trim();
  check('rank(' + theme + '): verdict present', verdict.length > 20);
  check('rank(' + theme + '): rank bars render', await page.locator('.rankbar').count() === 7);
  check('rank(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- tree ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/tree/', theme);
  await page.getByRole('button', {name: 'Bid or no bid'}).click();
  await page.waitForTimeout(600);
  check('tree(' + theme + '): example renders SVG', await page.locator('#preview svg').count() === 1);
  const svg = await page.locator('#preview svg').innerHTML();
  check('tree(' + theme + '): verdict present', svg.includes('RECOMMENDED'));
  check('tree(' + theme + '): flip analysis present', svg.includes('WHAT WOULD FLIP THIS') || svg.includes('flips if'));
  check('tree(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- why ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/why/', theme);
  await page.getByRole('button', {name: 'Habitat retention'}).click();
  await page.waitForTimeout(600);
  check('why(' + theme + '): OST view renders', await page.locator('#preview svg').count() === 1);
  const ost = await page.locator('#preview svg').innerHTML();
  check('why(' + theme + '): assumptions in cards', ost.includes('? users will invite friends'));
  await page.locator('#viewmap').click();
  await page.waitForTimeout(500);
  const map = await page.locator('#preview svg').innerHTML();
  check('why(' + theme + '): roadmap view derives columns', map.includes('NOW') && map.includes('Streak freeze'));
  check('why(' + theme + '): outcome band renders', map.includes('IMPROVE 90-DAY RETENTION'));
  check('why(' + theme + '): unaddressed lane gets ghost chip', map.includes('PROGRESS') && map.includes('no committed solution yet'));
  check('why(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- map ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/map/', theme);
  await page.getByRole('button', {name: 'Assumption map'}).click();
  await page.waitForTimeout(600);
  check('map(' + theme + '): renders SVG', await page.locator('#preview svg').count() === 1);
  const svg = await page.locator('#preview svg').innerHTML();
  check('map(' + theme + '): zones labelled', svg.includes('TEST FIRST'));
  check('map(' + theme + '): verdict present', svg.includes('sit in test first'));
  check('map(' + theme + '): unplaced tray', svg.includes('UNPLACED') && svg.includes('Legal sign-off'));
  check('map(' + theme + '): no-test flag', svg.includes('no test designed'));
  await page.getByRole('button', {name: 'Risk grid'}).click();
  await page.waitForTimeout(500);
  const risk = await page.locator('#preview svg').innerHTML();
  check('map(' + theme + '): risk preset severity bands', risk.includes('SEVERE') && risk.includes('MODERATE'));
  check('map(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- gauge (solo mode; the relay flow lives in gauge.mjs) ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/gauge/', theme);
  await page.getByRole('button', {name: 'Q3 commitment review'}).click();
  await page.waitForTimeout(600);
  check('gauge(' + theme + '): form preview renders 3 questions', await page.locator('#preview .gform .q').count() === 3);
  await page.locator('#viewreveal').click();
  await page.waitForTimeout(500);
  check('gauge(' + theme + '): sample reveal renders SVG', await page.locator('#preview svg').count() === 1);
  const svg = await page.locator('#preview svg').innerHTML();
  check('gauge(' + theme + '): headline present', /median|agreement|Split room|wider than/i.test(svg));
  check('gauge(' + theme + '): privacy line present', (await page.locator('footer').innerText()).includes('only numbers'));
  check('gauge(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- roadmap (smoke only; deep suite is check.mjs) ---- */
{
  const {page, errors} = await freshPage('/roadmap/');
  await page.getByRole('button', {name: 'Habit app roadmap'}).click();
  await page.waitForTimeout(500);
  check('roadmap: preview renders', await page.locator('#preview svg').count() === 1);
  check('roadmap: no console errors', errors.length === 0);
  await page.close();
}

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
