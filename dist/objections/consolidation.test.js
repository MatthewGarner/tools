import test from 'node:test';
import assert from 'node:assert/strict';
import {make,validate,apply,markdown} from './state.js';
import {make as answersMake} from '../answers/state.js';
import {make as disagreementMake} from '../disagreement/state.js';
import {migrate,parseImport} from './import.js';
import {history,transition,undo,portable} from '../creative-kit/state.js';
const config={make,validate,apply};
const start=w=>history({version:1,activeId:w.id,workspaces:[w]});
const work=h=>h.present.workspaces.find(w=>w.id===h.present.activeId);
test('legacy Objections opens in place without losing its selected design or concern reasoning',()=>{
 const legacy={id:'old',problem:'P',benefit:'B',concerns:[{id:'c',objection:'O',concern:'C',evidence:'E'}],designs:[{id:'d',method:'delivery',concerns:['c'],title:'D',mechanism:'M',benefit:'B2',cost:'C2',test:'T',stale:true}],selected:'d'};
 const upgraded=validate(structuredClone(legacy));assert.equal(upgraded.schema,2);assert.equal(upgraded.entry,'concerns');assert.equal(upgraded.selected,'d');assert.deepEqual(upgraded.concerns,legacy.concerns);for(const key of Object.keys(legacy.designs[0]))assert.deepEqual(upgraded.designs[0][key],legacy.designs[0][key]);assert.equal(legacy.schema,undefined);
 const invalid=structuredClone(upgraded);delete invalid.designs[0].assumptions;assert.throws(()=>validate(invalid));
});
test('Three Answers becomes editable alternatives with comparison, stale borrowed snapshots and original source intact',()=>{
 const old=answersMake('answers-old');old.phase='compare';old.chosen='q';old.test='Ask an owner';old.learn='A missing objection reverses the choice';old.answers.q.assessment='Fast enough';old.answers.q.borrowed=[{from:'a',text:'An earlier version of the shared context',stale:true}];
 const raw=JSON.stringify(old),w=migrate('answers',old);assert.equal(JSON.stringify(old),raw);assert.deepEqual(w.source.workspace,old);assert.equal(w.selected,'answer-q');assert.equal(w.view,'compare');assert.equal(w.criteria,old.criteria);assert.equal(w.test,old.test);assert.equal(w.learn,old.learn);
 for(const key of ['a','b','q']){const d=w.designs.find(d=>d.id===`answer-${key}`),a=old.answers[key];for(const [to,from] of [['title','title'],['mechanism','mechanism'],['benefit','strength'],['cost','weakness'],['difference','difference'],['assessment','assessment']])assert.equal(d[to],a[from]);}
 assert.equal(w.designs[2].borrowed[0].text,old.answers.q.borrowed[0].text);assert.equal(w.designs[2].borrowed[0].stale,true);apply(w,{type:'edit',collection:'designs',item:'answer-a',field:'mechanism',value:'An independent edit'});assert.equal(w.source.workspace.answers.a.mechanism,old.answers.a.mechanism);assert.match(markdown(w),/earlier version of the shared context/);
});
test('Disagreement carries every position, protected intention, boundary and test into the same collection',()=>{
 const old=disagreementMake('disagree-old');old.selected='p1';old.plans[0].stale=true;old.plans[1].cost='Transition effort';const raw=JSON.stringify(old),w=migrate('disagreement',old);assert.equal(JSON.stringify(old),raw);assert.deepEqual(w.sides,old.sides);assert.deepEqual(w.source.workspace,old);assert.equal(w.selected,'p1');assert.equal(w.entry,'reconcile');
 for(const plan of old.plans){const d=w.designs.find(d=>d.id===plan.id);assert.equal(d.method,plan.route);for(const f of ['title','mechanism','boundary','cost','test','learn','stale','protects'])assert.deepEqual(d[f],plan[f]);}
 const mechanism=w.designs[0].mechanism;apply(w,{type:'edit',collection:'sides',item:'a',field:'benefit',value:'Changed intention'});assert.equal(w.designs[0].stale,true);assert.equal(w.designs[0].mechanism,mechanism);assert.deepEqual(w.source.workspace,old);
});
test('all entry routes share designs, criteria and selection; branching freezes the parent and its context',()=>{
 const w=make();apply(w,{type:'edit',collection:'designs',item:'d1',field:'assumptions',value:'People notice the prompt'});apply(w,{type:'protect',id:'d1',side:'a'});apply(w,{type:'branch',id:'child',parent:'d1'});const snapshot=structuredClone(w.designs[1].origin.snapshot);
 apply(w,{type:'edit',collection:'designs',item:'d1',field:'mechanism',value:'Parent changed'});apply(w,{type:'edit',collection:'concerns',item:'c1',field:'concern',value:'Concern changed'});assert.deepEqual(w.designs[1].origin.snapshot,snapshot);assert.equal(snapshot.assumptions,'People notice the prompt');assert.equal(snapshot.positions[0].benefit,w.sides.a.benefit);
 apply(w,{type:'entry',entry:'generate'});apply(w,{type:'add-design',id:'new',method:'different'});apply(w,{type:'borrow',from:'child',to:'new'});const strength=w.designs[2].borrowed[0].text;apply(w,{type:'edit',collection:'designs',item:'child',field:'benefit',value:'Updated source benefit'});assert.equal(w.designs[2].borrowed[0].text,strength);assert.equal(w.designs[2].borrowed[0].stale,true);
 apply(w,{type:'entry',entry:'reconcile'});assert.equal(w.designs.length,3);apply(w,{type:'select',id:'new'});assert.equal(w.selected,'new');validate(w);assert.match(markdown(w),/Parent snapshot/);assert.ok(markdown(w).includes(snapshot.concerns[0].evidence));assert.ok(markdown(w).includes(snapshot.positions[0].context));
});
test('failed connections are atomic, comparison is bounded and Undo recovers removed designs with reasoning',()=>{
 let h=start(make());h=transition(h,{type:'add-design',id:'free',method:'different'},config);h=transition(h,{type:'borrow',from:'d1',to:'free'},config);const before=structuredClone(h.present);assert.throws(()=>transition(h,{type:'remove-design',id:'d1'},config));assert.throws(()=>transition(h,{type:'link',id:'free',concern:'missing'},config));assert.deepEqual(h.present,before);
 h=transition(h,{type:'remove-design',id:'free'},config);h=undo(h);assert.deepEqual(h.present,before);
 for(const id of ['x','y','z'])h=transition(h,{type:'add-design',id,method:'first'},config);assert.equal(work(h).comparison.length,4);assert.throws(()=>transition(h,{type:'compare',id:'z'},config));assert.equal(work(h).designs.length,5);
});
test('portable round trips retain ancestry and source; imports reject missing connections and leave the source alone',()=>{
 const w=migrate('answers',answersMake());apply(w,{type:'branch',id:'branch',parent:'answer-q'});apply(w,{type:'edit',collection:'designs',item:'branch',field:'reason',value:'Keep context without the calendar gate'});
 assert.deepEqual(parseImport(portable(w,'objections',validate)),w);const old=disagreementMake();assert.deepEqual(parseImport(JSON.stringify({kind:'disagreement',version:1,workspace:old})),migrate('disagreement',old));
 const broken=structuredClone(w);broken.designs[0].borrowed=[{from:'missing',title:'Missing',text:'X',stale:false}];assert.throws(()=>parseImport(JSON.stringify({kind:'objections',version:1,workspace:broken})));assert.throws(()=>parseImport('{'));assert.throws(()=>parseImport(JSON.stringify({kind:'questions',version:1,workspace:w})));
 let h=start(make());h=transition(h,{type:'import',id:'copy',workspace:w},config);assert.equal(h.present.workspaces.length,2);assert.equal(h.present.activeId,'copy');assert.equal(work(h).source.workspace.id,w.source.workspace.id);assert.deepEqual(w.source.workspace,answersMake());
});
