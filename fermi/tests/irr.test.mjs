/* FM-23: IRR looks for sign changes of NPV(r) from -99.9% to +100,000%.
   One sign change gives the IRR; none or several gives no IRR. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {irrOf} from '../engine.js';
import {mulberry32} from '../../assets/series.js';

/* the routine this replaces, verbatim: bisection on (-0.99, 10] */
function oldIrr(flows, horizon){
  const f = r => { const dd = 1 / (1 + r); let acc = 0; for(let t = horizon; t >= 0; t--) acc = acc * dd + flows[t]; return acc; };
  let lo = -0.9899, hi = 10, flo = f(lo), fhi = f(hi);
  if(!(isFinite(flo) && isFinite(fhi)) || flo * fhi > 0) return null;
  for(let i = 0; i < 60; i++){ const m = (lo + hi) / 2, fm = f(m); if(fm === 0) return m;
    if(flo * fm < 0){ hi = m; fhi = fm; } else { lo = m; flo = fm; } }
  return (lo + hi) / 2;
}
const changes = fl => { let c = 0, prev = 0; for(const v of fl){ const s = Math.sign(v); if(s && prev && s !== prev) c++; if(s) prev = s; } return c; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('a single root outside the old bracket is found (above +1000%, below -99%)', () => {
  assert.ok(near(irrOf([-1, 200], 1), 199));            // 19,900%
  assert.ok(near(irrOf([-100, 0.5], 1), -0.995));       // -99.5%
  assert.ok(near(irrOf([-1, 900], 1), 899));
  assert.equal(irrOf([-1, 2000], 1), null);             // 199,900% is beyond the +100,000% window
});

test('no sign change in the flows, or several sign changes in NPV, gives no IRR', () => {
  assert.equal(irrOf([100, 50, 0], 2), null);
  assert.equal(irrOf([-100, -50, 0], 2), null);
  assert.equal(irrOf([-100, 230, -132], 2), null);                // roots at 10% and 20%
  assert.equal(irrOf([-1000, 3000, -2200, 300], 3), null);        // roots at -82%, -12.8%, 95.1%
});

test('a single root is the same value the old routine found', () => {
  assert.ok(near(irrOf([-100, 60, 60], 2), 0.130662386291807, 1e-9));
  assert.ok(near(irrOf([-250, 60, 90, 140, 100], 4), oldIrr([-250, 60, 90, 140, 100], 4), 1e-12));
});

test('a flow with several sign changes but one real root still has its IRR', () => {
  const fl = [-100, 10, -5, 300];
  assert.equal(changes(fl), 3);
  const r = irrOf(fl, 3);
  assert.ok(r !== null);
  let npv = 0; for(let t = 0; t < 4; t++) npv += fl[t] / Math.pow(1 + r, t);
  assert.ok(Math.abs(npv) < 1e-6);
});

test('over random flows with one sign change, new and old agree wherever the old returned a value', () => {
  const rand = mulberry32(7);
  let compared = 0, newOnly = 0;
  for(let i = 0; i < 4000; i++){
    const H = 1 + Math.floor(rand() * 8), fl = [];
    const split = Math.floor(rand() * H);
    for(let t = 0; t <= H; t++){
      const mag = Math.exp((rand() - 0.5) * 8) * 100;
      fl.push(t <= split ? -mag : mag);                        // one sign change at `split`
    }
    const o = oldIrr(fl, H), n = irrOf(fl, H);
    if(o !== null){ compared++; assert.ok(n !== null && near(n, o, 1e-12), `${fl} old ${o} new ${n}`); }
    else if(n !== null) newOnly++;
  }
  assert.ok(compared > 1000, 'compared ' + compared);
  assert.ok(newOnly >= 0);
});
