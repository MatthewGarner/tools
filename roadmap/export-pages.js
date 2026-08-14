/* Exhaustive, renderer-neutral presentation page planning. A page is a pure
   projection: source text stays untouched and every source item remains
   traceable through its source index. Renderers decide page height, but never
   get permission to make a partial model look complete. */

/* A normal quarterly/now-next-later roadmap earns one generous slide. The full
   deck begins only when five horizons or genuinely wordy/dense work demand it. */
export const EXPORT_HORIZONS_PER_PAGE = 5;
export const EXPORT_PAGE_UNITS = 12;

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
      sourceIndex,
      sourceStart: item.h,
      sourceEnd: itemEnd,
      continuesBefore: item.h < start,
      continuesAfter: itemEnd > end,
    },
  };
}

/* A long title/note earns more room rather than smaller type or an ellipsis.
   This is deliberately conservative: the renderer still wraps the real text,
   while the planner prevents six wordy cards landing on one fixed slide. */
function itemUnits(item){
  const text = [item.title, item.note, item.lane, item.status, item.condition].filter(Boolean).join(' ');
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

export function exportPages(model, {
  horizonsPerPage = EXPORT_HORIZONS_PER_PAGE,
  pageUnits = EXPORT_PAGE_UNITS,
} = {}){
  const perPage = Math.max(1, Math.floor(horizonsPerPage) || EXPORT_HORIZONS_PER_PAGE);
  const unitLimit = Math.max(1, Math.floor(pageUnits) || EXPORT_PAGE_UNITS);
  const chunks = chunkIndices(model.horizons.length, perPage);
  const drafts = chunks.flatMap(indices => {
    const start = indices[0], end = indices.at(-1);
    const items = model.items.map((item, sourceIndex) => pageItem(item, sourceIndex, start, end)).filter(Boolean);
    return chunkItems(items, unitLimit).map((pageItems, part) => ({
      start,
      end,
      part,
      horizonIndices: indices,
      horizons: indices.map(i => model.horizons[i]),
      sourceItemIndices: pageItems.map(item => item.export.sourceIndex),
      model: {...model, horizons: indices.map(i => model.horizons[i]), items: pageItems},
    }));
  });
  const pages = drafts.map((page, index) => ({...page, index, total: drafts.length}));
  return {sourceModel: model, pages};
}

export function exportPageCoverage(plan){
  const seen = new Set();
  for(const page of plan.pages) for(const index of page.sourceItemIndices) seen.add(index);
  return {seen, complete: seen.size === plan.sourceModel.items.length};
}
