/* Performance budgets for the heavy engines. Thresholds are ~4× a warm local
   run: they trip on algorithmic regressions, not machine noise. The browser-
   side latency check lives in check.mjs.
   Run these SERIALLY (`node --test --test-concurrency=1 …`): node runs test
   files in parallel by default, and a wall-clock micro-benchmark measured while
   sibling files hammer the same cores reads slow and flakes (cycles, the
   heaviest, sat right on its budget and tipped over once the energy suites ran
   alongside it). PERF_SCALE multiplies every budget for slower/variable
   silicon — CI sets it (GitHub runners are ~2× a warm Mac); local stays 1× so
   the tight calibration still catches real regressions. */
import {test} from 'node:test';
import assert from 'node:assert/strict';

const PERF_SCALE = Number(process.env.PERF_SCALE) || 1;
const timed = async (budgetMs, fn) => {
  const budget = budgetMs * PERF_SCALE;
  const t0 = performance.now();
  await fn();
  const ms = performance.now() - t0;
  assert.ok(ms < budget, ms.toFixed(0) + 'ms > ' + budget + 'ms budget' +
    (PERF_SCALE !== 1 ? ' (' + budgetMs + 'ms × ' + PERF_SCALE + ')' : ''));
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
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
    statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'}, accentInk: '#0A6C94'},
    measure: t => t.length * 7, today: 20640};
  await timed(250, () => render(m, ctx));
});

test('risk: 10k samples × 4 structures × 2 fits under 400ms', async () => {
  const {parse} = await import('../energy/risk/parse.js');
  const {simulate} = await import('../energy/risk/engine.js');
  const m = parse('merchant: 60..180\nfloor: 70 share 60% fee 5\nfloor: 80 share 75%\ntoll: 95\ninsure: premium 6 attach 65 limit 30');
  await timed(400, () => simulate(m));
});

test('cycles: full simulate (dual policy + augment re-sim) under 800ms', async () => {
  const {parse} = await import('../energy/cycles/parse.js');
  const {simulate} = await import('../energy/cycles/engine.js');
  const m = parse('battery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over 15yr\naugment: 120..180 £/kWh\ndiscount: 7..10%');
  await timed(800, () => simulate(m, {seed: 1, n: 5000}));
  /* the spec's N-drops-first rule: 5k must agree with 10k on the quoted digits */
  const a = simulate(m, {seed: 1, n: 5000}), b = simulate(m, {seed: 1, n: 10000});
  assert.equal(Math.round(a.threshold.p50), Math.round(b.threshold.p50), 'fidelity guard');
});

test('intraday: full runDay (raw + iterative back-off, ≤ pairs+2 clearings of 24 dispatches) under 150ms', async () => {
  const {runDay, DAY_DEFAULTS} = await import('../energy/intraday/day.js');
  await timed(150, () => runDay({...DAY_DEFAULTS, fleetGW: 6}));
});

test('tree: 10k-sim rollback + flip search on a 5-option nested tree under 100ms', async () => {
  const {parse} = await import('../tree/parse.js');
  const {evaluate} = await import('../tree/engine.js');
  const m = parse(`title: Portfolio bet
currency: £

Choose a play
  Enter market A: -200k to -350k
    Reception
      Strong uptake (p=0.35-0.5): 600k to 1.1M
        Scale
          Scale fast: 900k to 1.6M
          Scale slow: 500k to 800k
      Modest uptake (p=0.3-0.4): 150k to 400k
      Flop (p=rest): -50k to 0
  Enter market B: -150k to -250k
    Reception
      Strong uptake (p=0.3-0.45): 500k to 900k
      Modest uptake (p=0.3-0.4): 100k to 300k
      Flop (p=rest): -80k to -10k
  Partner with incumbent: -80k
    Deal quality
      Good terms (p=0.5-0.65): 300k to 500k
      Poor terms (p=rest): 20k to 80k
  License technology: -40k to -60k
    Uptake
      Licensees sign (p=0.4-0.55): 200k to 350k
      No uptake (p=rest): -20k to 0
  Do nothing: 0`);
  await timed(100, () => evaluate(m, {sims: 10000}));
});

test('alarm: classify + gate-layout of 1000 dots under 60ms', async () => {
  const {population, classify} = await import('../alarm/engine.js');
  const {layoutFlow} = await import('../alarm/gate-canvas.js');
  const pop = population();
  await timed(60, () => {
    const {dots} = classify(pop, {baseRate: 0.02, dprime: 2, t: 1.2});
    layoutFlow(dots, [{split: d => d.alarm, fail: 'Quiet'}], {w: 900, h: 360, dotR: 3}, {passLabel: 'ALARM'});
  });
});

test('bets: parse + 4,000-run simulate of the example portfolio under 50ms', async () => {
  const {parse} = await import('../bets/parse.js');
  const {simulate} = await import('../bets/engine.js');
  const doc = `title: Habitat — Q3 bet portfolio
unit: £k

Growth bets
  Referral flow v2: stake 80, odds 40-60%, payoff 300-500
    kill: Signups per referral stay under 0.3 by 2026-09-15
  Paid acquisition push: stake 220, odds 15-25%, payoff 150-300
    kill: CAC exceeds £40 for two consecutive months

Platform bets
  Sync engine rewrite: stake 150, odds 90-98%, payoff 180-260
  Coach marketplace pilot: stake 60, odds 15-25%, payoff 250-450
    kill: Fewer than 20 coaches onboarded by 2026-10-01
  Wearables integration: stake 60, odds 30-40%, payoff 150-280
    kill: No retail partner signed by 2026-11-01`;
  await timed(50, () => simulate(parse(doc)));
});
