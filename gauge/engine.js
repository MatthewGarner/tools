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

/* Facilitator response-counter copy. Pure so it can be unit-tested; the console
   just prints the string. In round 2 the denominator is the whole final room
   (finalCount = union of both rounds), never the round-1 count — a newcomer who
   skipped round 1 must never read as "2 of 1". */
export function countLabel(round, data){
  if(round === 2){
    const revised = data.count2 || 0;
    if(revised === 0) return 'Round 2 open — waiting for revised estimates…';
    const total = data.finalCount != null ? data.finalCount : Math.max(data.count || 0, revised);
    const carried = Math.max(0, total - revised);
    const head = revised + ' of ' + total + ' revised so far';
    return carried === 0 ? head + ' — everyone has revised'
      : head + ' — the other ' + carried + (carried === 1 ? ' carries' : ' carry') + ' round 1 forward';
  }
  const n = data.count || 0;
  if(n === 0) return 'Waiting for responses…';
  return n + (n === 1 ? ' person has' : ' people have') + ' responded';
}

/* ---- Delphi round 2 (pure) ---- */

/* Classic Delphi carry-forward: a participant's final answer is their round-2
   value where given, else their round-1 value. Identity = server-issued `who`. */
export function mergeFinal(r1, r2){
  const map = new Map();
  for(const e of r1) map.set(e.who, {who: e.who, ...(e.name ? {name: e.name} : {}), values: [...e.values]});
  for(const e of r2){
    const prev = map.get(e.who);
    if(!prev){
      map.set(e.who, {who: e.who, ...(e.name ? {name: e.name} : {}), values: [...e.values]});
      continue;
    }
    e.values.forEach((v, i) => { if(v != null) prev.values[i] = v; });
    if(e.name) prev.name = e.name;
  }
  return [...map.values()];
}

const NARROWED = 25, WIDENED = -10;   // convergence % thresholds for the headline

export function delphiStats(model, r1, r2){
  const fin = mergeFinal(r1, r2);
  return model.questions.map((q, i) => {
    const pick = entries => entries.map(e => e.values[i]).filter(v => v != null);
    const a1 = pick(r1), af = pick(fin);
    const n = af.length;
    let spread1 = 0, spread2 = 0, pooled = null, pooledRange = null, pooledMid = null;
    if(q.type === 'prob'){
      const spreadOf = vs => vs.length > 1 ? Math.max(...vs) - Math.min(...vs) : 0;
      spread1 = spreadOf(a1);
      spread2 = spreadOf(af);
      if(n) pooled = quantile([...af].sort((a, b) => a - b), 0.5);
    } else {
      const spreadOf = vs => vs.length ? Math.max(...vs.map(v => v[1])) - Math.min(...vs.map(v => v[0])) : 0;
      spread1 = spreadOf(a1);
      spread2 = spreadOf(af);
      if(n){
        const med = xs => quantile([...xs].sort((a, b) => a - b), 0.5);
        pooledRange = [med(af.map(v => v[0])), med(af.map(v => v[1]))];
        pooledMid = med(af.map(v => (v[0] + v[1]) / 2));
      }
    }
    const convergencePct = spread1 > 0 ? (1 - spread2 / spread1) * 100 : 0;
    const u = q.unit ? ' ' + q.unit : '';
    const pooledText = q.type === 'prob'
      ? (pooled === null ? '' : 'pooled median ' + Math.round(pooled) + '%')
      : (pooledRange === null ? '' : 'pooled range ' + fmtN(pooledRange[0]) + '–' + fmtN(pooledRange[1]) + u);
    let headline;
    if(n === 0) headline = 'No responses in either round.';
    else if(n === 1) headline = 'Only one response — nothing to compare.';
    else if(spread1 === 0 && spread2 > 0)
      headline = 'The spread widened after discussion — ' + pooledText + ', but new doubt surfaced.';
    else if(spread1 === 0)
      headline = 'The room agreed in round 1 and held — ' + pooledText + '.';
    else if(convergencePct >= NARROWED)
      headline = 'Second round narrowed the spread ' + Math.round(convergencePct) + '% — ' + pooledText + '.';
    else if(convergencePct <= WIDENED)
      headline = 'The spread widened after discussion — ' + pooledText + ', but new doubt surfaced.';
    else
      headline = 'The second round barely moved — genuine disagreement. ' +
        (pooledText ? pooledText[0].toUpperCase() + pooledText.slice(1) + '.' : '');
    return {question: q, n, n2: pick(r2).length, spread1, spread2, convergencePct,
      pooled, pooledRange, pooledMid, pooledText, headline};
  });
}

const fmtN = v => Math.round(v * 10) / 10;

export function delphiVerdict(dstats){
  const active = dstats.filter(d => d.n > 0 && d.spread1 > 0);
  if(!active.length) return '';
  const meanConv = active.reduce((a, d) => a + d.convergencePct, 0) / active.length;
  if(meanConv >= NARROWED) return 'Round 2 converged — spreads narrowed ' + Math.round(meanConv) + '% on average.';
  if(meanConv <= WIDENED) return 'Round 2 widened the spreads — the discussion surfaced real doubt.';
  return 'Round 2 barely moved the room — the remaining disagreement is genuine.';
}

export function markdownSummary(model, stats, delphi){
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
  if(delphi){
    out.push('## Round 2 (Delphi)', '');
    const dv = delphiVerdict(delphi);
    if(dv) out.push('**' + dv + '**', '');
    delphi.forEach((d, i) => {
      out.push('- **' + (i + 1) + '. ' + d.question.text + '** — ' + d.headline +
        (d.n2 < d.n ? ' (' + (d.n - d.n2) + ' of ' + d.n + ' carried forward from round 1)' : ''));
    });
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}
