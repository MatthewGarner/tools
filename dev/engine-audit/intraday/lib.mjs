// Tiny check harness shared by the merit-order and intraday audit scripts.
export function makeRunner(tag){
  const rows = [];
  const fmt = v => typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : JSON.stringify(v);
  return {
    rows,
    // kind: 'pass' = expected to hold today; 'defect' = a confirmed defect, check FAILS today (id = finding id)
    check(id, kind, desc, ok, detail = ''){
      rows.push({id, kind, desc, ok: !!ok, detail});
      console.log(`${ok ? 'PASS' : 'FAIL'} [${tag}] ${id} (${kind}) ${desc}${detail ? ' :: ' + detail : ''}`);
    },
    // information only: printed, never fails (modelling questions and by-design behaviour)
    info(id, desc, detail = ''){
      rows.push({id, kind: 'info', desc, ok: true, detail});
      console.log(`INFO [${tag}] ${id} ${desc}${detail ? ' :: ' + detail : ''}`);
    },
    eq(id, kind, desc, actual, expected, tol = 1e-9){
      const ok = typeof expected === 'number' ? Math.abs(actual - expected) <= tol : JSON.stringify(actual) === JSON.stringify(expected);
      this.check(id, kind, desc, ok, `actual=${fmt(actual)} expected=${fmt(expected)}`);
    },
    finish(){
      const failP = rows.filter(r => !r.ok && r.kind === 'pass').length;
      const failD = rows.filter(r => !r.ok && r.kind !== 'pass').length;
      console.log(`\n[${tag}] ${rows.length} checks; ${rows.filter(r=>r.ok).length} PASS; ${failD} FAIL on confirmed defects; ${failP} FAIL on checks expected to hold`);
      process.exit(rows.some(r => !r.ok) ? 1 : 0);
    },
  };
}
export function rng(seed){           // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
