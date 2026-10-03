import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diffItems, wireSnapshots} from '../assets/snapshots.js';

const K = it => it.title;
const S = it => it.state;

test('added, moved, dropped, any', () => {
  const old = [{title: 'A', state: 'now'}, {title: 'B', state: 'next'}, {title: 'C', state: 'later'}];
  const cur = [{title: 'A', state: 'now'}, {title: 'B', state: 'now'}, {title: 'D', state: 'later'}];
  const d = diffItems(old, cur, {key: K, state: S});
  assert.deepEqual(d.added.map(K), ['D']);
  assert.deepEqual([...d.moved.values()].map(m => m.from + '→' + m.to), ['next→now']);
  assert.deepEqual(d.dropped.map(K), ['C']);
  assert.equal(d.any, true);
});

test('identical lists → nothing, any false', () => {
  const l = [{title: 'A', state: '1'}];
  const d = diffItems(l, l, {key: K, state: S});
  assert.equal(d.added.length + d.moved.size + d.dropped.length, 0);
  assert.equal(d.any, false);
});

test('keys normalise case and whitespace exactly like roadmap did', () => {
  const d = diffItems([{title: '  Book   Clubs ', state: 'x'}],
    [{title: 'book clubs', state: 'x'}], {key: K, state: S});
  assert.equal(d.any, false);
});

test('state comparison is case-insensitive; defaults compare titles only', () => {
  const d1 = diffItems([{title: 'A', state: 'NOW'}], [{title: 'A', state: 'now'}], {key: K, state: S});
  assert.equal(d1.any, false);
  const d2 = diffItems([{title: 'A'}], [{title: 'A'}], {key: K});
  assert.equal(d2.any, false);
});

test('moved map is keyed by the normalised key and carries the current item', () => {
  const cur = [{title: 'Big Bet', state: 'doing', extra: 42}];
  const d = diffItems([{title: 'big bet', state: 'todo'}], cur, {key: K, state: S});
  const m = d.moved.get('big bet');
  assert.equal(m.item.extra, 42);
  assert.equal(m.from, 'todo');
});

test('comparison parsing follows baseline content when a capped list reuses an index',()=>{
  // Control stubs exercise the real snapshot controller; no layout is involved.
  const control=()=>({value:'',style:{},options:[],setAttribute(){},addEventListener(){},
    appendChild(option){this.options.push(option);},set textContent(_value){this.options=[];}});
  const oldDocument=globalThis.document,oldLocation=globalThis.location;
  globalThis.document={createElement:()=>control()};
  globalThis.location={href:'https://tools.example/roadmap/'};
  try{
    const label='2026-10-03 · Weekly plan';
    let list=Array.from({length:20},(_,index)=>({label,src:`title: Plan ${String(index).padStart(2,'0')}`}));
    const els={snap:control(),sel:control(),del:control()};
    const snapshots=wireSnapshots({store:{load:()=>list},parse:src=>({source:src}),els});
    els.sel.value='0';assert.equal(snapshots.current().model.source,'title: Plan 00');
    // The native 20-item cap drops the first baseline after the next save.
    list=[...list.slice(1),{label,src:'title: Plan 20'}];
    snapshots.refresh();els.sel.value='0';
    assert.equal(snapshots.current().model.source,'title: Plan 01');
  }finally{
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
    if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
  }
});
