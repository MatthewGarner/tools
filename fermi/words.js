/* What Fermi says about its results: pure sentence and format helpers, no DOM, no random
   stream. app.js and the renderers import these so every surface prints a figure the
   same way and the sentences can be tested in node. */
import {fmt, sig, ratioStr, effDist, parseNum, readNumber} from './engine.js';

/* a whole-number share: never "0%" or "100%" for a value that is neither */
export function pctWhole(p){
  if(!(p > 0)) return '0%';
  if(p >= 1) return '100%';
  const r = Math.round(p * 100);
  return r === 0 ? '<1%' : r === 100 ? '>99%' : r + '%';
}
/* IRR, wherever it appears: one decimal place */
export const pctOne = v => v == null ? '—' : (v < 0 ? '−' : '') + (Math.abs(v) * 100).toFixed(1) + '%';

/* the shape a range is really sampled with, in words */
export function shapeLabel(dist, lo){
  const d = effDist(dist, lo);
  if(dist === 'logn' && d !== 'logn') return 'normal (log-normal needs a range above zero)';
  return d === 'logn' ? 'log-normal' : d === 'uni' ? 'uniform (full range)' : 'normal';
}

/* a solved stretch: two figures, and a factor below 1 is a shrink */
export function stretchLabel(r){
  if(r.kind !== 'mult') return 'shifted ' + (r.delta >= 0 ? '+' : '−') + fmt(Math.abs(r.delta));
  const f = r.factor;
  const text = f >= 2 ? sig(f, 2)
    : f > 1 ? ratioStr(f)
    : f > 0.5 && f < 1 ? String(Number((1 - Number((1 - f).toPrecision(2))).toFixed(12)))
    : sig(f, 2);
  return '×' + text + (f < 1 ? ' shrink' : ' stretch');
}

/* The cash-flow method line: timing convention, the shape each period actually uses, and
   that periods are drawn independently. `periods` are the entered rows (numeric lo/hi). */
export function cashflowMethod(spec, horizon, n){
  const groups = {'normal': [], 'log-normal': [], 'fixed': []};
  spec.periods.forEach((p, t) => {
    const lo = Math.min(p.lo, p.hi), hi = Math.max(p.lo, p.hi);
    groups[lo === hi ? 'fixed' : effDist('auto', lo) === 'logn' ? 'log-normal' : 'normal'].push('t' + t);
  });
  const shapes = Object.entries(groups).filter(([, ts]) => ts.length).map(([k, ts]) => k + ': ' + ts.join(', '));
  return 'Flows arrive at the end of each period, so t0 is not discounted · shapes (log-normal above zero, normal otherwise): ' +
    shapes.join('; ') + ' · periods drawn independently · ' + n.toLocaleString('en-GB') + ' seeded runs · deterministic';
}

/* ---------- the sensitivity bars: who is the top driver ---------- */
export const TIE = 0.02;                       // shares within 2 points of the top share are a tie
export function topDrivers(sens){
  if(!sens.length) return [];
  const top = sens[0].share;
  return sens.filter(s => top - s.share <= TIE + 1e-9).map(s => s.name);
}
const nm = n => n.replace(/_/g, ' ');
export function joinNames(names){
  const l = names.map(nm);
  return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1];
}
const NO_ONE = 'No single input dominates — pinning any one variable barely moves the spread. Tighten the top two together.';
export function leverHint(sens, fullLabel){
  const top = sens[0], names = topDrivers(sens);
  if(top.share <= 0.35) return NO_ONE;
  const lead = 'Each bar: how much of the spread disappears if you learn that number exactly. ';
  return names.length > 1
    ? lead + joinNames(names) + ' are level at the top — research them first.'
    : lead + 'Pin ' + nm(top.name) + ' and the spread drops from ' + fullLabel + ' to ' + top.label + ' — research it first.';
}
export function treeHeadline(sens, fullLabel){
  if(!sens.length) return 'Give the inputs ranges to see what drives the spread.';
  const top = sens[0], names = topDrivers(sens);
  if(top.share <= 0.35) return 'No single input dominates — the spread is shared across the drivers.';
  return names.length > 1
    ? 'Research ' + joinNames(names) + ' first — they are level as the biggest drivers.'
    : 'Research ' + nm(top.name) + ' first — pinning it cuts the spread from ' + fullLabel + ' to ' + top.label + '.';
}
export function leverLine(sens, fullLabel){
  const top = sens[0], names = topDrivers(sens);
  return names.length > 1
    ? 'Biggest levers: ' + joinNames(names) + ' are level — knowing any one of them exactly shrinks the spread the most.'
    : 'Biggest lever: ' + nm(top.name) + ' — knowing it exactly shrinks the spread from ' + fullLabel + ' to ' + top.label + '.';
}

/* ---------- statements about the answer ---------- */
/* P10 to P90 holds four runs in five; the sentence says so and claims no more */
export function verdictSentence(p10, p50, p90, unit){
  return '“Probably around ' + p50 + (unit ? ' ' + unit : '') + ' — four runs in five land between ' + p10 + ' and ' + p90 + '.”';
}
/* share of runs above T, over ALL runs (sorted ascending) */
export function shareAbove(sorted, t){
  let lo = 0, hi = sorted.length;
  while(lo < hi){ const m = (lo + hi) >> 1; if(sorted[m] <= t) lo = m + 1; else hi = m; }
  return sorted.length ? (sorted.length - lo) / sorted.length : 0;
}
/* "already at even odds" is about P(>T) being within 2 points of 50%, not how near T is to P50 */
export function evenOdds(sorted, t){
  return Math.abs(shareAbove(sorted, t) - 0.5) <= 0.02;
}

