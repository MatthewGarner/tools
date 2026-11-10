import {canvas,text,e,wrap} from '../../../embed/definitions/_lab.js';
import {project,roles,methods,summary} from './model.js';

export function renderArticle(state,ctx={}){
 const r=project(state);
 const svg=canvas('Who can actually decide?',summary(state,r),ctx,({w,c,top})=>{
  let y=top,body='';const narrow=w<650,labelWidth=narrow?0:140,plot=w-48-labelWidth,scale=plot/Math.max(r.finish,state.deadline,1);
  const heading='Decision and permission queues',headingChars=Math.floor((w-48)/11);
  body+=text(24,y,heading,{size:20,weight:700,width:headingChars});y+=wrap(heading,headingChars).length*28+24;
  for(let role=0;role<3;role++){
   const entries=r.decisions.flatMap(d=>d.steps.filter(s=>s.role===role).map(s=>({...s,id:d.id,method:d.method})));
   body+=text(24,y,roles[role],{size:16,weight:700,width:narrow?32:16});
   if(narrow)y+=28;
   const x=24+labelWidth,lanes=state.capacity[role];
   for(let slot=0;slot<lanes;slot++){
    const yy=y-16+slot*35;body+=`<path d="M${x} ${yy+26} H${x+plot}" stroke="${e(c.line)}"/>`;
    for(const entry of entries.filter(s=>s.slot===slot)){
     const xx=x+entry.start*scale,bw=(entry.end-entry.start)*scale;
     body+=`<rect x="${xx}" y="${yy}" width="${Math.max(1,bw-2)}" height="25" fill="${e(c.accent)}" opacity="${entry.kind==='approve'?'.35':'.85'}"><title>${e(`${entry.id} ${entry.kind} ${entry.start}–${entry.end}; ${methods[entry.method]}; waited ${entry.wait}`)}</title></rect>`;
     if(bw>27)body+=text(xx+3,yy+17,entry.id,{size:12,color:c.paper,width:20});
    }
   }
   if(!entries.length)body+=text(x+6,y,'No queued work',{size:15,color:c.muted,width:30});
   y+=Math.max(1,lanes)*35+24;
  }
  body+=text(24,y,`Tick 0 → ${Math.max(r.finish,state.deadline)} · solid: decide · pale: approve`,{size:15,width:Math.floor((w-48)/8),color:c.muted});y+=50;
  for(const pair of r.pairs){const value=pair.items.map(d=>`${d.id}: ${methods[d.method]} at ${d.end}`).join('  /  ')+` — ${state.coupled?(pair.compatible?'connected':'disconnected'):'independent'}`;const chars=Math.floor((w-48)/9);body+=text(24,y,value,{size:17,width:chars});y+=wrap(value,chars).length*24+12;}
  const foot='All requests arrive at tick 0. Consultation precedes the queue. Approvals consume desk capacity but add no facts. Fictional times; no organisation score.';
  body+=text(24,y+12,foot,{size:15,width:Math.floor((w-48)/8),color:c.muted});
  return {body,end:y+20+wrap(foot,Math.floor((w-48)/8)).length*22};
 });
 return {svg,summary:summary(state,r)};
}
