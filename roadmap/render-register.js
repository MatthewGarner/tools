/* The register composition: a formal table. TWO paint passes over one shared
   model (deck-parts.js) — the DECK export (fixed 1920 frame, byte-identical to
   what shipped) and the LIVE editable view (Task 4). Named render-*.js so
   renderer-coverage forces the live renderer into the injection corpus. */
import {txt, wrapText, esc, btnAttrs} from '../assets/svg.js';
import {rect, line, clip1, wrapN, capsule, statusCapsule, badgeCapsule, italTxt, serifGroup,
  registerColumns, registerColumnsLive, registerRows, spanRange, SANS, SERIF, REGISTER_GEOM, capFit, standfirst, storyLine,
  basisBand, basisDesc} from './deck-parts.js';
import {deckFrame, paletteColors, deckMetrics} from './render-deck.js';
import {anyBet, cardTag, tagColors, stateOpacity, previewableBet, whatifHitRect, condCountLabel,
  registerOutcomeGroups, outcomeSectionTint} from './cond-parts.js';
import {activeCount, condCount} from './parse.js';

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
    const hasBets = anyBet(model);
    /* S4 (E10): `group: outcome` is a REGROUPING lens — the deck export
       reorders the same rows into sections (either way / per-open-bet pays
       off/doesn't / cycle / not needed) and each section header PARTICIPATES
       in capFit as a row of its own (a header stranded with none of its
       members below it would be worse than not showing the section at all).
       Lane mode (the default) is entirely untouched below — `entries` is
       just `rows` wrapped one level, so the byte-identity gate holds. */
    const outcomeMode = model.group === 'outcome';
    const entries = outcomeMode
      ? registerOutcomeGroups(model, rows).flatMap(g =>
          [{header: {label: g.label, kind: g.kind, count: g.items.length}}, ...g.items.map(it => ({it}))])
      : rows.map(it => ({it}));
    const HEADER_H = 30;
    const layout = noteMax => entries.map((e, i) => {
      if(e.header) return {header: e.header, h: HEADER_H};
      const it = e.it;
      const b = it.worldState === 'dropped' ? null : badgeOf(it);   // diff badges suppressed on dropped items
      const tag = hasBets ? cardTag(model, it) : null;
      /* the horizon cell is ditto-suppressed within a LANE-mode group only —
         outcome mode's groups are by bet-outcome, not by horizon, so every
         row prints its own horizon (S4 spec: "horizon prints on every row"). */
      const groupFirst = outcomeMode || i === 0 || !entries[i - 1].it || entries[i - 1].it.h !== it.h;
      const range = hCol ? spanRange(model, it) : null;
      const printH = groupFirst || !!range;
      const newCapW = b && b.kind === 'new' ? capsuleW(b.label.toUpperCase()) + 10 : 0;
      const tl = wrapN(it.title, titleFont, itemCol.w - RPAD * 2 - newCapW, 2, measure);
      const nl = noteCol && it.note ? wrapN(it.note, noteFont, noteCol.w - RPAD * 2, noteMax, measure) : [];
      const hLines = [];
      if(hCol && printH) hLines.push(range || model.horizons[it.h]);
      if(hCol && b && b.kind === 'moved') hLines.push(b.label);
      const itemH = tl.length * 19 + (tag ? 22 : 0);   // the tag stacks UNDER the title, in the item column only
      const contentH = Math.max(itemH, nl.length * 17, hLines.length * 17,
        (stCol && it.status) ? 22 : 0, 17);
      return {it, b, tag, tl, nl, hLines, printH, h: RPAD * 2 + contentH};
    });
    let laidRows = layout(2);
    const sumH = list => list.reduce((a, r) => a + r.h, 0);
    if(sumH(laidRows) > liveBudget) laidRows = layout(1);
    const shown = capFit(laidRows.map(r => r.h), liveBudget, 0, 30);

    let ry = y0 + headH;
    for(const r of laidRows.slice(0, shown)){
      if(r.header){
        const [tint, ink] = outcomeSectionTint(r.header.kind, C);
        s.push(line(REGISTER_GEOM.M, ry, REGISTER_GEOM.W - REGISTER_GEOM.M, ry, tint, 2));
        s.push(txt(REGISTER_GEOM.M, ry + 20, r.header.label.toUpperCase() + ' — ' + r.header.count, 11, ink, {weight: 700, tracking: 1.6}));
        ry += r.h;
        continue;
      }
      const {it, b, tag, tl, nl, hLines} = r;
      const rowSvg = [];
      // Status stays supporting detail: a local edge plus its existing capsule,
      // never a content-height RAG row field.
      const statusEdge = it.worldState === 'dropped' ? null :
        (it.status === 'blocked' || it.status === 'risk' ? C.status[it.status] : null);
      if(statusEdge) rowSvg.push(rect(REGISTER_GEOM.M, ry, 3, r.h, statusEdge));
      let ty = ry + RPAD + 13;
      tl.forEach((ln, li) => {
        rowSvg.push(txt(itemCol.x + RPAD, ty, ln, 15, C.ink, {weight: 700}));
        if(li === 0 && b && b.kind === 'new'){
          const lw = measure(ln, titleFont);
          rowSvg.push(badgeCapsule(itemCol.x + RPAD + lw + 10, ty - 15, b, C, measure).svg);
        }
        ty += 19;
      });
      if(tag){
        const [tcol, tink] = tagColors(tag, C);
        rowSvg.push(capsule(itemCol.x + RPAD, ty - 13, tag.label, tcol, tink, measure).svg);
      }
      if(laneCol && it.lane)
        rowSvg.push(txt(laneCol.x + RPAD, ry + RPAD + 13, clip1(it.lane, secFont, laneCol.w - RPAD * 2, measure), 13, C.muted));
      if(hCol){
        let hy = ry + RPAD + 13;
        hLines.forEach((ln, li) => {
          if(li === 0 && r.printH) rowSvg.push(txt(hCol.x + RPAD, hy, ln, 13, C.ink, {weight: 700}));
          else rowSvg.push(italTxt(hCol.x + RPAD, hy, ln, 12.5, C.muted));
          hy += 17;
        });
      }
      if(stCol && it.status)
        rowSvg.push(statusCapsule(stCol.x + RPAD, ry + (r.h - 22) / 2, it.status, C, measure).svg);
      if(noteCol && nl.length){
        let ny = ry + RPAD + 13;
        for(const ln of nl){ rowSvg.push(txt(noteCol.x + RPAD, ny, ln, 13, C.muted)); ny += 17; }
      }
      const op = stateOpacity(it, 1);   // 1 for a plain row — no wrapper group, byte-identical
      s.push(op < 1 ? '<g opacity="' + op.toFixed(2) + '">' + rowSvg.join('') + '</g>' : rowSvg.join(''));
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
  const {measure, diff = null, edit = false, textBets, coarse} = ctx;
  const M = 24, W = LIVE_W, INNER = W - M * 2, RPAD = 12;
  const cols = colsAt(model, M, INNER);
  const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;
  const rows = registerRows(model);
  const byH = h => rows.filter(r => r.h === h);
  const hasBets = anyBet(model);   // hoisted (F6) — was recomputed per row

  const s = [];
  let y = 34;
  /* --- light frame: title, date, and (below the table) the metrics line --- */
  s.push(serifGroup(txt(M, y, model.title || 'Roadmap', 22, C.ink, {weight: 700})));
  /* ctx.today guarded to string-only, as render-board/render-focus already do: a
     numeric ctx.today reaches esc() and throws. Register was the one artefact
     missing the guard — found 2026-07-31 when the new headline/story injection
     case first rendered this frame with the shared numeric-today test ctx. */
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || (typeof ctx.today === 'string' ? ctx.today : ''));
  if(dateLabel) s.push(txt(W - M, y, dateLabel, 12, C.muted, {anchor: 'end'}));
  y += 24;
  const basis = basisBand(model, M, y, W - M * 2, measure, C);
  if(basis.height){ s.push(basis.svg); y += basis.height; }
  const sfR = standfirst(model, M, y, W - M * 2, measure, C, !!ctx.edit);   // the authored standfirst
  if(sfR.height){ s.push(sfR.svg); y += sfR.height; }
  const sfRStory = storyLine(model, diff, M, y, W - M * 2, measure, C, !!ctx.edit);   // the diff narrative
  if(sfRStory.height){ s.push(sfRStory.svg); y += sfRStory.height; }

  /* --- column header row --- */
  const headY = y;
  for(const c of cols) s.push(txt(c.x + RPAD, headY + 18, c.label, 12, C.muted, {weight: 700, tracking: 1.4}));
  s.push(line(M, headY + 28, W - M, headY + 28, C.border, 1.5));
  y = headY + 34;

  /* S4 (E10): `group: outcome` swaps the per-horizon grouping for outcome
     sections — a GROUPING LENS only. No data-hdrop drop bands, no "+ ADD"
     rows (the editing affordances those exist for are about MOVING an item
     between horizons, a lane-mode concept; card EIP — title/status/note/
     lane/menu — is untouched, since paintRow itself doesn't change). */
  if(model.group === 'outcome'){
    for(const g of registerOutcomeGroups(model, rows)){
      const [tint, ink] = outcomeSectionTint(g.kind, C);
      s.push(line(M, y, W - M, y, tint, 2));
      s.push(txt(M, y + 20, g.label.toUpperCase() + ' — ' + g.items.length, 11, ink, {weight: 700, tracking: 1.6}));
      y += 28;
      for(const it of g.items) y += paintRow(s, it, y, {cols, C, measure, RPAD, badgeOf, edit, model, hasBets, textBets, coarse});
      y += 10;
    }
  } else {
    /* --- one GROUP per horizon (every horizon, even empty: it's a drop
       target + +add). The drop band is painted BEFORE the group's rows/+add
       (buffered into groupSvg, pushed after the band) — a fill="transparent"
       rect is a painted hit target, and on top it would sit above the rows
       and swallow every click: cell edits, the row menu, +add, the drag. */
    for(let h = 0; h < model.horizons.length; h++){
      const groupTop = y;
      const groupSvg = [];
      /* E9: a small letterspaced group header naming the horizon + its honest
         F + M conditional split — the register's own no-count gap, closed only
         once a bet exists anywhere in the doc (a bet-free register stays
         byte-identical: no header row, no reserved height). */
      if(hasBets){
        s.push(txt(M, y + 10, model.horizons[h].toUpperCase() + '   ' +
          condCountLabel(activeCount(model, h), condCount(model, h)), 11, C.muted, {weight: 700, tracking: 1.6}));
        y += 20;
      }
      for(const it of byH(h)) y += paintRow(groupSvg, it, y, {cols, C, measure, RPAD, badgeOf, edit, model, hasBets, textBets, coarse});
      if(edit){
        groupSvg.push('<g opacity="0.75"><rect x="' + M + '" y="' + y + '" width="' + INNER + '" height="26" rx="0" fill="none" stroke="' +
          C.border + '" stroke-dasharray="2 3"/>' +
          '<text data-edit="additem" data-lane="" data-col="' + esc(model.horizons[h]) + '" data-line="-1" data-raw="" x="' +
          (M + 12) + '" y="' + (y + 17) + '" font-size="10" font-weight="700" letter-spacing=".08em" fill="' + C.muted + '"' +
          btnAttrs('Add item to ' + model.horizons[h]) + '>＋ ADD TO ' + esc(model.horizons[h].toUpperCase()) + '</text></g>');
        y += 26;
      }
      if(edit) s.push('<rect data-hdrop="' + h + '" x="' + M + '" y="' + groupTop + '" width="' + INNER +
        '" height="' + Math.max(28, y - groupTop) + '" fill="transparent"/>');   // FIRST — under the rows
      s.push(groupSvg.join(''));                                                  // rows + "+add" on top
      y += 10;
    }
  }

  /* --- metrics line (the closest thing roadmap has to a verdict) --- */
  s.push(line(M, y + 4, W - M, y + 4, C.border));
  s.push(txt(M, y + 24, deckMetrics(model), 13, C.muted, {weight: 600}));
  const H = y + 40;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Math.round(H) +
    '" viewBox="0 0 ' + W + ' ' + Math.round(H) + '" font-family=\'' + SANS + '\'>' +
    basisDesc(model) + '<rect width="' + W + '" height="' + Math.round(H) + '" fill="' + C.bg + '"/>' + s.join('') + '</svg>';
}

