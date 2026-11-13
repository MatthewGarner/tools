/* The one printer for every Bets surface (board, quadrant, slide, Markdown,
   alt text). Pure: no DOM, no imports. A figure, a loss chance or a split
   median reads the same wherever it appears. */

export const MINUS = '−';

/* A whole number, except that a non-zero value which would round to zero keeps
   enough digits to show it ("−0.3"), never a bare "−0" or "0". */
function digits(v){
  const a = Math.abs(v), whole = Math.round(a);
  if(whole > 0 || a === 0) return String(whole);
  for(let d = 1; d <= 6; d++){ const t = a.toFixed(d); if(Number(t) > 0) return t; }
  return '0';
}
export const num = v => (v < 0 && Number(digits(v)) !== 0 ? MINUS : '') + digits(v);
export const sgn = v => (v < 0 && Number(digits(v)) !== 0 ? MINUS : '+') + digits(v);

/* totals of authored amounts: whole numbers, with one decimal while the total is
   a small fraction (a 1.5 total is not "2") */
export function amount(v){
  const a = Math.abs(v);
  if(a >= 10 || Number.isInteger(a)) return num(v);
  const t = a.toFixed(1);
  return (v < 0 && Number(t) !== 0 ? MINUS : '') + (t.endsWith('.0') ? t.slice(0, -2) : t);
}

/* ---------- chance of losing money, counted from the runs ---------- */
export function lossText(pf){
  if(!pf) return null;
  const p = pf.pLoss || 0, runs = pf.runs || 4000, certain = !!pf.certain;
  const whole = Math.round(p * 100);
  if(whole < 1) return p === 0 && certain ? '0%' : '<1%';
  if(whole > 99) return p * runs >= runs && certain ? '100%' : '>99%';
  return whole + '%';
}
/* the printed figure's rank, for tone and for comparing two scenarios */
export const lossWhole = pf => pf ? Math.round((pf.pLoss || 0) * 100) : null;
export const lossIsHigh = pf => !!pf && (pf.pLoss || 0) >= 0.5;

/* ---------- the portfolio median, or the two values it splits between ---------- */
export const isSplit = pf => !!(pf && pf.split);
export const p50Text = pf => pf.split ? sgn(pf.split.lo) + ' or ' + sgn(pf.split.hi) : sgn(pf.p50);
export const p50Alt = pf => pf.split
  ? 'median outcome split: about even odds of ' + sgn(pf.split.lo) + ' or ' + sgn(pf.split.hi)
  : 'median outcome ' + sgn(pf.p50);

/* ---------- authored inputs, as written ---------- */
const plain = r => !r ? '—' : r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];
/* numeric fallback (values that carry no authored text, e.g. a snapshot's old values) */
export const rangeText = r => plain(r);
export const oddsText = r => !r ? '—' : plain(r) + '%';
export const stakeOf = b => b.stake ? (b.authored && b.authored.stake) || plain(b.stake) : '—';
export const payoffOf = b => b.payoff ? (b.authored && b.authored.payoff) || plain(b.payoff) : '—';
export const oddsOf = b => b.odds ? ((b.authored && b.authored.odds) || plain(b.odds)) + '%' : '—';

/* ---------- concentration ---------- */
export function concentrationLine(conc){
  if(!conc) return null;
  const all = conc.all && conc.all.length ? conc.all : [conc];
  const pc = s => Math.round(s.share * 100) + '%';
  if(all.length === 1) return '⚑ ' + all[0].name + ' is ' + pc(all[0]) + ' of total stake — one bet carries the book.';
  const named = all.map(s => s.name + ' (' + pc(s)).map(t => t + ')');
  return '⚑ ' + named.slice(0, -1).join(', ') + ' and ' + named[named.length - 1] +
    ' each carry 40% or more of total stake.';
}

/* ---------- the shared scenario can lower the chance of a loss ---------- */
export function togetherNote(independent, shared){
  if(!independent || !shared) return null;
  if(!(lossWhole(shared) < lossWhole(independent))) return null;
  /* one shared draw adds positive covariance between the bets, so the swing always widens */
  return 'Moving together lowers the chance of a loss here (' + lossText(shared) + ' against ' +
    lossText(independent) + ') and widens the swing.';
}
