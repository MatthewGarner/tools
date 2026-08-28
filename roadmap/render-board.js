/* The board composition: horizons as columns, first lightly washed in ink,
   lane as a tag (no rail). TWO paint passes over the shared model — the DECK
   export (byte-identical to what shipped) and the LIVE editable view (Task 3).
   Named render-*.js so renderer-coverage forces the live renderer into the
   injection corpus. */
import {txt, esc, btnAttrs, wrapText} from '../assets/svg.js';
import {STATUS_LABEL, activeCount} from './parse.js';
import {rect, line, clip1, wrapN, capFit, capsule, badgeCapsule, serifGroup, standfirst, storyLine, basisBand, basisDesc, SANS} from './deck-parts.js';
import {deckFrame, paletteColors, deckMetrics, W, M} from './render-deck.js';
import {anyBet, cardTag, tagColors, stateOpacity, previewableBet, whatifHitRect, splitColumnZones} from './cond-parts.js';

/* Conditionality is a structural fact, not a second status system.  A quiet
   rule and precise language make the fork legible without competing with the
   one place colour has meaning: a commitment's status. */
function zoneTint(_half, C){
  return [C.border, C.muted];
}
function zoneLabel(bet, half){
  return bet.display + (half === 'if' ? ' · if so' : ' · if not');
}

/* Column type ramp, by width: wider columns get bigger type and room for a
   note; the narrowest ramp (nH ~6-8) drops notes entirely (fsN: 0, notes: 0). */
export function typeRamp(colW){
  return colW >= 500 ? {fsT: 21, fsN: 15, pad: 20, notes: 2}
       : colW >= 380 ? {fsT: 19, fsN: 14, pad: 16, notes: 2}
       : colW >= 300 ? {fsT: 17, fsN: 13, pad: 14, notes: 1}
       : {fsT: 15, fsN: 0, pad: 12, notes: 0};
}

/* Board-wide density check: estimate every column with the SMALLEST clamped
   card height for this ramp — if that estimate would still hide >25% of a
   column's items (after budgeting the "+N more" chip), the WHOLE board flips
   to list rows. A worst-case estimate keeps the decision a single
   deterministic pass, independent of card layout order.
   INNER lives HERE, at call time, not module top level — a TDZ trap under
   the render-deck.js/render-board.js cycle, same shape as REGISTER_GEOM's
   comment in deck-parts.js. */
export function boardGeometry(model, zoneH){
  const nH = model.horizons.length;
  const gap = 28;
  const INNER = W - M * 2;
  const colW = nH > 0 ? (INNER - (nH - 1) * gap) / nH : INNER;
  const ramp = typeRamp(colW);
  const headH = 56;
  const availH = zoneH - headH - 14;
  const minCardH = ramp.pad * 2 + ramp.fsT + 5 + 30;
  const counts = model.horizons.map((_, h) => model.items.filter(i => i.h === h).length);
  const listMode = counts.some(k => {
    if(!k) return false;
    const fitAll = Math.floor((availH + 14) / (minCardH + 14));
    if(k <= fitAll) return false;
    const fitWithChip = Math.floor((availH - 54 + 14) / (minCardH + 14));
    return (k - Math.max(0, fitWithChip)) / k > 0.25;
  });
  return {colW, gap, ramp, headH, availH, minCardH, counts, listMode};
}

/* CARD column: drop-notes -> clamp-title -> cap+chip ladder, capFit sharing
   the same proven-terminating helper the list path uses.

   E1 (S3): the column's flat byLane `list` is re-ordered into live-flow
   first, then each open non-cycle bet's if-so/if-not groups (srcLine
   order) — `splitColumnZones` does the state-keyed membership work; a
   bet-free (or zone-free) column reorders to itself, so `ordered` equals
   `list` and every existing byte-identity golden is untouched. A ZONE
   HEADER's height rides bundled into its group's FIRST card (never a
   separate capFit entry) — that keeps a header and at least one of its
   members atomic, so capFit can never truncate to a bare header with
   nothing shown beneath it. */
