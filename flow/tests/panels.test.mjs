import {test} from 'node:test';
import assert from 'node:assert/strict';
import {batchEconomics} from '../economics.js';
import {leverTriage, simulate, wipSweep, kneeWip} from '../engine.js';
import {renderBatch, renderTriage, renderExpedite, renderDice, markdownSummary} from '../render.js';
import {expediteSensitivity} from '../expedite.js';
import {diceGame} from '../dice.js';

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

test('markdown summary carries every decision lens when given', () => {
  const result = simulate(healthy);
  const sweep = wipSweep(healthy), knee = kneeWip(sweep);
  const econ = batchEconomics(econBase);
  const triage = leverTriage(healthy, {initialBacklog: 12});
  const expedite = expediteSensitivity(healthy, {expeditePerWeek: 1});
  const dice = diceGame({seed: 4});
  const md = markdownSummary(result, sweep, knee, healthy, {econ, triage, expedite, dice, initialBacklog: 12});
  assert.match(md, /Economic batch/);
  assert.match(md, /lever/i);
  assert.match(md, /Expedite lane/);
  assert.match(md, /Dependent dice/);
  const plain = markdownSummary(result, sweep, knee, healthy);
  assert.doesNotMatch(plain, /Economic batch/);
  assert.doesNotMatch(plain, /Expedite lane/);
});

test('expedite card names the service-class trade and does not promise free capacity', () => {
  const r = expediteSensitivity(healthy, {expeditePerWeek: 1});
  const svg = renderExpedite(r, ctx);
  assert.match(svg, /EXPEDITE LANE/);
  assert.match(svg, /same people and WIP|same people/i);
  assert.match(svg, /EXPEDITED/);
  assert.match(svg, /STANDARD/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('dependent dice card states local/system distinction and keeps every step visible', () => {
  const game = diceGame({stations: 5, days: 30, seed: 4});
  const svg = renderDice(game, ctx);
  assert.match(svg, /LOCAL CAPACITY IS NOT FLOW/);
  assert.equal((svg.match(/STEP /g) || []).length, 5);
  assert.match(svg, /dependencies turn variation into waiting/i);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});
