/* The board composition: horizons as columns, first washed with the accent,
   lane as a tag (no rail). TWO paint passes over the shared model — the DECK
   export (byte-identical to what shipped) and the LIVE editable view (Task 3).
   Named render-*.js so renderer-coverage forces the live renderer into the
   injection corpus. */
import {txt, esc, btnAttrs} from '../assets/svg.js';
import {STATUS_LABEL, activeCount, condCount} from './parse.js';
import {rect, line, clip1, wrapN, capFit, capsule, badgeCapsule, statusCapsule, serifGroup, standfirst, storyLine, SANS} from './deck-parts.js';
import {deckFrame, paletteColors, deckMetrics, W, M} from './render-deck.js';
import {anyBet, cardTag, tagColors, stateOpacity, previewableBet, whatifHitRect, condCountLabel, splitColumnZones} from './cond-parts.js';

/* E1 (S3): the zone half's wash tint + label ink, shared by both boards —
   if-so rides the done family, if-not the blocked family, both already
   validated as status pill fill/ink pairs elsewhere in this codebase. Wash
   alpha is the same very-low '0D' (~5%) suffix render-board.js already uses
   for the first-horizon column wash, just tinted by outcome instead of the
   accent. Label ink re-uses the pill's own contrast-boosted ink token — at
   this alpha the backdrop barely moves, so ink/backdrop contrast stays
   effectively ink/page-background contrast, checked >=4.5:1 in both themes
   against the real tokens.css light/dark values (numbers in the commit
   message that shipped this). */
