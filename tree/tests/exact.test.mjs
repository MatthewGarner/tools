/* Exact expected values; sampling kept only for the spread (TR-3, TR-6, TR-7 at the source). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {render, treeVerdictParts} from '../render.js';
import {sharedStep} from '../format.js';

const Z90 = 1.6448536;
const lnMean = (lo, hi) => { const mu = (Math.log(lo) + Math.log(hi)) / 2, s = (Math.log(hi) - Math.log(lo)) / (2 * Z90); return Math.exp(mu + s * s / 2); };
const SEEDS = Array.from({length: 40}, (_, i) => 1000 + 7 * i);
const CTX = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6', err: '#b33', brandText: '#D62015'},
  measure: t => String(t).length * 7, today: '2026-11-13'};
const texts = svg => [...svg.matchAll(/>([^<>]+)</g)].map(x => x[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<')).join(' | ');

test('a point tree is exact: 0.4 x 900k + 0.6 x -150k, identical at every seed', () => {
  const src = 'R\n  Submit\n    Win (p=0.4): 900k\n    Lose (p=rest): -150k\n  Walk: 0';
  const means = SEEDS.map(seed => { const m = parse(src); const r = evaluate(m, {seed}); return r.stats.get(m.root).mean; });
  assert.ok(Math.abs(means[0] - 270000) < 1e-6, String(means[0]));
  assert.ok(means.every(v => v === means[0]), 'bit-identical across seeds');
});

test('a log-normal leaf is exp(mu + sigma^2/2), identical at every seed', () => {
  const exact = lnMean(2e6, 5e6);
  for(const seed of SEEDS){
    const m = parse('R\n  A: 2M to 5M\n  B: 0'), r = evaluate(m, {seed});
    assert.ok(Math.abs(r.stats.get(m.root.children[0]).mean - exact) < 1e-6 * exact, 'seed ' + seed);
  }
});

test('a normal range is its midpoint; a node adds its own value to its exact mean', () => {
  const m = parse('R\n  A: -100k\n    Out\n      X (p=0.5): -1M to 3M\n      Y (p=rest): 200k\n  B: 0'), r = evaluate(m);
  const a = m.root.children[0];
  assert.ok(Math.abs(r.stats.get(a.children[0].children[0]).mean - 1e6) < 1e-6);
  assert.ok(Math.abs(r.stats.get(a).mean - (-100000 + 0.5 * 1e6 + 0.5 * 200000)) < 1e-6);
});

test('a chance node with point probabilities is the exact sum, ranged payoffs included, at every seed', () => {
  const want = 0.35 * lnMean(2e6, 5e6) + 0.65 * lnMean(8e5, 1.2e6);
  for(const seed of SEEDS){
    const m = parse('R\n  A\n    Hi (p=0.35): 2M to 5M\n    Lo (p=0.65): 800k to 1.2M\n  B: 0'), r = evaluate(m, {seed});
    assert.ok(Math.abs(r.stats.get(m.root.children[0]).mean - want) < 1e-6 * want, 'seed ' + seed);
  }
});

test('the Bid example is -150k plus the effective probability times the exact payoff mean', () => {
  const src = 'R\n  Submit bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';
  for(const seed of SEEDS.slice(0, 8)){
    const m = parse(src), r = evaluate(m, {seed}), win = m.root.children[0].children[0].children[0];
    const want = -150000 + r.effectiveProbability.get(win) * lnMean(2e6, 5e6);
    assert.ok(Math.abs(r.stats.get(m.root.children[0]).mean - want) < 1e-9 * want, 'seed ' + seed);
  }
});

test('the policy picks by exact mean even 0.1% apart, at every one of 40 seeds', () => {
  const close = Math.round(lnMean(1e5, 2e5) * 0.999);
  for(const seed of SEEDS){
    const m = parse('R\n  Ranged: 100k to 200k\n  Fixed: ' + close), r = evaluate(m, {seed});
    assert.equal(r.policy.get(m.root).label, 'Ranged', 'seed ' + seed);
  }
});

test('"1k to 1b" prints its exact mean at every seed', () => {
  const exact = lnMean(1e3, 1e9);
  for(const seed of SEEDS){
    const m = parse('R\n  A: 1k to 1b\n  B: 0'), r = evaluate(m, {seed});
    assert.ok(Math.abs(r.stats.get(m.root.children[0]).mean / exact - 1) < 1e-9, 'seed ' + seed);
  }
});

test('the spread is sampled over 60,000 worlds by default, and the world count can be set', () => {
  assert.equal(evaluate(parse('R\n  A: 1 to 3\n  B: 0')).worlds, 60000);
  assert.equal(evaluate(parse('R\n  A: 1 to 3\n  B: 0'), {sims: 2000}).worlds, 2000);
});

test('P10 and P90 of a point tree are the exact mean; of a ranged one they straddle it', () => {
  const m = parse('R\n  A: 100k to 300k\n  B: 0'), r = evaluate(m), s = r.stats.get(m.root.children[0]);
  assert.ok(s.p10 < s.mean && s.mean < s.p90);
  const p = parse('R\n  A: 5\n  B: 0'), ps = evaluate(p).stats.get(p.root.children[0]);
  assert.equal(ps.p10, 5); assert.equal(ps.p90, 5);
});

/* ---------- the shared P10/P90 step ---------- */
test('a P10/P90 pair rounds to one hundredth of the power of ten of the larger magnitude', () => {
  assert.deepEqual(sharedStep(640759, 1559223), [640000, 1560000]);
  assert.deepEqual(sharedStep(3000, 1.2e6), [0, 1200000], 'a value that rounds to zero is zero');
  assert.deepEqual(sharedStep(-1.2e6, -3000), [-1200000, 0]);
  assert.deepEqual(sharedStep(-250, 4321), [-250, 4320]);
  assert.deepEqual(sharedStep(0, 0), [0, 0]);
  assert.ok(Object.is(sharedStep(-0.2, 12000)[0], 0) || sharedStep(-0.2, 12000)[0] === 0);
});

