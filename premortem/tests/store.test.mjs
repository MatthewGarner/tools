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

test('trash is a persistent tombstone that can restore the register', () => {
  const backend = shim(), store = makeStore(backend);
  store.save({id: 'a', title: 'Recover me', entries: []});
  const tomb = store.trash('a');
  assert.equal(tomb.doc.title, 'Recover me');
  assert.equal(store.load('a'), null);
  assert.equal(store.list().length, 0);
  assert.equal(makeStore(backend).trashed().doc.id, 'a', 'survives a reload/new store instance');
  const restored = makeStore(backend).restoreTrash();
  assert.equal(restored.id, 'a');
  assert.equal(store.load('a').title, 'Recover me');
  assert.equal(store.list().length, 1);
  assert.equal(store.trashed(), null);
});

test('purging trash makes a tombstone irrecoverable', () => {
  const store = makeStore(shim());
  store.save({id: 'a', title: 'Gone', entries: []});
  store.trash('a'); store.purgeTrash();
  assert.equal(store.trashed(), null);
  assert.equal(store.restoreTrash(), null);
});

test('a second delete never clobbers a still-pending first tombstone (the single-slot bug)', () => {
  const store = makeStore(shim());
  store.save({id: 'a', title: 'First', entries: []});
  store.save({id: 'b', title: 'Second', entries: []});
  store.trash('a');
  store.trash('b');
  assert.equal(store.trashedAll().length, 2, 'both tombstones survive');
  assert.deepEqual(store.trashedAll().map(t => t.doc.id).sort(), ['a', 'b']);
  assert.equal(store.trashed('a').doc.title, 'First', 'fetchable by doc id');
  assert.equal(store.trashed('b').doc.title, 'Second');
});

test('restoreTrash() with no id pops the newest; restoreTrash(id) restores a specific one', () => {
  const store = makeStore(shim());
  store.save({id: 'a', title: 'First', entries: []});
  store.save({id: 'b', title: 'Second', entries: []});
  store.trash('a');
  store.trash('b');
  const restoredSpecific = store.restoreTrash('a');
  assert.equal(restoredSpecific.id, 'a');
  assert.equal(store.trashedAll().length, 1, 'only a was removed from trash');
  assert.equal(store.trashed('b').doc.title, 'Second', 'b is still pending');
  const restoredNewest = store.restoreTrash();
  assert.equal(restoredNewest.id, 'b');
  assert.equal(store.trashedAll().length, 0);
});

test('purgeTrash(id) removes only that tomb; a sibling tomb survives', () => {
  const store = makeStore(shim());
  store.save({id: 'a', title: 'First', entries: []});
  store.save({id: 'b', title: 'Second', entries: []});
  store.trash('a');
  store.trash('b');
  store.purgeTrash('a');
  assert.equal(store.trashed('a'), null);
  assert.equal(store.trashed('b').doc.title, 'Second', 'sibling tomb untouched');
  assert.equal(store.restoreTrash('a'), null, 'a is genuinely gone');
});

test('a legacy single-object TRASH value migrates transparently to array reads', () => {
  const backend = shim();
  // pre-migration shape: a bare {doc, deleted} object, not an array
  backend.setItem('premortem:trash', JSON.stringify({doc: {id: 'legacy', title: 'Old shape', entries: []}, deleted: Date.now()}));
  const store = makeStore(backend);
  assert.equal(store.trashedAll().length, 1);
  assert.equal(store.trashed().doc.id, 'legacy');
  const restored = store.restoreTrash();
  assert.equal(restored.id, 'legacy');
});

test('toLink small doc → hash; oversized doc → null', async () => {
  assert.match(await toLink({v: 1, id: 'x', entries: []}), /^#/);
  // incompressible bulk — repetitive workshop prose would deflate back under the cap
  const rnd = (s => () => (s = Math.imul(48271, s) % 2147483647) / 2147483647)(99);
  const big = {v: 1, id: 'x', entries: Array.from({length: 400}, () =>
    newEntry(Array.from({length: 64}, () => (rnd() * 16 | 0).toString(16)).join('')))};
  assert.equal(await toLink(big), null);
});

test('fromLink mints a new id (import is a copy)', async () => {
  const doc = {v: 1, id: 'orig', title: 'T', entries: []};
  assert.notEqual((await fromLink(await toLink(doc))).id, 'orig');
  assert.equal((await fromLink(await toLink(doc))).title, 'T');
});

test('fromLink rejects garbage without throwing', async () => {
  assert.equal(await fromLink('#not-base64!'), null);
  assert.equal(await fromLink('#'), null);
  assert.equal(await fromLink('#z:corrupt~payload'), null);
});

test('save meta carries a risks-only count (board items do not inflate the home list)', () => {
  const mem = new Map();
  const store = makeStore({getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k)});
  store.save({id: 'd1', title: 'T', entries: [
    newEntry('a risk'), {...newEntry('a fact'), kind: 'fact'}, {...newEntry('an assumption'), kind: 'assumption'}]});
  const meta = store.list().find(m => m.id === 'd1');
  assert.equal(meta.risks, 1);
  assert.equal(meta.entries, 3);
});
test('save meta preserves pre-parade identity and its opportunity count', () => {
  const mem = new Map();
  const store = makeStore({getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k)});
  store.save({id: 'd1', title: 'T', mode: 'success', entries: [
    {...newEntry('an opportunity'), kind: 'opportunity'}, {...newEntry('a belief'), kind: 'belief'}]});
  const meta = store.list().find(m => m.id === 'd1');
  assert.equal(meta.mode, 'success');
  assert.equal(meta.opportunities, 1);
  assert.equal(meta.risks, 0);
});
test('fromLink defaults a missing kind to risk (legacy/foreign docs stay visible)', async () => {
  const doc = {v: 1, id: 'orig', title: 'T', entries: [{id: 'e1', text: 'no kind here'}]};
  const imported = await fromLink(await toLink(doc));
  assert.equal(imported.entries[0].kind, 'risk');
  // links shared before the compressed format: plain-base64 hashes import forever
  const legacy = '#' + Buffer.from(JSON.stringify(doc)).toString('base64');
  assert.equal((await fromLink(legacy)).title, 'T');
});
