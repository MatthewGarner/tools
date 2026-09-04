/* Pure Chapter paint. Live and deck use layoutChapter, never a screenshot or DOM clone. */
import {esc, btnAttrs} from '../assets/svg.js';
import {PALETTES, mix} from '../assets/series.js';
import {layoutChapter} from './chapter-layout.js';
import {exportPages, exportPageCoverage} from './export-pages.js';
import {previewableBet} from './cond-parts.js';

const e = value => esc(String(value ?? ''));
const n = value => Math.round(value * 100) / 100;
const attrs = values => Object.entries(values).filter(([,v])=>v!=null).map(([k,v])=>` ${k}="${e(v)}"`).join('');
const rect = (x,y,w,h,fill,more={}) => `<rect${attrs({x:n(x),y:n(y),width:n(w),height:n(h),fill,...more})}/>`;
const rule = (x,y,x2,y2,stroke) => `<line${attrs({x1:n(x),y1:n(y),x2:n(x2),y2:n(y2),stroke,'stroke-width':1})}/>`;
function luminance(hex){
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
export const chapterContrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
function readable(col,bg){
  if(chapterContrast(col,bg)>=4.5)return col;
  const to=chapterContrast('#111111',bg)>chapterContrast('#ffffff',bg)?'#111111':'#ffffff';
  for(let t=.05;t<=1;t+=.05){const adjusted=mix(col,to,t);if(chapterContrast(adjusted,bg)>=4.5)return adjusted;}
  return to;
}
export function chapterColors(model,ctx={}){
  const dark=!!ctx.dark;
  const accent=/^#[0-9a-f]{6}$/i.test(model.accent||'') ? model.accent : (PALETTES[model.palette] || PALETTES.ocean)[dark?'dark':'light'];
  const bg=dark?'#171A18':'#F6F3ED',ink=dark?'#F6F3ED':'#171914';
  const rail=accent,railInk=chapterContrast('#ffffff',rail)>=4.5?'#ffffff':'#111111';
  const status=dark?{doing:'#93A8FF',risk:'#D2AE5B',blocked:'#EE9B94',done:'#80BD94'}:{doing:'#1A44C2',risk:'#8E6200',blocked:'#B3403A',done:'#1C753C'};
  return {bg,ink,muted:readable(dark?'#B8BDB8':'#686B65',bg),accent:readable(accent,bg),rail,spine:rail,railInk,
    border:mix(bg,ink,.2),tint:mix(bg,accent,dark?.14:.055),band:mix(bg,accent,dark?.18:.075),
    status:Object.fromEntries(Object.entries(status).map(([k,v])=>[k,readable(v,bg)])),
    railStatus:Object.fromEntries(Object.entries(status).map(([k,v])=>[k,readable(v,rail)]))};
}
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
  s.push(rule(M,fy-20,footerW,fy-20,C.border));
  const count=ctx.sourceModel?.items.length ?? model.items.length;
  const scope=ctx.page?`Page ${ctx.page.index+1} of ${ctx.page.total}`:ctx.titlesOnly?'Titles only':`${model.horizons.length} horizons`;
  const small={family:layout.type.body,size:layout.phone?12:15,step:20,weight:400};
  const context=ctx.page?.context ? ` · ${ctx.page.context.region} repeated from page ${ctx.page.context.page}` : '';
  s.push(blockSvg({...small,lines:[`${count} initiative${count===1?'':'s'}${ctx.titlesOnly?' · Titles only':''}${context}`]},M,fy-15,C.muted));
  s.push(`<text${attrs({x:footerW,y:fy,'font-family':layout.type.body,'font-size':layout.phone?12:15,fill:C.muted,'text-anchor':'end'})}>${e(scope)}</text>`);
  s.push('</svg>');return s.join('');
}

export function renderChapterPages(model,ctx={}){
  const style=model.style||'grid';
  const layoutFor=(pageModel)=>layoutChapter(pageModel,{...ctx,slide:true,width:1440,sourceModel:model});
  const content=ctx.titlesOnly ? {...model,items:model.items.map(item=>({...item,note:''}))} : model;
  const base=exportPages(content,{style,horizonsPerPage:style==='grid'?4:3,packColumns:['board','focus','grid'].includes(style),pageUnits:1000000,
    pageGeometryFits:(items,_,horizons)=>layoutFor({...model,horizons,items}).fits,
    pageGeometryHeight:style==='register'?(items,_,horizons)=>layoutFor({...model,horizons,items}).contentBottom:undefined});
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
