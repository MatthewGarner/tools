// energy/frequency/tests/engine-edgecases.test.mjs
// Correctness & edge-case guards for the SFR simulation, added after the
// low-inertia + high-DR over-frequency spike (services injected above nominal
// because serviceResponse used |Δf|). These lock in the whole-grid validation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceResponse, simulate, F0, DR, DM, DC} from '../engine.js';

test('services are DIRECTIONAL: a Low (under-frequency) service never injects above nominal', () => {
  for(const [name, svc] of [['DR', DR], ['DM', DM], ['DC', DC]]){
    // above nominal (Δf > 0): a Low service must deliver ZERO (the bug injected here)
    assert.equal(serviceResponse(0.3, 1, svc), 0, `${name}: no injection at +0.3 Hz`);
    assert.equal(serviceResponse(0.6, 1, svc), 0, `${name}: no injection at +0.6 Hz`);
    // at/inside the deadband: zero
    assert.equal(serviceResponse(0, 1, svc), 0, `${name}: zero at nominal`);
    assert.equal(serviceResponse(-0.01, 1, svc), 0, `${name}: zero inside deadband`);
    // below nominal (Δf < 0): injects positive power
    assert.ok(serviceResponse(-0.3, 1, svc) > 0, `${name}: injects below nominal`);
  }
  // magnitude below nominal still matches the envelope (sign flipped only)
  assert.equal(serviceResponse(-0.2, 1, DR), 1, 'DR full at −0.2 Hz');
});

test('pictured regression: low inertia + high DR settles below nominal, no over-frequency spike', () => {
  const r = simulate({eSync: 40, trip: 1.8, drMw: 1.0, battMW: 1});
  assert.ok(r.settle < F0, `must settle below nominal, got ${r.settle.toFixed(2)}`);
  assert.ok(Math.max(...r.f) < 50.4, `no spike above nominal, peak ${Math.max(...r.f).toFixed(2)}`);
});

test('no over-frequency runaway across the slider grid: no NaN, bounded peak, settle not above nominal', () => {
  let worstPeak = F0, worstSettle = 0;
  for(const eSync of [40, 80, 120, 200, 300])
   for(const trip of [0.2, 1.0, 1.8])
    for(const drMw of [0, 1.5])
     for(const dmMw of [0, 1.5])
      for(const dcMw of [0, 4.5])
       for(const eGfm of [0, 40]){
         const battMW = Math.max(1, drMw + dmMw + dcMw);
         const r = simulate({eSync, trip, drMw, dmMw, dcMw, eGfm, battMW});
         assert.ok(r.f.every(Number.isFinite),
           `finite trace at ${JSON.stringify({eSync, trip, drMw, dmMw, dcMw, eGfm})}`);
         worstPeak = Math.max(worstPeak, ...r.f);
         worstSettle = Math.max(worstSettle, r.settle);
       }
  assert.ok(worstPeak <= 50.4, `peak overshoot bounded (got ${worstPeak.toFixed(3)})`);
  assert.ok(worstSettle <= 50.2, `settle never meaningfully above nominal (got ${worstSettle.toFixed(3)})`);
});

test('dt-halving stability: nadir and settle converge', () => {
  const p = {eSync: 40, trip: 1.8, drMw: 1.0, dmMw: 0.5, dcMw: 1.5, battMW: 3};
  const a = simulate({...p, dt: 0.01});
  const b = simulate({...p, dt: 0.005});
  assert.ok(Math.abs(a.nadir.f - b.nadir.f) < 0.05, `nadir stable (${a.nadir.f} vs ${b.nadir.f})`);
  assert.ok(Math.abs(a.settle - b.settle) < 0.05, `settle stable (${a.settle} vs ${b.settle})`);
});
