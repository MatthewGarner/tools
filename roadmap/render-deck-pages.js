/* Exhaustive 16:9 page-set renderer. Kept out of render-deck.js because /why
   deliberately imports Roadmap's legacy presentation renderer and should not
   carry the export planner or its continuation composition. */
import {txt, wrapText} from '../assets/svg.js';
import {STATUS_LABEL, roadmapVerdict} from './parse.js';
import {exportPages} from './export-pages.js';
import {W, M, deckFrame, paletteColors, effectiveStyle, renderDeckNative} from './render-deck.js';
import {rect, SANS} from './deck-parts.js';

const INNER = W - M * 2;

export function renderDeckPages(model, ctx = {}){
  const basePlan = exportPages(model);
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
  const frameText = [model.title, model.headline, model.story, roadmapVerdict(model)?.line]
    .filter(Boolean).join(' ');
  const native = plan.pages.length === 1 && !dropped.length && plan.pages[0].model.items.every(item =>
    String(item.title || '').length + String(item.note || '').length <= 150) && frameText.length <= 180;
  const pages = plan.pages.map(page => {
    const pageCtx = {...ctx, sourceModel: model, exportPage: page};
    const C = paletteColors(model, pageCtx);
    return native ? renderDeckNative(page.model, pageCtx) : renderExhaustiveDeckPage(page.model, pageCtx, C);
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
  return detail.join(' · ');
}
function exhaustivePageBody(model, ctx, C){
  return (y0, y1) => {
    const n = Math.max(1, model.horizons.length);
    const gap = 24, colW = (INNER - (n - 1) * gap) / n;
    const style = effectiveStyle(ctx.sourceModel || model).toUpperCase();
    const byH = h => model.items.filter(item => item.h === h);
    const s = [];
    for(let h = 0; h < n; h++){
      const x = M + h * (colW + gap), first = h === 0, droppedPage = !!ctx.exportPage?.dropped;
      s.push(rect(x, y0, colW, Math.max(0, y1 - y0), first ? C.accent + '0D' : C.card, {rx: 0, stroke: C.border, sw: 1}));
      s.push(txt(x + 18, y0 + 28, (droppedPage ? 'DROPPED SINCE ' + (ctx.diff?.since || '') : model.horizons[h]).toUpperCase(), 13, first ? C.accentInk : C.muted, {weight:700, tracking:1.2}));
      s.push(txt(x + colW - 18, y0 + 28, String(byH(h).length), 13, C.muted, {anchor: 'end', weight: 700}));
      let y = y0 + 52;
      for(const item of byH(h)){
        const titleLines = wrapText(item.title, '700 17px ' + SANS, colW - 36, ctx.measure);
        const detailLines = wrapText(exportDetail(ctx.sourceModel || model, item), '700 10.5px ' + SANS, colW - 36, ctx.measure);
        const noteLines = item.note ? wrapText(item.note, '13px ' + SANS, colW - 36, ctx.measure) : [];
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
    s.push(txt(M, y1 - 8, style + ' · COMPLETE READING SET', 11, C.muted, {weight: 700, tracking: 1.2}));
    return s.join('');
  };
}
function renderExhaustiveDeckPage(model, ctx, C){
  return deckFrame(model, ctx, C, exhaustivePageBody(model, ctx, C));
}
