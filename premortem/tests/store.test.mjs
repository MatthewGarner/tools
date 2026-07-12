import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeStore, toLink, fromLink} from '../store.js';
import {newEntry} from '../register.js';

const shim = () => {
  const m = new Map();
  return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k)};
};

test('save/load/list round-trip through the index', () => {
  const store = makeStore(shim());
  store.save({id: 'a', title: 'One', entries: []});
  store.save({id: 'b', title: 'Two', entries: [newEntry('r')]});
  assert.equal(store.load('a').title, 'One');
  const metas = store.list();
  assert.equal(metas.length, 2);
  assert.deepEqual(metas.map(m => m.id).sort(), ['a', 'b']);
  store.remove('a');
  assert.equal(store.list().length, 1);
  assert.equal(store.load('a'), null);
});

test('toLink small doc → hash; oversized doc → null', () => {
  assert.match(toLink({v: 1, id: 'x', entries: []}), /^#/);
  const big = {v: 1, id: 'x', entries: Array.from({length: 400}, (_, i) => newEntry('risk ' + i + ' — a long sentence of workshop text'))};
  assert.equal(toLink(big), null);
});

test('fromLink mints a new id (import is a copy)', () => {
  const doc = {v: 1, id: 'orig', title: 'T', entries: []};
  assert.notEqual(fromLink(toLink(doc)).id, 'orig');
  assert.equal(fromLink(toLink(doc)).title, 'T');
});

test('fromLink rejects garbage without throwing', () => {
  assert.equal(fromLink('#not-base64!'), null);
  assert.equal(fromLink('#'), null);
});