function zoneTint(half, C){
  return half === 'if' ? [C.status.done, C.statusInk.done] : [C.status.blocked, C.statusInk.blocked];
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
    const foot = it.lane || it.status ? 30 : 6;
    return {it, b, tag, tl, nl,
      h: ramp.pad * 2 + (b ? 30 : 0) + (tag ? 30 : 0) + tl.length * (ramp.fsT + 5) + nl.length * (ramp.fsN + 6) + foot};
  });
  const sumH = cards => cards.reduce((a, c) => a + c.h + (headerAt.has(c.it) ? HEADER_H : 0), 0) +
    Math.max(0, cards.length - 1) * 14;
  let cards = layCards(ramp.notes, 2);
  if(sumH(cards) > availH) cards = layCards(0, 2);          // drop notes
  if(sumH(cards) > availH) cards = layCards(0, 1);          // clamp titles to 1 line
  const heights = cards.map(c => c.h + (headerAt.has(c.it) ? HEADER_H : 0));
  const shown = capFit(heights, availH, 14, 54); // cap + chip

  // group boundaries (indices into `cards`) that start a header, so a header
  // knows where its group's shown cards end (next header, or the column end)
  const boundaryIdx = [];
  cards.forEach((c, i) => { if(headerAt.has(c.it)) boundaryIdx.push(i); });
  boundaryIdx.push(cards.length);
  const groupEndFor = i => boundaryIdx[boundaryIdx.indexOf(i) + 1];

  const s = [];
  let cy = cy0;
  const capsuleWidth = label => measure(label, '700 11px ' + SANS) + 16;
  for(let i = 0; i < shown; i++){
    const c = cards[i], {it} = c;
    const header = headerAt.get(it);
    if(header){
      const groupEnd = Math.min(groupEndFor(i), shown);
      let gh = 0;
      for(let j = i; j < groupEnd; j++) gh += cards[j].h + (j > i ? 14 : 0);
      s.push(rect(cx - 6, cy, cw + 12, HEADER_H + gh + 6, header.tint + '0D', {rx: 12}));
      s.push(txt(cx, cy + 17, header.label, 11, header.ink, {weight: 700, tracking: 0.6}));
      cy += HEADER_H;
    }
    // dropped's own treatment wins over the flag border — reality already
    // answered, so a resolved-away risk must not still read as live trouble
    const flag = it.worldState === 'dropped' ? null :
      it.status === 'risk' ? C.status.risk : it.status === 'blocked' ? C.status.blocked : null;
    s.push('<g opacity="' + stateOpacity(it, fadeOp).toFixed(2) + '">');
    s.push(rect(cx, cy, cw, c.h, C.card, {rx: 12, stroke: flag || C.border, sw: flag ? 1.5 : 1}));
    let ty = cy + ramp.pad;
    if(c.tag){ const [tcol, tink] = tagColors(c.tag, C); s.push(capsule(cx + ramp.pad, ty - 4, c.tag.label, tcol, tink, measure).svg); ty += 30; }
    if(c.b){ s.push(badgeCapsule(cx + ramp.pad, ty - 4, c.b, C, measure).svg); ty += 30; }
    ty += ramp.fsT - 4;
    for(const ln of c.tl){ s.push(txt(cx + ramp.pad, ty, ln, ramp.fsT, C.ink, {weight: 700})); ty += ramp.fsT + 5; }
    for(const ln of c.nl){ s.push(txt(cx + ramp.pad, ty, ln, ramp.fsN, C.muted)); ty += ramp.fsN + 6; }
    const fy = cy + c.h - ramp.pad - 6;
    if(it.lane) s.push(txt(cx + ramp.pad, fy + 4, it.lane.toUpperCase(), 11, C.muted, {weight: 700, tracking: 1.2}));
    if(it.status){
      const capW = measure(STATUS_LABEL[it.status].toUpperCase(), '600 12px ' + SANS) +
        STATUS_LABEL[it.status].length * 0.6 + 18;
      const laneW = it.lane ? capsuleWidth(it.lane.toUpperCase()) : 0;
      if(laneW + capW <= cw - ramp.pad * 2 + 8)
        s.push(statusCapsule(cx + cw - ramp.pad - capW, fy - 12, it.status, C, measure).svg);
    }
    s.push('</g>');
    cy += c.h + 14;
  }
  if(shown < cards.length){
    s.push(rect(cx, cy, cw, 40, 'none', {rx: 20, stroke: C.border, sw: 1, dash: '4 4'}));
    s.push(txt(cx + 18, cy + 26, '+ ' + (cards.length - shown) + ' more', 14, C.muted, {weight: 600}));
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
    // list-mode rows are the dense fallback — the tag rides the sub-line,
    // before the note, truncated with everything else via the same clip1
    const sub = [it.lane ? it.lane.toUpperCase() : '',
      it.status ? STATUS_LABEL[it.status].toUpperCase() : '', tag ? tag.label : '',
      it.note || ''].filter(Boolean).join('  ·  ');
    return {it, sub, h: sub ? 56 : 38};
  });
  const shown = capFit(rows.map(r => r.h), availH, 0, 48);

  const s = [];
  let ry = cy0;
  for(const r of rows.slice(0, shown)){
    const {it, sub} = r;
    // dropped's treatment wins over the flag border
    const flag = it.worldState !== 'dropped' && (it.status === 'risk' || it.status === 'blocked');
    s.push('<g opacity="' + stateOpacity(it, fadeOp).toFixed(2) + '">');
    if(flag) s.push(rect(cx, ry + 2, 3, sub ? 44 : 28, C.status[it.status], {rx: 1.5}));
    const tx = cx + (flag ? 14 : 0);
    s.push(txt(tx, ry + 18, clip1(it.title, '600 17px ' + SANS, cw - (flag ? 14 : 0), measure), 17, C.ink, {weight: 600}));
    if(sub) s.push(txt(tx, ry + 38, clip1(sub, '12.5px ' + SANS, cw - (flag ? 14 : 0), measure), 12.5,
      flag ? C.statusInk[it.status] : C.muted, {tracking: 0.3}));
    s.push('</g>');
    ry += r.h;
    s.push(line(cx, ry - 12, cx + cw, ry - 12, C.border, 1, 0.55));
  }
  if(shown < rows.length){
    s.push(rect(cx, ry, cw, 40, 'none', {rx: 20, stroke: C.border, sw: 1, dash: '4 4'}));
    s.push(txt(cx + 18, ry + 26, '+ ' + (rows.length - shown) + ' more', 14, C.muted, {weight: 600}));
  }
  return {svg: s.join(''), shown, total: rows.length};
}

