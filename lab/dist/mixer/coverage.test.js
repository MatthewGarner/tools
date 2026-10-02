import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspace,captureConcept,validateWorkspace,markdown,mixWorkspace} from './model.js';
import {axes,cell,gap,noteKey,locationOf,transition} from './map.js';
import {make as makeTerritory} from '../territory/state.js';
import {fromTerritory,parseImport} from './import.js';

test('legacy captures gain only unambiguous exact placements; old fields and original ingredients survive',()=>{
 const w=createWorkspace(),c=captureConcept(w);c.mechanism='A physical rehearsal';w.concepts.push(c);w.activeConceptId=c.id;
 delete w.schema;delete w.map;delete w.view;delete w.source;for(const c of w.concepts)for(const f of ['placement','fit','fitNeedsReview','origin'])delete c[f];
 const before=structuredClone(w),restored=validateWorkspace(w);assert.deepEqual(w,before);assert.equal(Object.keys(restored.concepts[0].placement).length,5);assert.equal(restored.concepts[0].mechanism,c.mechanism);
 w.dimensions[0].options[0].label='An unrelated person';w.dimensions[1].options[1].label=w.dimensions[1].options[0].label;
 const ambiguous=validateWorkspace(w);assert.equal(ambiguous.concepts[0].placement[w.dimensions[0].id],undefined);assert.equal(ambiguous.concepts[0].placement[w.dimensions[1].id],undefined);assert.deepEqual(ambiguous.concepts[0].ingredients,c.ingredients);
});

test('moving changes classification, flags fit, preserves writing and other dimensions; rejected transitions are atomic',()=>{
 let w=createWorkspace(),c=captureConcept(w);c.mechanism='Replay a handover';c.fit='A deliberate mapping';w.concepts.push(c);w.activeConceptId=c.id;const before=structuredClone(w),[r,col]=axes(w),target=cell(r.options[1].id,col.options[1].id);
 w=transition(w,{type:'move',id:c.id,cell:target});const moved=w.concepts[0];assert.equal(locationOf(w,moved),target);assert.equal(moved.fitNeedsReview,true);assert.equal(moved.mechanism,c.mechanism);assert.equal(moved.fit,c.fit);assert.deepEqual(moved.ingredients,c.ingredients);assert.equal(moved.placement[w.dimensions[2].id],c.placement[w.dimensions[2].id]);assert.deepEqual(before.concepts[0],c);
 const untouched=structuredClone(w);assert.throws(()=>transition(w,{type:'move',id:c.id,cell:'not|real'}));assert.deepEqual(w,untouched);
 w=transition(w,{type:'review-fit',id:c.id});assert.equal(w.concepts[0].fitNeedsReview,false);
});

test('gap notes follow pairs, transposition and label changes; candidates keep immutable gap context',()=>{
 let w=createWorkspace(),[r,col]=axes(w);w=transition(w,{type:'gap',field:'reason',value:'We assumed the trader needed another dashboard.'});w=transition(w,{type:'gap',field:'verdict',value:'try'});
 const originalGap=structuredClone(gap(w)),startCount=w.concepts.length;w=transition(w,{type:'capture-gap'});assert.equal(w.concepts.length,startCount+1);assert.equal(w.concepts[0].origin.reason,originalGap.reason);assert.equal(w.concepts[0].mechanism,'');assert.equal(w.concepts[0].placement[r.id],w.map.row);
 w=transition(w,{type:'gap',field:'reason',value:'Later reasoning'});assert.equal(w.concepts[0].origin.reason,originalGap.reason);
 w=transition(w,{type:'axes',row:col.id,column:r.id});assert.equal(gap(w).reason,'Later reasoning');
 w=transition(w,{type:'axes',row:w.dimensions[1].id,column:w.dimensions[2].id});assert.equal(gap(w).reason,'');assert.equal(Object.keys(w.map.notes).length,1);
 const renamed=structuredClone(w.dimensions.find(d=>d.id===r.id));renamed.name='Decision maker';renamed.options[0].label='Operations lead';w=transition(w,{type:'dimension',dimension:renamed});assert.equal(w.concepts[0].fitNeedsReview,true);assert.equal(w.concepts[0].ingredients[0].label,'A trader');assert.equal(Object.values(w.map.notes)[0].reason,'Later reasoning');
 assert.match(markdown(w),/We assumed the trader/);assert.match(markdown(w),/Later reasoning/);assert.match(markdown(w),/Operations lead/);
});

