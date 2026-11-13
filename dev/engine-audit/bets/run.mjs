// Audit harness: bets (portfolio of bets: independent baseline + shared-outcome stress).
// Run: node dev/engine-audit/bets/run.mjs   (about 30-60 s: million-draw references and 200-seed sweeps)
// A check tagged [DEFECT] proves a confirmed defect and FAILS today. Everything else is a covered-and-correct PASS
// (or a modelling question recorded as a PASS that demonstrates the behaviour).
import {check, done, rng, polar, xorshift, boxMuller, mean, sd, quant, COLORS, measure, svgText} from './lib.mjs';
import {parse} from '../../../bets/parse.js';
import {simulate, markdown, verdictParts, NSIM} from '../../../bets/engine.js';
import {pv, evv, p50Text, lossText, NSIM_TEXT} from '../../../bets/format.js';
import {betsDiff, betsDiffView, comparisonSafety} from '../../../bets/diff.js';
import {renderBoard} from '../../../bets/render.js';
import {renderQuadrant} from '../../../bets/render-quadrant.js';
import {renderBetsPresentation} from '../../../bets/render-presentation.js';
import {rewriteStake} from '../../../bets/edit-targets.js';
import {STARTER} from '../../../bets/starter.js';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SEED = 0xBE75, Z90 = 1.6448536;
const appSrc = readFileSync(ROOT + 'bets/app.js', 'utf8');
const EXAMPLES = [...appSrc.matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)].map(m => ({name: m[1], src: m[2]}));
const EMBED_SRC = (() => { const s = readFileSync(ROOT + 'embed/definitions/bets.js', 'utf8'); return JSON.parse('"' + /const source='([^']*)'/.exec(s)[1].replace(/"/g, '\\"') + '"'); })();
const ctxN = {colors: COLORS, measure, intent: 'native'};
const board = (m, s, extra = {}) => svgText(renderBoard(m, s, {...ctxN, ...extra}));
const pct = v => Math.round(v * 100);
const int = v => Math.round(v);
const flat = m => m.groups.flatMap(g => g.bets);

// ---------- contract transcription (own generator copies) ------------------------------------
// Pins the saved-link contract: seed 0xBE75, mulberry32, Marsaglia polar normal whose spare carries
// across bets AND runs, one stream; per run, per SCOREABLE bet in source order:
// odds draw (normal), payoff draw (log-normal, normal if lo<=0), stake draw (same) - ALWAYS, a point
// value draws and discards (BT-3) - then one uniform for the win/loss. Unscoreable bets draw nothing.
// Shared stress reuses the FIRST scoreable bet's uniform for every bet.
function refSim(model, seed = SEED, nsim = NSIM){
  const u = rng(seed), g = polar(u);
  const mk = (r, dist) => { if(!r) return null; let [lo, hi] = r; if(lo > hi) [lo, hi] = [hi, lo]; if(lo === hi) return () => { g(); return lo; };   // a point draws and discards
    const d = dist === 'logn' && lo <= 0 ? 'norm' : dist;
    if(d === 'logn'){ const mu = (Math.log(lo) + Math.log(hi)) / 2, s = (Math.log(hi) - Math.log(lo)) / (2 * Z90); return () => Math.exp(mu + s * g()); }
    const mu = (lo + hi) / 2, s = (hi - lo) / (2 * Z90); return () => mu + s * g(); };
  const bs = flat(model).map(b => ({b, ok: !!(b.stake && b.odds && b.payoff), o: mk(b.odds, 'norm'), p: mk(b.payoff, 'logn'), s: mk(b.stake, 'logn'), ev: [], wins: 0}));
  const ind = [], sh = [], nested = {violations: 0};
  for(let i = 0; i < nsim; i++){
    let a = 0, c = 0, shared = null; const sharedWins = [];
    for(const x of bs){
      if(!x.ok){ x.ev.push(0); continue; }
      const p = Math.min(100, Math.max(0, x.o())) / 100, pay = Math.max(0, x.p()), st = Math.max(0, x.s());
      x.ev.push(p * pay - st);
      const d = u(); if(shared === null) shared = d;
      a += (d < p ? pay : 0) - st; c += (shared < p ? pay : 0) - st;
      sharedWins.push([p, shared < p]); if(shared < p) x.wins++;
    }
    for(const [p1, w1] of sharedWins) for(const [p2, w2] of sharedWins) if(p1 > p2 && w2 && !w1) nested.violations++;
    ind.push(a); sh.push(c);
  }
  return {bs, ind, sh, nested};
}
const summary = arr => { const s = arr.slice().sort((a, b) => a - b); return {p10: quant(s, .1), p50: quant(s, .5), p90: quant(s, .9), pLoss: s.filter(v => v < 0).length / s.length}; };

// =============================================================================================
// 1. CONTRACT: the engine is exactly the documented draw order (saved links depend on it)
// =============================================================================================
{
  const models = [...EXAMPLES.map(e => parse(e.src)), parse(STARTER), parse(EMBED_SRC),
    parse('G\n  A: stake 10-30, odds 20-40%, payoff 50-90\n  Bad: stake 5, odds 140%, payoff 9\n  C: stake 0-12, odds 50, payoff 0-40\n  D: stake 7, odds 30%, payoff 25')];
  check('C0 the two built-in examples were found in bets/app.js (names: ' + EXAMPLES.map(e => e.name).join(', ') + ')', EXAMPLES.length === 2);
  let allExact = true, detail = [];
  for(const m of models){
    const e = simulate(m), r = refSim(m), si = summary(r.ind), ss = summary(r.sh);
    const same = ['p10', 'p50', 'p90', 'pLoss'].every(k => e.portfolio[k] === si[k] && e.scenarios.shared[k] === ss[k]) &&
      r.bs.every(x => { const v = x.ev.slice().sort((a, b) => a - b), rec = e.bets.get(x.b.srcLine); return rec.ev.p10 === quant(v, .1) && rec.ev.p50 === quant(v, .5) && rec.ev.p90 === quant(v, .9); });
    if(!same){ allExact = false; detail.push(m.title || 'model'); }
  }
  check('C1 contract: an own-code transcription of the documented draw order (seed 0xBE75, mulberry32, carried polar spare, per scoreable bet odds->payoff->stake->uniform, shared = first scoreable uniform) reproduces every portfolio and per-bet figure bit-for-bit on 5 models incl. an unscoreable bet mid-list and zero-lower-bound ranges', allExact, detail.join(', '));
  check('C2 deterministic: two runs of simulate() on the Lantern example are identical', JSON.stringify([...simulate(parse(EXAMPLES[0].src)).bets]) === JSON.stringify([...simulate(parse(EXAMPLES[0].src)).bets]));
  const svg = board(parse(EXAMPLES[0].src), simulate(parse(EXAMPLES[0].src)));
  check('C3 every surface that names the run count says 40,000 (from the constant) and NSIM is 40000', NSIM === 40000 && new RegExp(NSIM_TEXT + ' SIMULATIONS').test(svg) && new RegExp(NSIM_TEXT + ' SIMULATIONS').test(svgText(renderQuadrant(parse(EXAMPLES[0].src), simulate(parse(EXAMPLES[0].src)), ctxN))) && refSim(parse(EXAMPLES[0].src)).ind.length === NSIM);
}

// =============================================================================================
// 2. ARITHMETIC against exact answers
// =============================================================================================
// exact enumeration for point-valued bets
function exactPoint(bets){ // bets: [{stake, p, pay}]
  const n = bets.length, ind = [];
  for(let mask = 0; mask < (1 << n); mask++){ let pr = 1, v = 0;
    bets.forEach((b, i) => { const w = mask >> i & 1; pr *= w ? b.p : 1 - b.p; v += (w ? b.pay : 0) - b.stake; }); ind.push([v, pr]); }
  const order = bets.map((b, i) => i).sort((a, c) => bets[c].p - bets[a].p);            // comonotone: u < p wins
  const cuts = [0, ...order.map(i => bets[i].p).sort((a, b) => a - b), 1]; const sh = [];
  for(let j = 0; j + 1 < cuts.length; j++){ const w = cuts[j + 1] - cuts[j]; if(w <= 0) continue; const mid = (cuts[j] + cuts[j + 1]) / 2;
    sh.push([bets.reduce((t, b) => t + (mid < b.p ? b.pay : 0) - b.stake, 0), w]); }
  const pl = d => d.filter(([v]) => v < 0).reduce((t, [, p]) => t + p, 0);
  return {pLossInd: pl(ind), pLossSh: pl(sh), ind, sh};
}
const toSrc = bets => 'G\n' + bets.map((b, i) => `  B${i}: stake ${b.stake}, odds ${b.p * 100}%, payoff ${b.pay}`).join('\n');
{
  const cases = [
    [{stake: 10, p: .5, pay: 30}],
    [{stake: 10, p: .6, pay: 30}, {stake: 10, p: .6, pay: 30}],
    [{stake: 100, p: .9, pay: 110}, {stake: 100, p: .9, pay: 110}],
    [{stake: 80, p: .5, pay: 400}, {stake: 220, p: .2, pay: 220}, {stake: 150, p: .94, pay: 220}, {stake: 60, p: .2, pay: 350}, {stake: 60, p: .35, pay: 215}],
  ];
  let worstZ = 0, worstZs = 0;
  for(const c of cases){
    const m = parse(toSrc(c)), e = simulate(m), x = exactPoint(c);
    const z = (e.portfolio.pLoss - x.pLossInd) / Math.sqrt(Math.max(1e-9, x.pLossInd * (1 - x.pLossInd)) / NSIM);
    const zs = (e.scenarios.shared.pLoss - x.pLossSh) / Math.sqrt(Math.max(1e-9, x.pLossSh * (1 - x.pLossSh)) / NSIM);
    worstZ = Math.max(worstZ, Math.abs(z)); worstZs = Math.max(worstZs, Math.abs(zs));
    console.log(`   info: point case ${c.length} bets: exact P(loss) independent ${x.pLossInd.toFixed(4)} engine ${e.portfolio.pLoss}; shared exact ${x.pLossSh.toFixed(4)} engine ${e.scenarios.shared.pLoss}`);
    for(const b of flat(m)){ const r = e.bets.get(b.srcLine).ev, want = b.odds[0] / 100 * b.payoff[0] - b.stake[0];
      if(!(r.p10 === r.p90 && Math.abs(r.p50 - want) < 1e-9)){ worstZ = 99; } }
  }
  check('A1 point-valued portfolios: P(loss) independent agrees with exact enumeration of all 2^n win/loss combinations within 4 binomial sd, and per-bet EV equals p*payoff - stake exactly', worstZ < 4, `worst |z| ${worstZ.toFixed(2)}`);
  check('A2 point-valued portfolios: P(loss) under shared stress agrees with the exact comonotone (one uniform, nested winners) distribution within 4 binomial sd', worstZs < 4, `worst |z| ${worstZs.toFixed(2)}`);
  const r = refSim(parse(toSrc(cases[3])));
  check('A3 shared stress is comonotone: in no run does a lower-odds bet win while a higher-odds bet loses (instrumented transcription, 4000 runs x 5 bets)', r.nested.violations === 0, `${r.nested.violations} violations`);
  const marg = r.bs.map(x => ({p: x.b.odds[0] / 100, f: x.wins / NSIM}));
  check('A4 shared stress keeps every bet\'s marginal win rate (within 4 sd of its authored odds)', marg.every(({p, f}) => Math.abs(f - p) <= 4 * Math.sqrt(p * (1 - p) / NSIM) + 1e-12), marg.map(({p, f}) => p + ':' + f.toFixed(3)).join(' '));
  // limits
  const zero = simulate(parse('G\n  A: stake 10, odds 0%, payoff 50')), one = simulate(parse('G\n  A: stake 10, odds 100%, payoff 50'));
  check('A5 limits: odds 0% loses every run (P(loss) exactly 1), odds 100% with payoff > stake never loses (exactly 0)', zero.portfolio.pLoss === 1 && one.portfolio.pLoss === 0);
  const single = simulate(parse('G\n  A: stake 10-30, odds 30-60%, payoff 40-90'));
  check('A6 one bet: the shared-stress distribution is identical to the independent one', ['p10', 'p50', 'p90', 'pLoss'].every(k => single.portfolio[k] === single.scenarios.shared[k]));
}
// per-bet EV and portfolio against a million-draw reference on a DIFFERENT generator (xorshift + Box-Muller)
function refDraw(models, N, seed){
  const u = xorshift(seed), g = boxMuller(u);
  const samp = (r, dist) => { const [lo, hi] = r; if(lo === hi) return () => lo; const d = dist === 'logn' && lo <= 0 ? 'norm' : dist;
    if(d === 'logn'){ const mu = (Math.log(lo) + Math.log(hi)) / 2, s = (Math.log(hi) - Math.log(lo)) / (2 * 1.6448536269514722); return () => Math.exp(mu + s * g()); }
    const mu = (lo + hi) / 2, s = (hi - lo) / (2 * 1.6448536269514722); return () => mu + s * g(); };
  const bs = flat(models).filter(b => b.stake && b.odds && b.payoff).map(b => ({b, o: samp(b.odds, 'norm'), p: samp(b.payoff, 'logn'), s: samp(b.stake, 'logn'), ev: new Float64Array(N)}));
  const ind = new Float64Array(N), sh = new Float64Array(N);
  for(let i = 0; i < N; i++){ let a = 0, c = 0, shared = null;
    for(const x of bs){ const p = Math.min(1, Math.max(0, x.o() / 100)), pay = Math.max(0, x.p()), st = Math.max(0, x.s()); x.ev[i] = p * pay - st;
      const d = u(); if(shared === null) shared = d; a += (d < p ? pay : 0) - st; c += (shared < p ? pay : 0) - st; }
    ind[i] = a; sh[i] = c; }
  for(const x of bs) x.ev.sort(); ind.sort(); sh.sort();
  return {bs, ind: summary(ind), sh: summary(sh)};
}
const sweep = (m, seeds) => seeds.map(s => simulate(m, {seed: s}));
const DRAW = 'needs a draw change, awaiting the owner';
const RUNS = 'needs more runs, awaiting the owner';
const SEEDS = Array.from({length: 200}, (_, i) => 1000 + i * 7919);
const BEFORE = {};
for(const ex of EXAMPLES){
  const m = parse(ex.src), e = simulate(m), ref = refDraw(m, 1000000, 99), runs = sweep(m, SEEDS);
  const tag = ex.name;
  // bias of every figure versus the reference, in units of the seed-to-seed sd
  let worst = 0, worstLbl = '';
  /* the 1,000,000-draw reference has its own sampling error, s * sqrt(NSIM / 1e6): counted, not ignored */
  const fig = (lbl, eng, refv, arr) => { const s = sd(arr) || 1e-9, rs = s * Math.sqrt(NSIM / 1e6), z = Math.abs(eng - refv) / Math.sqrt(s * s + rs * rs), zm = Math.abs(mean(arr) - refv) / Math.sqrt(s * s / arr.length + rs * rs); if(Math.max(z / 4, zm / 5) > worst){ worst = Math.max(z / 4, zm / 5); worstLbl = `${lbl} engine ${eng.toFixed(3)} ref ${refv.toFixed(3)} sd ${s.toFixed(3)}`; } };
  ref.bs.forEach(x => { for(const [k, q] of [['p10', .1], ['p50', .5], ['p90', .9]]) fig(x.b.name + ' EV ' + k, e.bets.get(x.b.srcLine).ev[k], quant(x.ev, q), runs.map(r => r.bets.get(x.b.srcLine).ev[k])); });
  // a median that falls in an empty gap of the distribution has no stable sample estimate; it is tested in N5 instead
  const gap = k => { const sh = k === 'shared', arr = runs.map(r => (sh ? r.scenarios.shared : r.portfolio).p50); return sd(arr) > 20; };
  for(const k of ['p10', 'p50', 'p90', 'pLoss']){ fig('portfolio ' + k, e.portfolio[k], ref.ind[k], runs.map(r => r.portfolio[k])); if(!(k === 'p50' && gap('shared'))) fig('shared ' + k, e.scenarios.shared[k], ref.sh[k], runs.map(r => r.scenarios.shared[k])); }
  check(`A7 ${tag}: every per-bet EV P10/P50/P90 and portfolio P10/P50/P90/P(loss) (both scenarios; a gap median excepted, see N5) is unbiased against a 1,000,000-draw reference on a different generator (seed-0 figure within 4 seed-sd; 200-seed mean within 5 standard errors)`, worst <= 1, worstLbl);
  /* seed noise versus printed step, over 40 seeds: every printed sampled figure has a step of its own
     (portfolio outcomes one shared step; each bet's EV trio another; P(loses money) one point) and the
     rule is that the seed-to-seed sd is at most half of it. The step is the one the default-seed run prints. */
  const runs40 = runs.slice(0, 40), rows = [];
  ref.bs.forEach(x => { const ln = x.b.srcLine; for(const k of ['p10', 'p50', 'p90']) rows.push([x.b.name + ' EV ' + k, sd(runs40.map(r => r.bets.get(ln).ev[k])), e.bets.get(ln).ev.step]); });
  const asPoint = sc => runs40.every(r => !(sc === 'shared' ? r.scenarios.shared : r.portfolio).split) ? true : false;
  for(const [sc, pick] of [['portfolio', r => r.portfolio], ['shared', r => r.scenarios.shared]]){
    const step = (sc === 'shared' ? e.scenarios.shared : e.portfolio).step;
    for(const k of ['p10', 'p90']) rows.push([sc + ' ' + k, sd(runs40.map(r => pick(r)[k])), step]);
    const withSplit = runs40.filter(r => pick(r).split);
    if(withSplit.length >= 20){ rows.push([sc + ' split A', sd(withSplit.map(r => pick(r).split.lo)), step]); rows.push([sc + ' split B', sd(withSplit.map(r => pick(r).split.hi)), step]); }
    else rows.push([sc + ' p50', sd(runs40.map(r => pick(r).p50)), step]);
  }
  rows.push(['portfolio P(loss) %', sd(runs40.map(r => 100 * r.portfolio.pLoss)), 1]); rows.push(['shared P(loss) %', sd(runs40.map(r => 100 * r.scenarios.shared.pLoss)), 1]);
  for(const [l, s, step] of rows) console.log(`   info: ${tag}: seed sd of ${l} = ${s.toFixed(3)} (printed step ${step}) -> ${(s / step).toFixed(2)} steps`);
  const evRows = rows.filter(r => / EV /.test(r[0])), pfRows = rows.filter(r => /^(portfolio|shared) (p\d|split)/.test(r[0])), plRows = rows.filter(r => /P\(loss\)/.test(r[0]));
  const w = rs => rs.reduce((a, r) => r[1] / r[2] > a[1] / a[2] ? r : a);
  const we = w(evRows), wp = w(pfRows), wl = w(plRows);
  check(`N1 ${tag}: per-bet EV P10/P50/P90 seed-to-seed sd (40 seeds) is at most half the bet's printed step`, we[1] / we[2] <= .5, `worst ${we[0]} sd ${we[1].toFixed(3)} = ${(we[1] / we[2]).toFixed(2)} steps of ${we[2]}`, {known: we[1] / we[2] > .5 && we[1] / we[2] < 6 && RUNS});
  check(`N2 ${tag}: portfolio P10/P50/P90 and split values (both scenarios; 40 seeds) seed sd is at most half the shared printed step`, wp[1] / wp[2] <= .5, `worst ${wp[0]} sd ${wp[1].toFixed(2)} = ${(wp[1] / wp[2]).toFixed(2)} steps of ${wp[2]}`, {known: wp[1] / wp[2] > .5 && wp[1] / wp[2] < 6 && RUNS});
  check(`N3 ${tag}: printed P(loses money) seed sd (40 seeds) is at most half a percentage point`, wl[1] <= .5, `worst ${wl[0]} sd ${wl[1].toFixed(2)} pp`, {known: wl[1] > .5 && wl[1] < 3 && RUNS});
  const signs = runs.map(r => Math.sign(int(r.portfolio.p50)));
  const neg = signs.filter(s => s < 0).length, pos = signs.filter(s => s > 0).length;
  if(tag.startsWith('Lantern')){
    const printed = runs.map(r => int(r.portfolio.p50));
    console.log(`   info: Lantern independent median across 200 seeds: min ${Math.min(...printed)} max ${Math.max(...printed)}; printed sign: ${pos} positive, ${neg} negative; reference ${ref.ind.p50.toFixed(2)}`);
    check('N4 Lantern: the sign of the printed independent "MEDIAN OUTCOME" does not depend on the seed (a reader takes +/- as the message)', neg === 0 || pos === 0, `${pos} seeds print +, ${neg} print -, range ${Math.min(...printed)}..${Math.max(...printed)}`, {known: neg > 0 && pos > 0});
    const shm = runs.map(r => int(r.scenarios.shared.p50));
    const splits = runs.map(r => r.scenarios.shared.split), found = splits.filter(Boolean), missed = splits.length - found.length;
    check('N5 Lantern: the Shared-outcome stress median sits in an empty gap, so every one of 200 seeds prints it as a split ("P50 A or B"), never as a single point (BT-1; threshold 2% of P90-P10)', missed === 0, `${found.length} of 200 seeds carry a split; the single-point median would have run ${Math.min(...shm)}..${Math.max(...shm)} (sd ${sd(shm).toFixed(0)}); 1,000,000-draw reference ${ref.sh.p50.toFixed(0)}`, {known: missed > 0 && missed <= 80 && 'the 2% threshold was measured at 4,000 runs; at 40,000 runs the gap in the 45-55% band narrows (median 2.5%, minimum 1.2% on Lantern), so about a quarter of seeds print a single point; the owner may lower it (smooth portfolios stay under 0.3%). Bounded: more than 80 misses fails'});
    const first40 = found.slice(0, 40), sdA = sd(first40.map(x => x.lo)), sdB = sd(first40.map(x => x.hi));
    check('N5b Lantern: A and B (the medians of the runs below and above the gap) each have a seed-to-seed sd of at most half the shared printed step, over the first 40 split seeds', sdA <= .5 * e.scenarios.shared.step && sdB <= .5 * e.scenarios.shared.step, `sd A ${sdA.toFixed(2)}, sd B ${sdB.toFixed(2)} units against a step of ${e.scenarios.shared.step} (A ${Math.min(...first40.map(x => x.lo)).toFixed(0)}..${Math.max(...first40.map(x => x.lo)).toFixed(0)}, B ${Math.min(...first40.map(x => x.hi)).toFixed(0)}..${Math.max(...first40.map(x => x.hi)).toFixed(0)}); B is the median of about 2000 runs of a wide upper cluster`, {known: (sdA > .5 * e.scenarios.shared.step || sdB > .5 * e.scenarios.shared.step) && sdB < 25 && RUNS});
    const sy = parse(STARTER), syRuns = SEEDS.slice(0, 40).map(seed => simulate(sy, {seed}).portfolio.split);
    const syA = sd(syRuns.map(x => x.lo)), syB = sd(syRuns.map(x => x.hi));
    const syStep = simulate(sy).portfolio.step;
    check('N5c Start your own: A and B each have a seed-to-seed sd of at most half the shared printed step, over 40 seeds, and every seed splits', syRuns.every(Boolean) && syA <= .5 * syStep && syB <= .5 * syStep, `sd A ${syA.toFixed(2)}, sd B ${syB.toFixed(2)} units against a step of ${syStep}`, {known: syRuns.every(Boolean) && (syA > .5 * syStep || syB > .5 * syStep) && syB < 25 && RUNS});
    check('N5d Lantern: A and B stay in their measured neighbourhood (A -400..-300, B 200..400), so a regression in the detector cannot hide behind N5b', found.every(x => x.lo > -400 && x.lo < -300 && x.hi > 200 && x.hi < 400), `A ${Math.min(...found.map(x => x.lo)).toFixed(0)}..${Math.max(...found.map(x => x.lo)).toFixed(0)}, B ${Math.min(...found.map(x => x.hi)).toFixed(0)}..${Math.max(...found.map(x => x.hi)).toFixed(0)}`);
    const plp = runs.map(r => pct(r.portfolio.pLoss));
    console.log(`   info: Lantern printed P(loses money) across 200 seeds: ${Math.min(...plp)}%..${Math.max(...plp)}% (reference ${(100 * ref.ind.pLoss).toFixed(2)}%)`);
  }
  BEFORE[tag] = {independent: e.portfolio, shared: e.scenarios.shared, conc: e.concentration, bets: flat(m).map(b => ({name: b.name, ev: e.bets.get(b.srcLine).ev, audits: e.bets.get(b.srcLine).audits}))};
}

// Article embed inputs: the same per-bet EV noise rule over 40 seeds
{
  const m = parse(EMBED_SRC), e = simulate(m), runs = SEEDS.slice(0, 40).map(seed => simulate(m, {seed})), rows = [];
  for(const b of flat(m)) for(const k of ['p10', 'p50', 'p90']) rows.push([b.name + ' EV ' + k, sd(runs.map(r => r.bets.get(b.srcLine).ev[k])), e.bets.get(b.srcLine).ev.step]);
  for(const [l, sdv, step] of rows) console.log(`   info: Article embed: seed sd of ${l} = ${sdv.toFixed(3)} (printed step ${step}) -> ${(sdv / step).toFixed(2)} steps`);
  const worst = rows.reduce((a, r) => r[1] / r[2] > a[1] / a[2] ? r : a);
  check('N1e Article embed (Reading portfolio): per-bet EV P10/P50/P90 seed-to-seed sd (40 seeds) is at most half the bet\'s printed step', worst[1] / worst[2] <= .5, `worst ${worst[0]} sd ${worst[1].toFixed(3)} = ${(worst[1] / worst[2]).toFixed(2)} steps of ${worst[2]}`, {known: worst[1] / worst[2] > .5 && worst[1] / worst[2] < 6 && RUNS});
}

// BT-1 margin: the split threshold (2% of P90-P10) against smooth distributions
{
  const u = rng(123456789), rr = (a, b) => a + (b - a) * u();
  const worst = [];
  for(let k = 0; k < 200; k++){
    const nb = 5 + Math.floor(u() * 5); let src = 'G\n';
    for(let i = 0; i < nb; i++){
      const sl = rr(10, 200), sh = sl * rr(1.2, 2.5), ol = rr(5, 40), oh = Math.min(95, ol + rr(5, 30)), pl = rr(50, 400), ph = pl * rr(1.2, 2.2);
      const odds = u() < .5 ? [ol, oh] : [100 - oh, 100 - ol];
      src += `  B${i}: stake ${sl.toFixed(0)}-${sh.toFixed(0)}, odds ${odds[0].toFixed(0)}-${odds[1].toFixed(0)}%, payoff ${pl.toFixed(0)}-${ph.toFixed(0)}\n`;
    }
    const e = simulate(parse(src)); worst.push(Math.max(e.portfolio.gapShare, e.scenarios.shared.gapShare));
  }
  const max = Math.max(...worst);
  check('N6 BT-1 margin: on 200 smooth random portfolios (5-9 ranged bets, odds away from 50%) the widest neighbour gap between the 45% and 55% levels never exceeds 1% of P90-P10, well under the 2% split threshold', max < .01, `max ${(100 * max).toFixed(2)}% (median ${(100 * worst.slice().sort((a, b) => a - b)[100]).toFixed(2)}%); built-ins: Lantern independent ${(100 * simulate(parse(EXAMPLES[0].src)).portfolio.gapShare).toFixed(2)}%, Lantern shared ${(100 * simulate(parse(EXAMPLES[0].src)).scenarios.shared.gapShare).toFixed(1)}%, Quick ${(100 * simulate(parse(EXAMPLES[1].src)).scenarios.shared.gapShare).toFixed(2)}%`);
}

// =============================================================================================
// 3. HAIRLINE CHANGES, ORDER AND SCALE
// =============================================================================================
{
  const src = EXAMPLES[0].src, a = simulate(parse(src)), b = simulate(parse(src.replace('stake 80,', 'stake 80-80.0001,')));
  const d50 = Math.abs(int(a.portfolio.p50) - int(b.portfolio.p50)), dpl = Math.abs(pct(a.portfolio.pLoss) - pct(b.portfolio.pLoss));
  const ds = Math.abs(int(a.scenarios.shared.p50) - int(b.scenarios.shared.p50));
  /* every portfolio figure the board prints, as printed */
  const fp = e => [e.portfolio, e.scenarios.shared].map(pf => `${pv(pf, pf.p10)} ${p50Text(pf)} ${pv(pf, pf.p90)} ${lossText(pf)}`).join(' | ') + ' | ' +
    [...e.bets.values()].map(r => `${evv(r.ev, r.ev.p10)} ${evv(r.ev, r.ev.p50)} ${evv(r.ev, r.ev.p90)}`).join(' | ');
  check('H1 Lantern: widening Referral\'s stake from the point 80 to 80..80.0001 leaves every printed portfolio and EV figure unchanged (the change is worth 0.0001)', fp(a) === fp(b),
    `${fp(a) === fp(b) ? 'identical' : fp(a) + '  ->  ' + fp(b)} [a point now draws and discards, so no later draw shifts]`);
  const lines = src.split('\n'), gi = lines.indexOf('Platform bets');
  const swapped = [...lines.slice(0, 3), ...lines.slice(gi), '', ...lines.slice(3, gi)].join('\n');
  const c = simulate(parse(swapped));
  const same = fp(a).split(' | ').slice(0, 2).join() === fp(c).split(' | ').slice(0, 2).join();
  check('H2 Lantern: listing the two groups in the other order (same bets, same numbers) prints the same portfolio figures (BT-4)', same,
    `${fp(a).split(' | ').slice(0, 2).join(' | ')}  ->  ${fp(c).split(' | ').slice(0, 2).join(' | ')} [reason: draws are assigned by source position and the shared draw is the first listed bet's; shifts: independent P50 ${(c.portfolio.p50 - a.portfolio.p50).toFixed(1)}, P90 ${(c.portfolio.p90 - a.portfolio.p90).toFixed(1)}, shared P90 ${(c.scenarios.shared.p90 - a.scenarios.shared.p90).toFixed(1)} against a step of ${a.portfolio.step}]`, {known: !same && 'kept by ruling: reordering is a different sample; the shift is the size of seed noise'});
  const k = src.replace(/stake (\d+)/g, (_, v) => 'stake ' + v * 1000).replace(/payoff (\d+)-(\d+)/g, (_, x, y) => 'payoff ' + x * 1000 + '-' + y * 1000);
  const s = simulate(parse(k));
  check('H3 scale invariance: multiplying every stake and payoff by 1000 multiplies portfolio quantiles by 1000 and leaves P(loss) identical', s.portfolio.pLoss === a.portfolio.pLoss && Math.abs(s.portfolio.p50 / a.portfolio.p50 - 1000) < 1e-6 * 1000 && s.scenarios.shared.pLoss === a.scenarios.shared.pLoss);
  const mStake = simulate(parse('G\n  A: stake 100-300, odds 50%, payoff 400'));
  const draws = refSim(parse('G\n  A: stake 100-300, odds 50%, payoff 400'), SEED, 200000);
  const meanStake = 400 * 0.5 - mean(draws.bs[0].ev);
  const sv = board(parse('G\n  A: stake 100-300, odds 50%, payoff 400'), mStake);
  check('Q3 recorded (modelling question BT-Q3): the printed TOTAL STAKE is the midpoint of each stake range (200 for 100-300) while the simulation charges a log-normal stake whose mean is about 183 and median 173', /TOTAL STAKE 200/.test(sv) && Math.abs(meanStake - 183) < 3, `printed "TOTAL STAKE 200", simulated mean stake ${meanStake.toFixed(1)}`);
}

// =============================================================================================
// 4. WORDS ON EVERY SURFACE
// =============================================================================================
{
  const lo = parse('title: T\nunit: £k\nG\n  A: stake 10, odds 99.6%, payoff 100\n    kill: k'), los = simulate(lo);
  const hi = parse('title: T\nunit: £k\nG\n  A: stake 10, odds 0.2%, payoff 100\n    kill: k'), his = simulate(hi);
  const tl = board(lo, los), th = board(hi, his), md = markdown(lo, los, '');
  console.log(`   info: odds 99.6%: P(loss) exact 0.4%, engine ${(100 * los.portfolio.pLoss).toFixed(2)}%; odds 0.2%: exact 99.8%, engine ${(100 * his.portfolio.pLoss).toFixed(2)}%`);
  check('W1 P(loses money) never prints a flat 0% for a portfolio that does lose money (exact 0.4% here)', !/P\(LOSES MONEY\) 0%/.test(tl) && !/\*\*0%\*\*/.test(md), `board: "${(/P\(LOSES MONEY\) \d+%/.exec(tl) || [''])[0]}", "${(/\d+% BELOW ZERO/.exec(tl) || [''])[0]}"; markdown "P(loses money) **${pct(los.portfolio.pLoss)}%**"`);
  check('W1b P(loses money) never prints a flat 100% for a portfolio that sometimes makes money (exact 99.8% here)', !/P\(LOSES MONEY\) 100%/.test(th), `board: "${(/P\(LOSES MONEY\) \d+%/.exec(th) || [''])[0]}" for engine ${(100 * his.portfolio.pLoss).toFixed(2)}%`);
  const ex = simulate(parse(EXAMPLES[0].src));
  console.log(`   info: Lantern independent P(loss) = ${ex.portfolio.pLoss} -> printed ${pct(ex.portfolio.pLoss)}%`);

  const zero = parse('title: T\nunit: £k\nG\n  B: stake 10, odds 50%, payoff 19.4\n    kill: k\n  C: stake 5, odds 50%, payoff 30\n    kill: k'), zs = simulate(zero), tz = board(zero, zs);
  check('W2 a per-bet EV of -0.3 does not print as "−0" (a signed zero with the red LOSES AT P50 badge beside it)', !/\| −0 \|/.test(tz), `board row B: "${(/B \| 10 \| 50% \| 19 \| [^|]+\| [^|]+\| [^|]+/.exec(tz) || [''])[0]}"`);

  const frac = parse('title: T\nunit: £k\nG\n  A: stake 0.5-2.5, odds 40-60%, payoff 19.4\n    kill: k\n  B: stake 20, odds 50%, payoff 60\n    kill: k'), fs = simulate(frac);
  const live = renderBoard(frac, fs, {...ctxN, intent: 'live', edit: true}), ft = svgText(live);
  check('W3 authored inputs print as authored: stake 0.5-2.5 and payoff 19.4 appear as written on the board', /0\.5–2\.5/.test(ft) && /19\.4/.test(ft), `board prints stake "${(/A \| ([^|]+) \|/.exec(ft) || [, ''])[1].trim()}" and payoff "${/ 19 \|/.test(ft) ? '19' : '?'}"`);
  const raw = (/data-edit="stake" data-line="4" data-raw="([^"]*)"/.exec(live) || [, ''])[1];
  const ops = rewriteStake('title: T\nunit: £k\nG\n  A: stake 0.5-2.5, odds 40-60%, payoff 19.4\n    kill: k', 4, raw, raw.replace('2.5', '4').replace('–', '-'));
  check('W3b editing only the top of a stake range in place keeps the authored bottom (0.5)', !!ops && /stake 0\.5-4/.test(ops[0].text), `edit field is prefilled "${raw}"; changing its top to 4 writes "${ops && ops[0].text.trim()}"`);

  const two = parse('title: T\nunit: £k\nG\n  A: stake 50, odds 50%, payoff 120\n    kill: k\n  B: stake 50, odds 50%, payoff 120\n    kill: k'), ts = simulate(two);
  const tt = board(two, ts);
  check('W4 the concentration line does not say "one bet carries the book" when two bets carry equal stakes (50/50)', !/one bet carries the book/.test(tt), `"${(/⚑[^|]+/.exec(tt) || [''])[0].trim()}"; engine share ${ts.concentration && ts.concentration.share} for the FIRST of two equal bets`);
  const three = parse('G\n  A: stake 40, odds 50%, payoff 120\n  B: stake 30, odds 50%, payoff 120\n  C: stake 30, odds 50%, payoff 120');
  check('W4b concentration flag switches at exactly 40% of midpoint stake (40/100 flags, 39/99 does not)', !!simulate(three).concentration && !simulate(parse('G\n  A: stake 39, odds 50%, payoff 120\n  B: stake 30, odds 50%, payoff 120\n  C: stake 30, odds 50%, payoff 120')).concentration);

  const lan = parse(EXAMPLES[0].src), ls = simulate(lan), wide = board(lan, ls);
  check('W5 the wide board\'s shared-stress receipt prints its whole condition, not a dangling "parameter ranges"', /stay independent/.test(wide), `wide receipt reads "${(/If realised[^|]+/.exec(wide) || [''])[0].trim()}" (copyLines.slice(0, 1) keeps one line)`);
  const nq = svgText(renderQuadrant(lan, ls, {...ctxN, width: 400}));
  check('W6 the narrow quadrant\'s shared-stress caption does not overstate the scenario ("Whole portfolio moves together" while stakes, odds and payoffs stay independent)', !/Whole portfolio moves together/.test(nq), '"Whole portfolio moves together" vs board "If realised wins and losses move together; parameter ranges stay independent"');
  const nounit = parse('title: T\nG\n  A: stake 10, odds 50%, payoff 30\n    kill: k');
  const nut = board(nounit, simulate(nounit));
  check('W7 with no unit the footer does not print a bare "ALL FIGURES"', !/ALL FIGURES\s*$/.test(nut), `footer ends "${nut.slice(-20)}"`);
  // markdown and board agree on every printed portfolio figure (to the board's step)
  const md2 = markdown(lan, ls, '');
  const mdMed = /Independent baseline: Median outcome \*\*([^ *]+)/.exec(md2)[1];
  console.log(`   info: Lantern independent median: board "${(/MEDIAN OUTCOME ([^ ]+)/.exec(wide) || [])[1]}", markdown "${mdMed}"; Publisher EV P50 board "+7" vs markdown "6.73"`);
  check('W8 markdown and board print the same P(loses money) for both scenarios', md2.includes('P(loses money) **' + pct(ls.portfolio.pLoss) + '%**') && wide.includes('P(LOSES MONEY) ' + pct(ls.portfolio.pLoss) + '%') && md2.includes('**' + pct(ls.scenarios.shared.pLoss) + '%**'));
  const nb = flat(lan).length, nsc = flat(lan).length;
  check('W9 the board\'s "N FLAGGED" equals the number of scoreable bets carrying at least one audit', wide.includes(flat(lan).filter(b => ls.bets.get(b.srcLine).audits.length).length + ' FLAGGED'));
  // audits on both sides of each switch
  const aud = s => simulate(parse('G\n  A: ' + s)).bets.get(2).audits;
  check('W10 audit thresholds: odds 90-95 flags ODDS IMPLY CERTAINTY, 89-95 does not; 5-10 flags, 5-11 does not', aud('stake 1, odds 90-95%, payoff 2').includes('ODDS IMPLY CERTAINTY') && !aud('stake 1, odds 89-95%, payoff 2').includes('ODDS IMPLY CERTAINTY') && aud('stake 1, odds 5-10%, payoff 2').includes('ODDS IMPLY CERTAINTY') && !aud('stake 1, odds 5-11%, payoff 2').includes('ODDS IMPLY CERTAINTY'));
  check('W10b a range that reaches 100% ("odds 50-100%") is not flagged ODDS IMPLY CERTAINTY (recorded: the audit reads only the low end >= 90 or the high end <= 10)', !aud('stake 1, odds 50-100%, payoff 2').includes('ODDS IMPLY CERTAINTY'));
  check('W11 LOSES AT P50 switches on the sign of per-bet EV P50 (EV +0.1 no, EV -0.1 yes)', !aud('stake 10, odds 50%, payoff 20.2').includes('LOSES AT P50') && aud('stake 10, odds 50%, payoff 19.8').includes('LOSES AT P50'));
  // diff headline wording
  const was = parse('G\n  A: stake 10, odds 50%, payoff 30\n  B: stake 5, odds 50%, payoff 30'), now = parse('G\n  A: stake 20, odds 50%, payoff 30\n  B: stake 5, odds 50%, payoff 30');
  const view = betsDiffView(betsDiff(was, now), 'snap');
  check('W12 snapshot headline names what changed: a stake-only change does not read "odds moved"', !/odds moved/.test(view.headline), `"${view.headline}" for a stake change 10 -> 20 (documented trade-off in diff.js)`);
  const dup = parse('Growth\n  Pilot: stake 10, odds 50%, payoff 30\nPlatform\n  Pilot: stake 5, odds 50%, payoff 30');
  check('W13 comparison is not paused for the same bet name in two DIFFERENT groups (the occurrence key already includes the group)', comparisonSafety(dup, dup).safe, comparisonSafety(dup, dup).warning);
  // presentation vs board agree
  const pres = svgText(renderBetsPresentation(lan, ls, {...ctxN, intent: 'presentation'}));
  check('W14 presentation export prints the same P(loses money) and median as the board for both scenarios', pres.includes('P(LOSES MONEY) ' + pct(ls.portfolio.pLoss) + '%') && pres.includes('MEDIAN ' + p50Text(ls.portfolio)) && pres.includes('P(LOSES MONEY) ' + pct(ls.scenarios.shared.pLoss) + '%'));
  check('W15 presentation per-bet columns are labelled as EV (the board says "EV P10"; the slide says bare "P10 | P50 | P90" over per-bet EV, the same words it uses for portfolio outcomes)', /EV P10|P10 EV/.test(pres), 'slide column heads: "P10 | P50 | P90"');
  const nqc = svgText(renderQuadrant(parse('G\n  A: stake 10, odds 50%, payoff 30\n  Bad: stake 10\nEmpty\nOther\n  C: stake 10, odds 50%, payoff 30'), simulate(parse('G\n  A: stake 10, odds 50%, payoff 30\n  Bad: stake 10\nEmpty\nOther\n  C: stake 10, odds 50%, payoff 30')), {...ctxN, width: 400}));
  check('W16 narrow quadrant count line counts every bet and only lanes that hold bets (3 bets, 2 lanes here)', /3 bets · 2 lanes/.test(nqc), `prints "${(/\d+ bets · \d+ lanes/.exec(nqc) || [''])[0]}" (unscored bet dropped, empty group counted)`);
  // the engine's own verdict sentence is never shown: record
  check('W17 recorded: engine.js verdictParts()/verdictCopy() is not imported by any surface (dead copy; the board owns the reading)', !/verdictParts|verdictCopy/.test(appSrc) && typeof verdictParts === 'function');
}

