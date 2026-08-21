/* Timeline's public render boundary. Field owns the visual composition; this
   module keeps only its semantic helpers and public output routes. */
import {fmtDay} from './parse.js';
import {mergeBias, laneVsDeadline} from './mergebias.js';
import {resolveVerdict} from '../assets/verdict.js';
import {decisionLead, leadDuration, leadReceipt, primaryDecisionLead} from './lrm.js';
import {renderField} from './render-field.js';

const wk = days => {
  const w = Math.round(Math.abs(days) / 7);
  return w + (w === 1 ? ' week' : ' weeks');
};

/* plain-text mirror of the SVG's "one quotable line" readout — the HTML text
   app.js shows next to the diagram. Pure; same inputs render() itself uses. */
/* the "Next up / Widest whisker" operational bits (the pre-merge readout).
   Each part carries its OWN load-bearing figure, so whichever part ends up
   leading the verdict can name it without the renderer re-deriving it. */
function restParts(model, today){
  const items = model.items;
  const upcoming = items.filter(i => i.status !== 'done' && i.p50 >= today).sort((a, b) => a.p50 - b.p50)[0];
  const ranged = items.filter(i => !i.single);
  const widest = ranged.length ? ranged.reduce((a, b) => (b.p90 - b.p50) > (a.p90 - a.p50) ? b : a) : null;
  const parts = [];
  const primary = primaryDecisionLead(model, today);
  if(primary){
    const receipt = leadReceipt(primary.it, today);
    parts.push({text: receipt.text, fig: fmtDay(primary.day)});
  }
  /* one ranged lane + a deadline: mergeBias stays silent (there is no MERGE), but
     the question is well posed and the answer is already computed. */
  const lvd = laneVsDeadline(model, today);
  if(lvd) parts.push({text: lvd.name + ' clears the fixed ' + lvd.deadline.label +
    ' (' + fmtDay(lvd.deadline.day) + ') ' + approx(pc(lvd.p)) + ' — one lane, a planning estimate.',
    fig: pc(lvd.p)});
  if(upcoming){
    const sameMonth = fmtDay(upcoming.p50, {month: true}) === fmtDay(upcoming.p90, {month: true});
    const g = {month: !sameMonth};
    parts.push({text: 'Next up: ' + upcoming.label + ' — ' + (upcoming.status === 'fixed'
      ? 'fixed ' + fmtDay(upcoming.p50, g)              // no distribution: "P50" would be a lie
      : 'P50 ' + fmtDay(upcoming.p50, g) +
        (upcoming.single ? '' : ', could slip to ' + fmtDay(upcoming.p90, g))) + '.',
      fig: fmtDay(upcoming.p50, g)});
  }
  if(widest && (widest.p90 - widest.p50) >= 7)
    parts.push({text: 'Widest whisker: ' + widest.label + ' — ' + wk(widest.p90 - widest.p50) +
      ' between P50 and P90.', fig: wk(widest.p90 - widest.p50)});
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
/* signed, and never "0 weeks" */
const span = d => {
  const a = Math.abs(d), r = Math.round(a);
  return a < 7 ? r + (r === 1 ? ' day' : ' days') : wk(a);
};

/* the merge-bias verdict copy — full (plain-text readout, wraps) + short (in-chart). */
function mergeCopy(mb){
  const pAll = pc(mb.pAll);
  const tail = mb.excludedSingle ? ' \u00b7 ' + mb.excludedSingle + ' single-date lane' + (mb.excludedSingle > 1 ? 's' : '') + ' not counted' : '';
  // a fitted lane already past its P90 poisons pAll toward optimism — name it in the
  // prose forms (in the chart the stale whisker sits visibly left of the TODAY rule).
  const staleTail = mb.stale ? ' \u00b7 ' + mb.stale + (mb.stale > 1
    ? ' lanes past their P90 — re-estimate them' : ' lane past its P90 — re-estimate it') : '';

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
    const conf = gap > 0 ? '80% joint confidence needs ' + fmtDay(mb.d80) + ', ' + span(gap) + ' past it'
      : gap < 0 ? '80% joint confidence lands ' + fmtDay(mb.d80) + ', ' + span(gap) + ' inside it'
      : '80% joint confidence lands on the deadline day';
    // disclose the editorial choice: [fixed] certifies the DATE, not that it binds
    const multi = d.count > 1 ? ' \u00b7 measured against the latest of ' + d.count + ' fixed dates' : '';
    const full = 'Fixed date: ' + d.label + ', ' + fmtDay(d.day) + '. All ' + mb.rangedLanes +
      ' ranged lanes clear it together ' + pStr + ' — ' + conf +
      '. A planning estimate: correlated lanes beat it, fat late tails undercut it.' +
      tail + staleTail + multi;
    /* short is the in-chart form. It used to clip the label at 30 chars because the
       row was ONE non-wrapping <text>; the Swiss 6b verdict block wraps, so the whole
       label survives \u2014 "Ofgem determination on capacit\u2026" at 24px was the worse bug. */
    const shortConf = gap > 0 ? '80% needs ' + fmtDay(mb.d80) + ' (' + span(gap) + ' past it)'
      : gap < 0 ? '80% lands ' + fmtDay(mb.d80) + ' (' + span(gap) + ' inside it)'
      : '80% lands on the deadline day';
    const short = 'Fixed: ' + d.label + ' ' + fmtDay(d.day) + ' — ' + mb.rangedLanes +
      ' ranged lanes clear it ' + pStr + '; ' + shortConf + '.';
    return {full, short};
  }

  /* the external commitment died with work still open — nothing else in the
     readout would say so (the ink diamond just sits left of the TODAY rule) */
  const passedTail = mb.passed
    ? ' \u00b7 fixed ' + mb.passed.label + ' passed ' + span(mb.passed.agoDays) + ' ago' : '';
  const laterStr = span(mb.d80 - mb.byDate);
  const full = 'Merge risk: ' + mb.rangedLanes + ' ranged lanes must all land by ' + fmtDay(mb.byDate) +
    ' — even the last is a coin flip, so together ' + pAll + '. For 80% joint confidence, promise ' +
    fmtDay(mb.d80) + ' (+' + laterStr + '). A planning estimate: correlated lanes beat it, fat late tails undercut it.' + tail + staleTail + passedTail;
  // short is the in-chart form: "all N ranged lanes" (the chart may show more, single-date
  // ones aren't in the joint); drop the ≈ when the value is already an inequality.
  const short = 'Merge risk: all ' + mb.rangedLanes + ' ranged lanes by ' + fmtDay(mb.byDate) + ' ' +
    approx(pAll) + ' — 80% needs ' + fmtDay(mb.d80) + ' (+' + laterStr + ').';
  return {full, short};
}