/* ---------- notes under the results ---------- */
export function invalidNote(invalid, N){
  if(!(invalid > 0)) return '';
  const share = invalid / N * 100;
  const pct = share < 0.1 ? '<0.1%' : sig(share, 2) + '%';
  return invalid.toLocaleString('en-GB') + ' of ' + N.toLocaleString('en-GB') + ' runs (' + pct +
    ') hit invalid maths and were left out' + (invalid > N * 0.01 ? ' — a range probably crosses zero.' : '.');
}
export function unmeasuredNote(names){
  return 'No bar for ' + names.map(nm).join(', ') + ' — pinning ' + (names.length > 1 ? 'either' : 'it') +
    ' leaves too few valid runs to measure.';
}
const additive = n => n.t === 'neg' || (n.t === 'bin' && (n.op === '+' || n.op === '-' || additive(n.l) || additive(n.r)));
/* a product that underflows shows as 0; say so (only where a zero cannot be a real answer) */
export function underflowNote(sorted, ranges, ast){
  if(!sorted.length || sorted[0] !== 0 || additive(ast)) return '';
  for(const k of Object.keys(ranges)){ const [a, b] = ranges[k]; if(Math.min(a, b) <= 0 && Math.max(a, b) >= 0) return ''; }
  return 'Part of the answer is too small for the computer to hold and shows as 0 — rescale the inputs (millions rather than units).';
}
export function arithmeticSentence(v){
  return isFinite(v)
    ? 'That’s just arithmetic — it comes to ' + fmt(v) + '. Name a quantity (e.g. attendees) to make it an estimate.'
    : 'That’s just arithmetic, and it doesn’t come to a number (a divide by zero, or too big). Check the formula.';
}
const describe = (side, text) => {
  const t = text.trim();
  return t ? side + ' box “' + (t.length > 24 ? t.slice(0, 23) + '…' : t) + '” can’t be read' : side + ' box empty';
};
export function waitingMessage(entries){
  const items = [];
  for(const e of entries){
    const bad = [];
    if(!isFinite(parseNum(e.lo))) bad.push(describe('low', e.lo));
    if(!isFinite(parseNum(e.hi))) bad.push(describe('high', e.hi));
    if(bad.length) items.push(e.name + ' (' + bad.join(', ') + ')');
  }
  return 'Waiting on ranges for: ' + items.join('; ') + '.';
}
/* “3m” is three million; if m is also an input, that may not be what was meant */
export function suffixWarnings({toks, ranges, varNames}){
  const clash = suf => varNames.some(v => v.toLowerCase() === suf.toLowerCase());
  const out = [];
  const add = t => { if(!out.includes(t)) out.push(t); };
  for(const tk of toks) if(tk.t === 'num' && tk.suf && clash(tk.suf))
    add('“' + tk.text + '” in the formula reads as ' + magnitude(tk.text) + ', and ' + tk.suf.toLowerCase() +
      ' is also an input here — write ' + tk.text.slice(0, -1) + ' * ' + tk.suf.toLowerCase() + ' if you meant a product.');
  for(const r of ranges) for(const text of [r.lo, r.hi]){
    const n = readNumber(text);
    if(n && n.suffix && clash(n.suffix))
      add('“' + text.trim() + '” in ' + r.name + '’s range reads as ' + magnitude(text.trim()) + ', and ' +
        n.suffix.toLowerCase() + ' is also an input here.');
  }
  return out;
}
const SUFFIX_WORD = {k: 'thousand', m: 'million', b: 'billion', t: 'trillion'};
const magnitude = text => text.slice(0, -1).trim() + ' ' + SUFFIX_WORD[text.slice(-1).toLowerCase()];

/* ---------- shapes ---------- */
export const rangeAria = (name, side, dist) => name + ' ' + side + ' (' + (dist === 'uni' ? 'full range' : '90% interval') + ')';
export function distOverrideNotes(varNames, ranges, dists){
  return varNames.filter(n => dists[n] === 'logn' && Math.min(...ranges[n]) <= 0)
    .map(n => nm(n) + ' is set to log-normal but its range reaches zero, so it runs as normal.');
}
/* what the estimate page's method line says: the shape each range really uses */
export function estimateMethod(varNames, ranges, dists, n){
  const counts = new Map();
  for(const v of varNames){
    const [a, b] = ranges[v], lo = Math.min(a, b);
    const k = a === b ? 'fixed' : effDist(dists[v], lo) === 'logn' ? 'log-normal' : effDist(dists[v], lo) === 'uni' ? 'uniform (full range)' : 'normal';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const order = ['log-normal', 'normal', 'uniform (full range)', 'fixed'];
  return 'Fit per range: ' + order.filter(k => counts.has(k)).map(k => counts.get(k) + ' ' + k).join(', ') +
    ' · ' + n.toLocaleString('en-GB') + ' samples';
}
/* "nothing plausible" says how far the solver looked */
export function nothingPlausible(dir, t, cap){
  return 'Nothing plausible ' + (dir < 0 ? 'keeps you under ' : 'gets you to ') + t +
    ' — I looked as far as ' + cap + ' half-widths of stretch, on one input or two together.';
}
