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

test('stale lane: a fitted lane past its own P90 is flagged and KEPT (a)', () => {
  // A finishes 100..130; at today=140 it has blown its P90 and is still open, B (150..200) hasn't
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 150, 200)]}, 140);
  assert.ok(mb && mb.rangedLanes === 2, 'the stale lane stays in the joint — dropping it would only RAISE pAll');
  assert.equal(mb.stale, 1);
  // strict boundary: p90 === today is "due today", not past
  assert.equal(mergeBias({items: [R('A', 100, 130), R('B', 150, 200)]}, 130).stale, 0);
  // a DONE lane past its P90 never flags — it landed, and is dropped before the count
  const withDone = mergeBias({items: [R('A', 100, 130), R('B', 150, 200), R('C', 80, 110, false, 'done')]}, 140);
  assert.equal(withDone.stale, 1);
});

test('σ=0 (same-day range) excluded + counted, even when it would set X (I2)', () => {
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), R('C', 140, 140)]}, 0);   // C !single but p90===p50
  assert.ok(mb && mb.rangedLanes === 2);
  assert.equal(mb.excludedSingle, 1);
  assert.equal(mb.byDate, 120);                                        // C did NOT set X (would NaN)
});

test('a [fixed] item is not a workstream: the lane keeps its real whisker', () => {
  // Build holds BOTH a ranged workstream and an external fixed event. Picking the
  // fixed one as the lane finish would drop the Build whisker out of the joint.
  const mb = mergeBias({items: [
    R('Grid', 100, 130),
    R('Build', 120, 160),
    {lane: 'Build', label: 'Ofgem decision', p50: 300, p90: 300, single: true, status: 'fixed'},
  ]}, 0);
  assert.equal(mb.rangedLanes, 2, 'both lanes still fitted');
  assert.equal(mb.byDate, 120, 'nominal end is the Build whisker, not the fixed date');
  assert.equal(mb.excludedSingle, 0, 'a fixed item is not an "uncounted single-date lane"');
});

test('a lane holding ONLY a fixed item vanishes rather than counting as excluded', () => {
  const mb = mergeBias({items: [
    R('A', 100, 130), R('B', 120, 160),
    {lane: 'Ext', label: 'Expiry', p50: 400, p90: 400, single: true, status: 'fixed'},
  ]}, 0);
  assert.equal(mb.rangedLanes, 2);
  assert.equal(mb.excludedSingle, 0);
});

test('d80 is a property of the PLAN: bracketed and tight regardless of byDate', () => {
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160)]}, 0);
  const ls = [fit(100, 130), fit(120, 160)];
  assert.ok(jointAt(ls, mb.d80) >= 0.80 - 1e-9, 'd80 achieves 80%');
  assert.ok(jointAt(ls, mb.d80 - 1) < 0.80, 'and is the FIRST whole day that does');
});

test('freshness guard: every lane median already past ⇒ null', () => {
  assert.equal(mergeBias({items: [R('A', 100, 130), R('B', 120, 160)]}, 200), null);
});
