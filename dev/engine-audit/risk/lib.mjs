// Tiny harness helpers (audit only). PASS/FAIL lines; exit non-zero on any FAIL.
// A check tagged {known:true} documents a CONFIRMED DEFECT: it is expected to FAIL today.
export const results = [];
export function check(id, ok, detail = '', {known = false} = {}){
  results.push({id, ok, known});
  console.log(`${ok ? 'PASS' : 'FAIL'}${known ? ' [DEFECT]' : ''} ${id}${detail ? ' :: ' + detail : ''}`);
}
export function done(){
  const f = results.filter(r => !r.ok), kf = f.filter(r => r.known);
  console.log(`\n${results.length} checks, ${results.length - f.length} pass, ${f.length} fail (${kf.length} are documented defects, ${f.length - kf.length} unexpected)`);
  process.exit(f.length ? 1 : 0);
}
export function rng(seed){          // mulberry32, own copy
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
