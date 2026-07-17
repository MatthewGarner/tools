/* The inverse of parse.js's parseMoney/parseP, plus width-preserving range translation.
   Pure, no DOM. The priced-insistence slider's variable is an input's MIDPOINT; committing it
   must translate the stated 90% interval to the new midpoint WITHOUT collapsing its width (that
   would silently change the MC verdict). Round-trip guaranteed by test: parse(format(...)) ≈ input. */

/* number → "1.05M" / "-150k" / "250" — chosen suffix keeps it readable; parseMoney reads it back.
   Up to 6 mantissa decimals (stripped) keeps the round-trip error negligible for a slider. */
export function formatMoney(v){
  if(!isFinite(v)) return '0';
  if(v === 0) return '0';
  const neg = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const [suf, div] = a >= 1e9 ? ['B', 1e9] : a >= 1e6 ? ['M', 1e6] : a >= 1e3 ? ['k', 1e3] : ['', 1];
  const mant = (a / div).toFixed(6).replace(/\.?0+$/, '');
  return neg + mant + suf;
}

/* probability → "0.6" — a plain decimal parseP reads as {lo,hi}; display clamped to [0,1]. */
export function formatP(v){
  const c = Math.min(1, Math.max(0, v));
  return c.toFixed(6).replace(/\.?0+$/, '') || '0';
}

/* {lo,hi} → DSL text: a point renders as one number, a range as "lo to hi" (parseMoney reads
   " to " for any sign; a dash range is only valid for non-negatives, so " to " is the safe form). */
export function formatRange(range, isProb = false){
  const f = isProb ? formatP : formatMoney;
  return range.lo === range.hi ? f(range.lo) : f(range.lo) + ' to ' + f(range.hi);
}

/* Translate an interval to a new midpoint, PRESERVING its width. Probabilities clamp into [0,1]
   (shrinking width only when a preserved width would breach a bound — you can't hold a wide
   interval hard against 0 or 1). Money is unbounded (negatives fine). A point (lo===hi) stays a point. */
export function shiftRange(range, newMid, isProb = false){
  const half = (range.hi - range.lo) / 2;
  let lo = newMid - half, hi = newMid + half;
  if(isProb){ lo = Math.max(0, Math.min(1, lo)); hi = Math.max(0, Math.min(1, hi)); }
  return {lo, hi};
}

/* ---------- priced-insistence copy (B3) ----------
   Pure text builders — no DOM, no engine calls. tree/app.js supplies the numbers (the nearest
   flip boundary inside the slider's track, and — only when there is none — whether one exists
   further out via engine.js's hingesBeyondTrack) computed from flipAlong/sliderExtent; these
   functions only turn numbers into the house copy pattern, so they're unit-testable with plain
   numbers and no tree fixture at all. */

const pct = v => {
  const r = Math.round(v * 1000) / 10;   // one decimal, e.g. "62.5%"; whole numbers drop the .0
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)) + '%';
};
const points = (a, b) => {
  const d = Math.round(Math.abs(a - b) * 1000) / 10;
  return (Number.isInteger(d) ? d.toFixed(0) : d.toFixed(1)) + (d === 1 ? ' point' : ' points');
};
const priceMoney = (v, currency) => (v < 0 ? '−' : '') + currency + formatMoney(Math.abs(v));

/* {winnerLabel, kind, label, currency, x, boundary, hingesBeyond, trackLo, trackHi} →
   the two-sided priced-insistence line (I1/I4). `boundary` is the nearest flip inside the
   input's track (null when none was found there); `hingesBeyond` — consulted only when
   boundary is null — is the far boundary hingesBeyondTrack found (or null), distinguishing
   "never hinges" from "hinges, but only past a plausible value" (a probability's track IS
   [0,1] already, so that case can only arise for a money value). */
export function pricedCopy({winnerLabel, kind, label, currency = '£', x, boundary, hingesBeyond, trackLo, trackHi}){
  const isProb = kind === 'prob';
  const noun = isProb ? 'odds' : 'payoff';
  if(boundary === null || boundary === undefined){
    if(hingesBeyond !== null && hingesBeyond !== undefined){
      const bound = hingesBeyond > x ? trackHi : trackLo;
      const boundStr = isProb ? pct(bound) : priceMoney(bound, currency);
      return `You'd need ${label}'s ${noun} past ${boundStr} — beyond any plausible value here.`;
    }
    return `On these numbers the call no longer hinges on ${label}'s ${noun}.`;
  }
  const cross = boundary > x ? 'rise above' : 'fall below';
  const xStr = isProb ? pct(boundary) : priceMoney(boundary, currency);
  const dist = isProb ? points(boundary, x) : priceMoney(Math.abs(boundary - x), currency);
  return `${winnerLabel} holds until ${label}'s ${noun} would ${cross} ${xStr} — ${dist} from where you've set it.`;
}

/* The at-rest honesty seam (I-6): whenever the midpoint story's recommendation differs from the
   settled MC policy's, a PERSISTENT line says so — never claims the MC verdict flipped, only that
   the two stories currently disagree. Empty string ⇒ nothing to show (they agree, or there's no
   decision to compare). */
export function seamCopy(detLabel, mcLabel){
  if(!detLabel || !mcLabel || detLabel === mcLabel) return '';
  return `On midpoints, ${detLabel} edges ahead; across your full ranges, ${mcLabel} still wins.`;
}
