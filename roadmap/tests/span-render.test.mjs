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

test('an on-board span expresses its run through width, not a duplicated date label', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Sync engine rewrite x2'), ctx);
  assert.doesNotMatch(svg, />Q3 – Q4</);
});

test('a spanning item keeps duration in its width, without a second decorative ruler', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Sync engine rewrite [risk] x2'), ctx);
  const hit = svg.match(/<rect data-hit=""[^>]*width="([^"]+)"/);
  assert.ok(hit && Number(hit[1]) > 400, 'the commitment itself occupies both horizon widths');
  assert.doesNotMatch(svg, /data-span-ruler=""/, 'a parallel rule above the label duplicates the span itself');
});

test('the minimalist Grid carries each commitment as an unmarked occupancy band', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Sync engine rewrite x2'), ctx);
  assert.doesNotMatch(svg, /data-grid-lane=/, 'empty time stays blank rather than becoming a field');
  assert.doesNotMatch(svg, /data-grid-trace=""|data-grid-origin=""/, 'time needs no added line notation');
  assert.match(svg, /<rect data-hit=""[^>]*fill-opacity="0\.08"/, 'a single quiet band makes occupancy visible');
  assert.doesNotMatch(svg, /<rect data-hit=""[^>]*stroke=/, 'ordinary Grid work must not become an outlined card');
});

test('an OFF-BOARD end prints the YEAR — "Q4" alone would read as Q4 2026, which is on this board', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Data platform rebuild x6'), ctx);
  assert.match(svg, />CONTINUES TO Q4 2027 ›</, 'the true end, unambiguous, with the cut marker');
  assert.doesNotMatch(svg, />CONTINUES TO Q4 ›</, 'the ambiguous form the prototype produced');
});

test('an off-board item gets a dashed cut edge; an on-board one does not', () => {
  const off = render(parse(Q + 'Q3 2026\nCore: Runs past x6'), ctx);
  const on = render(parse(Q + 'Q3 2026\nCore: Fits fine x2'), ctx);
  assert.match(off, /stroke-dasharray="3 3"/);
  assert.doesNotMatch(on, /stroke-dasharray="3 3"/);
});

test('a 1-column item gets no range label (it is just a commitment)', () => {
  const svg = render(parse(Q + 'Q3 2026\nCore: Plain thing'), ctx);
  assert.doesNotMatch(svg, /–/, 'no range label');
});

test('the range label is user-free text but the horizon names are not: they still escape', () => {
  const svg = render(parse('title: T\ndate: 2026-07-04\nhorizons: A<b>, B & C\nA<b>\nCore: x'), ctx);
  assert.doesNotMatch(svg, /<b>/);
});
