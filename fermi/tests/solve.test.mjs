import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenize, parse, collectVars, simulateModel} from '../engine.js';
import {quantile} from '../../assets/series.js';
import {solveStretch, confess} from '../solve.js';

const SEED = 0x5EED, NP = 8000;
const mk = (f, ranges, dists) => { const ast = parse(tokenize(f)); return {ast, varNames: collectVars(ast, []), ranges, dists}; };
const p50 = m => quantile(simulateModel(m, {seed: SEED, n: NP}).sorted, .5);
const hit = (got, want) => Math.abs(got - want) / Math.abs(want) < 0.02;   // 2% of target

/* ---- solveStretch (Task 1) ---- */

test('solveStretch: a pure logn product hits P50=T with a width-preserving mult stretch', () => {
  const m = mk('a * b', {a: [10, 20], b: [5, 15]}, {a: 'logn', b: 'logn'});
  const target = p50(m) * 1.5;
  const r = solveStretch(m, {seed: SEED, np: NP, target, varName: 'a'});
  assert.equal(r.feasible, true);
  assert.equal(r.kind, 'mult');
  assert.ok(hit(r.achievedP50, target), `P50 ${r.achievedP50} vs T ${target}`);
  assert.ok(Math.abs(r.range[1] / r.range[0] - 20 / 10) < 1e-6, 'width (ratio) preserved');
  assert.ok(r.normCost > 0 && r.normCost <= 3);
});

test('solveStretch: a DENOMINATOR var confesses a DOWN-shift to RAISE P50 (C1 two-sided probe)', () => {
  const m = mk('a / b', {a: [100, 200], b: [2, 5]}, {a: 'logn', b: 'logn'});
  const target = p50(m) * 1.4;                          // want a HIGHER answer
  const r = solveStretch(m, {seed: SEED, np: NP, target, varName: 'b'});
  assert.equal(r.feasible, true, 'a one-sided rule would report anti-progress here');
  assert.ok(r.dir < 0, 'b must SHRINK (dir<0) to raise a/b');
  assert.ok(hit(r.achievedP50, target));
});

test('solveStretch: an additive/norm var whose solved lo crosses 0 stays norm (C2 freeze)', () => {
  const m = mk('a + b', {a: [10, 20], b: [1, 5]}, {a: 'norm', b: 'norm'});
  const base = p50(m);
  const target = base - 2;                              // pull down: b shifts negative, lo (1) crosses 0
  const r = solveStretch(m, {seed: SEED, np: NP, target, varName: 'b'});
  assert.equal(r.kind, 'add');
  assert.equal(r.feasible, true, 'the freeze keeps P50(s) continuous across lo=0');
  assert.ok(hit(r.achievedP50, target));
  assert.ok(r.range[0] < 0 && r.range[0] < r.range[1], 'a negative endpoint is legitimate, no collapse');
});

test('solveStretch: a point-range var is infeasible (excluded)', () => {
  const m = mk('a * b', {a: [10, 10], b: [5, 15]}, {a: 'logn', b: 'logn'});
  const r = solveStretch(m, {seed: SEED, np: NP, target: 200, varName: 'a'});
  assert.equal(r.feasible, false);
  assert.equal(r.normCost, 3);
});

test('solveStretch is deterministic (same seed ⇒ identical result)', () => {
  const m = mk('a * b', {a: [10, 20], b: [5, 15]}, {a: 'logn', b: 'logn'});
  const o = {seed: SEED, np: NP, target: p50(m) * 1.3, varName: 'a'};
  assert.deepEqual(solveStretch(m, o), solveStretch(m, o));
});

/* ---- confess (Task 2) ---- */

test('confess: several feasible singles ⇒ cheapest is best, pair null, alternates ascending', () => {
  const m = mk('a * b * c', {a: [10, 20], b: [5, 15], c: [2, 4]}, {a: 'logn', b: 'logn', c: 'logn'});
  const c = confess(m, {seed: SEED, np: NP, target: p50(m) * 1.4});
  assert.ok(c.feasible && c.best && !c.pair);
  const costs = [c.best, ...c.alternates].map(r => r.normCost);
  for(let i = 1; i < costs.length; i++) assert.ok(costs[i] >= costs[i - 1], 'ascending normCost');
  assert.ok(hit(c.best.achievedP50, p50(m) * 1.4));
});

test('confess: target beyond any single cap ⇒ no best, a pair of the two highest-progress vars that hits T', () => {
  const m = mk('a * b * c', {a: [10, 12], b: [5, 6], c: [2, 3]}, {a: 'logn', b: 'logn', c: 'logn'});
  // tight ranges: the widest single (c) reaches ~1.84× at cap; a pair reaches ~2.4×.
  // Target 2.1× sits in the window: no single reaches it, the pair does.
  const target = p50(m) * 2.1;
  const c = confess(m, {seed: SEED, np: NP, target});
  assert.equal(c.best, null, 'no single stretch within cap reaches T');
  assert.ok(c.pair && c.pair.s <= 3);
  assert.equal(c.feasible, true);
  assert.ok(hit(c.pair.achievedP50, target), 'the pair moved together hits T');
});

test('confess: an impossible target ⇒ terminal (feasible false, pair.feasible false)', () => {
  const m = mk('a * b', {a: [10, 11], b: [5, 6]}, {a: 'logn', b: 'logn'});
  const c = confess(m, {seed: SEED, np: NP, target: p50(m) * 1e6});
  assert.equal(c.feasible, false);
  assert.ok(!c.pair || c.pair.feasible === false);
});

test('confess: 0 non-point candidates ⇒ no throw, feasible false, no pair (I2)', () => {
  const m = mk('a * b', {a: [10, 10], b: [5, 5]}, {a: 'logn', b: 'logn'});
  const c = confess(m, {seed: SEED, np: NP, target: 100});
  assert.deepEqual({best: c.best, pair: c.pair, feasible: c.feasible}, {best: null, pair: null, feasible: false});
});

test('confess: 1 infeasible candidate ⇒ no pair attempt, terminal (I2)', () => {
  const m = mk('a * b', {a: [10, 11], b: [5, 5]}, {a: 'logn', b: 'logn'});   // only a varies
  const c = confess(m, {seed: SEED, np: NP, target: p50(m) * 1e6});
  assert.equal(c.pair, null);
  assert.equal(c.feasible, false);
});
