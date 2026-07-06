import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diffItems} from '../assets/snapshots.js';

const K = it => it.title;
const S = it => it.state;

test('added, moved, dropped, any', () => {
  const old = [{title: 'A', state: 'now'}, {title: 'B', state: 'next'}, {title: 'C', state: 'later'}];
  const cur = [{title: 'A', state: 'now'}, {title: 'B', state: 'now'}, {title: 'D', state: 'later'}];
  const d = diffItems(old, cur, {key: K, state: S});
  assert.deepEqual(d.added.map(K), ['D']);
  assert.deepEqual([...d.moved.values()].map(m => m.from + '→' + m.to), ['next→now']);
  assert.deepEqual(d.dropped.map(K), ['C']);
  assert.equal(d.any, true);
});

test('identical lists → nothing, any false', () => {
  const l = [{title: 'A', state: '1'}];
  const d = diffItems(l, l, {key: K, state: S});
  assert.equal(d.added.length + d.moved.size + d.dropped.length, 0);
  assert.equal(d.any, false);
});

test('keys normalise case and whitespace exactly like roadmap did', () => {
  const d = diffItems([{title: '  Streak   Freeze ', state: 'x'}],
    [{title: 'streak freeze', state: 'x'}], {key: K, state: S});
  assert.equal(d.any, false);
});

test('state comparison is case-insensitive; defaults compare titles only', () => {
  const d1 = diffItems([{title: 'A', state: 'NOW'}], [{title: 'A', state: 'now'}], {key: K, state: S});
  assert.equal(d1.any, false);
  const d2 = diffItems([{title: 'A'}], [{title: 'A'}], {key: K});
  assert.equal(d2.any, false);
});

test('moved map is keyed by the normalised key and carries the current item', () => {
  const cur = [{title: 'Big Bet', state: 'doing', extra: 42}];
  const d = diffItems([{title: 'big bet', state: 'todo'}], cur, {key: K, state: S});
  const m = d.moved.get('big bet');
  assert.equal(m.item.extra, 42);
  assert.equal(m.from, 'todo');
});
