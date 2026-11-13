/* Inventory: every visible interactive control on Fermi (estimate, authoring open, cashflow,
   cashflow authoring with debt) and Rank, at phone and desktop, with its box, font size and
   touch-action, plus full-page screenshots of each state.
   Usage: node dev/feel-audit/inventory-fermi-rank.mjs [outDir] */
import {chromium, startServer, shot} from './lib.mjs';
import {openFR, controlsOf, sleep, waitQuiet} from './fr-lib.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';

const out = process.argv[2] || process.env.FEEL_OUT || '/tmp/feel-audit';
mkdirSync(out + '/shots', {recursive: true});
const server = await startServer();
const browser = await chromium.launch();
const env = {browser, base: server.base, throttle: 1, engine: 'chromium', mode: 'normal'};
const report = {};
const STATES = {
  fermi: [
    ['landing', async () => {}],
    ['authoring', async page => { await page.locator('#editmodel').click(); }],
    ['compare', async page => { await page.locator('#scentabs .tab').first().click(); }],
    ['tree', async page => { await page.locator('#viewtree').click(); }],
    ['cashflow', async page => { await page.locator('#modecf').click(); }],
    ['cashflow-authoring', async page => { await page.locator('#modecf').click(); await page.locator('#editmodel').click(); await page.locator('#cfchips .chip', {hasText: 'Geared'}).click(); }],
  ],
  rank: [
    ['landing', async () => {}],
    ['paste-open', async page => { await page.locator('#pastebtn').click(); }],
  ],
};
try{
  for(const tool of ['fermi', 'rank']) for(const kind of ['desktop', 'phone']) for(const [name, act] of STATES[tool]){
    const {ctx, page, errors} = await openFR(env, tool, kind, {reducedMotion: 'reduce'});
    await act(page); await waitQuiet(page, {quiet: 300});
    /* measure before the full-page screenshot: Chromium's full-page capture overrides the device metrics and drops the
       phone's touch emulation, so (pointer: coarse) rules stop applying for the rest of the page's life */
    report[`${tool}/${name}/${kind}`] = await controlsOf(page);
    await shot(page, `${out}/shots/inventory-${tool}-${name}-${kind}.png`, {fullPage: true});
    report[`${tool}/${name}/${kind}:errors`] = errors;
    report[`${tool}/${name}/${kind}:height`] = await page.evaluate(() => document.documentElement.scrollHeight);
    await ctx.close();
  }
}finally{ await browser.close(); server.stop(); }
writeFileSync(out + '/inventory-controls.json', JSON.stringify(report, null, 1));
for(const [k, v] of Object.entries(report)) if(Array.isArray(v) && !k.includes(':')){
  console.log(`\n== ${k} (${v.length} controls, page ${report[k + ':height']}px)`);
  for(const c of v) console.log(`  ${(c.tag + (c.id ? '#' + c.id : c.cls ? '.' + c.cls : '')).padEnd(30)} ${c.name.slice(0, 30).padEnd(31)} ${c.w}x${c.h} font=${c.font} ta=${c.touchAction}${c.disabled ? ' disabled' : ''}${Math.min(c.w, c.h) < 44 ? '  <44' : ''}${c.tag.startsWith('input') || c.tag === 'textarea' || c.tag === 'select' ? (c.font < 16 ? '  <16px' : '') : ''}`);
}
for(const [k, v] of Object.entries(report)) if(k.endsWith(':errors') && v.length) console.log('ERRORS', k, v);
