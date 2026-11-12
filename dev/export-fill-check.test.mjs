/* The closed-early slide check must not be stricter than the layout it judges, and the layout's rule is ink-based: a slide fits
   when its last card, row or closing rule does, so a card "would have fit" with ONE gap above it (Board, Register) or one gap
   above and the closing lane rule one gap below (Grid). The gap is read from the column, never a constant. (PR 35: CI fonts
   put roadmap/long-text at card 185, room 202, gap 16 and a flat 12 failed there; the old two-gap pad was the layout's rule
   before the cursor's trailing gap stopped counting.) */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkFill} from './pw/export-checks.mjs';

const card = (key, x, y, h) => ({key, x, y, w: 400, h, drawnBottom: y + h});
/* two slides of one window: the first column continues onto slide 2 with three cards; `gap` apart in the column */
const slides = (room, gap) => {
  const bodyTop = 200, bodyBottom = 750, lastBottom = bodyBottom - room;
  const a = {group: '0', bodyTop, bodyBottom, contentBottom: lastBottom, texts: [],
    cards: [card('a1', 40, bodyTop, 150), card('a2', 40, bodyTop + 150 + gap, lastBottom - bodyTop - 150 - gap)]};
  const b = {group: '0', bodyTop, bodyBottom, contentBottom: 700, texts: [],
    cards: [card('b1', 40, bodyTop, 185), card('b2', 40, bodyTop + 185 + gap, 120), card('b3', 40, bodyTop + 305 + 2 * gap, 120)]};
  return [a, b];
};
const early = (room, gap, style) => checkFill(slides(room, gap), {style}).find(c => c.check === 'slides:closed-early');

test('closed-early (Board): a card needs one gap above it, and nothing below', () => {
  assert.equal(early(200, 16, 'board').pass, true, 'card 185 + one gap of 16 = 201 does not fit 200');
  assert.equal(early(202, 16, 'board').pass, false, 'card 185 + 16 = 201 fits 202: the slide closed early');
  assert.equal(early(201, 6, 'board').pass, false, 'with a gap of 6 the card needs 191');
});

test('closed-early (Register): one row gap above the row, read from the column', () => {
  assert.equal(early(190, 6, 'register').pass, true);
  assert.equal(early(192, 6, 'register').pass, false);
});

test('closed-early (Grid): one gap above the row and the closing lane rule one gap below', () => {
  assert.equal(early(200, 8, 'grid').pass, true, '185 + 2 x 8 = 201 does not fit 200');
  assert.equal(early(202, 8, 'grid').pass, false);
});
