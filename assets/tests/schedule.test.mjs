import {test} from 'node:test';
import assert from 'node:assert/strict';
import {debounced, rafBatched} from '../schedule.js';

test('debounced collapses a burst and forwards the latest arguments', t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const calls = [];
  const run = debounced((...args) => calls.push(args), 120);
  run('old');
  run('latest', 2);
  t.mock.timers.tick(119);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, [['latest', 2]]);
});

test('rafBatched keeps one frame and forwards the latest arguments', t => {
  let nextId = 0;
  const pending = new Map();
  globalThis.requestAnimationFrame = fn => {
    pending.set(++nextId, fn);
    return nextId;
  };
  globalThis.cancelAnimationFrame = id => pending.delete(id);
  t.after(() => {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });
  const calls = [];
  const run = rafBatched((...args) => calls.push(args));
  run('old');
  run('latest', 2);
  assert.equal(pending.size, 1);
  [...pending.values()][0]();
  assert.deepEqual(calls, [['latest', 2]]);
});
