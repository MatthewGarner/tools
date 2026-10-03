import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeWork} from '../assets/work-store.js';
import {decorateWork,organiseWork,saveTrackedWork,WORK_META_PREFIX} from '../assets/work-metadata.js';
import {storeSaved} from '../assets/saved-items.js';
import {exportArchive,partitionArchive,previewImport,applyImport,isOwnedKey} from '../assets/backup-store.js';
const memory=(initial={})=>{const map=new Map(Object.entries(initial));return {map,get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const work=storage=>decorateWork(storage,readNativeWork(storage).records).records;

test('dates follow saved changes, never listing, switching or rewriting unchanged work',()=>{
 const key='thinking-lab:objections:v1', a={id:'a',problem:'First'},b={id:'b',problem:'Second'},storage=memory();
 const save=(works,activeId,now)=>saveTrackedWork(storage,key,JSON.stringify({workspaces:works,activeId}),now);
 save([a,b],'a',1000);assert.deepEqual(work(storage).map(r=>r.savedAt),[1000,1000]);
 save([a,b],'b',2000);assert.deepEqual(work(storage).map(r=>r.savedAt),[1000,1000]);
 save([{...a,problem:'Changed'},b],'b',3000);assert.equal(work(storage).find(r=>r.localId==='a').savedAt,3000);assert.equal(work(storage).find(r=>r.localId==='b').savedAt,1000);
 const before=[...storage.map];work(storage);assert.deepEqual([...storage.map],before);
 save([{...a,problem:'Changed'},b],'b',4000);assert.equal(work(storage)[0].savedAt,3000);
});
test('rename, pin and reversible archive preserve native content and stable workspace identity',()=>{
 const storage=memory({'roadmap-src':'title: Original','thinking-lab:reframe:v1':JSON.stringify({sessions:[{id:'a',problem:'Question'}]})});
 const original=storage.getItem('roadmap-src'),draft=work(storage).find(r=>r.kind==='draft');
 assert.equal(draft.savedAt,null);
 organiseWork(storage,draft,{name:'Weekly plan',pinned:true,archived:true});
 assert.equal(storage.getItem('roadmap-src'),original);assert.equal(work(storage)[0].name,'Weekly plan');assert.equal(work(storage)[0].archived,true);
 saveTrackedWork(storage,'roadmap-src','title: New content',1000);const updated=work(storage)[0];
 assert.equal(updated.id,draft.id);assert.equal(updated.name,'Weekly plan');assert.equal(updated.pinned,true);assert.equal(updated.savedAt,1000);
 organiseWork(storage,updated,{archived:false});assert.equal(work(storage)[0].archived,false);
});
test('deleting earlier saved copies cannot transfer organisation to another array item',()=>{
 const a={name:'A',src:'a'},b={name:'B',src:'b'},storage=memory({'map-saved':JSON.stringify([a,b])});
 const saved=work(storage).find(r=>r.name==='B');organiseWork(storage,saved,{name:'Keep B',pinned:true});
 storage.setItem('map-saved',JSON.stringify([b]));assert.equal(work(storage)[0].id,saved.id);assert.equal(work(storage)[0].name,'Keep B');
 storage.setItem('map-saved',JSON.stringify([a]));assert.equal(work(storage)[0].name,'A');assert.equal(work(storage)[0].pinned,false);
});
test('Gauge gives legacy editable sets lasting identity without losing existing catalogue names',()=>{
 const a={name:'Questions',src:'Before'},storage=memory({'gauge-saved':JSON.stringify([a])});
 organiseWork(storage,work(storage)[0],{name:'Weekly estimate',pinned:true});
 const old=globalThis.localStorage;globalThis.localStorage=storage;
 try{
  assert.equal(storeSaved('gauge-saved',[{...a,src:'After'}]),true);assert.equal(work(storage)[0].name,'Weekly estimate');
  const items=JSON.parse(storage.getItem('gauge-saved'));assert.ok(items[0].id);items[0].src='Again';
  storeSaved('gauge-saved',items);assert.equal(work(storage)[0].name,'Weekly estimate');assert.equal(work(storage)[0].pinned,true);
 }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('failed optional date writes retain models and never present a stale date as current',()=>{
 const storage=memory();saveTrackedWork(storage,'roadmap-src','One',1000);
 const write=storage.setItem;storage.setItem=(key,value)=>{if(key.startsWith(WORK_META_PREFIX))throw Error('Full');return write(key,value);};
 assert.doesNotThrow(()=>saveTrackedWork(storage,'roadmap-src','Two',2000));assert.equal(storage.getItem('roadmap-src'),'Two');assert.equal(work(storage)[0].savedAt,null);
 assert.throws(()=>organiseWork(storage,work(storage)[0],{pinned:true}),/Full/);assert.equal(work(storage)[0].pinned,false);
});
test('organisation and templates survive backup, routed to their owning origin',()=>{
 const storage=memory({'roadmap-src':'Plan','thinking-lab:reframe:v1':JSON.stringify({sessions:[{id:'a',problem:'Lab'}]})});
 for(const record of work(storage))organiseWork(storage,record,{archived:true,name:'Kept '+record.name});
 storage.setItem('mg:template:v1:energy:cycles:one','{"name":"Battery"}');storage.setItem('mg:template-default:v1:energy:cycles','one');
 storage.setItem('mg:template:v1:lab:reframe:one','{"name":"Review"}');
 const archive=exportArchive(storage,{origin:'https://tools.matthewgarner.me',now:'2026-10-03T12:00:00.000Z'});
 const tools=partitionArchive(archive,'tools.matthewgarner.me');assert.equal(tools.elsewhere[0].count,2);
 const restored=memory();applyImport(restored,previewImport(restored,tools.archive));assert.ok(work(restored).every(r=>r.archived));assert.ok(work(restored).every(r=>r.name.startsWith('Kept ')));
 const lab=partitionArchive(archive,'thinking-lab-experiments.matthewg12.chatgpt.site');assert.equal(lab.archive.entries.length,3);
 assert.equal(isOwnedKey('mg:template:v1:lab:unknown:token'),false);assert.equal(isOwnedKey('mg:work-meta:v1:tools:__proto__'),false);
});
