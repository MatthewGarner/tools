/* Seeded independent baseline plus paired maximum-positive-co-movement stress. */
import {mulberry32, gaussian, rangeSampler, quantile} from '../assets/series.js';
import {betKey, comparisonHeadline} from './diff.js';
import {sgn, lossText, rangeText, oddsText, stakeOf, payoffOf, oddsOf, togetherNote} from './format.js';

const SEED = 0xBE75, NSIM = 4000, BINS = 40;
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

export function simulate(model, {seed = SEED, nsim = NSIM} = {}){
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const flat = [];
  for(const g of model.groups) for(const b of g.bets) flat.push(b);

  const sim = flat.map(b => ({
    bet: b,
    ok: !!(b.stake && b.odds && b.payoff),
    odds: b.odds ? rangeSampler(b.odds[0], b.odds[1], 'norm', rand, gauss) : null,
    pay: b.payoff ? rangeSampler(b.payoff[0], b.payoff[1], 'logn', rand, gauss) : null,
    stk: b.stake ? rangeSampler(b.stake[0], b.stake[1], 'logn', rand, gauss) : null,
    ev: [],
  }));
  const scoreableCount = sim.filter(record => record.ok).length;

  const portfolio = new Array(nsim);
  const sharedPortfolio = new Array(nsim);
  for(let i = 0; i < nsim; i++){
    let outcome = 0, sharedOutcome = 0, sharedDraw = null;
    for(const s of sim){
      if(!s.ok){ s.ev.push(0); continue; }
      const p = clamp(s.odds(), 0, 100) / 100;
      const pay = Math.max(0, s.pay());
      const stk = Math.max(0, s.stk());
      s.ev.push(p * pay - stk);
      const independentDraw = rand();
      if(sharedDraw === null) sharedDraw = independentDraw;
      outcome += (independentDraw < p ? pay : 0) - stk;
      sharedOutcome += (sharedDraw < p ? pay : 0) - stk;
    }
    portfolio[i] = outcome;
    sharedPortfolio[i] = sharedOutcome;
  }

  const bets = new Map();
  for(const s of sim){
    const sorted = s.ev.slice().sort((a, b) => a - b);
    const ev = {p10: quantile(sorted, 0.1), p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9)};
    bets.set(s.bet.srcLine, {ev, audits: auditsFor(s.bet, ev), scoreable: s.ok});
  }

  /* nothing is left to chance only when every scoreable bet is a point value and
     its odds are exactly 0 or 100: then an all-or-none count is the truth */
  const certain = sim.filter(record => record.ok).every(({bet: b}) =>
    b.stake[0] === b.stake[1] && b.payoff[0] === b.payoff[1] && b.odds[0] === b.odds[1] && (b.odds[0] === 0 || b.odds[0] === 100));
  const independent = scoreableCount ? portfolioSummary(portfolio, nsim, certain) : null;
  const shared = scoreableCount ? portfolioSummary(sharedPortfolio, nsim, certain) : null;
  return {
    bets,
    scoreableCount,
    portfolio: independent,
    scenarios: {declared: 'independent', independent, shared},
    concentration: concentrationOf(sim.filter(record => record.ok).map(record => record.bet)),
  };
}

function portfolioSummary(outcomes, nsim, certain){
  outcomes.sort((a, b) => a - b);
  const lossRuns = outcomes.filter(v => v < 0).length, pLoss = lossRuns / nsim;
  const p10 = quantile(outcomes, 0.1), p90 = quantile(outcomes, 0.9);
  return {
    p10, p50: quantile(outcomes, 0.5), p90,
    pLoss, lossRuns, runs: nsim, certain, gapShare: widestGap(outcomes, p10, p90).share, split: medianSplit(outcomes, p10, p90),
    histogram: histogram(outcomes, nsim),
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
export function widestGap(sorted, p10, p90){
  const n = sorted.length, range = p90 - p10;
  if(n < 3 || !(range > 0)) return {share: 0, at: -1};
  const from = Math.floor(0.45 * (n - 1)), to = Math.ceil(0.55 * (n - 1));
  let widest = 0, at = -1;
  for(let i = from; i < to; i++){
    const gap = sorted[i + 1] - sorted[i];
    if(gap > widest){ widest = gap; at = i; }
  }
  return {share: widest / range, at};
}
export function medianSplit(sorted, p10, p90){
  const {share, at} = widestGap(sorted, p10, p90);
  if(!(share > SPLIT_SHARE)) return null;
  return {lo: quantile(sorted.slice(0, at + 1), 0.5), hi: quantile(sorted.slice(at + 1), 0.5)};
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

function histogram(sorted, nsim){
  const lo = quantile(sorted, 0.01), hi = quantile(sorted, 0.99);
  const w = (hi - lo) / BINS;
  const bins = Array.from({length: BINS}, (_, i) => [lo + i * w, lo + (i + 1) * w, 0]);
  for(const v of sorted){
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
        r.scoreable ? sgn(r.ev.p10) + ' to ' + sgn(r.ev.p90) + ' (' + sgn(r.ev.p50) + ')' : 'NOT SCORED', kill,
        r.scoreable ? (r.audits.join('; ') || '—') : 'NOT SCORED — correct invalid or missing terms']
        .map(mdCell).join(' | ') + ' |');
    }
  }
  const baseline = scenarioReading(sim, 'independent');
  const shared = scenarioReading(sim, 'shared');
  const line = reading => {
    if(!reading.available) return reading.label + ': **Not available — no scoreable bets.**';
    const pf = reading.portfolio, range = ' [' + sgn(pf.p10) + ' to ' + sgn(pf.p90) + ']';
    return reading.label + ': ' + (pf.split
      ? 'Median outcome split: about even odds of **' + sgn(pf.split.lo) + ' or ' + sgn(pf.split.hi) + u + '**'
      : 'Median outcome **' + sgn(pf.p50) + u + '**') + range + ' · P(loses money) **' + lossText(pf) + '**.';
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
    const n = value => sgn(value) + (pu ? ' ' + mdInline(pu) : '');
    const unit = pu ? ' ' + mdInline(pu) : '';
    out.push('', '**Prior Independent baseline:** P10 **' + n(prior.portfolio.p10) + '** · P50 **' +
      (prior.portfolio.split ? sgn(prior.portfolio.split.lo) + ' or ' + sgn(prior.portfolio.split.hi) + unit : n(prior.portfolio.p50)) +
      '** · P90 **' + n(prior.portfolio.p90) + '**.');
  }
  if(comparison.killed.length) out.push('', '**Removed allocations:**', ...comparison.killed.map(b => {
    const bu = pu ? ' ' + mdInline(pu) : '', kill = b.kill ? b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '') : '—';
    return '- ' + name(b) + ': stake ' + stakeOf(b) + bu + '; odds ' + oddsOf(b) +
      '; payoff ' + payoffOf(b) + bu + '; kill ' + mdInline(kill) + '.';
  }));
  return out;
}

