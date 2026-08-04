import test from 'node:test';
import assert from 'node:assert/strict';
import {tryClipboardWrite, requestLock} from '../safety.js';

test('clipboard feedback is successful only after a resolved write', async () => {
  const writes = [];
  assert.equal(await tryClipboardWrite({writeText: async value => { writes.push(value); }}, 'join'), true);
  assert.deepEqual(writes, ['join']);
  assert.equal(await tryClipboardWrite(null, 'join'), false);
  assert.equal(await tryClipboardWrite({writeText: async () => { throw new Error('denied'); }}, 'join'), false);
  assert.equal(await tryClipboardWrite({writeText: async () => {}}, ''), false);
});

test('request lock disables every destructive action and admits one request', async () => {
  const buttons = [{disabled: false}, {disabled: true}, {disabled: false}];
  let release;
  const gate = requestLock(buttons);
  const first = gate.run(() => new Promise(resolve => { release = resolve; }));
  assert.equal(gate.busy, true);
  assert.deepEqual(buttons.map(b => b.disabled), [true, true, true]);
  assert.deepEqual(await gate.run(async () => 'duplicate'), {started: false});
  release('ok');
  assert.deepEqual(await first, {started: true, value: 'ok'});
  assert.equal(gate.busy, false);
  assert.deepEqual(buttons.map(b => b.disabled), [false, true, false]);
});

test('request lock restores controls after rejection', async () => {
  const buttons = [{disabled: false}];
  const gate = requestLock(buttons);
  await assert.rejects(gate.run(async () => { throw new Error('network'); }), /network/);
  assert.equal(buttons[0].disabled, false);
  assert.equal(gate.busy, false);
});
