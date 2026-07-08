// energy/frequency/tests/engine-primitives.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  F0, UFLS_STAGES, DEADBAND, DR, DM, DC,
  effectiveInertia, govHeadroom, dampingCoeff, rocof, serviceEnv, serviceResponse,
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

test('serviceEnv: all services are 0 inside the shared ±0.015 Hz deadband', () => {
  assert.equal(DEADBAND, 0.015);
  assert.equal(serviceEnv(0.01, DR), 0);
  assert.equal(serviceEnv(0.01, DM), 0);
  assert.equal(serviceEnv(0.01, DC), 0);
  assert.equal(serviceEnv(0.015, DC), 0);   // at the boundary, still 0
});

test('serviceEnv: DR & DM are single-slope, saturating at 1.0 by d=0.2 Hz', () => {
  close(serviceEnv(0.2, DR), 1, 1e-9, 'DR full at 0.2 Hz');
  close(serviceEnv(0.2, DM), 1, 1e-9, 'DM full at 0.2 Hz');
  assert.equal(serviceEnv(0.3, DR), 1);     // clamps beyond fs
  // linear DEADBAND(0.015)->fs(0.2): at d=0.1, frac = (0.1-0.015)/(0.2-0.015)
  const expected = (0.1 - 0.015) / (0.2 - 0.015);
  close(serviceEnv(0.1, DR), expected, 1e-9, 'DR mid-ramp');
  close(serviceEnv(0.1, DM), expected, 1e-9, 'DM mid-ramp (same envelope shape as DR)');
});

test('serviceEnv: DC is two-slope — ~5% at its 0.2 Hz breakpoint, full at 0.5 Hz', () => {
  close(serviceEnv(0.2, DC), 0.05, 1e-9, 'DC at breakpoint = ra');
  close(serviceEnv(0.5, DC), 1, 1e-9, 'DC full at fs');
  assert.equal(serviceEnv(0.6, DC), 1);     // clamps beyond fs
  // second slope fa(0.2)->fs(0.5): at d=0.35, frac = ra + (0.35-0.2)/(0.5-0.2)*(1-ra)
  //   = 0.05 + 0.5*0.95 = 0.525 — exact, so a wrong segment denominator can't slip through
  close(serviceEnv(0.35, DC), 0.525, 1e-9, 'DC two-slope exact at 0.35 Hz');
  close(serviceEnv(0.2 - 1e-6, DC), serviceEnv(0.2 + 1e-6, DC), 1e-4, 'DC continuous across the 0.2 Hz breakpoint');
});

test('serviceResponse: scales the envelope fraction by contracted MW', () => {
  close(serviceResponse(-0.5, 2, DC), 2, 1e-9, 'DC full output at 2 GW cap');
  assert.equal(serviceResponse(-0.01, 2, DC), 0);   // inside deadband
  assert.equal(serviceResponse(0.5, 2, DC), 0, 'directional: Low service does NOT inject above nominal');
});

test('UFLS_STAGES: first stage is 48.8 Hz at ~5%', () => {
  assert.equal(UFLS_STAGES[0].f, 48.8);
  close(UFLS_STAGES[0].shed, 0.05, 1e-9, 'first stage shed');
  assert.equal(F0, 50);
});
