/* One measured chronology for the Observatory's live views and complete decks.
   Starts are observations; only the P50–P90 whisker describes finish uncertainty. */
import {esc, wrapText, btnAttrs} from '../assets/svg.js';
import {mix} from '../assets/series.js';
import {chapterColors} from '../assets/chapter-colors.js';
import {resolveTypography,fontStack} from '../assets/chapter-fonts.js';
import {fmtDay, dayToISO} from './parse.js';
import {timingFacts} from './timing.js';
import {decisionLead, leadReceipt, leadDuration} from './lrm.js';

const DAY=86400000;
const e=v=>esc(String(v??''));
const n=v=>Math.round(v*100)/100;
const attrs=o=>Object.entries(o).filter(([,v])=>v!=null).map(([k,v])=>` ${k}="${e(k==='font-family'?fontStack(v):v)}"`).join('');
const rect=(x,y,w,h,fill,extra={})=>`<rect${attrs({...extra,x:n(x),y:n(y),width:n(w),height:n(h),fill})}/>`;
const line=(x,y,x2,y2,stroke,extra={})=>`<line${attrs({...extra,x1:n(x),y1:n(y),x2:n(x2),y2:n(y2),stroke,'stroke-width':extra['stroke-width']||1})}/>`;
const circle=(x,y,r,fill,extra={})=>`<circle${attrs({...extra,cx:n(x),cy:n(y),r,fill})}/>`;
const key=it=>it.identity||it.key||(it.lane+'|'+it.label).toLowerCase().replace(/\s+/g,' ').trim();
const font=(family,size,weight=400)=>`${weight} ${size}px "${family}"`;
const fallback=(s,f)=>String(s).length*(Number(f.match(/([\d.]+)px/)?.[1])||16)*.55;
export const observatoryColors=(model,ctx={})=>{const c=chapterColors(model,ctx);return {...c,err:c.status.blocked,card:c.bg};};
const text=(x,y,value,size,fill,extra={})=>`<text${attrs({x:n(x),y:n(y),'font-size':size,fill,...extra})}>${e(value)}</text>`;
const date=(it,end='p50')=>fmtDay(it[end],{month:(it.rawDates||'').split(/\s*(?:\.\.|–|—)\s*/)[end==='p90'?1:0]?.trim().length===7});
const finish=it=>it.status==='fixed'?`${date(it)} · Fixed`:it.status==='done'?`${date(it)} · Done`:it.single?`${date(it)} · Range needed`:date(it)===date(it,'p90')?`Finish ${date(it)}`:`Finish ${date(it)} – ${date(it,'p90')}`;
const signed=days=>`${days>0?'+':'−'}${Math.abs(days)} ${Math.abs(days)===1?'day':'days'}`;

// The register's two date columns; their wrapped height is part of the row.
const p90Label=it=>it.single?it.status==='fixed'?'Fixed':it.status==='done'?'Done':'Range needed':date(it,'p90');
function state(it,today){return it.status==='fixed'&&it.p50<today?'OVERDUE':it.status==='risk'?'RISK':it.ghost?'DROPPED':'';}
function block(value,w,size,type,measure,{weight=400,family=type.body,kind='text'}={}){
  const lines=wrapText(String(value||''),font(family,size,weight),Math.max(20,w),measure);
  return {lines,size,step:Math.ceil(size*1.25),weight,family,kind};
}
function paintBlock(b,x,y,fill,extra={}){
  return b.lines.map((s,i)=>text(x,y+b.size+i*b.step,s,b.size,b.color||fill,{'font-family':b.family,'font-weight':b.weight,...extra})).join('');
}
function monthStart(d){const a=new Date(d*DAY);return Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),1)/DAY;}
function addMonths(d,count){const a=new Date(d*DAY);return Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+count,1)/DAY;}
export function observatoryDomain(model,today,diff){
  const old=diff?[...diff.byKey.values()].flatMap(it=>[it.oldP50,it.oldP90,it.oldStarted]):[];
  const days=[today,...model.items.flatMap(it=>[it.p50,it.p90,it.started,decisionLead(it)?.day]),
    ...(diff?.droppedItems||[]).flatMap(it=>[it.p50,it.p90,it.started]),...old].filter(Number.isFinite);
  const min=Math.min(...days),max=Math.max(...days);
  return {lo:monthStart(min),hi:Math.max(addMonths(monthStart(max),1),addMonths(monthStart(min),2))};
}
/* One uniform step for the whole axis (A1): the smallest of every month, two, a quarter, half a year, a
   year, then multiples of years whose widest label (month or year) clears its neighbour. Labels are never
   dropped one at a time. The year sits on its own line under the first tick and under each January (A2),
   so no month label has to carry it. */
