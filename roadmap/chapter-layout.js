/* Chapter geometry. The same measured rows feed editing, SVG and slide pages.
   Coordinates use a 1440-unit composition; slides scale it to 1920×1080. */
import {wrapText} from '../assets/svg.js';
import {STATUS_LABEL, activeCount, condCount} from './parse.js';
import {cardTag, registerOutcomeGroups, betChain} from './cond-parts.js';
import {resolveTypography} from './chapter-fonts.js';
import {resolveVerdict} from '../assets/verdict.js';

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
  if(ex?.fragment?.total > 1) facts.push({text:'R' + String((ex.sourceIndex ?? 0) + 1).padStart(2,'0') + ' · Item part ' + (ex.fragment.index + 1) + ' of ' + ex.fragment.total, kind:'continuation'});
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
  const inner = width - margin - (phone ? 20 : 48);
  const gap = phone ? 24 : 36;
  const meta = phone ? 12 : CHAPTER_TYPE.meta;
  const itemSize = phone ? 20 : style === 'grid' ? 22 : CHAPTER_TYPE.item;
  const noteSize = phone ? 16 : CHAPTER_TYPE.note;
  const headingSize = phone ? 32 : CHAPTER_TYPE.section;
  const addSpace = ctx.edit && !ctx.slide ? 48 : 0;
  const rows = [], sections = [], panels = [], lines = [], header = [], dropzones = [];
  const dense = (ctx.sourceModel || model).items.length > 8;
  // Dense slide sets recover framing and padding before spending another slide;
  // title, commentary and metadata type sizes remain unchanged.
  const compactSlide=ctx.slide && dense;
  const compactGrid=compactSlide && style==='grid';
  let y = phone ? 28 : compactSlide ? 40 : 52;
  const focusModel = ctx.slide ? model : (ctx.sourceModel || model);
  const hero = chapterHero(focusModel);
  const heroName = focusModel.horizons[hero];
  const localHero = Math.max(0, model.horizons.indexOf(heroName));
  const hasRail = style === 'focus' && !phone && model.horizons.length > 1;
  const railColumns=hasRail && !ctx.slide && model.horizons.length>4 ? 2 : 1;
  const heroWidth = hasRail ? Math.round(inner * (railColumns===2 ? .46 : dense ? .59 : .64)) - gap : inner;
  const railX = hasRail ? margin + heroWidth + gap : null;
  const railWidth = hasRail ? width - railX : 0;
  const text = (value, maxWidth, size, {family = type.body, weight = 400} = {}) => {
    const font = fontSpec(family, size, weight);
    return {text:String(value || ''), lines:wrapText(String(value || ''), font, Math.max(20, maxWidth), measure), font, family, weight, size, step:Math.ceil(size * 1.3)};
  };
  const headerText = (value, maxWidth, size, options = {}) => {
    if(!value) return;
    const b = text(value, maxWidth, size, options);
    header.push({...b, x:margin, y, ...options}); y += b.lines.length * b.step;
  };
  const sourceModel = ctx.sourceModel || model;
  const date = model.dateStr === 'off' ? '' : model.dateStr || ctx.today || new Date().toISOString().slice(0,10);
  if(model.headline){
    headerText(model.title || 'Roadmap', heroWidth, meta, {weight:600, role:'muted'}); y += phone ? 18 : compactSlide ? 16 : 22;
  }
  let mainSize = phone ? 38 : hasRail && !dense ? 78 : dense || style === 'grid' ? 48 : 60;
  const mainWidth=hasRail && !dense ? heroWidth*.82 : heroWidth;
  const mainTitle=model.headline || model.title || 'Your roadmap';
  // Long authored framing spends header space before it takes space from work.
  // Keep the headline prominent, but use a smaller display size when real wrapping demands it.
  if(!phone){
    const story=ctx.diff?.any && model.story ? text(model.story,heroWidth,noteSize) : null;
    const reserve=82+(story?14+story.lines.length*story.step:0);
    while(mainSize>44){
      const b=text(mainTitle,mainWidth,mainSize,{family:type.display,weight:type.displayWeight});
      if(y+b.lines.length*b.step+reserve<=430)break;
      mainSize=Math.max(44,mainSize-8);
    }
  }
  headerText(mainTitle, mainWidth, mainSize,
    {family:type.display, weight:type.displayWeight, role:'ink', edit:model.headline ? 'headline' : null});
  y += phone ? 12 : compactSlide ? 14 : 20;
  headerText([date, ctx.diff?.since ? 'Compared with ' + ctx.diff.since : ''].filter(Boolean).join(' · '), heroWidth, meta, {role:'muted'});
  if(ctx.diff?.any && model.story){ y += 14; headerText(model.story, heroWidth, noteSize, {role:'muted'}); }
  if(model.basis){
    y += 16;
    const basis = model.basis;
    headerText('Delivery projection · From Paths: ' + basis.source, heroWidth, meta, {weight:600,role:'accent'});
    for(const kind of ['answered','assumed']){
      const entries = basis[kind] || [];
      if(entries.length) headerText((kind === 'answered' ? 'Known: ' : 'Assumed: ') + entries.map(e => `${e.key} = ${e.direction} (${e.date})`).join('; '), heroWidth, meta, {role:'muted'});
    }
  }
  y += phone ? 30 : compactSlide ? 18 : style === 'grid' ? 24 : 42;
  const bodyTop = y;
  const titleOf = item => item.export?.fragment?.title ?? item.title;
  const noteOf = item => ctx.titlesOnly ? '' : item.export?.fragment?.note ?? item.note;
  function itemRow(item, w, {rail = false, showLane = true, showRun = true, compact = false} = {}){
    const pad = style === 'grid' && !phone ? compactGrid ? 8 : 12 : 0;
    const sideFacts = style === 'focus' && !phone && !rail;
    const contentW = sideFacts ? w * .70 - 24 : w - pad * 2;
    const title = text(titleOf(item), contentW, compact ? Math.max(itemSize - 2, 21) : itemSize, {weight:500});
    const note = noteOf(item) ? text(noteOf(item), contentW, noteSize) : null;
    const facts = chapterFacts({...model,sourceModel:ctx.sourceModel}, item, {showLane, showRun,diff:ctx.diff});
    if(style === 'focus' && !rail && item.cond && item.status !== 'done'){
      const chain = betChain(sourceModel,item);
      if(chain.length > 1) facts.push({text:'Hinges on ' + chain.map(b=>b.display + ' ('+ b.state +')').join(' → '),kind:'condition'});
    }
    let cursor = pad;
    const blocks = [{...title, y:cursor, kind:'title'}];
    cursor += title.lines.length * title.step;
    if(note){ cursor += compactGrid ? 5 : 7; blocks.push({...note, y:cursor, kind:'note'}); cursor += note.lines.length * note.step; }
    if(facts.length && sideFacts){
      let fy = 0;
      for(const fact of facts){
        const b=text(fact.text,w*.30,meta,{weight:fact.kind === 'status' ? 600 : 400});
        blocks.push({...b,x:w*.70,y:fy,kind:fact.kind,status:fact.status});
        fy += b.lines.length*b.step+6;
      }
      cursor=Math.max(cursor,fy);
    }else if(facts.length){
      cursor += compactGrid ? 8 : 10;
      // Pack metadata by measured width; a long condition gets its own wrapped line.
      let fx = 0, lineHeight = 0;
      for(const fact of facts){
        const b = text(fact.text, w - pad * 2, meta, {weight:fact.kind === 'status' ? 600 : 400});
        const bw = Math.min(w - pad * 2, Math.max(...b.lines.map(t => measure(t,b.font)),0));
        if(fx && fx + bw > w - pad * 2){cursor += lineHeight + 5; fx = 0; lineHeight = 0;}
        blocks.push({...b, x:fx, y:cursor, kind:fact.kind, status:fact.status});
        lineHeight = Math.max(lineHeight,b.lines.length * b.step); fx += bw + 24;
      }
      cursor += lineHeight;
    }
    return {item, w, h:Math.max(phone ? 60 : 62, cursor + pad + (phone ? 18 : style === 'grid' ? 10 : compactSlide ? 14 : 22)), blocks,pad,rail};
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
    for(const item of items){ const row=itemRow(item,w,options); row.x=x;row.y=bottom;rows.push(row);bottom += row.h + (phone ? 12 : compactSlide ? 10 : 16); }
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
    const rw=(railWidth-60-gap*(railColumns-1))/railColumns;
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
      cy=list(model.items.filter(i=>i.h===h),x,cy,cw);
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
          const facts=Array.isArray(value)?value:[{text:value,kind:index===0?'lane':'horizon'}];let fy=0;
          for(const fact of facts){let t=text(fact.text,widths[index+1]-24,meta,{weight:fact.kind==='status'?600:400});if(index<2 && t.lines.length>5){wideFields.push({...text((index===0?'Workstream: ':'Horizon: ')+fact.text,inner,meta),kind:fact.kind});t=text('See below',widths[index+1]-24,meta);}b.blocks.push({...t,x,y:fy,kind:fact.kind,status:fact.status});fy+=t.lines.length*t.step+5;}
          maxH=Math.max(maxH,fy+(compactSlide?14:22));x+=widths[index+1];
        });
        for(const field of wideFields){b.blocks.push({...field,x:0,y:maxH});maxH+=field.lines.length*field.step+12;}
        b.x=margin;b.y=y;b.w=inner;b.h=maxH;b.register=true;rows.push(b);y+=maxH+6;
      }
      if(model.group!=='outcome'){dropzones.push({x:margin,y:top,w:inner,h:y-top,horizon:group.h});y+=addSpace;}
    }
  }else{
    const lanes=model.exportLanes || (ctx.slide ? (model.lanes || ['']).filter(l=>model.items.some(i=>i.lane===l)) : model.lanes?.length ? model.lanes : ['']);
    const longLanes=lanes.some(l=>text(l,182,28,{family:type.display}).lines.length>3);
    const rail=!longLanes && lanes.some(Boolean)?Math.min(210,inner*.16):0;
    const gx=margin+rail, cw=(inner-rail)/model.horizons.length;
    let headerH=0;
    allIndices.forEach(h=>{
      let label=text(model.horizons[h],cw-28,24,{family:type.display,weight:type.displayWeight});
      if(label.lines.length>3)label=text(model.horizons[h],cw-28,meta,{weight:500});
      const hint=ctx.edit?horizonHint(model.horizons[h],cw-28):null;
      const height=label.lines.length*label.step+24+(hint?hint.lines.length*hint.step+8:0);
      sections.push({name:model.horizons[h],x:gx+h*cw+12,y,w:cw-24,h:height,label,hint,horizon:h});
      headerH=Math.max(headerH,height);
    });y+=headerH;
    const gridTop=y;
    for(const lane of lanes){
      const top=y, tracks=[];
      if(lane && longLanes){const label=text(lane,inner,18,{weight:500});sections.push({name:lane,x:margin,y,w:inner,h:label.lines.length*label.step,label,small:true});y+=label.lines.length*label.step+18;}
      const items=model.items.filter(i=>i.lane===lane).slice().sort((a,b)=>a.h-b.h||a.srcLine-b.srcLine);
      for(const item of items){
        const span=Math.max(1,Math.min(item.span||1,model.horizons.length-item.h));
        const row=itemRow(item,cw*span-20,{showLane:false,showRun:false});
        let track=tracks.find(t=>t.end<=item.h);if(!track){track={end:0,rows:[],height:0};tracks.push(track);}
        track.rows.push(row);track.end=item.h+span;track.height=Math.max(track.height,row.h);row.x=gx+item.h*cw+10;
      }
      for(const track of tracks){for(const row of track.rows){row.y=y;row.h=track.height;rows.push(row);} y+=track.height+(compactGrid?6:8);}
      y=Math.max(y,top+80);
      if(lane && !longLanes){const label=text(lane,rail-28,28,{family:type.display,weight:type.displayWeight});sections.push({name:lane,x:margin,y:top+12,w:rail-28,h:label.lines.length*label.step,label,small:true});y=Math.max(y,top+label.lines.length*label.step+28);}
      for(const h of allIndices)dropzones.push({x:gx+h*cw,y:top,w:cw,h:y-top,horizon:h,lane});
      if(lane)panels.push({x:margin-14,y:top+6,w:3,h:Math.max(44,y-top-12),role:'accent'});
      y+=addSpace;lines.push({x:margin,y,x2:width,y2:y});y+=10;
    }
    if(lanes.length)y-=10; // No trailing lane gap after the final rule.
    allIndices.forEach(h=>lines.push({x:gx+h*cw,y:gridTop-headerH,x2:gx+h*cw,y2:y}));
    const marker=model.dateStr==='off'?null:chapterDatePosition(model,ctx.today || new Date().toISOString().slice(0,10));
    if(marker){const x=gx+(marker.index+marker.fraction)*cw;lines.push({x,y:gridTop-4,x2:x,y2:y,role:'accent'});const label=text(marker.label,cw-20,meta,{weight:500});sections.push({name:marker.label,x:Math.min(width-margin-cw,Math.max(gx,x-40)),y:gridTop-24,w:cw-20,h:20,label,small:true,role:'accent'});}
  }
  if(ctx.slide && !model.items.length && (style==='board'||style==='grid')){
    const label=text('No work planned in these horizons',inner,itemSize,{weight:500});
    y+=32;sections.push({name:label.text,x:margin,y,w:inner,h:label.lines.length*label.step,label,small:true});
    y+=label.lines.length*label.step;
  }
  const authored=resolveVerdict(sourceModel.verdict,{line:'',fig:''});
  if(authored?.line){
    y+=22; const b=text(authored.line,heroWidth,noteSize,{weight:500});
    header.push({...b,x:margin,y,role:'ink',kind:'verdict'});y+=b.lines.length*b.step;
  }
  if(!ctx.slide && ctx.diff?.dropped?.length){
    y+=24; const b=text('Dropped: '+ctx.diff.dropped.join(' · '),heroWidth,noteSize);
    header.push({...b,x:margin,y,role:'muted',kind:'dropped'}); y+=b.lines.length*b.step;
  }
  // Empty states are still composed artifacts with meaningful horizon structure.
  let bottom=Math.max(y,bodyTop+100);
  const footerY=bottom+24;
  const height=ctx.slide ? CHAPTER_SLIDE.height : Math.max(phone?0:style==='focus'?760:650,footerY+48);
  for(const p of panels)if(p.role==='rail'||p.role==='spine')p.h=height;
  const allText=[...header,...sections.map(s=>({...s.label,x:s.x,y:s.y})),...rows.flatMap(r=>r.blocks.map(b=>({...b,x:r.x+r.pad+(b.x||0),y:r.y+b.y})))];
  const fits=footerY+36<=height && allText.every(b=>b.x>=0 && b.x+Math.max(...b.lines.map(t=>measure(t,b.font)),0)<=width+1);
  return {style,width,height,phone,type,margin,bodyTop,rows,sections,panels,lines,header,dropzones,footerY:ctx.slide?height-30:height-26,fits,contentBottom:bottom,boardIndices};
}
