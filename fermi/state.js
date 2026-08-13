/* Compact, backwards-compatible estimate state. Provenance is deliberately
   separate from v: it is a receipt about an assumption, never a simulator
   input. All readers fail closed so a crafted URL cannot manufacture a
   more-authoritative-looking source. Pure. */

const KINDS = new Set(['gauge', 'snapshot', 'person']);
const GAUGE_STATUSES = new Set(['needs-restatement', 'adopted', 'not-used']);
const POOLING = new Set(['envelope', 'median-endpoints']);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_LABEL = 180;
const MAX_UNIT = 48;

function dataRecord(value){
  if(!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if(proto !== Object.prototype && proto !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for(const d of Object.values(descriptors)) if(!('value' in d)) return null;
  return descriptors;
}

function boundedText(value, max){
  if(typeof value !== 'string') return null;
  const text = value.trim();
  if(!text || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text;
}

function positiveInt(value, max){
  return Number.isSafeInteger(value) && value > 0 && value <= max ? value : null;
}

/** Return a canonical receipt, or null (= Stated here). */
export function normalizeReceipt(raw){
  const d = dataRecord(raw);
  if(!d) return null;
  const kind = d.kind?.value;
  if(!KINDS.has(kind)) return null;
  const label = boundedText(d.label?.value, MAX_LABEL);
  if(!label) return null;

  if(kind === 'snapshot' || kind === 'person') return {kind, label};

  const round = positiveInt(d.round?.value, 1000);
  const responses = positiveInt(d.responses?.value, 100000);
  const pooling = d.pooling?.value;
  const status = d.status?.value;
  if(!round || !responses || !POOLING.has(pooling) || !GAUGE_STATUSES.has(status)) return null;
  const receipt = {kind, label, round, responses, pooling, status};
  if(d.question){
    const question = boundedText(d.question.value, MAX_LABEL);
    if(!question) return null;
    receipt.question = question;
  }
  if(d.unit){
    const unit = boundedText(d.unit.value, MAX_UNIT);
    if(!unit) return null;
    receipt.unit = unit;
  }
  return receipt;
}

/** Normalise a p object against the variables actually present in v. */
export function normalizeReceiptMap(raw, variableNames){
  const receipts = new Map();
  const dropped = [];
  if(raw === undefined) return {receipts, dropped};
  const d = dataRecord(raw);
  if(!d) return {receipts, dropped: ['p']};
  const known = new Set(variableNames || []);
  for(const [name, descriptor] of Object.entries(d)){
    if(DANGEROUS_KEYS.has(name) || !known.has(name)){
      dropped.push(name);
      continue;
    }
    const receipt = normalizeReceipt(descriptor.value);
    if(receipt) receipts.set(name, receipt);
    else dropped.push(name);
  }
  return {receipts, dropped};
}

/** Pack the app's Map representation to the stable {f,v,p?,t?} URL shape. */
export function packScen(snap){
  const v = {}, p = {};
  const vars = snap?.vars instanceof Map ? snap.vars : new Map();
  for(const [name, st] of vars){
    if(typeof name !== 'string' || !name || DANGEROUS_KEYS.has(name) || !st || typeof st !== 'object') continue;
    v[name] = [String(st.lo ?? ''), String(st.hi ?? ''), st.dist || 'auto'];
    const receipt = normalizeReceipt(st.base);
    if(receipt) p[name] = receipt;
  }
  const out = {f: typeof snap?.f === 'string' ? snap.f : '', v};
  if(Object.keys(p).length) out.p = p;
  if(typeof snap?.thresh === 'string' && snap.thresh) out.t = snap.thresh;
  return out;
}

/** Read both legacy three-tuples and provenance-aware state. */
export function unpackScen(raw){
  const source = dataRecord(raw);
  const vars = new Map();
  if(!source) return {f: '', vars, thresh: '', droppedReceipts: ['state']};
  const v = dataRecord(source.v?.value);
  if(v){
    for(const [name, descriptor] of Object.entries(v)){
      if(DANGEROUS_KEYS.has(name)) continue;
      const pair = descriptor.value;
      if(Array.isArray(pair)) vars.set(name, {
        lo: String(pair[0] ?? ''),
        hi: String(pair[1] ?? ''),
        dist: typeof pair[2] === 'string' && pair[2] ? pair[2] : 'auto',
        base: null,
      });
    }
  }
  const {receipts, dropped} = normalizeReceiptMap(source.p?.value, vars.keys());
  for(const [name, receipt] of receipts) vars.get(name).base = receipt;
  return {
    f: typeof source.f?.value === 'string' ? source.f.value : '',
    vars,
    thresh: typeof source.t?.value === 'string' ? source.t.value : '',
    droppedReceipts: dropped,
  };
}

/** Concise display copy shared by rows, exports and the Driver Tree. */
export function receiptLabel(receipt){
  const r = normalizeReceipt(receipt);
  if(!r) return 'Stated here';
  if(r.kind === 'snapshot') return 'Data snapshot · ' + r.label;
  if(r.kind === 'person') return "One person's estimate · " + r.label;
  const source = r.status === 'adopted' ? 'Gauge → adopted'
    : r.status === 'not-used' ? 'Gauge → not used' : 'Gauge → review needed';
  const pooling = r.pooling === 'median-endpoints' ? 'median endpoints' : 'room envelope';
  return source + ' · ' + r.label + (r.unit ? ' · ' + r.unit : '') +
    ' · ' + r.responses + ' responses · round ' + r.round + ' · ' + pooling;
}

/** Compact category/status for in-plane receipts; receiptLabel owns detail. */
export function receiptChipLabel(receipt){
  const r = normalizeReceipt(receipt);
  if(!r) return 'Stated here';
  if(r.kind === 'snapshot') return 'Data snapshot · ' + r.label;
  if(r.kind === 'person') return "One person's estimate · " + r.label;
  return r.status === 'adopted' ? 'Gauge · adopted'
    : r.status === 'not-used' ? 'Gauge · not used' : 'Gauge · review needed';
}
