import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderQuadrant} from '../render-quadrant.js';

const colors = {ink: '#141b21', muted: '#5b6670', accent: '#c05621', accentInk: '#8e4a1e', bg: '#f7f8f6', card: '#ffffff',
  border: '#e2e5e1', err: '#b3403a', track: '#e7e9e5', status: {}, statusInk: {}};
const measure = (s, font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return String(s).length * (m ? +m[1] : 12) * 0.55; };

/* At 64 bets a number is printed on the plot only where it is clear of every other bubble and number; the rest are named in
   the key, and the picture says how many and which. */
test('the 64-bet quadrant numbers only what fits clear and says where the rest are', () => {
  const m = parse(readFileSync(new URL('../../dev/export-audit-instruments/docs/bets/g-many.txt', import.meta.url), 'utf8'));
  const svg = renderQuadrant(m, simulate(m), {colors, measure, intent: 'native'});
  const note = svg.match(/>(\d+) of 64 bets carry their number on the plot; ([^<]*) are in the key only\.</);
  assert.ok(note, 'the picture states the count');
  const onPlot = +note[1];
  const chips = (svg.match(/<rect x="[\d.]+" y="[\d.]+" width="28" height="15"/g) || []).length;
  assert.equal(chips, onPlot, 'exactly the stated number of chips is on the plot');
  assert.ok(onPlot < 64 && /B\d\d/.test(note[2]));
  const keyRows = (svg.match(/data-quadrant-key/g) || []).length;
  assert.equal(keyRows, 1);
});
