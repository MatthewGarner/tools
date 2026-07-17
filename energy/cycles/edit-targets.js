/* Pure text rewrites for /cycles edit-in-place. Fields address the 1st or 2nd
   number on a key's line; on single-value lines the Lo field edits the lone
   number (the renderer only emits Hi targets for real ranges). */
import {parse} from './parse.js';
const N = '-?\\d+(?:\\.\\d+)?';
export const validators = {num: v => /^-?\d+(\.\d+)?$/.test(v.trim())};

/* field → [key, which] ; which: 0 = first number on the line, 1 = second */
const FIELDS = {
  mw: ['battery', 0], mwh: ['battery', 1],
  spreadLo: ['spread', 0], spreadHi: ['spread', 1],
  chargeLo: ['charge', 0], chargeHi: ['charge', 1],
  secondLo: ['second', 0], secondHi: ['second', 1],
  driftLo: ['drift', 0], driftHi: ['drift', 1],
  rteLo: ['rte', 0], rteHi: ['rte', 1],
  fadeLo: ['fade', 0], fadeHi: ['fade', 1],
  calLo: ['calendar', 0], calHi: ['calendar', 1],
  budget: ['cycles', 0], years: ['cycles', 1],
  augLo: ['augment', 0], augHi: ['augment', 1],
  discLo: ['discount', 0], discHi: ['discount', 1],
};

export function editField(line, field, value){
  const spec = FIELDS[field];
  if(!spec) return line;
  const [key, which] = spec;
  if(!new RegExp('^\\s*' + key + '\\s*:', 'i').test(line)) return line;
  let i = -1;
  return line.replace(new RegExp(N, 'g'), m => (++i === which) ? value.trim() : m);
}

/* ---- structure edits: add / remove an optional key line (phone card menu) ----
   The text stays the model: adding an absent optional key inserts a real,
   editable line with a sensible default; removing one deletes the line and the
   parser's own default takes over (charge → 45%-of-spread, discount → flat 8%).
   Insertion lands after the nearest PRESENT canonical predecessor so the doc
   keeps reading like the examples. Both are pure; the app dispatches the line
   op through CodeMirror (one undoable event). */

/* canonical key order (parse.js KEYS, config stripped) — drives insert position */
const ORDER = ['battery', 'spread', 'charge', 'second', 'drift', 'rte', 'fade', 'calendar', 'cycles', 'augment', 'discount'];
export const ADDABLE = new Set(['charge', 'second', 'drift', 'augment', 'discount']);

const round = x => String(Math.round(x));
/* per-key inline default; charge is derived from the real spread so "add charge"
   just makes the assumption the model was already using explicit + editable. */
function defaultLine(model, key){
  if(key === 'charge'){
    if(!model.spread) return 'charge: 15..45';
    const p50 = Math.sqrt(model.spread.lo * model.spread.hi) || model.spread.lo;
    return 'charge: ' + round(0.45 * p50);
  }
  return {second: 'second: 35..60%', drift: 'drift: -4..0 %/yr',
    augment: 'augment: 120..180 £/kWh', discount: 'discount: 7..10%'}[key];
}

export function addKeyLine(text, key){
  if(!ADDABLE.has(key)) return null;
  const model = parse(text);
  if(model.srcLines[key] != null) return null;        // already present
  const newLine = defaultLine(model, key);
  const idx = ORDER.indexOf(key);
  /* nearest present canonical predecessor (largest ORDER index still < key's) */
  let afterLine = -1, bestRank = -1;
  for(let r = 0; r < idx; r++){
    const src = model.srcLines[ORDER[r]];
    if(src != null && r > bestRank){ bestRank = r; afterLine = src; }
  }
  if(afterLine < 0){                                  // no predecessor: after the config block
    for(const k of ['title', 'accent', 'palette']) if(model.srcLines[k] != null) afterLine = Math.max(afterLine, model.srcLines[k]);
  }
  return {afterLine, newLine};
}

export function removeKeyLine(text, key){
  if(!ADDABLE.has(key)) return -1;
  const src = parse(text).srcLines[key];
  return src == null ? -1 : src;
}
