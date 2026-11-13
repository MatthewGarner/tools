/* Frame strips behind the Bets/Tree/Paths visual findings: back-to-back screenshots
   while an interaction runs, stitched into one labelled PNG each.
   node dev/feel-audit/strips-btp.mjs [outDir] */
import {chromium, startServer, newPage, openTool, sleep, waitQuiet, hashOpen} from './lib.mjs';
import {pointOn} from './scenarios.mjs';
import {treeLarge} from './stress-btp.mjs';
import {mkdirSync} from 'node:fs';

const out = (process.argv[2] || process.env.FEEL_OUT || '/tmp/feel-audit') + '/shots';
mkdirSync(out, {recursive: true});
const server = await startServer();
const browser = await chromium.launch();

async function grab(page, act, {n = 8, clip} = {}){
  const t0 = Date.now(), frames = [];
  const run = act();
  for(let i = 0; i < n; i++){
    const buf = await page.screenshot({clip, type: 'jpeg', quality: 70, scale: 'css'}).catch(() => null);
    if(buf) frames.push({ms: Date.now() - t0, b64: buf.toString('base64')});
  }
  await run;
  return frames;
}
async function stitch(frames, path, width = 300){
  const p = await browser.newPage({viewport: {width: 4 * (width + 8) + 8, height: 200}});
  await p.setContent('<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:8px;padding:8px;font:14px sans-serif;color:#fff;align-items:flex-start">' +
    frames.map(f => `<figure style="margin:0;width:${width}px"><figcaption>${f.label || '+' + f.ms + 'ms'}</figcaption><img style="width:${width}px;display:block" src="data:image/jpeg;base64,${f.b64}"></figure>`).join('') + '</body>');
  await p.screenshot({path, fullPage: true});
  await p.close();
  console.log('wrote', path);
}
const phoneClip = {x: 0, y: 0, width: 375, height: 812};
const deskClip = {x: 0, y: 0, width: 1280, height: 800};

try{
  /* 1. first load on a phone and on desktop: what moves after the artefact appears */
  for(const tool of ['bets', 'tree', 'paths']) for(const kind of ['phone', 'desktop']){
    const {ctx, page} = await newPage(browser, kind);
    const frames = await grab(page, () => page.goto(server.base + '/' + tool + '/', {waitUntil: 'commit'}), {n: 10, clip: kind === 'phone' ? phoneClip : deskClip});
    await stitch(frames, `${out}/strip-${tool}-load-${kind}.png`, kind === 'phone' ? 180 : 300);
    await ctx.close();
  }
  /* 2. view switches: Bets Board -> Quadrant; Paths Brief -> Learning agenda */
  for(const [tool, sel] of [['bets', '#viewtoggle [data-view="quadrant"]'], ['paths', '[data-paths-view="agenda"]']]){
    const {ctx, page} = await newPage(browser, 'desktop');
    await openTool(page, server.base, tool);
    await page.locator(sel).scrollIntoViewIfNeeded(); await sleep(200);
    const frames = await grab(page, () => page.locator(sel).click(), {n: 8, clip: deskClip});
    await stitch(frames, `${out}/strip-${tool}-view-switch.png`);
    await ctx.close();
  }
  /* 3. Tree: slider engage + drag on the example; engage on the large tree (where does the bar appear?) */
  {
    const {ctx, page} = await newPage(browser, 'desktop');
    await openTool(page, server.base, 'tree');
    const p = await pointOn(page, '#preview [data-hot][data-edit="prob"]', {resolve: '[data-edit]'});
    await sleep(250);
    const f1 = await grab(page, () => page.mouse.click(p.x, p.y), {n: 3, clip: deskClip});
    const rg = await page.locator('#exploreRange').boundingBox();
    await page.mouse.move(rg.x + rg.width * 0.37, rg.y + rg.height / 2); await page.mouse.down();
    const f2 = await grab(page, async () => { for(let i = 1; i <= 20; i++){ await page.mouse.move(rg.x + rg.width * (0.37 - i * 0.017), rg.y + rg.height / 2); await sleep(16); } }, {n: 4, clip: deskClip});
    const f3 = await grab(page, () => page.mouse.up(), {n: 3, clip: deskClip});
    await stitch([...f1.map(f => ({...f, label: 'engage +' + f.ms})), ...f2.map(f => ({...f, label: 'drag +' + f.ms})), ...f3.map(f => ({...f, label: 'release +' + f.ms}))], `${out}/strip-tree-slider.png`);
    await ctx.close();
  }
  {
    const {ctx, page} = await newPage(browser, 'desktop');
    await page.goto(server.base + '/tree/#' + hashOpen(treeLarge()), {waitUntil: 'load'});
    await page.waitForFunction(() => document.querySelector('#preview svg')); await waitQuiet(page, {quiet: 500});
    const p = await pointOn(page, '#preview [data-hot][data-edit="prob"]', {resolve: '[data-edit]'});
    await sleep(250);
    const before = await page.screenshot({type: 'jpeg', quality: 70, clip: deskClip});
    await page.mouse.click(p.x, p.y); await sleep(300);
    const after = await page.screenshot({type: 'jpeg', quality: 70, clip: deskClip});
    await stitch([{label: 'before tap', b64: before.toString('base64')}, {label: 'after tapping the hot odds (slider is ~2700px below)', b64: after.toString('base64')}], `${out}/strip-tree-large-slider-offscreen.png`, 560);
    await ctx.close();
  }
  /* 4. Paths: select a question on Question lens (desktop) — where does the detail appear? */
  {
    const {ctx, page} = await newPage(browser, 'desktop');
    await openTool(page, server.base, 'paths');
    await page.locator('[data-paths-view="question"]').click(); await waitQuiet(page, {quiet: 500});
    const p = await pointOn(page, '#preview [data-select-decision]', {nth: 1, resolve: '[data-select-decision]'});
    await sleep(300);
    const frames = await grab(page, () => page.mouse.click(p.x, p.y), {n: 4, clip: deskClip});
    await stitch(frames, `${out}/strip-paths-question-select.png`);
    await ctx.close();
  }
}finally{
  await browser.close();
  server.stop();
}
