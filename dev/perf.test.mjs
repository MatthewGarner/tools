/* Performance budgets for the heavy engines. Thresholds are ~4× a warm local
   run: they trip on algorithmic regressions, not machine noise. The browser-
   side latency check lives in check.mjs. */
import {test} from 'node:test';
import assert from 'node:assert/strict';

const timed = async (budgetMs, fn) => {
  const t0 = performance.now();
  await fn();
  const ms = performance.now() - t0;
  assert.ok(ms < budgetMs, ms.toFixed(0) + 'ms > ' + budgetMs + 'ms budget');
};

test('rank: 4,000-run wobble under 500ms', async () => {
  const {simulate} = await import('../rank/engine.js');
  const state = {
    criteria: [{name: 'a', w: 3}, {name: 'b', w: 2}, {name: 'c', w: 1}],
    effort: {name: 'e', w: 1}, k: 3, ww: 50, sw: 1,
    items: Array.from({length: 8}, (_, i) => ({name: 'i' + i, s: [5, 6, 4], e: 5})),
  };
  await timed(500, () => simulate(state));
});

test('fermi: 20k estimate + sensitivity under 900ms', async () => {
  const E = await import('../fermi/engine.js');
  const {quantile} = await import('../assets/series.js');
  const ast = E.parse(E.tokenize('a * b * c * d * e'));
  const varNames = E.collectVars(ast, []);
  const ranges = Object.fromEntries(varNames.map(n => [n, [2, 9]]));
  const dists = Object.fromEntries(varNames.map(n => [n, 'auto']));
  const m = {ast, varNames, ranges, dists};
  await timed(900, () => {
    const {sorted} = E.simulateModel(m, {seed: 1, n: 20000});
    E.computeSensitivity(m, {seed: 1, p10: quantile(sorted, .1), p90: quantile(sorted, .9)});
  });
});

test('fermi cashflow: 10k runs × 60 periods with IRR under 1200ms', async () => {
  const {simulateCashflow} = await import('../fermi/cashflow.js');
  const periods = [{lo: -500, hi: -300}, {lo: 10, hi: 60}];
  await timed(1200, () => simulateCashflow(
    {periods, horizon: 60, grain: 'month', rate: {lo: 6, hi: 12}}, {seed: 1, n: 10000}));
});

test('flow: sweep + triage under 800ms', async () => {
  const {wipSweep, leverTriage, kneeWip} = await import('../flow/engine.js');
  const p = {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 12, cov: 1.0};
  await timed(800, () => {
    const knee = kneeWip(wipSweep(p));
    leverTriage(p, {initialBacklog: 40, knee});
  });
});

test('timeline: 120-milestone render under 250ms', async () => {
  const {parse} = await import('../timeline/parse.js');
  const {render} = await import('../timeline/render.js');
  const doc = 'title: big\n' + Array.from({length: 120}, (_, i) =>
    'Lane' + (i % 6) + ': Milestone number ' + i + ' 2026-' +
    String(i % 12 + 1).padStart(2, '0') + ' .. 2027-' + String(i % 12 + 1).padStart(2, '0')).join('\n');
  const m = parse(doc);
  const ctx = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667',
    accent: '#08c', bg: '#f7f8f6', err: '#b33',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
    measure: t => t.length * 7, today: 20640};
  await timed(250, () => render(m, ctx));
});

test('risk: 10k samples × 4 structures × 2 fits under 400ms', async () => {
  const {parse} = await import('../energy/risk/parse.js');
  const {simulate} = await import('../energy/risk/engine.js');
  const m = parse('merchant: 60..180\nfloor: 70 share 60% fee 5\nfloor: 80 share 75%\ntoll: 95\ninsure: premium 6 attach 65 limit 30');
  await timed(400, () => simulate(m));
});
