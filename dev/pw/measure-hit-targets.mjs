/* Provenance for the mobile tap-target gate: min hit dimension (px) per
   data-edit kind, at iPhone-13 width, for the tools passed on argv (default:
   the DSL edit-surface tools). Run from dev/pw with the tools server on :8087.
   Usage: node measure-hit-targets.mjs [roadmap map tree why wardley timeline] */
import {chromium, devices} from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8087';
const CHIP = {
  roadmap: 'Habit app roadmap', map: 'Assumption map', tree: 'Bid or no bid',
  why: 'Habit retention', wardley: 'Habitat platform', timeline: 'App launch programme',
};
const tools = process.argv.slice(2).length ? process.argv.slice(2) : ['roadmap', 'map', 'tree', 'why'];

const b = await chromium.launch();
for(const t of tools){
  const ctx = await b.newContext({...devices['iPhone 13']});
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + t + '/', {waitUntil: 'networkidle'}).catch(() => {});
  await p.waitForTimeout(400);
  const chip = p.getByRole('button', {name: CHIP[t]});
  if(await chip.count()) await chip.click();
  await p.waitForTimeout(600);
  const sizes = await p.evaluate(() => {
    const out = {};
    for(const el of document.querySelectorAll('#preview svg [data-edit]')){
      if(el.getBoundingClientRect().width === 0) continue;     // not visible
      const k = el.getAttribute('data-edit');
      const r = el.getBoundingClientRect();
      const min = Math.round(Math.min(r.width, r.height));
      if(!(k in out) || min < out[k]) out[k] = min;
    }
    return out;
  });
  const bad = Object.entries(sizes).filter(([, v]) => v < 44).map(([k, v]) => k + ' ' + v);
  console.log(t.padEnd(9), '<44:', bad.length ? bad.join(', ') : 'none', '|', JSON.stringify(sizes));
  await ctx.close();
}
await b.close();
