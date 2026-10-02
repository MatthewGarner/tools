import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,active,apply,validateState,createHistory,change,undo,serialize,parse,markdown} from './state.js';
import {analysisChanged,analysisFields} from './transfers.js';
const capture=(s=initialState(),newId='option')=>apply(s,{type:'option-capture',newId});
const act=(s,type,args={})=>apply(s,{type,id:'option',...args});

test('legacy analysis and draft survive normalisation while new relationship fields remain explicit',()=>{
 const old=initialState();const w=active(old);for(const r of Object.values(w.reviews))for(const k of ['targetRelation','condition','failure'])delete r[k];
 for(const k of ['options','selectedOptionId','chosenOptionId','compareOptions','decision'])delete w[k];
 const before=structuredClone(w),s=validateState(old),current=active(s);
 for(const k of ['source','targets','mappings','plan','problem'])assert.deepEqual(current[k],before[k]);
 for(const [id,r] of Object.entries(before.reviews)){assert.equal(current.reviews[id].fit,r.fit);assert.equal(current.reviews[id].note,r.note);assert.equal(current.reviews[id].targetRelation,'');}
 assert.equal(current.options.length,0);
});

test('target interactions and changed context invalidate earlier judgements without deleting conditions or notes',()=>{
 let s=initialState();const link=active(s).selectedLink,oldNote=active(s).reviews[link].note;
 s=apply(s,{type:'review',id:link,field:'condition',value:'Capacity replenishes each week.'});s=apply(s,{type:'review',id:link,field:'failure',value:'Future slots are already promised.'});
 s=apply(s,{type:'review',id:link,field:'targetRelation',value:'A new slot arrives; spent hours do not return.'});assert.equal(active(s).reviews[link].fit,'unchecked');assert.equal(active(s).reviews[link].stale,true);
 s=apply(s,{type:'review',id:link,field:'fit',value:'partial'});s=apply(s,{type:'problem',value:'A changed target context'});assert.equal(active(s).reviews[link].fit,'unchecked');
 assert.equal(active(s).reviews[link].note,oldNote);assert.equal(active(s).reviews[link].condition,'Capacity replenishes each week.');assert.equal(active(s).reviews[link].failure,'Future slots are already promised.');
 s=apply(s,{type:'review',id:link,field:'fit',value:'fits'});s=apply(s,{type:'source',field:'principle',value:'A changed mechanism'});assert.equal(active(s).reviews[link].fit,'unchecked');
});

test('captured options retain complete independent source reasoning and explicit responses',()=>{
 let s=initialState();s=apply(s,{type:'review',id:active(s).selectedLink,field:'failure',value:'Time cannot be returned.'});s=capture(s);
 const a=structuredClone(active(s).options[0]);assert.equal(a.adaptation,active(s).plan.adaptation);assert.equal(a.relationships.at(-1).failure,'Time cannot be returned.');assert.ok(a.relationships.every(r=>r.treatment==='undecided'));
 assert.equal(analysisChanged(active(s),a),false);s=apply(s,{type:'role',side:'target',id:'first-t1',field:'job',value:'A different job'});assert.equal(analysisChanged(active(s),active(s).options[0]),true);assert.deepEqual(active(s).options[0],a);
 s=act(s,'option-response',{linkId:'first-l5',field:'treatment',value:'redesign'});s=act(s,'option-response',{linkId:'first-l5',field:'rewrite',value:'Replenish a budget of slots each week.'});
 assert.equal(active(s).options[0].relationships.at(-1).rewrite,'Replenish a budget of slots each week.');assert.equal(active(s).plan.adaptation,a.adaptation);
});

test('branching and recasting preserve parents; recasting never reuses verdicts for a different relationship',()=>{
 let s=capture();s=act(s,'option-response',{linkId:'first-l5',field:'treatment',value:'redesign'});s=act(s,'option-response',{linkId:'first-l5',field:'reason',value:'Time is consumed.'});
 s=act(s,'option-branch',{newId:'child'});const snapshot=structuredClone(active(s).options[1].ancestry);assert.equal(active(s).options[1].relationships.at(-1).treatment,'redesign');
 s=act(s,'option-edit',{field:'adaptation',value:'Parent changed later'});assert.deepEqual(active(s).options[1].ancestry,snapshot);
 s=apply(s,{type:'link',id:'first-l5',field:'label',value:'Creates a new opportunity'});s=act(s,'option-recast',{id:'child',newId:'recast'});
 const recast=active(s).options[2];assert.equal(recast.relationships.at(-1).sourceRelation,'Creates a new opportunity');assert.equal(recast.relationships.at(-1).treatment,'undecided');assert.equal(recast.relationships.at(-1).reason,'');assert.equal(recast.ancestry.parents[0].id,'child');assert.equal(analysisChanged(active(s),recast),false);
 assert.throws(()=>act(s,'option-remove'),/branches/);s=act(s,'option-park');assert.equal(active(s).options[0].ancestry.parked,true);assert.equal(active(s).compareOptions.includes('option'),false);
});

