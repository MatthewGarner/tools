// energy/frequency/tests/engine-primitives.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  F0, UFLS_STAGES, DC_FULL_HZ,
  effectiveInertia, govHeadroom, dampingCoeff, rocof, dcResponse,
} from '../engine.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('rocof: the pinned canonical identity 1.8 GW @ 90 GVA·s = 0.5 Hz/s', () => {
  close(rocof(1.8, 90), 0.5, 1e-9, 'canonical RoCoF');
  close(rocof(1.0, 120), 0.2083, 1e-3, '1 GW at the floor');
});

test('effectiveInertia: grid-forming adds, soft-capped by battery MW', () => {
  assert.equal(effectiveInertia(120, 0, 1), 120);          // no GFM asked
  assert.equal(effectiveInertia(120, 10, 1), 130);         // 10 < cap (20·1)
  assert.equal(effectiveInertia(120, 50, 1), 140);         // capped at 20·1
  assert.equal(effectiveInertia(120, -5, 1), 120);         // negative floored
});

test('govHeadroom rises with synchronous inertia (the coupling)', () => {
  assert.ok(govHeadroom(250) > govHeadroom(90));
  close(govHeadroom(90), 1.08, 1e-9, 'headroom at 90 GVA·s');
});

test('dampingCoeff = D_pu·load/f0 in GW/Hz', () => {
  close(dampingCoeff(30, 1.5), 0.9, 1e-9, 'damping');
});

test('dcResponse: deadband near nominal, full contracted output at ±0.5 Hz', () => {
  assert.equal(dcResponse(-0.01, 1), 0);                   // inside deadband
  close(dcResponse(-0.5, 1), 1, 1e-9, 'full at 0.5 Hz');   // full output
  assert.equal(dcResponse(-1.0, 1), 1);                    // saturates at cap
  assert.ok(dcResponse(-0.25, 1) > 0 && dcResponse(-0.25, 1) < 1); // ramp
});

test('UFLS_STAGES: first stage is 48.8 Hz at ~5%', () => {
  assert.equal(UFLS_STAGES[0].f, 48.8);
  close(UFLS_STAGES[0].shed, 0.05, 1e-9, 'first stage shed');
  assert.equal(F0, 50);
});
