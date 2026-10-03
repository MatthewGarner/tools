import test from 'node:test';
import assert from 'node:assert/strict';
import {create,validate,reduce,model,markdown,attemptSourceStatus,ATTEMPT_LIMIT} from './state.js';
import {createHistory,commit,undo} from '../workshop-kit/state.js';

const edit=(w,id,field,value)=>reduce(w,{type:'option',id,field,value});
function planned(){let w=create();const id=w.options[0].id;w=edit(w,id,'expected','Fewer incomplete reviews, with no rise in rework.');w=edit(w,id,'test','Use a readiness question for two weeks.');w=edit(w,id,'competing','A quieter week could also reduce delays.');w=edit(w,id,'observe','Compare requests of the same size.');return reduce(w,{type:'choose',id});}
const start=(w,newId='attempt-1',startedOn='2026-10-03')=>reduce(w,{type:'start-attempt',id:w.chosenId,newId,startedOn});
const review=(id='attempt-1')=>({type:'review-attempt',id,reviewedOn:'2026-10-17',observations:'Four of six requests were ready, with one returned for rework.',interpretation:'Readiness improved, but the mix of requests was easier.',decision:'revise',reason:'The comparison did not distinguish the quieter week.',nextCheck:'Repeat with a matched request mix on 24 October.'});

test('earlier workspaces default to no attempts without changing their format or prior observations',()=>{
 const old=planned();delete old.attempts;old.links[0].observations='A prior observation, not a new test.';
 const w=validate(old);assert.deepEqual(w.attempts,[]);assert.equal(w.links[0].observations,old.links[0].observations);
 assert.deepEqual(model.parse(model.serialize(w)),w);assert.equal(JSON.parse(model.serialize(w)).version,1);
});

test('starting a test freezes the selected intervention, expectation and causal context without ancestors',()=>{
 let w=planned();const parent=w.chosenId;w=reduce(w,{type:'branch',id:parent,newId:'variation'});w=reduce(w,{type:'choose',id:'variation'});w=start(w);
 const a=w.attempts[0],field=label=>a.source.fields.find(f=>f.label===label)?.text;
 assert.equal(a.startedOn,'2026-10-03');assert.equal(a.source.id,'variation');assert.equal(field('expected'),'Fewer incomplete reviews, with no rise in rework.');
 assert.equal(field('test'),'Use a readiness question for two weeks.');assert.equal(field('Relationship · mechanism'),w.links[0].mechanism);assert.equal(field('Relationship · Cause'),w.steps[0].name);assert.equal(field('competing'),'A quieter week could also reduce delays.');
 assert.equal(a.reviewedOn,'');assert.equal(a.decision,'undecided');assert.equal(a.observations,'');assert.ok(!JSON.stringify(a.source).includes('parents'));assert.equal(Object.hasOwn(a.source,'ancestry'),false);
 assert.equal(attemptSourceStatus(w,a),'Original intervention unchanged');
});

test('later tests keep their own original wording when expectations, problem or causal claims change',()=>{
 let w=start(planned()),original=structuredClone(w.attempts[0]);
 w=edit(w,w.chosenId,'expected','Less rework, even if reviews take longer.');w=reduce(w,{type:'problem',value:'Can we trade waiting time for reliable decisions?'});w=reduce(w,{type:'link',id:w.links[0].id,field:'conditions',value:'Only decisions that can be reversed.'});
 assert.deepEqual(w.attempts[0],original);assert.match(attemptSourceStatus(w,w.attempts[0]),/changed/);
 w=start(w,'attempt-2','2026-10-20');assert.deepEqual(w.attempts[0],original);assert.equal(w.attempts[1].source.fields.find(f=>f.label==='expected').text,'Less rework, even if reviews take longer.');
 assert.equal(w.attempts[1].source.fields.find(f=>f.label==='Problem').text,w.problem);assert.equal(attemptSourceStatus(w,w.attempts[1]),'Original intervention unchanged');
});

