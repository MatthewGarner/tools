import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {focusHeroIndex} from '../render-focus.js';

test('no focus: key → first non-empty horizon (byte-identical fallback)', () => {
  assert.equal(focusHeroIndex(parse('NOW\nNEXT\nCore: A\nLATER')), 1);  // NOW empty → NEXT
});
test('focus: names a horizon (case-insensitive) → that horizon is the hero', () => {
  const m = parse('style: focus\nfocus: later\nNOW\nCore: A\nLATER\nCore: B');
  assert.equal(m.focus, 'later');
  assert.equal(focusHeroIndex(m), 2);
});
test('focus: blank or renamed-away → falls back to first non-empty', () => {
  assert.equal(focusHeroIndex(parse('focus: Q9\nNOW\nCore: A\nNEXT\nCore: B')), 0);   // no "Q9" horizon
  assert.equal(focusHeroIndex(parse('focus:\nNOW\nCore: A')), 0);                      // blank
});