/* BOARD body: horizons as columns (lane rides as a tag, no rail), first
   horizon washed with the accent, in-plane letterspaced label + count per
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
      s.push(rect(x, y0, colW, zoneH, h === 0 ? C.accent + '0D' : C.ink + '05', {rx: 14}));
      s.push(txt(x + 20, y0 + 34, hs[h].toUpperCase(), 15, h === 0 ? C.accent : C.muted, {weight: 700, tracking: 1.6}));
      const list = byLane(inH(h));
      /* label shows the ACTIVE count (matching the overWip flag) — dropped
         items are still painted in `list` below, just not counted. */
      const activeH = activeCount(model, h);
      const baseLbl = condCountLabel(activeH, condCount(model, h));
      const countLbl = h === 0 && overWip ? baseLbl + ' · OVER WIP' : baseLbl;
      s.push(txt(x + colW - 20, y0 + 34, countLbl, 13, h === 0 && overWip ? C.err : C.muted,
        {anchor: 'end', weight: 700, tracking: 1}));

      const cx = x + 16, cw = colW - 32;
      if(!list.length){
        s.push(rect(cx, y0 + headH, cw, 84, 'none', {rx: 12, stroke: C.border, sw: 1, dash: '4 4'}));
        s.push(txt(cx + cw / 2, y0 + headH + 48, 'Nothing scheduled', 14, C.muted, {anchor: 'middle'}));
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
  const tl = wrapN(it.title, fT, cw - RPAD * 2, 2, measure);
  const nl = it.note ? wrapN(it.note, fN, cw - RPAD * 2, 2, measure) : [];
  const footH = it.lane || it.status || edit ? 26 : 8;
  // reserve the note row's height: a real note, OR (edit only) the "+ note" ghost
  // row emitted below — without this the ghost collides with the lane/status foot.
  // edit:false with no note reserves nothing, so the export/golden path is unchanged.
  const noteH = nl.length ? nl.length * 19 + 4 : (edit ? 19 : 0);
  const tagH = tag ? 30 : 0;
  const h = RPAD * 2 + tagH + tl.length * 24 + noteH + footH;
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
  // dropped's treatment wins over the flag border
  const flag = it.worldState === 'dropped' ? null :
    it.status === 'risk' ? C.status.risk : it.status === 'blocked' ? C.status.blocked : null;
  const op = stateOpacity(it, 1);   // 1 for a plain item — no attribute added, byte-identical
  const g = [];
  g.push('<g' + (op < 1 ? ' opacity="' + op.toFixed(2) + '"' : '') +
    (edit ? ' data-edit="cardmenu" data-line="' + it.srcLine + '" data-key="' + esc(key) + '"' +
    btnAttrs('More options: ' + it.title) + ' data-menu=""' : '') + '>');
  g.push(rect(x, y, cw, h, C.card, {rx: 12, stroke: flag || C.border,
    sw: flag ? 1.5 : 1, dash: it.worldState === 'cond' ? '3 3' : null}));
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
  }); } else if(edit){
    g.push('<text data-edit="note" data-line="' + it.srcLine + '" data-raw="" x="' + (x + RPAD) + '" y="' + ty +
      '" font-size="13" fill="' + C.muted + '" opacity="0.55"' + btnAttrs('Add note') + '>+ note</text>');
    ty += 19;
  }
  const fy = y + h - RPAD;
  // lane tag (edit target even when empty)
  if(it.lane){
    g.push('<text' + (edit ? ' data-edit="lane" data-line="' + it.srcLine + '" data-raw="' + esc(it.lane) + '"' +
      btnAttrs('Edit lane: ' + it.title) : '') + ' x="' + (x + RPAD) + '" y="' + (fy - 2) +
      '" font-size="11" font-weight="700" letter-spacing="1.2" fill="' + C.muted + '">' + esc(it.lane.toUpperCase()) + '</text>');
  } else if(edit){
    g.push('<text data-edit="lane" data-line="' + it.srcLine + '" data-raw="" x="' + (x + RPAD) + '" y="' + (fy - 2) +
      '" font-size="11" fill="' + C.muted + '" opacity="0.55"' + btnAttrs('Add lane: ' + it.title) + '>+ lane</text>');
  }
  // status capsule (edit target even when empty)
  if(it.status){
    const capW = measure(STATUS_LABEL[it.status].toUpperCase(), '600 12px ' + SANS) + 18;
    const cap = statusCapsule(x + cw - RPAD - capW, fy - 14, it.status, C, measure).svg;
    g.push(edit ? '<g data-edit="status" data-line="' + it.srcLine + '" data-raw="' + esc(it.status) + '"' +
      btnAttrs('Change status: ' + it.title) + '>' + cap + '</g>' : cap);
  } else if(edit){
    g.push('<text data-edit="status" data-line="' + it.srcLine + '" data-raw="" x="' + (x + cw - RPAD) + '" y="' + (fy - 2) +
      '" font-size="11" fill="' + C.muted + '" opacity="0.55" text-anchor="end"' + btnAttrs('Set status: ' + it.title) + '>+ status</text>');
  }
  if(b && b.kind === 'new') g.push(badgeCapsule(x + RPAD, y - 10, b, C, measure).svg);
  g.push('</g>');
  if(whatifRect) g.push(whatifRect);
  return {svg: g.join(''), h};
}

