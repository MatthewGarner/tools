/* The lane model (engine-correctness spec, Part 3 A): the minimum rule (TL-4), the
   conditional on "not finished by today" (TL-Q5), a double-precision normal (TL-2,
   TL-3), stale (TL-22), passed (TL-5), lane folding (TL-20) and the zero-width range
   (TL-19). References here are independent of the code under test. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normCdf, logSurvival, lateProb, jointAt, mergeBias, laneFits, fixedDeadline, passedDeadline} from '../mergebias.js';
import {parse, parseDate} from '../parse.js';

const Z90 = 1.2815515655446004;
// reference Phi: Taylor series below 3, continued fraction beyond; good to ~1e-15
const SQ2PI = Math.sqrt(2 * Math.PI);
function Q(x){
  if(x < 3){ let t = x, s = x, n = 0; while(Math.abs(t) > 1e-18 && n < 500){ n++; t *= x * x / (2 * n + 1); s += t; } return 0.5 - Math.exp(-x * x / 2) / SQ2PI * s; }
  let f = 0; for(let k = 200; k >= 1; k--) f = k / (x + f);
  return Math.exp(-x * x / 2) / SQ2PI / (x + f);
}
const Phi = x => x < 0 ? Q(-x) : 1 - Q(x);
const R = (lane, p50, p90, single = false, status = null) => ({lane, label: lane + p50, p50, p90, single, status});

test('normCdf is double precision: relative error below 1e-12 in the lower tail, 1e-13 absolute elsewhere', () => {
  for(const z of [-8, -6, -5, -4, -3, -2, -1, -0.3, 0, 0.5, 1, 1.2815515655446004, 2.5, 3.5, 6]){
    const want = Phi(z), got = normCdf(z);
    assert.ok(Math.abs(got - want) <= Math.max(1e-13, want * 1e-12 * (z < 0 ? 1 : 0)), `z=${z}: ${got} vs ${want}`);
    if(z <= -3) assert.ok(Math.abs(got - want) / want < 1e-12, `relative at z=${z}`);
  }
  assert.ok(Math.abs(normCdf(Z90) - 0.9) < 1e-13);
});

test('logSurvival is exact in the far tail and never NaN', () => {
  assert.ok(Math.abs(logSurvival(6) - Math.log(9.865876450376946e-10)) < 1e-10);
  for(const z of [20, 60, 200]){                         // Mills ratio asymptotic series
    const want = -z * z / 2 - Math.log(z) - 0.5 * Math.log(2 * Math.PI) + Math.log(1 - 1 / z ** 2 + 3 / z ** 4 - 15 / z ** 6 + 105 / z ** 8 - 945 / z ** 10);
    assert.ok(Math.abs(logSurvival(z) - want) < 1e-9, `z=${z}: ${logSurvival(z)} vs ${want}`);
  }
  assert.ok(Math.abs(logSurvival(-40)) < 1e-12);           // survives almost surely
  for(const z of [-1e6, -50, 0, 50, 1e6]) assert.ok(Number.isFinite(logSurvival(z)));
});

/* ---- TL-Q5: P(done by D | not done by today) = 1 - S(D)/S(today) ---- */
function integrated(zT, zD){                              // numerical integration of the normal density, scaled by phi(zT)
  const f = u => Math.exp(-(u * u / 2 + u * zT));
  const simpson = (a, b, n) => { const h = (b - a) / n; let s = f(a) + f(b); for(let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; };
  const umax = 60 / (Math.max(zT, 0) + 1) + 12;
  return simpson(0, zD - zT, 20000) / simpson(0, umax, 200000);
}
test('lateProb equals the integrated conditional density for lanes 0, 1, 5, 20 and 60 sigma late', () => {
  for(const nLate of [0, 1, 5, 20, 60]){
    const lane = {p50: 1000, sigma: 10}, today = 1000 + nLate * 10;
    for(const frac of [0.05, 0.5, 1, 2, 5]){
      const D = today + frac * 10 / (nLate + 1), want = integrated(nLate, (D - 1000) / 10), got = lateProb(lane, D, today);
      assert.ok(Math.abs(got - want) < 1e-7, `${nLate} sigma late, D=today+${frac}: ${got} vs ${want}`);
    }
  }
});
test('lateProb: in [0,1], non-decreasing in D, never above the unconditional value, never NaN', () => {
  for(const nLate of [-3, 0, 1, 5, 20, 60, 400]){
    const lane = {p50: 0, sigma: 7}, today = nLate * 7;
    let prev = -1;
    for(let D = today - 50; D <= today + 400; D += 3){
      const p = lateProb(lane, D, today);
      assert.ok(p >= 0 && p <= 1 && !Number.isNaN(p), `p=${p}`);
      assert.ok(p >= prev - 1e-15, 'non-decreasing');
      assert.ok(p <= normCdf((D - lane.p50) / lane.sigma) + 1e-15, 'never above the unconditional');
      prev = p;
    }
  }
});
test('a lane well ahead of today is unchanged to printed precision', () => {
  const lane = {p50: 100, sigma: 10};
  assert.ok(Math.abs(lateProb(lane, 120, 0) - normCdf(2)) < 1e-12);
});
test('worked example: past its median but not its P90, the lane reads lower than the unconditional', () => {
  // median 20 Aug, P90 a long way on; today 5 Sep (16 days past the median), asking for 15 Dec
  const p50 = parseDate('2026-08-20'), p90 = parseDate('2026-12-31'), sigma = (p90 - p50) / Z90, D = parseDate('2026-12-15');
  assert.ok(Math.abs(lateProb({p50, sigma}, D, parseDate('2026-09-05')) - (1 - Phi(-(D - p50) / sigma) / Phi(-(parseDate('2026-09-05') - p50) / sigma))) < 1e-9);
  assert.ok(lateProb({p50, sigma}, D, parseDate('2026-09-05')) < normCdf((D - p50) / sigma));
});

/* ---- TL-4: the minimum rule ---- */
test('a lane is done when its slowest open ranged item is: G(D) = min F_i(D)', () => {
  // A: a tight item (p50 100, p90 130) and an early one with a long tail (p50 90, p90 400); B one item.
  const items = [R('A', 100, 130), R('A', 90, 400), R('B', 100, 130), R('Gate', 200, 200, true, 'fixed')];
  const sA1 = 30 / Z90, sA2 = 310 / Z90, sB = 30 / Z90;
  const want = Math.min(Phi((200 - 100) / sA1), Phi((200 - 90) / sA2)) * Phi((200 - 100) / sB);
  const mb = mergeBias({items}, -5000);                    // today far behind: no conditioning to speak of
  assert.ok(Math.abs(mb.pAll - want) < 1e-9, `${mb.pAll} vs ${want}`);
  const old = Phi((200 - 100) / sA1) * Phi((200 - 100) / sB);
  assert.ok(mb.pAll < old - 0.2, 'the long-tailed early item now binds');
  // lane P50/P90 shown stay those of the latest-P50 item; nominal is the latest P50
  const a = laneFits({items}, -5000).lanes.find(l => l.name === 'A');
  assert.equal(a.p50, 100); assert.equal(a.p90, 130);
  assert.equal(mb.d80 >= 200 || mb.d80 > 100, true);
});
test('min rule against a brute-force reference over random lanes, with d80 against a day scan', () => {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for(let n = 0; n < 200; n++){
    const items = [], K = 2 + Math.floor(rnd() * 3);
    for(let k = 0; k < K; k++) for(let j = 0, J = 1 + Math.floor(rnd() * 3); j < J; j++){
      const p50 = 100 + Math.floor(rnd() * 200); items.push(R('L' + k, p50, p50 + 40 + Math.floor(rnd() * 200)));
    }
    const today = 50 + Math.floor(rnd() * 250), mb = mergeBias({items}, today);
    if(!mb) continue;
    const fits = laneFits({items}, today).lanes;
    // brute-force: lane survival = max of its items' survival; conditional on today
    const G = (D, lane) => {
      const its = items.filter(i => i.lane === lane && !i.single);
      const S = x => Math.max(...its.map(i => Q((x - i.p50) / ((i.p90 - i.p50) / Z90))));
      return D <= today ? 0 : 1 - S(D) / S(today);
    };
    const joint = D => fits.reduce((p, l) => p * G(D, l.name), 1);
    assert.ok(Math.abs(mb.pAll - joint(mb.byDate)) < 1e-9, `pAll ${mb.pAll} vs ${joint(mb.byDate)}`);
    let d = mb.byDate; while(joint(d) < 0.8) d++;
    assert.equal(mb.d80, d, 'd80 equals the day-by-day scan');
    assert.ok(jointAt(fits, mb.d80, today) >= 0.8 && jointAt(fits, mb.d80 - 1, today) < 0.8 || mb.d80 === mb.byDate);
  }
});
test('a lane whose latest-P50 open item is a single date is still left out', () => {
  const r = laneFits({items: [R('A', 100, 130), R('A', 120, 120, true), R('B', 100, 140)]}, 0);
  assert.equal(r.lanes.length, 1); assert.equal(r.excludedSingle, 1);
});

/* ---- TL-22 / TL-5 / TL-20 / TL-19 ---- */
test('stale counts a lane when ANY open ranged item is past its P90', () => {
  const r = laneFits({items: [R('A', 10, 20), R('A', 90, 140), R('B', 100, 160)]}, 50);
  assert.equal(r.stale, 1);
  assert.equal(laneFits({items: [R('A', 10, 50), R('A', 90, 140), R('B', 100, 160)]}, 50).stale, 0, 'P90 equal to today is due, not past');
});
test('passed means strictly before today: a fixed date equal to today is the deadline', () => {
  const m = {items: [R('A', 100, 140), R('B', 100, 150), R('G', 70, 70, true, 'fixed')]};
  assert.equal(fixedDeadline(m, 70).day, 70);
  assert.equal(passedDeadline(m, 70), null);
  assert.equal(passedDeadline(m, 71).day, 70);
  assert.equal(fixedDeadline(m, 71), null);
});
test('lane identity folds case and runs of spaces; the first spelling is displayed', () => {
  const m = parse('App  Core: a 2026-10-01 .. 2026-12-01\napp core: b 2026-11-01 .. 2027-01-01\nOther: c 2026-11-01 .. 2027-01-01');
  const r = laneFits(m, parseDate('2026-09-01'));
  assert.equal(r.lanes.length, 2);
  assert.equal(r.lanes[0].name, 'App  Core');
});
test('a range whose two ends are the same day is a single date, with the single-date warning', () => {
  const m = parse('A: a 2026-10-05 .. 2026-10-05');
  assert.equal(m.items[0].single, true);
  assert.ok(m.warnings.some(w => /same day at both ends/.test(w)), m.warnings.join('|'));
});
