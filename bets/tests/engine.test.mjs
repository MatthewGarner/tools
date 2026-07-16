import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate, verdictCopy, markdown} from '../engine.js';

/* Fixture engineered so each audit arm is isolated (Fable review):
   - Near cert  odds 90-100 → certainty via lo≥90 (near-certain WIN)
   - Width nine odds 40-49  → a tight MID band: no longer certainty (over-precision ≠ certainty)
   - Edge ok    odds 89-99  → certainty must NOT fire (lo 89 < 90, hi 99 > 10)
   - Sure loser → LOSES AT P50 + NO KILL
   - Coin flip  → the one bet WITH a kill: (nothing flags) */
const SRC = `title: T
unit: £k
G
  Sure loser: stake 100, odds 10-20%, payoff 50-80
  Coin flip: stake 50, odds 45-55%, payoff 100-120
    kill: flips stop landing
  Near cert: stake 10, odds 90-100%, payoff 30-40
  Width nine: stake 20, odds 40-49%, payoff 60-100
  Edge ok: stake 20, odds 89-99%, payoff 60-100`;

const model = parse(SRC);
const byName = {};
for(const g of model.groups) for(const b of g.bets) byName[b.name] = b.srcLine;
const auditsOf = (sim, name) => sim.bets.get(byName[name]).audits;
const evOf = (sim, name) => sim.bets.get(byName[name]).ev;

test('EV bands: sure loser median < 0, near-cert > 0; seeded-deterministic', () => {
  const a = simulate(model), b = simulate(model);
  assert.ok(evOf(a, 'Sure loser').p50 < 0, 'sure loser loses at P50');
  assert.ok(evOf(a, 'Near cert').p50 > 0, 'near cert wins at P50');
  assert.ok(evOf(a, 'Sure loser').p10 < evOf(a, 'Sure loser').p90, 'band ordered');
  assert.deepEqual(a.portfolio, b.portfolio, 'deterministic under the same seed');
});

test('audits: each arm isolated, order = kill, certainty, loses', () => {
  const s = simulate(model);
  assert.deepEqual(auditsOf(s, 'Sure loser'), ['NO KILL CRITERION', 'LOSES AT P50']);
  assert.deepEqual(auditsOf(s, 'Coin flip'), []);                                   // has a kill, sound odds, positive EV
  assert.deepEqual(auditsOf(s, 'Near cert'), ['NO KILL CRITERION', 'ODDS IMPLY CERTAINTY']);  // lo≥90
  assert.deepEqual(auditsOf(s, 'Width nine'), ['NO KILL CRITERION']);               // tight MID band no longer stamps
  assert.deepEqual(auditsOf(s, 'Edge ok'), ['NO KILL CRITERION']);                  // 89-99: neither extreme
});

test('ODDS IMPLY CERTAINTY fires only at the extremes, never a tight mid-band (Fable M4)', () => {
  const auditsOfDoc = odds => {
    const m = parse(`G\n  X: stake 10, odds ${odds}, payoff 100-120\n    kill: k`);
    return simulate(m).bets.get(m.groups[0].bets[0].srcLine).audits;
  };
  const stamps = odds => auditsOfDoc(odds).includes('ODDS IMPLY CERTAINTY');
  assert.equal(stamps('48-53%'), false, 'coin-flip 48-53 must NOT stamp (was a false red stamp)');
  assert.equal(stamps('50-50%'), false, 'point 50 must NOT stamp (old width-0 bug)');
  assert.equal(stamps('40-80%'), false, 'wide mid never stamps');
  assert.equal(stamps('92-96%'), true, 'near-certain win stamps (hi extreme)');
  assert.equal(stamps('95-95%'), true, 'point 95 stamps');
  assert.equal(stamps('3-7%'), true, 'near-certain loss stamps (lo extreme — old rule missed a wide one)');
});

test('portfolio: pLoss in (0,1); histogram 40 bins summing to nsim', () => {
  const s = simulate(model, {nsim: 4000});
  assert.ok(s.portfolio.pLoss > 0 && s.portfolio.pLoss < 1);
  assert.equal(s.portfolio.histogram.length, 40);
  const total = s.portfolio.histogram.reduce((t, bin) => t + bin[2], 0);   // bin = [x0, x1, count]
  assert.equal(total, 4000, 'every sim lands in a bin (edges clamp)');
  assert.ok(s.portfolio.p10 < s.portfolio.p50 && s.portfolio.p50 < s.portfolio.p90);
});

test('concentration: named at ≥40% stake share, null below', () => {
  const named = simulate(model);                       // Sure loser is 100/200 = 50%
  assert.equal(named.concentration.name, 'Sure loser');
  assert.ok(Math.abs(named.concentration.share - 0.5) < 0.001);
  const flat = simulate(parse(`G\n  A: stake 25, odds 30-50%, payoff 40-90\n  B: stake 25, odds 30-50%, payoff 40-90\n  C: stake 25, odds 30-50%, payoff 40-90\n  D: stake 25, odds 30-50%, payoff 40-90`));
  assert.equal(flat.concentration, null, 'no bet ≥40% → null');
});

test('verdict copy quotes P(loses money) as a percentage', () => {
  const s = simulate(model);
  const v = verdictCopy(s.portfolio, {kill: 4, certainty: 2, loses: 1});
  assert.match(v, /\d+%/);
  assert.match(v, /los/i);
});

test('markdown carries the honest table + audit counts', () => {
  const s = simulate(model);
  const md = markdown(model, s, 'https://x/bets/#abc');
  assert.match(md, /Sure loser/);
  assert.match(md, /NO KILL CRITERION/);
  assert.match(md, /£k/);
});
