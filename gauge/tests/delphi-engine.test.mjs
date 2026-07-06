import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeFinal, delphiStats} from '../engine.js';
import {parse} from '../parse.js';

const model = parse('Ship by Q3 :: prob\nWeeks to migrate :: range weeks');

const r1 = [
  {who: 'aaaa1111', values: [80, [10, 20]]},
  {who: 'bbbb2222', values: [20, [2, 6]]},
  {who: 'cccc3333', values: [50, [8, 12]]},
];
const r2 = [
  {who: 'aaaa1111', values: [60, [8, 14]]},
  {who: 'bbbb2222', values: [45, null]},      // revised the prob, kept quiet on the range
];

test('mergeFinal: round-2 answers win, absent participants carry forward', () => {
  const fin = mergeFinal(r1, r2);
  const byWho = Object.fromEntries(fin.map(e => [e.who, e.values]));
  assert.deepEqual(byWho['aaaa1111'], [60, [8, 14]]);
  assert.deepEqual(byWho['bbbb2222'], [45, [2, 6]]);   // null in r2 → r1 range survives
  assert.deepEqual(byWho['cccc3333'], [50, [8, 12]]);  // never resubmitted
  assert.equal(fin.length, 3);
});

test('mergeFinal: a round-2-only participant is included', () => {
  const fin = mergeFinal(r1, [...r2, {who: 'dddd4444', values: [10, null]}]);
  assert.equal(fin.length, 4);
});

test('delphiStats: pooled maths and convergence per question', () => {
  const d = delphiStats(model, r1, r2);
  assert.equal(d.length, 2);
  const [prob, range] = d;
  assert.equal(prob.pooled, 50);                       // median of 60,45,50
  assert.equal(prob.spread1, 60);                      // 80−20
  assert.equal(prob.spread2, 15);                      // 60−45
  assert.ok(Math.abs(prob.convergencePct - 75) < 1e-9);
  assert.match(prob.headline, /narrowed/i);
  assert.deepEqual(range.pooledRange, [8, 12]);        // medians of lows/highs (8,2,8 / 14,6,12)
  assert.ok(range.spread1 > 0 && range.spread2 > 0);
});

test('delphiStats: an unmoved room says so honestly', () => {
  const same = delphiStats(model, r1, []);             // nobody resubmitted
  assert.ok(Math.abs(same[0].convergencePct) < 1e-9);
  assert.match(same[0].headline, /barely moved|didn.t move|unchanged/i);
});

test('delphiStats: widening is reported, not hidden', () => {
  const wider = delphiStats(model, r1, [
    {who: 'aaaa1111', values: [95, null]},
    {who: 'bbbb2222', values: [5, null]},
  ]);
  assert.ok(wider[0].convergencePct < -10);
  assert.match(wider[0].headline, /widened/i);
});

test('delphiStats: empty rounds stay finite', () => {
  const d = delphiStats(model, [], []);
  for(const q of d){
    assert.equal(q.n, 0);
    assert.doesNotMatch(JSON.stringify(q), /NaN|Infinity/);
  }
});

test('delphiStats: perfect round-1 agreement is not called disagreement', () => {
  const agree = [{who: 'a1', values: [50, [10, 10]]}, {who: 'b2', values: [50, [10, 10]]}];
  const d = delphiStats(model, agree, []);
  assert.doesNotMatch(d[0].headline, /disagreement/);
  assert.match(d[0].headline, /agree/i);
});

test('delphiStats: widening from zero round-1 spread reads as widened', () => {
  const agree = [{who: 'a1', values: [50, [10, 10]]}, {who: 'b2', values: [50, [10, 10]]}];
  const d = delphiStats(model, agree, [{who: 'a1', values: [80, null]}]);
  assert.match(d[0].headline, /widened/);
});

test('delphiStats: a single respondent is not a disagreement', () => {
  const d = delphiStats(model, [{who: 'a1', values: [50, [10, 20]]}], []);
  assert.doesNotMatch(d[0].headline, /disagreement/);
});
