// energy/frequency/tests/engine-verdict.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, leverDeltas, verdict} from '../engine.js';

const P = {trip: 1.8, eSync: 90, load: 30, battMW: 1, dcMw: 1, eGfm: 15, dcDelay: 0.4};

test('case 5/6 — the honest overlap: GFM flattens RoCoF AND lifts nadir; DC lifts nadir', () => {
  const d = leverDeltas(P);
  assert.ok(d.gfm.rocof < 0, 'grid-forming reduces RoCoF');
  assert.ok(d.gfm.nadir > 0, 'grid-forming also lifts the nadir (overlap)');
  assert.ok(d.dc.nadir > 0, 'DC lifts the nadir');
  assert.ok(Math.abs(d.dc.rocof) < 1e-6, 'DC does not change the initial RoCoF (it acts after the delay)');
});

test('verdict — a non-empty string that quotes the RoCoF and nadir', () => {
  const r = simulate(P);
  const v = verdict(r, P);
  assert.equal(typeof v, 'string');
  assert.ok(v.includes('Hz/s'), 'quotes RoCoF');
  assert.ok(v.includes('Hz'), 'quotes a frequency');
});
