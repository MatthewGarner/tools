import {CAPABILITIES,FLOWS,SCENARIOS,TICK} from './definitions.js?v=0.18.0';
const id=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,70}$/.test(value);
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label} needs 1–${max} characters.`);return value.trim();};
const bounded=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${label} must be between ${min} and ${max}.`);return v;};
export function validateWorkload(raw){
  if(!raw||raw.version!==1||!id(raw.id))throw Error('Invalid workload identity or version.');
  const name=text(raw.name,80,'Workload name'),seed=bounded(raw.seed,1,999999,'Seed'),count=bounded(raw.count,1,60,'Work count'),span=bounded(raw.span,0,28,'Arrival window');
  if(!Number.isInteger(seed)||!Number.isInteger(count))throw Error('Seed and work count must be whole numbers.');
  if(!Array.isArray(raw.flows)||raw.flows.length<1||raw.flows.length>5)throw Error('Keep between one and five work types.');
  const flows=raw.flows.map(f=>{
    if(!f||!id(f.id)||!Array.isArray(f.stages)||f.stages.length<1||f.stages.length>8)throw Error('Each work type needs an identity and one to eight stages.');
    return {id:f.id,label:text(f.label,60,'Work type name'),short:text(f.short,30,'Short label'),share:bounded(f.share,0,100,'Work mix weight'),stages:f.stages.map(s=>{
      if(!s||!CAPABILITIES.some(c=>c.id===s.capability))throw Error('Choose a known capability for each stage.');
      return {capability:s.capability,effort:bounded(s.effort,.1,8,'Stage effort')};
    })};
  });
  if(new Set(flows.map(f=>f.id)).size!==flows.length)throw Error('Work type identities must be unique.');
  if(!flows.some(f=>f.share>0))throw Error('Give at least one work type a positive mix weight.');
  return {version:1,id:raw.id,name,seed,count,span,flows};
}
export function workloadFromPreset(key='rush'){
  const s=SCENARIOS[key];if(!s)throw Error('Unknown workload.');
  return validateWorkload({version:1,id:`workload-${key}`,name:s.name,seed:s.seed,count:s.count,span:(s.count-1)*s.spacing,flows:s.weights.map(([id,weight])=>({id,label:FLOWS[id].label,short:FLOWS[id].short,share:weight*100,stages:FLOWS[id].stages.map(([capability,effort])=>({capability,effort}))}))});
}
export function generateWorkload(raw){
  const config=validateWorkload(raw);let seed=config.seed>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const total=config.flows.reduce((s,f)=>s+f.share,0),spacing=config.count>1?config.span/(config.count-1):0;
  return Array.from({length:config.count},(_,index)=>{
    const pick=random();let cumulative=0;
    const flow=config.flows.find(f=>{cumulative+=f.share/total;return pick<cumulative;})||config.flows.filter(f=>f.share>0).at(-1);
    const arrival=Math.max(0,Math.round((index*spacing+(random()-.5)*.25)/TICK)*TICK);
    const stages=flow.stages.map(s=>({capability:s.capability,effort:Math.round(s.effort*(.9+random()*.2)*1e9)/1e9}));
    return {id:`work-${String(index+1).padStart(2,'0')}`,label:`${flow.short} ${String(index+1).padStart(2,'0')}`,type:flow.id,arrival,stages};
  });
}
export function moveStage(raw,flowId,from,to){
  const copy=structuredClone(raw),flow=copy.flows?.find(f=>f.id===flowId);
  if(!flow||![from,to].every(i=>Number.isInteger(i)&&i>=0&&i<flow.stages.length))throw Error('Choose stages in this work type.');
  flow.stages.splice(to,0,flow.stages.splice(from,1)[0]);return copy;
}
