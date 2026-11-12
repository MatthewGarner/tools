import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cutPoints} from '../print-artefact.js';

const rows = Array.from({length: 12}, (_, i) => ({top: i * 100 + 10, bottom: i * 100 + 90}));

test('R1: a page ends in the gap under a row, never through one', () => {
  const cuts = cutPoints(rows, 1200, 450);
  assert.ok(cuts.length >= 2);
  for(const c of cuts) assert.ok(!rows.some(r => r.top < c - .5 && r.bottom > c + .5), `cut ${c} runs through a row`);
  assert.ok(cuts.every((c, i) => c - (cuts[i - 1] || 0) <= 450 + .5), 'no page is taller than the sheet');
});

test('R1: a picture that fits one sheet is not cut; a row taller than a sheet is the only thing that is', () => {
  assert.deepEqual(cutPoints(rows.slice(0, 3), 300, 450), []);
  const cuts = cutPoints([{top: 0, bottom: 1000}], 1000, 450);
  assert.deepEqual(cuts, [450, 900]);
});
