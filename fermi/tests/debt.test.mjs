import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distQuantile, distMedian, irrOf} from '../engine.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b} (eps ${eps})`);

/* ---------- Task 1: distQuantile + shared irrOf ---------- */

test('distQuantile q=0.5 equals distMedian (logn + norm)', () => {
  near(distQuantile(100, 400, 'auto', 0.5), distMedian(100, 400, 'auto'), 1e-6);   // logn (lo>0)
  near(distQuantile(-40, 20, 'auto', 0.5), distMedian(-40, 20, 'auto'), 1e-6);     // norm (crosses 0)
});

test('distQuantile P10 < P50 < P90; range edges are the 5/95 points', () => {
  const lo = 100, hi = 400;                       // logn 90% CI
  assert.ok(distQuantile(lo, hi, 'auto', 0.1) < distQuantile(lo, hi, 'auto', 0.5));
  assert.ok(distQuantile(lo, hi, 'auto', 0.5) < distQuantile(lo, hi, 'auto', 0.9));
  near(Math.log(distQuantile(lo, hi, 'auto', 0.05)), Math.log(lo), 1e-4);
  near(Math.log(distQuantile(lo, hi, 'auto', 0.95)), Math.log(hi), 1e-4);
});

test('distQuantile uniform is linear; swaps lo>hi', () => {
  near(distQuantile(0, 100, 'uni', 0.1), 10, 1e-9);
  near(distQuantile(400, 100, 'auto', 0.5), distMedian(100, 400, 'auto'), 1e-6);   // swap
});

test('irrOf still solves a simple project', () => {
  near(irrOf([-100, 0, 121], 2), 0.1, 1e-4);
});

/* ---------- Task 2: sizeDebt (deterministic sculpt + co-fund) ---------- */
import {sizeDebt} from '../debt.js';
const P = a => a.map(([lo, hi]) => ({lo, hi}));
// £7M one-period build, then 9 yrs of £1.0–1.4M ops
const BUILD = {periods: P([[-7e6, -7e6], ...Array(9).fill([1.0e6, 1.4e6])]), horizon: 9,
  grain: 'year', dscr: 1.30, costOfDebt: 0.065, sizingCase: 'central'};
const lenderFlows = s => { const f = []; for(let t = 0; t <= s._H; t++) f[t] = -(s.drawByT[t] || 0) + (s.dsByT[t] || 0); return f; };

test('COD is the funding trough + 1; first op year is serviced; tenor = available', () => {
  const s = sizeDebt(BUILD);
  assert.equal(s.ok, true);
  assert.equal(s.tStar, 1);
  assert.ok(s.dsByT[1] > 0, 'first op year serviced (I2)');
  assert.equal(s.tenor, 9);                         // horizon - tStar + 1
});

test('sculpt: DS = P50 CFADS / DSCR each serviced period', () => {
  const s = sizeDebt(BUILD);
  const p50 = Math.sqrt(1.0e6 * 1.4e6);             // logn median of the op range
  near(s.dsByT[1], p50 / 1.30, 1);
});

test('PV identity: amortisation rolls to ~0 (pay-then-accrue)', () => {
  const s = sizeDebt(BUILD);
  let B = s.D;
  for(let t = s.tStar; t < s.tStar + s.tenor; t++) B = (B - s.dsByT[t]) * (1 + 0.065);
  assert.ok(Math.abs(B) < s.D * 1e-6, 'residual ' + B);
});

test('lender IRR equals the cost of debt (IDC gross-up, I1)', () => {
  const s = {...sizeDebt(BUILD), _H: BUILD.horizon};
  near(irrOf(lenderFlows(s), BUILD.horizon), 0.065, 1e-4);
});

test('co-fund: Σdraw = D_drawn ≤ D; drawn pro-rata to outflow', () => {
  const s = sizeDebt(BUILD);
  let sum = 0; s.drawByT.forEach(x => sum += x);
  near(sum, s.D_drawn, 1);
  assert.ok(s.D_drawn <= s.D + 1, 'capitalised IDC gap');
});

test('gates: all-positive and mid0=0 → no construction spend', () => {
  assert.equal(sizeDebt({...BUILD, periods: P([[1e6, 1e6], [1e6, 1e6]]), horizon: 1}).ok, false);
  assert.equal(sizeDebt({...BUILD, periods: P([[0, 0], [1e6, 1e6]]), horizon: 1}).ok, false);   // mid0=0 divide (M4)
});

test('gearing cap: tiny capex + fat ops caps D at build cost', () => {
  const s = sizeDebt({periods: P([[-1e5, -1e5], ...Array(9).fill([2e6, 2e6])]), horizon: 9,
    grain: 'year', dscr: 1.3, costOfDebt: 0.065, sizingCase: 'central'});
  assert.equal(s.capped, true);
  near(s.D, 1e5, 1);
  assert.ok(s.gearingPct <= 1.0001);
});

test('D<=0 (negative ops) → no debt capacity (M6)', () => {
  const s = sizeDebt({periods: P([[-7e6, -7e6], [-1e6, -0.5e6], [-1e6, -0.5e6]]), horizon: 5,
    grain: 'year', dscr: 1.3, costOfDebt: 0.065, sizingCase: 'central'});
  assert.equal(s.ok, false);
});

test('downside sizes smaller than central', () => {
  assert.ok(sizeDebt({...BUILD, sizingCase: 'downside'}).D < sizeDebt(BUILD).D);
});

test('tenor clamps to available and flags tenorClamped (I1)', () => {
  const s = sizeDebt({...BUILD, tenor: 20});
  assert.equal(s.tenor, 9);
  assert.equal(s.tenorClamped, true);
  assert.equal(sizeDebt({...BUILD, tenor: 4}).tenorClamped, undefined);   // within range → no flag
});

test('monthly grain: annualised lender IRR ≈ cost of debt (M4)', () => {
  const s = {...sizeDebt({...BUILD, grain: 'month'}), _H: BUILD.horizon};
  assert.equal(s.ok, true);
  const ann = Math.pow(1 + irrOf(lenderFlows(s), BUILD.horizon), 12) - 1;
  near(ann, 0.065, 1e-3);
});

test('grant blip mid-build: no draw against the inflow, lender IRR still = rd (I3)', () => {
  const s = {...sizeDebt({periods: P([[-4e6, -4e6], [1e6, 1e6], [-3e6, -3e6], ...Array(6).fill([1.5e6, 1.5e6])]),
    horizon: 8, grain: 'year', dscr: 1.3, costOfDebt: 0.065, sizingCase: 'central'}), _H: 8};
  assert.equal(s.tStar, 3);                         // trough at t2, ops from t3
  assert.equal(s.drawByT[1], 0, 'no debt drawn against the grant inflow');
  near(irrOf(lenderFlows(s), 8), 0.065, 1e-4);
});
