/* Engine audit fixes (RK-1, 5-17): each test names the finding it guards. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulate, verdictCopy, flipAnalysis, flipCopy, perRowKnife, orderDiff, orderDiffCopy,
  parsePaste, readLinkItems, mdCell, weightWobbleText, wobbleFactorText, readWobbleWeights, readWobbleScores} from '../engine.js';
import {rankResultRows, pctStr} from '../render.js';
import {EXAMPLES, DEFAULT_CRITERIA, DEFAULT_EFFORT} from '../examples.js';

const mk = (items, {k = 3, ww = 50, sw = 1, w = DEFAULT_CRITERIA.map(c => c.w)} = {}) => ({
  criteria: DEFAULT_CRITERIA.map((c, i) => ({name: c.name, w: w[i]})), effort: {...DEFAULT_EFFORT},
  items: items.map(r => ({name: r[0], s: r.slice(1, 4), e: r[4]})), k, ww, sw});
const verdictOf = st => { const r = simulate(st); return {r, v: verdictCopy(r.stats, r.k, {setShare: r.setShare})}; };

/* ---------- RK-1: exact ties share places ---------- */
test('RK-1 two interchangeable rows with no score wobble split first place and are not one settled winner', () => {
  const {r, v} = verdictOf(mk([['Alpha', 6, 6, 6, 5], ['Beta', 6, 6, 6, 5], ['Gamma', 2, 2, 2, 9]], {k: 1, sw: 0}));
  assert.equal(r.stats[0].ptop, 0.5);
  assert.equal(r.stats[1].ptop, 0.5);
  assert.equal(r.stats[2].ptop, 0);
  assert.doesNotMatch(v.headline, /^The top \d+ is settled/);
  assert.equal(r.stats[0].med, r.stats[1].med, 'rank bands take the same fractional shares');
});
test('RK-1 proportional rows (2,2,2/1 and 4,4,4/2) tie under every weighting and split too', () => {
  const r = simulate(mk([['Small', 2, 2, 2, 1], ['Double', 4, 4, 4, 2], ['Gamma', 2, 2, 2, 9]], {k: 1, sw: 0}));
  assert.equal(r.stats[0].ptop, 0.5);
  assert.equal(r.stats[1].ptop, 0.5);
});
test('RK-1 a tie straddling the cut gives each tied item the fraction of the tied places inside it', () => {
  const r = simulate(mk([['A', 9, 9, 9, 1], ['B', 5, 5, 5, 4], ['C', 5, 5, 5, 4], ['D', 5, 5, 5, 4], ['E', 1, 1, 1, 9]], {k: 2, sw: 0, ww: 0}));
  assert.equal(r.stats[0].ptop, 1);
  for(const i of [1, 2, 3]) assert.ok(Math.abs(r.stats[i].ptop - 1 / 3) < 1e-12, 'one tied place shared by three');
  assert.equal(r.stats[4].ptop, 0);
});
test('RK-1 adds no draw: every built-in prints exactly the bands and P(top-k) it printed before ties were shared', () => {
  const figures = name => { const e = EXAMPLES.find(x => x.name === name); return simulate(mk(e.items, {k: e.k}), {nsim: 4000}).stats.map(s => [s.p10, s.med, s.p90, s.ptop]); };
  assert.deepEqual(figures('Lantern feature backlog'), [[0,0,1,1],[0,1,2,0.96075],[1,2,3,0.5605],[1,3,3,0.47875],[4,4,4,0]]);
  assert.deepEqual(figures('Ops & infra backlog'), [[1,3,4,0.36975],[1,3,4,0.35425],[5,5,6,0],[0,1,4,0.801],[5,6,6,0],[0,0,2,0.973],[1,2,4,0.502]]);
  assert.deepEqual(figures('Classic product backlog'), [[1,3,3,0.398],[0,1,3,0.94425],[5,5,5,0],[0,2,3,0.68375],[4,4,4,0],[0,0,2,0.974]]);
});

