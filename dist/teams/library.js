import {CAPABILITIES,TEAM_IDS,TEAM_NAMES,DEFAULT_LAYOUT,SCENARIOS,HORIZON,TICK} from './definitions.js?v=0.12.0';
import {validateWorkload,generateWorkload} from './workload.js?v=0.12.0';
export const ARRANGEMENTS={
  pairs:{label:'Specialist pairs',layout:DEFAULT_LAYOUT,names:TEAM_NAMES},
  product:{label:'Product stream together',layout:{product:'a',design:'a',software:'a',controls:'b',test:'a',field:'b'},names:{a:'Product stream',b:'Equipment & field',c:'Open team'}},
  battery:{label:'Battery stream together',layout:{product:'a',design:'b',software:'a',controls:'a',test:'a',field:'a'},names:{a:'Battery stream',b:'Design',c:'Open team'}},
  together:{label:'One combined team',layout:Object.fromEntries(CAPABILITIES.map(c=>[c.id,'a'])),names:{a:'All capabilities',b:'Open team',c:'Open team'}},
};
const goodId=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,70}$/.test(x);
export function validateLayout(layout){if(!layout||CAPABILITIES.some(c=>!TEAM_IDS.includes(layout[c.id]))||Object.keys(layout).some(id=>!CAPABILITIES.some(c=>c.id===id)))throw Error('Every capability must belong to one known team.');return {...layout};}
export function validateNames(names){if(!names||TEAM_IDS.some(id=>typeof names[id]!=='string'||!names[id].trim()||names[id].length>28))throw Error('Team names need 1–28 characters.');return Object.fromEntries(TEAM_IDS.map(id=>[id,names[id].trim()]));}
export function validateDesign(raw){if(!raw||(!goodId(raw.id)||['current','baseline'].includes(raw.id))||typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>80)throw Error('Give the arrangement a name of up to 80 characters.');return{id:raw.id,title:raw.title.trim(),layout:validateLayout(raw.layout),names:validateNames(raw.names)};}
export function validateCollection(values,validator,label){if(!Array.isArray(values)||values.length>6)throw Error(`Keep at most six saved ${label}.`);const copy=values.map(validator);if(new Set(copy.map(x=>x.id)).size!==copy.length)throw Error(`Saved ${label} need unique identities.`);return copy;}
export function extensions(raw={}){if(raw.workloads?.some?.(w=>Object.hasOwn(SCENARIOS,w?.id)))throw Error('A saved workload cannot replace a built-in workload identity.');return{workloads:validateCollection(raw.workloads||[],validateWorkload,'workloads'),designs:validateCollection(raw.designs||[],validateDesign,'arrangements')};}
export function activeWorkload(session){return session.workloads.find(w=>w.id===session.scenario)||session.scenario;}
export function validatePortable(data){
  if(!data||data.format!=='thinking-lab-teams'||data.version!==1||!data.session)throw Error('Choose a Thinking Lab Teams JSON export.');
  const raw=data.session,extra=extensions(raw),layout=validateLayout(raw.layout),names=validateNames(raw.names);
  if(!Object.hasOwn(SCENARIOS,raw.scenario)&&!extra.workloads.some(w=>w.id===raw.scenario))throw Error('The selected workload is missing.');
  const a=raw.assumptions;
  if(!a||![[a.coordination,0,.12],[a.handoffDelay,0,2],[a.handoffEffort,0,.5]].every(([v,min,max])=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max)||!Number.isInteger(a.handoffDelay/TICK))throw Error('Invalid shared assumptions.');
  if(!Number.isFinite(raw.day)||raw.day<0||raw.day>HORIZON||!Number.isInteger(raw.day/TICK))throw Error('Invalid replay day.');
  const count=SCENARIOS[raw.scenario]?.count||extra.workloads.find(w=>w.id===raw.scenario).count;
  if(raw.trace!==null&&(typeof raw.trace!=='string'||!Array.from({length:count},(_,i)=>`work-${String(i+1).padStart(2,'0')}`).includes(raw.trace)))throw Error('The traced job is missing.');
  const baseline=raw.baseline===null?null:{layout:validateLayout(raw.baseline?.layout),names:validateNames(raw.baseline?.names)};
  return{layout,names,scenario:raw.scenario,assumptions:{...a},day:raw.day,trace:raw.trace,baseline,...extra};
}
export function portable(session){const result={format:'thinking-lab-teams',version:1,session};validatePortable(result);return result;}
export function workloadSummary(config,layout,capacities){
  const jobs=generateWorkload(config);
  return CAPABILITIES.map(c=>({id:c.id,label:c.name,effort:jobs.reduce((total,j)=>total+j.stages.filter(s=>s.capability===c.id).reduce((n,s)=>n+s.effort,0),0),capacity:capacities[c.id]*HORIZON,team:layout[c.id]}));
}
