/* The closed-early slide check must not be stricter than the layout it judges. A Board column keeps one card gap
   above a card and one below it, so a card "would have fit" only with both; CI's fonts put roadmap/long-text in the
   band between that and the old flat 12 (card 185, room 202, gap 16) and the gate failed there and nowhere else. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkFill} from './pw/export-checks.mjs';

const card = (key, x, y, h) => ({key, x, y, w: 400, h, drawnBottom: y + h});
/* two slides of one Board window: three columns, the first column continues onto slide 2 with three cards */
const board = room => {
  const bodyTop = 200, bodyBottom = 750, lastBottom = bodyBottom - room;
  const a = {group: '0', bodyTop, bodyBottom, contentBottom: lastBottom, texts: [],
    cards: [card('a1', 40, bodyTop, 150), card('a2', 40, bodyTop + 166, lastBottom - bodyTop - 166)]};
  const b = {group: '0', bodyTop, bodyBottom, contentBottom: 700, texts: [],
    cards: [card('b1', 40, bodyTop, 185), card('b2', 40, bodyTop + 201, 120), card('b3', 40, bodyTop + 337, 120)]};
  return [a, b];
};
const early = slides => checkFill(slides, {style: 'board'}).find(c => c.check === 'slides:closed-early');

test('closed-early (Board): a card needs its gap above and below, as the layout does', () => {
  assert.equal(early(board(202)).pass, true, 'card 185 + two gaps of 16 = 217 does not fit 202');
  assert.equal(early(board(216)).pass, true, 'one unit short of the layout\'s own rule');
});

test('closed-early (Board): a slide that leaves room for the card and both gaps is still caught', () => {
  assert.equal(early(board(230)).pass, false);
});
