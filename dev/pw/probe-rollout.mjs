/* throwaway: verify the motion rollout — draw tools draw, fade tools reveal, no errors */
import {chromium} from 'playwright';
const B = 'http://localhost:8091';
const browser = await chromium.launch();
const results = [];
// [tool, path, container, expectClass]
const jobs = [
  ['tree', '/tree/', '#preview', 'mo-draw'],
  ['why', '/why/', '#preview', 'mo-draw'],
  ['cycles', '/energy/cycles/', '#preview', 'mo-fade'],
  ['gauge', '/gauge/', '#preview', 'mo-fade'],
  ['wardley', '/wardley/', '#preview', 'mo-fade'],
  ['roadmap', '/roadmap/', '#preview', 'mo-fade'],
  ['map', '/map/', '#preview', 'mo-fade'],
  ['risk', '/energy/risk/', '#preview', 'mo-fade'],
  ['bets', '/bets/', '#preview', 'mo-fade'],
  ['intraday-price', '/energy/intraday/', '#pricewrap', 'mo-fade'],
  ['intraday-stack', '/energy/intraday/', '#stackwrap', 'mo-fade'],
];
for(const [tool, path, sel, want] of jobs){
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  page.on('console', m => { if(m.type() === 'error') errs.push(m.text().slice(0, 100)); });
  try{
    await page.goto(B + path, {waitUntil: 'networkidle'});
    // load an example if the tool needs one to render (gauge/some open with a form)
    await page.waitForTimeout(300);
    await page.$eval(sel, el => el.scrollIntoView({block: 'center'})).catch(() => {});
    await page.waitForFunction(s => document.querySelector(s)?.classList.contains('mo-go'), sel, {timeout: 3000}).catch(() => {});
    await page.waitForTimeout(60);
    const n = await page.evaluate(([s, c]) => document.querySelectorAll(s + ' .' + c).length, [sel, want]);
    const other = await page.evaluate(s => document.querySelectorAll(s + ' .mo-draw, ' + s + ' .mo-fade').length, sel);
    results.push(`${n >= 1 ? 'PASS' : 'FAIL'} ${tool}: expected .${want} on view — got ${n} (any mo-*: ${other}) errs:${errs.length}${errs.length ? ' ' + errs[0] : ''}`);
  }catch(e){ results.push('FAIL ' + tool + ': ' + String(e).split('\n')[0]); }
  await page.close();
}
for(const r of results) console.log(r);
await browser.close();