/* ---------- RK-5: "settled" is a claim about the set ---------- */
test('RK-5 more than k items clearing the line is a contested cut, not "settled"', () => {
  const {r, v} = verdictOf(mk(Array.from({length: 8}, (_, i) => ['Item ' + (i + 1), 6, 6, 6, 5]), {k: 7, sw: 1}));
  assert.ok(r.stats.every(s => s.ptop >= 0.85), 'each clears the per-item line');
  assert.ok(r.setShare < 0.85, 'but no one group of 7 does');
  assert.doesNotMatch(v.headline, /is settled/);
  assert.match(v.headline, /The cut for the top 7 is contested: 8 initiatives compete for 7 places\./);
});
test('RK-5 all k pass the per-item line but no set does: contested, saying so', () => {
  const v = verdictCopy([{name: 'A', ptop: 0.9}, {name: 'B', ptop: 0.9}, {name: 'C', ptop: 0.9}, {name: 'D', ptop: 0.3}], 3, {setShare: 0.6});
  assert.match(v.headline, /The cut for the top 3 is contested/);
  assert.match(v.body, /no single group of 3 shows up in 85%/);
});
test('RK-5 settled needs one set in at least 85% of runs', () => {
  const stats = [{name: 'A', ptop: 0.99}, {name: 'B', ptop: 0.95}, {name: 'C', ptop: 0.1}];
  assert.match(verdictCopy(stats, 2, {setShare: 0.94}).headline, /The top 2 is settled/);
  assert.match(verdictCopy(stats, 2, {setShare: 0.7}).headline, /contested/);
});
test('RK-5 the engine counts the exact set per run (a straddling tie supports no set)', () => {
  const sure = simulate(mk([['A', 9, 9, 9, 1], ['B', 8, 8, 8, 1], ['C', 1, 1, 1, 9]], {k: 2, sw: 0, ww: 0}));
  assert.equal(sure.setShare, 1);
  const tied = simulate(mk([['A', 9, 9, 9, 1], ['B', 5, 5, 5, 4], ['C', 5, 5, 5, 4]], {k: 2, sw: 0, ww: 0}));
  assert.equal(tied.setShare, 0, 'which of two tied items is in the top 2 is undecided every run');
});

/* ---------- RK-6, 7, 8, 9 ---------- */
test('RK-6 a tie is never named with one item', () => {
  const v = verdictCopy([{name: 'A', ptop: .97}, {name: 'B', ptop: .6}, {name: 'C', ptop: .11}, {name: 'D', ptop: .11}, {name: 'E', ptop: .11}, {name: 'F', ptop: .1}], 2);
  assert.doesNotMatch(v.body, /genuine tie between B/);
  assert.match(v.body, /B is the closest contender/);
});
test('RK-7 an item printed 85% is settled, and 15% is not contested', () => {
  assert.equal(pctStr(0.8496), '85%');
  const v = verdictCopy([{name: 'A', ptop: .97}, {name: 'B', ptop: .8496}, {name: 'C', ptop: .1834}], 2);
  assert.deepEqual(v.contested.map(s => s.name), ['C'], 'B (printed 85%) is settled, so only C (18%) is in the band');
  assert.doesNotMatch(v.body, /Contested.*B \(85%\)/);
  assert.deepEqual(verdictCopy([{name: 'A', ptop: .97}, {name: 'B', ptop: .15004}, {name: 'C', ptop: .5}], 1).contested.map(s => s.name), ['C']);
});
test('RK-8 capacity covering the whole list has no cut to contest', () => {
  const lantern = EXAMPLES[0], r = simulate(mk(lantern.items, {k: 5})), v = verdictCopy(r.stats, r.k, {setShare: r.setShare});
  assert.equal(v.headline, 'There is no cut to contest.');
  assert.doesNotMatch(v.headline + v.body, /settled|Stop tuning/);
});
test('RK-9 "under any reasonable weights" only above 99%; below it the sentence gives the percentage', () => {
  const v = verdictCopy([{name: 'A', ptop: .999}, {name: 'B', ptop: .86}, {name: 'C', ptop: .54}, {name: 'D', ptop: .5}], 3);
  assert.match(v.body, /A makes the cut under any reasonable weights\./);
  assert.match(v.body, /B makes the cut in 86% of reasonable weightings\./);
  assert.doesNotMatch(v.body, /B[^.]*under any reasonable weights/);
});

