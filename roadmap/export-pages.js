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

// Spotlight has two independent reading regions. Pair their measured pages,
// rather than repeating every hero page for every supporting-horizon window.
function focusPages(model, {horizonsPerPage, pageGeometryFits}){
  const named=model.horizons.findIndex(h=>h.toLowerCase()===String(model.focus||'').toLowerCase());
  const hero=named>=0?named:Math.max(0,model.horizons.findIndex((_,h)=>model.items.some(i=>i.h===h)));
  const supporting=model.horizons.map((_,h)=>h).filter(h=>h!==hero);
  const capacity=Math.max(1,Math.floor(horizonsPerPage)||EXPORT_HORIZONS_PER_PAGE);
  const project=(item,sourceIndex,localH)=>({...item,h:localH,span:1,export:{...item.export,
    sourceIndex,sourceStart:item.h,sourceEnd:item.h+Math.max(1,item.span||1)-1,
    continuesBefore:false,continuesAfter:false}});
  const owned=(h,fits)=>model.items.flatMap((item,index)=>item.h===h?fittedLongItem(project(item,index,0),'focus',fits):[]);
  const fit=(items,indices)=>pageGeometryFits ? pageGeometryFits(items,'focus',indices.map(h=>model.horizons[h])) : geometryFits(items);
  // Keep the hero measurement at its final width even when its rail is empty.
  const heroIndices=[hero,...supporting.slice(0,1)];
  const heroGroups=geometryChunks(owned(hero,items=>fit(items,heroIndices)),'focus',items=>fit(items,heroIndices));
  const rails=[];
  let current={indices:[],items:[]};
  const flush=()=>{if(current.indices.length)rails.push(current);current={indices:[],items:[]};};
  for(const h of supporting){
    const entries=owned(h,items=>fit(items.map(i=>({...i,h:1})),[hero,h]));
    if(!entries.length){
      const indices=[...current.indices,h];
      if(current.indices.length && (indices.length>capacity||!fit(current.items,[hero,...indices])))flush();
      current.indices.push(h);
      continue;
    }
    for(const item of entries){
      let indices=current.indices.includes(h)?current.indices:[...current.indices,h];
      let projected={...item,h:indices.indexOf(h)+1};
      if(current.indices.length && (indices.length>capacity||!fit([...current.items,projected],[hero,...indices]))){
        flush();indices=[h];projected={...item,h:1};
      }
      current.indices=indices;
      current.items.push(fit([projected],[hero,...indices])?projected:{...projected,export:{...projected.export,geometryOverflow:true}});
    }
  }
  flush();
  if(!rails.length)rails.push({indices:[],items:[]});
  const count=Math.max(heroGroups.length,rails.length);
  const drafts=Array.from({length:count},(_,index)=>{
    const hi=Math.min(index,heroGroups.length-1),ri=Math.min(index,rails.length-1);
    const repeatHero=index>=heroGroups.length,repeatRail=index>=rails.length;
    const repeat=(items,repeated)=>items.map(item=>repeated?{...item,export:{...item.export,repeatedContext:true}}:item);
    const items=[...repeat(heroGroups[hi],repeatHero),...repeat(rails[ri].items,repeatRail)];
    const indices=[hero,...rails[ri].indices],horizons=indices.map(h=>model.horizons[h]);
    const context=repeatHero&&heroGroups[hi].length?{region:'Featured work',page:hi+1}:repeatRail&&rails[ri].items.length?{region:'Supporting work',page:ri+1}:null;
    return {start:Math.min(...indices),end:Math.max(...indices),part:index,
      horizonIndices:indices,horizons,focusHeroIndex:hero,context,
      sourceItemIndices:items.filter(i=>!i.export.repeatedContext).map(i=>i.export.sourceIndex),
      contextSourceItemIndices:items.filter(i=>i.export.repeatedContext).map(i=>i.export.sourceIndex),
      geometryComplete:!items.some(i=>i.export.geometryOverflow)&&fit(items,indices),
      model:{...model,focus:model.horizons[hero],horizons,items}};
  });
  return {sourceModel:model,pages:drafts.map((page,index)=>({...page,index,total:count}))};
}

export function exportPages(model, {
  horizonsPerPage = EXPORT_HORIZONS_PER_PAGE,
  pageUnits,
  style = model.style || 'grid',
  pageGeometryFits,
  packColumns = false,
  pageGeometryHeight,
} = {}){
  if(style==='focus')return focusPages(model,{horizonsPerPage,pageGeometryFits});
  const perPage = Math.max(1, Math.floor(horizonsPerPage) || EXPORT_HORIZONS_PER_PAGE);
  const styleFloor = EXPORT_PAGE_UNITS;
  const unitLimit = Math.max(1, Math.floor(pageUnits) || styleFloor);
  const chunks = chunkIndices(model.horizons.length, perPage);
  const drafts = chunks.flatMap(indices => {
    const start = indices[0], end = indices.at(-1);
    const horizons = indices.map(i => model.horizons[i]);
    const fits = pageGeometryFits ? (items, style) => pageGeometryFits(items, style, horizons) : geometryFits;
    const items = model.items.map((item, sourceIndex) => pageItem(item, sourceIndex, start, end))
      .filter(Boolean).flatMap(item => fittedLongItem(item, style,parts=>fits(parts,style)));
    const unitGroups = chunkItems(items, unitLimit);
    const itemGroups = unitGroups.flatMap(group => geometryChunks(group, style, fits));
    let pageGroups = packColumns ? columnChunks(items,style,fits) : itemGroups;
    if(pageGeometryHeight && pageGroups.length>1)
      pageGroups=balanceChunks(pageGroups,style,fits,(items,style)=>pageGeometryHeight(items,style,horizons));
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
