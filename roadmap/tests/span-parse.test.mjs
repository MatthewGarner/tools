/* `xN` = a count of COLUMNS, on a time axis only. The DSL already uses xN to mean
   "N periods" (horizons: monthly from Jul 2026 x6), so a reader meets it twice.
   `..` was rejected: /timeline uses `A .. B` for an UNCERTAINTY range (P50..P90),
   and the same glyph must not mean occupancy in a sibling tool. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, horizonContinuation} from '../parse.js';

const QUARTERLY = 'horizons: quarterly from Q3 2026 x4\n';
const MONTHLY = 'horizons: monthly from Jul 2026 x6\n';

test('every item carries a span; a plain item is 1', () => {
  const m = parse(QUARTERLY + 'Q3 2026\nCore: Plain thing');
  assert.equal(m.items[0].span, 1);
  assert.equal(m.items[0].spanEnd, null);
});

test('x3 spans three columns from the section it is written under', () => {
  const m = parse(QUARTERLY + 'Q4 2026\nCore: Sync engine rewrite x3');
  assert.equal(m.items[0].h, 1);
  assert.equal(m.items[0].span, 3);
  assert.equal(m.items[0].title, 'Sync engine rewrite', 'the token is not part of the title');
});

test('the token survives alongside status, note and url (they strip first)', () => {
  const m = parse(QUARTERLY + 'Q3 2026\nCore: Sync engine rewrite [doing] x2 -- conflicts drive support -> https://x.test/a');
  const it = m.items[0];
  assert.equal(it.title, 'Sync engine rewrite');
  assert.equal(it.span, 2);
  assert.equal(it.status, 'doing');
  assert.equal(it.note, 'conflicts drive support');
  assert.equal(it.url, 'https://x.test/a');
});

test('x1 and x0 are just a plain item (the regex cannot see a minus sign — x-2 is not a token)', () => {
  const m = parse(QUARTERLY + 'Q3 2026\nCore: A x1\nCore: B x0\nCore: C x-2');
  assert.equal(m.items[0].span, 1);
  assert.equal(m.items[1].span, 1);
  assert.equal(m.items[2].title, 'C x-2', 'not a token at all — stays in the title');
});

test('a span running past the last column is ALLOWED and names its true end, WITH the year', () => {
  /* Q3 2026, Q4 2026, Q1 2027, Q2 2027 — x6 from Q3 2026 ends at Q4 2027.
     The year is REQUIRED: "Q4" alone reads as Q4 2026, which is ON this board. */
  const m = parse(QUARTERLY + 'Q3 2026\nCore: Data platform rebuild x6');
  const it = m.items[0];
  assert.equal(it.span, 4, 'PAINTED width, clamped to the board (it cannot draw past the last column)');
  assert.equal(it.declaredSpan, 6, 'what the author TYPED, unclamped — setSpanStart needs this');
  assert.equal(it.spanEnd, 'Q4 2027', 'the TRUE end, carrying its year');
});

test('an absurd span still yields a string spanEnd or null — never undefined', () => {
  /* horizonContinuation only walks 24 steps; past that there is no label to give */
  const it = parse(QUARTERLY + 'Q3 2026\nCore: Forever x99').items[0];
  assert.ok(it.spanEnd === null || typeof it.spanEnd === 'string');
  assert.equal(it.span, 4, 'still clamped to the board');
});

test('a monthly board continues its own cadence past the edge', () => {
  const m = parse(MONTHLY + 'Nov 2026\nCore: Long haul x4');
  assert.equal(m.items[0].spanEnd, 'Feb 2027');
});

test('on a NON-time axis the token is not eaten — it stays in the title, and warns', () => {
  const m = parse('NOW\nCore: Sync engine rewrite x3');
  assert.equal(m.items[0].title, 'Sync engine rewrite x3', 'kept verbatim');
  assert.equal(m.items[0].span, 1);
  assert.match(m.warnings.join(' '), /spans need a time axis/);
});

test('a title genuinely ending in a number is untouched', () => {
  const m = parse(QUARTERLY + 'Q3 2026\nCore: Migrate to API v2');
  assert.equal(m.items[0].title, 'Migrate to API v2');
  assert.equal(m.items[0].span, 1);
});

test('horizonContinuation continues quarters and months, and refuses a non-time axis', () => {
  assert.deepEqual(horizonContinuation(['Q3 2026', 'Q4 2026']).slice(0, 3), ['Q1 2027', 'Q2 2027', 'Q3 2027']);
  assert.deepEqual(horizonContinuation(['Nov 2026', 'Dec 2026']).slice(0, 2), ['Jan 2027', 'Feb 2027']);
  assert.equal(horizonContinuation(['Now', 'Next', 'Later']), null);
});
