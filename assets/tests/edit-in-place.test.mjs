// assets/tests/edit-in-place.test.mjs — structural guard (no DOM):
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src = readFileSync(new URL('../edit-in-place.js', import.meta.url), 'utf8');
test('popover stores its away handler on active and close() removes it', () => {
  assert.match(src, /active\s*=\s*\{[^}]*\baway\b[^}]*\}/, 'away stored on the popover active (any key order)');
  assert.match(src, /removeEventListener\('pointerdown',\s*away,\s*true\)/, 'close removes the away listener');
});
