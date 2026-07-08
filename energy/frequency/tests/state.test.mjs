// energy/frequency/tests/state.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paramsFromControls, PRESETS} from '../state.js';
import {simulate} from '../engine.js';

test('paramsFromControls maps slider values to engine params', () => {
  const p = paramsFromControls({inertia: 80, trip: 1.8, dr: 0.5, dm: 0.5, dc: 1.5, gfm: 20});
  assert.deepEqual(p, {
    eSync: 80, trip: 1.8,
    drMw: 0.5, dmMw: 0.5, dcMw: 1.5, eGfm: 20,
    battMW: 2.5, load: 30,
  });
});

test('PRESETS: the low-inertia cliff is a stressed, battery-free grid', () => {
  assert.ok(PRESETS.grid2030.inertia <= 100 && PRESETS.grid2030.dc === 0);
  assert.ok(PRESETS.grid2010.inertia >= 200);
});

test('PRESETS: the shared low-inertia grid actually breaches — and the battery catches it', () => {
  const noBattery = simulate(paramsFromControls(PRESETS.grid2030));
  assert.ok(noBattery.shedOccurred, 'grid2030 (no battery) breaches 48.8 Hz and sheds a UFLS stage');
  const withBattery = simulate(paramsFromControls(PRESETS.stack));
  assert.ok(withBattery.nadir.f > 48.8, 'stack (with battery) holds the nadir above the shedding line');
  assert.equal(PRESETS.procure3x.inertia, PRESETS.grid2030.inertia,
    'procure3x is judged against the same stressed grid as the no-battery/stack cases');
});

test('PRESETS.stack.dc is 1.5 GW', () => {
  assert.equal(PRESETS.stack.dc, 1.5);
});
