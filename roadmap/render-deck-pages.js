/* Exhaustive 16:9 page-set renderer. Kept out of render-deck.js because /why
   deliberately imports Roadmap's legacy presentation renderer and should not
   carry the export planner or its continuation composition. */
import {txt, wrapText} from '../assets/svg.js';
import {STATUS_LABEL} from './parse.js';
import {exportPages} from './export-pages.js';
import {W, M, deckFrame, paletteColors, effectiveStyle} from './render-deck.js';
import {rect, line, SANS} from './deck-parts.js';

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

function exportDetail(sourceModel, item){
  const start = sourceModel.horizons[item.export.sourceStart] || '';
  const end = sourceModel.horizons[item.export.sourceEnd] || start;
  const detail = [];
  if(item.lane) detail.push(item.lane.toUpperCase());
  if(item.status) detail.push((STATUS_LABEL[item.status] || item.status).toUpperCase());
  if(item.export.sourceEnd > item.export.sourceStart) detail.push('RUNS ' + start + ' — ' + end);
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
      s.push(rect(x, y0, colW, Math.max(0, y1 - y0), first ? C.accent + '0D' : C.card, {rx: 0, stroke: C.border, sw: 1}));
      s.push(txt(x + 18, y0 + 28, (droppedPage ? 'DROPPED SINCE ' + (ctx.diff?.since || '') : model.horizons[h]).toUpperCase(), 13, first ? C.accentInk : C.muted, {weight:700, tracking:1.2}));
      s.push(txt(x + colW - 18, y0 + 28, String(byH(h).length), 13, C.muted, {anchor: 'end', weight: 700}));
      let y = y0 + 52;
      for(const item of byH(h)){
        const titleLines = wrapText(exportTitle(item), '700 17px ' + SANS, colW - 36, ctx.measure);
        const detailLines = wrapText(exportDetail(ctx.sourceModel || model, item), '700 10.5px ' + SANS, colW - 36, ctx.measure);
        const noteLines = exportNote(item) ? wrapText(exportNote(item), '13px ' + SANS, colW - 36, ctx.measure) : [];
        const badge = !item.export.dropped && ctx.diff?.badge ? ctx.diff.badge(item) : null;
        if(badge) detailLines.unshift(badge.kind === 'moved' ? 'MOVED · ' + badge.label.toUpperCase() : badge.label.toUpperCase());
        const cardH = 20 + titleLines.length * 22 + detailLines.length * 15 + noteLines.length * 17 + 14;
        const flag = item.status === 'risk' || item.status === 'blocked' ? C.status[item.status] : C.border;
        s.push(rect(x + 10, y, colW - 20, cardH, C.card, {rx: 0, stroke: flag, sw: item.status === 'risk' || item.status === 'blocked' ? 1.5 : 1}));
        let ty = y + 22;
        titleLines.forEach(lineText => { s.push(txt(x + 18, ty, lineText, 17, item.export.dropped ? C.muted : C.ink, {weight: 700, strike:item.export.dropped})); ty += 22; });
        detailLines.forEach(lineText => { s.push(txt(x + 18, ty, lineText, 10.5, item.status ? C.statusInk[item.status] || C.muted : C.muted, {weight: 700, tracking: .55})); ty += 15; });
        noteLines.forEach(lineText => { s.push(txt(x + 18, ty, lineText, 13, C.muted)); ty += 17; });
        y += cardH + 12;
      }
    }
    s.push(txt(M, y1 - 8, 'BOARD · COMPLETE READING SET', 11, C.muted, {weight: 700, tracking: 1.2}));
    return s.join('');
  };
}

function pageCardLines(sourceModel, item, width, measure){
  const title = wrapText(exportTitle(item), '700 17px ' + SANS, width, measure);
  const detail = wrapText(exportDetail(sourceModel, item), '700 10.5px ' + SANS, width, measure);
  const note = exportNote(item) ? wrapText(exportNote(item), '13px ' + SANS, width, measure) : [];
  return {title, detail, note, height: 18 + title.length * 22 + detail.length * 15 + note.length * 17 + 16};
}

/* Grid keeps horizontal occupancy and spans on every continuation page. Rows
   repeat by lane when necessary; the source's actual lane and full run are
   printed on the mark, never substituted with a Board card column. */
