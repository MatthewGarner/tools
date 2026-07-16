import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, tokenize, collectVars, simulateModel, traceDraws, computeSensitivity} from '../engine.js';
import {quantile} from '../../assets/series.js';

function model(f, vars){
  const ast = parse(tokenize(f)); const varNames = []; collectVars(ast, varNames);
  const ranges = {}, dists = {};
  for(const n of varNames){ ranges[n] = vars[n].slice(0, 2); dists[n] = vars[n][2] || 'auto'; }
  return {ast, varNames, ranges, dists};
}
const M = model('a * b * c', {a: [10, 40], b: [2, 8], c: [1, 3]});
const sensOrder = m => { const {sorted} = simulateModel(m, {seed: 1, n: 8000});
  const p10 = quantile(sorted, .1), p90 = quantile(sorted, .9);
  return computeSensitivity(m, {seed: 1, np: 8000, p10, p90}).sens.map(s => s.name); };

test('traceDraws reproduces simulateModel bit-exactly (same seed, same draws)', () => {
  const raw = simulateModel(M, {seed: 7, n: 300}).raw;
  const {draws} = traceDraws(M, {seed: 7, g: 250, order: sensOrder(M)});
  for(let j = 0; j < 250; j++) assert.equal(draws[j].y, raw[j], 'draw ' + j);
});

test('traceDraws telescopes: last step equals y for every draw', () => {
  const {draws} = traceDraws(M, {seed: 7, g: 250, order: sensOrder(M)});
  for(const d of draws) assert.equal(d.steps[d.steps.length - 1], d.y);
});

test('traceDraws completes `order` with any varying var it is missing (C3)', () => {
  const raw = simulateModel(M, {seed: 7, n: 300}).raw;
  const t = traceDraws(M, {seed: 7, g: 200, order: ['b']});   // deliberately truncated
  assert.deepEqual(t.order, ['b', 'a', 'c']);                 // a, c appended (varNames order)
  for(let j = 0; j < 200; j++) assert.equal(t.draws[j].y, raw[j]);   // still bit-exact
  for(const d of t.draws) assert.equal(d.steps[d.steps.length - 1], d.y);   // still telescopes
});

test('traceDraws bails (ok:false) on a non-finite spout — a/b with b crossing 0 (C3)', () => {
  const D = model('a / b', {a: [10, 40], b: [-1, 1]});        // median b = 0 → base = Infinity
  const t = traceDraws(D, {seed: 3, g: 200, order: ['a']});
  assert.equal(t.ok, false);
});

test('traceDraws is deterministic', () => {
  const t1 = traceDraws(M, {seed: 7, g: 100, order: sensOrder(M)});
  const t2 = traceDraws(M, {seed: 7, g: 100, order: sensOrder(M)});
  assert.deepEqual(t1.draws.map(d => d.y), t2.draws.map(d => d.y));
});
