/* Pictures of a large Bets portfolio and a large Tree mid-edit (figures pending) and after (final).
   node dev/feel-audit/shots-sim.mjs <out-dir>
   A stand-in worker answers two seconds late so the pending picture can be photographed; it runs the real engine function. */
import {chromium, startServer, newPage, openTool, waitQuiet, sleep} from './lib.mjs';
import {betsLarge, treeLarge} from './stress-btp.mjs';
import {mkdirSync} from 'node:fs';
import {setSource} from './scenarios-sim.mjs';

const out = process.argv[2] || '/tmp/sim-shots';
mkdirSync(out, {recursive: true});
const stand = (fn, from) => `import {${fn}} from './${from}';
self.onmessage = ({data: {payload, reqId}}) => {
  let reply;
  try{ reply = {result: ${fn}(payload), reqId}; }catch(e){ reply = {error: String(e.message || e), reqId}; }
  setTimeout(() => self.postMessage(reply), 2500);
};`;
const server = await startServer();
const browser = await chromium.launch();
for(const [tool, source, fn, from] of [['bets', betsLarge(), 'runSimulations', 'sim-memo.js'], ['tree', treeLarge(), 'runEvaluation', 'eval-wire.js']]){
  const {ctx, page} = await newPage(browser, 'desktop', {contextOptions: {serviceWorkers: 'block'}});
  await page.setViewportSize({width: 1280, height: 900});
  await page.route('**/' + tool + '/sim-worker.js', route => route.fulfill({contentType: 'text/javascript', body: stand(fn, from)}));
  await openTool(page, server.base, tool, source);
  await page.waitForFunction(() => document.getElementById('preview').dataset.sim === 'final', null, {timeout: 20000});
  await waitQuiet(page, {quiet: 500});
  await page.screenshot({path: `${out}/${tool}-large-0-before-edit.png`});
  await setSource(page, tool, 9);
  await page.waitForFunction(() => 'simDim' in document.getElementById('preview').dataset, null, {timeout: 5000, polling: 10});
  await sleep(150);
  const state = await page.evaluate(() => ({sim: document.getElementById('preview').dataset.sim, busy: document.getElementById('preview').getAttribute('aria-busy')}));
  console.log(tool, 'mid-edit', JSON.stringify(state));
  await page.screenshot({path: `${out}/${tool}-large-1-pending.png`});
  await page.waitForFunction(() => document.getElementById('preview').dataset.sim === 'final', null, {timeout: 8000});
  await waitQuiet(page, {quiet: 500});
  await page.screenshot({path: `${out}/${tool}-large-2-final.png`});
  await ctx.close();
}
await browser.close();
server.stop();
