/* assets/tests/syntax-try.test.mjs — try-it specimen placement. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planInsert} from '../syntax-try.js';

const KEYS = ['title', 'palette', 'accent', 'today', 'verdict'];

test('config specimen replaces the last existing line for that key', () => {
  assert.deepEqual(planInsert('title: T\nwip stuff\ntitle: U', 0, 'title: Trading roadmap', KEYS),
    {op: 'replace', line: 2, text: 'title: Trading roadmap'});
});

test('config specimen with no existing line lands in the config block', () => {
  assert.deepEqual(planInsert('title: T\nA 2026-09', 1, 'verdict: off', KEYS),
    {op: 'insert', afterLine: 0, text: 'verdict: off'});
});

test('config specimen on a content-first doc prepends', () => {
  assert.deepEqual(planInsert('A 2026-09', 0, 'title: T', KEYS),
    {op: 'prepend', text: 'title: T'});
});

test('node specimen inserts after the cursor line', () => {
  assert.deepEqual(planInsert('title: T\nA 2026-09', 1, 'Grid: B 2026-10 .. 2026-11', KEYS),
    {op: 'insert', afterLine: 1, text: 'Grid: B 2026-10 .. 2026-11'});
});

test('empty doc: everything prepends', () => {
  assert.deepEqual(planInsert('', 0, 'A 2026-09', KEYS), {op: 'prepend', text: 'A 2026-09'});
  assert.deepEqual(planInsert('  \n', 0, 'title: T', KEYS), {op: 'prepend', text: 'title: T'});
});

test('cursor beyond the doc clamps to the last line', () => {
  assert.deepEqual(planInsert('one\ntwo', 99, 'three', KEYS),
    {op: 'insert', afterLine: 1, text: 'three'});
});

test('a specimen whose head is not a config key is a node, colon or not', () => {
  assert.deepEqual(planInsert('title: T', 0, 'Grid: thing 2026-09', KEYS),
    {op: 'insert', afterLine: 0, text: 'Grid: thing 2026-09'});
});
