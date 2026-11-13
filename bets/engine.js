/* Seeded independent baseline plus paired maximum-positive-co-movement stress. */
import {quantile, Z90} from '../assets/series.js';
import {betKey, comparisonHeadline} from './diff.js';
import {NSIM, pv, evv, lossText, rangeText, oddsText, stakeOf, payoffOf, oddsOf, togetherNote} from './format.js';

const SEED = 0xBE75, BINS = 40;
export {NSIM};
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const mid = r => r ? (r[0] + r[1]) / 2 : 0;

export const OUTCOME_SCENARIOS = Object.freeze({
  independent: 'Independent baseline',
  shared: 'Shared-outcome stress',
});

export function scenarioReading(sim, key = 'independent'){
  const scenario = key === 'shared' ? 'shared' : 'independent';
  const portfolio = sim && sim.scenarios ? sim.scenarios[scenario] : sim.portfolio;
  return {key: scenario, label: OUTCOME_SCENARIOS[scenario], portfolio,
    available: !!portfolio, medianOutcome: portfolio ? portfolio.p50 : null};
}

/* Draw order, fixed for every saved link: per run, per SCOREABLE bet in source order,
   one normal draw for odds, one for payoff, one for stake — ALWAYS, a point value
   draws and discards — then one uniform for the win/loss. Unscoreable bets draw
   nothing. The shared scenario reuses the first scoreable bet's uniform. Because the
   count of draws never depends on a value being a point or a range, a hairline edit
   cannot shift every later draw. */
const POINT = 0, NORM = 1, LOGN = 2;
function plan(range, dist){
  const [lo, hi] = range;
  if(lo === hi) return {kind: POINT, a: lo, b: 0};
  if(dist === 'logn' && lo > 0) return {kind: LOGN, a: (Math.log(lo) + Math.log(hi)) / 2, b: (Math.log(hi) - Math.log(lo)) / (2 * Z90)};
  return {kind: NORM, a: (lo + hi) / 2, b: (hi - lo) / (2 * Z90)};
}

