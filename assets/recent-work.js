import {encodeHash, decodeHash} from './series.js';
import {RECENT_TOOLS, HASH_LIMIT, recentStore, recentRoute, snapshotName} from './recent-store.js';

const scope = document.documentElement.dataset.recentScope || document.documentElement.dataset.mgSection;
const tool = location.pathname.split('/').filter(part=>part && part!=='index.html').at(-1);
const el = (tag, text, cls) => {const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
const button = text => {const b=el('button',text);b.type='button';return b;};
const store = () => recentStore(localStorage,scope);
const failure = error => error?.name === 'QuotaExceededError'
  ? 'Device storage is full. Nothing was saved. Remove an older copy or free some browser storage.'
  : error?.name === 'SecurityError' ? 'Browser storage is unavailable. Allow site storage to use Your work.'
  : error.message || 'Could not access Your work. Try again.';

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
  const label=el('label','Copy name'), input=el('input');input.type='text';input.required=true;input.maxLength=120;input.value=value;
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
  // Some instruments already use Snapshot for a comparison baseline.
  const save=button('Save a copy');save.className='btn recent-save';host.append(save);
  const status=el('span',null,'recent-status');status.setAttribute('role','status');host.append(status);
  save.addEventListener('click',async()=>{
    save.disabled=true;status.textContent='';
    try{
      const state=getState ? structuredClone(getState()) : null;
      if(getState && !state)throw new Error('Open a model before saving a copy.');
      const hash=getHash ? (await getHash(state)).replace(/^.*#/,'') : await encodeHash(state);
      if(!hash || hash.length > Math.min(maxLength,HASH_LIMIT)) throw new Error('This model is too large for a saved copy. Export it from the tool instead.');
      const value=state || await decodeHash(hash);
      const ui=modal('Save a copy',save);
      ui.info.textContent='Saved in this browser. Later edits won’t update this copy.'+(note?' '+note:'');
      const name=nameField(ui.form,ui.error,snapshotName(value,RECENT_TOOLS[scope][tool]));
      const submit=button('Save copy');submit.type='submit';ui.actions.append(submit);
      ui.form.addEventListener('submit',event=>{
        event.preventDefault();if(!name.value.trim()){name.setCustomValidity('Give this copy a name.');name.reportValidity();return;}
        try{store().add({id:crypto.randomUUID(),tool,name:name.value,hash,savedAt:Date.now()});ui.dialog.close();status.textContent='Copy saved in Your work.';}
        catch(error){ui.error.textContent=failure(error);}
      });
      name.addEventListener('input',()=>name.setCustomValidity(''));
      ui.dialog.showModal();name.focus();name.select();
    }catch(error){status.textContent=failure(error);}
    finally{save.disabled=false;}
  });
  return save;
}

export {scope,el,button,store,failure,modal,nameField};
