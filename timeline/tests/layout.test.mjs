import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse,parseDate} from '../parse.js';
import {render} from '../render.js';

const measure=text=>String(text).length*7;
const today=parseDate('2026-01-01');
const ctx={colors:{card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',err:'#b33',
  status:{done:'#1D7A3E',doing:'#1F4FD8',risk:'#9A6A00',blocked:'#B33'}},measure,today};
const field=(src,intent='live-wide')=>render(parse(src),{...ctx,intent},null,{intent,edit:intent.startsWith('live')});
const count=(svg,re)=>(svg.match(re)||[]).length;

test('small plans retain the Field grammar rather than switching visual modes',()=>{
  for(const src of ['A 2026-02 .. 2026-03','A 2026-02 .. 2026-03\nB 2026-04 [fixed]','A 2026-02\nB 2026-03\nC 2026-04']){
    const svg=field(src);
    assert.match(svg,/data-field="timeline"/);
    assert.doesNotMatch(svg,/data-mode=/);
  }
});

test('dense one-lane plans place every forecast on its own factual track, deterministically',()=>{
  const src=Array.from({length:8},(_,i)=>`Delivery: Long dependent milestone ${i+1} 2026-0${2+(i%3)} .. 2026-08`).join('\n');
  const a=field(src),b=field(src);
  assert.equal(a,b);
  assert.equal(count(a,/data-field-item=/g),8);
  const ys=[...a.matchAll(/data-ms="p50"[^>]*cy="([\d.]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ys).size,8,'each same-lane forecast receives a separate track');
});

test('dense native Field is exhaustive without changing its timing vocabulary',()=>{
  const src=Array.from({length:24},(_,i)=>`Lane: Milestone ${i+1} 2026-${String(1+(i%12)).padStart(2,'0')} .. 2027-${String(1+(i%12)).padStart(2,'0')}`).join('\n');
  const svg=field(src,'native');
  assert.match(svg,/data-native=""/);
  assert.equal(count(svg,/data-field-item=/g),24);
  assert.equal(count(svg,/data-ms="p50"/g),24);
  assert.equal(count(svg,/data-ms="p90"/g),24);
});

test('long authored labels retain their facts and grow the live Field rather than clipping',()=>{
  const src=Array.from({length:20},(_,i)=>`Lane: Long authored milestone ${i+1} with an operationally specific outcome and owner 2026-${String(1+(i%12)).padStart(2,'0')} [fixed]`).join('\n');
  const svg=field(src);
  assert.equal(count(svg,/data-field-item=/g),20);
  assert.ok(+(/<svg[^>]*height="(\d+)"/.exec(svg)||[])[1]>900);
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
});

test('a long interval remains one Field fact rather than being split across an invented panel boundary',()=>{
  const lines=['Lane: Crossing programme 2026-01 .. 2029-12'];
  for(let i=0;i<20;i++)lines.push(`Lane: Event ${String(i+1).padStart(2,'0')} 2026-${String(1+(i%12)).padStart(2,'0')} [fixed]`);
  const svg=field(lines.join('\n'),'native');
  assert.equal(count(svg,/data-field-item="lane\|crossing programme"/g),1);
  assert.equal(count(svg,/data-mskey="lane\|crossing programme"/g),1);
  assert.equal(count(svg,/data-ms="p90"/g),1);
});

test('presentation is one complete Field or an explicit refusal, never ranked selection',()=>{
  const ordinary=field(Array.from({length:12},(_,i)=>`Lane: Milestone ${i+1} 2026-0${i%8+1} .. 2026-11`).join('\n'),'presentation');
  assert.match(ordinary,/data-copy-field="complete"/);
  assert.equal(count(ordinary,/data-field-item=/g),12);
  const dense=field(Array.from({length:40},(_,i)=>`Lane ${i%4}: Deliberately descriptive milestone ${i} 2026-0${i%8+1} .. 2027-11 \/\/ note retained in SVG`).join('\n'),'presentation');
  assert.match(dense,/data-copy-field="unavailable"/);
  assert.equal(count(dense,/data-field-item=/g),0);
});

test('a complete presentation has one shared chronology, ruler and TODAY reference',()=>{
  const src=Array.from({length:12},(_,i)=>`Lane ${i%4+1}: Milestone ${i+1} 2026-0${i%8+1} .. 2026-11`).join('\n');
  const svg=field(src,'presentation');
  assert.match(svg,/data-copy-field="complete"/);
  assert.equal(count(svg,/data-today=""/g),1,
    'one 16:9 Field has one shared chronological reference, never side-by-side timelines');
});

test('each physical intent declares the agreed data-text floor',()=>{
  for(const [intent,floor] of [['live-wide',11],['live-narrow',11],['native',11],['presentation',22]])
    assert.match(field('A 2026-02',intent),new RegExp('data-font-floor="'+floor+'"'));
});
