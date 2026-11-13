/* A bet's EV print step (BT-2): the smallest power of ten at least 0.5% of the largest magnitude in its trio. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {simulate, evStepFor} from '../engine.js';
import {evv} from '../format.js';

const ROOT = new URL('../../', import.meta.url);
const LANTERN = [...readFileSync(new URL('bets/app.js', ROOT), 'utf8').matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)][0][2];

/* ---------- per-bet EV step ---------- */
test('a bet\'s EV step is the smallest power of ten at least 0.5% of the largest magnitude in its trio', () => {
  const step = (...v) => evStepFor(v);
  assert.equal(step(68.7, 113.3, 168.9), 1);
  assert.equal(step(25, 53, 85.6), 1);
  assert.equal(step(-5, 11, 33.5), 1);
  assert.equal(step(3.7, 9.7, 17.7), 0.1);
  assert.equal(step(100, 200, 250), 10);
  assert.equal(step(0, 0, 0), 1);
  assert.equal(step(-0.3, -0.3, -0.3), 0.01);
  assert.equal(evv({step: evStepFor([-0.3, -0.3, -0.3])}, -0.3), '−0.30');
});
test('the engine puts that step on every bet (Lantern: every trio tops out above 29, so whole units)', () => {
  const s = simulate(parse(LANTERN));
  assert.deepEqual([...s.bets.values()].map(r => r.ev.step), [1, 1, 1, 1, 1]);
});
