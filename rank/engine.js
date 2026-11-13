/* Pure rank-stability engine: WSJF wobble simulation + verdict copy.
   Lifted verbatim from the inline script (same seed, same RNG call order)
   so results match what the tool has always shown. */
import {mulberry32, fmt} from '../assets/series.js';

/* simulated runs behind every sampled figure; every surface that names the count reads this */
export const NSIM = 16000;
export const NSIM_TEXT = NSIM.toLocaleString('en-US');
export const SEED = 0x5EED;

export function sigmaW(ww){ return Math.log(1 + ww / 100) / 1.6448536; }
const clampScore = v => Math.max(1, Math.min(10, v));
const clampWeight = v => Math.max(0, v);

/* ---------- one reader for scores, wobble and capacity ----------
   Typed cells, pasted rows and saved links all pass through these, so the table,
   the flip line and the knife-edge flags can never hold different numbers. */
export const SCORE_MIN = 1, SCORE_MAX = 10, WW_MAX = 200, SW_MAX = 5;
export function readScore(value, fallback = null){
  const v = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(v) ? clampScore(v) : fallback;
}
export const readWobbleWeights = value => Number.isFinite(+value) && value !== null && value !== '' ? Math.max(0, Math.min(WW_MAX, +value)) : null;
export const readWobbleScores = value => Number.isFinite(+value) && value !== null && value !== '' ? Math.max(0, Math.min(SW_MAX, +value)) : null;
export const readWeight = value => Number.isFinite(+value) && value !== null && value !== '' ? clampWeight(+value) : 0;

/* The weight wobble is multiplicative: a 90% interval from 1/f to f times the stated
   weight, where f = 1 + wobble/100. "±50%" would suggest -50%/+50%; it is ÷1.5 to ×1.5. */
const fmtX = f => (Math.round(f * 100) / 100) + '×';
export const wobbleFactorText = ww => ww > 0 ? 'up to ' + fmtX(1 + ww / 100) + ' larger or smaller' : 'no wobble';
export const weightWobbleText = ww => ww > 0 ? 'weights ' + wobbleFactorText(ww) : 'no weight wobble';

/* paste import: "name, V, T, R, E" rows (comma, tab or | separated). Pure. */
export function parsePaste(text){
  const items = [], bad = [];
  for(const rawLine of text.split(/\r?\n/)){
    const line = rawLine.trim();
    if(!line) continue;
    if(/^\|?[\s:|-]+\|?$/.test(line)) continue;            // markdown separator row
    let parts;
    if(line.includes('|')) parts = line.split('|').map(s => s.trim()).filter(Boolean);
    else if(line.includes('\t')) parts = line.split('\t').map(s => s.trim());
    else parts = line.split(',').map(s => s.trim());
    if(parts.length < 5){ bad.push(line); continue; }
    const nums = parts.slice(-4).map(Number);
    if(nums.some(v => !isFinite(v) || v <= 0)){
      // probably a header row — skip silently if nothing numeric at all
      if(parts.slice(-4).every(v => isNaN(Number(v)))) continue;
      bad.push(line); continue;
    }
    const scores = nums.map(v => readScore(v));
    items.push({name: parts.slice(0, parts.length - 4).join(' '), s: scores.slice(0, 3), e: scores[3]});
  }
  return {items, bad};
}

/* a saved link's rows: every cell read through the same bounds as a typed one. An
   unreadable score becomes the app's own new-row score (5) rather than dropping the
   row, so no other row changes place. */
export function readLinkItems(rows, nc){
  return (Array.isArray(rows) ? rows : []).map(row => {
    const r = Array.isArray(row) ? row : [];
    return {name: String(r[0] ?? ''),
      s: Array.from({length: nc}, (_, ci) => readScore(r[1 + ci], 5)), e: readScore(r[1 + nc], 5)};
  });
}

