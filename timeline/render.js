/* Timeline's public render boundary. Field owns the visual composition; this
   module keeps only its semantic helpers and public output routes. */
import {fmtDay, fmtItemDay, fmtQuoted} from './parse.js';
import {mergeBias, laneVsDeadline, laneFits} from './mergebias.js';
import {duration} from './duration.js';
import {resolveVerdict} from '../assets/verdict-core.js';
import {decisionLead, leadDuration, leadReceipt, primaryDecisionLead} from './lrm.js';
import {renderField} from './render-field.js';

/* ONE today for every surface: the document's own `today:` when it has one, else the
   clock the caller passes. Applied at each public entry point, so no consumer can
   disagree with the page. */
const effToday = (model, clock) => model.today ?? clock;

/* a shown figure that must be found VERBATIM and FIRST in its line (assets/verdict-core's
   markFigure splits on the first occurrence): when the same digits appear earlier ("5%" in a
   label's "15%"), widen the figure leftwards to the shortest run that is unique there. */
function uniqueFig(pre, shown, post, fig){
  const line = pre + shown + post, at = pre.length + Math.max(0, shown.lastIndexOf(fig));
  let k = 0, cand = fig;
  while(k < at && (line.indexOf(cand) !== at - k || /^\s/.test(cand))){ k++; cand = line.slice(at - k, at + fig.length); }
  return cand;
}

/* a tail of the readout sentence: lanes left out of the joint, lanes past their P90 */
const notCountedTail = n => n ? ' \u00b7 ' + n + ' single-date lane' + (n > 1 ? 's' : '') + ' not counted' : '';
const staleTailOf = n => n ? ' \u00b7 ' + n + (n > 1
  ? ' lanes past their P90 — re-estimate them' : ' lane past its P90 — re-estimate it') : '';

/* plain-text mirror of the SVG's "one quotable line" readout — the HTML text
   app.js shows next to the diagram. Pure; same inputs render() itself uses. */
/* the "Next up / Widest whisker" operational bits (the pre-merge readout).
   Each part carries its OWN load-bearing figure, so whichever part ends up
   leading the verdict can name it without the renderer re-deriving it. */
function restParts(model, today){
  const items = model.items;
  const fits = laneFits(model, today);
  const upcoming = items.filter(i => i.status !== 'done' && i.p50 >= today).sort((a, b) => a.p50 - b.p50)[0];
  const ranged = items.filter(i => !i.single);
  const widest = ranged.length ? ranged.reduce((a, b) => (b.p90 - b.p50) > (a.p90 - a.p50) ? b : a) : null;
  const parts = [];
  const primary = primaryDecisionLead(model, today);
  if(primary){
    const receipt = leadReceipt(primary.it, today);
    parts.push({text: receipt.text, fig: fmtDay(primary.day)});
  }
  /* every ranged lane has reached its P50 finish and is still open: there is no forecast
     left to quote, and "Widest whisker" would be the wrong thing to lead with */
  if(fits.lanes.length && fits.lanes.every(l => l.p50 <= today)){
    const n = fits.lanes.length, past = fits.stale;
    parts.push({text: (n === 1 ? 'The ranged lane has reached its P50 finish and is still open' : 'All ' + n + ' ranged lanes have reached their P50 finish and are still open') +
      ' (' + (past ? (n === 1 ? 'past its P90' : past + ' past their P90') : 'not yet past ' + (n === 1 ? 'its' : 'their') + ' P90') + ') — ' + (n === 1 ? 'it needs' : 'they need') + ' new dates.',
      fig: 'still open'});
  }
  /* one ranged lane + a deadline: mergeBias stays silent (there is no MERGE), but
     the question is well posed and the answer is already computed. */
  const lvd = laneVsDeadline(model, today);
  if(lvd){
    const pre = lvd.name + ' clears the fixed ' + lvd.deadline.label + ' (' + fmtQuoted(lvd.deadline.day, lvd.deadline.bareMonth) + ') ';
    const shown = approx(pc(lvd.p)), post = ' — one lane, a planning estimate.' + notCountedTail(lvd.excludedSingle) + staleTailOf(lvd.stale);
    parts.push({text: pre + shown + post, fig: uniqueFig(pre, shown, post, pc(lvd.p))});
  }
  if(upcoming){
    const sameMonth = fmtDay(upcoming.p50, {month: true}) === fmtDay(upcoming.p90, {month: true});
    const g = {month: !sameMonth};
    // a date that was only ever a bare month is "mid-Nov 2026", never an invented day
    const q = end => upcoming.month?.[end] ? fmtQuoted(upcoming[end], true) : fmtDay(upcoming[end], g);
    parts.push({text: 'Next up: ' + upcoming.label + ' — ' + (upcoming.status === 'fixed'
      ? 'fixed ' + q('p50')                             // no distribution: "P50" would be a lie
      : 'P50 ' + q('p50') +
        (upcoming.single ? '' : ', could slip to ' + q('p90'))) + '.',
      fig: q('p50')});
  }
  if(widest && (widest.p90 - widest.p50) >= 7)
    parts.push({text: 'Widest whisker: ' + widest.label + ' — ' + duration(widest.p90 - widest.p50) +
      ' between P50 and P90.', fig: duration(widest.p90 - widest.p50)});
  return parts;
}
function restBits(model, today){
  return restParts(model, today).map(p => p.text).join('  ');
}

