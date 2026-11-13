// Audit harness: fermi (estimates from ranges; cash-flow and debt mode).
// Run: node dev/engine-audit/fermi/run.mjs   (about 1-3 minutes: million-draw references and seed sweeps)
// A check tagged [DEFECT] proves a confirmed defect and FAILS today. Everything else is a covered-and-correct PASS.
import {check, done, rng} from './lib.mjs';
import * as E from '../../../fermi/engine.js';
import {confess, solveStretch, asciiNum} from '../../../fermi/solve.js';
import {simulateCashflow} from '../../../fermi/cashflow.js';
import {sizeDebt, leverTrials} from '../../../fermi/debt.js';
import {verdictLines, financeVerdict, cashflowMarkdown, renderCashflow} from '../../../fermi/render-cashflow.js';
import {renderDriverTree} from '../../../fermi/render-driver.js';
import {histLayout} from '../../../fermi/histlayout.js';
import {pourVerdict} from '../../../fermi/pour.js';
import {parseCashflowInputs, parseCashflowScalar, effectiveHorizon, parseCashflowTenor, periodsFromLink} from '../../../fermi/interactions.js';
import {packScen, unpackScen} from '../../../fermi/state.js';
import {mulberry32, gaussian, quantile, rangeSampler} from '../../../assets/series.js';
import {rangeQuantile, normInv as gridNormInv} from '../../../assets/quantile-grid.js';
import * as W from '../../../fermi/words.js';
import {CAP} from '../../../fermi/solve.js';

const {tokenize, parse, collectVars, evalNode, parseNum, fmt, sig, simulateModel, computeSensitivity, traceDraws,
  effDist, distMedian, samplerFor, probit, distQuantile, irrOf} = E;