test('trying another source carries independent adaptations while preserving the original mapping and draft',()=>{
 let s=capture();s=act(s,'option-choose');s=act(s,'option-decision',{value:'Compare slot reservations against urgency triage.'});const original=structuredClone(active(s));
 s=apply(s,{type:'fork-source',id:'triage-work',source:'triage'});const w=active(s);assert.deepEqual(s.workspaces[0],original);assert.deepEqual(w.options,original.options);assert.equal(w.chosenOptionId,'option');assert.equal(w.plan.adaptation,'');assert.equal(w.mappings.length,0);
 s=act(s,'option-edit',{field:'title',value:'Copied library option'});assert.notEqual(s.workspaces[0].options[0].title,active(s).options[0].title);
 s=capture(s,'triage-option');assert.equal(active(s).options[1].basis.title,'Triage');assert.equal(active(s).options[0].basis.title,'Library reservations');
});

test('portable imports remap live ancestry but keep frozen analysis identity and all source records',()=>{
 let s=capture();s=act(s,'option-branch',{newId:'child'});s=act(s,'option-edit',{id:'child',field:'reason',value:'Try a rolling pool.'});s=act(s,'option-choose',{id:'child'});s=act(s,'option-decision',{value:'Start with one specialist.'});
 const original=structuredClone(active(s));s=apply(s,{type:'import',id:'imported',workspace:parse(serialize(original))});const w=active(s);
 assert.deepEqual(s.workspaces[0],original);assert.equal(w.options[1].ancestry.parents[0].id,'imported-a1');assert.equal(w.chosenOptionId,'imported-a2');assert.equal(w.options[1].relationships[0].id,'first-l1');assert.equal(analysisChanged(w,w.options[0]),false);
 assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);const md=markdown(w);for(const phrase of ['Try a rolling pool.','Start with one specialist.','Returns the resource for reuse','Parent snapshot','Target function','Working principle'])assert.ok(md.includes(phrase),phrase);
});

test('invalid selections, treatments and cyclic ancestry reject atomically; Undo includes comparisons and grouped text',()=>{
 const start=capture();let h=createHistory(start);h=change(h,{type:'option-edit',id:'option',field:'title',value:'A'},'title');h=change(h,{type:'option-edit',id:'option',field:'title',value:'A full title'},'title');h=change(h,{type:'option-response',id:'option',linkId:'first-l5',field:'treatment',value:'omit'});h=change(h,{type:'option-choose',id:'option'});
 for(let i=0;i<3;i++)h=undo(h);assert.deepEqual(h.present,start);
 assert.throws(()=>act(start,'option-response',{linkId:'first-l5',field:'treatment',value:'__proto__'}));assert.throws(()=>act(start,'option-branch',{newId:'option'}));
 for(const mutate of [w=>w.chosenOptionId='missing',w=>w.compareOptions=['option','option'],w=>w.options[0].relationships.push(w.options[0].relationships[0]),w=>w.options[0].ancestry={version:1,parked:false,parents:[{id:'option',title:'Self',fields:[]}]}]){const w=structuredClone(active(start));mutate(w);assert.throws(()=>parse(JSON.stringify({kind:'thinking-lab-analogy',version:1,workspace:w})));}
});

test('maximum-length Unicode reasoning stays separate in bounded, flat snapshots and oversized captures fail safely',()=>{
 let s=initialState();const long='界'.repeat(20000);s=apply(s,{type:'review',id:'first-l5',field:'condition',value:long});s=apply(s,{type:'review',id:'first-l5',field:'failure',value:long});s=capture(s);s=act(s,'option-edit',{field:'title',value:long});s=act(s,'option-response',{linkId:'first-l5',field:'reason',value:long});s=act(s,'option-branch',{newId:'long-child'});
 assert.equal(active(s).options[1].ancestry.parents[0].title,long);assert.ok(active(s).options[1].ancestry.parents[0].fields.some(f=>f.text===long));assert.ok(analysisFields(active(s)).length<=160);assert.deepEqual(parse(serialize(active(s))),active(s));
 let reached=false;for(let i=0;i<16;i++){const before=structuredClone(s);try{s=act(s,'option-branch',{id:active(s).options.at(-1).id,newId:'next-'+i});}catch(error){assert.match(error.message,/export limit/);assert.deepEqual(s,before);reached=true;break;}}assert.equal(reached,true);
});