export function renderBoardLive(model, ctx){
  const C = paletteColors(model, ctx);
  const {measure, diff = null, edit = false, textBets, coarse} = ctx;
  const {M, COLW, GAP, RPAD, HEADH} = BOARD_LIVE;
  const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;
  const hs = model.horizons, nH = hs.length;
  const W = M * 2 + nH * COLW + (nH - 1) * GAP;
  const laneRank = new Map(model.lanes.map((l, i) => [l, i]));
  const byLane = arr => [...arr].sort((a, b) => (laneRank.get(a.lane) - laneRank.get(b.lane)) || (a.srcLine - b.srcLine));
  const overWip = model.wip > 0 && activeCount(model, 0) > model.wip;
  const hasBets = anyBet(model);   // hoisted (F6) — was recomputed per card

  const s = [];
  let y = 34;
  s.push(serifGroup(txt(M, y, model.title || 'Roadmap', 22, C.ink, {weight: 700})));
  /* ctx.today guarded to string-only (wardley/render.js + energy/intraday's
     render-day.js do the same) — a non-string ctx.today (e.g. the shared
     injection-test ctx's numeric placeholder) must never reach esc(). */
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || (typeof ctx.today === 'string' ? ctx.today : ''));
  if(dateLabel) s.push(txt(W - M, y, dateLabel, 12, C.muted, {anchor: 'end'}));
  y += 22;
  const sf = standfirst(model, M, y, W - M * 2, measure, C, !!ctx.edit);   // the authored standfirst
  if(sf.height){ s.push(sf.svg); y += sf.height; }
  const sfStory = storyLine(model, diff, M, y, W - M * 2, measure, C, !!ctx.edit);   // the diff narrative
  if(sfStory.height){ s.push(sfStory.svg); y += sfStory.height; }
  const colTop = y + HEADH;

  let maxBottom = colTop;
  for(let h = 0; h < nH; h++){
    const x = M + h * (COLW + GAP);
    s.push(rect(x, y, COLW, HEADH - 8, h === 0 ? C.accent + '0D' : 'none', {rx: 10}));
    s.push(txt(x + RPAD, y + 24, hs[h].toUpperCase(), 14, h === 0 ? C.accent : C.muted, {weight: 700, tracking: 1.4}));
    const list = byLane(model.items.filter(i => i.h === h));
    const activeH = activeCount(model, h);
    const baseLbl = condCountLabel(activeH, condCount(model, h));
    const cntLbl = h === 0 && overWip ? baseLbl + ' · OVER WIP' : baseLbl;
    s.push(txt(x + COLW - RPAD, y + 24, cntLbl, 12, h === 0 && overWip ? C.err : C.muted, {anchor: 'end', weight: 700}));

    const groupSvg = [];
    let cy = colTop;
    const paintCard = it => {
      const card = paintBoardCard(it, x, cy, COLW, {C, measure, edit, badgeOf, model, hasBets, textBets, coarse});
      groupSvg.push(card.svg);
      cy += card.h + 12;
    };
    /* E1 (S3): live flow first (byLane, untouched), then each open non-cycle
       bet's if-so/if-not groups — uncapped, so no capFit/header-boundary
       bookkeeping is needed here (unlike the deck's card ladder): the wash
       simply spans from its own header down to wherever `cy` lands after
       painting every member of that half. */
    const {live, zones} = splitColumnZones(model, list);
    for(const it of live) paintCard(it);
    for(const {bet, ifItems, unlessItems} of zones){
      for(const [half, items] of [['if', ifItems], ['unless', unlessItems]]){
        if(!items.length) continue;
        const [tint, ink] = zoneTint(half, C);
        const washTop = cy;
        const headerSvg = txt(x + RPAD, washTop + 18, zoneLabel(bet, half), 11, ink, {weight: 700, tracking: 0.6});
        cy += 26;
        const before = groupSvg.length;
        for(const it of items) paintCard(it);
        const painted = groupSvg.splice(before);   // pull out the just-painted cards to reorder wash-first
        const washH = (cy - 6) - washTop;
        groupSvg.push(rect(x - 8, washTop, COLW + 16, washH, tint + '0D', {rx: 12}), headerSvg, ...painted);
      }
    }
    if(!list.length){
      groupSvg.push(rect(x, colTop, COLW, 70, 'none', {rx: 0, stroke: C.border, sw: 1, dash: '4 4'}));
      groupSvg.push(txt(x + COLW / 2, colTop + 40, 'Nothing scheduled', 13, C.muted, {anchor: 'middle'}));
      cy = colTop + 70 + 12;
    }
    if(edit){
      groupSvg.push('<g opacity="0.75"><rect x="' + x + '" y="' + cy + '" width="' + COLW + '" height="26" rx="0" fill="none" stroke="' +
        C.border + '" stroke-dasharray="2 3"/>' +
        '<text data-edit="additem" data-lane="" data-col="' + esc(hs[h]) + '" data-line="-1" data-raw="" x="' + (x + 12) +
        '" y="' + (cy + 17) + '" font-size="10" font-weight="700" letter-spacing=".08em" fill="' + C.muted + '"' +
        btnAttrs('Add item to ' + hs[h]) + '>＋ ADD TO ' + esc(hs[h].toUpperCase()) + '</text></g>');
      cy += 26;
    }
    // band UNDER the cards (A2): emitted before groupSvg in the top-level parts
    if(edit) s.push('<rect data-hdrop="' + h + '" x="' + x + '" y="' + colTop + '" width="' + COLW +
      '" height="' + Math.max(28, cy - colTop) + '" fill="transparent"/>');
    s.push(groupSvg.join(''));
    maxBottom = Math.max(maxBottom, cy);
  }

  const my = maxBottom + 14;
  s.push(line(M, my, W - M, my, C.border));
  s.push(txt(M, my + 22, deckMetrics(model), 13, C.muted, {weight: 600}));
  const H = Math.round(my + 38);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + SANS + '\'>' +
    '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>' + s.join('') + '</svg>';
}
