/* Does the same document give the same export every time? Opens a stress document in fresh pages and takes Download SVG
   several times, then compares the bytes (and says where the first difference is).
     node dev/export-audit-instruments/determinism.mjs [--tool bets] [--doc e-awkward] [--view board] */
import {join} from 'node:path';
import {readFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {arg, boot, newContext, loadDocs, CANVAS_SPY} from './lib.mjs';
import {clickDownload, openMenus} from './lib.mjs';
import {TOOLS} from './tools.mjs';

const tool = arg('tool', 'bets'), view = arg('view', 'board'), docName = arg('doc', 'e-awkward');
const doc = loadDocs(tool).find(d => d.name.includes(docName));
const T = TOOLS[tool], dir = mkdtempSync(join(tmpdir(), 'determinism-'));
const env = await boot();
const taken = [];
try{
  for(let run = 0; run < 4; run++){
    const ctx = await newContext(env.browser, env.srv.base, 'light');
    if(process.argv.includes('--spy')) await ctx.addInitScript(CANVAS_SPY);
    const page = await ctx.newPage();
    await page.goto(env.srv.base + T.path + '#' + T.hash(doc), {waitUntil: 'load'});
    await T.ready(page);
    await T.select(page, view);
    if(process.argv.includes('--shot')){ await page.locator('#preview').screenshot({path: join(dir, 'live.png')}); await page.screenshot({path: join(dir, 'page.png'), fullPage: true}); }
    for(let again = 0; again < 2; again++){
      await openMenus(page);
      const file = join(dir, `r${run}-${again}.svg`);
      const r = await clickDownload(page, '#dlsvg', file);
      taken.push({run, again, ok: r.ok, svg: r.ok ? readFileSync(file, 'utf8') : null});
    }
    await ctx.close();
  }
}finally{ await env.close(); }
const first = taken[0].svg;
for(const t of taken){
  const same = t.svg === first;
  let at = -1; if(!same && t.svg) for(at = 0; at < Math.min(t.svg.length, first.length) && t.svg[at] === first[at]; at++);
  console.log(`run ${t.run} take ${t.again} [${(t.svg || '').match(/viewBox="[^"]*"/)?.[0]}]: ${t.ok ? (same ? 'same' : 'DIFFERS at ' + at + ' (' + t.svg.length + ' vs ' + first.length + ' bytes)') : 'no export'}`);
}
