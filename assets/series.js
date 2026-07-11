/* Shared primitives for the tools series. New tools import from here;
   fermi/rank predate this module and migrate when next touched. */

/* Deterministic RNG — same seeds give the same numbers on every visit. */
export function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Gaussian sampler bound to a uniform rand() (Marsaglia polar). */
export function gaussian(rand){
  let spare = null;
  return function(){
    if(spare !== null){ const s = spare; spare = null; return s; }
    let u, v, s2;
    do { u = rand()*2 - 1; v = rand()*2 - 1; s2 = u*u + v*v; } while(s2 >= 1 || s2 === 0);
    const f = Math.sqrt(-2 * Math.log(s2) / s2);
    spare = v * f;
    return u * f;
  };
}

/* Quantile of a pre-sorted array (linear interpolation). */
export function quantile(sorted, q){
  if(!sorted.length) return NaN;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* 90%-interval sampler shared by the estimation engines (4th consumer as of
   /cycles; fermi migrates from its local copy when next touched). */
export const Z90 = 1.6448536;
export function rangeSampler(lo, hi, dist, rand, gauss){
  if(lo > hi){ const t = lo; lo = hi; hi = t; }
  if(lo === hi) return () => lo;
  const d = (dist === 'logn' && lo <= 0) ? 'norm' : dist;
  if(d === 'uni') return () => lo + (hi - lo) * rand();
  if(d === 'logn'){
    const mu = (Math.log(lo) + Math.log(hi)) / 2;
    const sg = (Math.log(hi) - Math.log(lo)) / (2 * Z90);
    return () => Math.exp(mu + sg * gauss());
  }
  const mu = (lo + hi) / 2, sg = (hi - lo) / (2 * Z90);
  return () => mu + sg * gauss();
}

/* Compact human number: 4523 → 4.52k, 1234567 → 1.23M. */
export function fmt(v){
  if(!isFinite(v)) return '—';
  if(v < 0) return '−' + fmt(-v);
  if(v === 0) return '0';
  const sig = (x, n) => Number(x.toPrecision(n)).toString();
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  for(const [m, s] of units) if(v >= m) return sig(v/m, 3) + s;
  if(v >= 1) return sig(v, 3);
  if(v >= 0.001) return sig(v, 2);
  return v.toExponential(1);
}

/* URL-hash state: any JSON-able object, unicode-safe. */
export function readHashState(){
  try{
    if(!location.hash || location.hash.length < 2) return null;
    return JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
  }catch(e){ return null; }
}
export function writeHashState(obj, maxLen = 6000){
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  history.replaceState(null, '', enc.length < maxLen ? '#' + enc : location.pathname);
}

/* ---- shared palette schemes (moved from roadmap/render.js) ---- */

/* Named palettes — every accent hex validated (dataviz validate_palette.js) against
   its derived background surface in both themes: lightness band, chroma floor, ≥3:1. */
export const PALETTES = {
  ocean: {light:'#0C7FAE', dark:'#2E93C4'},
  slate: {light:'#5B5E9E', dark:'#8489D6'},
  ember: {light:'#C05621', dark:'#C97A35'},
  plum:  {light:'#9D3E78', dark:'#C06BA0'},
};
export const PALETTE_NAMES = Object.keys(PALETTES);

export function mix(hexA, hexB, t){
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(hexA), b = p(hexB);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/* A palette is a whole diagram scheme: wash the background, tint cards and borders
   toward the accent hue. Derived, so custom accents get a coherent scheme too. */
export function scheme(accentHex, dark){
  return dark ? {
    accent: accentHex,
    bg:     mix('#141B21', accentHex, 0.06),
    card:   mix('#1B242C', accentHex, 0.06),
    border: mix('#2A3743', accentHex, 0.14),
  } : {
    accent: accentHex,
    bg:     mix('#F6F5F2', accentHex, 0.05),
    card:   mix('#FFFFFF', accentHex, 0.02),
    border: mix('#DEE2E1', accentHex, 0.16),
  };
}

/* Nice axis ticks: ≤~6 steps of 1/2/5×10^k spanning [min, max]. Byte-identical
   to the copies cycles/risk render.js each carried. (gauge/render-overlay.js has
   a DIFFERENT target-count algorithm — deliberately left separate.) */
export function niceTicks(min, max){
  const span = max - min || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(span / 5)));
  const step = [1, 2, 5, 10].map(s => s * mag).find(s => span / s <= 6) || mag * 10;
  const out = [];
  for(let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}
