/* A deck is a measured reading projection of the authored Case. Every field is
   carried into a text block; continuations spend pages rather than shrink type. */
import {resolveTypography} from '../roadmap/chapter-fonts.js';

export const CASE_SLIDE = Object.freeze({width:1600,height:900,margin:72,top:142,bottom:794});
const graphemes = text => typeof Intl?.Segmenter === 'function'
  ? [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(p=>p.segment) : Array.from(text);
const fallbackMeasure = (text,font) => graphemes(String(text)).reduce((n,ch)=>n+(/\s/.test(ch)?.33:/[ilI.,'!:;]/.test(ch)?.3:/[MW@#%]/.test(ch)?.95:/[^\u0000-\u024f]/.test(ch)?1:.6),0)*(+font.match(/([\d.]+)px/)?.[1]||24);
const present = value => value !== null && value !== undefined && String(value).trim() !== '';
const valueText = value => Array.isArray(value) ? value.map(valueText).join('; ') : typeof value === 'object' && value ? Object.entries(value).map(([k,v])=>`${k}: ${valueText(v)}`).join('; ') : String(value ?? '');
export function caseTypography(model={}) {
  return resolveTypography({...model,font:/^(dm[ -]sans)$/i.test(model.font||'')?'DM Sans':'Chapter'});
}
export function wrapCaseText(value,width,font,measure=fallbackMeasure) {
  const lines=[];
  for(const paragraph of String(value ?? '').split(/\r?\n/)) {
    if(!paragraph){lines.push('');continue;}
    let line='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate=line?`${line} ${word}`:word;
      if(measure(candidate,font)<=width){line=candidate;continue;}
      if(line){lines.push(line);line='';}
      if(measure(word,font)<=width){line=word;continue;}
      // Unbroken identifiers, CJK copy and URLs obey the same geometry contract.
      for(const char of graphemes(word)) {
        if(line && measure(line+char,font)>width){lines.push(line);line='';}
        line+=char;
      }
    }
    if(line)lines.push(line);
  }
  return lines.length?lines:[''];
}
export function abbreviateCaseText(text,width,font,measure=fallbackMeasure) {
  if(measure(text,font)<=width)return text;
  let out='';
  for(const ch of graphemes(text)){if(measure(out+ch+'…',font)>width)break;out+=ch;}
  return out+'…';
}
export function caseLinkLabel(value) {
  try{const u=new URL(value,'https://tools.matthewgarner.me');return u.hostname+u.pathname+(u.hash?' · linked state':'');}
  catch{return String(value);}
}
function field(key,label,value,extra={}) {return present(value)?{key,label,text:valueText(value),...extra}:null;}
const planningContext = item => item?.planningContext || item?.reference?.planningContext || item?.planning;
const matchesExhibit = (claim,exhibit) => claim.legacy && (Number.isInteger(claim.srcLine) && claim.srcLine === exhibit.srcLine || claim.url === exhibit.url && claim.label === exhibit.label);
function planningFields(planning,key) {
  if(!planning)return [];
  return [field(key+'.role','Model role',planning.role),field(key+'.scope','Scope',planning.scope),field(key+'.known','Recorded answers',planning.basis?.known),field(key+'.assumed','Planning assumptions',planning.basis?.assumed),field(key+'.source','From Paths',planning.basis?.source)].filter(Boolean);
}
export function caseDeckRecords(model) {
  const authoredClaims=(model.claims||[]).map((claim,i)=>({claim,i})).filter(({claim})=>!(model.exhibits||[]).some(exhibit=>matchesExhibit(claim,exhibit)));
  const claims=authoredClaims.map(({claim,i})=>({key:`claim.${i}`,label:claim.label||claim.id||`Claim ${i+1}`,fields:[
    field(`claim.${i}.basis`,'Basis',claim.basis),field(`claim.${i}.detail`,'Argument',claim.detail),field(`claim.${i}.qualification`,'Qualification',claim.qualification),field(`claim.${i}.assumptions`,'Assumptions',claim.assumptions),field(`claim.${i}.url`,'Exhibit',claim.url?caseLinkLabel(claim.url):'',{href:claim.url}),field(`claim.${i}.captureQualification`,'Reference qualification',claim.captureQualification),...planningFields(planningContext(claim),`claim.${i}.planning`),
  ].filter(Boolean)}));
  const options=(model.options||[]).map((option,i)=>({key:`option.${i}`,label:option.label||option.id||`Option ${i+1}`,fields:[
    field(`option.${i}.value`,'Value',option.value),field(`option.${i}.requires`,'Requires',option.requires),field(`option.${i}.downside`,'Downside',option.downside),field(`option.${i}.reconsider`,'Reconsider when',option.reconsider),
  ].filter(Boolean)}));
  const reviews=(model.reviews||[]).map((review,i)=>({key:`review.${i}`,label:review.label||review.id||`Review ${i+1}`,fields:[
    field(`review.${i}.date`,'Date',review.date),field(`review.${i}.change`,'What changed',review.change),field(`review.${i}.implication`,'Implication',review.implication),field(`review.${i}.decision`,'Decision',review.decision),field(`review.${i}.previous`,'Previous review',/^(https?:\/\/|\/)/.test(review.previous||'')?caseLinkLabel(review.previous):review.previous,{href:/^(https?:\/\/|\/)/.test(review.previous||'')?review.previous:undefined}),field(`review.${i}.url`,'Exhibit',review.url?caseLinkLabel(review.url):'',{href:review.url}),
  ].filter(Boolean)}));
  const exhibits=(model.exhibits||[]).map((exhibit,i)=>({key:`exhibit.${i}`,label:exhibit.label||`Exhibit ${i+1}`,fields:[
    field(`exhibit.${i}.lane`,'Group',exhibit.lane),field(`exhibit.${i}.tool`,'Tool',exhibit.tool),field(`exhibit.${i}.note`,'Reading',exhibit.note),field(`exhibit.${i}.url`,'Open model',exhibit.url?caseLinkLabel(exhibit.url):'',{href:exhibit.url}),field(`exhibit.${i}.captureQualification`,'Reference qualification',exhibit.captureQualification||(model.claims||[]).find(claim=>matchesExhibit(claim,exhibit))?.captureQualification),...planningFields(planningContext(exhibit)||planningContext((model.claims||[]).find(claim=>matchesExhibit(claim,exhibit))),`exhibit.${i}.planning`),
  ].filter(Boolean)}));
  return {claims,options,reviews,exhibits};
}

export function exportCasePages(model,ctx={}) {
  const type=caseTypography(model),measure=ctx.measure||fallbackMeasure;
  const {width,height,margin,top,bottom}=CASE_SLIDE;
  const pages=[],coverage=new Set();
  const makePage=(section,continued=false)=>{const page={section,title:section,index:pages.length,width,height,blocks:[],rules:[],continued,geometryComplete:true};pages.push(page);return page;};
  const font=(size,weight=400,family=type.body)=>`${weight} ${size}px "${family}"`;
  const block=(text,x,y,w,{size=24,weight=400,family=type.body,role='ink',key,href,step=Math.ceil(size*1.32)}={})=>({text,lines:wrapCaseText(text,w,font(size,weight,family),measure),x,y,w,size,step,weight,family,role,key,href});
  const put=(page,b)=>{page.blocks.push(b);if(b.key)coverage.add(b.key);return b.y+b.lines.length*b.step;};
  // A single field may span several slides. Its continuation carries a visible
  // source label and identical key, so neither completeness nor attribution is inferred.
  function flowFields(fields,{x,w,page,y=top,continuedPage}) {
    for(const f of fields.filter(Boolean)) {
      const size=f.size||24,weight=f.weight||400,family=f.display?type.display:type.body;
      let lines=wrapCaseText(f.text,w,font(size,weight,family),measure),part=0;
      while(lines.length) {
        const label=f.label?(part?`${f.label} · continued`:f.label):part?'Continued':'';
        const labelHeight=label?25:0,step=Math.ceil(size*1.32);
        if(bottom-y<labelHeight+step+12){page=continuedPage();y=top;}
        if(label){put(page,block(label.toUpperCase(),x,y,w,{size:15,weight:600,role:'muted',key:f.key+'.label'}));y+=labelHeight;}
        const capacity=Math.max(1,Math.floor((bottom-y-12)/step));
        const chunk=lines.splice(0,capacity);
        const b=block('',x,y,w,{size,weight,family,role:f.role||'ink',key:f.key,href:f.href});b.lines=chunk;b.text=chunk.join('\n');
        y=put(page,b)+20;
        if(lines.length){page=continuedPage();y=top;part++;}
      }
    }
    return {page,y};
  }
  const overview=makePage('Decision review');
  const overviewFields=[
    field('title','',model.title||'Untitled Case',{display:!model.headline,size:model.headline?20:56,role:model.headline?'accent':'ink'}),
    field('headline','',model.headline,{display:true,size:64}),
    field('question','Question',model.question,{size:25}),
    field('decision','Authorised',model.decision,{size:30}),
    field('verdict',model.decision?'Judgment':'Decision',model.verdict==='off'?'':model.verdict,{size:28}),
    field('unresolved','Still open',model.unresolved),
    field('constraints','Hard constraints',model.constraints),
    field('reconsider','Reconsider when',model.reconsider),
  ];
  const railFields=[field('status','Status',model.status),field('owner','Decision owner',model.owner),field('date','Decision date',model.date),field('reviewBy','Review by',model.reviewBy)];
  const overviewPages=[overview];
  const newOverview=()=>{const p=makePage('Decision review',true);overviewPages.push(p);return p;};
  let left=flowFields(overviewFields,{section:'Decision review',x:margin,w:970,page:overview,continuedPage:newOverview});
  let railIndex=0;
  const nextRail=()=>overviewPages[++railIndex]||newOverview();
  flowFields(railFields,{section:'Decision review',x:1120,w:408,page:overview,continuedPage:nextRail});
  for(const p of overviewPages)p.rules.push({x:1080,y:top,x2:1080,y2:bottom,role:'border'});
  const records=caseDeckRecords(model);
  // Small legacy Cases earn one deliberate overview, without an empty appendix.
  const quiet=!records.claims.length&&!records.options.length&&!records.reviews.length&&records.exhibits.length<=2&&overviewPages.length===1;
  if(quiet&&records.exhibits.length) {
    const fields=records.exhibits.flatMap(r=>[field(r.key+'.label','Exhibit',r.label,{size:24,weight:600}),...r.fields]);
    const required=fields.reduce((sum,f)=>sum+(f.label?25:0)+wrapCaseText(f.text,970,font(f.size||24,f.weight||400),measure).length*Math.ceil((f.size||24)*1.32)+20,0);
    if(left.y+required<=bottom){left=flowFields(fields,{x:margin,w:970,page:overview,y:left.y,continuedPage:newOverview});records.exhibits=[];}
  }
  function addRecords(section,rows) {
    if(!rows.length)return;
    let page=makePage(section),y=top;
    for(const row of rows) {
      const labelLines=wrapCaseText(row.label,350,font(34,type.displayWeight,type.display),measure);
      const titleHeight=labelLines.length*45;
      const proseHeight=row.fields.reduce((sum,f)=>sum+(f.label?25:0)+wrapCaseText(f.text,1044,font(f.size||24,f.weight||400),measure).length*Math.ceil((f.size||24)*1.32)+20,0)-20;
      const rowHeight=Math.max(titleHeight,proseHeight);
      // Keep a record together when it fits a fresh page. Only intrinsically
      // long records split, preventing an orphan source link on the next slide.
      if((rowHeight<=bottom-top && y+rowHeight>bottom)||y+Math.min(titleHeight,120)+90>bottom){page=makePage(section,true);y=top;}
      const startPage=page;
      // Record titles use the same split mechanism as prose, including pathological
      // long labels. Normal labels own a stable left rail beside the argument.
      const labelResult=flowFields([field(row.key+'.label','',row.label,{display:true,size:34,weight:type.displayWeight})],{x:margin,w:350,page,y,continuedPage:()=>makePage(section,true)});
      const labelPages=pages.slice(startPage.index,labelResult.page.index+1);let fieldPageIndex=0;
      const nextRecordPage=()=>labelPages[++fieldPageIndex]||makePage(section,true);
      const result=flowFields(row.fields,{x:484,w:1044,page:startPage,y,continuedPage:nextRecordPage});
      const endIndex=Math.max(result.page.index,labelResult.page.index);
      for(let i=startPage.index;i<=endIndex;i++) {
        const p=pages[i];p.rules.push({x:margin,y:i===startPage.index?y-16:top-16,x2:width-margin,y2:i===startPage.index?y-16:top-16,role:'border'});
        if(i>startPage.index && !p.blocks.some(b=>b.key===row.key+'.label')){
          put(p,block(abbreviateCaseText(row.label,350,font(24),measure),margin,top,350,{size:24,key:row.key+'.context',role:'muted'}));
          put(p,block('CONTINUED',margin,top+42,350,{size:15,role:'muted'}));
        }
      }
      page=pages[endIndex];
      y=Math.max(result.page.index===endIndex?result.y:top,labelResult.page.index===endIndex?labelResult.y:top)+26;
    }
  }
  addRecords('The argument',records.claims);
  // A compact choice set earns a single comparison slide. Long or numerous
  // alternatives retain the complete record flow rather than smaller type.
  const options=records.options,columns=[];
  if(options.length>=2&&options.length<=3){
    const gap=32,w=(width-2*margin-gap*(options.length-1))/options.length;
    for(const [i,row] of options.entries()){
      const x=margin+i*(w+gap);let y=top;const blocks=[];
      const add=b=>{blocks.push(b);y=b.y+b.lines.length*b.step+20;};
      add(block(row.label,x,y,w,{size:34,family:type.display,weight:type.displayWeight,key:row.key+'.label'}));
      for(const f of row.fields){
        if(f.label){add(block(f.label.toUpperCase(),x,y,w,{size:15,weight:600,role:'muted',key:f.key+'.label'}));y-=15;}
        add(block(f.text,x,y,w,{size:f.size||24,key:f.key,href:f.href}));
      }
      columns.push(blocks);
    }
  }
  if(columns.length&&columns.every(bs=>bs.every(b=>b.y+b.lines.length*b.step<=bottom))){
    const page=makePage('Alternatives');
    for(const [i,bs] of columns.entries()){for(const b of bs)put(page,b);if(i)page.rules.push({x:bs[0].x-16,y:top,x2:bs[0].x-16,y2:bottom,role:'border'});}
  }else addRecords('Alternatives',options);
  addRecords('Decision history',records.reviews);
  addRecords('Supporting exhibits',records.exhibits);
  for(const page of pages){
    page.total=pages.length;
    page.sourceTitle=abbreviateCaseText(model.title||'Untitled Case',930,font(16),measure);
    page.geometryComplete=page.blocks.every(b=>b.y+b.lines.length*b.step<=bottom&&b.x>=margin&&b.x+b.w<=width-margin&&b.lines.every(line=>measure(line,font(b.size,b.weight,b.family))<=b.w+0.01));
  }
  return {sourceModel:model,pages,coverage,complete:pages.every(p=>p.geometryComplete),type};
}
