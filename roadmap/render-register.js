/* The register composition: a formal table. TWO paint passes over one shared
   model (deck-parts.js) — the DECK export (fixed 1920 frame, byte-identical to
   what shipped) and the LIVE editable view (Task 4). Named render-*.js so
   renderer-coverage forces the live renderer into the injection corpus. */
import {txt, wrapText, tint, esc} from '../assets/svg.js';
import {rect, line, clip1, wrapN, capsule, statusCapsule, badgeCapsule, italTxt,
  registerColumns, registerRows, spanRange, SANS, REGISTER_GEOM} from './deck-parts.js';
import {capFit, deckFrame, paletteColors} from './render-deck.js';

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
