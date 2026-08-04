import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse,parseDate} from '../parse.js';
import {layoutTimeline,NATIVE_PANEL_THRESHOLD} from '../layout.js';

const measure=text=>String(text).length*7;
const today=parseDate('2026-01-01');
const lay=(src,intent='live-wide')=>layoutTimeline(parse(src),{measure,intent,today});

test('one or two milestones choose the sparse decision surface',()=>{
  assert.equal(lay('A 2026-02 .. 2026-03').mode,'sparse');
  assert.equal(lay('A 2026-02 .. 2026-03\nB 2026-04 [fixed]').mode,'sparse');
  assert.equal(lay('A 2026-02\nB 2026-03\nC 2026-04').mode,'board');
});

test('medium density uses measured deterministic sublanes without intersecting extents',()=>{
  const src=Array.from({length:8},(_,i)=>`Delivery: Long dependent milestone ${i+1} 2026-0${2+(i%3)} .. 2026-08`).join('\n');
  const a=lay(src),b=lay(src);
  assert.equal(a.mode,'board');
  assert.deepEqual([...a.placements.values()].map(p=>p.row),[...b.placements.values()].map(p=>p.row));
  assert.ok(a.laneRows.get('Delivery')>1);
  const placed=[...a.placements.values()];
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
    if(placed[i].row!==placed[j].row)continue;
    assert.ok(placed[i].rightX+12<placed[j].startX||placed[j].rightX+12<placed[i].startX);
  }
});

test('dense native layout becomes an exhaustive panel stack',()=>{
  const src=Array.from({length:NATIVE_PANEL_THRESHOLD+3},(_,i)=>`Lane: Milestone ${i+1} 2026-${String(1+(i%12)).padStart(2,'0')} .. 2027-${String(1+(i%12)).padStart(2,'0')}`).join('\n');
  const layout=lay(src,'native');
  assert.equal(layout.mode,'panels');
  assert.ok(layout.panels.length>=2);
  const ids=new Set(layout.panels.flatMap(panel=>panel.entries.map(entry=>entry.id)));
  assert.equal(ids.size,NATIVE_PANEL_THRESHOLD+3);
});

test('dense live-wide uses measured panels and wraps long labels inside their column',()=>{
  const src=Array.from({length:20},(_,i)=>`Lane: Long authored milestone ${i+1} with an operationally specific outcome and owner 2026-${String(1+(i%12)).padStart(2,'0')} [fixed]`).join('\n');
  const layout=lay(src,'live-wide');
  assert.equal(layout.mode,'panels');
  for(const entry of layout.panels.flatMap(panel=>panel.entries)){
    assert.ok(entry.labelLines.length>1);
    assert.ok(entry.labelLines.every(line=>measure(line)<=280));
    assert.ok(entry.detailLines.every(line=>measure(line)<=280));
  }
});

test('a panel cut through an interval visibly duplicates its stable ID',()=>{
  const lines=['Lane: Crossing programme 2026-01 .. 2029-12'];
  for(let i=0;i<20;i++)lines.push(`Lane: Event ${String(i+1).padStart(2,'0')} 2026-${String(1+(i%12)).padStart(2,'0')} [fixed]`);
  const layout=lay(lines.join('\n'),'native');
  const copies=layout.panels.flatMap(panel=>panel.entries).filter(entry=>entry.it.label==='Crossing programme');
  assert.ok(copies.length>1);
  assert.ok(copies.every(copy=>copy.id==='T01'));
  assert.ok(copies.some(copy=>copy.continuesTo)&&copies.some(copy=>copy.continuesFrom));
});

test('presentation selection is deterministic and reports its remainder',()=>{
  const src=['Done first 2025-01 [done]','Later 2026-09 .. 2026-10','Fixed tie 2026-04 [fixed]','Open early 2026-02 .. 2026-03',
    ...Array.from({length:7},(_,i)=>`Extra ${i+1} 2027-${String(i+1).padStart(2,'0')} [fixed]`)].join('\n');
  const a=lay(src,'presentation'),b=lay(src,'presentation');
  assert.deepEqual(a.presentation,b.presentation);
  assert.equal(a.presentation.selected[0].it.label,'Open early');
  assert.equal(a.presentation.remainder,4);
  assert.match(a.presentation.rule,/EARLIEST OPEN P50.*FIXED.*SOURCE ORDER/);
});

test('each physical intent declares the agreed data-text floor',()=>{
  for(const [intent,floor] of [['live-wide',11],['live-narrow',11],['native',11],['presentation',22]])
    assert.equal(lay('A 2026-02',intent).fontFloor,floor);
});
