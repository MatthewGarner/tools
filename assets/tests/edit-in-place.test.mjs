// assets/tests/edit-in-place.test.mjs — structural guard (no DOM):
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src = readFileSync(new URL('../edit-in-place.js', import.meta.url), 'utf8');
test('popover stores its away handler on active and close() removes it', () => {
  assert.match(src, /active\s*=\s*\{[^}]*\baway\b[^}]*\}/, 'away stored on the popover active (any key order)');
  assert.match(src, /removeEventListener\('pointerdown',\s*away,\s*true\)/, 'close removes the away listener');
});

test('menu spec renders opens+action rows and routes by data-line', () => {
  assert.match(src, /spec\.menu/, 'handles spec.menu');
  assert.match(src, /querySelector\('\[data-line="'\s*\+/, 'routes opens rows by data-line');
  assert.match(src, /'✖'\s*\+\s*row\.label/, 'action rows commit the ✖ sentinel');
});

test('coarse pointers redirect an in-card field tap to the same-line menu', () => {
  assert.match(src, /matchMedia\('\(pointer: coarse\)'\)/, 'gates on coarse pointer');
  assert.match(src, /querySelectorAll\('\[data-menu\]\[data-line="'\s*\+/, 'finds same-line data-menu');
  assert.match(src, /getBoundingClientRect\(\)/, 'tests the tap against the menu hit-rect');
  assert.match(src, /!el\.hasAttribute\('data-menu'\)/, 'never redirects a menu element onto itself');
});

test('spec.menu may be a function, resolved at open time', () => {
  assert.match(src, /typeof spec\.menu === 'function' \? spec\.menu\(el\) : spec\.menu/);
});
test('renderPopoverRows handles commit and submenu rows', () => {
  assert.match(src, /function renderPopoverRows\(rows, rect, activeEl\)/);
  assert.match(src, /row\.commit/, 'commit row branch');
  assert.match(src, /onCommit\(row\.commit\.kind, row\.commit\.line/, 'commit calls onCommit with the row payload');
  assert.match(src, /row\.submenu/, 'submenu row branch');
  // \bclose\(\); requires the real statement (trailing semicolon) — the
  // nearby comment says "close() disposes the button" with no semicolon,
  // so a looser close\(\) would incidentally pass on the comment text.
  assert.match(src, /getBoundingClientRect\(\)[\s\S]{0,100}\bclose\(\);[\s\S]{0,40}renderPopoverRows\(row\.submenu/, 'submenu captures rect before close, then re-renders');
});
