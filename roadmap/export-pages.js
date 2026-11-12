/* Exhaustive page projections retain source indices; renderers never omit work. */

export const EXPORT_HORIZONS_PER_PAGE = 5;
export const EXPORT_PAGE_UNITS = 12;
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

/* Fit first. An item that fits a slide on its own is never split. Only an item too big for one slide
   is continued, across consecutive slides, cut at a sentence end where one is close and otherwise at a
   word, with the cut chosen by measured geometry (fits) and not by a character count. */
// Words are cut only at a word boundary. A single unbreakable run (a URL, a hash) is cut into pieces of this
// many graphemes, used only when no word boundary is left.
const LONG_WORD = 12;
const SENTENCE_END = /[.!?\u2026]["')\]\u201d\u2019]*$/;

function tokenize(text){
  const out = [];
  for(const word of String(text || '').trim().split(/\s+/).filter(Boolean)){
    const g = graphemeSegmenter ? [...graphemeSegmenter.segment(word)].map(part => part.segment) : Array.from(word);
    if(g.length <= LONG_WORD){ out.push({s: word, sp: true}); continue; }
    for(let i = 0; i < g.length; i += LONG_WORD) out.push({s: g.slice(i, i + LONG_WORD).join(''), sp: i === 0});
  }
  return out;
}
const joinTokens = tokens => tokens.map((t, i) => (i && t.sp ? ' ' : '') + t.s).join('');

// Largest k in [0, n] for which ok(k) holds, assuming ok is monotone and ok(0) is true. The cut backs
// up to a word boundary when there is one, so a long word is never cut while a boundary remains.
function largest(n, ok, tokens){
  let lo = 0, hi = n;
  while(lo < hi){
    const mid = Math.ceil((lo + hi) / 2);
    if(ok(mid)) lo = mid; else hi = mid - 1;
  }
  if(tokens){
    let j = lo;
    while(j > 0 && j < tokens.length && !tokens[j].sp) j--;
    if(j > 0) return j;
  }
  return lo;
}

// Splitting is by measurement, so it is worth keeping: the same item meets the same window in many candidate plans.
function cached(cache, key, make){
  if(!cache) return make();
  if(!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function fittedLongItem(item, style, fits){
  if(!fits || fits([item])) return [item];
  // Indivisible framing (an enormous title block or label) cannot be cured by cutting this item.
  if(!fits([])) return [item];
  const titleTokens = tokenize(item.title), noteTokens = tokenize(item.note);
  // Probe with the middle-part furniture (both continuation lines) so the final part never grows.
  const part = (title, note, index = 1, total = 3) => ({...item, export:{...item.export, fragment:{title: joinTokens(title), note: joinTokens(note), index, total}}});
  const probe = (title, note) => fits([part(title, note)]);
  // A title too long for any slide is itself cut; otherwise it repeats whole on every part.
  const titleSlices = [];
  if(probe(titleTokens, [])) titleSlices.push(titleTokens);
  else for(let at = 0; at < titleTokens.length;){
    const rest = titleTokens.slice(at);
    if(probe(rest, [])){ titleSlices.push(rest); break; }
    const k = Math.max(1, largest(rest.length, n => probe(rest.slice(0, n), []), rest));
    titleSlices.push(rest.slice(0, k)); at += k;
  }
  const parts = [];
  titleSlices.slice(0, -1).forEach(title => parts.push({title, note: []}));
  const title = titleSlices.at(-1);
  for(let at = 0;;){
    const rest = noteTokens.slice(at);
    // Nothing left to cut: whatever still does not fit is framing, reported as overflow by the caller.
    if(!rest.length || probe(title, rest)){ parts.push({title, note: rest}); break; }
    const fit = largest(rest.length, n => probe(title, rest.slice(0, n)), rest);
    // Prefer ending on a sentence when one lands in the back half of what fits.
    let cut = fit;
    for(let j = fit; j >= Math.ceil(fit / 2) && j > 0; j--) if(SENTENCE_END.test(rest[j - 1].s)){ cut = j; break; }
    cut = Math.max(1, cut);
    parts.push({title, note: rest.slice(0, cut)});
    at += cut;
  }
  const total = parts.length;
  if(total === 1) return [item];
  return parts.map((p, index) => part(p.title, p.note, index, total));
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

// Packing is greedy, so only the last slide of a run can end thin. When it would be an orphan (fewer
// than three cards and under a third of the usable height), move cards from the end of the slide before
// it, in source order, while both slides still fit. Earlier slides stay as full as they were packed.
const rowsOf = items => items.length;
function isThin(items, measureOf){
  const m = measureOf(items);
  return rowsOf(items) < 3 && (m.bottom - m.top) < (m.limit - m.top) / 2 - .5;   // round 2: under three cards and under half the body
}
function balanceTail(groups, style, fits, measureOf){
  const pages = groups.map(items => items.slice());
  if(pages.length < 2) return pages;
  const last = pages.length - 1;
  while(isThin(pages[last], measureOf) && pages[last - 1].length > 1){
    const left = pages[last - 1].slice(0, -1), right = [pages[last - 1].at(-1), ...pages[last]];
    if(!fits(left, style) || !fits(right, style)) break;
    pages[last - 1] = left; pages[last] = right;
  }
  return pages;
}

// Spotlight leads with the chosen horizon, then reads the remaining horizons
// in time order. Exhausted work is never replayed to fill an empty region: the
// next supporting horizon becomes the next slide's featured reading surface.
function focusPages(model, {horizonsPerPage, pageGeometryFits, pageGeometryHeight, splitCache}){
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
    // A cut is sized for the hero position, with the rail present: that is where a continued item is read.
    const other=order.find(h=>h!==item.h);
    const indices=other===undefined?[item.h]:[item.h,other];
    const localH=0;
    queues.get(item.h)?.push(...cached(splitCache,`focus|${sourceIndex}`,()=>fittedLongItem(projected,'focus',parts=>fit(parts.map(i=>({...i,h:localH})),indices))));
  }
  const pending=new Set(order), drafts=[], seen=new Set(), heroChunks=new Map();
  while(pending.size){
    const featured=order.find(h=>pending.has(h));
    const rest=order.filter(h=>h!==featured&&pending.has(h));
    // The featured horizon first, on its own at full width. If it alone exceeds a slide it continues on the next one.
    const queue=queues.get(featured);
    if(!heroChunks.has(featured)){
      // A horizon that alone exceeds a slide is cut into slides once, and its last slide is balanced against the one before it.
      const all=queue.map(i=>({...i,h:0}));
      let chunks=all.length?geometryChunks(all,'focus',items=>fit(items,[featured])):[[]];
      if(pageGeometryHeight&&chunks.length>1)chunks=balanceTail(chunks,'focus',items=>fit(items,[featured]),items=>pageGeometryHeight(items,'focus',[model.horizons[featured]],{focus:model.horizons[featured]}));
      heroChunks.set(featured,chunks);
    }
    const chunks=heroChunks.get(featured), hero=chunks.shift()||[];
    queue.splice(0,hero.length);
    let indices=[featured], items=hero;
    if(!queue.length){
      pending.delete(featured);
      // A supporting horizon is placed whole in the rail or not at all; a slide with nothing for the rail has no rail.
      for(const h of rest){
        if(indices.length>capacity)break;
        const next=[...indices,h];
        const all=[...hero.map(i=>({...i,h:0})),...next.slice(1).flatMap((x,k)=>queues.get(x).map(i=>({...i,h:k+1})))];
        if(!fit(all,next))break;
        indices=next; items=all;
      }
      for(const h of indices.slice(1)){queues.set(h,[]);pending.delete(h);}
    }
    const horizons=indices.map(h=>model.horizons[h]);
    const continued=indices.filter(h=>seen.has(h));
    indices.forEach(h=>{if(items.some(i=>i.h===indices.indexOf(h))||h===featured)seen.add(h);});
    drafts.push({start:Math.min(...indices),end:Math.max(...indices),part:0,
      horizonIndices:indices,horizons,focusHeroIndex:featured,continuedHorizons:continued.map(h=>model.horizons[h]),
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
    // Lanes keep plan order: a lane joins the group before it or starts the next, never an earlier group
    // (first-fit over every group used to pack Platform beside Core and leave Growth for a later slide).
    const groups = [];
    for(const lane of lanes){
      const last = groups.at(-1);
      if(last && fitsGroup([...last, lane])) last.push(lane);
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
        parts = balanceTail(parts, style, fits, items => heightPage(items, window.horizons, group));
      parts.forEach((items, part) => drafts.push({...window, items, lanes:group,
        groupIndex, windowIndex, part, parts:parts.length, groupId:`${windowIndex}:${groupIndex}`,
      }));
      // An entirely empty time window needs one explicit empty state, not one
      // duplicate empty slide for every theme group.
      if(!window.items.length) break;
    }
  }
  return heightPage ? absorbThin(drafts, model, fitsPage, heightPage) : drafts;
}

// Board: each column is its own flow. Slide k shows the k-th page of every column, so a column is never
// empty on a slide while it has cards on a later one, and the slide count is the longest column's.
function boardFlowPages(windows, style, fitsPage, heightPage){
  const drafts = [];
  for(const [windowIndex, window] of windows.entries()){
    const columns = window.horizonIndices.map((_, local) => window.items.filter(i => i.h === local)
      .sort((a, b) => a.export.sourceIndex - b.export.sourceIndex));
    const chunked = columns.map(items => {
      const fits = list => fitsPage(list, window.horizons);
      let parts = items.length ? geometryChunks(items, style, fits) : [[]];
      if(heightPage && parts.length > 1) parts = balanceTail(parts, style, fits, list => heightPage(list, window.horizons));
      return parts;
    });
    const count = Math.max(1, ...chunked.map(c => c.length));
    for(let part = 0; part < count; part++){
      drafts.push({...window, items: chunked.flatMap(c => c[part] || []), lanes: undefined,
        windowIndex, part, parts: count, groupId: `${windowIndex}`,
        columnsDone: chunked.map(c => part >= c.length)});
    }
  }
  return drafts;
}

// A lane group that ends on a thin slide borrows its neighbour's slide when the two fit together in the
// same time window: "Core, continued" with one card becomes part of the slide before or after it.
function absorbThin(drafts, model, fitsPage, heightPage){
  const laneOrder = [...new Set([...(model.lanes || []), ...model.items.map(i => i.lane || '')])];
  const list = drafts.slice();
  const lastOfRun = i => !list[i + 1] || list[i + 1].groupId !== list[i].groupId;
  const thin = d => isThin(d.items, items => heightPage(items, d.horizons, d.lanes));
  for(let again = true; again;){
    again = false;
    for(let i = 0; i < list.length && !again; i++){
      const d = list[i];
      if(list.length < 2 || !thin(d)) continue;
      for(const j of [i - 1, i + 1]){
        const o = list[j];
        if(!o || o.windowIndex !== d.windowIndex) continue;
        const lanes = laneOrder.filter(l => o.lanes.includes(l) || d.lanes.includes(l));
        const items = [...o.items, ...d.items].sort((a, b) => lanes.indexOf(a.lane || '') - lanes.indexOf(b.lane || '') || a.h - b.h || a.export.sourceIndex - b.export.sourceIndex);
        if(fitsPage(items, d.horizons, lanes)){
          list[Math.min(i, j)] = {...o, items, lanes};
          list.splice(Math.max(i, j), 1);
          again = true;
          break;
        }
        // Otherwise move one lane across the boundary, in plan order, so neither slide is thin:
        // "Platform and Design | Data" becomes "Platform | Design and Data".
        if(o.lanes.length > 1){
          const lane = j < i ? o.lanes.at(-1) : o.lanes[0];
          const keepO = o.lanes.filter(l => l !== lane), moved = o.items.filter(x => (x.lane || '') === lane);
          const newD = laneOrder.filter(l => d.lanes.includes(l) || l === lane);
          const dItems = [...moved, ...d.items].sort((a, b) => newD.indexOf(a.lane || '') - newD.indexOf(b.lane || '') || a.h - b.h || a.export.sourceIndex - b.export.sourceIndex);
          const oItems = o.items.filter(x => (x.lane || '') !== lane);
          const nd = {...d, items: dItems, lanes: newD}, no = {...o, items: oItems, lanes: keepO};
          if(oItems.length && fitsPage(dItems, d.horizons, newD) && fitsPage(oItems, o.horizons, keepO) && !thin(nd) && !thin(no)){
            list[i] = nd; list[j] = no;
            again = true;
            break;
          }
        }
      }
    }
  }
  return list;
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
  splitCache,
} = {}){
  if(style==='focus')return focusPages(model,{horizonsPerPage,pageGeometryFits,pageGeometryHeight,splitCache});
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
    }).filter(Boolean).flatMap(item => cached(splitCache, `${style}|${item.export.sourceIndex}|${horizons.join('\u0001')}`, () => fittedLongItem(item, style, parts => fitsPage(parts, horizons, [...new Set([item.lane || ''])]))));
    return {start, end, horizonIndices:indices, horizons, items};
  });
  const drafts = groupThemes && style === 'board'
    ? boardFlowPages(windows, style, fitsPage, heightPage)
    : groupThemes && style === 'grid'
    ? themedPages(model, windows, style, fitsPage, heightPage, stableThemes)
    : windows.flatMap(window => {
      const fits = items => fitsPage(items, window.horizons);
      const items = window.items.slice().sort((a,b) => a.h - b.h || a.export.sourceIndex - b.export.sourceIndex);
      // Geometry is the capacity rule when available. A pre-bucket creates
      // stranded continuations that no subsequent packing pass can recombine.
      let groups = packColumns ? columnChunks(items,style,fits) : geometryChunks(items,style,fits);
      if(heightPage && groups.length>1)
        groups=balanceTail(groups,style,fits,items=>heightPage(items,window.horizons));
      return groups.map((items,part)=>({...window,items,part,parts:groups.length,groupId:`${window.start}-${window.end}`}));
    });
  const lastOfRun = i => !drafts[i + 1] || drafts[i + 1].groupId !== drafts[i].groupId;
  const pages = drafts.map(({items, ...page}, index) => ({...page,index,total:drafts.length,
    orphan:!!heightPage && drafts.length>1 && isThin(items,m=>heightPage(m,page.horizons,page.lanes)),
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
