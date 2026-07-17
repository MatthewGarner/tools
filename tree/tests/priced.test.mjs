import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate, evalDet, flipAlong, sliderExtent, loadBearing, refMid} from '../engine.js';

// canonical bid tree (srcLines: Root0 Bid1 Outcome2 Win3 Lose4 NoBid5)
const bid = parse(`Root
  Bid: -150k
    Outcome
      Win (p=0.6): 2M
      Lose (p=rest): 0
  No bid: 0`);
const winProb = {kind: 'prob', line: 3};
const winVal = {kind: 'value', line: 3};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('flipAlong finds the single probability flip, two-sided fields correct', () => {
  const f = flipAlong(bid, winProb, {lo: 0, hi: 1});
  assert.ok(near(f.below, 0.075, 1e-3), `below ${f.below}`);   // -150k + p·2M = 0 ⇒ p = 0.075
  assert.equal(f.above, null, 'no flip above the current 0.6');
  assert.equal(f.winnerAtLo.label, 'No bid');
  assert.equal(f.winnerAtHi.label, 'Bid');
});

test('flipAlong finds a value flip; a narrowed extent that excludes it reports no flip', () => {
  const f = flipAlong(bid, winVal, sliderExtent(winVal, bid));
  assert.ok(near(f.below, 250000, 500), `value flip ${f.below}`);   // -150k + 0.6·V = 0 ⇒ V = 250k

  const none = flipAlong(bid, winProb, {lo: 0.2, hi: 1});           // 0.075 is outside → no boundary
  assert.equal(none.below, null);
  assert.equal(none.above, null);
  assert.equal(none.winnerAtLo, none.winnerAtHi, 'same winner across a flip-free extent');
});

test('sliderExtent: prob = [0,1]; point value = a window containing both the flip and the current value', () => {
  assert.deepEqual((({lo, hi}) => ({lo, hi}))(sliderExtent(winProb, bid)), {lo: 0, hi: 1});

  const e = sliderExtent(winVal, bid);   // point value 2M, flip 250k
  assert.ok(e.lo <= 250000 && e.hi >= 2000000, `window [${e.lo},${e.hi}] spans flip..current`);
  assert.ok(e.lo > -1e6 && e.hi < 4e6, 'window is tight around flip+current, not unbounded');
});

test('sliderExtent (ranged value): extends the stated range to reveal the flip, never shrinks it, clamps to stated±2span', () => {
  const rv = parse(`Root
  Bid: -150k
    Outcome
      Win (p=0.6): 1M to 3M
      Lose (p=rest): 0
  No bid: 0`);
  const e = sliderExtent({kind: 'value', line: 3}, rv);   // stated [1M,3M], flip 250k below it
  assert.ok(e.lo <= 1e6 && e.hi >= 3e6, 'never shrinks below the stated range');
  assert.ok(near(e.lo, 250000, 1000), 'extends down to reach the flip');
  assert.ok(e.lo >= -3e6 && e.hi <= 7e6, 'clamped to stated ± 2×span');
});

test('loadBearing marks the flip-carrying inputs, ranked by proximity, not degenerate', () => {
  const lb = loadBearing(bid);
  assert.ok(lb.length >= 2, `${lb.length} marks`);
  assert.equal(lb.every(m => !m.degenerate), true);
  // the probability's flip is proportionally nearer its track than the value's → ranked first
  assert.deepEqual(lb[0].ref, winProb);
  for(let i = 1; i < lb.length; i++) assert.ok(lb[i - 1].proximity <= lb[i].proximity, 'proximity-sorted');
});

test('loadBearing degenerate: nothing flips within any track → the single widest-margin input, flagged', () => {
  // Risky (EV ~11, range [8,10] under p) dominates Safe:-1; no single input flips it inside its track
  const runaway = parse(`Root
  Risky
    Win (p=0.99): 10 to 12
    Lose (p=rest): 8 to 9
  Safe: -1`);
  const lb = loadBearing(runaway);
  assert.equal(lb.length, 1, 'exactly one, explained');
  assert.equal(lb[0].degenerate, true);
  assert.equal(lb[0].nearestFlip, null);
});

test('honesty seam (C4): evalDet midpoint rec can differ from the MC max-mean policy', () => {
  // Big is right-skewed: its arithmetic midpoint (25M) exceeds its lognormal mean (~22M);
  // Safe:9M sits between the two Risky EVs, so the midpoint story and the MC verdict disagree.
  const skew = parse(`Root
  Risky
    Big (p=0.5): 10M to 40M
    Bust (p=rest): -5M
  Safe: 9M`);
  const detRec = evalDet(skew).rec.label;
  const policy = evaluate(skew).policy.get(skew.root).label;
  assert.equal(detRec, 'Risky');
  assert.equal(policy, 'Safe');
  assert.notEqual(detRec, policy);   // the copy path (B3) must never claim the MC verdict flipped
});
