/* Pure text rewrites for /risk edit-in-place. No DOM; the text is the model.
   A structure line is  <kind>: <params> ["label"] [// comment]  — the tail
   (quoted label + comment) is preserved by every rewrite; new params append to
   the end of the params section, before that tail. */
import {parse, defaultLabel} from './parse.js';

const N = '-?\\d+(?:\\.\\d+)?';
const FIELD_RE = {
  level:      new RegExp('(^\\s*floor\\s*:\\s*)(' + N + ')', 'i'),
  fixed:      new RegExp('(^\\s*toll\\s*:\\s*)(' + N + ')', 'i'),
  share:      new RegExp('(share\\s+)(' + N + ')(\\s*%)', 'i'),
  fee:        new RegExp('(fee\\s+)(' + N + ')', 'i'),
  premium:    new RegExp('(premium\\s+)(' + N + ')', 'i'),
  attach:     new RegExp('(attach\\s+)(' + N + ')', 'i'),
  limit:      new RegExp('(limit\\s+)(' + N + ')', 'i'),
  merchantLo: new RegExp('(^\\s*merchant\\s*:\\s*)(' + N + ')', 'i'),
  merchantHi: new RegExp('(\\.\\.\\s*)(' + N + ')'),
};
/* fields that may be APPENDED to a structure that omitted them (the silent-no-op
   fix + the insure "＋ Add limit" row); each maps to how it's written back and to
   the kinds it's valid for (mirrors parse.js PARAM_KEYS). */
const APPENDABLE = {share: v => 'share ' + v + '%', fee: v => 'fee ' + v, limit: v => 'limit ' + v};
const APPEND_KINDS = {share: ['floor'], fee: ['floor', 'toll'], limit: ['insure']};

export const validators = {
  num: v => /^-?\d+(\.\d+)?$/.test(v.trim()),
  /* a label is free text that must survive being wrapped in "quotes" on one line
     — no embedded quote or newline. Empty is allowed (clears back to the default). */
  label: v => !/["\n]/.test(v),
};

/* Split a structure line into {head, comment}: head = "<kind>: <params>" with
   any trailing "label" removed and its trailing whitespace trimmed; label = the
   ' "…"' fragment (with its leading space) or ''; comment = the '// …' tail or
   ''. Everything is kept verbatim so a rewrite touches only what it means to. */
function splitParts(line){
  const cm = line.indexOf('//');
  let comment = '', head = line;
  if(cm >= 0){ comment = line.slice(cm); head = line.slice(0, cm); }
  head = head.replace(/\s*$/, '');
  const lm = head.match(/\s*"[^"]*"$/);
  let label = '';
  if(lm){ label = head.slice(lm.index); head = head.slice(0, head.length - label.length); }
  return {head: head.replace(/\s*$/, ''), label, comment};
}
const reassemble = ({head, label, comment}) => head + label + (comment ? '   ' + comment : '');

export function editField(line, field, value){
  const re = FIELD_RE[field];
  if(re && re.test(line))
    return line.replace(re, (m, pre, old, post) => pre + value.trim() + (typeof post === 'string' ? post : ''));
  /* absent but appendable (floor written without share/fee; insure without limit) */
  if(APPENDABLE[field]){
    const km = line.match(/^\s*(floor|toll|insure)\s*:/i);
    if(km && APPEND_KINDS[field].includes(km[1].toLowerCase())){
      const p = splitParts(line);
      p.head = p.head + ' ' + APPENDABLE[field](value.trim());
      return reassemble(p);
    }
  }
  return line;
}

/* Set / replace / clear the trailing "label" (Rename…). An empty newLabel drops
   the label; the parser then falls back to defaultLabel(). Comment preserved. */
export function editLabel(line, newLabel){
  const name = String(newLabel).trim();
  const p = splitParts(line);
  p.label = name ? ' "' + name + '"' : '';
  return reassemble(p);
}

/* Strip a share/fee/limit clause (insure "Remove limit"); label + comment kept. */
export function removeParam(line, key){
  if(!APPENDABLE[key]) return line;
  const p = splitParts(line);
  const stripped = p.head.replace(new RegExp('\\s+' + key + '\\s+' + N + '\\s*%?', 'i'), '');
  if(stripped === p.head) return line;               // absent: no-op
  p.head = stripped;
  return reassemble(p);
}

/* ---- add / remove a route leg (structure) ---- */
const round = x => String(Math.round(x));
export function legTemplate(kind, merchant){
  const lo = merchant ? merchant.lo : 60, hi = merchant ? merchant.hi : 180;
  const span = hi - lo, mid = (lo + hi) / 2;
  if(kind === 'floor') return merchant ? 'floor: ' + round(lo + 0.1 * span) + ' share 60%' : 'floor: 70 share 60%';
  if(kind === 'toll')  return merchant ? 'toll: ' + round(0.8 * mid) : 'toll: 95';
  if(kind === 'insure') return merchant
    ? 'insure: premium ' + round(0.05 * span) + ' attach ' + round(lo + 0.05 * span)
    : 'insure: premium 6 attach 65';
  return null;
}

export function addLegLine(text, kind){
  if(!['floor', 'toll', 'insure'].includes(kind)) return null;
  const model = parse(text);
  const newLine = legTemplate(kind, model.merchant);
  let afterLine;
  if(model.structures.length) afterLine = Math.max(...model.structures.map(s => s.srcLine));
  else if(model.merchant) afterLine = model.merchant.srcLine;
  else {                                             // no merchant yet: after the last config line
    const lines = text.split(/\r?\n/); afterLine = -1;
    for(let i = 0; i < lines.length; i++){
      const t = lines[i].trim();
      if(t && !t.startsWith('//') && /^(title|palette|accent|unit)\s*:/i.test(t)) afterLine = i;
    }
  }
  return {afterLine, newLine};
}

export function removeLegLine(text, srcLine){
  return parse(text).structures.some(s => s.srcLine === srcLine);
}

export {defaultLabel};
