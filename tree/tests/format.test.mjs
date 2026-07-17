import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMoney, formatP, formatRange, shiftRange} from '../format.js';
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
