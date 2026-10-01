import {encodeHash, decodeHash} from './series.js';
import {RECENT_TOOLS, HASH_LIMIT, recentStore, recentRoute, snapshotName} from './recent-store.js';

const scope = document.documentElement.dataset.mgSection;
const tool = location.pathname.split('/').filter(part=>part && part!=='index.html').at(-1);
const el = (tag, text, cls) => {const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
const button = text => {const b=el('button',text);b.type='button';return b;};
const store = () => recentStore(localStorage,scope);
const failure = error => error?.name === 'QuotaExceededError'
  ? 'Device storage is full. Nothing was saved. Remove an older snapshot or free some browser storage.'
  : error?.name === 'SecurityError' ? 'Browser storage is unavailable. Allow site storage to use Recent work.'
  : error.message || 'Could not access Recent work. Try again.';

function modal(title, opener){
  const dialog=el('dialog',null,'recent-dialog'), heading=el('h2',title);
  const form=el('form'), info=el('p',null,'recent-note'), error=el('p',null,'recent-error');
  heading.id='recent-heading';dialog.setAttribute('aria-labelledby',heading.id);
  error.setAttribute('role','alert');const actions=el('div',null,'recent-dialog-actions');
  const cancel=button('Cancel');cancel.addEventListener('click',()=>dialog.close());actions.append(cancel);
  form.append(heading,info,error,actions);dialog.append(form);document.body.append(dialog);
  dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus();});
  return {dialog,form,info,error,actions};
}
function nameField(form, before, value){
  const label=el('label','Snapshot name'), input=el('input');input.type='text';input.required=true;input.maxLength=120;input.value=value;
  label.append(input);form.insertBefore(label,before);return input;
}

// Capture through the tool's current-state callback, never its debounced URL.
// Saving is explicit; opening an example, editing or visiting never adds a row.
export function mountRecentSave({getState,getHash,host,note='',maxLength=HASH_LIMIT}){
  if(!RECENT_TOOLS[scope]?.[tool]) return;
  if(!host){
    const header=document.querySelector('[data-tool-header]');
    host=header?.querySelector('.document-actions, .toolbar-actions, .instrument-actions');
    if(!host && header){host=el('div',null,'instrument-actions recent-actions');header.append(host);}
  }
  if(!host)return;
  const save=button('Save snapshot');save.className='btn recent-save';host.append(save);
  const status=el('span',null,'recent-status');status.setAttribute('role','status');host.append(status);
  save.addEventListener('click',async()=>{
    save.disabled=true;status.textContent='';
    try{
      const state=getState ? structuredClone(getState()) : null;
      if(getState && !state)throw new Error('Open a model before saving a snapshot.');
      const hash=getHash ? (await getHash(state)).replace(/^.*#/,'') : await encodeHash(state);
      if(!hash || hash.length > Math.min(maxLength,HASH_LIMIT)) throw new Error('This model is too large for Recent work. Export it from the tool instead.');
      const value=state || await decodeHash(hash);
      const ui=modal('Save to Recent work',save);
      ui.info.textContent='A named snapshot in this browser only. Later edits won’t update it; save another snapshot to keep them.'+(note?' '+note:'');
      const name=nameField(ui.form,ui.error,snapshotName(value,RECENT_TOOLS[scope][tool]));
      const submit=button('Save snapshot');submit.type='submit';ui.actions.append(submit);
      ui.form.addEventListener('submit',event=>{
        event.preventDefault();if(!name.value.trim()){name.setCustomValidity('Give this snapshot a name.');name.reportValidity();return;}
        try{store().add({id:crypto.randomUUID(),tool,name:name.value,hash,savedAt:Date.now()});ui.dialog.close();status.textContent='Saved in Recent work on the '+(scope==='energy'?'Energy':'Tools')+' home page.';}
        catch(error){ui.error.textContent=failure(error);}
      });
      name.addEventListener('input',()=>name.setCustomValidity(''));
      ui.dialog.showModal();name.focus();name.select();
    }catch(error){status.textContent=failure(error);}
    finally{save.disabled=false;}
  });
  return save;
}

const shelf=document.querySelector('[data-recent-work]');
if(shelf){
  let expanded=false;
  const heading=el('h2','Recent work'), note=el('p','Saved snapshots · this browser only', 'recent-note');
  const list=el('ul',null,'recent-list'), more=button('Show all'), status=el('p',null,'recent-note');status.setAttribute('role','status');
  more.className='recent-more';shelf.append(heading,note,list,more,status);
  const refresh=()=>{
    let records;try{records=store().list();}catch(error){shelf.hidden=false;status.textContent=failure(error);list.replaceChildren();more.hidden=true;return;}
    // Preserve a removal confirmation announcement even when the last row is gone.
    shelf.hidden=!records.length && !status.textContent;list.replaceChildren();
    for(const record of expanded?records:records.slice(0,3)){
      const row=el('li'), link=el('a',null,'recent-open');link.href=recentRoute(scope,record.tool,location.pathname)+'#'+record.hash;
      const name=el('span',record.name,'recent-name'), meta=el('span',RECENT_TOOLS[scope][record.tool]+' · '+new Date(record.savedAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),'recent-meta');
      link.append(name,meta);
      const edit=button('Rename'), remove=button('Remove');edit.setAttribute('aria-label','Rename '+record.name);remove.setAttribute('aria-label','Remove '+record.name);
      const manage=el('details',null,'recent-manage'), summary=el('summary','•••');summary.setAttribute('aria-label','Manage '+record.name);
      const actions=el('div',null,'recent-row-actions');actions.append(edit,remove);manage.append(summary,actions);row.append(link,manage);list.append(row);
      manage.addEventListener('keydown',event=>{if(event.key==='Escape'){manage.open=false;summary.focus();event.preventDefault();}});
      edit.addEventListener('click',()=>{
        manage.open=false;const ui=modal('Rename snapshot',summary), input=nameField(ui.form,ui.error,record.name), submit=button('Save name');submit.type='submit';ui.actions.append(submit);
        input.addEventListener('input',()=>input.setCustomValidity(''));
        ui.form.addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim()){input.setCustomValidity('Give this snapshot a name.');input.reportValidity();return;}
          try{store().rename(record.id,input.value);ui.dialog.close();refresh();list.querySelector(`[data-recent-id="${record.id}"]`)?.focus();}
          catch(error){ui.error.textContent=failure(error);}});
        ui.dialog.showModal();input.focus();input.select();
      });
      link.dataset.recentId=record.id;
      remove.addEventListener('click',()=>{
        manage.open=false;const ui=modal('Remove snapshot?',summary);ui.info.textContent='Remove “'+record.name+'” from Recent work? Other snapshots and the tool’s own saved work are kept.';
        const confirm=button('Remove snapshot');confirm.type='submit';ui.actions.append(confirm);
        ui.form.addEventListener('submit',event=>{event.preventDefault();try{store().remove(record.id);ui.dialog.close();status.textContent='Snapshot removed.';refresh();heading.focus();}catch(error){ui.error.textContent=failure(error);}});
        ui.dialog.showModal();
      });
    }
    more.hidden=records.length<=3;more.textContent=expanded?'Show fewer':'Show all ('+records.length+')';more.setAttribute('aria-expanded',String(expanded));
  };
  heading.tabIndex=-1;more.addEventListener('click',()=>{expanded=!expanded;refresh();});
  // Refresh after another tab saves, and after Back restores a cached catalogue.
  document.addEventListener('click',event=>{for(const menu of shelf.querySelectorAll('details[open]'))if(!menu.contains(event.target))menu.open=false;});
  window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);refresh();
}
