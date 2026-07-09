import {test} from 'node:test';
import assert from 'node:assert';

/* Fresh module state per test via cache-busting import (module holds a singleton). */
async function load(){
  const listeners = [];
  globalThis.addEventListener = (type, fn) => listeners.push({type, fn});
  const mod = await import('../assets/mobile.js?' + Math.random());
  return {mod, fire: (type) => listeners.filter(l => l.type === type).forEach(l => l.fn())};
}

test('autoloadExample fires on first run and suppresses persistence until first interaction', async () => {
  const {mod, fire} = await load();
  let called = 0;
  const ret = mod.autoloadExample(() => called++);
  assert.equal(ret, true);
  assert.equal(called, 1);                      // the example was loaded
  assert.equal(mod.shouldPersist(), false);     // suppressed while the example is untouched
  fire('pointerdown');
  assert.equal(mod.shouldPersist(), true);      // first real interaction re-enables persistence
});

test('a keydown also re-enables persistence', async () => {
  const {mod, fire} = await load();
  mod.autoloadExample(() => {});
  assert.equal(mod.shouldPersist(), false);
  fire('keydown');
  assert.equal(mod.shouldPersist(), true);
});
