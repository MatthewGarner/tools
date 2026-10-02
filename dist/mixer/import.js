import {uid,validateWorkspace} from './model.js?v=0.18.0';
import {validate as validateTerritory} from '../territory/state.js?v=0.18.0';
import {noteKey} from './map.js?v=0.18.0';

export function fromTerritory(raw){
 const source=structuredClone(raw);if(typeof source?.id!=='string'||typeof source.problem!=='string'||source.problem.length>20000)throw Error('Invalid Territory workspace.');validateTerritory(source);
 // Territory IDs are only unique within an axis. Give every dimension/option
 // a fresh identity; never infer equivalence from coincident IDs or labels.
 const r={id:uid(),name:'Need',locked:false,options:source.needs.map(o=>({id:uid(),label:o.label}))},c={id:uid(),name:'Mechanism',locked:false,options:source.methods.map(o=>({id:uid(),label:o.label}))};
 const row=id=>id===null?null:r.options[source.needs.findIndex(o=>o.id===id)].id,col=id=>id===null?null:c.options[source.methods.findIndex(o=>o.id===id)].id;
 const [sn,sm]=source.selected.split('|');r.selectedId=row(sn);c.selectedId=col(sm);
 const w={id:uid(),schema:2,title:'Copied Territory workspace',problem:source.problem,dimensions:[r,c],concepts:source.ideas.map(i=>({id:uid(),title:i.title,mechanism:i.mechanism,useful:'',assumption:i.assumption,experiment:i.test,ingredients:[...(i.need?[{dimension:r.name,label:source.needs.find(x=>x.id===i.need).label}]:[]),...(i.method?[{dimension:c.name,label:source.methods.find(x=>x.id===i.method).label}]:[])],placement:{[r.id]:row(i.need),[c.id]:col(i.method)},fit:'',fitNeedsReview:false,origin:null,createdAt:''})),activeConceptId:null,view:'map',history:[],mixCount:0,map:{rowId:r.id,columnId:c.id,row:r.selectedId,column:c.selectedId,notes:{}},source:{kind:'territory',workspace:source}};
 for(const [key,g]of Object.entries(source.gaps)){const [n,m]=key.split('|'),coordinates=[{dimensionId:r.id,optionId:row(n)},{dimensionId:c.id,optionId:col(m)}];w.map.notes[noteKey(coordinates)]={coordinates,verdict:g.verdict,reason:g.reason};}
 w.activeConceptId=w.concepts[0]?.id??null;return validateWorkspace(w);
}
export function parseImport(raw){
 if(typeof raw!=='string'||raw.length>8000000)throw Error('Choose an export under 8 MB.');
 let value;try{value=JSON.parse(raw);}catch{throw Error('That file is not valid JSON.');}
 if(value?.kind==='territory'&&value.version===1)return fromTerritory(value.workspace);
 if(value?.kind&&value.kind!=='mixer'||value?.workspace&&value.version!==1)throw Error('Choose a Mixer or Territory export.');
 return validateWorkspace(value.workspace??value);
}
