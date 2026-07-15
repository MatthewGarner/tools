/* The register composition: a formal table. TWO paint passes over one shared
   model (deck-parts.js) — the DECK export (fixed 1920 frame, byte-identical to
   what shipped) and the LIVE editable view (Task 4). Named render-*.js so
   renderer-coverage forces the live renderer into the injection corpus. */
import {txt, wrapText, tint, esc, btnAttrs} from '../assets/svg.js';
import {rect, line, clip1, wrapN, capsule, statusCapsule, badgeCapsule, italTxt, serifGroup,
  registerColumns, registerColumnsLive, registerRows, spanRange, SANS, SERIF, REGISTER_GEOM} from './deck-parts.js';
import {capFit, deckFrame, paletteColors, deckMetrics} from './render-deck.js';

function registerBodyFn(model, ctx, C){
  return (y0, y1) => {
    const {measure, diff = null} = ctx;
    const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;
    const dropped = diff && diff.dropped ? diff.dropped : [];
    const cols = registerColumns(model);
    const col = k => cols.find(c => c.key === k);
    const itemCol = col('item'), laneCol = col('lane'), hCol = col('horizon'),
      stCol = col('status'), noteCol = col('note');
    const RPAD = 12, headH = 40;
    const zoneH = y1 - y0;
    const availH = Math.max(0, zoneH - headH);

    const s = [];
    for(const c of cols)
      s.push(txt(c.x + RPAD, y0 + 24, c.label, 12, C.muted, {weight: 700, tracking: 1.4}));
    s.push(line(REGISTER_GEOM.M, y0 + headH - 6, REGISTER_GEOM.W - REGISTER_GEOM.M, y0 + headH - 6, C.border, 1.5));

    const rows = registerRows(model);
    if(!rows.length && !dropped.length){
      s.push(rect(REGISTER_GEOM.M, y0 + headH + 10, REGISTER_GEOM.INNER, 60, 'none', {rx: 12, stroke: C.border, sw: 1, dash: '4 4'}));
      s.push(txt(REGISTER_GEOM.W / 2, y0 + headH + 46, 'Nothing on the register yet', 14, C.muted, {anchor: 'middle'}));
      return s.join('');
    }

    /* budget: the dropped section (if any) gets up to 30% of the body, never
       crowding the live table out entirely and never itself left unbounded */
    const dRowH = 34, dHeadH = dropped.length ? 28 : 0;
    const dWant = dHeadH + dropped.length * dRowH;
    const dBudget = dropped.length ? Math.min(dWant, Math.max(dHeadH + dRowH, availH * 0.3), availH) : 0;
    const liveBudget = Math.max(0, availH - dBudget);

    const titleFont = '700 15px ' + SANS, secFont = '13px ' + SANS, noteFont = '13px ' + SANS;
    const capsuleW = label => measure(label, '600 12px ' + SANS) + label.length * 0.6 + 18;

    /* the horizon cell is ditto-suppressed within a group — but a SPAN is a
       property of the ITEM, not of the group, so it must print on every
       spanning row, first-in-group or not, or a spanning item that isn't
       first would show no range at all. */
    const layout = noteMax => rows.map((it, i) => {
      const b = badgeOf(it);
      const groupFirst = i === 0 || rows[i - 1].h !== it.h;
      const range = hCol ? spanRange(model, it) : null;
      const printH = groupFirst || !!range;
      const newCapW = b && b.kind === 'new' ? capsuleW(b.label.toUpperCase()) + 10 : 0;
      const tl = wrapN(it.title, titleFont, itemCol.w - RPAD * 2 - newCapW, 2, measure);
      const nl = noteCol && it.note ? wrapN(it.note, noteFont, noteCol.w - RPAD * 2, noteMax, measure) : [];
      const hLines = [];
      if(hCol && printH) hLines.push(range || model.horizons[it.h]);
      if(hCol && b && b.kind === 'moved') hLines.push(b.label);
      const contentH = Math.max(tl.length * 19, nl.length * 17, hLines.length * 17,
        (stCol && it.status) ? 22 : 0, 17);
      return {it, b, tl, nl, hLines, printH, h: RPAD * 2 + contentH};
    });
    let laidRows = layout(2);
    const sumH = list => list.reduce((a, r) => a + r.h, 0);
    if(sumH(laidRows) > liveBudget) laidRows = layout(1);
    const shown = capFit(laidRows.map(r => r.h), liveBudget, 0, 30);

    let ry = y0 + headH;
    for(const r of laidRows.slice(0, shown)){
      const {it, b, tl, nl, hLines} = r;
      const wash = it.status === 'blocked' ? C.status.blocked + '33'
        : it.status === 'risk' ? tint(C.status.risk) : null;
      if(wash) s.push(rect(REGISTER_GEOM.M, ry, REGISTER_GEOM.INNER, r.h, wash));
      let ty = ry + RPAD + 13;
      tl.forEach((ln, li) => {
        s.push(txt(itemCol.x + RPAD, ty, ln, 15, C.ink, {weight: 700}));
        if(li === 0 && b && b.kind === 'new'){
          const lw = measure(ln, titleFont);
          s.push(badgeCapsule(itemCol.x + RPAD + lw + 10, ty - 15, b, C, measure).svg);
        }
        ty += 19;
      });
      if(laneCol && it.lane)
        s.push(txt(laneCol.x + RPAD, ry + RPAD + 13, clip1(it.lane, secFont, laneCol.w - RPAD * 2, measure), 13, C.muted));
      if(hCol){
        let hy = ry + RPAD + 13;
        hLines.forEach((ln, li) => {
          if(li === 0 && r.printH) s.push(txt(hCol.x + RPAD, hy, ln, 13, C.ink, {weight: 700}));
          else s.push(italTxt(hCol.x + RPAD, hy, ln, 12.5, C.muted));
          hy += 17;
        });
      }
      if(stCol && it.status)
        s.push(statusCapsule(stCol.x + RPAD, ry + (r.h - 22) / 2, it.status, C, measure).svg);
      if(noteCol && nl.length){
        let ny = ry + RPAD + 13;
        for(const ln of nl){ s.push(txt(noteCol.x + RPAD, ny, ln, 13, C.muted)); ny += 17; }
      }
      ry += r.h;
      s.push(line(REGISTER_GEOM.M, ry, REGISTER_GEOM.W - REGISTER_GEOM.M, ry, C.border, 1, 0.5));
    }
    if(shown < laidRows.length){
      s.push(rect(REGISTER_GEOM.M, ry, REGISTER_GEOM.INNER, 30, 'none', {rx: 8, stroke: C.border, sw: 1, dash: '4 4'}));
      s.push(txt(REGISTER_GEOM.M + 14, ry + 20, '+ ' + (laidRows.length - shown) + ' more', 13, C.muted, {weight: 600}));
      ry += 30 + 6;
    }

    if(dropped.length){
      ry += 8;
      s.push(txt(REGISTER_GEOM.M, ry + 14, 'DROPPED SINCE ' + (diff.since || '').toUpperCase(), 11, C.muted, {weight: 700, tracking: 1.2}));
      ry += 26;
      const dLabel = 'DROPPED · ' + (diff.since || '');
      const dCapW = capsuleW(dLabel);   // capsule() below draws dLabel as-is (no uppercase), so no uppercase here either
      const dTitleFont = '14px ' + SANS;
      const dTitleMaxW = Math.max(20, REGISTER_GEOM.INNER - 16 - dCapW - 12);
      const dRows = dropped.map(name => ({name, h: dRowH}));
      const room = Math.max(0, y1 - ry);
      const shownD = capFit(dRows.map(r => r.h), room, 0, 30);
      for(const d of dRows.slice(0, shownD)){
        const clipped = clip1(d.name, dTitleFont, dTitleMaxW, measure);
        s.push(txt(REGISTER_GEOM.M + 8, ry + 20, clipped, 14, C.muted, {strike: true}));
        const tw = measure(clipped, dTitleFont);
        s.push(capsule(REGISTER_GEOM.M + 8 + tw + 12, ry + 5, dLabel, C.muted, C.muted, measure).svg);
        ry += dRowH;
      }
      if(shownD < dRows.length)
        s.push(txt(REGISTER_GEOM.M, ry + 16, '+ ' + (dRows.length - shownD) + ' more dropped', 13, C.muted, {weight: 600}));
    }
    return s.join('');
  };
}

