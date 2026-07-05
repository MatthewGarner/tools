import {test} from 'node:test';
import assert from 'node:assert/strict';
import {batchEconomics} from '../economics.js';
import {leverTriage, simulate, wipSweep, kneeWip} from '../engine.js';
import {renderBatch, renderTriage, markdownSummary} from '../render.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33', track: '#edf0ee'},
  measure: t => t.length * 7,
};
const healthy = {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
const overloaded = {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
const econBase = {demandPerWeek: 3, transactionCost: 1000, holdCostPerItemWeek: 500, currentBatch: 8, maxBatch: 30};

test('batch: verdict names the economic batch and the penalty', () => {
  const svg = renderBatch(batchEconomics(econBase), econBase, ctx);
  assert.match(svg, /Economic batch ≈ <\/?tspan|Economic batch/);
  assert.match(svg, /more per item/);
  assert.match(svg, /£/);
});

test('batch: at the optimum there is no penalty sentence', () => {
  const opt = batchEconomics(econBase).optimum;
  const svg = renderBatch(batchEconomics({...econBase, currentBatch: opt}), {...econBase, currentBatch: opt}, ctx);
  assert.doesNotMatch(svg, /more per item/);
  assert.match(svg, /economic batch already/i);
});

test('batch: three curves, direct labels, no NaN in geometry', () => {
  const svg = renderBatch(batchEconomics(econBase), econBase, ctx);
  assert.equal((svg.match(/<polyline/g) || []).length, 3);
  assert.match(svg, /transaction cost/i);
  assert.match(svg, /holding cost/i);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('triage: drain mode names the fastest lever and the pile', () => {
  const t = leverTriage(overloaded, {initialBacklog: 20});
  const svg = renderTriage(t, overloaded, 20, ctx);
  const top = t.levers[0];
  assert.ok(svg.includes(top.label.replace('→', '&#8594;')) || svg.includes(top.label), 'names ' + top.label);
  assert.match(svg, /pile|clears|drain/i);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('triage: lead mode reads in days and ranks four bars', () => {
  const t = leverTriage(healthy, {initialBacklog: 0});
  const svg = renderTriage(t, healthy, 0, ctx);
  assert.equal(t.mode, 'lead');
  assert.ok((svg.match(/<rect [^>]*data-bar/g) || []).length === 4, 'four lever bars');
  assert.match(svg, /P85/);
});

test('triage: a lever that never drains says so instead of a number', () => {
  const t = leverTriage({...overloaded, demandPerWeek: 10}, {initialBacklog: 30});
  const svg = renderTriage(t, {...overloaded, demandPerWeek: 10}, 30, ctx);
  assert.match(svg, /never/i);
});

test('drain times render in weeks, converted from simulated days', () => {
  const t = leverTriage(healthy, {initialBacklog: 20});
  const top = t.levers[0];
  assert.ok(top.drainDays > 0);
  const w = top.drainDays / 5;
  const expect = (w < 10 ? Math.round(w * 10) / 10 : Math.round(w)) + ' week';
  const svg = renderTriage(t, healthy, 20, ctx);
  assert.ok(svg.includes(expect), `svg should carry "${expect}", drainDays=${top.drainDays}`);
  assert.ok(!svg.includes(Math.round(top.drainDays) + ' weeks'), 'days must not be printed as weeks');
});

test('markdown summary appends batch and triage paragraphs when given', () => {
  const result = simulate(healthy);
  const sweep = wipSweep(healthy), knee = kneeWip(sweep);
  const econ = batchEconomics(econBase);
  const triage = leverTriage(healthy, {initialBacklog: 12});
  const md = markdownSummary(result, sweep, knee, healthy, {econ, triage, initialBacklog: 12});
  assert.match(md, /Economic batch/);
  assert.match(md, /lever/i);
  const plain = markdownSummary(result, sweep, knee, healthy);
  assert.doesNotMatch(plain, /Economic batch/);
});
