/* Risk register core. Pure and storage-free — schema, seeded Monte Carlo
   exposure, ranking, staleness, merge/promote, markdown, (de)serialise.
   Exposure = likelihood × impact, each sampled as a 90% interval (fermi's
   driver-range convention: lognormal when the low end is positive, else normal). */
import {mulberry32, gaussian, rangeSampler, quantile, fmt} from '../assets/series.js';

export const SEED = 0x4E48, NSIM = 4000;
const nextId = () => (globalThis.crypto?.randomUUID?.() ?? 'e' + (++seq));
let seq = 0;
const iso = d => (d instanceof Date ? d : new Date()).toISOString();
const effDist = lo => lo > 0 ? 'logn' : 'norm';           // matches fermi's effDist for auto
const scoreable = e => Array.isArray(e.p) && Array.isArray(e.impact);
export const isRisk = e => !!e && e.kind === 'risk';   // board items (fact/assumption/belief) share doc.entries but stay off the wizard + register

export function newEntry(text, over = {}){
  const now = iso(new Date());
  return {id: nextId(), text: text || '', kind: 'risk', tag: null, cluster: null,
    p: null, impact: null, actions: [], votes: 0, status: 'open',
    created: now, lastReviewed: now, ...over};
}

/* Map<id, {p50,p10,p90}> for scoreable entries, plus a .portfolio (per-sim sum). */
export function exposure(entries, {seed = SEED, nsim = NSIM} = {}){
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const scored = entries.filter(scoreable);
  const sm = scored.map(e => ({
    pS: rangeSampler(e.p[0], e.p[1], effDist(e.p[0]), rand, gauss),
    iS: rangeSampler(e.impact[0], e.impact[1], effDist(e.impact[0]), rand, gauss),
  }));
  const cols = scored.map(() => new Float64Array(nsim));
  const port = new Float64Array(nsim);
  for(let s = 0; s < nsim; s++){
    let sum = 0;
    for(let j = 0; j < sm.length; j++){
      const p = Math.max(0, Math.min(100, sm[j].pS()));
      const im = Math.max(0, sm[j].iS());
      const ex = p / 100 * im;
      cols[j][s] = ex; sum += ex;
    }
    port[s] = sum;
  }
  const q3 = arr => { const s = Float64Array.from(arr).sort();
    return {p50: quantile(s, .5), p10: quantile(s, .1), p90: quantile(s, .9)}; };
  const map = new Map();
  scored.forEach((e, j) => map.set(e.id, q3(cols[j])));
  map.portfolio = sm.length ? q3(port) : {p50: 0, p10: 0, p90: 0};
  return map;
}

/* scoreable entries by median exposure desc, then the rest in original order */
export function ranked(entries, exp){
  const scored = entries.filter(scoreable).slice()
    .sort((a, b) => (exp.get(b.id)?.p50 || 0) - (exp.get(a.id)?.p50 || 0));
  const rest = entries.filter(e => !scoreable(e));
  return [...scored, ...rest];
}

const DAY = 86400000;
export function staleness(entry, now = new Date()){
  const age = (now - new Date(entry.lastReviewed)) / DAY;
  return age < 30 ? 'fresh' : age <= 90 ? 'ageing' : 'stale';
}
export function staleCount(entries, now = new Date()){
  return entries.filter(e => staleness(e, now) === 'stale').length;
}

/* src absorbed into dst (action lists concatenated), src removed; new array */
export function mergeEntries(entries, srcId, dstId){
  const src = entries.find(e => e.id === srcId);
  return entries.filter(e => e.id !== srcId).map(e =>
    e.id === dstId && src ? {...e, actions: [...e.actions, ...src.actions]} : e);
}

export function promote(entry, p, impact){ return {...entry, kind: 'risk', p, impact}; }

const pctRange = p => p ? p[0] + '–' + p[1] + '%' : '—';
export function markdown(doc, exp, now = new Date()){
  const u = doc.unit ? ' ' + doc.unit : '';
  const rows = ranked(doc.entries, exp).filter(scoreable);
  const out = ['# ' + (doc.title || 'Risk register'),
    doc.question ? '\n_' + doc.question + '_' : '', '',
    '| # | Risk | Likelihood | Impact' + u + ' | Exposure' + u + ' (P50 [P10–P90]) | Status | Age |',
    '|---|------|-----------|--------|--------------------------|--------|-----|'];
  rows.forEach((e, i) => {
    const x = exp.get(e.id) || {p50: 0, p10: 0, p90: 0};
    out.push('| ' + (i + 1) + ' | ' + e.text + ' | ' + pctRange(e.p) + ' | ' +
      (e.impact ? e.impact[0] + '–' + e.impact[1] : '—') + ' | ' +
      fmt(x.p50) + ' [' + fmt(x.p10) + '–' + fmt(x.p90) + '] | ' + e.status + ' | ' + staleness(e, now) + ' |');
  });
  const acts = doc.entries.flatMap(e => e.actions.map(a => ({...a, risk: e.text})))
    .sort((a, b) => (b.votes || 0) - (a.votes || 0));
  if(acts.length){
    out.push('', '## Actions', '');
    for(const a of acts) out.push('- ' + a.text + (a.owner ? ' — ' + a.owner : '') + ' _(' + a.risk + ')_');
  }
  return out.join('\n') + '\n';
}

export function serialise(doc){ return JSON.stringify({...doc, v: doc.v || 1}); }
export function deserialise(str){ try{ return JSON.parse(str); }catch(e){ return null; } }