function paintCardColumn(list, {cx, cy0, cw, availH, ramp, fadeOp, badgeOf, C, measure, model}){
  const fT = '700 ' + ramp.fsT + 'px ' + SANS, fN = ramp.fsN + 'px ' + SANS;
  const hasBets = anyBet(model);
  /* DECK export always carries the tag, even at the narrowest ramp — an
     export has no card menu to fall back on, and Matt's ruling is exports
     must carry every path (review F4); the height model already budgets
     `tag ? 30 : 0` unconditionally below, so dropping the ramp gate here is
     the whole fix. LIVE narrow columns keep the fade-only degrade — that's
     paintBoardCard, a different function, untouched. */
  const showTag = hasBets;
  const {live, zones} = splitColumnZones(model, list);
  const HEADER_H = 26;
  const headerAt = new Map();   // first item of a zone half -> {label, tint, ink}
  const ordered = [...live];
  for(const {bet, ifItems, unlessItems} of zones){
    if(ifItems.length){
      const [tint, ink] = zoneTint('if', C);
      headerAt.set(ifItems[0], {label: zoneLabel(bet, 'if'), tint, ink});
      ordered.push(...ifItems);
    }
    if(unlessItems.length){
      const [tint, ink] = zoneTint('unless', C);
      headerAt.set(unlessItems[0], {label: zoneLabel(bet, 'unless'), tint, ink});
      ordered.push(...unlessItems);
    }
  }
  const layCards = (noteLines, titleLines) => ordered.map(it => {
    const b = it.worldState === 'dropped' ? null : badgeOf(it);   // diff badges suppressed on dropped items
    const tag = showTag ? cardTag(model, it) : null;
    const tl = wrapN(it.title, fT, cw - ramp.pad * 2, titleLines, measure);
    const nl = it.note && noteLines ? wrapN(it.note, fN, cw - ramp.pad * 2, noteLines, measure) : [];
    const start = model.horizons[it.h] || '';
    const end = it.spanEnd || model.horizons[Math.min(model.horizons.length - 1, it.h + Math.max(1, it.span || 1) - 1)] || start;
    const run = (it.span || 1) > 1 || it.spanEnd ? 'RUNS ' + start.toUpperCase() + ' – ' + end.toUpperCase() : '';
    const detail = [it.lane ? it.lane.toUpperCase() : '', run].filter(Boolean).join(' · ');
    const foot = detail || it.status ? 30 : 6;
    return {it, b, tag, tl, nl, detail,
      h: ramp.pad * 2 + (b ? 30 : 0) + (tag ? 30 : 0) + tl.length * (ramp.fsT + 5) + nl.length * (ramp.fsN + 6) + foot};
  });
  const sumH = cards => cards.reduce((a, c) => a + c.h + (headerAt.has(c.it) ? HEADER_H : 0), 0) +
    Math.max(0, cards.length - 1) * 14;
  let cards = layCards(ramp.notes, 2);
  if(sumH(cards) > availH) cards = layCards(0, 2);          // drop notes
  if(sumH(cards) > availH) cards = layCards(0, 1);          // clamp titles to 1 line
  const heights = cards.map(c => c.h + (headerAt.has(c.it) ? HEADER_H : 0));
  const shown = capFit(heights, availH, 14, 54); // cap + chip

  const s = [];
  let cy = cy0;
  for(let i = 0; i < shown; i++){
    const c = cards[i], {it} = c;
    const header = headerAt.get(it);
    if(header){
      s.push(line(cx, cy + 9, cx + 14, cy + 9, header.tint, 2));
      s.push(txt(cx + 22, cy + 14, header.label, 11, header.ink, {weight: 700, tracking: 0.6}));
      cy += HEADER_H;
    }
    s.push('<g opacity="' + stateOpacity(it, fadeOp).toFixed(2) + '">');
    /* Export shares live Board's commitment-ledger primitive: an open row and
       one closing rule. The horizon owns the whitespace; work does not sit in a
       second matrix of pale card surfaces. */
    let ty = cy + ramp.pad;
    if(c.tag){ const [tcol, tink] = tagColors(c.tag, C); s.push(capsule(cx + ramp.pad, ty - 4, c.tag.label, tcol, tink, measure).svg); ty += 30; }
    if(c.b){ s.push(badgeCapsule(cx + ramp.pad, ty - 4, c.b, C, measure).svg); ty += 30; }
    ty += ramp.fsT - 4;
    for(const ln of c.tl){ s.push(txt(cx + ramp.pad, ty, ln, ramp.fsT, C.ink, {weight: 700})); ty += ramp.fsT + 5; }
    for(const ln of c.nl){ s.push(txt(cx + ramp.pad, ty, ln, ramp.fsN, C.muted)); ty += ramp.fsN + 6; }
    const fy = cy + c.h - ramp.pad - 6;
    if(c.detail) s.push(txt(cx + ramp.pad, fy + 4, c.detail, 10.5, C.muted, {weight: 700, tracking: 1.05}));
    if(it.status){
      s.push(txt(cx + cw - ramp.pad, fy + 4, STATUS_LABEL[it.status].toUpperCase(), 10.5,
        C.statusInk[it.status] || C.status[it.status], {anchor: 'end', weight: 700, tracking: 1.05}));
    }
    s.push('</g>');
    s.push(line(cx, cy + c.h, cx + cw, cy + c.h, C.border, 1, 0.7));
    cy += c.h + 14;
  }
  if(shown < cards.length){
    const hidden = cards.slice(shown);
    const conditional = hidden.filter(c => c.it.worldState === 'cond').length;
    const overflow = '+ ' + hidden.length + ' more' + (conditional ? ' · ' + conditional + ' conditional' : '');
    s.push(rect(cx, cy, cw, 40, 'none', {rx: 0, stroke: C.border, sw: 1, dash: '4 4'}));
    s.push(txt(cx + 18, cy + 26, overflow, 14, C.muted, {weight: 600}));
  }
  return {svg: s.join(''), shown, total: cards.length};
}

