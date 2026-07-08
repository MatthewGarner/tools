// energy/frequency/tests/state.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paramsFromControls, PRESETS} from '../state.js';

test('paramsFromControls maps slider values to engine params', () => {
  const p = paramsFromControls({inertia: 90, trip: 1.8, dc: 1, dcspeed: 0.4, gfm: 15});
  assert.equal(p.eSync, 90);
  assert.equal(p.trip, 1.8);
  assert.equal(p.dcMw, 1);
  assert.equal(p.dcDelay, 0.4);
  assert.equal(p.eGfm, 15);
  assert.equal(p.battMW, 1);   // battery MW rating tracks DC volume (min 1 so GFM has a cap)
});

test('PRESETS: the low-inertia cliff is a stressed, battery-free grid', () => {
  assert.ok(PRESETS.grid2030.inertia <= 100 && PRESETS.grid2030.dc === 0);
  assert.ok(PRESETS.grid2010.inertia >= 200);
});
