import {test} from 'node:test';
import assert from 'node:assert/strict';

// motion.js reads matchMedia at module load; document.hidden in the gate. Stub both.
globalThis.matchMedia = () => ({matches: false, addEventListener() {}});
globalThis.document = {hidden: false};

const {captureFlip, applyFlip, motionStill, mountMotion} = await import('../motion.js');

test('captureFlip keys by the attribute', () => {
  const el = a => ({getAttribute: () => a, getBoundingClientRect: () => ({left: 0, top: 0})});
  const container = {querySelectorAll: () => [el('gas'), el('wind')]};
  const map = captureFlip(container, 'data-plant');
  assert.equal(map.size, 2);
  assert.ok(map.has('gas') && map.has('wind'));
});

test('applyFlip is a no-op with no captured map (never throws)', () => {
  assert.doesNotThrow(() => applyFlip({}, 'data-plant', null));
});

test('motionStill is false under the non-reduced stub', () => {
  assert.equal(typeof motionStill, 'function');
  assert.equal(motionStill(), false);
});

test('mountMotion returns a paint fn with reveal/reset arming', () => {
  const paint = mountMotion({});
  assert.equal(typeof paint, 'function');
  assert.equal(typeof paint.reveal, 'function');
  assert.equal(typeof paint.reset, 'function');
});
