/* Revealed ranges → review-needed Fermi inputs; never automatic adoption. */

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

export function portableFermiNumber(value){
  if(!Number.isFinite(value)) return null;
  const raw = String(value);
  let text = raw;
  if(/[eE]/.test(raw)){
    const match = raw.match(/^(-?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
    if(!match) return null;
    const sign = match[1], digits = match[2] + (match[3] || '');
    const point = match[2].length + Number(match[4]);
    if(point <= 0) text = sign + '0.' + '0'.repeat(-point) + digits;
    else if(point >= digits.length) text = sign + digits + '0'.repeat(point - digits.length);
    else text = sign + digits.slice(0, point) + '.' + digits.slice(point);
  }
  if(text.length > 48 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) || Number(text) !== value) return null;
  return text;
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\p{Cf}]/u;

/* Abort the whole draft if Fermi would discard any receipt provenance. */
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

function handoffIssue(model, stats, delphi){
  const sourceIssue = receiptIssue(model);
  if(sourceIssue) return sourceIssue;
  const ranges = rangeReceipts(model);
  if(!ranges.length) return 'Fermi review unavailable: this Gauge has no range questions.';
  for(const {question} of ranges){
    const index = model.questions.indexOf(question), stat = stats?.[index], dstat = delphi?.[index];
    const aggregate = dstat ? dstat : stat;
    /* Four branches, three sentences: no aggregate at all and a zero count are
       genuinely the same situation to a facilitator, so they say the same thing.
       What must NOT be shared is the privacy wording (nothing was disclosed, so
       there is nothing to protect) or the unreadable-count wording (a broken
       count is not an unanswered question). A draft transfers every range or
       none, so any branch here refuses the whole transfer. */
    if(!aggregate)
      return 'Fermi review unavailable: a range question is unanswered, and a Fermi draft transfers every range or none.';
    const count = aggregate.n;
    if(!Number.isSafeInteger(count) || count < 0)
      return 'Fermi review unavailable: a range question has an unreadable response count.';
    if(count === 0)
      return 'Fermi review unavailable: a range question is unanswered, and a Fermi draft transfers every range or none.';
    if(count < 2)
      return 'Fermi review unavailable: every transferred range needs at least 2 responses for aggregate privacy.';
    const pair = dstat ? dstat.pooledRange : stat?.pooled ? [stat.pooled.lo, stat.pooled.hi] : null;
    if(!Array.isArray(pair) || pair.length !== 2 || pair[0] > pair[1])
      return 'Fermi review unavailable: a disclosed range has no valid aggregate bounds.';
    if(portableFermiNumber(pair[0]) === null || portableFermiNumber(pair[1]) === null)
      return 'Fermi review unavailable: a disclosed range uses a magnitude or precision Fermi cannot preserve exactly.';
  }
  return '';
}

export function fermiHandoff(model, stats, delphi = null){
  /* State is deliberately bounded for URL/share safety. Refuse the whole
     transfer rather than preserve ranges while silently shedding their receipt. */
  const receipts = rangeReceipts(model);
  if(handoffIssue(model, stats, delphi)) return null;
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
    const low = portableFermiNumber(lo), high = portableFermiNumber(hi);
    if(low === null || high === null) return;
    const name = slugVar(receipt.label.value, taken);
    v[name] = [low, high, 'auto'];
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
export function fermiHandoffIssue(model, stats = [], delphi = null){
  return handoffIssue(model, stats, delphi);
}