// =============================================================================================
// 5. MODELLING QUESTIONS (demonstrated)
// =============================================================================================
{
  const c = [{stake: 100, p: .9, pay: 110}, {stake: 100, p: .9, pay: 110}], x = exactPoint(c), e = simulate(parse(toSrc(c)));
  check('Q1 recorded (BT-Q1): "Shared-outcome stress" can read SAFER than the baseline: two bets each stake 100, 90% odds, payoff 110 lose money 19% of the time independently but 10% under the stress', x.pLossSh < x.pLossInd && e.scenarios.shared.pLoss < e.portfolio.pLoss, `exact independent ${(100 * x.pLossInd).toFixed(0)}%, shared ${(100 * x.pLossSh).toFixed(0)}%; engine ${pct(e.portfolio.pLoss)}% vs ${pct(e.scenarios.shared.pLoss)}%`);
  const z = simulate(parse('G\n  A: stake 10, odds 50%, payoff 0-100')), r = refSim(parse('G\n  A: stake 10, odds 50%, payoff 0-100'), SEED, 200000);
  const meanPay = (mean(r.bs[0].ev) + 10) / 0.5;
  check('Q2 recorded (BT-Q2): a range with a zero lower bound falls back from log-normal to a normal clipped at 0, so "payoff 0-100" has about a 5% point mass at 0 and a mean above the midpoint', meanPay > 50, `simulated mean payoff ${meanPay.toFixed(1)} vs midpoint 50`);
  const o = refSim(parse('G\n  A: stake 1, odds 0-100%, payoff 2'), SEED, 200000);
  const p0 = o.bs[0].ev.filter(v => v === -1).length / 200000;
  check('Q4 recorded (BT-Q4): odds are normal and clipped at 0 and 100%, so "odds 0-100%" puts about 5% of runs at exactly 0% and 5% at exactly 100%', Math.abs(p0 - 0.05) < 0.005, `share of runs at 0%: ${(100 * p0).toFixed(2)}%`);
  check('Q5 recorded (BT-Q5): payoff is gross (a win returns payoff - stake), not net of stake; the DSL does not say which', simulate(parse('G\n  A: stake 10, odds 100%, payoff 10')).portfolio.p50 === 0);
  check('Q6 recorded (BT-Q6): the per-bet "EV" columns are the spread of p x payoff - stake over the uncertain inputs (an expected value per draw), not the spread of realised outcomes; LOSES AT P50 reads that EV median, the portfolio band reads realised outcomes', true);
}

