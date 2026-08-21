/* Three renderer-grounded visual directions for Timeline's next system.
   They deliberately consume the real parsed model and emit the same edit-target
   contract as the shipped renderer. This lets the design review examine genuine
   P50/P90 ranges, fixed events, decision leads and touch-sized live targets —
   not a diagram that can quietly reinterpret the DSL. The chosen direction will
   move into render.js; the other two remain only while the review is active. */
import {PALETTES, scheme} from '../assets/series.js';
import {esc, txt} from '../assets/svg.js';
import {fmtDay} from './parse.js';
import {decisionLead, leadReceipt} from './lrm.js';

const DAY = 86400000;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const label = it => it.label + (it.single && it.status !== 'fixed' && it.status !== 'done' ? ' ±?' : '');
const statusText = (it, today) => it.status === 'fixed' && it.p50 < today ? 'OVERDUE' :
  it.status === 'risk' ? 'RISK' : it.status === 'fixed' ? 'FIXED' : it.status === 'done' ? 'DONE' : '';
const rangeText = it => it.single ? fmtDay(it.p50) : fmtDay(it.p50, {month: it.p90 - it.p50 > 45}) + ' — ' + fmtDay(it.p90, {month: it.p90 - it.p50 > 45});
const itemKey = it => (it.lane + '|' + it.label).toLowerCase().replace(/\s+/g, ' ').trim();

