/* Hero-layout checks for the three DSL tools: rail collapse, zoom, URL state, stacking. */
import {chromium} from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

const TOOLS = [
  {path: '/tree/', chip: 'Bid or no bid'},
  {path: '/why/', chip: 'Habitat retention'},
  {path: '/roadmap/', chip: 'Habit app roadmap'},
  {path: '/map/', chip: 'Assumption map'},
  {path: '/gauge/', chip: 'Q3 commitment review', view: '#viewreveal'},   // SVG lives in the reveal view
];

for(const {path, chip, view} of TOOLS){
  const page = await browser.newPage({viewport: {width: 1720, height: 1000}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + path, {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: chip}).click();
  await page.waitForTimeout(500);
  if(view){ await page.locator(view).click(); await page.waitForTimeout(400); }

  const svgW = async () => (await page.locator('#preview svg').boundingBox()).width;
  check(path + ' rail visible by default', await page.locator('.rail').isVisible());
  const before = await svgW();
  await page.locator('#railtab').click();
  await page.waitForTimeout(500);
  check(path + ' collapse hides rail', !(await page.locator('.rail').isVisible()));
  const after = await svgW();
  check(path + ' diagram grows on collapse (' + Math.round(before) + '→' + Math.round(after) + ')', after > before * 1.2);
  check(path + ' fills most of viewport (' + Math.round(after) + 'px)', after > 1500);

  /* URL round-trip of collapsed state */
  await page.waitForTimeout(300);
  const url = page.url();
  const p2 = await browser.newPage({viewport: {width: 1720, height: 1000}});
  await p2.goto(url, {waitUntil: 'networkidle'});
  await p2.waitForTimeout(600);
  check(path + ' collapsed state round-trips', !(await p2.locator('.rail').isVisible()));
  await p2.close();

  /* keyboard toggle */
  await page.keyboard.press('[');
  await page.waitForTimeout(300);
  check(path + ' [ reopens rail', await page.locator('.rail').isVisible());

  /* zoom */
  const fitW = await svgW();
  await page.locator('.zoomctl button', {hasText: '+'}).click();
  await page.locator('.zoomctl button', {hasText: '+'}).click();
  await page.waitForTimeout(200);
  await page.waitForTimeout(350);
  const zoomedW = (await page.locator('#preview svg').evaluate(s => s.getBoundingClientRect().width));
  check(path + ' zoom + enlarges beyond fit', zoomedW > fitW * 1.05 || zoomedW > (await page.locator('.preview').evaluate(p => p.clientWidth)));
  await page.locator('.zoomctl button', {hasText: 'Fit'}).click();
  await page.waitForTimeout(500);
  check(path + ' Fit restores', Math.abs((await svgW()) - fitW) < 8);

  /* narrow stacking */
  await page.setViewportSize({width: 800, height: 900});
  await page.waitForTimeout(300);
  check(path + ' narrow: rail stacks and tab hides', await page.locator('.rail').isVisible() &&
    !(await page.locator('#railtab').isVisible()));
  check(path + ' no page errors', errors.length === 0);
  await page.close();
}

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