/* plain-text merge/operational readout — no app consumer since the poster
   retired; kept as the tests' pure probe of mergeCopy/restBits copy */
export function timelineReadout(model, today){
  const mb = mergeBias(model, today);
  return [mb ? mergeCopy(mb).full : null, restBits(model, today)].filter(Boolean).join('  ');
}

/* The Swiss 6b verdict contract: the ONE display line the artefact leads with,
   the single load-bearing figure inside it (verbatim, so markFigure can split on
   it), and the operational remainder as a muted supporting line. Merge risk leads
   when there is a merge to compute; otherwise the first operational bit does.
   Pure — both the wide board and the narrow relayout render from this. */
export function timelineVerdict(model, today){
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
  if(mb) return auth({line: mergeCopy(mb).short, fig: pc(mb.pAll), rest});
  if(!parts.length) return auth({line: '', fig: '', rest: ''});
  return auth({line: parts[0].text, fig: parts[0].fig, rest: parts.slice(1).map(p => p.text).join('  ')});
}

/* One composition across live, Copy PNG and native export. The existing verdict
   function remains the semantic source of truth; the Field supplies its form. */
export function render(model, ctx, diff = null, {edit = false, intent = null} = {}){
  const today = model.today ?? ctx.today;
  return renderField(model, ctx, diff, {edit, intent, verdict: timelineVerdict(model, today)});
}

export function toMarkdown(model, diff, url, today){
  const lines = ['**' + (model.title || 'Milestone timeline') + '**', ''];
  /* the resolved verdict travels with the doc — timeline was the one verdict
     tool whose copy-for-doc carried no verdict at all, authored or computed */
  const v = timelineVerdict(model, today).line;
  if(v) lines.push('**' + v + '**', '');
  if(diff) lines.push(diff.sinceLine, '');
  lines.push('| Milestone | Lane | P50 | P90 | Status / decision lead | Note |');
  lines.push('|---|---|---|---|---|---|');
  for(const it of model.items){
    const clock = decisionLead(it, today);
    lines.push('| ' + it.label + ' | ' + (it.lane || '—') + ' | ' + fmtDay(it.p50) + ' | ' +
      (it.single ? (it.status === 'done' ? 'done' : it.status === 'fixed' ? 'fixed' : 'no range')
        : fmtDay(it.p90)) + ' | ' +
      ((it.status || '') + (clock ? ' · decide by ' + fmtDay(clock.day) + ' (' + leadDuration(clock.leadDays) + ' lead)' : '')) + ' | ' +
      (it.note || '') + ' |');
  }
  if(diff && diff.slips.length){
    lines.push('');
    for(const sl of diff.slips)
      lines.push('- ' + sl.label + ' ' + (sl.days > 0 ? 'slipped +' : 'pulled in −') + wk(sl.days));
  }
  lines.push('');
  lines.push('_P50–P90 milestone ranges · [live timeline](' + url + ')_');
  return lines.join('\n');
}
