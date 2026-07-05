import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, wipSweep, kneeWip} from '../engine.js';
import {renderReadout, markdownSummary} from '../render.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33', track: '#edf0ee'},
  measure: t => t.length * 7,
};
const healthy = {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
const overloaded = {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
const rig = params => {
  const result = simulate(params);
  const sweep = wipSweep(params);
  return {result, sweep, knee: kneeWip(sweep)};
};

test('verdict states the wait/work split in days', () => {
  const {result, sweep, knee} = rig(healthy);
  const svg = renderReadout(result, sweep, knee, healthy, ctx);
  assert.match(svg, /typical item takes/i);
  assert.match(svg, /working/);
  assert.match(svg, /waiting/);
});

test('histogram renders bars and percentile markers', () => {
  const {result, sweep, knee} = rig(healthy);
  const svg = renderReadout(result, sweep, knee, healthy, ctx);
  assert.ok((svg.match(/<rect/g) || []).length > 5);
  assert.match(svg, /P50/);
  assert.match(svg, /P85/);
});

test('overload shows the honesty line; healthy does not', () => {
  const o = rig(overloaded), h = rig(healthy);
  assert.match(renderReadout(o.result, o.sweep, o.knee, overloaded, ctx), /demand exceeds capacity/i);
  assert.doesNotMatch(renderReadout(h.result, h.sweep, h.knee, healthy, ctx), /demand exceeds capacity/i);
});

test('sweep charts carry the knee hint', () => {
  const {result, sweep, knee} = rig(healthy);
  const svg = renderReadout(result, sweep, knee, healthy, ctx);
  assert.match(svg, new RegExp('WIP ' + knee + ' keeps'));
});

test('day counts are singular/plural safe', () => {
  // a tiny fast system where P50 could be ~1 day
  const p = {demandPerWeek: 1, itemDays: 1, team: 4, wipLimit: 4, cov: 0.25};
  const {result, sweep, knee} = rig(p);
  const svg = renderReadout(result, sweep, knee, p, ctx);
  assert.doesNotMatch(svg, /\b1 days\b/);
});

test('markdown summary carries the headline numbers', () => {
  const {result, sweep, knee} = rig(overloaded);
  const md = markdownSummary(result, sweep, knee, overloaded);
  assert.match(md, /typical item/i);
  assert.match(md, /Throughput/);
  assert.match(md, /WIP/);
  assert.match(md, /demand exceeds capacity/i);
});

test('svg is a single self-contained element', () => {
  const {result, sweep, knee} = rig(healthy);
  const svg = renderReadout(result, sweep, knee, healthy, ctx);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
});
