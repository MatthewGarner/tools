import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cutPoints, plan} from '../print-artefact.js';

const rows = Array.from({length: 12}, (_, i) => ({top: i * 100 + 10, bottom: i * 100 + 90}));

test('R1: a sheet ends in the gap under a row, never through one', () => {
  const cuts = cutPoints(rows, 1200, 450);
  assert.ok(cuts.length >= 2);
  for(const c of cuts) assert.ok(!rows.some(r => r.top < c - .5 && r.bottom > c + .5), `cut ${c} runs through a row`);
  assert.ok(cuts.every((c, i) => c - (cuts[i - 1] || 0) <= 450 + .5), 'no sheet is taller than the page');
});

test('R1: a row taller than a sheet is the only thing that is cut', () => {
  assert.deepEqual(cutPoints([{top: 0, bottom: 1000}], 1000, 450), [450, 900]);
});

test('F8: an artefact that fits one sheet at 70% or more of its width-fitted size is shrunk onto one sheet', () => {
  const p = plan(1000, 800, rows.slice(0, 8), [0, 50]);       // sheet is 660 high: 660/800 = 83%
  assert.equal(p.mode, 'one');
  assert.ok(p.scale > .8 && p.scale < .9, 'scale ' + p.scale);
  assert.equal(plan(1000, 500, rows.slice(0, 5), null).scale, 1, 'one that already fits is not shrunk');
});

test('F8: otherwise it is cut between rows, later sheets repeat the header, and the legend never sits alone', () => {
  // 12 rows to y=1190 and 1250 high: 660/1250 = 53%, under the limit
  const p = plan(1000, 1250, rows, [0, 50]);
  assert.equal(p.mode, 'slices');
  assert.equal(p.headerH, 50);
  assert.ok(p.slices.length >= 2);
  for(const [, end] of p.slices.slice(0, -1)) assert.ok(!rows.some(r => r.top < end - .5 && r.bottom > end + .5), 'no row cut');
  // a layout whose natural last cut would leave one stray row alone on the last sheet keeps two
  const cuts = cutPoints(rows, 1210, 600, 50);
  const last = cuts.at(-1);
  assert.ok(rows.filter(r => r.top >= last - .5).length >= 2, 'the last sheet has at least two rows');
});
