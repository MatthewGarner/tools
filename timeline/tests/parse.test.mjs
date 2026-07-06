import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate, fmtDay, dayToISO} from '../parse.js';

test('parseDate: ISO day, ISO month (→ its 15th), garbage', () => {
  assert.equal(dayToISO(parseDate('2026-08-03')), '2026-08-03');
  assert.equal(dayToISO(parseDate('2026-08')), '2026-08-15');
  assert.equal(parseDate('soon'), null);
  assert.equal(parseDate('2026-13-40'), null);
});

test('full line: lane, label, range, status, note', () => {
  const m = parse('title: T\nGrid: Energisation 2027-02-15 .. 2027-06-01 [risk] // DNO dependent');
  assert.equal(m.title, 'T');
  const it = m.items[0];
  assert.equal(it.lane, 'Grid');
  assert.equal(it.label, 'Energisation');
  assert.equal(dayToISO(it.p50), '2027-02-15');
  assert.equal(dayToISO(it.p90), '2027-06-01');
  assert.equal(it.status, 'risk');
  assert.equal(it.note, 'DNO dependent');
  assert.equal(it.srcLine, 1);
  assert.equal(m.warnings.length, 0);
});

test('laneless items land in the unnamed lane; lanes keep source order', () => {
  const m = parse('Kickoff 2026-08\nGrid: Offer 2026-09 .. 2026-11\nBuild: FID 2026-10 .. 2026-12\nGrid: Second 2027-01 .. 2027-03');
  assert.deepEqual(m.lanes, ['', 'Grid', 'Build']);
  assert.equal(m.items[0].lane, '');
});

test('single date: parses, flagged single, soft warning about false precision', () => {
  const m = parse('Vendor selection 2026-11');
  const it = m.items[0];
  assert.equal(it.single, true);
  assert.equal(it.p50, it.p90);
  assert.ok(m.warnings.some(w => /line 1/.test(w) && /range/i.test(w)));
});

test('done milestones expect a single date and never warn about it', () => {
  const m = parse('Build: FID 2026-09-30 [done]');
  assert.equal(m.items[0].status, 'done');
  assert.equal(m.warnings.length, 0);
  const m2 = parse('Build: FID 2026-09 .. 2026-11 [done]');
  assert.ok(m2.warnings.some(w => /done/.test(w) && /range/i.test(w)));
});

test('reversed range warns and swaps', () => {
  const m = parse('X 2026-11 .. 2026-08');
  assert.ok(m.items[0].p50 < m.items[0].p90);
  assert.ok(m.warnings.some(w => /swapped|reversed/i.test(w)));
});

test('unknown status warns softly and is dropped', () => {
  const m = parse('X 2026-08 .. 2026-09 [urgent]');
  assert.equal(m.items[0].status, null);
  assert.ok(m.warnings.some(w => /urgent/.test(w)));
});

test('no date at all: line warns and is skipped', () => {
  const m = parse('Grid: Something without a date');
  assert.equal(m.items.length, 0);
  assert.ok(m.warnings.some(w => /date/i.test(w)));
});

test('today: config parses; comments and blanks skip; unknown config warns', () => {
  const m = parse('today: 2026-07-06\n// a comment\n\nbogus: 3\nX 2026-08 .. 2026-09');
  assert.equal(dayToISO(m.today), '2026-07-06');
  assert.equal(m.items.length, 1);
  assert.ok(m.warnings.some(w => /bogus/.test(w)));
});

test('fmtDay renders compact UK-style dates', () => {
  assert.equal(fmtDay(parseDate('2026-08-15')), '15 Aug 2026');
  assert.equal(fmtDay(parseDate('2026-08-15'), {month: true}), 'Aug 2026');
});
