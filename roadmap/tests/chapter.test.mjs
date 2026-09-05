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
  for(const page of set.plan.pages){const l=layoutChapter(page.model,{...ctx,slide:true,sourceModel:m});assert.ok(l.fits);assert.equal(l.height,810);for(const r of l.rows)for(const b of r.blocks)assert.ok(b.size >= (b.kind==='title' ? 20 : b.kind==='note' ? 16 : 14));}
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

test('long titles and commentary share measured continuation space in every reading region',()=>{
 const title='Reading with confidence '.repeat(18).trim(),note='Keep every reader informed about what changes and why. '.repeat(30).trim();
 for(const style of ['board','grid','focus','register'])for(const horizon of ['NOW','NEXT']){
  const m=parse(`style: ${style}\nNOW\nCore: Anchor\n${horizon}\nCore: ${title} -- ${note}`),set=renderChapterPages(m,ctx);
  assert.ok(set.complete,style+' '+horizon);
  const target=m.items.length-1;
  const fragments=[...new Map(set.plan.pages.flatMap(p=>p.model.items).filter(i=>i.export.sourceIndex===target).map(i=>[i.export.fragment?.index||0,i])).values()].sort((a,b)=>a.export.fragment.index-b.export.fragment.index);
  assert.equal(fragments.map(i=>i.export.fragment.note).join(' ').trim(),note);
  assert.equal(fragments.map(i=>i.export.fragment.title).filter(t=>t!=='Item continued').join(' ').trim(),title);
 }
});

test('quiet Horizons and Register exports use the space available before adding pages',()=>{
 const src='horizons: A, B, C, D\nA\nCore: First -- Some commentary\nCore: Second\nC\nCore: Third';
 for(const style of ['board','register']){
  const set=renderChapterPages(parse('style: '+style+'\n'+src),ctx);
  assert.equal(set.pages.length,1,style+' quiet four horizons');assert.ok(set.complete);
 }
 const eight=parse('style: register\nhorizons: A, B, C, D, E, F, G, H\nA\nOnly initiative');
 assert.equal(renderChapterPages(eight,ctx).pages.length,1,'Register collects empty horizons without spending a page on each group');
});

test('empty future-horizon pages state their planning status explicitly',()=>{
 for(const style of ['board','grid']){
  const m=parse('style: '+style+'\nhorizons: A, B, C, D, E, F, G, H\nA\nOnly initiative'),set=renderChapterPages(m,ctx);
  const empty=set.plan.pages.map((p,i)=>!p.model.items.length?set.pages[i]:null).filter(Boolean);
  assert.ok(empty.length>0,'wide horizon context is preserved');
  for(const svg of empty)assert.match(svg,/No work planned in these horizons/);
 }
});


test('Chapter omits document counts and decorative narration, retaining useful pagination',()=>{
 for(const style of ['board','grid','focus','register']){
  const m={...parse(fixture('sparse')),style};
  for(const width of [1440,390])assert.doesNotMatch(renderChapter(m,{...ctx,width}),/>\d+ (initiatives?|horizons|conditional items?)<|>Review<|Page 1 of 1/);
  assert.doesNotMatch(renderChapterPages(m,ctx).pages[0],/>\d+ initiatives?<|Page 1 of 1/);
 }
 const many=renderChapterPages({...parse(fixture('crowded')),style:'register'},ctx);
 assert.match(many.pages[0],/Page 1 of/);
});

test('six quarters use balanced export windows and a compact two-column Spotlight rail',()=>{
 const m=parse(fixture('quarterly'));
 for(const style of ['grid','board']){
  const set=renderChapterPages({...m,style},ctx);
  assert.ok(set.complete);
  assert.equal(set.pages.length,2,style+' six-quarter fixture should avoid orphan pages');
  assert.ok(set.plan.pages.every(p=>p.model.horizons.length===3),style+' keeps equal quarter widths');
 }
 const l=layoutChapter({...m,style:'focus'},ctx);
 const headings=l.sections.filter(s=>s.lens && s.rail);
 assert.equal(new Set(headings.map(s=>s.x)).size,2);
 assert.equal(headings[0].y,headings[1].y);
 assert.equal(l.rows.length,m.items.length);
 assert.ok(l.height<1500,'supporting quarters must not create a long empty featured column');
});
