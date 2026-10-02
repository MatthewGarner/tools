import {mountShell} from '../shared/shell.js?v=0.5.0';
import {attachCardDrag} from '../shared/drag.js';
import {escapeHtml,downloadText} from '../shared/utils.js';
import {createHistory,commit,undo} from './state.js';
export const e=escapeHtml;
export const uid=()=>crypto.randomUUID?.()||`w-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const short=(value,max=90)=>value.length>max?`${value.slice(0,max-1)}…`:value;
export function field(id,label,value,action,help='',rows=2) {return `<div class="field"><label for="${e(id)}">${label}</label>${help?`<p id="${e(id)}-help">${e(help)}</p>`:''}<textarea id="${e(id)}" maxlength="20000" rows="${rows}" data-edit="${e(JSON.stringify(action))}" ${help?`aria-describedby="${e(id)}-help"`:''}>${e(value)}</textarea></div>`;}
export function select(id,label,value,options,action) {return `<div class="field"><label for="${e(id)}">${label}</label><select id="${e(id)}" data-edit="${e(JSON.stringify(action))}">${options.map(([key,label])=>`<option value="${e(key)}" ${key===value?'selected':''}>${e(label)}</option>`).join('')}</select></div>`;}
export function start(config) {
  mountShell({active:config.route});
  const root=document.querySelector('#app');
  const dialog=document.createElement('dialog');dialog.id='work-dialog';document.body.append(dialog);
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
  const live=document.createElement('div');live.className='sr-only';live.setAttribute('role','status');document.body.append(live);
  const toastNode=document.createElement('div');toastNode.className='toast';toastNode.setAttribute('role','status');toastNode.hidden=true;document.body.append(toastNode);
  const key=`thinking-lab:${config.route}:v1`,eng=config.engine;
  let history=createHistory(eng.initial()),timer,toastTimer,destroyDrag,paused=false,recovery=null,saveMessage='Saved on this device',dialogOrigin=null;
  try{const raw=localStorage.getItem(key);if(raw){try{history=createHistory(eng.validateState(JSON.parse(raw)));}catch{recovery=raw;paused=true;saveMessage='Saved data needs recovery';}}}catch{saveMessage='Saving unavailable · export a copy';}
  const work=()=>eng.active(history.present);
  function toast(message){toastNode.textContent=message;toastNode.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastNode.hidden=true,4400);}
  function status(){const el=document.querySelector('#save-status');if(el)el.textContent=saveMessage;}
  function save(now=false){clearTimeout(timer);if(paused)return;saveMessage='Saving…';status();const run=()=>{try{localStorage.setItem(key,JSON.stringify(history.present));saveMessage='Saved on this device';}catch{saveMessage='Saving unavailable · export a copy';}status();};if(now)run();else timer=setTimeout(run,250);}
  function resize(scope=root){scope.querySelectorAll('textarea').forEach(el=>{el.style.height='auto';el.style.height=`${Math.max(el.scrollHeight,52)}px`;});}
  function findControl(data){return data?[...root.querySelectorAll('[data-act]')].find(el=>['act','id','kind','side','lane','key','slot'].every(key=>el.dataset[key]===data[key])):null;}
  function update(action,{refresh=true,group=null,checkpoint=true,focus=null}={}) {
    const focused=document.activeElement,oldId=focused?.id,oldData=focused?.dataset?.act?{...focused.dataset}:null;
    try{const next=eng.transition(history.present,action);history=checkpoint?commit(history,next,group):{...history,present:next,group:null};save();if(refresh)render();if(focus)requestAnimationFrame(()=>document.getElementById(focus)?.focus());else if(refresh)(oldId?document.getElementById(oldId):findControl(oldData))?.focus({preventScroll:true});return true;}catch(error){toast(error.message);return false;}
  }
  function render(){destroyDrag?.();const workspace=work();root.innerHTML=`<header class="work-top"><div><p class="eyebrow">SCAFFOLD ${config.number} / ${config.kicker}</p><h1>${config.title}</h1></div><div class="work-toolbar"><button class="button quiet" data-act="@undo" ${history.past.length?'':'disabled'}>↶ Undo</button><button class="button" data-act="@workspaces">My work <span>${history.present.workspaces.length}</span></button><button class="button" data-act="@export">Export ↓</button></div></header>${paused?`<div class="notice">${recovery?'Saved work could not be opened. Download a recovery copy before replacing it.':'Another tab changed saved work. Saving here is paused; export this version or explicitly keep it.'}<button class="text-button" data-act="${recovery?'@recover':'@resume'}">${recovery?'Download recovery copy':'Save this tab instead'}</button></div>`:''}<section class="problem-bar"><div><label for="work-problem">${config.problemLabel||'The problem you are working on'}</label><span id="save-status" role="status">${e(saveMessage)}</span></div><textarea id="work-problem" data-edit="${e(JSON.stringify({type:'problem'}))}" rows="1" maxlength="20000" placeholder="${e(config.placeholder||'How could we…?')}">${e(workspace.problem)}</textarea></section>${config.render(workspace,manager)}<footer class="local-footer"><p>Fictional examples. Prompts support your thinking; no generated answers.</p><p>Work stays in this browser. Export a portable copy.</p></footer>`;requestAnimationFrame(()=>resize());if(config.drag)destroyDrag=attachCardDrag({root,onDrop:result=>config.drag(result,manager)});config.afterRender?.(workspace,manager);}
  function open(content,title){dialogOrigin=document.activeElement?.dataset?.act?{...document.activeElement.dataset}:null;dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="close-button" data-act="@close" aria-label="Close dialog">×</button></div>${content}`;dialog.setAttribute('aria-labelledby','dialog-title');dialog.showModal();requestAnimationFrame(()=>resize(dialog));}
  function workspaces(){open(`<p class="dialog-description">New problems, examples, and imports keep your existing work.</p><div class="new-options">${config.examples.map(([id,label])=>`<button class="button ${id==='blank'?'primary':''}" data-act="@new" data-kind="${id}">${label}</button>`).join('')}</div><div class="workspace-list">${[...history.present.workspaces].reverse().map(work=>`<button data-act="@switch" data-id="${e(work.id)}"><span><strong>${e(short(work.problem.trim()||'Untitled problem'))}</strong><small>${e(config.workspaceSummary?.(work)||config.title)}</small></span><span>${work.id===history.present.activeId?'Open':'→'}</span></button>`).join('')}</div><button class="text-button" data-act="@import">Import an editable JSON workspace ↑</button>`,'My workspaces');}
  const manager={root,dialog,work,update,render,open,close:()=>dialog.close(),toast,announce:message=>live.textContent=message,resize,scroll:id=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})};
  document.addEventListener('click',event=>{const button=event.target.closest('[data-act]');if(!button)return;const data=button.dataset,action=data.act;
    if(action==='@undo'){history=undo(history);save();render();toast('Last change undone.');}
    else if(action==='@close')dialog.close();
    else if(action==='@workspaces')workspaces();
    else if(action==='@new'){dialog.close();if(update({type:'@new',id:uid(),example:data.kind},{focus:'work-problem'}))toast('New workspace opened. Previous work is saved.');}
    else if(action==='@switch'){dialog.close();update({type:'@switch',id:data.id},{checkpoint:false});}
    else if(action==='@export')open('<p class="dialog-description">Includes your working material, reasoning, and test plan.</p><div class="new-options"><button class="button primary" data-act="@markdown">Download Markdown ↓</button><button class="button" data-act="@json">Download editable JSON ↓</button></div><p class="microcopy">Local saving is specific to this browser and website address.</p>','Export this workspace');
    else if(action==='@markdown'||action==='@json'){try{downloadText(`${config.route}-workshop.${action==='@json'?'json':'md'}`,action==='@json'?eng.serialize(work()):config.markdown(work()),action==='@json'?'application/json':'text/markdown;charset=utf-8');dialog.close();toast('Workspace downloaded.');}catch(error){toast(error.message);}}
    else if(action==='@import')input.click();
    else if(action==='@recover'){downloadText(`${config.route}-recovery.json`,recovery,'application/json');recovery=null;paused=false;save();render();}
    else if(action==='@resume'){paused=false;save();render();}
    else config.action?.(data,manager,button);
  });
  document.addEventListener('input',event=>{const el=event.target;if(!(el instanceof HTMLTextAreaElement)||!el.dataset.edit)return;try{const action={...JSON.parse(el.dataset.edit),value:el.value};if(update(action,{refresh:false,group:el.id})){resize(el.parentElement);root.querySelector('[data-act="@undo"]').disabled=false;config.liveEdit?.(action,manager,el);}}catch(error){toast(error.message);}});
  document.addEventListener('change',event=>{const el=event.target;if(!(el instanceof HTMLSelectElement)||!el.dataset.edit)return;try{update({...JSON.parse(el.dataset.edit),value:el.value},{refresh:!dialog.contains(el)});}catch(error){toast(error.message);}});
  document.addEventListener('focusout',()=>history.group=null);
  root.addEventListener('toggle',event=>{if(event.target instanceof HTMLDetailsElement&&event.target.open)requestAnimationFrame(()=>resize(event.target));},true);
  dialog.addEventListener('close',()=>{render();findControl(dialogOrigin)?.focus({preventScroll:true});dialogOrigin=null;});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
  input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;try{if(file.size>12000000)throw new Error('Choose a JSON file under 12 MB.');const workspace=eng.parse(await file.text());dialog.close();if(update({type:'@import',id:uid(),workspace}))toast('Workspace imported. Existing work is preserved.');}catch(error){toast(error.message);}input.value='';});
  window.addEventListener('pagehide',()=>save(true));window.addEventListener('storage',event=>{if(event.key!==key||event.newValue===JSON.stringify(history.present))return;clearTimeout(timer);paused=true;saveMessage='Local saving paused';render();});
  render();if(!paused)save();return manager;
}
