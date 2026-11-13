/* Decision-tree DSL → model. No DOM. Spec: docs/superpowers/specs/2026-07-04-decision-tree-design.md §1 */
import {PALETTE_NAMES} from '../assets/series.js';

const SUFFIX = {k: 1e3, m: 1e6, b: 1e9};

/* "£2M", "-150k", "2M-5M", "2M–5M", "-1M to -0.5M" → {lo, hi} | null.
   The minus sign the tool prints (U+2212) and the en/em dash DSL.md promises for ranges
   are read as the plain hyphen, so the tool's own output and the documented forms round-trip. */
export function parseMoney(str){
  const clean = s => s.replace(/[£$€,\s]/g, '');
  str = str.replace(/[−–—]/g, '-');
  const one = s => {
    const m = clean(s).match(/^(-?\d*\.?\d+)([kKmMbB])?$/);
    if(!m) return null;
    return parseFloat(m[1]) * (SUFFIX[(m[2] || '').toLowerCase()] || 1);
  };
  const s = str.trim();
  if(/\sto\s/.test(s)){
    const [a, b] = s.split(/\sto\s/);
    const lo = one(a), hi = one(b);
    if(lo === null || hi === null) return null;
    return {lo: Math.min(lo, hi), hi: Math.max(lo, hi)};
  }
  /* dash range only when both halves are plain non-negatives */
  const dash = s.match(/^([^-\s]+)\s*-\s*([^-\s]+)$/);
  if(dash){
    const lo = one(dash[1]), hi = one(dash[2]);
    if(lo !== null && hi !== null && lo >= 0 && hi >= 0){
      return {lo: Math.min(lo, hi), hi: Math.max(lo, hi)};
    }
  }
  const v = one(s);
  return v === null ? null : {lo: v, hi: v};
}

/* a probability point or range: 0.4, 0.3-0.45, 40%, 30% to 50% → {lo, hi} | null. A "%" anywhere
   means every number in the text is a percentage ("30-50%" is 0.3 to 0.5). */
export function parseProbability(str){
  const s = str.trim();
  if(!s.includes('%')) return parseMoney(s);
  const r = parseMoney(s.replace(/%/g, ''));
  return r && {lo: r.lo / 100, hi: r.hi / 100};
}

function parseP(str, warn){
  const s = str.trim();
  if(/^rest$/i.test(s)) return 'rest';
  const r = parseProbability(s);
  if(!r){ warn('unreadable probability "' + s + '"'); return null; }
  if(r.lo < 0 || r.hi > 1) warn('probability outside 0–1: "' + s + '"');
  return r;
}

/* The value colon of a line body: the LAST colon whose tail reads as money — unless it sits between
   two digits with no space either side ("Meet at 10:30", a ratio "3:1"), which is part of the label.
   Returns {index, tail, value, glued}; glued=true means the colon was NOT taken as the separator
   although its tail would have read as a payoff (so the caller can say so). null = no value colon.
   Every documented form has a space after the colon ("Label: value", "Label (p=…) : value"). */
export function splitValue(body){
  const index = body.lastIndexOf(':');
  if(index < 0) return null;
  const tail = body.slice(index + 1).trim();
  const value = tail ? parseMoney(tail) : null;
  if(!value) return null;
  const glued = /\d$/.test(body.slice(0, index)) && /^\d/.test(body.slice(index + 1));
  return {index, tail, value, glued};
}

/* The sentence for a positive range wider than 1,000× (and for a simulated mean above a leaf's own
   top). The distribution is unchanged — a wide log-normal's average is carried by its rare extremes. */
export const WIDE_RATIO = 1000;
export const wideRangeSentence = (label, raw) =>
  '"' + label + '": a range this wide (' + raw + ') has an average driven by rare extremes, so its expected value may print above its own top';
export const isWideRange = v => !!v && v.lo > 0 && v.hi / v.lo > WIDE_RATIO;

