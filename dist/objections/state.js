import {blankAncestry,ancestry,sourceSnapshot,derivedFrom,validateGraph,hasDescendants,ancestryMarkdown,assertPortable} from '../shared/ancestry.js?v=0.9.0';
import {validate as validateFamily,markdown as familyMarkdown} from '../family/state.js?v=0.9.0';
import {text,list,identifiers,choice} from '../creative-kit/state.js?v=0.9.0';
import {validate as validateAnswers,markdown as answersMarkdown} from '../answers/state.js?v=0.9.0';
import {validate as validateDisagreement,markdown as disagreementMarkdown,SIDE_FIELDS} from '../disagreement/state.js?v=0.9.0';
export const ENTRIES={generate:'Generate options',concerns:'Respond to concerns',reconcile:'Reconcile proposals'};
export const METHODS={first:'A first approach',refine:'Improve a part',different:'Change the mechanism',need:'Remove the need',delivery:'Change the delivery',exposure:'Limit the exposure',context:'Separate contexts',sequence:'Sequence the approaches',invent:'Invent a third mechanism'};
export const ENTRY_METHODS={generate:['first','refine','different'],concerns:['need','delivery','exposure'],reconcile:['context','sequence','invent']};
export const CONCERN_FIELDS=['objection','concern','evidence'];
export const DESIGN_FIELDS=['title','mechanism','benefit','cost','difference','assumptions','evidence','boundary','assessment','test','learn','reason','ingredients'];
export const WORK_FIELDS=['benefit','criteria','decision','test','learn'];
export {SIDE_FIELDS};
const clone=x=>structuredClone(x);
const emptySide=()=>Object.fromEntries(SIDE_FIELDS.map(f=>[f,'']));
export const concern=id=>({id,objection:'',concern:'',evidence:''});
export const design=(id,method,concerns=[])=>({id,method,concerns,protects:[],borrowed:[],origin:null,ancestry:blankAncestry(),stale:false,...Object.fromEntries(DESIGN_FIELDS.map(f=>[f,f==='title'?METHODS[method]:'']))});
export function make(id='first',example='example'){
  const w={schema:2,id,problem:'',benefit:'',concerns:[],designs:[],selected:null,entry:'generate',view:'build',comparison:[],sides:{a:emptySide(),b:emptySide()},criteria:'',decision:'',test:'',learn:'',source:null};
  if(example==='blank')return w;
  w.problem='A rehearsal tool for unfamiliar battery decisions.';w.benefit='Let people practise a consequential choice before the real moment.';w.entry='concerns';
  w.concerns=[{id:'c1',objection:'People will not make time for another training tool.',concern:'The learning benefit arrives later; the effort is needed now.',evidence:'Observe what prompts someone to practise without being told.'},{id:'c2',objection:'The simulation might create false confidence.',concern:'A simplified scenario may hide conditions that matter in operation.',evidence:'Ask users to explain the model’s limits after a rehearsal.'}];
  w.designs=[{...design('d1','delivery',['c1']),title:'Rehearsal at the point of change',mechanism:'Offer a five-minute scenario when a rule or operating condition changes.',benefit:'Practice stays tied to an imminent real choice.',cost:'Some users may still skip it when they are busy.',test:'Offer one scenario during a fictional rule change; observe voluntary completion.'}];w.comparison=['d1'];
  w.sides.a={proposal:'Make a short rehearsal part of every significant rule change.',benefit:'Everyone encounters the consequences before the real decision.',context:'The change affects a bounded group and practice time is available.',cost:'A mandatory step can delay work or become a box-ticking exercise.',evidence:'What do people notice in practice that they would otherwise miss?'};
  w.sides.b={proposal:'Offer optional rehearsal only at a person’s point of uncertainty.',benefit:'Protect attention and let the person decide when practice is useful.',context:'People recognise uncertainty and can ask for help safely.',cost:'A person may not notice the limits of their understanding.',evidence:'Which uncertain situations do people recognise without prompting?'};
  return w;
}
// Existing Objections work remains in its original storage key. Only absent schema
// means legacy; malformed schema-2 data must not be silently filled in.
function upgrade(w){
  if(w.schema!==undefined)return;
  const defaults=make(w.id,'blank');
  for(const f of ['schema','sides','criteria','decision','test','learn','source'])w[f]=clone(defaults[f]);
  w.entry='concerns';w.view='build';w.comparison=(w.designs||[]).slice(0,4).map(d=>d.id);
  for(const d of w.designs||[]){const base=design(d.id,d.method);for(const f of ['protects','borrowed','origin',...DESIGN_FIELDS.filter(f=>!['title','mechanism','benefit','cost','test'].includes(f))])d[f]=clone(base[f]);}
}
const refs=(ids,allowed,max=32)=>{list(ids,max);if(new Set(ids).size!==ids.length||ids.some(id=>!allowed.includes(id)))throw Error('A connection points to missing material.');};
export function validate(w){
  upgrade(w);if(w.schema!==2)throw Error('Unknown alternatives format.');text(w.id);text(w.problem);WORK_FIELDS.forEach(f=>text(w[f]));choice(w.entry,Object.keys(ENTRIES));choice(w.view,['build','compare']);
  list(w.concerns,12);list(w.designs,32);identifiers(w.concerns);identifiers(w.designs);w.concerns.forEach(c=>CONCERN_FIELDS.forEach(f=>text(c[f])));
  for(const side of ['a','b']){if(!w.sides?.[side])throw Error('Both positions are required.');SIDE_FIELDS.forEach(f=>text(w.sides[side][f]));}
  const ids=w.designs.map(d=>d.id);
  for(const d of w.designs){
    if(d.ingredients===undefined)d.ingredients='';if(d.origin&&d.origin.snapshot.ingredients===undefined)d.origin.snapshot.ingredients='';
    d.ancestry=ancestry(d.ancestry===undefined?(d.origin?derivedFrom([sourceSnapshot(d.origin.sourceId,d.origin.snapshot.title,snapshotFields(d.origin.snapshot))]):blankAncestry()):d.ancestry);
    choice(d.method,Object.keys(METHODS));DESIGN_FIELDS.forEach(f=>text(d[f]));refs(d.concerns,w.concerns.map(c=>c.id),12);refs(d.protects,['a','b'],2);
    if(ENTRY_METHODS.concerns.includes(d.method)&&!d.concerns.length)throw Error('A concern-led alternative needs an existing concern.');
    if(typeof d.stale!=='boolean')throw Error('Invalid review flag.');
    list(d.borrowed,31);refs(d.borrowed.map(b=>b.from),ids.filter(id=>id!==d.id),31);
    for(const b of d.borrowed){text(b.text);text(b.title);if(typeof b.stale!=='boolean')throw Error('Invalid borrowed-strength review.');}
    if(d.origin!==null){text(d.origin.sourceId);identifiers([{id:d.origin.sourceId}]);if(d.origin.sourceId===d.id)throw Error('A branch cannot be its own parent.');const s=d.origin.snapshot;choice(s.method,Object.keys(METHODS));DESIGN_FIELDS.forEach(f=>text(s[f]));list(s.concerns,12);s.concerns.forEach(c=>CONCERN_FIELDS.forEach(f=>text(c[f])));list(s.positions,2);s.positions.forEach(p=>SIDE_FIELDS.forEach(f=>text(p[f])));list(s.borrowed,31);s.borrowed.forEach(b=>{text(b.title);text(b.text);});}
  }
  if(w.selected!==null&&!ids.includes(w.selected))throw Error('Selected alternative is missing.');refs(w.comparison,ids,4);
  if(w.source!==null){choice(w.source.kind,['answers','disagreement','family']);text(w.source.workspace?.id);text(w.source.workspace?.problem);(w.source.kind==='answers'?validateAnswers:w.source.kind==='family'?validateFamily:validateDisagreement)(w.source.workspace);}
  validateGraph(w.designs);assertPortable(w);return w;
}
function get(w,id){const d=w.designs.find(d=>d.id===id);if(!d)throw Error('Alternative is missing.');return d;}
function add(w,d){w.designs.push(d);if(w.comparison.length<4)w.comparison.push(d.id);}
export function snapshot(w,d){return{method:d.method,...Object.fromEntries(DESIGN_FIELDS.map(f=>[f,d[f]])),concerns:d.concerns.map(id=>clone(w.concerns.find(c=>c.id===id))),positions:d.protects.map(id=>clone(w.sides[id])),borrowed:d.borrowed.map(b=>({title:b.title,text:b.text}))};}
export function snapshotFields(s){return [...DESIGN_FIELDS.map(f=>({label:f,text:s[f]??''})),...s.concerns.flatMap((c,i)=>CONCERN_FIELDS.map(f=>({label:`Concern ${i+1} · ${f}`,text:c[f]}))),...s.positions.flatMap((p,i)=>SIDE_FIELDS.map(f=>({label:`Position ${i+1} · ${f}`,text:p[f]}))),...s.borrowed.flatMap(b=>[{label:'Borrowed from',text:b.title},{label:'Borrowed benefit',text:b.text}])];}
export function parentSnapshot(w,d){return sourceSnapshot(d.id,d.title,[{label:'Problem at creation',text:w.problem},{label:'Benefit worth keeping',text:w.benefit},...snapshotFields(snapshot(w,d))]);}
export function apply(w,a){
  if(a.type==='edit'){
    if(a.collection==='workspace'){choice(a.field,WORK_FIELDS);w[a.field]=text(a.value);if(a.field==='benefit')w.designs.forEach(d=>d.stale=true);}
    else if(a.collection==='sides'){choice(a.item,['a','b']);choice(a.field,SIDE_FIELDS);w.sides[a.item][a.field]=text(a.value);w.designs.filter(d=>d.protects.includes(a.item)).forEach(d=>d.stale=true);}
    else{const coll=choice(a.collection,['concerns','designs']),item=w[coll].find(i=>i.id===a.item);if(!item)throw Error('Item is missing.');choice(a.field,coll==='concerns'?CONCERN_FIELDS:DESIGN_FIELDS);item[a.field]=text(a.value);
      if(coll==='concerns')w.designs.filter(d=>d.concerns.includes(item.id)).forEach(d=>d.stale=true);
      if(coll==='designs'&&['benefit','title'].includes(a.field))for(const d of w.designs)for(const b of d.borrowed)if(b.from===item.id){b.stale=true;d.stale=true;}
    }
  }else if(a.type==='entry'){w.entry=choice(a.entry,Object.keys(ENTRIES));w.view='build';}
  else if(a.type==='view')w.view=choice(a.view,['build','compare']);
  else if(a.type==='add-concern')w.concerns.push(concern(a.id));
  else if(a.type==='fork'){
    choice(a.method,Object.keys(METHODS));if(!w.concerns.some(c=>c.id===a.concern))throw Error('Concern is missing.');add(w,design(a.id,a.method,[a.concern]));
  }else if(a.type==='add-design'){
    choice(a.method,Object.keys(METHODS));if(ENTRY_METHODS.concerns.includes(a.method))throw Error('Choose the concern that opens this alternative.');const d=design(a.id,a.method);if(a.side)d.protects=[choice(a.side,['a','b'])];add(w,d);
  }else if(a.type==='branch'){
    const source=get(w,a.parent),d=clone(source);d.id=a.id;d.title=source.title+' · variation';d.reason='';d.origin={sourceId:source.id,snapshot:snapshot(w,source)};d.ancestry=derivedFrom([parentSnapshot(w,source)]);d.difference='';add(w,d);
  }else if(a.type==='combine'){
    if(!Array.isArray(a.parents)||a.parents.length!==2||a.parents[0]===a.parents[1])throw Error('Choose two different parents.');
    const parents=a.parents.map(id=>get(w,id)),d=design(a.id,'different');d.title='A combination to develop';d.ancestry=derivedFrom(parents.map(p=>parentSnapshot(w,p)));add(w,d);
  }else if(a.type==='park'){const d=get(w,a.id);d.ancestry.parked=!d.ancestry.parked;
  }else if(a.type==='link'){
    const d=get(w,a.id);if(!w.concerns.some(c=>c.id===a.concern))throw Error('Concern is missing.');if(!d.concerns.includes(a.concern)){d.concerns.push(a.concern);d.stale=true;}
  }else if(a.type==='unlink'){
    const d=get(w,a.id);if(ENTRY_METHODS.concerns.includes(d.method)&&d.concerns.length===1)throw Error('Keep the concern that explains this route.');d.concerns=d.concerns.filter(id=>id!==a.concern);d.stale=true;
  }else if(a.type==='protect'||a.type==='unprotect'){
    const d=get(w,a.id);choice(a.side,['a','b']);if(a.type==='unprotect')d.protects=d.protects.filter(x=>x!==a.side);else if(!d.protects.includes(a.side))d.protects.push(a.side);d.stale=true;
  }else if(a.type==='borrow'){
    if(a.from===a.to)throw Error('Borrow from another alternative.');const from=get(w,a.from),to=get(w,a.to),b={from:from.id,title:from.title,text:from.benefit,stale:false};const i=to.borrowed.findIndex(b=>b.from===from.id);if(i<0)to.borrowed.push(b);else to.borrowed[i]=b;to.stale=true;
  }else if(a.type==='unborrow'){const d=get(w,a.id);d.borrowed=d.borrowed.filter(b=>b.from!==a.from);d.stale=true;}
  else if(a.type==='remove-concern'){if(w.designs.some(d=>d.concerns.includes(a.id)))throw Error('This concern explains an alternative. Unlink it first.');w.concerns=w.concerns.filter(c=>c.id!==a.id);}
  else if(a.type==='remove-design'){
    if(hasDescendants(w.designs,a.id))throw Error('This alternative has descendants. Park it to retain their history.');
    if(w.designs.some(d=>d.borrowed.some(b=>b.from===a.id)))throw Error('Another alternative borrows from this one. Remove that connection first.');w.designs=w.designs.filter(d=>d.id!==a.id);w.comparison=w.comparison.filter(id=>id!==a.id);if(w.selected===a.id)w.selected=null;
  }else if(a.type==='review'){const d=get(w,a.id);d.stale=false;d.borrowed.forEach(b=>b.stale=false);}
  else if(a.type==='compare'){get(w,a.id);if(w.comparison.includes(a.id))w.comparison=w.comparison.filter(id=>id!==a.id);else{if(w.comparison.length===4)throw Error('Compare up to four at once. Remove one first; all alternatives stay on the board.');w.comparison.push(a.id);}}
  else if(a.type==='select'){get(w,a.id);w.selected=w.selected===a.id?null:a.id;}
  else if(a.type==='use-test'){const d=get(w,a.id);w.test=d.test;w.learn=d.learn;}
  else throw Error('Unknown alternatives action.');
}
const content=value=>value||'_Not written._';
export function markdown(w){
  const lines=['# Alternatives workbench','',w.problem,'','## Benefit worth keeping',content(w.benefit),''];
  if(w.concerns.length)lines.push('## Concerns','',...w.concerns.flatMap(c=>[`### ${c.objection}`,'',`Underlying concern: ${content(c.concern)}`,`Evidence or question: ${content(c.evidence)}`,'']));
  for(const side of ['a','b'])if(Object.values(w.sides[side]).some(Boolean))lines.push(`## Position ${side.toUpperCase()}`,'',...SIDE_FIELDS.flatMap(f=>[`**${f}**`,content(w.sides[side][f]),'']));
  for(const d of w.designs){lines.push(`## ${d.title}${w.selected===d.id?' · selected for a test':''}${d.stale?' · recheck context':''}`,'',`Route: ${METHODS[d.method]}`,`Addresses: ${d.concerns.map(id=>w.concerns.find(c=>c.id===id).objection).join('; ')||'No concern linked'}`,`Aims to protect: ${d.protects.map(side=>`${side.toUpperCase()}: ${w.sides[side].benefit}`).join('; ')||'No position linked'}`,'',...DESIGN_FIELDS.slice(1).flatMap(f=>[`**${f}**`,content(d[f]),'']),...d.borrowed.flatMap(b=>[`Borrowed strength from ${b.title}: ${content(b.text)}${b.stale?' (source changed; snapshot retained)':''}`,'']));lines.push(ancestryMarkdown(d.ancestry),'');}
  lines.push('## Comparison and test','',`Comparing: ${w.comparison.map(id=>get(w,id).title).join('; ')}`,...['criteria','decision','test','learn'].flatMap(f=>['',`**${f}**`,content(w[f])]));
  if(w.source)lines.push('','## Original imported workspace (unchanged snapshot)','',w.source.kind==='answers'?answersMarkdown(w.source.workspace):w.source.kind==='family'?familyMarkdown(w.source.workspace):disagreementMarkdown(w.source.workspace));
  return lines.join('\n');
}
