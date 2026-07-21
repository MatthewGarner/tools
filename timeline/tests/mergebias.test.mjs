import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normCdf, jointAt, mergeBias, laneFits, fixedDeadline, passedDeadline, laneVsDeadline} from '../mergebias.js';

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
  // fixed one as the lane finish would drop the Build whisker out of the joint —
  // and because that leaves one fitted lane, mergeBias would go silent entirely.
  const items = [
    R('Grid', 100, 130),
    R('Build', 120, 160),
    {lane: 'Build', label: 'Ofgem decision', p50: 300, p90: 300, single: true, status: 'fixed'},
  ];
  const {lanes, excludedSingle} = laneFits({items}, 0);
  assert.deepEqual(lanes.map(l => l.name), ['Grid', 'Build'], 'both lanes fitted');
  assert.equal(lanes[1].p90, 160, 'Build fitted from its whisker, not the fixed gate');
  assert.equal(excludedSingle, 0, 'a fixed item is not an "uncounted single-date lane"');
  assert.equal(mergeBias({items}, 0).rangedLanes, 2);
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

const FX = (label, p50) => ({lane: '', label, p50, p90: p50, single: true, status: 'fixed'});

test('fixedDeadline: latest FUTURE fixed date, with a count of the candidates', () => {
  const model = {items: [FX('Gate', 300), FX('Expiry', 500), FX('Past', 50)]};
  const d = fixedDeadline(model, 100);
  assert.equal(d.day, 500);
  assert.equal(d.label, 'Expiry');
  assert.equal(d.count, 2, 'only future ones count');
  assert.equal(fixedDeadline({items: [FX('Past', 50)]}, 100), null);
  assert.equal(fixedDeadline({items: []}, 100), null);
});

test('fixedDeadline: a tie resolves to document order (deterministic)', () => {
  const d = fixedDeadline({items: [FX('First', 300), FX('Second', 300)]}, 0);
  assert.equal(d.label, 'First');
});

test('passedDeadline: the latest fixed date already gone', () => {
  assert.equal(passedDeadline({items: [FX('Gate', 300)]}, 100), null);
  assert.equal(passedDeadline({items: [FX('A', 50), FX('B', 80)]}, 100).label, 'B');
});

test('with a deadline: byDate IS the deadline and pAll is measured there', () => {
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), FX('Ofgem', 300)]}, 0);
  assert.equal(mb.byDate, 300);
  assert.equal(mb.deadline.label, 'Ofgem');
  near(mb.pAll, jointAt([fit(100, 130), fit(120, 160)], 300), 1e-12);
});

test('d80 stays bracketed with the deadline on EITHER side of the plan', () => {
  const ls = [fit(100, 130), fit(120, 160)];
  for(const dl of [140, 300, 5000]){                       // inside, past, far past
    const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), FX('D', dl)]}, 0);
    assert.ok(jointAt(ls, mb.d80) >= 0.80 - 1e-9, `d80 achieves 80% (deadline ${dl})`);
    assert.ok(jointAt(ls, mb.d80 - 1) < 0.80, `d80 is the first such day (deadline ${dl})`);
  }
});

test('a comfortable deadline yields a NEGATIVE gap — the "inside it" case is reachable', () => {
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), FX('D', 5000)]}, 0);
  assert.ok(mb.d80 < mb.byDate, 'd80 lands well inside a far-off deadline');
  assert.ok(mb.weeksLater < 0);
});

test('HONESTY: an all-stale plan is not resurrected by a future fixed date', () => {
  // both lanes blew their P90 long ago and are still open; jointAt(deadline) ≈ 1
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), FX('Statutory', 400)]}, 300);
  assert.equal(mb, null, 'no rosy headline on a plan that is entirely overdue');
});

test('mergeBias reports a passed deadline only when no future one exists', () => {
  const gone = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), FX('Ofgem', 20)]}, 60);
  assert.equal(gone.deadline, null);
  assert.equal(gone.passed.label, 'Ofgem');
  assert.equal(gone.passed.agoDays, 40);
  const live = mergeBias({items: [R('A', 100, 130), R('B', 120, 160), FX('Ofgem', 20), FX('Next', 400)]}, 60);
  assert.equal(live.passed, null, 'a live deadline supersedes the dead one');
});

test('laneVsDeadline: exactly one ranged lane plus a deadline', () => {
  const one = laneVsDeadline({items: [R('Grid', 100, 130), FX('Ofgem', 200)]}, 0);
  assert.equal(one.name, 'Grid');
  assert.equal(one.deadline.day, 200);
  near(one.p, normCdf((200 - 100) / ((130 - 100) / Z90p)), 1e-12);
  assert.equal(laneVsDeadline({items: [R('Grid', 100, 130)]}, 0), null, 'no deadline');
  assert.equal(laneVsDeadline({items: [R('A', 100, 130), R('B', 120, 160), FX('D', 300)]}, 0), null, 'two lanes');
  assert.equal(laneVsDeadline({items: [R('Grid', 100, 130), FX('D', 300)]}, 200), null, 'stale lane');
});

test('no fixed date ⇒ deadline/passed are null and everything else is unchanged', () => {
  const mb = mergeBias({items: [R('A', 100, 130), R('B', 120, 160)]}, 0);
  assert.equal(mb.deadline, null);
  assert.equal(mb.passed, null);
  assert.equal(mb.byDate, 120);
  assert.ok(mb.weeksLater >= 0);
});
