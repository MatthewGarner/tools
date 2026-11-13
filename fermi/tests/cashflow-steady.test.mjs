/* Cash flow, steadier figures without a slower page (audit FM-30, FM-27): 40,000 runs on an
   unconditional draw order, the chart from the first 10,000, a fast exact IRR root-finder, and
   sampled money printed to one shared step. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateCashflow} from '../cashflow.js';
import {irrOf} from '../engine.js';
import {CF_SEED, CF_N, CF_BAND_N} from '../seeds.js';
import {moneyStep, moneyTrio, cashflowMethod} from '../words.js';
import {verdictLines, financeVerdict, cashflowMarkdown} from '../render-cashflow.js';

const R = (lo, hi) => ({lo, hi});
const invest = {periods: [R(-250e3, -180e3), R(-40e3, 20e3), R(30e3, 90e3), R(60e3, 140e3)], horizon: 5, grain: 'year', rate: R(8, 12)};

test('the run counts: 40,000 runs, a chart from the first 10,000', () => {
  assert.equal(CF_N, 40000);
  assert.equal(CF_BAND_N, 10000);
  const r = simulateCashflow(invest);
  assert.equal(r.n, 40000);
  assert.equal(r.bandN, 10000);
  assert.equal(r.npvSorted.length, 40000);
});

test('the chart band is exactly the first 10,000 runs, unchanged for a model with no point range', () => {
  const was = [["-242253.6179", "-214948.6637", "-187878.1599"], ["-260896.2003", "-225060.3732", "-189065.9769"],
    ["-211643.4528", "-170797.0714", "-127249.8598"], ["-126965.9955", "-77006.1191", "-21597.1082"],
    ["-39818.8323", "17752.7402", "81502.1643"], ["46598.9065", "112462.6995", "185505.0102"]];   // captured from the 10,000-run page before this change
  const r = simulateCashflow(invest, {seed: CF_SEED});
  assert.deepEqual(r.band.map(b => [b.p10, b.p50, b.p90].map(x => x.toFixed(4))), was);
  assert.deepEqual(simulateCashflow(invest, {seed: CF_SEED, n: 10000}).band, r.band);
});

test('a hairline change to a point rate or a point period moves NPV P50 by far less than a printed step', () => {
  const step = r => moneyStep([r.npv.p10, r.npv.p50, r.npv.p90]);
  const base = simulateCashflow({...invest, rate: R(10, 10)}, {seed: CF_SEED});
  const rate = simulateCashflow({...invest, rate: R(10, 10.0001)}, {seed: CF_SEED});
  assert.ok(Math.abs(rate.npv.p50 - base.npv.p50) < step(base) / 100, base.npv.p50 + ' -> ' + rate.npv.p50);
  const pt = {...invest, periods: [R(-250e3, -180e3), R(10e3, 10e3), R(30e3, 90e3), R(60e3, 140e3)]};
  const p1 = simulateCashflow(pt, {seed: CF_SEED});
  const p2 = simulateCashflow({...pt, periods: [pt.periods[0], R(10e3, 10.0001e3), ...pt.periods.slice(2)]}, {seed: CF_SEED});
  assert.ok(Math.abs(p2.npv.p50 - p1.npv.p50) < step(p1) / 100, p1.npv.p50 + ' -> ' + p2.npv.p50);
  assert.ok(Math.abs(p2.npv.p10 - p1.npv.p10) < step(p1) / 10);
  assert.ok(Math.abs(p2.npv.p90 - p1.npv.p90) < step(p1) / 10);
});

test('money prints to one shared step: a tenth of the power of ten of the largest figure', () => {
  assert.equal(moneyStep([-51234, 15012, 80100]), 1000);
  assert.equal(moneyStep([-5123, 1501, 8010]), 100);
  assert.equal(moneyStep([-1.234e6, 0.4e6, 1.8e6]), 100000);
  assert.deepEqual(moneyTrio([-51234, 15012, 80100]), ['−51k', '+15k', '+80k']);
  assert.deepEqual(moneyTrio([-1.234e6, 0.4e6, 1.8e6]), ['−1.2M', '+400k', '+1.8M']);
  assert.deepEqual(moneyTrio([-300, 40, 80100]), ['0', '0', '+80k']);          // below the step: a plain zero, never "−0"
  assert.deepEqual(moneyTrio([0, 0, 0]), ['0', '0', '0']);
});

test('the verdicts print every NPV figure to the trio step', () => {
  const r = simulateCashflow(invest, {seed: CF_SEED});
  const step = moneyStep([r.npv.p10, r.npv.p50, r.npv.p90]);
  const [a, b, c] = moneyTrio([r.npv.p10, r.npv.p50, r.npv.p90]);
  const v = verdictLines(r);
  assert.equal(v.head, 'NPV P50 ' + b + ' — 80% range ' + a + ' to ' + c + '.');
  assert.ok(step >= 1000);
  const md = cashflowMarkdown(r, invest, 'URL');
  assert.ok(md.includes(v.head));
});
test('equity NPV P50 prints to the step of its own trio', () => {
  const d = {D: 5e6, dscrTarget: 1.45, sizingCase: 'central', unlevIrr: {p50: .1}, levIrr: {p10: .08, p50: .12, p90: .2, undefinedShare: 0},
    eqNpv: {p10: -340000, p50: 2032000, p90: 4410000}, coverShortfall: .1};
  assert.match(financeVerdict(d).sub, /equity NPV P50 \+2M;/);
  d.eqNpv = {p10: -34000, p50: 203200, p90: 441000};
  assert.match(financeVerdict(d).sub, /equity NPV P50 \+200k;/);
});

test('the method line says the run count and where the chart comes from', () => {
  const m = cashflowMethod(invest, 5, 40000, 10000);
  assert.match(m, /40,000 seeded runs, chart from the first 10,000 · deterministic$/);
  assert.doesNotMatch(cashflowMethod(invest, 5, 10000, 10000), /chart from/);
});

/* ---------- the IRR root-finder ---------- */
const npv = (flows, r) => flows.reduce((a, c, t) => a + c / Math.pow(1 + r, t), 0);
function reference(flows){                         // plain bisection on the same window, to the last bit
  let lo = -0.999, hi = 1000, flo = npv(flows, lo);
  if(flo * npv(flows, hi) > 0) return null;
  for(let i = 0; i < 200; i++){ const m = (lo + hi) / 2, fm = npv(flows, m); if(fm === 0) return m; if(flo * fm < 0) hi = m; else { lo = m; flo = fm; } }
  return (lo + hi) / 2;
}
test('irrOf: hand values and semantics', () => {
  assert.ok(Math.abs(irrOf([-100, 121], 1) - 0.21) < 1e-12);
  assert.ok(Math.abs(irrOf([-1000, 500, 500, 500], 3) - 0.2337519285) < 1e-8);
  assert.equal(irrOf([100, 50], 1), null);                      // no sign change
  assert.equal(irrOf([-100, 230, -132], 2), null);              // two roots: undefined by ruling
  assert.equal(irrOf([-1000, 3000, -2200, 300], 3), null);      // three roots
  assert.equal(irrOf([-1, 1e9], 1), null);                      // root above +100,000%
  assert.equal(irrOf([-1e9, 1], 1), null);                      // root below -99.9%
  assert.ok(Math.abs(irrOf([-100, 150.5], 1) - 0.505) < 1e-12);
});
test('irrOf resolves the root to 1e-12 or better across many random one-sign-change vectors', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let worst = 0, n = 0, nulls = 0, hint = NaN;       // odd runs start from the last root, as the simulation does
  for(let k = 0; k < 600; k++){
    const H = 1 + Math.floor(rnd() * 60), out = 1 + Math.floor(rnd() * Math.min(3, H)), flows = [];
    const mag = Math.pow(10, 2 + rnd() * 5);
    for(let t = 0; t <= H; t++) flows.push((t < out ? -1 : 1) * mag * (0.2 + rnd() * (rnd() < .2 ? 40 : 1.5)));
    const got = irrOf(flows, H, k % 2 ? hint : undefined), want = reference(flows);
    if(want === null){ assert.equal(got, null); nulls++; continue; }
    assert.notEqual(got, null);
    hint = got;
    worst = Math.max(worst, Math.abs(got - want) / (1 + Math.abs(want))); n++;
  }
  assert.ok(n > 400 && worst < 1e-12, 'worst ' + worst + ' over ' + n + ' (' + nulls + ' outside the window)');
});
test('irrOf: a vector whose NPV is nearly flat at the root (slow Newton) still resolves, and a hint that is the root is returned as is', () => {
  const flat = [-5049.8477144039025, -239.76275683622768, -663.0240626595304, -3821.044708425782, 91.73725150203113, 11.51162039038616, 195.82703936953388];
  assert.ok(Math.abs(irrOf(flat, 6) - reference(flat)) < 1e-12);
  const r = irrOf([-1000, 500, 500, 500], 3);
  assert.equal(irrOf([-1000, 500, 500, 500], 3, r), r);          // identical trials give bit-identical roots
  assert.ok(Math.abs(irrOf([-1000, 500, 500, 500], 3, 900) - r) < 1e-12);
  assert.equal(irrOf([-1, 1e9], 1, 0.3), null);                  // a hint cannot conjure a root outside the window
});

