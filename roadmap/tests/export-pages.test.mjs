import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {exportPages, exportPageCoverage} from '../export-pages.js';

const colors = {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',accentInk:'#067',bg:'#f7f8f6',err:'#b33',
  status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
  statusInk:{done:'#1C753C',doing:'#0B709A',risk:'#8E6200',blocked:'#B3403A'}};
const measure = (text,font) => String(text || '').length * (Number(/([\d.]+)px/.exec(font)?.[1]) || 18) * .53;

/* This is the app's normal Reading roadmap, held here as an export
   composition fixture. It is complex enough to exercise notes, statuses,
   decisions and three lanes, but must still present as one 16:9 artefact. */
const READING_APP = `title: Lantern — Product Roadmap
headline: Retention first — everything in Now keeps readers reading
horizons: Now, Next, Later

NOW
Core: Resume where you left off [doing] -- the top-requested fix for a lost place
Core: Curated shelves [doing]
Growth: Referral flow [risk] -- waiting on app-store review
Platform: Sync engine rewrite -- conflicts are the #1 support driver

NEXT
Core: Reading reminders [bet: reminders] -- learn each reader's natural time of day
Growth: Home-screen widget gallery
Platform: Offline downloads

LATER
Core: Reminder personalisation [if reminders]
Core: Digest emails [unless reminders] -- the fallback nudge channel
Core: Book clubs -- small groups, shared shelves
Growth: Publisher storefront
Platform: E-reader sync`;

const many = parse(`horizons: monthly from Jan 2026 x5
Feb 2026
Core: Runs across the first boundary x3
Core: B work
Apr 2026
Core: D work x2`);

import {renderChapterPages} from '../chapter-svg.js';
import {layoutChapter} from '../chapter-layout.js';

test('export pages cover every source item across arbitrary horizon counts', () => {
  const plan = exportPages(many, {horizonsPerPage:3});
  assert.deepEqual(plan.pages.map(p => p.horizons), [['Jan 2026','Feb 2026','Mar 2026'], ['Apr 2026','May 2026']]);
  assert.equal(exportPageCoverage(plan).complete, true);
  assert.deepEqual(plan.pages.map(p => p.total), [2,2]);
});

test('a typical five-horizon roadmap remains one complete 16:9 slide', () => {
  const plan = exportPages(many);
  assert.equal(plan.pages.length, 1);
  assert.equal(exportPageCoverage(plan).complete, true);
});

test('a span crossing a page boundary is explicit on both page projections', () => {
  const [first, second] = exportPages(many, {horizonsPerPage:3}).pages;
  const start = first.model.items.find(item => item.title.startsWith('Runs'));
  const carry = second.model.items.find(item => item.title.startsWith('Runs'));
  assert.equal(start.export.continuesAfter, true);
  assert.equal(carry.export.continuesBefore, true);
  assert.equal(carry.h, 0);
  assert.equal(carry.span, 1);
});

test('a terminal span retains its end and every page knows its total', () => {
  const [, second] = exportPages(many, {horizonsPerPage:3}).pages;
  const item = second.model.items.find(entry => entry.title === 'D work');
  assert.equal(item.span, 2);
  assert.equal(item.export.sourceEnd, 4);
  assert.equal(second.index, 1);
  assert.equal(second.total, 2);
});

const styles = ['grid','board','focus','register'];
const ctx = {measure,today:'2026-09-04'};
function assertComplete(model,out){
  assert.equal(out.complete,true,model.style+' certifies complete content');
  assert.equal(exportPageCoverage(out.plan).complete,true);
  assert.ok(out.pages.length);
  out.pages.forEach((svg,index)=>{
    assert.match(svg,/^<svg[^>]*width="1920"[^>]*height="1080"/);
    assert.match(svg,new RegExp('data-chapter-layout="'+(out.plan.pages[index].dropped?'board':model.style)+'"'));
    assert.match(svg,new RegExp('Page '+(index+1)+' of '+out.pages.length));
    assert.doesNotMatch(svg,/NaN|undefined|…|\+ \d+ more/);
    const page=out.plan.pages[index];
    const geometry=layoutChapter(page.model,{...ctx,slide:true,sourceModel:page.dropped?page.model:model});
    assert.equal(geometry.fits,true);
    for(const row of geometry.rows){
      assert.ok(row.y>=0 && row.y+row.h<geometry.footerY,model.style+' row remains above footer');
      for(const block of row.blocks){
        assert.ok(block.size>=15,'slide preserves the metadata floor');
        for(const line of block.lines) assert.ok(row.x+row.pad+(block.x||0)+measure(line,block.font)<=1441,'authored text stays inside artboard');
      }
    }
  });
}

