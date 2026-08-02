/* assets/tests/verdict-edit.test.mjs — the shared authored-verdict rewrite. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setVerdictText, verdictMenuRows, validVerdictInput} from '../verdict-edit.js';

const RE = /^(title|palette|accent|today|verdict)\s*:/i;   // timeline's shape

test('set replaces an existing verdict line in place', () => {
  assert.equal(setVerdictText('title: T\nverdict: old\nA 2026-09', 'new words', RE),
    'title: T\nverdict: new words\nA 2026-09');
});

test('set rewrites the LAST duplicate — the one the parser honours', () => {
  const out = setVerdictText('verdict: dead\ntitle: T\nverdict: live\nA 2026-09', 'new', RE);
  assert.equal(out, 'verdict: dead\ntitle: T\nverdict: new\nA 2026-09');
});

test('clear deletes EVERY verdict line — else a dead earlier line takes over', () => {
  assert.equal(setVerdictText('verdict: a\ntitle: T\nverdict: b\nA 2026-09', null, RE),
    'title: T\nA 2026-09');
});

test('insert lands after leading config, before the first content line', () => {
  assert.equal(setVerdictText('title: T\ntoday: 2026-08-01\nA 2026-09', 'We hold', RE),
    'title: T\ntoday: 2026-08-01\nverdict: We hold\nA 2026-09');
});

test('insert on a config-only or empty doc appends / creates', () => {
  assert.equal(setVerdictText('title: T', 'X', RE), 'title: T\nverdict: X');
  assert.equal(setVerdictText('', 'X', RE), 'verdict: X');
  assert.equal(setVerdictText('', null, RE), '');
});

test('leading blank lines and comments do not count as content', () => {
  assert.equal(setVerdictText('// a plan\n\ntitle: T\nA 2026-09', 'X', RE),
    '// a plan\n\ntitle: T\nverdict: X\nA 2026-09');
});

test('a trailing comment on the rewritten line survives', () => {
  assert.equal(setVerdictText('verdict: old // why\nA 2026-09', 'new', RE),
    'verdict: new // why\nA 2026-09');
});

test('newlines in the value are flattened — one field is one source line', () => {
  assert.equal(setVerdictText('A 2026-09', 'two\nlines', RE), 'verdict: two lines\nA 2026-09');
});

test('menu rows: absent key → no "Use the tool\'s line"; off → no Off row', () => {
  const labels = rows => rows.map(r => r.label);
  assert.deepEqual(labels(verdictMenuRows(null)),
    ['Edit the line…', 'Copy line', 'Off']);
  assert.deepEqual(labels(verdictMenuRows('We hold the date')),
    ['Edit the line…', 'Copy line', "Use the tool's line", 'Off']);
  assert.deepEqual(labels(verdictMenuRows('off')),
    ['Edit the line…', 'Copy line', "Use the tool's line"]);
  assert.deepEqual(labels(verdictMenuRows('')),   // present-but-empty = suppressed
    ['Edit the line…', 'Copy line', "Use the tool's line"]);
});

test('input validator: empty fine, comment-shaped not', () => {
  assert.ok(validVerdictInput(''));
  assert.ok(validVerdictInput('We ship'));
  assert.ok(!validVerdictInput('// secretly'));
});
