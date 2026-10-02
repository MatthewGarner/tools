import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, activeSession, transition } from './state.js';
import { createWorkbenchTools, registerWorkbenchTools } from './tools.js';

test('agent edits use real state transitions; malformed and unknown operations cannot mutate it', async () => {
  let state = initialState();
  let edits = 0;
  const [read, edit] = createWorkbenchTools({read: () => state, edit: action => { state = transition(state, action); edits += 1; return true; }});
  const frameId = activeSession(state).frames[0].id;
  const firstRead = await read.execute({});
  assert.equal(JSON.parse(firstRead.content[0].text).session.id, state.activeId);
  const update = await edit.execute({target: 'frame', field: 'test', value: 'Run one handoff with named owners.', frameId});
  assert.equal(update.isError, undefined);
  assert.equal(activeSession(state).frames[0].test, 'Run one handoff with named owners.');
  assert.equal(edits, 1);
  const before = structuredClone(state);
  for (const input of [undefined, null, [], {}, {target: 'unknown', field: 'statement', value: 'x'}, {target: '__proto__', field: 'statement', value: 'x'}, {target: 'plan', field: 'secret', value: 'x'}, {target: 'problem', field: 'problem', value: 42}, {target: 'frame', field: 'test', value: 'x', frameId: 'wrong'}, {target: 'problem', field: 'problem', value: 'x', extra: true}, {target: 'plan', field: 'test', value: 'x'.repeat(20001)}]) {
    assert.equal((await edit.execute(input)).isError, true);
  }
  assert.equal((await read.execute({unknown: true})).isError, true);
  assert.deepEqual(state, before);
  assert.equal(edits, 1);
});

test('synchronous and asynchronous bridge failures return tool errors', async () => {
  for (const fail of [() => { throw new Error('blocked'); }, async () => { throw new Error('blocked'); }]) {
    const [read] = createWorkbenchTools({read: fail, edit: () => true});
    assert.equal((await read.execute({})).isError, true);
    const [, edit] = createWorkbenchTools({read: initialState, edit: fail});
    assert.equal((await edit.execute({target: 'problem', field: 'problem', value: 'New'})).isError, true);
    assert.doesNotThrow(() => registerWorkbenchTools({registerTool: fail}, createWorkbenchTools({read: initialState, edit: () => true})));
  }
  await new Promise(resolve => setTimeout(resolve, 0));
});