test('Chapter pages preserve every Reading roadmap item and note in every composition',()=>{
  for(const style of styles){
    const model=parse('style: '+style+'\n'+READING_APP),out=renderChapterPages(model,ctx);
    assertComplete(model,out);
    for(const [index,item] of model.items.entries()){
      const fragments=out.plan.pages.flatMap(p=>p.model.items).filter(i=>i.export.sourceIndex===index);
      assert.ok(fragments.length,item.title);
      assert.ok(out.pages.join('').includes('data-item-title="'+item.title+'"'));
      assert.equal(fragments.map(i=>i.export.fragment?.note??i.note).join(' ').replace(/\s+/g,' ').trim(),item.note||'');
    }
  }
});

test('dense work paginates before any Chapter composition crosses its footer',()=>{
  const items=Array.from({length:30},(_,i)=>`Core: Initiative ${i+1} with a fully authored long title -- Supporting commentary ${i+1}`).join('\n');
  for(const style of styles){
    const model=parse('style: '+style+'\nNOW\n'+items),out=renderChapterPages(model,ctx);
    assert.ok(out.pages.length>1);assertComplete(model,out);
  }
});

test('comparison page sets cover every dropped title and use an honest synthetic horizon',()=>{
  const dropped=Array.from({length:6},(_,i)=>Array.from({length:99},(_,j)=>`retired${i}-${j}`).join(' ')+` drop-final-${i}`);
  for(const style of styles){
    const model=parse('style: '+style+'\nNOW\nCore: Kept');
    const out=renderChapterPages(model,{...ctx,diff:{since:'Baseline',dropped,badge:()=>null,any:true}});
    assertComplete(model,out);
    assert.equal(exportPageCoverage(out.plan).comparisonSeen.size,6);
    const comparison=out.pages.filter((_,i)=>out.plan.pages[i].dropped).join('');
    assert.match(comparison,/>Changed work<\/text>/);
    assert.doesNotMatch(comparison,/>NOW<\/text>/);
    for(let i=0;i<6;i++)assert.match(comparison,new RegExp('drop-final-'+i));
  }
});

test('arbitrary horizons and cross-page spans remain exhaustive and explicit',()=>{
  for(const style of styles){
    const model={...many,style},out=renderChapterPages(model,ctx);assertComplete(model,out);
    for(const page of out.plan.pages)for(const item of page.model.items){
      if(item.export.continuesBefore)assert.match(out.pages[page.index],/Continues from/);
      if(item.export.continuesAfter)assert.match(out.pages[page.index],/Continues to/);
    }
  }
});

test('long note and title continuations retain every source grapheme exactly once',()=>{
  const title='x'.repeat(500),note=Array.from({length:900},(_,i)=>'note'+i).join(' ')+' final-note-marker';
  for(const style of styles){
    const model=parse(`style: ${style}\nNOW\nCore: ${title} -- ${note}`),out=renderChapterPages(model,ctx);assertComplete(model,out);
    const svg=out.pages.join('');
    assert.match(svg,/Item continued/);assert.match(svg,/final-note-marker/);
    assert.equal([...svg.matchAll(/>(x+)<\/text>/g)].reduce((n,m)=>n+m[1].length,0),500);
    assert.match(svg,/Item part 2 of/);
  }
});

test('moderate frame copy leaves a complete reading band',()=>{
  const title='A roadmap title that retains its final source words';
  const headline='The narrative carries the meeting through several complete lines';
  const story='A comparison story explains the decision without silently cutting the final words';
  for(const style of styles){
    const model=parse(`style: ${style}\ntitle: ${title}\nheadline: ${headline}\nstory: ${story}\nNOW\nCore: Kept`);
    const out=renderChapterPages(model,{...ctx,diff:{since:'Baseline',any:true,badge:()=>null,dropped:[]}});
    assert.equal(out.complete,true);
    const visible=out.pages.join('').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    for(const text of [title,headline,story])assert.ok(visible.includes(text),text);
  }
});

test('an indivisible frame with no reading band refuses to certify a complete export',()=>{
  const title=Array.from({length:1000},(_,i)=>'frame'+i).join(' ');
  for(const style of styles){
    const out=renderChapterPages(parse(`style: ${style}\ntitle: ${title}\nNOW\nCore: Kept`),ctx);
    assert.equal(out.complete,false);assert.equal(exportPageCoverage(out.plan).complete,false);
  }
});

test('long authored horizon and lane labels remain complete in slide sets',()=>{
  const horizon=Array.from({length:24},(_,i)=>'horizon-marker-'+String(i+1).padStart(2,'0')).join(' ');
  const lane=Array.from({length:18},(_,i)=>'lane-marker-'+String(i+1).padStart(2,'0')).join(' ');
  for(const style of styles){
    const model=parse(`style: ${style}\nhorizons: ${horizon}, Two, Three\n${horizon}\n${lane}: Kept`);
    const out=renderChapterPages(model,ctx);assertComplete(model,out);
    const text=out.pages.join('').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    for(const marker of [...horizon.split(' '),...lane.split(' ')])assert.ok(text.includes(marker),style+' '+marker);
  }
});
