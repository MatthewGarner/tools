import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validators, editLabel, editDates, cycleStatus, addItemLine, removeItemLine}
  from '../edit-targets.js';

test('validators: labels reject dates/config/brackets; dates accept 1–2 parseable dates', () => {
  assert.ok(validators.label('Energisation works'));
  assert.ok(!validators.label('2026-08 thing'));
  assert.ok(!validators.label('title: x'));
  assert.ok(!validators.label('with [tag]'));
  assert.ok(validators.dates('2026-08 .. 2026-10'));
  assert.ok(validators.dates('2026-08-03'));
  assert.ok(!validators.dates('soon .. later'));
  assert.ok(!validators.dates('2026-08 .. 2026-09 .. 2026-10'));
});

test('editLabel / editDates rewrite in place', () => {
  const line = 'Grid: Offer 2026-08 .. 2026-10 [risk] // note';
  assert.equal(editLabel(line, 'Offer', 'Connection offer'),
    'Grid: Connection offer 2026-08 .. 2026-10 [risk] // note');
  assert.equal(editDates(line, '2026-08 .. 2026-10', '2026-09 .. 2026-12'),
    'Grid: Offer 2026-09 .. 2026-12 [risk] // note');
});

test('cycleStatus: none → done → risk → none, note preserved', () => {
  const base = 'Grid: Offer 2026-08 .. 2026-10 // note';
  const done = cycleStatus(base, '');
  assert.equal(done, 'Grid: Offer 2026-08 .. 2026-10 [done] // note');
  const risk = cycleStatus(done, 'done');
  assert.equal(risk, 'Grid: Offer 2026-08 .. 2026-10 [risk] // note');
  assert.equal(cycleStatus(risk, 'risk'), base);
});

test('addItemLine: after the last item, dated around today, placeholder selectable', () => {
  const r = addItemLine('title: T\nGrid: Offer 2026-08 .. 2026-10', '2026-07-06');
  assert.equal(r.afterLine, 1);
  assert.equal(r.newLine, 'New milestone 2026-08 .. 2026-10');
  assert.equal(r.select, 'New milestone');
  const empty = addItemLine('title: T', '2026-12-15');
  assert.equal(empty.afterLine, 0);
  assert.equal(empty.newLine, 'New milestone 2027-01 .. 2027-03');
});

test('addItemLine with lane lands after that lane\'s last item, prefixed', () => {
  const doc = 'Grid: Offer 2026-08 .. 2026-10\nBuild: FID 2026-06-30 [done]\nGrid: Energisation 2027-02 .. 2027-06';
  const r = addItemLine(doc, '2026-07-10', 'Grid');
  assert.equal(r.afterLine, 2);
  assert.match(r.newLine, /^Grid: New milestone \d{4}-\d{2} \.\. \d{4}-\d{2}$/);
});

test('addItemLine without lane is byte-identical to the shipped behaviour', () => {
  const doc = 'Kickoff 2026-08 .. 2026-09';
  assert.deepEqual(addItemLine(doc, '2026-07-10'), {afterLine: 0, newLine: 'New milestone 2026-08 .. 2026-10', select: 'New milestone'});
});

test('addItemLine with a lane that has no items falls back to the whole-document behaviour', () => {
  const doc = 'Grid: Offer 2026-08 .. 2026-10';
  const r = addItemLine(doc, '2026-07-10', 'Build');
  assert.equal(r.afterLine, 0);
  assert.equal(r.newLine, 'New milestone 2026-08 .. 2026-10');
});

test('removeItemLine: only item lines are removable', () => {
  const text = 'title: T\nGrid: Offer 2026-08 .. 2026-10';
  assert.ok(removeItemLine(text, 1));
  assert.ok(!removeItemLine(text, 0));
});
