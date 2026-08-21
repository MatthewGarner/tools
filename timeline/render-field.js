/* The Timeline field is the one renderer for live, native and presentation
   output. Its physical intervals are the forecast: P50 is a point, P90 is a
   cap, and no range is dressed up as a committed delivery bar. */
import {PALETTES, scheme} from '../assets/series.js';
import {esc, txt, wrapText, btnAttrs} from '../assets/svg.js';
import {fmtDay, dayToISO} from './parse.js';
import {decisionLead, leadReceipt} from './lrm.js';

const DAY = 86400000;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const keyOf = it => it.identity || (it.lane + '|' + it.label).toLowerCase().replace(/\s+/g, ' ').trim();
const itemLabel = it => it.label + (it.single && it.status !== 'fixed' && it.status !== 'done' ? ' ±?' : '');
const stateLabel = (it, today) => it.status === 'fixed' && it.p50 < today ? 'OVERDUE'
  : it.status === 'risk' ? 'RISK' : it.status === 'fixed' ? 'FIXED' : it.status === 'done' ? 'DONE' : '';
const fieldState = (it, today) => it.status === 'fixed' && it.p50 < today ? 'overdue'
  : it.status || 'forecast';
const fieldTiming = it => it.status === 'fixed' ? 'fixed' : it.status === 'done' ? 'completed' : 'forecast';
const rangeText = it => it.single ? fmtDay(it.p50)
  : fmtDay(it.p50, {month: it.p90 - it.p50 > 45}) + ' — ' + fmtDay(it.p90, {month: it.p90 - it.p50 > 45});
const signedWeeks = days => (days > 0 ? '+' : '−') + Math.round(Math.abs(days) / 7) + ' wk' + (Math.round(Math.abs(days) / 7) === 1 ? '' : 's');

/* The shared wrapper deliberately breaks an unbroken authored token. A source
   label is data, not a CSS-overflow gamble: live/native fields grow for it and
   presentation can then make an honest fit/refusal decision. */
function fieldWrap(text, font, maxW, measure){
  /* Some deterministic export contexts intentionally use a simple character
     measure. Keep its wrapping honest at rendered type sizes too: the fallback
     is conservative for the system face, while a real canvas measurement wins. */
  const px = Number((String(font).match(/([\d.]+)px/) || [])[1]) || 0;
  const measured = line => Math.max(measure(line, font), String(line).length * px * .62);
  return wrapText(text, font, maxW, measured).flatMap(line => {
    if(measured(line) <= maxW) return [line];
    const parts = []; let part = '';
    for(const char of [...line]){
      const trial = part + char;
      if(part && measured(trial) > maxW){ parts.push(part); part = char; }
      else part = trial;
    }
    if(part) parts.push(part);
    return parts;
  });
}

function itemFieldAttrs(it, today){
  return ' data-field-item="' + esc(keyOf(it)) + '" data-field-timing="' + fieldTiming(it) +
    '" data-field-state="' + fieldState(it,today) + '" data-field-p50-day="' + dayToISO(it.p50) +
    '" data-field-p90-day="' + dayToISO(it.p90) + '"';
}
function rootFieldAttrs(model, intent, {narrow = false, copy = null, native = false} = {}){
  return ' data-field="timeline" data-direction="field" data-intent="' + intent +
    '" data-field-palette="' + esc(model.palette || 'ocean') + '"' +
    (model.accent ? ' data-field-accent="' + esc(model.accent) + '"' : '') +
    (narrow ? ' data-narrow=""' : '') + (copy ? ' data-copy-field="' + copy + '"' : '') +
    (native ? ' data-native=""' : '');
}

