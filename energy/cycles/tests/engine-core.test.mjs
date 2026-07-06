import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mulberry32, gaussian} from '../../../assets/series.js';
import {parse} from '../parse.js';
import {makeBase, above, drawBeliefs, simPolicy, npv} from '../engine.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, msg + ': ' + a + ' vs ' + b);

/* degenerate: zero-width ranges everywhere → hand-checkable on paper */
const DEGEN = `battery: 100MW / 200MWh
spread: 50..50
charge: 20
drift: 0
rte: 90%
fade: 0.01..0.01 %/cycle
calendar: 1..1 %/yr
cycles: 9000 over 15yr
discount: 8%`;

test('above(): counts and sums on a known sample', () => {
  const m = parse('battery: 1MW / 2MWh\nspread: 10..100\ncharge: 20\ndrift: 0\nrte: 90%\nfade: 0.01 %/cycle\ncalendar: 1 %/yr\ncycles: 6000 over 15yr');
  const {S1} = makeBase(m, 42);
  assert.equal(S1.v.length, 1000);
  const all = above(S1, -Infinity);
  assert.equal(all.count, 1000);
  close(all.sum, S1.v.reduce((a, x) => a + x, 0), 1e-6, 'suffix sum');
  const none = above(S1, Infinity);
  assert.deepEqual({c: none.count, s: none.sum}, {c: 0, s: 0});
  const mid = above(S1, S1.v[499]);
  assert.equal(mid.count, 500);
});

test('degenerate case matches the paper answer', () => {
  const m = parse(DEGEN);
  const rand = mulberry32(1), gauss = gaussian(rand);
  const b = drawBeliefs(m, rand, gauss);
  close(b.fade, 1e-4, 1e-12, 'fade fraction');
  const base = makeBase(m, 42);
  const out = simPolicy(m, b, base, false);
  const net = 50 - (1 / 0.9 - 1) * 20;
  close(out.cyc[0], 365, 1e-6, 'all days clear');
  close(out.revs[0], 200 * 365 * net, 1, 'year-1 revenue');
  const ann = (1 - Math.pow(1.08, -15)) / 0.08;
  close(out.taus[0], 1e-4 * 365 * net * ann, 0.5, 'τ = fade·E0·V/E0 (wear binds, budget slack)');
  assert.equal(out.bind[0], false, 'wear, not warranty, sets τ');
  close(out.sohs[0], 1 - 1e-4 * 365 - 0.01, 1e-9, 'soh path');
});

test('warranty rationing: tight budget caps cycles and binds', () => {
  const m = parse(DEGEN.replace('cycles: 9000 over 15yr', 'cycles: 1500 over 15yr'));
  const rand = mulberry32(1), gauss = gaussian(rand);
  const out = simPolicy(m, drawBeliefs(m, rand, gauss), makeBase(m, 42), false);
  close(out.cyc[0], 100, 1.5, 'cycles capped at allowance');
  assert.equal(out.bind[0], true, 'warranty binds');
});

test('first-order condition: converged τ is locally optimal', () => {
  const m = parse(`battery: 100MW / 200MWh\nspread: 20..120\ncharge: 15..45\ndrift: -2..0 %/yr\nrte: 86..90%\nfade: 0.008..0.008 %/cycle\ncalendar: 1.4 %/yr\ncycles: 4000 over 15yr\ndiscount: 8%`);
  const rand = mulberry32(5), gauss = gaussian(rand);
  const b = drawBeliefs(m, rand, gauss);
  const base = makeBase(m, 42);
  const wearNpv = o => npv(o.wearCost, b.disc);
  const at = s => { const o = simPolicy(m, b, base, false, s); return npv(o.revs, b.disc) - wearNpv(o); };
  const base100 = at(1);
  assert.ok(base100 >= at(1.15) - Math.abs(base100) * 5e-3, 'raising τ 15% must not beat the optimum');
  assert.ok(base100 >= at(0.85) - Math.abs(base100) * 5e-3, 'lowering τ 15% must not beat the optimum');
});

test('deterministic under seed; drift lowers later revenue', () => {
  const m = parse(DEGEN.replace('drift: 0', 'drift: -5..-5 %/yr'));
  const run = () => { const r = mulberry32(9), g = gaussian(r);
    return simPolicy(m, drawBeliefs(m, r, g), makeBase(m, 42), false); };
  assert.deepEqual(run().revs, run().revs, 'seeded');
  const o = run();
  assert.ok(o.revs[10] < o.revs[0] * 0.7, 'drift compounds');
});
