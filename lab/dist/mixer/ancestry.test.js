import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspace,captureConcept,validateWorkspace,markdown} from './model.js';
import {derive} from './ancestry.js';
import {transition} from './map.js';
import {parseImport} from './import.js';
test('a Mixer branch preserves mechanism, ingredients, placement and gap source while retaining its parent independently',()=>{
 let w=createWorkspace();w=transition(w,{type:'gap',field:'reason',value:'Make the omitted role visible.'});w=transition(w,{type:'capture-gap'});w.concepts[0].mechanism='Rehearse a handoff';const parent=structuredClone(w.concepts[0]),c=derive(w,[parent.id],'branch');c.changed='Ask the next owner first';c.reason='Expose missing knowledge';w=validateWorkspace(w);w.concepts[0].mechanism='Later parent edit';assert.equal(w.concepts[1].mechanism,parent.mechanism);assert.deepEqual(w.concepts[1].ingredients,parent.ingredients);assert.deepEqual(w.concepts[1].placement,parent.placement);assert.deepEqual(w.concepts[1].origin,parent.origin);assert.equal(w.concepts[1].ancestry.parents[0].fields.find(f=>f.label==='mechanism').text,parent.mechanism);assert.match(markdown(w),/Expose missing knowledge/);assert.match(markdown(w),/Make the omitted role/);assert.deepEqual(parseImport(JSON.stringify({kind:'mixer',version:1,workspace:w})),w);
});
test('a combined concept starts without a fabricated mechanism or classification and retains both full sources',()=>{
 const w=createWorkspace(),a=captureConcept(w);w.concepts.push(a);const b=derive(w,[a.id],'branch');b.ancestry.parked=true;const c=derive(w,[a.id,b.id],'combined');assert.equal(c.mechanism,'');assert.deepEqual(c.ingredients,[]);assert.deepEqual(c.placement,{});assert.equal(c.ancestry.parents.length,2);assert.equal(c.ancestry.parked,false);validateWorkspace(w);assert.throws(()=>derive(w,[a.id,a.id],'invalid'),/different parents/);
});
test('pre-ancestry Mixer schema remains readable, but malformed new ancestry and cycles are rejected',()=>{
 const w=createWorkspace(),c=captureConcept(w);w.concepts.push(c);delete c.ancestry;delete c.changed;delete c.reason;const upgraded=validateWorkspace(w);assert.deepEqual(upgraded.concepts[0].ancestry.parents,[]);const branch=derive(upgraded,[c.id],'branch');upgraded.concepts[0].ancestry=structuredClone(branch.ancestry);assert.throws(()=>validateWorkspace(upgraded),/descend/);
});
