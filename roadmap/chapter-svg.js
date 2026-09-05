/* Pure Chapter paint. Live and deck use layoutChapter, never a screenshot or DOM clone. */
import {esc, btnAttrs} from '../assets/svg.js';
import {mix} from '../assets/series.js';
import {layoutChapter} from './chapter-layout.js';
import {exportPages, exportPageCoverage} from './export-pages.js';
import {previewableBet} from './cond-parts.js';

const e = value => esc(String(value ?? ''));
const n = value => Math.round(value * 100) / 100;
const attrs = values => Object.entries(values).filter(([,v])=>v!=null).map(([k,v])=>` ${k}="${e(v)}"`).join('');
const rect = (x,y,w,h,fill,more={}) => `<rect${attrs({x:n(x),y:n(y),width:n(w),height:n(h),fill,...more})}/>`;
const rule = (x,y,x2,y2,stroke) => `<line${attrs({x1:n(x),y1:n(y),x2:n(x2),y2:n(y2),stroke,'stroke-width':1})}/>`;
import {chapterColors} from './chapter-colors.js';
export {chapterColors, chapterContrast} from './chapter-colors.js';
function blockSvg(block,x,y,fill,extra={}){
  return block.lines.map((line,index)=>`<text${attrs({x:n(x),y:n(y+block.size+index*block.step),'font-family':block.family,'font-size':block.size,'font-weight':block.weight,fill,...(index===0?extra:{})})}>${e(line)}</text>`).join('');
}
function editAttrs(kind,item,label,raw){
  return {'data-edit':kind,'data-line':item.srcLine,'data-raw':raw??item[kind]??'',role:'button',tabindex:0,'aria-label':label};
}
export function renderChapter(model,ctx={}){
  const layout=ctx.layout || layoutChapter(model,ctx),C=chapterColors(model,ctx);
  const {width:W,height:H,margin:M}=layout;
  const slide=!!ctx.slide,scale=slide?4/3:1;
  const s=[`<svg xmlns="http://www.w3.org/2000/svg"${attrs({width:n(W*scale),height:n(H*scale),viewBox:`0 0 ${W} ${H}`,'font-family':layout.type.body,'data-chapter-layout':layout.style,'data-min-readable-scale':layout.phone?1:.7,'data-board-layout':layout.style==='board'?(layout.phone?'phone':'wide'):null,'data-register-layout':layout.style==='register'?(layout.phone?'phone':'wide'):null,'data-focus-layout':layout.style==='focus'?(layout.phone?'phone':'wide'):null})}>`,
    `<title>${e(model.title||'Roadmap')}</title>`,
    `<desc>${e(model.headline||'')} ${e(model.basis?JSON.stringify(model.basis):'')}</desc>`,rect(0,0,W,H,C.bg)];
  for(const p of layout.panels)s.push(rect(p.x,p.y,p.w,p.h,C[p.role]));
  for(const l of layout.lines)s.push(rule(l.x,l.y,l.x2,l.y2,C[l.role]||C.border));
  if(ctx.edit)for(const z of layout.dropzones){
    const data=layout.style==='grid'?{'data-cell':`${z.horizon}|${z.lane||''}`}:{'data-hdrop':z.horizon};
    s.push(rect(z.x,z.y,z.w,z.h,'transparent',data));
  }
  for(const b of layout.header)s.push(blockSvg(b,b.x,b.y,C[b.role]||C.ink,ctx.edit&&b.edit?{'data-edit':b.edit,'data-line':-1,'data-raw':model.headline,role:'button',tabindex:0,'aria-label':'Edit the headline'}:{}));
  for(const section of layout.sections){
    const ink=section.rail?C.railInk:C[section.role]||C.ink;
    const extra=ctx.edit&&section.lens?{'data-lens':section.name,role:'button',tabindex:0,'aria-label':'Focus on '+section.name}:{};
    if(extra['data-lens'])s.push(`<g${attrs(extra)}>${rect(section.x,section.y,section.w,Math.max(44,section.label.lines.length*section.label.step),'transparent')}`);
    s.push(blockSvg(section.label,section.x,section.y,ink));
    if(extra['data-lens'])s.push('</g>');
    if(section.hint)s.push(blockSvg(section.hint,section.x,section.y+section.label.lines.length*section.label.step+4,ink));
    if(!section.small && layout.style!=='grid')s.push(rule(section.x,section.y+section.h-12,section.x+section.w,section.y+section.h-12,section.rail?mix(C.rail,C.railInk,.3):C.border));
  }
  for(const row of layout.rows){
    const item=row.item, edit=ctx.edit&&!item.ghost;
    s.push(`<g${attrs({'data-key':item.title.toLowerCase().replace(/\s+/g,' ').trim(),'data-line':edit?item.srcLine:null,'data-edit':edit?'cardmenu':null,'data-menu':edit?'':null,'data-title-raw':edit?item.title:null,'data-note-raw':edit?item.note:null,'data-status-raw':edit?item.status:null,'data-lane-raw':edit?item.lane:null,'data-source-index':item.export?.sourceIndex,'data-context':item.export?.repeatedContext?'repeated':null,'data-item-title':item.title,'data-world-state':item.worldState||'live'})}${edit?btnAttrs('More options: '+item.title):''}>`);
    // Dropped work stays editable. Transparent paint preserves the whole-card
    // hit area; fill="none" makes its padding invisible to pointer hit testing.
    if(layout.style==='grid'&&!layout.phone)s.push(rect(row.x,row.y,row.w,row.h,item.worldState==='dropped'?'transparent':C.band,
      {'data-hit':edit?'':null,stroke:item.cond?C.accent:'none','stroke-dasharray':item.cond?'5 5':null}));
    else s.push(rect(row.x,row.y,row.w,row.h,'transparent',{'data-hit':edit?'':null}));
    for(const b of row.blocks){
      const ink=row.rail?C.railInk:C.ink;
      const colour=b.kind==='status'?(row.rail?C.railStatus:C.status)[b.status]||ink:b.kind==='title'?ink:row.rail?C.railInk:C.muted;
      const kinds=['title','note','status','lane'];
      const label=b.kind==='title'?'Rename: ':b.kind==='note'?'Edit note: ':b.kind==='lane'?'Edit lane: ':'Change status: ';
      const extra=edit&&!ctx.coarse&&kinds.includes(b.kind)?editAttrs(b.kind,item,label+item.title):{};
      if(b.kind==='title'&&(item.worldState==='dropped'||item.export?.dropped))extra['text-decoration']='line-through';
      if(b.kind==='title'&&item.url)s.push(`<a href="${e(item.url)}" target="_blank" rel="noopener">`);
      s.push(blockSvg(b,row.x+row.pad+(b.x||0),row.y+b.y,colour,extra));
      if(b.kind==='title'&&item.url)s.push('</a>');
    }
    if(layout.style!=='grid'||layout.phone)s.push(rule(row.x,row.y+row.h,row.x+row.w,row.y+row.h,row.rail?mix(C.rail,C.railInk,.28):C.border));
    s.push('</g>');
    if(edit&&layout.style==='grid'&&!layout.phone&&model.timeAxis){
      for(const [side,x] of [['l',row.x],['r',row.x+row.w-10]])s.push(rect(x,row.y,10,row.h,'transparent',{'data-span-edge':side,'data-line':item.srcLine}));
    }
    const bet=edit&&previewableBet(ctx.textBets||model.bets,item);
    if(bet){
      const label=row.blocks.find(b=>b.kind==='condition');
      if(label)s.push(rect(row.x+row.pad+(label.x||0),row.y+label.y,Math.max(0,row.w-row.pad*2-(label.x||0)),label.lines.length*label.step,'transparent',{'data-whatif':bet,...(!ctx.coarse?{role:'button',tabindex:0,'aria-label':`what-if: ${bet} pays off / doesn't — cycles`}:{})}));
    }
  }
  if(ctx.edit){
    for(const z of layout.dropzones){
      const y=z.y+z.h;
      const label='Add item to '+(z.lane?z.lane+' ':'')+model.horizons[z.horizon];
      s.push(`<g data-add-control="" opacity="0"><rect${attrs({x:z.x,y,width:z.w,height:44,fill:'transparent',...editAttrs('additem',{srcLine:-1},label,''),'data-col':model.horizons[z.horizon],'data-lane':z.lane||''})}/><text${attrs({x:z.x+4,y:y+28,'font-size':14,fill:C.accent})}>Add item</text></g>`);
    }
  }
  const fy=layout.footerY;
  const rail=layout.panels.find(p=>p.role==='rail');
  const footerW=(rail?rail.x:W)-(layout.style==='register'&&!layout.phone?48:M);
  const scope=ctx.page?.total>1?`Page ${ctx.page.index+1} of ${ctx.page.total}`:'';
  const small={family:layout.type.body,size:layout.phone?12:15,step:20,weight:400};
  const context=[ctx.page?.progression,ctx.page?.parts>1 ? `Continued · ${ctx.page.part+1} of ${ctx.page.parts}` : ''].filter(Boolean).join(' · ');
  const detail=[ctx.titlesOnly?'Titles only':'',context].filter(Boolean).join(' · ');
  if(detail)s.push(blockSvg({...small,lines:[detail]},M,fy-15,C.muted));
  if(scope)s.push(`<text${attrs({x:footerW,y:fy,'font-family':layout.type.body,'font-size':layout.phone?12:15,fill:C.muted,'text-anchor':'end'})}>${e(scope)}</text>`);
  s.push('</svg>');return s.join('');
}

