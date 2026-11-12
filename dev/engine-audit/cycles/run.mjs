// Audit harness: energy/cycles. Run: node dev/engine-audit/cycles/run.mjs   (about 60-90 s: includes seed sweeps)
import {readFileSync} from 'node:fs';
import {check, done, rng} from './lib.mjs';
import {parse} from '../../../energy/cycles/parse.js';
import {simulate, simKey, simPolicy, makeBase, above, tauBudget, drawBeliefs, verdict, fmtUnit, bindTenths, N_BASE, DAYS} from '../../../energy/cycles/engine.js';
import {mulberry32, gaussian} from '../../../assets/series.js';

const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const M = t => parse(t);
const HEAD = 'battery: 100MW / 200MWh\nrte: 90\ncalendar: 1\n';
const K = (1 / 0.9 - 1) * 20;           // round-trip penalty k = (1/rte - 1) * charge = 2.2222 £/MWh

// ---------- C1. hand case: identical days, no wear, no rationing ------------------------
// spread 50 every day, charge 20, rte .9 => k=2.2222. fade 0, budget never binds => tau=0, 365 cycles/yr, all days clear.
// revenue_y = Ey * 365*(50-k),  Ey = 200*(1 - 0.01*y)  (calendar only).  SoH after year y = 1 - 0.01*(y+1).
{
  const m = M(HEAD + 'spread: 50\ncharge: 20\nfade: 0\ncycles: 1000000 over 10yr');
  const o = simulate(m, {seed: 3, n: 50});
  let worst = 0, worstS = 0;
  for(let y = 0; y < 10; y++){
    worst = Math.max(worst, Math.abs(o.fan[y].p50 - 200 * (1 - 0.01 * y) * 365 * (50 - K)) / (200 * 365 * 50));
    worstS = Math.max(worstS, Math.abs(o.soh[y].p50 - (1 - 0.01 * (y + 1))));
  }
  check('C1a revenue fan P50 = Ey*365*(spread-k) every year (hand)', worst < 1e-9, `max rel err ${worst.toExponential(1)}`);
  check('C1b SoH after year y = 1-cal*(y+1) (hand)', worstS < 1e-12, `max err ${worstS.toExponential(1)}`);
  check('C1c tau=0, 365 days clear, binding share 0', o.threshold.p50 === 0 && o.threshold.clearingDays === 365 && o.threshold.bindingShare === 0, JSON.stringify(o.threshold));
}
// ---------- C2. hand case: warranty rationing, identical days ----------------------------
// budget 1825 over 10yr => 182.5/yr; all days identical so cap trims; revenue_y = Ey * 182.5*(50-k); tau -> 50-k from below.
{
  const m = M(HEAD + 'spread: 50\ncharge: 20\nfade: 0\ncycles: 1825 over 10yr');
  const o = simulate(m, {seed: 3, n: 50});
  let worst = 0, worstB = 0;
  for(let y = 0; y < 10; y++){
    worst = Math.max(worst, Math.abs(o.fan[y].p50 - 200 * (1 - 0.01 * y) * 182.5 * (50 - K)) / (200 * 182.5 * 50));
    worstB = Math.max(worstB, Math.abs(o.burndown[y] - (1825 - 182.5 * (y + 1))));
  }
  check('C2a revenue = Ey*182.5*(50-k) under a binding warranty (hand)', worst < 1e-9, `max rel err ${worst.toExponential(1)}`);
  check('C2b burn-down = budget - 182.5*(y+1) (hand)', worstB < 1e-9, `max err ${worstB.toExponential(1)}`);
  check('C2c tau ~ 50-k = 47.78 and warranty binds in 10/10', near(o.threshold.p50, 50 - K, 1e-5) && o.threshold.bindingShare === 1, `tau=${o.threshold.p50} want ${50 - K}`);
}
// ---------- C3. hand case: wear-bound, one year ------------------------------------------
// H=1: V0 = 365*(50-k)/(1+d), tau = fade*V0 (fade per cycle as a fraction), d=8% default.
{
  const m = M('battery: 100MW / 200MWh\nrte: 90\ncalendar: 0\nspread: 50\ncharge: 20\nfade: 0.01\ncycles: 1000000 over 1yr');
  const o = simulate(m, {seed: 3, n: 20});
  const want = 1e-4 * 365 * (50 - K) / 1.08;
  check('C3 tau = fade*V0 = 1e-4*365*(50-k)/1.08 (hand)', near(o.threshold.p50, want, 1e-6), `engine ${o.threshold.p50} hand ${want}`);
}
// ---------- C4. augmentation window and "forgone" on a closed-form case -------------------
// spread 50, calendar 2%/yr, fade 0, no budget limit, augment 8 £/kWh = 8000 £/MWh, disc 8%.
// v(ys) = ys*[E0*R*cal*A(H-ys) - E0*cal*aug]/(1+d)^ys with R=365(50-k), A(n)=sum_{j=1..n}(1+d)^-j; engine year = ys+1.
{
  const m = M('battery: 100MW / 200MWh\nrte: 90\ncalendar: 2\nspread: 50\ncharge: 20\nfade: 0\ncycles: 1000000 over 10yr\naugment: 8\ndiscount: 8');
  const o = simulate(m, {seed: 3, n: 20});
  const d = .08, H = 10, R = 365 * (50 - K), E0 = 200, cal = .02, aug = 8000;
  const A = n => { let s = 0; for(let j = 1; j <= n; j++) s += (1 + d) ** -j; return s; };
  let best = 0, by = -1;
  for(let ys = 1; ys < H; ys++){ const v = ys * (E0 * R * cal * A(H - ys) - E0 * cal * aug) / (1 + d) ** ys; if(v > best){ best = v; by = ys; } }
  check('C4a augment window = [ys*+1, ys*+1] from closed-form argmax', o.augment.window && o.augment.window[0] === by + 1 && o.augment.window[1] === by + 1, `engine ${JSON.stringify(o.augment.window)}, hand ys*=${by} => year ${by + 1}`);
  // ruling (spec CYC-1): forgone = v(best) - max(0, v(best+1)), v = the search's own PV net of augmentation cost
  const v = ys => ys * (E0 * R * cal * A(H - ys) - E0 * cal * aug) / (1 + d) ** ys;
  const correct = v(by) - Math.max(0, by + 1 < H ? v(by + 1) : 0);
  check('C4b forgoneP50 = v(best) - max(0, v(best+1)) (ruling, hand)', near(o.augment.forgoneP50, correct, 1e-6), `engine ${o.augment.forgoneP50.toFixed(0)} vs hand ${correct.toFixed(0)}`);
}
{
  let bad = 0, n = 0, rows = [];
  for(const aug of [1, 2, 4, 8]) for(const cal of [1, 2, 3]) for(const dd of [6, 10]){
    const m = M(`battery: 100MW / 200MWh\nrte: 90\ncalendar: ${cal}\nspread: 50\ncharge: 20\nfade: 0\ncycles: 1000000 over 10yr\naugment: ${aug}\ndiscount: ${dd}`);
    const o = simulate(m, {seed: 3, n: 5}); if(!o.augment.window) continue;
    const d = dd / 100, H = 10, R = 365 * (50 - K), E0 = 200, c = cal / 100, a = aug * 1000, by = o.augment.window[0] - 1;
    const A = k => { let t = 0; for(let j = 1; j <= k; j++) t += (1 + d) ** -j; return t; };
    const v = ys => ys * (E0 * R * c * A(H - ys) - E0 * c * a) / (1 + d) ** ys;
    const want = v(by) - Math.max(0, by + 1 < H ? v(by + 1) : 0); n++;
    if(!near(o.augment.forgoneP50, want, 1e-6) || o.augment.forgoneP50 < 0) bad++;
    rows.push(Math.round(o.augment.forgoneP50));
  }
  check('C4c sweep: engine forgone equals the ruling formula and is >= 0 in every closed-form case', bad === 0, `${bad} of ${n} differ; values ${rows.slice(0, 6).join(',')}`);
  const m = M('battery: 100MW / 200MWh\nrte: 90\ncalendar: 2\nspread: 50\ncharge: 20\nfade: 0\ncycles: 1000000 over 10yr\naugment: 8\ndiscount: 8');
  console.log('   info: that case prints: ' + verdict('augment', simulate(m, {seed: 3, n: 5})));
}
// ---------- C5. clever parts vs brute force -----------------------------------------------
{
  const R = rng(77);
  let eAbove = 0, eTau = 0, nTau = 0, worstTau = 0;
  for(let i = 0; i < 300; i++){
    const lo = 10 + R() * 40, hi = lo * (1.3 + R() * 2), sec = R() < .5;
    const m = M(`${HEAD}spread: ${lo.toFixed(1)}..${hi.toFixed(1)}\ncharge: 10..30\n${sec ? 'second: 30..60\n' : ''}fade: 0.01\ncycles: 1000 over 5yr`);
    const base = makeBase(m, 1000 + i);
    const x = lo + R() * (hi - lo);
    const days = [...base.S1.v]; const bf = days.filter(v => v > x);
    const a = above(base.S1, x);
    if(a.count !== bf.length || Math.abs(a.sum - bf.reduce((s, v) => s + v, 0)) > 1e-6 * Math.max(1, a.sum)) eAbove++;
    // tauBudget vs exact: smallest tau with expected cycles <= allowance. cycles(tau)=365*count(day*scale > tau+k)/N
    const scale = 1 + R() * .2, k = R() * 3, allow = 20 + R() * 300;
    const all = sec ? [...base.S1.v, ...base.S2.v] : [...base.S1.v];
    all.sort((p, q) => q - p);                                   // descending
    const maxCount = Math.floor(allow * N_BASE / DAYS + 1e-12);  // count must be <= this
    let exact = 0;
    if(DAYS * all.length / N_BASE * 0 + all.length > maxCount) exact = Math.max(0, all[maxCount] * scale - k);   // tau at the (maxCount+1)th largest
    const got = tauBudget(base, scale, k, allow, sec);
    const err = Math.abs(got - exact); nTau++;
    worstTau = Math.max(worstTau, err);
    if(err > 1e-4 * Math.max(1, exact) + 1e-6){ eTau++; }
  }
  check('C5a above(): count and sum equal brute force (300 random bases)', eAbove === 0, `${eAbove} mismatches`);
  check('C5b tauBudget == exact order-statistic threshold (300 cases, with/without second)', eTau === 0, `${eTau} mismatches, worst abs err ${worstTau.toExponential(2)}`);
}
// ---------- C6. invariants over a seeded random model sweep -------------------------------
{
  const R = rng(4242); let bad = [], thrown = 0, nan = 0, exThrow = null, nsim = 0;
  const u = (a, b) => a + R() * (b - a);
  for(let i = 0; i < 150; i++){
    const lo = u(10, 60), hi = lo * u(1.2, 3), c = u(5, 40), fl = u(0.001, 0.02), H = Math.round(u(3, 25));
    const txt = `${HEAD}spread: ${lo.toFixed(1)}..${hi.toFixed(1)}\ncharge: ${c.toFixed(1)}..${(c * 1.5).toFixed(1)}\nfade: ${fl.toFixed(4)}..${(fl * 2).toFixed(4)}\n` +
      `cycles: ${Math.round(u(300, 9000))} over ${H}yr\ndrift: -5..0\n${R() < .6 ? 'second: 30..60\n' : ''}${R() < .6 ? 'augment: 80..200\n' : ''}discount: 6..10`;
    const m = M(txt);
    let o; try{ o = simulate(m, {seed: i + 1, n: 150}); nsim++; }catch(e){ thrown++; exThrow = exThrow || {txt, msg: e.message}; continue; }
    const tag = s => bad.push(s + ' :: ' + txt.replace(/\n/g, ' | '));
    const t = o.threshold;
    if(!(t.p10 <= t.p50 && t.p50 <= t.p90)) tag('tau quantiles unordered');
    if(!(t.bindingShare >= 0 && t.bindingShare <= 1 && t.clearingDays >= 0 && t.clearingDays <= 365)) tag('share/days out of range');
    for(let y = 0; y < o.H; y++){
      if(!(o.fan[y].p10 <= o.fan[y].p50 + 1e-9 && o.fan[y].p50 <= o.fan[y].p90 + 1e-9)) tag('fan unordered y' + y);
      if(!(o.soh[y].p50 >= 0.1 - 1e-12 && o.soh[y].p50 <= 1 + 1e-12)) tag('soh out of [0.1,1] y' + y);
      if(y && o.soh[y].p50 > o.soh[y - 1].p50 + 1e-12) tag('soh rose y' + y);
      if(o.burndown[y] < -1e-9 || (y && o.burndown[y] > o.burndown[y - 1] + 1e-9)) tag('burndown not monotone/neg y' + y);
    }
    if(o.second && !(o.second.capped >= 0 && o.second.capped <= 1)) tag('capped out of range');
    if(o.augment && o.augment.window && !(o.augment.window[0] <= o.augment.window[1] && o.augment.window[0] >= 2 && o.augment.window[1] <= o.H)) tag('augment window out of range ' + o.augment.window);
    if(JSON.stringify(o).includes('null') && JSON.stringify(o).match(/:null/) && !o.augment) {}
    const flat = [t.p10, t.p50, t.p90, ...o.fan.flatMap(f => [f.p10, f.p50, f.p90])]; if(flat.some(v => !Number.isFinite(v))) nan++;
  }
  check('C6a invariants (quantile order, SoH in [0.1,1] and falling, burn-down falling >=0, windows in range) on 150 random models', bad.length === 0, `${bad.length} violations; first: ${bad[0]}`);
  check('C6b no throw / NaN on plausible random models', thrown === 0 && nan === 0, `${thrown} threw of ${nsim + thrown}, NaN ${nan}; ${exThrow ? JSON.stringify(exThrow) : ''}`);
}
// monotonicity with common random numbers
{
  const f = (budget, fade) => simulate(M(`${HEAD}spread: 35..85\ncharge: 15..45\nfade: ${fade}\ncycles: ${budget} over 15yr\ndrift: -4..0`), {seed: 5, n: 400}).threshold.p50;
  let v1 = 0, v2 = 0, prev = Infinity;
  for(const b of [1500, 3000, 4500, 6000, 9000]){ const t = f(b, 0.009); if(t > prev + 1e-9) v1++; prev = t; }
  prev = -Infinity;
  for(const fd of [0.003, 0.006, 0.009, 0.015, 0.03]){ const t = f(6000, fd); if(t < prev - 1e-9) v2++; prev = t; }
  check('C6c more warranty budget never raises the cycle price', v1 === 0, `${v1} violations`);
  check('C6d more fade never lowers the cycle price', v2 === 0, `${v2} violations`);
}
// ---------- C7. page examples: headline claims hold? and printed rounding -----------------
const appSrc = readFileSync(new URL('../../../energy/cycles/app.js', import.meta.url), 'utf8');
const EX = [...appSrc.matchAll(/\{name: '([^']+)', src:\s*\n`([^`]*)`\}/g)].map(x => ({name: x[1], src: x[2]}));
console.log(`   info: ${EX.length} built-in examples extracted from app.js`);
const outs = {};
for(const ex of EX){
  const m = M(ex.src), o = simulate(m, {seed: 1, n: 5000}); outs[ex.name] = {m, o};
  console.log(`   info: [${ex.name}] ${verdict('threshold', o)}`);
  if(o.second) console.log(`   info:    ${verdict('second', o)}`);
  if(o.augment) console.log(`   info:    ${verdict('augment', o)}`);
}
if(outs['Tight warranty']) check('C7a "Tight warranty" example: the warranty is the price-setter (binding share >= 0.5)', outs['Tight warranty'].o.threshold.bindingShare >= 0.5, `bindingShare ${outs['Tight warranty'].o.threshold.bindingShare}`);
if(outs['Wexcombe base case']) { const t = outs['Wexcombe base case'].o.threshold; check('C7b base case: P10<=P50<=P90 and clearing days <= 365', t.p10 <= t.p50 && t.p50 <= t.p90 && t.clearingDays <= 365); }
{
  // "binds: warranty a/10 . wear b/10" pill and verdict "N runs in 10": do the printed halves add to 10?
  let bad = [], total = 0;
  for(let i = 0; i <= 5000; i++){ const s = i / 5000; total++;
    const [a, b] = bindTenths(s); if(a + b !== 10) bad.push(s); }
  check('C7c pill "warranty a/10 - wear b/10" always sums to 10 (bindTenths)', bad.length === 0, `${bad.length}/${total} shares print a total != 10`);
}
// ---------- C8. worker vs main thread; simKey -------------------------------------------
{
  globalThis.self = {postMessage: msg => { globalThis.__got = msg; }};
  await import('../../../energy/cycles/sim-worker.js');
  const m = outs['Wexcombe base case'].m;
  globalThis.self.onmessage({data: {model: structuredClone(m), seed: 1, n: 300, reqId: 1}});
  const viaWorker = JSON.stringify(globalThis.__got.out), direct = JSON.stringify(simulate(m, {seed: 1, n: 300}));
  check('C8a worker path (structured-clone model) == main-thread simulate, byte-identical', viaWorker === direct);
  const base = 'battery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nrte: 88\nfade: 0.01\ncalendar: 1\ncycles: 6000 over 15yr\ndrift: -4..0';
  const k0 = simKey(M(base)), kv = simKey(M(base + '\nverdict: my own line')), kt = simKey(M('title: x\n' + base)), kmw = simKey(M(base.replace('100MW', '90MW')));
  check('C8b simKey ignores title and battery MW', k0 === kt && k0 === kmw);
  check('C8c simKey ignores `verdict:` (display-only; typing it re-runs a ~1 s simulation per keystroke)', k0 === kv, 'verdict text is part of the key');
  check('C8d same input twice -> identical output', JSON.stringify(simulate(M(base), {seed: 1, n: 200})) === JSON.stringify(simulate(M(base), {seed: 1, n: 200})));
  // line order independence
  const shuffled = base.split('\n').reverse().join('\n');
  check('C8e parse order independence: reversed lines give the same simKey', simKey(M(shuffled)) === k0);
}
// ---------- C9. edges reachable from the text format -------------------------------------
{
  const tryit = (label, txt, n = 100) => { let r; try{ const m = M(txt); const o = simulate(m, {seed: 1, n}); r = o ? {tau: o.threshold.p50, days: o.threshold.clearingDays, fan0: o.fan[0] && o.fan[0].p50, line: verdict('threshold', o)} : {null: true, missing: m.missing}; }catch(e){ r = {threw: e.message}; } console.log(`   info: ${label}: ${JSON.stringify(r)}`); return r; };
  const B = 'rte: 90\ncalendar: 1\nspread: 35..85\ncharge: 15..45\nfade: 0.01\ndrift: -4..0\n';
  const r0 = tryit('0 MWh battery', 'battery: 100MW / 0MWh\n' + B + 'cycles: 6000 over 15yr');
  check('C9a battery with 0 MWh gives a finite cycle price or a clear refusal', r0.null || Number.isFinite(r0.tau), JSON.stringify(r0));
  const r1 = tryit('cycles over 0yr', 'battery: 100MW / 200MWh\n' + B + 'cycles: 6000 over 0yr');
  check('C9b a 0-year horizon is refused or handled (no throw, no NaN)', r1.null || (!r1.threw && Number.isFinite(r1.tau)), JSON.stringify(r1));
  const r2 = tryit('cycles over 0.4yr (rounds to 0)', 'battery: 100MW / 200MWh\n' + B + 'cycles: 6000 over 0.4yr');
  const r3 = tryit('0 cycle budget', 'battery: 100MW / 200MWh\n' + B + 'cycles: 0 over 15yr');
  check('C9c zero warranty budget gives finite output', r3.null || Number.isFinite(r3.tau), JSON.stringify(r3));
  const r4 = tryit('negative spread range', 'battery: 100MW / 200MWh\nrte: 90\ncalendar: 1\nspread: -20..30\ncharge: 5..10\nfade: 0.01\ncycles: 6000 over 15yr');
  const r5 = tryit('fade 0 and calendar 0', 'battery: 100MW / 200MWh\nrte: 90\ncalendar: 0\nspread: 35..85\ncharge: 15..45\nfade: 0\ncycles: 6000 over 15yr');
  check('C9g with fade 0 and slack warranty the verdict does not blame "the wear cost" for a £0 bar', !/wear cost setting the bar/.test(r5.line), r5.line);
  const r6 = tryit('spread single value', 'battery: 100MW / 200MWh\nrte: 90\ncalendar: 1\nspread: 50\nfade: 0.01\ncycles: 6000 over 15yr');
  // unit suffixes are ignored: "£/kWh" vs "£/MWh"
  const a1 = M('battery: 1MW / 2MWh\nspread: 50\nrte: 90\nfade: 0.01\ncalendar: 1\ncycles: 100 over 5yr\naugment: 150 £/MWh').augment;
  console.log(`   info: "augment: 150 £/MWh" parses as ${JSON.stringify(a1)} (always x1000, the unit word is ignored)`);
  check('C9d an augment cost written in £/MWh is not silently multiplied by 1000', a1.lo === 150, `parsed ${a1.lo} £/MWh`);
  const sp = M('battery: 1MW / 2MWh\nspread: 0.05 £/kWh\nrte: 90\nfade: 0.01\ncalendar: 1\ncycles: 100 over 5yr').spread;
  check('C9e a spread written in £/kWh is not read as £/MWh', sp.lo > 1, `parsed ${sp.lo}`);
  const rt = M('battery: 1MW / 2MWh\nspread: 50\nrte: 0.9\nfade: 0.01\ncalendar: 1\ncycles: 100 over 5yr');
  const b = drawBeliefs(rt, mulberry32(1), gaussian(mulberry32(1)));
  console.log(`   info: "rte: 0.9" (fraction instead of percent) -> rte ${rt.rte.lo}, drawn ${b.rte} (silently clamped to 0.5)`);
  check('C9f rte written as a fraction (0.9) is not silently turned into 50 %', b.rte > 0.8, `drawn rte ${b.rte}`);
  const rte100 = M('battery: 1MW / 2MWh\nspread: 50\nrte: 100\nfade: 0.01\ncalendar: 1\ncycles: 100 over 5yr');
  const b2 = drawBeliefs(rte100, mulberry32(1), gaussian(mulberry32(1)));
  console.log(`   info: rte 100% -> engine uses ${b2.rte} with no warning`);
}
// ---------- C10. sampling error of every printed figure at the page's run size ------------
{
  const names = Object.keys(outs);
  for(const name of names){
    const m = outs[name].m; const S = {};
    const seeds = Array.from({length: 10}, (_, i) => i + 1);
    for(const s of seeds){
      const o = simulate(m, {seed: s, n: 5000}); const put = (k, v) => { if(v != null && Number.isFinite(v)) (S[k] = S[k] || []).push(v); };
      put('tau p10', o.threshold.p10); put('tau p50', o.threshold.p50); put('tau p90', o.threshold.p90);
      put('clearing days', o.threshold.clearingDays); put('bindingShare', o.threshold.bindingShare);
      if(o.second){ put('2nd dRev', o.second.dRev); put('2nd dWear', o.second.dWear); put('2nd dNet', o.second.dNet); put('2nd NPV', o.second.lifetimeNpvDelta); put('2nd capped', o.second.capped); }
      if(o.augment){ put('aug pNever', o.augment.pNever); if(o.augment.window){ put('aug w0', o.augment.window[0]); put('aug w1', o.augment.window[1]); } put('aug forgone', o.augment.forgoneP50); }
    }
    const sd = a => { const mu = a.reduce((x, y) => x + y, 0) / a.length; return {mu, sd: Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1))}; };
    const row = Object.entries(S).map(([k, a]) => { const {mu, sd: s} = sd(a); return `${k}: ${mu.toPrecision(4)} ±${s.toPrecision(2)} (${(100 * s / Math.abs(mu || 1)).toFixed(1)}%)`; });
    console.log(`   info: [${name}] 10 seeds, n=5000 (seed-to-seed sd): ${row.join('; ')}`);
    const digits = [['tau p50', 'cycle price P50'], ['2nd dRev', 'second-cycle gross']].filter(([k]) => S[k]).map(([k, lab]) => {
      const {mu, sd: s} = sd(S[k]); const step = 10 ** (Math.floor(Math.log10(Math.abs(mu))) - 2); return {lab, mu, s, step, ok: s <= step}; });
    for(const g of digits) check(`C10 [${name}] printed digits of ${g.lab} are supported by the sampling error`, g.ok, `printed to ~${g.step} (3 sig. figs), seed-to-seed sd ${g.s.toPrecision(2)} on ${g.mu.toPrecision(4)}`, {known: !g.ok});
    if(S['2nd NPV']){ const {mu, sd: s} = sd(S['2nd NPV']); const flip = S['2nd NPV'].some(v => v > 0) && S['2nd NPV'].some(v => v < 0);
      check(`C10 [${name}] sign of second-cycle lifetime NPV (decides "pays over the life" vs "destroys value") is seed-stable`, !flip, `NPV across seeds ${S['2nd NPV'].map(v => Math.round(v / 1000) + 'k').join(' ')}`); }
    if(S['aug pNever']){ const bands = S['aug pNever'].map(p => p >= .6 ? 'never' : p >= .35 ? 'coin' : 'augment'); check(`C10 [${name}] augmentation verdict branch is seed-stable`, new Set(bands).size === 1, bands.join(',')); }
    const bs = S['bindingShare']; const br = bs.map(p => p >= .5 ? 'warranty' : 'wear');
    check(`C10 [${name}] warranty-vs-wear branch is seed-stable`, new Set(br).size === 1, `binding shares ${bs.map(x => x.toFixed(2)).join(' ')}`);
  }
}
done();
