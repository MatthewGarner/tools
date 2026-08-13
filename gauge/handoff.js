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

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/* Keep the source-side boundary at least as strict as Fermi's unpacker. A
   receipt which target normalisation would discard must abort the whole draft:
   ranges without their provenance look more certain than they are. */
function receiptText(value, max, field, optional = false){
  if(value == null && optional) return {value:undefined};
  if(typeof value !== 'string') return {issue:`its ${field} is not plain text`};
  const text = value.trim();
  if(!text) return optional ? {issue:`its ${field} is empty`} : {issue:`its ${field} is empty`};
  if(text.length > max) return {issue:`its ${field} is too long`};
  if(CONTROL.test(text)) return {issue:`its ${field} contains control characters`};
  return {value:text};
}

function rangeReceipts(model){
  const ranges = Array.isArray(model?.questions) ? model.questions.filter(q => q?.type === 'range') : [];
  return ranges.map(question => {
    const label = receiptText(question.text, 180, 'question');
    const unit = receiptText(question.unit, 48, 'unit', true);
    return {question, label, unit, issue:label.issue || unit.issue || ''};
  });
}

function receiptIssue(model){
  const invalid = rangeReceipts(model).find(entry => entry.issue);
  return invalid ? `Fermi draft unavailable: one range ${invalid.issue}, so its receipt cannot transfer safely.` : '';
}

export function fermiHandoff(model, stats, delphi = null){
  /* State is deliberately bounded for URL/share safety. Refuse the whole
     transfer rather than preserve ranges while silently shedding their receipt. */
  const receipts = rangeReceipts(model);
  if(receipts.some(entry => entry.issue)) return null;
  const receiptByQuestion = new Map(receipts.map(entry => [entry.question, entry]));
  const taken = new Set();
  const v = {}, p = {};
  model.questions.forEach((q, i) => {
    if(q.type !== 'range') return;
    const receipt = receiptByQuestion.get(q);
    if(!receipt) return;
    let lo = null, hi = null;
    const d = delphi && delphi[i];
    const s = stats[i];
    if(d && d.pooledRange){ [lo, hi] = d.pooledRange; }
    else {
      if(s && s.pooled && s.n > 0){ lo = s.pooled.lo; hi = s.pooled.hi; }
    }
    if(lo === null || !isFinite(lo) || !isFinite(hi)) return;
    const name = slugVar(receipt.label.value, taken);
    v[name] = [short(lo), short(hi), 'auto'];
    p[name] = {
      kind: 'gauge', label: receipt.label.value, question: receipt.label.value, unit: receipt.unit.value,
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
  return receiptIssue(model);
}
