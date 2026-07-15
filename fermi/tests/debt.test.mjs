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