/* Markdown cell: a | or a line break in a name would split or break the row */
export const mdCell = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function simulate(state, {nsim = NSIM, seed = SEED} = {}){
  const items = [], origin = [];          // origin[j]: the row's own place in state.items
  state.items.forEach((it, oi) => { if(it.s.every(v => isFinite(v)) && isFinite(it.e)){ items.push(it); origin.push(oi); } });
  const n = items.length;
  if(n < 2) return null;
  const nc = state.criteria.length;
  /* mulberry32 and the carried-spare polar normal from assets/series.js, inline: the same stream
     draw for draw (per run: one normal per criterion, then per item one uniform per score and one
     for effort), without closure calls in the hot loop */
  let rs = seed | 0, spare = 0, hasSpare = false;
  const rand = () => {
    rs = rs + 0x6D2B79F5 | 0;
    let t = Math.imul(rs ^ rs >>> 15, 1 | rs);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const gauss = () => {
    if(hasSpare){ hasSpare = false; return spare; }
    let u, v, s2;
    do { u = rand() * 2 - 1; v = rand() * 2 - 1; s2 = u * u + v * v; } while(s2 >= 1 || s2 === 0);
    const f = Math.sqrt(-2 * Math.log(s2) / s2);
    spare = v * f; hasSpare = true;
    return u * f;
  };

  const rankCounts = new Float64Array(n * n);        // [item * n + place]
  const scoreBuf = new Float64Array(n), order = new Int32Array(n);
  for(let i = 0; i < n; i++) order[i] = i;
  const sc = new Float64Array(n * nc), eff0 = new Float64Array(n), w0 = new Float64Array(nc), ws = new Float64Array(nc);
  items.forEach((it, i) => { for(let c = 0; c < nc; c++) sc[i * nc + c] = it.s[c]; eff0[i] = it.e; });
  state.criteria.forEach((c, ci) => { w0[ci] = clampWeight(c.w || 0); });

  const k = Math.max(1, Math.min(n, Math.round(state.k)));
  /* the exact SET of items in the top k, as a bitmask while it fits in a double, else a string */
  const setCounts = new Map(), maskable = n <= 52;
  const sw = Math.max(0, state.sw || 0), sgw = sigmaW(Math.max(0, state.ww || 0));
  for(let sim = 0; sim < nsim; sim++){
    for(let c = 0; c < nc; c++) ws[c] = w0[c] * Math.exp(sgw * gauss());
    for(let i = 0; i < n; i++){
      let benefit = 0;
      for(let c = 0; c < nc; c++){
        const v = sc[i * nc + c] + (rand() * 2 - 1) * sw;
        benefit += ws[c] * (v < 1 ? 1 : v > 10 ? 10 : v);
      }
      const e = eff0[i] + (rand() * 2 - 1) * sw;
      scoreBuf[i] = benefit / (e < 1 ? 1 : e > 10 ? 10 : e);
    }
    /* stable insertion sort, best first, starting from the previous run's order: the same order a
       stable comparator sort of that array gives (ties stay where they were), and nearly free when
       little reshuffles */
    for(let i = 1; i < n; i++){
      const x = order[i], sx = scoreBuf[x];
      let j = i - 1;
      while(j >= 0 && scoreBuf[order[j]] < sx){ order[j + 1] = order[j]; j--; }
      order[j + 1] = x;
    }
    /* exact ties share the places they occupy: m tied items each take 1/m of every
       one of those m places. No tie, no change: the same whole-number counts as before. */
    for(let r = 0; r < n;){
      let t = r + 1;
      while(t < n && scoreBuf[order[t]] === scoreBuf[order[r]]) t++;
      if(t === r + 1) rankCounts[order[r] * n + r]++;
      else {
        const share = 1 / (t - r);
        for(let a = r; a < t; a++) for(let b = r; b < t; b++) rankCounts[order[a] * n + b] += share;
      }
      r = t;
    }
    /* a tie that straddles the cut leaves the set undecided in that run, so that run supports no set */
    if(!(k < n && scoreBuf[order[k - 1]] === scoreBuf[order[k]])){
      let key;
      if(maskable){ key = 0; for(let r = 0; r < k; r++) key += Math.pow(2, order[r]); }
      else key = Array.from(order.subarray(0, k)).sort((a, b) => a - b).join(',');
      setCounts.set(key, (setCounts.get(key) || 0) + 1);
    }
  }

  /* base ranking with unperturbed values */
  const baseScore = items.map(it => {
    let b = 0;
    state.criteria.forEach((c, ci) => { b += clampWeight(c.w || 0) * clampScore(it.s[ci]); });
    return b / clampScore(it.e);
  });
  const baseOrder = Array.from({length: n}, (_, i) => i)
    .sort((a, b) => baseScore[b] - baseScore[a]).map(j => origin[j]);

  const stats = items.map((it, i) => {
    const counts = rankCounts.subarray(i * n, (i + 1) * n);
    let cum = 0, p10 = 0, med = 0, p90 = n - 1, got10 = false, got50 = false;
    for(let r = 0; r < n; r++){
      cum += counts[r];
      if(!got10 && cum >= nsim * .05){ p10 = r; got10 = true; }
      if(!got50 && cum >= nsim * .50){ med = r; got50 = true; }
      if(cum >= nsim * .95){ p90 = r; break; }
    }
    let ptop = 0;
    for(let r = 0; r < k; r++) ptop += counts[r];
    return {i: origin[i], name: it.name || 'Initiative ' + (origin[i] + 1), p10, med, p90, ptop: ptop / nsim};
  });
  const setShare = Math.max(0, ...setCounts.values()) / nsim;
  return {stats, baseOrder, baseScore, n, k, setShare};
}

/* {headline, body, contested, fig} — `headline` is the display line, `fig` the
   ONE load-bearing count inside it (verbatim, so the surface can mark it without
   re-deriving it) and `body` the supporting sentence that sits below.

   "Settled" is a claim about the SET: it needs k items that each clear the line AND
   one exact group of k that turns up in at least 85% of runs (`info.setShare`, from
   simulate()). The lines are applied to the figures as printed, so an item shown as
   "85%" is never also listed as contested. */
const pctShown = p => Math.round(p * 100);
export function verdictCopy(stats, k, info = {}){
  const n = stats.length;
  const secure = stats.filter(s => pctShown(s.ptop) >= 85);
  const contested = stats.filter(s => pctShown(s.ptop) > 15 && pctShown(s.ptop) < 85);
  const plural = (count, one, many) => count + ' ' + (count === 1 ? one : many);
  let headline, body, fig;
  if(n > 0 && k >= n){
    fig = '';
    headline = 'There is no cut to contest.';
    body = ' Every initiative fits within the capacity of ' + k + ', so nothing is left out. The rank bars below still show how firm each order is.';
  } else if(secure.length > k || (secure.length === k && info.setShare !== undefined && pctShown(info.setShare) < 85)){
    const compete = secure.length + contested.length;
    fig = String(compete);
    headline = 'The cut for the top ' + k + ' is contested: ' + plural(compete, 'initiative competes', 'initiatives compete') + ' for ' + plural(k, 'place', 'places') + '.';
    body = secure.length > k
      ? ' More than ' + k + ' initiatives each make the cut in at least 85% of simulations, but they cannot all fit — which ones fill the places changes with the weights. Decide the cut on strategy or sequencing.'
      : ' Each of the ' + k + ' makes the cut in at least 85% of simulations on its own, but no single group of ' + k + ' shows up in 85% of them. Decide the cut on strategy or sequencing.';
  } else if(secure.length >= k){
    fig = String(k);
    headline = 'The top ' + k + ' is settled.';
    body = ' Every initiative that makes the cut does so in at least 85% of simulations, and the same group of ' + k + ' wins in at least 85% of them — reasonable people with different weights get the same answer. Stop tuning the spreadsheet; use the stable order alongside strategy and delivery judgement.';
  } else if(secure.length > 0){
    fig = String(secure.length);
    headline = secure.length + ' of the top ' + k + (secure.length === 1 ? ' is' : ' are') + ' settled.';
    const sure = secure.filter(s => s.ptop > 0.995), firm = secure.filter(s => !(s.ptop > 0.995));
    const parts = [];
    if(sure.length) parts.push(sure.map(s => s.name).join(', ') + (sure.length === 1 ? ' makes' : ' make') + ' the cut under any reasonable weights.');
    for(const s of firm) parts.push(s.name + ' makes the cut in ' + pctStr(s.ptop) + ' of reasonable weightings.');
    const left = k - secure.length;
    body = ' ' + parts.join(' ') + ' The remaining ' + (left === 1 ? 'place is' : left + ' places are') +
      (contested.length >= 2
        ? ' a genuine tie between ' + contested.map(s => s.name).join(', ') +
          ' — the framework can’t decide it, so decide it on strategy or sequencing.'
        : contested.length === 1
          ? ' not settled: ' + contested[0].name + ' is the closest contender, but it misses the cut too often to call — decide it on strategy or sequencing.'
          : ' up for grabs across the rest of the field — no single challenger stands out, so decide on strategy or sequencing.');
  } else {
    fig = '';                        // nothing survived: the line turns on no count
    headline = 'Nothing is settled.';
    body = ' No initiative makes the top ' + k +
      ' in more than 85% of simulations — this ranking is mostly noise. Either the options are genuinely close (pick by strategy) or the scores need real evidence behind them.';
  }
  return {headline, body, contested, fig};
}

export const pctStr = p => p > .995 ? '>99%' : p < .005 ? '<1%' : Math.round(p * 100) + '%';

/* What flips #1: for each criterion and rival, the exact weight delta at which the
   rival's WSJF score equals the leader's (closed form — no simulation). Deterministic
   companion to the wobble: the wobble says how often ranks reshuffle; this names the
   cheapest single reweighting that dethrones the top item. */
/* rows and weights are read exactly as simulate() reads them: finite rows only, scores
   clamped to 1-10, weights floored at 0, so a stray out-of-range value cannot name a leader
   the table does not show. Each row keeps its own place in state.items (`at`). */
const readRows = state => {
  const rows = [];
  state.items.forEach((it, at) => {
    if(it.s.every(v => isFinite(v)) && isFinite(it.e)) rows.push({name: it.name, s: it.s.map(clampScore), e: clampScore(it.e), at});
  });
  return rows;
};
export function flipAnalysis(state){
  return buildFlips({...state, criteria: state.criteria.map(c => ({...c, w: clampWeight(c.w || 0)}))}, readRows(state));
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
      flips.push({ci, criterion: c.name, rival: B.at, rivalName: B.name || 'Initiative',
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
  return {top: {i: A.at, name: A.name || 'Initiative'},
    flips: ranked, easiest: ranked[0] || null};
}

/* Weight slider calibration (M3): max = 2× the largest weight so a drag to the end,
   release, drag again reaches any value; step snapped to a 1/2/5×10ⁿ "nice" value so
   slider positions land on clean decimals. Recomputed on COMMIT only — recomputing
   while the pointer is down moves the ceiling under the thumb and compounds
   exponentially (the 7e13-weight runaway). */
export function sliderScale(weights){
  const max = 2 * Math.max(1, ...weights.map(w => w || 0));
  return {max, step: niceStep(max / 100)};
}
function niceStep(raw){
  const r = Math.max(0.1, raw);
  const pow = Math.pow(10, Math.floor(Math.log10(r)));
  const m = r / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow;
}

const fmtW = w => fmt(w);   // compact (3 sig figs, k/M/B/T) — a raw 14-digit weight breaks the verdict line
export function flipCopy(flip, ww){
  if(!flip || !flip.easiest){
    return {tone: 'immovable',
      text: 'No single weight change flips first place — under this scheme the leader is structural.'};
  }
  const e = flip.easiest;
  if(Math.abs(e.pct) < 1e-9){
    return {tone: 'fragile',
      text: 'First place is already tied: ' + e.rivalName + ' scores the same as ' + flip.top.name + ' under the current weights.'};
  }
  const dir = e.delta > 0 ? 'raise' : 'cut';
  const pctAbs = Math.round(Math.abs(e.pct));
  const move = dir + ' ' + e.criterion + '’s weight ' + Math.abs(e.pct).toFixed(0) + '% (' +
    fmtW(e.newWeight - e.delta) + ' → ' + fmtW(e.newWeight) + ')';
  /* the wobble is multiplicative (÷f to ×f), so the move is compared on that scale: a 40%
     cut is ×0.6, beyond ÷1.5 */
  const factor = 1 + ww / 100, ratio = 1 + e.pct / 100, size = ratio >= 1 ? ratio : 1 / ratio;
  const wobble = weightWobbleText(ww);
  if(size <= factor + 1e-9){
    return {tone: 'fragile',
      text: 'Fragile first place: ' + move + ' and ' + e.rivalName + ' overtakes ' + flip.top.name +
        '. That’s inside the wobble you already call reasonable (' + wobble + ').'};
  }
  const how = pctAbs >= 999 ? 'far' : fmtX(size) === fmtX(factor) ? 'just' : 'well';
  return {tone: 'robust',
    text: 'First place holds: the cheapest single reweighting that dethrones ' + flip.top.name +
      ' is ' + move + ' — ' + how + ' beyond the wobble (' + wobble + ').'};
}

/* Per-row fragility probe (the knife-edge pill): does a ±nudge of ANY single criterion weight
   change THIS item's rank, by the tool's own score benefit/effort? Pure, deterministic. A fixed
   hair-trigger (default ±10%), distinct from the ww-keyed flipCopy verdict — labelled on-surface. */
export function perRowKnife(state, nudge = 0.1){
  const idx = state.items.map((_, i) => i);
  const valid = i => { const it = state.items[i]; return it.s.every(v => isFinite(v)) && isFinite(it.e); };
  const rankOf = ws => {                       // pos[] over all items; ranks the valid ones by score desc, tie→name
    /* scores clamped to 1-10 exactly as simulate() reads them */
    const score = it => state.criteria.reduce((a, c, ci) => a + ws[ci] * clampScore(it.s[ci]), 0) / clampScore(it.e);
    const order = idx.filter(valid).sort((a, b) => score(state.items[b]) - score(state.items[a]));   // stable, no tie-break (matches baseOrder)
    const pos = []; order.forEach((it, r) => { pos[it] = r; }); return pos;
  };
  const w0 = state.criteria.map(c => clampWeight(c.w || 0));
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
  const agree = d.agreementPct === null ? null : d.agreementPct >= 100 && d.tau < 1 ? '>99' : d.agreementPct <= 0 && d.tau > -1 ? '<1' : d.agreementPct;
  const head = 'The two orders agree on ' + agree + '% of pairwise comparisons (Kendall τ ' +
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
