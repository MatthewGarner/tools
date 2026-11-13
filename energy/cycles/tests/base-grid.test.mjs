/* CYC-7 (revised): the 1000-day base sample was the whole sampling error. It is now a deterministic
   quantile grid, so the seed reaches only the belief draws. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {makeBase, N_BASE, simulate} from '../engine.js';
import {normInv, rangeQuantile} from '../../../assets/quantile-grid.js';

const M = t => parse('battery: 100MW / 200MWh\nrte: 90\ncalendar: 1\nfade: 0.01\ncycles: 6000 over 15yr\ncharge: 15..45\n' + t);

test('makeBase: same S1 and S2 for any seed', () => {
  const m = M('spread: 35..85\nsecond: 35..60%');
  const a = makeBase(m, 1), b = makeBase(m, 987654);
  assert.deepEqual(Array.from(a.S1.v), Array.from(b.S1.v));
  assert.deepEqual(Array.from(a.S2.v), Array.from(b.S2.v));
});

test('makeBase: S1 is the lognormal quantile grid Q((i+1/2)/N) of the P5..P95 range', () => {
  const {S1} = makeBase(M('spread: 35..85'), 1);
  const mu = (Math.log(35) + Math.log(85)) / 2, sg = (Math.log(85) - Math.log(35)) / (2 * 1.6448536);
  assert.equal(S1.n, N_BASE);
  for(const i of [0, 1, 99, 4999, N_BASE - 1]){
    const want = Math.exp(mu + sg * normInv((i + 0.5) / N_BASE));
    assert.ok(Math.abs(S1.v[i] - want) < 1e-9 * want, `S1[${i}] ${S1.v[i]} vs ${want}`);
  }
});

test('makeBase: lo === hi is a constant; lo <= 0 falls back to a normal grid', () => {
  assert.ok(Array.from(makeBase(M('spread: 50'), 1).S1.v).every(v => v === 50));
  assert.ok(Math.abs(rangeQuantile(-20, 30, 'logn')(0.5) - 5) < 1e-9);
});

test('printed figures are seed-stable to their printed step (price to £0.1, second-cycle £ to 2 s.f.)', async () => {
  const {fmtPrice, fmtRough} = await import('../engine.js');
  const m = M('spread: 35..85\nsecond: 35..60%\ndrift: -4..0 %/yr\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 3000 over 15yr');
  const outs = [1, 2, 3, 4].map(seed => simulate(m, {seed, n: 1000}));
  const sd = f => { const a = outs.map(f), mu = a.reduce((x, y) => x + y) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1)); };
  assert.ok(sd(o => o.threshold.p50) < 0.1, 'price P50 sd ' + sd(o => o.threshold.p50));
  assert.ok(sd(o => o.threshold.clearingDays) < 1, 'clearing days sd ' + sd(o => o.threshold.clearingDays));
  assert.equal(fmtPrice(5.16), '£5.2/MWh');
  assert.equal(fmtRough(308731, '£/yr'), '£310k/yr');
});
