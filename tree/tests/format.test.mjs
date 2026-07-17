import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMoney, formatP, formatRange, shiftRange, pricedCopy, seamCopy} from '../format.js';
import {parseMoney} from '../parse.js';

const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('formatMoney round-trips through parseMoney within tolerance', () => {
  for(const v of [2e6, -150e3, 250e3, 687.5e3, 1.05e6, 3.3e9, 42, -0.5e6, 1234567]){
    const r = parseMoney(formatMoney(v));
    assert.ok(r && near(r.lo, v, Math.max(1, Math.abs(v) * 1e-5)),
      `formatMoney(${v}) = "${formatMoney(v)}" → ${r && r.lo}`);
  }
  assert.equal(formatMoney(0), '0');
  assert.equal(formatMoney(2e6), '2M');
  assert.equal(formatMoney(-150e3), '-150k');
});

test('formatP round-trips and clamps to [0,1]', () => {
  for(const v of [0.6, 0.075, 0.5, 0.999, 0.001]){
    const r = parseMoney(formatP(v));
    assert.ok(r && near(r.lo, v, 1e-5), `formatP(${v}) = "${formatP(v)}"`);
  }
  assert.equal(formatP(1.4), '1');   // clamped
  assert.equal(formatP(-0.2), '0');
});

test('formatRange emits a point as one number, a range as "lo to hi", both re-parseable', () => {
  assert.equal(formatRange({lo: 2e6, hi: 2e6}), '2M');
  assert.equal(formatRange({lo: 0.2, hi: 0.4}, true), '0.2 to 0.4');
  const r = parseMoney(formatRange({lo: -1e6, hi: -0.5e6}));   // negative money range
  assert.ok(r && near(r.lo, -1e6, 10) && near(r.hi, -0.5e6, 10), JSON.stringify(r));
});

test('shiftRange preserves width and re-parses to the intended interval (C2)', () => {
  // money range: width preserved around the new midpoint
  const a = shiftRange({lo: 1e6, hi: 3e6}, 5e6);   // width 2M, mid→5M
  assert.ok(near(a.lo, 4e6, 1) && near(a.hi, 6e6, 1), JSON.stringify(a));
  const back = parseMoney(formatRange(a));
  assert.ok(near(back.lo, 4e6, 100) && near(back.hi, 6e6, 100), 'round-trips');

  // point stays a point
  const p = shiftRange({lo: 2e6, hi: 2e6}, 2.5e6);
  assert.equal(p.lo, p.hi);
  assert.ok(near(p.lo, 2.5e6, 1));

  // probability: width preserved when it fits
  const q = shiftRange({lo: 0.5, hi: 0.7}, 0.3, true);
  assert.ok(near(q.lo, 0.2, 1e-9) && near(q.hi, 0.4, 1e-9), JSON.stringify(q));

  // probability clamps (shrinks) against a bound rather than exceeding it
  const c = shiftRange({lo: 0.5, hi: 0.7}, 0.95, true);   // half-width .1 → would be [.85,1.05]
  assert.ok(c.hi <= 1 && c.lo >= 0 && near(c.hi, 1, 1e-9), JSON.stringify(c));
});

test('shiftRange (prob) PRESERVES the midpoint against a bound — never un-flips the drag (Fable C-1)', () => {
  // the slider's variable IS the midpoint; committing near a bound must keep it there (shrinking
  // width), not clamp lo/hi independently (which moved the midpoint 0.02 → 0.0475 and could commit
  // BACK across a flip the drag had just crossed).
  for(const [range, mid] of [[{lo: 0.3, hi: 0.45}, 0.02], [{lo: 0.3, hi: 0.45}, 0.95], [{lo: 0.5, hi: 0.7}, 0.6]]){
    const r = shiftRange(range, mid, true);
    assert.ok(near((r.lo + r.hi) / 2, mid, 1e-9), `committed midpoint = released ${mid}, got ${(r.lo + r.hi) / 2}`);
    assert.ok(r.lo >= 0 && r.hi <= 1, `within [0,1]: ${JSON.stringify(r)}`);
  }
});

/* ---------- pricedCopy / seamCopy (B3): the priced-insistence readout ---------- */

test('pricedCopy: feasible case, probability — prices the nearest boundary in points', () => {
  const line = pricedCopy({winnerLabel: 'Submit bid', kind: 'prob', label: 'Win',
    x: 0.375, boundary: 0.08, trackLo: 0, trackHi: 1});
  assert.match(line, /^Submit bid holds until Win's odds would fall below 8% — 29\.5 points from where you've set it\.$/);
});

test('pricedCopy: feasible case, value — prices the nearest boundary in money, direction-aware', () => {
  const above = pricedCopy({winnerLabel: 'No bid', kind: 'value', label: 'Win', currency: '£',
    x: 2000000, boundary: 2500000, trackLo: 0, trackHi: 5000000});
  assert.equal(above, "No bid holds until Win's payoff would rise above £2.5M — £500k from where you've set it.");
  const below = pricedCopy({winnerLabel: 'Submit bid', kind: 'value', label: 'Win', currency: '£',
    x: 2000000, boundary: 250000, trackLo: 0, trackHi: 5000000});
  assert.match(below, /would fall below £250k/);
});

test('pricedCopy: no flip in the track at all (I4 case 1) — "no longer hinges"', () => {
  const line = pricedCopy({winnerLabel: 'Bid', kind: 'prob', label: 'Lose', x: 0.5, boundary: null});
  assert.equal(line, "On these numbers the call no longer hinges on Lose's odds.");
});

test('pricedCopy: a flip exists only beyond the clamped track (I4 case 2) — cites the track edge, never claims no-hinge', () => {
  const above = pricedCopy({winnerLabel: 'Bid', kind: 'value', label: 'Slack', currency: '£',
    x: 100, boundary: null, hingesBeyond: 9000000, trackLo: -200, trackHi: 400});
  assert.equal(above, "You'd need Slack's payoff past £400 — beyond any plausible value here.");
  const below = pricedCopy({winnerLabel: 'Bid', kind: 'value', label: 'Slack', currency: '£',
    x: 100, boundary: null, hingesBeyond: -9000000, trackLo: -200, trackHi: 400});
  assert.equal(below, "You'd need Slack's payoff past −£200 — beyond any plausible value here.");
  assert.ok(!/no longer hinges/.test(above), 'never claims a hinging input doesn\'t hinge');
});

test('seamCopy: the at-rest honesty seam (I-6) — only when midpoint and MC winners disagree, never claims a flip', () => {
  const seam = seamCopy('Risky', 'Safe');
  assert.equal(seam, 'On midpoints, Risky edges ahead; across your full ranges, Safe still wins.');
  assert.ok(!/flip/i.test(seam), 'copy never uses the word flip — it never claims the MC verdict flipped');
  assert.equal(seamCopy('Safe', 'Safe'), '', 'agreement ⇒ nothing to show');
  assert.equal(seamCopy(null, 'Safe'), '');
});
