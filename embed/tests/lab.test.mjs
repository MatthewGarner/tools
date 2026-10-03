import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {validateState,applyControl} from '../core/schema.js';
import {encodeArticleFragment,decodeArticleFragment} from '../core/codec.js';
import {prepareArticleModel,readArticleStore,writeArticleStore,receiveArticleWorkspace} from '../../lab/dist/shared/article-import.js';
import {initialState,transition} from '../../lab/dist/reframe/state.js';
const definitions=await Promise.all((await readdir(new URL('../definitions/',import.meta.url))).filter(f=>f.startsWith('lab-')&&f.endsWith('.js')).map(async file=>(await import('../definitions/'+file)).definition));
for(const definition of definitions)test(definition.id+' has an isolated valid default and finite rendered views',async()=>{
 const before=JSON.stringify(definition.initialState),state=validateState(definition,definition.initialState);
 for(const view of Object.values(definition.views)){
  const result=await view.render(state,{width:390,theme:'dark',dark:true,colors:{}});
  assert.ok(result.svg?.startsWith('<svg'));assert.ok(result.summary.length>20);assert.doesNotMatch(result.svg,/\b(?:NaN|Infinity|undefined)\b/);
 }
 assert.equal(JSON.stringify(definition.initialState),before);
});
test('moving a team capability changes completed work or waiting on identical inputs',async()=>{
 const d=definitions.find(d=>d.id==='lab-teams');const next=applyControl(d,d.initialState,'software','a');
 const view=d.views[d.defaultView];assert.notEqual(view.render(next,{}).summary,view.render(d.initialState,{}).summary);
 assert.deepEqual(next.baseline,d.initialState.baseline);
});
test('coaching time changes the actual queue trajectory',()=>{
 const d=definitions.find(d=>d.id==='lab-knowledge'),view=d.views[d.defaultView];
 const next=applyControl(d,d.initialState,'start',15);assert.notEqual(view.render(next,{}).svg,view.render(d.initialState,{}).svg);
});
function environment(definition){const values=new Map(),calls=[];return{localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);calls.push(k)},removeItem:k=>values.delete(k)},location:{hash:'#'+encodeArticleFragment({tool:definition.id,version:1,state:definition.initialState}),pathname:'/lab/'+definition.id.slice(4)+'/',search:''},history:{state:null,replaceState(_state,_title,url){this.url=url;}},crypto:{randomUUID:()=> 'new-work'},values,calls};}
test('a model handoff never writes its current slot or intercepts a different key',async()=>{
 const d=definitions.find(d=>d.id==='lab-knowledge'),env=environment(d),key='thinking-lab:knowledge:v1';env.values.set(key,'existing personal work');
 assert.equal(await prepareArticleModel('knowledge',key,env),true);assert.deepEqual(readArticleStore(key).value,d.initialState);
 const changed=applyControl(d,d.initialState,'start',10);assert.deepEqual(writeArticleStore(key,changed),{handled:true,saved:true});
 assert.deepEqual(decodeArticleFragment(env.history.url.slice(env.history.url.indexOf('#')),{tool:d.id}),changed);
 assert.equal(env.values.get(key),'existing personal work');assert.deepEqual(env.calls,[]);assert.deepEqual(writeArticleStore('another-key',{}),{handled:false});
});
test('published Teams v1 handoffs migrate additively while unknown versions preserve personal work',async()=>{
 const d=definitions.find(d=>d.id==='lab-teams'),legacy=structuredClone(d.initialState);delete legacy.relationships;delete legacy.baseline.relationships;legacy.layout.software='a';
 const env=environment(d),key='teams-migration-test';env.location.hash='#'+encodeArticleFragment({tool:d.id,version:1,state:legacy});env.values.set(key,'personal');
 assert.equal(await prepareArticleModel('teams',key,env),true);
 const current=readArticleStore(key).value;assert.equal(current.layout.software,'a');assert.deepEqual(current.relationships,d.initialState.relationships);
 assert.deepEqual(writeArticleStore(key,current),{handled:true,saved:true});assert.deepEqual(decodeArticleFragment(env.history.url.slice(env.history.url.indexOf('#')),{tool:d.id,version:2}),current);
 assert.equal(env.values.get(key),'personal');assert.deepEqual(env.calls,[]);
 env.location.hash='#'+encodeArticleFragment({tool:d.id,version:3,state:current});assert.equal(await prepareArticleModel('teams',key,env),false);assert.deepEqual(writeArticleStore(key,current),{handled:true,saved:false});assert.equal(env.values.get(key),'personal');
});
test('scaffold handoff preserves previous sessions and consumes only a successful import',async()=>{
 const d=definitions.find(d=>d.id==='lab-reframe'),env=environment(d),prior=initialState(),key='thinking-lab:reframe:v1';
 env.values.set(key,JSON.stringify(prior));const result=await receiveArticleWorkspace({route:'reframe',state:prior,key,append:(state,session,id)=>transition(state,{type:'import-session',session,id})},env);
 assert.equal(result.imported,true);assert.equal(result.state.sessions.length,2);assert.deepEqual(result.state.sessions[0],prior.sessions[0]);assert.equal(env.history.url,'/lab/reframe/');
 env.location.hash='#article:invalid';env.history.url=null;const saved=env.values.get(key);const rejected=await receiveArticleWorkspace({route:'reframe',state:result.state,key,append(){throw Error('must not append')}},env);
 assert.equal(rejected.imported,false);assert.equal(env.values.get(key),saved);assert.equal(env.history.url,null);
});

