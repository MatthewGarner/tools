/* Decision-tree DSL → model. No DOM. Spec: docs/superpowers/specs/2026-07-04-decision-tree-design.md §1 */
import {PALETTE_NAMES} from '../assets/series.js';

const SUFFIX = {k: 1e3, m: 1e6, b: 1e9};

/* "£2M", "-150k", "2M-5M", "-1M to -0.5M" → {lo, hi} | null */
export function parseMoney(str){
  const clean = s => s.replace(/[£$€,\s]/g, '');
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

function parseP(str, warn){
  const s = str.trim();
  if(/^rest$/i.test(s)) return 'rest';
  const r = parseMoney(s);
  if(!r){ warn('unreadable probability "' + s + '"'); return null; }
  if(r.lo < 0 || r.hi > 1) warn('probability outside 0–1: "' + s + '"');
  return r;
}

export function parse(text){
  const model = {title: '', currency: '£', palette: 'ocean', accent: null,
    root: null, warnings: []};
  const lines = text.split(/\r?\n/);
  const stack = [];   // {node, level}
  const tops = [];

  for(let ln = 0; ln < lines.length; ln++){
    const raw = lines[ln].replace(/\t/g, '  ');
    const line = raw.trim();
    if(!line || line.startsWith('//')) continue;

    const config = line.match(/^(title|currency|palette|accent)\s*:\s*(.*)$/i);
    if(config && stack.length === 0 && tops.length === 0){
      const key = config[1].toLowerCase(), val = config[2].trim();
      if(key === 'title') model.title = val;
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
    let p = null, pRaw = null, body = line;
    body = body.replace(/\(p=([^)]+)\)/i, (m, val) => { pRaw = val.trim(); p = parseP(val, warn); return ''; }).trim();

    /* value = text after the final colon, if it parses as money */
    let value = null, valueRaw = null, label = body;
    const colon = body.lastIndexOf(':');
    if(colon >= 0){
      const tail = body.slice(colon + 1).trim();
      const parsed = tail ? parseMoney(tail) : null;
      if(parsed){ value = parsed; valueRaw = tail; label = body.slice(0, colon).trim(); }
    }
    if(!label){ warn('missing label'); label = '(unnamed)'; }

    const node = {label, kind: 'leaf', value, valueRaw, p, pRaw, children: [], srcLine: ln};
    while(stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if(stack.length === 0) tops.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({node, level});
  }

  if(tops.length === 0) return model;   // root stays null; app shows placeholder
  model.root = tops.length === 1 ? tops[0]
    : {label: 'Decision', kind: 'leaf', value: null, p: null, children: tops, srcLine: tops[0].srcLine, implicit: true};

  /* post-pass: kinds, rest inference, warnings */
  (function finalise(node){
    if(node.children.length === 0){
      node.kind = 'leaf';
      if(!node.value){
        model.warnings.push('line ' + (node.srcLine + 1) + ': "' + node.label + '" has no value — treated as 0');
        node.value = {lo: 0, hi: 0};
      }
      return;
    }
    const withP = node.children.filter(c => c.p !== null);
    if(withP.length > 0){
      node.kind = 'chance';
      const withoutP = node.children.filter(c => c.p === null);
      const hasRest = node.children.some(c => c.p === 'rest');
      if(withoutP.length === 1 && !hasRest){
        withoutP[0].p = 'rest';
      } else {
        for(const c of withoutP){
          model.warnings.push('line ' + (c.srcLine + 1) + ': "' + c.label + '" has no p= among probabilistic siblings — given p=0');
          c.p = {lo: 0, hi: 0};
        }
      }
    } else {
      node.kind = 'decision';
    }
    node.children.forEach(finalise);
  })(model.root);

  return model;
}
