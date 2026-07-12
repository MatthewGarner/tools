import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rangeStats, probStats, chipsStats, delphiStats, RATIO_DIVERGENT, SPLIT_GAP, AGREE_SPREAD} from '../engine.js';

/* ---- range fixtures ---- */
const R_AGREE = [{low: 4, high: 8}, {low: 5, high: 9}, {low: 3, high: 7}];        // common zone 5–7
const R_OUTLIER = [{low: 4, high: 6}, {low: 5, high: 7}, {low: 30, high: 50}];    // no overlap, pooled >> widths
const R_EDGES = [{low: 4, high: 6}, {low: 6.5, high: 8}];                         // near miss, ratio < 3

test('range agreement: overlap zone found, kind agreement', () => {
  const s = rangeStats(R_AGREE);
  assert.equal(s.kind, 'agreement');
  assert.deepEqual(s.overlap, {lo: 5, hi: 7});
  assert.deepEqual(s.pooled, {lo: 3, hi: 9});
  assert.equal(s.discuss, false);
  assert.ok(s.headline.toLowerCase().includes('agreement'));
});

test('range rows sorted by midpoint', () => {
  const s = rangeStats(R_AGREE);
  assert.deepEqual(s.rows.map(r => r.mid), [5, 6, 7]);
});

test('range one-outlier: divergent, ratio over threshold', () => {
  const s = rangeStats(R_OUTLIER);
  assert.equal(s.kind, 'divergent');
  assert.equal(s.overlap, null);
  assert.ok(s.ratio >= RATIO_DIVERGENT);
  assert.equal(s.discuss, true);
  assert.ok(s.headline.includes('wider than any individual'));
});

test('range near-miss: moderate, still discuss', () => {
  const s = rangeStats(R_EDGES);
  assert.equal(s.kind, 'moderate');
  assert.equal(s.overlap, null);
  assert.ok(s.ratio < RATIO_DIVERGENT);
  assert.equal(s.discuss, true);
});

test('range tiny-n', () => {
  assert.equal(rangeStats([]).kind, 'empty');
  const one = rangeStats([{low: 1, high: 2}]);
  assert.equal(one.kind, 'single');
  assert.equal(one.discuss, false);
  assert.equal(one.rows.length, 1);
});

test('range zero-width intervals do not divide by zero', () => {
  const s = rangeStats([{low: 5, high: 5}, {low: 9, high: 9}]);
  assert.equal(s.overlap, null);
  assert.equal(s.kind, 'divergent');   // ratio Infinity
});

/* ---- prob fixtures ---- */
const P_AGREE = [{value: 60}, {value: 65}, {value: 70}, {value: 62}];
const P_CAMPS = [{value: 25}, {value: 30}, {value: 80}, {value: 88}];
const P_SPREAD = [{value: 10}, {value: 40}, {value: 55}, {value: 75}, {value: 90}];

test('prob agreement inside AGREE_SPREAD', () => {
  const s = probStats(P_AGREE);
  assert.equal(s.kind, 'agreement');
  assert.ok(s.spread <= AGREE_SPREAD);
  assert.equal(s.discuss, false);
  assert.equal(s.median, 63.5);
});

test('prob two camps: gap over SPLIT_GAP and half the spread', () => {
  const s = probStats(P_CAMPS);
  assert.equal(s.kind, 'split');
  assert.ok(s.gap >= SPLIT_GAP);
  assert.equal(s.camps.lo.n, 2);
  assert.equal(s.camps.hi.n, 2);
  assert.equal(Math.round(s.camps.lo.center), 28);
  assert.equal(Math.round(s.camps.hi.center), 84);
  assert.match(s.headline, /^Split room: half near 28%, half near 84%\.$/);
});

test('prob uneven camps word the shares', () => {
  const s = probStats([{value: 20}, {value: 25}, {value: 30}, {value: 85}]);
  assert.equal(s.kind, 'split');
  assert.match(s.headline, /most near 25%, a few near 85%/);
});

test('prob wide spread without a clean gap', () => {
  const s = probStats(P_SPREAD);
  assert.equal(s.kind, 'spread');
  assert.equal(s.discuss, true);
  assert.match(s.headline, /10%.*90%.*55%/);
});

test('prob split needs n >= 4', () => {
  assert.notEqual(probStats([{value: 10}, {value: 90}]).kind, 'split');
});

test('prob tiny-n', () => {
  assert.equal(probStats([]).kind, 'empty');
  assert.equal(probStats([{value: 50}]).kind, 'single');
});

/* ---- session-level ---- */
import {sessionStats, verdict, markdownSummary} from '../engine.js';
import {parse} from '../parse.js';

const MODEL = parse('title: T\nShip by Q3 :: prob\nWeeks to migrate :: range weeks');
const RESP = [
  {values: [80, [4, 8]], name: 'Ana'},
  {values: [70, [5, 9]], name: 'Ben'},
  {values: [65, [3, 7]], name: 'Cy'},
  {values: [null, [5, 8]], name: 'Di'},
];

