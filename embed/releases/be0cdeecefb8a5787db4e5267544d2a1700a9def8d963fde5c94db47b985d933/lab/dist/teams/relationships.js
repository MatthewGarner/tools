import {CAPABILITIES,TEAM_IDS} from './definitions.js';
import {createWorkload} from './engine.js';
export const LAYERS={team:{label:'Team',job:'Handoff',groups:{a:'A',b:'B',c:'C'}},customer:{label:'Customer experience',job:'Context translation',groups:{a:'Discover',b:'Operate',c:'Support'}},technical:{label:'Technical ownership',job:'Interface coordination',groups:{a:'Application',b:'Device',c:'Validation'}},funding:{label:'Funding',job:'Funding agreement',groups:{a:'Experience',b:'Equipment',c:'Operations'}}};
export const CONNECTORS={ari:'Ari · product liaison',bea:'Bea · technical liaison',cam:'Cam · operations liaison'};
export const DEFAULT_RELATIONSHIPS={
 view:'customer',
 maps:{customer:{product:'a',design:'a',software:'b',controls:'b',test:'c',field:'c'},technical:{product:'a',design:'a',software:'a',controls:'b',test:'c',field:'b'},funding:{product:'a',design:'a',software:'a',controls:'b',test:'b',field:'c'}},
 owners:{team:'ari',customer:'ari',technical:'bea',funding:'cam'},
 hours:{ari:12,bea:12,cam:12},
 effort:{team:.25,customer:.5,technical:.5,funding:.25}
};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function validateRelationships(raw=DEFAULT_RELATIONSHIPS){
 if(!exact(raw,['view','maps','owners','hours','effort'])||!Object.hasOwn(LAYERS,raw.view)||!exact(raw.maps,['customer','technical','funding'])||!exact(raw.owners,Object.keys(LAYERS))||!exact(raw.hours,Object.keys(CONNECTORS))||!exact(raw.effort,Object.keys(LAYERS)))throw Error('The organisational maps or coordination assignments are incomplete.');
 for(const map of Object.values(raw.maps))if(!exact(map,CAPABILITIES.map(c=>c.id))||Object.values(map).some(group=>!TEAM_IDS.includes(group)))throw Error('Each capability must belong to one group in every map.');
 if(Object.values(raw.owners).some(id=>id!=='none'&&!Object.hasOwn(CONNECTORS,id))||Object.values(raw.hours).some(n=>!Number.isFinite(n)||n<0||n>120)||Object.values(raw.effort).some(n=>!Number.isFinite(n)||n<0||n>4))throw Error('Invalid coordination owner, budget or effort.');
 return structuredClone(raw);
}
export function mapsFor(layout,relationships=DEFAULT_RELATIONSHIPS){const r=validateRelationships(relationships);return{team:{...layout},...r.maps};}
// This is a planned coordination coverage ledger. It deliberately does not
// turn an uncovered hour into a guessed throughput penalty in the FIFO engine.
// Shared connector time is divided proportionally, never counted once per role.
export function coordinationFor(layout,scenario,relationships=DEFAULT_RELATIONSHIPS){
 const r=validateRelationships(relationships),maps=mapsFor(layout,r),jobs=createWorkload(scenario),events=[];
 for(const job of jobs)for(let i=1;i<job.stages.length;i++){
  const from=job.stages[i-1].capability,to=job.stages[i].capability;
  for(const [layer,map]of Object.entries(maps))if(map[from]!==map[to])events.push({job:job.id,label:job.label,from,to,layer,hours:r.effort[layer],owner:r.owners[layer]});
 }
 const demand=Object.fromEntries(Object.keys(CONNECTORS).map(id=>[id,events.filter(e=>e.owner===id).reduce((n,e)=>n+e.hours,0)]));
 const people=Object.entries(CONNECTORS).map(([id,label])=>({id,label,requested:demand[id],available:r.hours[id],covered:Math.min(demand[id],r.hours[id]),gap:Math.max(0,demand[id]-r.hours[id])}));
 const rows=Object.entries(LAYERS).map(([id,layer])=>{
  const own=events.filter(e=>e.layer===id),requested=own.reduce((n,e)=>n+e.hours,0),owner=r.owners[id];
  const ratio=owner==='none'?0:demand[owner]===0?1:Math.min(1,r.hours[owner]/demand[owner]);
  return{id,label:layer.job,crossings:own.length,owner,requested,covered:requested*ratio,gap:requested*(1-ratio)};
 });
 return{maps,events,rows,people,requested:rows.reduce((n,r)=>n+r.requested,0),covered:rows.reduce((n,r)=>n+r.covered,0),gap:rows.reduce((n,r)=>n+r.gap,0)};
}
export function traceMaps(job,layout,relationships=DEFAULT_RELATIONSHIPS){
 const maps=mapsFor(layout,relationships);
 return Object.entries(maps).map(([id,map])=>({id,label:LAYERS[id].label,steps:job.stages.map((s,i)=>({capability:s.capability,group:map[s.capability],crossing:i>0&&map[s.capability]!==map[job.stages[i-1].capability]}))}));
}