const monthStart = day => {
  const d = new Date(day * DAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY;
};
const addMonth = day => {
  const d = new Date(day * DAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY;
};
function axisTicks(lo, hi){
  const out = [];
  for(let day = monthStart(lo); day <= hi; day = addMonth(day)){
    const d = new Date(day * DAY), month = d.getUTCMonth();
    out.push({day, label: month === 0 ? String(d.getUTCFullYear()) : d.toLocaleString('en', {month: 'short'}).toUpperCase()});
  }
  return out;
}
function colors(model, ctx){
  const hex = model.accent || (PALETTES[model.palette] ? PALETTES[model.palette][ctx.dark ? 'dark' : 'light'] : null);
  return hex ? {...ctx.colors, ...scheme(hex, !!ctx.dark)} : ctx.colors;
}
function scale(model, today, plotX, plotW){
  const leads = model.items.map(it => decisionLead(it)?.day).filter(Number.isFinite);
  const values = model.items.flatMap(it => [it.p50, it.p90]).concat(today, leads);
  const min = Math.min(...values), max = Math.max(...values), pad = Math.max(14, Math.round((max - min) * .06));
  const lo = min - pad, hi = max + pad;
  return {lo, hi, X: day => plotX + (day - lo) / (hi - lo) * plotW};
}
function stateColor(it, C, today){
  /* Red is a dated exception, never a generic uncertainty flag. A `[risk]`
     keeps its explicit word label, but its forecast remains an honest neutral
     range. This prevents colour from turning a P90 interval into a failure. */
  if(it.status === 'fixed' && it.p50 < today) return C.err;
  if(it.status === 'done') return C.status.done;
  return C.ink;
}
function diamond(x, y, r, fill, stroke, extra = ''){
  return '<path' + extra + ' d="M' + x.toFixed(1) + ' ' + (y - r).toFixed(1) + ' L' + (x + r).toFixed(1) + ' ' + y.toFixed(1) + ' L' + x.toFixed(1) + ' ' + (y + r).toFixed(1) + ' L' + (x - r).toFixed(1) + ' ' + y.toFixed(1) + ' Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.25"/>';
}
function editAttrs(it, kind){
  if(kind === 'label') return ' data-edit="label" data-line="' + it.srcLine + '" data-raw="' + esc(it.label) + '" tabindex="0" role="button" aria-label="Edit label: ' + esc(it.label) + '"';
  if(kind === 'dates') return ' data-edit="dates" data-line="' + it.srcLine + '" data-raw="' + esc(it.rawDates) + '" tabindex="0" role="button" aria-label="Edit dates: ' + esc(it.label) + '"';
  return ' data-edit="status" data-line="' + it.srcLine + '" data-raw="' + esc(it.status || '') + '" tabindex="0" role="button" aria-label="Edit status: ' + esc(it.label) + '"';
}
function packed(model, X){
  const out = new Map();
  for(const lane of model.lanes){
    const ends = [];
    for(const it of model.items.filter(item => item.lane === lane).sort((a, b) => a.p50 - b.p50 || a.srcLine - b.srcLine)){
      const left = X(it.p50), right = X(it.p90);
      let track = ends.findIndex(end => left > end + 12);
      if(track < 0){ track = ends.length; ends.push(right); } else ends[track] = right;
      out.set(it, track);
    }
  }
  return out;
}
function header(s, {W, title, today, C, name, detail}){
  s.push(txt(36, 42, name.toUpperCase(), 10, C.muted, {weight: 700, tracking: 1.4}));
  s.push(txt(36, 81, title || 'Milestone timeline', 27, C.ink, {weight: 700}));
  s.push(txt(36, 105, detail, 11, C.muted, {weight: 600, tracking: .35}));
  s.push(txt(W - 36, 42, fmtDay(today), 11, C.muted, {anchor: 'end', weight: 600}));
}
function axis(s, sc, {left, right, top, bottom, C, today}){
  for(const tick of axisTicks(sc.lo, sc.hi)){
    const x = sc.X(tick.day);
    if(x < left || x > right) continue;
    s.push('<line x1="' + x.toFixed(1) + '" y1="' + top + '" x2="' + x.toFixed(1) + '" y2="' + bottom + '" stroke="' + C.border + '" stroke-width="1" opacity=".64"/>');
    s.push(txt(x, top - 10, tick.label, 9.5, C.muted, {anchor: 'middle', weight: 700, tracking: .7}));
  }
  const tx = sc.X(today);
  s.push('<line data-today="" x1="' + tx.toFixed(1) + '" y1="' + top + '" x2="' + tx.toFixed(1) + '" y2="' + bottom + '" stroke="' + C.ink + '" stroke-width="1"/>');
  s.push(txt(tx + 5, top + 12, 'TODAY', 8.5, C.ink, {weight: 700, tracking: .6}));
}
function rangeMark(s, it, y, sc, C, edit, opts = {}){
  const x50 = sc.X(it.p50), x90 = sc.X(it.p90), col = stateColor(it, C, sc.today);
  const opacity = it.status === 'done' ? .38 : .7;
  const ghost = opts.diff && opts.diff.byKey.get(itemKey(it));
  if(ghost){
    const gx50 = sc.X(ghost.oldP50), gx90 = sc.X(ghost.oldP90);
    if(gx90 - gx50 > 1){
      s.push('<line data-ms="ghost" x1="' + gx50.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + gx90.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + C.muted + '" stroke-width="2" stroke-dasharray="2 3" stroke-linecap="round" opacity=".42"/>');
      s.push('<line x1="' + gx90.toFixed(1) + '" y1="' + (y - 4).toFixed(1) + '" x2="' + gx90.toFixed(1) + '" y2="' + (y + 4).toFixed(1) + '" stroke="' + C.muted + '" stroke-width="1" opacity=".6"/>');
    }
    if(ghost.oldP50 !== it.p50){
      s.push('<circle data-ms="ghost" cx="' + gx50.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5" fill="' + C.bg + '" stroke="' + C.muted + '" stroke-width="1.25"/>');
      s.push('<line x1="' + gx50.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x50.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + C.muted + '" stroke-width="1" stroke-dasharray="2 3" opacity=".72"/>');
    }
  }
  if(!it.single && x90 - x50 > 1){
    s.push('<line data-ms="whisker" x1="' + x50.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x90.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + col + '" stroke-width="' + (opts.strong ? 4 : 3) + '" stroke-linecap="round" opacity="' + opacity + '"/>');
    s.push('<line data-ms="p90" x1="' + x90.toFixed(1) + '" y1="' + (y - 6).toFixed(1) + '" x2="' + x90.toFixed(1) + '" y2="' + (y + 6).toFixed(1) + '" stroke="' + col + '" stroke-width="1.5"/>');
  }
  if(it.status === 'fixed'){
    s.push('<line data-ms="p50"' + (edit ? editAttrs(it, 'status') : '') + ' x1="' + x50.toFixed(1) + '" y1="' + (y - 10).toFixed(1) + '" x2="' + x50.toFixed(1) + '" y2="' + (y + 10).toFixed(1) + '" stroke="' + col + '" stroke-width="2"/>');
  }else{
    s.push('<circle data-ms="p50"' + (edit ? editAttrs(it, 'status') : '') + ' cx="' + x50.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (opts.strong ? 5.5 : 4.5) + '" fill="' + col + '" stroke="' + C.bg + '" stroke-width="1.5"/>');
  }
  const clock = decisionLead(it, sc.today);
  if(clock && clock.day >= sc.lo && clock.day <= sc.hi){
    const cx = sc.X(clock.day), receipt = leadReceipt(it, sc.today).text;
    /* A lead is not another forecast interval. Its square sits above the
       timeline and its short vertical stem ends before the range line. */
    s.push('<g data-lrm="" aria-label="' + esc(receipt) + '"><title>' + esc(receipt) + '</title><line x1="' + cx.toFixed(1) + '" y1="' + (y - 12).toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + (y - 5).toFixed(1) + '" stroke="' + C.ink + '" stroke-width="1"/><rect data-ms="lrm" x="' + (cx - 3.5).toFixed(1) + '" y="' + (y - 17).toFixed(1) + '" width="7" height="7" fill="' + C.bg + '" stroke="' + C.ink + '" stroke-width="1.25"/></g>');
  }
}

/* A — CALIBRATED FIELD. The shared axis is the artifact. Ranges are thin neutral
   physical intervals, P50 is a quiet anchor, and the lane rail carries language so
   time never has to fight a floating label. */
function field(model, ctx, edit, presentation, diff = null){
  const C = colors(model, ctx), W = presentation ? 1920 : 1442, trackH = presentation ? 52 : 40,
    H = presentation ? 1080 : Math.max(520, 200 + model.items.length * trackH + model.lanes.length * 22 + 160);
  const left = presentation ? 470 : 340, right = W - (presentation ? 80 : 36), today = model.today ?? ctx.today;
  const sc = {...scale(model, today, left, right - left), today};
  /* The lane rail owns each item's language, so every label gets a physical
     track. Timing ranges still share a common X field; we must never reuse a
     non-overlapping temporal track and stack two labels on one rail baseline. */
  const tracks = new Map();
  for(const lane of model.lanes)
    model.items.filter(it => it.lane === lane).sort((a,b) => a.p50 - b.p50 || a.srcLine - b.srcLine)
      .forEach((it, index) => tracks.set(it, index));
  const s = ['<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>'];
  header(s, {W, title: model.title, today, C, name: presentation ? 'Timeline / Forecast field' : 'Forecast field',
    detail: diff ? diff.sinceLine.toUpperCase() : 'P50–P90 RANGES · SHARED CHRONOLOGY · NOT DELIVERY PROMISES'});
  const top = 150, bottom = H - (presentation ? 130 : 100);
  axis(s, sc, {left, right, top, bottom, C, today});
  let y = top + 24;
  for(const lane of model.lanes){
    const entries = model.items.filter(it => it.lane === lane);
    const rows = Math.max(1, ...entries.map(it => tracks.get(it) + 1));
    const laneTop = y, laneBottom = y + rows * trackH + 10;
    s.push('<line x1="36" y1="' + (laneTop - 12) + '" x2="' + right + '" y2="' + (laneTop - 12) + '" stroke="' + C.border + '"/>');
    if(lane) s.push(txt(36, laneTop + 2, lane.toUpperCase(), 9.5, C.muted, {weight: 700, tracking: 1.2}));
    for(const it of entries){
      const iy = laneTop + tracks.get(it) * trackH + 18;
      const st = statusText(it, today), stCol = stateColor(it, C, today);
      s.push('<text' + (edit ? editAttrs(it, 'label') : '') + ' x="' + (presentation ? 166 : 128) + '" y="' + (iy - 2) + '" font-family="' + FONT + '" font-size="' + (presentation ? 16 : 13) + '" font-weight="650" fill="' + C.ink + '">' + esc(label(it)) + '</text>');
      s.push('<text' + (edit ? editAttrs(it, 'dates') : '') + ' x="' + (presentation ? 166 : 128) + '" y="' + (iy + 12) + '" font-family="' + FONT + '" font-size="' + (presentation ? 10.5 : 10) + '" fill="' + C.muted + '">' + esc(rangeText(it)) + '</text>');
      if(st) s.push(txt(presentation ? 36 : 36, iy + 3, st, 8.5, stCol, {weight: 700, tracking: .9}));
      rangeMark(s, it, iy, sc, C, edit, {strong: presentation, diff});
      if(diff && diff.newKeys.has(itemKey(it)))
        s.push(txt(presentation ? 36 : 36, iy + 15, 'NEW', 8.5, C.ink, {weight:700, tracking:.8}));
    }
    y = laneBottom + 22;
  }
  const clocks = model.items.map(it => ({it, clock: decisionLead(it, today)})).filter(x => x.clock);
  const receipt = clocks.length ? clocks.map(({it, clock}) => 'DECIDE BY ' + fmtDay(clock.day) + ' · ' + it.label).join('  /  ') : 'RANGES ARE FORECAST INTERVALS; FIXED EVENTS ARE FACTS.';
  s.push('<line x1="36" y1="' + (H - 72) + '" x2="' + right + '" y2="' + (H - 72) + '" stroke="' + C.border + '"/>');
  s.push(txt(36, H - 44, receipt, presentation ? 14 : 11, C.ink, {weight: 650, tracking: .2}));
  const evidence = diff && diff.dropped.length ? 'DROPPED SINCE ' + diff.since.toUpperCase() + ' · ' + diff.dropped.join(' · ')
    : 'P50 IS THE CENTRAL FORECAST · P90 IS THE LATE-CASE BOUND · SQUARE ABOVE TRACK IS A DECISION LEAD';
  s.push(txt(36, H - 24, evidence, 9.5, C.muted, {weight: 600, tracking: .45}));
  return '<svg xmlns="http://www.w3.org/2000/svg" data-direction="field" data-intent="' + (presentation ? 'presentation' : 'live-wide') + '" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' + s.join('') + '</svg>';
}

/* B — FORECAST LEDGER. A deliberately auditable alternative: confidence is read
   as text first, with a small shared scale. It is honest, but less immediately
   comparative — exactly the trade-off the direction review needs to see. */
function ledger(model, ctx, edit, presentation){
  const C = colors(model, ctx), W = presentation ? 1920 : 1442, H = presentation ? 1080 : Math.max(480, 184 + model.items.length * 54 + 88);
  const left = presentation ? 1230 : 855, right = W - (presentation ? 80 : 36), today = model.today ?? ctx.today;
  const sc = {...scale(model, today, left, right - left), today}, s = ['<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>'];
  header(s, {W, title: model.title, today, C, name: presentation ? 'Timeline / Forecast ledger' : 'Forecast ledger', detail: 'AUDITABLE RANGE RECORD · ONE SHARED REFERENCE SCALE'});
  const top = 162, bottom = H - 92;
  axis(s, sc, {left, right, top, bottom, C, today});
  s.push(txt(36, 145, 'LANE', 9.5, C.muted, {weight:700, tracking:1}));
  s.push(txt(presentation ? 260 : 182, 145, 'MILESTONE', 9.5, C.muted, {weight:700, tracking:1}));
  s.push(txt(presentation ? 790 : 600, 145, 'FORECAST INTERVAL', 9.5, C.muted, {weight:700, tracking:1}));
  model.items.forEach((it, index) => {
    const y = top + 25 + index * 54, st = statusText(it, today), col = stateColor(it, C, today);
    s.push('<line x1="36" y1="' + (y + 20) + '" x2="' + right + '" y2="' + (y + 20) + '" stroke="' + C.border + '"/>');
    s.push(txt(36, y, (it.lane || 'UNLANED').toUpperCase(), 10, C.muted, {weight:650, tracking:.6}));
    s.push('<text' + (edit ? editAttrs(it, 'label') : '') + ' x="' + (presentation ? 260 : 182) + '" y="' + y + '" font-family="' + FONT + '" font-size="' + (presentation ? 16 : 13) + '" font-weight="650" fill="' + C.ink + '">' + esc(label(it)) + '</text>');
    s.push('<text' + (edit ? editAttrs(it, 'dates') : '') + ' x="' + (presentation ? 790 : 600) + '" y="' + y + '" font-family="' + FONT + '" font-size="' + (presentation ? 14 : 12) + '" fill="' + C.ink + '">' + esc(rangeText(it)) + '</text>');
    if(st) s.push(txt(presentation ? 790 : 600, y + 15, st, 8.5, col, {weight:700, tracking:.9}));
    rangeMark(s, it, y - 3, sc, C, edit);
  });
  s.push('<line x1="36" y1="' + (H - 62) + '" x2="' + right + '" y2="' + (H - 62) + '" stroke="' + C.border + '"/>');
  s.push(txt(36, H - 34, 'LEDGER FIRST: precise to audit, slower to compare across the programme.', 11, C.muted, {weight:600}));
  return '<svg xmlns="http://www.w3.org/2000/svg" data-direction="ledger" data-intent="' + (presentation ? 'presentation' : 'live-wide') + '" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' + s.join('') + '</svg>';
}

/* C — DECISION CLOCK. A conscious counter-proposal, not the expected winner:
   one active decision gets the foreground and forecasts become supporting evidence.
   It exposes why a clock cannot honestly be Timeline's universal organising axis. */
function clock(model, ctx, edit, presentation){
  const C = colors(model, ctx), W = presentation ? 1920 : 1442, H = presentation ? 1080 : Math.max(480, 230 + model.items.length * 34 + 82);
  const left = presentation ? 390 : 300, right = W - (presentation ? 80 : 36), today = model.today ?? ctx.today;
  const sc = {...scale(model, today, left, right - left), today}, s = ['<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>'];
  const active = model.items.map(it => ({it, clock: decisionLead(it, today)})).filter(x => x.clock).sort((a,b) => a.clock.day - b.clock.day)[0];
  header(s, {W, title: model.title, today, C, name: presentation ? 'Timeline / Decision clock' : 'Decision clock', detail: active ? 'ONE CLOSING DECISION · FORECASTS AS CONTEXT' : 'NO AUTHORED DECISION LEAD · FORECASTS AS CONTEXT'});
  const cx = active ? sc.X(active.clock.day) : sc.X(today), bandTop = 133, bandBottom = 225;
  axis(s, sc, {left, right, top: bandTop, bottom: H - 78, C, today});
  s.push('<line x1="36" y1="' + bandBottom + '" x2="' + right + '" y2="' + bandBottom + '" stroke="' + C.border + '"/>');
  if(active){
    s.push('<line x1="' + cx.toFixed(1) + '" y1="110" x2="' + cx.toFixed(1) + '" y2="' + bandBottom + '" stroke="' + C.ink + '" stroke-width="2"/>');
    s.push(diamond(cx, 142, 8, C.ink, C.ink));
    s.push(txt(cx, 173, 'DECIDE BY ' + fmtDay(active.clock.day), presentation ? 18 : 14, C.ink, {anchor:'middle', weight:700, tracking:.35}));
    s.push(txt(cx, 194, active.it.label + ' · ' + active.clock.leadDays + ' DAY LEAD', 10.5, C.muted, {anchor:'middle', weight:600}));
  }
  model.items.forEach((it,index) => {
    const y = 254 + index * 34, col = stateColor(it,C,today), st = statusText(it, today);
    s.push('<text' + (edit ? editAttrs(it, 'label') : '') + ' x="36" y="' + (y + 3) + '" font-family="' + FONT + '" font-size="12.5" font-weight="650" fill="' + C.ink + '">' + esc(label(it)) + '</text>');
    if(st) s.push(txt(36, y + 16, st, 8.5, col, {weight:700,tracking:.9}));
    rangeMark(s, it, y, sc, C, edit);
  });
  s.push('<line x1="36" y1="' + (H - 54) + '" x2="' + right + '" y2="' + (H - 54) + '" stroke="' + C.border + '"/>');
  s.push(txt(36, H - 27, active ? 'The clock is real, but only for this fixed event — it cannot recast every forecast as a deadline.' : 'No decision lead is authored; a clock-led composition has no honest subject.', 11, C.muted, {weight:600}));
  return '<svg xmlns="http://www.w3.org/2000/svg" data-direction="clock" data-intent="' + (presentation ? 'presentation' : 'live-wide') + '" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' + s.join('') + '</svg>';
}

/* The phone field is a distinct reading form, not the desktop squeezed down.
   Each milestone owns a label block and a separate 28px chronology track; the
   shared scale repeats within only those tracks, so TODAY and ticks can never
   cut through authored text. */
function fieldNarrow(model, ctx, edit, diff = null){
  const C = colors(model, ctx), W = ctx.width || 390, today = model.today ?? ctx.today;
  const PAD = 16, sc = {...scale(model, today, PAD, W - PAD * 2), today};
  const rows = [];
  const compareBits = diff ? [
    diff.slips.length ? diff.slips.length + ' SLIPPED' : '',
    diff.newKeys.size ? diff.newKeys.size + ' NEW' : '',
    diff.dropped.length ? diff.dropped.length + ' DROPPED' : '',
  ].filter(Boolean) : [];
  const compareLine = diff ? 'SINCE ' + diff.since.toUpperCase() + ' · ' + (compareBits.join(' · ') || 'NO CHANGE') : '';
  const tickY = diff ? 92 : 74;
  let y = tickY + 28;
  for(const lane of model.lanes){
    const entries = model.items.filter(it => it.lane === lane);
    if(lane){ rows.push({lane, top:y}); y += 25; }
    for(const it of entries){ rows.push({it, top:y}); y += 96; }
    y += 8;
  }
  const H = y + (diff && diff.dropped.length ? 42 : 24);
  const s = ['<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>'];
  s.push(txt(PAD, 22, 'CALIBRATED FIELD', 9.5, C.muted, {weight:700, tracking:1.2}));
  s.push(txt(PAD, 48, model.title || 'Milestone timeline', 17, C.ink, {weight:700}));
  if(compareLine) s.push(txt(PAD, 66, compareLine, 9.5, C.muted, {weight:600, tracking:.25}));
  /* The ruler owns precise month geometry; its labels are an annotation layer.
     On a narrow scale their date positions must remain true, but labels never
     earn permission to collide. Walk back from the future so an edge-clamped
     July yields to August rather than printing an ambiguous "JULAUG". */
  const tickLabels = axisTicks(sc.lo, sc.hi).map(tick => {
    const labelW=ctx.measure(tick.label, '700 8.5px ' + FONT);
    return {...tick, labelW,
      x:Math.max(PAD + labelW / 2, Math.min(W - PAD - labelW / 2, sc.X(tick.day)))};
  });
  const visibleTickLabels = [], GAP = 5;
  let nextLeft = Infinity;
  for(let i=tickLabels.length - 1; i >= 0; i--){
    const tick=tickLabels[i], right=tick.x + tick.labelW / 2;
    if(right + GAP <= nextLeft){
      visibleTickLabels.push(tick);
      nextLeft=tick.x - tick.labelW / 2;
    }
  }
  for(const tick of visibleTickLabels.reverse())
    s.push(txt(tick.x, tickY, tick.label, 8.5, C.muted, {anchor:'middle',weight:700,tracking:.45}));
  const tX=sc.X(today);
  s.push(txt(tX, tickY + 13, 'TODAY', 8, C.ink, {anchor:'middle',weight:700,tracking:.45}));
  for(const row of rows){
    if(row.lane){
      s.push('<line x1="' + PAD + '" y1="' + (row.top-5) + '" x2="' + (W-PAD) + '" y2="' + (row.top-5) + '" stroke="' + C.border + '"/>');
      if(edit) s.push('<g data-add-control="" data-edit="additem" data-line="-1" data-raw="" data-lane="' + esc(row.lane) + '" tabindex="0" role="button" aria-label="Add milestone into ' + esc(row.lane) + '">');
      s.push(txt(PAD, row.top+10, row.lane.toUpperCase(), 9.5, C.muted, {weight:700, tracking:1.1}));
      if(edit) s.push('<rect data-hit="" x="' + PAD + '" y="' + (row.top-9) + '" width="' + (W-PAD*2) + '" height="36" fill="' + C.bg + '" fill-opacity="0"/></g>');
      continue;
    }
    const {it,top} = row, st=statusText(it,today), col=stateColor(it,C,today);
    const trackTop=top+45, trackH=28, cy=trackTop+trackH/2;
    if(edit){
      s.push('<g data-edit="cardmenu" data-line="' + it.srcLine + '" data-menu="" tabindex="0" role="button" aria-label="Milestone: ' + esc(it.label) + '">');
      s.push('<rect data-hit="" x="4" y="' + top + '" width="' + (W-8) + '" height="90" fill="' + C.bg + '" fill-opacity="0"/>');
      s.push('<rect data-edit="setlane" data-line="' + it.srcLine + '" data-raw="' + esc(it.lane) + '" pointer-events="none" x="' + PAD + '" y="' + (top+4) + '" width="160" height="18" fill-opacity="0"/>');
      s.push('<rect data-edit="note" data-line="' + it.srcLine + '" data-raw="' + esc(it.note || '') + '" pointer-events="none" x="' + PAD + '" y="' + (top+23) + '" width="240" height="18" fill-opacity="0"/>');
      s.push('<g' + editAttrs(it,'label') + '>');
    }
    s.push(txt(PAD, top+16, label(it), 13, C.ink, {weight:650}));
    if(edit) s.push('</g><g' + editAttrs(it,'dates') + '>');
    s.push(txt(PAD, top+33, rangeText(it), 10.5, C.muted));
    if(edit) s.push('</g>');
    if(st) s.push(txt(W-PAD, top+16, st, 8.5, col, {anchor:'end',weight:700,tracking:.8}));
    s.push('<line x1="' + PAD + '" y1="' + cy + '" x2="' + (W-PAD) + '" y2="' + cy + '" stroke="' + C.border + '"/>');
    for(const tick of axisTicks(sc.lo,sc.hi)){
      const x=sc.X(tick.day);
      s.push('<line x1="' + x.toFixed(1) + '" y1="' + trackTop + '" x2="' + x.toFixed(1) + '" y2="' + (trackTop+trackH) + '" stroke="' + C.border + '" opacity=".65"/>');
    }
    s.push('<line data-today="" x1="' + tX.toFixed(1) + '" y1="' + trackTop + '" x2="' + tX.toFixed(1) + '" y2="' + (trackTop+trackH) + '" stroke="' + C.ink + '" stroke-width="1"/>');
    rangeMark(s,it,cy,sc,C,edit,{strong:true,diff});
    if(diff && diff.newKeys.has(itemKey(it))) s.push(txt(PAD, top+45, 'NEW', 8.5, C.ink,{weight:700,tracking:.8}));
    if(edit) s.push('</g>');
  }
  if(diff && diff.dropped.length)
    s.push(txt(PAD,H-14,'DROPPED SINCE '+diff.since.toUpperCase()+' · '+diff.dropped.join(' · '),9.5,C.muted,{weight:600,tracking:.3}));
  else s.push(txt(PAD,H-14,'COMMON TIME SCALE · TAP A ROW TO EDIT',8.5,C.muted,{weight:650,tracking:.35}));
  return '<svg xmlns="http://www.w3.org/2000/svg" data-direction="field" data-narrow="" data-intent="live-narrow" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' + s.join('') + '</svg>';
}

function narrow(model, ctx, direction, edit, diff = null){
  if(direction === 'field') return fieldNarrow(model,ctx,edit,diff);
  const C = colors(model, ctx), W = ctx.width || 390, today = model.today ?? ctx.today, H = 170 + model.items.length * 86 + 74;
  const sc = {...scale(model, today, 18, W - 36), today}, s = ['<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>'];
  const names = {field:'CALIBRATED FIELD', ledger:'FORECAST LEDGER', clock:'DECISION CLOCK'};
  s.push(txt(18, 25, names[direction], 10, C.muted, {weight:700,tracking:1.3}));
  s.push(txt(18, 54, model.title || 'Milestone timeline', 18, C.ink, {weight:700}));
  axis(s, sc, {left:18, right:W-18, top:78, bottom: H - 55, C, today});
  model.items.forEach((it, index) => {
    const y = 111 + index * 86, col = stateColor(it,C,today), st = statusText(it,today);
    s.push('<text' + (edit ? editAttrs(it, 'label') : '') + ' x="18" y="' + y + '" font-family="' + FONT + '" font-size="13" font-weight="650" fill="' + C.ink + '">' + esc(label(it)) + '</text>');
    s.push('<text' + (edit ? editAttrs(it, 'dates') : '') + ' x="18" y="' + (y + 16) + '" font-family="' + FONT + '" font-size="10.5" fill="' + C.muted + '">' + esc(rangeText(it)) + '</text>');
    if(st) s.push(txt(18, y + 30, st, 8.5, col, {weight:700,tracking:.8}));
    rangeMark(s, it, y + 49, sc, C, edit, {strong: direction === 'field'});
  });
  s.push(txt(18, H - 20, 'ONE SHARED TIME SCALE · TAP LABEL, DATES OR MARKER TO EDIT', 8.5, C.muted, {weight:650,tracking:.4}));
  return '<svg xmlns="http://www.w3.org/2000/svg" data-direction="' + direction + '" data-narrow="" data-intent="live-narrow" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + FONT + '">' + s.join('') + '</svg>';
}

export function renderDirection(model, ctx, direction, {edit = false, intent = null, diff = null} = {}){
  const kind = intent || ctx.intent || (ctx.width && ctx.width < 520 ? 'live-narrow' : 'live-wide');
  if(kind === 'live-narrow' || (ctx.width && ctx.width < 520)) return narrow(model, ctx, direction, edit, diff);
  const presentation = kind === 'presentation';
  if(direction === 'ledger') return ledger(model, ctx, edit, presentation);
  if(direction === 'clock') return clock(model, ctx, edit, presentation);
  return field(model, ctx, edit, presentation, diff);
}
