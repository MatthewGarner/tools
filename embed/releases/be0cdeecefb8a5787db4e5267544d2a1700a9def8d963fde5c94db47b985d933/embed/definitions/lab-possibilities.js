import {INITIAL,TASKS,DEMANDS,PLANS,validate} from '../../lab/dist/possibilities/model.js';
import {render} from '../../lab/dist/possibilities/view.js';
import {base,clone,objectSchema,enumSchema,rangeSchema,select,range,action} from './_lab.js';
const schema=objectSchema({version:{type:'integer',enum:[1]},demand:enumSchema(Object.keys(DEMANDS)),budget:rangeSchema(1,30,true),costs:objectSchema(Object.fromEntries(TASKS.map(t=>[t.id,rangeSchema(1,10,true)]))),plan:{type:'array',items:enumSchema(TASKS.map(t=>t.id)),maxItems:TASKS.length}});
const controls={demand:select('Demand after this work',['demand'],Object.fromEntries(Object.entries(DEMANDS).map(([id,d])=>[id,d.name]))),budget:range('Available effort',['budget'],1,30),direct:action('Deliver available work','direct'),enable:action('Open new possibilities','enable')};
const actions=Object.fromEntries(['direct','enable'].map(id=>[id,s=>({...clone(s),plan:[...PLANS[id]]})]));
export const definition=base('possibilities','Making worthwhile work possible','Sequence enabling work and delivery; inspect which services become reachable.',clone(INITIAL),validate,{landscape:{title:'Reachable work and its prerequisites',description:'Explicit prerequisites, effort and demand determine which work is possible.',controls:Object.keys(controls),defaultControls:['demand','enable','direct'],render}},controls,actions,schema);
export const toToolState=state=>({state:clone(state),pinned:null});
export const fromToolState=raw=>clone(raw.state);
