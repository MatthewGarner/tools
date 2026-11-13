// Bit-identity fingerprint for the three Energy engines (Merit Order, Intraday, Frequency).
// Run against two checkouts and diff:  node dev/engine-audit/fingerprint.mjs <repo-root>
// Hashes full-precision JSON of every figure over a wide sweep. Verdict TEXT is hashed separately
// (with the allowed Intraday wording change folded back) so a copy edit cannot hide a figure change.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const root = resolve(process.argv[2] || '.');
const load = rel => import(pathToFileURL(resolve(root, rel)).href);
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const out = {};

{ // Merit Order: every world x condition x whole-GW demand
  const {dispatch} = await load('energy/merit-order/engine.js');
  const {buildStack} = await load('energy/merit-order/stack.js');
  const {WORLDS, paramsFor} = await load('energy/merit-order/scenarios.js');
  const R = await load('energy/merit-order/render.js');
  const figs = [], texts = [];
  for(const wk of Object.keys(WORLDS)) for(const ck of [null, 'windy', 'coldPeak', 'gasSpike', 'negative']){
    const p = paramsFor(wk, ck), gens = buildStack(p, WORLDS[wk].catalogue);
    figs.push([wk, ck, gens]);
    for(let d = 0; d <= WORLDS[wk].params.demandMax; d++){
      const r = dispatch(gens, d);
      figs.push([wk, ck, d, r.clearingPrice, r.marginalName, r.unmet, r.totalRent, r.perPlant]);
      texts.push(R.buildVerdict(r, {demand: d, wind: p.wind}), R.outcomeLine(r, {demand: d}), R.toMarkdown({generators: gens, demand: d}, r));
    }
  }
  out['merit-order figures'] = sha(figs);
  out['merit-order verdict/outcome/markdown text'] = sha(texts);
}

{ // Intraday: the EARLIER default day (trough 22, peak 44, solar 6 GW) held by name, fleets 0..12 x durations
  const D = await load('energy/intraday/day.js');
  const OLD_DAY = {...D.DAY_DEFAULTS, trough: 22, peak: 44, solarPeak: 6};
  const V = await load('energy/intraday/render-day.js');
  const figs = [], texts = [];
  for(const fleetH of [1, 2, 4, 6]) for(let g = 0; g <= 12; g += 0.5){
    const p = {...OLD_DAY, fleetGW: g, fleetH}, r = D.runDay(p);
    figs.push([g, fleetH, r.raw.prices, r.flat.prices, r.sched, r.plannedMargin, r.achievedMargin, r.dischargedGWh, r.droppedGWh, r.book]);
    const parts = V.buildDayVerdictParts(r, p);
    figs.push(parts.fig);
    texts.push(parts.line.replace(' and one cycle a day it keeps', ' it keeps'));
  }
  out['intraday figures'] = sha(figs);
  out['intraday verdict text (one-cycle wording folded back)'] = sha(texts);
}

{ // Frequency: full traces over a control grid
  const {simulate, verdict} = await load('energy/frequency/engine.js');
  const {paramsFromControls} = await load('energy/frequency/state.js');
  const figs = [], texts = [];
  for(const inertia of [40, 90, 150, 300]) for(const trip of [0.2, 0.9, 1.8]) for(const gfm of [0, 20, 40]) for(const dc of [0, 1.5, 4.5]){
    const p = paramsFromControls({inertia, trip, dr: 0.5, dm: 0.5, dc, gfm}), r = simulate(p);
    figs.push([inertia, trip, gfm, dc, r.f, r.t, r.nadir, r.rocof, r.settle, r.shedTotal, r.shed]);
    texts.push(verdict(r, p));
  }
  out['frequency figures'] = sha(figs);
  out['frequency verdict text'] = sha(texts);
}

for(const [k, v] of Object.entries(out)) console.log(v, k);
