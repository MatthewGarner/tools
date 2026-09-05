/* Source owns the review. Inspection and export preview never change it. */
import {parse, classifyReference, CONFIG_KEYS} from './parse.js';
import {project, inspectReview, inspectReference} from './review-model.js';
import {renderReview, reviewColors, reviewTypography} from './render.js';
import {buildCaseDeck} from './deck-svg.js';
import {createEditor} from './editor.js';
import {setConfig, setBlockField, appendBlock, editLabel, editNote} from './edit-targets.js';
import {EXAMPLES, DEFAULT_TEXT} from './examples.js';
import {STARTER} from './starter.js';
import {readHashState, writeHashState, decodeHash} from '../assets/series.js';
import {measure, renderWarningList, download, svgToCanvas, pngRasterPlan, slugify} from '../assets/app-common.js';
import {initWorkspace, mountTouchUndo} from '../assets/workspace.js';
import {debounced} from '../assets/schedule.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {loadChapterFonts, embedChapterFonts} from '../roadmap/chapter-font-loader.js';
import {createSlideZip} from '../roadmap/export-zip.js';
import {mountActionIcons, actionIcon} from '../assets/action-icons.js';
import {wireSyntaxTry} from '../assets/syntax-try.js';
import {esc} from '../assets/svg.js';

