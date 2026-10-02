import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, active, apply, createHistory, change, undo, validateState, parse, serialize, markdown} from './state.js';

test('moving and restoring keeps the actual constraint and separate experiment notes intact', () => {
  let state = initialState(); const original = structuredClone(active(state).cards[0]), id = original.id;
  state = apply(state, {type:'move', id, lane:'remove'});
  state = apply(state, {type:'note', id, lane:'remove', field:'possible', value:'A different experiment entirely.'});
  state = apply(state, {type:'move', id, lane:'current'});
  let card = active(state).cards[0];
  assert.equal(card.text, original.text); assert.equal(card.type, original.type); assert.equal(card.basis, original.basis);
  assert.equal(card.notes.remove.restored, true);
  assert.equal(card.notes.remove.possible, 'A different experiment entirely.');
  assert.deepEqual(card.notes.reverse, original.notes.reverse);
  state = apply(state, {type:'move', id, lane:'remove'}); card = active(state).cards[0];
  assert.equal(card.notes.remove.restored, false); assert.equal(card.notes.remove.possible, 'A different experiment entirely.');
});

test('undo restores movements, grouped typing, and removed cards with their notes', () => {
  let history = createHistory(initialState()); const id = active(history.present).cards[0].id;
  const original = structuredClone(history.present);
  history = change(history, {type:'card', id, field:'text', value:'A'}, 'typing');
  history = change(history, {type:'card', id, field:'text', value:'A longer constraint'}, 'typing');
  assert.equal(history.past.length, 1);
  history = change(history, {type:'move', id, lane:'current'});
  history = change(history, {type:'remove', id});
  assert.equal(active(history.present).cards.length, 3);
  history = undo(history); assert.equal(active(history.present).cards[0].notes.reverse.restored, true);
  history = undo(history); assert.equal(active(history.present).cards[0].lane, 'reverse');
  history = undo(history); assert.deepEqual(history.present, original);
});

test('new problems and JSON imports preserve existing work and remap selection', () => {
  let state = initialState(); const before = structuredClone(active(state));
  state = apply(state, {type:'new', id:'own', example:'blank'});
  state = apply(state, {type:'problem', value:'My own problem'});
  state = apply(state, {type:'import', id:'imported', workspace:parse(serialize(before))});
  assert.equal(state.workspaces.length, 3); assert.deepEqual(state.workspaces[0], before);
  assert.equal(state.workspaces[1].problem, 'My own problem');
  assert.equal(active(state).selectedId, 'imported-c1');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  assert.ok(markdown(active(state)).includes(before.cards[0].notes.reverse.test));
});

test('invalid imports and impossible moves fail without modifying the source', () => {
  const state = initialState(), before = structuredClone(state), id = active(state).cards[0].id;
  for (const lane of ['secret', '__proto__', null]) assert.throws(() => apply(state, {type:'move', id, lane}));
  const exported = JSON.parse(serialize(active(state)));
  exported.workspace.cards[0].notes.reverse.restored = 'true';
  assert.throws(() => parse(JSON.stringify(exported)), /Invalid experiment/);
  exported.workspace.cards[0].notes.reverse.restored = true;
  exported.workspace.selectedId = 'missing';
  assert.throws(() => parse(JSON.stringify(exported)), /inconsistent/);
  assert.throws(() => parse('null'), /Playground export/);
  assert.deepEqual(state, before);
});
