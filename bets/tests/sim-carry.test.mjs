/* The pending picture's figures: the last result carried onto the edited portfolio by bet, a coarse run only for what was not in it,
   and the memo's peek/put (the single place a result is looked up) answering without ever simulating. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {carrySim, createSimMemo} from '../sim-memo.js';

const SRC = `title: T
unit: £k
G
  A: stake 100, odds 40-60%, payoff 300-500
    kill: stop
  B: stake 50, odds 20-30%, payoff 100-200`;

test('an edited bet keeps its last figures; they are the last result, not the new one', () => {
  const before = parse(SRC), sim = simulate(before);
  const edited = parse(SRC.replace('stake 100', 'stake 250'));
  const carried = carrySim({model: before, sim}, edited, () => { throw new Error('nothing new: no coarse run'); });
  assert.deepStrictEqual(carried.bets.get(edited.groups[0].bets[0].srcLine), sim.bets.get(before.groups[0].bets[0].srcLine));
  assert.equal(carried.portfolio, sim.portfolio);
});

test('figures follow a bet when a line is inserted above it', () => {
  const before = parse(SRC), sim = simulate(before);
  const edited = parse(SRC.replace('  B:', '  Extra: stake 10, odds 50%, payoff 30\n  B:'));
  let coarse = 0;
  const carried = carrySim({model: before, sim}, edited, m => { coarse++; return simulate(m, {nsim: 400}); });
  const [, extra, b] = edited.groups[0].bets;
  assert.deepStrictEqual(carried.bets.get(b.srcLine), sim.bets.get(before.groups[0].bets[1].srcLine), 'B keeps B\'s figures at its new line');
  assert.equal(coarse, 1, 'one coarse run, for the bet that was not there');
  assert.ok(carried.bets.get(extra.srcLine).scoreable);
});

test('a renamed bet keeps its figures (same place, name gone from the portfolio)', () => {
  const before = parse(SRC), sim = simulate(before);
  const edited = parse(SRC.replace('A:', 'Alpha:'));
  const carried = carrySim({model: before, sim}, edited, () => { throw new Error('no coarse run'); });
  assert.deepStrictEqual(carried.bets.get(edited.groups[0].bets[0].srcLine), sim.bets.get(before.groups[0].bets[0].srcLine));
});

test('with no last result the whole picture comes from one coarse run of the engine\'s own function', () => {
  const model = parse(SRC);
  let runs = 0;
  const carried = carrySim(null, model, m => { runs++; return simulate(m, {nsim: 400}); });
  assert.equal(runs, 1);
  assert.equal(carried.bets.size, 2);
  assert.ok(carried.portfolio);
});

test('peek answers from the kept result and never simulates; put keeps a result computed elsewhere', () => {
  let runs = 0;
  const memo = createSimMemo(m => { runs++; return simulate(m); });
  const model = parse(SRC);
  assert.equal(memo.peek(model), null);
  memo.put(model, simulate(model));
  const hit = memo.peek(parse(SRC.replace('title: T', 'title: Other')));
  assert.ok(hit && hit.bets.size === 2);
  assert.equal(runs, 0, 'peek and put never ran the simulation');
  assert.equal(memo.peek(parse(SRC.replace('stake 100', 'stake 101'))), null, 'an input changed: not kept');
  memo.get(model);
  assert.equal(runs, 0, 'get finds what was put');
});