function fieldColors(model, ctx){
  const accent = model.accent || (PALETTES[model.palette] ? PALETTES[model.palette][ctx.dark ? 'dark' : 'light'] : null);
  return accent ? {...ctx.colors, ...scheme(accent, !!ctx.dark)} : ctx.colors;
}
function monthStart(day){
  const d = new Date(day * DAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY;
}
function nextMonth(day){
  const d = new Date(day * DAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY;
}
function fieldTicks(lo, hi){
  const quarterly = (hi - lo) / 30.44 > 24;
  const out = [];
  for(let day = monthStart(lo); day <= hi; day = quarterly ? nextMonth(nextMonth(nextMonth(day))) : nextMonth(day)){
    const d = new Date(day * DAY), m = d.getUTCMonth();
    if(quarterly && m % 3) continue;
    out.push({day, label: quarterly ? 'Q' + (Math.floor(m / 3) + 1) + ' ' + d.getUTCFullYear()
      : (m === 0 ? String(d.getUTCFullYear()) : d.toLocaleString('en', {month:'short'}).toUpperCase())});
  }
  return out;
}
function fieldScale(model, today, left, width, diff){
  const old = diff ? [...diff.byKey.values()].flatMap(g => [g.oldP50, g.oldP90]) : [];
  const leads = model.items.map(it => decisionLead(it)?.day).filter(Number.isFinite);
  const days = model.items.flatMap(it => [it.p50, it.p90]).concat(today, leads, old).filter(Number.isFinite);
  const min = days.length ? Math.min(...days) : today - 30, max = days.length ? Math.max(...days) : today + 90;
  const pad = Math.max(14, Math.round((max - min) * .06));
  const lo = min - pad, hi = max + pad;
  return {lo, hi, X: day => left + (day - lo) / Math.max(1, hi - lo) * width};
}
function colour(it, C, today){
  /* Colour is a factual exception, never an uncertainty decoration. */
  if(it.status === 'done') return C.status.done;
  if(it.status === 'fixed' && it.p50 < today) return C.err;
  return C.ink;
}
function editAttrs(it, kind){
  if(kind === 'label') return ' data-edit="label" data-line="' + it.srcLine + '" data-raw="' + esc(it.label) + '"' + btnAttrs('Edit label: ' + it.label);
  if(kind === 'dates') return ' data-edit="dates" data-line="' + it.srcLine + '" data-raw="' + esc(it.rawDates) + '"' + btnAttrs('Edit dates: ' + it.label);
  return ' data-edit="status" data-line="' + it.srcLine + '" data-raw="' + esc(it.status || '') + '"' + btnAttrs('Status: ' + it.label);
}
function dayMark(s, it, y, sc, C, today, edit, {diff, strong = false, next = false, utility = 11} = {}){
  const x50 = sc.X(it.p50), x90 = sc.X(it.p90), col = colour(it, C, today);
  const old = diff && diff.byKey.get(keyOf(it));
  if(old){
    const ox50 = sc.X(old.oldP50), ox90 = sc.X(old.oldP90);
    const history = kind => ' data-field-history="' + kind + '" data-field-history-inert="" pointer-events="none" aria-label="Historic ' + kind.toUpperCase() + '"';
    if(old.history?.includes('p90') && Math.abs(ox90 - ox50) > 1){
      s.push('<g' + history('p90') + '><line data-ms="ghost" x1="' + ox50.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + ox90.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + C.muted + '" stroke-width="2" stroke-dasharray="2 3" stroke-linecap="round" opacity=".40"/><line data-ms="ghost" x1="' + ox90.toFixed(1) + '" y1="' + (y - 4).toFixed(1) + '" x2="' + ox90.toFixed(1) + '" y2="' + (y + 4).toFixed(1) + '" stroke="' + C.muted + '" stroke-width="1" opacity=".55"/></g>');
    }
    if(old.history?.includes('p50')){
      s.push('<g' + history('p50') + '><circle data-ms="ghost" cx="' + ox50.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5" fill="' + C.bg + '" stroke="' + C.muted + '" stroke-width="1.25"/><line x1="' + ox50.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x50.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + C.muted + '" stroke-width="1" stroke-dasharray="2 3" opacity=".68"/></g>');
    }
    if(old.history?.includes('fixed')){
      s.push('<g' + history('fixed') + '><line data-ms="ghost" x1="' + ox50.toFixed(1) + '" y1="' + (y - 10).toFixed(1) + '" x2="' + ox50.toFixed(1) + '" y2="' + (y + 10).toFixed(1) + '" stroke="' + C.muted + '" stroke-width="1.5" stroke-dasharray="2 2"/></g>');
    }
  }
  if(!it.single && Math.abs(x90 - x50) > 1){
    s.push('<line data-ms="whisker" x1="' + x50.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x90.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + col + '" stroke-width="' + (strong ? 4 : 3) + '" stroke-linecap="round" opacity="' + (it.status === 'done' ? '.38' : '.72') + '"/>');
    s.push('<line data-ms="p90" x1="' + x90.toFixed(1) + '" y1="' + (y - 6).toFixed(1) + '" x2="' + x90.toFixed(1) + '" y2="' + (y + 6).toFixed(1) + '" stroke="' + col + '" stroke-width="1.5"/>');
  }
  const attrs = ' data-mskey="' + esc(keyOf(it)) + '"' + (next ? ' data-next=""' : '') + (edit ? editAttrs(it, 'status') : '');
  if(it.status === 'fixed')
    s.push('<line data-ms="p50"' + attrs + ' x1="' + x50.toFixed(1) + '" y1="' + (y - 10).toFixed(1) + '" x2="' + x50.toFixed(1) + '" y2="' + (y + 10).toFixed(1) + '" stroke="' + col + '" stroke-width="2"/>');
  else
    s.push('<circle data-ms="p50"' + attrs + ' cx="' + x50.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (strong ? '5.5' : '4.5') + '" fill="' + col + '" stroke="' + C.bg + '" stroke-width="1.5"/>');
  const lead = decisionLead(it, today);
  if(lead && lead.day >= sc.lo && lead.day <= sc.hi){
    const x = sc.X(lead.day), receipt = leadReceipt(it, today).text;
    s.push('<g data-lrm="" aria-label="' + esc(receipt) + '"><title>' + esc(receipt) + '</title><line x1="' + x.toFixed(1) + '" y1="' + (y - 12).toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + (y - 5).toFixed(1) + '" stroke="' + C.ink + '" stroke-width="1"/><rect data-ms="lrm" x="' + (x - 3.5).toFixed(1) + '" y="' + (y - 17).toFixed(1) + '" width="7" height="7" fill="' + C.bg + '" stroke="' + C.ink + '" stroke-width="1.25"/></g>');
  }
  if(old?.slipDays)
    s.push(txt(x50 - 8, y - 8, signedWeeks(old.slipDays), utility, C.muted, {anchor:'end',weight:700,tracking:.2}));
  return {x50, x90};
}
function textLines(s, x, y, lines, size, C, {weight, gap = 14, anchor, edit = ''} = {}){
  lines.forEach((line, i) => s.push('<text' + (i === 0 ? edit : '') + ' x="' + x.toFixed(1) + '" y="' + (y + i * gap).toFixed(1) + '" font-family="' + FONT + '" font-size="' + size + '"' + (weight ? ' font-weight="' + weight + '"' : '') + (anchor ? ' text-anchor="' + anchor + '"' : '') + ' fill="' + C + '">' + esc(line) + '</text>'));
}
function footer(s, {W, x, y, C, model, today, diff, verdict, measure, edit, addUnlaned}){
  const max = W - x * 2;
  s.push('<line x1="' + x + '" y1="' + (y - 12) + '" x2="' + (W - x) + '" y2="' + (y - 12) + '" stroke="' + C.border + '"/>');
  let dy = y;
  if(verdict?.line){
    s.push(txt(x, dy, 'VERDICT', 11, C.muted, {weight:700,tracking:1.15})); dy += 20;
    const lines = fieldWrap(verdict.line, '650 16px ' + FONT, max, measure);
    textLines(s, x, dy, lines, 16, C.ink, {weight:650,gap:20,edit:edit ? ' data-edit="verdict" data-raw="' + esc(model.verdict ?? '') + '"' + btnAttrs('Edit verdict') : ''});
    dy += Math.max(0, lines.length - 1) * 20 + 19;
    if(verdict.rest){
      const rest = fieldWrap(verdict.rest, '11px ' + FONT, max, measure);
      textLines(s, x, dy, rest, 11, C.muted, {gap:14});
      dy += rest.length * 14 + 2;
    }
  }
  if(diff?.dropped?.length){
    const dropped = fieldWrap('DROPPED SINCE ' + diff.since.toUpperCase() + ' · ' + diff.dropped.join(' · '), '650 11px ' + FONT, max, measure);
    textLines(s, x, dy + 10, dropped, 11, C.muted, {weight:650,tracking:.3,gap:14});
    dy += dropped.length * 14 + 10;
  }
  if(edit) s.push('<g data-add-control="" data-edit="additem" data-line="-1" data-raw="" data-lane="' + esc(addUnlaned || '') + '"' + btnAttrs(addUnlaned ? 'Add milestone into ' + addUnlaned : 'Add unlaned milestone') + '>' + txt(W - x, dy + 8, addUnlaned ? 'ADD TO ' + addUnlaned.toUpperCase() : 'ADD MILESTONE', 11, C.muted, {anchor:'end',weight:700,tracking:.8}) + '<rect data-hit="" x="' + (W - x - 150) + '" y="' + (dy - 20) + '" width="150" height="44" fill="' + C.bg + '" fill-opacity="0"/></g>');
  return dy + 28;
}
function footerHeight({width, verdict, diff, measure}){
  let h = 40;
  if(verdict?.line){
    h += 20 + fieldWrap(verdict.line, '650 16px ' + FONT, width, measure).length * 20;
    if(verdict.rest) h += fieldWrap(verdict.rest, '11px ' + FONT, width, measure).length * 14 + 2;
  }
  if(diff?.dropped?.length){
    const dropped = 'DROPPED SINCE ' + diff.since.toUpperCase() + ' · ' + diff.dropped.join(' · ');
    h += fieldWrap(dropped, '650 11px ' + FONT, width, measure).length * 14 + 10;
  }
  return h;
}
function presentationReceipt({verdict, diff, width, measure}){
  const blocks = [];
  if(verdict?.line) blocks.push({
    label:'VERDICT',
    lines:fieldWrap(verdict.line, '650 22px ' + FONT, width, measure),
  });
  /* An authored conclusion is editorial, not permission to suppress an active
     decision clock. Keep that one actionable fact explicit without inflating a
     five-second presentation with every supporting live-field observation. */
  if(verdict?.clock && verdict.clock !== verdict.line) blocks.push({
    label:'DECISION CLOCK',
    lines:fieldWrap(verdict.clock, '400 22px ' + FONT, width, measure),
    muted:true,
  });
  if(diff?.dropped?.length) blocks.push({
    label:'DROPPED SINCE ' + diff.since.toUpperCase(),
    lines:fieldWrap(diff.dropped.join(' · '), '650 22px ' + FONT, width, measure),
  });
  return {blocks, height:blocks.reduce((sum, block) => sum + 54 + block.lines.length * 26, 0)};
}
function drawPresentationReceipt(s, receipt, {x, y, C}){
  if(!receipt.blocks.length) return;
  s.push('<line x1="' + x + '" y1="' + (y - 12) + '" x2="' + (1920-x) + '" y2="' + (y - 12) + '" stroke="' + C.border + '"/>');
  let dy = y;
  for(const block of receipt.blocks){
    s.push(txt(x, dy + 14, block.label, 22, C.muted, {weight:700,tracking:1.1}));
    dy += 46;
    textLines(s, x, dy, block.lines, 22, block.muted ? C.muted : C.ink, {weight:block.muted ? 500 : 650,gap:26});
    dy += block.lines.length * 26 + 6;
  }
}
function copyUnavailable(model, C, measure){
  const W = 1920, H = 1080, side = 64;
  const sourceTitle = model.title || 'Milestone timeline';
  const measuredTitle = fieldWrap(sourceTitle, '700 42px ' + FONT, W-side*2, measure);
  /* A refusal frame still carries every source title that physically fits.
     Beyond this measured header allowance, name the title-specific refusal
     rather than quietly substituting a generic identifier; native SVG is the
     exhaustive route for that source fact. */
  const sourceTitleTooLong = measuredTitle.length > 12;
  const titleLines = sourceTitleTooLong ? ['SOURCE TITLE EXCEEDS ONE-FRAME FIELD'] : measuredTitle;
  const titleY = 130, titleGap = 46, ruleY = Math.max(250, titleY + (titleLines.length - 1) * titleGap + 56);
  return '<svg xmlns="http://www.w3.org/2000/svg"' + rootFieldAttrs(model, 'presentation', {copy:'unavailable'}) +
    (sourceTitleTooLong ? ' data-copy-unavailable-reason="source-title"' : '') +
    ' data-font-floor="22" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>' +
    txt(side, 64, 'TIMELINE / FORECAST FIELD', 22, C.muted, {weight:700,tracking:1.4}) +
    titleLines.map((line, i) => txt(side, titleY + i * titleGap, line, 42, C.ink, {weight:700})).join('') +
    '<line x1="' + side + '" y1="' + ruleY + '" x2="' + (W-side) + '" y2="' + ruleY + '" stroke="' + C.border + '"/>' +
    txt(side, ruleY + 72, 'COPY PNG UNAVAILABLE — DOWNLOAD SVG', 26, C.ink, {weight:700,tracking:.5}) +
    txt(side, ruleY + 116, sourceTitleTooLong
      ? 'DOWNLOAD SVG TO RETAIN THE FULL AUTHOR TITLE AND EVERY TIMING FACT.'
      : 'This complete Field needs more than one 16:9 frame. SVG retains every milestone, note and timing fact.', 22, C.muted, {weight:500}) +
    txt(side, 980, sourceTitleTooLong
      ? 'SOURCE TITLE TOO LONG · NO PARTIAL PRESENTATION CREATED'
      : model.items.length + ' MILESTONES · NO PARTIAL PRESENTATION CREATED', 22, C.muted, {weight:650,tracking:.3}) +
    '</svg>';
}
function wideRows(model, columns, rowMetric, laneH, groupGap = 8){
  const groups = model.lanes.map(lane => ({lane, items:model.items.filter(it => it.lane === lane)}));
  const cols = Array.from({length:columns}, () => []), heights = Array(columns).fill(0);
  for(const group of groups){
    const target = heights.indexOf(Math.min(...heights));
    cols[target].push(group);
    heights[target] += group.items.reduce((sum, it) => sum + rowMetric(it).height, 0) + (group.lane ? laneH : 0) + groupGap;
  }
  return cols;
}
function renderWide(model, ctx, diff, {edit, intent, verdict}){
  const presentation = intent === 'presentation', native = intent === 'native';
  const C = fieldColors(model, ctx), today = model.today ?? ctx.today;
  const utility = presentation ? 22 : 11, laneH = presentation ? 20 : 22;
  const W = presentation ? 1920 : 1442, side = presentation ? 64 : 34;
  const maxColumns = 1;
  const columnGap = presentation ? 38 : 0;
  const railFor = columns => presentation ? 500 : 326;
  const rowMetricFor = columns => {
    const rail = railFor(columns), titleSize = presentation ? 22 : 12.5;
    const labelInset = presentation ? 22 : 14;
    /* State words occupy a measured, permanent end-cap in the label rail.
       A title may become tall, but it may never run under RISK / OVERDUE. */
    const stateReserve = presentation ? 152 : 82;
    return it => {
      const lines = fieldWrap(itemLabel(it), '650 ' + titleSize + 'px ' + FONT, rail - labelInset - stateReserve, ctx.measure);
      const noteSize = presentation ? utility : 11;
      const noteLines = it.note ? fieldWrap('NOTE · ' + it.note, '400 ' + noteSize + 'px ' + FONT, rail - labelInset, ctx.measure) : [];
      const base = presentation ? 46 + (lines.length - 1) * 22 : 48 + (lines.length - 1) * 14;
      return {lines, noteLines, height: base + (noteLines.length ? (presentation ? 6 : 5) + noteLines.length * (presentation ? 22 : 14) : 0)};
    };
  };
  const title = model.title || 'Milestone timeline';
  const titleSize = presentation ? 38 : 22, titleGap = presentation ? 42 : 26;
  const titleLines = fieldWrap(title, '700 ' + titleSize + 'px ' + FONT, W-side*2, ctx.measure);
  const titleY = presentation ? 94 : 65;
  const detailY = (presentation ? 132 : 85) + (titleLines.length - 1) * titleGap;
  const top = detailY + (presentation ? 72 : 45);
  const receipt = presentation ? presentationReceipt({verdict,diff,width:W-side*2,measure:ctx.measure}) : null;
  /* One slide is a single common chronology. When its honest rows and receipt do
     not fit, Copy PNG refuses rather than partitioning time or losing a fact. */
  const capacity = presentation ? 950 - top - 24 - receipt.height : Infinity;
  const groupGap = presentation ? 2 : 8;
  let columns = 1, rowMetric = rowMetricFor(columns), rows = wideRows(model, columns, rowMetric, laneH, groupGap);
  while(columns < maxColumns && Math.max(...rows.map(groups => groups.reduce((sum, group) => sum + group.items.reduce((n, it) => n + rowMetric(it).height, 0) + (group.lane ? laneH : 0) + groupGap, 0))) > capacity){
    columns += 1;
    rowMetric = rowMetricFor(columns);
    rows = wideRows(model, columns, rowMetric, laneH, groupGap);
  }
  const gap = columnGap;
  const colW = (W - side * 2 - gap * (columns - 1)) / columns;
  const rail = railFor(columns);
  const bottomReserve = presentation ? 150 : 88;
  const bodyH = Math.max(420, ...rows.map(groups => groups.reduce((sum, group) => sum + group.items.reduce((n, it) => n + rowMetric(it).height, 0) + (group.lane ? laneH : 0) + groupGap, 0)));
  if(presentation && bodyH > capacity) return copyUnavailable(model, C, ctx.measure);
  const H = presentation ? 1080 : Math.round(top + bodyH + footerHeight({width:W-side*2,verdict,diff,measure:ctx.measure}) + 32);
  const s = ['<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>'];
  s.push(txt(side, presentation ? 44 : 30, presentation ? 'TIMELINE / FORECAST FIELD' : 'FORECAST FIELD', utility, C.muted, {weight:700,tracking:presentation ? 1.4 : 1.1}));
  textLines(s, side, titleY, titleLines, titleSize, C.ink, {weight:700,gap:titleGap});
  const detail = diff ? 'SINCE ' + diff.since.toUpperCase() + ' · ' + (diff.slips.length ? diff.slips.length + ' SLIPPED · ' : '') + (diff.newKeys.size ? diff.newKeys.size + ' NEW · ' : '') + (diff.dropped.length ? diff.dropped.length + ' DROPPED' : 'NO DROPS') : 'P50–P90 RANGES · COMMON CHRONOLOGY · NOT DELIVERY PROMISES';
  s.push(txt(side, detailY, detail, utility, C.muted, {weight:650,tracking:.32}));
  s.push(txt(W - side, presentation ? 44 : 30, fmtDay(today), utility, C.muted, {anchor:'end',weight:650}));
  const next = model.items.filter(it => it.status !== 'done' && it.p50 >= today).sort((a,b) => a.p50 - b.p50)[0] || model.items[0];
  rows.forEach((groups, colIndex) => {
    const x = side + colIndex * (colW + gap), plotX = x + rail, plotW = colW - rail;
    const sc = fieldScale(model, today, plotX, plotW, diff), ticks = fieldTicks(sc.lo, sc.hi);
    let y = top;
    for(const tick of ticks){
      const tx = sc.X(tick.day);
      s.push('<line x1="' + tx.toFixed(1) + '" y1="' + (top - 12) + '" x2="' + tx.toFixed(1) + '" y2="' + Math.min(H-bottomReserve, top+bodyH) + '" stroke="' + C.border + '" stroke-width="1" opacity=".62"/>');
      s.push(txt(tx, top - 20, tick.label, utility, C.muted, {anchor:'middle',weight:700,tracking:.35}));
    }
    const todayX = sc.X(today);
    s.push('<line data-today="" x1="' + todayX.toFixed(1) + '" y1="' + (top - 10) + '" x2="' + todayX.toFixed(1) + '" y2="' + Math.min(H-bottomReserve, top+bodyH) + '" stroke="' + C.ink + '" stroke-width="1"/>');
    s.push(txt(todayX + 4, top - 2, 'TODAY', utility, C.ink, {weight:700,tracking:.45}));
    for(const group of groups){
      if(group.lane){
        s.push('<line x1="' + x + '" y1="' + (y - 9) + '" x2="' + (x + colW) + '" y2="' + (y - 9) + '" stroke="' + C.border + '"/>');
        if(edit) s.push('<g data-add-control="" data-edit="additem" data-line="-1" data-raw="" data-lane="' + esc(group.lane) + '"' + btnAttrs('Add milestone into ' + group.lane) + '><rect data-hit="" x="' + x + '" y="' + (y - 25) + '" width="' + colW + '" height="44" fill="' + C.bg + '" fill-opacity="0"/></g>');
        s.push(txt(x, y + (presentation ? 16 : 3), group.lane.toUpperCase(), utility, C.muted, {weight:700,tracking:1.0}));
        y += laneH;
      }
      for(const it of group.items){
        const metric = rowMetric(it), rowH = metric.height, cy = y + rowH / 2, st = stateLabel(it, today), col = colour(it,C,today);
        if(y > top) s.push('<line x1="' + x + '" y1="' + y.toFixed(1) + '" x2="' + (x + colW) + '" y2="' + y.toFixed(1) + '" stroke="' + C.border + '" opacity=".72"/>');
        s.push('<g' + itemFieldAttrs(it,today) + '>');
        if(edit){
          s.push('<g data-edit="cardmenu" data-line="' + it.srcLine + '" data-menu=""' + btnAttrs('Milestone: ' + it.label) + '><rect data-hit="" x="' + x + '" y="' + y.toFixed(1) + '" width="' + colW + '" height="' + rowH + '" fill="' + C.bg + '" fill-opacity="0"/><rect data-edit="setlane" data-line="' + it.srcLine + '" data-raw="' + esc(it.lane) + '" pointer-events="none" x="' + x + '" y="' + (y + 3) + '" width="1" height="1" fill-opacity="0"/><rect data-edit="note" data-line="' + it.srcLine + '" data-raw="' + esc(it.note || '') + '" pointer-events="none" x="' + x + '" y="' + (y + 3) + '" width="1" height="1" fill-opacity="0"/>');
        }
        const titleLines = metric.lines;
        const titleY = y + (presentation ? 19 : 16), titleGap = presentation ? 22 : 14;
        const labelInset = presentation ? 22 : 14;
        textLines(s, x + labelInset, titleY, titleLines, presentation ? 22 : 12.5, C.ink, {weight:650,gap:titleGap,edit:edit ? editAttrs(it,'label') : ''});
        const subY = presentation ? y + 41 + (titleLines.length - 1) * 22 : y + Math.min(rowH - 8, 31 + (titleLines.length - 1) * 14);
        textLines(s, x + labelInset, subY, [rangeText(it)], presentation ? utility : 11.5, C.muted, {edit:edit ? editAttrs(it,'dates') : ''});
        if(metric.noteLines.length){
          const noteY = subY + (presentation ? 23 : 14);
          s.push('<g data-field-note="" aria-label="Note: ' + esc(it.note) + '">');
          textLines(s, x + labelInset, noteY, metric.noteLines, presentation ? utility : 11, C.muted, {gap:presentation ? 22 : 14});
          s.push('</g>');
        }
        const endCapX = plotX - (presentation ? 14 : 10);
        if(st) s.push(txt(endCapX, y + (presentation ? 24 : 13), st, utility, col, {anchor:'end',weight:700,tracking:.65}));
        /* New is a comparison fact, not a loose label in the date rail. Its
           reserved end-cap keeps wrapping and an item's timing readout apart. */
        if(diff?.newKeys?.has(keyOf(it))) s.push(txt(endCapX, y + (presentation ? 48 : 31), 'NEW', utility, C.ink, {anchor:'end',weight:700,tracking:.7}));
        dayMark(s,it,cy,sc,C,today,edit,{diff,strong:presentation,next:it===next,utility});
        if(edit){ s.push('<text data-empty-control="" data-edit="removeitem" data-line="' + it.srcLine + '" data-raw=""' + btnAttrs('Remove ' + it.label) + ' x="' + (x + rail - 4) + '" y="' + (y + rowH - 7) + '" text-anchor="end" font-size="11" fill="' + C.muted + '">×</text></g>'); }
        s.push('</g>');
        y += rowH;
      }
      y += groupGap;
    }
  });
  if(presentation){
    drawPresentationReceipt(s, receipt, {x:side,y:top + bodyH + 24,C});
    s.push('<line x1="' + side + '" y1="950" x2="' + (W-side) + '" y2="950" stroke="' + C.border + '"/>');
    const leadCount = model.items.filter(it => decisionLead(it,today)).length;
    s.push(txt(side, 980, leadCount ? leadCount + ' DECISION LEAD' + (leadCount === 1 ? '' : 'S') + ' MARKED ABOVE THEIR FORECASTS' : 'RANGES ARE FORECAST INTERVALS; FIXED EVENTS ARE FACTS.', utility, C.muted, {weight:650,tracking:.25}));
    s.push(txt(W-side, 980, model.items.length + ' MILESTONES · COMPLETE SET', utility, C.ink, {anchor:'end',weight:700,tracking:.35}));
  }else{
    const footY = top + bodyH + 26;
    footer(s,{W,x:side,y:footY,C,model,today,diff,verdict,measure:ctx.measure,edit,addUnlaned:''});
  }
  return '<svg xmlns="http://www.w3.org/2000/svg"' + rootFieldAttrs(model, intent, {copy:presentation ? 'complete' : null, native}) + ' data-font-floor="' + (presentation ? '22' : '11') + '" data-min-readable-scale="1" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' + s.join('') + '</svg>';
}
function renderNarrow(model, ctx, diff, {edit, verdict}){
  const C = fieldColors(model,ctx), W = ctx.width || 390, PAD = 16, today = model.today ?? ctx.today;
  const title = model.title || 'Milestone timeline';
  const titleLines = fieldWrap(title, '700 17px ' + FONT, W-PAD*2, ctx.measure);
  const titleY = 48, titleGap = 20;
  const detailY = 66 + (titleLines.length - 1) * titleGap;
  const sc = fieldScale(model,today,PAD,W-PAD*2,diff), tickY = diff ? detailY + 26 : titleY + 26 + (titleLines.length - 1) * titleGap;
  const rows = [];
  let y = tickY + 28;
  for(const lane of model.lanes){
    const items = model.items.filter(it => it.lane === lane);
    if(lane){ rows.push({lane, top:y}); y += 25; }
    for(const it of items){
      const titleLines = fieldWrap(itemLabel(it), '650 13px ' + FONT, W - PAD * 2 - 62, ctx.measure);
      const dateOffset = 33 + (titleLines.length - 1) * 14;
      const noteLines = it.note ? fieldWrap('NOTE · ' + it.note, '400 11px ' + FONT, W - PAD * 2, ctx.measure) : [];
      const noteOffset = dateOffset + 14;
      const trackOffset = noteLines.length ? noteOffset + noteLines.length * 14 + 8 : dateOffset + 12;
      const height = trackOffset + 51;
      rows.push({it, top:y, titleLines, noteLines, dateOffset, noteOffset, trackOffset, height}); y += height;
    }
    y += 8;
  }
  const footerStart = y + 4, H = footerStart + footerHeight({width:W-PAD*2,verdict,diff,measure:ctx.measure}) + 24;
  const s = ['<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>'];
  s.push(txt(PAD,22,'CALIBRATED FIELD',11,C.muted,{weight:700,tracking:1.2}));
  textLines(s,PAD,titleY,titleLines,17,C.ink,{weight:700,gap:titleGap});
  if(diff){
    const bits = [diff.slips.length ? diff.slips.length + ' SLIPPED' : '', diff.newKeys.size ? diff.newKeys.size + ' NEW' : '', diff.dropped.length ? diff.dropped.length + ' DROPPED' : ''].filter(Boolean);
    s.push(txt(PAD,detailY,'SINCE ' + diff.since.toUpperCase() + ' · ' + (bits.join(' · ') || 'NO CHANGE'),11,C.muted,{weight:650,tracking:.2}));
  }
  /* Tick lines preserve true date positions. Labels are merely annotations, so
     a later label wins an edge collision instead of producing JULAUG. */
  const labels = fieldTicks(sc.lo,sc.hi).map(tick => {
    const w = ctx.measure(tick.label,'700 11px ' + FONT), x = Math.max(PAD+w/2,Math.min(W-PAD-w/2,sc.X(tick.day)));
    return {...tick,w,x};
  });
  const visible = [], GAP = 5; let nextLeft = Infinity;
  for(let i=labels.length-1;i>=0;i--){ const t=labels[i], right=t.x+t.w/2; if(right+GAP<=nextLeft){ visible.push(t); nextLeft=t.x-t.w/2; } }
  for(const tick of visible.reverse()) s.push(txt(tick.x,tickY,tick.label,11,C.muted,{anchor:'middle',weight:700,tracking:.45}));
  const todayX=sc.X(today); s.push(txt(todayX,tickY+13,'TODAY',11,C.ink,{anchor:'middle',weight:700,tracking:.45}));
  const next = model.items.filter(it => it.status !== 'done' && it.p50 >= today).sort((a,b)=>a.p50-b.p50)[0] || model.items[0];
  for(const row of rows){
    if(row.lane){
      s.push('<line x1="' + PAD + '" y1="' + (row.top-5) + '" x2="' + (W-PAD) + '" y2="' + (row.top-5) + '" stroke="' + C.border + '"/>');
      if(edit) s.push('<g data-add-control="" data-edit="additem" data-line="-1" data-raw="" data-lane="' + esc(row.lane) + '"' + btnAttrs('Add milestone into '+row.lane) + '><rect data-hit="" x="' + PAD + '" y="' + (row.top-12) + '" width="' + (W-PAD*2) + '" height="44" fill="' + C.bg + '" fill-opacity="0"/></g>');
      s.push(txt(PAD,row.top+10,row.lane.toUpperCase(),11,C.muted,{weight:700,tracking:1})); continue;
    }
    const {it,top,titleLines,noteLines,dateOffset,noteOffset,trackOffset,height}=row, st=stateLabel(it,today), col=colour(it,C,today), trackTop=top+trackOffset, cy=trackTop+14;
    s.push('<g' + itemFieldAttrs(it,today) + '>');
    if(edit) s.push('<g data-edit="cardmenu" data-line="' + it.srcLine + '" data-menu=""' + btnAttrs('Milestone: ' + it.label) + '><rect data-hit="" x="4" y="' + top + '" width="' + (W-8) + '" height="' + height + '" fill="' + C.bg + '" fill-opacity="0"/><rect data-edit="setlane" data-line="' + it.srcLine + '" data-raw="' + esc(it.lane) + '" pointer-events="none" x="' + PAD + '" y="' + (top+4) + '" width="1" height="1" fill-opacity="0"/><rect data-edit="note" data-line="' + it.srcLine + '" data-raw="' + esc(it.note || '') + '" pointer-events="none" x="' + PAD + '" y="' + (top+23) + '" width="1" height="1" fill-opacity="0"/><rect data-edit="removeitem" data-line="' + it.srcLine + '" data-raw="" pointer-events="none" x="' + PAD + '" y="' + (top+42) + '" width="1" height="1" fill-opacity="0"/>');
    textLines(s,PAD,top+16,titleLines,13,C.ink,{weight:650,gap:14,edit:edit?editAttrs(it,'label'):''});
    textLines(s,PAD,top+dateOffset,[rangeText(it)],11,C.muted,{edit:edit?editAttrs(it,'dates'):''});
    if(noteLines.length){
      s.push('<g data-field-note="" aria-label="Note: ' + esc(it.note) + '">');
      textLines(s,PAD,top+noteOffset,noteLines,11,C.muted,{gap:14});
      s.push('</g>');
    }
    if(st)s.push(txt(W-PAD,top+16,st,11,col,{anchor:'end',weight:700,tracking:.8}));
    if(diff?.newKeys?.has(keyOf(it)))s.push(txt(W-PAD,top+dateOffset,'NEW',11,C.ink,{anchor:'end',weight:700,tracking:.8}));
    s.push('<line x1="' + PAD + '" y1="' + cy + '" x2="' + (W-PAD) + '" y2="' + cy + '" stroke="' + C.border + '"/>');
    for(const tick of fieldTicks(sc.lo,sc.hi)){ const x=sc.X(tick.day); s.push('<line x1="' + x.toFixed(1) + '" y1="' + trackTop + '" x2="' + x.toFixed(1) + '" y2="' + (trackTop+28) + '" stroke="' + C.border + '" opacity=".65"/>'); }
    s.push('<line data-today="" x1="' + todayX.toFixed(1) + '" y1="' + trackTop + '" x2="' + todayX.toFixed(1) + '" y2="' + (trackTop+28) + '" stroke="' + C.ink + '" stroke-width="1"/>');
    dayMark(s,it,cy,sc,C,today,edit,{diff,strong:true,next:it===next});
    if(edit)s.push('</g>');
    s.push('</g>');
  }
  footer(s,{W,x:PAD,y:footerStart,C,model,today,diff,verdict,measure:ctx.measure,edit,addUnlaned:''});
  return '<svg xmlns="http://www.w3.org/2000/svg"' + rootFieldAttrs(model, 'live-narrow', {narrow:true}) + ' data-font-floor="11" data-min-readable-scale="1" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' + s.join('') + '</svg>';
}
function renderEmptyField(model, ctx, {edit, resolved}){
  const presentation = resolved === 'presentation', native = resolved === 'native', narrow = resolved === 'live-narrow';
  const C = fieldColors(model,ctx);
  const W = presentation ? 1920 : narrow ? (ctx.width || 390) : 1442;
  const side = presentation ? 64 : narrow ? 16 : 34;
  const utility = presentation ? 22 : 11;
  const titleSize = presentation ? 38 : narrow ? 17 : 22;
  const titleGap = presentation ? 42 : narrow ? 20 : 26;
  const rawTitle = model.title || 'Milestone timeline';
  const measuredTitle = fieldWrap(rawTitle, '700 ' + titleSize + 'px ' + FONT, W-side*2, ctx.measure);
  /* Empty does not mean source facts are optional. A sufficiently long heading
     takes the same explicit Copy-PNG refusal as a dense Field; native/live
     forms retain every wrapped line at their natural height. */
  if(presentation && measuredTitle.length > 16) return copyUnavailable(model,C,ctx.measure);
  const titleLines = measuredTitle;
  const titleY = presentation ? 94 : narrow ? 48 : 65;
  const factY = titleY + (titleLines.length - 1) * titleGap + (presentation ? 82 : narrow ? 38 : 48);
  const H = presentation ? 1080 : Math.max(narrow ? 170 : 210, factY + (edit ? 82 : 44));
  const s = ['<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>'];
  s.push(txt(side, presentation ? 44 : narrow ? 22 : 30, presentation ? 'TIMELINE / FORECAST FIELD' : narrow ? 'CALIBRATED FIELD' : 'FORECAST FIELD', utility, C.muted, {weight:700,tracking:presentation ? 1.4 : 1.1}));
  textLines(s, side, titleY, titleLines, titleSize, C.ink, {weight:700,gap:titleGap});
  s.push(txt(side, factY, 'NO MILESTONES YET', utility, C.muted, {weight:700,tracking:presentation ? 1.1 : .8}));
  s.push(txt(side, factY + (presentation ? 42 : 28), 'Add the first P50–P90 range to begin this forecast field.', presentation ? 26 : 16, C.ink, {weight:650}));
  if(edit){
    const addY = factY + (presentation ? 74 : 54);
    s.push('<g data-add-control="" data-edit="additem" data-line="-1" data-raw="" data-lane=""' + btnAttrs('Add unlaned milestone') + '>' +
      txt(side, addY, 'ADD MILESTONE', utility, C.muted, {weight:700,tracking:.8}) +
      '<rect data-hit="" x="' + side + '" y="' + (addY - 28) + '" width="160" height="44" fill="' + C.bg + '" fill-opacity="0"/></g>');
  }
  if(presentation){
    s.push('<line x1="' + side + '" y1="950" x2="' + (W-side) + '" y2="950" stroke="' + C.border + '"/>');
    s.push(txt(side,980,'NO TIMING FACTS YET — ADD A P50–P90 RANGE',utility,C.muted,{weight:650,tracking:.25}));
    s.push(txt(W-side,980,'0 MILESTONES · EMPTY FIELD',utility,C.ink,{anchor:'end',weight:700,tracking:.35}));
  }
  return '<svg xmlns="http://www.w3.org/2000/svg"' + rootFieldAttrs(model, resolved, {narrow, copy:presentation ? 'complete' : null, native}) +
    ' data-font-floor="' + (presentation ? '22' : '11') + '" data-min-readable-scale="1" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' + s.join('') + '</svg>';
}
export function renderField(model, ctx, diff = null, {edit = false, intent = null, verdict = null} = {}){
  const resolved = intent || ctx.intent || (ctx.width && ctx.width < 520 ? 'live-narrow' : 'live-wide');
  if(!model.items.length) return renderEmptyField(model,ctx,{edit,resolved});
  return resolved === 'live-narrow'
    ? renderNarrow(model,ctx,diff,{edit,verdict})
    : renderWide(model,ctx,diff,{edit,intent:resolved,verdict});
}
