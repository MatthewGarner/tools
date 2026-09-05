import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCaseDeck} from '../deck-svg.js';
import {exportCasePages,wrapCaseText,CASE_SLIDE} from '../export-pages.js';

const measure=(text,font)=>Array.from(text).length*(+font.match(/([\d.]+)px/)[1])*.62;
const ctx={measure};
const base={title:'Morrow — paid tier',question:'Launch now or learn first?',status:'decided',headline:'Buy the learning before the launch.',decision:'Authorise a £10k pilot.',unresolved:'Broad rollout remains open.',owner:'Product lead',date:'2026-09-05',reviewBy:'2026-11-02',reconsider:'Pilot cost exceeds £13.6k.',constraints:'No permanent customer migration.',verdict:'A reversible pilot earns its cost under these assumptions.',
  claims:[{id:'pilot',label:'The pilot has a narrow advantage',basis:'model',detail:'£16.6k for learning against £13k for launch.',qualification:'This is conditional expected value, not an observed result.',assumptions:'Prior viability 30%; sensitivity and specificity 80%.',url:'https://tools.matthewgarner.me/tree/#exact-model'}],
  options:[{id:'launch',label:'Launch now',value:'£13k expected contribution.',requires:'Prior viability remains 30%.',downside:'£50k downside if demand is weak.',reconsider:'Pilot exceeds its £13.6k cost threshold.'},{id:'pilot',label:'Run a pilot',value:'£16.6k expected contribution.',requires:'An informative signal.',downside:'Delay and test cost.',reconsider:'The experiment cannot discriminate demand.'}],
  reviews:[{id:'cost',label:'Cost review',date:'2026-09-12',change:'Cost increased to £14k.',implication:'Pilot no longer leads.',decision:'Reopen the launch decision.',previous:'Original authorisation',url:'https://tools.matthewgarner.me/tree/#revised-model'}],
  exhibits:[{label:'Original economic model',lane:'Economics',tool:'fermi',note:'Conditional cash flow; no evidence of demand.',url:'https://tools.matthewgarner.me/fermi/#original'}],
};
const clean = text => text.replace(/\s+/g,'');
function fieldContent(plan,key){return plan.pages.flatMap(p=>p.blocks).filter(b=>b.key===key).flatMap(b=>b.lines).join('');}
function assertGeometry(plan){
  assert.equal(plan.complete,true,'every page reports complete geometry');
  for(const page of plan.pages)for(const b of page.blocks){
    assert.ok(b.y+b.lines.length*b.step<=CASE_SLIDE.bottom,`${b.key} crosses footer on page ${page.index+1}`);
    assert.ok(b.lines.every(line=>measure(line,`${b.weight} ${b.size}px "${b.family}"`)<=b.w+.01),`${b.key} overflows width`);
    assert.ok(b.size>=15,'type remains readable');
  }
}
test('quiet Case is one composed slide, including a small legacy exhibit',()=>{
  const deck=buildCaseDeck({title:'Approve the test',question:'Is this useful?',decision:'Run one reversible pilot',exhibits:[{label:'Model',url:'/tree/#abc'}]},ctx);
  assert.equal(deck.pages.length,1);
  assert.match(deck.pages[0].svg,/width="1600" height="900"/);
  assert.match(deck.pages[0].svg,/href="https:\/\/tools.matthewgarner.me\/tree\/#abc"/);
  assert.match(deck.pages[0].svg,/data-source-url="\/tree\/#abc"/);
  assertGeometry(deck);
});
test('review deck retains authored decisions, qualifications, alternatives and original exhibits',()=>{
  const plan=buildCaseDeck(base,ctx);
  assertGeometry(plan);
  for(const key of ['title','headline','question','decision','verdict','unresolved','owner','date','reviewBy','constraints','reconsider'])assert.equal(clean(fieldContent(plan,key)),clean(base[key]),key);
  for(const [plural,singular] of [['claims','claim'],['options','option'],['reviews','review'],['exhibits','exhibit']])for(const [index,item] of base[plural].entries())for(const [key,value] of Object.entries(item)){
    if(['id','url'].includes(key))continue;
    assert.equal(clean(fieldContent(plan,`${singular}.${index}.${key}`)),clean(value),`${singular}.${index}.${key}`);
  }
  const svg=plan.pages.map(p=>p.svg).join('');
  for(const url of [base.claims[0].url,base.reviews[0].url,base.exhibits[0].url])assert.ok(svg.includes(`href="${url}"`),url);
  assert.equal(plan.pages.filter(p=>p.section==='Alternatives').length,1,'normal comparison remains a single slide');
  assert.ok(!svg.includes('captured state'),'links are not labelled as verified captures');
});
test('long fields continue at fixed type size without losing source identity or text',()=>{
  const long={...base,title:'Very long decision '.repeat(90),constraints:'Mandatory boundary '.repeat(200),owner:'Owner name '.repeat(180),claims:[{...base.claims[0],label:'A deliberately long authored claim '.repeat(60),qualification:'QUALIFICATION '.repeat(300),assumptions:'依存関係を確認する'.repeat(150),detail:'W'.repeat(1600)}]};
  const plan=buildCaseDeck(long,ctx);assertGeometry(plan);
  assert.ok(plan.pages.length>8);
  for(const [key,value] of [['title',long.title],['constraints',long.constraints],['owner',long.owner],['claim.0.label',long.claims[0].label],['claim.0.qualification',long.claims[0].qualification],['claim.0.assumptions',long.claims[0].assumptions],['claim.0.detail',long.claims[0].detail]])assert.equal(clean(fieldContent(plan,key)),clean(value),key);
  assert.ok(plan.pages.some(p=>p.continued));
  assert.equal(plan.pages.flatMap(p=>p.blocks).find(b=>b.key==='claim.0.qualification').size,24);
});
test('a dense review retains every item and every exact source link',()=>{
  const dense={...base,claims:Array.from({length:24},(_,i)=>({...base.claims[0],id:`claim-${i}`,label:`Claim ${i+1}`,url:`https://tools.matthewgarner.me/tree/#model-${i}`,qualification:base.claims[0].qualification.repeat(4)})),reviews:Array.from({length:14},(_,i)=>({...base.reviews[0],label:`Review ${i+1}`}))};
  const plan=buildCaseDeck(dense,ctx);assertGeometry(plan);
  for(let i=0;i<24;i++){assert.equal(fieldContent(plan,`claim.${i}.label`),`Claim ${i+1}`);assert.ok(plan.pages.some(p=>p.svg.includes(`href="https://tools.matthewgarner.me/tree/#model-${i}"`)));}
  for(let i=0;i<14;i++)assert.equal(fieldContent(plan,`review.${i}.label`),`Review ${i+1}`);
});
test('font, theme and accent are respected, SVG markup is escaped, unsafe links never activate',()=>{
  const deck=buildCaseDeck({...base,font:'dm-sans',theme:'dark',accent:'#A34456',claims:[{label:'<script>',detail:'A & B',url:'javascript:alert(1)'}]},{...ctx,fontCSS:'@font-face{font-family:"DM Sans";}'});
  const svg=deck.pages.map(p=>p.svg).join('');
  assert.ok(!svg.includes('font-family="Instrument Serif"'));
  assert.match(svg,/fill="#171A18"/);assert.match(svg,/data-chapter-fonts="embedded"/);
  assert.match(svg,/&lt;script&gt;/);assert.match(svg,/A &amp; B/);
  assert.ok(!svg.includes('href="javascript:'));
});
test('unbroken and multi-codepoint text wraps without dropping characters',()=>{
  for(const value of ['W'.repeat(600),'👩🏽‍💻'.repeat(80),'漢字'.repeat(300)])assert.equal(wrapCaseText(value,300,'400 24px "DM Sans"',measure).join(''),value);
});

