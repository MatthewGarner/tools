import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, wipSweep, kneeWip} from '../engine.js';
import {renderReadout, markdownSummary, readoutVerdict, readoutVerdictParts} from '../render.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33', track: '#edf0ee', brandText: '#D62015'},
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
  assert.match(svg, /average item takes/i);
  assert.match(svg, /working/);
  assert.match(svg, /waiting/);
});

test('verdict uses means so working + waiting reconstruct the total; wait not falsely 0 (Fable I2)', () => {
  // low utilisation + high variability: workMean > lead.p50 — the old bug case
  const p = {demandPerWeek: 1, itemDays: 4, team: 4, wipLimit: 4, cov: 1.0};
  const result = simulate(p);
  assert.ok(result.workDays > result.lead.p50, 'fixture must trigger the old bug (mean work > median lead)');
  assert.ok(Math.abs((result.workDays + result.waitDays) - result.lead.mean) < 1e-9, 'means decompose exactly');
  const nums = [...readoutVerdict(result).matchAll(/([\d.]+) days?/g)].map(m => Number(m[1]));
  const [total, work, wait] = nums;
  assert.ok(work <= total + 0.1, `working ${work} must not exceed the stated total ${total} (the old bug)`);
  assert.ok(Math.abs((work + wait) - total) <= 0.2, `working+waiting=${work}+${wait} ≈ total ${total}`);
  assert.ok(Math.abs(total - result.lead.mean) <= Math.abs(total - result.lead.p50) + 1e-9, 'total tracks the mean, not the median');
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
  assert.match(md, /average item/i);
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

/* ---- Swiss 6b: the display verdict + its one key figure ---- */

test('readoutVerdictParts: the figure is the average calendar time, and it opens the plain mirror', () => {
  const {result} = rig(healthy);
  const {line, fig} = readoutVerdictParts(result);
  assert.match(fig, /^[\d.]+ days?$/, 'figure is the lead-time mean, got ' + fig);
  assert.ok(line.startsWith('The average item takes ' + fig + ' —'));
  assert.equal(line.indexOf(fig), line.lastIndexOf(fig), 'the figure appears exactly once in the line');
  assert.ok(readoutVerdict(result).startsWith(line), 'the plain mirror opens with the same sentence');
});

test('6b: the readout draws a VERDICT kicker and exactly one brand-coloured run', () => {
  const {result, sweep, knee} = rig(healthy);
  const svg = renderReadout(result, sweep, knee, healthy, ctx);
  assert.ok(svg.includes('VERDICT'), 'literal uppercase kicker (no CSS transform in an export)');
  assert.equal((svg.match(/fill="#D62015"/g) || []).length, 1);
  assert.ok(svg.includes('>' + readoutVerdictParts(result).fig + '</tspan>'), 'the brand run IS the figure');
});

test('6b: red discipline — "waiting" is inked, not status-red (err stays for the overload warning)', () => {
  const h = rig(healthy), o = rig(overloaded);
  // the verdict region = everything above the histogram label
  const head = svg => svg.slice(0, svg.indexOf('LEAD TIME'));
  assert.ok(!head(renderReadout(h.result, h.sweep, h.knee, healthy, ctx)).includes('#b33'),
    'the healthy verdict block carries no status red — the display line is uniform ink');
  assert.ok(head(renderReadout(o.result, o.sweep, o.knee, overloaded, ctx)).includes('#b33'),
    'the overload warning still speaks in err');
});

test('6b: the verdict block is content-driven — a wrapped headline pushes the artefact taller', () => {
  const {result, sweep, knee} = rig(healthy);
  const narrowMeasure = {...ctx, measure: t => t.length * 26};   // force the headline to wrap
  const tall = renderReadout(result, sweep, knee, healthy, narrowMeasure);
  const hOf = svg => Number(/<svg[^>]*\bheight="(\d+)"/.exec(svg)[1]);
  assert.ok(hOf(tall) > hOf(renderReadout(result, sweep, knee, healthy, ctx)));
});
