import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenize, parse, collectVars, simulateModel, computeSensitivity} from '../engine.js';
import {renderDriverTree} from '../render-driver.js';
import {quantile} from '../../assets/series.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    accent2: '#c62', bg: '#f7f8f6', err: '#b33'},
  measure: t => t.length * 7,
};

function build(f, ranges){
  const ast = parse(tokenize(f));
  const varNames = collectVars(ast, []);
  const dists = {};
  for(const n of varNames) dists[n] = 'auto';
  const m = {ast, varNames, ranges, dists};
  const {sorted} = simulateModel(m, {seed: 0x5EED, n: 20000});
  const p10 = quantile(sorted, .1), p50 = quantile(sorted, .5), p90 = quantile(sorted, .9);
  const {sens, fullRatio} = computeSensitivity(m, {seed: 0x5EED, p10, p90});
  return {...m, p10, p50, p90, sens, fullRatio};
}

const meeting = build('attendees * hourly_cost * meeting_hours * weeks_per_year',
  {attendees: [6, 10], hourly_cost: [60, 120], meeting_hours: [0.75, 1.5], weeks_per_year: [44, 48]});

test('driver tree: a capsule per variable, ops as discs, one outcome card', () => {
  const svg = renderDriverTree(meeting, ctx);
  assert.equal((svg.match(/data-node="var"/g) || []).length, 4);
  assert.equal((svg.match(/data-node="op"/g) || []).length, 3);   // three × in a 4-factor product
  assert.equal((svg.match(/data-node="out"/g) || []).length, 1);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('driver tree: sensitivity shares label the leaf edges and scale their width', () => {
  const svg = renderDriverTree(meeting, ctx);
  const widths = {};
  for(const m of svg.matchAll(/data-edge="([a-z_]+)"[^>]*stroke-width="([0-9.]+)"/g))
    widths[m[1]] = +m[2];
  assert.equal(Object.keys(widths).length, 4);
  assert.ok(widths.hourly_cost > widths.weeks_per_year, JSON.stringify(widths));
  assert.match(svg, />\d+%<\/text>/);                     // share % printed on edges
});

test('driver tree: outcome card carries P50, the interval, and the spread', () => {
  const svg = renderDriverTree(meeting, ctx);
  assert.match(svg, /P10/);
  assert.match(svg, /P90/);
  assert.match(svg, /×/);                                 // spread ratio for a positive model
});

test('driver tree: division, parens and constants render sanely', () => {
  const m = build('households * share * 2 / (per_day * days)',
    {households: [3e6, 4e6], share: [0.02, 0.08], per_day: [2, 5], days: [220, 260]});
  const svg = renderDriverTree(m, ctx);
  assert.equal((svg.match(/data-node="var"/g) || []).length, 4);
  assert.equal((svg.match(/data-node="num"/g) || []).length, 1);
  assert.match(svg, /÷/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('driver tree: negation and single-variable formulas stay finite', () => {
  const m1 = build('-cost * volume', {cost: [1, 3], volume: [10, 20]});
  assert.doesNotMatch(renderDriverTree(m1, ctx), /NaN|undefined/);
  const m2 = build('users', {users: [100, 300]});
  const svg2 = renderDriverTree(m2, ctx);
  assert.equal((svg2.match(/data-node="var"/g) || []).length, 1);
  assert.doesNotMatch(svg2, /NaN|undefined/);
});

test('driver tree: the top driver capsule is visually distinct (tinted fill)', () => {
  const svg = renderDriverTree(meeting, ctx);
  const top = meeting.sens[0].name;
  const m = svg.match(new RegExp('data-node="var" data-name="' + top + '"[^>]*fill="([^"]+)"'));
  assert.ok(m && m[1] !== ctx.colors.card, 'top driver fill differs from card');
});
