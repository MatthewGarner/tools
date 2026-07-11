/* Regression pin for the intraday stack's desktop axis labels: hourStack()
   excludes the catalogue's storage rows (sansStorage double-count guard), so
   Waste/CHP (cost 20), Biomass (75) and Imports (80) land contiguous and thin —
   on merit-order's own page the storage blocks sit between them and give their
   labels breathing room. renderStack's opt-in `labelCollide: 'drop'` (which
   app.js passes) suppresses colliding desktop labels, keeping the wider run's;
   default behaviour (flag absent) is byte-pinned by dev/golden.mjs. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderStack, MERIT_PALETTE} from '../../merit-order/render.js';
import {hourStack, DAY_DEFAULTS, demandAt} from '../day.js';

const C = {bg:'#fff', card:'#fff', border:'#ccc', ink:'#111', muted:'#777', accent:'#c05621', err:'#b00'};
const measure = (t, f) => t.length * 7;   // deterministic stub (same as merit-order's render tests)
const ctx = {width: 900, colors: C, measure, palette: MERIT_PALETTE.light};

// The screenshot fixture: hour 02:00 (solar 0 — the thin trio is fully offered),
// default day params. One axis label per family run: `>Label<` as text content
// (data-plant='...' is an attribute, so this only counts drawn labels).
const TRIO = ['Waste/CHP', 'Biomass', 'Imports'];
const drawn = svg => TRIO.filter(l => svg.includes(`>${l}<`));
const state = () => ({generators: hourStack(DAY_DEFAULTS, 2), demand: demandAt(2, DAY_DEFAULTS)});

test('labelCollide absent: all three thin labels draw (default behaviour, golden-pinned)', () => {
  const svg = renderStack(state(), ctx);
  assert.deepEqual(drawn(svg), TRIO, 'without the flag the trio still collides — every run labelled');
});

test("labelCollide:'drop': the storage-less trio renders at most 2 of its 3 labels", () => {
  const svg = renderStack(state(), ctx, {labelCollide: 'drop'});
  const kept = drawn(svg);
  assert.ok(kept.length <= 2, `expected <=2 of the trio, got ${kept.length}: ${kept.join(', ')}`);
  assert.ok(kept.length >= 1, 'suppression must not wipe the whole trio');
  // wide runs elsewhere in the stack are untouched
  assert.ok(svg.includes('>Wind<'), 'Wind label kept');
  assert.ok(svg.includes('>Gas<'), 'Gas family label kept');
});

test("labelCollide:'drop' leaves the narrow branch's behaviour alone", () => {
  const wide = renderStack(state(), {...ctx, width: 480});
  const flagged = renderStack(state(), {...ctx, width: 480}, {labelCollide: 'drop'});
  assert.equal(flagged, wide, 'narrow output identical with and without the flag');
});
