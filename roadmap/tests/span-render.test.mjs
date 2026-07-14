import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render} from '../render.js';

const measure = t => t.length * 7;
const colors = {
  card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6',
  err: '#b33', status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  statusInk: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  accentInk: '#08c',
};
const ctx = {colors, measure};
const Q = 'title: T\ndate: 2026-07-04\nhorizons: quarterly from Q3 2026 x4\n';

test('a spanning item prints its range, on-board ends need no year (the columns supply it)', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Sync engine rewrite x2'), ctx);
  assert.match(svg, />Q3 – Q4</);
});

test('an OFF-BOARD end prints the YEAR — "Q4" alone would read as Q4 2026, which is on this board', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Data platform rebuild x6'), ctx);
  assert.match(svg, />Q3 – Q4 2027 ›</, 'the true end, unambiguous, with the cut marker');
  assert.doesNotMatch(svg, />Q3 – Q4 ›</, 'the ambiguous form the prototype produced');
});

test('an off-board item gets a dashed cut edge; an on-board one does not', () => {
  const off = render(parse(Q + 'Q3 2026\nCore: Runs past x6'), ctx);
  const on = render(parse(Q + 'Q3 2026\nCore: Fits fine x2'), ctx);
  assert.match(off, /stroke-dasharray="3 3"/);
  assert.doesNotMatch(on, /stroke-dasharray="3 3"/);
});

test('the left cap takes the status colour', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Sync engine rewrite [risk] x2'), ctx);
  assert.match(svg, new RegExp('<rect[^>]*fill="' + colors.status.risk + '"[^>]*opacity="1\\.00"'));
});

test('a STATUS-LESS cap is muted grey, never the accent — an accent cap fakes an IN PROGRESS pill', () => {
  /* in light theme the accent and the doing status are the same hex; a status-less
     item wearing an accent cap claims a status it does not have */
  const svg = render(parse(Q + 'Q3 2026\nCore: No status here x2'), ctx);
  assert.match(svg, new RegExp('<rect[^>]*fill="' + colors.muted + '"'));
  assert.doesNotMatch(svg, new RegExp('<rect[^>]*fill="' + colors.accent + '"[^>]*opacity="0\\.55"'));
});

test('a 1-column item gets NO cap and NO range label (it is just a card)', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Plain thing'), ctx);
  assert.doesNotMatch(svg, /–/, 'no range label');
});

test('the range label is user-free text but the horizon names are not: they still escape', () => {
  const svg = render(parse('title: T\ndate: 2026-07-04\nhorizons: A<b>, B & C\nA<b>\nCore: x'), ctx);
  assert.doesNotMatch(svg, /<b>/);
});
