import test from 'node:test';
import assert from 'node:assert/strict';
import {ancestry,sourceSnapshot,derivedFrom,validateGraph,generations,hasDescendants,ancestryMarkdown,assertPortable} from './ancestry.js';
test('source snapshots freeze source fields and retain a readable portable record',()=>{
 const fields=[{label:'Mechanism',text:'Two roles rehearse a decision.'}],p=sourceSnapshot('a','Rehearsal',fields),a=derivedFrom([p]);fields[0].text='Changed later';p.fields[0].text='Also changed';assert.equal(a.parents[0].fields[0].text,'Two roles rehearse a decision.');assert.match(ancestryMarkdown(a),/Two roles rehearse/);assert.deepEqual(ancestry(JSON.parse(JSON.stringify(a))),a);
});
test('a combination retains two parents, generations follow live edges, and cycles or duplicate parents are rejected',()=>{
 const a={id:'a',ancestry:ancestry()},b={id:'b',ancestry:derivedFrom([sourceSnapshot('a','A',[])])},c={id:'c',ancestry:derivedFrom([sourceSnapshot('a','A',[]),sourceSnapshot('b','B',[])])};assert.deepEqual(generations([a,b,c]).map(n=>n.generation),[0,1,2]);assert.equal(hasDescendants([a,b,c],'a'),true);assert.throws(()=>derivedFrom([sourceSnapshot('a','A',[]),sourceSnapshot('a','A',[])]));a.ancestry=derivedFrom([sourceSnapshot('c','C',[])]);assert.throws(()=>validateGraph([a,b,c]),/descend/);assert.throws(()=>ancestry(null));
});
test('external or removed parent snapshots remain readable without inventing a live graph edge',()=>{
 const n={id:'new',ancestry:derivedFrom([sourceSnapshot('earlier','Earlier source',[{label:'Reason',text:'Keep this'}])])};validateGraph([n]);assert.equal(generations([n])[0].generation,0);assert.match(ancestryMarkdown(n.ancestry),/Keep this/);assert.throws(()=>assertPortable({text:'a'.repeat(100)},50),/export limit/);assert.doesNotThrow(()=>assertPortable({text:'a'.repeat(1000)},1400));assert.throws(()=>assertPortable({text:'é'.repeat(1000)},1400),/export limit/);
});
