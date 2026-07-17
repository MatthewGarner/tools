import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate, evalDet, flipAlong, sliderExtent, loadBearing, refMid, findByLine, hingesBeyondTrack} from '../engine.js';

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

test('loadBearing never returns empty for a valid tree; a far-off swing input is still caught (M-1)', () => {
  // Safe:-1 sits far below Risky (EV ~11), but raising it into contention is WITHIN its
  // scale-aware track (tree scale ~12) — an absolute ±1 reach would have missed it and wrongly
  // fallen through to the degenerate path. So it is correctly marked, not degenerate.
  const runaway = parse(`Root
  Risky
    Win (p=0.99): 10 to 12
    Lose (p=rest): 8 to 9
  Safe: -1`);
  const lb = loadBearing(runaway);
  assert.ok(lb.length >= 1, 'a valid ≥2-option tree always has a load-bearing input');
  assert.ok(lb.some(m => m.ref.kind === 'value' && m.ref.line === 4 && !m.degenerate),
    'Safe (line 4) — the swing input — is marked via the scale-aware reach, not the degenerate net');
});

test('implicit-root tree (two top-level options) does not crash loadBearing (C-1)', () => {
  // No single wrapping root → parse synthesises an implicit "Decision" root that SHARES
  // srcLine 0 with the first option ("Bid"). findByLine(0) must resolve to the real option,
  // not the value-less wrapper, or sliderExtent hits null.lo and the whole preview dies.
  const m = parse(`Bid: -150k
  Outcome
    Win (p=0.6): 2M
    Lose (p=rest): 0
No bid: 0`);
  assert.equal(m.root.implicit, true);
  const first = findByLine(m, 0);
  assert.equal(first.label, 'Bid');
  assert.ok(first.value, 'resolves to the real first option, not the implicit wrapper');
  let lb;
  assert.doesNotThrow(() => { lb = loadBearing(m); });
  assert.ok(lb.length >= 1, 'still finds the load-bearing inputs (Win prob/payoff)');
  assert.doesNotThrow(() => sliderExtent({kind: 'value', line: 0}, m), 'resolution never throws');
});

/* ---------- hingesBeyondTrack (B3, I4): distinguishing the two no-flip copy cases ---------- */

test('hingesBeyondTrack: a probability never reports "beyond" — its track already IS [0,1]', () => {
  assert.equal(hingesBeyondTrack(bid, winProb, {lo: 0, hi: 1}), null);
});

test('hingesBeyondTrack: finds a flip that sits beyond the plausible (clamped) track (I4 case 2)', () => {
  // Lose (a point value, currently 0) — its own sliderExtent track ([-500k,500k]) shows NO flip
  // (this is exactly why loadBearing never marks it), but pushing it to about -2.625M WOULD flip
  // Bid vs No bid: -150k + 0.6·2M + 0.4·Lose = 0. The widened probe must still find it.
  const loseVal = {kind: 'value', line: 4};
  const ext = sliderExtent(loseVal, bid);
  assert.equal(ext.flips.boundaries.length, 0, 'the plausible track itself shows no flip');
  const beyond = hingesBeyondTrack(bid, loseVal, ext);
  assert.ok(beyond !== null, 'a flip does exist, just beyond the plausible track');
  assert.ok(near(beyond, -2625000, 1000), `beyond ${beyond}`);
});

test('hingesBeyondTrack: null when a value truly never hinges (I4 case 1) — a dead branch (p pinned at 0)', () => {
  // Win's own probability is a fixed point at 0 (not a range), so Win's VALUE is multiplied by 0
  // in every rollback regardless of what it's set to — it can never move the recommendation, at
  // any distance. loadBearing correctly never marks it; hingesBeyondTrack must agree.
  const dead = parse(`Root
  Bid: -150k
    Outcome
      Win (p=0): 2M to 5M
      Lose (p=rest): 0
  No bid: 0`);
  const win = dead.root.children[0].children[0].children[0];
  const ref = {kind: 'value', line: win.srcLine};
  const ext = sliderExtent(ref, dead);
  assert.equal(ext.flips.boundaries.length, 0);
  assert.equal(hingesBeyondTrack(dead, ref, ext), null, 'never hinges at any distance — not merely beyond this track');
  assert.equal(loadBearing(dead).some(m => m.ref.kind === 'value' && m.ref.line === win.srcLine), false);
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
