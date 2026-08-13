import test from 'node:test';
import assert from 'node:assert/strict';
import {diceGame} from '../dice.js';

test('dependent dice is seeded deterministic and conserves work between buffers and delivery', () => {
  const a = diceGame({days: 30, seed: 9}), b = diceGame({days: 30, seed: 9});
  assert.deepEqual(a, b);
  assert.equal(a.released - a.delivered, a.finalWip);
  assert.equal(a.buffers.reduce((s, n) => s + n, 0), a.finalWip);
});

test('dependent dice bounds its demonstrative shape and keeps all local rolls positive', () => {
  const r = diceGame({stations: 20, days: 1000});
  assert.equal(r.stations, 8);
  assert.equal(r.days, 90);
  assert.ok(r.realisedAverage.every(n => n >= 1 && n <= 6));
  assert.ok(r.delivered <= r.released);
});
