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
const SEL = 'details:is(.method,[data-dismiss])';
for(const p of PAGES){
  const page = await ctx.newPage();
  const row = {page: p};
  try{
    await page.goto(server.base + '/' + p + '/', {waitUntil: 'load'});
    await sleep(900);
    const sum = page.locator(SEL + ' > summary').first();
    if(!(await sum.count())){ row.result = 'NO METHOD DISCLOSURE FOUND'; bad++; }
    else{
      await sum.scrollIntoViewIfNeeded();
      await sum.click(); await sleep(150);
      row.opened = await sum.evaluate(s => s.parentElement.open);
      await page.keyboard.press('Escape'); await sleep(150);
      row.escClosed = !(await sum.evaluate(s => s.parentElement.open));
      row.focusBack = await sum.evaluate(s => document.activeElement === s);
      await sum.click(); await sleep(150);
      row.reopened = await sum.evaluate(s => s.parentElement.open);
      await page.mouse.click(2, 2); await sleep(150);   // the page margin: nothing there to act on
      const stillOpen = await sum.evaluate(s => s.parentElement.open);
      row.outsideClosed = !stillOpen;
      row.result = row.opened && row.escClosed && row.focusBack && row.reopened && row.outsideClosed ? 'ok' : 'FAIL';
      if(row.result !== 'ok') bad++;
    }
  }catch(e){ row.result = 'ERROR ' + String(e.message).split('\n')[0]; bad++; }
  console.log(JSON.stringify(row));
  await page.close();
}
await browser.close(); server.stop();
console.log(bad ? bad + ' page(s) failed' : 'all ' + PAGES.length + ' pages ok');
process.exit(bad ? 1 : 0);
