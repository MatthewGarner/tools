import test from 'node:test';
import assert from 'node:assert/strict';
import {make,apply,validate,design,markdown} from './state.js';
import {make as makeFamily,apply as familyAction,FIELDS as FAMILY_FIELDS} from '../family/state.js';
import {migrate,parseImport} from './import.js';
import {history,transition,undo} from '../creative-kit/state.js';
const config={make,apply,validate};
test('all 24 Family Tree concepts, both parents, original snapshots, reasons, parked state and comparison migrate intact',()=>{
 const old=makeFamily();familyAction(old,{type:'combine',id:'combined'});old.nodes[0].title='Edited root title';old.nodes[0].parked=true;for(let i=3;i<24;i++)familyAction(old,{type:'fork',parent:'combined',id:'node-'+i});old.nodes.at(-1).ingredients='Long ingredient record '.repeat(400);old.compare=['combined','node-23'];const original=structuredClone(old),w=migrate('family',old);
 assert.deepEqual(old,original);assert.deepEqual(w.source.workspace,original);assert.equal(w.designs.length,24);assert.deepEqual(w.comparison,old.compare);assert.equal(w.designs[0].ancestry.parked,true);
 for(let i=0;i<24;i++){const n=old.nodes[i],d=w.designs[i];for(const [f,to]of Object.entries({title:'title',mechanism:'mechanism',benefit:'benefit',ingredients:'ingredients',changed:'difference',why:'reason',test:'test'}))assert.equal(d[to],n[f]);assert.deepEqual(d.ancestry.parents.map(p=>p.id),n.parents);for(let j=0;j<n.sources.length;j++){assert.equal(d.ancestry.parents[j].title,n.sources[j].title);assert.equal(d.ancestry.parents[j].fields[0].text,n.sources[j].mechanism);}}
 assert.deepEqual(parseImport(JSON.stringify({kind:'objections',version:1,workspace:w})),w);assert.match(markdown(w),/Original imported workspace/);assert.match(markdown(w),/Testing understanding/);
});
test('combining leaves both parents and a blank mechanism; edits do not update snapshots, parking and Undo retain ancestors',()=>{
 let w=make();apply(w,{type:'branch',parent:'d1',id:'d2'});validate(w);const h=history({version:1,activeId:w.id,workspaces:[w]}),next=transition(h,{type:'combine',id:'d3',parents:['d1','d2']},config);w=next.present.workspaces[0];assert.equal(w.designs[2].mechanism,'');assert.equal(w.designs[2].ancestry.parents.length,2);const saved=structuredClone(w.designs[2].ancestry);apply(w,{type:'edit',collection:'designs',item:'d1',field:'mechanism',value:'Changed parent'});assert.deepEqual(w.designs[2].ancestry,saved);assert.throws(()=>apply(w,{type:'remove-design',id:'d1'}),/descendants/);apply(w,{type:'park',id:'d1'});assert.equal(w.designs[0].ancestry.parked,true);assert.deepEqual(undo(next).present,h.present);
});
test('duplicate parents, cyclic imports and branches that would exceed the export limit leave existing work alone',()=>{
 const w=make('large','blank');for(let i=0;i<31;i++){const d=design('d'+i,'first');for(const f of ['mechanism','benefit','cost','difference','assumptions','evidence','boundary','assessment','test','learn','reason','ingredients'])d[f]='x'.repeat(20000);w.designs.push(d);}validate(w);const h=history({version:1,activeId:w.id,workspaces:[w]});assert.throws(()=>transition(h,{type:'branch',id:'last',parent:'d0'},config),/export limit/);assert.equal(h.present.workspaces[0].designs.length,31);assert.throws(()=>transition(h,{type:'combine',id:'last',parents:['d0','d0']},config),/different parents/);
 const small=make();apply(small,{type:'branch',parent:'d1',id:'d2'});small.designs[0].ancestry=structuredClone(small.designs[1].ancestry);assert.throws(()=>validate(small),/descend/);
});
