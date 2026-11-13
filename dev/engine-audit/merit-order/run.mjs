// Merit Order audit harness.  Run:  node dev/engine-audit/merit-order/run.mjs
// kind 'pass'   = independent evidence that the engine is right (should PASS)
// kind 'defect' = confirmed defect; the check asserts the CORRECT behaviour so it FAILS today
import {makeRunner, rng} from './lib.mjs';
import {dispatch} from '../../../energy/merit-order/engine.js';
import {buildStack, applyAdv, editAdv, srmc, gasLHV, ccsBid, storageBid} from '../../../energy/merit-order/stack.js';
import {WORLDS, CONDITIONS, DEFAULT_PARAMS, paramsFor, conditionNote} from '../../../energy/merit-order/scenarios.js';
import {buildVerdict, toMarkdown, outcomeLine, receiptLines} from '../../../energy/merit-order/render.js';
import {encodeStateV2, decodeStateV2} from '../../../energy/merit-order/state.js';

const R = makeRunner('merit-order');
const G = (name, capacity, cost, extra = {}) => ({name, capacity, cost, carbon: 0, mustRun: false, ...extra});

/* ---------- 1. hand-computed cases ----------
   A 10 GW @ £10, B 10 GW @ £30, C 10 GW @ £80. */
const abc = () => [G('C', 10, 80), G('A', 10, 10), G('B', 10, 30)];   // deliberately unsorted input
{
  const r = dispatch(abc(), 15);
  // cheapest-first: A fills 10, B 5 of 10. B marginal, price 30. Rent A = (30-10)*10 = 200 (GW x £/MWh), B,C 0.
  R.eq('H1', 'pass', 'price at demand 15', r.clearingPrice, 30);
  R.eq('H1', 'pass', 'marginal at demand 15', r.marginalName, 'B');
  R.eq('H1', 'pass', 'dispatch A,B,C', [r.perPlant.A.dispatchedMW, r.perPlant.B.dispatchedMW, r.perPlant.C.dispatchedMW], [10, 5, 0]);
  R.eq('H1', 'pass', 'rent A / total', [r.perPlant.A.rent, r.totalRent], [200, 200]);
  R.eq('H1', 'pass', 'stranded B', r.perPlant.B.strandedMW, 5);
}
{ // exact step boundary: demand == A's capacity. Supply exactly meets demand with A alone -> A marginal, £10.
  const r = dispatch(abc(), 10);
  R.eq('H2', 'pass', 'boundary demand 10 -> A marginal (lower step)', [r.marginalName, r.clearingPrice], ['A', 10]);
  const r2 = dispatch(abc(), 10.000001);
  R.eq('H2', 'pass', 'just above boundary -> B', r2.marginalName, 'B');
}
{ const r = dispatch(abc(), 0);
  R.eq('H3', 'pass', 'zero demand: no marginal, price 0, nothing dispatched', [r.marginalName, r.clearingPrice, r.totalRent], [null, 0, 0]);
  const rn = dispatch(abc(), -7);
  R.eq('H3', 'pass', 'negative demand clamps to zero', [rn.marginalName, rn.clearingPrice, rn.unmet], [null, 0, 0]);
}
{ const r = dispatch(abc(), 35);
  R.eq('H4', 'pass', 'over capacity: unmet 5', r.unmet, 5);
  R.eq('H4', 'pass', 'over capacity: priciest plant named', [r.marginalName, r.clearingPrice], ['C', 80]);
  R.eq('H4', 'pass', 'over capacity: rent A=70*10, B=50*10', [r.perPlant.A.rent, r.perPlant.B.rent], [700, 500]);
}
{ const r = dispatch([], 5);
  R.eq('H5', 'pass', 'empty stack: no marginal, unmet = demand', [r.marginalName, r.clearingPrice, r.unmet], [null, 0, 5]);
  const z = dispatch([G('Z', 0, 5), G('Y', 0, 9)], 3);
  R.eq('H5', 'pass', 'all zero capacity: unmet 3, no marginal', [z.marginalName, z.unmet], [null, 3]);
  const one = dispatch([G('Solo', 4, 12)], 3);
  R.eq('H5', 'pass', 'single plant', [one.marginalName, one.clearingPrice, one.perPlant.Solo.dispatchedMW], ['Solo', 12, 3]);
}
{ // negative price: must-run wind 5 GW @ -30, gas 10 @ 60, demand 3 -> wind marginal at -30, rent 0
  const r = dispatch([G('Gas', 10, 60), G('Wind', 5, -30, {mustRun: true})], 3);
  R.eq('H6', 'pass', 'negative clearing price', [r.marginalName, r.clearingPrice, r.perPlant.Wind.dispatchedMW, r.perPlant.Wind.strandedMW], ['Wind', -30, 3, 2]);
  const r2 = dispatch([G('Gas', 10, 60), G('Wind', 5, -30), G('Nuc', 4, 5)], 7);
  // wind 5 (-30), nuc 2 of 4 (5): price 5; wind rent = 35*5 = 175
  R.eq('H6', 'pass', 'wind rent below nuclear price', r2.perPlant.Wind.rent, 175);
}
{ // tie: input order decides WHICH tied plant is marginal but not price/total dispatch
  const a = dispatch([G('T1', 5, 20), G('T2', 5, 20), G('H', 5, 90)], 7);
  const b = dispatch([G('T2', 5, 20), G('T1', 5, 20), G('H', 5, 90)], 7);
  R.eq('H7', 'pass', 'tie: price identical either order', [a.clearingPrice, b.clearingPrice], [20, 20]);
  R.info('Q-TIE', 'tied plants: the marginal NAME depends on input order (stated in a comment; same price)', `${a.marginalName} vs ${b.marginalName}`);
}

