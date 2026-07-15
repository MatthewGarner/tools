import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateCashflow} from '../cashflow.js';
import {renderCashflow, cashflowMarkdown} from '../render-cashflow.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    accent2: '#c62', bg: '#f7f8f6', err: '#b33'},
  measure: t => t.length * 7,
};
const R = (lo, hi) => ({lo, hi});
const investSpec = {periods: [R(-250e3, -180e3), R(-40e3, 20e3), R(30e3, 90e3), R(60e3, 140e3)],
  horizon: 5, grain: 'year', rate: R(8, 12)};
const runwaySpec = {periods: [R(400e3, 400e3), R(-45e3, -25e3)],
  horizon: 24, grain: 'month', rate: R(0, 0)};

test('invest framing: NPV headline, P(NPV>0), IRR with undefined note, payback', () => {
  const r = simulateCashflow(investSpec, {seed: 2, n: 4000});
  const svg = renderCashflow(r, investSpec, ctx);
  assert.match(svg, /NPV P50/);
  assert.match(svg, /P\(NPV &gt; 0\)|P\(NPV > 0\)/);
  assert.match(svg, /IRR P50/);
  assert.match(svg, /payback/i);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('runway framing: cash-out headline in months', () => {
  const r = simulateCashflow(runwaySpec, {seed: 2, n: 4000});
  const svg = renderCashflow(r, runwaySpec, ctx);
  assert.match(svg, /Cash lasts|cash-out|Cash out/i);
  assert.match(svg, /month \d+/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('fan chart: band polygon, P50 line, zero line, event marker', () => {
  const r = simulateCashflow(investSpec, {seed: 2, n: 4000});
  const svg = renderCashflow(r, investSpec, ctx);
  assert.ok((svg.match(/<polygon/g) || []).length >= 1, 'band polygon');
  assert.ok((svg.match(/<polyline/g) || []).length >= 1, 'P50 line');
  assert.match(svg, /data-zero/);
  assert.match(svg, /data-event/);
});

test('IRR note only appears when some runs lack an IRR', () => {
  const clean = simulateCashflow({periods: [R(-100, -100), R(60, 60), R(60, 60)],
    horizon: 2, grain: 'year', rate: R(10, 10)}, {seed: 1, n: 200});
  assert.equal(clean.irr.undefinedShare, 0);
  const svg = renderCashflow(clean, investSpec, ctx);
  assert.doesNotMatch(svg, /undefined in/);
});

test('markdown carries the verdict, assumptions, and seeded-runs note', () => {
  const r = simulateCashflow(investSpec, {seed: 2, n: 4000});
  const md = cashflowMarkdown(r, investSpec, 'https://example.test/fermi/#x');
  assert.match(md, /NPV P50/);
  assert.match(md, /t0: −?-?250k.*180k|t0/);
  assert.match(md, /seeded runs|Monte Carlo/i);
  assert.match(md, /example\.test/);
});

/* ---------- financing card (debt sizing) ---------- */
const gearedSpec = {periods: [R(-7e6, -7e6), ...Array(8).fill(R(1.0e6, 1.4e6))], horizon: 9,
  grain: 'year', rate: R(8, 12), debt: {dscr: 1.3, costOfDebt: 0.065, sizingCase: 'central'}};

test('financing card renders the verdict + both IRR rows when debt sizing on', () => {
  const r = simulateCashflow(gearedSpec, {seed: 2, n: 4000});
  const svg = renderCashflow(r, gearedSpec, ctx);
  assert.match(svg, /FINANCING VERDICT/);
  assert.match(svg, /equity IRR/i);
  assert.match(svg, />LEVERED</);
  assert.match(svg, />UNLEVERED</);
  assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
  assert.doesNotMatch(svg, /NaN|undefined|>null</);
});

test('no financing card when debt off (existing render untouched)', () => {
  const r = simulateCashflow({periods: [R(-7e6, -7e6), R(1e6, 1.4e6)], horizon: 3, grain: 'year', rate: R(8, 12)}, {seed: 2, n: 2000});
  assert.doesNotMatch(renderCashflow(r, investSpec, ctx), /FINANCING/i);
});

test('financing card surfaces a clean reason when debt cannot be sized', () => {
  const r = simulateCashflow({periods: [R(1e6, 1e6), R(1e6, 1e6)], horizon: 2, grain: 'year', rate: R(8, 12),
    debt: {dscr: 1.3, costOfDebt: 0.065}}, {seed: 2, n: 1000});   // all-positive: invest framing, no build
  assert.equal(r.debt.ok, false);
  assert.match(renderCashflow(r, investSpec, ctx), /construction spend/i);
});

test('markdown carries the financing block when debt on', () => {
  const r = simulateCashflow(gearedSpec, {seed: 2, n: 4000});
  const md = cashflowMarkdown(r, gearedSpec, 'https://example.test/fermi/#x');
  assert.match(md, /Levered IRR|equity IRR/i);
  assert.match(md, /DSCR/);
  assert.match(md, /independent/i);   // the honest per-period-independence caveat
});
