/* Geometry-literals guard for the T2 extraction (deck-parts.js): REGISTER_GEOM
   duplicates render-deck.js's own W/M/INNER constants on purpose (avoids a
   value-only import back into render-deck.js) — this pins them in lockstep so
   a future edit to one can't silently drift from the other. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REGISTER_GEOM, registerColumns} from '../deck-parts.js';
import {parse} from '../parse.js';
import {renderRegisterLive} from '../render-register.js';
import {W, M} from '../render-deck.js';

test('the deck register geometry is exactly the historical constants (guards the refactor)', () => {
  assert.deepEqual(REGISTER_GEOM, {W: 1920, M: 100, INNER: 1720});
});

/* DIRECT cross-assert (not just a literal pin): ties REGISTER_GEOM to
   render-deck.js's own live W/M constants, so an intentional deck-frame
   resize can't leave the register geometry silently misaligned — the test
   above would keep passing (both sides are still "the same literals") even
   if only one of the two was updated. */
test('REGISTER_GEOM stays derived from render-deck.js\'s actual W/M, not just a matching literal', () => {
  assert.equal(REGISTER_GEOM.W, W);
  assert.equal(REGISTER_GEOM.M, M);
  assert.equal(REGISTER_GEOM.INNER, W - 2 * M);
});

test('registerColumns keeps ITEM always; drops LANE/STATUS/NOTE when absent', () => {
  const bare = registerColumns(parse('NOW\nAlpha\nNEXT\nBeta'));
  assert.deepEqual(bare.map(c => c.key), ['item', 'horizon']);
  const full = registerColumns(parse('NOW\nCore: A [doing] -- n\nNEXT\nGrowth: B'));
  assert.deepEqual(full.map(c => c.key), ['item', 'lane', 'horizon', 'status', 'note']);
});

/* --------------------------------------------------------------------- *
 * renderRegisterLive (Task 4): the live editable table. Structure tests
 * (markup contract, not bytes) — the golden pins the exact bytes at
 * edit:false; dev/injection.test.mjs proves edit:true stays well-formed
 * XML under hostile input.
 * -------------------------------------------------------------------- */
const measure = t => t.length * 7;
const colors = {card:'#fff', border:'#ddd', ink:'#222', muted:'#667', accent:'#08c', bg:'#f7f8f6',
  err:'#b33', status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
  statusInk:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'}, accentInk:'#08c'};
const live = (src, extra = {}) => renderRegisterLive(parse(src), {colors, measure, edit: true, ...extra});
const DOC = 'title: Plan\nstyle: register\nNOW\nCore: Sync engine rewrite [doing] -- conflicts\nGrowth: Referral flow\nNEXT\nCore: Smart reminders\n';

test('renders a root svg with the title in the light frame', () => {
  assert.match(live(DOC), /^<svg[^>]*width="\d+"[^>]*height="\d+"/);
  assert.match(live(DOC), />Plan</);
});
test('every row carries data-line and a stable data-key', () => {
  const svg = live(DOC);
  assert.ok((svg.match(/data-edit="cardmenu"/g) || []).length === 3, 'one row menu per item');
  assert.match(svg, /data-key="sync engine rewrite"/);
});
test('each editable cell emits its data-edit kind', () => {
  const svg = live(DOC);
  for(const k of ['title', 'lane', 'note', 'status']) assert.match(svg, new RegExp('data-edit="' + k + '"'));
});
test('a note-LESS / status-LESS cell still emits a target with empty data-raw (so it can be ADDED)', () => {
  const svg = live('style: register\nNOW\nAlpha\n');   // no note, no status, no lane
  assert.match(svg, /data-edit="note"[^>]*data-raw=""/);
  assert.match(svg, /data-edit="status"[^>]*data-raw=""/);
  assert.match(svg, /data-edit="lane"[^>]*data-raw=""/);
});
test('every horizon — INCLUDING an empty one — emits a drop band and an +add row', () => {
  const svg = live('style: register\nhorizons: Now, Next, Later\nNOW\nCore: A\n');   // Next & Later empty
  assert.equal((svg.match(/data-hdrop="/g) || []).length, 3, 'a band per horizon incl. the two empty');
  assert.equal((svg.match(/data-edit="additem"/g) || []).length, 3, 'an +add per horizon');
});
test('the drop band for a horizon is painted BEFORE that horizon\'s rows (A2: under, never on top)', () => {
  const svg = live(DOC);
  const hIdx = svg.indexOf('data-hdrop="0"');
  const rowIdx = svg.indexOf('data-edit="cardmenu"');
  assert.ok(hIdx >= 0 && rowIdx >= 0 && hIdx < rowIdx, 'horizon 0\'s band must appear before the first row\'s <g>');
});
test('edit:false emits NO edit markup (the export/golden path)', () => {
  const svg = renderRegisterLive(parse(DOC), {colors, measure, edit: false});
  for(const a of ['data-edit', 'data-line', 'data-hit', 'data-hdrop', 'data-menu'])
    assert.doesNotMatch(svg, new RegExp(a));
});
test('a hostile title is escaped in every place it appears', () => {
  const svg = live('style: register\nNOW\nCore: <script>x</script> [risk] -- <b>n</b>\n');
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /<b>n<\/b>/);
});
