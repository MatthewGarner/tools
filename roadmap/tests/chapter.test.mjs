import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {setConfigKey, setLane} from '../edit-targets.js';
import {roadmapToMarkdown, markdownToRoadmapDsl} from '../markdown.js';
import {layoutChapter,chapterDatePosition,chapterNativeWidth} from '../chapter-layout.js';
import {renderChapter,renderChapterPages,chapterColors,chapterContrast} from '../chapter-svg.js';
const fixture=name=>readFileSync(new URL('./fixtures/chapter-'+name+'.txt',import.meta.url),'utf8');
// Approximation exercises pure layout; browser verification uses the loaded fonts.
const measure=(s,f)=>s.length * (+f.match(/([\d.]+)px/)[1]) * .48;
const ctx={measure,today:'2026-09-04'};
test('font is a document setting, editable and portable through Markdown',()=>{
 const src=fixture('sparse');
 const m=parse(setConfigKey(src,'font','dm sans'));
 assert.equal(m.font,'DM Sans');assert.equal(m.items.length,6);
 assert.equal(parse(markdownToRoadmapDsl(roadmapToMarkdown(m))).font,'DM Sans');
 assert.equal(parse('font: missing\nNOW\nOne').font,'Chapter');
 assert.match(parse('font: missing\nNOW\nOne').warnings.join(' '),/unknown font/);
 assert.equal(setLane(src,parse(src).items[0].srcLine,'font'),src);
});
test('Chapter preserves notes and edit targets in all four layouts and phone views',()=>{
 const source=parse(fixture('sparse'));
 for(const style of ['board','focus','register','grid'])for(const width of [1440,360]){
  const m={...source,style}; const l=layoutChapter(m,{...ctx,width});
  assert.equal(l.rows.length,6,style+' '+width);
  for(const item of m.items){const r=l.rows.find(r=>r.item.srcLine===item.srcLine);assert.ok(r);if(item.note)assert.equal(r.blocks.find(b=>b.kind==='note')?.text,item.note);}
  const svg=renderChapter(m,{...ctx,width,edit:true});
  assert.match(svg,/data-edit="title"/);assert.match(svg,/data-edit="note"/);
  assert.match(svg,/data-chapter-layout=/);assert.doesNotMatch(svg,/NaN|undefined/);
 }
});
test('complete slides retain every note fragment and every item at readable type sizes',()=>{
 const source=parse(fixture('crowded'));
 source.items[2].note='A long explanation of the review dependency. '.repeat(35).trim();
 for(const style of ['board','focus','register','grid']){
  const m={...source,style};const set=renderChapterPages(m,ctx);
  assert.ok(set.complete,style);assert.ok(set.pages.length>1);
  for(let i=0;i<m.items.length;i++){
   const fragments=set.plan.pages.flatMap(p=>p.model.items).filter(it=>it.export.sourceIndex===i);
   assert.ok(fragments.length);
   const ordered=[...new Map(fragments.map(it=>[it.export.fragment?.index??0,it])).values()].sort((a,b)=>(a.export.fragment?.index??0)-(b.export.fragment?.index??0));
   const note=ordered.map(it=>it.export.fragment?.note??it.note).join(' ').trim();
   assert.equal(note,m.items[i].note,style+' note '+i);
  }
  for(const page of set.plan.pages){const l=layoutChapter(page.model,{...ctx,slide:true,sourceModel:m});assert.ok(l.fits);assert.equal(l.height,810);for(const r of l.rows)for(const b of r.blocks)assert.ok(b.size>=15);}
 }
});
test('overlapping spans occupy separate tracks and retain proportional width',()=>{
 const m=parse('style: grid\nhorizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: Long x3\nCore: Short\nQ4 2026\nCore: Other');
 const l=layoutChapter(m,ctx);const [long,short]=['Long','Short'].map(t=>l.rows.find(r=>r.item.title===t));
 assert.notEqual(long.y,short.y);assert.ok(Math.abs((long.w+20)/(short.w+20)-3)<.001);
});
test('arbitrary accents preserve foreground and semantic status contrast',()=>{
 for(const accent of ['#ffffff','#000000','#ffff00','#254C3D','#663B59','#00ff00'])for(const dark of [false,true]){
  const c=chapterColors({accent},{dark});
  for(const foreground of [c.ink,c.muted,c.accent,...Object.values(c.status)])assert.ok(chapterContrast(foreground,c.bg)>=4.5,accent);
  for(const foreground of [c.railInk,...Object.values(c.railStatus)])assert.ok(chapterContrast(foreground,c.rail)>=4.5,accent);
 }
});
test('hostile text survives safely in every Chapter view and export',()=>{
 const m=parse('title: A <tag> & "quote"\nNOW\nCore: Test <script>alert(1)</script> -- Safe & complete');
 for(const style of ['board','focus','register','grid']){
  const svg=renderChapter({...m,style},{...ctx,edit:true});assert.match(svg,/&lt;script&gt;/);assert.doesNotMatch(svg,/<script>/);
 }
});

test('calendar marker uses elapsed calendar time and wide plans retain readable columns',()=>{
 const model=parse('horizons: quarterly from Q3 2026 x8\nQ3 2026\nCore: Delivery x2');
 const marker=chapterDatePosition(model,'2026-09-04');
 assert.equal(marker.index,0);assert.ok(Math.abs(marker.fraction-65/92)<1e-9);
 assert.equal(chapterDatePosition(model,'2025-09-04'),null);
 assert.equal(chapterDatePosition(parse('NOW\nOne'),'2026-09-04'),null);
 assert.ok(chapterNativeWidth(model)>3000);
 const svg=renderChapter(model,{...ctx,today:'2026-09-04'});assert.match(svg,/Today · 4 Sep/);
 assert.doesNotMatch(renderChapter({...model,dateStr:'off'},{...ctx,today:'2026-09-04'}),/Today ·/);
});

test('titles-only export does not paginate commentary that was explicitly omitted',()=>{
 const model=parse('style: board\nNOW\nOne -- '+ 'Long commentary. '.repeat(160));
 const out=renderChapterPages(model,{...ctx,titlesOnly:true});
 assert.ok(out.complete);assert.equal(out.pages.length,1);
 assert.equal(out.plan.pages.flatMap(p=>p.model.items).length,1);
 assert.doesNotMatch(out.pages.join(''),/Long commentary|Item continued/);
});