/* LIST column (the flipped board): title + a muted LANE · STATUS · note
   sub-line, single line each (clip1, never wraps), fixed row height 38/56 —
   flagged rows carry a 3px status-coloured edge bar, never colour alone.
   capFit-capped with its own "+N more" chip.

   E1 (S3): list mode is the documented zone FALLBACK — it exists precisely
   because a column is too crowded to fit its cards, and interleaving a
   wash+label row into 38/56px dense rows would misread as noise rather than
   structure. Rows stay in flat byLane order here; the cond tag already
   rides the sub-line so the fork is still legible, just not grouped. */
function paintListColumn(list, {cx, cy0, cw, fadeOp, availH, C, measure, model}){
  const hasBets = anyBet(model);
  const rows = list.map(it => {
    const tag = hasBets ? cardTag(model, it) : null;
    /* Dense mode is a compressed ledger, not a different card component: title,
       factual detail, status at the right, then the same closing rule. */
    const end = it.spanEnd || model.horizons[Math.min(model.horizons.length - 1, it.h + Math.max(1, it.span || 1) - 1)] || model.horizons[it.h];
    const run = (it.span || 1) > 1 || it.spanEnd ? 'RUNS ' + model.horizons[it.h].toUpperCase() + ' – ' + end.toUpperCase() : '';
    const sub = [it.lane ? it.lane.toUpperCase() : '', run, tag ? tag.label : '',
      it.note || ''].filter(Boolean).join('  ·  ');
    return {it, sub, status: it.status ? STATUS_LABEL[it.status].toUpperCase() : '', h: sub || it.status ? 56 : 38};
  });
  const shown = capFit(rows.map(r => r.h), availH, 0, 48);

  const s = [];
  let ry = cy0;
  for(const r of rows.slice(0, shown)){
    const {it, sub, status} = r;
    s.push('<g opacity="' + stateOpacity(it, fadeOp).toFixed(2) + '">');
    const statusW = status ? measure(status, '700 10px ' + SANS) + 14 : 0;
    s.push(txt(cx, ry + 18, clip1(it.title, '600 17px ' + SANS, cw - (sub ? 0 : statusW), measure), 17, C.ink, {weight: 600}));
    if(sub) s.push(txt(cx, ry + 38, clip1(sub, '12.5px ' + SANS, cw - statusW, measure), 12.5, C.muted, {tracking: 0.3}));
    if(status) s.push(txt(cx + cw, ry + (sub ? 38 : 18), status, 10,
      C.statusInk[it.status] || C.status[it.status], {anchor:'end', weight:700, tracking:1}));
    s.push('</g>');
    ry += r.h;
    s.push(line(cx, ry - 12, cx + cw, ry - 12, C.border, 1, 0.55));
  }
  if(shown < rows.length){
    const hidden = rows.slice(shown);
    const conditional = hidden.filter(r => r.it.worldState === 'cond').length;
    const overflow = '+ ' + hidden.length + ' more' + (conditional ? ' · ' + conditional + ' conditional' : '');
    s.push(rect(cx, ry, cw, 40, 'none', {rx: 0, stroke: C.border, sw: 1, dash: '4 4'}));
    s.push(txt(cx + 18, ry + 26, overflow, 14, C.muted, {weight: 600}));
  }
  return {svg: s.join(''), shown, total: rows.length};
}

