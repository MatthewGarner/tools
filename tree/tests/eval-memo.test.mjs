import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {createEvalMemo} from '../eval-memo.js';

const SRC = `title: T
currency: £

Bid
  Submit: -150k
    Out
      Win (p=0.3-0.45): 2M to 5M
      Lose (p=rest): 0
  No bid: 0`;

const counted = () => { let n = 0; return {memo: createEvalMemo(m => { n++; return evaluate(m); }), runs: () => n}; };

test('the evaluation runs once across re-renders of the same tree, and again when an input changes', () => {
  const {memo, runs} = counted();
  memo.get(parse(SRC));
  memo.get(parse(SRC));                                                          // view/theme/zoom: a fresh parse
  memo.get(parse(SRC.replace('title: T', 'title: Another').replace('£', '$')));  // display-only fields
  assert.equal(runs(), 1);
  memo.get(parse(SRC.replace('2M to 5M', '2M to 6M')));
  assert.equal(runs(), 2);
  memo.get(parse(SRC.replace('p=0.3-0.45', 'p=0.3-0.5')));
  assert.equal(runs(), 3);
});

test('a kept result answers for the fresh model: its nodes are the ones the results are keyed by', () => {
  const {memo} = counted();
  memo.get(parse(SRC));
  const fresh = parse(SRC.replace('title: T', 'title: Another'));
  const results = memo.get(fresh);
  assert.ok(results.policy.has(fresh.root) || results.stats.has(fresh.root), 'results are keyed by the model the page will render');
  assert.equal(results.stats.get(fresh.root).mean, evaluate(fresh).stats.get(fresh.root).mean, 'bit-identical to a fresh evaluation');
});

test('alternating two inputs does not re-evaluate', () => {
  const {memo, runs} = counted();
  const a = parse(SRC), b = parse(SRC.replace('2M to 5M', '1M to 3M'));
  memo.get(a); memo.get(b); memo.get(a); memo.get(b);
  assert.equal(runs(), 2);
});
