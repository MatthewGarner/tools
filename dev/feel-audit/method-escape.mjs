/* The Method disclosure on every page that has one: open it, press Escape (it should close and focus should return to its
   summary), open it again, press elsewhere (it should close). Prints one line per page and exits 1 on any failure.
   node dev/feel-audit/method-escape.mjs [--phone] */
import {chromium, startServer, sleep} from './lib.mjs';

const PAGES = ['alarm', 'bets', 'duel', 'energy/cycles', 'energy/risk', 'fermi', 'flow', 'gauge', 'map', 'premortem', 'proxy', 'rank', 'roadmap', 'tree', 'wardley', 'why'];
const phone = process.argv.includes('--phone');
const server = await startServer();
const browser = await chromium.launch();
const ctx = await browser.newContext(phone ? {viewport: {width: 375, height: 812}, hasTouch: true, isMobile: true} : {viewport: {width: 1280, height: 800}});
let bad = 0;
/* Only Bets and Fermi carry a <details class="method">; the shared selector (tool-shell.js DISCLOSURE) also covers the action menus
   (Export, History, Appearance) on every page, so every visible disclosure the selector matches is exercised, Method first. */
const SEL = 'details:is(.method,.action-disclosure,[data-dismiss]) > summary';
for(const p of PAGES){
  const page = await ctx.newPage();
  try{
    await page.goto(server.base + '/' + p + '/', {waitUntil: 'load'});
    await sleep(900);
    /* Fermi's Method sits in the cash-flow results, which stay hidden until a cash-flow model is run: show them to test the disclosure itself */
    if(p === 'fermi') await page.evaluate(() => { const r = document.getElementById('cfresults'); if(r) r.hidden = false; });
    const sums = page.locator(SEL + ':visible');
    const n = await sums.count();
    const hasMethod = await page.locator('details.method').count();
    if(!n) console.log(JSON.stringify({page: p, result: 'none to test (no Method or action menu on this page)', hasMethod: !!hasMethod}));
    for(let i = 0; i < n; i++){
      const sum = sums.nth(i);
      const row = {page: p, name: ((await sum.textContent()) || '').trim().slice(0, 16), method: await sum.evaluate(s => s.parentElement.classList.contains('method'))};
      try{
        await sum.scrollIntoViewIfNeeded({timeout: 3000});
        await sum.click(); await sleep(150);
        row.opened = await sum.evaluate(s => s.parentElement.open);
        await page.keyboard.press('Escape'); await sleep(150);
        row.escClosed = !(await sum.evaluate(s => s.parentElement.open));
        row.focusBack = await sum.evaluate(s => document.activeElement === s);
        await sum.click(); await sleep(150);
        row.reopened = await sum.evaluate(s => s.parentElement.open);
        await page.mouse.click(2, 2); await sleep(150);   // the page margin: nothing there to act on
        row.outsideClosed = !(await sum.evaluate(s => s.parentElement.open));
        row.result = row.opened && row.escClosed && row.focusBack && row.reopened && row.outsideClosed ? 'ok' : 'FAIL';
      }catch(e){ row.result = 'ERROR ' + String(e.message).split('\n')[0]; }
      if(row.result !== 'ok') bad++;
      console.log(JSON.stringify(row));
    }
  }catch(e){ console.log(JSON.stringify({page: p, result: 'ERROR ' + String(e.message).split('\n')[0]})); bad++; }
  await page.close();
}
await browser.close(); server.stop();
console.log(bad ? bad + ' failure(s)' : 'every disclosure on all ' + PAGES.length + ' pages ok');
process.exit(bad ? 1 : 0);