test('projected legacy claims export once and retain inspected Paths planning assumptions',()=>{
  const planning={role:'Delivery projection',scope:'One exact Paths outcome',basis:{source:'Lantern — invitation decision',known:[{key:'measurement',direction:'yes',date:'2026-09-05'}],assumed:[{key:'value',direction:'yes',date:'2026-09-07'}]}};
  const exhibit={label:'Conditional delivery',note:'Assumed scenario, not an approved rollout.',url:'https://tools.matthewgarner.me/roadmap/#abc',srcLine:7};
  for(const extra of [{planningContext:planning},{reference:{planningContext:planning}},{planning}]){
    const model={title:'Lantern',exhibits:[exhibit],claims:[{label:'Authored reason',detail:'Retained value matters.',srcLine:3},{...exhibit,legacy:true,detail:exhibit.note,...extra,captureQualification:'URL inputs preserved; the owning tool interprets the model.'}]};
    const plan=buildCaseDeck(model,ctx);assertGeometry(plan);
    const labels=plan.pages.flatMap(p=>p.blocks).filter(b=>b.key?.endsWith('.label')&&clean(b.lines.join(''))===clean(exhibit.label));
    assert.equal(labels.length,1,'legacy exhibit has one record, not an argument plus a register copy');
    assert.equal(fieldContent(plan,'claim.0.detail'),'Retained value matters.');
    assert.equal(fieldContent(plan,'claim.1.detail'),'','projected legacy reason is not repeated');
    assert.equal(fieldContent(plan,'exhibit.0.planning.source'),planning.basis.source);
    assert.match(fieldContent(plan,'exhibit.0.planning.known'),/measurement.*yes.*2026-09-05/);
    assert.match(fieldContent(plan,'exhibit.0.planning.assumed'),/value.*yes.*2026-09-07/);
    assert.equal(fieldContent(plan,'exhibit.0.captureQualification'),model.claims[1].captureQualification);
    const sourceBlock=plan.pages.flatMap(p=>p.blocks).find(b=>b.key==='exhibit.0.planning.source');
    assert.equal(sourceBlock.href,undefined,'Paths title is not a URL');
    const svg=plan.pages.map(p=>p.svg).join('');assert.ok(!svg.includes('tools.matthewgarner.me/Lantern'));
  }
});

