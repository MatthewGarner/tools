/* Exhaustive 16:9 page-set renderer. Kept out of render-deck.js because /why
   deliberately imports Roadmap's legacy presentation renderer and should not
   carry the export planner or its continuation composition. */
import {txt, wrapText} from '../assets/svg.js';
import {STATUS_LABEL} from './parse.js';
import {exportPages} from './export-pages.js';
import {W, M, deckFrame, paletteColors, effectiveStyle} from './render-deck.js';
import {rect, line, SANS} from './deck-parts.js';
import {packLane} from './pack.js';

const INNER = W - M * 2;

export function renderDeckPages(model, ctx = {}){
  const basePlan = exportPages(model, {style: effectiveStyle(model)});
  const dropped = ctx.diff?.dropped || [];
  const droppedPages = [];
  for(let i = 0; i < dropped.length; i += 6){
    const names = dropped.slice(i, i + 6);
    droppedPages.push({horizons:['Changed work'], start:0, end:0, horizonIndices:[0], part:i / 6,
      sourceItemIndices:[], dropped:names, model:{...model, horizons:['Changed work'], items:names.map((title, index) => ({
        title, lane:'', h:0, span:1, status:null, note:'', export:{sourceStart:0, sourceEnd:0, dropped:true, sourceIndex:index},
      }))}});
  }
  const rawPages = [...basePlan.pages, ...droppedPages];
  const plan = {...basePlan, pages: rawPages.map((page, index) => ({...page, index, total:rawPages.length}))};
  const pages = plan.pages.map(page => {
    const pageCtx = {...ctx, sourceModel: model, exportPage: page};
    const C = paletteColors(model, pageCtx);
    return renderExhaustiveDeckPage(page.model, pageCtx, C);
  });
  return {plan, pages};
}

function exportDetail(sourceModel, item, {includeStatus = true, includeRun = true, includeLane = true} = {}){
  const start = sourceModel.horizons[item.export.sourceStart] || '';
  const end = sourceModel.horizons[item.export.sourceEnd] || start;
  const detail = [];
  if(includeLane && item.lane) detail.push(item.lane.toUpperCase());
  if(includeStatus && item.status) detail.push((STATUS_LABEL[item.status] || item.status).toUpperCase());
  if(includeRun && item.export.sourceEnd > item.export.sourceStart) detail.push('RUNS ' + start + ' — ' + end);
  if(item.cond) detail.push((item.cond.when === 'unless' ? 'UNLESS ' : 'IF ') + String(item.cond.name).toUpperCase());
  if(item.export.continuesBefore) detail.push('CONTINUES FROM ' + start);
  if(item.export.continuesAfter) detail.push('CONTINUES TO ' + end);
  if(item.export.dropped) detail.push('DROPPED');
  const fragment = item.export.fragment;
  if(fragment?.total > 1) detail.push('ITEM PART ' + (fragment.index + 1) + ' OF ' + fragment.total);
  return detail.join(' · ');
}
function exportTitle(item){ return item.export?.fragment?.title ?? item.title; }
function exportNote(item){ return item.export?.fragment?.note ?? item.note; }
function exhaustiveBoardBody(model, ctx, C){
  return (y0, y1) => {
    const n = Math.max(1, model.horizons.length);
    const gap = 24, colW = (INNER - (n - 1) * gap) / n;
    const byH = h => model.items.filter(item => item.h === h);
    const s = [];
    for(let h = 0; h < n; h++){
      const x = M + h * (colW + gap), first = h === 0, droppedPage = !!ctx.exportPage?.dropped;
      s.push(txt(x + 18, y0 + 28, (droppedPage ? 'DROPPED SINCE ' + (ctx.diff?.since || '') : model.horizons[h]).toUpperCase(), 13, first ? C.ink : C.muted, {weight:700, tracking:1.2}));
      s.push(txt(x + colW - 18, y0 + 28, String(byH(h).length), 13, C.muted, {anchor: 'end', weight: 700}));
      s.push(line(x, y0 + 38, x + colW, y0 + 38, C.border, 1, .9));
      if(first) s.push(line(x, y0 + 38, x + 18, y0 + 38, C.ink, 2));
      let y = y0 + 52;
      for(const item of byH(h)){
        const status = item.status ? (STATUS_LABEL[item.status] || item.status).toUpperCase() : '';
        const titleLines = wrapText(exportTitle(item), '700 17px ' + SANS, colW - 36, ctx.measure);
        const detailLines = wrapText(exportDetail(ctx.sourceModel || model, item, {includeStatus:false}), '700 10.5px ' + SANS, colW - 36, ctx.measure);
        const noteLines = exportNote(item) ? wrapText(exportNote(item), '13px ' + SANS, colW - 36, ctx.measure) : [];
        const badge = !item.export.dropped && ctx.diff?.badge ? ctx.diff.badge(item) : null;
        if(badge) detailLines.unshift(badge.kind === 'moved' ? 'MOVED · ' + badge.label.toUpperCase() : badge.label.toUpperCase());
        const cardH = 20 + titleLines.length * 22 + detailLines.length * 15 + noteLines.length * 17 + (status ? 15 : 0) + 14;
        let ty = y + 22;
        titleLines.forEach(lineText => { s.push(txt(x + 18, ty, lineText, 17, item.export.dropped ? C.muted : C.ink, {weight: 700, strike:item.export.dropped})); ty += 22; });
        detailLines.forEach(lineText => { s.push(txt(x + 18, ty, lineText, 10.5, C.muted, {weight: 700, tracking: .55})); ty += 15; });
        noteLines.forEach(lineText => { s.push(txt(x + 18, ty, lineText, 13, C.muted)); ty += 17; });
        if(status) s.push(txt(x + colW - 18, y + cardH - 14, status, 10.5,
          C.statusInk[item.status] || C.status[item.status], {anchor:'end', weight:700, tracking:.75}));
        s.push(line(x + 10, y + cardH, x + colW - 10, y + cardH, C.border, 1, .7));
        y += cardH + 12;
      }
    }
    s.push(txt(M, y1 - 8, 'BOARD · COMPLETE READING SET', 11, C.muted, {weight: 700, tracking: 1.2}));
    return s.join('');
  };
}

