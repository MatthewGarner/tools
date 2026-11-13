import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY_DEFAULTS} from '../day.js';
import {encodeDayState, decodeDayState, setParam} from '../state.js';

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
  const dec = decodeDayState({v: 2, p: {fleetGW: 5000, gas: -1, trough: 'lol', peak: 1e9}});
  assert.equal(dec.p.fleetGW, 12, 'fleetGW clamped to slider max');
  assert.equal(dec.p.gas, 40, 'gas clamped to slider min');
  assert.equal(dec.p.trough, DAY_DEFAULTS.trough, 'non-numeric falls back to default');
  assert.equal(dec.p.peak, 60, 'peak clamped');
});

/* Engine audit 2026-11-12, F-ID-4: a missing, null, empty or non-numeric value takes the default (Number(null) and
   Number('') are 0, which used to clamp to the slider minimum); a numeric value is clamped to the control's range. */
test('F-ID-4: null, empty, boolean and array values take the default; numbers and numeric strings clamp', () => {
  const dec = decodeDayState({v: 2, p: {gas: null, carbon: '', fleetGW: true, fleetH: [3], solarPeak: '8', wind: 7}});
  assert.equal(dec.p.gas, DAY_DEFAULTS.gas);
  assert.equal(dec.p.carbon, DAY_DEFAULTS.carbon);
  assert.equal(dec.p.fleetGW, DAY_DEFAULTS.fleetGW);
  assert.equal(dec.p.fleetH, DAY_DEFAULTS.fleetH);
  assert.equal(dec.p.solarPeak, 8, 'a numeric string is a number');
  assert.equal(dec.p.wind, 1, 'a number clamps');
});

/* F-ID-3: Trough cannot exceed Peak. The slider being moved stops at the other's value. */
test('F-ID-3: setParam stops the moved slider at the other one', () => {
  const p = {...DAY_DEFAULTS, trough: 30, peak: 40};
  assert.equal(setParam(p, 'trough', 40).trough, 40);
  assert.equal(setParam(p, 'trough', 40).peak, 40);
  const high = setParam(p, 'trough', 40);
  assert.equal(setParam(high, 'trough', 40).trough, 40);
  assert.equal(setParam({...p, trough: 35, peak: 36}, 'trough', 40).trough, 36, 'trough stops at peak');
  assert.equal(setParam({...p, trough: 35, peak: 36}, 'peak', 31).peak, 35, 'peak stops at trough');
  assert.equal(setParam(p, 'gas', 150).gas, 150, 'other params untouched');
  assert.equal(p.trough, 30, 'input not mutated');
});

test('F-ID-3: a shared link cannot carry trough above peak', () => {
  const dec = decodeDayState({v: 1, p: {trough: 40, peak: 30}});
  assert.ok(dec.p.trough <= dec.p.peak, `trough ${dec.p.trough} peak ${dec.p.peak}`);
});