export function renderRegisterDeck(model, ctx, C){
  return deckFrame(model, ctx, C, registerBodyFn(model, ctx, C));
}
export function renderRegisterBody(model, ctx, y0, y1){
  return registerBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
}

/* --------------------------------------------------------------------- *
 * LIVE editable table (Task 4). A sibling of the deck paint above,
 * sharing the row/cell MODEL (registerColumns/registerRows/spanRange) but
 * its OWN paint: fixed live width, content-driven height, UNCAPPED rows
 * (never overflow-chipped — it's the editing surface, not a slide), a
 * synthesised group per horizon (even an EMPTY one — it's still a drop
 * target and an "+add" affordance), and edit markup gated on ctx.edit.
 * edit:false must emit ZERO edit markup — that's the export/golden path.
 * -------------------------------------------------------------------- */
const LIVE_W = 1180;   // fixed live artefact width; workspace zoom scales it (house pattern)

/* registerColumnsLive fractions, re-based to the live inner width. */
function colsAt(model, M, INNER){
  const base = registerColumnsLive(model);
  const scale = INNER / REGISTER_GEOM.INNER;
  return base.map(c => ({...c, x: M + (c.x - REGISTER_GEOM.M) * scale, w: c.w * scale}));
}

export function renderRegisterLive(model, ctx){
  const C = paletteColors(model, ctx);
  const {measure, diff = null, edit = false} = ctx;
  const M = 24, W = LIVE_W, INNER = W - M * 2, RPAD = 12;
  const cols = colsAt(model, M, INNER);
  const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;
  const rows = registerRows(model);
  const byH = h => rows.filter(r => r.h === h);

  const s = [];
  let y = 34;
  /* --- light frame: title, date, and (below the table) the metrics line --- */
  s.push(serifGroup(txt(M, y, model.title || 'Roadmap', 22, C.ink, {weight: 700})));
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || ctx.today || '');
  if(dateLabel) s.push(txt(W - M, y, dateLabel, 12, C.muted, {anchor: 'end'}));
  y += 24;

  /* --- column header row --- */
  const headY = y;
  for(const c of cols) s.push(txt(c.x + RPAD, headY + 18, c.label, 12, C.muted, {weight: 700, tracking: 1.4}));
  s.push(line(M, headY + 28, W - M, headY + 28, C.border, 1.5));
  y = headY + 34;

  /* --- one GROUP per horizon (every horizon, even empty: it's a drop
     target + +add). The drop band is painted BEFORE the group's rows/+add
     (buffered into groupSvg, pushed after the band) — a fill="transparent"
     rect is a painted hit target, and on top it would sit above the rows
     and swallow every click: cell edits, the row menu, +add, the drag. */
  for(let h = 0; h < model.horizons.length; h++){
    const groupTop = y;
    const groupSvg = [];
    for(const it of byH(h)) y += paintRow(groupSvg, it, y, {cols, C, measure, RPAD, badgeOf, edit, model});
    if(edit){
      groupSvg.push('<g opacity="0.75"><rect x="' + M + '" y="' + y + '" width="' + INNER + '" height="26" rx="6" fill="none" stroke="' +
        C.border + '" stroke-dasharray="2 3"/>' +
        '<text data-edit="additem" data-lane="" data-col="' + esc(model.horizons[h]) + '" data-line="-1" data-raw="" x="' +
        (M + 12) + '" y="' + (y + 17) + '" font-size="11" font-weight="600" fill="' + C.muted + '"' +
        btnAttrs('Add item to ' + model.horizons[h]) + '>＋ add to ' + esc(model.horizons[h]) + '</text></g>');
      y += 26;
    }
    if(edit) s.push('<rect data-hdrop="' + h + '" x="' + M + '" y="' + groupTop + '" width="' + INNER +
      '" height="' + Math.max(28, y - groupTop) + '" fill="transparent"/>');   // FIRST — under the rows
    s.push(groupSvg.join(''));                                                  // rows + "+add" on top
    y += 10;
  }

  /* --- metrics line (the closest thing roadmap has to a verdict) --- */
  s.push(line(M, y + 4, W - M, y + 4, C.border));
  s.push(txt(M, y + 24, deckMetrics(model), 13, C.muted, {weight: 600}));
  const H = y + 40;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Math.round(H) +
    '" viewBox="0 0 ' + W + ' ' + Math.round(H) + '" font-family=\'' + SANS + '\'>' +
    '<rect width="' + W + '" height="' + Math.round(H) + '" fill="' + C.bg + '"/>' + s.join('') + '</svg>';
}