test('the draw stream is the library stream, draw for draw (cashflow.js writes mulberry32 + polar gaussian out as one closure)', async () => {
  const {mulberry32, gaussian} = await import('../../assets/series.js');
  const {samplerFor} = await import('../engine.js');
  const periods = [R(10, 40), R(5, 5), R(-3, 4), R(2, 9)], rate = R(5, 7), n = 300, seed = 4242;
  const rand = mulberry32(seed), gauss = gaussian(rand), want = [];
  const samplers = periods.map(p => samplerFor(p.lo, p.hi, 'auto', rand, gauss));
  for(let i = 0; i < n; i++){
    const r = Math.max(-0.99, 0.06 + (0.02 / (2 * 1.6448536)) * gauss());
    let v = 0;
    periods.forEach((p, t) => { const x = p.lo === p.hi ? (gauss(), p.lo) : samplers[t](); v += x / Math.pow(1 + r, t); });
    want.push(v);
  }
  const got = simulateCashflow({periods, horizon: 3, grain: 'year', rate}, {seed, n});
  const sortedWant = Float64Array.from(want).sort();
  for(let i = 0; i < n; i++) assert.ok(Math.abs(got.npvSorted[i] - sortedWant[i]) <= 1e-9 * Math.max(1, Math.abs(sortedWant[i])), i + ': ' + got.npvSorted[i] + ' vs ' + sortedWant[i]);
});