test('removing a live intervention and relationship retains identifiable frozen attempts and allows review',()=>{
 let w=start(planned());const sourceId=w.chosenId,linkId=w.options[0].linkId,source=structuredClone(w.attempts[0].source);
 w=reduce(w,{type:'remove-option',id:sourceId});w=reduce(w,{type:'remove-link',id:linkId});w=reduce(w,review());
 assert.deepEqual(w.attempts[0].source,source);assert.equal(w.attempts[0].source.id,sourceId);assert.match(attemptSourceStatus(w,w.attempts[0]),/removed/);assert.equal(w.attempts[0].decision,'revise');
 const md=markdown(w);assert.match(md,/Original test and causal expectation/);assert.ok(md.includes(source.title));assert.match(md,/Source ID: first-o1/);assert.match(md,/Actual observations/);assert.match(md,/Four of six requests/);assert.match(md,/Expected|expected/);assert.match(md,/Repeat with a matched request mix/);assert.deepEqual(model.parse(model.serialize(w)),w);
});

test('a review separates observation, interpretation and decision without mutating the starting point',()=>{
 const initial=start(planned()),source=structuredClone(initial.attempts[0].source);let w=reduce(initial,review());
 assert.deepEqual(w.attempts[0].source,source);assert.equal(w.attempts[0].observations,review().observations);assert.equal(w.attempts[0].interpretation,review().interpretation);assert.equal(w.attempts[0].reviewedOn,'2026-10-17');
 for(const decision of ['continue','revise','stop','undecided']){w=reduce(w,{...review(),decision});assert.equal(w.attempts[0].decision,decision);}
 assert.deepEqual(initial.attempts[0].observations,'');assert.equal(initial.attempts[0].reviewedOn,'');
});

test('starting and recording a review are separate undoable changes and survive saving and imports',()=>{
 const state={version:1,activeId:'first',workspaces:[planned()]};let h=createHistory(state);
 h=commit(h,model.transition(h.present,{type:'start-attempt',id:state.workspaces[0].chosenId,newId:'attempt-1',startedOn:'2026-10-03'}));
 const started=structuredClone(h.present);h=commit(h,model.transition(h.present,review()));assert.deepEqual(model.validateState(h.present),h.present);
 h=undo(h);assert.deepEqual(h.present,started);h=undo(h);assert.deepEqual(h.present,state);
 const portable=model.parse(model.serialize(started.workspaces[0]));const imported=model.transition(state,{type:'@import',id:'imported',workspace:portable});assert.deepEqual(imported.workspaces[1].attempts,portable.attempts);
});

test('malformed or incomplete attempts and reviews reject atomically',()=>{
 const w=start(planned()),before=structuredClone(w);
 const mutations=[x=>x.attempts=null,x=>x.attempts[0].startedOn='2026-02-30',x=>x.attempts[0].reviewedOn='yesterday',x=>x.attempts[0].decision='approved',x=>x.attempts[0].source=null,x=>x.attempts[0].source.fields=[],x=>x.attempts[0].source.fields[0].text=42,x=>x.attempts.push(structuredClone(x.attempts[0])),x=>x.attempts[0].decision='continue',x=>x.attempts[0].source.id=''];
 for(const mutation of mutations){const bad=structuredClone(w);mutation(bad);assert.throws(()=>validate(bad));}
 for(const changed of [{reviewedOn:'2026-10-02'},{reviewedOn:'2026-02-30'},{observations:''},{reason:' '},{decision:'yes'},{id:'missing'}])assert.throws(()=>reduce(w,{...review(),...changed}));
 assert.throws(()=>reduce(w,{type:'start-attempt',id:w.chosenId,newId:'attempt-1',startedOn:'2026-10-03'}));assert.throws(()=>start(w,'attempt-2','03/10/2026'));assert.deepEqual(w,before);
});

test('attempt count and flat snapshots are bounded; long multibyte wording remains portable',()=>{
 let w=planned();w=edit(w,w.chosenId,'expected','観'.repeat(20000));w=start(w);
 assert.equal(w.attempts[0].source.fields.find(f=>f.label==='expected').text.length,20000);assert.deepEqual(model.parse(model.serialize(w)),w);
 const bounded=start(planned());bounded.attempts=Array.from({length:ATTEMPT_LIMIT},(_,i)=>({...structuredClone(bounded.attempts[0]),id:`attempt-${i}`}));const before=structuredClone(bounded);
 assert.throws(()=>start(bounded,'one-too-many'),/100 test attempts/);assert.deepEqual(bounded,before);
 const imported=structuredClone(w);imported.attempts[0].source.ancestry={parents:[{nested:'untrusted'}]};assert.equal(Object.hasOwn(validate(imported).attempts[0].source,'ancestry'),false);
});
