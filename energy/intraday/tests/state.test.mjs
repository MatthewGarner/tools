import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY_DEFAULTS} from '../day.js';
import {encodeDayState, decodeDayState} from '../state.js';

test('round-trip: non-default params survive, defaults are elided', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6, gas: 250};
  const enc = encodeDayState(p, 'gasSpike');
  assert.deepEqual(Object.keys(enc.p).sort(), ['fleetGW', 'gas']);
  const dec = decodeDayState(enc);
  assert.deepEqual(dec.p, p);
  assert.equal(dec.preset, 'gasSpike');
});

test('defaults-only state encodes empty p and decodes to defaults', () => {
  const dec = decodeDayState(encodeDayState({...DAY_DEFAULTS}, null));
  assert.deepEqual(dec.p, DAY_DEFAULTS);
  assert.equal(dec.preset, null);
});

test('corrupt input decodes to null', () => {
  assert.equal(decodeDayState(null), null);
  assert.equal(decodeDayState({v: 9, p: {}}), null);
  assert.equal(decodeDayState({v: 1}), null);
});

test('hostile numerics are clamped or dropped (quadratic-engine guard)', () => {
  const dec = decodeDayState({v: 1, p: {fleetGW: 5000, gas: -1, trough: 'lol', peak: 1e9}});
  assert.equal(dec.p.fleetGW, 12, 'fleetGW clamped to slider max');
  assert.equal(dec.p.gas, 40, 'gas clamped to slider min');
  assert.equal(dec.p.trough, DAY_DEFAULTS.trough, 'non-numeric falls back to default');
  assert.equal(dec.p.peak, 60, 'peak clamped');
});