export function parse(text){
  const model = {title: '', currency: '£', palette: 'ocean', accent: null, verdict: null,
    root: null, warnings: []};
  const lines = text.split(/\r?\n/);
  const stack = [];   // {node, level}
  const tops = [];

  for(let ln = 0; ln < lines.length; ln++){
    const raw = lines[ln].replace(/\t/g, '  ');
    const line = raw.trim();
    if(!line || line.startsWith('//')) continue;

    const config = line.match(/^(title|currency|palette|accent|verdict)\s*:\s*(.*)$/i);
    if(config && stack.length === 0 && tops.length === 0){
      const key = config[1].toLowerCase(), val = config[2].replace(/(^|\s)\/\/.*$/, '').trim();   // trailing comments are comments here too
      if(key === 'title') model.title = val;
      else if(key === 'verdict') model.verdict = val;   // raw; assets/verdict.js owns what off/empty mean
      else if(key === 'currency'){
        if(/^[£$€]$/.test(val)) model.currency = val;
        else model.warnings.push('line ' + (ln+1) + ': currency wants £, $ or € — kept ' + model.currency);
      }
      else if(key === 'palette'){
        const p = val.toLowerCase();
        if(PALETTE_NAMES.includes(p)) model.palette = p;
        else model.warnings.push('line ' + (ln+1) + ': unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      }
      else if(key === 'accent'){
        if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
        else model.warnings.push('line ' + (ln+1) + ': accent wants a 6-digit hex like #C05621');
      }
      continue;
    }

    const spaces = raw.match(/^ */)[0].length;
    if(spaces % 2 !== 0) model.warnings.push('line ' + (ln+1) + ': odd indent (' + spaces + ' spaces) — expected multiples of 2');
    const level = Math.round(spaces / 2);
    const warn = msg => model.warnings.push('line ' + (ln+1) + ': ' + msg);

    /* pull (p=…) from anywhere in the line */
    let p = null, pRaw = null, pParseValid = null, body = line;
    body = body.replace(/\(p=([^)]+)\)/i, (m, val) => {
      pRaw = val.trim(); p = parseP(val, warn); pParseValid = p !== null; return '';
    }).trim();

    /* value = text after the final colon, if it parses as money */
    let value = null, valueRaw = null, label = body;
    const split = splitValue(body);
    if(split && !split.glued){ value = split.value; valueRaw = split.tail; label = body.slice(0, split.index).trim(); }
    else if(split) warn('"' + body + '": a colon between digits is read as part of the label (a time or a ratio), not a payoff — write a space after the colon ("Label: value") to give it a value');
    if(!label){ warn('missing label'); label = '(unnamed)'; }

    const node = {label, kind: 'leaf', value, valueRaw, p, pRaw, pParseValid, children: [], srcLine: ln};
    while(stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if(stack.length === 0) tops.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({node, level});
  }

  if(tops.length === 0) return model;   // root stays null; app shows placeholder
  model.root = tops.length === 1 ? tops[0]
    : {label: 'Decision', kind: 'leaf', value: null, p: null, children: tops, srcLine: tops[0].srcLine, implicit: true};

  /* post-pass: kinds, probability integrity, warnings */
  (function finalise(node){
    if(node.children.length === 0){
      node.kind = 'leaf';
      if(!node.value){
        model.warnings.push('line ' + (node.srcLine + 1) + ': "' + node.label + '" has no value — treated as 0');
        node.value = {lo: 0, hi: 0};
      }
      if(isWideRange(node.value)) model.warnings.push('line ' + (node.srcLine + 1) + ': ' + wideRangeSentence(node.label, node.valueRaw));
      return;
    }
    if(isWideRange(node.value)) model.warnings.push('line ' + (node.srcLine + 1) + ': ' + wideRangeSentence(node.label, node.valueRaw));
    const rest = node.children.filter(c => c.p === 'rest');
    for(const duplicate of rest.slice(1)){
      model.warnings.push('line ' + (duplicate.srcLine + 1) + ': second p=rest under "' +
        node.label + '" — rejected and given p=0');
      duplicate.p = {lo: 0, hi: 0};
      duplicate.pRaw = '0';
    }
    /* any (p=…) annotation makes a sibling probabilistic, readable or not — an unreadable one is
       warned where it stands and must never quietly turn the chance node into a decision */
    const withP = node.children.filter(c => c.p !== null || c.pRaw !== null);
    if(withP.length > 0){
      node.kind = 'chance';
      const withoutP = node.children.filter(c => c.p === null);
      for(const c of withoutP){
        if(c.pParseValid !== false)
          model.warnings.push('line ' + (c.srcLine + 1) + ': "' + c.label + '" has no p= among probabilistic siblings — given p=0');
        c.p = {lo: 0, hi: 0};
      }
    } else {
      node.kind = 'decision';
    }
    if(node.implicit && node.kind === 'chance') node.label = 'Chance';
    node.children.forEach(finalise);
  })(model.root);

  return model;
}
