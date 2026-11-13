/* Inventory: every visible interactive control on Roadmap and Timeline at phone and
   desktop, with its box, whether it is under 44px, and screenshots of the landing
   state. Usage: node dev/feel-audit/inventory.mjs [outDir] */
import {chromium, startServer, newPage, openTool, shot} from './lib.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';

const out = process.argv[2] || process.env.FEEL_OUT || '/tmp/feel-audit';
mkdirSync(out + '/shots', {recursive: true});
const server = await startServer();
const browser = await chromium.launch();
const report = {};
try{
  for(const tool of ['roadmap', 'timeline']) for(const kind of ['desktop', 'phone']){
    const {ctx, page, errors} = await newPage(browser, kind, {reducedMotion: 'reduce'});
    await openTool(page, server.base, tool);
    await shot(page, `${out}/shots/inventory-${tool}-${kind}.png`, {fullPage: true});
    report[tool + '/' + kind] = await page.evaluate(() => {
      const sel = 'button, a[href], select, input, textarea, summary, [tabindex], [data-edit], [data-style], [data-whatif], [data-lens], [data-inspect], [role="button"]';
      const seen = new Set();
      return [...document.querySelectorAll(sel)].filter(el => {
        if(seen.has(el)) return false; seen.add(el);
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      }).map(el => {
        const r = el.getBoundingClientRect();
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.dataset.edit || '').trim().replace(/\s+/g, ' ').slice(0, 50);
        return {tag: el.tagName.toLowerCase(), id: el.id || '', edit: el.dataset.edit || '', name,
          w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y + scrollY), small: Math.min(r.width, r.height) < 44};
      });
    });
    report[tool + '/' + kind + ':errors'] = errors;
    await ctx.close();
  }
}finally{
  await browser.close();
  server.stop();
}
writeFileSync(out + '/inventory-controls.json', JSON.stringify(report, null, 1));
for(const [k, v] of Object.entries(report)) if(Array.isArray(v) && !k.endsWith(':errors')){
  const kinds = {};
  for(const c of v){ const key = c.edit ? 'edit:' + c.edit : c.tag + (c.id ? '#' + c.id : ''); kinds[key] = kinds[key] || {n: 0, small: 0, min: 1e9}; kinds[key].n++; if(c.small) kinds[key].small++; kinds[key].min = Math.min(kinds[key].min, Math.min(c.w, c.h)); }
  console.log('\n== ' + k + ' (' + v.length + ' controls)');
  for(const [key, s] of Object.entries(kinds)) console.log('  ' + key.padEnd(34) + ' n=' + s.n + ' small=' + s.small + ' minSide=' + s.min);
}
