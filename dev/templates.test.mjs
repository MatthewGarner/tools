import test from 'node:test';
import assert from 'node:assert/strict';
import {templateStore,templateKeyInfo,validTemplate,TEMPLATE_LIMIT} from '../assets/template-store.js';
const storage=()=>{const data=new Map();return{get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
const input=(id='one')=>({id,name:' My starting point ',format:'workspace-json',content:'{"workspace":{"problem":"Generic question"}}',savedAt:1234});
test('templates retain exact captured content and isolate each tool and collection',()=>{
  const s=storage(),a=templateStore(s,'lab','objections'),b=templateStore(s,'lab','reframe'),c=templateStore(s,'tools','objections');
  const record=a.add(input());b.add({...input(),content:'another tool'});c.add({...input(),content:'another collection'});
  assert.equal(a.list().items[0].content,input().content);assert.equal(record.name,'My starting point');assert.equal(b.list().items[0].content,'another tool');assert.equal(c.list().items[0].content,'another collection');
  record.content='mutated outside storage';assert.equal(a.read('one').content,input().content);
});
test('defaults select stored starting material, survive rename, and clear when deleted',()=>{
  const a=templateStore(storage(),'lab','reframe');const original=a.add(input());assert.equal(a.getDefault(),null);a.setDefault(original);
  const renamed=a.rename(original,'Weekly review');assert.equal(a.getDefault().name,'Weekly review');assert.equal(a.getDefault().content,input().content);
  a.clearDefault();assert.equal(a.getDefault(),null);a.setDefault(renamed);a.remove(renamed);assert.equal(a.getDefault(),null);assert.deepEqual(a.list().items,[]);
});
test('stale tabs cannot rename, delete, or choose an outdated template',()=>{
  const a=templateStore(storage(),'lab','reframe');const stale=a.add(input());const latest=a.rename(stale,'New name');
  for(const fn of [()=>a.rename(stale,'Old edit'),()=>a.remove(stale),()=>a.setDefault(stale)])assert.throws(fn,/changed in another tab/);
  assert.equal(a.read('one').name,latest.name);
});
test('corrupt templates stay recoverable without hiding valid templates or falling back silently',()=>{
  const s=storage(),a=templateStore(s,'lab','reframe');a.add(input());s.setItem('mg:template:v1:lab:reframe:broken','{broken');
  assert.equal(a.list().items.length,1);assert.equal(a.list().issues.length,1);assert.equal(s.getItem('mg:template:v1:lab:reframe:broken'),'{broken');
  s.setItem('mg:template-default:v1:lab:reframe','broken');assert.throws(()=>a.getDefault(),/recovery/);a.clearDefault();assert.equal(a.getDefault(),null);
  s.setItem('mg:template-default:v1:lab:reframe','missing');assert.throws(()=>a.getDefault(),/unavailable/);
});
test('limits and rejected storage writes do not evict existing templates',()=>{
  const s=storage(),a=templateStore(s,'lab','reframe');for(let i=0;i<TEMPLATE_LIMIT;i++)a.add(input(`item-${i}`));
  assert.throws(()=>a.add(input('overflow')),/20 templates/);assert.equal(a.list().items.length,TEMPLATE_LIMIT);
  const first=a.read('item-0');s.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};assert.throws(()=>a.rename(first,'Failed edit'),{name:'QuotaExceededError'});assert.deepEqual(a.read(first.id),first);
});
test('backup key parsing rejects unrelated storage and validation rejects malformed records',()=>{
  assert.deepEqual(templateKeyInfo('mg:template:v1:energy:risk:one'),{scope:'energy',tool:'risk',id:'one',isDefault:false});
  assert.deepEqual(templateKeyInfo('mg:template-default:v1:lab:reframe'),{scope:'lab',tool:'reframe',id:undefined,isDefault:true});
  for(const key of ['mg:template:v1:foreign:risk:one','mg:template-default:v1:lab:reframe:one','mg:template:v1:lab:../x:one','my-secret'])assert.equal(templateKeyInfo(key),null);
  const a=templateStore(storage(),'lab','reframe'),r=a.add(input());assert.equal(validTemplate(r,'lab','reframe'),true);
  for(const change of [{content:''},{format:'executable'},{id:'../other'},{name:' '},{savedAt:-1}])assert.equal(validTemplate({...r,...change},'lab','reframe'),false);
  assert.throws(()=>templateStore(storage(),'lab',undefined),/Unknown/);
});
test('the backup ceiling includes UTF-8 bytes and JSON escaping',()=>{
  const a=templateStore(storage(),'lab','reframe');
  assert.throws(()=>a.add({...input(),content:'😀'.repeat(1250000)}),/under 5 MB/);
  assert.throws(()=>a.add({...input(),content:'"'.repeat(2500000)}),/under 5 MB/);
  assert.deepEqual(a.list().items,[]);
});
