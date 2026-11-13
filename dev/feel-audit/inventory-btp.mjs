/* Inventory: every visible interactive control on Bets, Tree and Paths at phone and
   desktop, grouped by kind, with how many are under 44px and the smallest side, plus
   full-page screenshots of the landing state (reduced motion, light).
   Usage: node dev/feel-audit/inventory-btp.mjs [outDir] */
import {chromium, startServer, newPage, openTool, shot} from './lib.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';

const out = process.argv[2] || process.env.FEEL_OUT || '/tmp/feel-audit';
mkdirSync(out + '/shots', {recursive: true});
const server = await startServer();
const browser = await chromium.launch();
const report = {};
try{
  for(const tool of ['bets', 'tree', 'paths']) for(const kind of ['desktop', 'phone']) for(const scheme of ['light', 'dark']){
    const {ctx, page, errors} = await newPage(browser, kind, {reducedMotion: 'reduce', colorScheme: scheme});
    await openTool(page, server.base, tool);
    await shot(page, `${out}/shots/inventory-${tool}-${kind}-${scheme}.png`, {fullPage: true});
    if(scheme === 'dark'){ await ctx.close(); continue; }
    report[tool + '/' + kind] = await page.evaluate(() => {
      const sel = 'button, a[href], select, input, textarea, summary, [tabindex], [data-edit], [role="button"], [data-select-decision]';
      const seen = new Set(), kinds = {};
      for(const el of document.querySelectorAll(sel)){
        if(seen.has(el)) continue; seen.add(el);
        const r = el.getBoundingClientRect();
        if(!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if(el.closest('.mg-footer, .about, .syntax, .mg-masthead')) continue;
        const key = el.dataset.edit ? 'edit:' + el.dataset.edit
          : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.dataset.pathsView ? '[' + el.dataset.pathsView + ']' : '')
            + (el.hasAttribute('data-select-decision') ? '[select-decision]' : '') + (el.dataset.view ? '[' + el.dataset.view + ']' : '');
        const k = kinds[key] = kinds[key] || {n: 0, small: 0, min: 1e9, ex: ''};
        k.n++;
        if(Math.min(r.width, r.height) < 44) k.small++;
        k.min = Math.min(k.min, Math.round(Math.min(r.width, r.height)));
        k.ex = k.ex || (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      }
      return kinds;
    });
    report[tool + '/' + kind + ':errors'] = errors;
    await ctx.close();
  }
}finally{
  await browser.close();
  server.stop();
}
writeFileSync(out + '/inventory-controls.json', JSON.stringify(report, null, 1));
for(const [k, v] of Object.entries(report)){
  if(k.endsWith(':errors')){ if(v.length) console.log('  ERRORS ' + k + ' ' + JSON.stringify(v)); continue; }
  console.log('\n== ' + k);
  for(const [key, s] of Object.entries(v)) console.log('  ' + key.padEnd(40) + ' n=' + s.n + ' small=' + s.small + ' minSide=' + s.min + '  "' + s.ex + '"');
}
