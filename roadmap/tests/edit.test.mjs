import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {moveItem} from '../edit.js';

/* helper: run moveItem and return the resulting lines array */
function move(text, srcLine, target){
  const r = moveItem(text, parse(text), srcLine, target);
  return r === null ? null : {lines: r.text.split('\n'), cursorLine: r.cursorLine, text: r.text};
}

const DOC = [
  'title: T',            // 0
  '// keep me',          // 1
  'NOW',                 // 2
  'Core: First [doing]', // 3
  'Core: Second -- a note', // 4
  'Growth: Third',       // 5
  'NEXT',                // 6
  'Core: Fourth',        // 7
  'LATER',               // 8
  'Growth: Fifth [done]',// 9
].join('\n');

test('horizon move: NOW item to end of NEXT/Core cell', () => {
  const r = move(DOC, 3, {h: 1, lane: 'Core', beforeLine: null});
  assert.equal(r.lines[r.cursorLine], 'Core: First [doing]');
  const next = r.lines.indexOf('NEXT'), later = r.lines.indexOf('LATER');
  assert.ok(r.cursorLine > next && r.cursorLine < later, 'lands inside NEXT section');
  assert.ok(r.cursorLine > r.lines.indexOf('Core: Fourth'), 'after existing cell occupant');
});

test('lane rewrite on cross-lane drop; status and note travel', () => {
  const r = move(DOC, 4, {h: 0, lane: 'Growth', beforeLine: null});
  assert.equal(r.lines[r.cursorLine], 'Growth: Second -- a note');
  const m = parse(r.text);
  const it = m.items.find(i => i.title === 'Second');
  assert.equal(it.lane, 'Growth');
  assert.equal(it.note, 'a note');
});

test('reorder within a cell: insert before a card', () => {
  const r = move(DOC, 4, {h: 0, lane: 'Core', beforeLine: 3});
  assert.equal(r.lines[3], 'Core: Second -- a note');
  assert.equal(r.lines[4], 'Core: First [doing]');
});

test('drop into an empty cell lands just under the header', () => {
  const r = move(DOC, 3, {h: 2, lane: 'Core', beforeLine: null});
  const later = r.lines.indexOf('LATER');
  assert.equal(r.lines[later + 1], 'Core: First [doing]');
});

test('laneless target strips the prefix; laneless source gains one', () => {
  const r1 = move(DOC, 3, {h: 1, lane: '', beforeLine: null});
  assert.equal(r1.lines[r1.cursorLine], 'First [doing]');
  const doc2 = 'NOW\nplain item\nNEXT\nCore: x';
  const r2 = move(doc2, 1, {h: 1, lane: 'Core', beforeLine: null});
  assert.equal(r2.lines[r2.cursorLine], 'Core: plain item');
});

test('header written with trailing colon still found for empty-cell drop', () => {
  const doc = 'NOW:\nCore: a\nNEXT:\nLATER:';
  const r = move(doc, 1, {h: 2, lane: 'Core', beforeLine: null});
  assert.equal(r.lines[r.lines.indexOf('LATER:') + 1], 'Core: a');
});

test('config lines and comments byte-preserved', () => {
  const r = move(DOC, 3, {h: 1, lane: 'Core', beforeLine: null});
  assert.equal(r.lines[0], 'title: T');
  assert.ok(r.lines.includes('// keep me'));
});

test('no-op when dropped where it already is', () => {
  assert.equal(move(DOC, 3, {h: 0, lane: 'Core', beforeLine: 4}), null);
  assert.equal(move(DOC, 5, {h: 0, lane: 'Growth', beforeLine: null}), null);
});

test('move into last horizon at EOF without trailing newline', () => {
  const doc = 'NOW\nCore: a\nLATER\nCore: z';
  const r = move(doc, 1, {h: 2, lane: 'Core', beforeLine: null});
  assert.equal(r.lines[r.lines.length - 1], 'Core: a');
});

test('moving before a card that sits later in the doc than the source', () => {
  const r = move(DOC, 3, {h: 2, lane: 'Growth', beforeLine: 9});
  const idx = r.lines.indexOf('Growth: First [doing]');
  assert.equal(r.lines[idx + 1], 'Growth: Fifth [done]');
});
