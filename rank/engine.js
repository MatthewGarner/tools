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
  if(secure.length >= k){
    headline = 'The top ' + k + ' is settled.';
    body = ' Every initiative that makes the cut does so in at least 85% of simulations — reasonable people with different weights get the same answer. Stop tuning the spreadsheet and start the work.';
  } else if(secure.length > 0){
    headline = secure.length + ' of the top ' + k + (secure.length === 1 ? ' is' : ' are') + ' settled.';
    body = ' ' + secure.map(s => s.name).join(', ') +
      (secure.length === 1 ? ' makes' : ' make') +
      ' the cut under any reasonable weights. The remaining ' + (k - secure.length) +
      (k - secure.length === 1 ? ' place is' : ' places are') +
      (contested.length
        ? ' a genuine tie between ' + contested.map(s => s.name).join(', ') +
          ' — the framework can’t decide it, so decide it on strategy or sequencing.'
        : ' up for grabs across the rest of the field — no single challenger stands out, so decide on strategy or sequencing.');
  } else {
    headline = 'Nothing is settled.';
    body = ' No initiative makes the top ' + k +
      ' in more than 85% of simulations — this ranking is mostly noise. Either the options are genuinely close (pick by strategy) or the scores need real evidence behind them.';
  }
  return {headline, body, contested};
}

/* What flips #1: for each criterion and rival, the exact weight delta at which the
   rival's WSJF score equals the leader's (closed form — no simulation). Deterministic
   companion to the wobble: the wobble says how often ranks reshuffle; this names the
   cheapest single reweighting that dethrones the top item. */
export function flipAnalysis(state){
  const items = state.items.filter(it =>
    it.s.every(v => isFinite(v) && v > 0) && isFinite(it.e) && it.e > 0);
  return buildFlips(state, items);
}

function buildFlips(state, items){
  if(items.length < 2) return null;
  const benefit = it => state.criteria.reduce((a, c, ci) => a + c.w * it.s[ci], 0);
  const score = it => benefit(it) / it.e;
  let top = 0;
  items.forEach((it, i) => { if(score(it) > score(items[top])) top = i; });
  const A = items[top], BA = benefit(A);
  const flips = [];
  state.criteria.forEach((c, ci) => {
    if(!(c.w > 0)) return;                         // no relative change exists
    items.forEach((B, bi) => {
      if(bi === top) return;
      const BB = benefit(B);
      const den = A.s[ci] * B.e - B.s[ci] * A.e;
      if(Math.abs(den) < 1e-12) return;            // parallel: this weight can't separate them
      const delta = (BB * A.e - BA * B.e) / den;
      const newWeight = c.w + delta;
      if(!(newWeight > 0)) return;                 // would need a zero/negative weight
      flips.push({ci, criterion: c.name, rival: state.items.indexOf(B), rivalName: B.name || 'Initiative',
        delta, newWeight, pct: delta / c.w * 100});
    });
  });
  /* keep only the cheapest flip per criterion, then rank by relative size */
  const best = new Map();
  for(const f of flips){
    const cur = best.get(f.ci);
    if(!cur || Math.abs(f.pct) < Math.abs(cur.pct)) best.set(f.ci, f);
  }
  const ranked = [...best.values()].sort((a, b) => Math.abs(a.pct) - Math.abs(b.pct));
  return {top: {i: state.items.indexOf(A), name: A.name || 'Initiative'},
    flips: ranked, easiest: ranked[0] || null};
}

const fmtW = w => Math.round(w * 100) / 100;
export function flipCopy(flip, ww){
  if(!flip || !flip.easiest){
    return {tone: 'immovable',
      text: 'No single weight change flips first place — under this scheme the leader is structural.'};
  }
  const e = flip.easiest;
  const dir = e.delta > 0 ? 'raise' : 'cut';
  const pctAbs = Math.round(Math.abs(e.pct));
  const move = dir + ' ' + e.criterion + '’s weight ' + Math.abs(e.pct).toFixed(0) + '% (' +
    fmtW(e.newWeight - e.delta) + ' → ' + fmtW(e.newWeight) + ')';
  if(Math.abs(e.pct) <= ww){
    return {tone: 'fragile',
      text: 'Fragile first place: ' + move + ' and ' + e.rivalName + ' overtakes ' + flip.top.name +
        '. That’s inside the ±' + ww + '% you already call reasonable.'};
  }
  return {tone: 'robust',
    text: 'First place holds: the cheapest single reweighting that dethrones ' + flip.top.name +
      ' is ' + move + ' — ' + (pctAbs >= 999 ? 'far' : pctAbs + '%, well') +
      ' beyond the ±' + ww + '% wobble.'};
}

