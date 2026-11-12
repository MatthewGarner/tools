/* Chapter geometry. The same measured rows feed editing, SVG and slide pages.
   Coordinates use a 1440-unit composition; slides scale it to 1920×1080. */
import {wrapText} from '../assets/svg.js';
import {STATUS_LABEL, activeCount, condCount} from './parse.js';
import {cardTag, registerOutcomeGroups, betChain} from './cond-parts.js';
import {resolveTypography} from '../assets/chapter-fonts.js';
import {resolveVerdict} from '../assets/verdict-core.js';

export const CHAPTER_SLIDE = {width:1440, height:810};
export const CHAPTER_TYPE = {item:24, note:18, meta:15, section:38};
const defaultMeasure = (text, font) => String(text).length * (+font.match(/([\d.]+)px/)?.[1] || 18) * .53;
const fontSpec = (family, size, weight = 400) => `${weight} ${size}px "${family}"`;
export function chapterNativeWidth(model){
  if(model.horizons.length<=3 || !['grid','board'].includes(model.style || 'grid'))return 1440;
  return Math.max(1440,model.horizons.length*400+96+(model.style==='board' ? Math.max(0,model.horizons.length-1)*36 : 210));
}
// Only a generated calendar axis earns a date marker; qualitative horizons never do.
export function chapterDatePosition(model,today){
  if(!model.timeAxis || !/^\d{4}-\d{2}-\d{2}$/.test(today||''))return null;
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const t=Date.parse(today+'T00:00:00Z');
  for(const [index,name] of model.horizons.entries()){
    const q=/^Q([1-4]) (\d{4})$/.exec(name),m=/^([A-Z][a-z]{2}) (\d{4})$/.exec(name);
    const month=q?(+q[1]-1)*3:m?months.indexOf(m[1]):-1,year=+(q?.[2]||m?.[2]);
    if(month<0 || !year)continue;
    const start=Date.UTC(year,month,1),end=Date.UTC(year,month+(q?3:1),1);
    if(t>=start && t<end)return {index,fraction:(t-start)/(end-start),label:'Today · '+new Date(t).getUTCDate()+' '+months[new Date(t).getUTCMonth()]};
  }
  return null;
}
export function chapterHero(model){
  const named = model.horizons.findIndex(h => h.toLowerCase() === String(model.focus || '').toLowerCase());
  return named >= 0 ? named : Math.max(0, model.horizons.findIndex((_, h) => model.items.some(i => i.h === h)));
}
export function chapterFacts(model, item, {showLane = true, showRun = true, diff} = {}){
  const facts = [];
  if(showLane && item.lane) facts.push({text:item.lane, kind:'lane'});
  if(item.status) facts.push({text:STATUS_LABEL[item.status] || item.status, kind:'status', status:item.status});
  const tag = cardTag(model, item);
  if(tag) facts.push({text:tag.label, kind:'condition'});
  const ex = item.export;
  const source = model.sourceModel || model;
  const start = ex?.sourceStart ?? item.h;
  const end = ex?.sourceEnd ?? item.h + Math.max(1, item.span || 1) - 1;
  if((showRun && end > start) || item.spanEnd) facts.push({text:'Runs ' + source.horizons[start] + ' — ' + (item.spanEnd || source.horizons[end]), kind:'run'});
  if(!showRun && ex?.continuesBefore) facts.push({text:'Continues from ' + source.horizons[start], kind:'continuation'});
  if(!showRun && ex?.continuesAfter) facts.push({text:'Continues to ' + source.horizons[end], kind:'continuation'});
  if(ex?.fragment?.total > 1){
    if(ex.fragment.index > 0) facts.push({text:'Continued', kind:'continuation'});
    if(ex.fragment.index < ex.fragment.total - 1) facts.push({text:'Continues on the next slide', kind:'continuation'});
  }
  if(ex?.dropped) facts.push({text:'Dropped', kind:'change'});
  const badge = item.worldState !== 'dropped' && diff?.badge?.(item);
  if(badge) facts.push({text:badge.label, kind:'change'});
  return facts;
}

