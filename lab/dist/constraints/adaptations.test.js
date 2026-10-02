import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, active, apply, createHistory, change, undo, validateState, parse, serialize, markdown} from './state.js';
import {fitSummary} from './adaptations.js';
const create=()=>{let s=initialState();s=apply(s,{type:'move',id:'first-c1',lane:'current'});return apply(s,{type:'adapt-create',cardId:'first-c1',lane:'reverse',newId:'original'});};
const act=(s,type,props={})=>apply(s,{type,id:'original',...props});

test('legacy notes survive normalisation and each returned experiment creates an independent practical alternative',()=>{
 let legacy=initialState();const w=active(legacy);for(const key of ['adaptations','compareIds','chosenId','decision','selectedAdaptationId'])delete w[key];
 const before=structuredClone(w.cards);let s=validateState(legacy);assert.deepEqual(active(s).cards,before);
 assert.throws(()=>act(s,'adapt-create',{newId:'no',cardId:'first-c1',lane:'reverse'}),/Restore/);
 s=apply(s,{type:'move',id:'first-c1',lane:'current'});
 s=act(s,'adapt-create',{newId:'original',cardId:'first-c1',lane:'reverse'});
 s=act(s,'adapt-create',{newId:'other',cardId:'first-c1',lane:'reverse'});
 const a=active(s).adaptations[0];assert.equal(a.mechanism,before[0].notes.reverse.adaptation);assert.equal(a.checks.length,4);
 assert.equal(a.ancestry.parents[0].fields.find(f=>f.label==='whatIf').text,before[0].notes.reverse.whatIf);
 const source=structuredClone(a.ancestry);
 s=apply(s,{type:'note',id:'first-c1',lane:'reverse',field:'possible',value:'A later thought'});
 s=act(s,'adapt-edit',{field:'mechanism',value:'Only this option changes'});
 assert.deepEqual(active(s).adaptations[0].ancestry,source);assert.equal(active(s).adaptations[1].mechanism,before[0].notes.reverse.adaptation);
});

test('fit judgements record reasons, expose new/changed limits and require a new verdict after review',()=>{
 let s=create();s=act(s,'adapt-check',{cardId:'first-c1',field:'status',value:'fits'});
 s=act(s,'adapt-check',{cardId:'first-c1',field:'explanation',value:'Within the original rule.'});
 const original=structuredClone(active(s).adaptations[0].checks[0].original);
 s=apply(s,{type:'card',id:'first-c1',field:'text',value:'Every choice now needs two named approvals.'});
 let f=fitSummary(active(s),active(s).adaptations[0]);assert.equal(f.changed.length,1);assert.equal(f.unexplained,3);
 s=act(s,'adapt-review',{cardId:'first-c1'});const c=active(s).adaptations[0].checks[0];
 assert.equal(c.status,'unresolved');assert.equal(c.explanation,'Within the original rule.');assert.deepEqual(c.original,original);assert.equal(c.reviewed.text,'Every choice now needs two named approvals.');
 s=apply(s,{type:'add',id:'new-limit'});assert.equal(fitSummary(active(s),active(s).adaptations[0]).missing.length,1);
 s=act(s,'adapt-sync');assert.equal(active(s).adaptations[0].checks.at(-1).status,'unresolved');
 s=apply(s,{type:'remove',id:'first-c1'});assert.equal(fitSummary(active(s),active(s).adaptations[0]).removed,1);assert.deepEqual(active(s).adaptations[0].checks[0].original,original);
});

test('branches freeze mechanism and fit reasoning, preserve parents, and can be parked without losing history',()=>{
 let s=create();s=act(s,'adapt-edit',{field:'kept',value:'Shared objections'});s=act(s,'adapt-check',{cardId:'first-c1',field:'explanation',value:'Ask the owner for a trial.'});
 s=act(s,'adapt-branch',{newId:'branch'});const snapshot=structuredClone(active(s).adaptations[1].ancestry);
 assert.equal(snapshot.parents[0].id,'original');assert.ok(snapshot.parents[0].fields.some(f=>f.text.includes('Ask the owner')));
 s=act(s,'adapt-edit',{field:'kept',value:'Parent changed'});assert.deepEqual(active(s).adaptations[1].ancestry,snapshot);
 s=act(s,'adapt-edit',{id:'branch',field:'changed',value:'One delegate rather than full attendance'});
 assert.throws(()=>act(s,'adapt-remove'),/branches/);
 s=act(s,'adapt-choose');s=act(s,'adapt-park');assert.equal(active(s).chosenId,null);assert.ok(!active(s).compareIds.includes('original'));assert.equal(active(s).adaptations[0].ancestry.parked,true);
 s=act(s,'adapt-park');assert.equal(active(s).adaptations[0].ancestry.parked,false);
 assert.equal(active(s).adaptations[1].changed,'One delegate rather than full attendance');
});

