/* Divergence stats, headlines, verdict, markdown summary. Pure. */
import {quantile} from '../assets/series.js';

export const RATIO_DIVERGENT = 3;   // pooled spread ÷ median individual width
export const SPLIT_GAP = 25;        // percentage points
export const AGREE_SPREAD = 20;     // percentage points

const pct = v => Math.round(v) + '%';
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length;

export function rangeStats(answers){
  const n = answers.length;
  if(n === 0) return {kind: 'empty', n, headline: 'No responses yet.', discuss: false};
  const rows = answers.map(a => ({...a, mid: (a.low + a.high) / 2}))
    .sort((a, b) => a.mid - b.mid || a.low - b.low);
  const lows = rows.map(r => r.low), highs = rows.map(r => r.high);
  const pooled = {lo: Math.min(...lows), hi: Math.max(...highs)};
  const ovLo = Math.max(...lows), ovHi = Math.min(...highs);
  const overlap = ovLo <= ovHi ? {lo: ovLo, hi: ovHi} : null;
  if(n === 1) return {kind: 'single', n, rows, pooled, overlap,
    headline: 'Only one response — nothing to compare yet.', discuss: false};
  const widths = rows.map(r => r.high - r.low).sort((a, b) => a - b);
  const medianWidth = quantile(widths, 0.5);
  const ratio = medianWidth > 0 ? (pooled.hi - pooled.lo) / medianWidth : Infinity;
  let kind, headline;
  if(overlap){ kind = 'agreement'; headline = "Everyone's intervals overlap — genuine agreement."; }
  else if(ratio >= RATIO_DIVERGENT){ kind = 'divergent'; headline = "The room's disagreement is wider than any individual's uncertainty."; }
  else { kind = 'moderate'; headline = 'Close but not aligned — the intervals miss each other at the edges.'; }
  return {kind, n, rows, pooled, overlap, medianWidth, ratio, headline, discuss: kind !== 'agreement'};
}

export function probStats(answers){
  const n = answers.length;
  if(n === 0) return {kind: 'empty', n, headline: 'No responses yet.', discuss: false};
  const rows = [...answers].sort((a, b) => a.value - b.value);
  const values = rows.map(r => r.value);
  const median = quantile(values, 0.5);
  if(n === 1) return {kind: 'single', n, rows, median,
    headline: 'Only one response — nothing to compare yet.', discuss: false};
  const spread = values[n - 1] - values[0];
  let gap = 0, gapAt = 0;
  for(let i = 1; i < n; i++){
    if(values[i] - values[i - 1] > gap){ gap = values[i] - values[i - 1]; gapAt = i; }
  }
  let kind, headline, camps = null;
  if(n >= 4 && gap >= SPLIT_GAP && gap >= spread / 2){
    kind = 'split';
    const lo = values.slice(0, gapAt), hi = values.slice(gapAt);
    camps = {lo: {n: lo.length, center: mean(lo)}, hi: {n: hi.length, center: mean(hi)}};
    const share = lo.length === hi.length ? ['half', 'half']
      : lo.length > hi.length ? ['most', 'a few'] : ['a few', 'most'];
    headline = 'Split room: ' + share[0] + ' near ' + pct(camps.lo.center) +
      ', ' + share[1] + ' near ' + pct(camps.hi.center) + '.';
  } else if(spread <= AGREE_SPREAD){
    kind = 'agreement';
    headline = 'The room agrees — everyone within ' + pct(spread) + ' of each other, median ' + pct(median) + '.';
  } else {
    kind = 'spread';
    headline = 'Estimates run from ' + pct(values[0]) + ' to ' + pct(values[n - 1]) + ' — median ' + pct(median) + '.';
  }
  return {kind, n, rows, median, spread, gap, camps, headline, discuss: kind !== 'agreement'};
}
