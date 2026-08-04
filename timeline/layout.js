/* Pure timeline composition. The parser owns chronology; this module only decides
   which readable surface carries it. All decisions are deterministic for a fixed
   model, measure adapter, today and intent. */
import {fmtDay, isPointDate} from './parse.js';
import {wrapText} from '../assets/svg.js';

export const TIMELINE_GEOM = Object.freeze({pad:26,laneW:150,plotW:1240,rowH:32,laneGap:11,lanePadY:8});
export const INTENT_FLOOR = Object.freeze({
  'live-wide': 11,
  'live-narrow': 11,
  native: 11,
  presentation: 22,
});
export const NATIVE_PANEL_THRESHOLD = 16;
const PANEL_TARGET = 10;

const description = it => {
  const date = it.status === 'done' ? fmtDay(it.p50) : it.single ? fmtDay(it.p50)
    : fmtDay(it.p50, {month:(it.p90-it.p50)>45}) + ' → ' + fmtDay(it.p90, {month:(it.p90-it.p50)>45});
  return date + (it.note ? ' · ' + it.note : '');
};
const title = it => it.label + (it.single && !isPointDate(it) ? ' ±?' : '');
const displayId = index => 'T' + String(index + 1).padStart(2, '0');
const key = it => it.lane + '|' + it.label;

function domain(items, today, diff){
  const ghosts = diff ? [...diff.byKey.values()].map(g=>g.oldP50) : [];
  const days = items.flatMap(it=>[it.p50,it.p90]).concat(today,ghosts);
  const lo0=Math.min(...days),hi0=Math.max(...days);
  const pad=Math.max(14,Math.round((hi0-lo0)*0.05));
  return {lo:lo0-pad,hi:hi0+pad};
}

function packed(model,{measure,today,diff,geom,fontFloor}){
  const {lo,hi}=domain(model.items,today,diff);
  const plotX=geom.pad+geom.laneW,plotW=geom.plotW;
  const X=day=>plotX+(day-lo)/(hi-lo)*plotW;
  const placements=new Map(),laneRows=new Map(),laneMaxRightX=new Map();
  for(const lane of model.lanes){
    const rows=[];
    let extent=plotX;
    const laneItems=model.items.filter(it=>it.lane===lane)
      .map((it,index)=>({it,index:model.items.indexOf(it)}))
      .sort((a,b)=>a.it.p50-b.it.p50||a.it.srcLine-b.it.srcLine);
    for(const {it,index} of laneItems){
      const x50=X(it.p50),x90=X(it.p90),r=6;
      const labelW=measure(title(it),'600 12.5px sans-serif');
      const subW=measure(description(it),'11.5px sans-serif');
      const widest=Math.max(labelW,subW);
      let labelX=x50+r+5,anchorEnd=false;
      if(!it.single && x90-x50>1 && labelX+widest>x90-r-4) labelX=x90+r+6;
      if(labelX+widest>plotX+plotW-4 && x50-r-6-widest>=plotX+4){
        labelX=x50-r-6; anchorEnd=true;
      }
      const startX=anchorEnd?labelX-widest:x50-r-4;
      const rightX=Math.max(x90+r,anchorEnd?labelX:labelX+widest);
      let row=rows.findIndex(end=>startX>end+12);
      if(row<0){row=rows.length;rows.push(rightX);} else rows[row]=rightX;
      const placed={it,id:displayId(index),sourceIndex:index,x50,x90,labelX,anchorEnd,row,
        title:title(it),description:description(it),startX,rightX};
      placements.set(it,placed);
      extent=Math.max(extent,rightX);
    }
    laneRows.set(lane,Math.max(1,rows.length));
    laneMaxRightX.set(lane,extent);
  }
  return {lo,hi,plotX,plotW,placements,laneRows,laneMaxRightX,fontFloor};
}

