/* Where the time goes: a CPU profile (CDP Profiler, 100us sampling) around one interaction, summarised as self time by
   function, plus rendering/paint time from a trace-free estimate (Performance.getMetrics deltas).
   node dev/feel-audit/profile.mjs bets-swap | paths-plans-large | paths-scroll-large  [--cpu 1]
   Changes nothing: instruments only. */
import {chromium, startServer, newPage, openTool, sleep, waitQuiet, hashOpen} from './lib.mjs';
import {pathsLarge, betsLarge} from './stress-btp.mjs';

const which = process.argv[2];
const cpu = Number(process.argv[process.argv.indexOf('--cpu') + 1]) || 1;
const server = await startServer();
const browser = await chromium.launch();

async function profile(page, act){
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', {interval: 100});
  await cdp.send('Performance.enable');
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await act();
  const wall = Date.now() - t0;
  const {profile: prof} = await cdp.send('Profiler.stop');
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const metrics = {};
  for(const k of ['LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'LayoutCount', 'RecalcStyleCount']) metrics[k] = +((m1[k] - m0[k]) * (k.endsWith('Duration') ? 1000 : 1)).toFixed(1);
  /* self time by node */
  const byId = new Map(prof.nodes.map(n => [n.id, n]));
  const self = new Map();
  const dt = prof.timeDeltas;
  prof.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
  const rows = new Map();
  for(const [id, us] of self){
    const n = byId.get(id), cf = n.callFrame;
    const key = (cf.functionName || '(anonymous)') + ' ' + (cf.url || '').replace(/^https?:\/\/[^/]+/, '') + ':' + cf.lineNumber;
    rows.set(key, (rows.get(key) || 0) + us / 1000);
  }
  const top = [...rows.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => v.toFixed(1).padStart(7) + ' ms  ' + k);
  const total = [...rows.values()].reduce((s, v) => s + v, 0);
  console.log(`wall ${wall} ms, sampled ${total.toFixed(1)} ms, metrics (ms) ${JSON.stringify(metrics)}`);
  console.log(top.join('\n'));
  await cdp.send('Profiler.disable');
}

try{
  if(which === 'bets-swap'){
    for(const [label, src] of [['example', undefined], ['large', betsLarge()]]){
      const {ctx, page} = await newPage(browser, 'desktop', {throttle: cpu});
      await openTool(page, server.base, 'bets', src);
      const q = page.locator('#viewtoggle [data-view="quadrant"]'), b = page.locator('#viewtoggle [data-view="board"]');
      await q.scrollIntoViewIfNeeded(); await sleep(300);
      for(const [name, btn] of [['to quadrant', q], ['to board', b], ['to quadrant', q], ['to board', b]]){
        console.log(`\n== bets ${label} ${name}`);
        await profile(page, async () => { await btn.click(); await sleep(400); });
      }
      await ctx.close();
    }
  }
  if(which === 'paths-plans-large'){
    const {ctx, page} = await newPage(browser, 'desktop', {throttle: cpu});
    await openTool(page, server.base, 'paths', pathsLarge());
    await page.locator('.paths-more-views > summary').click(); await sleep(200);
    console.log('== paths large: Plans view');
    await profile(page, async () => { await page.locator('[data-paths-view="plans"]').click(); await sleep(600); });
    await ctx.close();
  }
  if(which === 'paths-scroll-large'){
    const {ctx, page} = await newPage(browser, 'desktop', {throttle: cpu});
    await openTool(page, server.base, 'paths', pathsLarge());
    await page.mouse.move(640, 400);
    console.log('== paths large: 20 wheel steps of 120px');
    await profile(page, async () => { for(let i = 0; i < 20; i++){ await page.mouse.wheel(0, 120); await sleep(32); } await sleep(300); });
    const {ctx: c2, page: p2} = await newPage(browser, 'desktop', {throttle: cpu});
    await p2.setContent('<body style="margin:0"><div style="height:6000px;background:linear-gradient(#fff,#ccc)"></div></body>');
    await p2.mouse.move(640, 400);
    console.log('== blank control page, same gesture');
    await profile(p2, async () => { for(let i = 0; i < 20; i++){ await p2.mouse.wheel(0, 120); await sleep(32); } await sleep(300); });
    await c2.close(); await ctx.close();
  }
}finally{
  await browser.close();
  server.stop();
}
