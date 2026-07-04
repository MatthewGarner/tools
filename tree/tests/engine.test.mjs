import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ' want ~' + b);

test('analytic point-value tree: exact EVs and policy', () => {
  // Bid: -150k + [0.6 × 2M + 0.4 × 0] = 1.05M   vs   No bid: 0
  const m = parse('Root\n  Bid: -150k\n    Outcome\n      Win (p=0.6): 2M\n      Lose (p=rest): 0\n  No bid: 0');
  const r = evaluate(m, {sims: 4000});
  const bid = m.root.children[0];
  near(r.stats.get(bid).mean, 1050000, 1, 'bid EV');
  near(r.stats.get(m.root).mean, 1050000, 1, 'root follows policy');
  assert.equal(r.policy.get(m.root), bid);
});

test('deterministic: same doc same numbers', () => {
  const m = parse('Root\n  A: 1M to 3M\n  B: 0.5M to 4M');
  const r1 = evaluate(m), r2 = evaluate(m);
  assert.equal(r1.stats.get(m.root.children[0]).mean, r2.stats.get(m.root.children[0]).mean);
  assert.equal(r1.stats.get(m.root.children[1]).p90, r2.stats.get(m.root.children[1]).p90);
});

test('policy, not hindsight: root mean matches the chosen branch, not per-sim max', () => {
  // Two symmetric risky options. Per-sim max(A,B) would inflate the root mean well
  // above either option's own mean; a fixed policy must equal the chosen option's mean.
  const m = parse('Root\n  A: 0 to 10M\n  B: 0 to 10M');
  const r = evaluate(m);
  const chosen = r.policy.get(m.root);
  assert.equal(r.stats.get(m.root).mean, r.stats.get(chosen).mean);
  // sanity: hindsight would exceed the single-option mean by a wide margin
  near(r.stats.get(m.root).mean, r.stats.get(m.root.children[0]).mean,
    Math.abs(r.stats.get(m.root.children[0]).mean) * 0.02, 'no hindsight inflation');
});

test('p=rest arithmetic and per-sim normalisation of over-summing siblings', () => {
  const m1 = parse('Root\n  C\n    X (p=0.25): 100\n    Y (p=rest): 0\n  D: 20');
  const c1 = m1.root.children[0];
  const r1 = evaluate(m1, {sims: 4000});
  near(r1.stats.get(c1).mean, 25, 0.5, 'rest = 0.75');

  const m2 = parse('Root\n  C\n    X (p=0.6): 100\n    Y (p=0.6): 0\n  D: 200');
  const r2 = evaluate(m2, {sims: 4000});
  near(r2.stats.get(m2.root.children[0]).mean, 50, 1, 'normalised 0.6/1.2');
  assert.ok(r2.warnings.some(w => w.includes('sum')), 'over-sum warned');
});

test('nested decision inside chance: deepest decision resolved first', () => {
  // Chance leads to a sub-decision; the sub-decision must pick 300 (not 100),
  // making the chance branch worth 0.5×300 = 150 > the safe 120.
  const m = parse('Root\n  Risky\n    Luck\n      Good (p=0.5)\n        Sub\n          Cheap: 100\n          Rich: 300\n      Bad (p=rest): 0\n  Safe: 120');
  const r = evaluate(m, {sims: 4000});
  near(r.stats.get(m.root).mean, 150, 1);
  assert.equal(r.policy.get(m.root), m.root.children[0]);
});

test('head-to-head on an asymmetric root', () => {
  // A ~ always 10; B uniform-ish 0..30 via range: B beats A whenever draw > 10.
  const m = parse('Root\n  A: 10\n  B: 0 to 30');
  const r = evaluate(m);
  const h = r.headToHead.find(x => x.a === 'B' || x.b === 'B');
  assert.ok(h, 'head-to-head present');
  const bShare = h.a === 'B' ? h.aShare : 1 - h.aShare;
  assert.ok(bShare > 0.5 && bShare < 0.9, 'B usually but not always wins, got ' + bShare);
});

test('flip analysis: threshold matches hand calculation', () => {
  // Bid = -150k + p×2M ; No bid = 0 → flips at p = 0.075
  const m = parse('Root\n  Bid: -150k\n    Outcome\n      Win (p=0.6): 2M\n      Lose (p=rest): 0\n  No bid: 0');
  const r = evaluate(m);
  const flip = r.flips.find(f => f.label.includes('Win'));
  assert.ok(flip, 'flip found');
  near(flip.threshold, 0.075, 0.005, 'flip threshold');
  assert.equal(flip.direction, '<');
});

test('no flip reported when none exists in range', () => {
  // Option A dominates for every p in [0,1]: A = p×100 + (1-p)×50 ≥ 50 > 10.
  const m = parse('Root\n  A\n    C\n      Hi (p=0.5): 100\n      Lo (p=rest): 50\n  B: 10');
  const r = evaluate(m);
  assert.equal(r.flips.length, 0);
});

test('payoff range flip: pinning an end changes the recommendation', () => {
  // A: 0 to 300 (midpoint ~123 lognormal? use "0 to 300" → normal, mid 150) vs B: 120.
  // Pin A low → 0 < 120 flips to B; pin high → stays A.
  const m = parse('Root\n  A: 0 to 300\n  B: 120');
  const r = evaluate(m);
  assert.ok(r.flips.some(f => f.kind === 'payoff' && f.label.includes('A')));
});

test('degenerate: single leaf root', () => {
  const m = parse('Just this: 42');
  const r = evaluate(m);
  near(r.stats.get(m.root).mean, 42, 0.001);
  assert.equal(r.headToHead.length, 0);
  assert.equal(r.flips.length, 0);
});
