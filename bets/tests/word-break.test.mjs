import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measuredLines} from '../layout.js';

const measure = s => String(s).length * 6;

/* XB-14: a word wider than its line breaks after one of its own boundaries; only a word with none breaks between characters */
test('a long identifier breaks after an underscore, not in the middle of a word', () => {
  assert.deepEqual(measuredLines('a_very_long_identifier_with_no_spaces_at_all_here and more', '13px x', 150, measure),
    ['a_very_long_identifier_', 'with_no_spaces_at_all_', 'here and more']);
  assert.deepEqual(measuredLines('https://example.com/a/very-long/path/name', '13px x', 150, measure).slice(0, 2),
    ['https://example.com/a/', 'very-long/path/name']);
});

test('a word with no boundary is broken between whole characters; ordinary text wraps as before', () => {
  assert.deepEqual(measuredLines('abcdefghijklmnopqrstuvwxyzabcdefghijkl', '13px x', 100, measure),
    ['abcdefghijklmnop', 'qrstuvwxyzabcdef', 'ghijkl']);
  assert.deepEqual(measuredLines('plain words wrap fine here', '13px x', 100, measure), ['plain words wrap', 'fine here']);
});
