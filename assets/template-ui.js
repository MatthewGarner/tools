import {templateStore} from './template-store.js';
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
const button=(text,action)=>{const el=node('button',text);el.type='button';el.addEventListener('click',action);return el;};
const failure=error=>error?.name==='QuotaExceededError'?'Browser storage is full. Nothing was saved. Export work or free some space.':error?.name==='SecurityError'?'Browser storage is unavailable. Export work to keep it.':error.message||'Could not use templates.';

export function createTemplates({scope,tool,format,capture,restore,blank,examples,name=()=>'',notice=()=>{},beforeStart,description=''}) {
  const store=()=>templateStore(localStorage,scope,tool);
  let dialog,opener;
  const stylesheet=new URL('./template-ui.css',import.meta.url).href;
  if(!document.querySelector('link[data-template-styles]')){const link=node('link');link.rel='stylesheet';link.href=stylesheet;link.dataset.templateStyles='';document.head.append(link);}
  function close(){dialog?.close();}
  function fail(error){const target=dialog?.querySelector('[role=alert]');if(target)target.textContent=failure(error);else notice(failure(error));}
  async function start(record){
    try{const latest=store().read(record.id);if(!latest)throw Error('This template was deleted in another tab.');if(latest.format!==format)throw Error('This template uses a different format. Its saved data is unchanged.');await beforeStart?.();if(await restore(latest.content)===false)return;close();notice(`Started from ${latest.name}.`);}
    catch(error){fail(error);}
  }
  async function newWork(){try{const record=store().getDefault();if(record)return await start(record);if(blank)await blank();else open();}catch(error){notice(failure(error));}}
  function form(title,value,submit){
    const body=node('form'),heading=node('h3',title),label=node('label','Template name'),input=node('input');input.type='text';input.required=true;input.maxLength=120;input.value=value;label.append(input);
    const actions=node('div',null,'mg-template-actions'),cancel=button('Cancel',draw),save=node('button','Save template');save.type='submit';actions.append(cancel,save);body.append(heading,label,actions);
    body.addEventListener('submit',async event=>{event.preventDefault();if(!input.value.trim()){input.setCustomValidity('Give this template a name.');input.reportValidity();return;}save.disabled=true;try{await submit(input.value);draw();}catch(error){fail(error);save.disabled=false;}});
    input.addEventListener('input',()=>input.setCustomValidity(''));dialog.querySelector('.mg-template-body').replaceChildren(body);input.focus();input.select();
  }
  function draw(){
    const body=dialog.querySelector('.mg-template-body');body.replaceChildren();dialog.querySelector('[role=alert]').textContent='';
    try{
      const collection=store(),{items,issues}=collection.list();let selected=null;try{selected=collection.getDefault();}catch(error){fail(error);}
      const summary=node('p',selected?`New starts from “${selected.name}”.`:blank?'New starts blank.':'Choose a template to start a new model.','mg-template-note');body.append(summary);
      const actions=node('div',null,'mg-template-actions');
      actions.append(button('Save current as template',()=>form('Save a template',name().slice(0,120),async label=>{const content=await capture();collection.add({id:crypto.randomUUID(),name:label,format,content,savedAt:Date.now()});notice('Template saved in this browser.');})));
      if(blank)actions.append(button('Start blank',async()=>{try{if(await blank()!==false)close();}catch(error){fail(error);}}));
      if(examples)actions.append(button('Browse examples',()=>{close();examples();}));
      actions.append(button(blank?'Use blank as default':'Clear default',()=>{try{collection.clearDefault();draw();}catch(error){fail(error);}}));body.append(actions);
      if(issues.length)body.append(node('p',`${issues.length} unreadable template${issues.length===1?'':'s'} kept for recovery. Export a browser backup before replacing any data.`));
      if(!items.length)body.append(node('p','Save your own headings, criteria or settings as a reusable starting point.'));
      const list=node('ul',null,'mg-template-list');
      for(const item of items){const row=node('li'),heading=node('strong',item.name),meta=node('span',selected?.id===item.id?'Default starting point':'Saved starting point','mg-template-note'),controls=node('div',null,'mg-template-actions');
        controls.append(button('Start from template',()=>start(item)),button(selected?.id===item.id?'Default':'Make default',()=>{try{collection.setDefault(item);draw();}catch(error){fail(error);}}),button('Rename',()=>form('Rename template',item.name,label=>collection.rename(item,label))),button('Delete',()=>{const confirm=node('div',null,'mg-template-actions');confirm.append(node('span',`Delete “${item.name}”?`),button('Keep template',draw),button('Delete template',()=>{try{collection.remove(item);draw();}catch(error){fail(error);}}));controls.replaceChildren(confirm);}));
        controls.children[1].disabled=selected?.id===item.id;row.append(heading,meta,controls);list.append(row);}
      body.append(list);
    }catch(error){fail(error);}
  }
  function open(){
    opener=document.activeElement;dialog=node('dialog',null,'mg-template-dialog');const heading=node('h2','Your templates'),intro=node('p','Saved in this browser. Each start makes a separate copy; later edits leave the template unchanged.'+(description?' '+description:''),'mg-template-note'),error=node('p'),body=node('div',null,'mg-template-body');
    heading.id=`${tool}-templates-title`;dialog.setAttribute('aria-labelledby',heading.id);error.setAttribute('role','alert');dialog.append(heading,intro,error,body,button('Close',close));
    dialog.addEventListener('close',()=>{dialog.remove();dialog=null;if(opener?.isConnected)opener.focus();});document.body.append(dialog);draw();dialog.showModal();
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-personal-templates]'))open();else if(event.target.closest('[data-template-new]'))newWork();});
  return {open,newWork};
}
