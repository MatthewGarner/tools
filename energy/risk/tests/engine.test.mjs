import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate, payoffs, fmtUnit, verdict} from '../engine.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, msg + ': ' + a + ' vs ' + b);

test('payoff transforms match the spec table exactly', () => {
  const f = payoffs('floor', {level: 70, share: 0.6, fee: 5});
  assert.equal(f.pay(50), 65);              // F − c
  assert.equal(f.pay(100), 70 + 0.6 * 30 - 5);
  assert.equal(f.pay0(100), 70 + 0.6 * 30); // fee-free
  const t = payoffs('toll', {fixed: 95, fee: 0});
  assert.equal(t.pay(40), 95); assert.equal(t.pay(400), 95);
  const i = payoffs('insure', {premium: 6, attach: 65, limit: 30});
  assert.equal(i.pay(100), 94);             // m − p above attach
  assert.equal(i.pay(50), 59);              // m − p + (a − m) = a − p within limit
  assert.equal(i.pay(20), 20 - 6 + 30);     // limit caps the payout
});

test('deterministic under seed; merchant quantiles track the 90% range', () => {
  const m = parse('merchant: 60..180\nfloor: 70');
  const a = simulate(m, {seed: 7}), b = simulate(m, {seed: 7});
  assert.deepEqual(a.rows[0].p50, b.rows[0].p50);
  close(a.rows[0].p10, 60, 12, 'p10 near lo');   // p10 sits just inside the p5..p95 range
  close(a.rows[0].p90, 180, 20, 'p90 near hi');
});

test('trade decomposition: identities hold and fees stay out of the risk terms', () => {
  const m = parse('merchant: 60..180\nfloor: 70 share 60% fee 5');
  const r = simulate(m).rows[1];
  assert.ok(r.trade.upsideSold > 0 && r.trade.downsideBought > 0);
  assert.equal(r.trade.fees, 5);
  /* fee-free decomposition: the fee moves typicalDelta but must not move
     upsideSold/downsideBought */
  const noFee = simulate(parse('merchant: 60..180\nfloor: 70 share 60%')).rows[1];
  close(noFee.trade.upsideSold, r.trade.upsideSold, 1e-9, 'fee leaked into upsideSold');
  close(noFee.trade.downsideBought, r.trade.downsideBought, 1e-9, 'fee leaked into downsideBought');
  close(noFee.trade.typicalDelta - r.trade.typicalDelta, 5, 1e-9, 'fee shifts typicalDelta by exactly fee');
});

test('bind probabilities: floor P(m<F); toll row has bind too (P beat merchant)', () => {
  const m = parse('merchant: 60..180\nfloor: 70\ntoll: 95');
  const s = simulate(m);
  const floor = s.rows[1], toll = s.rows[2];
  assert.ok(floor.bind.p > 0 && floor.bind.p < 0.5);
  assert.ok(toll.bind.p > floor.bind.p, 'P(m<95) > P(m<70)');
  assert.equal(s.rows[0].bind, null);
});

test('tail sensitivity: deep-tail floor differs across fits and is flagged', () => {
  /* wide positive range → lognormal and normal left tails genuinely differ at a low floor */
  const m = parse('merchant: 20..400\nfloor: 60');
  const r = simulate(m).rows[1];
  assert.ok(r.bind.lo < r.bind.hi);
  assert.equal(r.bind.sensitive, Math.abs(r.bind.hi - r.bind.lo) > 0.05);
});

test('ribbon: 64 bins, peak-normalised, on the shared axis', () => {
  const s = simulate(parse('merchant: 60..180\ntoll: 95'));
  for(const r of s.rows){
    assert.equal(r.ribbon.length, 64);
    assert.equal(Math.max(...r.ribbon), 1);
  }
  assert.ok(s.min < 60 && s.max > 180);
});

test('fmtUnit splices currency units', () => {
  assert.equal(fmtUnit(14, '£k/MW/yr'), '£14k/MW/yr');
  assert.equal(fmtUnit(9.333333, '£k/MW/yr'), '£9.33k/MW/yr');
  assert.equal(fmtUnit(14, 'MWh'), '14 MWh');
});

test('verdict: one sentence, quotable, tail-caveat when sensitive', () => {
  const s = simulate(parse('merchant: 60..180\nfloor: 70 share 60% fee 5'));
  const v = verdict(s.rows[1], '£k/MW/yr');
  assert.match(v, /The floor binds /);
  assert.match(v, /upside/); assert.match(v, /fees/); assert.match(v, /worst-year/);
  const sens = simulate(parse('merchant: 20..400\nfloor: 60')).rows[1];
  if(sens.bind.sensitive) assert.match(verdict(sens, '£k/MW/yr'), /depending on tail shape/);
  assert.equal(verdict(s.rows[0], '£k/MW/yr'), null);
});
