// Tiny harness helpers (audit only). PASS/FAIL lines; exit non-zero on any FAIL.
// A check tagged {known:true} documents a CONFIRMED DEFECT: it is expected to FAIL today.
export const results = [];
export function check(id, ok, detail = '', {known = false} = {}){
  results.push({id, ok, known});
  /* `known` is true (a documented defect) or a string: the reason it is left, e.g. "needs a draw change, awaiting the owner" */
  console.log(`${ok ? 'PASS' : 'FAIL'}${known ? ' [DEFECT' + (typeof known === 'string' ? ': ' + known : '') + ']' : ''} ${id}${detail ? ' :: ' + detail : ''}`);
}
export function done(){
  const f = results.filter(r => !r.ok), kf = f.filter(r => r.known);
  const unexpected = f.length - kf.length, passedKnown = results.filter(r => r.ok && r.known).length;
  console.log(`\n${results.length} checks, ${results.length - f.length} pass, ${kf.length} documented defects, ${unexpected} unexpected` +
    (passedKnown ? ` (${passedKnown} check(s) tagged known now PASS: a defect may be fixed)` : ''));
  process.exit(unexpected ? 1 : 0);
}
export function rng(seed){          // mulberry32, own copy
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Marsaglia polar with a carried spare: own copy, used ONLY to reproduce the engines' draw contract.
export function polar(u){ let spare = null;
  return () => { if(spare !== null){ const s = spare; spare = null; return s; }
    let a, b, s2; do { a = u() * 2 - 1; b = u() * 2 - 1; s2 = a * a + b * b; } while(s2 >= 1 || s2 === 0);
    const f = Math.sqrt(-2 * Math.log(s2) / s2); spare = b * f; return a * f; }; }
// Box-Muller on an xorshift128+ style generator: a DIFFERENT generator for references.
export function xorshift(seed){
  let s0 = (seed * 2654435761) >>> 0 || 1, s1 = (seed ^ 0x9E3779B9) >>> 0 || 2, s2 = 0x243F6A88, s3 = 0x85A308D3;
  return () => { const t = s1 << 11; s1 = s2; s2 = s3; s3 = s0; s0 = (s0 ^ (s0 >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    // mix two words to 53 bits
    const hi = s0 >>> 5, lo = s3 >>> 6; return (hi * 67108864 + lo) / 9007199254740992; };
}
export function boxMuller(u){ let spare = null;
  return () => { if(spare !== null){ const s = spare; spare = null; return s; }
    const r = Math.sqrt(-2 * Math.log(1 - u())), th = 2 * Math.PI * u(); spare = r * Math.sin(th); return r * Math.cos(th); }; }
export const mean = a => { let s = 0; for(const v of a) s += v; return s / a.length; };
export const sd = a => { const m = mean(a); let s = 0; for(const v of a) s += (v - m) ** 2; return Math.sqrt(s / (a.length - 1)); };
export const quant = (sorted, q) => { const i = q * (sorted.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
// colour object good enough for the pure renderers
export const COLORS = new Proxy({status: {risk: '#a60', done: '#060', ok: '#060'}}, {get: (t, k) => k in t ? t[k] : '#123456'});
export const measure = (s, font) => String(s).length * ((/(\d+(?:\.\d+)?)px/.exec(font || '') || [0, 12])[1] * 0.55);
// visible text of an SVG string, entity-decoded
export const svgText = svg => [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")).join(' | ');
