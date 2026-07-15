/* /timeline model → deck-ready SVG. Pure: colours/measure from ctx; `today`
   comes from model.today ?? ctx.today so goldens stay deterministic. The
   uncertainty IS the picture: solid diamond at P50, whisker to an open diamond
   at P90 — no bar edges pretending to be commitments. */
import {PALETTES, scheme} from '../assets/series.js';
import {esc, txt, tint} from '../assets/svg.js';
import {fmtDay, STATUSES} from './parse.js';

const F = {
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  serif: "Charter, Georgia, 'Times New Roman', serif",
};
const T = {
  pad: 26, laneW: 150, plotW: 1240, rowH: 32, laneGap: 11, lanePadY: 8,
  titleSize: 22, titleY: 36, headerH: 56, headerHNoTitle: 20, dateSize: 11,
  tickH: 26, msR: 6, labelSize: 12.5, noteSize: 10.5, readoutSize: 15,
  slideScale: 1.35, sinceSize: 12, droppedSize: 11,
  addZoneW: 34, addZoneH: 44,   // per-lane ghost "＋" zone + its invisible hit rect (≥44px tap target)
};
const DAY_MS = 86400000;
const monthStart = day => {
  const d = new Date(day * DAY_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY_MS;
};
const addMonths = (day, n) => {
  const d = new Date(day * DAY_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) / DAY_MS;
};

export function ticks(lo, hi){
  const months = (hi - lo) / 30.44;
  const quarterly = months > 24;
  const out = [];
  let t = monthStart(lo);
  const d0 = new Date(t * DAY_MS);
  if(quarterly) t = Date.UTC(d0.getUTCFullYear(), Math.floor(d0.getUTCMonth() / 3) * 3, 1) / DAY_MS;
  while(t <= hi){
    const d = new Date(t * DAY_MS);
    out.push({day: t, label: quarterly
      ? 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + d.getUTCFullYear()
      : fmtDay(t, {month: true})});
    t = addMonths(t, quarterly ? 3 : 1);
  }
  return out;
}

const wk = days => {
  const w = Math.round(Math.abs(days) / 7);
  return w + (w === 1 ? ' week' : ' weeks');
};

/* the dates/note sub-line under each label — the extent pass and the milestone
   loop measure this exact string (module-level so msLabelAnchor stays pure) */
export function subOf(it){
  return (it.status === 'done' ? fmtDay(it.p50) : it.single ? fmtDay(it.p50)
    : fmtDay(it.p50, {month: (it.p90 - it.p50) > 45}) + ' → ' + fmtDay(it.p90, {month: (it.p90 - it.p50) > 45})) +
    (it.note ? ' · ' + it.note : '');
}

const keyOf = it => (it.lane + '|' + it.label).toLowerCase().replace(/\s+/g, ' ').trim();

/* Where a milestone's label sits so the P90 diamond never splices it. Default:
   just right of P50 (today's look). If the widest label line would reach the P90
   diamond's LEFT tip (x90 - 0.8r), move the whole block to the right of the
   diamond; if THAT overflows the plot AND a left-flip stays on-board AND there's
   no ghost/slip in that space, flip LEFT of P50, right-anchored (the TODAY-flag
   idiom). If neither side fits (or compare mode occupies the left), keep it
   right-of-P90 and accept a right-edge clip — a readable title beats an invisible
   one. Only ranged milestones with a real whisker move. PURE; `r` is pre-scaled
   (never double-scale it); `hasGhost` is passed in (the compare pull-in trail
   lives left of x50, exactly where a flip would land). */
export function msLabelAnchor(it, x50, x90, r, S, plotX, plotW, measure, labelFont, noteFont, hasGhost){
  const titleW = measure(it.label + (it.single && it.status !== 'done' ? ' ±?' : ''), labelFont);
  const subW = measure(subOf(it), noteFont);
  const widest = Math.max(titleW, subW);
  const rightOfP50 = x50 + (r + 5 * S);
  const hasWhisker = !it.single && (x90 - x50) > 1;
  if(hasWhisker && rightOfP50 + widest > x90 - 0.8 * r - 4 * S){
    const afterP90 = x90 + 0.8 * r + 6 * S;
    if(afterP90 + widest <= plotX + plotW - 4 * S) return {labelX: afterP90, anchorEnd: false, widest, titleW, subW};
    const flipX = x50 - r - 6 * S;                                    // right-anchored block ends here
    if(!hasGhost && flipX - widest >= plotX + 4 * S) return {labelX: flipX, anchorEnd: true, widest, titleW, subW};
    return {labelX: afterP90, anchorEnd: false, widest, titleW, subW};    // both tight / compare → keep right, clip
  }
  return {labelX: rightOfP50, anchorEnd: false, widest, titleW, subW};
}

/* plain-text mirror of the SVG's "one quotable line" readout — the HTML text
   app.js shows next to the diagram. Pure; same inputs render() itself uses. */
export function timelineReadout(model, today){
  const items = model.items;
  const upcoming = items.filter(i => i.status !== 'done' && i.p50 >= today).sort((a, b) => a.p50 - b.p50)[0];
  const ranged = items.filter(i => !i.single);
  const widest = ranged.length ? ranged.reduce((a, b) => (b.p90 - b.p50) > (a.p90 - a.p50) ? b : a) : null;
  const bits = [];
  if(upcoming){
    const sameMonth = fmtDay(upcoming.p50, {month: true}) === fmtDay(upcoming.p90, {month: true});
    const g = {month: !sameMonth};
    bits.push('Next up: ' + upcoming.label + ' — P50 ' + fmtDay(upcoming.p50, g) +
      (upcoming.single ? '' : ', could slip to ' + fmtDay(upcoming.p90, g)) + '.');
  }
  if(widest && (widest.p90 - widest.p50) >= 7)
    bits.push('Widest whisker: ' + widest.label + ' — ' + wk(widest.p90 - widest.p50) + ' between P50 and P90.');
  return bits.join('  ');
}

export function render(model, ctx, diff = null, {edit = false} = {}){
  const {measure, slide = false, dark = false} = ctx;
  const bare = !!ctx.bare;            // poster-embed: drop chrome the frame owns
  const hasTitle = !!model.title && !bare;
  const paletteHex = model.accent ||
    (PALETTES[model.palette] ? PALETTES[model.palette][dark ? 'dark' : 'light'] : null);
  const C = paletteHex ? {...ctx.colors, ...scheme(paletteHex, dark)} : ctx.colors;
  const S = slide ? T.slideScale : 1;
  const today = model.today ?? ctx.today;
  const items = model.items;

  /* time domain: everything visible, today included */
  const lo0 = items.length ? Math.min(...items.map(i => i.p50), today) : today - 30;
  const hi0 = items.length ? Math.max(...items.map(i => i.p90), today) : today + 90;
  const ghostDays = diff ? [...diff.byKey.values()].map(g => g.oldP50) : [];
  const lo1 = Math.min(lo0, ...ghostDays), hi1 = Math.max(hi0, ...ghostDays);
  const padD = Math.max(14, Math.round((hi1 - lo1) * 0.05));
  const lo = lo1 - padD, hi = hi1 + padD;
  const plotX = (T.pad + T.laneW) * S, plotW = T.plotW * S;
  const X = day => plotX + (day - lo) / (hi - lo) * plotW;

  const colorOf = it => it.status === 'done' ? C.status.done
    : it.status === 'risk' ? C.err : C.accent;

  /* the label font + the (module-level) subOf sub-line the extent pass and the
     milestone loop both measure through msLabelAnchor */
  const noteFont = T.noteSize * S + 'px ' + F.body;

  /* row packing per lane: items sorted by P50; first row whose extent has ended.
     laneMaxRightX is a SEPARATE per-lane extent taken from the strings each
     row actually renders — per item, the max of the whisker geometry, the
     label line, and the dates/note sub-line (smaller note font, but with no
     label prefix it often runs wider than packing's label-font rightX) — so
     the per-lane add zone anchors past everything the lane really draws.
     Packing's rightX stays untouched: it feeds row assignment and the goldens. */
  const laneRows = new Map();
  const laneMaxRightX = new Map();
  const labelFont = '600 ' + T.labelSize * S + 'px ' + F.body;
  for(const lane of model.lanes){
    const rows = [];
    let extent = 0;
    for(const it of items.filter(i => i.lane === lane).sort((a, b) => a.p50 - b.p50)){
      const x50 = X(it.p50), x90 = X(it.p90), r = T.msR * S;
      const hasGhost = !!(diff && diff.byKey.get(keyOf(it)));
      const {labelX: lx, anchorEnd, widest} =
        msLabelAnchor(it, x50, x90, r, S, plotX, plotW, measure, labelFont, noteFont, hasGhost);
      it._labelX = lx; it._anchorEnd = anchorEnd;
      const labelRight = anchorEnd ? lx : lx + widest;                             // the label block's right edge
      const startX = anchorEnd ? Math.min(x50 - r - 4, lx - widest) : x50 - r - 4; // its left edge (a flip opens a new row)
      const rightX = Math.max(x90 + r, labelRight);
      let ri = rows.findIndex(right => startX > right + 12 * S);
      if(ri < 0){ ri = rows.length; rows.push(rightX); }
      else rows[ri] = rightX;
      it._row = ri;
      extent = Math.max(extent, x90 + r, labelRight);
    }
    laneRows.set(lane, rows.length || 1);
    laneMaxRightX.set(lane, extent);
  }

  const headerH = ((hasTitle ? T.headerH : T.headerHNoTitle) + (diff ? 20 : 0)) * S;
  let laneY = headerH + T.tickH * S;
  const laneTop = new Map();
  for(const lane of model.lanes){
    laneTop.set(lane, laneY);
    laneY += (T.lanePadY * 2 + laneRows.get(lane) * T.rowH) * S + T.laneGap * S;
  }
  const plotBottom = model.lanes.length ? laneY - T.laneGap * S : laneY + T.rowH * S;
  const readoutY = plotBottom + 26 * S;
  const droppedH = diff && diff.dropped.length ? (20 + diff.dropped.length * 15) * S : 0;
  const W = Math.round(plotX + plotW + T.pad * S);
  const H = Math.round((bare ? plotBottom : readoutY + 24 * S) + droppedH + T.pad * S);

  const s = [];
  s.push('<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>');
  if(hasTitle){
    s.push('<text x="' + T.pad * S + '" y="' + T.titleY * S + '" font-family="' + F.serif +
      '" font-size="' + T.titleSize * S + '" font-weight="700" fill="' + C.ink + '">' +
      esc(model.title) + '</text>');
  }
  if(!bare) s.push(txt(W - T.pad * S, (hasTitle ? T.titleY : 14) * S, fmtDay(today), T.dateSize * S,
    C.muted, {anchor: 'end'}));
  if(diff){
    s.push(txt(T.pad * S, (hasTitle ? T.titleY + 19 : 14) * S, diff.sinceLine, T.sinceSize * S,
      C.accent, {weight: 600}));
  }

  /* ticks */
  for(const tk of ticks(lo, hi)){
    const x = X(tk.day);
    s.push('<line x1="' + x.toFixed(1) + '" y1="' + (headerH + T.tickH * S) + '" x2="' + x.toFixed(1) +
      '" y2="' + plotBottom + '" stroke="' + C.border + '" stroke-width="1" opacity="0.55"/>');
    s.push(txt(x, headerH + T.tickH * S - 8 * S, tk.label, 10 * S, C.muted, {anchor: 'middle'}));
  }

  /* lane bands + labels */
  for(const lane of model.lanes){
    const y0 = laneTop.get(lane);
    const h = (T.lanePadY * 2 + laneRows.get(lane) * T.rowH) * S;
    s.push('<rect x="' + T.pad * S + '" y="' + y0 + '" width="' + (T.laneW + T.plotW) * S +
      '" height="' + h + '" rx="8" fill="' + C.card + '" stroke="' + C.border + '"/>');
    if(lane) s.push(txt((T.pad + 14) * S, y0 + 20 * S, lane.toUpperCase(), 10.5 * S, C.muted,
      {weight: 600, tracking: 1}));
    /* per-lane ghost add zone — content-anchored just right of the lane's
       furthest milestone, clamped so it never rides off the plot; skips the
       unnamed lane (its aria-label would read "into "). Quiet ghost "＋"
       plus an explicit invisible hit rect (unlike the shipped global target,
       which relies on its text bbox) — a real tap target, not a hopeful one. */
    if(edit && lane){
      const zw = T.addZoneW * S, zh = T.addZoneH * S;
      const zx = Math.min(laneMaxRightX.get(lane) + 12 * S, plotX + plotW - zw);
      const zy = y0 + h / 2;
      s.push('<g data-edit="additem" data-lane="' + esc(lane) + '" data-line="-1" data-raw="" tabindex="0" role="button"' +
        ' aria-label="Add milestone into ' + esc(lane) + '">' +
        txt(zx + zw / 2, zy + 4 * S, '＋', T.labelSize * S, C.muted, {anchor: 'middle'}) +
        '<rect x="' + zx.toFixed(1) + '" y="' + (zy - zh / 2).toFixed(1) + '" width="' + zw +
        '" height="' + zh + '" fill="' + C.bg + '" fill-opacity="0"/></g>');
    }
  }

  /* today line + flag over the bands — the key reference axis, so it reads at a glance:
     a filled ink flag (neutral, distinct from the ocean milestones) tops a bolder dashed line */
  if(today >= lo && today <= hi){
    const x = X(today);
    const flagY = headerH + 5 * S, ph = 16 * S;
    s.push('<line data-today="" x1="' + x.toFixed(1) + '" y1="' + flagY.toFixed(1) + '" x2="' + x.toFixed(1) +
      '" y2="' + plotBottom.toFixed(1) + '" stroke="' + C.ink + '" stroke-width="1.5" stroke-dasharray="5 3"/>');
    const pw = measure('TODAY', '700 ' + (8.5 * S) + 'px ' + F.body) + 14 * S;
    const flip = x + pw > plotX + plotW; // flag flips left of the line near the right edge so it never clips
    const rx0 = flip ? x - pw : x;
    s.push('<rect x="' + rx0.toFixed(1) + '" y="' + flagY.toFixed(1) + '" width="' + pw.toFixed(1) +
      '" height="' + ph.toFixed(1) + '" rx="3" fill="' + C.ink + '"/>');
    s.push(txt(rx0 + pw / 2, flagY + ph / 2 + 3 * S, 'TODAY', 8.5 * S, C.bg, {anchor: 'middle', weight: 700, tracking: 0.6}));
  }

  /* milestones */
  const diamond = (cx, cy, r, fill, stroke, extra = '') =>
    '<path' + extra + ' d="M' + cx.toFixed(1) + ' ' + (cy - r).toFixed(1) +
    ' L' + (cx + r).toFixed(1) + ' ' + cy.toFixed(1) +
    ' L' + cx.toFixed(1) + ' ' + (cy + r).toFixed(1) +
    ' L' + (cx - r).toFixed(1) + ' ' + cy.toFixed(1) + ' Z" fill="' + fill +
    '" stroke="' + stroke + '" stroke-width="1.5"/>';

  for(const it of items){
    const col = colorOf(it);
    const k = keyOf(it);
    const y = laneTop.get(it.lane) + (T.lanePadY + it._row * T.rowH + T.rowH / 2) * S;
    const x50 = X(it.p50), x90 = X(it.p90), r = T.msR * S;
    const ghost = diff && diff.byKey.get(k);
    if(ghost && ghost.oldP50 !== it.p50){
      const gx = X(ghost.oldP50);
      s.push('<line x1="' + gx.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x50.toFixed(1) +
        '" y2="' + y.toFixed(1) + '" stroke="' + C.muted + '" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/>');
      s.push(diamond(gx, y, r * 0.85, 'none', C.muted, ' data-ms="ghost" stroke-dasharray="2 2"'));
    }
    if(!it.single && x90 - x50 > 1){
      /* the P50→P90 slip range as a tinted band, not a hairline — the uncertainty is the picture */
      const bh = Math.min(T.rowH - 10, 15) * S;
      s.push('<rect data-ms="whisker" x="' + x50.toFixed(1) + '" y="' + (y - bh / 2).toFixed(1) +
        '" width="' + (x90 - x50).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + (bh / 2).toFixed(1) +
        '" fill="' + tint(col) + '"/>');
      s.push(diamond(x90, y, r * 0.8, C.card, col, ' data-ms="p90"'));
    }
    s.push(diamond(x50, y, r, col, C.card, ' data-ms="p50" data-mskey="' + esc(k) + '"' +
      (edit ? ' data-edit="status" data-line="' + it.srcLine + '" data-raw="' + (it.status || '') +
        '" tabindex="0" role="button" aria-label="Cycle status: ' + esc(it.label) + '"' : '')));

    const labelX = it._labelX;
    const ae = it._anchorEnd ? ' text-anchor="end"' : '';   // flip-left labels are right-anchored
    const eipL = edit ? ' data-edit="label" data-line="' + it.srcLine + '" data-raw="' + esc(it.label) +
      '" tabindex="0" role="button" aria-label="Edit label: ' + esc(it.label) + '"' : '';
    const eipD = edit ? ' data-edit="dates" data-line="' + it.srcLine + '" data-raw="' + esc(it.rawDates) +
      '" tabindex="0" role="button" aria-label="Edit dates: ' + esc(it.label) + '"' : '';
    s.push('<text' + eipL + ae + ' x="' + labelX.toFixed(1) + '" y="' + (y - 2 * S).toFixed(1) +
      '" font-size="' + T.labelSize * S + '" font-weight="600" fill="' + C.ink + '">' + esc(it.label) +
      (it.single && it.status !== 'done'
        ? ' <tspan font-weight="400" fill="' + C.muted + '">±?</tspan>' : '') + '</text>');
    const sub = subOf(it);
    s.push('<text' + eipD + ae + ' x="' + labelX.toFixed(1) + '" y="' + (y + 10.5 * S).toFixed(1) +
      '" font-size="' + T.noteSize * S + '" fill="' + C.muted + '">' + esc(sub) + '</text>');
    if(edit){
      // when flipped the × goes BEFORE the sub, end-anchored (start-anchored clears it by ~1px only)
      const rmX = it._anchorEnd ? labelX - measure(sub, noteFont) - 8 * S : labelX + measure(sub, noteFont) + 8 * S;
      s.push('<text data-edit="removeitem" data-line="' + it.srcLine + '" data-raw="" tabindex="0" role="button"' +
        ' aria-label="Remove ' + esc(it.label) + '"' + ae + ' x="' + rmX.toFixed(1) +
        '" y="' + (y + 10.5 * S).toFixed(1) + '" font-size="' + T.noteSize * S +
        '" fill="' + C.muted + '">×</text>');
    }
    if(ghost && ghost.slipDays){
      /* over the trail, left of the diamond — never collides with the label */
      s.push(txt(x50 - (r + 6) * S, y - 4 * S, (ghost.slipDays > 0 ? '+' : '−') + wk(ghost.slipDays), 10 * S,
        ghost.slipDays > 0 ? C.err : C.status.done, {weight: 700, anchor: 'end'}));
    }
    if(diff && diff.newKeys.has(k)){
      const newX = it._anchorEnd ? labelX - measure(it.label, labelFont) - 8 * S : labelX + measure(it.label, labelFont) + 8 * S;
      s.push(txt(newX, y - 2 * S, 'NEW', 8.5 * S, C.accent,
        {weight: 600, tracking: 0.6, anchor: it._anchorEnd ? 'end' : undefined}));
    }
  }

  /* readout: one quotable line */
  const readoutLine = timelineReadout(model, today);
  const bits = readoutLine ? [readoutLine] : [];
  if(edit){
    s.push('<text data-edit="additem" data-line="-1" data-raw="" tabindex="0" role="button" aria-label="Add milestone"' +
      ' x="' + (W - T.pad * S) + '" y="' + readoutY + '" text-anchor="end" font-size="' +
      (T.labelSize * S) + '" fill="' + C.muted + '">＋ Add milestone</text>');
  }
  if(!bare && bits.length){
    s.push('<text x="' + T.pad * S + '" y="' + readoutY + '" font-family="' + F.serif +
      '" font-size="' + T.readoutSize * S + '" font-weight="600" fill="' + C.ink + '">' +
      esc(bits.join('  ')) + '</text>');
  }
  if(diff && diff.dropped.length){
    let dy = readoutY + 22 * S;
    s.push(txt(T.pad * S, dy, 'DROPPED SINCE ' + diff.since.toUpperCase(), T.droppedSize * S - 1, C.muted,
      {weight: 600, tracking: 1}));
    for(const label of diff.dropped){
      dy += 15 * S;
      s.push('<text x="' + T.pad * S + '" y="' + dy.toFixed(1) + '" font-size="' + T.droppedSize * S +
        '" fill="' + C.muted + '" text-decoration="line-through">' + esc(label) + '</text>');
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + F.body + '">' + s.join('') + '</svg>';
}

export function toMarkdown(model, diff, url){
  const lines = ['**' + (model.title || 'Milestone timeline') + '**', ''];
  if(diff) lines.push(diff.sinceLine, '');
  lines.push('| Milestone | Lane | P50 | P90 | |');
  lines.push('|---|---|---|---|---|');
  for(const it of model.items){
    lines.push('| ' + it.label + ' | ' + (it.lane || '—') + ' | ' + fmtDay(it.p50) + ' | ' +
      (it.single ? (it.status === 'done' ? 'done' : 'no range') : fmtDay(it.p90)) + ' | ' +
      (it.status || '') + ' |');
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