export function simulate(model, {seed = SEED, nsim = NSIM} = {}){
  /* mulberry32 and the carried-spare polar normal from assets/series.js, written inline so the
     hot loop pays no closure calls; the stream is the same, draw for draw (tests transcribe it) */
  let state = seed | 0, spare = 0, hasSpare = false;
  const rand = () => {
    state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const gauss = () => {
    if(hasSpare){ hasSpare = false; return spare; }
    let u, v, s2;
    do {
      state = state + 0x6D2B79F5 | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      u = ((t ^ t >>> 14) >>> 0) / 2147483648 - 1;
      state = state + 0x6D2B79F5 | 0;
      t = Math.imul(state ^ state >>> 15, 1 | state);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      v = ((t ^ t >>> 14) >>> 0) / 2147483648 - 1;
      s2 = u * u + v * v;
    } while(s2 >= 1 || s2 === 0);
    const f = Math.sqrt(-2 * Math.log(s2) / s2);
    spare = v * f; hasSpare = true;
    return u * f;
  };
  const sim = [];
  for(const g of model.groups) for(const b of g.bets){
    const ok = !!(b.stake && b.odds && b.payoff);
    sim.push({bet: b, ok, ev: null,
      odds: ok ? plan(b.odds, 'norm') : null, pay: ok ? plan(b.payoff, 'logn') : null, stk: ok ? plan(b.stake, 'logn') : null});
  }
  const live = sim.filter(record => record.ok), nb = live.length, scoreableCount = nb;
  const oK = new Uint8Array(nb), oA = new Float64Array(nb), oB = new Float64Array(nb),
    pK = new Uint8Array(nb), pA = new Float64Array(nb), pB = new Float64Array(nb),
    sK = new Uint8Array(nb), sA = new Float64Array(nb), sB = new Float64Array(nb);
  live.forEach((r, j) => {
    oK[j] = r.odds.kind; oA[j] = r.odds.a; oB[j] = r.odds.b;
    pK[j] = r.pay.kind; pA[j] = r.pay.a; pB[j] = r.pay.b;
    sK[j] = r.stk.kind; sA[j] = r.stk.a; sB[j] = r.stk.b;
    r.ev = new Float64Array(nsim);
  });
  const evs = live.map(r => r.ev);

  const portfolio = new Float64Array(nsim), sharedPortfolio = new Float64Array(nsim);
  for(let i = 0; i < nsim; i++){
    let outcome = 0, sharedOutcome = 0, sharedDraw = -1;
    for(let j = 0; j < nb; j++){
      let z = gauss();
      const odds = oK[j] === POINT ? oA[j] : oA[j] + oB[j] * z;
      z = gauss();
      const pay0 = pK[j] === POINT ? pA[j] : pK[j] === LOGN ? Math.exp(pA[j] + pB[j] * z) : pA[j] + pB[j] * z;
      z = gauss();
      const stk0 = sK[j] === POINT ? sA[j] : sK[j] === LOGN ? Math.exp(sA[j] + sB[j] * z) : sA[j] + sB[j] * z;
      const p = (odds < 0 ? 0 : odds > 100 ? 100 : odds) / 100, pay = pay0 > 0 ? pay0 : 0, stk = stk0 > 0 ? stk0 : 0;
      evs[j][i] = p * pay - stk;
      const independentDraw = rand();
      if(sharedDraw < 0) sharedDraw = independentDraw;
      outcome += (independentDraw < p ? pay : 0) - stk;
      sharedOutcome += (sharedDraw < p ? pay : 0) - stk;
    }
    portfolio[i] = outcome;
    sharedPortfolio[i] = sharedOutcome;
  }

  const bets = new Map();
  for(const s of sim){
    if(!s.ok){ bets.set(s.bet.srcLine, {ev: {p10: 0, p50: 0, p90: 0, step: 1}, audits: auditsFor(s.bet, {p50: 0}), scoreable: false}); continue; }
    const ev = threeQuantiles(s.ev);
    ev.step = evStepFor([ev.p10, ev.p50, ev.p90]);
    bets.set(s.bet.srcLine, {ev, audits: auditsFor(s.bet, ev), scoreable: true});
  }

  /* nothing is left to chance only when every scoreable bet is a point value and
     its odds are exactly 0 or 100: then an all-or-none count is the truth */
  const certain = live.every(({bet: b}) =>
    b.stake[0] === b.stake[1] && b.payoff[0] === b.payoff[1] && b.odds[0] === b.odds[1] && (b.odds[0] === 0 || b.odds[0] === 100));
  const independent = scoreableCount ? portfolioSummary(portfolio, nsim, certain) : null;
  const shared = scoreableCount ? portfolioSummary(sharedPortfolio, nsim, certain) : null;
  /* every printed portfolio outcome (both scenarios, the split values) shares ONE step */
  if(independent){
    const values = [];
    for(const pf of [independent, shared]){ values.push(pf.p10, pf.p50, pf.p90); if(pf.split) values.push(pf.split.lo, pf.split.hi); }
    independent.step = shared.step = stepFor(values, 10);
  }
  return {
    bets,
    scoreableCount,
    portfolio: independent,
    scenarios: {declared: 'independent', independent, shared},
    concentration: concentrationOf(live.map(record => record.bet)),
  };
}

/* a bet's EV trio is printed to the smallest power of ten that is at least 0.5% of its largest
   magnitude: the sampling noise of an EV quantile is about a quarter of a percent of it */
export function evStepFor(values){
  const top = Math.max(0, ...values.map(v => Math.abs(v)));
  return top > 0 && Number.isFinite(top) ? Math.pow(10, Math.ceil(Math.log10(0.005 * top) - 1e-12)) : 1;
}

/* A figure is printed to what the runs support: for portfolio outcomes a tenth of the power
   of ten of the largest of them. */
export function stepFor(values, divisor){
  const top = Math.max(0, ...values.map(v => Math.abs(v)));
  return top > 0 && Number.isFinite(top) ? Math.pow(10, Math.floor(Math.log10(top))) / divisor : 1;
}

/* the q-quantile (linear between neighbours) by selection: no full sort of a
   40,000-run array that only needs three order statistics. Reorders `a`. */
/* Order statistics without sorting 40,000 runs: one pass drops every run into one of
   4,096 equal-width bins, and an exact rank is then found by sorting only the few
   runs in the bins that hold it. The values are the same ones a full sort would
   give, so quantile() arithmetic on them is bit-for-bit the same. */
const BINS_RANK = 4096;
function rankIndex(a){
  let mn = Infinity, mx = -Infinity;
  for(let i = 0; i < a.length; i++){ const v = a[i]; if(v < mn) mn = v; if(v > mx) mx = v; }
  const scale = mx > mn ? BINS_RANK / (mx - mn) : 0, start = new Int32Array(BINS_RANK + 1);   // start[b]: runs in bins below b
  for(let i = 0; i < a.length; i++){ const b = scale ? Math.min(BINS_RANK - 1, ((a[i] - mn) * scale) | 0) : 0; start[b + 1]++; }
  for(let b = 0; b < BINS_RANK; b++) start[b + 1] += start[b];
  return {a, mn, scale, start};
}
const binOf = (ix, v) => ix.scale ? Math.min(BINS_RANK - 1, ((v - ix.mn) * ix.scale) | 0) : 0;
function binHolding(ix, rank){                    // the bin whose runs include sorted position `rank`
  let lo = 0, hi = BINS_RANK - 1;
  while(lo < hi){ const mid = (lo + hi) >> 1; if(ix.start[mid + 1] > rank) hi = mid; else lo = mid + 1; }
  return lo;
}
/* The sorted values at several position ranges ([lo, hi] inclusive, any order), found with ONE
   scan of the runs: the bins holding every range are gathered together and sorted. Returns one
   array of values per range. */
function sortedRanges(ix, ranges){
  const a = ix.a, spans = ranges.map(([lo, hi], r) => ({r, lo, hi, b0: binHolding(ix, lo), b1: binHolding(ix, hi)}))
    .sort((x, y) => x.b0 - y.b0);
  const groups = [];
  for(const sp of spans){
    const g = groups[groups.length - 1];
    if(g && sp.b0 <= g.b1){ g.b1 = Math.max(g.b1, sp.b1); g.members.push(sp); }
    else groups.push({b0: sp.b0, b1: sp.b1, members: [sp]});
  }
  const owner = new Int16Array(BINS_RANK).fill(-1);
  groups.forEach((g, gi) => {
    for(let b = g.b0; b <= g.b1; b++) owner[b] = gi;
    g.values = new Float64Array(ix.start[g.b1 + 1] - ix.start[g.b0]); g.k = 0;
  });
  for(let i = 0; i < a.length; i++){ const gi = owner[binOf(ix, a[i])]; if(gi >= 0){ const g = groups[gi]; g.values[g.k++] = a[i]; } }
  const out = new Array(ranges.length);
  for(const g of groups){
    g.values.sort();
    for(const sp of g.members){ const off = sp.lo - ix.start[g.b0]; out[sp.r] = g.values.subarray(off, off + sp.hi - sp.lo + 1); }
  }
  return out;
}
/* quantile() of the sorted runs restricted to positions first..first+count-1, for several (q, first, count) at once */
function rankQuantiles(ix, asks){
  const want = asks.map(([q, first, count]) => { const idx = q * (count - 1), f = Math.floor(idx); return {f, idx, c: Math.ceil(idx), first}; });
  const vals = sortedRanges(ix, want.map(w => [w.first + w.f, w.first + w.c]));
  return want.map((w, i) => vals[i][0] + (vals[i][w.c - w.f] - vals[i][0]) * (w.idx - w.f));
}
const rankQuantile = (ix, q, first, count) => rankQuantiles(ix, [[q, first, count]])[0];
function sortedRange(ix, lo, hi){ return sortedRanges(ix, [[lo, hi]])[0]; }
function threeQuantiles(a){
  const ix = rankIndex(a), n = a.length, [p10, p50, p90] = rankQuantiles(ix, [[0.1, 0, n], [0.5, 0, n], [0.9, 0, n]]);
  return {p10, p50, p90};
}

/* Everything printed from the outcome distribution comes from a handful of order
   statistics, so the 40,000 runs are partitioned, never fully sorted: P10/P50/P90, the
   45-55% band (sorted, it is a tenth of the runs) for the empty-stretch test, and the
   medians of the runs either side of a gap. Reorders `outcomes`. */
function portfolioSummary(outcomes, nsim, certain){
  let lossRuns = 0;
  for(let i = 0; i < nsim; i++) if(outcomes[i] < 0) lossRuns++;
  const pLoss = lossRuns / nsim;
  const picture = histogram(outcomes.slice(0, Math.min(nsim, HIST_RUNS)));   // a picture: the first runs are plenty
  const ix = rankIndex(outcomes), n = nsim;
  const [p10, p50, p90] = rankQuantiles(ix, [[0.1, 0, n], [0.5, 0, n], [0.9, 0, n]]);
  const split = medianSplitOf(ix, n, p10, p90);
  return {
    p10, p50, p90,
    pLoss, lossRuns, runs: nsim, certain, gapShare: split.share, split: split.split,
    histogram: picture,
  };
}

/* A median that falls in an empty stretch of the outcome distribution is not a
   stable figure: which side of the gap it lands on is an accident of the seed.
   Among the sorted outcomes lying between the 45% and 55% levels, take the widest
   gap between neighbours as a share of P90 - P10. If it is more than SPLIT_SHARE (2%;
   smooth portfolios measure under 0.5%, real gaps over 3%),
   report the median of the runs below the gap and the median of the runs above
   it (two ordinary quantiles of the same sorted runs). Detection only: no extra draw. */
export const SPLIT_SHARE = 0.02;
const BAND_LO = 0.45, BAND_HI = 0.55;
function bandGap(a, from, to, range){            // a[from..to] sorted
  let widest = 0, at = -1;
  for(let i = from; i < to; i++){
    const gap = a[i + 1] - a[i];
    if(gap > widest){ widest = gap; at = i; }
  }
  return {share: widest / range, at};
}
/* on an already-sorted array (the definition, kept for tests) */
export function widestGap(sorted, p10, p90){
  const n = sorted.length, range = p90 - p10;
  if(n < 3 || !(range > 0)) return {share: 0, at: -1};
  return bandGap(sorted, Math.floor(BAND_LO * (n - 1)), Math.ceil(BAND_HI * (n - 1)), range);
}
export function medianSplit(sorted, p10, p90){
  const {share, at} = widestGap(sorted, p10, p90);
  if(!(share > SPLIT_SHARE)) return null;
  return {lo: quantile(sorted.slice(0, at + 1), 0.5), hi: quantile(sorted.slice(at + 1), 0.5)};
}
/* the same answer from unsorted runs, by rank index (see portfolioSummary) */
function medianSplitOf(ix, n, p10, p90){
  const range = p90 - p10;
  if(n < 3 || !(range > 0)) return {share: 0, split: null};
  const from = Math.floor(BAND_LO * (n - 1)), to = Math.ceil(BAND_HI * (n - 1));
  const band = sortedRange(ix, from, to);
  const {share, at: i} = bandGap(band, 0, band.length - 1, range), at = i + from;
  if(!(share > SPLIT_SHARE)) return {share, split: null};
  const [lo, hi] = rankQuantiles(ix, [[0.5, 0, at + 1], [0.5, at + 1, n - at - 1]]);
  return {share, split: {lo, hi}};
}

function auditsFor(bet, ev){
  const a = [];
  if(!bet.kill) a.push('NO KILL CRITERION');
  if(bet.odds && (bet.odds[0] >= 90 || bet.odds[1] <= 10)) a.push('ODDS IMPLY CERTAINTY');
  if(ev.p50 < 0) a.push('LOSES AT P50');
  return a;
}

/* Bets at or above the 40% line, largest first. One bet alone is no
   concentration finding, so a single scoreable bet has none. The result keeps
   the largest bet's name/srcLine/share and lists every bet over the line in `all`. */
function concentrationOf(flat){
  if(flat.length < 2) return null;
  const stakes = flat.map(b => mid(b.stake));
  const total = stakes.reduce((t, v) => t + v, 0);
  if(total <= 0) return null;
  const all = flat.map((b, i) => ({name: b.name, srcLine: b.srcLine, share: stakes[i] / total}))
    .filter(item => item.share >= 0.40)
    .sort((a, b) => b.share - a.share || a.srcLine - b.srcLine);
  return all.length ? {...all[0], all} : null;
}

const HIST_RUNS = 4000;
function histogram(runs){
  runs.sort();
  const lo = quantile(runs, 0.01), hi = quantile(runs, 0.99);
  const w = (hi - lo) / BINS;
  const bins = Array.from({length: BINS}, (_, i) => [lo + i * w, lo + (i + 1) * w, 0]);
  for(const v of runs){
    const idx = w > 0 ? clamp(Math.floor((v - lo) / w), 0, BINS - 1) : 0;
    bins[idx][2]++;
  }
  return bins;
}

export function verdictParts(portfolio, counts){
  const pct = Math.round(portfolio.pLoss * 100);
  const fig = pct + '%';
  const nk = counts.kill || 0;
  const lead = portfolio.p50 >= 0
    ? 'The portfolio nets a positive P50, but loses money ' + fig + ' of the time'
    : 'The portfolio loses money at P50 — and ' + fig + ' of the time overall';
  const tail = nk ? '; ' + nk + ' bet' + (nk === 1 ? '' : 's') + ' can\'t say when to fold.' : '.';
  return {line: lead + tail, fig};
}

export function verdictCopy(portfolio, counts){
  return verdictParts(portfolio, counts).line;
}

export function markdown(model, sim, href, {comparison = null, sourceLabel = ''} = {}){
  const u = model.unit ? ' ' + mdInline(model.unit) : '', tu = model.unit ? ' ' + mdCell(model.unit) : '';
  const out = ['# ' + mdInline(model.title || 'Bets board'), ''];
  out.push('| Group | Bet | Stake' + tu + ' | Odds | Payoff' + tu + ' | EV P10–P90 (P50) | Kill criterion | Flags |');
  out.push('|-------|-----|------|------|--------|-------------------|----------------|-------|');
  for(const g of model.groups){
    for(const b of g.bets){
      const r = sim.bets.get(b.srcLine);
      const kill = b.kill ? b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '') : '—';
      out.push('| ' + [g.name, b.name, stakeOf(b), oddsOf(b), payoffOf(b),
        r.scoreable ? evv(r.ev, r.ev.p10) + ' to ' + evv(r.ev, r.ev.p90) + ' (' + evv(r.ev, r.ev.p50) + ')' : 'NOT SCORED', kill,
        r.scoreable ? (r.audits.join('; ') || '—') : 'NOT SCORED — correct invalid or missing terms']
        .map(mdCell).join(' | ') + ' |');
    }
  }
  const baseline = scenarioReading(sim, 'independent');
  const shared = scenarioReading(sim, 'shared');
  const line = reading => {
    if(!reading.available) return reading.label + ': **Not available — no scoreable bets.**';
    const pf = reading.portfolio, range = ' [' + pv(pf, pf.p10) + ' to ' + pv(pf, pf.p90) + ']';
    return reading.label + ': ' + (pf.split
      ? 'Median outcome split: about even odds of **' + pv(pf, pf.split.lo) + ' or ' + pv(pf, pf.split.hi) + u + '**'
      : 'Median outcome **' + pv(pf, pf.p50) + u + '**') + range + ' · P(loses money) **' + lossText(pf) + '**.';
  };
  out.push('', line(baseline), '', line(shared) +
    ' Only realised win/loss outcomes share one common draw; stake, odds and payoff ranges remain independently sampled. This is a stress, not a forecast.');
  const together = togetherNote(baseline.portfolio, shared.portfolio);
  if(together) out.push('', together);
  if(sim.concentration){
    const all = sim.concentration.all || [sim.concentration], pc = s => Math.round(s.share * 100) + '%';
    out.push('', '**Concentration:** ' + (all.length === 1
      ? mdCell(all[0].name) + ' carries ' + pc(all[0]) + ' of total scored stake.'
      : all.map(s => mdCell(s.name) + ' (' + pc(s) + ')').join(', ') + ' each carry 40% or more of total scored stake.'));
  }
  out.push(...comparisonMarkdown(model, comparison));
  if(href) out.push('', '[Open in bets](' + mdHref(href) + ')');
  else if(sourceLabel) out.push('', '_' + mdInline(sourceLabel) + '_');
  return out.join('\n') + '\n';
}
const mdInline = value => String(value == null ? '—' : value).replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([`*_[\]!])/g, '\\$1');
const mdCell = value => mdInline(value).replace(/\|/g, '\\|');
const mdHref = value => String(value).replace(/\\/g, '%5C').replace(/</g, '%3C').replace(/>/g, '%3E')
  .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/[\r\n ]/g, '%20');

function comparisonMarkdown(model, comparison){
  if(!comparison) return [];
  const out = ['', '## Selected comparison', '', mdInline(comparisonHeadline(comparison, model)), '',
    '**Scope:** Current allocations versus the selected baseline; prior portfolio values use its Independent baseline.'];
  const bets = model.groups.flatMap(g => g.bets.map(b => ({...b, group:g.name})));
  const additions = bets.filter(bet => comparison.newKeys.has(betKey(bet)));
  const name = b => mdInline(b.group) + ' — ' + mdInline(b.name);
  if(additions.length) out.push('', '**New:** ' + additions.map(name).join('; '));
  const changes = bets.filter(b => comparison.movedFields.has(betKey(b))).map(b => {
    const old = comparison.movedFields.get(betKey(b)), facts = [];
    if(old.stake) facts.push('stake ' + rangeText(old.stake) + ' → ' + stakeOf(b));
    if(old.odds) facts.push('odds ' + oddsText(old.odds) + ' → ' + oddsOf(b));
    if(old.payoff) facts.push('payoff ' + rangeText(old.payoff) + ' → ' + payoffOf(b));
    return name(b) + (facts.length ? ' (' + facts.join(', ') + ')' : ' (kill criterion changed)');
  });
  if(changes.length) out.push('', '**Changed:** ' + changes.join('; '));
  const prior = comparison.prevSim && scenarioReading(comparison.prevSim, 'independent'), pu = comparison.previousUnit;
  if(prior?.available){
    const n = value => pv(prior.portfolio, value) + (pu ? ' ' + mdInline(pu) : '');
    const unit = pu ? ' ' + mdInline(pu) : '';
    out.push('', '**Prior Independent baseline:** P10 **' + n(prior.portfolio.p10) + '** · P50 **' +
      (prior.portfolio.split ? pv(prior.portfolio, prior.portfolio.split.lo) + ' or ' + pv(prior.portfolio, prior.portfolio.split.hi) + unit : n(prior.portfolio.p50)) +
      '** · P90 **' + n(prior.portfolio.p90) + '**.');
  }
  if(comparison.killed.length) out.push('', '**Removed allocations:**', ...comparison.killed.map(b => {
    const bu = pu ? ' ' + mdInline(pu) : '', kill = b.kill ? b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '') : '—';
    return '- ' + name(b) + ': stake ' + stakeOf(b) + bu + '; odds ' + oddsOf(b) +
      '; payoff ' + payoffOf(b) + bu + '; kill ' + mdInline(kill) + '.';
  }));
  return out;
}