export function layoutChapter(model, ctx = {}){
  const measure = ctx.measure || defaultMeasure;
  const type = resolveTypography(model);
  const style = ctx.style || model.style || 'grid';
  const width = ctx.width || (ctx.slide ? 1440 : chapterNativeWidth(model));
  const phone = width < 520;
  const margin = phone ? 20 : style === 'register' ? 128 : 48;
  // The time grid's accent bars sit 14 left of the margin, so its right edge does the same: left margin equals right margin.
  const rightPad = phone ? 20 : style === 'grid' ? margin - 14 : style === 'register' ? margin : 48;
  const inner = width - margin - rightPad;
  const gap = phone ? 24 : 36;
  // Density is a property of the whole plan, so every slide of a set (including a comparison's dropped-work slides) agrees on it.
  const planItems = ctx.compactItems ?? (ctx.sourceModel || model).items.length;
  const compactSlide=ctx.slide && planItems > 8;
  // One scale per slide set (ctx.scale): the body type and its spacing scale together, while the
  // title block and footer keep the base sizes, so furniture never moves between slides.
  const k = ctx.slide ? ctx.scale || 1 : 1;
  const q = v => ctx.slide ? Math.round(v * k * 4) / 4 : v;
  const sp = v => ctx.slide ? Math.round(v * k) : v;
  const metaBase = phone ? 12 : compactSlide ? 14 : CHAPTER_TYPE.meta;
  const noteBase = phone ? 16 : compactSlide ? 16 : CHAPTER_TYPE.note;
  const meta = q(metaBase);
  const itemSize = q(phone ? 20 : compactSlide ? 20 : style === 'grid' ? 22 : CHAPTER_TYPE.item);
  const noteSize = q(noteBase);
  const headingSize = q(phone ? 32 : compactSlide ? 32 : CHAPTER_TYPE.section);
  const addSpace = ctx.edit && !ctx.slide ? 48 : 0;
  const rows = [], sections = [], panels = [], lines = [], header = [], dropzones = [];
  let headerBand = null;   // the column/axis header a printed continuation repeats
  const dense = planItems > 8;
  // Dense exports use the reviewed 20/16/14 type floor and tighter framing.
  // These sizes are fixed: pagination never shrinks text to force a fit.
  const compactGrid=compactSlide && style==='grid';
  let y = phone ? 28 : compactSlide ? 32 : 52;
  const focusModel = ctx.slide ? model : (ctx.sourceModel || model);
  const hero = chapterHero(focusModel);
  const heroName = focusModel.horizons[hero];
  const localHero = Math.max(0, model.horizons.indexOf(heroName));
  // A Focus slide with nothing for the rail has no rail (the paper takes the full width), but its title block and
  // footer sit where they do on the slides that have one: they are measured as if the rail were there.
  const hasRail = style === 'focus' && !phone && model.horizons.length > 1;
  const headerRail = style === 'focus' && !phone && (hasRail || (ctx.slide && (ctx.sourceModel || model).horizons.length > 1));
  const railColumns=hasRail && !ctx.slide && model.horizons.length>4 ? 2 : 1;
  const railShare = Math.round(inner * (railColumns===2 ? .46 : dense ? .59 : .64)) - gap;
  const heroWidth = hasRail ? railShare : inner;
  const headerWidth = headerRail ? railShare : inner;
  const railXFurniture = headerRail ? margin + railShare + gap : null;
  const railX = hasRail ? margin + heroWidth + gap : null;
  const railWidth = hasRail ? width - railX : 0;
  const text = (value, maxWidth, size, {family = type.body, weight = 400} = {}) => {
    const font = fontSpec(family, size, weight);
    return {text:String(value || ''), lines:wrapText(String(value || ''), font, Math.max(20, maxWidth), measure), font, family, weight, size, step:Math.ceil(size * (compactSlide ? 1.2 : 1.3))};
  };
  const headerText = (value, maxWidth, size, options = {}) => {
    if(!value) return;
    const b = text(value, maxWidth, size, options);
    header.push({...b, x:margin, y, ...options}); y += b.lines.length * b.step;
  };
  const sourceModel = ctx.sourceModel || model;
  const date = model.dateStr === 'off' ? '' : model.dateStr || ctx.today || new Date().toISOString().slice(0,10);
  if(model.headline){
    headerText(model.title || 'Roadmap', headerWidth, metaBase, {weight:600, role:'muted'}); y += phone ? 18 : compactSlide ? 16 : 22;
  }
  let mainSize = phone ? 38 : compactSlide ? 40 : headerRail && !dense ? 78 : dense || style === 'grid' ? 48 : 60;
  const mainWidth=headerRail && !dense ? headerWidth*.82 : headerWidth;
  const mainTitle=model.headline || model.title || 'Your roadmap';
  // Long authored framing spends header space before it takes space from work.
  // Keep the headline prominent, but use a smaller display size when real wrapping demands it.
  if(!phone){
    const story=ctx.diff?.any && model.story ? text(model.story,headerWidth,noteBase) : null;
    const reserve=82+(story?14+story.lines.length*story.step:0);
    while(mainSize>44){
      const b=text(mainTitle,mainWidth,mainSize,{family:type.display,weight:type.displayWeight});
      if(y+b.lines.length*b.step+reserve<=430)break;
      mainSize=Math.max(44,mainSize-8);
    }
  }
  headerText(mainTitle, mainWidth, mainSize,
    {family:type.display, weight:type.displayWeight, role:'ink', edit:model.headline ? 'headline' : null});
  y += phone ? 12 : compactSlide ? 8 : 20;
  headerText([date, ctx.diff?.since ? 'Compared with ' + ctx.diff.since : ''].filter(Boolean).join(' · '), headerWidth, metaBase, {role:'muted'});
  if(ctx.diff?.any && model.story){ y += 14; headerText(model.story, headerWidth, noteBase, {role:'muted'}); }
  if(model.basis){
    y += 16;
    const basis = model.basis;
    headerText('Delivery projection · From Paths: ' + basis.source, headerWidth, metaBase, {weight:600,role:'accent'});
    for(const kind of ['answered','assumed']){
      const entries = basis[kind] || [];
      if(entries.length) headerText((kind === 'answered' ? 'Known: ' : 'Assumed: ') + entries.map(e => `${e.key} = ${e.direction} (${e.date})`).join('; '), headerWidth, metaBase, {role:'muted'});
    }
  }
  y += phone ? 30 : compactSlide ? 14 : style === 'grid' ? 24 : 42;
  const bodyTop = y;
  const titleOf = item => item.export?.fragment?.title ?? item.title;
  const noteOf = item => ctx.titlesOnly ? '' : item.export?.fragment?.note ?? item.note;
  function itemRow(item, w, {rail = false, showLane = true, showRun = true, compact = false} = {}){
    const pad = style === 'grid' && !phone ? sp(compactGrid ? 4 : 12) : 0;
    const sideFacts = style === 'focus' && !phone && !rail;
    const contentW = sideFacts ? w * .70 - 24 : w - pad * 2;
    const title = text(titleOf(item), contentW, compact && !compactSlide ? Math.max(itemSize - 2, 21) : itemSize, {weight:500});
    const note = noteOf(item) ? text(noteOf(item), contentW, noteSize) : null;
    const facts = chapterFacts({...model,sourceModel:ctx.sourceModel}, item, {showLane, showRun,diff:ctx.diff});
    if(style === 'focus' && !rail && item.cond && item.status !== 'done'){
      const chain = betChain(sourceModel,item);
      if(chain.length > 1) facts.push({text:'Hinges on ' + chain.map(b=>b.display + ' ('+ b.state +')').join(' → '),kind:'condition'});
    }
    let cursor = pad;
    const blocks = [{...title, y:cursor, kind:'title'}];
    cursor += title.lines.length * title.step;
    if(note){ cursor += sp(compactGrid ? 5 : 7); blocks.push({...note, y:cursor, kind:'note'}); cursor += note.lines.length * note.step; }
    if(facts.length && sideFacts){
      let fy = 0;
      for(const fact of facts){
        const b=text(fact.text,w*.30,meta,{weight:fact.kind === 'status' ? 600 : 400});
        blocks.push({...b,x:w*.70,y:fy,kind:fact.kind,status:fact.status});
        fy += b.lines.length*b.step+6;
      }
      cursor=Math.max(cursor,fy);
    }else if(facts.length){
      cursor += sp(compactGrid ? 6 : 10);
      // Pack metadata by measured width; a long condition gets its own wrapped line.
      let fx = 0, lineHeight = 0;
      for(const fact of facts){
        const b = text(fact.text, w - pad * 2, meta, {weight:fact.kind === 'status' ? 600 : 400});
        const bw = Math.min(w - pad * 2, Math.max(...b.lines.map(t => measure(t,b.font)),0));
        if(fx && fx + bw > w - pad * 2){cursor += lineHeight + sp(5); fx = 0; lineHeight = 0;}
        blocks.push({...b, x:fx, y:cursor, kind:fact.kind, status:fact.status});
        lineHeight = Math.max(lineHeight,b.lines.length * b.step); fx += bw + 24;
      }
      cursor += lineHeight;
    }
    return {item, w, h:Math.max(phone ? 60 : sp(62), cursor + pad + (phone ? 18 : sp(style === 'grid' ? (compactGrid ? 4 : 10) : compactSlide ? 14 : 22))), blocks,pad,rail};
  }
  function horizonHint(name,w){
    const h=sourceModel.horizons.indexOf(name), active=activeCount(sourceModel,h), conditional=condCount(sourceModel,h);
    const count=conditional ? (active-conditional)+' + '+conditional+' conditional' : String(active);
    const label=!ctx.slide && sourceModel.wip>0 && active>sourceModel.wip ? count+' · Over WIP '+sourceModel.wip : '';
    return label ? text(label,w,meta) : null;
  }
  function section(name,x,top,w,h,{rail = false, lane = '', idx = h, lens = false} = {}){
    let label = text(name,w - (phone ? 0 : 32),headingSize,{family:type.display,weight:type.displayWeight});
    if(!phone && label.lines.length>3)label=text(name,w,meta,{weight:500});
    const hint=horizonHint(name,w);
    const s = {name,x,y:top,w,h:label.lines.length * label.step + (compactSlide ? 16 : 25)+(hint?hint.lines.length*hint.step+8:0),label,hint,rail,horizon:h,lane,idx,lens}; sections.push(s);return top + s.h;
  }
  function list(items,x,top,w,options = {}){
    let bottom = top;
    for(const item of items){ const row=itemRow(item,w,options); row.x=x;row.y=bottom;rows.push(row);bottom += row.h + (phone ? 12 : sp(compactSlide ? 10 : 16)); }
    return bottom;
  }
  const allIndices = model.horizons.map((_,i)=>i);
  const boardIndices = style === 'board' && ctx.boardWindow?.indices ? ctx.boardWindow.indices : allIndices;
  if(phone){
    const indices = style === 'board' ? boardIndices : style === 'focus' ? [localHero,...allIndices.filter(i=>i!==localHero)] : allIndices;
    for(const h of indices){
      const top=y;
      y=section(model.horizons[h],margin,y,inner,h,{lens:style==='focus'});
      if(style === 'grid' || style === 'register'){
        const items=model.items.filter(i=>i.h===h);
        const groups=style==='register' && model.group==='outcome' ? registerOutcomeGroups(model,items) : [...new Set(items.map(i=>i.lane || ''))].map(label=>({label,items:items.filter(i=>(i.lane||'')===label)}));
        for(const group of groups){
          const groupItems=group.items;
          if(group.label){ const label=text(group.label,inner,meta,{weight:600});sections.push({name:group.label,x:margin,y,w:inner,h:label.step+12,label,horizon:h,small:true});y+=label.step+12; }
          y=list(groupItems,margin,y,inner,{showLane:false});
        }
      }else y=list(model.items.filter(i=>i.h===h),margin,y,inner);
      const through=style==='grid' ? model.items.filter(i=>i.h<h && i.h+Math.max(1,i.span||1)>h && (i.worldState!=='dropped'||i.status==='doing')) : [];
      if(through.length){const label=text('Also running: '+through.map(i=>i.title).join(' · '),inner,noteSize);sections.push({name:'Also running',x:margin,y,w:inner,h:label.lines.length*label.step+18,label,small:true,horizon:h});y+=label.lines.length*label.step+18;}
      if(!model.items.some(i=>i.h===h) && !through.length){ const label=text('No work planned',inner,noteSize);sections.push({name:'No work planned',x:margin,y,w:inner,h:label.step+24,label,small:true,horizon:h});y+=label.step+24; }
      if(!(style==='register' && model.group==='outcome'))dropzones.push({x:margin,y:top,w:inner,h:Math.max(70,y-top),horizon:h,lane:''}); y+=30+addSpace;
    }
  }else if(style === 'focus'){
    const top=y;
    y=section(model.horizons[localHero],margin,y,heroWidth,localHero,{lens:true});
    y=list(model.items.filter(i=>i.h===localHero),margin,y,heroWidth);
    dropzones.push({x:margin,y:top,w:heroWidth,h:Math.max(y-top,120),horizon:localHero});
    y+=addSpace;
    let ry=52, rowTop=52, rowBottom=52;
    const rw=(railWidth-30-48-gap*(railColumns-1))/railColumns;   // the rail's content ends at the same margin the left edge starts at
    for(const [index,h] of allIndices.filter(i=>i!==localHero).entries()){
      const column=index%railColumns;
      if(column===0)rowTop=rowBottom;
      ry=rowTop;
      const rx=railX+30+column*(rw+gap);
      const top=ry;
      ry=section(model.horizons[h],rx,ry,rw,h,{rail:true,lens:true});
      ry=list(model.items.filter(i=>i.h===h),rx,ry,rw,{rail:true,compact:true});
      if(!model.items.some(i=>i.h===h)){
        const b=text(ctx.slide && sourceModel.items.some(i=>sourceModel.horizons[i.h]===model.horizons[h]) ? 'Continued on another slide' : 'No work planned',rw,noteSize);
        sections.push({name:b.text,x:rx,y:ry,w:rw,h:b.lines.length*b.step,label:b,small:true,rail:true});ry+=b.lines.length*b.step+12;
      }
      dropzones.push({x:rx,y:top,w:rw,h:Math.max(ry-top,90),horizon:h});ry+=24+addSpace;
      rowBottom=Math.max(rowBottom,ry);
    }
    y=Math.max(y,rowBottom);
    if(hasRail) panels.push({x:railX,y:0,w:railWidth,h:y+26,role:'rail'});
  }else if(style === 'board'){
    const cw=(inner-gap*(boardIndices.length-1))/Math.max(1,boardIndices.length);
    const top=y; let bottom=y;
    boardIndices.forEach((h,index)=>{
      const x=margin+index*(cw+gap);
      let cy=section(model.horizons[h],x,top,cw,h);
      headerBand={y0:top,y1:Math.max(headerBand?.y1||0,cy)};
      cy=list(model.items.filter(i=>i.h===h),x,cy,cw);
      // On a slide a column with nothing to show says why, rather than standing empty
      if(ctx.slide && !model.items.some(i=>i.h===h)){
        const here=sourceModel.horizons[sourceModel.horizons.indexOf(model.horizons[h])];
        const b=text(sourceModel.items.some(i=>sourceModel.horizons[i.h]===here)?'Shown on another slide':'No work planned',cw,noteBase);
        sections.push({name:b.text,x,y:cy,w:cw,h:b.lines.length*b.step,label:b,small:true});cy+=b.lines.length*b.step+12;
      }
      bottom=Math.max(bottom,cy);dropzones.push({x,y:top,w:cw,h:Math.max(120,cy-top),horizon:h});
    });
    y=bottom+addSpace;
    if(boardIndices.includes(0))panels.push({x:margin-14,y:top,w:3,h:Math.max(120,y-top),role:'accent'});
    if(boardIndices.length>1)panels.push({x:margin+(boardIndices.length-1)*(cw+gap)-14,y:top-10,w:cw+28,h:Math.max(160,y-top+10),role:'tint'});
  }else if(style === 'register'){
    panels.push({x:0,y:0,w:88,h:810,role:'spine'});
    const widths=[inner*.43,inner*.13,inner*.13,inner*.31];
    const names=['Initiative & commentary','Workstream','Horizon','Status & condition'];
    let cx=margin;
    headerBand={y0:y-4,y1:y+38};
    names.forEach((name,i)=>{const label=text(name,widths[i]-20,meta,{weight:600});sections.push({name,x:cx,y,w:widths[i],h:26,label,small:true});cx+=widths[i];});y+=38;
    if(ctx.slide && model.group!=='outcome'){
      const empty=model.horizons.filter(name=>!sourceModel.items.some(i=>sourceModel.horizons[i.h]===name));
      if(empty.length){
        const label=text(empty.join(', ')+' · No work planned',inner,meta);
        sections.push({name:label.text,x:margin,y,w:inner,h:label.lines.length*label.step+24,label,small:true});
        y+=label.lines.length*label.step+24;
      }
    }
    const groups=model.group==='outcome' ? registerOutcomeGroups(model,model.items) : allIndices.map(h=>({h,items:model.items.filter(i=>i.h===h)}));
    for(const group of groups){
      const items=group.items;
      if(!items.length){
        // A continuation contains only this page's rows. Work elsewhere in the
        // complete plan is not an empty horizon and must not consume placeholder space.
        if(ctx.slide)continue;
        if(model.group!=='outcome'){const label=text(model.horizons[group.h]+' · No work planned',inner,meta);sections.push({name:label.text,x:margin,y,w:inner,h:44,label,small:true});dropzones.push({x:margin,y,w:inner,h:44,horizon:group.h});y+=64+addSpace;}
        continue;
      }
      const top=y;
      if(model.group!=='outcome'){
        const index=sourceModel.horizons.indexOf(model.horizons[group.h]);
        const label=text(String(index+1).padStart(2,'0'),60,24,{weight:400});
        sections.push({name:label.text,x:24,y:top+6,w:60,h:40,label,small:true,rail:true});
      }
      if(model.group==='outcome'){const label=text(group.label,inner,24,{family:type.display,weight:type.displayWeight});sections.push({name:group.label,x:margin,y,w:inner,h:label.step+18,label,small:true});y+=label.step+18;}
      for(const item of items){
        const b=itemRow(item,widths[0]-28,{showLane:false,showRun:false});
        b.blocks=b.blocks.filter(t=>t.kind==='title'||t.kind==='note');
        let maxH=Math.max(...b.blocks.map(t=>t.y+t.lines.length*t.step),24)+(compactSlide?14:22);
        const wideFields=[];
        let x=widths[0];
        const values=[item.lane || '—',model.horizons[item.h],chapterFacts({...model,sourceModel:ctx.sourceModel},item,{showLane:false,diff:ctx.diff})];
        values.forEach((value,index)=>{
          const facts=Array.isArray(value)?value:[{text:value,kind:index===0?'lane':'horizon'}];let fy=(b.blocks.find(t=>t.kind==='title')?.size||meta)-meta;   // the metadata shares the title's baseline
          for(const fact of facts){let t=text(fact.text,widths[index+1]-24,meta,{weight:fact.kind==='status'?600:400});if(index<2 && t.lines.length>5){wideFields.push({...text((index===0?'Workstream: ':'Horizon: ')+fact.text,inner,meta),kind:fact.kind});t=text('See below',widths[index+1]-24,meta);}b.blocks.push({...t,x,y:fy,kind:fact.kind,status:fact.status});fy+=t.lines.length*t.step+5;}
          maxH=Math.max(maxH,fy+(compactSlide?14:22));x+=widths[index+1];
        });
        for(const field of wideFields){b.blocks.push({...field,x:0,y:maxH});maxH+=field.lines.length*field.step+12;}
        b.x=margin;b.y=y;b.w=inner;b.h=maxH;b.register=true;rows.push(b);y+=maxH+6;
      }
      if(model.group!=='outcome'){dropzones.push({x:margin,y:top,w:inner,h:y-top,horizon:group.h});y+=addSpace;}
    }
  }else{
    const slideLanes = l => model.items.some(i=>i.lane===l);
    const lanes=ctx.slide && model.items.length ? (model.exportLanes || model.lanes || ['']).filter(slideLanes) : model.exportLanes || (ctx.slide ? (model.lanes || ['']).filter(slideLanes) : model.lanes?.length ? model.lanes : ['']);
    // On a slide the rail and the column-header band come from the whole plan, not this slide's
    // lanes and horizons, so the furniture sits in the same place on every slide of the set.
    const railLanes=ctx.slide ? [...new Set(sourceModel.items.map(i=>i.lane||''))] : lanes;
    const longLanes=railLanes.some(l=>text(l,182,28,{family:type.display}).lines.length>3);
    const rail=!longLanes && railLanes.some(Boolean)?Math.min(210,inner*.16):0;
    const gx=margin+rail, cw=(inner-rail)/model.horizons.length;
    let headerH=0;
    if(ctx.slide){
      const cwMin=(inner-rail)/Math.max(model.horizons.length,ctx.windowSize||0,1);
      for(const name of sourceModel.horizons){
        let label=text(name,cwMin-28,24,{family:type.display,weight:type.displayWeight});
        if(label.lines.length>3)label=text(name,cwMin-28,meta,{weight:500});
        headerH=Math.max(headerH,label.lines.length*label.step+24);
      }
      // room for a Today label at the set's scale, on every slide so the band never moves
      if(sourceModel.timeAxis && sourceModel.dateStr!=='off')headerH+=Math.max(0,meta-metaBase)+2;
    }
    allIndices.forEach(h=>{
      let label=text(model.horizons[h],cw-28,24,{family:type.display,weight:type.displayWeight});
      if(label.lines.length>3)label=text(model.horizons[h],cw-28,meta,{weight:500});
      const hint=ctx.edit?horizonHint(model.horizons[h],cw-28):null;
      const height=label.lines.length*label.step+24+(hint?hint.lines.length*hint.step+8:0);
      sections.push({name:model.horizons[h],x:gx+h*cw+12,y,w:cw-24,h:height,label,hint,horizon:h});
      headerH=Math.max(headerH,height);
    });y+=headerH;
    const gridTop=y;
    headerBand={y0:gridTop-headerH,y1:gridTop};
    const laneLabelRows=[];   // a long lane name sits across the columns, so the column rules stop short of it
    for(const lane of lanes){
      const top=y, tracks=[];
      if(lane && longLanes){const label=text(lane,inner,18,{weight:500});sections.push({name:lane,x:margin,y,w:inner,h:label.lines.length*label.step,label,small:true});laneLabelRows.push([y,y+label.lines.length*label.step+8]);y+=label.lines.length*label.step+18;}
      const items=model.items.filter(i=>i.lane===lane).slice().sort((a,b)=>a.h-b.h||a.srcLine-b.srcLine);
      for(const item of items){
        const span=Math.max(1,Math.min(item.span||1,model.horizons.length-item.h));
        const row=itemRow(item,cw*span-20,{showLane:false,showRun:false});
        let track=tracks.find(t=>t.end<=item.h);if(!track){track={end:0,rows:[],height:0};tracks.push(track);}
        track.rows.push(row);track.end=item.h+span;track.height=Math.max(track.height,row.h);row.x=gx+item.h*cw+10;
      }
      for(const track of tracks){for(const row of track.rows){row.y=y;row.h=track.height;rows.push(row);} y+=track.height+(compactGrid?4:8);}
      y=Math.max(y,top+80);
      if(lane && !longLanes){const label=text(lane,rail-28,28,{family:type.display,weight:type.displayWeight});sections.push({name:lane,x:margin,y:top+12,w:rail-28,h:label.lines.length*label.step,label,small:true});y=Math.max(y,top+label.lines.length*label.step+28);}
      for(const h of allIndices)dropzones.push({x:gx+h*cw,y:top,w:cw,h:y-top,horizon:h,lane});
      if(lane)panels.push({x:margin-14,y:top+6,w:3,h:Math.max(44,y-top-12),role:'accent'});
      y+=addSpace;lines.push({x:margin-14,y,x2:width-rightPad,y2:y});y+=10;
    }
    if(lanes.length)y-=10; // No trailing lane gap after the final rule.
    [...allIndices,model.horizons.length].forEach(h=>{
      let from=gridTop-headerH;
      for(const [a,b] of [...laneLabelRows,[y,y]]){ if(a>from)lines.push({x:gx+h*cw,y:from,x2:gx+h*cw,y2:a}); from=Math.max(from,b); }
    });   // the last column is closed like the others
    // Today is a label with a short tick under it in the header band; nothing runs through the cards.
    const marker=model.dateStr==='off'?null:chapterDatePosition(model,ctx.today || new Date().toISOString().slice(0,10));
    if(marker){const x=gx+(marker.index+marker.fraction)*cw;lines.push({x,y:gridTop-5,x2:x,y2:gridTop-1,role:'accent'});const label=text(marker.label,cw-20,meta,{weight:500});const labelW=Math.max(...label.lines.map(t=>measure(t,label.font)),0),colL=gx+marker.index*cw;
      // The label sits inside its own column, so no column rule runs through it.
      const lx=cw-24>=labelW?Math.min(colL+cw-12-labelW,Math.max(colL+12,x-40)):Math.min(width-margin-cw,Math.max(gx,x-40));
      sections.push({name:marker.label,x:lx,y:gridTop-9-label.size,w:cw-20,h:20,label,small:true,role:'accent'});}
  }
  if(ctx.slide && !model.items.length && (style==='board'||style==='grid')){
    const label=text('No work planned in these horizons',inner,itemSize,{weight:500});
    y+=32;sections.push({name:label.text,x:margin,y,w:inner,h:label.lines.length*label.step,label,small:true});
    y+=label.lines.length*label.step;
  }
  const authored=resolveVerdict(sourceModel.verdict,{line:'',fig:''});
  let verdictBlock=null;
  if(authored?.line){
    verdictBlock=text(authored.line,headerWidth,noteBase,{weight:500});
    // A slide pins the verdict above the footer so it sits in the same place on every slide.
    if(!ctx.slide){ y+=22; header.push({...verdictBlock,x:margin,y,role:'ink',kind:'verdict'});y+=verdictBlock.lines.length*verdictBlock.step; }
  }
  if(!ctx.slide && ctx.diff?.dropped?.length){
    y+=24; const b=text('Dropped: '+ctx.diff.dropped.join(' · '),heroWidth,noteBase);
    header.push({...b,x:margin,y,role:'muted',kind:'dropped'}); y+=b.lines.length*b.step;
  }
  // Empty states are still composed artifacts with meaningful horizon structure.
  let bottom=Math.max(y,bodyTop+100);
  const footerY=bottom+24;
  // A picture is sized to its content: the house margin (the top margin) below the last paint, no band of empty paper.
  // Margins are measured on ink, not boxes: the bottom margin equals the top margin (the first text's ink top).
  const inkBottomOf=(blk,top)=>top+blk.size+(blk.lines.length-1)*blk.step+blk.size*.22;
  const topInk=Math.min(...header.filter(b=>b.kind!=='verdict'&&b.kind!=='dropped').map(b=>b.y+b.size*.26));
  const lastInk=Math.max(0,
    ...lines.map(l=>Math.max(l.y,l.y2)),
    ...rows.map(r=>r.y+r.h),   // a card's bottom, or the rule that closes a ledger row
    ...panels.filter(p=>p.role!=='rail'&&p.role!=='spine').map(p=>p.y+p.h),
    ...sections.map(x=>inkBottomOf(x.label,x.y)),
    ...header.map(b=>inkBottomOf(b,b.y)));
  const height=ctx.slide ? CHAPTER_SLIDE.height : phone ? Math.max(0,footerY+48) : Math.ceil(Math.max(lastInk,bodyTop+100) + topInk);   // whole pixels: a fractional canvas edge paints half-transparent
  const verdictH=verdictBlock ? verdictBlock.lines.length*verdictBlock.step : 0;
  const bodyBottom=ctx.slide ? (verdictBlock ? height-72-verdictH-22 : height-60) : null;
  if(ctx.slide && verdictBlock)header.push({...verdictBlock,x:margin,y:height-72-verdictH,role:'ink',kind:'verdict'});
  for(const p of panels)if(p.role==='rail'||p.role==='spine')p.h=height;
  const allText=[...header,...sections.map(s=>({...s.label,x:s.x,y:s.y})),...rows.flatMap(r=>r.blocks.map(b=>({...b,x:r.x+r.pad+(b.x||0),y:r.y+b.y})))];
  const fits=(ctx.slide ? bottom<=bodyBottom : footerY+36<=height) && allText.every(b=>b.x>=0 && b.x+Math.max(...b.lines.map(t=>measure(t,b.font)),0)<=width+1);
  return {style,width,height,phone,type,margin,bodyTop,rows,sections,panels,lines,header,dropzones,footerY:ctx.slide?height-30:height-26,fits,railXFurniture,headerBand,contentBottom:bottom,inkBottom:Math.max(bodyTop,...rows.map(r=>r.y+r.h),...sections.filter(x=>!x.small||x.name).map(x=>x.y+(x.h||0))),bodyBottom,scale:k,boardIndices};
}
