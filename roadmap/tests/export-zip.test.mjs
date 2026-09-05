import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crc32,createSlideZip} from '../export-zip.js';
const bytes=new TextEncoder().encode('hello');
test('slide ZIP retains every file, Unicode filename and checked payload',async()=>{
  assert.equal(crc32(bytes),0x3610a686);
  const archive=new Uint8Array(await createSlideZip([{name:'slide-01.png',bytes},{name:'slide-é.png',bytes}]).arrayBuffer());
  const v=new DataView(archive.buffer),end=archive.length-22;
  assert.equal(v.getUint32(end,true),0x06054b50);
  assert.equal(v.getUint16(end+10,true),2);
  let at=v.getUint32(end+16,true);const names=[];
  while(at<end){
    assert.equal(v.getUint32(at,true),0x02014b50);
    const length=v.getUint16(at+28,true),local=v.getUint32(at+42,true);
    names.push(new TextDecoder().decode(archive.slice(at+46,at+46+length)));
    assert.equal(v.getUint32(local,true),0x04034b50);
    assert.equal(v.getUint32(local+14,true),0x3610a686);
    assert.deepEqual(archive.slice(local+30+length,local+30+length+5),bytes);
    at+=46+length;
  }
  assert.deepEqual(names,['slide-01.png','slide-é.png']);
});
test('slide ZIP refuses ambiguous filenames and invalid entries',()=>{
  assert.throws(()=>createSlideZip([]));
  assert.throws(()=>createSlideZip([{name:'../slide.png',bytes}]));
  assert.throws(()=>createSlideZip([{name:'slide.png',bytes},{name:'slide.png',bytes}]));
  assert.throws(()=>createSlideZip([{name:'slide.png',bytes:'hello'}]));
});