/* ---------- RK-10, 11, 12: the weight wobble is multiplicative ---------- */
const frag = mk([['Anchor', 10, 1, 1, 1], ['Rival', 1, 9, 1.2, 1], ['Low', 1, 1, 1, 9]], {k: 1, sw: 0});
test('RK-10 the control and the flip line describe the wobble as larger-or-smaller by a factor', () => {
  assert.equal(weightWobbleText(50), 'weights up to 1.5× larger or smaller');
  assert.equal(wobbleFactorText(100), 'up to 2× larger or smaller');
  assert.equal(wobbleFactorText(25), 'up to 1.25× larger or smaller');
  assert.equal(weightWobbleText(0), 'no weight wobble');
});
test('RK-10 a 40% cut is ×0.6, beyond ÷1.5, so it is "beyond", not "inside"', () => {
  const fa = flipAnalysis(frag), fc = flipCopy(fa, 50);
  assert.ok(Math.abs(fa.easiest.pct + 40) < 1, 'the fixture needs a 40% cut');
  assert.equal(fc.tone, 'robust');
  assert.match(fc.text, /beyond the wobble \(weights up to 1\.5× larger or smaller\)/);
  assert.doesNotMatch(fc.text, /inside|±/);
});
test('RK-10 a 33% cut is inside ÷1.5; a 50% raise is inside ×1.5', () => {
  const mkFlip = pct => ({top: {name: 'A'}, easiest: {criterion: 'Value', delta: 3 * pct / 100, newWeight: 3 + 3 * pct / 100, pct, rivalName: 'B'}});
  assert.equal(flipCopy(mkFlip(-33), 50).tone, 'fragile');
  assert.equal(flipCopy(mkFlip(50), 50).tone, 'fragile');
  assert.equal(flipCopy(mkFlip(-34), 50).tone, 'robust');
  assert.match(flipCopy(mkFlip(-33), 50).text, /inside the wobble you already call reasonable \(weights up to 1\.5× larger or smaller\)/);
});
test('RK-11 a tie for first place says first place is already tied', () => {
  const tied = mk([['Alpha', 6, 6, 6, 1], ['Beta', 8, 3, 6, 1], ['Low', 1, 1, 1, 9]], {k: 1});
  const fc = flipCopy(flipAnalysis(tied), 50);
  assert.match(fc.text, /^First place is already tied: Beta scores the same as Alpha/);
  assert.doesNotMatch(fc.text, /0% \(3 → 3\)/);
});
test('RK-12 a figure that prints equal to the limit is "just beyond", not "well beyond"', () => {
  const near = flipCopy({top: {name: 'A'}, easiest: {criterion: 'Value', delta: 1.509, newWeight: 4.509, pct: 50.3, rivalName: 'B'}}, 50);
  assert.match(near.text, /— just beyond the wobble/);
  const far = flipCopy({top: {name: 'A'}, easiest: {criterion: 'Value', delta: 4.5, newWeight: 7.5, pct: 150, rivalName: 'B'}}, 50);
  assert.match(far.text, /— well beyond the wobble/);
});

