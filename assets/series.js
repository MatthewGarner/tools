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
