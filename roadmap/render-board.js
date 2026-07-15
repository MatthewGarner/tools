/* The board composition: horizons as columns, first washed with the accent,
   lane as a tag (no rail). TWO paint passes over the shared model — the DECK
   export (byte-identical to what shipped) and the LIVE editable view (Task 3).
   Named render-*.js so renderer-coverage forces the live renderer into the
   injection corpus. */
import {txt} from '../assets/svg.js';
import {STATUS_LABEL} from './parse.js';
import {rect, line, clip1, wrapN, capFit, badgeCapsule, statusCapsule, SANS} from './deck-parts.js';
import {deckFrame, paletteColors, W, M} from './render-deck.js';

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
   the same proven-terminating helper the list path uses. */
function paintCardColumn(list, {cx, cy0, cw, availH, ramp, fadeOp, badgeOf, C, measure}){
  const fT = '700 ' + ramp.fsT + 'px ' + SANS, fN = ramp.fsN + 'px ' + SANS;
  const layCards = (noteLines, titleLines) => list.map(it => {
    const b = badgeOf(it);
    const tl = wrapN(it.title, fT, cw - ramp.pad * 2, titleLines, measure);
    const nl = it.note && noteLines ? wrapN(it.note, fN, cw - ramp.pad * 2, noteLines, measure) : [];
    const foot = it.lane || it.status ? 30 : 6;
    return {it, b, tl, nl,
      h: ramp.pad * 2 + (b ? 30 : 0) + tl.length * (ramp.fsT + 5) + nl.length * (ramp.fsN + 6) + foot};
  });
  const sumH = cards => cards.reduce((a, c) => a + c.h, 0) + Math.max(0, cards.length - 1) * 14;
  let cards = layCards(ramp.notes, 2);
  if(sumH(cards) > availH) cards = layCards(0, 2);          // drop notes
  if(sumH(cards) > availH) cards = layCards(0, 1);          // clamp titles to 1 line
  const shown = capFit(cards.map(c => c.h), availH, 14, 54); // cap + chip

  const s = [];
  let cy = cy0;
  const capsuleWidth = label => measure(label, '700 11px ' + SANS) + 16;
  for(const c of cards.slice(0, shown)){
    const {it} = c;
    const flag = it.status === 'risk' ? C.status.risk : it.status === 'blocked' ? C.status.blocked : null;
    s.push('<g opacity="' + fadeOp.toFixed(2) + '">');
    s.push(rect(cx, cy, cw, c.h, C.card, {rx: 12, stroke: flag || C.border, sw: flag ? 1.5 : 1}));
    let ty = cy + ramp.pad;
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
   capFit-capped with its own "+N more" chip. */
function paintListColumn(list, {cx, cy0, cw, fadeOp, availH, C, measure}){
  const rows = list.map(it => {
    const sub = [it.lane ? it.lane.toUpperCase() : '',
      it.status ? STATUS_LABEL[it.status].toUpperCase() : '', it.note || ''].filter(Boolean).join('  ·  ');
    return {it, sub, h: sub ? 56 : 38};
  });
  const shown = capFit(rows.map(r => r.h), availH, 0, 48);

  const s = [];
  let ry = cy0;
  for(const r of rows.slice(0, shown)){
    const {it, sub} = r;
    const flag = it.status === 'risk' || it.status === 'blocked';
    s.push('<g opacity="' + fadeOp.toFixed(2) + '">');
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
    const overWip = model.wip > 0 && inH(0).length > model.wip;

    const s = [];
    for(let h = 0; h < nH; h++){
      const x = M + h * (colW + gap);
      s.push(rect(x, y0, colW, zoneH, h === 0 ? C.accent + '0D' : C.ink + '05', {rx: 14}));
      s.push(txt(x + 20, y0 + 34, hs[h].toUpperCase(), 15, h === 0 ? C.accent : C.muted, {weight: 700, tracking: 1.6}));
      const list = byLane(inH(h));
      const countLbl = h === 0 && overWip ? list.length + ' · OVER WIP' : String(list.length);
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
        ? paintListColumn(list, {cx, cy0: y0 + headH + 8, cw, fadeOp, availH, C, measure})
        : paintCardColumn(list, {cx, cy0: y0 + headH, cw, availH, ramp, fadeOp, badgeOf, C, measure});
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
