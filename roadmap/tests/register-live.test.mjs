/* Geometry-literals guard for the T2 extraction (deck-parts.js): REGISTER_GEOM
   duplicates render-deck.js's own W/M/INNER constants on purpose (avoids a
   value-only import back into render-deck.js) — this pins them in lockstep so
   a future edit to one can't silently drift from the other. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REGISTER_GEOM, registerColumns} from '../deck-parts.js';
import {parse} from '../parse.js';

test('the deck register geometry is exactly the historical constants (guards the refactor)', () => {
  assert.deepEqual(REGISTER_GEOM, {W: 1920, M: 100, INNER: 1720});
});

test('registerColumns keeps ITEM always; drops LANE/STATUS/NOTE when absent', () => {
  const bare = registerColumns(parse('NOW\nAlpha\nNEXT\nBeta'));
  assert.deepEqual(bare.map(c => c.key), ['item', 'horizon']);
  const full = registerColumns(parse('NOW\nCore: A [doing] -- n\nNEXT\nGrowth: B'));
  assert.deepEqual(full.map(c => c.key), ['item', 'lane', 'horizon', 'status', 'note']);
});