const MONTH_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const AXIS_STEPS=[1,2,3,6,12,24,60,120];
function axisTicks(domain,width,measure,type,size){
  const f=font(type.body,size),span=domain.hi-domain.lo;
  let result=null;
  for(const step of AXIS_STEPS){
    const list=[];
    for(let d=monthStart(domain.lo);d<domain.hi;d=addMonths(d,1)){
      const dt=new Date(d*DAY),m=dt.getUTCMonth(),year=dt.getUTCFullYear(),index=year*12+m;
      if(step>=12?(m!==0||year%(step/12)!==0):index%step!==0)continue;
      const label=step>=12?String(year):step===3?'Q'+(Math.floor(m/3)+1):MONTH_NAMES[m];
      list.push({day:d,label,year,month:m,x:(d-domain.lo)/span*width});
    }
    list.forEach((t,i)=>{t.yearLabel=step<12&&(i===0||t.month===0)?String(t.year):'';});
    const widest=Math.max(0,...list.map(t=>Math.max(measure(t.label,f),t.yearLabel?measure(t.yearLabel,f):0)));
    const gap=list.length>1?Math.min(...list.slice(1).map((t,i)=>t.x-list[i].x)):Infinity;
    result={step,ticks:list};
    if(gap>=widest+12)break;
  }
  return result;
}
function entryList(model,diff,style){
  const items=model.items.map(it=>({...it}));
  if(diff?.droppedItems?.length)items.push(...diff.droppedItems.map(it=>({...it,identity:it.key,ghost:true,lane:it.lane||''})));
  const lanes=[...new Set([...model.lanes,...items.map(it=>it.lane)])];
  const ordered=lanes.flatMap(l=>items.filter(it=>it.lane===l));
  if(style!=='decisions')return ordered;
  // Decision clocks get the first reading surface; the remaining forecasts stay visible.
  return [...ordered.filter(it=>decisionLead(it)),...ordered.filter(it=>!decisionLead(it))];
}
export function layoutObservatory(model,ctx={},diff=null,{intent,edit=false,entries,domain}={}){
  intent=intent||ctx.intent||(ctx.width&&ctx.width<520?'live-narrow':'live-wide');
  const slide=intent==='presentation',phone=!slide&&intent!=='native'&&(intent==='live-narrow'||ctx.width<520);
  const W=slide?1920:phone?Math.max(280,ctx.width||390):intent==='native'?1442:Math.max(760,ctx.width||1442);
  const M=slide?64:phone?20:32,type=resolveTypography(model),measure=ctx.measure||fallback;
  const style=model.style||'field',today=model.today??ctx.today??Math.floor(Date.now()/DAY);
  // One scale per slide set: the rows' type and spacing scale, the title block, axis and footer keep their size.
  const k=slide?ctx.scale||1:1,q=v=>slide?Math.round(v*k*4)/4:v,sp=v=>slide?Math.round(v*k):v;
  // Everything in the slide body scales together: row text, axis and Today labels, the date columns and the label column.
  // The title block, legend and footer are furniture and keep their size.
  const size=slide?q(22):phone?17:17,noteSize=slide?q(22):14,metaBase=slide?22:14,meta=slide?q(22):14;
  const titleSize=slide?52:phone?38:W<1000?48:60;
  const inner=W-M*2,register=style==='register'&&!phone;
  const rail=phone?inner:register?Math.min(slide?Math.round(470*k):470,inner*(slide?.4:.34)):Math.min(slide?Math.round(530*k):340,inner*(slide?.42:.36));
  // A date column is as wide as its widest date at this size, so a date never wraps (a P50/P90 column, F6).
  let dateW=register?(slide?sp(172):136):0;
  if(register){
    const f=font(type.body,noteSize),allItems=[...model.items,...(diff?.droppedItems||[])];
    const widest=Math.max(0,...allItems.flatMap(it=>[date(it),p90Label(it)]).map(t=>measure(t,f)));
    dateW=Math.max(dateW,Math.ceil(widest+18));
  }
  const plotX=M+rail+dateW*2+ (phone?0:28),plotW=phone?inner:W-M-plotX;
  const title=block(model.title||'Milestone timeline',inner,titleSize,type,measure,{family:type.display,weight:type.displayWeight,kind:'title'});
  let y=M+(slide?16:27)+title.lines.length*title.step+(slide?12:24);
  const header=[{...title,x:M,y:M+22}];
  if(diff){const b=block('Compared with '+diff.since,inner,metaBase,type,measure,{kind:'comparison'});header.push({...b,x:M,y});y+=b.lines.length*b.step+18;}
  if(style==='review'&&!diff){const b=block('Choose a snapshot in History to compare forecasts.',inner,metaBase,type,measure,{kind:'empty-review'});header.push({...b,x:M,y});y+=b.lines.length*b.step+18;}
  if(style==='decisions'&&!model.items.some(it=>decisionLead(it))){const b=block('Add a decision lead to a fixed event to see its decide-by date.',inner,metaBase,type,measure,{kind:'empty-decisions'});header.push({...b,x:M,y});y+=b.lines.length*b.step+18;}
  // Axis furniture: month line, year line, then the Today label on a line of its own, all clear of one another (A3).
  const axisStep=meta+8,rulerY=y+meta,yearY=rulerY+axisStep,todayY=yearY+axisStep,top=todayY+16,rows=[],sections=[];
  y=top;let previous=null;
  let overwraps=0;
  const source=entries||entryList(model,diff,style);
  const labelW=phone?inner-48:rail-48;
  for(const it of source){
    const lane=style==='decisions'&&decisionLead(it)?'Decision windows':it.ghost?`${it.lane||'Milestones'} · Removed`:it.lane;
    // Lane names wrap inside the label column, so a long name never runs over a gridline (A5).
    if(lane!==previous){
      if(previous!==null)y+=8;
      if(lane){const b=block(lane.toUpperCase(),phone?inner-60:rail-36,meta,type,measure,{weight:600});const h=Math.max(44,b.lines.length*b.step+18);sections.push({lane:it.lane,label:lane,b,y,h});y+=h;}
      previous=lane;
    }
    const blocks=[],push=(value,kind,fs=noteSize,opts={})=>{
      if(!value)return;
      const b=block(value,labelW,fs,type,measure,{kind,...opts});blocks.push(b);
      // A line that is one line in the picture is one line on the slide, or the scale comes down.
      if(slide){
        const native=wrapText(String(value),font(opts.family||type.body,kind==='label'?17:14,opts.weight||400),register?420:292,measure).length;
        if(b.lines.length>native)overwraps++;
      }
    };
    push(it.label+(it.single&&!['fixed','done'].includes(it.status)?' ±?':''),'label',size,{weight:500});
    if(!register)push(finish(it),'dates');
    if(it.started!=null&&(slide||phone||register))push('Started '+fmtDay(it.started),'started');
    if(it.note)push(it.note,'note');
    if(state(it,today))push(state(it,today),'state');
    const clock=decisionLead(it,today);
    if(clock)push(`Decide by ${fmtDay(clock.day)} · ${leadDuration(clock.leadDays)} lead`,'clock');
    const historic=diff?.byKey.get(key(it));
    if(historic){
      if(historic.slipDays)push('P50 '+signed(historic.slipDays),'change');
      if(historic.oldP90!==it.p90)push('P90 '+signed(it.p90-historic.oldP90),'change');
      if(historic.history?.includes('started'))push(historic.oldStarted==null?'Start recorded':it.started==null?'Start removed':'Start changed from '+fmtDay(historic.oldStarted),'change');
      if(historic.oldStatus!==(it.status||''))push(`Previously ${historic.oldStatus||'forecast'}`,'change');
    }
    if(diff?.newKeys?.has(key(it)))push('NEW','change');
    // Pagination fragments repeat the intact interval; only measured copy continues.
    const actual=it._blocks||blocks;
    let by=sp(slide?6:14);
    for(const b of actual){b.y=by;by+=b.lines.length*b.step+(slide?sp(2):b.kind==='label'?5:3);}
    const graph=phone?42:0;
    let regH=0;
    if(register)for(const v of [date(it),p90Label(it)]){const b=block(v,dateW-14,noteSize,type,measure);regH=Math.max(regH,18+b.lines.length*b.step+sp(slide?6:14));}
    const h=Math.max(slide?sp(48):72,by+sp(slide?6:14)+graph,regH);
    const row={it,blocks:actual,x:M,y,w:inner,h,cy:phone?y+h-24:y+h/2,clock};rows.push(row);y+=h;
  }
  if(!source.length){const b=block('Add your first milestone to begin.',inner,size,type,measure);header.push({...b,x:M,y});y+=70;}
  const bodyBottom=y;
  let verdict=null;
  if(model.verdict&&model.verdict.toLowerCase()!=='off'){
    verdict=block(model.verdict,inner,slide?26:20,type,measure,{kind:'verdict'});
    if(!slide){verdict.y=y+24;y=verdict.y+verdict.lines.length*verdict.step+12;}
  }
  if(diff?.dropped?.length&&!diff.droppedItems?.length){const b=block('Dropped: '+diff.dropped.join(' · '),inner,metaBase,type,measure);header.push({...b,x:M,y:y+16});y+=b.lines.length*b.step+32;}
  // A slide's furniture is pinned to the canvas: footer, then the legend, then the verdict, then the body limit.
  const slideH=1080,footerY=slideH-28;
  let legendY=y+32,bodyLimit=null;
  if(slide){
    legendY=footerY-42;bodyLimit=legendY-34;
    if(verdict){verdict.y=bodyLimit-verdict.lines.length*verdict.step;bodyLimit=verdict.y-20;}
  }
  const contentBottom=legendY+28+(edit?44:0),H=slide?slideH:Math.max(phone?0:620,contentBottom+M);
  return {W,H,M,inner,type,measure,style,today,slide,phone,register,rail,dateW,plotX:phone?M:plotX,plotW,meta,metaBase,size,noteSize,header,rulerY,yearY,todayY,top,rows,sections,bodyBottom,verdict,legendY,contentBottom,edit,
    nextKey:key(model.items.filter(it=>it.status!=='done'&&it.p50>=today).sort((a,b)=>a.p50-b.p50)[0]||model.items[0]||{lane:'',label:''}),domain:domain||observatoryDomain(model,today,diff),overwraps,fits:slide?y<=bodyLimit:contentBottom<=H-M,entries:source,footerY,bodyLimit,bodyEnd:y,scale:k};
}
function drawMarks(it,row,L,C,diff){
  const X=d=>L.plotX+(d-L.domain.lo)/(L.domain.hi-L.domain.lo)*L.plotW;
  const y=row.cy,x50=X(it.p50),x90=X(it.p90),s=[],r=L.slide?5:4.5;
  const ink=it.ghost?C.muted:it.status==='done'?C.status.done:it.status==='fixed'&&it.p50<L.today?C.err:C.accent;
  const old=diff?.byKey.get(key(it));
  if(old){
    const oy=y-(L.style==='review'?17:12),ox=X(old.oldP50),op=X(old.oldP90);
    const history=(kind,draw)=>`<g data-field-history="${kind}" data-field-history-inert="" pointer-events="none">${draw}</g>`;
    if(old.history?.includes('p50')||old.history?.includes('forecast'))s.push(history('p50',circle(ox,oy,r,C.bg,{stroke:C.muted,'data-ms':'ghost'})));
    if(old.history?.includes('p90')||old.history?.includes('forecast'))s.push(history('p90',line(ox,oy,op,oy,C.muted,{'stroke-dasharray':'3 4','data-ms':'ghost'})+line(op,oy-5,op,oy+5,C.muted,{'data-ms':'ghost'})));
    if(old.history?.includes('fixed'))s.push(history('fixed',line(ox,oy-8,ox,oy+8,C.muted,{'stroke-dasharray':'2 3','data-ms':'ghost'})));
    if(old.history?.includes('started')&&old.oldStarted!=null)s.push(history('started',rect(X(old.oldStarted)-r,oy-r,r*2,r*2,C.bg,{stroke:C.muted,'stroke-dasharray':'2 2'})));
  }
  if(it.started!=null){
    const xs=X(it.started);
    if(timingFacts(it,L.today).valid)s.push(line(xs,y,x50,y,C.muted,{'data-ms':'start-span','stroke-dasharray':'2 4'}));
    s.push(rect(xs-r,y-r,r*2,r*2,C.bg,{stroke:C.muted,'stroke-width':1.5,'data-ms':'started','aria-label':'Started '+fmtDay(it.started)}));
  }
  if(!it.single){
    s.push(line(x50,y,x90,y,ink,{'data-ms':'whisker','stroke-width':2,width:n(x90-x50)}));
    s.push(line(x90,y-7,x90,y+7,ink,{'data-ms':'p90','stroke-width':1.5}));
  }
  const mark={'data-ms':'p50','data-mskey':key(it),'data-next':key(it)===L.nextKey?'':null};
  if(it.status==='fixed'){
    s.push(line(x50,y-12,x50,y+12,ink,{...mark,'stroke-width':1.5}));
    s.push(`<path d="M ${n(x50)} ${n(y-6)} l 6 6 -6 6 -6 -6 Z" fill="${C.bg}" stroke="${ink}"/>`);
  }else s.push(circle(x50,y,r,ink,mark));
  if(row.clock){
    const cx=X(row.clock.day),cy=y-16;
    s.push(`<g data-lrm="" aria-label="${e(leadReceipt(it,L.today).text)}">`+line(cx,cy,x50,cy,C.muted,{'stroke-dasharray':'7 3'})+`<path data-ms="lrm" d="M ${n(cx)} ${n(cy-5)} l 5 10 -10 0 Z" fill="${C.bg}" stroke="${C.ink}"/></g>`);
  }
  return s.join('');
}
function editTarget(kind,it,x,y,raw,label){return `<rect${attrs({'data-edit':kind,'data-line':it.srcLine,'data-raw':raw,'pointer-events':'none',x,y,width:1,height:1,fill:'none'})}${btnAttrs(label)}/>`;}
function addRoute(lane,L,C,y){return `<g data-add-control="" data-edit="additem" data-line="-1" data-raw="" data-lane="${e(lane)}"${btnAttrs(lane?'Add milestone into '+lane:'Add unlaned milestone')}>${rect(L.W-L.M-48,y,44,44,'transparent',{'data-hit':''})}${text(L.W-L.M-26,y+28,'+',22,C.muted,{'text-anchor':'middle'})}</g>`;}
function paint(model,L,ctx,diff,page){
  const C=observatoryColors(model,ctx),s=[];
  const root={'data-field':'timeline','data-direction':L.style,'data-body-top':L.slide?n(L.top):null,'data-body-bottom':L.slide?n(L.bodyLimit):null,'data-content-bottom':L.slide?n(L.bodyEnd):null,'data-scale':L.slide?n(L.scale):null,'data-intent':L.slide?'presentation':L.phone?'live-narrow':ctx.intent||'live-wide','data-field-palette':model.palette,'data-field-accent':model.accent,'data-font':model.font||'Chapter','data-font-floor':L.slide?22:14,'data-min-readable-scale':1,'data-narrow':L.phone?'':null,'data-native':ctx.intent==='native'?'':null,'data-copy-field':L.slide?'complete':null,'data-domain-lo':L.domain.lo,'data-domain-hi':L.domain.hi};
  s.push(`<svg xmlns="http://www.w3.org/2000/svg"${attrs({...root,width:L.W,height:L.H,viewBox:`0 0 ${L.W} ${L.H}`,'font-family':L.type.body})}><title>${e(model.title||'Timeline')}</title><desc>${e(model.verdict&&model.verdict.toLowerCase()!=='off'?model.verdict:model.title||'Timeline')}</desc>`,rect(0,0,L.W,L.H,C.bg));
  s.push(text(L.M,L.M+4,'Timeline / '+L.style[0].toUpperCase()+L.style.slice(1),L.metaBase,C.muted));
  for(const b of L.header)s.push(paintBlock(b,b.x,b.y,b.kind==='title'?C.ink:C.muted));
  const X=d=>L.plotX+(d-L.domain.lo)/(L.domain.hi-L.domain.lo)*L.plotW;
  const axis=axisTicks(L.domain,L.plotW,L.measure,L.type,L.meta);
  for(const t of axis.ticks){const x=X(t.day);s.push(text(x,L.rulerY,t.label,L.meta,C.muted,{'data-axis':'tick'}));if(t.yearLabel)s.push(text(x,L.yearY,t.yearLabel,L.meta,C.muted,{'data-axis':'year'}));if(!L.phone)s.push(line(x,L.top,x,L.bodyBottom,C.border,{'stroke-dasharray':'2 4'}));}
  if(L.register){s.push(text(L.M,L.rulerY,'Milestone',L.meta,C.muted),text(L.M+L.rail,L.rulerY,'P50',L.meta,C.muted),text(L.M+L.rail+L.dateW,L.rulerY,'P90',L.meta,C.muted));}
  const todayX=X(L.today);s.push(line(todayX,L.todayY+6,todayX,L.phone?L.top-2:L.bodyBottom,C.accent,{'data-today':''}));
  const todayLabel='Today · '+fmtDay(L.today).replace(/ \d{4}$/,'');
  s.push(text(Math.max(L.plotX,Math.min(L.W-L.M-L.measure(todayLabel,font(L.type.body,L.meta)),todayX+6)),L.todayY,todayLabel,L.meta,C.accent,{'data-axis':'today'}));
  for(const g of L.sections){s.push(rect(L.M,g.y,L.inner,g.h,C.band,{'data-lane':g.lane}),line(L.M,g.y,L.W-L.M,g.y,C.border),line(L.M,g.y+g.h,L.W-L.M,g.y+g.h,C.border),paintBlock(g.b,L.M+12,g.y+10,C.muted));if(L.edit)s.push(addRoute(g.lane,L,C,g.y));}
  for(const row of L.rows){
    const it=row.it,k=key(it),selected=ctx.selectedKey===k&&!it.ghost;
    const timing=it.status==='fixed'?'fixed':it.status==='done'?'completed':'forecast';
    s.push(`<g${attrs({'data-field-item':k,'data-field-timing':timing,'data-field-state':state(it,L.today).toLowerCase()||it.status||'forecast','data-field-p50-day':dayToISO(it.p50),'data-field-p90-day':dayToISO(it.p90),'data-field-started-day':it.started!=null?dayToISO(it.started):null,'data-source-line':it.srcLine,'data-source-index':it._src,'data-fragment':it._frag?`${it._frag.index+1}/${it._frag.total}`:null,'data-dropped':it.ghost?'':null})}>`);
    s.push(rect(row.x,row.y,row.w,row.h,selected?C.tint:'transparent',{'data-selection':selected?'':null,stroke:selected?C.accent:'none'}));
    if(L.edit&&!it.ghost)s.push(`<g data-inspect="${e(k)}" data-line="${it.srcLine}"${btnAttrs('Inspect milestone: '+it.label)}>${rect(row.x,row.y,row.w,row.h,'transparent',{'data-inspect-hit':''})}</g>`);
    // Visible facts belong to row inspection; editing has its own explicit menu.
    for(const b of row.blocks){
      const extra={'pointer-events':'none',...(b.kind==='note'?{'data-field-note':'','aria-label':'Note: '+it.note}:{}),...(it.ghost&&b.kind==='label'?{'text-decoration':'line-through'}:{})};
      s.push(paintBlock(b,row.x+8,row.y+b.y,b.kind==='label'?C.ink:C.muted,extra));
    }
    if(L.register){
      const x=L.M+L.rail,dy=row.y+18;
      const value=block(date(it),L.dateW-14,L.noteSize,L.type,L.measure);
      s.push(paintBlock(value,x,dy,C.muted));
      s.push(paintBlock(block(p90Label(it),L.dateW-14,L.noteSize,L.type,L.measure),x+L.dateW,dy,C.muted));
    }
    if(L.phone)s.push(line(todayX,row.cy-12,todayX,row.cy+12,C.accent));
    s.push(`<g pointer-events="none">${drawMarks(it,row,L,C,diff)}</g>`);
    
    if(L.edit&&!it.ghost){
      // Separate menu has a real 44px target; hidden edit anchors resolve its input routes.
      s.push(`<g data-edit="cardmenu" data-line="${it.srcLine}" data-menu=""${btnAttrs('More options: '+it.label)}>${rect(L.W-L.M-44,row.y,44,44,'transparent',{'data-hit':''})}${text(L.W-L.M-22,row.y+27,'⋯',22,C.muted,{'text-anchor':'middle','data-empty-control':''})}</g>`);
      for(const [kind,raw,label] of [['label',it.label,'Edit label'],['dates',it.rawDates,'Edit dates'],['status',it.status||'','Status'],['setlane',it.lane,'Lane'],['note',it.note||'','Note'],['started',it.started!=null?dayToISO(it.started):'','Started'],['removeitem','','Remove']])s.push(editTarget(kind,it,row.x,row.y,raw,label+': '+it.label));
    }
    s.push(line(row.x,row.y+row.h,row.x+row.w,row.y+row.h,C.border),'</g>');
  }
  if(L.verdict)s.push(paintBlock(L.verdict,L.M,L.verdict.y,C.ink,L.edit?{'data-edit':'verdict','data-raw':model.verdict,role:'button',tabindex:0,'aria-label':'Edit verdict'}:{}));
  const legend=[['started','Started',model.items.some(it=>it.started!=null)],['p50','P50 finish',true],['p90','P90 finish',true],['fixed','Fixed',model.items.some(it=>it.status==='fixed')],['decide','Decide by',model.items.some(it=>decisionLead(it))],['previous','Previous forecast',!!diff&&[...diff.byKey.values()].some(h=>h.history?.length)]].filter(([, ,show])=>show);   // exactly the marks this set draws
  let lx=L.M,ly=L.legendY;
  for(const [kind,label] of legend){const w=L.measure(label,font(L.type.body,L.metaBase))+38;if(lx+w>L.W-L.M){lx=L.M;ly+=26;}
    if(kind==='started')s.push(rect(lx,ly-9,8,8,C.bg,{stroke:C.muted}));
    if(kind==='p50')s.push(circle(lx+4,ly-5,4,C.accent));
    if(kind==='p90')s.push(line(lx,ly-5,lx+13,ly-5,C.accent),line(lx+13,ly-11,lx+13,ly+1,C.accent));
    if(kind==='fixed')s.push(`<path d="M ${lx+4} ${ly-11} l 5 6 -5 6 -5 -6 Z" fill="${C.bg}" stroke="${C.accent}"/>`);
    if(kind==='decide')s.push(`<path d="M ${lx+4} ${ly-11} l 5 10 -10 0 Z" fill="${C.bg}" stroke="${C.ink}"/>`);
    if(kind==='previous')s.push(circle(lx+4,ly-5,4,C.bg,{stroke:C.muted}));
    s.push(text(lx+22,ly,label,L.metaBase,C.muted));lx+=w;
  }
  if(L.edit)s.push(addRoute('',L,C,Math.max(ly+12,L.legendY+24)));
  if(page?.total>1){
    const room=L.W-L.M*2-150,label=[].concat(page.scope||[]).filter(Boolean).find(t=>L.measure(t,font(L.type.body,L.metaBase))<=room)||[].concat(page.scope||[]).filter(Boolean).at(-1)||'';
    if(label)s.push(text(L.M,L.footerY,label,L.metaBase,C.muted,{'data-axis':'scope'}));
    s.push(text(L.W-L.M,L.footerY,`${page.index+1} of ${page.total}`,L.metaBase,C.muted,{'text-anchor':'end'}));
  }
  s.push('</svg>');return s.join('');
}
function refusal(model,ctx,reason='This forecast needs more than one slide. Export the complete deck or native SVG.'){
  const C=observatoryColors(model,ctx),type=resolveTypography(model);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" data-field="timeline" data-intent="presentation" data-copy-field="unavailable" font-family="${e(fontStack(type.body))}">${rect(0,0,1920,1080,C.bg)}${text(64,100,'Copy PNG needs a complete single slide',38,C.ink)}${text(64,160,reason,24,C.muted)}</svg>`;
}
export function renderObservatory(model,ctx={},diff=null,{edit=false,intent}={}){
  const L=layoutObservatory(model,ctx,diff,{edit,intent});
  if(L.slide&&!L.fits)return refusal(model,ctx);
  return paint(model,L,{...ctx,intent:intent||ctx.intent},diff);
}
const SCALE_MIN=.88,SCALE_MAX=1.35,SCALE_STEP=.01;
const andList=names=>{const l=names.filter(Boolean);return l.length<2?(l[0]||''):l.slice(0,-1).join(', ')+' and '+l.at(-1);};