test('long previous-review URLs remain compact while preserving their exact link',()=>{
  const previous='https://tools.matthewgarner.me/case/#'+ 'z'.repeat(12000);
  const plan=buildCaseDeck({title:'Review',reviews:[{label:'Cost changed',date:'2026-09-12',change:'Pilot cost is now £14k.',previous}]},ctx);
  assertGeometry(plan);
  assert.equal(plan.pages.length,2,'URL bytes do not create continuation slides');
  assert.equal(fieldContent(plan,'review.0.previous'),'tools.matthewgarner.me/case/ · linked state');
  assert.ok(plan.pages[1].svg.includes(`href="${previous}"`));
});

test('compact alternatives share one comparison slide with distinct columns',()=>{
 const plan=buildCaseDeck({...base,options:[...base.options,{label:'Defer',value:'£0 incremental contribution',requires:'Accept the cost of waiting',downside:'No new learning',reconsider:'New evidence becomes available'}]},ctx);
 const labels=plan.pages.flatMap(p=>p.blocks.filter(b=>/^option\.\d+\.label$/.test(b.key)).map(b=>({x:b.x,page:p.index})));
 assert.equal(new Set(labels.map(b=>b.page)).size,1);
 assert.equal(new Set(labels.map(b=>b.x)).size,3,'alternatives are compared side by side');
 assertGeometry(plan);
});


test('explicit verdict off stays out of the deck',()=>{
 const plan=buildCaseDeck({...base,verdict:'off'},ctx);
 assert.equal(fieldContent(plan,'verdict'),'');
 assert.equal(fieldContent(plan,'decision'),base.decision);
});
