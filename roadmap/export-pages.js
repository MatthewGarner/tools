/* Exhaustive, renderer-neutral presentation page planning. A page is a pure
   projection: source text stays untouched and every source item remains
   traceable through its source index. Renderers decide page height, but never
   get permission to make a partial model look complete. */

/* A normal quarterly/now-next-later roadmap earns one generous slide. The full
   deck begins only when five horizons or genuinely wordy/dense work demand it. */
export const EXPORT_HORIZONS_PER_PAGE = 5;
export const EXPORT_PAGE_UNITS = 12;
/* A single source item can be much longer than a slide. These are deliberately
   below the narrowest Board column's comfortable line budget, so a fragment
   stays readable at the established type floor. Continuation pages repeat the
   item's factual identity rather than reducing type or writing an ellipsis. */
const TITLE_FRAGMENT_CHARS = 280;
const NOTE_FRAGMENT_CHARS = 420;

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

function wordFragments(text, limit){
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if(!words.length) return [];
  const out = []; let current = '';
  for(const word of words){
    const candidate = current ? current + ' ' + word : word;
    if(current && candidate.length > limit){ out.push(current); current = word; }
    else current = candidate;
  }
  if(current) out.push(current);
  return out;
}

/* Preserve arbitrarily long source text as a sequence of explicit card
   fragments. The source item index stays stable on every fragment, which keeps
   coverage and snapshot semantics honest while giving the renderer a bounded
   geometry to lay out. */
function splitLongItem(item){
  const titles = wordFragments(item.title, TITLE_FRAGMENT_CHARS);
  const notes = wordFragments(item.note, NOTE_FRAGMENT_CHARS);
  const count = Math.max(1, titles.length, notes.length);
  if(count === 1) return [item];
  return Array.from({length:count}, (_, index) => ({...item, export:{...item.export,
    fragment:{
      title: titles[index] || item.title,
      note: notes[index] || '',
      index,
      total: count,
    },
  }}));
}

/* A long title/note earns more room rather than smaller type or an ellipsis.
   This is deliberately conservative: the renderer still wraps the real text,
   while the planner prevents six wordy cards landing on one fixed slide. */
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

export function exportPages(model, {
  horizonsPerPage = EXPORT_HORIZONS_PER_PAGE,
  pageUnits,
  style = model.style || 'grid',
} = {}){
  const perPage = Math.max(1, Math.floor(horizonsPerPage) || EXPORT_HORIZONS_PER_PAGE);
  /* Focus has one deliberately generous hero; it earns a continuation before
     twelve short cards quietly turn it into a list. Grid reserves rows for
     span geometry. Board/Register retain the general twelve-unit budget. */
  const styleFloor = style === 'focus' ? 8 : EXPORT_PAGE_UNITS;
  const unitLimit = Math.max(1, Math.floor(pageUnits) || styleFloor);
  const chunks = chunkIndices(model.horizons.length, perPage);
  const drafts = chunks.flatMap(indices => {
    const start = indices[0], end = indices.at(-1);
    const items = model.items.map((item, sourceIndex) => pageItem(item, sourceIndex, start, end))
      .filter(Boolean).flatMap(splitLongItem);
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