// ---------- independent reference maths -----------------------------------------------------------
// Phi by erf power series (|x|<=4) / erfc continued fraction beyond; inverse by bisection. About 1e-13.
function erf(x){ let s = x, t = x; for(let n = 1; n < 80; n++){ t *= -x * x / n; s += t / (2 * n + 1); } return 2 / Math.sqrt(Math.PI) * s; }
function erfcCF(x){ let f = 0; for(let k = 60; k >= 1; k--) f = (k / 2) / (x + f); return Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f); }
const Phi = z => { const x = Math.abs(z) / Math.SQRT2; const p = x < 2.8 ? 0.5 * (1 + erf(x)) : 1 - 0.5 * erfcCF(x); return z >= 0 ? p : 1 - p; };
const PhiInv = p => { let lo = -9, hi = 9; for(let i = 0; i < 100; i++){ const m = (lo + hi) / 2; if(Phi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
const Z95 = PhiInv(0.95), Z90q = PhiInv(0.9);           // 1.6448536269514722 and 1.2815515655446004
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const mean = a => { let s = 0; for(const v of a) s += v; return s / a.length; };
const sd = a => { const m = mean(a); let s = 0; for(const v of a) s += (v - m) ** 2; return Math.sqrt(s / (a.length - 1)); };
const qs = (sorted, p) => quantile(sorted, p);
// own generator for references: mulberry32 (own copy in lib) + Box-Muller. Not the engine's polar method.
function normalGen(seed){ const u = rng(seed); let spare = null;
  return () => { if(spare !== null){ const s = spare; spare = null; return s; }
    const a = Math.sqrt(-2 * Math.log(1 - u())), b = 2 * Math.PI * u(); spare = a * Math.sin(b); return a * Math.cos(b); }; }
const LN = (lo, hi) => ({mu: (Math.log(lo) + Math.log(hi)) / 2, s: (Math.log(hi) - Math.log(lo)) / (2 * Z95)});

// build a model like the app does
function build(f, vars){
  const ast = parse(tokenize(f)), varNames = collectVars(ast, []), ranges = {}, dists = {};
  for(const n of varNames){ ranges[n] = [parseNum(String(vars[n][0])), parseNum(String(vars[n][1]))]; dists[n] = vars[n][2] || 'auto'; }
  return {ast, varNames, ranges, dists};
}
// what lint() computes, for a model at the page's own settings
function pageRun(m, seed = 0x5EED, N = 20000){
  const {sorted, raw} = simulateModel(m, {seed, n: N});
  const p10 = quantile(sorted, .1), p50 = quantile(sorted, .5), p90 = quantile(sorted, .9);
  const s = computeSensitivity(m, {seed, p10, p90});
  return {sorted, raw, p10, p50, p90, ...s};
}
const evalStr = (f, env = {}) => evalNode(parse(tokenize(f)), env);

// the five built-in estimate examples and three cash-flow examples, transcribed from fermi/app.js
const EXAMPLES = [
  {name: 'Piano tuners', f: 'households * share_with_piano * tunings_per_year / (tunings_per_day * working_days)',
   v: {households: ['3M', '4M'], share_with_piano: ['0.02', '0.08'], tunings_per_year: ['0.5', '2'], tunings_per_day: ['2', '5'], working_days: ['220', '260']}},
  {name: 'Weekly meeting', f: 'attendees * hourly_cost * meeting_hours * weeks_per_year',
   v: {attendees: ['6', '10'], hourly_cost: ['60', '120'], meeting_hours: ['0.75', '1.5'], weeks_per_year: ['44', '48']}},
  {name: 'New feature revenue', f: 'monthly_visitors * signup_rate * paid_conversion * annual_price',
   v: {monthly_visitors: ['80k', '200k'], signup_rate: ['0.02', '0.06'], paid_conversion: ['0.05', '0.15'], annual_price: ['90', '140']}},
  {name: 'Availability chain', f: 'app_up * db_up * network_up * api_up',
   v: {app_up: ['0.97', '0.999'], db_up: ['0.98', '0.9995'], network_up: ['0.99', '0.9999'], api_up: ['0.95', '0.999']}},
  {name: 'Cadence economics', f: 'decisions_per_quarter * hours_per_decision * people_in_room * hourly_cost',
   v: {decisions_per_quarter: ['12', '30'], hours_per_decision: ['1', '4'], people_in_room: ['4', '9'], hourly_cost: ['60', '120']}},
];
const exModel = ex => build(ex.f, ex.v);
const R = (lo, hi) => ({lo, hi}), fixed = v => ({lo: v, hi: v});
const CF_EX = {
  invest: {periods: [R(-250e3, -180e3), R(-40e3, 20e3), R(30e3, 90e3), R(60e3, 140e3)], horizon: 5, grain: 'year', rate: R(8, 12)},
  runway: {periods: [R(400e3, 400e3), R(-45e3, -25e3)], horizon: 24, grain: 'month', rate: R(0, 0)},
  geared: {periods: [R(-7.2e6, -6.8e6), ...Array(15).fill(R(880e3, 1.35e6))], horizon: 15, grain: 'year', rate: R(9, 11),
    debt: {dscr: 1.45, costOfDebt: 0.065, tenor: 9, sizingCase: 'central'}},
};

// =============================================================================================
// 1. PARSER AND EVALUATOR
// =============================================================================================
{
  // hand answers (not computed by an evaluator)
  const cases = [['2+3*4', 14], ['(2+3)*4', 20], ['10-3-2', 5], ['100/10/5', 2], ['2^3^2', 512], ['-2^2', -4], ['2^-1', 0.5],
    ['2*-3', -6], ['--3', 3], ['-(2+3)', -5], ['2^2^-1', Math.sqrt(2)], ['8/2*4', 16], ['1-2*3^2', -17], ['3 - -2', 5], ['-3^2+10', 1]];
  const bad = cases.filter(([s, v]) => Math.abs(evalStr(s) - v) > 1e-12);
  check('P1 precedence/associativity vs hand answers (15 expressions incl. power right-assoc, -2^2, 2^-1)', bad.length === 0, bad.map(b => b[0]).join(', '));
  check('P1b division by zero yields Infinity/NaN (later dropped), 0^0 = 1', evalStr('1/0') === Infinity && Number.isNaN(evalStr('0/0')) && evalStr('0^0') === 1 && Number.isNaN(evalStr('(-8)^0.5')));
  // unary minus after a power operand
  check('P1c 2^3*2 = 16 (power binds tighter than *)', evalStr('2^3*2') === 16);
  // suffixes
  check('P2 number suffixes in a formula: 5k 2.5M 1B 3t', evalStr('5k') === 5e3 && evalStr('2.5M') === 2.5e6 && evalStr('1B') === 1e9 && evalStr('3t') === 3e12);
  // silent token handling in the formula tokenizer
  const tryEval = src => { try{ return evalStr(src); }catch(e){ return 'syntax error: ' + e.msg; } };
  const v123 = tryEval('1.2.3'), v15 = tryEval('1,5'), v1000 = evalStr('1_000');
  check('P3 "1.2.3" must be rejected, not read as 1.2 (parseFloat drops the tail silently)', v123 !== 1.2, `evaluates to ${v123}`);
  check('P3b "1,5" in a formula must not silently become 15 (European decimal comma)', v15 !== 15, `evaluates to ${v15}`);
  check('P3c underscore grouping 1_000 reads as 1000 in a formula', v1000 === 1000);
  // m / k / b / t suffix collides with a one-letter variable name
  { let r; try{ r = evalStr('3m'); }catch(e){ r = 'error'; }
    check('P3d "3m" reads as three million, not 3 times a variable m (recorded as modelling question FM-Q5, not a defect)', r === 3e6, String(r)); }
  { let msg = ''; try{ tokenize('5%'); }catch(e){ msg = e.msg; }
    check('P4 a % sign in a formula is rejected with a message', /unexpected/.test(msg), msg); }
  { let msg = ''; try{ parse(tokenize('3 4')); }catch(e){ msg = e.msg; }
    check('P4b two adjacent numbers rejected', /unexpected/.test(msg), msg); }
  { let msg = ''; try{ parse(tokenize('(1+2')); }catch(e){ msg = e.msg; }
    check('P4c missing ) rejected', /missing/.test(msg), msg); }
  check('P5 collectVars: one entry per distinct name; a repeated name is one draw (x - x = 0 always, x / x = 1)', (() => {
    const m = build('x - x', {x: [10, 20]}); const a = simulateModel(m, {seed: 3, n: 500}).sorted;
    const m2 = build('x / x', {x: [10, 20]}); const b = simulateModel(m2, {seed: 3, n: 500}).sorted;
    return collectVars(parse(tokenize('x*x+y*x')), []).join() === 'x,y' && a[0] === 0 && a[a.length - 1] === 0 && b[0] === 1 && b[b.length - 1] === 1; })());
  // parseNum
  const pn = s => parseNum(s);
  check('P6 parseNum accepts 3M 1,500 0.02 -5k .5 1e6 2.5B 7K', pn('3M') === 3e6 && pn('1,500') === 1500 && pn('0.02') === 0.02 && pn('-5k') === -5000 && pn('.5') === .5 && pn('1e6') === 1e6 && pn('2.5B') === 2.5e9 && pn('7K') === 7000);
  check('P6b parseNum("1e+6") is accepted (the e+ form is what sig()/toPrecision emits)', pn('1e+6') === 1e6, String(pn('1e+6')));
  check('P6c parseNum("5.") is accepted (the formula tokenizer accepts 5.)', Number.isFinite(pn('5.')), String(pn('5.')));
  check('P6d parseNum accepts the page\'s own minus sign "−5" (fmt() prints U+2212; a pasted range fails)', Number.isFinite(pn('−5')), String(pn('−5')));
  check('P6e parseNum("1_000") is accepted (formula tokenizer accepts it)', Number.isFinite(pn('1_000')), String(pn('1_000')));
  check('P6f parseNum("1,5") must not silently become 15', pn('1,5') !== 15, String(pn('1,5')));
  check('P6g parseNum rejects "5%" and "£5" and "5bn" (NaN, shown as "Waiting on ranges")', Number.isNaN(pn('5%')) && Number.isNaN(pn('£5')) && Number.isNaN(pn('5bn')));
}

// =============================================================================================
// 2. NUMBER FORMATTING
// =============================================================================================
{
  const F = fmt;
  check('F1 fmt basics: 4523 -> 4.52k, 1234567 -> 1.23M, 0.0456 -> 0.046, -2500 -> −2.5k, 0 -> 0, 12.34 -> 12.3', F(4523) === '4.52k' && F(1234567) === '1.23M' && F(0.0456) === '0.046' && F(-2500) === '−2.5k' && F(0) === '0' && F(12.34) === '12.3', [F(4523), F(1234567), F(0.0456), F(-2500)].join(' '));
  check('F2 fmt(Infinity) and fmt(NaN) print an em dash', F(Infinity) === '—' && F(NaN) === '—');
  check('F3 fmt does not cross a unit boundary: 999600 must print 1M, not 1000k', F(999600) === '1M', F(999600));
  check('F3b fmt does not cross a unit boundary: 999.6e6 must print 1B', F(999.6e6) === '1B', F(999.6e6));
  check('F3c fmt(999.6) prints 1k or 1000 (3 s.f. rounding up across a power of ten is a one-off 4-digit string)', ['1k', '1000'].includes(F(999.6)), F(999.6));
  check('F4 fmt tiny values use exponent form, never rounds a positive value to 0: 0.0004 -> 4.0e-4', F(0.0004) === '4.0e-4' && F(1e-9) === '1.0e-9', F(0.0004) + ' ' + F(1e-9));
  check('F4b fmt(0.0009996) does not print "1.0e-3" next to a 2 s.f. neighbour (0.001 prints 0.001)', F(0.0009996) !== '1.0e-3', F(0.0009996));
  check('F5 fmt of 1e18 stays readable (prints "1000000T": the T suffix has no larger unit)', F(1e18) !== '1000000T', F(1e18));
  check('F6 sig(x,n) trims zeros: sig(1.50,3)=1.5, sig(1234,2)=1200, sig(0.000123,2)=0.00012', sig(1.5, 3) === '1.5' && sig(1234, 2) === '1200' && sig(0.000123, 2) === '0.00012');
  check('F6b sig never prints an exponent for the "spread ×" label up to 1e20', !/e/.test(sig(1.23e20, 2)), sig(1.23e20, 2));
  check('F6c sig(1.23e21,2) prints "1.2e+21" (exponent leaks into "×1.2e+21")', !/e/.test(sig(1.23e21, 2)), sig(1.23e21, 2));
}

// =============================================================================================
// 3. SAMPLERS, QUANTILE FUNCTION AND THE STATED INTERVAL
// =============================================================================================
{
  // each family: sampler vs distQuantile at 1M draws from the ENGINE's own sampler, and vs closed form
  const N = 1000000;
  const fams = [['logn', 60, 180], ['norm', -20, 50], ['uni', 5, 15], ['auto', 0.02, 0.08], ['auto', -3, 9]];
  for(const [d, lo, hi] of fams){
    const rand = mulberry32(99), g = gaussian(rand), s = samplerFor(lo, hi, d, rand, g);
    const a = new Float64Array(N); for(let i = 0; i < N; i++) a[i] = s(); a.sort();
    let worst = 0; for(const q of [.05, .1, .5, .9, .95]) worst = Math.max(worst, Math.abs(quantile(a, q) - distQuantile(lo, hi, d, q)) / (hi - lo));
    check(`S1 samplerFor vs distQuantile agree, ${d} ${lo}..${hi} (1M draws, max gap ${(worst * 100).toFixed(3)} % of range)`, worst < 0.003, '');
  }
  // the interval: for logn and norm the entered range is P5..P95; for uni it is the whole support
  for(const [d, lo, hi] of [['logn', 60, 180], ['norm', -20, 50]]){
    const e5 = distQuantile(lo, hi, d, .05), e95 = distQuantile(lo, hi, d, .95);
    check(`S2 ${d} ${lo}..${hi}: P5 and P95 of the distribution equal the typed bounds (90 % interval; Acklam probit)`, rel(e5, lo) < 1e-7 && rel(e95, hi) < 1e-7, `${e5} ${e95}`);
  }
  check('S2b probit (Acklam) vs own inverse at 9 points, max abs error < 2e-9', (() => { let w = 0; for(const p of [1e-6, .001, .02, .1, .3, .5, .7, .95, .9999]) w = Math.max(w, Math.abs(probit(p) - PhiInv(p)) / Math.max(1, Math.abs(PhiInv(p)))); return w < 2e-9; })());
  check('S2c Z90 constant is 1.6448536 (true 1.64485362695): relative error 1.6e-8, immaterial', rel(E.Z90, Z95) < 2e-8, String(rel(E.Z90, Z95)));
  // uniform: the page says every range is a 90 % interval, but uni reads lo..hi as the full support
  { const q5 = distQuantile(10, 20, 'uni', .05), q95 = distQuantile(10, 20, 'uni', .95);
    // FM-17 (label only): the sampler is unchanged, the typed bounds are the 0 % and 100 % points, and the page says so
    check('S3 a uniform range typed 10..20 is labelled a full range, not a 90% interval (the sampler keeps the bounds as 0 % and 100 %: P5 ' + q5 + ', P95 ' + q95 + ')',
      Math.abs(q5 - 10.5) < 1e-9 && Math.abs(q95 - 19.5) < 1e-9 && W.rangeAria('x', 'low', 'uni') === 'x low (full range)' && W.rangeAria('x', 'low', 'auto') === 'x low (90% interval)' && W.shapeLabel('uni', 10) === 'uniform (full range)'); }
  // silent override of an explicit choice
  check('S4 an explicit "log-normal" on a range that touches zero still runs as normal (effDist) but the page now says so (FM-17)', effDist('logn', 0) === 'norm' && W.distOverrideNotes(['a'], {a: [0, 10]}, {a: 'logn'}).length === 1 && /runs as normal/.test(W.distOverrideNotes(['a'], {a: [0, 10]}, {a: 'logn'})[0]), `effDist('logn',0) = ${effDist('logn', 0)}; ${W.distOverrideNotes(['a'], {a: [0, 10]}, {a: 'logn'})[0]}`);
  check('S4b auto: lo>0 -> logn, lo<=0 -> norm, including lo = 0 exactly (a 0..10 count is normal: 5 % of draws below zero)', effDist('auto', 0) === 'norm' && effDist('auto', 1e-9) === 'logn');
  // kept by ruling (FM-Q1: a stated, defensible choice; listed for Matt)
  { const f = distQuantile(0, 10, 'auto', .05); check('S4c a "0..10" range (e.g. a non-negative count) draws values below zero', f >= 0, `P5 of the sampler = ${f.toFixed(3)} (P(x<0) = ${(100 * Phi((0 - 5) / (10 / (2 * Z95)))).toFixed(1)} %)`, {known: true}); }
  // zero-width, reversed
  check('S5 zero-width range is a constant; reversed range is swapped', (() => { const r = mulberry32(1), g = gaussian(r); return samplerFor(5, 5, 'auto', r, g)() === 5 && distQuantile(9, 3, 'norm', .5) === 6; })());
  check('S5b a constant range consumes no RNG (so toggling a range to a point changes every later draw) - recorded; same draw count either way', (() => {
    const r = mulberry32(4), g = gaussian(r); const s1 = samplerFor(5, 5, 'auto', r, g); const before = r(); const r2 = mulberry32(4); return s1() === 5 && before === r2(); })());
  // shared helper equals engine sampler for explicit dists
  check('S6 assets/series.js rangeSampler draws identical to engine samplerFor for explicit norm/logn/uni', (() => {
    for(const [d, lo, hi] of [['norm', -3, 9], ['logn', 2, 30], ['uni', 1, 4]]){
      const r1 = mulberry32(7), g1 = gaussian(r1), r2 = mulberry32(7), g2 = gaussian(r2);
      const a = samplerFor(lo, hi, d, r1, g1), b = rangeSampler(lo, hi, d, r2, g2);
      for(let i = 0; i < 50; i++) if(a() !== b()) return false; }
    return true; })());
  // product of two lognormals is lognormal; sum of normals is normal
  { const A = LN(10, 40), B = LN(2, 8), S = Math.hypot(A.s, B.s), MU = A.mu + B.mu;
    const m = build('a * b', {a: [10, 40], b: [2, 8]});
    const o = simulateModel(m, {seed: 11, n: 1000000}).sorted;
    const hand = q => Math.exp(MU + S * PhiInv(q));
    const errs = [.1, .5, .9].map(q => rel(qs(o, q), hand(q)));
    check('S7 product of two lognormals = lognormal(mu1+mu2, hypot(s1,s2)): P10/P50/P90 within 0.5 % at 1M', Math.max(...errs) < 0.005, errs.map(e => (e * 100).toFixed(3) + '%').join(' ')); }
  { const m = build('a + b', {a: [-10, 30], b: [5, 25, 'norm']});
    const o = simulateModel(m, {seed: 12, n: 1000000}).sorted;
    const sa = 40 / (2 * Z95), sb = 20 / (2 * Z95), mu = 10 + 15, S = Math.hypot(sa, sb);
    const errs = [.1, .5, .9].map(q => Math.abs(qs(o, q) - (mu + S * PhiInv(q))) / S);
    check('S8 sum of two normals: P10/P50/P90 within 0.01 sd of closed form at 1M', Math.max(...errs) < 0.01, errs.map(e => e.toFixed(4)).join(' ')); }
  { const m = build('3 * x', {x: [10, 40]}); const o = simulateModel(m, {seed: 13, n: 400000}).sorted; const {mu, s} = LN(10, 40);
    check('S9 constant times one lognormal: P50 = 3*sqrt(lo*hi) = 60', rel(qs(o, .5), 3 * Math.sqrt(400)) < 0.004 && rel(qs(o, .9), 3 * Math.exp(mu + Z90q * s)) < 0.005); }
  { const m = build('x', {x: [5, 5]}); const r = pageRun(m); check('S9b a formula whose only input is a point range has zero spread and no sensitivity bars', r.p10 === 5 && r.p90 === 5 && r.sens.length === 0); }
  // scaling
  { const m1 = build('a * b', {a: [10, 40], b: [2, 8]}), m2 = build('a * b', {a: [100, 400], b: [2, 8]});
    const x = simulateModel(m1, {seed: 5, n: 20000}).sorted, y = simulateModel(m2, {seed: 5, n: 20000}).sorted;
    let w = 0; for(const q of [.1, .5, .9]) w = Math.max(w, rel(qs(y, q), 10 * qs(x, q)));
    check('S10 scaling an input by 10 scales the output by 10 exactly (same seed), a product model', w < 1e-12, String(w)); }
  { const m1 = build('a + b', {a: [-10, 30], b: [5, 25]}), m2 = build('a + b', {a: [-100, 300], b: [50, 250]});
    const x = simulateModel(m1, {seed: 5, n: 20000}).sorted, y = simulateModel(m2, {seed: 5, n: 20000}).sorted;
    check('S10b scaling both inputs of a sum by 10 scales the output by 10 (same seed)', Math.max(...[.1, .5, .9].map(q => rel(qs(y, q), 10 * qs(x, q)))) < 1e-9); }
  check('S11 P10 <= P50 <= P90 on every example', EXAMPLES.every(ex => { const r = pageRun(exModel(ex)); return r.p10 <= r.p50 && r.p50 <= r.p90; }));
}

// =============================================================================================
// 4. INVALID DRAWS, DROPPED SILENTLY
// =============================================================================================
{
  const m = build('1 / x', {x: [-1, 3]});
  const {sorted} = simulateModel(m, {seed: 2, n: 20000});
  check('V1 x in -1..3 (normal), 1/x: all finite draws kept (Infinity only when x is exactly 0)', sorted.length === 20000);
  const m2 = build('x ^ 0.5', {x: [20, 100, 'norm']});
  const o2 = simulateModel(m2, {seed: 2, n: 20000});
  const dropped = 20000 - o2.sorted.length, trueP = Phi((0 - 60) / (80 / (2 * Z95)));
  check(`V2 x^0.5 with x normal 20..100: ${(100 * trueP).toFixed(2)} % of draws are negative (NaN) and dropped; below the 1 % warning threshold they vanish with no message, truncating the distribution (dropped ${dropped} of 20000)`,
    !(dropped > 0 && dropped <= 200) || /^152 of 20,000 runs \(0\.76%\) hit invalid maths and were left out\.$/.test(W.invalidNote(dropped, 20000)), `dropped ${dropped} (${(dropped / 200).toFixed(2)} %); the page now says: ${W.invalidNote(dropped, 20000)}`);
  // the conditioning bias of dropping: P50 of the surviving draws vs P50 of x^0.5 over positive x
  const keep = o2.sorted; const sdv = 80 / (2 * Z95); const pPos = 1 - trueP;
  // median of sqrt(x) given x>0: x quantile at 0.5*(1+trueP) shifted
  const xq = 60 + sdv * PhiInv(trueP + 0.5 * pPos);
  check('V2b the P50 of the surviving draws is the conditional median given x>0 (truncation), as expected', rel(qs(keep, .5), Math.sqrt(xq)) < 0.01);
  const m3 = build('a * b', {a: [1e200, 1e300], b: [1e200, 1e300]});
  const o3 = simulateModel(m3, {seed: 2, n: 1000});
  check('V3 overflow to Infinity drops every draw (the page then shows the "More than half... invalid maths" message)', o3.sorted.length < 500);
  // arithmetic-only formula message
  check('V4 an arithmetic-only formula like 1/0 gets a plain sentence, not "it comes to —"', !/—\./.test(W.arithmeticSentence(evalStr('1/0'))) && /doesn’t come to a number/.test(W.arithmeticSentence(evalStr('1/0'))), W.arithmeticSentence(evalStr('1/0')));
}


// =============================================================================================
// 5. SENSITIVITY (value of information) vs closed form
// =============================================================================================
// For a product of independent lognormals: log-width of P10..P90 is 2*Z(.9)*S, S = hypot(sigmas). Pinning variable k at its
// median removes sigma_k. The page's "share" = 1 - log(q90/q10)/log(p90/p10) = 1 - S_without_k / S.
const sigmasOf = m => m.varNames.map(n => LN(m.ranges[n][0], m.ranges[n][1]).s);
function exactShares(m){
  const sg = sigmasOf(m), S = Math.hypot(...sg);
  return m.varNames.map((n, i) => ({name: n, share: 1 - Math.sqrt(Math.max(0, S * S - sg[i] * sg[i])) / S,
    pinnedRatio: Math.exp(2 * Z90q * Math.sqrt(S * S - sg[i] * sg[i]))}));
}
const exactRatio = m => Math.exp(2 * Z90q * Math.hypot(...sigmasOf(m)));
{
  // hand case: two equal lognormals. pinning one leaves sigma/sqrt2 -> share 1 - 1/sqrt2 = 0.2929
  const m = build('a * b', {a: [10, 40], b: [10, 40]});
  const sh = []; for(let seed = 1; seed <= 20; seed++){ const r = pageRun(m, seed); sh.push(r.sens[0].share); }
  check('SN1 two equal lognormals: share = 1-1/sqrt(2) = 0.2929 (mean of 20 seeds within 0.01)', Math.abs(mean(sh) - (1 - Math.SQRT1_2)) < 0.01, `mean ${mean(sh).toFixed(4)} sd ${sd(sh).toFixed(4)}`);
  // four equal drivers: each share 0.134; the shares sum to 54 %, not 100 %
  const m4 = build('a*b*c*d', {a: [10, 40], b: [10, 40], c: [10, 40], d: [10, 40]});
  const r4 = pageRun(m4, 5); const tot = r4.sens.reduce((s, x) => s + x.share, 0);
  // awaiting decision (tier 2b, FM-5: the sensitivity measure)
  check('SN2 four equal drivers: the bars sum to 100 % of the spread (a reader taking "share" as a share of uncertainty expects 25 % each)', Math.abs(tot - 1) < 0.1, `each bar ~${(100 * r4.sens[0].share).toFixed(0)} %, sum ${(100 * tot).toFixed(0)} %; the variance share of each is 25 %`, {known: true});
  // truthfulness of "pin X and the spread drops from A to B": check against closed-form pinned ratio over the examples
  for(const ex of EXAMPLES){
    const mm = exModel(ex), r = pageRun(mm), ex_ = exactShares(mm), full = exactRatio(mm);
    const top = r.sens[0], exTop = ex_.slice().sort((a, b) => b.share - a.share)[0];
    check(`SN3 ${ex.name}: full spread vs closed form (x${sig(r.fullRatio, 2)} vs exact x${sig(full, 2)}) and reported top driver ${top.name} has an exact share within 0.03 of the true top (${exTop.name})`, rel(r.fullRatio, full) < 0.03 && (ex_.find(e => e.name === top.name).share >= exTop.share - 0.03));
    // exact ties among the leading drivers: the page highlights one of them as THE top driver
    const sorted = ex_.slice().sort((a, b) => b.share - a.share), tie = Math.abs(sorted[0].share - sorted[1].share) < 1e-9;
    if(tie){
      const winners = new Set(); for(let seed = 1; seed <= 12; seed++) winners.add(W.topDrivers(pageRun(mm, seed).sens).slice().sort().join(' + '));
      check(`SN3b ${ex.name}: ${sorted[0].name} and ${sorted[1].name} tie exactly (share ${(100 * sorted[0].share).toFixed(1)} %); the drivers the tree marks and the hint names are the tied pair together, whatever the seed (FM-6)`, winners.size === 1 && [...winners][0].split(' + ').length >= 2, `over 12 seeds the marked set is ${[...winners].join(' | ')}`);
    }
  }
  // sensitivities dropped silently when most pinned runs are invalid
  const md = build('a / b', {a: [10, 40], b: [-1, 3]});
  const rd = pageRun(md, 3);
  check('SN4 a/b with b crossing zero: both inputs appear in the sensitivity list (pinning b at its median 1 is fine; pinning a leaves b crossing zero)', rd.sens.length === 2, `${rd.sens.length} rows: ${rd.sens.map(s => s.name).join(',')}`);
  const mz = build('a / b', {a: [10, 40], b: [-3, 3]});
  const rz = pageRun(mz, 3);
  check('SN4b a/b with b -3..3 (median 0): pinning b gives all-invalid runs; it has no bar, and the page names it in a note (FM-12)', rz.sens.length === 1 && rz.unmeasured.length === 1 && /No bar for b/.test(W.unmeasuredNote(rz.unmeasured)), `${rz.sens.length} row(s): ${rz.sens.map(s => s.name).join(',')}; ${W.unmeasuredNote(rz.unmeasured)}`);
  // the pinned run does not consume the pinned variable's RNG, so the other draws are a different sample
  const mp = build('a * b', {a: [10, 40], b: [2, 8]});
  const full = simulateModel(mp, {seed: 9, n: 50}).raw, pin = simulateModel(mp, {seed: 9, n: 50, pinName: 'a', pinValue: 20}).raw;
  const bFull = full.map(v => v), bPin = pin.map(v => v / 20);
  const rb = rng(1);
  // recover b draws from the raw: main b_i = raw_i / a_i is unknown; instead compare first b draw directly
  const r1 = mulberry32(9), g1 = gaussian(r1); const sa = samplerFor(10, 40, 'auto', r1, g1), sb = samplerFor(2, 8, 'auto', r1, g1);
  const a0 = sa(), b0 = sb();      // main run: a then b share one polar pair (a=u*f, b=spare)
  const r2 = mulberry32(9), g2 = gaussian(r2); samplerFor(10, 40, 'auto', r2, g2); const sb2 = samplerFor(2, 8, 'auto', r2, g2); const b0pin = sb2();
  // awaiting decision (tier 2b, FM-5: common random numbers would change draws)
  check('SN5 pinning a variable leaves the other variables drawing the SAME values as the main run (common random numbers)', b0 === b0pin, `first b draw: main run ${b0.toFixed(4)}, pinned-a run ${b0pin.toFixed(4)}; the pinned run is a different sample (8000 draws vs 20000), adding noise to every share`, {known: true});
}

// =============================================================================================
// 6. SAMPLING ERROR AGAINST PRINTED PRECISION (built-in examples, 40 seeds, page trial counts)
// =============================================================================================
// printed step of fmt(v): 3 s.f. for >=1, 2 s.f. for [.001,1)
function fmtStep(v){
  v = Math.abs(v); if(v === 0) return 0;
  for(const m of [1e12, 1e9, 1e6, 1e3]) if(v >= m){ const x = v / m; return Math.pow(10, Math.floor(Math.log10(x)) - 2) * m; }
  if(v >= 1) return Math.pow(10, Math.floor(Math.log10(v)) - 2);
  return Math.pow(10, Math.floor(Math.log10(v)) - 1);
}
const stepSig2 = v => Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);   // sig(v,2)
const SEEDS = Array.from({length: 40}, (_, i) => 1000 + 37 * i);
const NOISE = {};   // filled; printed later
{
  console.log('   info: SAMPLING ERROR TABLE (estimate examples, N=20000, sensitivity np=8000, 40 seeds). sd = seed-to-seed sd; step = printed resolution; ratio = sd/step');
  for(const ex of EXAMPLES){
    const m = exModel(ex), rows = {p10: [], p50: [], p90: [], spread: [], topShare: [], topLabelRatio: []};
    const exact = exactShares(m), exFull = exactRatio(m);
    const sg = sigmasOf(m), S = Math.hypot(...sg), mu = m.varNames.reduce((s, n, i) => s + (Math.log(m.ranges[n][0]) + Math.log(m.ranges[n][1])) / 2, 0);
    // division in the piano formula: mu is of the quotient, not the sum; compute exactly from the AST instead
    const medianEnv = {}; for(const n of m.varNames) medianEnv[n] = Math.sqrt(m.ranges[n][0] * m.ranges[n][1]);
    const med = evalNode(m.ast, medianEnv);   // log-linear formula => median of output
    const clos = q => med * Math.exp(S * PhiInv(q));
    const shareBy = {}; for(const n of m.varNames) shareBy[n] = [];
    const labelBy = {};
    for(const seed of SEEDS){
      const r = pageRun(m, seed);
      rows.p10.push(r.p10); rows.p50.push(r.p50); rows.p90.push(r.p90); rows.spread.push(r.fullRatio);
      for(const s of r.sens){ shareBy[s.name].push(s.share); (labelBy[s.name] ||= []).push(parseFloat(s.label.slice(1))); }
    }
    NOISE[ex.name] = {};
    const line = (name, arr, truth, stepFn, unit = '') => {
      const s = sd(arr), step = stepFn(mean(arr)), bias = mean(arr) - truth;
      NOISE[ex.name][name] = {sd: s, step, ratio: s / step};
      console.log(`   info: ${ex.name.padEnd(20)} ${name.padEnd(10)} exact ${String(Number(truth.toPrecision(5))).padEnd(10)} mean ${String(Number(mean(arr).toPrecision(5))).padEnd(10)} sd ${String(Number(s.toPrecision(3))).padEnd(10)} step ${String(Number(step.toPrecision(2))).padEnd(8)} sd/step ${(s / step).toFixed(2)}${unit}`);
    };
    line('P10', rows.p10, clos(.1), fmtStep); line('P50', rows.p50, clos(.5), fmtStep); line('P90', rows.p90, clos(.9), fmtStep);
    line('spread', rows.spread, exFull, stepSig2);
    // sensitivity: top and every row (printed as whole % on the driver tree, and as "×x.y" pinned spread in the hint)
    for(const e of exact.slice().sort((a, b) => b.share - a.share)){
      line('share:' + e.name.slice(0, 9), shareBy[e.name], e.share, () => 0.01);
    }
    const topName = exact.slice().sort((a, b) => b.share - a.share)[0].name, ep = exact.find(e => e.name === topName);
    line('pinned x', labelBy[topName], ep.pinnedRatio, stepSig2);
    const worstP = ['P10', 'P50', 'P90'].map(k => NOISE[ex.name][k].ratio), sensR = Object.entries(NOISE[ex.name]).filter(([k]) => k.startsWith('share:')).map(([, v]) => v.ratio);
  // awaiting decision (tier 2a, FM-4: closed form or more precision)
    check(`NS1 ${ex.name}: P10/P50/P90 seed noise is smaller than the printed step (sd/step: ${worstP.map(x => x.toFixed(2)).join(' / ')})`, Math.max(...worstP) < 0.5, 'printed to 3 s.f.', {known: Math.max(...worstP) >= 0.5});
  // awaiting decision (tier 2a, FM-4)
    check(`NS2 ${ex.name}: spread "×x.y" noise smaller than printed step (sd/step ${NOISE[ex.name].spread.ratio.toFixed(2)})`, NOISE[ex.name].spread.ratio < 0.5, '', {known: NOISE[ex.name].spread.ratio >= 0.5});
  // awaiting decision (tier 2b, FM-5)
    check(`NS3 ${ex.name}: sensitivity shares (printed as whole % on the tree) noise smaller than 1 point (max sd ${(100 * Math.max(...sensR.map(r => r * 0.01))).toFixed(2)} points)`, Math.max(...sensR) < 0.5, '', {known: Math.max(...sensR) >= 0.5});
    check(`NS4 ${ex.name}: mean of 40 seeds matches the closed form within 1 % for P50 (the sampler is unbiased)`, rel(mean(rows.p50), clos(.5)) < 0.01);
  }
}

// ---------- 6b. where the noise comes from, and what removing it would do -----------------------
// Option A: closed form (every built-in example is a product/quotient of positive ranges = exactly lognormal): sd 0.
// Option B: Latin hypercube (stratified) draws at the same N: general formulas, no change of model.
function lhsRun(m, seed, n, pin = null){
  const r = rng(seed), cols = {};
  for(const name of m.varNames){
    const perm = Array.from({length: n}, (_, i) => i);
    for(let i = n - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const [lo, hi] = m.ranges[name];
    cols[name] = new Float64Array(n);
    for(let i = 0; i < n; i++){
      cols[name][i] = (pin && pin.name === name) ? pin.value : distQuantile(lo, hi, m.dists[name], (perm[i] + r()) / n);
    }
  }
  const out = []; const env = {};
  for(let i = 0; i < n; i++){ for(const name of m.varNames) env[name] = cols[name][i]; const v = evalNode(m.ast, env); if(isFinite(v)) out.push(v); }
  return Float64Array.from(out).sort();
}
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
function haltonRun(m, seed, n, pin = null){   // randomly shifted Halton sequence (Cranley-Patterson), one dimension per input
  const r = rng(seed), shift = m.varNames.map(() => r()), out = [], env = {};
  for(let i = 0; i < n; i++){
    m.varNames.forEach((name, d) => {
      if(pin && pin.name === name){ env[name] = pin.value; return; }
      let f = 1, x = 0, k = i + 1 + 100; const b = PRIMES[d];
      while(k > 0){ f /= b; x += f * (k % b); k = Math.floor(k / b); }
      const u = (x + shift[d]) % 1, [lo, hi] = m.ranges[name];
      env[name] = distQuantile(lo, hi, m.dists[name], Math.min(1 - 1e-12, Math.max(1e-12, u)));
    });
    const v = evalNode(m.ast, env); if(isFinite(v)) out.push(v);
  }
  return Float64Array.from(out).sort();
}
{
  console.log('   info: LHS (stratified) at the same N: seed-to-seed sd of P10/P50/P90 (and spread, top-driver share) versus plain Monte Carlo');
  const L = SEEDS.slice(0, 20);
  const summary = [];
  for(const ex of EXAMPLES){
    const m = exModel(ex);
    const a = {p10: [], p50: [], p90: [], spread: [], share: []};
    const topName = exactShares(m).sort((x, y) => y.share - x.share)[0].name;
    const medPin = distMedian(...m.ranges[topName], m.dists[topName]);
    for(const seed of L){
      const s = lhsRun(m, seed, 20000);
      const p10 = quantile(s, .1), p50 = quantile(s, .5), p90 = quantile(s, .9);
      a.p10.push(p10); a.p50.push(p50); a.p90.push(p90); a.spread.push(p90 / p10);
      const pn = lhsRun(m, seed + 7, 8000, {name: topName, value: medPin});
      a.share.push(1 - Math.log(quantile(pn, .9) / quantile(pn, .1)) / Math.log(p90 / p10));
    }
    const mc = NOISE[ex.name];
    const fmtRatio = (k, arr) => `${(sd(arr) / (mc[k].sd) * 100).toFixed(0)}%`;
    const exShare = exactShares(m).find(e => e.name === topName).share;
    console.log(`   info: ${ex.name.padEnd(20)} LHS sd as % of MC sd: P10 ${fmtRatio('P10', a.p10)}, P50 ${fmtRatio('P50', a.p50)}, P90 ${fmtRatio('P90', a.p90)}, spread ${fmtRatio('spread', a.spread)}; top share sd ${sd(a.share).toFixed(4)} (MC ${sd(a.share.map(x => x)).toFixed(4)} LHS-only; exact ${exShare.toFixed(4)}, mean LHS ${mean(a.share).toFixed(4)})`);
    summary.push({ex: ex.name, p50: sd(a.p50) / mc.P50.sd, p90: sd(a.p90) / mc.P90.sd, p10: sd(a.p10) / mc.P10.sd});
  }
  // randomly shifted Halton (quasi-Monte Carlo), same N
  const qm = [];
  for(const ex of EXAMPLES){
    const m = exModel(ex), a = {p10: [], p50: [], p90: [], spread: []}, mc = NOISE[ex.name];
    for(const seed of L){ const s = haltonRun(m, seed, 20000); const p10 = quantile(s, .1), p90 = quantile(s, .9); a.p10.push(p10); a.p50.push(quantile(s, .5)); a.p90.push(p90); a.spread.push(p90 / p10); }
    const row = {ex: ex.name, p10: sd(a.p10) / mc.P10.sd, p50: sd(a.p50) / mc.P50.sd, p90: sd(a.p90) / mc.P90.sd};
    qm.push(row);
    console.log(`   info: ${ex.name.padEnd(20)} shifted-Halton QMC sd as % of MC sd: P10 ${(100 * row.p10).toFixed(0)}%, P50 ${(100 * row.p50).toFixed(0)}%, P90 ${(100 * row.p90).toFixed(0)}%; sd/step now ${(row.p10 * mc.P10.ratio).toFixed(2)} / ${(row.p50 * mc.P50.ratio).toFixed(2)} / ${(row.p90 * mc.P90.ratio).toFixed(2)}`);
  }
  check('NS5 stratified (Latin hypercube) draws alone do NOT remove the printed-digit noise: they cut P10/P50/P90 sd by only 10-50 % (so stratification is not the fix)', summary.every(s => Math.max(s.p10, s.p50, s.p90) > 0.3));
  check('NS5b a randomly shifted quasi-random (Halton) sequence at the same N cuts P10/P50/P90 seed noise 1.9x to 6.7x (max ratio 0.54): better than LHS, still above the printed step for P10/P90 on 3 of 5 examples; only the closed form (NS6) is noise-free', qm.every(s => Math.max(s.p10, s.p50, s.p90) < 0.6), qm.map(s => `${s.ex}: ${s.p10.toFixed(2)}/${s.p50.toFixed(2)}/${s.p90.toFixed(2)}`).join('; '));
  // closed form: all five examples are exactly lognormal; the closed-form figure equals the 1M reference
  const exactOK = EXAMPLES.every(ex => { const m = exModel(ex); const o = simulateModel(m, {seed: 77, n: 1000000}).sorted;
    const S = Math.hypot(...sigmasOf(m)); const med = evalNode(m.ast, Object.fromEntries(m.varNames.map(n => [n, Math.sqrt(m.ranges[n][0] * m.ranges[n][1])])));
    return [.1, .5, .9].every(q => rel(qs(o, q), med * Math.exp(S * PhiInv(q))) < 0.006); });
  check('NS6 every built-in estimate example is exactly lognormal (all ranges positive, formula is a product/quotient): closed-form P10/P50/P90 equal a 1M-draw reference within 0.6 %', exactOK);
}

// ---------- 7. threshold probability P(>T): noise against its printed step ----------------------
{
  const m = exModel(EXAMPLES[0]);   // piano tuners
  const S = Math.hypot(...sigmasOf(m)), med = evalNode(m.ast, Object.fromEntries(m.varNames.map(n => [n, Math.sqrt(m.ranges[n][0] * m.ranges[n][1])])));
  const cases = [[.9, 'P(>T)=90%'], [.5, '50%'], [.1, '10%'], [.05, '5%'], [.02, '2%']];
  const bad = [];
  for(const [pt, label] of cases){
    const T = med * Math.exp(S * PhiInv(1 - pt)), ps = [];
    for(const seed of SEEDS){ const {sorted} = simulateModel(m, {seed, n: 20000}); let c = 0; for(const v of sorted) if(v > T) c++; ps.push(c / sorted.length); }
    const step = pt < 0.095 ? 0.001 : 0.01, s = sd(ps);
    console.log(`   info: piano P(>T) true ${label}: sd ${(100 * s).toFixed(3)} pts, printed step ${(100 * step).toFixed(1)} pts, mean ${(100 * mean(ps)).toFixed(2)} %`);
    if(s > step / 2) bad.push(`${label} sd ${(100 * s).toFixed(2)} vs step ${(100 * step).toFixed(1)}`);
  }
  // awaiting decision (tier 2a, FM-20: P(>T) precision)
  check('TH1 P(>T) shown to 0.1 point below 9.5 % and 1 point above: seed noise must be under half the printed step', bad.length === 0, bad.join('; '), {known: true});
  // format boundary of the percentage string
  const pctStr = p => p < 0.001 ? '<0.1%' : p > 0.999 ? '>99.9%' : (p * 100).toFixed(p < 0.095 ? 1 : 0) + '%';
  check('TH2 percentage formatter: 0.0949 -> 9.5%, 0.0951 -> 10%, 0.0005 -> <0.1%, 0.9995 -> >99.9%, 0.5 -> 50%', pctStr(0.0949) === '9.5%' && pctStr(0.0951) === '10%' && pctStr(0.0005) === '<0.1%' && pctStr(0.9995) === '>99.9%' && pctStr(.5) === '50%');
  // awaiting decision (tier 2a, FM-20)
  check('TH2b a probability of exactly 1 prints ">99.9%" (true value is 100 %)', pctStr(1) !== '>99.9%', pctStr(1), {known: true});
  // strictly-greater: a threshold equal to a constant output
  const mc = build('x', {x: [5, 5]}); const {sorted} = simulateModel(mc, {seed: 1, n: 100}); let c = 0; for(const v of sorted) if(v > 5) c++;
  check('TH3 P(>T) with T equal to the (constant) output is 0 % (strict >): consistent but no note that ties count against', c === 0);
}

// ---------- 8. histogram geometry ----------------------------------------------------------------
{
  const m = exModel(EXAMPLES[0]), r = pageRun(m), L = histLayout(r.sorted, {width: 600});
  const inRange = r.sorted.filter(v => v >= L.lo && v <= L.hi).length;
  const sum = L.bins.reduce((s, b) => s + b.count, 0);
  check('H1 bin counts sum to the in-range draws (histLayout.total)', sum === L.total && L.total === inRange, `${sum} of ${r.sorted.length}`);
  check('H1b the tooltip "x% of runs" is a share of ALL runs (bin.shareAll = count / 20000), not of the 99.4 % on the axis (FM-19)', Math.abs(L.bins.reduce((t, b) => t + b.shareAll, 0) - sum / r.sorted.length) < 1e-12 && L.bins.every(b => Math.abs(b.shareAll - b.count / r.sorted.length) < 1e-12));
  check('H2 axis ends are the 0.3 and 99.7 percentiles (labelled with fmt on the page); log axis only when lo>0 and hi/lo>30', L.useLog === (L.lo > 0 && L.hi / L.lo > 30) && Math.abs(L.lo - quantile(r.sorted, .003)) < 1e-9);
  // the marker sits in the bin whose edges contain the quantile
  const binOf = v => L.bins.findIndex(b => v >= b.v0 && v <= b.v1);
  const ok = [r.p10, r.p50, r.p90].every(q => { const b = binOf(q), x = L.px(q); return b >= 0 && x >= L.bins[b].x - 1e-6 && x <= L.bins[b].x + L.bins[b].w + 1e-6; });
  check('H3 P10/P50/P90 markers fall inside the bin whose value edges contain them (linear and log axis)', ok);
  // marker positions vs the sample: fraction of runs below each marker
  const frac = q => r.sorted.filter(v => v <= q).length / r.sorted.length;
  check('H4 the sample has 10 / 50 / 90 % of runs at or below the three markers (within 0.01 %)', Math.abs(frac(r.p10) - .1) < 1e-4 && Math.abs(frac(r.p50) - .5) < 1e-4 && Math.abs(frac(r.p90) - .9) < 1e-4);
  // the bar tint for "above threshold" uses the arithmetic midpoint of a bin even on a log axis
  const b = L.bins[20]; const arith = (b.v0 + b.v1) / 2, geo = Math.sqrt(b.v0 * b.v1);
  console.log(`   info: log axis bin 20: arithmetic midpoint ${arith.toFixed(2)} vs geometric ${geo.toFixed(2)}; click-to-set threshold uses the arithmetic one`);
}

// ---------- 9. page strings: transcribed from app.js (formulas copied; marked by name) -----------
const pageText = r => {          // renderResults(): the spread line, the hint and the headline, from the page's own pure helpers
  const ratio = (r.p10 > 0) ? r.p90 / r.p10 : NaN;
  const spread = isFinite(ratio) ? 'Spread: ×' + E.ratioStr(ratio) + ' (P90 / P10)' + (ratio > 10 ? ' — an order-of-magnitude answer, and that’s fine.' : '') : 'Spread: ' + fmt(r.p90 - r.p10) + ' (P90 − P10)';
  const fullLabel = isFinite(r.fullRatio) ? '×' + E.ratioStr(r.fullRatio) : fmt(r.p10) + ' – ' + fmt(r.p90);
  return {spread, hint: W.leverHint(r.sens, fullLabel), fullLabel, say: W.verdictSentence(fmt(r.p10), fmt(r.p50), fmt(r.p90), '')};
};
{
  const ex = EXAMPLES[3], r = pageRun(exModel(ex)), t = pageText(r);
  const printedExcess = parseFloat(t.spread.match(/×([\d.]+)/)[1]) - 1, trueExcess = r.fullRatio - 1;
  check('W1 Availability chain: the spread line (P90 / P10) must be within 20 % of the true excess over 1 (true x' + r.fullRatio.toFixed(3) + ')', Math.abs(printedExcess - trueExcess) / trueExcess < 0.2, `"${t.spread}": prints a ${(100 * printedExcess).toFixed(0)} % spread for a true ${(100 * trueExcess).toFixed(1)} %`);
  const pinnedLabel = parseFloat(r.sens[0].label.slice(1)), truePinned = exactShares(exModel(ex)).sort((a, b) => b.share - a.share)[0].pinnedRatio;
  check('W1b Availability chain: the hint "spread drops from x1.1 to x1" hides the 2.9 % that remains after pinning the top driver (label must carry the remaining spread)', Math.abs(pinnedLabel - truePinned) / (truePinned - 1) < 0.2, `"${t.hint}"; label ${r.sens[0].label}; exact pinned ratio ${truePinned.toFixed(3)}`);
  // general rule: sig(ratio,2) hides any spread under 5 %
  check('W1c the spread printer (ratioStr) of a ratio in (1, 1.05) prints the excess to two figures, never "1"; sig(r,2) alone would (FM-1)', E.ratioStr(1.049) === '1.049' && E.ratioStr(1.06) === '1.06' && sig(1.049, 2) === '1', E.ratioStr(1.049));
  check('W2 the headline says P10 to P90 holds four runs in five, not "surprised outside" (an 80 % interval; FM-2)', /four runs in five/.test(t.say) && !/surprised|90%/.test(t.say), `${t.say}`);
}

// ---------- 10. compare mode: P(B > A) ------------------------------------------------------------
{
  // A and B differ only by a constant factor 1.1; with common random numbers B exceeds A in 100 % of draws.
  const mA = build('x * y', {x: [10, 40], y: [2, 8]}), mB = build('x * y * 1.1', {x: [10, 40], y: [2, 8]});
  const A = simulateModel(mA, {seed: 0x5EED, n: 20000}).raw, B = simulateModel(mB, {seed: 0x0B5EED, n: 20000}).raw;
  let c = 0; for(let i = 0; i < 20000; i++) if(B[i] > A[i]) c++;
  const Bc = simulateModel(mB, {seed: 0x5EED, n: 20000}).raw; let cc = 0; for(let i = 0; i < 20000; i++) if(Bc[i] > A[i]) cc++;
  check('CP1 identical inputs, B = A x 1.1: the page prints "B exceeds A in" the independent-draw figure (~' + (100 * c / 20000).toFixed(0) + ' %); with shared inputs it is ' + (100 * cc / 20000).toFixed(0) + ' %', cc / 20000 === 1 && c / 20000 < 0.6,
    `independent ${(100 * c / 20000).toFixed(1)} % vs common-input ${(100 * cc / 20000).toFixed(1)} % (the page discloses "independently sampled inputs"; recorded as modelling question FM-Q2)`);
  // a model compared with itself
  const A2 = simulateModel(mA, {seed: 0x5EED, n: 20000}).raw, B2 = simulateModel(mA, {seed: 0x0B5EED, n: 20000}).raw; let c2 = 0; for(let i = 0; i < 20000; i++) if(B2[i] > A2[i]) c2++;
  check('CP2 a model compared with an identical copy of itself prints a figure within 1 point of 50 %', Math.abs(c2 / 20000 - .5) < 0.01, `${(100 * c2 / 20000).toFixed(2)} %`);
}

// ---------- 11. "What would have to be true" solver ----------------------------------------------
{
  const m = build('a * b', {a: [10, 40], b: [2, 8]});
  const seed = 0x5EED, base = quantile(simulateModel(m, {seed, n: 8000}).sorted, .5);
  const T = base * 2;
  const c = confess(m, {seed, target: T});
  const best = c.best;
  const re = r => quantile(simulateModel({...m, ranges: {...m.ranges, [best.varName]: r}}, {seed, n: 8000}).sorted, .5);
  check('SO1 solution plugs back in: a*b, T = 2 x P50. P50 with the returned range equals T within 0.01 %', rel(re(best.range), T) < 1e-4, `achieved ${re(best.range).toFixed(3)} target ${T.toFixed(3)}`);
  // closed form: multiplicative stretch of a by k gives P50 x k; ties between a and b (equal log-widths): which is chosen?
  check('SO1b a and b have the same log-width (4x), so a x2 stretch costs the same on either; both appear (best + alternate)', c.feasible && Math.abs(c.best.normCost - c.alternates[0].normCost) < 1e-3, `${c.best.varName} cost ${c.best.normCost.toFixed(4)}; alt ${c.alternates[0].varName} ${c.alternates[0].normCost.toFixed(4)}`);
  check('SO1c the stretch factor is exactly 2 (hand: P50 scales linearly with the stretched factor)', Math.abs(best.factor - 2) < 1e-3, String(best.factor));
  // Adopt writes the range through asciiNum (3 s.f.): re-simulate the ADOPTED values
  let worst = 0, worstCase = '';
  for(const [f, vars, mult] of [['a*b', {a: [10, 40], b: [2, 8]}, 1.37], ['a*b*c', {a: [3, 9], b: [1.5, 6], c: [20, 70]}, 1.9], ['a/b', {a: [100, 400], b: [3, 7]}, 1.23], ['a*b', {a: [10, 40], b: [2, 8]}, 0.61]]){
    const mm = build(f, vars), bs = quantile(simulateModel(mm, {seed, n: 8000}).sorted, .5), TT = bs * mult;
    const cc = confess(mm, {seed, target: TT}); if(!cc.best) continue;
    const ad = [parseNum(asciiNum(cc.best.range[0])), parseNum(asciiNum(cc.best.range[1]))];
    const p = quantile(simulateModel({...mm, ranges: {...mm.ranges, [cc.best.varName]: ad}}, {seed, n: 8000}).sorted, .5);
    if(rel(p, TT) > worst){ worst = rel(p, TT); worstCase = `${f} T=${fmt(TT)} adopts ${asciiNum(cc.best.range[0])}..${asciiNum(cc.best.range[1])} -> P50 ${fmt(p)}`; }
  }
  check('SO2 after Adopt (ranges rounded to 3 s.f. by asciiNum) the new P50 still equals the wished-for T within 0.3 %', worst < 0.003, `worst ${(100 * worst).toFixed(2)} % :: ${worstCase}`, {known: worst >= 0.003});
  // the "already at even odds" shortcut: |T - P50| / |P50| < 2 %
  const av = exModel(EXAMPLES[3]), r = pageRun(av, seed);
  const Tn = r.p50 * 1.019; let c2 = 0; for(const v of r.sorted) if(v > Tn) c2++;
  check('SO3 "You’re already at even odds for T" is said from P(>T) within 2 points of 50 %, never from T near P50: availability example, T = P50 x 1.019 has P(>T) of ' + (100 * c2 / r.sorted.length).toFixed(0) + ' % and is not even odds (FM-7)', W.evenOdds(r.sorted, Tn) === false && W.evenOdds(r.sorted, r.p50) === true, `P(>T) = ${(100 * c2 / r.sorted.length).toFixed(1)} %`);
  // monotonicity assumption: interior maximum
  const mi = build('x * (10 - x)', {x: [4, 9]});
  const bi = quantile(simulateModel(mi, {seed, n: 8000}).sorted, .5);
  const ci = confess(mi, {seed, target: 40});
  console.log(`   info: x*(10-x), x 4..9, base P50 ${fmt(bi)}, target 40 (max possible 25): confess -> feasible=${ci.feasible} best=${ci.best && ci.best.varName} pair=${ci.pair ? 'yes' : 'no'}`);
  check('SO4 an unreachable target (x*(10-x) can never exceed 25) is reported as not feasible', ci.feasible === false && !ci.best);
  const m3 = build('x * (10 - x)', {x: [4, 9]}), c3 = confess(m3, {seed, target: 20});
  const p3 = c3.best ? quantile(simulateModel({...m3, ranges: {x: c3.best.range}, dists: {x: c3.best.dist}}, {seed, n: 8000}).sorted, .5) : NaN;
  console.log(`   info: x*(10-x), x 4..9 target 20: best ${c3.best && c3.best.varName} range ${c3.best && c3.best.range.map(v => v.toFixed(2))}, achieved ${p3}`);
  // nothing plausible depends on the arbitrary cap of 3 half-widths
  const mn = build('a * b', {a: [10, 40], b: [2, 8]}); const far = confess(mn, {seed, target: base * 80});
  const far2 = confess(mn, {seed, target: base * 80, cap: 4});
  check('SO5 "Nothing plausible" is the 3-half-width cap (a x80 target is called implausible at cap 3 and feasible at cap 4: the cap is a constant, not a judgement the page states)', !far.feasible && far2.feasible === true, `cap3 feasible=${far.feasible}, cap4 feasible=${far2.feasible}`);
  // reversed range with a negative lower bound: must solve exactly as the same range typed low-to-high
  const mr = build('a * b', {a: [5, -3], b: [2, 8]}), mf = build('a * b', {a: [-3, 5], b: [2, 8]});
  const tr = quantile(simulateModel(mf, {seed, n: 8000}).sorted, .5) + 30;
  const cr = confess(mr, {seed, target: tr}), cf_ = confess(mf, {seed, target: tr});
  check('SO6 the same range typed high-to-low (5 to -3) across zero solves as it does typed low-to-high (-3 to 5): reversed gives ' + (cr.feasible ? 'feasible' : '"nothing plausible"') + ', forward gives ' + (cf_.feasible ? 'feasible (' + cf_.best.varName + ')' : 'infeasible'),
    cr.feasible === cf_.feasible, `reversed: feasible=${cr.feasible} best=${cr.best && cr.best.varName}; forward: feasible=${cf_.feasible} best=${cf_.best && cf_.best.varName} range ${cf_.best && cf_.best.range.map(v => v.toFixed(2))} (the solver now reads every range low-to-high, FM-10)`, {known: cr.feasible !== cf_.feasible});
  // stretch label rounding
  const lbl = W.stretchLabel;
  check('SO7 a small stretch (factor 1.04) is labelled "×1.04 stretch", not "×1.0"; a compression to 0.04 is "×0.04 shrink", not "×0.0 stretch" (FM-11)', lbl({kind: 'mult', factor: 1.04}) === '×1.04 stretch' && lbl({kind: 'mult', factor: 0.04}) === '×0.04 shrink', `${lbl({kind: 'mult', factor: 1.04})} / ${lbl({kind: 'mult', factor: 0.04})}`);
}

// ---------- 12. words vs numbers: sensitivity hint, driver tree, pour verdict --------------------
{
  const mism = [];
  for(const ex of EXAMPLES){
    const m = exModel(ex), r = pageRun(m);
    const trace = traceDraws(m, {seed: 0x5EED, g: 500, order: r.sens.map(s => s.name)});
    const layout = histLayout(r.sorted, {width: 600});
    const v = pourVerdict(trace, layout, {names: Object.fromEntries(m.varNames.map(n => [n, n]))});
    const hintSaysDominant = r.sens[0].share > 0.35, pourSaysDominant = !!v.topName;
    console.log(`   info: ${ex.name}: hint ${hintSaysDominant ? 'names ' + r.sens[0].name : 'no single input dominates'} (top share ${(100 * r.sens[0].share).toFixed(0)} %); pour verdict: "${v.text}"`);
    if(hintSaysDominant !== pourSaysDominant || (pourSaysDominant && v.topName !== r.sens[0].name)) mism.push(ex.name);
  }
  // awaiting decision (tier 2b, FM-8: one measure for "dominates")
  check('WD1 the sensitivity hint (share > 0.35) and the pour verdict (variance gain gap > 0.15) agree on whether one input dominates, and on which', mism.length === 0, mism.join(', '), {known: mism.length > 0});
  // driver tree: variable used twice shows its share twice
  const mt = build('x * x * y', {x: [10, 40], y: [2, 8]}), rt = pageRun(mt);
  const colors = {card: '#fff', border: '#ccc', ink: '#000', muted: '#666', accent: '#06f', err: '#f00'};
  const svg = renderDriverTree({...mt, ...rt, bases: {}}, {colors, measure: s => s.length * 6});
  const pcts = [...svg.matchAll(/>(\d+)%</g)].map(x => +x[1]);
  check('WD2 driver tree with a variable used twice (x*x*y): the leaf edges print shares that sum to 100 % or less', pcts.reduce((a, b) => a + b, 0) <= 100, `edge labels ${pcts.join('%, ')}% (x appears as two leaves, each carrying x's full share)`);
  // tree headline and sens hint use the same threshold
  check('WD3 tree headline threshold (top.share > 0.35) equals the page hint threshold', /Research|No single input/.test(svg));
}

// =============================================================================================
// 13. CASH FLOW
// =============================================================================================
const npvOf = (flows, r) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
function refIRR(flows){   // returns {root, changes}; bisection on a wider bracket than the engine's, 200 steps
  let changes = 0, prev = 0; for(const f of flows){ const sg = Math.sign(f); if(sg !== 0){ if(prev !== 0 && sg !== prev) changes++; prev = sg; } }
  let lo = -0.999999, hi = 1e5, flo = npvOf(flows, lo), fhi = npvOf(flows, hi);
  if(!(flo * fhi < 0)) return {root: null, changes};
  for(let i = 0; i < 200; i++){ const m = (lo + hi) / 2, fm = npvOf(flows, m); if(flo * fm <= 0){ hi = m; fhi = fm; } else { lo = m; flo = fm; } }
  return {root: (lo + hi) / 2, changes};
}
const cfRun = (spec, o = {}) => simulateCashflow(spec, {seed: 0xCA5F, n: 10000, ...o});
{
  // ---- hand case: -100, +60, +60 at 10 % ----
  const spec = {periods: [fixed(-100), fixed(60), fixed(60)], horizon: 2, grain: 'year', rate: fixed(10)}, r = cfRun(spec, {n: 200});
  const npvHand = -100 + 60 / 1.1 + 60 / 1.21;
  check('CF1 NPV of -100,+60,+60 at 10 % = 4.1322 (end-of-period discounting, t0 undiscounted)', Math.abs(r.npv.p50 - npvHand) < 1e-9, `${r.npv.p50} vs ${npvHand}`);
  // IRR: 60/(1+r)+60/(1+r)^2=100 -> x=1/(1+r): 60x^2+60x-100=0 -> x=(-60+sqrt(3600+24000))/120
  const x = (-60 + Math.sqrt(3600 + 24000)) / 120, irrHand = 1 / x - 1;
  check('CF1b IRR of -100,+60,+60 = ' + irrHand.toFixed(6) + ' (quadratic solved by hand)', Math.abs(r.irr.p50 - irrHand) < 1e-12, String(r.irr.p50));
  check('CF1c payback = year 2 (cumulative -40 then +20), undiscounted; P(NPV>0) = 100 %', r.period.p50 === 2 && r.npv.pPos === 1 && r.period.kind === 'payback');
  check('CF1d fan band is the undiscounted cumulative: -100, -40, +20', r.band[0].p50 === -100 && r.band[1].p50 === -40 && r.band[2].p50 === 20);
  // discounted payback would be later: cum PV = -100, -45.45, 4.13 -> also year 2; use a case where they differ
  const r2 = cfRun({periods: [fixed(-100), fixed(55), fixed(55)], horizon: 2, grain: 'year', rate: fixed(30)}, {n: 50});
  check('CF1e payback is undiscounted: -100,+55,+55 at 30 % pays back in year 2 undiscounted although NPV is negative (' + r2.npv.p50.toFixed(2) + '); the verdict line shows both', r2.period.p50 === 2 && r2.npv.p50 < 0);
  // month grain: flows are monthly, rate is per year converted by (1+r)^(1/12)-1; IRR annualised
  const sm = {periods: [fixed(-100), fixed(60), fixed(60)], horizon: 2, grain: 'month', rate: fixed(12)}, rm = cfRun(sm, {n: 50});
  const pm = Math.pow(1.12, 1 / 12) - 1, npvM = -100 + 60 / (1 + pm) + 60 / (1 + pm) ** 2;
  check('CF2 month grain: NPV uses the monthly equivalent of the annual rate; IRR is annualised as (1+m)^12-1', Math.abs(rm.npv.p50 - npvM) < 1e-9 && Math.abs(rm.irr.p50 - (Math.pow(1 + irrHand, 12) - 1)) < 1e-9, `${rm.npv.p50} vs ${npvM}`);
  // horizon beyond entered periods repeats the last range, resampled
  const rh = cfRun({periods: [fixed(-100), fixed(30)], horizon: 5, grain: 'year', rate: fixed(0)}, {n: 20});
  check('CF3 periods beyond the last entered row repeat its range (t1..t5 = +30): cumulative at t5 = +50', rh.band[5].p50 === 50 && rh.horizon === 5);
  check('CF3b horizon smaller than the entered periods is raised to cover them; horizon 0 falls back to periods-1', cfRun({periods: [fixed(-1), fixed(1), fixed(1), fixed(1)], horizon: 1, grain: 'year', rate: fixed(0)}, {n: 5}).horizon === 3 && cfRun({periods: [fixed(-1), fixed(1)], horizon: 0, grain: 'year', rate: fixed(0)}, {n: 5}).horizon === 1);
  // ---- IRR edge cases (irrOf) ----
  check('CF4 IRR: no sign change (all positive / all negative) is undefined (null)', irrOf([10, 20, 30], 2) === null && irrOf([-10, -20, -30], 2) === null);
  check('CF4b IRR of a first-year inflow then outflow (+100, -110) is +10 % (a cost of money; one sign change)', Math.abs(irrOf([100, -110], 1) - 0.10) < 1e-9, String(irrOf([100, -110], 1)));
  // two real roots: -100, +230, -132 has IRR 10 % and 20 % (NPV(10 %) = NPV(20 %) = 0 by hand)
  { const f = [-100, 230, -132], got = irrOf(f, 2);
    check('CF4c IRR of -100,+230,-132 (NPV is zero at 10 % and at 20 %: two real roots) is undefined by ruling: NPV changes sign twice, so there is no single IRR (FM-23)', got === null, `engine returns ${got}`);
    const g = [-1000, 3000, -2200, 300], got2 = irrOf(g, 3);
    check('CF4c2 IRR of -1000,+3000,-2200,+300 has three real roots (-82 %, -12.8 %, +95.1 %): the engine reports none rather than one of them (FM-23)', got2 === null, `engine ${got2}, ${refIRR(g).changes} sign changes`); }
  { const got = irrOf([-1, 200], 1);
    check('CF4d IRR above 1000 % (-1 then +200 = 19,900 %) is found, not undefined (window now to +100,000 %)', got !== null, `engine: ${got}`); }
  { const got = irrOf([-100, 0.5], 1);
    check('CF4e IRR below -99 % (-100 then +0.5 = -99.5 %) is found, not undefined (window now from -99.9 %)', got !== null, `engine: ${got}`); }
  check('CF4f IRR agrees with an independent root finder on 2000 random single-sign-change vectors (rel 1e-9)', (() => {
    const u = rng(5); let worst = 0;
    for(let k = 0; k < 2000; k++){ const n = 3 + Math.floor(u() * 6); const f = [-(50 + 100 * u())]; for(let i = 1; i < n; i++) f.push(5 + 60 * u()); const a = irrOf(f, n - 1), b = refIRR(f).root; if(b === null || a === null) continue; worst = Math.max(worst, Math.abs(a - b)); } return worst < 1e-9; })());
  // ---- closed form: one lognormal period, fixed rate ----
  { const N = 1000000, sp = {periods: [fixed(-100), R(50, 200)], horizon: 1, grain: 'year', rate: fixed(10)}, r = cfRun(sp, {n: N});
    const {mu, s} = LN(50, 200), hand = q => -100 + Math.exp(mu + s * PhiInv(q)) / 1.1;
    const errs = [.1, .5, .9].map(q => Math.abs(quantile(r.npvSorted, q) - hand(q)));
    check('CF5 NPV = -100 + X/1.1 with X lognormal(50..200): P10/P50/P90 within 0.4 of closed form at 1M draws (3.5 standard errors)', Math.max(...errs) < 0.4, errs.map(e => e.toFixed(3)).join(' ')); }
  // ---- sum of independent normals: cumulative band ----
  { const sp = {periods: [R(-250, -180), R(-40, 20), R(-30, 90)], horizon: 2, grain: 'year', rate: fixed(0)}, r = cfRun(sp, {n: 400000});
    const sd2 = Math.hypot(70, 60, 120) / (2 * Z95), mu2 = -215 - 10 + 30;
    check('CF5b cumulative band at t2 = normal(sum of means, hypot of sds): P10/P90 within 0.4 of closed form', Math.abs(r.band[2].p10 - (mu2 - Z90q * sd2)) < 0.4 && Math.abs(r.band[2].p90 - (mu2 + Z90q * sd2)) < 0.4, `${r.band[2].p10.toFixed(2)} ${r.band[2].p90.toFixed(2)} vs ${(mu2 - Z90q * sd2).toFixed(2)} ${(mu2 + Z90q * sd2).toFixed(2)}`); }
  // ---- built-in cash-flow examples vs an independent 1M-style reference ----
  function refCash(spec, n, seed){
    const g = normalGen(seed), W = spec.horizon + 1, out = {npv: new Float64Array(n), irr: [], ev: [], undefIrr: 0, never: 0, multi: 0};
    const draw = p => { const lo = p.lo, hi = p.hi; if(lo === hi) return lo; if(lo > 0){ const m = LN(lo, hi); return Math.exp(m.mu + m.s * g()); } return (lo + hi) / 2 + (hi - lo) / (2 * Z95) * g(); };
    const runway = (spec.periods[0].lo + spec.periods[0].hi) / 2 > 0 && spec.periods.slice(1).concat(Array(W).fill(spec.periods[spec.periods.length - 1])).slice(0, spec.horizon).reduce((s, p) => s + (p.lo + p.hi) / 2, 0) < 0;
    for(let i = 0; i < n; i++){
      const rate = (spec.rate.lo + spec.rate.hi) / 200 + ((spec.rate.hi - spec.rate.lo) / 100 / (2 * Z95)) * (spec.rate.hi > spec.rate.lo ? g() : 0);
      const per = spec.grain === 'month' ? Math.pow(1 + rate, 1 / 12) - 1 : rate;
      const f = []; let cum = 0, ev = -1;
      for(let t = 0; t < W; t++){ const v = draw(spec.periods[Math.min(t, spec.periods.length - 1)]); f.push(v); cum += v;
        if(ev < 0 && ((!runway && t > 0 && cum >= 0) || (runway && cum < 0))) ev = t; }
      out.npv[i] = npvOf(f, per);
      if(ev >= 0) out.ev.push(ev); else out.never++;
      const ir = refIRR(f); if(ir.root === null) out.undefIrr++; else { if(ir.changes > 1) out.multi++; out.irr.push(spec.grain === 'month' ? Math.pow(1 + ir.root, 12) - 1 : ir.root); }
    }
    out.npv.sort(); out.irr.sort((a, b) => a - b); out.ev.sort((a, b) => a - b); return out;
  }
  const inv = refCash(CF_EX.invest, 200000, 21), eng = cfRun(CF_EX.invest, {n: 200000});
  const qa = (a, p) => quantile(a, p);
  console.log(`   info: invest example, reference (own generator, 200k) vs engine (200k): NPV P10/P50/P90 ${[.1, .5, .9].map(q => fmt(qa(inv.npv, q))).join(' / ')} vs ${[.1, .5, .9].map(q => fmt(quantile(eng.npvSorted, q))).join(' / ')}; IRR P50 ${(100 * qa(inv.irr, .5)).toFixed(2)} % vs ${(100 * eng.irr.p50).toFixed(2)} %; payback P50 ${qa(inv.ev, .5)} vs ${eng.period.p50}; IRR undefined ${(100 * inv.undefIrr / 200000).toFixed(2)} % vs ${(100 * eng.irr.undefinedShare).toFixed(2)} %; trials with several sign changes ${(100 * inv.multi / 200000).toFixed(1)} %`);
  check('CF6 invest example: engine NPV P10/P50/P90 equal the independent reference within 1.5 % (200k each)', [.1, .5, .9].every(q => rel(quantile(eng.npvSorted, q), qa(inv.npv, q)) < 0.015), '');
  check('CF6b invest example: P(NPV>0) and IRR P50 equal the reference within 0.7 point', Math.abs(eng.npv.pPos - inv.npv.filter(v => v > 0).length / 200000) < 0.007 && Math.abs(eng.irr.p50 - qa(inv.irr, .5)) < 0.007);
  check('CF6c invest example: no trial has several sign changes in its flows, so the one-root IRR is unambiguous here', inv.multi === 0, `${(100 * inv.multi / 200000).toFixed(1)} % of trials have several sign changes; the engine reports one root for them`, {known: inv.multi > 0});
  const rwy = refCash(CF_EX.runway, 20000, 22), engR = cfRun(CF_EX.runway, {n: 20000});
  check('CF7 runway example: cash-out month P10/P50/P90 equal the reference (own generator) within 0.5 month, never-share equal', Math.abs(engR.period.p50 - qa(rwy.ev, .5)) < 0.5 && Math.abs(engR.period.p10 - qa(rwy.ev, .1)) < 0.5 && Math.abs(engR.period.neverShare - rwy.never / 20000) < 0.01, `engine ${engR.period.p10}/${engR.period.p50}/${engR.period.p90} vs ref ${qa(rwy.ev, .1)}/${qa(rwy.ev, .5)}/${qa(rwy.ev, .9)}; never ${engR.period.neverShare}`);
}

// ---------- 14. cash-flow wording ------------------------------------------------------------------
{
  const eng = cfRun(CF_EX.invest), v = verdictLines(eng);
  console.log(`   info: invest verdict head: ${v.head}\n   info: invest verdict sub : ${v.sub}`);
  check('CW1 the NPV verdict calls P10..P90 the "80% range" (the fraction of runs inside P10..P90 is 80 %; FM-2)', !/90% range/.test(v.head) && /80% range/.test(v.head), v.head);
  // the Markdown for the estimate page: 'P50 ≈ x · 90% range p10 – p90' (copydoc in app.js) is the same mislabel
  const appSrc = (await import('node:fs')).readFileSync(new URL('../../../fermi/app.js', import.meta.url), 'utf8');
  check('CW1b the estimate "Copy as markdown" line labels P10 – P90 "80% range" (source test on app.js: the interval holds 80 % of runs)', !/90% range ' \+ fmt\(last\.p10\)/.test(appSrc) && /80% range ' \+ fmt\(last\.p10\)/.test(appSrc), 'app.js copydoc head');
  // whole-percent rounding of probabilities
  const fake = {...eng, npv: {...eng.npv, pPos: 0.9962}, irr: {...eng.irr, undefinedShare: 0.004}, period: {...eng.period, neverShare: 0.003, p50: 4}};
  const vf = verdictLines(fake);
  check('CW2 P(NPV > 0) of 99.62 % must not print as "100%"; a 0.3 % never-pays-back share must not print "never in 0%"', !/P\(NPV > 0\) 100%/.test(vf.sub) && !/never in 0%/.test(vf.sub) && !/undefined in 0%/.test(vf.sub), vf.sub);
  // same quantity, different precision: unlevered IRR P50 in the headline vs in the financing card
  const g = cfRun(CF_EX.geared), vg = verdictLines(g), fv = financeVerdict(g.debt);
  console.log(`   info: geared verdict sub: ${vg.sub}\n   info: geared finance head: ${fv.head}`);
  const a = /IRR P50 ([\d.]+)%/.exec(vg.sub)[1], b = /IRR [^→]*?([\d.]+)% →/.exec(fv.head);
  check('CW3 the unlevered IRR P50 prints at the same precision in the cash-flow verdict and the financing verdict (whole % vs one decimal)', !!b && b[1].includes('.') === a.includes('.'), `verdict "IRR P50 ${a}%" vs financing "${b && b[1]}%" for the same number ${(100 * g.irr.p50).toFixed(3)} %`);
  // fractional period words: event quantiles are interpolated between integer periods
  let frac = null;
  for(let k = 40; k <= 90 && !frac; k += 2){ const rr = cfRun({periods: [fixed(-100), R(k * .5, k * 1.5)], horizon: 4, grain: 'year', rate: fixed(8)}, {n: 4000}); if(rr.period.p50 !== null && !Number.isInteger(rr.period.p50)) frac = {k, rr}; }
  check('CW4 (not reproduced) payback is only observed at whole periods, so "payback P50" must be a whole period; a real run (-100 then flows of ' + (frac ? frac.k * .5 + '..' + frac.k * 1.5 : '?') + ') prints a fractional one', !frac, frac ? `${verdictLines(frac.rr).sub} (events are integers; quantile() interpolates between them)` : 'no fractional case found', {known: !!frac});
  const ev = eng.period; console.log(`   info: invest payback P10/P50/P90 = ${ev.p10}/${ev.p50}/${ev.p90}, never ${ev.neverShare}`);
  // the NPV verdict label: P10/P90 of NPV are not the same interval as the "90% range per period" the user typed
}
{
  // runway: the head quotes quantiles of cash-out time among runs that cash out
  const spec = {periods: [fixed(98), R(-3.4, -1.6)], horizon: 40, grain: 'year', rate: fixed(0)};
  const r = cfRun(spec, {n: 40000});
  const unc = x => { // true share of ALL runs with cash-out at or before period x: reconstruct from a fresh run
    return null; };
  // reconstruct per-run events by re-simulating with an own loop at the same distribution
  const g = normalGen(33), ev = []; let never = 0, n = 40000;
  for(let i = 0; i < n; i++){ let cum = 98, e = -1; for(let t = 1; t <= 40; t++){ cum += -2.5 + (3.4 - 1.6) / (2 * Z95) * g(); if(cum < 0){ e = t; break; } } if(e < 0) never++; else ev.push(e); }
  const vh = verdictLines(r);
  const sharePre = ev.filter(e => e <= r.period.p50).length / n;
  console.log(`   info: runway-style case: never-share ${(100 * r.period.neverShare).toFixed(0)} %, head: ${vh.head}`);
  check('RW1 "Cash lasts until year X (P50)" must mean half of ALL runs have cashed out by X; the quantile is taken only over runs that cash out (never-share ' + (100 * r.period.neverShare).toFixed(0) + ' %)', sharePre >= 0.5 - 0.01 && ev.filter(e => e <= r.period.p50 - 1).length / n < 0.5 + 0.01, `share of all runs cashed out by P50 (year ${r.period.p50}) = ${(100 * sharePre).toFixed(0)} %, by the year before ${(100 * ev.filter(e => e <= r.period.p50 - 1).length / n).toFixed(0)} % (FM-3: over all runs, a never-run beyond the horizon)`);
  check('RW1b the "10% chance of cash-out before P10" clause is likewise a conditional 10 %', ev.filter(e => e <= r.period.p10).length / n >= 0.1 - 0.01 && ev.filter(e => e < r.period.p10).length / n <= 0.1 + 0.01, `share of ALL runs cashed out by year ${r.period.p10}: ${(100 * ev.filter(e => e <= r.period.p10).length / n).toFixed(1)} %, strictly before it ${(100 * ev.filter(e => e < r.period.p10).length / n).toFixed(1)} % (times are whole periods, so the 10 % mark falls on a year)`);
  // framing edge: a project that starts with income is "invest" and its payback is year 1
  const pos = cfRun({periods: [fixed(100), fixed(50)], horizon: 3, grain: 'year', rate: fixed(5)}, {n: 20});
  check('CW5 an all-positive cash flow (+100 then +50) has no investment to pay back; the page must not print "payback P50 year 1"', pos.outlay === false && !/payback P50|IRR P50|never pays back/.test(verdictLines(pos).sub) && /no outlay/.test(verdictLines(pos).sub), `framing ${pos.framing}, ${verdictLines(pos).sub} (FM-24)`);
  // discounting convention disclosure
  const html = (await import('node:fs')).readFileSync(new URL('../../../fermi/index.html', import.meta.url), 'utf8');
  check('CW6 the page states when cash arrives within a period (end-of-period discounting; t0 undiscounted)', /end of (the |each )?(period|year)|end-of-period|mid-?year|undiscounted t0|t0 is not discounted/i.test(html), 'index.html: flows at period end, t0 not discounted (FM-25)');
  check('CW6b the cash-flow "Method" line says "Log-normal fit per period range" although ranges that touch or sit below zero are normal (both investment rows of the first example)', !/Log-normal fit per period range/.test(html), 'index.html Method line');
}

// ---------- 15. independence across periods (modelling question) ---------------------------------
{
  const spec = CF_EX.invest;
  // comonotone reading: one quantile u shared by all periods in a trial
  const g = normalGen(9), n = 100000, W = 6, npvI = [], npvC = [];
  const mk = (p, z) => p.lo === p.hi ? p.lo : (p.lo > 0 ? Math.exp(LN(p.lo, p.hi).mu + LN(p.lo, p.hi).s * z) : (p.lo + p.hi) / 2 + (p.hi - p.lo) / (2 * Z95) * z);
  for(let i = 0; i < n; i++){
    const rate = 0.10; const fi = [], fc = []; const zc = g();
    for(let t = 0; t < W; t++){ const p = spec.periods[Math.min(t, 3)]; fi.push(mk(p, g())); fc.push(mk(p, zc)); }
    npvI.push(npvOf(fi, rate)); npvC.push(npvOf(fc, rate));
  }
  npvI.sort((a, b) => a - b); npvC.sort((a, b) => a - b);
  const w = a => quantile(a, .9) - quantile(a, .1);
  console.log(`   info: invest example NPV P10..P90 width: independent periods ${fmt(w(npvI))}, fully correlated periods ${fmt(w(npvC))} (x${(w(npvC) / w(npvI)).toFixed(1)}); P(NPV>0) ${(100 * npvI.filter(v => v > 0).length / n).toFixed(0)} % vs ${(100 * npvC.filter(v => v > 0).length / n).toFixed(0)} %`);
  check('MQ1 recorded: periods are sampled independently (a modelling choice, stated on the page only inside the financing card); correlated periods widen the invest example NPV band', w(npvC) > w(npvI) * 1.3, `widths ${fmt(w(npvI))} vs ${fmt(w(npvC))}`);
}

// =============================================================================================
// 16. DEBT SIZING AND LEVERED RETURNS
// =============================================================================================
{
  // ---- hand case. t0 -1000 fixed, t1..t5 +400 fixed; DSCR 1.8, cost of debt 8 %, horizon 5 ----
  const base = {periods: [fixed(-1000), fixed(400)], horizon: 5, grain: 'year', rate: fixed(10)};
  const r = cfRun({...base, debt: {dscr: 1.8, costOfDebt: 0.08, sizingCase: 'central'}}, {n: 50}), d = r.debt;
  const ds = 400 / 1.8; let D = 0; for(let k = 0; k < 5; k++) D += ds / Math.pow(1.08, k);
  check('DB1 sculpted debt: DS = 400/1.8 for t1..t5, D = PV at COD of the service = ' + D.toFixed(4) + ' (hand)', d.ok && Math.abs(d.D - D) < 1e-9 && d.tStar === 1 && d.tenor === 5, `D ${d.D} tStar ${d.tStar} tenor ${d.tenor}`);
  const Dd = D / 1.08;
  check('DB1b the draw at t0 is D / (1+rd)^1 (capitalised interest over the one pre-COD period), so the lender IRR equals the cost of debt', Math.abs(d.D_drawn - Dd) < 1e-9);
  // lender IRR from the frozen schedule
  const lender = [-d.D_drawn, ...Array(5).fill(ds)];
  check('DB1c lender IRR of the frozen schedule = cost of debt (8 %)', Math.abs(irrOf(lender, 5) - 0.08) < 1e-9, String(irrOf(lender, 5)));
  const eq = [-1000 + Dd, ...Array(5).fill(400 - ds)];
  const eqIrr = refIRR(eq).root;
  check('DB1d levered IRR from the engine = IRR of the equity flows worked by hand (' + (100 * eqIrr).toFixed(3) + ' %)', Math.abs(d.levIrr.p50 - eqIrr) < 1e-9, String(d.levIrr.p50));
  check('DB1e gearing = D / peak funding = ' + (100 * D / 1000).toFixed(2) + ' %', Math.abs(d.gearingPct - D / 1000) < 1e-9);
  check('DB1f equity NPV at 10 % = NPV of the equity flows (hand)', Math.abs(d.eqNpv.p50 - npvOf(eq, 0.10)) < 1e-9, `${d.eqNpv.p50} vs ${npvOf(eq, .1)}`);
  check('DB1g central-case sizing off a deterministic cash flow: cover equals the target (1.8x) in every operating year, so no operating-year is "under cover"', d.coverShortfall === 0 && Math.abs(d.minDscr.p50 - 1.8) < 1e-12, `coverShortfall ${d.coverShortfall}, minDscr ${d.minDscr.p50}`, {known: d.coverShortfall !== 0});
  // capped case: DSCR 1.25 => D > 1000
  const rc = cfRun({...base, debt: {dscr: 1.25, costOfDebt: 0.08, sizingCase: 'central'}}, {n: 50}), dc = rc.debt;
  check('DB2 gearing cap: D is limited to 100 % of peak funding and the service is scaled by the same factor', dc.capped && Math.abs(dc.D - 1000) < 1e-9 && Math.abs(dc.dsByT === undefined ? 0 : 0) === 0);
  const fvc = financeVerdict(dc);
  check('DB2b the capped-gearing sentence says what the figure is (debt at completion, interest during construction included) and no longer calls the build fully debt-funded: cash actually drawn is D / (1+rd) = ' + dc.D_drawn.toFixed(1) + ' of the 1000 build (FM-26)', /debt at completion/i.test(fvc.sub) && /interest during construction/i.test(fvc.sub) && !/100% of build/.test(fvc.sub) && Math.abs(dc.D_drawn - 1000) > 1, fvc.sub);
  // zero-debt limit: huge DSCR => debt tiny => levered ~ unlevered
  const rz = cfRun({periods: [R(-7.2e6, -6.8e6), ...Array(10).fill(R(880e3, 1.35e6))], horizon: 10, grain: 'year', rate: R(9, 11), debt: {dscr: 1e9, costOfDebt: 0.065, sizingCase: 'central'}}, {n: 4000});
  check('DB3 zero-debt limit (DSCR 1e9): levered IRR P50 and equity NPV P50 equal the unlevered figures (within 1e-4 and 0.01 %)', Math.abs(rz.debt.levIrr.p50 - rz.irr.p50) < 1e-4 && rel(rz.debt.eqNpv.p50, rz.npv.p50) < 1e-4, `${rz.debt.levIrr.p50} vs ${rz.irr.p50}; ${rz.debt.eqNpv.p50} vs ${rz.npv.p50}`);
  // month grain: lender IRR equals the cost of debt on the (annual->monthly) basis
  const sm = sizeDebt({periods: [R(-500, -500), R(-500, -500), R(100, 100)], horizon: 24, grain: 'month', dscr: 1.5, costOfDebt: 0.06, sizingCase: 'central'});
  const lf = []; for(let t = 0; t <= 24; t++) lf.push(-sm.drawByT[t] + sm.dsByT[t]);
  const pm = Math.pow(1.06, 1 / 12) - 1, lirr = refIRR(lf).root;
  check('DB4 month grain with two pre-COD periods: lender IRR (monthly) equals (1.06)^(1/12)-1', sm.ok && Math.abs(lirr - pm) < 1e-9, `${lirr} vs ${pm}`);
  // downside sizing uses the independent-periods P10 of each period, not the P10 of the sum
  const sd_ = sizeDebt({periods: [fixed(-1000), R(300, 500)], horizon: 5, grain: 'year', dscr: 1.8, costOfDebt: 0.08, sizingCase: 'downside'});
  const p10 = Math.exp(LN(300, 500).mu + LN(300, 500).s * -Z90q);
  check('DB5 downside sizing: debt service per period = P10 of that period / DSCR (hand ' + (p10 / 1.8).toFixed(2) + ')', Math.abs(sd_.dsByT[1] - p10 / 1.8) < 1e-3, `${sd_.dsByT[1]}`);
  // validity gates
  check('DB6 sizing gates: dscr <= 0, cost of debt <= -100 %, no construction spend, no operating periods are refused with a reason', !sizeDebt({periods: [fixed(-1), fixed(1)], horizon: 2, dscr: 0, costOfDebt: .05}).ok && !sizeDebt({periods: [fixed(-1), fixed(1)], horizon: 2, dscr: 1.3, costOfDebt: -1}).ok && !sizeDebt({periods: [fixed(5), fixed(1)], horizon: 2, dscr: 1.3, costOfDebt: .05}).ok && !sizeDebt({periods: [fixed(-1), fixed(-1)], horizon: 1, dscr: 1.3, costOfDebt: .05}).ok);
  // tenor handling
  const st = sizeDebt({periods: [fixed(-1000), fixed(400)], horizon: 5, dscr: 1.8, costOfDebt: .08, tenor: 99});
  check('DB7 a tenor longer than the operating life is clamped and flagged (tenorClamped)', st.tenor === 5 && st.tenorClamped === true);
  // example: geared. independent sizing by hand
  const gp = CF_EX.geared.periods, med = p => Math.sqrt(p.lo * p.hi);
  let Dh = 0; for(let k = 0; k < 9; k++) Dh += (med(gp[1]) / 1.45) / Math.pow(1.065, k);
  const ge = cfRun(CF_EX.geared, {n: 10000}).debt;
  check('DB8 geared example: senior debt = sum over 9 years of median/1.45 discounted at 6.5 % from COD = ' + fmt(Dh) + ' (hand, using the lognormal median sqrt(lo*hi)); engine ' + fmt(ge.D), Math.abs(ge.D - Dh) / Dh < 1e-9 && !ge.capped, `gearing ${(100 * ge.gearingPct).toFixed(1)} %, tStar ${ge.tStar}`);
  // arithmetic-midpoint vs median in the framing and weights
  const mid = (gp[1].lo + gp[1].hi) / 2;
  console.log(`   info: geared example operating-year range 880k..1.35M: arithmetic midpoint ${fmt(mid)} (used for COD trough and framing) vs median ${fmt(med(gp[1]))} (used for sizing) vs mean ${fmt(med(gp[1]) * Math.exp(LN(880e3, 1.35e6).s ** 2 / 2))}`);
}
// reference MC for the geared example: levered IRR and equity NPV
{
  const spec = CF_EX.geared, n = 60000, g = normalGen(55);
  const gp = spec.periods, med = p => Math.sqrt(p.lo * p.hi);
  const ds = med(gp[1]) / 1.45; let D = 0; for(let k = 0; k < 9; k++) D += ds / Math.pow(1.065, k);
  const peak = 7e6, Dd = D / 1.065;
  const irrs = [], npvs = [], covers = []; let short = 0, served = 0;
  const draw = p => { if(p.lo === p.hi) return p.lo; if(p.lo > 0){ const m = LN(p.lo, p.hi); return Math.exp(m.mu + m.s * g()); } return (p.lo + p.hi) / 2 + (p.hi - p.lo) / (2 * Z95) * g(); };
  for(let i = 0; i < n; i++){
    const rate = 0.10 + (0.02 / 100 * 100) / (2 * Z95) * g() * 0 ; // placeholder replaced below
    const rr = 0.10 + ((11 - 9) / 100 / (2 * Z95)) * g();
    const f = []; for(let t = 0; t <= 15; t++) f.push(draw(gp[Math.min(t, gp.length - 1)]));
    const eq = f.map((x, t) => x + (t === 0 ? Dd : 0) - (t >= 1 && t <= 9 ? ds : 0));
    // the example's COD: cumulative midpoint trough at t0 (-7M), tStar = 1
    const ir = refIRR(eq); if(ir.root !== null) irrs.push(ir.root);
    npvs.push(npvOf(eq, rr));
    for(let t = 1; t <= 9; t++){ served++; if(f[t] / ds < 1.45) short++; }
  }
  irrs.sort((a, b) => a - b); npvs.sort((a, b) => a - b);
  const e = cfRun(spec, {n: 60000}).debt;
  console.log(`   info: geared example, reference vs engine (60k): levered IRR P10/P50/P90 ${[.1, .5, .9].map(q => (100 * quantile(irrs, q)).toFixed(2)).join('/')} vs ${[e.levIrr.p10, e.levIrr.p50, e.levIrr.p90].map(v => (100 * v).toFixed(2)).join('/')}; equity NPV P50 ${fmt(quantile(npvs, .5))} vs ${fmt(e.eqNpv.p50)}; cover shortfall ${(100 * short / served).toFixed(1)} % vs ${(100 * e.coverShortfall).toFixed(1)} %`);
  check('DB9 geared example: levered IRR P10/P50/P90, equity NPV P50 and cover shortfall equal an independent reference (own sizing, own generator, own IRR) within 0.4 point / 1 % / 0.7 point', [.1, .5, .9].every((q, i) => Math.abs(quantile(irrs, q) - [e.levIrr.p10, e.levIrr.p50, e.levIrr.p90][i]) < 0.004) && rel(quantile(npvs, .5), e.eqNpv.p50) < 0.01 && Math.abs(short / served - e.coverShortfall) < 0.007);
}
{ // deterministic-cover fuzz sweep (floating point must not flag exact-cover years as shortfalls)
  let bad = 0, tested = 0;
  for(const d of [1.1, 1.2, 1.3, 1.35, 1.45, 1.6, 1.7, 2]) for(const f of [1.2e6, 987654, 333333, 1e6, 777777.7, 45e3, 2.2e6]){
    const rr = cfRun({periods: [fixed(-7e6), fixed(f)], horizon: 10, grain: 'year', rate: fixed(8), debt: {dscr: d, costOfDebt: .065}}, {n: 5}).debt;
    if(rr.ok && !rr.capped){ tested++; if(rr.coverShortfall > 0) bad++; } }
  check('DB10 deterministic uncapped structures: no operating year is flagged as under cover (floating-point ties at exactly the target DSCR), ' + tested + ' structures tried', bad === 0 && tested > 10, `${bad} flagged`);
}

// =============================================================================================
// 17. CASH-FLOW SAMPLING ERROR (page: 10,000 runs; 30 seeds)
// =============================================================================================
{
  console.log('   info: SAMPLING ERROR TABLE (cash-flow examples, n=10000, 30 seeds)');
  const pct0 = () => 0.01, pct1s = () => 0.001, intStep = () => 1;
  const rows = [];
  const S30 = SEEDS.slice(0, 30);
  const tab = (exName, spec) => {
    const acc = {}; const add = (k, v, step) => { (acc[k] ||= {a: [], step}).a.push(v); };
    for(const seed of S30){
      const r = cfRun(spec, {seed});
      if(r.framing === 'invest'){ add('NPV P10', r.npv.p10, fmtStep); add('NPV P50', r.npv.p50, fmtStep); add('NPV P90', r.npv.p90, fmtStep); add('P(NPV>0)', r.npv.pPos, pct0); add('IRR P50 (whole %)', r.irr.p50, pct0); add('IRR P50 (0.1 %)', r.irr.p50, pct1s); add('IRR P10 (0.1 %)', r.irr.p10, pct1s); add('IRR P90 (0.1 %)', r.irr.p90, pct1s); add('payback P50', r.period.p50, intStep); add('never-share', r.period.neverShare, pct0); }
      else { add('cash-out P10', r.period.p10, intStep); add('cash-out P50', r.period.p50, intStep); add('cash-out P90', r.period.p90, intStep); }
      if(r.debt && r.debt.ok){ const d = r.debt; add('levIRR P10 (0.1 %)', d.levIrr.p10, pct1s); add('levIRR P50 (0.1 %)', d.levIrr.p50, pct1s); add('levIRR P90 (0.1 %)', d.levIrr.p90, pct1s); add('eqNPV P50', d.eqNpv.p50, fmtStep); add('cover shortfall', d.coverShortfall, pct0); add('worst-year DSCR P10', d.minDscr.p10, () => 0.01); add('lev IRR undef share', d.levIrr.undefinedShare, pct0); }
    }
    for(const [k, {a, step}] of Object.entries(acc)){
      const s = sd(a), st = step(mean(a)); rows.push({ex: exName, k, sd: s, st, ratio: s / st});
      console.log(`   info: ${exName.padEnd(8)} ${k.padEnd(22)} mean ${String(Number(mean(a).toPrecision(4))).padEnd(10)} sd ${String(Number(s.toPrecision(3))).padEnd(10)} step ${String(Number(st.toPrecision(2))).padEnd(8)} sd/step ${(s / st).toFixed(2)}`);
    }
  };
  tab('invest', CF_EX.invest); tab('runway', CF_EX.runway); tab('geared', CF_EX.geared);
  const bad = rows.filter(r => r.ratio >= 0.5 && r.st > 0 && r.sd > 0);
  // awaiting decision (tier 2c, FM-30: more cash-flow runs)
  check('CN1 every printed cash-flow figure has seed noise under half its printed step (page: 10,000 runs)', bad.length === 0, bad.map(r => `${r.ex} ${r.k} sd/step ${r.ratio.toFixed(2)}`).join('; '), {known: bad.length > 0});
  check('CN2 the debt size D and gearing are deterministic (no seed noise) and the sampled figures are only the returns', rows.length > 0);
  // what removes it: for fixed-range cash flows the quantity is a sum of independent known distributions; the standard error scales 1/sqrt(n)
  const sInv = rows.filter(r => r.ex === 'invest' && r.k === 'NPV P90')[0];
  console.log(`   info: invest NPV P90 sd ${fmt(sInv.sd)} vs step ${fmt(sInv.st)}: reaching sd/step 0.25 needs about ${Math.ceil(10000 * (sInv.ratio / 0.25) ** 2).toLocaleString('en-GB')} runs at the current method`);
}

// =============================================================================================
// 18. SAVED STATE, SHARED LINKS, INPUT HANDLING
// =============================================================================================
{
  check('ST1 round trip: packScen then unpackScen returns the same formula, ranges and distributions', (() => {
    const snap = {f: 'a*b', question: 'q', unit: 'u', vars: new Map([['a', {lo: '1', hi: '2', dist: 'norm', base: null}], ['b', {lo: '3', hi: '4', dist: 'auto', base: null}]]), thresh: '5'};
    const u = unpackScen(JSON.parse(JSON.stringify(packScen(snap)))); return u.f === 'a*b' && u.vars.get('a').dist === 'norm' && u.vars.get('b').hi === '4' && u.thresh === '5' && u.question === 'q'; })());
  // an unvalidated dist string from a shared link
  const u = unpackScen({f: 'a*b', v: {a: ['10', '40', 'bogus'], b: ['2', '8']}});
  const mm = build('a * b', {a: ['10', '40', u.vars.get('a').dist], b: ['2', '8']});
  const o = simulateModel(mm, {seed: 1, n: 5000}).sorted, auto = simulateModel(build('a * b', {a: ['10', '40'], b: ['2', '8']}), {seed: 1, n: 5000}).sorted;
  check('ST2 a shared link carrying dist "bogus" is rejected or reset to auto (the select would show blank); instead it samples as normal, changing every figure', u.vars.get('a').dist !== 'bogus' || rel(quantile(o, .5), quantile(auto, .5)) < 1e-9, `dist kept as "${u.vars.get('a').dist}"; P50 ${fmt(quantile(o, .5))} vs auto ${fmt(quantile(auto, .5))}`);
  check('ST3 a link whose variable table holds __proto__ / constructor keys is stripped by unpackScen', !unpackScen(JSON.parse('{"f":"a","v":{"__proto__":["1","2"],"constructor":["1","2"],"a":["1","2"]}}')).vars.has('__proto__'));
  // variable named __proto__ in the formula (valid identifier)
  { let ok = true, msg = ''; try{ const m = build('__proto__ * 2', {__proto__x: 0}); }catch(e){ }
    const ast = parse(tokenize('__proto__ * 2')), names = collectVars(ast, []);
    const ranges = {}; ranges['__proto__'] = [10, 20]; const dists = {}; dists['__proto__'] = 'auto';
    let res; try{ res = simulateModel({ast, varNames: names, ranges, dists}, {seed: 1, n: 200}).sorted; }catch(e){ res = e.message; }
    check('ST4 a formula whose variable is named __proto__ simulates like any other name (P50 about 28.3)', Array.isArray(res) || (res && res.length === 200) ? Math.abs(quantile(res, .5) - 2 * Math.sqrt(200)) / 28.28 < 0.1 : false, typeof res === 'string' ? res : `P50 ${res.length ? quantile(res, .5).toFixed(2) : 'no draws'} (expected ${(2 * Math.sqrt(200)).toFixed(2)}), ${res.length} draws`, {known: !(res && res.length === 200 && Math.abs(quantile(res, .5) - 2 * Math.sqrt(200)) / 28.28 < 0.1)}); }
  // cash-flow scalar parsing
  check('ST5 cash-flow rate/DSCR/cost-of-debt fields read numbers as the range boxes do: "12abc", "6.5 to 8", "1.3x" are refused and "8k" is 8,000 (FM-28)', [parseCashflowScalar('12abc'), parseCashflowScalar('6.5 to 8'), parseCashflowScalar('1.3x')].every(Number.isNaN) && parseCashflowScalar('8k') === 8000, [parseCashflowScalar('12abc'), parseCashflowScalar('6.5 to 8'), parseCashflowScalar('1.3x'), parseCashflowScalar('8k')].join(', '));
  check('ST5b tenor field accepts only whole numbers 1..60 or blank', parseCashflowTenor('9').valid && parseCashflowTenor('').valid && !parseCashflowTenor('9.5').valid && !parseCashflowTenor('0').valid && !parseCashflowTenor('61').valid && parseCashflowTenor('1e1').valid === false, `1e1 -> ${JSON.stringify(parseCashflowTenor('1e1'))}`, {known: parseCashflowTenor('1e1').valid});
  const pi = parseCashflowInputs({periods: [{lo: '-100', hi: '-50'}, {lo: '8k', hi: '1,200'}], horizon: '3', grain: 'year', rateLower: '12', rateUpper: '8'});
  check('ST6 cash-flow inputs: bounds are ordered low/high, suffix and comma amounts parse, a reversed rate is ordered', pi.spec && pi.spec.periods[1].lo === 1200 && pi.spec.periods[1].hi === 8000 && pi.spec.rate.lo === 8 && pi.spec.rate.hi === 12);
  check('ST7 effectiveHorizon clamps to 1..60 and to at least periods-1; blank falls back to the minimum', effectiveHorizon('', 4) === 3 && effectiveHorizon('99', 4) === 60 && effectiveHorizon('2', 6) === 5 && effectiveHorizon('abc', 1) === 1 && effectiveHorizon('0', 4) === 3);
  // boot of a malformed cash-flow link: the page does boot.p.slice(0,61).map(pair => ({lo: String(pair[0] ?? ''), ...})) with no entry check
  const appSrc = (await import('node:fs')).readFileSync(new URL('../../../fermi/app.js', import.meta.url), 'utf8');
  const bootExpr = /boot\.p\.slice\(0, 61\)\.map\(pair => \(\{lo: String\(pair\[0\] \?\? ''\), hi: String\(pair\[1\] \?\? ''\)\}\)\)/.test(appSrc);
  let threw = false; try{ [null].map(pair => ({lo: String(pair[0] ?? ''), hi: String(pair[1] ?? '')})); }catch(e){ threw = e instanceof TypeError; }
  check('ST8 a cash-flow link whose period list holds a null entry (p:[null]) must not crash page boot: app.js reads the list through periodsFromLink, which skips entries that are not pairs (the browser confirmation is in the release notes)', !bootExpr && threw && /periodsFromLink\(boot\.p\)/.test(appSrc) && periodsFromLink([null]).length === 0 && periodsFromLink([null, ['1', '2']]).length === 1, 'source test + helper; the old unchecked map throws a TypeError on null');
  check('ST9 a legacy three-value tuple ["lo","hi"] with no distribution still loads as auto, and a numeric (non-string) bound is stringified', (() => { const x = unpackScen({f: 'a', v: {a: [1, 2]}}); return x.vars.get('a').dist === 'auto' && x.vars.get('a').lo === '1'; })());
  check('ST10 a non-string formula or a missing v in a link yields an empty model, not an exception', unpackScen({f: 5, v: null}).f === '' && unpackScen(null).f === '');
  // the page accepts s.v if typeof object: arrays pass
  const readHashRule = s => (typeof s.f === 'string' && typeof s.v === 'object');
  check('ST11 readHash accepts any object for v (including null and arrays); unpackScen then returns an empty variable table (no crash)', readHashRule({f: 'a', v: null}) && unpackScen({f: 'a', v: null}).vars.size === 0 && unpackScen({f: 'a', v: [1, 2]}).vars.size === 0);
}

// =============================================================================================
// 19. EXPORTS AND COPY TEXT: do they say the same thing as the page?
// =============================================================================================
{
  const fs = await import('node:fs'), appSrc = fs.readFileSync(new URL('../../../fermi/app.js', import.meta.url), 'utf8'), html = fs.readFileSync(new URL('../../../fermi/index.html', import.meta.url), 'utf8');
  const mapKeys = /\{logn:'log-normal',norm:'normal',uniform:'uniform'\}/.test(appSrc), optionVals = /\['uni','uniform'\]/.test(appSrc);
  check('EX1 the PNG export names each range\'s distribution through shapeLabel, so a uniform input prints as "uniform (full range)", not "uni"', !mapKeys && /shapeLabel\(st\.dist/.test(appSrc) && W.shapeLabel('uni', 1) === 'uniform (full range)', 'app.js png handler uses words.shapeLabel');
  check('EX2 the Markdown and page footers name the shapes actually used (estimateMethod), not "Log-normal fit per 90% range" unconditionally', !/_Log-normal fit per 90% range · 20,000/.test(appSrc) && !/Log-normal fit to each 90% range · 20,000/.test(html) && /estimateMethod\(last\.varNames/.test(appSrc) && /estimateMethod\(r\.varNames/.test(appSrc), 'app.js copydoc and the page Method line');
  // the cash-flow Markdown rounds the user's own assumptions
  const sp = {periods: [R(-1234567, -1111111), R(1234567, 2345678)], horizon: 1, grain: 'year', rate: R(8, 12)};
  const md = cashflowMarkdown(cfRun(sp, {n: 200}), sp, 'http://x', {periods: [{lo: '-1,234,567', hi: '-1,111,111'}, {lo: '1,234,567', hi: '2,345,678'}], rate: {lo: '8', hi: '12'}});
  check('EX3 the cash-flow Markdown "Assumptions" list reprints the typed ranges exactly (-1,234,567 to -1,111,111, as typed; FM-29)', /- t0: -1,234,567 to -1,111,111/.test(md), md.split('\n').find(l => /t0/.test(l)));
  // the estimate markdown prints raw typed text; the cash-flow one prints fmt: same assumption, two formats
  const cfSrc = fs.readFileSync(new URL('../../../fermi/render-cashflow.js', import.meta.url), 'utf8');
  const rawEst = /'- ' \+ name\.replace\(\/_\/g,' '\) \+ ': ' \+ st\.lo \+ ' – ' \+ st\.hi/.test(appSrc), fmtCf = /money\(p\.lo\) \+ ' to ' \+ money\(p\.hi\)/.test(cfSrc);
  check('EX4 the estimate Markdown and the cash-flow Markdown both print the assumptions as typed (the cash-flow one falls back to rounded figures only when no typed text is passed; FM-29)', rawEst && /tp\.lo \+ ' to ' \+ tp\.hi/.test(cfSrc) && /typed: \{|\{periods: cf\.periods/.test(appSrc), `estimate raw: ${rawEst}; cash-flow typed: ${/tp\.lo \+ ' to ' \+ tp\.hi/.test(cfSrc)}`);
  // extreme magnitudes
  const mu = build('a * b', {a: [1e-250, 1e-200], b: [1e-250, 1e-200]}), ru = simulateModel(mu, {seed: 1, n: 2000});
  check('V5 a product that underflows to 0 is still 0 in the engine, but the page now says so (underflowNote; FM-18)', quantile(ru.sorted, .5) === 0 && /too small/.test(W.underflowNote(ru.sorted, mu.ranges, mu.ast)), `P50 = ${quantile(ru.sorted, .5)}; ${W.underflowNote(ru.sorted, mu.ranges, mu.ast)}`);
  check('V5b distMedian(1e160, 1e170) must be finite (sqrt(lo*hi) overflows to Infinity and breaks the pinned run)', Number.isFinite(distMedian(1e160, 1e170, 'logn')), String(distMedian(1e160, 1e170, 'logn')));
}

// =============================================================================================
// 20. BUILT-IN EXAMPLES: printed figures vs closed form / 1M reference
// =============================================================================================
{
  let wrong = 0, total = 0; const lines = [];
  for(const ex of EXAMPLES){
    const m = exModel(ex), r = pageRun(m), S = Math.hypot(...sigmasOf(m));
    const med = evalNode(m.ast, Object.fromEntries(m.varNames.map(n => [n, Math.sqrt(m.ranges[n][0] * m.ranges[n][1])])));
    for(const [k, q, v] of [['P10', .1, r.p10], ['P50', .5, r.p50], ['P90', .9, r.p90]]){
      const exact = med * Math.exp(S * PhiInv(q)); total++;
      if(fmt(v) !== fmt(exact)){ wrong++; lines.push(`${ex.name} ${k} page ${fmt(v)} exact ${fmt(exact)}`); }
    }
  }
  console.log('   info: figures where the page\'s printed value differs from the exact value: ' + lines.join(' | '));
  // awaiting decision (tier 2a, FM-4)
  check('EX5 on the five built-in examples, every printed P10/P50/P90 (page seed 0x5EED, 20,000 runs) equals the exact (closed-form) value printed the same way', wrong === 0, `${wrong} of ${total} printed figures differ in the printed digits`, {known: wrong > 0});
  // claims on the examples
  const av = pageRun(exModel(EXAMPLES[3]));
  // kept by ruling (FM-Q1: a stated distribution choice)
  check('EX6 Availability chain ("fraction of time (0-1)"): no simulated availability exceeds 1', av.sorted[av.sorted.length - 1] <= 1, `max ${av.sorted[av.sorted.length - 1].toFixed(5)}; P(each input > 1) is positive because the lognormal tail passes 1; share of runs above 1: ${(100 * av.sorted.filter(v => v > 1).length / av.sorted.length).toFixed(3)} %`, {known: av.sorted[av.sorted.length - 1] > 1});
  const pAbove = EXAMPLES[3] && ['app_up', 'db_up', 'network_up', 'api_up'].map(n => { const [lo, hi] = exModel(EXAMPLES[3]).ranges[n], {mu, s} = LN(lo, hi); return 1 - Phi((Math.log(1) - mu) / s); });
  console.log(`   info: availability inputs: P(draw > 1) per input = ${pAbove.map(p => (100 * p).toFixed(2) + '%').join(', ')}`);
  // kept by ruling (FM-Q1)
  check('EX6b each availability input range (0.97..0.999 etc.) has no probability above 1 (a lognormal fitted to a 90 % interval ending just under 1 puts mass above 1)', pAbove.every(p => p < 1e-9), pAbove.map(p => (100 * p).toFixed(2) + '%').join(' / '), {known: true});
}
// =============================================================================================
// 21. CONTINUITY, "PIN AT THE MEDIAN", THRESHOLD ON NPV
// =============================================================================================
{
  // a point range consumes no random numbers, so a hairline-wide range changes every other draw (RNG stream shifts)
  const a = pageRun(build('a * b', {a: [10, 40], b: ['4', '4']})), b = pageRun(build('a * b', {a: [10, 40], b: ['4', '4.0000001']}));
  // awaiting decision (tier 2c, FM-27: a point range consuming its draw)
  check('CT1 continuity: widening one input from the point 4 to 4..4.0000001 (a change of one part in forty million) leaves P10/P50/P90 unchanged to 0.1 % (they move by sampling noise because the new range consumes draws)', Math.max(rel(a.p10, b.p10), rel(a.p50, b.p50), rel(a.p90, b.p90)) < 0.001, `P50 ${fmt(a.p50)} -> ${fmt(b.p50)} (${(100 * rel(a.p50, b.p50)).toFixed(2)} %), P90 ${fmt(a.p90)} -> ${fmt(b.p90)} (${(100 * rel(a.p90, b.p90)).toFixed(2)} %)`, {known: true});
  const sp = CF_EX.invest, x = cfRun({...sp, rate: R(10, 10)}), y = cfRun({...sp, rate: R(10, 10.0001)});
  // awaiting decision (tier 2c, FM-27)
  check('CT2 continuity (cash flow): discount rate 10..10 versus 10..10.0001 leaves NPV P50 unchanged to 0.1 % (the rate draws one gaussian per run only when its width is non-zero, shifting every cash-flow draw)', rel(x.npv.p50, y.npv.p50) < 0.001, `${fmt(x.npv.p50)} -> ${fmt(y.npv.p50)} (${(100 * rel(x.npv.p50, y.npv.p50)).toFixed(2)} %)`, {known: true});
  // pin at the median versus what knowing the value exactly would buy on average
  const m = build('a * b', {a: [10, 40], b: [-5, 15]}), N = 20000;
  const full = simulateModel(m, {seed: 3, n: N}).sorted, w = s => Math.log(quantile(s, .9) / quantile(s, .1));
  const pinnedMed = simulateModel(m, {seed: 3, n: 8000, pinName: 'b', pinValue: 5}).sorted;
  const spreads = [-3, 0, 5, 10, 13].map(bv => { const sx = simulateModel(m, {seed: 3, n: 8000, pinName: 'b', pinValue: bv}).sorted; return [bv, (quantile(sx, .9) - quantile(sx, .1))]; });
  console.log(`   info: a*b with b normal -5..15: P10..P90 width of the output after pinning b at -3/0/5/10/13: ${spreads.map(([b, v]) => b + ':' + fmt(v)).join('  ')}; full ${fmt(quantile(full, .9) - quantile(full, .1))}`);
  const wMed = spreads[2][1], wAvg = mean(spreads.map(x => x[1]));
  check('MQ2 recorded (modelling question FM-Q4; passes when the dependence on the pinned value is demonstrated): "how much of the spread disappears if you learn that number exactly" is measured by pinning at the MEDIAN; for a model whose spread depends on the pinned value (a*b with b -5..15) the width after learning b ranges ' + fmt(Math.min(...spreads.map(x => x[1]))) + ' to ' + fmt(Math.max(...spreads.map(x => x[1]))) + ' depending on where b turns out to be', Math.max(...spreads.map(x => x[1])) > 2 * Math.min(...spreads.map(x => x[1])) + 1e-9, `median-pin width ${fmt(wMed)} vs average over five plausible values ${fmt(wAvg)}`);
  // threshold on NPV: binary search equals a direct count
  const r = cfRun(CF_EX.invest), t = 20000, s = r.npvSorted; let lo = 0, hi = s.length; while(lo < hi){ const mm = (lo + hi) >> 1; if(s[mm] <= t) lo = mm + 1; else hi = mm; }
  let direct = 0; for(const v of s) if(v > t) direct++;
  check('CT3 cash-flow threshold P(NPV > T) from the binary search equals a direct count', (s.length - lo) === direct);
}
{ // cash-flow noise: what stratified / quasi-random draws at the same n would do to NPV (invest example, 7 dimensions: rate + 6 periods)
  const spec = CF_EX.invest, W = 6, n = 10000, accP = {p10: [], p50: [], p90: []}, accH = {p10: [], p50: [], p90: []}, accL = {p10: [], p50: [], p90: []};
  for(const seed of SEEDS.slice(0, 20)){
    const r = rng(seed), shift = Array.from({length: W + 1}, () => r()), out = new Float64Array(n), outL = new Float64Array(n);
    const perm = Array.from({length: W + 1}, () => { const a = Array.from({length: n}, (_, i) => i); for(let i = n - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });
    for(let i = 0; i < n; i++){
      const u = d => { let f = 1, x = 0, k = i + 1 + 100; const b = PRIMES[d]; while(k > 0){ f /= b; x += f * (k % b); k = Math.floor(k / b); } return Math.min(1 - 1e-12, Math.max(1e-12, (x + shift[d]) % 1)); };
      const ul = d => (perm[d][i] + r()) / n;
      for(const [uu, dst] of [[u, out], [ul, outL]]){
        const rate = (spec.rate.lo + spec.rate.hi) / 200 + ((spec.rate.hi - spec.rate.lo) / 100 / (2 * Z95)) * probit(uu(0));
        const fl = []; for(let t = 0; t < W; t++){ const p = spec.periods[Math.min(t, 3)]; fl.push(distQuantile(p.lo, p.hi, 'auto', uu(t + 1))); }
        dst[i] = npvOf(fl, rate);
      }
    }
    out.sort(); outL.sort();
    for(const [k, q] of [['p10', .1], ['p50', .5], ['p90', .9]]){ accH[k].push(quantile(out, q)); accL[k].push(quantile(outL, q)); }
    const e = cfRun(spec, {seed}); accP.p10.push(e.npv.p10); accP.p50.push(e.npv.p50); accP.p90.push(e.npv.p90);
  }
  const rH = k => sd(accH[k]) / sd(accP[k]), rL = k => sd(accL[k]) / sd(accP[k]);
  console.log(`   info: invest NPV at n=10000 (20 seeds), sd as a multiple of the engine's: shifted Halton P10/P50/P90 ${['p10', 'p50', 'p90'].map(k => rH(k).toFixed(2)).join('/')}; Latin hypercube ${['p10', 'p50', 'p90'].map(k => rL(k).toFixed(2)).join('/')}`);
  check('CN3 recorded: at the page\'s n = 10000 and seven dimensions neither shifted Halton nor Latin hypercube cuts invest NPV seed noise 3x (sd ratios 0.41-1.23), so for cash flow the only noise removal is more runs (n x 50 for sd/step 1) or rounding the print', ['p10', 'p50', 'p90'].every(k => rH(k) > 0.33 && rL(k) > 0.33), `Halton ${['p10', 'p50', 'p90'].map(k => rH(k).toFixed(2)).join('/')}, LHS ${['p10', 'p50', 'p90'].map(k => rL(k).toFixed(2)).join('/')}`);
}
done();
