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
function splitLongItem(item, style, limits = {}){
  const narrow = style === 'grid' || style === 'board';
  const titles = wordFragments(item.title, limits.title || (narrow ? NARROW_TITLE_FRAGMENT_CHARS : TITLE_FRAGMENT_CHARS));
  const notes = wordFragments(item.note, limits.note || (narrow ? NARROW_NOTE_FRAGMENT_CHARS : NOTE_FRAGMENT_CHARS));
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

// Character limits provide the first cut; real geometry decides whether a long
// title and commentary together need smaller, explicitly numbered continuations.
function fittedLongItem(item, style, fits){
  const initial=splitLongItem(item,style);
  if(initial.every(part=>fits([part])) || !fits([]))return initial;
  const narrow=style==='grid'||style==='board';
  let title=narrow?NARROW_TITLE_FRAGMENT_CHARS:TITLE_FRAGMENT_CHARS;
  let note=narrow?NARROW_NOTE_FRAGMENT_CHARS:NOTE_FRAGMENT_CHARS;
  for(let attempt=0;attempt<3;attempt++){
    title=Math.max(20,Math.floor(title/2));note=Math.max(40,Math.floor(note/2));
    const parts=splitLongItem(item,style,{title,note});
    if(parts.every(part=>fits([part])))return parts;
  }
  // Indivisible framing or metadata remains an explicit overflow, never a
  // declaration that the export is complete merely because text was split.
  return initial;
}

function itemUnits(item){
  const fragment = item.export?.fragment;
  const text = [fragment?.title ?? item.title, fragment?.note ?? item.note, item.lane, item.status, item.condition].filter(Boolean).join(' ');
  return Math.max(1, Math.ceil(text.length / 110));
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

// Independent columns can use free space on earlier pages without moving later
// work ahead of earlier work in the same horizon. Source indices remain unchanged.
function columnChunks(items, style, fits){
  const pages = [], lastPage = new Map();
  for(const item of items){
    let index = lastPage.get(item.h) || 0;
    while(index < pages.length && !fits([...pages[index],item],style)) index++;
    if(index === pages.length) pages.push([]);
    pages[index].push(fits([item],style) ? item : {...item,export:{...item.export,geometryOverflow:true}});
    lastPage.set(item.h,index);
  }
  return pages.length ? pages : [[]];
}

// A ruled review reads sequentially. Move only the tail of a preceding page to
// the start of its successor, preserving source order while avoiding orphan pages.
function balanceChunks(groups, style, fits, height){
  const pages=groups.map(items=>items.slice());
  let changed=true;
  while(changed){
    changed=false;
    for(let i=pages.length-1;i>0;i--){
      const before=pages[i-1],after=pages[i];
      if(before.length<2)continue;
      const left=before.slice(0,-1),right=[before.at(-1),...after];
      if(!fits(left,style)||!fits(right,style))continue;
      const gap=Math.abs(height(before,style)-height(after,style));
      if(Math.abs(height(left,style)-height(right,style))>=gap)continue;
      pages[i-1]=left;pages[i]=right;changed=true;
    }
  }
  return pages;
}

// Spotlight leads with the chosen horizon, then reads the remaining horizons
// in time order. Exhausted work is never replayed to fill an empty region: the
// next supporting horizon becomes the next slide's featured reading surface.
function focusPages(model, {horizonsPerPage, pageGeometryFits}){
  const named=model.horizons.findIndex(h=>h.toLowerCase()===String(model.focus||'').toLowerCase());
  const hero=named>=0?named:Math.max(0,model.horizons.findIndex((_,h)=>model.items.some(i=>i.h===h)));
  const order=[hero,...model.horizons.map((_,h)=>h).filter(h=>h!==hero)];
  const capacity=Math.max(1,Math.floor(horizonsPerPage)||EXPORT_HORIZONS_PER_PAGE);
  const fit=(items,indices)=>pageGeometryFits
    ? pageGeometryFits(items,'focus',indices.map(h=>model.horizons[h]),{focus:model.horizons[indices[0]]})
    : geometryFits(items);
  const queues=new Map(order.map(h=>[h,[]]));
  for(const [sourceIndex,item] of model.items.entries()){
    const projected={...item,h:0,span:1,export:{...item.export,sourceIndex,
      sourceStart:item.h,sourceEnd:item.h+Math.max(1,item.span||1)-1,
      continuesBefore:false,continuesAfter:false}};
    // Use a rail when checking fragment size so a fragment fits either region.
    const other=order.find(h=>h!==item.h);
    const indices=other===undefined?[item.h]:[other,item.h];
    const localH=indices.indexOf(item.h);
    queues.get(item.h)?.push(...fittedLongItem(projected,'focus',parts=>fit(parts.map(i=>({...i,h:localH})),indices)));
  }
  const pending=new Set(order), drafts=[];
  while(pending.size){
    const featured=order.find(h=>pending.has(h));
    const rest=order.filter(h=>h!==featured&&pending.has(h));
    // Reserve final hero width even if supporting rows cannot fit this page.
    let indices=[featured,...rest.slice(0,1)],items=[];
    const take=(h,localH)=>{
      const queue=queues.get(h);
      while(queue.length && fit([...items,{...queue[0],h:localH}],indices))
        items.push({...queue.shift(),h:localH});
      if(!queue.length)pending.delete(h);
    };
    take(featured,0);
    if(queues.get(featured).length && !items.length){
      const item=queues.get(featured).shift();
      items.push({...item,h:0,export:{...item.export,geometryOverflow:true}});
      if(!queues.get(featured).length)pending.delete(featured);
    }
    for(const h of rest){
      if(!indices.includes(h)){
        const next=[...indices,h];
        if(next.length>capacity+1 || !fit(items,next))break;
        indices=next;
      }
      const before=queues.get(h).length;
      take(h,indices.indexOf(h));
      if(queues.get(h).length===before && before>0)break;
      if(queues.get(h).length)break;
    }
    const horizons=indices.map(h=>model.horizons[h]);
    drafts.push({start:Math.min(...indices),end:Math.max(...indices),part:0,
      horizonIndices:indices,horizons,focusHeroIndex:featured,
      progression:featured===hero?'Featured horizon':'Supporting horizons',
      sourceItemIndices:items.map(i=>i.export.sourceIndex),contextSourceItemIndices:[],
      geometryComplete:!items.some(i=>i.export.geometryOverflow)&&fit(items,indices),
      model:{...model,focus:model.horizons[featured],horizons,items}});
  }
  return {sourceModel:model,pages:drafts.map((page,index)=>({...page,index,total:drafts.length}))};
}

// Finish the theme groups inside one fixed time window before advancing time.
// Prefer stable groups across windows; a tiered plan can regroup at a window
// boundary when the busiest period would otherwise inflate the entire deck.
// Only an individually oversized theme earns item continuations.
function themedPages(model, windows, style, fitsPage, heightPage, stableThemes){
  const lanes = [...new Set([...(model.lanes || []), ...model.items.map(i => i.lane || '')])];
  const groupWindows = current => {
    const fitsGroup = group => current.every(w => fitsPage(w.items.filter(i => group.includes(i.lane || '')), w.horizons, group));
    const groups = [];
    for(const lane of lanes){
      const previous = groups.find(group => fitsGroup([...group, lane]));
      if(previous) previous.push(lane);
      else groups.push([lane]);
    }
    return groups;
  };
  const stableGroups = stableThemes && groupWindows(windows);
  const drafts = [];
  for(const [windowIndex, window] of windows.entries()){
    const groups = stableGroups || groupWindows([window]);
    for(const [groupIndex, group] of groups.entries()){
      const items = window.items.filter(i => group.includes(i.lane || ''))
        .sort((a,b) => group.indexOf(a.lane || '') - group.indexOf(b.lane || '') || a.h - b.h || a.export.sourceIndex - b.export.sourceIndex);
      if(!items.length && window.items.length) continue;
      const fits = items => fitsPage(items, window.horizons, group);
      let parts = geometryChunks(items, style, fits);
      if(heightPage && parts.length > 1)
        parts = balanceChunks(parts, style, fits, items => heightPage(items, window.horizons, group));
      parts.forEach((items, part) => drafts.push({...window, items, lanes:group,
        groupIndex, windowIndex, part, parts:parts.length,
        progression:groups.length > 1 ? `Theme group ${groupIndex + 1} of ${groups.length}` : '',
      }));
      // An entirely empty time window needs one explicit empty state, not one
      // duplicate empty slide for every theme group.
      if(!window.items.length) break;
    }
  }
  return drafts;
}

export function exportPages(model, {
  horizonsPerPage = EXPORT_HORIZONS_PER_PAGE,
  pageUnits,
  style = model.style || 'grid',
  pageGeometryFits,
  packColumns = false,
  pageGeometryHeight,
  groupThemes = false,
  stableThemes = true,
} = {}){
  if(style==='focus')return focusPages(model,{horizonsPerPage,pageGeometryFits});
  const perPage = style === 'register' ? Math.max(1, model.horizons.length) : Math.max(1, Math.floor(horizonsPerPage) || EXPORT_HORIZONS_PER_PAGE);
  const unitLimit = Math.max(1, Math.floor(pageUnits) || EXPORT_PAGE_UNITS);
  const fitsPage = (items, horizons, lanes) => pageGeometryFits
    ? pageGeometryFits(items, style, horizons, {lanes})
    : items.reduce((sum, item) => sum + itemUnits(item), 0) <= unitLimit;
  const heightPage = pageGeometryHeight && ((items, horizons, lanes) => pageGeometryHeight(items, style, horizons, {lanes}));
  const windows = chunkIndices(model.horizons.length, perPage).map(indices => {
    const start = indices[0], end = indices.at(-1), horizons = indices.map(i => model.horizons[i]);
    const items = model.items.map((item, sourceIndex) => {
      // Ledgers own a row at its start; its full run is metadata. Repeating a
      // whole ledger row in a later window falsely introduces it as new work.
      if(style === 'board' && (item.h < start || item.h > end)) return null;
      return pageItem(item, sourceIndex, start, end);
    }).filter(Boolean).flatMap(item => fittedLongItem(item, style, parts => fitsPage(parts, horizons)));
    return {start, end, horizonIndices:indices, horizons, items};
  });
  const drafts = groupThemes && ['grid','board'].includes(style)
    ? themedPages(model, windows, style, fitsPage, heightPage, stableThemes)
    : windows.flatMap(window => {
      const fits = items => fitsPage(items, window.horizons);
      const items = window.items.slice().sort((a,b) => a.h - b.h || a.export.sourceIndex - b.export.sourceIndex);
      // Geometry is the capacity rule when available. A pre-bucket creates
      // stranded continuations that no subsequent packing pass can recombine.
      let groups = packColumns ? columnChunks(items,style,fits) : geometryChunks(items,style,fits);
      if(heightPage && groups.length>1)
        groups=balanceChunks(groups,style,fits,items=>heightPage(items,window.horizons));
      return groups.map((items,part)=>({...window,items,part,parts:groups.length}));
    });
  const pages = drafts.map(({items, ...page}, index) => ({...page,index,total:drafts.length,
    sourceItemIndices:items.map(item=>item.export.sourceIndex),
    geometryComplete:!items.some(item=>item.export.geometryOverflow) && fitsPage(items,page.horizons,page.lanes),
    model:{...model,horizons:page.horizons,items,...(page.lanes ? {lanes:page.lanes,exportLanes:page.lanes} : {})},
  }));
  return {sourceModel:model,pages};
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
