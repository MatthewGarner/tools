import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_PROFILE, DAY_DEFAULTS, demandAt, solarAt} from '../day.js';

test('BASE_PROFILE: 24 normalised points, trough 0 and peak 1 present', () => {
  assert.equal(BASE_PROFILE.length, 24);
  assert.ok(BASE_PROFILE.every(v => v >= 0 && v <= 1));
  assert.equal(Math.min(...BASE_PROFILE), 0);
  assert.equal(Math.max(...BASE_PROFILE), 1);
  assert.ok(BASE_PROFILE.indexOf(1) >= 17 && BASE_PROFILE.indexOf(1) <= 19, 'evening peak');
  assert.ok(BASE_PROFILE.indexOf(0) >= 2 && BASE_PROFILE.indexOf(0) <= 5, 'overnight trough');
});

test('demandAt scales the profile between trough and peak', () => {
  const p = {...DAY_DEFAULTS, trough: 30, peak: 50};
  assert.equal(demandAt(BASE_PROFILE.indexOf(0), p), 30);
  assert.equal(demandAt(BASE_PROFILE.indexOf(1), p), 50);
  for(let h = 0; h < 24; h++){
    const d = demandAt(h, p);
    assert.ok(d >= 30 && d <= 50, `hour ${h} in range`);
  }
});

test('solarAt: zero outside daylight, peak mid-day, half-sine inside', () => {
  const p = {...DAY_DEFAULTS, solarPeak: 8, sunrise: 6, sunset: 18};
  assert.equal(solarAt(3, p), 0);
  assert.equal(solarAt(22, p), 0);
  assert.equal(solarAt(6, p), 0);                       // sin(0) = 0 at sunrise
  assert.ok(Math.abs(solarAt(12, p) - 8) < 1e-9, 'solar noon = solarPeak');
  assert.ok(solarAt(9, p) > 0 && solarAt(9, p) < 8);
  assert.equal(solarAt(12, {...p, solarPeak: 0}), 0);
});
