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
/* Grid and Board can have five narrow horizons on one page. Their source
   fragments are deliberately shorter: page planning must protect actual
   geometry, never assume a character unit will happen to fit a column. */
const NARROW_TITLE_FRAGMENT_CHARS = 120;
const NARROW_NOTE_FRAGMENT_CHARS = 180;

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
function splitLongItem(item, style){
  const narrow = style === 'grid' || style === 'board';
  const titles = wordFragments(item.title, narrow ? NARROW_TITLE_FRAGMENT_CHARS : TITLE_FRAGMENT_CHARS);
  const notes = wordFragments(item.note, narrow ? NARROW_NOTE_FRAGMENT_CHARS : NOTE_FRAGMENT_CHARS);
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

/* A presentation page is physical geometry, not a character bucket. These
   estimates mirror the two compositions that can become vertically dense:
   Grid's packed lane tracks and Board's horizon ledgers. Grid deliberately
   counts the rendered lane advance (tracks + inter-track gap + lane gap), not
   a fictional per-lane header: the horizon ruler is drawn once for the whole
   chart. That keeps an ordinary multi-lane plan on one composed slide without
   relaxing the physical footer guard for genuinely dense work. */
const lineCount = (text, chars) => Math.max(1, Math.ceil(String(text || '').length / chars));
function textOf(item, key){ return item.export?.fragment?.[key] ?? item[key] ?? ''; }
function itemRun(item){ return Math.max(1, item.span || 1); }
function gridEstimate(items){
  const byLane = new Map();
  for(const item of items){
    const key = item.lane || 'Unlaned';
    if(!byLane.has(key)) byLane.set(key, []);
    const title = lineCount(textOf(item, 'title'), 34);
    const note = textOf(item, 'note') ? lineCount(textOf(item, 'note'), 38) : 0;
    const detail = 1 + (item.cond ? 1 : 0) + (item.export?.continuesBefore || item.export?.continuesAfter ? 1 : 0);
    byLane.get(key).push({h0:item.h, h1:item.h + itemRun(item) - 1, h:Math.max(56, 18 + title * 22 + detail * 15 + note * 17 + 16)});
  }
  let total = 0;
  for(const entries of byLane.values()){
    const tracks = [];
    for(const entry of entries){
      let track = 0;
      while(track < tracks.length && tracks[track].some(other => !(entry.h1 < other.h0 || entry.h0 > other.h1))) track++;
      if(track === tracks.length) tracks.push([]);
      tracks[track].push(entry);
    }
    const rows = tracks.map(track => Math.max(...track.map(entry => entry.h)));
    total += rows.reduce((sum, h) => sum + h, 0) + Math.max(0, rows.length - 1) * 8 + 18;
  }
  return total;
}
function boardEstimate(items){
  const byH = new Map();
  for(const item of items){
    if(!byH.has(item.h)) byH.set(item.h, []);
    const title = lineCount(textOf(item, 'title'), 38);
    const note = textOf(item, 'note') ? lineCount(textOf(item, 'note'), 42) : 0;
    const detail = 1 + (item.cond ? 1 : 0) + (itemRun(item) > 1 ? 1 : 0);
    byH.get(item.h).push(Math.max(54, 20 + title * 22 + detail * 15 + note * 17 + 14));
  }
  return Math.max(0, ...[...byH.values()].map(rows => rows.reduce((sum, h) => sum + h, 0) + Math.max(0, rows.length - 1) * 12));
}
function geometryFits(items, style){
  const height = style === 'grid' ? gridEstimate(items) : boardEstimate(items);
  /* The smallest deck body begins above y≈200 and ends before the 968px
     verdict/footer reserve. 620px leaves real room for labels and a long frame. */
  return height <= 620;
}
function geometryChunks(items, style){
  const out = [];
  let current = [];
  for(const item of items){
    const next = [...current, item];
    if(current.length && !geometryFits(next, style)){
      out.push(current);
      current = [item];
    } else current = next;
  }
  if(current.length) out.push(current);
  return out.length ? out : [[]];
}

/* Focus is a reading composition, not a pager. When a true overflow occurs,
   share small cards between adjacent frames so the continuation remains a
   considered artefact instead of an orphan hero. Whole items stay in source
   order; an indivisible large item still earns the room it needs. */
function rebalanceFocusChunks(groups){
  const balanced = groups.map(group => [...group]);
  for(let index = balanced.length - 1; index > 0; index--){
    const previous = balanced[index - 1], current = balanced[index];
    let previousUnits = previous.reduce((sum, item) => sum + itemUnits(item), 0);
    let currentUnits = current.reduce((sum, item) => sum + itemUnits(item), 0);
    while(previous.length > 1){
      const units = itemUnits(previous.at(-1));
      if(previousUnits - units < currentUnits + units) break;
      current.unshift(previous.pop());
      previousUnits -= units;
      currentUnits += units;
    }
  }
  return balanced;
}

export function exportPages(model, {
  horizonsPerPage = EXPORT_HORIZONS_PER_PAGE,
  pageUnits,
  style = model.style || 'grid',
} = {}){
  /* Focus's single hero plus factual rail is expressly made for a broad
     horizon set: keep every horizon together until actual work density earns
     a continuation. Splitting a sparse eight-horizon review after five made
     two mostly empty slides and weakened the selected composition. */
  const perPage = style === 'focus' ? Math.max(1, model.horizons.length) :
    Math.max(1, Math.floor(horizonsPerPage) || EXPORT_HORIZONS_PER_PAGE);
  /* Focus has one deliberately generous hero, but a normal twelve-item plan
     still belongs on one considered slide. Its rail carries the rest at a
     smaller but readable scale; only a twelfth-plus unit earns a continuation.
     Grid reserves rows for span geometry. */
  const styleFloor = EXPORT_PAGE_UNITS;
  const unitLimit = Math.max(1, Math.floor(pageUnits) || styleFloor);
  const chunks = chunkIndices(model.horizons.length, perPage);
  const drafts = chunks.flatMap(indices => {
    const start = indices[0], end = indices.at(-1);
    const items = model.items.map((item, sourceIndex) => pageItem(item, sourceIndex, start, end))
      .filter(Boolean).flatMap(item => splitLongItem(item, style));
    const unitGroups = chunkItems(items, unitLimit);
    const itemGroups = style === 'grid' || style === 'board'
      ? unitGroups.flatMap(group => geometryChunks(group, style))
      : unitGroups;
    const pageGroups = style === 'focus' ? rebalanceFocusChunks(itemGroups) : itemGroups;
    return pageGroups.map((pageItems, part) => ({
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
