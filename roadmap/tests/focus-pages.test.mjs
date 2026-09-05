import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {renderChapterPages} from '../chapter-svg.js';
import {layoutChapter} from '../chapter-layout.js';
import {exportPageCoverage} from '../export-pages.js';
const ctx={today:'2026-09-04'};
function verify(model,out){
  assert.equal(out.complete,true);
  assert.equal(exportPageCoverage(out.plan).complete,true);
  const seen=new Set(),horizons=new Set();
  for(const [index,page] of out.plan.pages.entries()){
    if(index===0)assert.equal(page.model.focus,model.focus,'the chosen horizon leads the deck');
    assert.equal(page.model.focus,model.horizons[page.focusHeroIndex]);
    assert.equal(page.model.items.some(i=>i.export.repeatedContext),false,'exhausted content is never repeated');
    const geometry=layoutChapter(page.model,{...ctx,sourceModel:model,slide:true});
    assert.equal(geometry.fits,true,'every paired hero and rail fits');
    for(const row of geometry.rows){assert.ok(row.y+row.h<geometry.footerY);for(const block of row.blocks)assert.ok(block.size >= (block.kind==='title' ? 20 : block.kind==='note' ? 16 : 14));}
    page.horizonIndices.forEach(h=>horizons.add(h));
    page.sourceItemIndices.forEach(i=>seen.add(i));
  }
  assert.equal(seen.size,model.items.length);
  assert.equal(horizons.size,model.horizons.length);
}

test('eight Spotlight horizons lead with a selected late hero then advance through supporting work',()=>{
  const model=parse('style: focus\nfocus: H7\nhorizons: H1, H2, H3, H4, H5, H6, H7, H8\n'+Array.from({length:8},(_,i)=>`H${i+1}\nCore: Work ${i+1} -- Commentary ${i+1}`).join('\n'));
  const out=renderChapterPages(model,ctx);verify(model,out);
  assert.ok(out.pages.length>=2&&out.pages.length<=4,'eight ordinary horizons deserve a compact slide set');
  for(const [index,item]of model.items.entries()){
    const owned=out.plan.pages.flatMap(p=>p.model.items).filter(i=>i.export.sourceIndex===index&&!i.export.repeatedContext);
    assert.equal(owned.length,1,'authored work appears once outside labelled context');
    assert.equal(owned[0].note,item.note);
  }
});

test('empty supporting horizons earn bounded context pages rather than overflow',()=>{
  const model=parse('style: focus\nfocus: H7\nhorizons: H1, H2, H3, H4, H5, H6, H7, H8\nH7\nCore: Featured work');
  const out=renderChapterPages(model,ctx);verify(model,out);assert.ok(out.pages.length<=3);
  assert.ok(out.pages.every(svg=>svg.includes('No work planned')));
});

test('hero and rail paginate independently without multiplying long commentary pages',()=>{
  const note=Array.from({length:180},(_,i)=>'note'+String(i).padStart(3,'0')).join(' ');
  const model=parse('style: focus\nfocus: Jul 2026\nhorizons: monthly from Jan 2026 x8\nJan 2026\nCore: Across the year x8 -- Span commentary\nFeb 2026\nCore: February work\nMar 2026\nCore: March work\nApr 2026\nCore: April work\nMay 2026\nCore: May work\nJun 2026\nCore: June work\nJul 2026\nCore: Featured narrative -- '+note+'\nCore: Next featured item -- Keep hero source order\nAug 2026\nCore: August work -- '+note);
  const out=renderChapterPages(model,ctx);verify(model,out);
  assert.ok(out.pages.length<=7,'hero and rail capacity combine rather than multiply');
  for(const [index,item]of model.items.entries()){
    const owned=out.plan.pages.flatMap(p=>p.model.items).filter(i=>i.export.sourceIndex===index&&!i.export.repeatedContext);
    assert.equal(owned.map(i=>i.export.fragment?.note??i.note).join(' ').replace(/\s+/g,' ').trim(),item.note||'');
  }
  const text=out.pages.join('').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  assert.match(text,/Runs Jan 2026 — Aug 2026/);
  const sources=out.plan.pages.flatMap(p=>p.model.items.filter(i=>!i.export.repeatedContext&&i.export.sourceStart===6));
  assert.ok(sources.findIndex(i=>i.title==='Next featured item')>sources.findLastIndex(i=>i.title==='Featured narrative'),'source order inside the hero survives pagination');
});

test('six and seven horizons use the same bounded Spotlight context windows',()=>{
  for(const count of [6,7]){
    const horizons=Array.from({length:count},(_,i)=>'H'+(i+1));
    const model=parse(`style: focus\nfocus: H${count-1}\nhorizons: ${horizons.join(', ')}\n`+horizons.map(h=>h+'\nCore: Work '+h).join('\n'));
    const out=renderChapterPages(model,ctx);verify(model,out);assert.ok(out.pages.length<=3);
  }
});

test('maximal supported Paths basis plus an ordinary headline leaves a Spotlight reading band',()=>{
  const keys=Array.from({length:8},(_,i)=>'k'+i+'-'+'x'.repeat(29)+'=yes@2026-08-12');
  const source=`style: focus\nheadline: Keep the next release moving\nbasis: paths "${'S'.repeat(80)}"; answered ${keys.slice(0,4).join(', ')}; assumed ${keys.slice(4).join(', ')}\nNOW\nCore: Work`;
  const model=parse(source);assert.ok(model.basis);
  assert.equal(model.basis.answered.length+model.basis.assumed.length,8);
  const out=renderChapterPages(model,ctx);assert.equal(out.complete,true);
  assert.equal(out.pages.length,1);
  assert.ok(layoutChapter(out.plan.pages[0].model,{...ctx,slide:true,sourceModel:model}).fits);
});
