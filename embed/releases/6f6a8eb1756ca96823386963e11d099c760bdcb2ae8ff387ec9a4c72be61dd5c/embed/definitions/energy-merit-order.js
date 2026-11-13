import {DEFAULT_PARAMS,WORLDS} from '../../energy/merit-order/scenarios.js';
import {buildStack,dispatch} from '../../energy/merit-order/model.js';
import {renderStack,buildVerdict,MERIT_PALETTE} from '../../energy/merit-order/render.js';
import {base,object,num,choice,range,select,context} from './classic-shared.js';
const ps=object({demand:num(0,90),gas:num(20,300),carbon:num(0,150),wind:num(0,1),solar:num(0,1),imports:num(0,15),storageAvail:num(0,1),chargePrice:num(0,200),mustRunOn:{type:'boolean'},mustRunDepth:num(0,50)});
const v1=base('energy-merit-order','Merit order','Explore the generator that sets the clearing price.',
 {v:2,w:'gbToday',c:null,params:{...DEFAULT_PARAMS}},object({v:choice([2]),w:choice(Object.keys(WORLDS)),c:{type:'null'},params:ps}),
 {world:{label:'Generation fleet',type:'select',path:['w'],options:Object.entries(WORLDS).map(([value,w])=>({value,label:w.label}))},demand:range('Demand, GW',['params','demand'],0,90),gas:range('Gas price, p/therm',['params','gas'],20,300,5),carbon:range('Carbon price, £/tCO₂',['params','carbon'],0,150,5),wind:range('Wind availability (fraction)',['params','wind'],0,1,.01),solar:range('Solar availability (fraction)',['params','solar'],0,1,.01),'must-run':{type:'checkbox',label:'Include must-run negative bids',path:['params','mustRunOn']}},
 {stack:{title:'Supply stack',description:'Illustrative uniform-price dispatch and marginal generation.',controls:['world','demand','gas','carbon','wind','solar','must-run'],render(s,ctx){const state={generators:buildStack(s.params,WORLDS[s.w].catalogue),demand:s.params.demand,wind:s.params.wind},r=dispatch(state.generators,state.demand),c=context(ctx);return {svg:renderStack(state,{...c,palette:MERIT_PALETTE[c.dark?'dark':'light']},{forExport:true,labelCollide:'drop'}),summary:buildVerdict(r,state)+' Illustrative uniform-price dispatch; excludes network constraints, start-up costs and strategic bidding.'};}}});

v1.views['stack'].defaultControls=['demand', 'wind', 'gas'];
// Version 2 (2026-11-13 engine audit): rent prints as £k an hour; with unmet demand the verdict says no price clears (last offer and shortfall) instead of quoting the dearest offer as a clearing price; "the wind has dropped" only when wind availability is low; shortfalls under 0.1 GW print in MW. Version 1 stays frozen as published.
export const definition={...v1,version:2};
