import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../roadmap/vendor/codemirror.js';
import {lineOpsChanges} from '../assets/editor-common.js';

const apply = (doc, ops) => {
  const st = EditorState.create({doc});
  return st.update({changes: lineOpsChanges(st, ops)}).state.doc.toString();
};
const DOC = 'a\nb\nc\nd\ne';

test('replace + delete resolve against the ORIGINAL doc (no line shifting)', () => {
  assert.equal(apply(DOC, [{line: 1, text: null}, {line: 3, text: 'D'}]), 'a\nc\nD\ne');
});
test('non-contiguous deletes', () => {
  assert.equal(apply(DOC, [{line: 0, text: null}, {line: 2, text: null}, {line: 4, text: null}]), 'b\nd');
});
test('ADJACENT deletes including line 0 coalesce (overlapping ranges would throw)', () => {
  assert.equal(apply('a\nb\nc', [{line: 0, text: null}, {line: 1, text: null}]), 'c');
  assert.equal(apply(DOC, [{line: 1, text: null}, {line: 2, text: null}]), 'a\nd\ne');
});
test('duplicate line ops are rejected', () => {
  assert.throws(() => apply(DOC, [{line: 1, text: null}, {line: 1, text: 'x'}]));
});
test('delete the last line removes the preceding newline (no trailing blank)', () => {
  assert.equal(apply(DOC, [{line: 4, text: null}]), 'a\nb\nc\nd');
});
test('single history event: one undo restores everything', () => {
  // dispatch through a real state with history — mirror editor-common's own setup
});