// The footer's own words for which part of the plan a slide shows: its lanes, longest form first. A lane is
// "Name (continued)" only when it began on an earlier slide, and the mark sits on the name.
function scopeFor(items,earlier,total){
  if(total<2)return [];
  const lanes=[...new Set(items.map(it=>it.lane).filter(Boolean))];
  const seen=new Set(earlier.flat().map(it=>it.lane).filter(Boolean));
  const marked=lanes.map(l=>seen.has(l)?l+' (continued)':l);
  const forms=[andList(marked),marked.length>1?marked[0]+' and '+(marked.length-1)+' more':''].filter(Boolean);
  return forms.length?[...new Set(forms)]:[];
}

export function observatoryPages(model,ctx={},diff=null){
  const source=entryList(model,diff,model.style||'field').map((it,i)=>({...it,_src:i}));
  const domain=observatoryDomain(model,model.today??ctx.today??Math.floor(Date.now()/DAY),diff);
  const build=scale=>{
    const layout=items=>layoutObservatory(model,{...ctx,selectedKey:null,scale},diff,{intent:'presentation',entries:items,domain});
    const thin=items=>{const L=layout(items);return items.length<3&&(L.bodyEnd-L.top)<(L.bodyLimit-L.top)/2-.5;};
    const drafts=[];let current=[];
    for(const it of source){
      if(layout([...current,it]).fits){current.push(it);continue;}
      if(current.length){drafts.push(current);current=[];}
      if(layout([it]).fits){current=[it];continue;}
      // Only an item too big for one slide is continued. Its label repeats on every part with the shared
      // scale; the rest is cut at a wrapped line, and each part says in words that it continues.
      const original=layout([it]).rows[0],fixed=original.blocks.filter(b=>b.kind==='label'),queue=original.blocks.filter(b=>b.kind!=='label').flatMap(b=>b.lines.map(value=>({...b,lines:[value]})));
      const mark=text=>({...(queue[0]||fixed[0]),lines:[text],kind:'continuation',weight:400});
      const probe=chunk=>layout([{...it,_blocks:[...fixed,...chunk,mark('Continued'),mark('Continues on the next slide')]}]).fits;
      const chunks=[];let chunk=[];
      for(const b of queue){
        if(!probe([...chunk,b])){
          if(!chunk.length)return {drafts:[],complete:false,reason:'The title or authored verdict leaves no room for a complete milestone. Download native SVG.'};
          chunks.push(chunk);chunk=[];
        }
        chunk.push(b);
      }
      chunks.push(chunk);
      chunks.forEach((c,index)=>{
        const tail=[...(index>0?[mark('Continued')]:[]),...(index<chunks.length-1?[mark('Continues on the next slide')]:[])];
        drafts.push([{...it,_blocks:[...fixed,...c,...tail],_frag:chunks.length>1?{index,total:chunks.length}:null}]);
      });
    }
    if(current.length||!drafts.length)drafts.push(current);
    // F5: a split lane leaves at least two rows on each side, and a lane boundary is preferred whenever it keeps the slide count.
    const laneOf=it=>model.style==='decisions'&&decisionLead(it)?'Decision windows':it.ghost?(it.lane||'Milestones')+' · Removed':it.lane||'';   // the section the row sits in
    const fixSplits=()=>{
      for(let pass=0;pass<8;pass++){
        let changed=false;
        for(let i=0;i<drafts.length-1;i++){
          const A=drafts[i],B=drafts[i+1],la=A.at(-1),lb=B[0];
          if(!la||!lb||la._frag||lb._frag||laneOf(la)!==laneOf(lb))continue;
          const lane=laneOf(la);
          let a=0;for(let k=A.length-1;k>=0&&laneOf(A[k])===lane&&!A[k]._frag;k--)a++;
          let b=0;for(let k=0;k<B.length&&laneOf(B[k])===lane&&!B[k]._frag;k++)b++;
          const tryMove=(na,nb,keepFull=false)=>{if(na.length&&nb.length&&layout(na).fits&&layout(nb).fits&&(!keepFull||(!thin(na)&&!thin(nb)))){drafts[i]=na;drafts[i+1]=nb;return true;}return false;};
          if(a<A.length&&tryMove(A.slice(0,A.length-a),[...A.slice(A.length-a),...B],true)){changed=true;continue;}
          if(b<B.length&&tryMove([...A,...B.slice(0,b)],B.slice(b),true)){changed=true;continue;}
          if(a<2&&b>2&&tryMove([...A,B[0]],B.slice(1))){changed=true;continue;}
          if(b<2&&a>2&&tryMove(A.slice(0,-1),[A.at(-1),...B])){changed=true;continue;}
        }
        if(!changed)break;
      }
    };
    fixSplits();
    // S3: the last slide must not be an orphan; take rows from the end of the slide before it while both fit.
    const last=drafts.length-1;
    while(drafts.length>1&&thin(drafts[last])&&drafts[last-1].length>1&&!drafts[last-1].some(it=>it._frag)&&!drafts[last].some(it=>it._frag)){
      const left=drafts[last-1].slice(0,-1),right=[drafts[last-1].at(-1),...drafts[last]];
      if(!layout(left).fits||!layout(right).fits)break;
      drafts[last-1]=left;drafts[last]=right;
    }
    fixSplits();
    const total=drafts.length;
    const pages=drafts.map((items,index)=>{
      const L=layout(items),page={index,total,scope:scopeFor(items,drafts.slice(0,index),total)};
      return {index,total,complete:L.fits,svg:L.fits?paint(model,L,{...ctx,intent:'presentation',selectedKey:null},diff,page):refusal(model,ctx),sourceKeys:items.map(key)};
    });
    // Soft issues the scale can cure: a lane split leaving fewer than two rows on a side, and a slide left thin.
    let issues=0;
    for(let i=0;i<drafts.length-1;i++){
      const A=drafts[i],B=drafts[i+1],la=A.at(-1),lb=B[0];
      if(!la||!lb||la._frag||lb._frag||laneOf(la)!==laneOf(lb))continue;
      let a=0;for(let k=A.length-1;k>=0&&laneOf(A[k])===laneOf(la);k--)a++;
      let b=0;for(let k=0;k<B.length&&laneOf(B[k])===laneOf(lb);k++)b++;
      if(a<2||b<2)issues++;
    }
    drafts.forEach(items=>{if(drafts.length>1&&thin(items))issues++;issues+=layout(items).overwraps;});
    return {pages,complete:pages.every(p=>p.complete),scale,issues};
  };
  // One scale per set: the fewest slides reachable in 0.88 to 1.35, then the largest type that keeps them.
  const cache=new Map(),at=i=>{if(!cache.has(i))cache.set(i,build(Math.round((SCALE_MIN+i*SCALE_STEP)*100)/100));return cache.get(i);};
  const steps=Math.round((SCALE_MAX-SCALE_MIN)/SCALE_STEP),unit=Math.round((1-SCALE_MIN)/SCALE_STEP);
  const count=r=>r.pages&&r.complete?r.pages.length:Infinity;
  let target=count(at(unit));
  if(!Number.isFinite(target))return at(unit).pages?.length?at(unit):{pages:[],complete:false,reason:at(unit).reason};
  let lo=unit;
  if(target>1&&count(at(0))<target){target=count(at(0));lo=0;}
  let hi=steps;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(count(at(mid))<=target)lo=mid;else hi=mid-1;}
  // Scale is chosen after the lane and slide rules: the largest scale that keeps the slide count and leaves no issue.
  if(at(lo).issues>0){
    for(let i=lo-1;i>=0;i--)if(count(at(i))<=target&&at(i).issues===0)return at(i);
    // No scale cures it in that many slides: one more slide is better than a broken lane (F5), at the largest clean scale.
    for(let i=steps;i>=0;i--)if(count(at(i))<=target+1&&at(i).issues===0)return at(i);
  }
  return at(lo);
}
