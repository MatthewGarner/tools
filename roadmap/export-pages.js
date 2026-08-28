/* Exhaustive page projections retain source indices; renderers never omit work. */

export const EXPORT_HORIZONS_PER_PAGE = 5;
export const EXPORT_PAGE_UNITS = 12;
const TITLE_FRAGMENT_CHARS = 280;
const NOTE_FRAGMENT_CHARS = 420;
const NARROW_TITLE_FRAGMENT_CHARS = 120;
const NARROW_NOTE_FRAGMENT_CHARS = 180;
const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;

function chunkIndices(total, size){
  const out = [];
  for(let start = 0; start < total; start += size)
    out.push(Array.from({length: Math.min(size, total - start)}, (_, i) => start + i));
  return out;
}

function pageItem(item, sourceIndex, start, end){
  const span = Math.max(1, item.span || 1);
  const itemEnd = item.h + span - 1;
  const overlapStart = Math.max(item.h, start);
  const overlapEnd = Math.min(itemEnd, end);
  if(overlapStart > overlapEnd) return null;
  return {
    ...item,
    h: overlapStart - start,
    span: overlapEnd - overlapStart + 1,
    export: {
      ...item.export,
      sourceIndex,
      sourceStart: item.h,
      sourceEnd: itemEnd,
      continuesBefore: item.h < start,
      continuesAfter: itemEnd > end,
    },
  };
}

function wordFragments(text, limit){
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const out = []; let current = '';
  for(const word of words){
    const parts = graphemeSegmenter ? [...graphemeSegmenter.segment(word)].map(part => part.segment) : Array.from(word);
    const size = Math.max(1, Math.floor(limit / 5));
    if(parts.length > size){
      if(current){ out.push(current); current = ''; }
      for(let index = 0; index < parts.length; index += size)
        out.push(parts.slice(index, index + size).join(''));
      continue;
    }
    const candidate = current ? current + ' ' + word : word;
    if(current && candidate.length > limit){ out.push(current); current = word; }
    else current = candidate;
  }
  if(current) out.push(current);
  return out;
}

/* Long copy becomes explicit, source-indexed continuations. */
function splitLongItem(item, style){
  const narrow = style === 'grid' || style === 'board';
  const titles = wordFragments(item.title, narrow ? NARROW_TITLE_FRAGMENT_CHARS : TITLE_FRAGMENT_CHARS);
  const notes = wordFragments(item.note, narrow ? NARROW_NOTE_FRAGMENT_CHARS : NOTE_FRAGMENT_CHARS);
  const count = Math.max(1, titles.length, notes.length);
  if(count === 1) return [item];
  return Array.from({length:count}, (_, index) => ({...item, export:{...item.export,
    fragment:{
      title: titles[index] || 'Item continued',
      note: notes[index] || '',
      index,
      total: count,
    },
  }}));
}

function itemUnits(item){
  const fragment = item.export?.fragment;
  const text = [fragment?.title ?? item.title, fragment?.note ?? item.note, item.lane, item.status, item.condition].filter(Boolean).join(' ');
  return Math.max(1, Math.ceil(text.length / 110));
}

function chunkItems(items, unitLimit){
  const groups = [];
  let current = [], used = 0;
  for(const item of items){
    const units = itemUnits(item);
    if(current.length && used + units > unitLimit){ groups.push(current); current = []; used = 0; }
    current.push(item); used += units;
  }
  if(current.length) groups.push(current);
  return groups.length ? groups : [[]];
}

function geometryFits(items){
  return items.reduce((sum, item) => sum + itemUnits(item), 0) <= EXPORT_PAGE_UNITS;
}
function geometryChunks(items, style, fits = geometryFits){
  const out = [];
  let current = [];
  for(const item of items){
    const next = [...current, item];
    if(current.length && !fits(next, style)){
      out.push(current);
      current = fits([item], style) ? [item] : [];
      if(!current.length) out.push([{...item, export:{...item.export, geometryOverflow:true}}]);
    } else if(!current.length && !fits(next, style)){
      out.push([{...item, export:{...item.export, geometryOverflow:true}}]);
    } else current = next;
  }
  if(current.length) out.push(current);
  return out.length ? out : [[]];
}

function rebalanceFocusChunks(groups, fits = geometryFits){
  const balanced = groups.map(group => [...group]);
  for(let index = balanced.length - 1; index > 0; index--){
    const previous = balanced[index - 1], current = balanced[index];
    while(previous.length > 1){
      const candidatePrevious = previous.slice(0, -1);
      const candidateCurrent = [previous.at(-1), ...current];
      if(!fits(candidatePrevious, 'focus') || !fits(candidateCurrent, 'focus')) break;
      const before = Math.abs(previous.length - current.length);
      const after = Math.abs(candidatePrevious.length - candidateCurrent.length);
      if(after >= before) break;
      current.unshift(previous.pop());
    }
  }
  return balanced;
}

export function exportPages(model, {
  horizonsPerPage = EXPORT_HORIZONS_PER_PAGE,
  pageUnits,
  style = model.style || 'grid',
  pageGeometryFits,
} = {}){
  /* Focus keeps all horizons together until measured work needs another page. */
  const perPage = style === 'focus' ? Math.max(1, model.horizons.length) :
    Math.max(1, Math.floor(horizonsPerPage) || EXPORT_HORIZONS_PER_PAGE);
  const styleFloor = EXPORT_PAGE_UNITS;
  const unitLimit = Math.max(1, Math.floor(pageUnits) || styleFloor);
  const chunks = chunkIndices(model.horizons.length, perPage);
  const drafts = chunks.flatMap(indices => {
    const start = indices[0], end = indices.at(-1);
    const items = model.items.map((item, sourceIndex) => pageItem(item, sourceIndex, start, end))
      .filter(Boolean).flatMap(item => splitLongItem(item, style));
    const unitGroups = chunkItems(items, unitLimit);
    const horizons = indices.map(i => model.horizons[i]);
    const fits = pageGeometryFits ? (items, style) => pageGeometryFits(items, style, horizons) : geometryFits;
    const itemGroups = (style === 'focus' ? [items] : unitGroups)
      .flatMap(group => geometryChunks(group, style, fits));
    const pageGroups = style === 'focus' ? rebalanceFocusChunks(itemGroups, fits) : itemGroups;
    return pageGroups.map((pageItems, part) => ({
      start,
      end,
      part,
      horizonIndices: indices,
      horizons,
      sourceItemIndices: pageItems.map(item => item.export.sourceIndex),
      geometryComplete: !pageItems.some(item => item.export.geometryOverflow),
      model: {...model, horizons, items: pageItems},
    }));
  });
  const pages = drafts.map((page, index) => ({...page, index, total: drafts.length}));
  return {sourceModel: model, pages};
}

export function exportPageCoverage(plan){
  const seen = new Set();
  const comparisonSeen = new Set();
  for(const page of plan.pages) for(const index of page.sourceItemIndices) seen.add(index);
  for(const page of plan.pages) for(const index of page.comparisonItemIndices || []) comparisonSeen.add(index);
  const complete = seen.size === plan.sourceModel.items.length &&
    comparisonSeen.size === (plan.comparisonSourceItemCount || 0) &&
    plan.pages.every(page => page.geometryComplete !== false);
  return {seen, comparisonSeen, complete};
}
