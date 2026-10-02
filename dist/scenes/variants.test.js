import test from 'node:test';import assert from 'node:assert/strict';
import {make,validate,apply,markdown} from './state.js';
import {history,transition,undo,portable,parse,validateSession} from '../creative-kit/state.js';
import {allScenes,currentScene,needsReview} from './variants.js';
const config={make,validate,apply};
const start=()=>{const w=make();return history({version:1,activeId:w.id,workspaces:[w]});};
const w=h=>h.present.workspaces.find(w=>w.id===h.present.activeId);
const step=(h,type,rest={})=>transition(h,{type,...rest},config);
const branch=(h,id='child',changes={actor:'New operator'})=>step(h,'scene-branch',{id,title:'New operator on shift',momentId:'m1',changes,changed:'Person',reason:'Less tacit experience.'});
const edit=(h,collection,item,field,value)=>step(h,'edit',{collection,item,field,value});

test('legacy scenes keep ordered moments, unplaced interventions and writing while gaining an empty fit review',()=>{
 const original=make();for(const k of ['scene','variants','compareSceneIds','compareIdeaIds','chosenTest','decision'])delete original[k];for(const i of original.ideas)for(const k of ['fit','fitReason','fitNeeds','checkedAgainst','ancestry','changed','reason'])delete i[k];
 const saved=structuredClone(original),s=validateSession({version:1,activeId:original.id,workspaces:[original]},validate),up=s.workspaces[0];assert.deepEqual(up.moments,saved.moments);for(const i of up.ideas){const before=saved.ideas.find(x=>x.id===i.id);for(const k of ['title','action','assumption','test','momentId','stale'])assert.deepEqual(i[k],before[k]);assert.equal(i.fit,'unchecked');}assert.equal(up.variants.length,0);
});

test('person, information and moment branches preserve the parent scene and freeze its wording',()=>{
 let h=start();const original=currentScene(w(h));h=branch(h);assert.deepEqual(w(h).variants[0],original);assert.equal(w(h).moments[0].actor,'New operator');assert.equal(w(h).ideas[0].stale,true);const parent=structuredClone(w(h).scene.ancestry);
 h=step(h,'scene-switch',{id:'scene-original'});h=edit(h,'moments','m1','actor','Parent edited later');h=step(h,'scene-switch',{id:'child'});assert.deepEqual(w(h).scene.ancestry,parent);
 h=step(h,'scene-branch',{id:'info',title:'No timestamp',momentId:'m1',changes:{knows:'Only the value',unknown:'Its age'},changed:'Information',reason:'Test missing freshness.'});assert.equal(w(h).moments[0].actor,'New operator');assert.equal(w(h).moments[0].unknown,'Its age');
 h=step(h,'scene-branch',{id:'timing',title:'Choice first',momentId:'m2',changes:{trigger:'An immediate commitment request'},position:0,changed:'Sequence',reason:'No preparation time.'});assert.equal(w(h).moments[0].id,'m2');assert.equal(w(h).scene.ancestry.parents[0].id,'info');assert.equal(allScenes(w(h)).length,4);
});

test('fit reviews retain the actor information and intervention at that time and become stale after context changes',()=>{
 let h=start();h=edit(h,'ideas','i1','fit','helps');h=edit(h,'ideas','i1','fitReason','The trader can use the timestamp to ask for a new source.');h=step(h,'review',{id:'i1'});const reviewed=structuredClone(w(h).ideas[0].checkedAgainst);assert.equal(needsReview(w(h),currentScene(w(h)),w(h).ideas[0]),false);
 h=edit(h,'moments','m1','knows','Only the number, with no timestamp');assert.equal(needsReview(w(h),currentScene(w(h)),w(h).ideas[0]),true);assert.deepEqual(w(h).ideas[0].checkedAgainst,reviewed);
 h=step(h,'review',{id:'i1'});assert.equal(needsReview(w(h),currentScene(w(h)),w(h).ideas[0]),false);h=step(h,'problem',{value:'A different decision situation'});assert.equal(needsReview(w(h),currentScene(w(h)),w(h).ideas[0]),true);
 h=step(h,'review',{id:'i1'});h=edit(h,'ideas','i1','action','Automatically decline when stale');assert.equal(needsReview(w(h),currentScene(w(h)),w(h).ideas[0]),true);assert.equal(w(h).ideas[0].fitReason,'The trader can use the timestamp to ask for a new source.');
 assert.throws(()=>step(h,'review',{id:'i2'}),/Place/);
});

test('one intervention can have different placement and fit in each scene without rewriting another',()=>{
 let h=start();h=edit(h,'ideas','i1','fit','helps');h=step(h,'review',{id:'i1'});h=branch(h);h=step(h,'move-idea',{id:'i1',momentId:'m2'});h=edit(h,'ideas','i1','fit','change');h=edit(h,'ideas','i1','fitNeeds','A response rule beside the warning');h=step(h,'review',{id:'i1'});
 const scenes=allScenes(w(h));assert.equal(scenes[0].ideas[0].momentId,'m1');assert.equal(scenes[0].ideas[0].fit,'helps');assert.equal(scenes[1].ideas[0].momentId,'m2');assert.equal(scenes[1].ideas[0].fit,'change');assert.equal(needsReview(w(h),scenes[0],scenes[0].ideas[0]),false);
 h=step(h,'scene-choose',{id:'i1',sceneId:'child'});h=step(h,'scene-park',{id:'child'});assert.equal(w(h).chosenTest,null);assert.ok(!w(h).compareSceneIds.includes('child'));h=step(h,'scene-park',{id:'child'});assert.equal(w(h).scene.ancestry.parked,false);
 assert.throws(()=>step(h,'scene-remove',{id:'scene-original'}),/branches/);
});

