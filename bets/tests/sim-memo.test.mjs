import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {createSimMemo} from '../sim-memo.js';

const SRC = `title: T
unit: £k
G
  A: stake 100, odds 40-60%, payoff 300-500
    kill: stop
  B: stake 50, odds 20-30%, payoff 100-200`;

function counted(){
  let runs = 0;
  const memo = createSimMemo(m => { runs++; return simulate(m); });
  return {memo, runs: () => runs};
}

test('the simulation runs once across re-renders of the same inputs, and again when an input changes', () => {
  const {memo, runs} = counted();
  const first = memo.get(parse(SRC));
  memo.get(parse(SRC));                                          // view switch, theme, zoom: a fresh parse of the same text
  memo.get(parse(SRC.replace('title: T', 'title: A different title')));   // display-only field
  assert.equal(runs(), 1);
  memo.get(parse(SRC.replace('stake 100', 'stake 110')));         // an input
  assert.equal(runs(), 2);
  memo.get(parse(SRC.replace('odds 20-30%', 'odds 20-35%')));
  assert.equal(runs(), 3);
  assert.ok(first.bets.size === 2);
});

test('a rename and a kill-text edit do not re-simulate, and the figures are bit-identical to a fresh run', () => {
  const {memo, runs} = counted();
  memo.get(parse(SRC));
  const renamed = parse(SRC.replace('A:', 'Alpha:').replace('kill: stop', 'kill: a different reason'));
  const got = memo.get(renamed);
  assert.equal(runs(), 1);
  const fresh = simulate(renamed);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(fresh)));
});

test('adding or removing a kill criterion, or a bet, changes the key', () => {
  const {memo, runs} = counted();
  memo.get(parse(SRC));
  memo.get(parse(SRC.replace('\n    kill: stop', '')));   // the NO KILL audit changes
  assert.equal(runs(), 2);
  memo.get(parse(SRC + '\n  C: stake 5, odds 50%, payoff 20'));
  assert.equal(runs(), 3);
});

test('an earlier input is still kept (a snapshot and the current model alternate without re-simulating)', () => {
  const {memo, runs} = counted();
  const a = parse(SRC), b = parse(SRC.replace('stake 100', 'stake 120'));
  memo.get(a); memo.get(b); memo.get(a); memo.get(b);
  assert.equal(runs(), 2);
});
