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

/* The PNG-export path decodes the SVG string as an <img>; invalid XML (e.g. a
   double quote inside an attribute) renders fine inline but kills exports —
   the 2026-07-06 gauge/fermi bug. Decode-check the rendered SVG per tool. */
async function svgDecodes(page, selector){
  return page.evaluate(async sel => {
    const el = document.querySelector(sel);
    if(!el) return false;
    const svg = el.outerHTML;
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      setTimeout(() => res(false), 3000);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }, selector);
}

/* ---- landing ---- */
{
  const {page, errors} = await freshPage('/');
  check('landing: nine tool cards', await page.locator('a.tool').count() === 9);
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
  check('fermi(' + theme + '): driver tree renders on toggle', await (async () => {
    await page.locator('#viewtree').click();
    await page.waitForTimeout(200);
    const svg = await page.locator('#driverwrap svg').count() === 1
      ? await page.locator('#driverwrap svg').innerHTML() : '';
    return /data-node="var"/.test(svg) && /data-node="out"/.test(svg) && !/NaN|undefined/.test(svg);
  })());
  check('fermi(' + theme + '): distribution view restores', await (async () => {
    await page.locator('#viewdist').click();
    await page.waitForTimeout(120);
    return await page.locator('.histwrap').isVisible() && !(await page.locator('#driverwrap').isVisible());
  })());
  check('fermi(' + theme + '): driver svg decodes as an image', await svgDecodes(page, '#driverwrap svg'));
  check('fermi(' + theme + '): cashflow mode renders NPV verdict', await (async () => {
    await page.locator('#modecf').click();
    await page.waitForTimeout(600);
    const svg = await page.locator('#cfwrap svg').count() === 1
      ? await page.locator('#cfwrap svg').innerHTML() : '';
    return /NPV P50/.test(svg) && /payback/i.test(svg) && !/NaN|undefined/.test(svg);
  })());
  check('fermi(' + theme + '): runway example flips the framing', await (async () => {
    await page.getByRole('button', {name: 'Runway'}).click();
    await page.waitForTimeout(600);
    const svg = await page.locator('#cfwrap svg').innerHTML();
    return /RUNWAY/.test(svg) && /month \d+/.test(svg);
  })());
  check('fermi(' + theme + '): cashflow svg decodes as an image', await svgDecodes(page, '#cfwrap svg'));
  check('fermi(' + theme + '): estimate mode restores untouched', await (async () => {
    await page.locator('#modeest').click();
    await page.waitForTimeout(400);
    return await page.locator('#formula').isVisible() && await page.locator('#results').isVisible();
  })());
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
  const flip = (await page.locator('#flipline').innerText()).trim();
  check('rank(' + theme + '): flip verdict present', /weight|flips first place/i.test(flip));
  check('rank(' + theme + '): order diff names the movers', await (async () => {
    await page.locator('#oda').fill('Alpha\nBeta\nGamma\nDelta');
    await page.locator('#odb').fill('Delta\nBeta\nGamma\nAlpha');
    await page.waitForTimeout(400);
    const v = await page.locator('#odverdict').innerText();
    return /Kendall/.test(v) && await page.locator('.odrow').count() >= 2;
  })());
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
  check('tree(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('tree(' + theme + '): Tab indents, Shift-Tab restores', await (async () => {
    const before = await page.evaluate(() => localStorage.getItem('tree-src'));
    await page.locator('.cm-content').click();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => localStorage.getItem('tree-src'));
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => localStorage.getItem('tree-src'));
    return mid !== before && mid.length === before.length + 2 && after === before;
  })());
  check('tree(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- why ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/why/', theme);
  await page.getByRole('button', {name: 'Habit retention'}).click();
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
  check('why(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('why(' + theme + '): snapshot compare renders the narrative + NEW badge', await (async () => {
    await page.locator('#viewost').click();
    await page.locator('#snap').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.type('outcome: Snap ' + theme);
    await page.waitForTimeout(500);
    const n = await page.locator('#snapsel option').count();
    await page.locator('#snapsel').selectOption({index: n - 1});
    await page.waitForTimeout(500);
    const svg = await page.locator('#preview svg').innerHTML();
    return /Since /.test(svg) && />NEW<\/text>/.test(svg);
  })());
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
  check('map(' + theme + '): skills preset flags the bus factor (#69)', await (async () => {
    await page.getByRole('button', {name: 'Skills coverage'}).click();
    await page.waitForTimeout(500);
    const svg = await page.locator('#preview svg').innerHTML();
    return svg.includes('BUS FACTOR') && /no backup named/.test(svg);
  })());
  check('map(' + theme + '): rag preset calls the watermelon (#70)', await (async () => {
    await page.getByRole('button', {name: 'RAG honesty'}).click();
    await page.waitForTimeout(500);
    const svg = await page.locator('#preview svg').innerHTML();
    return svg.includes('WATERMELON WATCH') && /reported green/.test(svg);
  })());
  check('map(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('map(' + theme + '): snapshot compare shows drift', await (async () => {
    await page.getByRole('button', {name: 'Assumption map'}).click();
    await page.waitForTimeout(400);
    await page.locator('#snap').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Drift ' + theme + ' @ 90,10');
    await page.waitForTimeout(500);
    const n = await page.locator('#snapsel option').count();
    await page.locator('#snapsel').selectOption({index: n - 1});
    await page.waitForTimeout(500);
    const svg = await page.locator('#preview svg').innerHTML();
    return /Since /.test(svg) && />NEW<\/text>/.test(svg);
  })());
  check('map(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- gauge (solo mode; the relay flow lives in gauge.mjs) ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/gauge/', theme);
  await page.getByRole('button', {name: 'Q3 commitment review'}).click();
  await page.waitForTimeout(600);
  check('gauge(' + theme + '): form preview renders 3 questions', await page.locator('#preview .gform .q').count() === 3);
  check('gauge(' + theme + '): add question writes through the editor (insertAndSelect)', await (async () => {
    await page.locator('.addq').first().click();
    await page.waitForTimeout(400);
    return await page.locator('#preview .gform .q').count() === 4;
  })());
  await page.locator('#viewreveal').click();
  await page.waitForTimeout(500);
  check('gauge(' + theme + '): sample reveal renders SVG', await page.locator('#preview svg').count() === 1);
  check('gauge(' + theme + '): overlay svg decodes as an image', await svgDecodes(page, '#preview svg'));
  const svg = await page.locator('#preview svg').innerHTML();
  check('gauge(' + theme + '): headline present', /median|agreement|Split room|wider than/i.test(svg));
  check('gauge(' + theme + '): privacy line present', (await page.locator('footer').innerText()).includes('only numbers'));
  check('gauge(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- flow ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/flow/', theme);
  await page.getByRole('button', {name: 'Overloaded team'}).click();
  await page.waitForTimeout(700);
  check('flow(' + theme + '): readout SVG renders', await page.locator('#verdictwrap svg').count() === 1);
  const svg = await page.locator('#verdictwrap svg').innerHTML();
  check('flow(' + theme + '): verdict present', /typical item takes/i.test(svg));
  check('flow(' + theme + '): overload honesty line', /demand exceeds capacity/i.test(svg));
  check('flow(' + theme + '): histogram bars', (svg.match(/<rect/g) || []).length > 5);
  check('flow(' + theme + '): batch U-curve renders', await page.locator('#batchwrap svg').count() === 1);
  const batchSvg = await page.locator('#batchwrap svg').innerHTML();
  check('flow(' + theme + '): batch verdict names the economic batch', /Economic batch/.test(batchSvg));
  check('flow(' + theme + '): triage renders with a pile', await (async () => {
    await page.locator('#backlog').fill('20');
    await page.waitForTimeout(500);
    const t = await page.locator('#triagewrap svg').innerHTML();
    return /QUEUE TRIAGE/.test(t) && (t.match(/data-bar/g) || []).length === 4;
  })());
  check('flow(' + theme + '): triage drain framing on an overloaded pile',
    /pile|clears|never/i.test(await page.locator('#triagewrap svg').innerHTML()));
  check('flow(' + theme + '): readout svg decodes as an image', await svgDecodes(page, '#verdictwrap svg'));
  check('flow(' + theme + '): no undefined/NaN leaks into any svg', await (async () => {
    for(const sel of ['#verdictwrap svg', '#batchwrap svg', '#triagewrap svg']){
      const s = await page.locator(sel).innerHTML();
      if(/undefined|NaN/.test(s)) return false;
    }
    return true;
  })());
  check('flow(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- timeline ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/timeline/', theme);
  await page.getByRole('button', {name: 'App launch programme'}).click();
  await page.waitForTimeout(600);
  check('timeline(' + theme + '): renders SVG', await page.locator('#preview svg').count() === 1);
  const svg = await page.locator('#preview svg').innerHTML();
  check('timeline(' + theme + '): whiskers + today line', /data-ms="whisker"/.test(svg) && /data-today/.test(svg));
  check('timeline(' + theme + '): readout names the widest whisker', /Widest whisker/.test(svg));
  check('timeline(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('timeline(' + theme + '): snapshot compare renders the slip slide', await (async () => {
    await page.locator('#snap').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ops: Snap ' + theme + ' 2027-03 .. 2027-05');
    await page.waitForTimeout(500);
    const n = await page.locator('#snapsel option').count();
    await page.locator('#snapsel').selectOption({index: n - 1});
    await page.waitForTimeout(500);
    const d = await page.locator('#preview svg').innerHTML();
    return /Since /.test(d) && />NEW</.test(d);
  })());
  check('timeline(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- roadmap (smoke only; deep suite is check.mjs) ---- */
{
  const {page, errors} = await freshPage('/roadmap/');
  await page.getByRole('button', {name: 'Habit app roadmap'}).click();
  await page.waitForTimeout(500);
  check('roadmap: preview renders', await page.locator('#preview svg').count() === 1);
  check('roadmap: svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('roadmap: no console errors', errors.length === 0);
  await page.close();
}

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