/* BOARD body: horizons as columns (lane rides as a tag, no rail), first
   horizon distinguished in ink, in-plane letterspaced label + count per
   column, certainty fade (gated to model.fade), the overflow ladder above.
   Returns (y0, y1) -> svg so deckFrame can budget the band around a 1- or
   2-line standfirst wrap. */
function boardBodyFn(model, ctx, C){
  return (y0, y1) => {
    const {measure, diff = null} = ctx;
    const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;
    const hs = model.horizons, nH = hs.length;
    const zoneH = y1 - y0;
    const {colW, gap, ramp, headH, availH, listMode} = boardGeometry(model, zoneH);
    const items = model.items;
    const inH = h => items.filter(i => i.h === h);
    const laneRank = new Map(model.lanes.map((l, i) => [l, i]));
    const byLane = arr => [...arr].sort((a, b) =>
      (laneRank.get(a.lane) - laneRank.get(b.lane)) || (a.srcLine - b.srcLine));
    const overWip = model.wip > 0 && activeCount(model, 0) > model.wip;

    const s = [];
    for(let h = 0; h < nH; h++){
      const x = M + h * (colW + gap);
      s.push(txt(x + 20, y0 + 34, hs[h].toUpperCase(), 15, h === 0 ? C.ink : C.muted, {weight: 700, tracking: 1.6}));
      const list = byLane(inH(h));
      /* label shows the ACTIVE count (matching the overWip flag) — dropped
         items are still painted in `list` below, just not counted. */
      const activeH = activeCount(model, h);
      /* A commitment count should be read at a glance. Conditionality is
         already explicit in the grouped ledger below; arithmetic in the
         column head makes the total slower to find. */
      const baseLbl = String(activeH);
      const countLbl = h === 0 && overWip ? baseLbl + ' · OVER WIP' : baseLbl;
      s.push(txt(x + colW - 20, y0 + 34, countLbl, 13, h === 0 && overWip ? C.err : C.muted,
        {anchor: 'end', weight: 700, tracking: 1}));
      /* The Board reads commitment by horizon: ink gives the leading column
         authority, while status colour remains local to the work itself. */
      s.push(line(x, y0 + 46, x + colW, y0 + 46, C.border, 1, 0.9));
      if(h === 0) s.push(line(x, y0 + 46, x + 20, y0 + 46, C.ink, 2));

      const cx = x + 16, cw = colW - 32;
      if(!list.length){
        s.push(txt(cx, y0 + headH + 24, 'Nothing scheduled', 14, C.muted));
        continue;
      }
      const fadeOp = model.fade && nH > 1 ? 1 - (h / (nH - 1)) * 0.35 : 1;
      const r = listMode
        ? paintListColumn(list, {cx, cy0: y0 + headH + 8, cw, fadeOp, availH, C, measure, model})
        : paintCardColumn(list, {cx, cy0: y0 + headH, cw, availH, ramp, fadeOp, badgeOf, C, measure, model});
      s.push(r.svg);
    }
    if(diff && diff.dropped && diff.dropped.length){
      const lbl = 'Dropped since ' + diff.since + ':  ' + diff.dropped.join('  ·  ');
      s.push(txt(W - M, 1036, clip1(lbl, '15px ' + SANS, 760, measure), 15, C.muted, {anchor: 'end', strike: true}));
    }
    return s.join('');
  };
}

