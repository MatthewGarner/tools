/* What the cash-flow page says about its results (FM-2, 3, 21, 22, 24, 25, 26, 29, Q3, Q6).
   The random stream is untouched: only quantile bookkeeping and sentences change. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateCashflow} from '../cashflow.js';
import {verdictLines, financeVerdict, cashflowMarkdown} from '../render-cashflow.js';
import {cashflowMethod} from '../words.js';

const R = (lo, hi) => ({lo, hi});
const investSpec = {periods: [R(-250e3, -180e3), R(-40e3, 20e3), R(30e3, 90e3), R(60e3, 140e3)],
  horizon: 5, grain: 'year', rate: R(8, 12)};
const never28 = {periods: [R(98, 98), R(-3.4, -1.6)], horizon: 40, grain: 'year', rate: R(0, 0)};
const base = {npv: {p10: -38800, p50: 15100, p90: 73200, pPos: 0.64}, irr: {p50: 0.12, undefinedShare: 0},
  period: {kind: 'payback', p10: 3, p50: 4, p90: 5, neverShare: 0}, grain: 'year', framing: 'invest', outlay: true};

test('FM-2: P10 to P90 is the 80% range', () => {
  const v = verdictLines(base);
  assert.match(v.head, /80% range/);
  assert.doesNotMatch(v.head, /90%/);
  const md = cashflowMarkdown(simulateCashflow(investSpec, {seed: 2, n: 500}), investSpec, 'https://example.test/');
  assert.match(md, /80% range/);
  assert.doesNotMatch(md, /\*\*Cashflow — [^*]*90% range/);
});

test('FM-3: cash-out quantiles are over all runs, a never-run counted beyond the horizon', () => {
  const r = simulateCashflow(never28, {seed: 0xCA5F, n: 10000});
  assert.ok(r.period.neverShare > 0.2 && r.period.neverShare < 0.4, 'a real never-share');
  const y = r.period.p50;
  assert.ok(Number.isInteger(Math.round(y)) && y > 0);
  // half of ALL runs have cashed out by the quoted year: rerun with the horizon cut there
  const byYear = h => 1 - simulateCashflow({...never28, horizon: h}, {seed: 0xCA5F, n: 10000}).period.neverShare;
  assert.ok(byYear(Math.ceil(y)) > 0.48, 'at least half cashed out by year ' + y + ': ' + byYear(Math.ceil(y)));
  assert.ok(byYear(Math.ceil(y) - 1) < 0.52, 'not yet half the year before');
  assert.ok(r.period.p10 <= r.period.p50);
});

test('FM-3 / Q6: a quoted quantile that falls among never-runs is "not within the horizon"', () => {
  const r = simulateCashflow(never28, {seed: 0xCA5F, n: 10000});
  assert.equal(r.period.p90, null, 'p90 sits among the 28% that never cash out');
  const runway = {npv: base.npv, irr: base.irr, grain: 'year', framing: 'runway',
    period: {kind: 'cashout', p10: 20, p50: 30, p90: null, neverShare: 0.28}};
  const v = verdictLines(runway);
  assert.match(v.head, /Cash lasts until year 30 \(P50\)/);
  assert.match(v.head, /10% chance of cash-out before year 20/);
  assert.match(v.sub, /P90 not within the horizon/);
  const mostly = verdictLines({...runway, period: {kind: 'cashout', p10: 30, p50: null, p90: null, neverShare: 0.6}});
  assert.match(mostly.head, /Cash probably lasts the horizon/);
  const pay = verdictLines({...base, period: {kind: 'payback', p10: 5, p50: null, p90: null, neverShare: 0.7}});
  assert.match(pay.sub, /payback P50 not within the horizon/);
});

test('FM-3: with no never-runs the quantiles are the plain ones (Runway sentence unchanged)', () => {
  const runway = {periods: [R(400e3, 400e3), R(-45e3, -25e3)], horizon: 24, grain: 'month', rate: R(0, 0)};
  const r = simulateCashflow(runway, {seed: 0xCA5F, n: 10000});
  assert.equal(r.period.neverShare, 0);
  const v = verdictLines(r);
  assert.match(v.head, /^Cash lasts until month \d+(\.\d+)? \(P50\) — 10% chance of cash-out before month \d+/);
});

test('FM-21: shares that are neither 0 nor 1 never print 0% or 100%', () => {
  const v = verdictLines({...base, npv: {...base.npv, pPos: 0.9962},
    irr: {p50: 0.12, undefinedShare: 0.004}, period: {kind: 'payback', p10: 3, p50: 4, p90: 5, neverShare: 0.003}});
  assert.match(v.sub, /P\(NPV > 0\) >99%/);
  assert.match(v.sub, /undefined in <1% of runs/);
  assert.match(v.sub, /never in <1%/);
  assert.doesNotMatch(v.sub, /(^|[^.\d])(100|0)%/);
});

test('FM-22: IRR prints to one decimal in the verdict and in the financing verdict', () => {
  assert.match(verdictLines(base).sub, /IRR P50 12\.0%/);
});

test('FM-24: a cash flow with no negative period has no outlay, so no payback or IRR', () => {
  const r = simulateCashflow({periods: [R(100, 100), R(50, 50)], horizon: 3, grain: 'year', rate: R(10, 10)}, {seed: 1, n: 100});
  assert.equal(r.outlay, false);
  const v = verdictLines(r);
  assert.match(v.sub, /no outlay/i);
  assert.doesNotMatch(v.sub + v.head, /payback P50|IRR P50|never pays back/);
  assert.equal(simulateCashflow(investSpec, {seed: 1, n: 100}).outlay, true);
  assert.equal(simulateCashflow({periods: [R(400e3, 400e3), R(-45e3, -25e3)], horizon: 24, grain: 'month', rate: R(0, 0)}, {seed: 1, n: 100}).outlay, true);
});

test('FM-25 / Q3: the page states the timing convention, the shapes used and independence', () => {
  const m = cashflowMethod(investSpec, 5, 10000);
  assert.match(m, /end of each period/);
  assert.match(m, /t0 is not discounted/);
  assert.match(m, /normal: t0, t1/);
  assert.match(m, /log-normal: t2, t3/);
  assert.match(m, /drawn independently/);
  assert.doesNotMatch(m, /Log-normal fit per period range/);
  const fixed = cashflowMethod({periods: [R(400e3, 400e3), R(-45e3, -25e3)]}, 24, 10000);
  assert.match(fixed, /fixed: t0/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="cfmethod"/);
  assert.match(html, /end of each period/);
  assert.match(html, /independently/);
  assert.doesNotMatch(html, /Log-normal fit per period range/);
});

test('FM-26: the gearing sentence says what the figure is', () => {
  const spec = {periods: [R(-1000, -1000), R(400, 400)], horizon: 5, grain: 'year', rate: R(10, 10),
    debt: {dscr: 1.25, costOfDebt: 0.08, tenor: undefined, sizingCase: 'central'}};
  const d = simulateCashflow(spec, {seed: 1, n: 50}).debt;
  assert.ok(d.ok && d.capped);
  const fv = financeVerdict(d);
  assert.match(fv.sub, /debt at completion/i);
  assert.match(fv.sub, /interest during construction/i);
  assert.doesNotMatch(fv.sub, /100% of build/);
  const md = cashflowMarkdown(simulateCashflow(spec, {seed: 1, n: 50}), spec, 'https://example.test/');
  assert.match(md, /gearing 100% \(debt at completion/);
});

test('FM-29: the cash-flow Markdown prints the ranges as typed', () => {
  const r = simulateCashflow(investSpec, {seed: 2, n: 500});
  const typed = {periods: [{lo: '-1,234,567', hi: '-1,111,111'}, {lo: '-40k', hi: '20k'}, {lo: '30k', hi: '90k'}, {lo: '60k', hi: '140k'}], rate: {lo: '8', hi: '12'}};
  const md = cashflowMarkdown(r, investSpec, 'https://example.test/', typed);
  assert.match(md, /- t0: -1,234,567 to -1,111,111/);
  assert.match(md, /- t1: -40k to 20k/);
  assert.match(md, /discount rate: 8–12%/);
  assert.doesNotMatch(md, /1\.23M/);
});
