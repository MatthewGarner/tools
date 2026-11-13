/* Engine-audit fixes: the midpoint story and the flips (TR-4, TR-8, TR-9). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate, evalDet, sliderExtent, refMid, loadBearing} from '../engine.js';
import {pricedCopy, flipCopy} from '../format.js';
import {exploreProbOps} from '../edit-targets.js';

const PILOT = 'R\n  Pilot\n    Adopt (p=0.3): 1M\n    Reject (p=0.7): 0\n  Wait: 350k';

/* ---------- TR-4: a flip is stated as the probability that would apply ---------- */
test('TR-4: without a rest sibling the flip is the effective probability (0.35), not the raw input (0.38)', () => {
  const m = parse(PILOT), r = evaluate(m);
  const f = r.flips.find(x => x.label === 'Adopt');
  assert.ok(Math.abs(f.threshold - 0.35) < 1e-6, 'threshold ' + f.threshold);
  assert.equal(f.direction, '>');
  const ext = sliderExtent({kind: 'prob', line: 2}, m);
  assert.ok(Math.abs(ext.flips.above - 0.35) < 1e-6);
  const copy = pricedCopy({winnerLabel: 'Wait', kind: 'prob', label: 'Adopt', currency: '£', x: 0.3, boundary: ext.flips.above, trackLo: 0, trackHi: 1});
  assert.match(copy, /above 35%/);
});

test('TR-4: moving one outcome scales its siblings in proportion, so the set still sums to one', () => {
  const m = parse('R\n  Pilot\n    A (p=0.2): 100\n    B (p=0.3): 0\n    C (p=0.5): 50\n  Wait: 0');
  const [a] = m.root.children[0].children;
  const at = x => evalDet(m, new Map([[a, x]])).values[0];
  // A = 0.5, so B and C share the other 0.5 in the ratio 3:5 -> 100*0.5 + 0*0.1875 + 50*0.3125
  assert.ok(Math.abs(at(0.5) - (50 + 15.625)) < 1e-9, String(at(0.5)));
  assert.ok(Math.abs(at(1) - 100) < 1e-9);
  assert.ok(Math.abs(at(0) - (0 * 0.375 + 50 * 0.625)) < 1e-9);
});

test('TR-4: with a rest sibling the behaviour is unchanged (rest soaks up the remainder)', () => {
  const m = parse('R\n  Bid\n    Win (p=0.3): 1M\n    Lose (p=rest): -100k\n  Skip: 0');
  const [win] = m.root.children[0].children;
  const v = evalDet(m, new Map([[win, 0.5]])).values[0];
  assert.ok(Math.abs(v - (0.5 * 1e6 + 0.5 * -1e5)) < 1e-6);
  const bid = parse('Bid\n  Submit bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0');
  assert.ok(Math.abs(evaluate(bid).flips[0].threshold - 150 / 3500) < 1e-6, 'unchanged: 150k over the 3.5M midpoint');
});

test('TR-4: a set that does not sum to one starts the slider at the effective probability', () => {
  const m = parse('R\n  Pilot\n    Adopt (p=0.3): 1M\n    Reject (p=0.5): 0\n  Wait: 350k');
  assert.ok(Math.abs(refMid(m, {kind: 'prob', line: 2}) - 0.375) < 1e-9);
  assert.equal(refMid(parse(PILOT), {kind: 'prob', line: 2}), 0.3, 'a set summing to one is read exactly as written');
  const rest = parse('R\n  Pilot\n    Adopt (p=0.3): 1M\n    Reject (p=rest): 0\n  Wait: 350k');
  assert.equal(refMid(rest, {kind: 'prob', line: 2}), 0.3);
  // the override at the current value IS the base rollback
  const base = evalDet(m).values, same = evalDet(m, new Map([[m.root.children[0].children[0], 0.375]])).values;
  assert.ok(Math.abs(base[0] - same[0]) < 1e-9);
  assert.ok(loadBearing(m).length >= 0);
});

test('TR-4: committing the slider rewrites the siblings too, so the text says what the slider said', () => {
  const src = 'R\n  Pilot\n    Adopt (p=0.3): 1M\n    Reject (p=0.7): 0\n  Wait: 350k';
  const m = parse(src), lines = src.split('\n');
  const adopt = m.root.children[0].children[0];
  const ops = exploreProbOps(m, adopt, 0.4, n => lines[n]);
  assert.deepEqual(ops, [{line: 2, text: '    Adopt (p=0.4): 1M'}, {line: 3, text: '    Reject (p=0.6): 0'}]);
  const next = [...lines]; ops.forEach(o => { next[o.line] = o.text; });
  const m2 = parse(next.join('\n'));
  assert.deepEqual(m2.warnings, []);
  assert.ok(Math.abs(evaluate(m2).effectiveProbability.get(m2.root.children[0].children[0]) - 0.4) < 0.01);
});

