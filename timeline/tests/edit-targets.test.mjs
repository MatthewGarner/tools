import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validators, editLabel, editDates, setStatus, setLane, editNote, addItemLine, removeItemLine}
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

test('validators.lane rejects brackets/dates/config/nested-colon; accepts a bare name', () => {
  assert.ok(validators.lane('Grid'));
  assert.ok(validators.lane('Route to market'));
  assert.ok(!validators.lane('with [tag]'));
  assert.ok(!validators.lane('2026-08'));
  assert.ok(!validators.lane('title'));
  assert.ok(!validators.lane('A: B'));
  assert.ok(!validators.lane(''));
});

test('validators.note accepts any single line (parse peels it first, so [ and : are safe)', () => {
  assert.ok(validators.note('external firm, long tail'));
  assert.ok(validators.note('see [ref]: page 3'));
  assert.ok(!validators.note('two\nlines'));
});

test('setStatus: set / replace / clear, note preserved, unknown is a no-op', () => {
  const base = 'Grid: Offer 2026-08 .. 2026-10 // note';
  assert.equal(setStatus(base, 'done'), 'Grid: Offer 2026-08 .. 2026-10 [done] // note');
  assert.equal(setStatus('Grid: Offer 2026-08 .. 2026-10 [risk] // note', 'done'),
    'Grid: Offer 2026-08 .. 2026-10 [done] // note');
  assert.equal(setStatus('Grid: Offer 2026-08 .. 2026-10 [risk] // note', ''),
    'Grid: Offer 2026-08 .. 2026-10 // note');
  assert.equal(setStatus(base, ''), base);                 // already clear → unchanged
  assert.equal(setStatus(base, 'bogus'), base);            // unknown status → no-op
});

test('setStatus reproduces the fine-pointer step chain none→done→risk→none', () => {
  const base = 'Grid: Offer 2026-08 .. 2026-10 // note';
  const done = setStatus(base, 'done');
  assert.equal(done, 'Grid: Offer 2026-08 .. 2026-10 [done] // note');
  const risk = setStatus(done, 'risk');
  assert.equal(risk, 'Grid: Offer 2026-08 .. 2026-10 [risk] // note');
  assert.equal(setStatus(risk, ''), base);
});

test('setLane: insert / replace / clear the prefix, keeping status + note', () => {
  assert.equal(setLane('Offer 2026-08 .. 2026-10 [risk] // note', 'Grid'),
    'Grid: Offer 2026-08 .. 2026-10 [risk] // note');
  assert.equal(setLane('Grid: Offer 2026-08 .. 2026-10 [risk] // note', 'Build'),
    'Build: Offer 2026-08 .. 2026-10 [risk] // note');
  assert.equal(setLane('Grid: Offer 2026-08 .. 2026-10 [risk]', ''),
    'Offer 2026-08 .. 2026-10 [risk]');
});

test('setLane is comment-aware (a colon inside the note is not mistaken for the prefix)', () => {
  assert.equal(setLane('Offer 2026-08 .. 2026-10 // see: page 3', 'Grid'),
    'Grid: Offer 2026-08 .. 2026-10 // see: page 3');
  // an invalid lane name is a no-op
  const bad = 'Grid: Offer 2026-08 .. 2026-10';
  assert.equal(setLane(bad, 'A: B'), bad);
  assert.equal(setLane(bad, '2026-08'), bad);
});

test('setLane round-trips through the real parser', async () => {
  const {parse} = await import('../parse.js');
  const out = setLane('Offer 2026-08 .. 2026-10 [risk] // note', 'Grid');
  const m = parse(out);
  assert.equal(m.warnings.length, 0);
  assert.equal(m.items[0].lane, 'Grid');
  assert.equal(m.items[0].label, 'Offer');
  assert.equal(m.items[0].status, 'risk');
  assert.equal(m.items[0].note, 'note');
});

test('editNote: add / replace / clear the // tail', () => {
  assert.equal(editNote('Grid: Offer 2026-08 .. 2026-10 [risk]', '', 'external firm'),
    'Grid: Offer 2026-08 .. 2026-10 [risk] // external firm');
  assert.equal(editNote('Grid: Offer 2026-08 .. 2026-10 // old', 'old', 'new one'),
    'Grid: Offer 2026-08 .. 2026-10 // new one');
  assert.equal(editNote('Grid: Offer 2026-08 .. 2026-10 // old', 'old', ''),
    'Grid: Offer 2026-08 .. 2026-10');
});

test('editNote round-trips through the real parser', async () => {
  const {parse} = await import('../parse.js');
  const m = parse(editNote('Grid: Offer 2026-08 [done]', '', 'signed off'));
  assert.equal(m.warnings.length, 0);
  assert.equal(m.items[0].note, 'signed off');
  assert.equal(m.items[0].status, 'done');
});