export function renderBoardDeck(model, ctx, C){
  return deckFrame(model, ctx, C, boardBodyFn(model, ctx, C));
}

/* Test-only entry point: the board BODY fragment alone (no frame), so the
   overflow-ladder torture tests can bounds-sweep against y1 directly instead
   of excluding the frame's own footer text (legitimately below y=1036). */
export function renderBoardBody(model, ctx, y0, y1){
  return boardBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
}

/* --------------------------------------------------------------------- *
 * LIVE editable board (Task 3). A sibling of the deck paint above: same
 * horizons-as-columns/lane-as-tag composition, but content-width columns,
 * UNCAPPED (no overflow ladder, no list-mode flip — those exist only to fit
 * a fixed slide), content-driven height, and edit markup gated on ctx.edit.
 * edit:false must emit ZERO edit markup — that's the export/golden path.
 * Mirrors render-register.js's renderRegisterLive/paintRow, adapted to
 * columns instead of rows.
 *
 * W is computed INSIDE renderBoardLive from the LOCAL BOARD_LIVE.M (=24),
 * never at module top level: render-board.js imports W/M from
 * render-deck.js across an import cycle, so a module-top const referencing
 * those would throw a TDZ ReferenceError at load. -------------------------------------------------------------------- */
const BOARD_LIVE = {M: 24, COLW: 330, GAP: 24, RPAD: 16, HEADH: 44};

/* Paint ONE card into the group buffer `g` (NOT the top-level parts — the
   drop band must stay under the cards, A2). Returns its height. Emits the
   edit markup (cardmenu <g>, data-hit rect, title/note/lane/status targets)
   only when edit. */