/* A probability model never prints a bare 0% or 100%. Both bounds are REACHABLE
   here, not theoretical: normCdf uses A&S 7.1.26, whose correction term underflows
   below double epsilon around 8.5σ — for a lane with σ ≈ 23 days that is a deadline
   about seven months clear of the plan. So saturate unconditionally; a `p < 1`
   style guard is false exactly when it is needed. */
const pc = p => {
  const r = Math.round(p * 100);
  if(r >= 100) return '>99%';
  if(r <= 0) return '<1%';
  return r + '%';
};
const approx = s => /^[<>]/.test(s) ? s : '\u2248 ' + s;     // never "≈ <1%"
/* the merge-bias verdict copy — full (plain-text readout, wraps) + short (in-chart). */
function mergeCopy(mb){
  const pAll = pc(mb.pAll);
  const tail = notCountedTail(mb.excludedSingle);
  // a fitted lane already past its P90 poisons pAll toward optimism — name it in the
  // prose forms (in the chart the stale whisker sits visibly left of the TODAY rule).
  const staleTail = staleTailOf(mb.stale);

  /* measured against an EXTERNAL fixed date. The internal form's "even the last is
     a coin flip" reasoning is gone here (it held only because byDate was a lane's
     own P50), so this is new copy, not a date substitution. */
  if(mb.deadline){
    const d = mb.deadline, gap = mb.d80 - mb.byDate;
    /* "≈ 80% … but 80% needs three more weeks" invites the argument this tool
       exists to end. Say which side of 80% we are on when rounding hides it. */
    const near80 = Math.round(mb.pAll * 100) === 80;
    const pStr = near80 && gap > 0 ? 'just under 80%'
      : near80 && gap < 0 ? 'just over 80%' : approx(pAll);
    const conf = gap > 0 ? '80% joint confidence needs ' + fmtDay(mb.d80) + ', ' + duration(gap) + ' past it'
      : gap < 0 ? '80% joint confidence lands ' + fmtDay(mb.d80) + ', ' + duration(gap) + ' inside it'
      : '80% joint confidence lands on the deadline day';
    // disclose the editorial choice: [fixed] certifies the DATE, not that it binds
    const multi = d.count > 1 ? ' \u00b7 measured against the latest of ' + d.count + ' fixed dates' : '';
    const full = 'Fixed date: ' + d.label + ', ' + fmtQuoted(d.day, d.bareMonth) + '. All ' + mb.rangedLanes +
      ' ranged lanes clear it together ' + pStr + ' — ' + conf +
      '. A planning estimate: correlated lanes beat it, fat late tails undercut it.' +
      tail + staleTail + multi;
    /* short is the in-chart form. It used to clip the label at 30 chars because the
       row was ONE non-wrapping <text>; the Swiss 6b verdict block wraps, so the whole
       label survives \u2014 "Ofgem determination on capacit\u2026" at 24px was the worse bug. */
    const shortConf = gap > 0 ? '80% needs ' + fmtDay(mb.d80) + ' (' + duration(gap) + ' past it)'
      : gap < 0 ? '80% lands ' + fmtDay(mb.d80) + ' (' + duration(gap) + ' inside it)'
      : '80% lands on the deadline day';
    const pre = 'Fixed: ' + d.label + ' ' + fmtQuoted(d.day, d.bareMonth) + ' — ' + mb.rangedLanes + ' ranged lanes clear it ';
    const post = '; ' + shortConf + '.';
    return {full, short: pre + pStr + post, fig: uniqueFig(pre, pStr, post, pAll)};
  }

  /* the external commitment died with work still open — nothing else in the
     readout would say so (the ink diamond just sits left of the TODAY rule) */
  const passedTail = mb.passed
    ? ' \u00b7 fixed ' + mb.passed.label + ' passed ' + duration(mb.passed.agoDays) + ' ago' : '';
  const laterStr = duration(mb.d80 - mb.byDate);
  const full = 'Merge risk: ' + mb.rangedLanes + ' ranged lanes must all land by ' + fmtQuoted(mb.byDate, mb.byMonth) +
    ' — even the last is a coin flip, so together ' + pAll + '. For 80% joint confidence, promise ' +
    fmtDay(mb.d80) + ' (+' + laterStr + '). A planning estimate: correlated lanes beat it, fat late tails undercut it.' + tail + staleTail + passedTail;
  // short is the in-chart form: "all N ranged lanes" (the chart may show more, single-date
  // ones aren't in the joint); drop the ≈ when the value is already an inequality.
  const pre = 'Merge risk: all ' + mb.rangedLanes + ' ranged lanes by ' + fmtQuoted(mb.byDate, mb.byMonth) + ' ';
  const shown = approx(pAll), post = ' — 80% needs ' + fmtDay(mb.d80) + ' (+' + laterStr + ').';
  return {full, short: pre + shown + post, fig: uniqueFig(pre, shown, post, pAll)};
}

