/* /timeline model → deck-ready SVG. Pure: colours/measure from ctx; `today`
   comes from model.today ?? ctx.today so goldens stay deterministic. The
   uncertainty IS the picture: solid diamond at P50, whisker to an open diamond
   at P90 — no bar edges pretending to be commitments. */
import {PALETTES, scheme} from '../assets/series.js';
import {esc, txt, tint, wrapText} from '../assets/svg.js';
import {fmtDay, STATUSES} from './parse.js';
import {mergeBias} from './mergebias.js';

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

/* the whisker band fill. Light: the shared 12% capsule tint (unchanged). Dark:
   a stronger tint of the milestone colour over the lane card — 12% vanishes on
   #1B242C (band-vs-card contrast 1.17); 0x47 (~28%) lifts it to ~1.47 while the
   in-band ink title (7.4:1) and muted sub (~3.5:1) stay legible in both themes.
   Non-6-digit colours fall back to the 'none' stroke, exactly as tint() does. */
export function whiskerFill(col, dark){
  if(!dark) return tint(col);
  return /^#[0-9a-fA-F]{6}$/.test(col) ? col + '47' : tint(col);
}

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
/* the "Next up / Widest whisker" operational bits (the pre-merge readout) */
function restBits(model, today){
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

/* the merge-bias verdict copy — full (DOM / poster hero, wraps) + short (in-chart). */
function mergeCopy(mb){
  const pc = p => Math.round(p * 100) + '%';
  const later = mb.d80 - mb.byDate;
  const laterStr = later < 7 ? Math.round(later) + (Math.round(later) === 1 ? ' day' : ' days') : wk(later);
  const tail = mb.excludedSingle ? ' · ' + mb.excludedSingle + ' single-date lane' + (mb.excludedSingle > 1 ? 's' : '') + ' not counted' : '';
  const full = 'Merge risk: ' + mb.rangedLanes + ' ranged lanes must all land by ' + fmtDay(mb.byDate) +
    ' — even the last is a coin flip, so together ' + pc(mb.pAll) + '. For 80% joint confidence, promise ' +
    fmtDay(mb.d80) + ' (+' + laterStr + '). A planning estimate: correlated lanes beat it, fat late tails undercut it.' + tail;
  const short = 'Merge risk: all ' + mb.rangedLanes + ' lanes by ' + fmtDay(mb.byDate) + ' ≈ ' + pc(mb.pAll) +
    ' — 80% needs ' + fmtDay(mb.d80) + ' (+' + laterStr + ').';
  return {full, short};
}

/* plain-text mirror of the SVG readout (the DOM #verdict) — merge leads when present */
export function timelineReadout(model, today){
  const mb = mergeBias(model, today);
  return [mb ? mergeCopy(mb).full : null, restBits(model, today)].filter(Boolean).join('  ');
}

/* the poster hero: the merge sentence alone when present (else the operational readout) */
export function posterVerdict(model, today){
  const mb = mergeBias(model, today);
  return mb ? mergeCopy(mb).full : restBits(model, today);
}

/* Narrow (phone) relayout: lane sections stack top-to-bottom; each milestone is a
   full-width ROW — a wrapped bold title + a muted dates/note line, then its whisker
   on a SHARED time axis so equal date-ranges get equal pixel widths ("widest
   whisker" reads the same as on desktop). One month-tick scale header at the top
   (labels placed greedily, never off-canvas-left and never under the TODAY flag);
   TODAY a dashed rule through every row. Preview-only (exports never set ctx.width);
   inline edits are gated OUT (below 44px — edit via the DSL editor) but compare
   (ghosts/slips/since/NEW/dropped) stays. Self-contained early-return, mirroring
   roadmap/wardley's renderNarrow. S is always 1 here — narrow never scales, so
   radii and spacings are plain constants; the backdrop is prepended once at the
   end (single-pass height, no string surgery). */
function renderNarrow(model, ctx, C, today, diff){
  const {measure} = ctx;
  const dark = !!ctx.dark;
  const items = model.items;
  const W = ctx.width;
  const PAD = 16, msR = 5;
  const sinceH = diff ? 16 : 0;
  const AXIS = 26 + sinceH;                          // header: since-row (compare) + tick/flag band
  const LANEHDR = 22, LANEGAP = 8;
  const TITLE_LH = 17, DATES_LH = 15, TRACK = 22, ROWGAP = 14, TOPPAD = 8, BOTPAD = 14;
  const titleFont = '600 12.5px ' + F.body, noteFont = '10.5px ' + F.body;
  const colorOf = it => it.status === 'done' ? C.status.done : it.status === 'risk' ? C.err : C.accent;

  /* shared time axis — the exact wide-path domain */
  const lo0 = Math.min(...items.map(i => i.p50), today);
  const hi0 = Math.max(...items.map(i => i.p90), today);
  const ghostDays = diff ? [...diff.byKey.values()].map(g => g.oldP50) : [];
  const lo1 = Math.min(lo0, ...ghostDays), hi1 = Math.max(hi0, ...ghostDays);
  const padD = Math.max(14, Math.round((hi1 - lo1) * 0.05));
  const lo = lo1 - padD, hi = hi1 + padD;
  const plotX = PAD, plotW = W - PAD * 2;
  const X = day => plotX + (day - lo) / (hi - lo) * plotW;

  /* pass 1 — lay out lanes/rows, recording each block's top */
  const laid = [];
  let y = AXIS + TOPPAD;
  for(const lane of model.lanes){
    if(lane){ y += LANEGAP; laid.push({header: lane, top: y}); y += LANEHDR; }
    for(const it of items.filter(i => i.lane === lane).sort((a, b) => a.p50 - b.p50)){
      const titleLines = wrapText(it.label + (it.single && it.status !== 'done' ? ' ±?' : ''),
        titleFont, plotW, measure);
      laid.push({it, titleLines, top: y});
      y += titleLines.length * TITLE_LH + DATES_LH + TRACK + ROWGAP;
    }
  }
  const contentBottom = y - ROWGAP;                  // strip the trailing gap (BOTPAD added once at H)

  const nextUp = items.filter(i => i.status !== 'done' && i.p50 >= today).sort((a, b) => a.p50 - b.p50)[0] || items[0];
  const s = [];

  /* TODAY flag rect computed first so the tick labels can dodge it (Fable M6) */
  const todayVisible = today >= lo && today <= hi;
  let flagL = Infinity, flagR = -Infinity;
  if(todayVisible){
    const x = X(today);
    const pw = measure('TODAY', '700 8px ' + F.body) + 10;
    flagL = (x + pw > W - 2) ? x - pw : x; flagR = flagL + pw;
  }

  /* month labels at the TOP only — the gridlines + the TODAY rule live INSIDE each
     whisker track below, so no vertical scale line ever crosses a milestone's
     left-aligned label text. Labels are COMPACT ("Aug", not "Aug 2026") so the phone
     header reads as a real scale — the year rides along only at year-turns and on the
     first label shown. Greedy: never off-canvas-left, never colliding, never under
     the TODAY flag. */
  const tickX = ticks(lo, hi).map(tk => ({x: X(tk.day), label: tk.label}));
  const compact = (label, first) => {                 // "Aug 2026"→"Aug"; year at Jan/Q1 or the first shown
    const sp = label.indexOf(' ');
    const head = sp < 0 ? label : label.slice(0, sp);
    return (first || head === 'Jan' || head === 'Q1') && sp >= 0 ? head + " '" + label.slice(-2) : head;
  };
  let lastLabelR = -1e9, firstLabel = true;
  for(const tk of tickX){
    const lab = compact(tk.label, firstLabel);
    const lw = measure(lab, '10px ' + F.body), l = tk.x - lw / 2, r = tk.x + lw / 2;
    const underFlag = todayVisible && r >= flagL - 3 && l <= flagR + 3;
    if(l >= 2 && r <= W - 2 && l >= lastLabelR + 6 && !underFlag){
      s.push(txt(tk.x, AXIS - 9, lab, 10, C.muted, {anchor: 'middle'}));
      lastLabelR = r; firstLabel = false;
    }
  }

  /* the TODAY flag caps the scale header; the dashed rule is drawn per-track below */
  if(todayVisible){
    s.push('<rect x="' + flagL.toFixed(1) + '" y="' + (sinceH + 1) + '" width="' + (flagR - flagL).toFixed(1) +
      '" height="14" rx="3" fill="' + C.ink + '"/>');
    s.push(txt((flagL + flagR) / 2, sinceH + 11, 'TODAY', 8, C.bg, {anchor: 'middle', weight: 700, tracking: 0.6}));
  }

  /* since-line (compare): its OWN top row, left-aligned (Fable I4) */
  if(diff){
    const sl = wrapText(diff.sinceLine, noteFont, plotW, measure);
    s.push(txt(PAD, 11, sl[0] + (sl.length > 1 ? '…' : ''), 10, C.accent, {weight: 600}));
  }
  const todayX = todayVisible ? X(today) : null;

  const diamond = (cx, cy, r, fill, stroke, extra = '') =>
    '<path' + extra + ' d="M' + cx.toFixed(1) + ' ' + (cy - r).toFixed(1) + ' L' + (cx + r).toFixed(1) +
    ' ' + cy.toFixed(1) + ' L' + cx.toFixed(1) + ' ' + (cy + r).toFixed(1) + ' L' + (cx - r).toFixed(1) +
    ' ' + cy.toFixed(1) + ' Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/>';

  /* pass 2 — lane headers + milestone rows (labels sit on the plain bg above each
     track; every scale line is confined to the track band, so nothing crosses text) */
  for(const row of laid){
    if(row.header){
      s.push(txt(PAD, row.top + 15, row.header.toUpperCase(), 10.5, C.muted, {weight: 600, tracking: 1}));
      continue;
    }
    const {it, titleLines, top} = row;
    const col = colorOf(it), k = keyOf(it);
    const ty = top + 13;
    titleLines.forEach((ln, i) => {
      s.push(txt(PAD, ty + i * TITLE_LH, ln, 12.5, C.ink, {weight: 600}));
    });
    const titleBottom = ty + (titleLines.length - 1) * TITLE_LH;
    if(diff && diff.newKeys.has(k))
      s.push(txt(Math.min(PAD + measure(titleLines[titleLines.length - 1], titleFont) + 8, W - PAD - 24),
        titleBottom, 'NEW', 8.5, C.accent, {weight: 600, tracking: 0.6}));   // clamp so it never clips off-canvas
    const subLines = wrapText(subOf(it), noteFont, plotW, measure);
    s.push(txt(PAD, titleBottom + DATES_LH, subLines[0] + (subLines.length > 1 ? '…' : ''), 10.5, C.muted));

    /* the whisker track: a faint C.card band (so the whisker tint composites over
       C.card exactly as Ship 1 validated), with the month gridlines + the TODAY rule
       drawn INSIDE it — never across the label text above */
    const cy = titleBottom + DATES_LH + 4 + TRACK / 2, tTop = cy - TRACK / 2, tBot = cy + TRACK / 2;
    const x50 = X(it.p50), x90 = X(it.p90);
    s.push('<rect x="' + plotX + '" y="' + tTop.toFixed(1) + '" width="' + plotW + '" height="' + TRACK +
      '" rx="6" fill="' + C.card + '" stroke="' + C.border + '"/>');
    for(const tk of tickX){
      if(tk.x < plotX || tk.x > plotX + plotW) continue;
      s.push('<line x1="' + tk.x.toFixed(1) + '" y1="' + tTop.toFixed(1) + '" x2="' + tk.x.toFixed(1) +
        '" y2="' + tBot.toFixed(1) + '" stroke="' + C.border + '" stroke-width="1" opacity="0.55"/>');
    }
    if(todayX !== null)
      s.push('<line data-today="" x1="' + todayX.toFixed(1) + '" y1="' + tTop.toFixed(1) + '" x2="' +
        todayX.toFixed(1) + '" y2="' + tBot.toFixed(1) + '" stroke="' + C.ink +
        '" stroke-width="1.5" stroke-dasharray="4 3"/>');

    const ghost = diff && diff.byKey.get(k);
    if(ghost && ghost.oldP50 !== it.p50){
      const gx = X(ghost.oldP50);
      s.push('<line x1="' + gx.toFixed(1) + '" y1="' + cy.toFixed(1) + '" x2="' + x50.toFixed(1) + '" y2="' +
        cy.toFixed(1) + '" stroke="' + C.muted + '" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/>');
      s.push(diamond(gx, cy, msR * 0.85, 'none', C.muted, ' data-ms="ghost" stroke-dasharray="2 2"'));
    }
    if(!it.single && x90 - x50 > 1){
      const bh = 12;
      s.push('<rect data-ms="whisker" x="' + x50.toFixed(1) + '" y="' + (cy - bh / 2).toFixed(1) + '" width="' +
        (x90 - x50).toFixed(1) + '" height="' + bh + '" rx="' + (bh / 2) + '" fill="' + whiskerFill(col, dark) + '"/>');
      s.push(diamond(x90, cy, msR * 0.8, C.card, col, ' data-ms="p90"'));
    }
    s.push(diamond(x50, cy, msR, col, C.card, ' data-ms="p50" data-mskey="' + esc(k) + '"' +
      (it === nextUp ? ' data-next=""' : '')));
    if(ghost && ghost.slipDays)
      s.push(txt(x50 + msR + 4, cy - 4, (ghost.slipDays > 0 ? '+' : '−') + wk(ghost.slipDays), 9.5,
        ghost.slipDays > 0 ? C.err : C.status.done, {weight: 700, halo: C.card}));   // baseline inside the band
  }

  /* dropped list (compare) at the foot */
  let dy = contentBottom;
  if(diff && diff.dropped.length){
    dy += 14;
    s.push(txt(PAD, dy, 'DROPPED SINCE ' + diff.since.toUpperCase(), 10, C.muted, {weight: 600, tracking: 1}));
    for(const label of diff.dropped){ dy += 14; s.push(txt(PAD, dy, label, 10.5, C.muted, {strike: true})); }
  }
  const H = Math.round(dy + BOTPAD);
  return '<svg xmlns="http://www.w3.org/2000/svg" data-narrow="" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + F.body + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>' + s.join('') + '</svg>';
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

  /* narrow (phone) relayout — preview-only early return; exports never set width */
  const NARROW = 520;
  if(ctx.width && ctx.width < NARROW && items.length) return renderNarrow(model, ctx, C, today, diff);

  /* readout rows computed up front (H depends on the count): the merge-bias
     short line leads when applicable, then the operational bits. Non-merge
     models keep exactly one row ⇒ byte-identical to before. */
  const mb = mergeBias(model, today);
  const rowH = 22 * S;
  const readoutRows = [];
  { const rest = restBits(model, today);
    if(mb) readoutRows.push(mergeCopy(mb).short);
    if(rest) readoutRows.push(rest); }
  const readoutExtra = Math.max(0, readoutRows.length - 1) * rowH;

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
     Both the row-fit rightX AND the per-lane laneMaxRightX (which anchors the
     edit-mode add zone) derive from msLabelAnchor's CHOSEN label block — right-of-
     P50, right-of-P90, or the left-flip — so packing, the add zone and the drawn
     label always agree. A flip-left label reaches LEFT of its P50 diamond, so its
     startX opens a NEW row instead of splicing the previous milestone's P90. */
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
  const H = Math.round((bare ? plotBottom : readoutY + 24 * S + readoutExtra) + droppedH + T.pad * S);

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

  // the coarse-pointer pan target (app.js) and the "Next up" the readout names:
  // earliest not-done milestone at/after today, else the first milestone. Chosen
  // once, stamped by object identity (a duplicate lane|label key must not mark two).
  const nextUp = items.filter(i => i.status !== 'done' && i.p50 >= today).sort((a, b) => a.p50 - b.p50)[0] || items[0];
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
        '" fill="' + whiskerFill(col, dark) + '"/>');
      s.push(diamond(x90, y, r * 0.8, C.card, col, ' data-ms="p90"'));
    }
    s.push(diamond(x50, y, r, col, C.card, ' data-ms="p50" data-mskey="' + esc(k) + '"' +
      (it === nextUp ? ' data-next=""' : '') +
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

  /* readout: the merge line (when applicable) then the operational bits, one
     <text> per row so the long merge sentence never clips the SVG width */
  if(edit){
    s.push('<text data-edit="additem" data-line="-1" data-raw="" tabindex="0" role="button" aria-label="Add milestone"' +
      ' x="' + (W - T.pad * S) + '" y="' + readoutY + '" text-anchor="end" font-size="' +
      (T.labelSize * S) + '" fill="' + C.muted + '">＋ Add milestone</text>');
  }
  if(!bare){
    readoutRows.forEach((row, i) => {
      s.push('<text x="' + T.pad * S + '" y="' + (readoutY + i * rowH) + '" font-family="' + F.serif +
        '" font-size="' + T.readoutSize * S + '" font-weight="600" fill="' + C.ink + '">' +
        esc(row) + '</text>');
    });
  }
  if(diff && diff.dropped.length){
    let dy = readoutY + 22 * S + readoutExtra;
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