test('every surface prints the same shared-step pair', () => {
  const m = parse('title: T\nR\n  Submit bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0'), r = evaluate(m);
  const s = r.stats.get(m.root);
  const [a, b] = sharedStep(s.p10, s.p90);
  const fmtK = v => Math.abs(v) >= 1e6 ? '£' + (v / 1e6).toPrecision(3).replace(/\.?0+$/, '') + 'M' : '£' + Math.round(v / 1e3) + 'k';
  for(const intent of ['native', 'presentation', 'live-narrow']){
    const t = texts(render(m, r, {...CTX, intent, width: intent === 'live-narrow' ? 390 : undefined}));
    assert.ok(t.includes('P10 ' + fmtK(a) + ' · P90 ' + fmtK(b)), intent + ': ' + t.slice(0, 300));
  }
  const native = texts(render(m, r, {...CTX, intent: 'native'}));
  assert.ok(native.includes(fmtK(a) + ' … ' + fmtK(b)), 'the card range uses the same pair');
});

/* ---------- the wide-range warning ---------- */
test('the wide-range sentence fires exactly when a range is over 1,000x or its exact mean exceeds its top', () => {
  for(const [lo, hi] of [[10, 100], [1, 1000], [1, 1001], [1, 1e5], [1, 6e4], [1e3, 1e9]]){
    const m = parse('R\n  A: ' + lo + ' to ' + hi + '\n  B: 0'), r = evaluate(m);
    const n = [...m.warnings, ...r.warnings].filter(w => /rare extremes/.test(w)).length;
    const over = hi / lo > 1000 || r.stats.get(m.root.children[0]).mean > hi;
    assert.equal(n, over ? 1 : 0, lo + ' to ' + hi);
  }
});

test('a lone ranged leaf prints its exact P10/P50/P90 too, identical at every seed', () => {
  const mu = (Math.log(2e6) + Math.log(5e6)) / 2, sg = (Math.log(5e6) - Math.log(2e6)) / (2 * Z90);
  for(const seed of SEEDS.slice(0, 10)){
    const m = parse('R\n  A: 2M to 5M\n  B: 0'), s = evaluate(m, {seed}).stats.get(m.root.children[0]);
    assert.ok(Math.abs(s.p10 - Math.exp(mu - 1.2815515655446004 * sg)) < 1e-6);
    assert.ok(Math.abs(s.p50 - Math.exp(mu)) < 1e-6);
    assert.ok(Math.abs(s.p90 - Math.exp(mu + 1.2815515655446004 * sg)) < 1e-6);
  }
});

test('every expected value is identical at every seed when all probabilities are points, and the policy never moves', () => {
  const src = 'R\n  A: -100k to -200k\n    Out\n      Hi (p=0.4): 2M to 5M\n      Lo (p=rest): 100k to 900k\n  B: -50k\n    Out2\n      Hi (p=0.5): 1M to 2M\n      Lo (p=0.5): 0 to 600k\n  C: 0';
  let ref = null;
  for(const seed of SEEDS){
    const m = parse(src), r = evaluate(m, {seed});
    const row = []; (function w(n){ row.push(r.stats.get(n).mean, r.policy.get(n)?.label); n.children.forEach(w); })(m.root);
    if(!ref) ref = row; else assert.deepEqual(row, ref, 'seed ' + seed);
  }
});

test('too close to call still reads from the head-to-head share', () => {
  const m = parse('R\n  Ranged: 100k to 200k\n  Fixed: 144451'), r = evaluate(m);
  assert.match(treeVerdictParts(m, r).line, /too close to call/);
});

test('the page states the run count the engine uses, and says expected values are computed', async () => {
  const {readFileSync} = await import('node:fs');
  const {WORLDS} = await import('../engine.js');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const count = WORLDS.toLocaleString('en-GB');
  assert.ok(html.includes(count + ' simulations'), 'method line names ' + count);
  assert.ok(!/\b10,000\b/.test(html), 'no stale 10,000');
  assert.match(html, /Expected values are computed exactly/);
});