function pageCardLines(sourceModel, item, width, measure, detailOptions){
  const title = wrapText(exportTitle(item), '700 17px ' + SANS, width, measure);
  const detail = wrapText(exportDetail(sourceModel, item, detailOptions), '700 10.5px ' + SANS, width, measure);
  const note = exportNote(item) ? wrapText(exportNote(item), '13px ' + SANS, width, measure) : [];
  const status = item.status ? (STATUS_LABEL[item.status] || item.status).toUpperCase() : '';
  return {title, detail, note, status, height: 18 + title.length * 22 + detail.length * 15 + note.length * 17 + (status ? 15 : 0) + 16};
}

/* Grid keeps horizontal occupancy and spans on every continuation page. Its
   source-order track packing is the same interval rule as live Grid: work that
   does not overlap in time shares a row, while true overlaps gain a new track. */
function exhaustiveGridBody(model, ctx, C){
  return (y0, y1) => {
    const source = ctx.sourceModel || model, laneW = 156;
    const n = Math.max(1, model.horizons.length), gap = 10;
    const colW = (INNER - laneW - (n - 1) * gap) / n;
    const labels = model.lanes.length ? model.lanes : ['Unlaned'];
    const s = [];
    for(let h = 0; h < n; h++){
      const x = M + laneW + h * (colW + gap);
      s.push(txt(x + 12, y0 + 22, model.horizons[h].toUpperCase(), 12, h === 0 ? C.ink : C.muted, {weight:700, tracking:1.1}));
      s.push(line(x, y0 + 30, x + colW, y0 + 30, h === 0 ? C.ink : C.border, h === 0 ? 2 : 1, 1));
    }
    let y = y0 + 46;
    for(const lane of labels){
      const items = model.items.filter(item => (item.lane || 'Unlaned') === lane);
      if(!items.length) continue;
      const laneTop = y;
      const cards = items.map(item => {
        const start = Math.max(0, item.h), span = Math.max(1, item.span || 1);
        const x = M + laneW + start * (colW + gap) + 6;
        const w = Math.max(40, span * colW + (span - 1) * gap - 12);
        /* Width already makes an in-page run explicit. Only a true page edge
           needs prose such as CONTINUES TO …, never a redundant RUNS label. */
        const lines = pageCardLines(source, item, w - 24, ctx.measure,
          {includeRun:false, includeStatus:false, includeLane:false});
        const h = Math.max(48, lines.height);
        return {item, x, w, lines, h, h0:start, h1:start + span - 1};
      });
      const packed = packLane(cards);
      const rowH = new Array(packed.nTracks).fill(0);
      cards.forEach((card, index) => { rowH[packed.at[index]] = Math.max(rowH[packed.at[index]], card.h); });
      const trackY = [laneTop];
      for(let track = 0; track < rowH.length; track++) trackY.push(trackY[track] + rowH[track] + 8);
      cards.forEach((card, index) => {
        const {item, x, w, lines, h} = card;
        const cardY = trackY[packed.at[index]];
        /* Continuation-page Grid keeps the same one primitive as the live chart:
           a neutral band whose physical width is the run. Empty time is paper. */
        s.push('<rect x="' + x + '" y="' + (cardY + 4) + '" width="' + w + '" height="' + Math.max(40, h - 8) +
          '" fill="' + C.ink + '" fill-opacity="0.08"/>');
        let ty = cardY + 24;
        lines.title.forEach(t => { s.push(txt(x + 12, ty, t, 17, C.ink, {weight:700})); ty += 22; });
        lines.detail.forEach(t => { s.push(txt(x + 12, ty, t, 10.5, C.muted, {weight:700, tracking:.5})); ty += 15; });
        lines.note.forEach(t => { s.push(txt(x + 12, ty, t, 13, C.muted)); ty += 17; });
        if(lines.status) s.push(txt(x + w - 12, ty, lines.status, 10.5,
          C.statusInk[item.status] || C.status[item.status], {anchor:'end', weight:700, tracking:.75}));
      });
      s.push(txt(M, laneTop + 20, lane.toUpperCase(), 11, C.muted, {weight:700, tracking:1.1}));
      y = laneTop + Math.max(48, trackY.at(-1) - laneTop - 8) + 18;
    }
    s.push(txt(M, y1 - 8, 'GRID · COMPLETE READING SET', 11, C.muted, {weight:700, tracking:1.2}));
    return s.join('');
  };
}

