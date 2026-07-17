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