/* plain-text merge/operational readout — no app consumer since the poster
   retired; kept as the tests' pure probe of mergeCopy/restBits copy */
export function timelineReadout(model, today){
  today = effToday(model, today);
  const mb = mergeBias(model, today);
  return [mb ? mergeCopy(mb).full : null, restBits(model, today)].filter(Boolean).join('  ');
}

/* The Swiss 6b verdict contract: the ONE display line the artefact leads with,
   the single load-bearing figure inside it (verbatim, so markFigure can split on
   it), and the operational remainder as a muted supporting line. Merge risk leads
   when there is a merge to compute; otherwise the first operational bit does.
   Pure — both the wide board and the narrow relayout render from this. */
export function timelineVerdict(model, today){
  today = effToday(model, today);
  const mb = mergeBias(model, today);
  const parts = restParts(model, today);
  const rest = parts.map(p => p.text).join('  ');
  const clock = primaryDecisionLead(model, today);
  const clockReceipt = clock ? leadReceipt(clock.it, today).text : '';
  /* `verdict:` (2026-07-31). `rest` is the TOOL's supporting operational bits, so
     it goes wherever the tool's line goes: an authored verdict stands alone, and
     `off` takes the whole band with it. */
  const auth = a => {
    const r = resolveVerdict(model.verdict, a);
    /* An authored verdict can replace the forecast's editorial conclusion, but
       cannot quietly erase an operational clock. `off` remains an explicit
       request to suppress the whole band; a real authored line keeps the clock
       as its supporting receipt. */
    const hasClock = !!primaryDecisionLead(model, today);
    const resolved = model.verdict == null || (hasClock && !!r.line) ? {...r, rest: a.rest} : {...r, rest: ''};
    /* The renderer may place an authored conclusion above the tool's supporting
       line. Carry an active clock independently so an export can retain that
       decision fact without turning every operational aside into slide copy. */
    return {...resolved, clock: model.verdict != null && !!resolved.line ? clockReceipt : ''};
  };
  /* A decision clock is more immediately actionable than an aggregate fit. It
     leads when present; merge risk stays in the supporting line, not erased. */
  if(clock){
    const receipt = leadReceipt(clock.it, today);
    /* The automatic clock is already the lead line. An authored verdict takes
       that place, so keep the clock as a supporting operational receipt. */
    const clockParts = (model.verdict == null ? parts.slice(1) : parts).map(p => p.text);
    if(mb) clockParts.unshift(mergeCopy(mb).short);
    return auth({line: receipt.text, fig: fmtDay(clock.day), rest: clockParts.join('  ')});
  }
  if(mb){ const c = mergeCopy(mb); return auth({line: c.short, fig: c.fig, rest}); }
  if(!parts.length) return auth({line: '', fig: '', rest: ''});
  return auth({line: parts[0].text, fig: parts[0].fig, rest: parts.slice(1).map(p => p.text).join('  ')});
}

