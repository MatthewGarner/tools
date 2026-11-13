/* F-ID-5 ruling: the day the page opens on is a summer weekday; saved links keep the day they were made on. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DAY_DEFAULTS, dayLabel, runDay} from '../day.js';
import {encodeDayState, decodeDayState, LEGACY_DEFAULTS_V1} from '../state.js';

const OLD = {trough: 22, peak: 44, solarPeak: 6, sunrise: 5, sunset: 21, gas: 100, carbon: 50, wind: 0.32, fleetGW: 0, fleetH: 2, rte: 0.85};
const NEW = {...OLD, trough: 21, peak: 32, solarPeak: 9};

test('the default day is a summer weekday: trough 21, peak 32, solar 9 GW 05:00-21:00, the rest unchanged', () => {
  assert.deepEqual(DAY_DEFAULTS, NEW);
  assert.deepEqual(LEGACY_DEFAULTS_V1, OLD);
});

test('saved links keep their meaning: v1 hashes written by origin/main read against the OLD defaults', () => {
  // Both objects are exactly what encodeDayState produced on origin/main (v:1, differences only).
  const untouched = {v: 1, c: null, p: {}};
  const oneEdit = {v: 1, c: null, p: {fleetGW: 6}};
  assert.deepEqual(decodeDayState(untouched).p, OLD, 'an untouched old link still shows the old day');
  assert.deepEqual(decodeDayState(oneEdit).p, {...OLD, fleetGW: 6}, 'an edited old link keeps the untouched controls too');
  assert.deepEqual(decodeDayState({v: 1, p: {trough: 'lol'}}).p.trough, 22, 'a bad value in an old link falls back to the old default');
});

test('new links are version 2 and read against the new defaults', () => {
  const enc = encodeDayState({...DAY_DEFAULTS, fleetGW: 6}, null);
  assert.equal(enc.v, 2);
  assert.deepEqual(enc.p, {fleetGW: 6});
  assert.deepEqual(decodeDayState(enc).p, {...NEW, fleetGW: 6});
  assert.deepEqual(decodeDayState({v: 2, c: null, p: {}}).p, NEW);
  assert.equal(decodeDayState({v: 2, p: {trough: 22}}).p.trough, 22, 'the old trough as a deliberate v2 edit is kept');
});

test('the day is named: a summer weekday while the shape is the default, a custom day otherwise', () => {
  assert.equal(dayLabel(DAY_DEFAULTS), 'Summer weekday');
  assert.equal(dayLabel({...DAY_DEFAULTS, fleetGW: 6, gas: 250}), 'Summer weekday');
  assert.equal(dayLabel({...DAY_DEFAULTS, peak: 40}), 'Custom day');
  assert.equal(dayLabel({...DAY_DEFAULTS, sunrise: 6}), 'Custom day');
});

test('the old defaults still compute the old day (the engine did not move)', () => {
  const r = runDay({...OLD, fleetGW: 0});
  assert.equal(Math.round(r.raw.spread * 10) / 10, 71.7);
});

test('the page says a bigger fleet CAN earn less, and the 4 h case on the default day shows it', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /a bigger fleet can earn less in total than a smaller one/);
  assert.match(html, /summer weekday/i);
  assert.match(html, /levels off/);
  const at = (g, h) => runDay({...DAY_DEFAULTS, fleetGW: g, fleetH: h}).achievedMargin;
  assert.ok(at(4, 4) < at(2, 4) - 1, 'at 4 h a 4 GW fleet earns less in total than 2 GW');
  assert.ok(at(8, 2) >= at(6, 2) - 1e-6 && at(12, 2) >= at(8, 2) - 1e-6, 'at 2 h the total only levels off');
});

test('the code no longer calls the trough "summer-night" or the peak "winter peak"', () => {
  const src = fs.readFileSync(new URL('../day.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /summer-night|winter peak/);
});
