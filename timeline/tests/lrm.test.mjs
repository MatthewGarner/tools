import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, dayToISO, parseDate} from '../parse.js';
import {decisionLead, leadReceipt, primaryDecisionLead} from '../lrm.js';
import {render, timelineVerdict, toMarkdown} from '../render.js';

const ctx = {colors:{card:'#fff',border:'#ddd',ink:'#222',muted:'#66777a',accent:'#08c',bg:'#f7f8f6',err:'#b3403a',status:{done:'#187a3e',doing:'#08c',risk:'#9a6a00',blocked:'#b3403a'},brand:'#e2231a',brandText:'#d62015'},measure:t=>String(t).length*7,today:parseDate('2026-08-01')};
const DOC = `title: Move
today: 2026-08-01
Fit-out: Construction complete 2026-09 .. 2026-12
Lease ends 2027-02-28 [fixed] [lead: 6w]`;

test('lead is a derived decision clock on a fixed event', () => {
  const m=parse(DOC), it=m.items[1];
  assert.equal(it.leadDays,42);
  const l=decisionLead(it,ctx.today);
  assert.equal(dayToISO(l.day),'2027-01-17');
  assert.equal(leadReceipt(it,ctx.today).text,'Decision clock: Decide by 17 Jan 2027 for Lease ends (6 weeks lead).');
  assert.deepEqual(m.warnings,[]);
});

test('lead tags fail closed when malformed, duplicated, or not fixed', () => {
  const malformed=parse('A 2026-10 [fixed] [lead: soon]');
  assert.equal(malformed.items[0].leadDays,null);
  assert.match(malformed.warnings.join('\n'),/positive duration/);
  const duplicate=parse('A 2026-10 [fixed] [lead: 6w] [lead: 5d]');
  assert.equal(duplicate.items[0].leadDays,42);
  assert.match(duplicate.warnings.join('\n'),/more than one decision lead/);
  const open=parse('A 2026-10 .. 2026-11 [lead: 6w]');
  assert.equal(open.items[0].leadDays,null);
  assert.match(open.warnings.join('\n'),/only belongs on a \[fixed\]/);
});

test('a closed clock leads the decision readout without rewriting the forecast', () => {
  const m=parse('today: 2026-08-01\nGate 2026-07-15 [fixed] [lead: 2w]\nBuild: Work 2026-08 .. 2026-10');
  const v=timelineVerdict(m,ctx.today);
  assert.match(v.line,/Decision window closed/);
  assert.match(v.line,/Decide by 1 Jul 2026/);
  assert.equal(primaryDecisionLead(m,ctx.today).it.label,'Gate');
});

test('an authored verdict cannot hide an active decision clock, but explicit off can', () => {
  const authored=parse('today: 2026-08-01\nverdict: We are ready\nGate 2026-10-01 [fixed] [lead: 2w]');
  const va=timelineVerdict(authored,ctx.today);
  assert.equal(va.line,'We are ready');
  assert.match(va.rest,/Decision clock/);
  const off=parse('today: 2026-08-01\nverdict: off\nGate 2026-10-01 [fixed] [lead: 2w]');
  assert.equal(timelineVerdict(off,ctx.today).line,'');
});

test('wide, narrow, presentation and markdown carry an explicit decision clock', () => {
  const m=parse(DOC);
  const wide=render(m,ctx,null,{intent:'live-wide'});
  const narrow=render(m,{...ctx,width:390},null,{intent:'live-narrow'});
  const deck=render(m,ctx,null,{intent:'presentation'});
  for(const svg of [wide,narrow,deck]){
    assert.match(svg,/data-lrm/);
    assert.match(svg,/DECIDE BY|Decision clock/);
    assert.doesNotMatch(svg,/NaN|Infinity/);
  }
  assert.match(toMarkdown(m,null,'https://example.test',ctx.today),/decide by 17 Jan 2027 \(6 weeks lead\)/);
});

test('lead date expands the time domain rather than clipping the derived diamond', () => {
  const m=parse('today: 2026-01-01\nEvent 2026-12-31 [fixed] [lead: 40w]');
  const svg=render(m,ctx,null,{intent:'live-wide'});
  assert.match(svg,/data-lrm/);
  assert.match(svg,/DECIDE BY/);
});

test('the native and panelled export paths retain each decision clock', () => {
  const source=['today: 2026-01-01', ...Array.from({length:17}, (_, i) =>
    i === 16 ? 'External gate 2028-01-01 [fixed] [lead: 12w]' :
      'Lane: Milestone ' + i + ' 2026-' + String(i % 12 + 1).padStart(2,'0') + ' .. 2027-02')].join('\n');
  const m=parse(source);
  const native=render(m,ctx,null,{intent:'native'});
  assert.match(native,/data-mode="panels"/);
  assert.match(native,/data-lrm/);
  assert.match(native,/DECIDE BY/);
});

test('presentation cut prioritises decision clocks and names any it cannot carry', async () => {
  const {layoutTimeline}=await import('../layout.js');
  const many=['today: 2026-01-01', ...Array.from({length:9},(_,i)=>
    'Early '+i+' 2026-0'+(i%8+1)+' .. 2026-10'),
    'Late external gate 2028-01-01 [fixed] [lead: 8w]'].join('\n');
  const m=parse(many), layout=layoutTimeline(m,{...ctx,intent:'presentation'});
  assert.ok(layout.presentation.selected.some(e=>e.it.label==='Late external gate'));
  const clocks=['today: 2026-01-01', ...Array.from({length:9},(_,i)=>
    'Gate '+i+' 2027-'+String(i%9+1).padStart(2,'0')+'-01 [fixed] [lead: 2w]')].join('\n');
  const deck=render(parse(clocks),ctx,null,{intent:'presentation'});
  assert.match(deck,/2 DECISION CLOCKS/);
});
