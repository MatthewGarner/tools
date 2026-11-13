/* Driver shares as shares of variance (audit FM-5, FM-8): exact models read them off the closed
   form, sampled models keep their pinned runs with a squared-width transform, and one dominance
   rule is shared by the hint, the tree headline, the Markdown and the pour verdict. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenize, parse, collectVars, summariseEstimate, computeSensitivity, traceDraws, ratioStr, Z80, Z90} from '../engine.js';
import {leverHint, treeHeadline, leverLine, dominantDriver, DOMINANT} from '../words.js';
import {pourVerdict} from '../pour.js';
import {histLayout} from '../histlayout.js';
import {SEEDS, N, POUR_GRAINS} from '../seeds.js';

function model(f, ranges, dists = {}){
  const ast = parse(tokenize(f));
  const varNames = collectVars(ast, []);
  const d = {};
  for(const n of varNames) d[n] = dists[n] || 'auto';
  return {ast, varNames, ranges, dists: d};
}
const run = (m, seed = SEEDS.A) => {
  const s = summariseEstimate(m, {seed, n: N});
  return {s, ...computeSensitivity(m, {seed, p10: s.p10, p90: s.p90, exact: s.exact})};
};
const sg = (lo, hi) => Math.log(hi / lo) / (2 * Z90);
const sens = (...pairs) => pairs.map(([name, share]) => ({name, share, label: '×1.5'}));

test('exact: four equal drivers are 25% each and the shares add to 1', () => {
  const m = model('a*b*c*d', {a: [10, 40], b: [10, 40], c: [10, 40], d: [10, 40]});
  const {sens: sn} = run(m);
  assert.equal(sn.length, 4);
  for(const x of sn) assert.ok(Math.abs(x.share - 0.25) < 1e-12, x.name + ' ' + x.share);
  assert.ok(Math.abs(sn.reduce((t, x) => t + x.share, 0) - 1) < 1e-12);
});
test('exact: shares are (e*sigma)^2 / sigma^2 and the label is the spread left if pinned', () => {
  const m = model('a*b^2', {a: [10, 40], b: [1, 2]});
  const sa = sg(10, 40), sb = sg(1, 2);
  const total = sa * sa + 4 * sb * sb;
  const {sens: sn, fullRatio} = run(m);
  const A = sn.find(x => x.name === 'a'), B = sn.find(x => x.name === 'b');
  assert.ok(Math.abs(A.share - sa * sa / total) < 1e-12);
  assert.ok(Math.abs(B.share - 4 * sb * sb / total) < 1e-12);
  assert.equal(A.label, '×' + ratioStr(Math.exp(2 * Z80 * Math.sqrt(total - sa * sa))));
  assert.equal(B.label, '×' + ratioStr(Math.exp(2 * Z80 * Math.sqrt(total - 4 * sb * sb))));
  assert.ok(Math.abs(fullRatio / Math.exp(2 * Z80 * Math.sqrt(total)) - 1) < 1e-12);
  assert.ok(sn[0].share >= sn[1].share);
});
test('exact: no pinned simulation is run', () => {
  const m = model('a*b', {a: [10, 40], b: [10, 40]});
  const s = summariseEstimate(m, {seed: 1, n: 100});
  let reads = 0;
  const watched = {...m, ranges: new Proxy(m.ranges, {get(t, k){ reads++; return t[k]; }})};
  const out = computeSensitivity(watched, {seed: 1, p10: s.p10, p90: s.p90, exact: s.exact});
  assert.equal(reads, 0);
  assert.equal(out.sens.length, 2);
  assert.deepEqual(out.unmeasured, []);
});
test('exact: a variable that cancels has share 0, a point range has no bar', () => {
  const {sens: sn} = run(model('a*b/a*c', {a: [10, 40], b: [10, 40], c: [3, 3]}));
  assert.deepEqual(sn.map(x => [x.name, Math.round(x.share * 1000) / 1000]), [['b', 1], ['a', 0]]);
});
test('sampled: the transform is one minus the squared width ratio, in the log and the linear branch', () => {
  const log = model('a*b', {a: [10, 40], b: [10, 40]});
  const s = summariseEstimate(log, {seed: SEEDS.A, n: N});
  const forced = computeSensitivity(log, {seed: SEEDS.A, p10: s.p10, p90: s.p90, exact: null});     // sampled path
  for(const x of forced.sens) assert.ok(Math.abs(x.share - 0.5) < 0.03, x.name + ' ' + x.share);
  const lin = model('a+b', {a: [-10, 10], b: [-10, 10]});
  const t = summariseEstimate(lin, {seed: SEEDS.A, n: N});
  const l = computeSensitivity(lin, {seed: SEEDS.A, p10: t.p10, p90: t.p90});
  for(const x of l.sens){ assert.ok(Math.abs(x.share - 0.5) < 0.04, x.name + ' ' + x.share); assert.ok(x.share >= 0 && x.share <= 1); }
  // the old transform read 1 - (1/sqrt2) = 29%; squared widths read the variance share, 50%
});
test('dominance: above one half and not tied, nothing else', () => {
  assert.equal(DOMINANT, 0.5);
  assert.equal(dominantDriver(sens(['a', .6], ['b', .3])), 'a');
  assert.equal(dominantDriver(sens(['a', .5], ['b', .3])), null);
  assert.equal(dominantDriver(sens(['a', .55], ['b', .54])), null);              // tied at the top
  assert.equal(dominantDriver(sens(['a', .34], ['b', .3])), null);               // the old 0.35 gate is gone
  assert.equal(dominantDriver(sens(['a', 1])), 'a');
  assert.equal(dominantDriver([]), null);
});
test('the words follow the one rule, and never claim a lever when nothing dominates and inputs are tied', () => {
  const none = sens(['a', .45], ['b', .44], ['c', .1]);
  assert.match(leverHint(none, '×4'), /^No single input dominates/);
  assert.match(treeHeadline(none, '×4'), /^No single input dominates/);
  const line = leverLine(none, '×4');
  assert.doesNotMatch(line, /Biggest lever/);
  assert.match(line, /a and b are level/);
  const four = sens(['a', .25], ['b', .25], ['c', .25], ['d', .25]);
  assert.match(leverLine(four, '×4'), /a, b, c and d are level/);
  const dom = sens(['a', .6], ['b', .3]);
  assert.match(leverHint(dom, '×4'), /Pin a and the spread drops from ×4 to ×1\.5 — research it first\./);
  assert.match(treeHeadline(dom, '×4'), /^Research a first — pinning it cuts the spread from ×4 to ×1\.5\./);
  assert.match(leverLine(dom, '×4'), /^Biggest lever: a — knowing it exactly shrinks/);
  assert.match(leverLine(sens(['a', .4], ['b', .2]), '×4'), /^Biggest lever: a/);   // clear leader, not dominant: still the biggest
  assert.doesNotMatch(leverHint(four, '×4') + treeHeadline(four, '×4'), /adds? to 100|sum to 100/);
});
test('the hint and the pour verdict agree on every example, and on a dominated model', () => {
  const cases = {
    cadence: model('decisions * hours * people * cost', {decisions: [12, 30], hours: [1, 4], people: [4, 9], cost: [60, 120]}),
    four: model('a*b*c*d', {a: [10, 40], b: [10, 40], c: [10, 40], d: [10, 40]}),
    dominated: model('a*b*c', {a: [1, 100], b: [1, 2], c: [1, 2]}),
    sum: model('a+b', {a: [-10, 10], b: [-30, 30]}),
  };
  const said = {};
  for(const [name, m] of Object.entries(cases)){
    const {s, sens: sn, fullRatio} = run(m);
    const order = sn.map(x => x.name);
    const trace = traceDraws(m, {seed: SEEDS.A, g: POUR_GRAINS, order});
    const layout = histLayout(s.sorted, {width: 600, threshold: null});
    const v = pourVerdict(trace, layout, {names: {}, sens: sn});
    const hint = leverHint(sn, '×' + ratioStr(fullRatio));
    const hintDom = !/^No single input dominates/.test(hint);
    const pourDom = /^Most of the spread is born at/.test(v.text) || /^All of the spread/.test(v.text);
    assert.equal(hintDom, pourDom, name + ': ' + hint + ' | ' + v.text);
    assert.equal(v.topName !== null, pourDom);
    said[name] = hintDom;
  }
  assert.equal(said.cadence, false);      // hours is 49% of the variance: not over half
  assert.equal(said.four, false);
  assert.equal(said.dominated, true);
  assert.equal(said.sum, true);
});
test('pour verdict: one driver owns all of it; an empty trace says nothing', () => {
  const one = {order: ['a'], draws: Array.from({length: 50}, (_, i) => ({y: i, steps: [i]}))};
  const v = pourVerdict(one, null, {names: {a: 'alpha'}, sens: sens(['a', 1])});
  assert.equal(v.topName, 'a');
  assert.match(v.text, /^All of the spread is born at alpha\.$/);
  assert.equal(pourVerdict({order: ['a'], draws: []}, null, {names: {}, sens: sens(['a', 1])}).text, '');
});
