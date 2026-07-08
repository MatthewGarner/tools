import {test} from 'node:test';
import assert from 'node:assert';

/* Fresh module state per test via cache-busting import (module holds a singleton). */
async function load(coarseNarrow){
  globalThis.matchMedia = () => ({matches: coarseNarrow});
  const listeners = [];
  globalThis.addEventListener = (type, fn) => listeners.push({type, fn});
  const mod = await import('../assets/mobile.js?' + Math.random());
  return {mod, fire: (type) => listeners.filter(l => l.type === type).forEach(l => l.fn())};
}

test('isMobile reflects matchMedia', async () => {
  assert.equal((await load(true)).mod.isMobile(), true);
  assert.equal((await load(false)).mod.isMobile(), false);
});

test('desktop: mobileAutoload is a no-op, persistence stays on', async () => {
  const {mod} = await load(false);
  let called = 0;
  const ret = mod.mobileAutoload(() => called++);
  assert.equal(ret, false);
  assert.equal(called, 0);
  assert.equal(mod.shouldPersist(), true);
});

test('mobile: auto-load suppresses persistence until first interaction', async () => {
  const {mod, fire} = await load(true);
  let called = 0;
  const ret = mod.mobileAutoload(() => called++);
  assert.equal(ret, true);
  assert.equal(called, 1);
  assert.equal(mod.shouldPersist(), false); // suppressed while example is untouched
  fire('pointerdown');
  assert.equal(mod.shouldPersist(), true);  // first real interaction re-enables
});
