/* Frame strips for the visual findings: screenshots taken back to back while an
   interaction runs, stitched into one labelled PNG per interaction.
   node dev/feel-audit/strips.mjs [outDir] */
import {chromium, startServer, newPage, openTool, sleep, waitQuiet, press, hashFor} from './lib.mjs';
import {pointOn} from './scenarios.mjs';
import {mkdirSync} from 'node:fs';

const out = (process.argv[2] || process.env.FEEL_OUT || '/tmp/feel-audit') + '/shots';
mkdirSync(out, {recursive: true});
const server = await startServer();
const browser = await chromium.launch();

async function grab(page, act, {n = 8, clip, scale = 0.5} = {}){
  const t0 = Date.now();
  const frames = [];
  const run = act();
  for(let i = 0; i < n; i++){
    const buf = await page.screenshot({clip, type: 'jpeg', quality: 70, scale: 'css'}).catch(() => null);
    if(buf) frames.push({ms: Date.now() - t0, b64: buf.toString('base64')});
  }
  await run;
  return frames;
}
async function stitch(frames, path, width = 320){
  width = 560;
  const p = await browser.newPage({viewport: {width: 3 * (width + 8) + 8, height: 200}});
  await p.setContent('<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:8px;padding:8px;font:16px sans-serif;color:#fff;align-items:flex-start">' +
    frames.map(f => `<figure style="margin:0;width:${width}px"><figcaption>+${f.ms}ms</figcaption><img style="width:${width}px;display:block" src="data:image/jpeg;base64,${f.b64}"></figure>`).join('') + '</body>');
  await p.screenshot({path, fullPage: true});
  await p.close();
  console.log('wrote', path);
}

try{
  for(const tool of ['roadmap', 'timeline']){
    /* 1. landing: the artefact appears, then the rail collapse animation reflows it */
    {
      const {ctx, page} = await newPage(browser, 'desktop');
      const frames = await grab(page, () => page.goto(server.base + '/' + tool + '/', {waitUntil: 'commit'}), {n: 10, clip: {x: 0, y: 0, width: 1280, height: 800}});
      await stitch(frames, `${out}/strip-${tool}-load-desktop.png`, 300);
      await ctx.close();
    }
    /* 2. opening the source editor */
    {
      const {ctx, page} = await newPage(browser, 'desktop');
      await openTool(page, server.base, tool);
      const opener = page.locator(tool === 'roadmap' ? '#railtab' : '#editsource');
      const frames = await grab(page, () => opener.click(), {n: 8, clip: {x: 0, y: 100, width: 1280, height: 700}});
      await stitch(frames, `${out}/strip-${tool}-rail-open.png`, 300);
      await ctx.close();
    }
    /* 3. a view switch */
    {
      const {ctx, page} = await newPage(browser, 'desktop');
      await openTool(page, server.base, tool);
      const v = tool === 'roadmap' ? 'board' : 'register';
      const frames = await grab(page, () => page.locator(`#stylepicker [data-style="${v}"]`).click(), {n: 6, clip: {x: 0, y: 140, width: 1280, height: 660}});
      await stitch(frames, `${out}/strip-${tool}-view-switch.png`, 300);
      await ctx.close();
    }
  }
  /* 4. timeline: selecting a milestone on desktop (scroll jump + double re-render) */
  {
    const {ctx, page} = await newPage(browser, 'desktop');
    await openTool(page, server.base, 'timeline');
    const p = await pointOn(page, '#preview [data-inspect]', {nth: 2, resolve: '[data-inspect],[data-edit]', prefer: 'left'});
    await sleep(300);
    const frames = await grab(page, () => page.mouse.click(p.x, p.y), {n: 6});
    await stitch(frames, `${out}/strip-timeline-inspector-open.png`, 300);
    await ctx.close();
  }
  /* 5. roadmap drag drop: cards should glide, they jump */
  {
    const {ctx, page} = await newPage(browser, 'desktop');
    await openTool(page, server.base, 'roadmap');
    await page.locator('#stylepicker [data-style="grid"]').click(); await waitQuiet(page);
    const from = await pointOn(page, '#preview g[data-line]', {nth: 0, resolve: 'g[data-line]'});
    const cells = await page.evaluate(() => [...document.querySelectorAll('#preview rect[data-cell]')].map(r => { const b = r.getBoundingClientRect(); return {c: r.dataset.cell, x: b.x + b.width / 2, y: b.y + b.height - 6}; }));
    const to = cells.find(c => c.c.startsWith('2|'));
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    for(let i = 1; i <= 20; i++){ await page.mouse.move(from.x + (to.x - from.x) * i / 20, from.y + (to.y - from.y) * i / 20); await sleep(16); }
    const mid = await page.screenshot({type: 'jpeg', quality: 70});
    const frames = await grab(page, () => page.mouse.up(), {n: 6});
    await stitch([{ms: -1, b64: mid.toString('base64')}, ...frames], `${out}/strip-roadmap-drop.png`, 300);
    await ctx.close();
  }
}finally{
  await browser.close();
  server.stop();
}
