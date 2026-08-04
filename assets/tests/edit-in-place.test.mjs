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
test('spec.custom is checked before cycle/menu/input, and forceInput bypasses it', () => {
  assert.match(src, /function open\(el, opts = \{\}\)/, 'open() takes an opts param');
  assert.match(src, /spec\.custom\s*&&\s*!opts\.forceInput\s*&&\s*spec\.custom\(el\)/,
    'custom hook gates on both being set and not force-bypassed');
  // it must run BEFORE the cycle/menu branches, and the menu's own opens-row
  // call must pass the bypass — else the precise-entry path would relearn the
  // slider intercept it exists to route around.
  const customIdx = src.indexOf('spec.custom && !opts.forceInput');
  const cycleIdx = src.indexOf('if(spec.cycle)');
  assert.ok(customIdx > 0 && cycleIdx > customIdx, 'custom checked before spec.cycle');
  assert.match(src, /if\(t\) open\(t, \{forceInput: true\}\)/, 'the opens-row call bypasses spec.custom');
});

test('cardMenu grows an optional extra(el) rows hook, backward-compatible when unset', () => {
  assert.match(src, /export function cardMenu\(\{field, add, remove = 'Remove branch', extra\}\)/);
  assert.match(src, /return \{menu: extra \? build : build\(\)\}/,
    'no extra ⇒ menu is the same static array as before (existing callers unaffected)');
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

test('post-add targeting is exact, waits for the normal render, and never falls back to the DSL', () => {
  assert.match(src, /function openAt\(target, \{origin = document\.activeElement, onCancel, onMiss, timeout = 500\}/);
  assert.match(src, /el\.dataset\.edit !== target\.kind \|\| el\.dataset\.line !== String\(target\.line\)/,
    'kind and source line are exact strings, not normalised numbers');
  assert.match(src, /Object\.entries\(target\.data \|\| \{\}\).*el\.dataset\[key\] === String\(value\)/s,
    'callers can require a stable per-target identity too');
  assert.match(src, /hits\.length === 1/, 'ambiguous targets are rejected');
  assert.match(src, /requestAnimationFrame\(attempt\)/, 'waits through the normal debounced render path');
  assert.match(src, /origin\?\.isConnected.*origin\.focus/s, 'miss restores the originating artefact control');
  assert.match(src, /function announceMiss\(\)/, 'a miss is announced rather than silently falling back');
  assert.match(src, /function focusAt\(target, \{origin = document\.activeElement, onMiss, timeout = 500\}/,
    'pre-entry adds use exact semantic focus without opening a second input');
});

test('Escape can cancel a just-created default item through caller-owned source rewrites', () => {
  assert.match(src, /active = \{input, el, errEl, onCancel: opts\.onCancel, ignoreScrollUntil: performance\.now\(\) \+ 100\}/);
  assert.match(src, /const cancel = active\?\.onCancel;[\s\S]{0,100}if\(cancel\) cancel\(\);/,
    'the inline input asks the owning tool to remove its default on Escape');
});

test('opening a focus-trapped menu survives its own focus-induced scroll', () => {
  assert.match(src, /ignoreScrollUntil: performance\.now\(\) \+ 100/,
    'new popovers receive a short focus-settling window');
  assert.match(src, /performance\.now\(\) >= active\.ignoreScrollUntil\) close\(\)/,
    'real later page scrolling still dismisses an active editor');
});