/* ---------- 2. invariants + slow reference over a seeded sweep ---------- */
function reference(gens, demand){      // slow, obviously-correct: unit-by-unit GW fill in (cost, input index) order
  const d = Math.max(0, demand);
  const idx = gens.map((g, i) => i).sort((i, j) => gens[i].cost - gens[j].cost || i - j);
  let remaining = d; const disp = {}; let price = 0, marg = null;
  for(const i of idx){
    const take = Math.min(gens[i].capacity, remaining);
    disp[gens[i].name] = take; remaining -= take; if(remaining < 1e-9) remaining = 0;   // tolerate float residue at exact boundaries
    if(take > 1e-9){ price = gens[i].cost; marg = gens[i].name; }
  }
  const total = gens.reduce((s, g) => s + g.capacity, 0);
  return {disp, price, marg, unmet: Math.max(0, d - total)};
}
{
  const rnd = rng(20261112);
  let bad = {price: 0, name: 0, disp: 0, bounds: 0, order: 0, sum: 0, rent: 0, shuffle: 0, round: 0}, n = 0;
  for(let t = 0; t < 600; t++){
    const k = 1 + Math.floor(rnd() * 12);
    const gens = [];
    for(let i = 0; i < k; i++){
      const cap = rnd() < 0.15 ? 0 : Math.round(rnd() * 200) / 10;
      const cost = rnd() < 0.3 ? [-30, 0, 5, 20, 60, 80][Math.floor(rnd() * 6)] : Math.round((rnd() * 300 - 40) * 10) / 10;
      gens.push(G('P' + i, cap, cost));
    }
    const total = gens.reduce((s, g) => s + g.capacity, 0);
    const demands = [0, total, total + 3, rnd() * total * 1.2, Math.round(rnd() * total)];
    let acc = 0; for(const g of [...gens].sort((a, b) => a.cost - b.cost)){ acc += g.capacity; demands.push(acc); }   // exact boundaries
    const nInterior = 5;
    for(const [di, d] of demands.entries()){
      n++;
      const r = dispatch(gens, d), ref = reference(gens, d);
      if(Math.abs(r.clearingPrice - ref.price) > 1e-9) bad.price++;
      if(r.marginalName !== ref.marg && !(ref.unmet > 0)) bad.name++;
      for(const g of gens){ const pp = r.perPlant[g.name]; if(Math.abs(pp.dispatchedMW - ref.disp[g.name]) > 1e-9) { bad.disp++; break; } }
      for(const g of gens){ const pp = r.perPlant[g.name]; if(pp.dispatchedMW < 0 || pp.dispatchedMW > g.capacity + 1e-12 || Math.abs(pp.dispatchedMW + pp.strandedMW - g.capacity) > 1e-9){ bad.bounds++; break; } }
      // no cheaper plant idle while a dearer one runs
      for(const a of gens) for(const b of gens) if(a.cost < b.cost && a.capacity > 0 && r.perPlant[b.name].dispatchedMW > 1e-12 && r.perPlant[a.name].strandedMW > 1e-12){ bad.order++; }
      const sum = Object.values(r.perPlant).reduce((s, p) => s + p.dispatchedMW, 0);
      if(Math.abs(sum - (Math.max(0, d) - r.unmet)) > 1e-9) bad.sum++;
      const rent = gens.reduce((s, g) => s + Math.max(0, r.clearingPrice - g.cost) * r.perPlant[g.name].dispatchedMW, 0);
      if(Math.abs(rent - r.totalRent) > 1e-6) bad.rent++;
      // order independence (price and total rent) under a seeded shuffle
      const sh = [...gens]; for(let i = sh.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
      const r2 = dispatch(sh, d);
      if(di >= 2 && di < nInterior && (Math.abs(r2.clearingPrice - r.clearingPrice) > 1e-9 || Math.abs(r2.totalRent - r.totalRent) > 1e-6 || Math.abs(r2.unmet - r.unmet) > 1e-9)) bad.shuffle++;
    }
  }
  R.check('SW1', 'pass', `engine vs unit-by-unit reference: clearing price (${n} cases)`, bad.price === 0, `mismatches=${bad.price}`);
  R.check('SW1', 'pass', 'marginal name matches reference (not over-capacity)', bad.name === 0, `mismatches=${bad.name}`);
  R.check('SW1', 'pass', 'per-plant dispatch matches reference', bad.disp === 0, `mismatches=${bad.disp}`);
  R.check('SW1', 'pass', '0 <= dispatched <= capacity; dispatched+stranded = capacity', bad.bounds === 0, `viol=${bad.bounds}`);
  R.check('SW1', 'pass', 'no cheaper plant stranded while dearer runs', bad.order === 0, `viol=${bad.order}`);
  R.check('SW1', 'pass', 'sum dispatched = demand - unmet', bad.sum === 0, `viol=${bad.sum}`);
  R.check('SW1', 'pass', 'rent identity sum((price-cost)+ * dispatched)', bad.rent === 0, `viol=${bad.rent}`);
  R.check('SW1', 'pass', 'price/rent/unmet independent of input order', bad.shuffle === 0, `viol=${bad.shuffle}`);
}

{ // boundary tolerance: demand 4e-15 either side of a step dispatches as the step does (random stacks, every step)
  const rnd2 = rng(99); let bad = 0, n = 0;
  for(let t = 0; t < 300; t++){
    const gens = Array.from({length: 1 + Math.floor(rnd2() * 10)}, (_, i) => G('Q' + i, Math.round(rnd2() * 200) / 10, Math.round(rnd2() * 300 - 40)));
    let acc = 0;
    for(const g of [...gens].sort((a, b) => a.cost - b.cost)){ acc += g.capacity;
      const on = dispatch(gens, acc);
      for(const d of [acc + 4e-15, acc - 4e-15]){ n++; const r = dispatch(gens, d); if(r.clearingPrice !== on.clearingPrice || r.marginalName !== on.marginalName || r.unmet !== on.unmet) bad++; } }
  }
  R.check('B1', 'pass', `demand within float noise of a step prices and dispatches as the step does (${n} probes)`, bad === 0, `viol=${bad}`);
}

/* ---------- 3. pricing formulae (stack.js) ---------- */
{
  // CCGT 60%, gas 100p/th, carbon £50, VOM 3. Hand: 100p/th = £1/th; 1 th = 0.0293071 MWh (GCV) -> £34.1215/MWh GCV;
  // x1.108 -> £37.8065/MWh LHV. fuel/eff = 63.011; carbon 50*0.202/0.6 = 16.833; +3 => 82.844
  R.eq('P1', 'pass', 'gasLHV(100p/th) hand value', gasLHV(100), 1 / 0.0293071 * 1.108, 1e-9);
  R.eq('P1', 'pass', 'srmc CCGT60 hand value', srmc(0.6, 100, 50, 3), 37.80653834736293 / 0.6 + 10.1 / 0.6 + 3, 1e-9);
  R.eq('P2', 'pass', 'storage bid = charge / rte (40/0.85)', storageBid(40, 0.85), 47.0588235294, 1e-6);
  // CCS crossover claims in stack.js comment (gas 100): 49% at ~£29/t, 54% at ~£53/t, 60% at ~£83/t
  const cross = e => { const f = c => srmc(e, 100, c, 3) - ccsBid(100, c); const c0 = f(0), c1 = f(100); return -c0 / ((c1 - c0) / 100); };
  R.check('P3', 'pass', 'CCS crossover claims (~29/53/83 £/t) hold', Math.abs(cross(.49) - 29) < 1 && Math.abs(cross(.54) - 53) < 1 && Math.abs(cross(.6) - 83) < 1, [cross(.49), cross(.54), cross(.6)].map(x => x.toFixed(1)).join('/'));
  // monotonicity: raising gas or carbon price never lowers any gas plant's bid
  let mono = true; for(const e of [.36, .42, .49, .54, .6]) for(let g = 20; g < 300; g += 20) for(let c = 20; c < 100; c += 20) if(srmc(e, g + 20, c, 3) < srmc(e, g, c, 3) || srmc(e, g, c + 20, 3) < srmc(e, g, c, 3)) mono = false;
  R.check('P4', 'pass', 'SRMC monotone in gas and carbon', mono);
  // all names unique in every world; band shares sum to 1; no capacity leaks (sum of installed = sum of stack capacities at 100% avail)
  let uniq = true, shares = true, capOK = true;
  for(const [k, W] of Object.entries(WORLDS)){
    const p = {...W.params, wind: 1, solar: 1, storageAvail: 1, imports: 1e9};
    try { const s = buildStack(p, W.catalogue); const inst = W.catalogue.reduce((a, t) => a + t.installed, 0);
      if(Math.abs(s.reduce((a, g) => a + g.capacity, 0) - inst) > 1e-9) capOK = false; } catch(e){ uniq = false; }
    for(const t of W.catalogue) if(t.bid.kind === 'gas' && Math.abs(t.bid.bands.reduce((a, b) => a + b.share, 0) - 1) > 1e-12) shares = false;
  }
  R.check('P5', 'pass', 'unique names; band shares=1; full stack capacity = installed in every world', uniq && shares && capOK);
}

/* ---------- 4. built-in worlds x conditions: do the stated headlines hold? ---------- */
{
  const clear = (w, c) => { const p = paramsFor(w, c); return {p, r: dispatch(buildStack(p, WORLDS[w].catalogue), p.demand)}; };
  let allMet = true; for(const w of Object.keys(WORLDS)) for(const c of [null, ...Object.keys(CONDITIONS)]) if(clear(w, c).r.unmet > 0) allMet = false;
  R.check('S1', 'pass', 'no built-in world/condition leaves demand unmet', allMet);
  const neg = clear('gbToday', 'negative');
  R.eq('S2', 'pass', 'Negative prices preset: marginal Wind at -£30', [neg.r.marginalName, neg.r.clearingPrice], ['Wind', -30]);
  const cp = clear('ht', 'coldPeak');
  R.eq('S3', 'pass', 'FES HT cold peak: hydrogen sets £200', [cp.r.marginalName, cp.r.clearingPrice], ['Hydrogen', 200]);
  // page copy: "Gas spike" is one of the Conditions chips on every world
  let silent = 0, explained = 0;
  for(const w of Object.keys(WORLDS)){ const a = clear(w, null).r, b = clear(w, 'gasSpike').r;
    if(Math.abs(a.clearingPrice - b.clearingPrice) < 1e-9){ silent++; if(/gas is not setting the price/.test(conditionNote(w, 'gasSpike'))) explained++; } }
  R.check('F-MO-6', 'pass', 'where Gas spike leaves the price unchanged (3 of 5 worlds), the outcome line says why', silent === 3 && explained === silent, `unchanged in ${silent} worlds, explained in ${explained}`);
}

/* ---------- 5. presentation vs engine ---------- */
{ // F-MO-1: rent unit.  Rent = (£/MWh) x GW. A GW is 1000 MW, so the true figure is x1000 £/h; the table/callout label it "£/h".
  const gens = [G('A', 10, 10), G('B', 10, 30)];
  const st = {generators: gens, demand: 15}, r = dispatch(gens, 15);
  const md = toMarkdown(st, r);
  const row = md.split('\n').find(l => l.startsWith('| A '));
  const cell = row.split('|')[5].trim();
  R.check('F-MO-1', 'pass', 'Markdown rent for A (10 GW earning £20/MWh above running cost) prints as £200k/h (= 20 x 10,000 MW = £200,000/h)', cell === '£200k/h', `printed cell=${cell}`);
}
{ // F-MO-2: advanced-editor freeze.  app.js advOf()/capacity stepper copy BOTH [cap,cost] into state.adv at edit time.
  const W = WORLDS.gbToday, p = {...W.params};
  const base = () => buildStack(p, W.catalogue);
  const adv = {}; const name = 'CCGT 60%';
  const g0 = base().find(g => g.name === name);
  Object.assign(adv, editAdv(adv, name, 'capacity', g0.capacity + 1));   // what app.js does on "Capacity +"
  const after = {...p, gas: 250};
  const live = applyAdv(buildStack(after, W.catalogue), adv).find(g => g.name === name);
  const fresh = buildStack(after, W.catalogue).find(g => g.name === name);
  R.check('F-MO-2', 'pass', 'after a Capacity edit, the plant still follows the gas-price slider', Math.abs(live.cost - fresh.cost) < 1e-9, `gas 250: plant bids ${live.cost.toFixed(1)} (frozen at gas=100), unedited would bid ${fresh.cost.toFixed(1)}`);
  const w0 = base().find(g => g.name === 'Wind'); Object.assign(adv, editAdv(adv, 'Wind', 'cost', w0.cost + 5));
  const lw = applyAdv(buildStack({...p, wind: 0.8}, W.catalogue), adv).find(g => g.name === 'Wind');
  R.check('F-MO-2b', 'pass', 'after a Bid edit on Wind, the wind-availability slider still scales its capacity', Math.abs(lw.capacity - 32 * 0.8) < 1e-9, `wind 80% offers ${lw.capacity.toFixed(2)} GW (expected ${(32*0.8).toFixed(1)})`);
}
{ // F-MO-3: hydrogen / CCS sentence asserts wind has dropped regardless of wind
  const W = WORLDS.ht, p = {...W.params, demand: 74, wind: 0.5, gas: 20, carbon: 100, solar: 0};
  const r = dispatch(buildStack(p, W.catalogue), p.demand);
  const v = buildVerdict(r, {demand: p.demand, wind: p.wind});
  R.check('F-MO-3', 'pass', 'verdict does not say "wind has dropped" when wind availability is 50%', !/wind has dropped/.test(v), `marginal=${r.marginalName} @ gas 20p carbon £100 wind 50%`);
}
{ // F-MO-4: "0 GW of demand goes unmet" when unmet > 0
  const W = WORLDS.ht, p = {...W.params, demand: 70, wind: 0.05, gas: 20, carbon: 20, solar: 0};
  const r = dispatch(buildStack(p, W.catalogue), p.demand);
  const v = buildVerdict(r, {demand: p.demand, wind: p.wind});
  R.check('F-MO-4', 'pass', 'unmet shortfall is never printed as "0 GW"', !/\b0 GW of demand goes unmet/.test(v) || r.unmet === 0, `unmet=${r.unmet.toFixed(3)} text="${v.match(/[\d.]+ (GW|MW)[^.]*unmet/)?.[0]}"`);
}
{ // F-MO-5 (ruled): unmet demand does not present the dearest offer as a clearing price
  const gens = abc(); const r = dispatch(gens, 35);
  const v = buildVerdict(r, {generators: gens, demand: 35});
  R.check('F-MO-5', 'pass', 'over-capacity verdict says no price clears, names the last offer and the unmet volume', /^No price clears: 35 GW of demand is more than the 30 GW offered\. The last offer is C at £80\/MWh, and 5 GW goes unmet\./.test(v), v.slice(0, 140));
}
{ // F-MO-5b (second ruling): no price clears, so no rent
  const gens = abc(); const r = dispatch(gens, 35), st = {generators: gens, demand: 35};
  const md = toMarkdown(st, r), v = buildVerdict(r, st);
  R.check('F-MO-5b', 'pass', 'unmet demand: no rent sentence, and the Markdown rent cells say "no price clears"', !/Shaded plants earn/.test(v) && /no price clears \|/.test(md) && !/k\/h/.test(md), md.split('\n')[2]);
}
{ // F-MO-7 (ruled)
  const d = decodeStateV2(encodeStateV2({world: 'gbToday', condition: null, params: {demand: 'abc', wind: -5, gas: 1e9}}));
  R.check('F-MO-7', 'pass', 'a shared URL cannot inject non-numeric / out-of-range params: bad values drop to the default, numbers clamp', !('demand' in d.params) && d.params.wind === 0 && d.params.gas === 300, JSON.stringify(d.params));
}
{ // F-MO-9 (ruled: keep 5 GW, correct the comment, flag to Matt)
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../../energy/merit-order/scenarios.js', import.meta.url), 'utf8');
  R.check('F-MO-9', 'pass', 'scenarios.js no longer claims cold peak "pins imports LOW"; the value is 5 GW', !/pins imports\s+LOW/.test(src) && CONDITIONS.coldPeak.mutate.imports === 5);
  const p = paramsFor('ee', 'coldPeak');
  const at = imp => dispatch(buildStack({...p, imports: imp}, WORLDS.ee.catalogue), p.demand);
  R.info('F-MO-9', 'for Matt: the shipped cold-peak headlines depend on the 5 GW figure', `EE imports 5: ${at(5).marginalName} £${Math.round(at(5).clearingPrice)}; imports 3: ${at(3).marginalName} £${Math.round(at(3).clearingPrice)} unmet ${at(3).unmet.toFixed(2)} GW`);
}
{ // Q-IMP
  const W = WORLDS.fb, off = buildStack(W.params, W.catalogue).find(g => g.name === 'Imports').capacity, inst = W.catalogue.find(t => t.key === 'imports').installed;
  R.info('Q-IMP', 'for Matt: FES worlds offer imports from one hidden parameter', `Falling Behind: ${off} GW offered of ${inst} GW installed`);
}
{ // F-MO-8: demand snapped to a running float sum prints through the formatter
  const W = WORLDS.gbToday, p = {...W.params};
  const gens = buildStack(p, W.catalogue), r = dispatch(gens, p.demand);
  let run = 0; const b = []; for(const g of r.sorted){ run += g.capacity; b.push(run); }   // exactly snapDemand()'s bounds
  const demand = b.find(x => String(x).length > 8);
  const st = {generators: gens, demand}, rr = dispatch(gens, demand);
  const lines = [outcomeLine(rr, st), ...receiptLines(st, {worldLabel: 'GB today', gas: 100, carbon: 50})];
  R.check('F-MO-8', 'pass', 'outcome line and receipt print demand as a tidy number after a snap', lines.every(l => !/\d\.\d{4,}/.test(l)), lines[0]);
}
{ // edge sweep: the engine never yields NaN for what the UI can produce
  let nan = false;
  for(const [k, W] of Object.entries(WORLDS)) for(const d of [0, 1, W.params.demandMax]) for(const mr of [false, true]) {
    const p = {...W.params, demand: d, mustRunOn: mr, mustRunDepth: 50, wind: 1, solar: 1, gas: 300, carbon: 100};
    const r = dispatch(buildStack(p, W.catalogue), d); if(!Number.isFinite(r.clearingPrice) || !Number.isFinite(r.totalRent)) nan = true; }
  R.check('E1', 'pass', 'no NaN/Infinity across extreme slider corners in every world', !nan);
}

R.finish();