test('TR-4: the commit keeps each sibling\'s range width and leaves a rest set alone', () => {
  const src = 'R\n  P\n    A (p=0.2-0.4): 1\n    B (p=0.5-0.7): 2\n  W: 0';
  const m = parse(src), lines = src.split('\n');
  const ops = exploreProbOps(m, m.root.children[0].children[0], 0.5, n => lines[n]);
  assert.equal(ops.length, 2);
  assert.match(ops[0].text, /\(p=0\.4 to 0\.6\)/);
  assert.match(ops[1].text, /\(p=0\.4 to 0\.6\)/, 'B was 0.6 of the remaining 0.6, so it takes all 0.5 left, width kept');
  const rest = 'R\n  P\n    A (p=0.3): 1\n    B (p=rest): 2\n  W: 0';
  const m3 = parse(rest), l3 = rest.split('\n');
  assert.deepEqual(exploreProbOps(m3, m3.root.children[0].children[0], 0.5, n => l3[n]).map(o => o.line), [2]);
});

/* ---------- TR-8: every boundary ---------- */
test('TR-8: a non-monotone probability lists every boundary, and the words name them all', () => {
  const m = parse('R\n  A\n    Z (p=0.8): 100\n    X (p=0.2): 60\n    Rest (p=rest): 0\n  B: 85');
  const f = evaluate(m).flips.filter(x => x.label === 'X');
  assert.equal(f.length, 1);
  assert.equal(f[0].boundaries.length, 2);
  assert.ok(Math.abs(f[0].boundaries[0] - 0.0833) < 1e-3 && Math.abs(f[0].boundaries[1] - 0.48) < 1e-3, JSON.stringify(f[0].boundaries));
  assert.equal(flipCopy(f[0]), 'flips if p(X) < 0.08 or > 0.48');
});

test('TR-8: one boundary reads exactly as before', () => {
  const m = parse(PILOT), f = evaluate(m).flips[0];
  assert.equal(flipCopy(f), 'flips if p(Adopt) > 0.35');
  const bid = parse('Bid\n  Submit bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0');
  assert.match(flipCopy(evaluate(bid).flips[0]), /^flips if p\(Win\) < 0\.\d\d$/);
});

test('TR-8: an interval of flipped calls in the middle says "between"', () => {
  // A wins only for a middle band of X's probability; as written (X = 0.05) B is recommended
  const m = parse('R\n  A\n    Z (p=0.8): 100\n    X (p=0.05): 60\n    Rest (p=rest): 0\n  B: 85');
  const f = evaluate(m).flips.find(x => x.label === 'X');
  assert.equal(flipCopy(f), 'flips if p(X) between 0.08 and 0.48');
});

/* ---------- TR-9: out-of-range probabilities clamp in the midpoint story as in the simulation ---------- */
test('TR-9: p=-0.2 is zero in the midpoint story exactly as in the Monte Carlo, so there is no false seam', () => {
  const m = parse('R\n  A\n    Up (p=0.5): 100\n    Down (p=-0.2): -100\n  B: 150');
  const mc = evaluate(m), det = evalDet(m);
  assert.equal(det.values[0], mc.stats.get(m.root.children[0]).mean);
  assert.equal(det.rec, mc.policy.get(m.root));
  assert.ok(m.warnings.some(w => /outside 0–1/.test(w)), 'and the reader is told');
  assert.ok(mc.warnings.some(w => /sum to 0\.50/.test(w)), 'the sum warning reads the clamped values: ' + JSON.stringify(mc.warnings));
});

test('TR-9: p=1.5 clamps to one', () => {
  const m = parse('R\n  A\n    Up (p=1.5): 100\n    Down (p=0.5): -100\n  B: 0');
  const det = evalDet(m), mc = evaluate(m);
  assert.ok(Math.abs(det.values[0] - 100 / 3) < 1e-9, 'one and a half clamps to one, then the pair is normalised');
  assert.ok(Math.abs(det.values[0] - mc.stats.get(m.root.children[0]).mean) < 1e-9);
});