export function renderChapterPages(model,ctx={}){
  // Candidate plans repeatedly measure the same authored text at the same type
  // sizes. Keep the cache local to this render, so font loads and edits cannot
  // reuse stale geometry or make theme grouping block the UI on native metrics.
  if(ctx.measure){
    const measure=ctx.measure, widths=new Map();
    ctx={...ctx,measure:(text,font)=>{
      const key=JSON.stringify([font,text]);
      if(!widths.has(key))widths.set(key,measure(text,font));
      return widths.get(key);
    }};
  }
  const style=model.style||'grid';
  const layoutFor=(pageModel)=>layoutChapter(pageModel,{...ctx,slide:true,width:1440,sourceModel:model});
  const content=ctx.titlesOnly ? {...model,items:model.items.map(item=>({...item,note:''}))} : model;
  let horizonsPerPage=['grid','board'].includes(style)?4:style==='register'?model.horizons.length:3;
  if(style==='board'){
    // Quiet five-column plans may fit at the same type floor. Dense plans
    // compare wider columns and smaller theme groups below.
    const count=Math.min(5,model.horizons.length);
    const first={...content,horizons:content.horizons.slice(0,count),items:content.items.filter(i=>i.h<count)};
    if(count>3 && layoutFor(first).fits)horizonsPerPage=count;
  }
  // Equal temporal windows avoid a narrow final page that exaggerates duration:
  // six quarters become two three-quarter windows, rather than four then two.
  if(style==='board'||style==='grid')horizonsPerPage=Math.ceil(model.horizons.length/Math.ceil(model.horizons.length/horizonsPerPage));
  const planFor = (count,stableThemes=true) => exportPages(content,{style,horizonsPerPage:count,stableThemes,groupThemes:['board','grid'].includes(style),
    pageGeometryFits:(items,_,horizons,options={})=>layoutFor({...model,horizons,items,...options,...(options.lanes?{exportLanes:options.lanes}:{})}).fits,
    pageGeometryHeight:(items,_,horizons,options={})=>layoutFor({...model,horizons,items,...options,...(options.lanes?{exportLanes:options.lanes}:{})}).contentBottom});
  let base=planFor(horizonsPerPage);
  if(['board','grid'].includes(style) && base.pages.length>1){
    // Compare whole, balanced time-window plans. A narrower window can fit more
    // themes without reducing type or forcing arbitrary item slices.
    const sizes=[...new Set([horizonsPerPage,3,2,1].map(n=>Math.ceil(model.horizons.length/Math.ceil(model.horizons.length/n))))];
    const score=plan=>[exportPageCoverage(plan).complete?0:1,plan.pages.length,
      plan.pages.reduce((sum,p)=>sum+p.model.items.length,0),new Set(plan.pages.map(p=>p.start)).size];
    const better=(a,b)=>{const left=score(a),right=score(b);for(let i=0;i<left.length;i++)if(left[i]!==right[i])return left[i]<right[i];return false;};
    for(const stableThemes of [true,false])for(const size of sizes){

      const candidate=planFor(size,stableThemes);
      if(better(candidate,base))base=candidate;
    }
  }
  // Compare dropped work is explicit content, not an omission from the current plan.
  const dropped=ctx.diff?.dropped||[];
  let pages=base.pages;
  if(dropped.length){
    const dm={...model,style:'board',horizons:['Changed work'],lanes:[''],items:dropped.map((title,index)=>({title,lane:'',h:0,span:1,status:null,note:'',srcLine:-1-index,export:{dropped:true}}))};
    const dp=exportPages(dm,{pageUnits:1000000,style:'board',pageGeometryFits:(items)=>layoutChapter({...dm,items},{...ctx,slide:true,width:1440,sourceModel:dm}).fits});
    pages=[...pages,...dp.pages.map(p=>({...p,dropped:true,comparisonItemIndices:p.sourceItemIndices,sourceItemIndices:[]}))];
  }
  const plan={...base,comparisonSourceItemCount:dropped.length,pages:pages.map((p,index)=>({...p,index,total:pages.length}))};
  const rendered=plan.pages.map(page=>renderChapter(page.model,{...ctx,sourceModel:page.dropped?page.model:model,slide:true,width:1440,page}));
  return {plan,pages:rendered,complete:exportPageCoverage(plan).complete};
}
