/* renderStack's opt-in label overrides, added for the intraday consumer
   (review wave C, S7/S8):
   - opts.demandLabel (string) replaces the default `demand X GW` annotation —
     intraday passes `net demand X GW` when its storage fleet is charging or
     discharging at the shown hour, so the label stops asserting a raw-demand
     number the fleet has already netted down.
   - opts.legendStorageNote: false drops the "(storage: the arbitrage spread)"
     clause from the rent legend — impossible on intraday's storage-less stack.
   Both default to today's output (absent ⇒ byte-identical; goldens pin it). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderStack, MERIT_PALETTE} from '../../merit-order/render.js';
import {hourStack, DAY_DEFAULTS, demandAt} from '../day.js';

const C = {bg:'#fff', card:'#fff', border:'#ccc', ink:'#111', muted:'#777', accent:'#c05621', err:'#b00'};
const measure = (t, f) => t.length * 7;   // deterministic stub (same as stack-labels.test.mjs)
const ctx = {width: 900, colors: C, measure, palette: MERIT_PALETTE.light};
// Evening peak hour: rent > 0 (the legend line is drawn) and demand mid-stack.
const state = () => ({generators: hourStack(DAY_DEFAULTS, 18), demand: demandAt(18, DAY_DEFAULTS)});

test('flags absent: default demand label + storage legend clause (byte-pinned by goldens)', () => {
  const svg = renderStack(state(), ctx);
  assert.ok(svg.includes('>demand 44 GW<'), 'default demand label draws');
  assert.ok(svg.includes('(storage: the arbitrage spread)'), 'legend keeps the storage clause');
  assert.equal(svg, renderStack(state(), ctx, {}), 'empty opts identical to absent opts');
});

test('demandLabel replaces the demand annotation verbatim', () => {
  const svg = renderStack(state(), ctx, {demandLabel: 'net demand 41.5 GW'});
  assert.ok(svg.includes('>net demand 41.5 GW<'), 'override drawn');
  assert.ok(!svg.includes('>demand 44 GW<'), 'default label gone');
});

test('legendStorageNote:false drops only the storage clause', () => {
  const svg = renderStack(state(), ctx, {legendStorageNote: false});
  assert.ok(svg.includes('>shaded = earns above running cost<'), 'legend line still drawn');
  assert.ok(!svg.includes('arbitrage spread'), 'storage clause suppressed');
});

test('narrow branch already omits the storage clause — flag is a no-op there', () => {
  const plain = renderStack(state(), {...ctx, width: 480});
  const flagged = renderStack(state(), {...ctx, width: 480}, {legendStorageNote: false});
  assert.equal(flagged, plain, 'narrow output identical with and without the flag');
});

test('demandLabel applies at narrow width too', () => {
  const svg = renderStack(state(), {...ctx, width: 480}, {demandLabel: 'net demand 41.5 GW'});
  assert.ok(svg.includes('>net demand 41.5 GW<'), 'override drawn on the narrow branch');
});
