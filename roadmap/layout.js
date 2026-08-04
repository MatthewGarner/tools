/* Renderer-neutral roadmap geometry and export selection.
   The text model stays untouched: every display id, wrap and horizon remap in
   this module is a projection for one render intent. */
import {wrapText} from '../assets/svg.js';

export const ROADMAP_PRESENTATION_HORIZONS = 3;

const defaultMeasure = text => String(text || '').length * 7;
const lower = value => String(value || '').trim().toLowerCase();

function firstNonEmpty(model){
  const at = model.horizons.findIndex((_, h) => model.items.some(item => item.h === h));
  return at < 0 ? 0 : at;
}

export function presentationStrip(model, limit = ROADMAP_PRESENTATION_HORIZONS){
  const total = model.horizons.length;
  const named = model.focus === undefined ? -1 : model.horizons.findIndex(h => lower(h) === lower(model.focus));
  const anchor = named >= 0 ? named : firstNonEmpty(model);
  const count = Math.min(limit, total);
  const start = Math.max(0, Math.min(anchor, total - count));
  const indices = Array.from({length: count}, (_, i) => start + i);
  return {indices, start, end: start + count - 1, anchor, reason: named >= 0 ? 'focus' : 'first-non-empty'};
}

function projectStrip(model, strip){
  const index = new Map(strip.indices.map((h, i) => [h, i]));
  const items = [];
  for(const item of model.items){
    if(!index.has(item.h)) continue;
    const h = index.get(item.h);
    const originalSpan = Math.max(1, item.span || 1);
    const visibleSpan = Math.max(1, Math.min(originalSpan, strip.indices.length - h));
    items.push({...item, h, span: visibleSpan});
  }
  const focusIndex = strip.indices.indexOf(strip.anchor);
  return {
    ...model,
    horizons: strip.indices.map(h => model.horizons[h]),
    items,
    focus: focusIndex >= 0 ? model.horizons[strip.anchor] : undefined,
  };
}

function panel(text, font, width, measure, maxLines = Infinity){
  const allLines = wrapText(String(text || ''), font, width, measure);
  const lines = allLines.slice(0, maxLines);
  return {text: String(text || ''), lines, lineCount: allLines.length,
    continued: allLines.length > maxLines, width,
    measuredWidth: Math.max(0, ...lines.map(line => measure(line, font)))};
}

export function layoutRoadmap(model, intent = {}){
  const kind = typeof intent === 'string' ? intent : (intent.kind || 'native');
  const measure = (typeof intent === 'object' && intent.measure) || defaultMeasure;
  const native = kind !== 'presentation';
  const strip = native
    ? {indices: model.horizons.map((_, i) => i), start: 0, end: model.horizons.length - 1,
       anchor: firstNonEmpty(model), reason: 'full'}
    : presentationStrip(model);
  const projected = native ? model : projectStrip(model, strip);

  const laneTexts = [...projected.lanes, ...(projected.laneGroups || []).map(g => g.label)].filter(Boolean);
  const rawRail = Math.max(118, ...laneTexts.map(label => measure(String(label).toUpperCase(), '600 11px sans-serif') + 30));
  const laneRailWidth = Math.min(280, Math.ceil(rawRail));
  const titleWidth = Math.max(220, ((typeof intent === 'object' && intent.width) || 1100) - 220);
  const title = panel(projected.title || '', '700 22px sans-serif', titleWidth, measure, 2);
  const lanes = new Map(laneTexts.map(label => [label,
    panel(String(label).toUpperCase(), '600 11px sans-serif', laneRailWidth - 22, measure, 3)]));
  const items = projected.items.map((item, sourceIndex) => ({
    item,
    sourceIndex,
    displayId: 'R' + String(sourceIndex + 1).padStart(2, '0'),
    title: panel(item.title, '600 13px sans-serif', 240, measure),
    note: panel(item.note || '', '11.5px sans-serif', 240, measure),
  }));

  const omittedIndices = model.horizons.map((_, i) => i).filter(i => !strip.indices.includes(i));
  const selectedItems = projected.items.length;
  const omittedItems = model.items.length - selectedItems;
  const selection = {
    selected: strip.indices.map(i => model.horizons[i]),
    omitted: omittedIndices.map(i => model.horizons[i]),
    selectedItems,
    omittedItems,
    reason: strip.reason,
    line: 'SHOWING ' + strip.indices.length + ' OF ' + model.horizons.length + ' HORIZONS · ' +
      selectedItems + ' OF ' + model.items.length + ' ITEMS' + (omittedItems ? ' · ' + omittedItems + ' CONTINUE' : ''),
  };
  const continuation = omittedItems || omittedIndices.length ? {
    horizonLabels: selection.omitted,
    itemLabels: model.items.filter(item => omittedIndices.includes(item.h)).map(item => item.title),
    line: omittedItems + ' ITEMS CONTINUE ACROSS ' + omittedIndices.length + ' HORIZONS',
  } : null;

  return {
    kind, model: projected, sourceModel: model, strip, selection, continuation,
    title, lanes, items, laneRailWidth,
    bounds: {
      minWidth: 52 + (laneTexts.length ? laneRailWidth : 0) + projected.horizons.length * 200 +
        Math.max(0, projected.horizons.length - 1) * 12,
      titleHeight: title.lines.length * 27,
      lanePanelWidth: laneRailWidth,
    },
  };
}
