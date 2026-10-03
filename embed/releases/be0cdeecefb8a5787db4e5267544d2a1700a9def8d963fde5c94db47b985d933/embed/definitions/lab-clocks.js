import {INITIAL,LANES,SCENARIOS,validate} from '../../lab/dist/clocks/model.js';
import {render} from '../../lab/dist/clocks/view.js';
import {base,clone,objectSchema,enumSchema,rangeSchema,select,range} from './_lab.js';
const schema=objectSchema({version:{type:'integer',enum:[1]},scenario:enumSchema(Object.keys(SCENARIOS)),clocks:objectSchema(Object.fromEntries(LANES.map(l=>[l.id,objectSchema({start:rangeSchema(1,28,true),every:rangeSchema(1,28,true)})]))),reviewCost:rangeSchema(0,3),attention:rangeSchema(0,30)});
const controls={scenario:select('External event stream',['scenario'],Object.fromEntries(Object.entries(SCENARIOS).map(([id,s])=>[id,s.name]))),...Object.fromEntries(LANES.map(l=>[l.id,range(l.name+' first day',['clocks',l.id,'start'],1,28)])),'review-every':range('Days between reviews',['clocks','review','every'],1,28),'review-cost':range('Attention per review',['reviewCost'],0,3,.25),attention:range('Total review attention',['attention'],0,30,.25)};
export const definition=base('clocks','The organisation’s clocks','Move discovery, review, funding and delivery; follow the evidence available at each action.',clone(INITIAL),validate,{timing:{title:'When evidence can affect action',description:'Four event clocks replay one external stream with explicit attention and ordering assumptions.',controls:Object.keys(controls),defaultControls:['scenario','review','review-every'],render}},controls,{},schema);
export const toToolState=state=>({state:clone(state),pinned:null});
export const fromToolState=raw=>clone(raw.state);
