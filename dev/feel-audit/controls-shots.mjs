/* Control-row screenshots of Roadmap and Timeline at both viewports and themes.
   node dev/feel-audit/controls-shots.mjs <outDir> <prefix>   e.g. before / after */
import {chromium, startServer, newPage, openTool} from './lib.mjs';
import {collect} from './controls.mjs';
const [out, prefix] = [process.argv[2], process.argv[3] || 'shot'];
const server = await startServer(), browser = await chromium.launch();
try {
  for (const tool of ['roadmap', 'timeline']) for (const kind of ['desktop', 'phone']) for (const scheme of ['light', 'dark']) {
    const {ctx, page} = await newPage(browser, kind, {colorScheme: scheme, reducedMotion: 'reduce'});
    await openTool(page, server.base, tool);
    await page.mouse.move(1, 1);
    const rows = (await collect(page)).filter(r => r.key !== 'select').sort((a, b) => a.y - b.y);
    const clusters = [];
    for (const r of rows) {
      const c = clusters[clusters.length - 1];
      if (c && r.y - c.end < 120) c.end = Math.max(c.end, r.y + r.h); else clusters.push({start: r.y, end: r.y + r.h});
    }
    let i = 0;
    for (const c of clusters) {
      const vw = page.viewportSize().width;
      await page.screenshot({path: `${out}/${prefix}-${tool}-${kind}-${scheme}-${++i}.png`, fullPage: true, clip: {x: 0, y: Math.max(0, c.start - 14), width: vw, height: c.end - c.start + 28}});
    }
    await ctx.close();
  }
} finally { await browser.close(); server.stop(); }
