/* Exhaustive 16:9 page-set renderer, separate from /why's legacy deck import. */
import {txt, wrapText} from '../assets/svg.js';
import {STATUS_LABEL} from './parse.js';
import {exportPages, exportPageCoverage} from './export-pages.js';
import {W, M, deckFrame, deckBodyBounds, paletteColors, effectiveStyle} from './render-deck.js';
import {rect, line, SANS} from './deck-parts.js';
import {packLane} from './pack.js';

const INNER = W - M * 2;

export function renderDeckPages(model, ctx = {}){
  const style = effectiveStyle(model);
  const C = paletteColors(model, ctx), bounds = deckBodyBounds(model, ctx, C);
  const bodyHeight = Math.max(0, bounds.bottom - bounds.top);
  const planFor = (source, dropped = false) => exportPages(source, {style,
    pageGeometryFits:(items, selectedStyle, horizons) =>
      exhaustivePageGeometryFits({...source, horizons, items}, model, ctx, C, selectedStyle, bodyHeight, dropped)});
  const basePlan = planFor(model);
  const dropped = ctx.diff?.dropped || [];
  const droppedModel = {...model, horizons:['Changed work'], items:dropped.map((title, index) => ({
    title, lane:'', h:0, span:1, status:null, note:'', export:{dropped:true, sourceIndex:index},
  }))};
  const droppedPages = dropped.length ? planFor(droppedModel, true).pages.map(page => ({...page, dropped:true,
    comparisonItemIndices:page.sourceItemIndices, sourceItemIndices:[]})) : [];
  const rawPages = [...basePlan.pages, ...droppedPages];
  const plan = {...basePlan, comparisonSourceItemCount:dropped.length,
    pages:rawPages.map((page, index) => ({...page, index, total:rawPages.length}))};
  const pages = plan.pages.map(page => {
    const pageCtx = {...ctx, sourceModel: model, exportPage: page};
    const C = paletteColors(model, pageCtx);
    return renderExhaustiveDeckPage(page.model, pageCtx, C);
  });
  return {plan, pages, complete:exportPageCoverage(plan).complete};
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

function maximumPaintY(svg){
  let bottom = 0;
  for(const match of svg.matchAll(/\s(?:y|y1|y2)="(-?[\d.]+)"/g)) bottom = Math.max(bottom, +match[1]);
  for(const match of svg.matchAll(/<rect\b[^>]*>/g)){
    const y = match[0].match(/\sy="(-?[\d.]+)"/), h = match[0].match(/\sheight="([\d.]+)"/);
    if(y && h) bottom = Math.max(bottom, +y[1] + +h[1]);
  }
  return bottom;
}
function paintFitsWidth(svg, measure){
  for(const match of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)){
    const x = match[1].match(/\sx="(-?[\d.]+)"/);
    if(!x) continue;
    const size = match[1].match(/\sfont-size="([\d.]+)"/), weight = match[1].match(/\sfont-weight="([\d.]+)"/);
    const text = match[2].replace(/&(?:amp|lt|gt|quot|#39);/g, 'x');
    const tracking = +(match[1].match(/\sletter-spacing="([\d.]+)"/)?.[1] || 0);
    const width = measure(text, (weight?.[1] || '400') + ' ' + (size?.[1] || '13') + 'px ' + SANS) +
      Math.max(0, text.length - 1) * tracking;
    const anchor = match[1].match(/\stext-anchor="(end|middle)"/), point = +x[1];
    const left = anchor?.[1] === 'end' ? point - width : anchor?.[1] === 'middle' ? point - width / 2 : point;
    const right = anchor?.[1] === 'end' ? point : anchor?.[1] === 'middle' ? point + width / 2 : point + width;
    if(left < M || right > W - M) return false;
  }
  return true;
}
function headerLines(text, size, width, tracking, measure){
  const font = '700 ' + size + 'px ' + SANS;
  return wrapText(String(text || '').toUpperCase(), font, Math.max(1, width),
    value => measure(value, font) + Math.max(0, String(value).length - 1) * tracking);
}
function exhaustivePageGeometryFits(model, sourceModel, ctx, C, style, height, dropped){
  const body = style === 'grid' ? exhaustiveGridBody : style === 'focus' ? exhaustiveFocusBody :
    style === 'register' ? exhaustiveRegisterBody : exhaustiveBoardBody;
  const page = dropped ? {dropped:true} : undefined;
  const pageCtx = {...ctx, sourceModel, exportPage:page, planning:true};
  const svg = body(model, pageCtx, C)(0, height);
  return maximumPaintY(svg) <= height - 24 && paintFitsWidth(svg, ctx.measure);
}

function focusItemHeight(source, item, width, measure, titleSize, titleStep, base){
  const lines = (text, font, step) => wrapText(text, font, width, measure).length * step;
  return base + lines(exportTitle(item), '700 ' + titleSize + 'px ' + SANS, titleStep) +
    lines(exportDetail(source, item, {includeStatus:false}), '700 10.5px ' + SANS, 15) +
    (exportNote(item) ? lines(exportNote(item), '13px ' + SANS, 17) : 0) + (item.status ? 15 : 0);
}
function exhaustiveBoardBody(model, ctx, C){
  return (y0, y1) => {
    const n = Math.max(1, model.horizons.length);
    const gap = 24, colW = (INNER - (n - 1) * gap) / n;
    const byH = h => model.items.filter(item => item.h === h);
    const droppedPage = !!ctx.exportPage?.dropped;
    const labels = model.horizons.map(label => droppedPage ? 'DROPPED SINCE ' + (ctx.diff?.since || '') : label);
    const header = labels.map(label => headerLines(label, 13, colW - 72, 1.2, ctx.measure));
    const headerLineH = Math.max(1, ...header.map(lines => lines.length)) * 16;
    const ruleY = y0 + 22 + headerLineH;
    const cardTop = ruleY + 14;
    const s = [];
    for(let h = 0; h < n; h++){
      const x = M + h * (colW + gap), first = h === 0;
      header[h].forEach((lineText, index) => s.push(txt(x + 18, y0 + 28 + index * 16, lineText, 13,
        first ? C.ink : C.muted, {weight:700, tracking:1.2})));
      s.push(txt(x + colW - 18, y0 + 28, String(byH(h).length), 13, C.muted, {anchor: 'end', weight: 700}));
      s.push(line(x, ruleY, x + colW, ruleY, C.border, 1, .9));
      if(first) s.push(line(x, ruleY, x + 18, ruleY, C.ink, 2));
      let y = cardTop;
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
    if(!ctx.planning) s.push(txt(M, y1 - 8, 'BOARD · COMPLETE READING SET', 11, C.muted, {weight: 700, tracking: 1.2}));
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

function exhaustiveGridBody(model, ctx, C){
  return (y0, y1) => {
    const source = ctx.sourceModel || model, laneW = 156;
    const n = Math.max(1, model.horizons.length), gap = 10;
    const colW = (INNER - laneW - (n - 1) * gap) / n;
    const labels = [...new Set(model.items.map(item => item.lane || 'Unlaned'))];
    if(!labels.length) labels.push('Unlaned');
    const horizonHeader = model.horizons.map(label => headerLines(label, 12, colW - 24, 1.1, ctx.measure));
    const headerLineH = Math.max(1, ...horizonHeader.map(lines => lines.length)) * 15;
    const ruleY = y0 + 15 + headerLineH;
    const s = [];
    for(let h = 0; h < n; h++){
      const x = M + laneW + h * (colW + gap);
      horizonHeader[h].forEach((lineText, index) => s.push(txt(x + 12, y0 + 22 + index * 15, lineText, 12,
        h === 0 ? C.ink : C.muted, {weight:700, tracking:1.1})));
      s.push(line(x, ruleY, x + colW, ruleY, h === 0 ? C.ink : C.border, h === 0 ? 2 : 1, 1));
    }
    let y = ruleY + 16;
    for(const lane of labels){
      const items = model.items.filter(item => (item.lane || 'Unlaned') === lane);
      if(!items.length) continue;
      const laneTop = y;
      const laneLines = headerLines(lane, 11, laneW - 12, 1.1, ctx.measure);
      const cardTop = laneTop + (laneLines.length - 1) * 15 + 4;
      const cards = items.map(item => {
        const start = Math.max(0, item.h), span = Math.max(1, item.span || 1);
        const x = M + laneW + start * (colW + gap) + 6;
        const w = Math.max(40, span * colW + (span - 1) * gap - 12);
        const lines = pageCardLines(source, item, w - 24, ctx.measure,
          {includeRun:false, includeStatus:false, includeLane:false});
        const h = Math.max(48, lines.height);
        return {item, x, w, lines, h, h0:start, h1:start + span - 1};
      });
      const packed = packLane(cards);
      const rowH = new Array(packed.nTracks).fill(0);
      cards.forEach((card, index) => { rowH[packed.at[index]] = Math.max(rowH[packed.at[index]], card.h); });
      const trackY = [cardTop];
      for(let track = 0; track < rowH.length; track++) trackY.push(trackY[track] + rowH[track] + 8);
      cards.forEach((card, index) => {
        const {item, x, w, lines, h} = card;
        const cardY = trackY[packed.at[index]];
        s.push('<rect x="' + x + '" y="' + (cardY + 4) + '" width="' + w + '" height="' + Math.max(40, h - 8) +
          '" fill="' + C.ink + '" fill-opacity="0.08"/>');
        let ty = cardY + 24;
        lines.title.forEach(t => { s.push(txt(x + 12, ty, t, 17, C.ink, {weight:700})); ty += 22; });
        lines.detail.forEach(t => { s.push(txt(x + 12, ty, t, 10.5, C.muted, {weight:700, tracking:.5})); ty += 15; });
        lines.note.forEach(t => { s.push(txt(x + 12, ty, t, 13, C.muted)); ty += 17; });
        if(lines.status) s.push(txt(x + w - 12, ty, lines.status, 10.5,
          C.statusInk[item.status] || C.status[item.status], {anchor:'end', weight:700, tracking:.75}));
      });
      laneLines.forEach((lineText, index) => s.push(txt(M, laneTop + 20 + index * 15, lineText, 11, C.muted,
        {weight:700, tracking:1.1})));
      const cardsBottom = cardTop + Math.max(48, trackY.at(-1) - cardTop - 8);
      const labelBottom = laneTop + 28 + (laneLines.length - 1) * 15;
      y = Math.max(cardsBottom, labelBottom) + 18;
    }
    if(!ctx.planning) s.push(txt(M, y1 - 8, 'GRID · COMPLETE READING SET', 11, C.muted, {weight:700, tracking:1.2}));
    return s.join('');
  };
}

function exhaustiveFocusBody(model, ctx, C){
  return (y0, y1) => {
    const source = ctx.sourceModel || model;
    const hero = Math.max(0, model.horizons.findIndex((_, h) => model.items.some(item => item.h === h)));
    const heroW = Math.round(INNER * .62), railX = M + heroW + 32, railW = INNER - heroW - 32;
    const heroLines = headerLines(model.horizons[hero], 20, heroW, 1.2, ctx.measure);
    const s = [txt(M, y0 + 18, 'FOCUS', 10, C.muted, {weight:700, tracking:1.3})];
    heroLines.forEach((lineText, index) => s.push(txt(M, y0 + 50 + index * 24, lineText, 20, C.ink,
      {weight:700, tracking:1.2})));
    const heroRuleY = y0 + 62 + (heroLines.length - 1) * 24;
    s.push(line(M, heroRuleY, M + heroW, heroRuleY, C.ink, 1.5));
    let hy = heroRuleY + 20;
    for(const item of model.items.filter(item => item.h === hero)){
      const title = wrapText(exportTitle(item), '700 21px ' + SANS, heroW, ctx.measure);
      const detail = wrapText(exportDetail(source, item, {includeStatus:false}), '700 10.5px ' + SANS, heroW, ctx.measure);
      const status = item.status ? (STATUS_LABEL[item.status] || item.status).toUpperCase() : '';
      const note = exportNote(item) ? wrapText(exportNote(item), '13px ' + SANS, heroW, ctx.measure) : [];
      const h = 16 + title.length * 26 + detail.length * 15 + note.length * 17 + (status ? 15 : 0) + 16;
      let ty = hy + 21;
      s.push('<g data-i="' + item.export.sourceIndex + '" data-y0="' + hy + '" data-y1="' + (hy + h) + '">');
      title.forEach(t => { s.push(txt(M, ty, t, 21, C.ink, {weight:700})); ty += 26; });
      detail.forEach(t => { s.push(txt(M, ty, t, 10.5, C.muted, {weight:700, tracking:.5})); ty += 15; });
      note.forEach(t => { s.push(txt(M, ty, t, 13, C.muted)); ty += 17; });
      if(status) s.push(txt(M + heroW, ty, status, 10.5, C.statusInk[item.status] || C.status[item.status], {anchor:'end', weight:700, tracking:.75}));
      s.push(line(M, hy + h, M + heroW, hy + h, C.border, 1, .8), '</g>');
      hy += h + 12;
    }
    let ry = y0 + 4;
    const populatedHorizons = model.horizons.map((_, h) => h)
      .filter(h => h !== hero && model.items.some(item => item.h === h));
    for(const h of populatedHorizons){
      const railLines = headerLines(model.horizons[h], 12, railW, 1.2, ctx.measure);
      railLines.forEach((lineText, index) => s.push(txt(railX, ry + 20 + index * 16, lineText, 12, C.muted,
        {weight:700, tracking:1.2})));
      const railRuleY = ry + 28 + (railLines.length - 1) * 16;
      s.push(line(railX, railRuleY, railX + railW, railRuleY, C.border, 1, .6));
      ry += 38 + (railLines.length - 1) * 16;
      for(const item of model.items.filter(item => item.h === h)){
        const itemTop = ry;
        const itemBottom = itemTop + focusItemHeight(source, item, railW - 28, ctx.measure, 15, 19, 16) - 10;
        s.push('<g data-i="' + item.export.sourceIndex + '" data-y0="' + itemTop + '" data-y1="' + itemBottom + '">');
        const title = wrapText(exportTitle(item), '700 15px ' + SANS, railW - 28, ctx.measure);
        title.forEach(t => { s.push(txt(railX + 14, ry + 16, t, 15, C.ink, {weight:700})); ry += 19; });
        const detail = wrapText(exportDetail(source, item, {includeStatus:false}), '700 10.5px ' + SANS, railW - 28, ctx.measure);
        detail.forEach(t => { s.push(txt(railX + 14, ry + 13, t, 10.5, C.muted, {weight:700, tracking:.5})); ry += 15; });
        if(exportNote(item)){ const note = wrapText(exportNote(item), '13px ' + SANS, railW - 28, ctx.measure); note.forEach(t => { s.push(txt(railX + 14, ry + 14, t, 13, C.muted)); ry += 17; }); }
        if(item.status){ s.push(txt(railX + railW - 14, ry + 13, (STATUS_LABEL[item.status] || item.status).toUpperCase(), 10.5,
          C.statusInk[item.status] || C.status[item.status], {anchor:'end', weight:700, tracking:.75})); ry += 15; }
        s.push(line(railX, ry + 6, railX + railW, ry + 6, C.border, 1, .6), '</g>');
        ry += 16;
      }
    }
    if(!ctx.planning) s.push(txt(M, y1 - 8, 'FOCUS · COMPLETE READING SET', 11, C.muted, {weight:700, tracking:1.2}));
    return s.join('');
  };
}

function exhaustiveRegisterBody(model, ctx, C){
  return (y0, y1) => {
    const source = ctx.exportPage?.dropped ? model : (ctx.sourceModel || model);
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
    if(!ctx.planning) s.push(txt(M, y1 - 8, 'REGISTER · COMPLETE READING SET', 11, C.muted, {weight:700, tracking:1.2}));
    return s.join('');
  };
}
function renderExhaustiveDeckPage(model, ctx, C){
  const style = effectiveStyle(ctx.sourceModel || model);
  const body = style === 'grid' ? exhaustiveGridBody : style === 'focus' ? exhaustiveFocusBody : style === 'register' ? exhaustiveRegisterBody : exhaustiveBoardBody;
  return deckFrame(model, ctx, C, body(model, ctx, C));
}