test('sessionStats aligns answers to questions and skips nulls', () => {
  const st = sessionStats(MODEL, RESP);
  assert.equal(st.length, 2);
  assert.equal(st[0].question.type, 'prob');
  assert.equal(st[0].n, 3);           // Di skipped the prob
  assert.equal(st[1].n, 4);
  assert.equal(st[1].rows[0].name, 'Cy');   // names carried into rows
});

test('sessionStats ignores mis-shaped entries rather than throwing', () => {
  const st = sessionStats(MODEL, [{values: [[1, 2], 50]}]);   // swapped shapes
  assert.equal(st[0].n, 0);
  assert.equal(st[1].n, 0);
});

test('verdict counts and names the discuss items', () => {
  const model = parse('A :: prob\nB :: prob\nC :: prob');
  const agree = [{value: 50}, {value: 55}, {value: 52}, {value: 58}];
  const split = [{value: 10}, {value: 15}, {value: 85}, {value: 90}];
  const st = sessionStats(model, [0, 1, 2, 3].map(i =>
    ({values: [agree[i].value, split[i].value, agree[i].value]})));
  assert.equal(verdict(st), 'Broad agreement on 2 of 3 items; discuss #2.');
});

test('verdict edge wordings', () => {
  const model = parse('A :: prob\nB :: prob');
  const agree = i => [50, 52, 55, 51][i];
  const stAll = sessionStats(model, [0, 1, 2, 3].map(i => ({values: [agree(i), agree(i)]})));
  assert.equal(verdict(stAll), 'Broad agreement across all 2 items.');
  const split = i => [10, 12, 88, 90][i];
  const stNone = sessionStats(model, [0, 1, 2, 3].map(i => ({values: [split(i), split(i)]})));
  assert.equal(verdict(stNone), 'No consensus anywhere — every item is worth discussion.');
  assert.equal(verdict(sessionStats(parse('A :: prob'), [{values: [50]}])), '');
});

test('markdownSummary carries title, verdict, headlines, numbers', () => {
  const st = sessionStats(MODEL, RESP);
  const md = markdownSummary(MODEL, st);
  assert.ok(md.startsWith('# T'));
  assert.ok(md.includes('## 1. Ship by Q3'));
  assert.ok(md.includes(st[0].headline));
  assert.ok(md.includes('median'));
  assert.ok(md.includes('weeks'));
});

/* ---- chips (confidence auction) ---- */
const {equal: ceq, ok: cok} = assert;
const OPTS = ['A', 'B', 'C'];
const a = alloc => ({alloc});

test('chips: winners differ → "says A but bets on B"', () => {
  const s = chipsStats([a([40, 30, 30]), a([40, 35, 25]), a([40, 30, 30]), a([0, 100, 0])], OPTS);
  ceq(s.stated, 0);                        // A: 3 first-choice votes
  ceq(s.conviction, 1);                    // B: 195 chips vs A 120
  cok(s.discuss);
  cok(s.headline.includes('says A') && s.headline.includes('bets on B'));
});

test('chips: same winner, weak share → conviction is spread', () => {
  const s = chipsStats([a([40, 30, 30]), a([35, 35, 30]), a([38, 32, 30])], OPTS);
  ceq(s.stated, 0); ceq(s.conviction, 0);
  cok(s.perOption[0].share < 40 && s.discuss);
  cok(s.headline.includes('conviction is spread'));
});

test('chips: same winner, strong share → wins both ways, no discuss', () => {
  const s = chipsStats([a([70, 20, 10]), a([60, 20, 20]), a([80, 10, 10])], OPTS);
  cok(!s.discuss);
  cok(s.headline.includes('wins both ways'));
});

test('chips: exact top-pile tie is an abstention, reported', () => {
  const s = chipsStats([a([50, 50, 0]), a([60, 20, 20])], OPTS);
  ceq(s.abstentions, 1);
  ceq(s.perOption[0].votes + s.perOption[1].votes + s.perOption[2].votes, 1);
});

test('chips: hedging note when median top pile < 50', () => {
  const s = chipsStats([a([40, 30, 30]), a([35, 35, 30]), a([40, 40, 20])], OPTS);
  cok(s.hedging && s.headline.includes('hedg'));
});

test('chips: bad sums normalised defensively', () => {
  const s = chipsStats([a([30, 20, 0])], OPTS);        // sums 50 (relay should prevent; engine survives)
  ceq(Math.round(s.perOption[0].share + s.perOption[1].share + s.perOption[2].share), 100);
});

test('chips: empty and single reuse existing kinds', () => {
  ceq(chipsStats([], OPTS).kind, 'empty');
  ceq(chipsStats([a([50, 30, 20])], OPTS).kind, 'single');
});

test('sessionStats routes chips values', () => {
  const model = parse('Pick :: chips A | B | C');
  const stats = sessionStats(model, [{values: [[60, 25, 15]]}, {values: [[10, 80, 10]]}]);
  ceq(stats[0].perOption.length, 3);
});

test('delphiStats excludes chips from convergence', () => {
  const model = parse('Pick :: chips A | B');
  const d = delphiStats(model, [{who: 'x', values: [[60, 40]]}], [{who: 'x', values: [[40, 60]]}]);
  cok(d[0].excluded);
  cok(d[0].headline.includes("don't pool"));
});