const $=id=>document.getElementById(id),e=v=>esc(String(v??''));
let model=null,selected='',revision=0,hashTimer,ready=false,editing=null,replacement=null,deck=null,deckSource='',deckSlug='case',pageIndex=0,oversize=false;
const status=message=>$('appstatus').textContent=message;
const dark=()=>model?.theme==='dark'||(model?.theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
const ctx=()=>({dark:dark(),measure,width:$('preview').clientWidth||960});
const editor=createEditor({parent:$('cmhost'),doc:'',onChange:debounced(refresh,120)});
const ws=initWorkspace({workspace:$('workspace'),tab:$('railtab'),preview:$('preview'),zoomHost:$('zoomctl'),initialCollapsed:true,onCollapseChange(){scheduleHash();}});
mountTouchUndo(document.querySelector('.actions'),editor);
mountActionIcons();
wireSyntaxTry(document.querySelector('.syntax'),editor,CONFIG_KEYS);
const slug=()=>slugify(model?.title||'case');
function scheduleHash(){clearTimeout(hashTimer);hashTimer=setTimeout(writeHash,400);}
async function writeHash(){
  if(!shouldPersist())return false;
  const ok=await writeHashState({t:editor.getText(),...(ws.collapsed()?{e:0}:{})},24000);
  oversize=!ok;warnings();return ok;
}
function warnings(){renderWarningList($('warns'),[...(model?.warnings||[]),...(oversize?['This Case exceeds the link limit. The URL has not been updated; save the complete source instead.']:[])]);}
function chooseDefault(){
  const kind=model.view==='compare'?'option':model.view==='review'?'review':'claim';
  const entries=model[kind==='claim'?'claims':kind==='option'?'options':'reviews']||[];
  if(!entries.some(v=>selected===kind+':'+v.id))selected=entries.length?kind+':'+entries[0].id:'';
}
function current(){const [kind,id]=selected.split(':');return {kind,item:(model?.[kind==='option'?'options':kind==='review'?'reviews':'claims']||[]).find(v=>v.id===id)};}
function appearance(){
  if(model.theme==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=model.theme;
  const c=reviewColors(model,ctx()),type=reviewTypography(model),root=document.documentElement;
  for(const [name,value] of Object.entries({bg:c.bg,ink:c.ink,muted:c.muted,accent:c.accent,border:c.border,tint:c.tint,onaccent:c.railInk}))root.style.setProperty('--case-'+name,value);
  root.style.setProperty('--case-display',`"${type.display}"`);
  for(const [name,value] of Object.entries({bg:c.bg,ink:c.ink,muted:c.muted,card:c.bg,border:c.border,accent:c.accent,'accent-ink':c.accent}))root.style.setProperty('--'+name,value);
  $('font').value=model.font||'chapter';$('theme').value=model.theme||'system';$('palette').value=model.palette||'';$('accent').value=model.accent||c.rail;
}
function paint(){
  if(!model||!ready)return;
  const focused=document.activeElement?.dataset,focusKey=focused?.kind?focused.kind+':'+focused.id:null;
  chooseDefault();appearance();
  $('preview').innerHTML=renderReview(model,ctx(),{live:true,selected});
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===model.view)));
  $('addentry').textContent=model.view==='compare'?'Add alternative':model.view==='review'?'Record review':'Add reason';
  paintInspector();warnings();
  if(focusKey)[...$('preview').querySelectorAll('[data-kind]')].find(el=>el.dataset.kind+':'+el.dataset.id===focusKey)?.focus({preventScroll:true});
}
async function refresh(){
  const source=editor.getText(),turn=++revision;
  model=project(parse(source));paint();
  if(shouldPersist())try{localStorage.setItem('case-src',source);}catch{}
  scheduleHash();
  try{const inspected=await inspectReview(parse(source));if(turn!==revision)return;model=inspected;paint();}catch{if(turn===revision)status('Some captured references could not be inspected. Their source is preserved.');}
}
const fact=(label,value)=>value?`<dt>${e(label)}</dt><dd>${e(value)}</dd>`:'';
const link=(url,label)=>classifyReference(url).safe?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>`:'';
function paintInspector(){
  const {kind,item:selectedItem}=current(),item=innerWidth<=760&&!$('focusdialog').open?null:selectedItem;let html='';
  if(model.verdict&&model.verdict!=='off'&&model.headline&&!$('focusdialog').open)html+=`<p class="fact-label">Authored verdict</p><p>${e(model.verdict)}</p>`;
  if(model.reconsider&&!$('focusdialog').open)html+=`<p class="fact-label">What changes the choice</p><p class="reconsider">${e(model.reconsider)}</p>`;
  if(item){
    html+=`<div${model.reconsider?' class="rule"':''}><p class="fact-label">${kind==='option'?'Alternative':kind==='review'?'Dated review':'Selected reason'}</p><h2>${e(item.label)}</h2>`;
    if(kind==='claim'){
      html+=`<dl>${fact('Basis stated by the author',item.basis||'Not stated')}${fact('Qualification',item.qualification)}${fact('Still assumed',item.assumptions)}</dl>`;
      const ref=item.reference||{},p=item.planningContext||ref.planningContext;
      if(p)html+=`<p>${e(p.role+' · '+p.scope)}</p>`;
      if(ref.kind==='tool')html+=`<p>${ref.capture==='captured'?'URL-carried inputs are preserved. The owning tool interprets the model.':ref.capture==='unverified'?'Checking the URL-carried state…':'This link does not carry a readable model. Replace it with the full tool URL.'}</p>`;
      if(ref.kind==='external')html+='<p>External reference. Its content is not captured in this Case.</p>';
      if(ref.safe)html+=link(item.url,ref.kind==='external'?'Open external reference':ref.capture==='captured'?'Open captured model':'Open tool');
      if(item.url&&!ref.safe)html+='<p>Reference cannot be opened safely. Its authored text remains in source.</p>';
      html+=`<div><button id="editselected">${actionIcon('edit')}Edit reason</button>${item.url?'<button id="replaceselected">Replace reference</button>':''}</div>`;
    }else if(kind==='option')html+=`<dl>${fact('Expected value / outcome',item.value)}${fact('What must be true',item.requires)}${fact('Main downside',item.downside)}${fact('What changes the choice',item.reconsider)}</dl><button id="editselected">${actionIcon('edit')}Edit alternative</button>`;
    else html+=`<dl>${fact('Reviewed on',item.date)}${fact('What changed',item.change)}${fact('Implication',item.implication)}${fact('Decision recorded',item.decision)}</dl>${link(item.previous,'Open previous reference')}${link(item.url,'Open reviewed reference')}<button id="editselected">${actionIcon('edit')}Edit review</button>`;
    html+='</div>';
  }
  if(model.owner||model.reviewBy)html+=`<dl class="rule">${fact('Decision owner',model.owner)}${fact('Review by',model.reviewBy)}</dl>`;
  if(!html)html='<p class="fact-label">A decision worth keeping</p><h2>Make the basis visible.</h2><p>Add the choice, why you prefer it and what would make you reconsider.</p><button id="setupdecision">Edit decision</button>';
  $('inspector').innerHTML=html;
  $('editselected')?.addEventListener('click',()=>openEdit(kind,item));
  $('replaceselected')?.addEventListener('click',openReplacement);
  $('setupdecision')?.addEventListener('click',()=>openEdit('config',model));
}
$('preview').addEventListener('click',event=>{const hit=event.target.closest('[data-kind]');if(!hit)return;selected=hit.dataset.kind+':'+hit.dataset.id;if(innerWidth<=760){$('focusdialog').append($('inspector'));$('focusdialog').showModal();}
if(hit.dataset.kind==='option'&&model.view==='brief'){editor.setText(setConfig(editor.getText(),'view','compare'));}else paint();});
$('focusdialog').addEventListener('close',()=>{document.querySelector('.review-layout').append($('inspector'));paintInspector();[...$('preview').querySelectorAll('[data-kind]')].find(el=>el.dataset.kind+':'+el.dataset.id===selected)?.focus({preventScroll:true});});
$('preview').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-kind]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{selected='';editor.setText(setConfig(editor.getText(),'view',b.dataset.view));});
$('editsource').addEventListener('click',()=>{ws.setCollapsed(!ws.collapsed());if(!ws.collapsed())editor.view.focus();});
$('editdecision').addEventListener('click',()=>openEdit('config',model));
$('addentry').addEventListener('click',()=>openEdit(model.view==='compare'?'option':model.view==='review'?'review':'claim',null));
for(const id of ['font','theme','accent'])$(id).addEventListener('change',()=>editor.setText(setConfig(editor.getText(),id,$(id).value)));
$('palette').addEventListener('change',()=>editor.setText(setConfig(setConfig(editor.getText(),'accent',''),'palette',$('palette').value)));
$('resetaccent').addEventListener('click',()=>editor.setText(setConfig(editor.getText(),'accent','')));
const fieldNames={config:['title','headline','verdict','question','status','decision','unresolved','owner','date','review-by','reconsider','constraints'],claim:['label','basis','detail','qualification','assumptions','url'],option:['label','value','requires','downside','reconsider'],review:['label','date','change','implication','decision','previous','url']};
const labels={'review-by':'Review by',decision:'Authorisation / decision scope',unresolved:'Still unresolved',url:'Reference URL',previous:'Previous captured reference URL',requires:'What must be true',reconsider:'What changes the choice',basis:'Basis stated by the author',value:'Expected value / outcome'};
function openEdit(kind,item){
  editing={kind,item,source:editor.getText()};$('editheading').textContent=kind==='config'?'The decision':(item?'Edit ':'Add ')+(kind==='claim'?'reason':kind==='option'?'alternative':'review');
  $('editfields').innerHTML=fieldNames[kind].map(key=>{
    const value=item?.[key==='review-by'?'reviewBy':key]||(key==='date'&&kind==='review'?new Date().toISOString().slice(0,10):'');
    const options=key==='basis'?['','judgement','assumption','observation','model']:key==='status'?['open','decided','parked']:null;
    return `<label>${e(labels[key]||key[0].toUpperCase()+key.slice(1))}${options?`<select aria-label="${e(labels[key]||key[0].toUpperCase()+key.slice(1))}" name="${key}">${options.map(v=>`<option value="${v}"${value===v?' selected':''}>${v||'Not stated'}</option>`).join('')}</select>`:`<${['detail','qualification','assumptions','constraints','change','implication'].includes(key)?'textarea':'input'} aria-label="${e(labels[key]||key[0].toUpperCase()+key.slice(1))}" name="${key}"${['date','review-by'].includes(key)?' type="date"':''}${key==='label'?' required':''}${['detail','qualification','assumptions','constraints','change','implication'].includes(key)?`>${e(value)}</textarea>`:` value="${e(value)}">`}`}</label>`;
  }).join('');$('editerror').textContent='';$('editdialog').showModal();
}
$('editform').addEventListener('submit',event=>{
  event.preventDefault();if(editor.getText()!==editing.source){$('editerror').textContent='The source changed while this editor was open. Close and reopen it to edit the current version.';return;}
  const values=Object.fromEntries([...new FormData(event.target)].map(([k,v])=>[k,String(v).replace(/[\r\n]+/g,' ').trim()]));
  if(Object.values(values).some(v=>/(^|\s)\/\//.test(v))){$('editerror').textContent='Use source for comments. These fields cannot contain a whitespace followed by //.';return;}
  if(['url','previous'].some(k=>values[k]&&!classifyReference(values[k]).safe)){$('editerror').textContent='Use a suite URL or a complete HTTP(S) reference without credentials.';return;}
  let source=editing.source;
  if(editing.kind==='config')for(const [k,v] of Object.entries(values))source=setConfig(source,k,v);
  else if(!editing.item)source=appendBlock(source,editing.kind,values);
  else if(editing.item.legacy){
    const lines=source.split('\n'),ex=editing.item;let line=editLabel(lines[ex.srcLine],ex.label,values.label);line=editNote(line,ex.note||'',values.detail);lines[ex.srcLine]=line;source=lines.join('\n');
    // Promote to an explicit claim only when adding fields the legacy row cannot express.
    if(values.basis||values.qualification||values.assumptions||values.url!==ex.url){lines.splice(ex.srcLine,1);source=appendBlock(lines.join('\n'),'claim',values);}
  }else for(const [k,v] of Object.entries(values))source=setBlockField(source,editing.kind,editing.item.id,k,v);
  editor.setText(source);$('editdialog').close();status('Changes saved in source.');
});
function openReplacement(){$('replacementchange').value='';$('replacementimplication').value='';const {item}=current();replacement={item,source:editor.getText(),url:null};$('replacementurl').value='';$('referencecomparison').hidden=true;$('replaceerror').textContent='';$('replacedialog').showModal();}
async function readableState(url){const ref=await inspectReference(url);if(!ref.safe)throw new Error('Use a safe suite URL or external HTTP(S) reference.');if(ref.kind==='external')return 'External reference — content is not captured.\n'+url;if(ref.capture!=='captured')throw new Error('The reference does not carry a readable model. Copy the full URL from the tool.');const state=await decodeHash(url.slice(url.indexOf('#')+1));return typeof state.t==='string'?state.t:JSON.stringify(state,null,2);}
$('comparereference').addEventListener('click',async()=>{try{const proposed=$('replacementurl').value.trim();replacement.url=null;const next=await readableState(proposed);let prior;try{prior=await readableState(replacement.item.url);}catch{prior='Previous reference has no readable captured state.\n'+replacement.item.url;}$('previousstate').value=prior;$('nextstate').value=next;replacement.url=proposed;$('referencecomparison').hidden=false;$('replaceerror').textContent='';}catch(error){$('replaceerror').textContent=error.message;$('referencecomparison').hidden=true;}});
$('replacementurl').addEventListener('input',()=>{replacement.url=null;$('referencecomparison').hidden=true;});
$('adoptreference').addEventListener('click',()=>{
  const change=$('replacementchange').value.trim(),implication=$('replacementimplication').value.trim();
  if(!replacement.url||!change||!implication){$('replaceerror').textContent='Compare the new reference, then state what changed and its implication.';return;}
  if(editor.getText()!==replacement.source){$('replaceerror').textContent='Source changed. Close this panel and start from the current reason.';return;}
  if([change,implication].some(v=>/(^|\s)\/\//.test(v))){$('replaceerror').textContent='Describe the change without a // comment delimiter.';return;}
  const old=replacement.item;let source;
  if(old.legacy){const lines=replacement.source.split('\n');lines[old.srcLine]=lines[old.srcLine].replace(/(\s->\s+)\S+/,(_,prefix)=>prefix+replacement.url);source=lines.join('\n');}
  else source=setBlockField(replacement.source,'claim',old.id,'url',replacement.url);
  source=appendBlock(source,'review',{label:'Reference updated: '+old.label,date:new Date().toISOString().slice(0,10),change,implication,previous:old.url,url:replacement.url});
  editor.setText(source);$('replacedialog').close();status('Reference adopted. The previous reference is preserved in Reviews.');
});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
$('chips').innerHTML='<button id="newcase">Start your own</button>'+EXAMPLES.map((ex,i)=>`<button data-example="${i}">${e(ex.name)}</button>`).join('');
$('newcase').addEventListener('click',()=>editor.setText(STARTER));
for(const b of $('chips').querySelectorAll('[data-example]'))b.addEventListener('click',()=>{selected='';editor.setText(EXAMPLES[+b.dataset.example].text);});
$('savesource').addEventListener('click',()=>download(slug()+'.case.txt',new Blob([editor.getText()],{type:'text/plain;charset=utf-8'})));
$('opensource').addEventListener('change',async()=>{const file=$('opensource').files[0];if(!file)return;if(file.size>1000000){status('Source files can be up to 1 MB.');return;}editor.setText(await file.text());$('opensource').value='';status('Source opened.');});
function markdown(){
  const out=['# '+model.title,'',model.headline||(model.verdict==='off'?'':model.verdict)||'',model.question||'',''];
  for(const key of ['decision','unresolved','owner','date','reviewBy','reconsider','constraints'])if(model[key])out.push(key+': '+model[key],'');
  for(const [title,entries,keys] of [['Reasons',model.claims,['basis','detail','qualification','assumptions','url']],['Alternatives',model.options,['value','requires','downside','reconsider']],['Reviews',model.reviews,['date','change','implication','decision','previous','url']]])if(entries.length){out.push('## '+title,'');for(const it of entries){out.push('### '+it.label,'');for(const k of keys)if(it[k])out.push(k+': '+it[k],'');}}
  return out.join('\n');
}
$('copymd').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(markdown());status('Review copied as Markdown.');}catch{download(slug()+'.md',new Blob([markdown()],{type:'text/markdown'}));status('Clipboard unavailable; Markdown downloaded.');}});
$('sharecase').addEventListener('click',async()=>{if(!await writeHash()){status('This Case is too large for a link. Save source to keep every reference.');return;}try{await navigator.clipboard.writeText(location.href);status('Case link copied.');}catch{status('Copy the complete URL from the address bar.');}});
function png(svg){return new Promise((resolve,reject)=>{const plan=pngRasterPlan(svg);if(!plan.ok)return reject(new Error(plan.detail));svgToCanvas(svg,canvas=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encoding failed')),'image/png'),error=>reject(new Error(error.detail)));});}
async function makeDeck(){const source=editor.getText(),snapshot=await inspectReview(parse(source));const result=buildCaseDeck(snapshot,{dark:snapshot.theme==='dark'||(snapshot.theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches),measure});deckSource=source;deckSlug=slugify(snapshot.title||'case');if(!result.complete)throw new Error('Some content cannot fit safely. Save source before exporting.');return result.pages.map(p=>({...p,svg:embedChapterFonts(p.svg)}));}
function showPage(index){pageIndex=Math.max(0,Math.min(index,deck.length-1));$('deckcanvas').innerHTML=deck[pageIndex].svg.replace(/<style\b[^>]*data-chapter-fonts="embedded"[^>]*>[\s\S]*?<\/style>/g,'');$('deckposition').textContent=`${pageIndex+1} / ${deck.length} · ${deck[pageIndex].title}`;$('deckprev').disabled=pageIndex===0;$('decknext').disabled=pageIndex===deck.length-1;}
$('exportdeck').addEventListener('click',async()=>{try{deck=await makeDeck();showPage(0);$('deckerror').textContent='';$('deckdialog').showModal();}catch(error){status(error.message);}});
$('deckprev').addEventListener('click',()=>showPage(pageIndex-1));$('decknext').addEventListener('click',()=>showPage(pageIndex+1));
async function exportDeck(format){
  const button=$(format==='png'?'deckpng':'decksvg'),label=button.textContent;button.disabled=true;
  try{const files=[];for(let i=0;i<deck.length;i++){button.textContent=`Preparing ${i+1} / ${deck.length}`;files.push({name:`${deckSlug}-${String(i+1).padStart(2,'0')}.${format}`,bytes:format==='png'?new Uint8Array(await(await png(deck[i].svg)).arrayBuffer()):new TextEncoder().encode(deck[i].svg)});}files.push({name:'case-source.txt',bytes:new TextEncoder().encode(deckSource)});download(deckSlug+'-'+format+'-slides.zip',createSlideZip(files));$('deckerror').textContent='Slide set downloaded with the portable source.';}catch(error){$('deckerror').textContent=error.message;}finally{button.disabled=false;button.textContent=label;}
}
$('deckpng').addEventListener('click',()=>exportDeck('png'));$('decksvg').addEventListener('click',()=>exportDeck('svg'));
$('deckprint').addEventListener('click',()=>{$('printpages').innerHTML=deck.map(p=>'<section>'+p.svg+'</section>').join('');$('deckdialog').close();window.print();});
$('copypng').addEventListener('click',async()=>{try{const first=(await makeDeck())[0];await navigator.clipboard.write([new ClipboardItem({'image/png':await png(first.svg)})]);status('Decision slide copied. Export deck includes the complete review.');}catch(error){status('Could not copy the slide. Use Export deck to download PNG pages.');}});
new ResizeObserver(debounced(paint,100)).observe($('preview'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paint);
(async()=>{try{await loadChapterFonts();ready=true;const hash=await readHashState();let source=typeof hash?.t==='string'?hash.t:'';if(hash?.t&&hash.e!==0)ws.setCollapsed(false);if(!source)try{source=localStorage.getItem('case-src')||'';}catch{}if(source)editor.setText(source);else if(!autoloadExample(()=>editor.setText(DEFAULT_TEXT)))refresh();}catch(error){status(error.message);}})();
