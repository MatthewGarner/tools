/* Behavioral migration from the retired renderers. Chapter may compose these
   facts differently, but an authored claim, condition or edit route cannot vanish. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {renderChapter,renderChapterPages} from '../chapter-svg.js';
import {layoutChapter} from '../chapter-layout.js';
import {registerOutcomeGroups,betChain} from '../cond-parts.js';
const styles=['board','grid','focus','register'];
const ctx={today:'2026-09-04'};
const visible=s=>s.replace(/<desc>[\s\S]*?<\/desc>|<title>[\s\S]*?<\/title>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const source='title: Plan\nheadline: Keep the habit\nNOW\nCore: First [doing] -- Read every day\nNEXT\nGrowth: Second [risk]\nLATER\nThird';

test('each Chapter composition retains authored headline, dates, notes and live edit identities',()=>{
  for(const style of styles)for(const width of [1440,360]){
    const m=parse('style: '+style+'\n'+source),svg=renderChapter(m,{...ctx,width,edit:true});
    for(const phrase of ['Keep the habit','Read every day','2026-09-04'])assert.ok(visible(svg).includes(phrase));
    for(const item of m.items){
      assert.ok(svg.includes('data-item-title="'+item.title+'"'));
      assert.match(svg,new RegExp('data-line="'+item.srcLine+'" data-edit="cardmenu"'));
    }
    assert.match(svg,/data-edit="note"/);assert.match(svg,/data-edit="status"/);
    if(width===1440 && style!=='grid')assert.match(svg,/data-edit="lane"/);assert.match(svg,/data-edit="headline"/);
    const exported=renderChapter(m,{...ctx,width});
    assert.doesNotMatch(exported,/data-edit=|data-hit=|data-whatif=|data-menu=/);
  }
});

test('empty fields retain a card-menu route and every horizon remains directly addable',()=>{
  for(const style of styles){
    const m=parse(`style: ${style}\nNOW\nBare item\nNEXT\nLATER`),svg=renderChapter(m,{...ctx,edit:true});
    assert.match(svg,/data-edit="cardmenu"/);
    assert.match(svg,/data-line="2"/);
    for(const [h,name] of m.horizons.entries()){
      assert.match(svg,new RegExp(style==='grid'?'data-cell="'+h+'\\|':'data-hdrop="'+h+'"'));
      assert.ok(svg.includes('data-col="'+name+'"'),'add targets retain original horizon');
    }
    assert.ok(svg.indexOf(style==='grid'?'data-cell=':'data-hdrop=')<svg.indexOf('data-edit="cardmenu"'),'drop targets sit under the cards');
  }
});

test('status and conditional outcomes remain explicit on every live and exported composition',()=>{
  const src='NOW\nRoot [bet: root lost]\nGate [bet: gate] [if root]\nRider [if gate]\nFallback [unless root] [doing]';
  for(const style of styles){
    const m=parse('style: '+style+'\n'+src);
    for(const svg of [renderChapter(m,{...ctx,edit:true}),renderChapter(m,{...ctx,width:360}),renderChapterPages(m,ctx).pages.join('')]){
      assert.match(svg,/never ran/);assert.match(svg,/not needed/);
      assert.match(svg,/text-decoration="line-through"/);assert.match(svg,/In progress/);
      assert.doesNotMatch(svg,/✓|✗|\u00a0/);
    }
  }
});

test('what-if targets are sibling controls for unresolved text bets, with coarse pointer semantics',()=>{
  for(const style of styles){
    const m=parse(`style: ${style}\nNOW\nRoot [bet: root]\nNEXT\nRider [if root]`);
    const fine=renderChapter(m,{...ctx,edit:true});
    assert.match(fine,/<\/g><rect[^>]*data-whatif="root"[^>]*role="button"[^>]*tabindex="0"/);
    const coarse=renderChapter(m,{...ctx,edit:true,coarse:true});
    const hit=coarse.match(/<rect[^>]*data-whatif="root"[^>]*>/)?.[0];
    assert.ok(hit);assert.doesNotMatch(hit,/role=|tabindex=|aria-label=/);
    assert.doesNotMatch(renderChapter(parse(`style: ${style}\nNOW\nRoot [bet: root won]`),{...ctx,edit:true}),/data-whatif=/);
  }
});

test('span tracks preserve source order, reuse disjoint space and never overlap occupied intervals',()=>{
  const m=parse('style: grid\nhorizons: monthly from Jan 2026 x5\nJan 2026\nCore: Wide x3\nCore: Short\nFeb 2026\nCore: Middle x2\nApr 2026\nCore: Late x2');
  const l=layoutChapter(m,ctx),rows=l.rows;
  assert.equal(rows.length,4);
  const named=Object.fromEntries(rows.map(r=>[r.item.title,r]));
  assert.ok(named.Short.y>named.Wide.y,'same-start source order');
  assert.equal(named.Late.y,named.Wide.y,'disjoint span uses first free track');
  for(const [i,a] of rows.entries())for(const b of rows.slice(i+1)){
    const overlaps=a.item.h<=b.item.h+b.item.span-1&&b.item.h<=a.item.h+a.item.span-1;
    if(overlaps)assert.ok(a.y+a.h<=b.y||b.y+b.h<=a.y);
  }
  const svg=renderChapter(m,{...ctx,edit:true});
  assert.equal((svg.match(/data-span-edge="l"/g)||[]).length,4);
  assert.equal((svg.match(/data-span-edge="r"/g)||[]).length,4);
});

test('Paths provenance is visible and dated in each live and export composition',()=>{
  const basis='basis: paths "Growth & retention"; answered pricing=yes@2026-08-03; assumed groups=no@2026-08-12';
  for(const style of styles){
    const m=parse(`style: ${style}\n${basis}\nNOW\nCore: Work`);
    for(const svg of [renderChapter(m,ctx),renderChapter(m,{...ctx,width:360}),renderChapterPages(m,ctx).pages.join('')]){
      const text=visible(svg);assert.match(text,/Delivery projection.*From Paths/);
      assert.match(text,/Growth &amp; retention/);assert.match(text,/Known:/);assert.match(text,/Assumed:/);
      assert.match(text,/pricing.*yes.*2026-08-03/);assert.match(text,/groups.*no.*2026-08-12/);
      const desc=svg.match(/<desc>([\s\S]*?)<\/desc>/)?.[1];
      assert.ok(desc?.includes('pricing')&&desc.includes('2026-08-03')&&desc.includes('groups')&&desc.includes('2026-08-12'));
    }
    assert.doesNotMatch(visible(renderChapter(parse('NOW\nWork'),ctx)),/Delivery projection|Known:|Assumed:/);
  }
});

test('authored verdict reaches Chapter slides and off suppresses the claim',()=>{
  const claim='We ship the reader experience first';
  for(const style of styles){
    const base=`style: ${style}\nwip: 1\nNOW\nA\nB`;
    assert.ok(visible(renderChapterPages(parse('verdict: '+claim+'\n'+base),ctx).pages.join('')).includes(claim));
    assert.doesNotMatch(visible(renderChapterPages(parse('verdict: off\n'+base),ctx).pages.join('')),/the WIP limit is the first thing this plan breaks/);
  }
});

test('live comparisons carry every dropped title alongside the baseline and change badges',()=>{
  for(const style of styles){
    const svg=renderChapter(parse('style: '+style+'\n'+source),{...ctx,diff:{any:true,since:'July baseline',dropped:['Removed path','Retired experiment'],badge:()=>({label:'New',kind:'new'})}});
    const text=visible(svg);
    for(const fact of ['July baseline','Removed path','Retired experiment','New'])assert.ok(text.includes(fact),style+' '+fact);
  }
});

test('phone time grid distinguishes carried work from an empty horizon',()=>{
  const m=parse('style: grid\nhorizons: monthly from Jan 2026 x3\nJan 2026\nCore: Ongoing work x3');
  const text=visible(renderChapter(m,{...ctx,width:360}));
  assert.match(text,/Also running/i);assert.doesNotMatch(text,/No work planned/);
});

test('Register outcome grouping retains resolved, done and cyclic semantics',()=>{
  const m=parse('style: register\ngroup: outcome\nNOW\nRoot [bet: root won]\nResolved [if root]\nDone [done] [unless root]\nAlpha [bet: alpha] [if beta]\nBeta [bet: beta] [if alpha]\nDropped [unless root]');
  const groups=registerOutcomeGroups(m,m.items);
  for(const width of [1440,360]){
    const geometry=layoutChapter(m,{...ctx,width});
    for(const group of groups)assert.ok(geometry.sections.some(s=>s.name.toLowerCase().includes(group.label.toLowerCase())),group.label);
    assert.doesNotMatch(renderChapter(m,{...ctx,width,edit:true}),/data-hdrop=|data-edit="additem"/);
  }
});

test('Spotlight retains the full root-first dependency chain for conditional work',()=>{
  const m=parse('style: focus\nNOW\nRoot [bet: root won]\nGate [bet: gate] [if root]\nRider [if gate]');
  assert.equal(betChain(m,m.items[2]).length,2);
  const text=visible(renderChapter(m,ctx));
  assert.match(text,/Hinges on/i);assert.match(text,/root.*paid off/i);assert.match(text,/gate.*open/i);
});

test('linked and ghost items preserve safe links without inventing ghost edit targets',()=>{
  for(const style of styles){
    const model=parse(`style: ${style}\nNOW\nCore: Linked -> https://example.com/?a=1&b=2\nCore: Placeholder`);
    model.items[1].ghost=true;
    const svg=renderChapter(model,{...ctx,edit:true});
    assert.match(svg,/<a href="https:\/\/example.com\/\?a=1&amp;b=2" target="_blank" rel="noopener">/);
    const ghost=svg.match(/<g[^>]*data-item-title="Placeholder"[^>]*>([\s\S]*?)<\/g>/)?.[0];
    assert.ok(ghost);assert.doesNotMatch(ghost,/data-edit=|data-hit=|data-menu=/);
  }
});

test('comparison story is authored context and only appears with an active comparison',()=>{
  for(const style of styles){
    const model=parse(`style: ${style}\nstory: We chose depth over breadth\nNOW\nCore: Kept`);
    assert.doesNotMatch(visible(renderChapter(model,ctx)),/We chose depth over breadth/);
    const diff={any:true,since:'Baseline',dropped:[],badge:()=>null};
    for(const svg of [renderChapter(model,{...ctx,diff}),renderChapterPages(model,{...ctx,diff}).pages.join('')])
      assert.match(visible(svg),/We chose depth over breadth/);
  }
});

test('an off-board span names its true end year in every composition',()=>{
  for(const style of styles){
    const model=parse(`style: ${style}\nhorizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: Infrastructure x6`);
    assert.equal(model.items[0].spanEnd,'Q4 2027','fixture extends beyond this four-quarter board');
    for(const [surface,svg] of [['desktop',renderChapter(model,ctx)],['phone',renderChapter(model,{...ctx,width:360})],['slides',renderChapterPages(model,ctx).pages.join('')]])
      assert.match(visible(svg),/Q4 2027/,style+' '+surface+' must not imply the work ends at the visible board boundary');
  }
});


test('coarse Chapter cards offer complete field menus without tiny nested edit targets',()=>{
  for(const style of styles){
    const model=parse('style: '+style+'\n'+source);
    const svg=renderChapter(model,{...ctx,width:390,edit:true,coarse:true});
    assert.doesNotMatch(svg,/data-edit="(?:title|note|status|lane)"/);
    assert.match(svg,/data-title-raw="First" data-note-raw="Read every day" data-status-raw="doing" data-lane-raw="Core"/);
    const controls=[...svg.matchAll(/<rect[^>]*data-edit="additem"[^>]*>/g)].map(m=>m[0]);
    assert.equal(controls.length,model.horizons.length);
    assert.ok(controls.every(control=>+control.match(/height="([^"]+)"/)[1]>=44),'every add target is finger sized');
    const live=layoutChapter(model,{...ctx,width:390,edit:true,coarse:true});
    for(const zone of live.dropzones){
      const next=live.rows.filter(r=>r.y>=zone.y+zone.h).sort((a,b)=>a.y-b.y)[0];
      if(next)assert.ok(next.y>=zone.y+zone.h+44,'the add target cannot cover later work');
    }
  }
});