test('all registered Lab routes and their lifecycle states are represented',async()=>{
 const {experiments}=await import('../../lab/dist/shared/catalog.js');
 assert.deepEqual(definitions.map(d=>d.id).sort(),experiments.map(x=>'lab-'+x.route).sort());
 for(const d of definitions){const route=experiments.find(x=>'lab-'+x.route===d.id);assert.equal(d.status,route.status||'active');}
});
for(const d of definitions)for(const [name,run]of Object.entries(d.actions||{}))test(d.id+' '+name+' preserves portable state across repeated actions',async()=>{
 let state=structuredClone(d.initialState);for(let i=0;i<2;i++){const previous=JSON.stringify(state),next=run(state);assert.equal(JSON.stringify(state),previous);state=validateState(d,next);for(const v of Object.values(d.views)){const r=await v.render(state,{width:390,theme:'light'});assert.doesNotMatch(r.svg,/\b(?:NaN|Infinity|undefined)\b/);}}
});
for(const d of definitions)test(d.id+' accepts its controls at their declared numeric boundaries',()=>{
 for(const [id,c]of Object.entries(d.controls)){if(c.type==='range'||c.type==='number')for(const value of [c.min,c.max])if(value!==undefined)validateState(d,applyControl(d,d.initialState,id,value));}
});
for(const d of definitions){const m=await import('../definitions/'+d.id+'.js');if(m.toToolState)test(d.id+' roundtrips canonical inputs through its native model save',()=>{
 const states=[d.initialState,...Object.values(d.actions||{}).map(fn=>fn(structuredClone(d.initialState)))];for(const state of states)assert.deepEqual(validateState(d,m.fromToolState(m.toToolState(state))),state);
});}
test('a rejected article model cannot trigger an autosave over the existing slot',async()=>{
 const d=definitions.find(d=>d.id==='lab-local'),env=environment(d),key='thinking-lab:local:v1';env.values.set(key,'personal');env.location.hash='#article:broken';
 assert.equal(await prepareArticleModel('local',key,env),false);assert.deepEqual(readArticleStore(key),{found:false});assert.deepEqual(writeArticleStore(key,{}),{handled:true,saved:false});assert.equal(env.values.get(key),'personal');assert.deepEqual(env.calls,[]);
});
test('native scene placement and analogy mapping retain review invalidation',()=>{
 const scenes=definitions.find(d=>d.id==='lab-scenes'),moved=scenes.actions.move(scenes.initialState);assert.equal(moved.ideas[0].stale,true);assert.notEqual(moved.ideas[0].momentId,scenes.initialState.ideas[0].momentId);
 const analogy=definitions.find(d=>d.id==='lab-analogy'),mapped=analogy.actions.allocator(analogy.initialState);assert.equal(mapped.mappings.length,analogy.initialState.mappings.length+1);assert.deepEqual(analogy.initialState.reviews['article-l5'],mapped.reviews['article-l5']);
});