/* Paint ONE row into `s` (the caller's buffer — the per-horizon group array,
   NOT the top-level svg parts, so A2's band-under-rows ordering holds);
   returns its height. Mirrors registerBodyFn's per-row paint, plus the edit
   markup: a wrapping <g data-edit="cardmenu" data-menu> with a11y label, a
   full-row data-hit rect, and per-cell data-edit text (empty data-raw where
   a field is absent, so it can be ADDED — every editable target, empty or
   not, also carries an aria-label per the a11y batch). */
function paintRow(s, it, ry, {cols, C, measure, RPAD, badgeOf, edit, model}){
  const col = k => cols.find(c => c.key === k);
  const itemCol = col('item'), laneCol = col('lane'), hCol = col('horizon'), stCol = col('status'), noteCol = col('note');
  const titleFont = '700 15px ' + SANS, secFont = '13px ' + SANS, noteFont = '13px ' + SANS;
  const b = badgeOf(it);
  const tl = wrapN(it.title, titleFont, itemCol.w - RPAD * 2, 2, measure);
  const nl = noteCol && it.note ? wrapN(it.note, noteFont, noteCol.w - RPAD * 2, 2, measure) : [];
  const rowH = RPAD * 2 + Math.max(tl.length * 19, 17, nl.length * 17, it.status ? 22 : 0);
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const g = [];
  g.push('<g' + (edit ? ' data-edit="cardmenu" data-line="' + it.srcLine + '" data-key="' + esc(key) + '"' +
    btnAttrs('More options: ' + it.title) + ' data-menu=""' : '') + '>');
  const wash = it.status === 'blocked' ? C.status.blocked + '33' : it.status === 'risk' ? tint(C.status.risk) : null;
  if(wash) g.push(rect(cols[0].x, ry, cols[cols.length - 1].x + cols[cols.length - 1].w - cols[0].x, rowH, wash));
  if(edit) g.push('<rect data-hit="" x="' + cols[0].x + '" y="' + ry + '" width="' +
    (cols[cols.length - 1].x + cols[cols.length - 1].w - cols[0].x) + '" height="' + rowH + '" fill="transparent"/>');
  /* item / title */
  let ty = ry + RPAD + 13;
  tl.forEach((ln, li) => {
    g.push('<text' + (edit && li === 0 ? ' data-edit="title" data-line="' + it.srcLine + '" data-raw="' + esc(it.title) + '"' +
      btnAttrs('Rename: ' + it.title) : '') +
      ' x="' + (itemCol.x + RPAD) + '" y="' + ty + '" font-size="15" font-weight="700" fill="' + C.ink + '">' + esc(ln) + '</text>');
    ty += 19;
  });
  /* lane (edit target even when empty) */
  if(laneCol) g.push(cellText(laneCol, ry + RPAD + 13, it.lane, 'lane', it.srcLine, C.muted, secFont, RPAD, measure, edit,
    '+ lane', 'Edit lane: ' + it.title));
  /* horizon — the span range or the horizon name; move is via the ROW MENU, so no inline target here */
  if(hCol){
    const range = spanRange(model, it);
    g.push(txt(hCol.x + RPAD, ry + RPAD + 13, range || model.horizons[it.h], 13, C.ink, {weight: 700}));
  }
  /* status (edit target even when empty → addStatus) */
  if(stCol){
    if(it.status) g.push(statusWithTarget(stCol, ry + (rowH - 22) / 2, it, RPAD, C, measure, edit));
    else if(edit) g.push('<text data-edit="status" data-line="' + it.srcLine + '" data-raw="" x="' +
      (stCol.x + RPAD) + '" y="' + (ry + RPAD + 13) + '" font-size="13" fill="' + C.muted + '" opacity="0.6"' +
      btnAttrs('Set status') + '>+ status</text>');
  }
  /* note (edit target even when empty → addNote) */
  if(noteCol){
    if(nl.length){
      let ny = ry + RPAD + 13;
      nl.forEach((ln, i) => {
        g.push('<text' + (edit && i === 0 ? ' data-edit="note" data-line="' + it.srcLine + '" data-raw="' + esc(it.note) + '"' +
          btnAttrs('Edit note: ' + it.title) : '') +
          ' x="' + (noteCol.x + RPAD) + '" y="' + ny + '" font-size="13" fill="' + C.muted + '">' + esc(ln) + '</text>');
        ny += 17;
      });
    } else if(edit) g.push('<text data-edit="note" data-line="' + it.srcLine + '" data-raw="" x="' +
      (noteCol.x + RPAD) + '" y="' + (ry + RPAD + 13) + '" font-size="13" fill="' + C.muted + '" opacity="0.6"' +
      btnAttrs('Add note') + '>+ note</text>');
  }
  if(b && b.kind === 'new') g.push(badgeCapsule(itemCol.x + itemCol.w - RPAD - 44, ry + RPAD, b, C, measure).svg);
  g.push(line(cols[0].x, ry + rowH, cols[cols.length - 1].x + cols[cols.length - 1].w, ry + rowH, C.border, 1, 0.5));
  g.push('</g>');
  s.push(g.join(''));
  return rowH;
}