/* Paint ONE row into `s` (the caller's buffer — the per-horizon group array,
   NOT the top-level svg parts, so A2's band-under-rows ordering holds);
   returns its height. Mirrors registerBodyFn's per-row paint, plus the edit
   markup: a wrapping <g data-edit="cardmenu" data-menu> with a11y label, a
   full-row data-hit rect, and per-cell data-edit text (empty data-raw where
   a field is absent, so it can be ADDED — every editable target, empty or
   not, also carries an aria-label per the a11y batch). */
function paintRow(s, it, ry, {cols, C, measure, RPAD, badgeOf, edit, model, hasBets, textBets, coarse}){
  const col = k => cols.find(c => c.key === k);
  const itemCol = col('item'), laneCol = col('lane'), hCol = col('horizon'), stCol = col('status'), noteCol = col('note');
  const titleFont = '700 15px ' + SANS, secFont = '13px ' + SANS, noteFont = '13px ' + SANS;
  const b = it.worldState === 'dropped' ? null : badgeOf(it);   // diff badges suppressed on dropped items
  const tag = hasBets ? cardTag(model, it) : null;
  /* The live register is a review surface: its rows grow for the whole source
     title and note instead of silently imposing the deck's two-line limit. */
  const tl = wrapText(it.title, titleFont, itemCol.w - RPAD * 2, measure);
  const nl = noteCol && it.note ? wrapText(it.note, noteFont, noteCol.w - RPAD * 2, measure) : [];
  const itemH = tl.length * 19 + (tag ? 22 : 0);
  const rowH = RPAD * 2 + Math.max(itemH, 17, nl.length * 17, it.status ? 22 : 0);
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const op = stateOpacity(it, 1);   // 1 for a plain row — attribute omitted, byte-identical
  const g = [];
  g.push('<g' + (op < 1 ? ' opacity="' + op.toFixed(2) + '"' : '') +
    (edit ? ' data-edit="cardmenu" data-line="' + it.srcLine + '" data-key="' + esc(key) + '"' +
    btnAttrs('More options: ' + it.title) + ' data-menu=""' : '') + '>');
  // Status stays supporting detail: a local edge plus its existing capsule,
  // never a content-height RAG row field.
  const statusEdge = it.worldState === 'dropped' ? null :
    (it.status === 'blocked' || it.status === 'risk' ? C.status[it.status] : null);
  if(statusEdge) g.push(rect(cols[0].x, ry, 3, rowH, statusEdge));
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
  let whatifRect = null;   // sibling of the row's <g>, pushed to `s` after it closes
  if(tag){
    const [tcol, tink] = tagColors(tag, C);
    const cap = capsule(itemCol.x + RPAD, ty - 13, tag.label, tcol, tink, measure);
    g.push(cap.svg);
    const nameLc = edit ? previewableBet(textBets || model.bets, it) : null;
    if(nameLc) whatifRect = whatifHitRect(nameLc, it.bet.name, itemCol.x + RPAD, ty - 13, cap.w, 22, coarse);
  }
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
  if(whatifRect) s.push(whatifRect);
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