function exhaustiveGridBody(model, ctx, C){
  return (y0, y1) => {
    const source = ctx.sourceModel || model, laneW = 156;
    const n = Math.max(1, model.horizons.length), gap = 10;
    const colW = (INNER - laneW - (n - 1) * gap) / n;
    const labels = model.lanes.length ? model.lanes : ['Unlaned'];
    const s = [];
    for(let h = 0; h < n; h++){
      const x = M + laneW + h * (colW + gap);
      s.push(rect(x, y0, colW, 34, h === 0 ? C.accent + '0D' : C.card, {rx:0, stroke:C.border, sw:1}));
      s.push(txt(x + 12, y0 + 22, model.horizons[h].toUpperCase(), 12, h === 0 ? C.accentInk : C.muted, {weight:700, tracking:1.1}));
    }
    let y = y0 + 46;
    for(const lane of labels){
      const items = model.items.filter(item => (item.lane || 'Unlaned') === lane);
      if(!items.length) continue;
      const laneTop = y;
      for(const item of items){
        const start = Math.max(0, item.h), span = Math.max(1, item.span || 1);
        const x = M + laneW + start * (colW + gap) + 6;
        const w = Math.max(40, span * colW + (span - 1) * gap - 12);
        const lines = pageCardLines(source, item, w - 24, ctx.measure);
        const h = Math.max(48, lines.height);
        const flag = item.status === 'risk' || item.status === 'blocked' ? C.status[item.status] : C.border;
        s.push(rect(M + laneW, y, INNER - laneW, h, 'none', {rx:0, stroke:C.border, sw:1}));
        s.push(rect(x, y + 5, w, h - 10, C.card, {rx:0, stroke:flag, sw:flag === C.border ? 1 : 1.5}));
        let ty = y + 24;
        lines.title.forEach(t => { s.push(txt(x + 12, ty, t, 17, C.ink, {weight:700})); ty += 22; });
        lines.detail.forEach(t => { s.push(txt(x + 12, ty, t, 10.5, item.status ? C.statusInk[item.status] || C.muted : C.muted, {weight:700, tracking:.5})); ty += 15; });
        lines.note.forEach(t => { s.push(txt(x + 12, ty, t, 13, C.muted)); ty += 17; });
        y += h;
      }
      s.push(txt(M, laneTop + 20, lane.toUpperCase(), 11, C.muted, {weight:700, tracking:1.1}));
      y += 10;
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
    const s = [rect(M, y0, heroW, Math.max(0, y1-y0), C.accent + '0D', {rx:0, stroke:C.border, sw:1})];
    s.push(txt(M + 18, y0 + 28, model.horizons[hero].toUpperCase(), 13, C.accentInk, {weight:700, tracking:1.3}));
    let hy = y0 + 48;
    for(const item of model.items.filter(item => item.h === hero)){
      const lines = pageCardLines(source, item, heroW - 56, ctx.measure);
      s.push(rect(M + 16, hy, heroW - 32, lines.height, C.card, {rx:0, stroke:C.border, sw:1}));
      let ty = hy + 24;
      lines.title.forEach(t => { s.push(txt(M + 28, ty, t, 17, C.ink, {weight:700})); ty += 22; });
      lines.detail.forEach(t => { s.push(txt(M + 28, ty, t, 10.5, item.status ? C.statusInk[item.status] || C.muted : C.muted, {weight:700, tracking:.5})); ty += 15; });
      lines.note.forEach(t => { s.push(txt(M + 28, ty, t, 13, C.muted)); ty += 17; });
      hy += lines.height + 12;
    }
    let ry = y0;
    for(let h = 0; h < model.horizons.length; h++){
      if(h === hero) continue;
      s.push(txt(railX, ry + 20, model.horizons[h].toUpperCase(), 12, C.muted, {weight:700, tracking:1.2}));
      ry += 30;
      for(const item of model.items.filter(item => item.h === h)){
        const title = wrapText(exportTitle(item), '700 15px ' + SANS, railW - 28, ctx.measure);
        title.forEach(t => { s.push(txt(railX + 14, ry + 16, t, 15, C.ink, {weight:700})); ry += 19; });
        const detail = wrapText(exportDetail(source, item), '700 10.5px ' + SANS, railW - 28, ctx.measure);
        detail.forEach(t => { s.push(txt(railX + 14, ry + 13, t, 10.5, C.muted, {weight:700, tracking:.5})); ry += 15; });
        if(exportNote(item)){ const note = wrapText(exportNote(item), '13px ' + SANS, railW - 28, ctx.measure); note.forEach(t => { s.push(txt(railX + 14, ry + 14, t, 13, C.muted)); ry += 17; }); }
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
      {key:'state', label:'LANE · STATUS', frac:.19}, {key:'note', label:'NOTE', frac:.29},
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
      const stateText = [item.lane, item.status && (STATUS_LABEL[item.status] || item.status), item.cond && (item.cond.when === 'unless' ? 'unless ' : 'if ') + item.cond.name].filter(Boolean).join(' · ');
      const stateLines = stateText ? wrapText(stateText, '13px ' + SANS, col('state').w - 24, ctx.measure) : [];
      const noteLines = exportNote(item) ? wrapText(exportNote(item), '13px ' + SANS, col('note').w - 24, ctx.measure) : [];
      const h = Math.max(38, itemLines.length*19+18, horizonLines.length*17+18, stateLines.length*17+18, noteLines.length*17+18);
      const put = (c, lines, size, fill, weight) => lines.forEach((t,i) => s.push(txt(c.x+12, y+17+i*(size+3), t, size, fill, {weight})));
      put(col('item'), itemLines, 15, C.ink, 700); put(col('horizon'), horizonLines, 13, C.ink, 600);
      put(col('state'), stateLines, 13, item.status ? C.statusInk[item.status] || C.muted : C.muted, 600); put(col('note'), noteLines, 13, C.muted, 400);
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
