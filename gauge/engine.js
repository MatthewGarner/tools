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

export function sessionStats(model, responses){
  return model.questions.map((q, i) => {
    const answers = [];
    for(const r of responses){
      const v = r.values[i];
      if(v == null) continue;
      if(q.type === 'range' && Array.isArray(v)) answers.push({low: v[0], high: v[1], name: r.name});
      else if(q.type === 'prob' && typeof v === 'number') answers.push({value: v, name: r.name});
    }
    const s = q.type === 'range' ? rangeStats(answers) : probStats(answers);
    return {...s, question: q};
  });
}

export function verdict(stats){
  const scored = stats.map((s, i) => ({s, i})).filter(x => x.s.kind !== 'empty' && x.s.kind !== 'single');
  if(scored.length < 2) return '';
  const discuss = scored.filter(x => x.s.discuss);
  if(!discuss.length) return 'Broad agreement across all ' + scored.length + ' items.';
  if(discuss.length === scored.length) return 'No consensus anywhere — every item is worth discussion.';
  const refs = discuss.map(x => '#' + (x.i + 1));
  const list = refs.length === 1 ? refs[0] : refs.slice(0, -1).join(', ') + ' and ' + refs[refs.length - 1];
  return 'Broad agreement on ' + (scored.length - discuss.length) + ' of ' + scored.length +
    ' items; discuss ' + list + '.';
}

export function markdownSummary(model, stats){
  const out = ['# ' + (model.title || 'Gauge session'), ''];
  const v = verdict(stats);
  if(v) out.push('**' + v + '**', '');
  stats.forEach((s, i) => {
    const q = s.question;
    out.push('## ' + (i + 1) + '. ' + q.text, '', s.headline, '');
    if(s.kind === 'empty' || s.kind === 'single'){ out.push('- ' + s.n + ' response(s)', ''); return; }
    if(q.type === 'prob'){
      out.push('- ' + s.n + ' responses · median ' + pct(s.median) +
        ' · spread ' + pct(s.rows[0].value) + '–' + pct(s.rows[s.n - 1].value));
      if(s.camps) out.push('- camps: ' + s.camps.lo.n + ' near ' + pct(s.camps.lo.center) +
        ', ' + s.camps.hi.n + ' near ' + pct(s.camps.hi.center));
    } else {
      const u = q.unit ? ' ' + q.unit : '';
      out.push('- ' + s.n + ' responses · pooled ' + s.pooled.lo + '–' + s.pooled.hi + u +
        ' · median interval width ' + s.medianWidth + u);
      out.push(s.overlap ? '- common ground: ' + s.overlap.lo + '–' + s.overlap.hi + u
        : '- no value everyone believes');
    }
    out.push('');
  });
  return out.join('\n').trim() + '\n';
}