for(const route of ['answers','objections','territory','scenes','family','questions','disagreement','interventions','constraints','analogy','mixer'])test(route+' imports the complete active workspace additively through its native reducer',async()=>{
 const d=definitions.find(d=>d.id==='lab-'+route),env=environment(d),key='thinking-lab:'+route+':v1';let prior,append;
 if(['answers','objections','territory','scenes','family','questions','disagreement'].includes(route)){
  const config=await import('../../lab/dist/'+route+'/state.js'),{advance}=await import('../../lab/dist/creative-kit/state.js');prior={version:1,activeId:'previous',workspaces:[config.make('previous')]};append=(current,workspace,id)=>advance(current,{type:'import',workspace,id},config);
 }else if(route==='interventions'){
  const {model}=await import('../../lab/dist/interventions/state.js');prior=model.initial();append=(current,workspace,id)=>model.transition(current,{type:'@import',workspace,id});
 }else if(route==='mixer'){
  const {createWorkspace,validateWorkspace}=await import('../../lab/dist/mixer/model.js'),w=createWorkspace();prior={activeId:w.id,workspaces:[w]};append=(current,workspace,id)=>({...current,activeId:id,workspaces:[...current.workspaces,validateWorkspace({...workspace,id})]});
 }else{
  const m=await import('../../lab/dist/'+route+'/state.js');prior=m.initialState();append=(current,workspace,id)=>m.apply(current,{type:'import',workspace,id});
 }
 env.values.set(key,JSON.stringify(prior));const before=structuredClone(prior),result=await receiveArticleWorkspace({route,state:prior,key,append},env);
 assert.equal(result.imported,true,result.error);assert.equal(result.state.workspaces.length,2);assert.deepEqual(result.state.workspaces[0],before.workspaces[0]);assert.deepEqual(prior,before);assert.equal(result.state.activeId,'article-new-work');assert.equal(result.state.workspaces[1].problem,d.initialState.problem);assert.equal(env.history.url,'/lab/'+route+'/');
 // A full/recovery-paused workspace cannot be silently replaced by an example.
 const saved=env.values.get(key);env.history.url=null;const rejected=await receiveArticleWorkspace({route,state:prior,key,append,paused:true},env);assert.equal(rejected.imported,false);assert.equal(env.values.get(key),saved);assert.equal(env.history.url,null);
});
test('storage rejection leaves the scaffold URL available for recovery',async()=>{
 const d=definitions.find(d=>d.id==='lab-reframe'),env=environment(d),state=initialState();env.localStorage.setItem=()=>{throw Error('Quota exceeded')};
 const r=await receiveArticleWorkspace({route:'reframe',state,key:'thinking-lab:reframe:v1',append:(s,session,id)=>transition(s,{type:'import-session',session,id})},env);assert.equal(r.imported,false);assert.deepEqual(r.state,state);assert.equal(env.history.url,undefined);
});
test('pending flexibility input and custom adoption links survive the handoff',async()=>{
 const flex=await import('../definitions/lab-flexibility.js'),s=structuredClone(flex.definition.initialState),{publicView,restore,preview}=await import('../../lab/dist/flexibility/engine.js');s.selected=[publicView(restore(s.run)).currentOffers[0].id];const p=preview(publicView(restore(s.run)),s.selected);s.dispatch=p.range.max;
 assert.deepEqual(flex.fromToolState(flex.toToolState(validateState(flex.definition,s))),s);
 const adoption=await import('../definitions/lab-adoption.js'),{toggleLink,validateBundle}=await import('../../lab/dist/adoption/plans.js'),next=validateBundle({...adoption.definition.initialState,s:toggleLink(adoption.definition.initialState.s,0,6)});assert.deepEqual(validateState(adoption.definition,next),next);
});
test('nested chart viewports have explicit dimensions so parent SVG height cannot stretch the plot',()=>{
 for(const id of ['lab-knowledge','lab-commitment','lab-delay','lab-exploration','lab-predictions']){const d=definitions.find(d=>d.id===id),svg=d.views[d.defaultView].render(d.initialState,{width:1000}).svg;const nested=[...svg.matchAll(/<svg\b[^>]*>/g)].slice(1);assert.ok(nested.length);for(const [tag]of nested){assert.match(tag,/\bwidth="\d+"/);assert.match(tag,/\bheight="\d+"/);}}
});
