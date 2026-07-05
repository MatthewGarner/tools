import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenize, parse, collectVars, simulateModel, computeSensitivity, fmt, sig}
  from '../engine.js';
import {quantile} from '../../assets/series.js';

function model(f, ranges){
  const ast = parse(tokenize(f));
  const varNames = collectVars(ast, []);
  const dists = {};
  for(const n of varNames) dists[n] = 'auto';
  return {ast, varNames, ranges, dists};
}
const meeting = model('attendees * hourly_cost * meeting_hours * weeks_per_year', {
  attendees: [6, 10], hourly_cost: [60, 120], meeting_hours: [0.75, 1.5], weeks_per_year: [44, 48],
});
const headline = m => {
  const {sorted} = simulateModel(m, {seed: 0x5EED, n: 20000});
  return {p10: quantile(sorted, .1), p50: quantile(sorted, .5), p90: quantile(sorted, .9)};
};

test('fmt: units, small numbers, negatives', () => {
  assert.equal(fmt(1234567), '1.23M');
  assert.equal(fmt(20000), '20k');
  assert.equal(fmt(0), '0');
  assert.equal(fmt(-1500), '−1.5k');
  assert.equal(fmt(0.05), '0.05');
  assert.equal(sig(123456, 2), '120000');
});

test('sensitivity: deterministic, sorted by share, shares in [0,1]', () => {
  const h = headline(meeting);
  const a = computeSensitivity(meeting, {seed: 0x5EED, p10: h.p10, p90: h.p90});
  const b = computeSensitivity(meeting, {seed: 0x5EED, p10: h.p10, p90: h.p90});
  assert.deepEqual(a, b);
  assert.equal(a.sens.length, 4);
  for(const s of a.sens) assert.ok(s.share >= 0 && s.share <= 1 && s.label);
  const shares = a.sens.map(s => s.share);
  assert.deepEqual(shares, [...shares].sort((x, y) => y - x));
});

test('sensitivity: positive spread labels are ×ratios; a ×2-wide input tops the meeting model', () => {
  const h = headline(meeting);
  const {sens, fullRatio} = computeSensitivity(meeting, {seed: 0x5EED, p10: h.p10, p90: h.p90});
  assert.ok(isFinite(fullRatio) && fullRatio > 1);
  for(const s of sens) assert.match(s.label, /^×/);
  /* hourly_cost and meeting_hours are both ×2 wide — they tie for the top spot */
  assert.ok(['hourly_cost', 'meeting_hours'].includes(sens[0].name), sens[0].name);
  const byName = Object.fromEntries(sens.map(s => [s.name, s.share]));
  assert.ok(Math.abs(byName.hourly_cost - byName.meeting_hours) < 0.01);
  assert.ok(byName.attendees < byName.hourly_cost);
  assert.ok(byName.weeks_per_year < byName.attendees);
});

test('sensitivity: a fixed lo==hi variable is skipped', () => {
  const m = model('a * b', {a: [5, 5], b: [1, 10]});
  const h = headline(m);
  const {sens} = computeSensitivity(m, {seed: 0x5EED, p10: h.p10, p90: h.p90});
  assert.deepEqual(sens.map(s => s.name), ['b']);
});

test('sensitivity: zero-crossing spread falls back to range labels', () => {
  const m = model('a - b', {a: [1, 10], b: [5, 20]});
  const h = headline(m);
  const {sens, fullRatio} = computeSensitivity(m, {seed: 0x5EED, p10: h.p10, p90: h.p90});
  assert.ok(!isFinite(fullRatio) || h.p10 <= 0);
  for(const s of sens) assert.doesNotMatch(s.label, /^×/);
});
