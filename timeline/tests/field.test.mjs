import {layoutObservatory,observatoryPages,observatoryColors} from '../observatory.js';
const words = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]).join(' ');
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {timelineDiff, timelineDiffView} from '../diff.js';
import {render} from '../render.js';

const ctx = {
  colors: {card:'#ffffff', border:'#c7ced9', ink:'#202124', muted:'#69707a', accent:'#2255cc', bg:'#f4f6fb', err:'#bc3127',
    status:{done:'#187a3e', doing:'#2255cc', risk:'#9a6a00', blocked:'#bc3127'}},
  measure: text => String(text).length * 7,
  today: parseDate('2026-07-06'),
};
const twelve = `title: Reading release
App: Sync engine rewrite 2026-08 .. 2026-10
App: Offline downloads 2026-09 .. 2026-11 [risk]
App: Reading reminders 2026-11 .. 2027-01
Marketing: Launch story 2026-08 [done]
Marketing: Subscriber campaign 2026-10 .. 2026-12
Marketing: Editorial preview 2026-09 .. 2026-10
Compliance: Privacy review 2026-08 .. 2026-09 [fixed]
Compliance: Regional approval 2026-10 .. 2026-12
Platform: Search index 2026-08 .. 2026-10
Platform: Shelf curation 2026-09 .. 2026-11
Platform: Device handoff 2026-11 .. 2027-01
Reader migration 2026-12 .. 2027-02`;

const count = (svg, pattern) => (svg.match(pattern) || []).length;
const p50Ys = svg => [...svg.matchAll(/data-ms="p50"[^>]*(?:cy|y1)="([\d.]+)"/g)].map(m => +m[1]);

test('one timing grammar survives all live and paginated projections', () => {
  const m=parse(twelve);for(const intent of ['live-wide','live-narrow','native']){const s=render(m,{...ctx,intent,width:intent==='live-narrow'?390:1442});assert.equal(count(s,/data-field-item=/g),12);assert.equal(count(s,/data-ms="p50"/g),12);assert.doesNotMatch(s,/NaN|Infinity|undefined/);}
  const deck=observatoryPages(m,ctx);assert.equal(deck.complete,true);assert.equal(deck.pages.flatMap(p=>p.sourceKeys).length,12);
});

test('a twelve-milestone deck remains complete at readable type size', () => {
  const m=parse(twelve),deck=observatoryPages(m,ctx);assert.equal(deck.complete,true);assert.equal(deck.pages.flatMap(p=>p.sourceKeys).length,12);for(const p of deck.pages){assert.match(p.svg,/width="1920" height="1080"/);assert.ok(Math.max(...p50Ys(p.svg))<1000);}
});

test('comparison preserves the former interval and exact movement', () => {
  const a=parse('A 2026-09 .. 2026-11'),m=parse('A 2026-10 .. 2026-12\nNew 2027-01 .. 2027-02'),d=timelineDiffView(timelineDiff(a,m),'June pack'),s=render(m,ctx,d);assert.equal(count(s,/data-ms="ghost"/g),3);assert.match(words(s),/Compared with June pack/);assert.match(words(s),/P50 \+30 days/);assert.match(words(s),/NEW/);
});

test('state words and factual colours remain distinct', () => {
  const m=parse('today: 2026-08-01\nPast gate 2026-07-15 [fixed]\nLanded 2026-07-20 [done]\nUncertain review 2026-09 .. 2026-10 [risk]'),s=render(m,ctx),C=observatoryColors(m,ctx);assert.match(words(s),/OVERDUE/);assert.match(words(s),/RISK/);assert.match(s,new RegExp('data-mskey="\\|past gate"[^>]*stroke="'+C.err+'"'));assert.match(s,new RegExp('data-mskey="\\|landed"[^>]*fill="'+C.status.done+'"'));
});

test('decision leads remain a factual mark across every output', () => {
  const doc = 'today: 2026-08-01\nLease ends 2027-02-28 [fixed] [lead: 6w]\nFit-out: Construction complete 2026-09 .. 2026-12';
  for(const [intent, extra] of [['live-wide', {}], ['live-narrow', {width:390}], ['native', {}], ['presentation', {}]]){
    const svg = render(parse(doc), {...ctx, intent, ...extra}, null, {intent});
    assert.match(svg, /data-lrm/);
    assert.match(svg, /Decision clock/);
  }
});

test('inspection and explicit editing have separate complete keyboard routes', () => {
  const m=parse('App: Beta 2026-08 .. 2026-09\nMarketing: Story 2026-09 .. 2026-10\nLaunch 2026-11 [fixed]'),s=render(m,ctx,null,{edit:true});assert.equal(count(s,/data-inspect=/g),3);assert.equal(count(s,/data-edit="cardmenu"/g),3);for(const kind of ['label','dates','status','setlane','note','started','removeitem'])assert.equal(count(s,new RegExp('data-edit="'+kind+'"','g')),3);assert.equal(count(s,/data-hit=""/g),6);assert.match(s,/data-edit="additem"[^>]*data-lane=""/);
});

test('long phone labels receive measured space above their track', () => {
  const m=parse('App: A long operational milestone whose detailed name must wrap cleanly on a phone 2026-08 .. 2026-10');const L=layoutObservatory(m,{...ctx,width:360},null,{intent:'live-narrow',edit:true});assert.ok(L.rows[0].h>=112);const last=L.rows[0].blocks.at(-1);assert.ok(L.rows[0].cy>L.rows[0].y+last.y+last.lines.length*last.step);
});

test('phone card menus retain the real remove route, not only the visible action label', () => {
  const svg = render(parse('App: Beta 2026-08 .. 2026-09'), {...ctx, width:360}, null,
    {intent:'live-narrow', edit:true});
  assert.match(svg, /data-edit="removeitem"[^>]*data-line="0"[^>]*pointer-events="none"/,
    'the danger action must resolve to the model-owned remove target on a phone');
});