// =============================================================================================
// 6. HOSTILE INPUTS
// =============================================================================================
{
  const w = s => parse('G\n  A: ' + s).warnings.map(x => x.msg);
  const b = s => parse('G\n  A: ' + s).groups[0].bets[0];
  check('P1 parser rejects or warns on a malformed number "stake 1.2.3"', b('stake 1.2.3, odds 50%, payoff 30').stake === null || w('stake 1.2.3, odds 50%, payoff 30').length > 0, `read as stake ${JSON.stringify(b('stake 1.2.3, odds 50%, payoff 30').stake)} with ${w('stake 1.2.3, odds 50%, payoff 30').length} warnings`);
  check('P2 parser warns when odds look like fractions ("odds 0.3-0.5" reads as 0.3-0.5%, not 30-50%)', w('stake 10, odds 0.3-0.5, payoff 30').length > 0, `read as ${JSON.stringify(b('stake 10, odds 0.3-0.5, payoff 30').odds)} %, no warning`);
  const th = parse('G\n  A: stake 1,000, odds 50%, payoff 3000'), thb = th.groups[0].bets[0], ths = simulate(th);
  check('P3 "stake 1,000" is not scored as a stake of 1 (a thousands separator)', !(thb.stake && thb.stake[0] === 1 && ths.bets.get(2).scoreable), `stake ${JSON.stringify(thb.stake)}, scoreable ${ths.bets.get(2).scoreable}, warning "${th.warnings.map(x => x.msg).join(' / ')}"`);
  check('P4 "stake 50%" (a percent sign on money) is not silently accepted', b('stake 50%, odds 50%, payoff 30').stake === null || w('stake 50%, odds 50%, payoff 30').length > 0, `stake ${JSON.stringify(b('stake 50%, odds 50%, payoff 30').stake)}, ${w('stake 50%, odds 50%, payoff 30').length} warnings`);
  const big = parse('G\n  A: stake 10, odds 50%, payoff ' + '9'.repeat(400) + '\n  B: stake 10, odds 50%, payoff 30'), bs = simulate(big);
  const finite = [bs.portfolio.p10, bs.portfolio.p50, bs.portfolio.p90].every(Number.isFinite);
  const bt = svgText(renderBoard(big, bs, ctxN));
  check('P5 a 400-digit payoff is rejected or warned, not simulated as Infinity', big.groups[0].bets[0].payoff === null || big.warnings.length > 0, `payoff ${big.groups[0].bets[0].payoff && big.groups[0].bets[0].payoff[0]}; portfolio P10/P50/P90 finite: ${finite}; board shows "${(/PORTFOLIO \| [^|]+\| [^|]+\| [^|]+\| [^|]+/.exec(bt) || [''])[0]}"`);
  const kd = parse('G\n  A: stake 1, odds 50%, payoff 2\n    kill: stop by 2026-02-31');
  check('P6 a kill date that does not exist (2026-02-31) warns', kd.warnings.length > 0, `kill.by = ${kd.groups[0].bets[0].kill.by}, ${kd.warnings.length} warnings`);
  let ok = true; try{ const m = parse('__proto__\n  __proto__: stake 10, odds 50%, payoff 30\n  constructor: stake 5, odds 50%, payoff 30'); const s = simulate(m); renderBoard(m, s, ctxN); markdown(m, s, ''); betsDiffView(betsDiff(m, m), 'x'); ok = s.scoreableCount === 2 && Object.prototype.toString.call({}) === '[object Object]'; }catch(e){ ok = false; }
  check('P7 names "__proto__" and "constructor" parse, simulate, render, export and diff without harm', ok);
  let ok2 = true; try{ for(const t of ['', '\n\n', 'title: x', 'G', 'G\n  A', 'G\n  A: stake 5']){ const m = parse(t), s = simulate(m); if(s.portfolio !== null) ok2 = false; if(flat(m).length) renderBoard(m, s, ctxN); } }catch(e){ ok2 = false; console.log(e); }
  check('P8 empty text, title only, a group with no bets and bets with no scoreable terms give no portfolio and do not throw', ok2);
  check('P9 a repeated attribute ("stake 10, stake 20") excludes the bet with a warning', b('stake 10, odds 50%, payoff 30, stake 20').stake === null && w('stake 10, odds 50%, payoff 30, stake 20').some(x => /more than once/.test(x)));
  check('P10 a descending range, a negative stake and odds above 100% each exclude the bet with a warning', b('stake 20-10, odds 50%, payoff 30').stake === null && b('stake -5, odds 50%, payoff 30').stake === null && b('stake 5, odds 50-120%, payoff 30').odds === null);
  check('P11 "odds 30-50" and "odds 30-50%" and "odds 30–50%" (en dash) read the same', JSON.stringify(b('stake 1, odds 30-50, payoff 2').odds) === JSON.stringify(b('stake 1, odds 30–50%, payoff 2').odds));
  check('P12 trailing junk after a value ("payoff 300-500 maybe") warns and excludes', b('stake 1, odds 30%, payoff 300-500 maybe').payoff === null);
}

console.log('\nBEFORE-VALUES (built-in examples, seed 0xBE75, 4000 runs):');
for(const [k, v] of Object.entries(BEFORE)) console.log(JSON.stringify({example: k, ...v}, (kk, vv) => kk === 'histogram' ? undefined : vv));
{ const m = parse(STARTER), s = simulate(m); console.log(JSON.stringify({example: 'Start your own', independent: s.portfolio, shared: s.scenarios.shared, conc: s.concentration, bets: flat(m).map(b => ({name: b.name, ev: s.bets.get(b.srcLine).ev, audits: s.bets.get(b.srcLine).audits}))}, (k, v) => k === 'histogram' ? undefined : v)); }
{ const m = parse(EMBED_SRC), s = simulate(m); console.log(JSON.stringify({example: 'Article embed (Reading portfolio)', independent: s.portfolio, shared: s.scenarios.shared, conc: s.concentration, bets: flat(m).map(b => ({name: b.name, ev: s.bets.get(b.srcLine).ev, audits: s.bets.get(b.srcLine).audits}))}, (k, v) => k === 'histogram' ? undefined : v)); }
done();
