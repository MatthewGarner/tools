import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recentStore, RECENT_TOOLS, RECENT_LIMIT, HASH_LIMIT, recentRoute, snapshotName} from '../assets/recent-store.js';
import {TOOL_DIRS,ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
const memory=()=>{const m=new Map();return {get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const record=(id='one',overrides={})=>({id,tool:'flow',name:'My model',hash:'z:abcd_12-',savedAt:100,...overrides});
test('Recent work covers the actual tool inventories and resolves both Energy origins',()=>{
 assert.deepEqual(Object.keys(RECENT_TOOLS.tools).sort(),[...TOOL_DIRS].sort());assert.deepEqual(Object.keys(RECENT_TOOLS.energy).sort(),[...ENERGY_TOOL_DIRS].sort());
 assert.equal(recentRoute('energy','risk','/energy/'),'/energy/risk/');assert.equal(recentRoute('energy','risk','/'),'/risk/');assert.equal(recentRoute('tools','flow'),'/flow/');
 for(const tool of ['__proto__','//evil.test','javascript:alert(1)','../flow'])assert.throws(()=>recentRoute('tools',tool));
});
test('saves independent snapshots across tabs, sorts, renames without reordering and removes only one record',()=>{
 const storage=memory(),a=recentStore(storage,'tools'),b=recentStore(storage,'tools');
 a.add(record());b.add(record('two',{savedAt:200}));assert.deepEqual(a.list().map(r=>r.id),['two','one']);
 a.rename('one','Renamed');assert.equal(b.list()[1].name,'Renamed');assert.equal(b.list()[1].hash,'z:abcd_12-');
 b.remove('two');assert.deepEqual(a.list().map(r=>r.id),['one']);assert.throws(()=>b.rename('two','Lost'));
});
test('scopes, malformed records and names are bounded without deleting unrelated data',()=>{
 const storage=memory(),a=recentStore(storage,'tools'),b=recentStore(storage,'energy');a.add(record());b.add(record('one',{tool:'risk'}));
 storage.setItem('mg:recent:v1:tools:broken','{');storage.setItem('unrelated','keep');
 storage.setItem('mg:recent:v1:tools:bad',JSON.stringify({...a.list()[0],id:'bad',tool:'//evil.test'}));
 assert.equal(a.list().length,1);assert.equal(b.list().length,1);assert.equal(storage.getItem('unrelated'),'keep');
 for(const overrides of [{name:' '},{name:'x'.repeat(121)},{hash:'javascript:alert(1)'},{hash:'a'.repeat(HASH_LIMIT+1)},{tool:'__proto__'},{savedAt:Infinity}])assert.throws(()=>a.add(record('badnew',overrides)));
 assert.throws(()=>a.add(record()));assert.equal(a.list().length,1);
});
test('storage failures and a full shelf never silently discard snapshots',()=>{
 const storage=memory(),a=recentStore(storage,'tools');for(let i=0;i<RECENT_LIMIT;i++)a.add(record('r'+i));
 assert.throws(()=>a.add(record('overflow')),/20 snapshots/);assert.equal(a.list().length,RECENT_LIMIT);
 const full=recentStore({...memory(),setItem(){throw new DOMException('Full','QuotaExceededError');}},'tools');
 assert.throws(()=>full.add(record()),{name:'QuotaExceededError'});
 const blocked=recentStore({get length(){throw new DOMException('Blocked','SecurityError');}},'tools');assert.throws(()=>blocked.list(),{name:'SecurityError'});
});
test('suggested snapshot names come from authored content, never markup',()=>{
 assert.equal(snapshotName({t:'title: My plan\nitem: x'},'Roadmap'),'My plan');assert.equal(snapshotName({q:'My question'},'Duel'),'My question');assert.equal(snapshotName({},'Flow'),'Flow');
 assert.equal(snapshotName({title:'<script>text</script>'},'Flow'),'<script>text</script>');assert.equal(snapshotName({title:'x'.repeat(200)},'Flow').length,120);
});

import {toSnapshotLink,fromLink} from '../premortem/links.js';
import {exampleDoc} from '../premortem/register.js';
test('Premortem snapshots preserve authored work or refuse a lossy import',async()=>{
 const doc=exampleDoc(), hash=await toSnapshotLink(doc), restored=await fromLink(hash);
 assert.equal(restored.title,doc.title);assert.notEqual(restored.id,doc.id);assert.equal(restored.entries.length,doc.entries.length);
 doc.question='x'.repeat(2001);await assert.rejects(()=>toSnapshotLink(doc),/import limits/);
 doc.question='Normal';doc.entries=Array.from({length:501},()=>({...doc.entries[0]}));await assert.rejects(()=>toSnapshotLink(doc),/import limits/);
});
