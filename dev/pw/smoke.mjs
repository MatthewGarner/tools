/* Smoke checks for every tool + the landing page. The quality bar: each tool
   loads, its primary flow produces output, and the console stays clean.
   (The roadmap tool has its own deeper suite in check.mjs.) */
import {chromium} from 'playwright';
import {TOOL_DIRS} from '../tool-dirs.mjs';
import {trackErrors} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

async function freshPage(path, theme = 'light'){
  const page = await browser.newPage({colorScheme: theme});
  const errors = trackErrors(page);
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
  check('landing: one card per tool', await page.locator('a.tool').count() === TOOL_DIRS.length);
  const hrefs = await page.locator('a.tool').evaluateAll(as => as.map(a => a.getAttribute('href')));
  for(const href of hrefs){
    const resp = await page.request.get(BASE + href);
    check('landing: ' + href + ' resolves', resp.status() === 200);
  }
  check('landing: no console errors', errors.length === 0);
  await page.close();
}

/* ---- energy landing + risk ---- */
{
  const {page, errors} = await freshPage('/energy/');
  check('energy landing: five tool cards', await page.locator('a.tool').count() === 5);
  check('energy landing: card resolves', (await page.request.get(BASE + '/energy/risk/')).status() === 200);
  check('energy landing: cycles card resolves', (await page.request.get(BASE + '/energy/cycles/')).status() === 200);
  check('energy landing: frequency card resolves', (await page.request.get(BASE + '/energy/frequency/')).status() === 200);
  check('energy landing: merit-order card resolves', (await page.request.get(BASE + '/energy/merit-order/')).status() === 200);
  check('energy landing: intraday card resolves', (await page.request.get(BASE + '/energy/intraday/')).status() === 200);
  check('energy landing: no console errors', errors.length === 0);
  await page.close();
}
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/energy/risk/', theme);
  await page.getByRole('button', {name: 'Route to market'}).click();
  await page.waitForTimeout(600);
  check('risk(' + theme + '): diagram renders', await page.locator('#preview svg').count() === 1);
  check('risk(' + theme + '): verdict present', (await page.locator('#preview svg').innerHTML()).includes('THE TRADE'));
  check('risk(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#preview svg'));
  check('risk(' + theme + '): crumb points at energy landing',
    await page.locator('a.crumb').getAttribute('href') === '../');
  check('risk(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/energy/cycles/', theme);
  await page.getByRole('button', {name: 'Wexcombe base case'}).click();
  await page.waitForTimeout(1000);
  check('cycles(' + theme + '): three bands render', (await page.locator('#preview svg').innerHTML()).includes('THE ASSET LIFE'));
  check('cycles(' + theme + '): verdict present', (await page.locator('#preview svg').innerHTML()).includes('Cycles are worth'));
  check('cycles(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#preview svg'));
  check('cycles(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/energy/frequency/', theme);
  await page.getByRole('button', {name: 'Battery stack'}).click();
  await page.waitForTimeout(2500);
  check('frequency(' + theme + '): trace canvas exists', await page.locator('#trace').count() === 1);
  const verdict = (await page.locator('#verdict').innerText()).trim();
  check('frequency(' + theme + '): verdict non-empty', verdict.length > 20);
  check('frequency(' + theme + '): crumb points at energy landing',
    await page.locator('a.crumb').getAttribute('href') === '../');
  check('frequency(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/energy/merit-order/', theme);
  await page.getByRole('button', {name: 'Gas spike'}).click();
  await page.waitForTimeout(1200);
  check('merit-order(' + theme + '): diagram renders', await page.locator('#chartwrap svg').count() === 1);
  const verdict = (await page.locator('#verdict').innerText()).trim();
  check('merit-order(' + theme + '): verdict non-empty', verdict.length > 20);
  check('merit-order(' + theme + '): gas-spike condition prices high (3-digit £)', /£[12]\d\d/.test(verdict));
  check('merit-order(' + theme + '): storage rendered below gas (data-storage marker)',
    await page.locator('svg g[data-storage]').count() >= 1);
  check('merit-order(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#chartwrap svg'));
  // slider drag: nudge carbon; the SVG must re-render without error
  await page.locator('#carbon').evaluate(el => {
    el.value = '90'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(300);
  check('merit-order(' + theme + '): carbon slider re-renders', await page.locator('#chartwrap svg').count() === 1);
  // tap the BESS block → callout reframes its bid as charging/opportunity cost
  await page.locator('svg g[data-plant="BESS"]').click();
  await page.waitForTimeout(150);
  const calloutTxt = await page.locator('.mo-callout').count() ? await page.locator('.mo-callout').innerText() : '';
  check('merit-order(' + theme + '): BESS callout reframes charging cost', /charging cost/i.test(calloutTxt));
  // Phase 2: an FES world + cold peak → hydrogen (not cheap gas) sets the price
  await page.getByRole('button', {name: 'Hydrogen Evolution'}).click();
  await page.getByRole('button', {name: 'Still cold peak'}).click();
  await page.waitForTimeout(400);
  const feVerdict = (await page.locator('#verdict').innerText()).trim();
  check('merit-order(' + theme + '): FES cold peak priced by hydrogen (£200)', /£200/.test(feVerdict) && /hydrogen/i.test(feVerdict));
  check('merit-order(' + theme + '): CCS + hydrogen blocks with textures',
    await page.locator("svg g[data-plant='Hydrogen']").count() === 1 && await page.locator('svg g[data-tex]').count() >= 2);
  check('merit-order(' + theme + '): world demand max grows (>64)',
    Number(await page.locator('#demand').getAttribute('max')) > 64);
  check('merit-order(' + theme + '): crumb points at energy landing',
    await page.locator('a.crumb').getAttribute('href') === '../');
  check('merit-order(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/energy/intraday/', theme);
  check('intraday(' + theme + '): stack renders', await page.locator('#stackwrap svg').count() === 1);
  check('intraday(' + theme + '): price shape renders', await page.locator('#pricewrap svg').count() === 1);
  const v0 = await page.locator('#verdict').innerText();
  check('intraday(' + theme + '): verdict quotes the spread', /spread/i.test(v0) && /£\d+/.test(v0));
  await page.locator('#fleetGW').fill('6');
  await page.locator('#fleetGW').dispatchEvent('input');
  await page.waitForTimeout(150);
  const v6 = await page.locator('#verdict').innerText();
  // verdict may append " — walking away from N GWh of trades..." after the flattened
  // figure; the raw→flat pair always appears before that clause, so the substring
  // match tolerates it without anchoring the end of the string.
  check('intraday(' + theme + '): fleet flattens (raw → flat quoted)', /£\d+ → £\d+/.test(v6));
  check('intraday(' + theme + '): ghost raw shape appears', await page.locator('[data-raw-shape]').count() === 1);
  await page.locator('#scrub').fill('3');
  await page.locator('#scrub').dispatchEvent('input');
  check('intraday(' + theme + '): scrub moves the cursor', await page.locator("[data-cursor='3']").count() === 1);
  check('intraday(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#pricewrap svg'));
  check('intraday(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- every tool links home ---- */
{
  const tools = TOOL_DIRS;
  const {page, errors} = await freshPage('/' + tools[0] + '/');
  let allOk = true;
  for(const t of tools){
    await page.goto(BASE + '/' + t + '/', {waitUntil: 'domcontentloaded'});
    const crumb = page.locator('a.crumb');
    if(await crumb.count() !== 1 || await crumb.getAttribute('href') !== '/'){ allOk = false; break; }
  }
  check('all ten tools carry the home crumb', allOk);
  await page.close();
}

/* ---- fermi ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/fermi/', theme);
  await page.waitForTimeout(500);
  // opens alive on the first example, hash-safe (autoload; no URL write until interaction)
  check('fermi(' + theme + '): opens alive (autoload, hash clean)',
    (await page.locator('#p50').innerText()).trim() !== '—' && (await page.evaluate(() => location.hash)) === '');
  await page.getByRole('button', {name: 'Weekly meeting, annual cost'}).click();
  await page.waitForTimeout(600);
  const p50 = (await page.locator('#p50').innerText()).trim();
  check('fermi(' + theme + '): example produces a P50 (' + p50 + ')', p50.length > 0 && p50 !== '—');
  // a malformed formula must ghost the prior result (not leave it reading as a current answer)
  check('fermi(' + theme + '): malformed formula ghosts the stale result', await (async () => {
    await page.locator('#formula').fill('a * * b');
    await page.waitForTimeout(400);
    const staleShown = await page.locator('#results.is-stale').count() === 1
      && await page.locator('#err').evaluate(e => getComputedStyle(e).display !== 'none');
    await page.getByRole('button', {name: 'Weekly meeting, annual cost'}).click(); // restore
    await page.waitForTimeout(400);
    const cleared = await page.locator('#results.is-stale').count() === 0;
    return staleShown && cleared;
  })());
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
  check('map(' + theme + '): flagged assumptions hand off to gauge (#93)', await (async () => {
    await page.getByRole('button', {name: 'Assumption map'}).click();
    await page.waitForTimeout(500);
    if(await page.locator('#togauge').isHidden()) return false;
    await page.locator('#togauge').click();
    await page.waitForTimeout(800);
    if(!page.url().includes('/gauge/')) return false;
    await page.locator('#viewform').click(); // gauge opens on the reveal now; the form carries the handed-off questions
    await page.waitForTimeout(300);
    const qs = await page.locator('#preview .gform .q').count();
    const title = await page.locator('.cm-content').innerText();
    await page.goBack();
    await page.waitForTimeout(500);
    return qs === 2 && title.includes('assumption check');
  })());
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
  await page.waitForTimeout(600);
  // New default: opens alive on the sample reveal of the first example (hash-safe autoload).
  check('gauge(' + theme + '): opens alive on the sample reveal', await page.locator('#viewreveal.on').count() === 1 && await page.locator('#preview svg').count() === 1);
  await page.getByRole('button', {name: 'Q3 commitment review'}).click();
  await page.locator('#viewform').click();
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

/* ---- wardley ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/wardley/', theme);
  await page.waitForTimeout(500);
  check('wardley(' + theme + '): opens alive (hash-safe autoload)', await page.locator('#preview svg').count() === 1);
  await page.getByRole('button', {name: 'Habitat platform'}).click();
  await page.waitForTimeout(600);
  const svg = await page.locator('#preview svg').innerHTML();
  check('wardley(' + theme + '): anchors + stage columns render', svg.includes('Habit tracking') && svg.includes('commodity'));
  check('wardley(' + theme + '): ghost renders dashed', /Analytics pipeline/.test(svg) && /stroke-dasharray/.test(svg));
  check('wardley(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('wardley(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- timeline ---- */
for(const theme of ['light', 'dark']){
  const {page, errors} = await freshPage('/timeline/', theme);
  await page.waitForTimeout(500);
  check('timeline(' + theme + '): opens alive (hash-safe autoload)', await page.locator('#preview svg').count() === 1);
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
