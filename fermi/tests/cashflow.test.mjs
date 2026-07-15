import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateCashflow} from '../cashflow.js';
import {irrOf} from '../engine.js';

const R = (lo, hi) => ({lo, hi});
const fixed = v => ({lo: v, hi: v});

test('degenerate ranges reproduce closed-form NPV, IRR and payback', () => {
  const r = simulateCashflow({periods: [fixed(-100), fixed(121)], horizon: 1,
    grain: 'year', rate: fixed(10)}, {seed: 1, n: 500});
  assert.ok(Math.abs(r.npv.p50 - 10) < 1e-9, 'NPV ' + r.npv.p50);   // −100 + 121/1.1
  assert.equal(r.npv.pPos, 1);
  assert.ok(Math.abs(r.irr.p50 - 0.21) < 1e-6, 'IRR ' + r.irr.p50);
  assert.equal(r.irr.undefinedShare, 0);
  assert.equal(r.period.kind, 'payback');
  assert.equal(r.period.p50, 1);
  assert.equal(r.period.neverShare, 0);
  assert.equal(r.framing, 'invest');
});

test('IRR is honestly undefined when flows never change sign', () => {
  const r = simulateCashflow({periods: [fixed(50), fixed(50)], horizon: 1,
    grain: 'year', rate: fixed(10)}, {seed: 1, n: 200});
  assert.equal(r.irr.undefinedShare, 1);
});

test('payback never happens when the investment is never recovered', () => {
  const r = simulateCashflow({periods: [fixed(-100), fixed(10)], horizon: 1,
    grain: 'year', rate: fixed(0)}, {seed: 1, n: 200});
  assert.equal(r.period.neverShare, 1);
  assert.ok(r.npv.pPos === 0);
});

test('runway framing: positive start + negative tail → cash-out distribution', () => {
  const r = simulateCashflow({periods: [fixed(100), R(-12, -8)], horizon: 24,
    grain: 'month', rate: fixed(0)}, {seed: 7, n: 2000});
  assert.equal(r.framing, 'runway');
  assert.equal(r.period.kind, 'cashout');
  assert.ok(r.period.p50 >= 9 && r.period.p50 <= 14, 'p50 ' + r.period.p50);
  assert.ok(r.period.p10 <= r.period.p50 && r.period.p50 <= r.period.p90);
  assert.equal(r.period.neverShare, 0);
});

test('tail periods resample independently: the band widens with horizon', () => {
  const r = simulateCashflow({periods: [fixed(0), R(-10, 10)], horizon: 24,
    grain: 'year', rate: fixed(0)}, {seed: 3, n: 2000});
  const width = t => r.band[t].p90 - r.band[t].p10;
  assert.equal(r.band.length, 25);
  assert.ok(width(24) > width(12) * 1.2, width(12) + ' vs ' + width(24));
});

test('monthly grain converts the annual discount rate per period', () => {
  const periods = [fixed(-100), ...Array(12).fill(fixed(10))];
  const r = simulateCashflow({periods, horizon: 12, grain: 'month', rate: fixed(12)},
    {seed: 1, n: 200});
  const rm = Math.pow(1.12, 1 / 12) - 1;
  let closed = -100;
  for(let t = 1; t <= 12; t++) closed += 10 / Math.pow(1 + rm, t);
  assert.ok(Math.abs(r.npv.p50 - closed) < 1e-9, r.npv.p50 + ' vs ' + closed);
});

test('deterministic for a fixed seed; ranges actually vary the outcome', () => {
  const spec = {periods: [fixed(-100), R(20, 60)], horizon: 4, grain: 'year', rate: R(8, 12)};
  assert.deepEqual(simulateCashflow(spec, {seed: 5, n: 1000}), simulateCashflow(spec, {seed: 5, n: 1000}));
  const r = simulateCashflow(spec, {seed: 5, n: 1000});
  assert.ok(r.npv.p90 > r.npv.p10 + 1);
  assert.ok(r.npv.pPos > 0 && r.npv.pPos < 1);
});

test('band is the undiscounted cumulative path', () => {
  const r = simulateCashflow({periods: [fixed(-100), fixed(50)], horizon: 2,
    grain: 'year', rate: fixed(50)}, {seed: 1, n: 100});
  assert.equal(r.band[0].p50, -100);
  assert.equal(r.band[1].p50, -50);
  assert.equal(r.band[2].p50, 0);      // discount rate must not touch the path
});

/* ---------- debt sizing hook (Task 4) ---------- */