/* One composition across live, Copy PNG and native export. The existing verdict
   function remains the semantic source of truth; the Field supplies its form. */
export function render(model, ctx, diff = null, {edit = false, intent = null} = {}){
  const today = model.today ?? ctx.today;
  return renderField(model, ctx, diff, {edit, intent, verdict: timelineVerdict(model, today)});
}

/* a table cell: a "|" would split the row, a newline would end it */
const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function toMarkdown(model, diff, url, today){
  today = effToday(model, today);
  const lines = ['**' + (model.title || 'Milestone timeline') + '**', ''];
  /* the resolved verdict travels with the doc — timeline was the one verdict
     tool whose copy-for-doc carried no verdict at all, authored or computed */
  const v = timelineVerdict(model, today).line;
  if(v) lines.push('**' + v + '**', '');
  if(diff) lines.push(diff.sinceLine, '');
  lines.push('| Milestone | Lane | Started | P50 | P90 | Status / decision lead | Note |');
  lines.push('|---|---|---|---|---|---|---|');
  for(const it of model.items){
    const clock = decisionLead(it, today);
    lines.push('| ' + cell(it.label) + ' | ' + cell(it.lane || '—') + ' | ' + (it.started != null ? fmtDay(it.started) : '—') + ' | ' + fmtItemDay(it, 'p50') + ' | ' +
      (it.single ? (it.status === 'done' ? 'done' : it.status === 'fixed' ? 'fixed' : 'no range')
        : fmtItemDay(it, 'p90')) + ' | ' +
      ((it.status || '') + (clock ? ' · decide by ' + fmtDay(clock.day) + ' (' + leadDuration(clock.leadDays) + ' lead)' : '')) + ' | ' +
      cell(it.note) + ' |');
  }
  if(diff && diff.slips.length){
    lines.push('');
    for(const sl of diff.slips)
      lines.push('- ' + cell(sl.label) + ' ' + (sl.days > 0 ? 'slipped +' : 'pulled in −') + duration(sl.days));
  }
  lines.push('');
  const provenance = typeof url === 'string' && url
    ? '[live timeline](' + url + ')'
    : 'local Timeline source snapshot';
  lines.push('_P50–P90 milestone ranges · ' + provenance + '_');
  return lines.join('\n');
}