/* Prefer a cut in an actual empty interval. If the programme has no gap, retain
   the chronological cut and let panels visibly repeat every crossing interval. */
function panelCuts(items){
  const sorted=items.slice().sort((a,b)=>a.p50-b.p50||a.srcLine-b.srcLine);
  const cuts=[];
  for(let i=PANEL_TARGET;i<sorted.length;i+=PANEL_TARGET){
    const left=sorted.slice(0,i),next=sorted[i];
    const latestEnd=Math.max(...left.map(it=>it.p90));
    cuts.push(latestEnd<next.p50 ? (latestEnd+next.p50)/2 : (sorted[i-1].p50+next.p50)/2);
  }
  return [...new Set(cuts)].sort((a,b)=>a-b);
}

function panels(model,base,measure){
  const cuts=panelCuts(model.items);
  const bounds=[base.lo,...cuts,base.hi];
  return bounds.slice(0,-1).map((start,index)=>{
    const end=bounds[index+1],last=index===bounds.length-2;
    const entries=[];
    model.items.forEach((it,sourceIndex)=>{
      const visible=it.p90>=start&&(last?it.p50<=end:it.p50<end);
      if(!visible)return;
      const detail=(it.lane||'Unlaned')+' · '+(it.status||'planning')+' · '+description(it);
      const labelLines=wrapText(it.label,'600 12.5px sans-serif',280,measure);
      const detailLines=wrapText(detail,'11px sans-serif',280,measure);
      entries.push({it,id:displayId(sourceIndex),sourceIndex,
        continuesFrom:it.p50<start,continuesTo:it.p90>end,
        title:title(it),description:description(it),detail,labelLines,detailLines,
        rowH:Math.max(62,14+labelLines.length*16+detailLines.length*14)});
    });
    return {index,start,end,entries,cutCrossings:entries.filter(e=>e.continuesFrom||e.continuesTo).map(e=>e.id)};
  });
}

function presentationSelection(model,today,capacity=7){
  const ordered=model.items.map((it,sourceIndex)=>({it,id:displayId(sourceIndex),sourceIndex}))
    .sort((a,b)=>{
      const ad=a.it.status==='done',bd=b.it.status==='done';
      if(ad!==bd)return ad?1:-1;
      if(!ad&&a.it.p50!==b.it.p50)return a.it.p50-b.it.p50;
      const af=a.it.status==='fixed',bf=b.it.status==='fixed';
      if(af!==bf)return af?-1:1;
      return a.sourceIndex-b.sourceIndex;
    });
  const selected=ordered.slice(0,capacity).map(e=>({...e,title:title(e.it),description:description(e.it)}));
  return {selected,remainder:Math.max(0,ordered.length-selected.length),
    rule:'EARLIEST OPEN P50 · FIXED TIE-BREAK · SOURCE ORDER'};
}

export function layoutTimeline(model,options={}){
  const measure=options.measure||((text)=>String(text).length*7);
  const today=model.today??options.today??0;
  const intent=options.intent||'live-wide';
  const geom={...TIMELINE_GEOM,...(options.geom||{})};
  const fontFloor=INTENT_FLOOR[intent]??INTENT_FLOOR['live-wide'];
  const base=packed(model,{measure,today,diff:options.diff,geom,fontFloor});
  const composed=['live-wide','live-narrow','native','presentation'].includes(intent);
  const mode=intent==='presentation'?'presentation'
    :intent==='live-narrow'?'narrow'
    :composed&&model.items.length<=2?'sparse'
    :(intent==='native'||intent==='live-wide')&&model.items.length>NATIVE_PANEL_THRESHOLD?'panels':'board';
  return {intent,mode,today,geom,...base,
    ids:model.items.map((it,index)=>({it,id:displayId(index),sourceIndex:index,key:key(it)})),
    panels:mode==='panels'?panels(model,base,measure):[],
    presentation:mode==='presentation'?presentationSelection(model,today):null};
}
