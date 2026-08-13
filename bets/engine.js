/* Pure engine: one seeded Monte-Carlo pass yields the existing independent
   baseline plus a paired shared-outcome stress. Both scenarios reuse the
   same sampled stake, odds and payoff for every Bet; only the Bernoulli draw
   differs. The independent result remains at `portfolio` for backwards
   compatibility and remains seed-for-seed byte-identical for valid documents.

   The pass also yields two deliberately different kinds of reading:
     - per-bet EV band = distribution of p·payoff − stake (parameter uncertainty)
       → the slip band + LOSES AT P50 ("is this bet sound?")
     - portfolio fan + P(loses money) = distribution of REALISED outcomes.
       The baseline uses one uniform per Bet; the stress reuses the first
       scoreable Bet's uniform across every Bet in that run, the maximum
       positive co-movement compatible with their sampled marginal odds.
   Odds sample as normal + clamp to 0–100 (percentages, not money); stake/payoff
   as lognormal + floor 0 (positive money). rangeSampler is a closure built ONCE
   per bet outside the loop; point ranges consume zero RNG. */
import {mulberry32, gaussian, rangeSampler, quantile, fmt} from '../assets/series.js';

const SEED = 0xBE75, NSIM = 4000, BINS = 40;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const mid = r => r ? (r[0] + r[1]) / 2 : 0;

export const OUTCOME_SCENARIOS = Object.freeze({
  independent: 'Independent baseline',
  shared: 'Shared-outcome stress',
});

/* One terminology/selection seam for renderers and exports. `portfolio`
   remains the baseline alias so older consumers do not need to know the
   paired shape exists. */
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

  // samplers built once; a scoreable bet needs all three ranges
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
      /* Consume exactly the same draw, in the same position, as the legacy
         baseline. The first scoreable Bet's draw is also the run-wide stress
         draw, which keeps a one-Bet portfolio exactly paired rather than
         inventing a finite-sample difference between equivalent scenarios. */
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

/* audit order is fixed: kill, certainty, loses */
function auditsFor(bet, ev){
  const a = [];
  if(!bet.kill) a.push('NO KILL CRITERION');
  // near-certainty at EITHER extreme (a fact dressed as a forecast); a tight
  // MID band is over-precision, a different sin — it must not stamp here.
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

/* The verdict, split into the line and the ONE load-bearing figure it turns on
   — P(loses money), the number the whole simulation exists to produce. `fig`
   appears verbatim in `line`, so the surface can mark it without re-deriving it. */
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

/* The plain line — what the markdown export consumes. */
export function verdictCopy(portfolio, counts){
  return verdictParts(portfolio, counts).line;
}

export function markdown(model, sim, href){
  const u = model.unit ? ' ' + model.unit : '';
  const out = ['# ' + (model.title || 'Bets board'), ''];
  out.push('| Bet | Stake' + u + ' | Odds | Payoff' + u + ' | EV P50 | Flags |');
  out.push('|-----|------|------|--------|--------|-------|');
  for(const g of model.groups){
    for(const b of g.bets){
      const r = sim.bets.get(b.srcLine);
      out.push('| ' + b.name + ' | ' + rng(b.stake) + ' | ' + (b.odds ? rng(b.odds) + '%' : '—') + ' | ' + rng(b.payoff) + ' | ' +
        (r.scoreable ? fmt(r.ev.p50) : 'NOT SCORED') + ' | ' +
        (r.scoreable ? (r.audits.join('; ') || '—') : 'NOT SCORED — correct invalid or missing terms') + ' |');
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
  if(href) out.push('', '[Open in bets](' + href + ')');
  return out.join('\n') + '\n';
}
const rng = r => !r ? '—' : r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];