test('debt off ⇒ npv/irr/period/band byte-identical (RNG safety)', () => {
  const spec = {periods: [R(-7e6, -7e6), R(1e6, 1.4e6), R(1e6, 1.4e6)], horizon: 5, grain: 'year', rate: R(8, 12)};
  const a = simulateCashflow(spec);
  const b = simulateCashflow({...spec, debt: {dscr: 1.3, costOfDebt: 0.065, sizingCase: 'central'}});
  assert.deepEqual(a.npv, b.npv);
  assert.deepEqual(a.irr, b.irr);
  assert.deepEqual(a.period, b.period);
  assert.deepEqual(a.band, b.band);
});

test('debt attaches for invest (with spread), null for runway', () => {
  const inv = simulateCashflow({periods: [R(-7e6, -7e6), ...Array(6).fill(R(1.0e6, 1.4e6))], horizon: 6,
    grain: 'year', rate: R(8, 12), debt: {dscr: 1.3, costOfDebt: 0.065}});
  assert.equal(inv.debt.ok, true);
  assert.ok(inv.debt.D > 0);
  assert.ok(inv.debt.unlevIrr && inv.debt.levIrr);
  assert.ok(inv.debt.levIrr.p10 < inv.debt.levIrr.p90, 'levered IRR spread (no trial-collapse, C1)');
  assert.ok(inv.debt.eqNpv.p10 < inv.debt.eqNpv.p90, 'equity NPV spread');
  assert.deepEqual(inv.debt.unlevIrr, inv.irr, 'unlevIrr === the returned project irr');
  const run = simulateCashflow({periods: [R(400e3, 400e3), R(-45e3, -25e3)], horizon: 3, grain: 'year',
    rate: R(8, 12), debt: {dscr: 1.3, costOfDebt: 0.065}});
  assert.equal(run.debt, null);
});

test('known-value: deterministic ranges give hand-checkable D AND levered outputs (I5/C1)', () => {
  const H = 9, ds = 1.2e6 / 1.3, rd = 0.065;
  let D = 0; for(let k = 0; k < 9; k++) D += ds / Math.pow(1 + rd, k);
  const Ddrawn = D / (1 + rd);                          // one construction period ⇒ accr = (1+rd)^1
  const eqCF = [-7e6 + Ddrawn, ...Array(9).fill(1.2e6 - ds)];
  const s = simulateCashflow({periods: [fixed(-7e6), ...Array(9).fill(fixed(1.2e6))], horizon: H,
    grain: 'year', rate: fixed(10), debt: {dscr: 1.3, costOfDebt: 0.065, sizingCase: 'central'}});
  assert.ok(Math.abs(s.debt.D - D) < 5, 'D ' + s.debt.D + ' vs ' + D);
  assert.ok(Math.abs(s.debt.levIrr.p50 - irrOf(eqCF, H)) < 1e-3, 'levIrr flows through retained paths');
  let npv = 0; for(let t = 0; t <= H; t++) npv += eqCF[t] / Math.pow(1.10, t);
  assert.ok(Math.abs(s.debt.eqNpv.p50 - npv) < 5, 'eqNpv ' + s.debt.eqNpv.p50 + ' vs ' + npv);
  assert.equal(s.debt.tStar, 1);
  assert.equal(s.debt.levIrr.undefinedShare, 0);           // stale-copy-by-one would NaN trial 0 (Fable M3)
  assert.equal(s.debt.levIrr.p10, s.debt.levIrr.p90);      // identical trials ⇒ exact equality (no trial-shift)
});

test('monthly grain: levered eqNpv/levIrr use per-month discounting + annualisation (Fable I2)', () => {
  const H = 12, V = 300e3, dscr = 1.3, cod = 0.065, rate = 12;
  const rdM = Math.pow(1 + cod, 1 / 12) - 1, reM = Math.pow(1 + rate / 100, 1 / 12) - 1;
  const ds = V / dscr;
  let D = 0; for(let k = 0; k < H; k++) D += ds / Math.pow(1 + rdM, k);   // tenor 12, k = t−1
  const Ddrawn = D / (1 + rdM);                                          // one construction month
  const eqCF = [-5e6 + Ddrawn, ...Array(H).fill(V - ds)];
  let npv = 0; for(let t = 0; t <= H; t++) npv += eqCF[t] / Math.pow(1 + reM, t);
  const levAnnual = Math.pow(1 + irrOf(eqCF, H), 12) - 1;
  const s = simulateCashflow({periods: [fixed(-5e6), ...Array(H).fill(fixed(V))], horizon: H,
    grain: 'month', rate: fixed(rate), debt: {dscr, costOfDebt: cod, sizingCase: 'central'}});
  assert.ok(Math.abs(s.debt.D - D) < 5, 'D ' + s.debt.D + ' vs ' + D);
  assert.ok(Math.abs(s.debt.eqNpv.p50 - npv) < 5, 'eqNpv monthly discounting');
  assert.ok(Math.abs(s.debt.levIrr.p50 - levAnnual) < 1e-3, 'levIrr monthly annualisation');
});
