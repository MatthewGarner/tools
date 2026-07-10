import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runDay, DAY_DEFAULTS} from '../day.js';
import {renderDay, buildDayVerdict} from '../render-day.js';
import {MERIT_PALETTE} from '../../merit-order/render.js';

const ctx = {width: 900, height: 420,
  colors: {ink: '#1b2733', muted: '#66727e', accent: '#C05621', grid: '#e3e7ea', card: '#ffffff'},
  palette: MERIT_PALETTE.light};

test('renderDay: fleet on ⇒ ghost raw polyline + solid flat polyline + storage bars', () => {
  const r = runDay({...DAY_DEFAULTS, fleetGW: 6});
  const svg = renderDay(r, {...DAY_DEFAULTS, fleetGW: 6}, ctx);
  assert.match(svg, /^<svg /);
  assert.match(svg, /data-raw-shape=''/);
  assert.match(svg, /data-flat-shape=''/);
  assert.match(svg, /stroke-dasharray/, 'raw ghost is dashed');
  assert.match(svg, /data-charge=''/);
  assert.match(svg, /data-discharge=''/);
});

test('renderDay: zero fleet ⇒ one shape only, no bars', () => {
  const r = runDay({...DAY_DEFAULTS, fleetGW: 0});
  const svg = renderDay(r, DAY_DEFAULTS, ctx);
  assert.doesNotMatch(svg, /data-raw-shape/, 'no ghost when nothing flattened it');
  assert.doesNotMatch(svg, /data-charge/);
});

test('renderDay: cursor draws the scrub line at the given hour', () => {
  const r = runDay(DAY_DEFAULTS);
  assert.match(renderDay(r, DAY_DEFAULTS, ctx, {cursor: 18}), /data-cursor='18'/);
  assert.doesNotMatch(renderDay(r, DAY_DEFAULTS, ctx), /data-cursor/);
});

test('buildDayVerdict: quotes the spread, and the flattening when a fleet works', () => {
  const p0 = {...DAY_DEFAULTS, fleetGW: 0};
  const v0 = buildDayVerdict(runDay(p0), p0);
  assert.match(v0, /spread/i);
  assert.match(v0, /£\d+/);
  const p6 = {...DAY_DEFAULTS, fleetGW: 6};
  const r6 = runDay(p6);
  const v6 = buildDayVerdict(r6, p6);
  assert.match(v6, /£\d+ → £\d+/, 'raw → flattened spread');
  assert.match(v6, /per MW/, 'the fleet’s own margin is quoted');
  assert.ok(r6.droppedGWh > 0, 'fixture: 6 GW drops trades at GB defaults');
  assert.match(v6, /walking away from [\d.]+ GWh/, 'abandoned trades are quoted');
});

test('renderDay: dropped trades ghost as dashed bars when the back-off bites', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const svg = renderDay(runDay(p), p, ctx);
  assert.match(svg, /data-dropped=''/);
});
