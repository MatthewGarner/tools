import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNum, tokenize, parse, collectVars, evalNode,
  effDist, distMedian, simulateModel} from '../engine.js';
import {quantile} from '../../assets/series.js';

test('parseNum understands k/M/B/T suffixes and commas', () => {
  assert.equal(parseNum('3M'), 3e6);
  assert.equal(parseNum('1,500'), 1500);
  assert.equal(parseNum('0.02'), 0.02);
  assert.ok(Number.isNaN(parseNum('abc')));
});

test('formula round-trip: tokenize→parse→eval with precedence and unicode ops', () => {
  const ast = parse(tokenize('a × b + 2^3 ÷ 4'));
  assert.equal(evalNode(ast, {a: 2, b: 5}), 2 * 5 + Math.pow(2, 3) / 4);
  assert.deepEqual(collectVars(ast, []), ['a', 'b']);
});

test('parse errors carry a message', () => {
  assert.throws(() => parse(tokenize('a *')), e => /ends early/.test(e.msg));
  assert.throws(() => parse(tokenize('(a + b')), e => /closing/.test(e.msg));
});

test('effDist: auto is log-normal only for positive ranges', () => {
  assert.equal(effDist('auto', 5), 'logn');
  assert.equal(effDist('auto', -1), 'norm');
  assert.equal(effDist('logn', 0), 'norm');
  assert.equal(distMedian(4, 9, 'auto'), 6);         // sqrt(4*9)
  assert.equal(distMedian(-2, 2, 'auto'), 0);        // arithmetic midpoint
});

const model = () => {
  const ast = parse(tokenize('a * b'));
  return {ast, varNames: ['a', 'b'],
    ranges: {a: [6, 10], b: [60, 120]}, dists: {a: 'auto', b: 'auto'}};
};

test('simulateModel is deterministic for a fixed seed with ordered percentiles', () => {
  const x = simulateModel(model(), {seed: 0x5EED, n: 20000});
  const y = simulateModel(model(), {seed: 0x5EED, n: 20000});
  assert.equal(x.sorted.length, y.sorted.length);
  assert.equal(quantile(x.sorted, .5), quantile(y.sorted, .5));
  assert.ok(quantile(x.sorted, .1) < quantile(x.sorted, .5));
  assert.ok(quantile(x.sorted, .5) < quantile(x.sorted, .9));
});

test('pinning a variable narrows the spread', () => {
  const full = simulateModel(model(), {seed: 0x5EED, n: 8000});
  const pinned = simulateModel(model(), {seed: 0x5EED, n: 8000, pinName: 'b', pinValue: Math.sqrt(60 * 120)});
  const spread = s => quantile(s.sorted, .9) / quantile(s.sorted, .1);
  assert.ok(spread(pinned) < spread(full));
});
