/* Probe: the width the page's measure() gives one awkward title, at different moments after load. */
import {arg, boot, newContext, loadDocs} from './lib.mjs';
import {TOOLS} from './tools.mjs';
const doc = loadDocs('bets').find(d => d.name.includes('e-awkward')), T = TOOLS.bets;
const env = await boot();
try{
  for(let run = 0; run < 3; run++){
    const ctx = await newContext(env.browser, env.srv.base, 'light');
    const page = await ctx.newPage();
    await page.goto(env.srv.base + T.path + '#' + T.hash(doc), {waitUntil: 'load'});
    const probe = () => page.evaluate(async () => {
      const m = await import('/assets/app-common.js');
      const font = "600 24px 'DM Sans',sans-serif", text = 'R&D <alpha> "beta" | ‘quotes’ 🚀 עברית café Zoë';
      return {w: m.measure(text, font), fontsLoaded: [...document.fonts].filter(f => f.status === 'loaded').length, dm: document.fonts.check(font)};
    });
    console.log(run, 'at load   ', JSON.stringify(await probe()));
    await T.ready(page);
    console.log(run, 'after ready', JSON.stringify(await probe()));
    await page.waitForTimeout(1500);
    console.log(run, 'later     ', JSON.stringify(await probe()));
    await page.screenshot({path: '/dev/null'}).catch(() => {});
    console.log(run, 'after shot', JSON.stringify(await probe()));
    await ctx.close();
  }
}finally{ await env.close(); }
