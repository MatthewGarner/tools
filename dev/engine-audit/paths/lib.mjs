// Tiny harness helpers (audit only). PASS/FAIL lines.
// A check tagged {known} documents a defect that a ruling LEFT in place (the tag prints the reason); it is
// expected to FAIL. Every fixed finding's check carries no tag, so a regression of it is an unexpected failure.
// Exit code: non-zero only for an UNEXPECTED failure.
export const results = [];
export function check(id, ok, detail = '', {known = false, reason = ''} = {}){
  results.push({id, ok, known});
  console.log(`${ok ? 'PASS' : 'FAIL'}${known ? ' [LEFT' + (reason ? ': ' + reason : '') + ']' : ''} ${id}${detail ? ' :: ' + detail : ''}`);
}
export function done(){
  const f = results.filter(r => !r.ok), kf = f.filter(r => r.known);
  console.log(`\n${results.length} checks, ${results.length - f.length} pass, ${f.length} fail (${kf.length} are defects left by ruling, ${f.length - kf.length} unexpected)`);
  process.exit(f.length - kf.length ? 1 : 0);
}
export function rng(seed){          // mulberry32, own copy
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
