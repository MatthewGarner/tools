/* Pure rank-stability engine: WSJF wobble simulation + verdict copy.
   Lifted verbatim from the inline script (same seed, same RNG call order)
   so results match what the tool has always shown. */
import {mulberry32} from '../assets/series.js';

export const NSIM = 4000;
export const SEED = 0x5EED;

export function sigmaW(ww){ return Math.log(1 + ww / 100) / 1.6448536; }
const clampScore = v => Math.max(1, Math.min(10, v));

export function simulate(state, {nsim = NSIM, seed = SEED} = {}){
  const items = state.items.filter(it =>
    it.s.every(v => isFinite(v) && v > 0) && isFinite(it.e) && it.e > 0);
  const n = items.length;
  if(n < 2) return null;
  const nc = state.criteria.length;
  const rand = mulberry32(seed);
  let gaussSpare = null;
  function gauss(){
    if(gaussSpare !== null){ const s = gaussSpare; gaussSpare = null; return s; }
    let u, v, s2;
    do { u = rand()*2 - 1; v = rand()*2 - 1; s2 = u*u + v*v; } while(s2 >= 1 || s2 === 0);
    const f = Math.sqrt(-2 * Math.log(s2) / s2);
    gaussSpare = v * f;
    return u * f;
  }

  const rankCounts = items.map(() => new Array(n).fill(0));
  const scoreBuf = new Array(n);
  const order = Array.from({length: n}, (_, i) => i);

  const sw = state.sw, sgw = sigmaW(state.ww);
  for(let sim = 0; sim < nsim; sim++){
    const ws = state.criteria.map(c => c.w * Math.exp(sgw * gauss()));
    for(let i = 0; i < n; i++){
      const it = items[i];
      let benefit = 0;
      for(let c = 0; c < nc; c++){
        benefit += ws[c] * clampScore(it.s[c] + (rand()*2 - 1) * sw);
      }
      const eff = clampScore(it.e + (rand()*2 - 1) * sw);
      scoreBuf[i] = benefit / eff;
    }
    order.sort((a, b) => scoreBuf[b] - scoreBuf[a]);
    for(let r = 0; r < n; r++) rankCounts[order[r]][r]++;
  }

  /* base ranking with unperturbed values */
  const baseScore = items.map(it => {
    let b = 0;
    state.criteria.forEach((c, ci) => { b += c.w * it.s[ci]; });
    return b / it.e;
  });
  const baseOrder = Array.from({length: n}, (_, i) => i)
    .sort((a, b) => baseScore[b] - baseScore[a]);

  const k = Math.max(1, Math.min(n, Math.round(state.k)));
  const stats = items.map((it, i) => {
    const counts = rankCounts[i];
    let cum = 0, p10 = 0, med = 0, p90 = n - 1, got10 = false, got50 = false;
    for(let r = 0; r < n; r++){
      cum += counts[r];
      if(!got10 && cum >= nsim * .05){ p10 = r; got10 = true; }
      if(!got50 && cum >= nsim * .50){ med = r; got50 = true; }
      if(cum >= nsim * .95){ p90 = r; break; }
    }
    let ptop = 0;
    for(let r = 0; r < k; r++) ptop += counts[r];
    return {i, name: it.name || 'Initiative ' + (i + 1), p10, med, p90, ptop: ptop / nsim};
  });
  return {stats, baseOrder, baseScore, n, k};
}

export function verdictCopy(stats, k){
  const secure = stats.filter(s => s.ptop >= 0.85);
  const contested = stats.filter(s => s.ptop > 0.15 && s.ptop < 0.85);
  let headline, body;
  if(contested.length === 0 && secure.length === k){
    headline = 'The top ' + k + ' is settled.';
    body = ' Every initiative that makes the cut does so in at least 85% of simulations — reasonable people with different weights get the same answer. Stop tuning the spreadsheet and start the work.';
  } else if(secure.length > 0){
    headline = secure.length + ' of the top ' + k + (secure.length === 1 ? ' is' : ' are') + ' settled.';
    body = ' ' + secure.map(s => s.name).join(', ') +
      (secure.length === 1 ? ' makes' : ' make') +
      ' the cut under any reasonable weights. The remaining ' + (k - secure.length) +
      (k - secure.length === 1 ? ' place is' : ' places are') + ' a genuine tie between ' +
      contested.map(s => s.name).join(', ') +
      ' — the framework can’t decide it, so decide it on strategy or sequencing.';
  } else {
    headline = 'Nothing is settled.';
    body = ' No initiative makes the top ' + k +
      ' in more than 85% of simulations — this ranking is mostly noise. Either the options are genuinely close (pick by strategy) or the scores need real evidence behind them.';
  }
  return {headline, body, contested};
}