test('whole workspace exports, import remapping and Markdown retain source, alternatives, decisions and removed checks',()=>{
 let s=create();s=act(s,'adapt-branch',{newId:'branch'});s=act(s,'adapt-edit',{id:'branch',field:'reason',value:'Test a narrower approval path.'});s=act(s,'adapt-choose',{id:'branch'});s=act(s,'adapt-decision',{value:'Compare missed objections before expanding.'});
 s=apply(s,{type:'remove',id:'first-c4'});const original=structuredClone(active(s));
 const imported=parse(serialize(original));assert.deepEqual(imported,original);
 s=apply(s,{type:'import',id:'copied',workspace:imported});assert.deepEqual(s.workspaces[0],original);
 const w=active(s);assert.equal(w.chosenId,'copied-a2');assert.equal(w.adaptations[1].ancestry.parents[0].id,'copied-a1');assert.equal(w.adaptations[0].checks[0].cardId,'copied-c1');assert.equal(w.adaptations[0].checks[3].cardId,'first-c4');
 assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
 const md=markdown(w);for(const text of ['Test a narrower approval path.','Compare missed objections before expanding.','Removed from board; source retained.','Parent snapshot','The client must approve','Suppose decisions had to'])assert.ok(md.includes(text),text);
});

test('invalid fit states, duplicate checks, dangling selections and ancestry cycles fail atomically',()=>{
 const s=create(),before=structuredClone(s);
 assert.throws(()=>act(s,'adapt-check',{cardId:'first-c1',field:'status',value:'__proto__'}),/Unknown/);
 assert.throws(()=>act(s,'adapt-branch',{newId:'original'}),/unique/);
 const bad=mutate=>{const w=structuredClone(active(s));mutate(w);assert.throws(()=>parse(JSON.stringify({kind:'thinking-lab-constraints',version:1,workspace:w})));};
 bad(w=>w.adaptations[0].checks.push(w.adaptations[0].checks[0]));bad(w=>w.chosenId='missing');bad(w=>w.compareIds=['original','original']);bad(w=>w.adaptations[0].ancestry.parents[0].id='original');bad(w=>w.adaptations[0].checks[0].original.type='made-up');
 assert.deepEqual(s,before);
});

test('Undo restores complete adaptations, fit movements, choices and grouped writing',()=>{
 let h=createHistory(create());const start=structuredClone(h.present);
 h=change(h,{type:'adapt-edit',id:'original',field:'title',value:'A'},'typing');h=change(h,{type:'adapt-edit',id:'original',field:'title',value:'A full title'},'typing');
 h=change(h,{type:'adapt-check',id:'original',cardId:'first-c1',field:'status',value:'change'});h=change(h,{type:'adapt-branch',id:'original',newId:'child'});h=change(h,{type:'adapt-choose',id:'child'});
 assert.equal(h.past.length,4);for(let i=0;i<4;i++)h=undo(h);assert.deepEqual(h.present,start);
});

test('flat snapshots retain maximum-length fields through branches and portable export',()=>{
 let s=create();const long='界'.repeat(20000);
 s=act(s,'adapt-edit',{field:'title',value:long});s=act(s,'adapt-edit',{field:'mechanism',value:long});
 s=apply(s,{type:'card',id:'first-c1',field:'basis',value:long});s=act(s,'adapt-review',{cardId:'first-c1'});s=act(s,'adapt-check',{cardId:'first-c1',field:'explanation',value:long});
 s=act(s,'adapt-branch',{newId:'long-child'});const child=active(s).adaptations[1];
 assert.equal(child.ancestry.parents[0].title,long);assert.equal(child.ancestry.parents[0].fields.find(f=>f.label==='Reviewed basis').text,long);
 assert.equal(child.ancestry.parents[0].fields.find(f=>f.label==='Fit reasoning').text,long);assert.ok(child.title.length<=20000);
 s=act(s,'adapt-branch',{id:'long-child',newId:'grandchild'});assert.equal(active(s).adaptations[2].ancestry.parents[0].fields.length,active(s).adaptations[1].ancestry.parents[0].fields.length);
 assert.deepEqual(parse(serialize(active(s))),active(s));
});