function paintBoardCard(it, x, y, cw, {C, measure, edit, badgeOf, model, hasBets, textBets, coarse}){
  const {RPAD} = BOARD_LIVE;
  const fT = '700 18px ' + SANS, fN = '14px ' + SANS;
  const b = it.worldState === 'dropped' ? null : badgeOf(it);   // diff badges suppressed on dropped items
  const tag = hasBets ? cardTag(model, it) : null;
  /* Live cards are an authoring surface, not a fixed slide: full source text
     wraps and increases the card height rather than becoming an ellipsis. */
  const tl = wrapText(it.title, fT, cw - RPAD * 2, measure);
  const nl = it.note ? wrapText(it.note, fN, cw - RPAD * 2, measure) : [];
  const start = model.horizons[it.h] || '';
  const end = it.spanEnd || model.horizons[Math.min(model.horizons.length - 1, it.h + Math.max(1, it.span || 1) - 1)] || start;
  const run = (it.span || 1) > 1 || it.spanEnd ? 'RUNS ' + start.toUpperCase() + ' – ' + end.toUpperCase() : '';
  const statusW = it.status ? measure(STATUS_LABEL[it.status].toUpperCase(), '700 10.5px ' + SANS) + 14 : 0;
  /* The lane is an authoring field; the run is an inert fact.  Keep them in
     separate lines so an unlaned spanning item never turns its visible run
     into a false "Edit lane" target. */
  const detailW = Math.max(60, cw - RPAD * 2 - statusW);
  const laneLines = it.lane ? wrapText(it.lane.toUpperCase(), '700 10.5px ' + SANS, detailW, measure) : [];
  const runLines = run ? wrapText(run, '700 10.5px ' + SANS, detailW, measure) : [];
  const laneSlots = laneLines.length || (edit ? 1 : 0);
  const detailN = laneSlots + runLines.length;
  const footH = detailN || it.status ? Math.max(1, detailN) * 14 + 8 : 8;
  const noteH = nl.length ? nl.length * 19 + 4 : 0;
  const tagH = tag ? 30 : 0;
  const h = RPAD + tagH + tl.length * 24 + noteH + footH + 12;
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const op = stateOpacity(it, 1);   // 1 for a plain item — no attribute added, byte-identical
  const g = [];
  g.push('<g' + (op < 1 ? ' opacity="' + op.toFixed(2) + '"' : '') +
    (edit ? ' data-edit="cardmenu" data-line="' + it.srcLine + '" data-key="' + esc(key) + '"' +
    btnAttrs('More options: ' + it.title) + ' data-menu=""' : '') + '>');
  /* Board is a commitment ledger, not a rack of cards. A row is defined by
     its factual line and the hairline that closes it; the background remains
     open so the horizon, rather than a component surface, owns the space. */
  let whatifRect = null;   // sibling of the card's <g>, pushed after it closes
  if(tag){
    const [tcol, tink] = tagColors(tag, C);
    const cap = capsule(x + RPAD, y + RPAD - 4, tag.label, tcol, tink, measure);
    g.push(cap.svg);
    const nameLc = edit ? previewableBet(textBets || model.bets, it) : null;
    if(nameLc) whatifRect = whatifHitRect(nameLc, it.bet.name, x + RPAD, y + RPAD - 4, cap.w, 22, coarse);
  }
  if(edit) g.push('<rect data-hit="" x="' + x + '" y="' + y + '" width="' + cw + '" height="' + h + '" fill="transparent"/>');
  let ty = y + RPAD + 14 + tagH;
  tl.forEach((ln, li) => {
    g.push('<text' + (edit && li === 0 ? ' data-edit="title" data-line="' + it.srcLine + '" data-raw="' + esc(it.title) + '"' +
      btnAttrs('Rename: ' + it.title) : '') +
      ' x="' + (x + RPAD) + '" y="' + ty + '" font-size="18" font-weight="700" fill="' + C.ink + '">' + esc(ln) + '</text>');
    ty += 24;
  });
  if(nl.length){ ty += 4; nl.forEach((ln, i) => {
    g.push('<text' + (edit && i === 0 ? ' data-edit="note" data-line="' + it.srcLine + '" data-raw="' + esc(it.note) + '"' +
      btnAttrs('Edit note: ' + it.title) : '') +
      ' x="' + (x + RPAD) + '" y="' + ty + '" font-size="14" fill="' + C.muted + '">' + esc(ln) + '</text>');
    ty += 19;
  }); }
  const fy = y + h - RPAD;
  let detailY = fy - 2 - Math.max(0, detailN - 1) * 14;
  if(laneLines.length){
    laneLines.forEach((lineText, i) => {
      g.push('<text' + (edit && i === 0 ? ' data-edit="lane" data-line="' + it.srcLine + '" data-raw="' + esc(it.lane) + '"' +
        btnAttrs('Edit lane: ' + it.title) : '') + ' x="' + (x + RPAD) + '" y="' + detailY +
        '" font-size="10.5" font-weight="700" letter-spacing="1.05" fill="' + C.muted + '">' + esc(lineText) + '</text>');
      detailY += 14;
    });
  } else if(edit){
    g.push('<text data-empty-control="" data-edit="lane" data-line="' + it.srcLine + '" data-raw="" x="' + (x + RPAD) + '" y="' + detailY +
      '" font-size="10.5" font-weight="700" letter-spacing="1.05" fill="' + C.muted + '" opacity="0"' + btnAttrs('Add lane: ' + it.title) + '>SET LANE</text>');
    detailY += 14;
  }
  runLines.forEach(lineText => {
    g.push('<text x="' + (x + RPAD) + '" y="' + detailY + '" font-size="10.5" font-weight="700" letter-spacing="1.05" fill="' + C.muted + '">' + esc(lineText) + '</text>');
    detailY += 14;
  });
  // Status is text, not another coloured shape. The hue remains reserved for this
  // single semantic fact and spans still stay explicit in the ledger detail.
  if(it.status){
    g.push('<text' + (edit ? ' data-edit="status" data-line="' + it.srcLine + '" data-raw="' + esc(it.status) + '"' +
      btnAttrs('Change status: ' + it.title) : '') + ' x="' + (x + cw - RPAD) + '" y="' + (fy - 2) +
      '" text-anchor="end" font-size="10.5" font-weight="700" letter-spacing="1.05" fill="' + (C.statusInk[it.status] || C.status[it.status]) + '">' +
      esc(STATUS_LABEL[it.status].toUpperCase()) + '</text>');
  } else if(edit){
    g.push('<text data-empty-control="" data-edit="status" data-line="' + it.srcLine + '" data-raw="" x="' + (x + cw - RPAD) + '" y="' + (fy - 2) +
      '" text-anchor="end" font-size="10.5" font-weight="700" letter-spacing="1.05" fill="' + C.muted + '" opacity="0"' + btnAttrs('Set status: ' + it.title) + '>SET STATUS</text>');
  }
  if(b && b.kind === 'new') g.push(badgeCapsule(x + RPAD, y - 10, b, C, measure).svg);
  g.push('</g>');
  if(whatifRect) g.push(whatifRect);
  return {svg: g.join('') + line(x, y + h, x + cw, y + h, C.border, 1, 0.7), h};
}

