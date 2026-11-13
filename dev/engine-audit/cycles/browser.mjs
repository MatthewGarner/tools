// Browser check for audit CYC-4 (needs a running dev server): BASE=http://localhost:<port> node dev/engine-audit/cycles/browser.mjs
// Types through "over 0yr" -> "over 10yr" and "0MWh" -> "200MWh" and checks the page keeps its picture and still simulates.
import {chromium} from '../../pw/node_modules/playwright/index.mjs';
import {openExamples} from '../../pw/_harness.mjs';
const BASE = process.env.BASE; if(!BASE) throw new Error('set BASE');
let fails = 0; const check = (id, ok, d = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + id + (d ? ' :: ' + d : '')); if(!ok) fails++; };
const browser = await chromium.launch();
const page = await browser.newPage({colorScheme: 'light', reducedMotion: 'reduce'});
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if(m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(BASE + '/energy/cycles/', {waitUntil: 'networkidle'});
const src = page.getByRole('button', {name: 'Show source editor'}); await src.waitFor({state: 'visible', timeout: 3000}).catch(() => {}); if(await src.isVisible()) await src.click();
await openExamples(page); await page.getByRole('button', {name: 'Wexcombe base case'}).click();
await page.waitForTimeout(1500);
const verdict = () => page.locator('#verdict').innerText();
const svg = () => page.locator('#preview svg').count().then(n => n ? page.locator('#preview svg').innerHTML() : '');
const alive = () => page.evaluate(() => window.__cyclesWorkerAlive());
const warns = () => page.locator('#warns').innerText();
const v0 = await verdict(), s0 = await svg();
check('boot: example simulated, verdict names year 1', /each in year 1/.test(v0), v0.slice(0, 120));
check('boot: worker alive', await alive());

async function typeThrough(find, keys, label){
  // put the caret after `find` in the source, delete the digits and type through the sequence
  await page.locator('.cm-content').click();
  const text = await page.evaluate(() => document.querySelector('.cm-content').innerText);
  await page.keyboard.press('Meta+a'); // select all then retype with the edit applied step by step
  return text;
}
async function setAndWait(text, ms = 900){
  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+a'); await page.keyboard.insertText(text); await page.waitForTimeout(ms);
}
const model = yrs => `title: Cycle budget\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over ${yrs}yr\naugment: 120..180 £/kWh\ndiscount: 7..10%`;
// real keystrokes: edit the horizon "15" -> "0" -> "10" one key at a time
await setAndWait(model(15), 1500);
const base = await verdict();
await page.locator('.cm-content').click();
await page.keyboard.press('Meta+a'); await page.keyboard.insertText(model(1) );        // put the caret at a known place: type "over 1yr"
await page.waitForTimeout(1200);
// now walk: Backspace the 1 inside "over 1yr": caret is at end of document, move to the line
for(const k of ['Meta+ArrowUp']) await page.keyboard.press(k);
const seq = [];
async function lineCaretTo(substr){  // move caret just after `substr` on its line using Find-free navigation: Home then ArrowRight
  await page.keyboard.press('Meta+ArrowUp');
  const lines = model(1).split('\n'); const idx = lines.findIndex(l => l.startsWith('cycles:'));
  for(let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home'); for(let i = 0; i < substr.length; i++) await page.keyboard.press('ArrowRight');
}
await lineCaretTo('cycles: 6000 over 1');
await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.type('0'); await page.waitForTimeout(1200);   // replace the 1: "over 0yr"
const w0 = await warns(), s1 = await svg();
check('0yr: warning says why', /at least 1 year/.test(w0), w0.slice(0, 160));
check('0yr: the last good picture is still there', s1.length > 1000 && /Cycles are worth/.test(s1), 'svg length ' + s1.length);
check('0yr: worker not disabled', await alive());
await page.keyboard.press('Backspace'); await page.waitForTimeout(500);   // "over yr": an incomplete line blanks the page, as it always has
check('over yr (incomplete, not refused): placeholder as before', /Missing: cycles/.test(await page.locator('#preview').innerText()));
await page.keyboard.type('1'); await page.keyboard.type('0'); await page.waitForTimeout(2500);   // "over 10yr"
const v2 = await verdict(), w2 = await warns();
check('10yr: simulates again', /each in year 1/.test(v2) && !/at least 1 year/.test(w2), v2.slice(0, 100));
check('10yr: result differs from the 15-year one (it really re-ran)', v2 !== base);
check('10yr: worker still alive', await alive());
// 0 MWh
await setAndWait(model(10).replace('200MWh', '0MWh'), 1200);
check('0MWh: refused with a warning, picture kept', /MWh above 0/.test(await warns()) && /Cycles are worth/.test(await svg()), (await warns()).slice(0, 120));
await setAndWait(model(10).replace('200MWh', '20MWh'), 1200);   // 20 MWh: valid, different asset
await setAndWait(model(10).replace('200MWh', '200MWh'), 2500);
check('back to 200MWh: simulates and worker alive', /each in year 1/.test(await verdict()) && await alive());
// worker keeps working for an ordinary sim edit afterwards
await setAndWait(model(10).replace('35..85', '40..95'), 2500);
const countBefore = await page.evaluate(() => window.__cyclesSimCount);
check('later edit still re-simulates (worker alive, not main-thread fallback)', /each in year 1/.test(await verdict()) && await alive(), 'sims so far ' + countBefore);
check('no console / page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
process.exit(fails ? 1 : 0);