/* ---------- RK-13, 14, 17: one reader ---------- */
test('RK-13 pasted scores and efforts are clamped to 1-10, so the table and the flip line agree', () => {
  const pasted = parsePaste('Hot, 20, 1, 1, 1\nSteady, 10, 10, 10, 1\nHalf, 5, 5, 5, 0.5');
  assert.ok(pasted.items.every(it => it.s.every(v => v >= 1 && v <= 10) && it.e >= 1 && it.e <= 10));
  const st = {...mk([['x', 1, 1, 1, 1]]), items: pasted.items, k: 1};
  const sim = simulate(st), flip = flipAnalysis(st);
  assert.equal(flip.top.name, sim.stats.find(s => s.i === sim.baseOrder[0]).name);
});
test('RK-13 the flip line and knife-edge read the same clamped values as the simulation, whatever the state holds', () => {
  const hot = mk([['Hot', 20, 1, 1, 1], ['Steady', 10, 10, 10, 1], ['Low', 1, 1, 1, 9]], {k: 1});
  const sim = simulate(hot);
  assert.equal(flipAnalysis(hot).top.name, sim.stats.find(s => s.i === sim.baseOrder[0]).name);
  const clamped = mk([['Hot', 10, 1, 1, 1], ['Steady', 10, 10, 10, 1], ['Low', 1, 1, 1, 9]], {k: 1});
  assert.deepEqual(perRowKnife(hot), perRowKnife(clamped));
  assert.equal(flipCopy(flipAnalysis(hot), 50).text, flipCopy(flipAnalysis(clamped), 50).text);
});
test('RK-14 a damaged row keeps every other result row on its own initiative', () => {
  const broken = {criteria: DEFAULT_CRITERIA.map(c => ({...c})), effort: {...DEFAULT_EFFORT}, k: 2, ww: 50, sw: 1,
    items: [{name: 'Damaged', s: [5, 5, 5], e: NaN}, {name: 'North', s: [9, 9, 9], e: 2}, {name: 'South', s: [3, 3, 3], e: 8}, {name: 'West', s: [6, 2, 6], e: 3}]};
  const r = simulate(broken);
  assert.deepEqual(r.stats.map(s => [s.i, s.name]), [[1, 'North'], [2, 'South'], [3, 'West']]);
  assert.ok(r.baseOrder.every(i => i >= 1));
  const html = rankResultRows(r, perRowKnife(broken));
  for(const [i, name] of [[1, 'North'], [2, 'South'], [3, 'West']])
    assert.match(html, new RegExp('data-item-idx="' + i + '"[^]*?nmtext" title="' + name + '"'));
});
test('RK-14 a link row with a missing or malformed field is repaired in place, so no row changes place', () => {
  const rows = readLinkItems([['Damaged', 5, 5, 5], ['North', 9, 9, 9, 2], ['South', 'x', 3, 3, 8], ['West', 6, 2, 6, 3]], 3);
  assert.deepEqual(rows.map(r => r.name), ['Damaged', 'North', 'South', 'West']);
  assert.equal(rows[0].e, 5);
  assert.deepEqual(rows[2].s, [5, 3, 3]);
});
test('RK-17 the link reader applies the control bounds: scores 1-10, weight wobble 0-200, score wobble 0-5', () => {
  assert.deepEqual(readLinkItems([['a', 0, 11, -3, 99]], 3)[0], {name: 'a', s: [1, 10, 1], e: 10});
  assert.equal(readWobbleWeights(10000), 200);
  assert.equal(readWobbleWeights(-5), 0);
  assert.equal(readWobbleScores(100), 5);
  assert.equal(readWobbleScores('x'), null);
});

/* ---------- RK-15, 16 ---------- */
test('RK-15 pair agreement that is not total prints >99%, never 100%', () => {
  const A = Array.from({length: 25}, (_, i) => 'Item ' + i), B = A.slice();
  [B[10], B[11]] = [B[11], B[10]];
  const copy = orderDiffCopy(orderDiff(A, B));
  assert.match(copy, /agree on >99% of pairwise comparisons/);
  assert.doesNotMatch(copy, /100%/);
  assert.match(orderDiffCopy(orderDiff(A, A)), /agree on 100%/, 'identical orders really are 100%');
});
test('RK-16 a | in a name is escaped in the Markdown table', () => {
  assert.equal(mdCell('Search | v2'), 'Search \\| v2');
  assert.equal(mdCell('two\nlines'), 'two lines');
  assert.match(readFileSync(new URL('../md.js', import.meta.url), 'utf8'), /mdCell\(r\.name\)/);   // the Markdown builder escapes a name through the one rule (rank/md.js)
});

/* ---------- wording slips seen on the live page ---------- */
test('names are joined "A, B and C", the way every other sentence joins them', () => {
  const tie2 = verdictCopy([{name: 'A', ptop: .999}, {name: 'Home widget', ptop: .55}, {name: 'Club challenges', ptop: .45}, {name: 'D', ptop: .01}], 2);
  assert.match(tie2.body, /a genuine tie between Home widget and Club challenges —/);
  const tie3 = verdictCopy([{name: 'A', ptop: .999}, {name: 'B', ptop: .5}, {name: 'C', ptop: .4}, {name: 'D', ptop: .3}, {name: 'E', ptop: .01}], 2);
  assert.match(tie3.body, /a genuine tie between B, C and D —/);
  assert.match(verdictCopy([{name: 'A', ptop: .999}, {name: 'B', ptop: .998}, {name: 'C', ptop: .5}, {name: 'D', ptop: .4}], 3).body, /A and B make the cut under any reasonable weights/);
});
test('the knife-edge legend does not describe the wobble as ±N%', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /a stricter probe than the wobble above/);
  assert.doesNotMatch(html, /stricter probe than the ±N% wobble/);
});
