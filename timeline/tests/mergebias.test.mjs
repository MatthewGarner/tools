import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normCdf, jointAt, mergeBias} from '../mergebias.js';

const near = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b} (eps ${e})`);
const Z90p = 1.2815515655;
const R = (lane, p50, p90, single = false, status = null) => ({lane, label: lane, p50, p90, single, status});
const fit = (p50, p90) => ({p50, p90, sigma: (p90 - p50) / Z90p});

test('normCdf hits known values', () => {
  near(normCdf(0), .5); near(normCdf(1.2815515655), .90);
  near(normCdf(1.6448536), .95); near(normCdf(-1), .1587);
});

test('jointAt: five identical 80%-by-D lanes ≈ 0.33, two ≈ 0.64', () => {
  const sigma = 10, D = 0.8416212 * sigma;               // Φ(0.8416)=0.80
  const ls = n => Array.from({length: n}, () => ({p50: 0, p90: 0, sigma}));
  near(jointAt(ls(2), D), 0.64, 0.01);
  near(jointAt(ls(5), D), 0.33, 0.01);
});

test('mergeBias: nominal lane at 0.5, pAll ≤ 0.5, d80 achieves ≥0.8 (whole day)', () => {
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160)]}, 0);
  assert.ok(mb && mb.rangedLanes === 2);
  assert.equal(mb.byDate, 120);
  assert.ok(mb.pAll <= 0.5 + 1e-9);
  assert.ok(mb.laneP.some(p => Math.abs(p - 0.5) < 1e-9), 'nominal lane pinned at 0.5');   // M3
  assert.ok(jointAt([fit(100, 130), fit(120, 160)], mb.d80) >= 0.80 - 1e-6);
  assert.ok(mb.d80 >= mb.byDate && mb.weeksLater >= 0);
  assert.equal(mb.d80, Math.ceil(mb.d80));
});

test('gates: 1 lane / single-date completion / X≤today / flat doc → null', () => {
  assert.equal(mergeBias({items: [R('A', 100, 130)]}, 0), null);
  assert.equal(mergeBias({items: [R('A', 100, 130), R('B', 120, 120, true)]}, 0), null);
  assert.equal(mergeBias({items: [R('A', 100, 130), R('B', 120, 160)]}, 200), null);        // X=120 ≤ today
  assert.equal(mergeBias({items: [R('', 100, 130), R('', 120, 160)]}, 0), null);            // flat → one lane ''
});

test('latest non-done completion picked per lane (tie: max p50 then max p90)', () => {
  const two = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), R('B', 110, 120, true)]}, 0);
  assert.ok(two && two.rangedLanes === 2 && two.byDate === 120);        // B completion = the 120..160 (latest p50)
  // tie on p50, higher p90 wins (M2)
  const tie = mergeBias({items: [R('A', 100, 130), R('B', 120, 150), R('B', 120, 180)]}, 0);
  assert.equal(tie.byDate, 120);
  assert.ok(jointAt([fit(100, 130), fit(120, 180)], tie.d80) >= 0.80 - 1e-6);   // used the 120..180 sigma
});

test('all-done lanes are dropped (landed, not "single-date") (M1)', () => {
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), R('C', 90, 110, true, 'done')]}, 0);
  assert.ok(mb && mb.rangedLanes === 2 && mb.excludedSingle === 0);     // done C not counted as excluded-single
});

test('σ=0 (same-day range) excluded + counted, even when it would set X (I2)', () => {
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), R('C', 140, 140)]}, 0);   // C !single but p90===p50
  assert.ok(mb && mb.rangedLanes === 2);
  assert.equal(mb.excludedSingle, 1);
  assert.equal(mb.byDate, 120);                                        // C did NOT set X (would NaN)
});