/* Per-row fragility probe (the knife-edge pill): does a ±nudge of ANY single criterion weight
   change THIS item's rank, by the tool's own score benefit/effort? Pure, deterministic. A fixed
   hair-trigger (default ±10%), distinct from the ww-keyed flipCopy verdict — labelled on-surface. */
export function perRowKnife(state, nudge = 0.1){
  const idx = state.items.map((_, i) => i);
  const valid = i => { const it = state.items[i]; return it.s.every(v => isFinite(v) && v > 0) && isFinite(it.e) && it.e > 0; };
  const rankOf = ws => {                       // pos[] over all items; ranks the valid ones by score desc, tie→name
    const score = it => state.criteria.reduce((a, c, ci) => a + ws[ci] * it.s[ci], 0) / it.e;
    const order = idx.filter(valid).sort((a, b) => (score(state.items[b]) - score(state.items[a])) ||
      (state.items[a].name || '').localeCompare(state.items[b].name || ''));
    const pos = []; order.forEach((it, r) => { pos[it] = r; }); return pos;
  };
  const w0 = state.criteria.map(c => c.w);
  const base = rankOf(w0);
  const knife = state.items.map(() => false);
  for(let ci = 0; ci < w0.length; ci++){
    if(!(w0[ci] > 0)) continue;
    for(const m of [1 - nudge, 1 + nudge]){
      const w2 = w0.slice(); w2[ci] = w0[ci] * m;
      const p2 = rankOf(w2);
      for(let i = 0; i < state.items.length; i++) if(valid(i) && p2[i] !== base[i]) knife[i] = true;
    }
  }
  return knife;
}

/* #87 ranking diff: two pasted priority orders → pairwise concordance (Kendall
   τ over the shared items, re-ranked within the shared set) + the items whose
   displacement drives the disagreement. Pure. */
const normKey = s => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function orderDiff(listA, listB){
  const dedupe = list => {
    const seen = new Map();
    for(const raw of list){
      const title = String(raw).trim();
      if(!title) continue;
      const k = normKey(title);
      if(!seen.has(k)) seen.set(k, title);
    }
    return seen;
  };
  const a = dedupe(listA), b = dedupe(listB);
  const sharedKeys = [...a.keys()].filter(k => b.has(k));
  const shared = new Set(sharedKeys);
  const rankOf = m => {
    const r = new Map();
    let i = 0;
    for(const k of m.keys()) if(shared.has(k)) r.set(k, ++i);
    return r;
  };
  const ra = rankOf(a), rb = rankOf(b);
  const common = sharedKeys.map(k => ({title: a.get(k), a: ra.get(k), b: rb.get(k), delta: rb.get(k) - ra.get(k)}));
  const n = common.length;
  let concordant = 0, discordant = 0;
  for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){
    const s = (common[i].a - common[j].a) * (common[i].b - common[j].b);
    if(s > 0) concordant++; else if(s < 0) discordant++;
  }
  const pairs = n * (n - 1) / 2;
  const tau = pairs ? (concordant - discordant) / pairs : 0;
  const movers = common.filter(c => c.delta !== 0).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return {
    common, movers, tau,
    agreementPct: pairs ? Math.round(concordant / pairs * 100) : null,
    onlyA: [...a.keys()].filter(k => !b.has(k)).map(k => a.get(k)),
    onlyB: [...b.keys()].filter(k => !a.has(k)).map(k => b.get(k)),
  };
}

export function orderDiffCopy(d){
  if(d.common.length < 2)
    return 'The two lists share fewer than two items — nothing to compare yet.';
  const head = 'The two orders agree on ' + d.agreementPct + '% of pairwise comparisons (Kendall τ ' +
    (Math.round(d.tau * 100) / 100) + ').';
  if(!d.movers.length) return head + ' Same order, shared items considered.';
  const top = d.movers.slice(0, 3)
    .map(m => m.title + ' (#' + m.a + ' → #' + m.b + ')').join(', ');
  const extras = [];
  if(d.onlyA.length) extras.push(d.onlyA.length + ' only in A');
  if(d.onlyB.length) extras.push(d.onlyB.length + ' only in B');
  return head + ' The disagreement is mostly ' + top +
    (d.movers.length > 3 ? ' — plus ' + (d.movers.length - 3) + ' smaller moves' : '') + '.' +
    (extras.length ? ' (' + extras.join(', ') + '.)' : '');
}
