/* The one printer for every Bets surface (board, quadrant, slide, Markdown,
   alt text). Pure: no DOM, no imports. A figure, a loss chance or a split
   median reads the same wherever it appears. */

import {fmt} from '../assets/series.js';

export const MINUS = '−';
/* simulated runs behind every sampled figure; every surface that names the count reads this */
export const NSIM = 40000;
export const NSIM_TEXT = NSIM.toLocaleString('en-US');

/* A figure of a million or more prints in the suite's compact form ("1.23M") wherever Bets prints a number: a full run of
   digits overprints its neighbours and runs off the canvas. */
const COMPACT_FROM = 1e6;
const isBig = v => Math.abs(v) >= COMPACT_FROM;
/* every number of a million or more inside authored text ("1,000,000-2,500,000" → "1M-2.5M"); the rest is as written */
export const compactText = text => String(text).replace(/\d[\d,]*(?:\.\d+)?/g, token => {
  const v = Number(token.replace(/,/g, ''));
  return Number.isFinite(v) && isBig(v) ? fmt(v) : token;
});

/* A whole number, except that a non-zero value which would round to zero keeps
   enough digits to show it ("−0.3"), never a bare "−0" or "0". */
function digits(v){
  const a = Math.abs(v), whole = Math.round(a);
  if(isBig(a)) return fmt(a);
  if(whole > 0 || a === 0) return String(whole);
  for(let d = 1; d <= 6; d++){ const t = a.toFixed(d); if(Number(t) > 0) return t; }
  return '0';
}
export const num = v => (v < 0 && Number(digits(v)) !== 0 ? MINUS : '') + digits(v);
export const sgn = v => (v < 0 && Number(digits(v)) !== 0 ? MINUS : '+') + digits(v);

/* ---------- a sampled figure is printed to what the runs support ----------
   Portfolio outcomes share ONE step (a tenth of the power of ten of the largest of them),
   a bet's EV trio another (0.5% of its largest). The engine puts `step` on each result; a value
   that rounds to zero prints "0". A result with no step (hand-built) prints whole numbers. */
export function atStep(v, step){
  if(!(step > 0) || isBig(v)) return sgn(v);
  const decimals = step >= 1 ? 0 : Math.round(-Math.log10(step));
  const rounded = Math.round(Math.abs(v) / step) * step;
  if(isBig(rounded)) return (v < 0 ? MINUS : '+') + fmt(rounded);
  const text = rounded.toFixed(decimals);
  return Number(text) === 0 ? '0' : (v < 0 ? MINUS : '+') + text;
}
export const pv = (pf, v) => atStep(v, pf.step);
export const evv = (ev, v) => atStep(v, ev.step);

/* totals of authored amounts: whole numbers, with one decimal while the total is
   a small fraction (a 1.5 total is not "2") */
export function amount(v){
  const a = Math.abs(v);
  if(isBig(a)) return num(v);
  if(a >= 10 || Number.isInteger(a)) return num(v);
  const t = a.toFixed(1);
  return (v < 0 && Number(t) !== 0 ? MINUS : '') + (t.endsWith('.0') ? t.slice(0, -2) : t);
}

/* ---------- chance of losing money, counted from the runs ---------- */
export function lossText(pf){
  if(!pf) return null;
  const p = pf.pLoss || 0, runs = pf.runs || NSIM, certain = !!pf.certain;
  const whole = Math.round(p * 100);
  if(whole < 1) return p === 0 && certain ? '0%' : '<1%';
  if(whole > 99) return p * runs >= runs && certain ? '100%' : '>99%';
  return whole + '%';
}
/* the printed figure's rank, for tone and for comparing two scenarios */
export const lossWhole = pf => pf ? Math.round((pf.pLoss || 0) * 100) : null;
/* tone follows the printed whole percent, as it always has */
export const lossIsHigh = pf => !!pf && lossWhole(pf) >= 50;

/* ---------- the portfolio median, or the two values it splits between ---------- */
export const isSplit = pf => !!(pf && pf.split);
export const p50Text = pf => pf.split ? pv(pf, pf.split.lo) + ' or ' + pv(pf, pf.split.hi) : pv(pf, pf.p50);
/* the portfolio reading, worded one way on every surface (Board receipt, Quadrant receipt, slide) */
export const outcomeText = pf => pf ? 'MEDIAN OUTCOME ' + p50Text(pf) + ' · P10 ' + pv(pf, pf.p10) + ' · P90 ' + pv(pf, pf.p90) : 'NOT AVAILABLE';
export const p50Alt = pf => pf.split
  ? 'median outcome split: about even odds of ' + pv(pf, pf.split.lo) + ' or ' + pv(pf, pf.split.hi)
  : 'median outcome ' + pv(pf, pf.p50);

/* ---------- authored inputs, as written ---------- */
const plain = r => !r ? '—' : r[0] === r[1] ? compactText(String(r[0])) : compactText(r[0] + '–' + r[1]);
/* numeric fallback (values that carry no authored text, e.g. a snapshot's old values) */
export const rangeText = r => plain(r);
export const oddsText = r => !r ? '—' : plain(r) + '%';
export const stakeOf = b => b.stake ? compactText((b.authored && b.authored.stake) || plain(b.stake)) : '—';
export const payoffOf = b => b.payoff ? compactText((b.authored && b.authored.payoff) || plain(b.payoff)) : '—';
export const oddsOf = b => b.odds ? ((b.authored && b.authored.odds) || plain(b.odds)) + '%' : '—';

/* ---------- Markdown ----------
   One escaping rule, identical in Bets, Tree and Paths (each keeps its own copy): a backslash before each of
   \ | * _ ` [ ] < >, a newline as a space, and no HTML entities. A plain-text paste shows the characters as typed. */
export const mdEscape = value => String(value == null ? '—' : value).replace(/\r?\n/g, ' ').replace(/[\\|*_`[\]<>]/g, '\\$&');

/* ---------- concentration ---------- */
export function concentrationLine(conc){
  if(!conc) return null;
  const all = conc.all && conc.all.length ? conc.all : [conc];
  const pc = s => Math.round(s.share * 100) + '%';
  if(all.length === 1) return 'Concentration: ' + all[0].name + ' is ' + pc(all[0]) + ' of total stake — one bet carries the book.';
  const named = all.map(s => s.name + ' (' + pc(s)).map(t => t + ')');
  return 'Concentration: ' + named.slice(0, -1).join(', ') + ' and ' + named[named.length - 1] +
    ' each carry 40% or more of total stake.';
}

/* ---------- the shared scenario can lower the chance of a loss ---------- */
export function togetherNote(independent, shared){
  if(!independent || !shared) return null;
  if(!(lossWhole(shared) < lossWhole(independent))) return null;
  /* "widens the swing" only when the printed P10 to P90 width really is larger */
  const at = (pf, v) => pf.step > 0 ? Math.round(v / pf.step) * pf.step : Math.round(v);
  const width = pf => at(pf, pf.p90) - at(pf, pf.p10);
  return 'Moving together lowers the chance of a loss here (' + lossText(shared) + ' against ' +
    lossText(independent) + ')' + (width(shared) > width(independent) ? ' and widens the swing.' : '.');
}
