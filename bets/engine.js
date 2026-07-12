/* Pure engine: one seeded Monte-Carlo pass yields TWO readings from the same
   draws (deliberately different questions):
     - per-bet EV band = distribution of p·payoff − stake (parameter uncertainty)
       → the slip band + LOSES AT P50 ("is this bet sound?")
     - portfolio fan + P(loses money) = distribution of REALISED outcomes,
       per sim per bet bernoulli(p)·payoff − stake, summed ("what might happen?")
   Odds sample as normal + clamp to 0–100 (percentages, not money); stake/payoff
   as lognormal + floor 0 (positive money). rangeSampler is a closure built ONCE
   per bet outside the loop; point ranges consume zero RNG. */
import {mulberry32, gaussian, rangeSampler, quantile, fmt} from '../assets/series.js';

const SEED = 0xBE75, NSIM = 4000, BINS = 40;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const mid = r => r ? (r[0] + r[1]) / 2 : 0;

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

  const portfolio = new Array(nsim);
  for(let i = 0; i < nsim; i++){
    let outcome = 0;
    for(const s of sim){
      if(!s.ok){ s.ev.push(0); continue; }
      const p = clamp(s.odds(), 0, 100) / 100;
      const pay = Math.max(0, s.pay());
      const stk = Math.max(0, s.stk());
      s.ev.push(p * pay - stk);
      outcome += (rand() < p ? pay : 0) - stk;
    }
    portfolio[i] = outcome;
  }

  const bets = new Map();
  for(const s of sim){
    const sorted = s.ev.slice().sort((a, b) => a - b);
    const ev = {p10: quantile(sorted, 0.1), p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9)};
    bets.set(s.bet.srcLine, {ev, audits: auditsFor(s.bet, ev)});
  }

  portfolio.sort((a, b) => a - b);
  const pLoss = portfolio.filter(v => v < 0).length / nsim;
  return {
    bets,
    portfolio: {
      p10: quantile(portfolio, 0.1), p50: quantile(portfolio, 0.5), p90: quantile(portfolio, 0.9),
      pLoss, histogram: histogram(portfolio, nsim),
    },
    concentration: concentrationOf(flat),
  };
}

/* audit order is fixed: kill, certainty, loses */
function auditsFor(bet, ev){
  const a = [];
  if(!bet.kill) a.push('NO KILL CRITERION');
  if(bet.odds && (bet.odds[0] >= 90 || (bet.odds[1] - bet.odds[0]) < 10)) a.push('ODDS IMPLY CERTAINTY');
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
  return share >= 0.40 ? {name: flat[bi].name, share} : null;
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

export function verdictCopy(portfolio, counts){
  const pct = Math.round(portfolio.pLoss * 100);
  const nk = counts.kill || 0;
  const lead = portfolio.p50 >= 0
    ? 'The portfolio nets a positive P50, but loses money ' + pct + '% of the time'
    : 'The portfolio loses money at P50 — and ' + pct + '% of the time overall';
  const tail = nk ? '; ' + nk + ' bet' + (nk === 1 ? '' : 's') + ' can\'t say when to fold.' : '.';
  return lead + tail;
}

export function markdown(model, sim, href){
  const u = model.unit ? ' ' + model.unit : '';
  const out = ['# ' + (model.title || 'Bets board'), ''];
  out.push('| Bet | Stake' + u + ' | Odds | Payoff' + u + ' | EV P50 | Flags |');
  out.push('|-----|------|------|--------|--------|-------|');
  for(const g of model.groups){
    for(const b of g.bets){
      const r = sim.bets.get(b.srcLine);
      out.push('| ' + b.name + ' | ' + rng(b.stake) + ' | ' + rng(b.odds) + '% | ' + rng(b.payoff) + ' | ' +
        fmt(r.ev.p50) + ' | ' + (r.audits.join('; ') || '—') + ' |');
    }
  }
  const p = sim.portfolio;
  out.push('', 'Portfolio net EV **' + fmt(p.p50) + u + '** [' + fmt(p.p10) + '–' + fmt(p.p90) + '] · P(loses money) **' +
    Math.round(p.pLoss * 100) + '%** — assumes bets are independent.');
  if(href) out.push('', '[Open in bets](' + href + ')');
  return out.join('\n') + '\n';
}
const rng = r => !r ? '—' : r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];
