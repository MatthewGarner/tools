/* Seeded independent baseline plus paired maximum-positive-co-movement stress. */
import {mulberry32, gaussian, rangeSampler, quantile, fmt} from '../assets/series.js';
import {betKey} from './diff.js';

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

  const independent = scoreableCount ? portfolioSummary(portfolio, nsim) : null;
  const shared = scoreableCount ? portfolioSummary(sharedPortfolio, nsim) : null;
  return {
    bets,
    scoreableCount,
    portfolio: independent,
    scenarios: {declared: 'independent', independent, shared},
    concentration: concentrationOf(sim.filter(record => record.ok).map(record => record.bet)),
  };
}

function portfolioSummary(outcomes, nsim){
  outcomes.sort((a, b) => a - b);
  const pLoss = outcomes.filter(v => v < 0).length / nsim;
  return {
    p10: quantile(outcomes, 0.1), p50: quantile(outcomes, 0.5), p90: quantile(outcomes, 0.9),
    pLoss, histogram: histogram(outcomes, nsim),
  };
}

function auditsFor(bet, ev){
  const a = [];
  if(!bet.kill) a.push('NO KILL CRITERION');
  if(bet.odds && (bet.odds[0] >= 90 || bet.odds[1] <= 10)) a.push('ODDS IMPLY CERTAINTY');
  if(ev.p50 < 0) a.push('LOSES AT P50');
  return a;
}

function concentrationOf(flat){
  const stakes = flat.map(b => mid(b.stake));
  const total = stakes.reduce((t, v) => t + v, 0);
  if(total <= 0) return null;
  let bi = -1, best = 0;
  stakes.forEach((v, i) => { if(v > best){ best = v; bi = i; } });
  const share = best / total;
  return share >= 0.40 ? {name: flat[bi].name, srcLine: flat[bi].srcLine, share} : null;
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
      out.push('| ' + [g.name, b.name, rng(b.stake), pct(b.odds), rng(b.payoff),
        r.scoreable ? fmt(r.ev.p10) + '–' + fmt(r.ev.p90) + ' (' + fmt(r.ev.p50) + ')' : 'NOT SCORED', kill,
        r.scoreable ? (r.audits.join('; ') || '—') : 'NOT SCORED — correct invalid or missing terms']
        .map(mdCell).join(' | ') + ' |');
    }
  }
  const baseline = scenarioReading(sim, 'independent');
  const shared = scenarioReading(sim, 'shared');
  const line = reading => !reading.available ? reading.label + ': **Not available — no scoreable bets.**' :
    reading.label + ': Median outcome **' + fmt(reading.medianOutcome) + u + '** [' +
      fmt(reading.portfolio.p10) + '–' + fmt(reading.portfolio.p90) + '] · P(loses money) **' +
      Math.round(reading.portfolio.pLoss * 100) + '%**.';
  out.push('', line(baseline), '', line(shared) +
    ' Only realised win/loss outcomes share one common draw; stake, odds and payoff ranges remain independently sampled. This is a stress, not a forecast.');
  if(sim.concentration) out.push('', '**Concentration:** ' + mdCell(sim.concentration.name) + ' carries ' +
    Math.round(sim.concentration.share * 100) + '% of total scored stake.');
  out.push(...comparisonMarkdown(model, comparison));
  if(href) out.push('', '[Open in bets](' + mdHref(href) + ')');
  else if(sourceLabel) out.push('', '_' + mdInline(sourceLabel) + '_');
  return out.join('\n') + '\n';
}
const rng = r => !r ? '—' : r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];
const mdInline = value => String(value == null ? '—' : value).replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([`*_[\]!])/g, '\\$1');
const mdCell = value => mdInline(value).replace(/\|/g, '\\|');
const mdHref = value => String(value).replace(/\\/g, '%5C').replace(/</g, '%3C').replace(/>/g, '%3E')
  .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/[\r\n ]/g, '%20');

function comparisonMarkdown(model, comparison){
  if(!comparison) return [];
  const out = ['', '## Selected comparison', '', mdInline(comparison.headline), '',
    '**Scope:** Current allocations versus the selected baseline; prior portfolio values use its Independent baseline.'];
  const bets = model.groups.flatMap(g => g.bets.map(b => ({...b, group:g.name})));
  const additions = bets.filter(bet => comparison.newKeys.has(betKey(bet)));
  const name = b => mdInline(b.group) + ' — ' + mdInline(b.name);
  if(additions.length) out.push('', '**New:** ' + additions.map(name).join('; '));
  const changes = bets.filter(b => comparison.movedFields.has(betKey(b))).map(b => {
    const old = comparison.movedFields.get(betKey(b)), facts = [];
    if(old.stake) facts.push('stake ' + rng(old.stake) + ' → ' + rng(b.stake));
    if(old.odds) facts.push('odds ' + pct(old.odds) + ' → ' + pct(b.odds));
    if(old.payoff) facts.push('payoff ' + rng(old.payoff) + ' → ' + rng(b.payoff));
    return name(b) + (facts.length ? ' (' + facts.join(', ') + ')' : ' (kill criterion changed)');
  });
  if(changes.length) out.push('', '**Changed:** ' + changes.join('; '));
  const prior = comparison.prevSim && scenarioReading(comparison.prevSim, 'independent'), pu = comparison.previousUnit;
  if(prior?.available){
    const n = value => fmt(value) + (pu ? ' ' + mdInline(pu) : '');
    out.push('', '**Prior Independent baseline:** P10 **' + n(prior.portfolio.p10) + '** · P50 **' +
      n(prior.portfolio.p50) + '** · P90 **' + n(prior.portfolio.p90) + '**.');
  }
  if(comparison.killed.length) out.push('', '**Removed allocations:**', ...comparison.killed.map(b => {
    const bu = pu ? ' ' + mdInline(pu) : '', kill = b.kill ? b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '') : '—';
    return '- ' + name(b) + ': stake ' + rng(b.stake) + bu + '; odds ' + pct(b.odds) +
      '; payoff ' + rng(b.payoff) + bu + '; kill ' + mdInline(kill) + '.';
  }));
  return out;
}

const pct = r => r ? rng(r) + '%' : '—';
