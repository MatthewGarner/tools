// energy/frequency/tests/engine-services.test.mjs
// The three Dynamic services (DR/DM/DC): envelope saturation + the
// slow-vs-fast behavioural contrast between DR and DM.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DR, DM, DC, serviceEnv, simulate} from '../engine.js';

test('DR & DM saturate (env=1.0) at d≥0.2 Hz', () => {
  for(const d of [0.2, 0.25, 0.4]){
    assert.equal(serviceEnv(d, DR), 1, `DR at d=${d}`);
    assert.equal(serviceEnv(d, DM), 1, `DM at d=${d}`);
  }
});

test('DC two-slope exact at d=0.35 Hz (0.525), full by d=0.5 Hz', () => {
  // ra + (0.35-fa)/(fs-fa)*(1-ra) = 0.05 + 0.5*0.95 = 0.525 — exact guards the denominator
  assert.ok(Math.abs(serviceEnv(0.35, DC) - 0.525) < 1e-9, `DC at 0.35 Hz = 0.525; got ${serviceEnv(0.35, DC)}`);
  assert.equal(serviceEnv(0.5, DC), 1);
});

test('slow-vs-fast: DM (0.5 s delay) has already engaged at t=1 s while DR (2.0 s delay) has not', () => {
  const p = {trip: 1.8, eSync: 80, load: 30, battMW: 1};
  const drOnly = simulate({...p, drMw: 1, dmMw: 0, dcMw: 0, eGfm: 0, dt: 0.01, tEnd: 3});
  const dmOnly = simulate({...p, drMw: 0, dmMw: 1, dcMw: 0, eGfm: 0, dt: 0.01, tEnd: 3});
  const idxAt1s = Math.round(1 / 0.01);
  // same trip, same inertia, same MW committed — the only difference is
  // service speed, so at t=1s (past DM's 0.5s delay, before DR's 2.0s delay)
  // DM must have already done more to arrest the fall than DR.
  assert.ok(dmOnly.f[idxAt1s] > drOnly.f[idxAt1s],
    `DM should have propped the frequency higher than DR by t=1s: dm=${dmOnly.f[idxAt1s]} dr=${drOnly.f[idxAt1s]}`);
});

test('slow-vs-fast: at equal MW, DM lifts the nadir more than DR (confirms the delay+tau contrast)', () => {
  const p = {trip: 1.8, eSync: 80, load: 30, battMW: 1};
  const drOnly = simulate({...p, drMw: 1, dmMw: 0, dcMw: 0, eGfm: 0});
  const dmOnly = simulate({...p, drMw: 0, dmMw: 1, dcMw: 0, eGfm: 0});
  assert.ok(dmOnly.nadir.f > drOnly.nadir.f,
    `DM nadir (${dmOnly.nadir.f}) should exceed DR nadir (${drOnly.nadir.f})`);
});
