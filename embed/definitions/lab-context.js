import {base,objectSchema,rangeSchema,enumSchema,range,action,select} from './_lab.js';
import {initialState,validate,factIds,decisionFirst} from '../../lab/dist/context/model.js';
import {renderArticle} from '../../lab/dist/context/view.js';
const int=(min,max)=>rangeSchema(min,max,true),array=(items,min,max=min)=>({type:'array',items,minItems:min,maxItems:max}),bool={type:'boolean'};
const schema=objectSchema({scenario:enumSchema(['blocker','routine','fragile']),facts:objectSchema({ready:int(0,100),blocker:bool,rollback:bool,dependency:bool,reach:int(0,1000),budget:int(0,100),date:int(0,30),sentiment:int(0,10)}),costs:objectSchema(Object.fromEntries(factIds.map(id=>[id,int(1,4)]))),capacities:array(int(1,24),3),orders:array(array(enumSchema(factIds),8),3),queries:array(enumSchema(factIds),0,8),queryDuration:int(1,4),decisionWindow:int(0,12),threshold:int(0,100),unknown:enumSchema(['launch','pilot','hold'])});
const controls={capacity:range('Final brief attention',['capacities',2],1,24),priority:action('Put decision conditions first','priority'),unknown:select('When required evidence is missing',['unknown'],{launch:'Launch',pilot:'Pilot',hold:'Hold'})};
export const definition=base('context','What survived the status update?','Carry facts through finite attention; see which omissions change a decision.',initialState,validate,{report:{title:'The reporting chain',description:'Facts carried, facts omitted, and the resulting decision.',controls:Object.keys(controls),defaultControls:['capacity','priority'],render:renderArticle}},controls,{priority:decisionFirst},schema);
export const toToolState=state=>({state,pinned:null});
export const fromToolState=raw=>raw.state;
