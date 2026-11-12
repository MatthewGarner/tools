import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cutPoints, plan, sliceEnd, PAGE_RATIO} from '../print-artefact.js';

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

test('F8: rows that abut (no gap between them) still allow a sheet to end on a row edge', () => {
  const abutting = Array.from({length: 14}, (_, i) => ({top: i * 76, bottom: (i + 1) * 76}));
  const cuts = cutPoints(abutting, 14 * 76, 500);
  assert.ok(cuts.length >= 1);
  for(const c of cuts) assert.equal(c % 76, 0, `cut ${c} is on a row edge, not through a row`);
});

const longText = [[382, 771], [779, 961], [1021, 1338], [1398, 1609]].map(([top, bottom]) => ({top, bottom}));

test('H4: a sheet is not closed while the next row fits; the paper is A4 landscape (277 x 190mm less margins)', () => {
  assert.ok(PAGE_RATIO >= .67 && PAGE_RATIO <= 190 / 277, 'the sheet ratio is the A4 body, a hair conservative: ' + PAGE_RATIO);
  const p = plan(1440, 1717, longText, [284, 340]);
  assert.equal(p.mode, 'slices');
  // the second row ends at 961 < 1440 x .68 = 979, so it shares the first sheet (the old .66 ratio closed the sheet after row one)
  assert.equal(p.slices[1][0], 1021);
  assert.ok(p.slices[0][1] - p.slices[0][0] <= 1440 * PAGE_RATIO + .01);
  for(const [y0, y1] of p.slices.slice(1)) assert.ok(340 - 284 + (y1 - y0) <= 1440 * PAGE_RATIO + .01, 'later sheets, header included, fit the paper');
});

test('H5: a sheet starts at the top of its first row and stops under its last: nothing from a neighbouring row', () => {
  const cuts = cutPoints(longText, 1717, 1440 * PAGE_RATIO, 56);
  for(const c of cuts) assert.ok(longText.some(r => r.top === c), `cut ${c} is the top of a row`);
  assert.equal(sliceEnd(longText, 0, 1021), 961 + 12);
  // the gap under row one is 8 (771 to 779) and the next row's 1-unit top rule straddles 779: the sheet stops a unit short, at 778 (it was 771 + 8 = 779, which drew that rule)
  assert.equal(sliceEnd(longText, 0, 779), 778, 'a short gap is not overrun, and the next top rule is left off');
  assert.equal(sliceEnd([{top: 0, bottom: 100}, {top: 100, bottom: 200}], 0, 100), 100, 'a row that abuts the next is not cut');
  assert.equal(sliceEnd([{top: 0, bottom: 1000}], 0, 450), 450, 'a row cut through loses no unit');
});

test('H6: where a lane continues on a later sheet its heading takes room on that sheet', () => {
  // lane A: heading 100..140, rows to 600; lane B heading 640..680. Sheet 2 starts mid-lane-A, so it needs the heading again (40 high).
  const rowsA = Array.from({length: 6}, (_, i) => ({top: 150 + i * 80, bottom: 150 + i * 80 + 70}));
  const headings = [{top: 100, height: 40, name: 'A'}, {top: 640, height: 40, name: 'B'}];
  const withLabel = cutPoints(rowsA, 700, 400, 50, 2, headings);
  const without = cutPoints(rowsA, 700, 400, 50, 2, []);
  const room = c => (c ? 400 - 50 - 44 : 400);
  assert.ok(withLabel.length >= 1);
  const second = (cuts, headingsHere) => { const s = cuts[0], e = cuts[1] ?? 700; return e - s; };
  assert.ok(second(withLabel) <= 400 - 50 - 44 + 12, 'the continued heading is paid for');
  assert.ok(second(without) <= 400 - 50 + 12);
});
