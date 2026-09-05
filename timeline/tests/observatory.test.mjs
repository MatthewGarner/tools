/* Approved Observatory contracts replace pixel/count assertions for the retired Field.
   A complete deck may have multiple slides; each keeps the same exact chronology. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse,parseDate} from '../parse.js';
import {render,toMarkdown} from '../render.js';
import {layoutObservatory,observatoryPages,observatoryColors} from '../observatory.js';
import {chapterContrast} from '../../roadmap/chapter-colors.js';
import {timelineDiff,timelineDiffView} from '../diff.js';
const today=parseDate('2026-09-05');
const ctx={today,measure:(s,f)=>String(s).length*(Number(f.match(/([\d.]+)px/)?.[1])||16)*.5};
const src='title: Lantern forecast\ntoday: 2026-09-05\naccent: #315D48\nApp: Beta cut 2026-09-18 .. 2026-10-02 [started: 2026-08-10]\nApp: Store review 2026-10-19 .. 2026-11-16 // External review timing\nAssurance: Privacy audit 2026-10-12 .. 2026-11-23 [started: 2026-08-24] // Independent assessment\nLaunch: Campaign ready 2026-11-02 .. 2026-11-16\nLaunch: Launch forecast 2026-11-20 .. 2026-12-11\nLaunch: Conference 2026-12-15 [fixed]';
const visible=svg=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]).join(' ');
const count=(svg,token)=>svg.split(token).length-1;
for(const style of ['field','review','decisions','register'])for(const font of ['Chapter','DM Sans'])for(const dark of [false,true])test(`${style}/${font}/${dark?'dark':'light'} retains every fact and exports completely`,()=>{
 const m=parse(`style: ${style}\nfont: ${font}\n`+src),c={...ctx,dark};
 for(const intent of ['live-wide','live-narrow','native']){
  const svg=render(m,{...c,intent,width:intent==='live-narrow'?390:1440});
  assert.equal(count(svg,'data-field-item='),6);assert.equal(count(svg,'data-ms="started"'),2);
  assert.match(visible(svg),/Independent assessment/);assert.match(svg,new RegExp(`data-direction="${style}"`));
  assert.match(svg,new RegExp(`data-font="${font}"`));assert.doesNotMatch(svg,/NaN|undefined|Infinity|MILESTONES ·|NEXT UP/);
 }
 const deck=observatoryPages(m,c);assert.equal(deck.complete,true);assert.equal(deck.pages.length,1,'representative forecast remains one slide');
 assert.equal(count(deck.pages[0].svg,'data-field-item='),6);assert.match(visible(deck.pages[0].svg),/Started 24 Aug 2026/);
});
test('start, P50 and P90 use calculated dates on one calibrated axis',()=>{
 const m=parse(src),L=layoutObservatory(m,ctx),s=render(m,ctx);
 const row=s.match(/<g data-field-item="assurance\|privacy audit"[\s\S]*?<line[^>]*data-ms="start-span"[^>]*>/)?.[0];assert.ok(row);
 const x=day=>L.plotX+(day-L.domain.lo)/(L.domain.hi-L.domain.lo)*L.plotW;
 const a=Number(row.match(/data-ms="start-span"[^>]*x1="([\d.]+)"/)[1]),b=Number(row.match(/data-ms="start-span"[^>]*x2="([\d.]+)"/)[1]);
 assert.ok(Math.abs(a-x(parseDate('2026-08-24')))<.02);assert.ok(Math.abs(b-x(parseDate('2026-10-12')))<.02);assert.match(row,/stroke-dasharray="2 4"/);
 assert.equal(count(s,'data-ms="whisker"'),5);assert.equal(count(s,'data-ms="start-span"'),2);
});
test('invalid observed starts retain their authored marker without drawing a misleading duration',()=>{
 const s=render(parse('today: 2026-09-05\nA 2026-10-01 .. 2026-11-01 [started: 2026-12-01]'),ctx);
 assert.match(s,/data-ms="started"/);assert.doesNotMatch(s,/data-ms="start-span"/);
});
test('long and busy page sets repeat the same scale and cover all source rows',()=>{
 const m=parse('title: Six quarter programme\n'+Array.from({length:40},(_,i)=>`Lane ${i%4}: Outcome ${i} 2026-10 .. 2028-03 // Commentary ${i}`).join('\n'));
 const deck=observatoryPages(m,ctx);assert.equal(deck.complete,true);assert.ok(deck.pages.length>1);
 const keys=deck.pages.flatMap(p=>p.sourceKeys);assert.equal(keys.length,40);assert.equal(new Set(keys).size,40);
 const domains=new Set(deck.pages.map(p=>p.svg.match(/data-domain-lo="[^"]+" data-domain-hi="[^"]+"/)[0]));assert.equal(domains.size,1);
 for(const p of deck.pages){assert.match(p.svg,/width="1920" height="1080"/);assert.equal(count(p.svg,'data-today=""'),1);assert.match(p.svg,/Page \d+ of \d+/);}
 assert.match(render(m,{...ctx,intent:'presentation'}),/data-copy-field="unavailable"/);
});
test('oversized commentary continues without losing words or splitting the timing interval',()=>{
 const note=Array.from({length:400},(_,i)=>`word${i}`).join(' '),m=parse(`Long item 2026-10 .. 2027-03 // ${note}`),deck=observatoryPages(m,ctx);
 assert.equal(deck.complete,true);assert.ok(deck.pages.length>1);
 const all=deck.pages.map(p=>visible(p.svg)).join(' ');for(let i=0;i<400;i++)assert.match(all,new RegExp(`\\bword${i}\\b`));
 for(const p of deck.pages){assert.equal(count(p.svg,'data-ms="whisker"'),1);assert.match(p.svg,/data-field-p50-day="2026-10-15" data-field-p90-day="2027-03-15"/);}
});
test('all colours and configured accents retain text contrast in both themes',()=>{
 for(const dark of [false,true])for(const accent of ['#FFFFFF','#000000','#FFFF00','#315D48']){
  const c=observatoryColors({accent}, {dark});for(const name of ['ink','muted','accent'])assert.ok(chapterContrast(c[name],c.bg)>=4.5,`${name} ${dark} ${accent}`);
 }
});
test('review keeps dropped geometry, historic starts and exact date changes without state colours',()=>{
 const a=parse('A: Review 2026-10 .. 2026-11 [started: 2026-08-01]\nB: Removed 2027-03 [fixed]'),m=parse('style: review\nA: Review 2026-10-22 .. 2026-12 [started: 2026-08-24]');
 const d=timelineDiffView(timelineDiff(a,m),'September baseline'),s=render(m,ctx,d);
 for(const kind of ['p50','p90','started'])assert.match(s,new RegExp(`data-field-history="${kind}"`));
 assert.match(s,/data-dropped=""/);assert.match(visible(s),/Removed/);assert.match(visible(s),/P50 \+7 days/);assert.doesNotMatch(s,/data-field-history[^>]*data-edit=/);
 const pages=observatoryPages(m,ctx,d);assert.equal(pages.complete,true);assert.ok(pages.pages.some(p=>p.svg.includes('data-dropped=""')));
});
test('decisions gives authored lead events first without losing the other forecasts',()=>{
 const m=parse('style: decisions\nApp: Build 2026-10 .. 2026-11\nLaunch: Conference 2026-12-15 [fixed] [lead: 6w]'),L=layoutObservatory(m,ctx),s=render(m,ctx);
 assert.equal(L.rows[0].it.label,'Conference');assert.equal(L.rows.length,2);assert.match(visible(s),/Decide by 3 Nov 2026/);assert.match(s,/data-lrm/);
});
test('selection changes only the live emphasis, never export coverage or scale',()=>{
 const m=parse(src),a=render(m,ctx),b=render(m,{...ctx,selectedKey:'assurance|privacy audit'});
 assert.doesNotMatch(a,/data-selection=/);assert.match(b,/data-selection=""/);
 assert.equal(count(b,'data-field-item='),6);assert.deepEqual(observatoryPages(m,ctx),observatoryPages(m,{...ctx,selectedKey:'assurance|privacy audit'}));
});
test('authored verdicts survive; generated narration stays in the separate analysis surface',()=>{
 const m=parse('verdict: Keep the review window clear.\n'+src);assert.match(visible(render(m,ctx)),/Keep the review window clear\./);
 const s=render(parse(src),ctx);assert.doesNotMatch(visible(s),/Merge risk|Next up|Widest whisker|\d+ MILESTONES/);
 assert.match(toMarkdown(m,null,'',today),/Started/);
});
