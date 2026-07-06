/* #93 promote flow, hop 2: the room's revealed ranges → prefilled fermi
   variables. Names slugified from question text; the range is the Delphi
   pooled range when a second round ran, else the round's pooled envelope.
   The formula prefills as a product — a visible starting point, not a claim.
   Pure. */

export function slugVar(text, taken = new Set()){
  let s = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if(!s) s = 'x';
  if(/^\d/.test(s)) s = 'q_' + s;
  if(s.length > 28) s = s.slice(0, 28).replace(/_+$/, '');
  let out = s, n = 2;
  while(taken.has(out)) out = s + '_' + n++;
  taken.add(out);
  return out;
}

const short = v => {
  const a = Math.abs(v);
  if(a >= 1e9) return trim(v / 1e9) + 'B';
  if(a >= 1e6) return trim(v / 1e6) + 'M';
  if(a >= 1e3) return trim(v / 1e3) + 'k';
  return trim(v);
};
const trim = v => String(Math.round(v * 100) / 100);

export function fermiHandoff(model, stats, delphi = null){
  const taken = new Set();
  const v = {};
  model.questions.forEach((q, i) => {
    if(q.type !== 'range') return;
    let lo = null, hi = null;
    const d = delphi && delphi[i];
    if(d && d.pooledRange){ [lo, hi] = d.pooledRange; }
    else {
      const s = stats[i];
      if(s && s.pooled && s.n > 0){ lo = s.pooled.lo; hi = s.pooled.hi; }
    }
    if(lo === null || !isFinite(lo) || !isFinite(hi)) return;
    v[slugVar(q.text, taken)] = [short(lo), short(hi), 'auto'];
  });
  const names = Object.keys(v);
  if(!names.length) return null;
  return {f: names.join(' * '), v};
}