test('removing an occupied option or dimension is rejected; unused options can be removed and undone from a snapshot',()=>{
 let w=createWorkspace();w=transition(w,{type:'gap',field:'reason',value:'Keep this reasoning.'});const [r]=axes(w),before=structuredClone(w),d=structuredClone(r);d.options=d.options.slice(1);
 assert.throws(()=>transition(w,{type:'dimension',dimension:d}),/gap notes/);assert.throws(()=>transition(w,{type:'remove-dimension',id:r.id}),/gap notes/);assert.deepEqual(w,before);
 const unused=structuredClone(r);unused.options.pop();const changed=transition(w,{type:'dimension',dimension:unused});assert.equal(changed.dimensions[0].options.length,3);assert.equal(validateWorkspace(before).dimensions[0].options.length,4);
});

test('locking a map space preserves other locks; mixing retains notes, placements and captured concepts',()=>{
 let w=createWorkspace();w.dimensions[2].locked=true;const [r,c]=axes(w);w=transition(w,{type:'select-cell',cell:cell(r.options[2].id,c.options[1].id)});w=transition(w,{type:'gap',field:'reason',value:'Keep context'});w=transition(w,{type:'capture-gap'});w=transition(w,{type:'mix-gap'});
 assert.equal(w.view,'generate');assert.equal(w.dimensions[2].locked,true);assert.equal(w.dimensions[0].selectedId,r.options[2].id);assert.equal(w.dimensions[3].selectedId,c.options[1].id);
 const next=mixWorkspace(w,()=>.99).workspace;assert.deepEqual(next.concepts,w.concepts);assert.deepEqual(next.map,w.map);assert.equal(next.dimensions[0].selectedId,r.options[2].id);assert.equal(validateWorkspace(next).history.length,next.history.length);
});

test('Territory migration retains all source fields, partial coordinates, 20k writing, gap reasoning and selected cell',()=>{
 const source=makeTerritory();source.ideas[0].need=null;source.ideas[0].mechanism='x'.repeat(20000);source.ideas[0].title='t'.repeat(19000);source.needs[0].label='n'.repeat(500);source.methods[0].id=source.needs[0].id;source.ideas.filter(i=>i.method==='m1').forEach(i=>i.method=source.methods[0].id);source.gaps['n1|m2']={verdict:'reason',reason:'Deliberately empty'};
 const before=structuredClone(source),w=fromTerritory(source);assert.deepEqual(source,before);assert.deepEqual(w.source.workspace,source);assert.equal(w.view,'map');assert.equal(w.concepts.length,4);assert.equal(w.concepts[0].mechanism.length,20000);assert.equal(w.concepts[0].title.length,19000);assert.equal(w.concepts[0].placement[w.dimensions[0].id],null);assert.equal(w.concepts[0].placement[w.dimensions[1].id],w.dimensions[1].options[0].id);assert.equal(locationOf(w,w.concepts[0]),'unplaced');assert.equal(gap(w).reason,'Deliberately empty');assert.equal(w.concepts[0].experiment,source.ideas[0].test);
 assert.deepEqual(parseImport(JSON.stringify({kind:'mixer',version:1,workspace:w})),w);assert.deepEqual(parseImport(JSON.stringify({version:1,workspace:w})),w);const copy=parseImport(JSON.stringify({kind:'territory',version:1,workspace:source}));assert.deepEqual(copy.source.workspace,source);
 assert.match(markdown(w),/Original Territory workspace/);assert.throws(()=>parseImport('{bad'));assert.throws(()=>parseImport(JSON.stringify({kind:'other',version:1,workspace:w})));
});

test('new formats reject lost references and missing state rather than silently normalizing it away',()=>{
 const w=createWorkspace();w.concepts.push(captureConcept(w));let bad=structuredClone(w);delete bad.concepts[0].placement;assert.throws(()=>validateWorkspace(bad));bad=structuredClone(w);bad.concepts[0].placement[bad.dimensions[0].id]='missing';assert.throws(()=>validateWorkspace(bad));bad=structuredClone(w);bad.map.notes.other={coordinates:[],reason:'lost',verdict:'open'};assert.throws(()=>validateWorkspace(bad));bad=structuredClone(w);bad.concepts[0].mechanism='x'.repeat(20001);assert.throws(()=>validateWorkspace(bad));
});
