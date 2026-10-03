import {mountShell} from '../shared/shell.js?v=0.25.0';
import {prepareArticleModel,readArticleRaw} from '../shared/article-import.js';
import {readStore,writeStore,downloadText} from '../shared/utils.js?v=0.24.0';
import {validateState} from '../../../embed/core/schema.js';
import {encodeArticleFragment} from '../../../embed/core/codec.js';
import {validateSession,readExperiment,portableExperiment} from './session-state.js';

const copy = value => structuredClone(value);
export async function mountExperiment({route,definition,render,bind,describe}) {
  const key='thinking-lab:'+route+':v1', transient=location.hash.startsWith('#article:');
  await prepareArticleModel(route,key);
  mountShell({active:route});
  const app=document.querySelector('#app');
  const fresh=()=>({state:copy(definition.initialState),pinned:null});
  let session=fresh(),past=[],future=[],cleanup=()=>{},message='',savingPaused=false,storedRaw=null;
  try {
    storedRaw=readArticleRaw(key);
    session=validateSession(definition,readStore(key,fresh()));
    if(storedRaw && !transient)validateSession(definition,JSON.parse(storedRaw));
  } catch(error) {
    session=fresh();savingPaused=true;
    message='Saved work could not be read. It is preserved. Export this example, or import a valid file to replace it. '+error.message;
  }
  app.innerHTML=`<div class="experiment-toolbar" aria-label="Experiment controls"><button type="button" id="experiment-undo" disabled>Undo</button><button type="button" id="experiment-redo" disabled>Redo</button><button type="button" id="experiment-pin">Pin comparison</button><button type="button" id="experiment-clear" hidden>Clear comparison</button><button type="button" id="experiment-reset">Reset example</button><details class="experiment-files"><summary>Save &amp; share</summary><div><button type="button" id="experiment-share">Copy link</button><button type="button" id="experiment-json">Export JSON</button><button type="button" id="experiment-markdown">Export notes</button><button type="button" id="experiment-svg">Export SVG</button><button type="button" id="experiment-png">Export PNG</button><label class="experiment-import" for="experiment-import">Import JSON<input id="experiment-import" type="file" accept=".json,application/json"></label></div></details></div><p id="experiment-status" class="experiment-status" role="status" aria-live="polite"></p><div id="experiment-body"></div><p class="local-note" id="experiment-storage-note"></p>`;
  const root=app.querySelector('#experiment-body'),status=app.querySelector('#experiment-status');
  const report=text=>{message=text;status.textContent=text;};
  function save(){
    if(savingPaused)return false;
    try {
      if(!transient && localStorage.getItem(key)!==storedRaw){savingPaused=true;report('This experiment changed in another tab. Your current work is kept here; export it before reloading.');return false;}
      if(!writeStore(key,session)){report('Browser storage is unavailable. Export JSON or copy a link to keep this experiment.');return false;}
      if(!transient)storedRaw=localStorage.getItem(key);
      return true;
    }catch {report('Browser storage is unavailable. Export JSON or copy a link to keep this experiment.');return false;}
  }
  function paint(){
    cleanup();
    // Replacing the view must retain disclosure state so an assumption edit
    // does not hide its own input or move focus out of the working surface.
    const disclosures=new Map([...root.querySelectorAll('details[id]')].map(node=>[node.id,node.open]));
    const active=document.activeElement, focus=active?.id, selection=active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? [active.selectionStart,active.selectionEnd] : null;
    root.innerHTML=render(copy(session.state),{pinned:copy(session.pinned),message});
    for(const node of root.querySelectorAll('details[id]'))if(disclosures.has(node.id))node.open=disclosures.get(node.id);
    app.querySelector('#experiment-undo').disabled=!past.length;
    app.querySelector('#experiment-redo').disabled=!future.length;
    app.querySelector('#experiment-clear').hidden=session.pinned===null;
    app.querySelector('#experiment-pin').textContent=session.pinned?'Replace comparison':'Pin comparison';
    app.querySelector('#experiment-storage-note').textContent=transient?'Shared example · changes stay in this example. Export JSON to keep its comparison.':savingPaused?'Saving is paused; your previously saved work is preserved.':'This experiment and its comparison save in this browser. Shared links open a separate example.';
    status.textContent=message;
    cleanup=bind?.({root,state:copy(session.state),pinned:copy(session.pinned),change,report})||(()=>{});
    const target=focus&&document.getElementById(focus);
    if(target){target.focus({preventScroll:true});if(selection?.[0]!==null&&typeof target.setSelectionRange==='function')try{target.setSelectionRange(...selection);}catch{}}
    app.dataset.experimentReady='true';
  }
  function commit(next,text){
    try {
      const valid=validateSession(definition,next);
      if(JSON.stringify(valid)===JSON.stringify(session)){message=text||'No change.';save();paint();return;}
      past.push(copy(session));past=past.slice(-40);future=[];session=valid;message=text||'Experiment updated.';save();paint();
    }catch(error){report(error.message);}
  }
  function change(next,text){commit({state:next,pinned:session.pinned},text);}
  app.querySelector('#experiment-undo').onclick=()=>{if(!past.length)return;future.push(copy(session));session=past.pop();message='Change undone.';save();paint();};
  app.querySelector('#experiment-redo').onclick=()=>{if(!future.length)return;past.push(copy(session));session=future.pop();message='Change restored.';save();paint();};
  app.querySelector('#experiment-pin').onclick=()=>commit({...session,pinned:copy(session.state)},'Comparison pinned. It is retained as you explore.');
  app.querySelector('#experiment-clear').onclick=()=>commit({...session,pinned:null},'Comparison cleared. Undo restores it.');
  app.querySelector('#experiment-reset').onclick=()=>change(copy(definition.initialState),'Example reset. Your pinned comparison is retained.');
  app.querySelector('#experiment-json').onclick=()=>downloadText(route+'-experiment.json',JSON.stringify(portableExperiment(route,session),null,2),'application/json');
  app.querySelector('#experiment-markdown').onclick=()=>downloadText(route+'-experiment.md',describe?.(copy(session.state),copy(session.pinned))||'# '+definition.title+'\n\n'+definition.description+'\n\n```json\n'+JSON.stringify(portableExperiment(route,session),null,2)+'\n```\n','text/markdown');
  app.querySelector('#experiment-share').onclick=async()=>{
    const url=new URL(location.href);url.search='';url.hash=encodeArticleFragment({tool:definition.id,version:definition.version,state:session.state});
    try{await navigator.clipboard.writeText(url.href);report('Link copied. It opens this state as a separate example; export JSON to include the pinned comparison.');}
    catch{const input=document.createElement('textarea');input.value=url.href;input.setAttribute('aria-label','Shareable experiment link');status.replaceChildren(document.createTextNode('Copy this link: '),input);input.focus();input.select();}
  };
  app.querySelector('#experiment-import').onchange=async event=>{
    const input=event.target,file=input.files[0];if(!file)return;
    try{
      if(file.size>250000)throw Error('Choose an experiment file smaller than 250 KB.');
      const next=readExperiment(definition,route,JSON.parse(await file.text()));
      if(savingPaused && !transient){storedRaw=localStorage.getItem(key);savingPaused=false;}
      commit(next,'Experiment imported. Undo restores the previous state.');
    }catch(error){report('Import rejected; your experiment is unchanged. '+error.message);}finally{input.value='';}
  };
  function figure(){
    const css=getComputedStyle(document.documentElement),get=name=>css.getPropertyValue('--'+name).trim();
    const colors=Object.fromEntries(['paper','card','ink','muted','line','accent','warn','bad','good','border','bg','grid'].map(name=>[name,get(name)]));
    const result=definition.views[definition.defaultView].render(validateState(definition,copy(session.state)),{width:1100,theme:document.documentElement.dataset.theme||'light',dark:document.documentElement.dataset.theme==='dark',colors});
    if(typeof result.svg!=='string')throw Error('This view does not supply an SVG. Export notes instead.');
    return result.svg;
  }
  app.querySelector('#experiment-svg').onclick=()=>{try{downloadText(route+'-experiment.svg',figure(),'image/svg+xml');report('SVG exported from the current model.');}catch(error){report(error.message);}};
  app.querySelector('#experiment-png').onclick=async()=>{
    let url;
    try{
      url=URL.createObjectURL(new Blob([figure()],{type:'image/svg+xml'}));const img=new Image();img.src=url;await img.decode();
      const canvas=document.createElement('canvas');const scale=Math.min(2,4000/Math.max(img.width,img.height));canvas.width=Math.ceil(img.width*scale);canvas.height=Math.ceil(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Image export was unavailable. Use SVG instead.');
      const download=URL.createObjectURL(blob),a=document.createElement('a');a.href=download;a.download=route+'-experiment.png';a.click();setTimeout(()=>URL.revokeObjectURL(download),1000);report('PNG exported from the current model.');
    }catch(error){report(error.message);}finally{if(url)URL.revokeObjectURL(url);}
  };
  paint();
  return {change,getState:()=>copy(session)};
}
