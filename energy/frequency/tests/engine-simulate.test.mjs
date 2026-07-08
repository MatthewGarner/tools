// energy/frequency/tests/engine-simulate.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, F0} from '../engine.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
// a stressed low-inertia base case with no battery
const BASE = {trip: 1.8, eSync: 90, load: 30, dcMw: 0, eGfm: 0};

test('case 1 — infinite inertia ⇒ flat line, RoCoF→0', () => {
  const r = simulate({...BASE, eSync: 1e9});
  close(r.rocof, 0, 1e-6, 'rocof');
  close(r.nadir.f, F0, 1e-3, 'nadir ~ nominal');
});

test('case 2 — the first integration step realises the analytic RoCoF exactly', () => {
  const r = simulate({trip: 1.8, eSync: 90, dt: 0.01});
  close(r.rocof, 0.5, 1e-9, 'analytic rocof');
  // at t=0 every response term is exactly zero, so the first Euler step's
  // slope equals −RoCoF regardless of the governor/damping constants
  close((r.f[1] - r.f[0]) / 0.01, -0.5, 1e-9, 'first-step slope = −RoCoF');
});

test('case 3 — off-nominal settle: primary response holds a droop offset, NOT 50 Hz', () => {
  const r = simulate(BASE);
  assert.ok(r.settle < F0, 'settles below nominal');
  assert.ok(r.settle > 47, 'but not collapsed');
});

test('case 4 — more synchronous inertia ⇒ shallower RoCoF AND higher nadir', () => {
  const lo = simulate({...BASE, eSync: 90});
  const hi = simulate({...BASE, eSync: 200});
  assert.ok(hi.rocof < lo.rocof, 'rocof falls with inertia');
  assert.ok(hi.nadir.f > lo.nadir.f, 'nadir rises with inertia');
});

test('case 8 — UFLS closes the loop: a big trip on a weak grid sheds AND arrests', () => {
  const r = simulate({trip: 1.8, eSync: 70, load: 30, dcMw: 0, eGfm: 0});
  assert.ok(r.shedOccurred, 'a stage shed');
  assert.equal(r.shed[0].f, 48.8, 'first stage at 48.8 Hz');
  // the fall is arrested: frequency recovers off the nadir by the end
  assert.ok(r.settle > r.nadir.f, 'recovered above the nadir after shedding');
});

test('case 9 — pinned identity flows through simulate', () => {
  const r = simulate({trip: 1.8, eSync: 90, load: 30});
  close(r.rocof, 0.5, 1e-9, 'rocof identity');
});