/* Focus retains its authored reading lens: a full hero with factual horizon
   rails, not a generic dense board wearing a Focus label. */
function exhaustiveFocusBody(model, ctx, C){
  return (y0, y1) => {
    const source = ctx.sourceModel || model;
    const hero = Math.max(0, model.horizons.findIndex((_, h) => model.items.some(item => item.h === h)));
    const heroW = Math.round(INNER * .62), railX = M + heroW + 32, railW = INNER - heroW - 32;
    /* Focus makes one horizon physically dominant. The hierarchy comes from
       scale and a single baseline, not a second accent motif or framed cards. */
    const s = [txt(M, y0 + 18, 'FOCUS', 10, C.muted, {weight:700, tracking:1.3})];
    s.push(txt(M, y0 + 50, model.horizons[hero].toUpperCase(), 20, C.ink, {weight:700, tracking:1.2}));
    s.push(line(M, y0 + 62, M + heroW, y0 + 62, C.ink, 1.5));
    let hy = y0 + 82;
    for(const item of model.items.filter(item => item.h === hero)){
      const title = wrapText(exportTitle(item), '700 21px ' + SANS, heroW, ctx.measure);
      const detail = wrapText(exportDetail(source, item, {includeStatus:false}), '700 10.5px ' + SANS, heroW, ctx.measure);
      const status = item.status ? (STATUS_LABEL[item.status] || item.status).toUpperCase() : '';
      const note = exportNote(item) ? wrapText(exportNote(item), '13px ' + SANS, heroW, ctx.measure) : [];
      const h = 16 + title.length * 26 + detail.length * 15 + note.length * 17 + (status ? 15 : 0) + 16;
      let ty = hy + 21;
      title.forEach(t => { s.push(txt(M, ty, t, 21, C.ink, {weight:700})); ty += 26; });
      detail.forEach(t => { s.push(txt(M, ty, t, 10.5, C.muted, {weight:700, tracking:.5})); ty += 15; });
      note.forEach(t => { s.push(txt(M, ty, t, 13, C.muted)); ty += 17; });
      if(status) s.push(txt(M + heroW, ty, status, 10.5, C.statusInk[item.status] || C.status[item.status], {anchor:'end', weight:700, tracking:.75}));
      s.push(line(M, hy + h, M + heroW, hy + h, C.border, 1, .8));
      hy += h + 12;
    }
    let ry = y0 + 4;
    const populatedHorizons = model.horizons.map((_, h) => h)
      .filter(h => h !== hero && model.items.some(item => item.h === h));
    for(const h of populatedHorizons){
      s.push(txt(railX, ry + 20, model.horizons[h].toUpperCase(), 12, C.muted, {weight:700, tracking:1.2}));
      s.push(line(railX, ry + 28, railX + railW, ry + 28, C.border, 1, .6));
      ry += 38;
      for(const item of model.items.filter(item => item.h === h)){
        const title = wrapText(exportTitle(item), '700 15px ' + SANS, railW - 28, ctx.measure);
        title.forEach(t => { s.push(txt(railX + 14, ry + 16, t, 15, C.ink, {weight:700})); ry += 19; });
        const detail = wrapText(exportDetail(source, item, {includeStatus:false}), '700 10.5px ' + SANS, railW - 28, ctx.measure);
        detail.forEach(t => { s.push(txt(railX + 14, ry + 13, t, 10.5, C.muted, {weight:700, tracking:.5})); ry += 15; });
        if(exportNote(item)){ const note = wrapText(exportNote(item), '13px ' + SANS, railW - 28, ctx.measure); note.forEach(t => { s.push(txt(railX + 14, ry + 14, t, 13, C.muted)); ry += 17; }); }
        if(item.status){ s.push(txt(railX + railW - 14, ry + 13, (STATUS_LABEL[item.status] || item.status).toUpperCase(), 10.5,
          C.statusInk[item.status] || C.status[item.status], {anchor:'end', weight:700, tracking:.75})); ry += 15; }
        s.push(line(railX, ry + 6, railX + railW, ry + 6, C.border, 1, .6)); ry += 16;
      }
    }
    s.push(txt(M, y1 - 8, 'FOCUS · COMPLETE READING SET', 11, C.muted, {weight:700, tracking:1.2}));
    return s.join('');
  };
}

