import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateCashflow} from '../cashflow.js';

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
