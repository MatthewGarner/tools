import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_DIRS,ENERGY_TOOL_DIRS} from '../../dev/tool-dirs.mjs';
import {validateState,applyControl} from '../core/schema.js';
import {definitionMetadata} from '../core/definition.js';
import {fullToolURL} from '../core/codec.js';
import {decodeHash} from '../../assets/series.js';
import {fromLink as importRegister} from '../../premortem/links.js';
const ids=[...TOOL_DIRS,...ENERGY_TOOL_DIRS.map(id=>'energy-'+id)];
const definitions=Object.fromEntries(await Promise.all(ids.map(async id=>[id,(await import('../definitions/'+id+'.js')).definition])));
const colors={card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',err:'#b33',track:'#eee',grid:'#ddd',status:{done:'#1D7A3E',doing:'#1F4FD8',risk:'#9A6A00',blocked:'#B3403A'},statusInk:{done:'#1C753C',doing:'#1A44C2',risk:'#8E6200',blocked:'#B3403A'},accentInk:'#0A6C94',brand:'#E2231A',brandText:'#D62015'};
const context=(dark=false,width=390)=>({width,dark,theme:dark?'dark':'light',today:'2026-10-03',colors:{...colors,...dark?{card:'#1a1a19',bg:'#121212',ink:'#f1f1ee',muted:'#aaa',border:'#333'}:{}},measure:t=>String(t).length*7});
for(const id of ids)test(id+' has a bounded native state, portable handoff and deterministic views',async()=>{
 const d=definitions[id],before=JSON.stringify(d.initialState);definitionMetadata(d);
 assert.equal(d.id,id);assert.equal(d.version,id==='flow'?2:1);
 const s=validateState(d,d.initialState),href=fullToolURL(d,s);
 assert.deepEqual(await decodeHash(new URL(href).hash.slice(1)),s);
 const projected=d.project?d.project(s):undefined;
 if(projected)assert.doesNotThrow(()=>structuredClone(projected));
 for(const [viewName,v]of Object.entries(d.views)){
  const ctx=context(),a=await v.render(s,ctx,projected),b=await v.render(s,ctx,projected);
  assert.deepEqual(a,b,id+' '+viewName+' is deterministic');
  assert.match(a.summary,/illustrative|synthetic/i);assert.ok(a.summary.length>35);
  for(const rendered of [a,await v.render(s,context(true,800),projected)]){
   const output=rendered.svg||rendered.html;assert.ok(output?.length>100,id+' produces an artefact');
   assert.doesNotMatch(output,/\bNaN\b|undefined|\[object Object\]|<script\b|\son[a-z]+\s*=/i);
   if(rendered.svg)assert.match(output,/<svg\b/);else assert.match(output,/<(?:section|div)\b/);
  }
 }
 assert.equal(JSON.stringify(d.initialState),before,'rendering cannot mutate the example');
 assert.throws(()=>validateState(d,{...s,unrecognised:true}));
 if(Object.hasOwn(s,'t'))assert.throws(()=>validateState(d,{...s,t:'x'.repeat(8001)}));
});
test('rank heterogeneous tuples reject misplaced types before entering the engine',()=>{
 const d=definitions.rank,s=structuredClone(d.initialState);s.c[0]=[2,'Value'];assert.throws(()=>validateState(d,s));
 const next=applyControl(d,d.initialState,'value',5);assert.equal(next.c[0][1],5);assert.equal(d.initialState.c[0][1],3);
});
test('bad domain inputs fail explicitly instead of switching to another example',()=>{
 const mutations={flow:s=>s.d=100,tree:s=>s.t='',gauge:s=>s.t='title: Empty',fermi:s=>s.v.people=['20','10','auto'],'energy-cycles':s=>s.t=s.t.replace('15yr','300yr'),'energy-intraday':s=>s.p.fleetGW=12000,premortem:s=>s.entries[0].id='" onmouseover="alert(1)'};
 for(const [id,change]of Object.entries(mutations)){const d=definitions[id],s=structuredClone(d.initialState);change(s);assert.throws(()=>validateState(d,s),id);}
});
test('Duel choices and undo are real pairwise actions on independent state',()=>{
 const d=definitions.duel,original=structuredClone(d.initialState),next=applyControl(d,original,'first');
 assert.equal(next.duels.length,1);assert.equal(next.duels[0].w,next.duels[0].a);assert.deepEqual(original,d.initialState);
 assert.deepEqual(applyControl(d,next,'undo'),original);
 let complete=original;for(let i=0;i<6;i++)complete=applyControl(d,complete,'first');assert.equal(complete.duels.length,6);
 assert.deepEqual(applyControl(d,complete,'first'),complete);
});
test('Premortem output has no dead app controls and imports without changing assumptions',async()=>{
 const d=definitions.premortem,s=d.initialState,r=await d.views.register.render(s,context());
 assert.doesNotMatch(r.html,/<button|data-act=/);
 const imported=await importRegister(new URL(fullToolURL(d,s)).hash);assert.ok(imported);
 for(let i=0;i<s.entries.length;i++)for(const key of ['text','p','impact','status','actions'])assert.deepEqual(imported.entries[i][key],s.entries[i][key]);
 assert.equal(imported.unit,s.unit);assert.equal(imported.phase,'REGISTER');
});
test('Gauge discloses synthetic data and question-only handoff',async()=>{
 const d=definitions.gauge,r=await d.views.sample.render(d.initialState,context());
 assert.match(r.svg,/SYNTHETIC SAMPLE/);assert.match(d.fullTool.description,/questions.*Synthetic sample responses/s);
});
test('Cycles projection supports an off-thread structured-clone boundary',()=>{
 const d=definitions['energy-cycles'];assert.equal(d.worker,true);const state=structuredClone(d.initialState),p=d.project(state);
 assert.deepEqual(d.views.model.render(state,context(),p),d.views.model.render(state,context(),structuredClone(p)));
});