/* Register remains a review table at any density. Each source field wraps to
   its natural row height, and the planner creates another page rather than
   clipping a cell or hiding a row behind an overflow count. */
function exhaustiveRegisterBody(model, ctx, C){
  return (y0, y1) => {
    const source = ctx.sourceModel || model;
    const specs = [
      {key:'item', label:'ITEM', frac:.34}, {key:'horizon', label:'HORIZON', frac:.18},
      {key:'state', label:'LANE · STATUS · CONDITION', frac:.19}, {key:'note', label:'NOTE', frac:.29},
    ];
    let x = M; const cols = specs.map(spec => { const out = {...spec,x,w:INNER * spec.frac}; x += out.w; return out; });
    const col = key => cols.find(c => c.key === key), s = [];
    cols.forEach(c => s.push(txt(c.x + 12, y0 + 22, c.label, 11, C.muted, {weight:700, tracking:1.2})));
    s.push(line(M, y0 + 34, W - M, y0 + 34, C.border, 1.5));
    let y = y0 + 42;
    for(const item of [...model.items].sort((a,b) => a.h-b.h || a.srcLine-b.srcLine)){
      const itemLines = wrapText(exportTitle(item), '700 15px ' + SANS, col('item').w - 24, ctx.measure);
      const sourceStart = item.export?.sourceStart ?? item.h;
      const sourceEnd = item.export?.sourceEnd ?? sourceStart;
      const horizonText = sourceEnd > sourceStart ? (source.horizons[sourceStart] || '') + ' — ' + (source.horizons[sourceEnd] || '') : (source.horizons[sourceStart] || model.horizons[item.h]);
      const horizonLines = wrapText(horizonText, '13px ' + SANS, col('horizon').w - 24, ctx.measure);
      const stateText = [item.lane, item.cond && (item.cond.when === 'unless' ? 'unless ' : 'if ') + item.cond.name].filter(Boolean).join(' · ');
      const stateLines = stateText ? wrapText(stateText, '13px ' + SANS, col('state').w - 24, ctx.measure) : [];
      const status = item.status ? (STATUS_LABEL[item.status] || item.status).toUpperCase() : '';
      const noteLines = exportNote(item) ? wrapText(exportNote(item), '13px ' + SANS, col('note').w - 24, ctx.measure) : [];
      const h = Math.max(38, itemLines.length*19+18, horizonLines.length*17+18, (stateLines.length + (status ? 1 : 0))*17+18, noteLines.length*17+18);
      const put = (c, lines, size, fill, weight) => lines.forEach((t,i) => s.push(txt(c.x+12, y+17+i*(size+3), t, size, fill, {weight})));
      put(col('item'), itemLines, 15, C.ink, 700); put(col('horizon'), horizonLines, 13, C.ink, 600);
      put(col('state'), stateLines, 13, C.muted, 600);
      if(status) s.push(txt(col('state').x + 12, y + 17 + stateLines.length * 16, status, 11,
        C.statusInk[item.status] || C.status[item.status], {weight:700, tracking:.9}));
      put(col('note'), noteLines, 13, C.muted, 400);
      s.push(line(M, y+h, W-M, y+h, C.border, 1, .55)); y += h;
    }
    s.push(txt(M, y1 - 8, 'REGISTER · COMPLETE READING SET', 11, C.muted, {weight:700, tracking:1.2}));
    return s.join('');
  };
}
function renderExhaustiveDeckPage(model, ctx, C){
  const style = effectiveStyle(ctx.sourceModel || model);
  const body = style === 'grid' ? exhaustiveGridBody : style === 'focus' ? exhaustiveFocusBody : style === 'register' ? exhaustiveRegisterBody : exhaustiveBoardBody;
  return deckFrame(model, ctx, C, body(model, ctx, C));
}