test('branching interventions and trying them in another scene preserves reasoning but does not copy a fit verdict',()=>{
 let h=branch(start());h=edit(h,'ideas','i1','fit','change');h=edit(h,'ideas','i1','fitReason','Needs guidance');h=step(h,'review',{id:'i1'});h=step(h,'scene-idea-branch',{id:'i1',newId:'i3'});let child=w(h).ideas.find(i=>i.id==='i3');assert.equal(child.ancestry.parents[0].id,'i1');assert.equal(child.fit,'unchecked');assert.ok(child.ancestry.parents[0].fields.some(f=>f.text==='Needs guidance'));
 h=edit(h,'ideas','i3','action','Show the escalation rule');h=step(h,'scene-copy-idea',{id:'i3',sceneId:'scene-original'});const copied=w(h).variants[0].ideas.find(i=>i.id==='i3');assert.equal(copied.momentId,null);assert.equal(copied.fit,'unchecked');assert.equal(copied.checkedAgainst,null);assert.equal(copied.action,'Show the escalation rule');
 h=edit(h,'ideas','i3','action','Changed again');assert.equal(w(h).variants[0].ideas.find(i=>i.id==='i3').action,'Show the escalation rule');assert.throws(()=>step(h,'scene-copy-idea',{id:'i3',sceneId:'scene-original'}),/already/);assert.throws(()=>step(h,'remove-idea',{id:'i1'}),/branches/);
});

test('portable scenes retain variations, source snapshots, independent verdicts and the selected rehearsal',()=>{
 let h=branch(start());h=edit(h,'ideas','i1','fit','change');h=edit(h,'ideas','i1','fitReason','The person cannot act alone.');h=step(h,'review',{id:'i1'});h=step(h,'scene-choose',{id:'i1',sceneId:'child'});h=edit(h,'decision','decision','value','Rehearse the escalation route first.');const original=structuredClone(w(h));assert.deepEqual(parse(portable(original,'scenes',validate),'scenes',validate),original);
 h=step(h,'import',{id:'copy',workspace:original});assert.deepEqual(h.present.workspaces[0],original);assert.equal(w(h).scene.id,'child');assert.equal(w(h).chosenTest.ideaId,'i1');const md=markdown(w(h));for(const phrase of ['Parent snapshot','New operator','Trader','The person cannot act alone.','Rehearse the escalation route first.','Last reviewed context'])assert.ok(md.includes(phrase),phrase);
});

test('invalid scene references and ancestry fail atomically; Undo restores the complete variation and grouped edits',()=>{
 let h=start(),before=structuredClone(h.present);h=branch(h);h=transition(h,{type:'edit',collection:'moments',item:'m1',field:'knows',value:'A'},config,'typing');h=transition(h,{type:'edit',collection:'moments',item:'m1',field:'knows',value:'A new value'},config,'typing');h=step(h,'scene-remove',{id:'child'});h=undo(h);assert.equal(w(h).moments[0].knows,'A new value');h=undo(h);h=undo(h);assert.deepEqual(h.present,before);
 for(const mutate of [v=>v.compareSceneIds=['missing'],v=>v.compareIdeaIds=['missing'],v=>v.scene.ancestry= {version:1,parked:false,parents:[{id:v.scene.id,title:'Self',fields:[]}]},v=>v.chosenTest={sceneId:'scene-original',ideaId:'missing'},v=>v.ideas[0].fit='certain']){const bad=structuredClone(w(h));mutate(bad);assert.throws(()=>parse(JSON.stringify({kind:'scenes',version:1,workspace:bad}),'scenes',validate));}
 assert.throws(()=>branch(h,'scene-original'),/new scene/);assert.deepEqual(h.present,before);
});

test('large Unicode context stays flat and export limits reject new branches before replacing saved work',()=>{
 let h=start(),long='界'.repeat(20000);for(const m of w(h).moments)for(const f of ['actor','knows','unknown','can','stakes'])h=edit(h,'moments',m.id,f,long);
 h=edit(h,'ideas','i1','fit','change');h=step(h,'review',{id:'i1'});h=branch(h,'large');assert.equal(w(h).scene.ancestry.parents[0].fields.find(f=>f.label==='Moment 1 · What do they know?').text,long);assert.deepEqual(parse(portable(w(h),'scenes',validate),'scenes',validate),w(h));
 let rejected=false;for(let n=0;n<12;n++){const before=structuredClone(h);try{h=branch(h,'large-'+n,{actor:'Another actor'});}catch(error){assert.match(error.message,/export limit/);assert.deepEqual(h,before);rejected=true;break;}}assert.equal(rejected,true);
});
