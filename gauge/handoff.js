/* The room's revealed ranges → a review-needed Fermi input draft. A room
   aggregate is a receipt of elicited judgement, never automatically the next
   person's calibrated 90% belief. The recipient must author a formula and
   explicitly adopt or restate each range before Fermi simulates it. Pure. */

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
  /* State is deliberately bounded for URL/share safety. Refuse the whole
     transfer rather than preserve ranges while silently shedding their receipt. */
  if(model.questions.some(q => q.type === 'range' &&
    (String(q.text || '').trim().length > 180 || String(q.unit || '').trim().length > 48))) return null;
  const taken = new Set();
  const v = {}, p = {};
  model.questions.forEach((q, i) => {
    if(q.type !== 'range') return;
    let lo = null, hi = null;
    const d = delphi && delphi[i];
    const s = stats[i];
    if(d && d.pooledRange){ [lo, hi] = d.pooledRange; }
    else {
      if(s && s.pooled && s.n > 0){ lo = s.pooled.lo; hi = s.pooled.hi; }
    }
    if(lo === null || !isFinite(lo) || !isFinite(hi)) return;
    const name = slugVar(q.text, taken);
    v[name] = [short(lo), short(hi), 'auto'];
    p[name] = {
      kind: 'gauge', label: q.text, question: q.text, unit: q.unit || undefined,
      round: d ? 2 : 1, responses: d ? d.n : s.n,
      pooling: d ? 'median-endpoints' : 'envelope', status: 'needs-restatement',
    };
    if(!p[name].unit) delete p[name].unit;
  });
  const names = Object.keys(v);
  if(!names.length) return null;
  return {f: '', v, p};
}

/** Explain an unavailable handoff without exposing a half-formed target state. */
export function fermiHandoffIssue(model){
  const long = model.questions.find(q => q.type === 'range' &&
    (String(q.text || '').trim().length > 180 || String(q.unit || '').trim().length > 48));
  return long ? 'Fermi draft unavailable: one range question or unit is too long to preserve its receipt safely.' : '';
}
