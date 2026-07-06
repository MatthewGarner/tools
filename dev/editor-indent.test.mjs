import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../roadmap/vendor/codemirror.js';
import {indentChanges, INDENT_UNIT} from '../assets/editor-common.js';

const state = (doc, anchor, head = anchor) =>
  EditorState.create({doc, selection: {anchor, head}});
const apply = (st, dir) => {
  const changes = indentChanges(st, dir);
  return changes ? st.update({changes}).state.doc.toString() : null;
};

test('indent unit is the DSL indent: two spaces', () => {
  assert.equal(INDENT_UNIT, '  ');
});

test('Tab indents the cursor line by one unit, wherever the cursor sits', () => {
  assert.equal(apply(state('outcome: X\nchild', 14), 1), 'outcome: X\n  child');
});

test('Shift-Tab dedents by one unit; single stray space also removed', () => {
  assert.equal(apply(state('  child', 3), -1), 'child');
  assert.equal(apply(state(' odd', 2), -1), 'odd');
  assert.equal(apply(state('\ttabbed', 3), -1), 'tabbed');
});

test('dedent on an unindented line is a no-op (null)', () => {
  assert.equal(apply(state('plain', 2), -1), null);
});

test('multi-line selection indents every touched line once', () => {
  const doc = 'a\nb\nc';
  assert.equal(apply(state(doc, 0, doc.length), 1), '  a\n  b\n  c');
});

test('multi-line dedent only changes lines that have leading space', () => {
  const doc = '  a\nb\n    c';
  assert.equal(apply(state(doc, 0, doc.length), -1), 'a\nb\n  c');
});
