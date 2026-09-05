import {layoutObservatory,observatoryPages,observatoryColors} from '../observatory.js';
const words = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]).join(' ');
/*
  Field contract — written from timeline/CONTEXT.md before the renderer is
  changed. These assertions deliberately name user-visible meaning (a forecast,
  an authored note, an exhaustive export) rather than SVG element types or a
  layout implementation. `data-field-*` is the renderer's semantic interface:
  it makes the same vocabulary addressable to motion, accessibility and tests.
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {timelineDiff, timelineDiffView} from '../diff.js';
import {render, toMarkdown} from '../render.js';

const ctx = {
  colors: {card:'#fff', border:'#d7d7d2', ink:'#202124', muted:'#69707a', accent:'#2255cc', bg:'#f7f7f5', err:'#bc3127',
    status:{done:'#187a3e', doing:'#2255cc', risk:'#9a6a00', blocked:'#bc3127'}},
  measure: text => String(text).length * 7,
  today: parseDate('2026-07-06'),
};
const complete = `title: Reading release
palette: ember
verdict: Keep the public launch inside the review window.
App: Sync engine rewrite 2026-08 .. 2026-10 // migrate the offline queue before beta
App: Offline downloads 2026-09 .. 2026-11 [risk]
Marketing: Launch story 2026-08 [done]
Compliance: Privacy review 2026-08 .. 2026-09 [fixed] [lead: 3w]
Reader migration 2026-12 .. 2027-02`;
const intents = [
  ['live-wide', {}], ['live-narrow', {width:390}], ['native', {}], ['presentation', {}],
];
const renderIntent = (doc, intent, extra = {}, diff = null, edit = false) =>
  render(parse(doc), {...ctx, intent, ...extra}, diff, {intent, edit});
const count = (svg, re) => (svg.match(re) || []).length;

test('every projection identifies itself as the same Field and exposes each authored timing fact', () => {
  for(const [intent, extra] of intents){
    const svg = renderIntent(complete, intent, extra, null, intent.startsWith('live'));
    assert.match(svg, /data-field="timeline"/);
    assert.match(svg, /data-field-palette="ember"/);
    assert.equal(count(svg, /data-field-item=/g), 5, intent + ' keeps every milestone');
    assert.equal(count(svg, /data-field-timing="forecast"/g), 3, intent + ' preserves forecasts');
    assert.equal(count(svg, /data-field-timing="fixed"/g), 1, intent + ' preserves fixed facts');
    assert.equal(count(svg, /data-field-state="done"/g), 1, intent + ' preserves completion');
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  }
});

test('palette, note and verdict are visible authored facts in all artefacts, including Markdown', () => {
  for(const [intent, extra] of intents){
    const svg = renderIntent(complete, intent, extra);
    const visibleText = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(([, line]) => line).join(' ');
    assert.match(svg, /migrate the offline queue before beta/, intent + ' shows the authored note');
    assert.match(svg, /data-field-note=/, intent + ' marks the note as a factual secondary line');
    assert.match(visibleText, /Keep the public launch inside the review window\./, intent + ' shows the authored verdict');
  }
  const off = parse(complete.replace('verdict: Keep the public launch inside the review window.', 'verdict: off'));
  assert.doesNotMatch(render(off, ctx), />VERDICT</, 'verdict: off removes only the receipt');
  assert.match(toMarkdown(parse(complete), null, 'https://example.test/timeline', ctx.today), /migrate the offline queue before beta/);
});

test('comparison keeps duplicate occurrences distinct and treats a lane move as an honest drop plus new item', () => {
  const oldDoc = `Build: Approval 2026-08 .. 2026-09
Build: Approval 2026-10 .. 2026-11
Grid: Move me 2026-12 .. 2027-01`;
  const shifted = `Build: Approval 2026-08-08 .. 2026-09
Build: Approval 2026-10 .. 2026-12
Ops: Move me 2026-12 .. 2027-01`;
  const diff = timelineDiff(parse(oldDoc), parse(shifted));
  assert.equal(diff.moved.size, 2, 'both duplicate occurrences retain their own history');
  assert.equal(diff.added.length, 1, 'a lane move is new work in its new portfolio lane');
  assert.equal(diff.dropped.length, 1, 'a lane move remains visible as leaving its former lane');
});

test('comparison distinguishes changed P50, changed P90 and a former fixed fact without relying on colour', () => {
  const oldDoc = `Forecast P50 shift 2026-09 .. 2026-11
Forecast P90 shift 2026-09 .. 2026-11
External gate 2026-10-01 [fixed]`;
  const newDoc = `Forecast P50 shift 2026-10 .. 2026-11
Forecast P90 shift 2026-09 .. 2026-12
External gate 2026-10 .. 2026-12`;
  const diff = timelineDiffView(timelineDiff(parse(oldDoc), parse(newDoc)), 'August review');
  const svg = renderIntent(newDoc, 'live-wide', {}, diff);
  assert.match(svg, /data-field-history="p50"/, 'old P50 remains intelligible');
  assert.match(svg, /data-field-history="p90"/, 'old P90 remains intelligible');
  assert.match(svg, /data-field-history="fixed"/, 'a former fixed fact is not rewritten as a forecast');
  assert.match(svg, /data-field-history-inert=""/, 'historic geometry is never an edit target');
});

test('comparison movement is neutral text with an explicit finish delta', () => {
  const a=parse('A 2026-09 .. 2026-11'),m=parse('A 2026-10 .. 2026-11');
  const d=timelineDiffView(timelineDiff(a,m),'August'),L=layoutObservatory(m,ctx,d),s=render(m,ctx,d);
  assert.ok(L.rows[0].blocks.some(b=>b.kind==='change'&&b.lines.join(' ').includes('+30 days')));
  assert.match(s,new RegExp('fill="'+observatoryColors(m,ctx).muted+'"[^>]*>P50'));
});

test('the field carries date facts separately from geometry across short, multi-year and state edge cases', () => {
  const doc = `today: 2026-08-01
Near today 2026-08-01 .. 2026-08-02
Far horizon 2029-11 .. 2030-04
Done point 2026-07-20 [done]
Overdue external fact 2026-07-15 [fixed]
Risk forecast 2026-09 .. 2026-11 [risk]`;
  for(const [intent, extra] of intents){
    const svg = renderIntent(doc, intent, extra);
    assert.equal(count(svg, /data-field-p50-day=/g), 5, intent + ' carries all P50 date facts');
    assert.equal(count(svg, /data-field-p90-day=/g), 5, intent + ' carries all P90 date facts');
    assert.match(svg, /data-field-state="overdue"/, intent + ' names factual lateness');
    assert.match(svg, /data-field-state="risk"/, intent + ' names forecast risk');
    assert.match(svg, /data-field-state="done"/, intent + ' names completion');
    assert.doesNotMatch(svg, /data-field-state="risk"[^>]*#bc3127/, 'risk is not painted as an overdue fact');
  }
});

test('Copy PNG keeps one complete slide while a dense deck covers every row', () => {
  const ordinary=renderIntent(complete,'presentation');assert.match(ordinary,/data-copy-field="complete"/);
  assert.equal(count(ordinary,/data-field-item=/g),5);assert.doesNotMatch(words(ordinary),/MILESTONES|COMPLETE SET/);
  const m=parse(Array.from({length:40},(_,i)=>`Lane: Outcome ${i} 2026-08 .. 2027-01`).join('\n'));
  assert.match(render(m,{...ctx,intent:'presentation'}),/data-copy-field="unavailable"/);
  const deck=observatoryPages(m,ctx);assert.equal(deck.complete,true);assert.equal(deck.pages.flatMap(p=>p.sourceKeys).length,40);
});

test('explicit export intent wins over a phone-sized context', () => {
  const svg = renderIntent('A 2026-08 .. 2026-09', 'presentation', {width:390});
  assert.match(svg, /data-intent="presentation"/);
  assert.match(svg, /width="1920" height="1080"/);
});

test('an unbroken authored token wraps in the Field or makes Copy PNG refuse', () => {
  const token = 'unbroken'.repeat(80);
  const doc = 'Lane: ' + token + ' 2026-08 .. 2026-09 // ' + token;
  const live = renderIntent(doc, 'live-wide');
  assert.doesNotMatch(live, new RegExp('>' + token + '</text>'), 'live Field never lets one word overrun its rail');
  const presentation = renderIntent(doc, 'presentation');
  assert.ok(/data-copy-field="unavailable"/.test(presentation) || !presentation.includes('>' + token + '</text>'),
    'Copy PNG either keeps an unbroken token within the Field or safely refuses');
});

test('large conclusions refuse safely and removed milestones retain their full names', () => {
  const m=parse('verdict: '+ 'Long authored conclusion. '.repeat(200)+'\nA 2026-08 .. 2026-09');
  assert.match(render(m,{...ctx,intent:'presentation'}),/data-copy-field="unavailable"/);
  const a=parse('Dropped outcome 2026-08 .. 2026-09\nRetained 2026-10 .. 2026-11'),b=parse('Retained 2026-10 .. 2026-11');
  const d=timelineDiffView(timelineDiff(a,b),'August review'),deck=observatoryPages(b,ctx,d);
  assert.equal(deck.complete,true);assert.match(words(deck.pages[0].svg),/Dropped outcome/);assert.match(deck.pages[0].svg,/data-dropped=""/);
});

test('authored conclusions preserve the independent decision clock', () => {
  const m=parse('today: 2026-08-01\nverdict: Keep the review window clear.\nPrivacy review 2026-08-28 [fixed] [lead: 3w]');
  const s=render(m,{...ctx,intent:'presentation'});assert.match(words(s),/Keep the review window clear/);assert.match(words(s),/Decide by 7 Aug 2026/);assert.match(s,/data-lrm/);
});

test('unbounded titles stay complete in native SVG and cannot claim a fitted deck', () => {
  const title='Crossfunctional'.repeat(18),m=parse('title: '+title+'\nA 2026-08 .. 2026-10');
  for(const intent of ['live-wide','native']){const s=render(m,{...ctx,intent});assert.ok(words(s).replace(/ /g,'').includes(title));}
  const tooLong=parse('title: '+title.repeat(20)+'\nA 2026-08 .. 2026-10');assert.match(render(tooLong,{...ctx,intent:'presentation'}),/data-copy-field="unavailable"/);assert.equal(observatoryPages(tooLong,ctx).complete,false);
});

test('wrapped item labels give state words their own measured line', () => {
  const m=parse('today: 2026-10-01\nLane: '+ 'A'.repeat(80)+' 2026-08-01 [fixed]');
  for(const intent of ['live-wide','presentation']){const L=layoutObservatory(m,ctx,null,{intent}),row=L.rows[0],status=row.blocks.find(b=>b.kind==='state');assert.ok(status);assert.equal(status.lines.join(' '),'OVERDUE');assert.ok(status.y>=row.blocks[0].y+row.blocks[0].lines.length*row.blocks[0].step);}
});

test('comparison additions never overprint their finish dates', () => {
  const a=parse('A 2026-08 .. 2026-09'),m=parse('A 2026-08 .. 2026-09\n'+ 'Long'.repeat(50)+' 2026-10 .. 2026-11'),d=timelineDiffView(timelineDiff(a,m),'August');
  for(const intent of ['live-wide','live-narrow','presentation']){const L=layoutObservatory(m,{...ctx,width:390},d,{intent}),r=L.rows[1],fresh=r.blocks.find(b=>b.lines.includes('NEW')),dates=r.blocks.find(b=>b.kind==='dates');assert.ok(fresh&&dates);assert.ok(fresh.y>=dates.y+dates.lines.length*dates.step);}
});

test('empty views keep their geometry and a keyboard add route', () => {
  const m=parse('title: Empty timing plan');
  const p=render(m,{...ctx,intent:'presentation'});assert.match(p,/width="1920" height="1080"/);assert.doesNotMatch(words(p),/MILESTONES/);
  assert.match(render(m,{...ctx,intent:'native'}),/width="1442"/);const s=render(m,ctx,null,{edit:true});assert.match(s,/data-edit="additem"[^>]*data-lane=""/);assert.match(s,/data-hit=""[^>]*height="44"/);
});

test('live Field controls are keyboard routes, with a complete add route and no interaction on history', () => {
  const oldDoc = 'App: Beta 2026-08 .. 2026-09';
  const newDoc = 'App: Beta 2026-09 .. 2026-10';
  const diff = timelineDiffView(timelineDiff(parse(oldDoc), parse(newDoc)), 'baseline');
  const svg = renderIntent(newDoc, 'live-wide', {}, diff, true);
  assert.equal(count(svg, /data-edit="cardmenu"[^>]*role="button"/g), 1);
  assert.match(svg, /data-edit="additem"[^>]*data-lane="App"/);
  assert.match(svg, /data-edit="additem"[^>]*data-lane=""/);
  assert.doesNotMatch(svg, /data-field-history[^>]*data-edit=/);
});
