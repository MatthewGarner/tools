import {simulate,wipSweep,kneeWip} from '../../flow/engine.js';
import {renderReadout,readoutVerdict} from '../../flow/render.js';
import {base,object,num,int,choice,range,select,context} from './classic-shared.js';
const params = s => ({demandPerWeek:s.d,itemDays:s.s,team:s.t,wipLimit:s.w===21?40:s.w,cov:s.v});
export const definition = base('flow','Flow','Explore demand, capacity and waiting in one queue.',
  {d:8,s:2,t:4,w:4,v:'med'},object({d:num(.5,10,.5),s:int(1,15),t:int(1,10),w:int(1,21),v:choice(['low','med','high'])}),
  {demand:range('Demand, items/week',['d'],.5,10,.5),size:range('Average item, working days',['s'],1,15),team:range('People',['t'],1,10),wip:{label:'Work-in-progress limit',type:'select',path:['w'],options:Array.from({length:21},(_,i)=>({value:i+1,label:String(i===20?40:i+1)}))},variability:{label:'Variability',type:'select',path:['v'],options:[{value:'low',label:'Low'},{value:'med',label:'Medium'},{value:'high',label:'High'}]}},
  {queue:{title:'Queue and waiting',description:'Waiting and throughput under a WIP limit.',controls:['demand','size','team','wip','variability'],render(s,ctx){
    const p=params(s),r=simulate(p),sweep=wipSweep(p),knee=kneeWip(sweep);
    return {svg:renderReadout(r,sweep,knee,p,context(ctx)),summary:(r.stable?readoutVerdict(r):'No stable waiting time: demand is at or above capacity. The displayed sample describes a growing queue.')+' Fixed-seed illustrative simulation.'};
  }}});

// The native queue view has a different state contract from frozen waiting-time v1.
definition.version=2;

definition.views['queue'].defaultControls=['demand'];