export function renderBoardLive(model, ctx){
  const C = paletteColors(model, ctx);
  const {measure, diff = null, edit = false, textBets, coarse} = ctx;
  const {M, COLW: baseColW, GAP, RPAD, HEADH} = BOARD_LIVE;
  const COLW = ctx.boardColumnWidth || baseColW;
  const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;
  const visibleIndices = ctx.boardWindow?.indices || model.horizons.map((_, h) => h);
  const hs = visibleIndices.map(h => model.horizons[h]), nH = hs.length;
  const W = M * 2 + nH * COLW + (nH - 1) * GAP;
  const laneRank = new Map(model.lanes.map((l, i) => [l, i]));
  const byLane = arr => [...arr].sort((a, b) => (laneRank.get(a.lane) - laneRank.get(b.lane)) || (a.srcLine - b.srcLine));
  const overWip = model.wip > 0 && activeCount(model, 0) > model.wip;
  const hasBets = anyBet(model);   // hoisted (F6) — was recomputed per card

  const s = [];
  const compact = W < 520;
  let y = compact ? 30 : 34;
  /* ctx.today guarded to string-only (wardley/render.js + energy/intraday's
     render-day.js do the same) — a non-string ctx.today (e.g. the shared
     injection-test ctx's numeric placeholder) must never reach esc(). */
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || (typeof ctx.today === 'string' ? ctx.today : ''));
  if(compact){
    const titleLines = wrapText(model.title || 'Roadmap', '700 20px ' + SANS, W - M * 2, measure);
    titleLines.forEach((lineText, i) => s.push(serifGroup(txt(M, y + i * 24, lineText, 20, C.ink, {weight:700}))));
    y += titleLines.length * 24;
    if(dateLabel){ s.push(txt(M, y, dateLabel, 11, C.muted)); y += 18; }
  } else {
    s.push(serifGroup(txt(M, y, model.title || 'Roadmap', 22, C.ink, {weight: 700})));
    if(dateLabel) s.push(txt(W - M, y, dateLabel, 12, C.muted, {anchor: 'end'}));
    y += 22;
  }
  const basis = basisBand(model, M, y, W - M * 2, measure, C);
  if(basis.height){ s.push(basis.svg); y += basis.height; }
  const sf = standfirst(model, M, y, W - M * 2, measure, C, !!ctx.edit);   // the authored standfirst
  if(sf.height){ s.push(sf.svg); y += sf.height; }
  const sfStory = storyLine(model, diff, M, y, W - M * 2, measure, C, !!ctx.edit);   // the diff narrative
  if(sfStory.height){ s.push(sfStory.svg); y += sfStory.height; }
  const colTop = y + HEADH;

  let maxBottom = colTop;
  for(let h = 0; h < nH; h++){
    const sourceH = visibleIndices[h];
    const x = M + h * (COLW + GAP);
    s.push(txt(x + RPAD, y + 24, hs[h].toUpperCase(), 14, h === 0 ? C.ink : C.muted, {weight: 700, tracking: 1.4}));
    const list = byLane(model.items.filter(i => i.h === sourceH));
    const activeH = activeCount(model, sourceH);
    /* `h` is the visible column position; the window can start midway
       through the roadmap, so factual counts must always follow sourceH. */
    const isOverWip = sourceH === 0 && overWip;
    /* Keep the header as the factual total; conditional work declares itself
       in its own ruled branch instead of turning the count into an equation. */
    const baseLbl = String(activeH);
    const cntLbl = isOverWip ? baseLbl + ' · OVER WIP' : baseLbl;
    s.push(txt(x + COLW - RPAD, y + 24, cntLbl, 12, isOverWip ? C.err : C.muted, {anchor: 'end', weight: 700}));
    s.push(line(x, y + 31, x + COLW, y + 31, C.border, 1, 0.9));

    const groupSvg = [];
    let cy = colTop;
    const paintCard = it => {
      const card = paintBoardCard(it, x, cy, COLW, {C, measure, edit, badgeOf, model, hasBets, textBets, coarse});
      groupSvg.push(card.svg);
      cy += card.h + 12;
    };
    /* E1 (S3): live flow first, then each conditional group. The header rule
       names the branch; unlike the former wash, it never inherits a card
       stack's accidental height. */
    const {live, zones} = splitColumnZones(model, list);
    for(const it of live) paintCard(it);
    for(const {bet, ifItems, unlessItems} of zones){
      for(const [half, items] of [['if', ifItems], ['unless', unlessItems]]){
        if(!items.length) continue;
        const [tint, ink] = zoneTint(half, C);
        const headerTop = cy;
        const headerSvg = line(x + RPAD, headerTop + 9, x + RPAD + 14, headerTop + 9, tint, 2) +
          txt(x + RPAD + 22, headerTop + 14, zoneLabel(bet, half), 11, ink, {weight: 700, tracking: 0.6});
        cy += 26;
        const before = groupSvg.length;
        for(const it of items) paintCard(it);
        const painted = groupSvg.splice(before);
        groupSvg.push(headerSvg, ...painted);
      }
    }
    if(!list.length){
      groupSvg.push(txt(x + RPAD, colTop + 20, 'Nothing scheduled', 13, C.muted));
      cy = colTop + 42;
    }
    if(edit){
      groupSvg.push('<g data-add-control="" opacity="0"><rect x="' + x + '" y="' + cy + '" width="' + COLW + '" height="26" rx="0" fill="transparent"/>' +
        '<text data-edit="additem" data-lane="" data-col="' + esc(hs[h]) + '" data-line="-1" data-raw="" x="' + (x + 12) +
        '" y="' + (cy + 17) + '" font-size="10" font-weight="700" letter-spacing=".08em" fill="' + C.muted + '"' +
        btnAttrs('Add item to ' + hs[h]) + '>＋ ADD</text></g>');
      cy += 26;
    }
    // band UNDER the cards (A2): emitted before groupSvg in the top-level parts
    if(edit) s.push('<rect data-hdrop="' + sourceH + '" x="' + x + '" y="' + colTop + '" width="' + COLW +
      '" height="' + Math.max(28, cy - colTop) + '" fill="transparent"/>');
    s.push(groupSvg.join(''));
    maxBottom = Math.max(maxBottom, cy);
  }

  let my = maxBottom + 14;
  if(diff?.dropped?.length){
    const dropped = wrapText(
      'DROPPED SINCE ' + (diff.since || '') + ' · ' + diff.dropped.join(' · '),
      '600 12px ' + SANS,
      W - M * 2,
      measure
    );
    dropped.forEach((text, index) => s.push(txt(M, my + 16 + index * 17, text, 12, C.muted, {weight:600, strike:true})));
    my += 18 + dropped.length * 17;
  }
  s.push(line(M, my, W - M, my, C.border));
  s.push(txt(M, my + 22, deckMetrics(model), 13, C.muted, {weight: 600}));
  const H = Math.round(my + 38);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + SANS + '\'>' +
    basisDesc(model) + '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>' + s.join('') + '</svg>';
}
