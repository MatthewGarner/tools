// Drives the REAL Merit Order page (F-MO-2, F-MO-8, F-MO-1, F-MO-6).  Run:  BASE=http://localhost:<port> node dev/engine-audit/merit-order/page.mjs
// Needs a dev server (node dev/serve.mjs <port>) and the repo's Playwright in dev/pw/node_modules.
import {chromium} from '../../pw/node_modules/playwright/index.mjs';
const BASE = process.env.BASE;
if(!BASE) throw new Error('set BASE');
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(BASE + '/energy/merit-order/', {waitUntil: 'networkidle'});
const out = {};
let cur = page;
const outcome = () => cur.locator('.energy-outcome').innerText();
const plant = name => page.locator(`g[data-plant="${name}"]`).first();
const open = async name => { await plant(name).focus(); await page.keyboard.press('Enter'); };   // keyboard path: the demand-line hit area can sit over a block
const bidOf = async name => (await page.evaluate(n => document.querySelector(`g[data-plant="${n}"]`)?.getAttribute('aria-label'), name));

// ---- F-MO-2: edit a block's capacity, then move the gas slider ----
out.bidBefore = await bidOf('CCGT 60%');
await open('CCGT 60%');
await page.locator('.mo-callout-math').waitFor();
out.calloutMath = await page.locator('.mo-callout-math').innerText();
await page.getByRole('button', {name: /Edit/}).click();
await page.locator('.mo-stepper').first().waitFor();
await page.getByRole('button', {name: 'Increase Capacity'}).click();
await page.getByRole('button', {name: 'Increase Capacity'}).click();
out.editPanelText = await page.locator('.mo-callout-edit, .mo-callout').first().innerText().catch(() => null);
out.editPanelHtml = (await page.evaluate(() => document.querySelector('.mo-callout')?.outerHTML ?? null));
out.bidAfterEdit = await bidOf('CCGT 60%');
await page.keyboard.press('Escape');
await page.locator('#gas').fill('250');      // range input: fill sets value + input event
out.bidAfterGas = await bidOf('CCGT 60%');
out.gasOutput = await page.locator('#gasout').innerText();
// anything on the page that marks a pinned/edited value?
out.pinMarkers = await page.evaluate(() => ({
  pinnedAttr: document.querySelectorAll('[data-pinned],[data-edited],.pinned,.edited').length,
  resetButtons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /reset|clear|unpin|revert/i.test(t)),
  customChip: document.querySelector('#presets .chip.on')?.textContent ?? null,
}));

// ---- F-MO-8: drag the demand line so it snaps to a block boundary, read the outcome line ----
// fresh page below: no hash state or open callout from the edit run
const page2 = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
await page2.goto(BASE + '/energy/merit-order/', {waitUntil: 'networkidle'});
cur = page2;
const hit = page2.locator('.demand-hit');
const hb = await hit.boundingBox();
const target = await page2.evaluate(() => {   // right edge of the Hydro block (cumulative boundary 15.26 GW on the default stack)
  const r = document.querySelector('g[data-plant="Hydro"] rect'); const b = r.getBoundingClientRect(); return b.right;
});
const x0 = hb.x + hb.width / 2, yy = hb.y + hb.height / 2;
await page2.mouse.move(x0, yy);
await page2.mouse.down();
for(let i = 1; i <= 10; i++){ await page2.mouse.move(x0 + (target - x0) * i / 10, yy); await page2.waitForTimeout(40); }   // rAF-batched drag needs frames between moves
await page2.mouse.up();
await page2.waitForTimeout(600);
out.outcomeAfterSnap = await outcome();
out.demandOut = await page2.locator('#demandout').innerText();
// receipt/markdown: copy-as-markdown text via the export function path is clipboard-bound; read the hash state instead
out.hashDemand = await page2.evaluate(() => decodeURIComponent(location.hash).slice(0, 200));

// continue on page2 for the remaining checks
// ---- F-MO-1: callout rent text ----
await page2.locator('g[data-plant="Wind"]').first().focus(); await page2.keyboard.press('Enter');
out.windCallout = await page2.locator('.mo-callout-math').innerText();
await page2.keyboard.press('Escape');

// ---- F-MO-6: Gas spike in a net-zero world ----
await page2.locator('#worlds .chip[data-world="ht"]').click();
await page2.locator('#presets .chip[data-preset="gasSpike"]').click();
await page2.waitForTimeout(300);
out.gasSpikeHT = await outcome();
await page2.locator('#gas').fill('200');
await page2.waitForTimeout(300);
out.afterSliderNote = await outcome();
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