/* A cell that shows `value` (clipped to one line) when present, or an
   "+ addLabel" ghost prompt when absent — either way, in edit mode, a real
   data-edit target with a keyboard/AT-accessible name (A5: not just the
   empty ones). */
function cellText(colObj, y, value, kind, srcLine, fill, font, RPAD, measure, edit, addLabel, editLabel){
  if(value) return '<text' + (edit ? ' data-edit="' + kind + '" data-line="' + srcLine + '" data-raw="' + esc(value) + '"' +
    btnAttrs(editLabel) : '') +
    ' x="' + (colObj.x + RPAD) + '" y="' + y + '" font-size="13" fill="' + fill + '">' +
    esc(clip1(value, font, colObj.w - RPAD * 2, measure)) + '</text>';
  return edit ? '<text data-edit="' + kind + '" data-line="' + srcLine + '" data-raw="" x="' + (colObj.x + RPAD) +
    '" y="' + y + '" font-size="13" fill="' + fill + '" opacity="0.6"' + btnAttrs(addLabel) + '>' + esc(addLabel) + '</text>' : '';
}
function statusWithTarget(colObj, y, it, RPAD, C, measure, edit){
  const cap = statusCapsule(colObj.x + RPAD, y, it.status, C, measure).svg;
  return edit ? '<g data-edit="status" data-line="' + it.srcLine + '" data-raw="' + esc(it.status) + '"' +
    btnAttrs('Change status: ' + it.title) + '>' + cap + '</g>' : cap;
}
