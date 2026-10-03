import {encodeHash, decodeHash} from './series.js';
import {RECENT_TOOLS, HASH_LIMIT, snapshotName} from './recent-store.js';
import {createTemplates} from './template-ui.js';

import {scope,tool,el,button,store,failure,modal,nameField} from './recent-ui.js';

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
  async function capture(){
    const state=getState ? structuredClone(getState()) : null;
    if(getState && !state)throw new Error('Open a model before saving a copy.');
    const hash=getHash ? (await getHash(state)).replace(/^.*#/,'') : await encodeHash(state);
    if(!hash || hash.length > Math.min(maxLength,HASH_LIMIT)) throw new Error('This model is too large for a saved copy. Export it from the tool instead.');
    return {hash,value:state || await decodeHash(hash)};
  }
  // Fixed teaching exercises and binders keep their existing controls. Templates
  // belong to authored models; starting one first keeps the outgoing draft.
  if(!['alarm','flow','signal-vs-noise','case','paths','frequency'].includes(tool)){
    const templates=createTemplates({scope,tool,format:'model-link',capture:async()=>(await capture()).hash,
      name:()=>snapshotName(getState?.(),RECENT_TOOLS[scope][tool]),notice:message=>status.textContent=message,
      description:'Starting from a template first keeps your current model as a saved copy in Your work.',
      beforeStart:async()=>{const {hash,value}=await capture(),shelf=store();if(!shelf.list().some(copy=>copy.tool===tool&&copy.hash===hash))shelf.add({id:crypto.randomUUID(),tool,name:snapshotName(value,RECENT_TOOLS[scope][tool]),hash,savedAt:Date.now()});},
      restore:hash=>{if(!/^(?:z:)?[A-Za-z0-9_+/=-]+$/.test(hash)||hash.length>HASH_LIMIT)throw Error('This template does not contain a valid model link.');location.hash=hash;location.reload();},
    });
    const manage=button('Templates');manage.className='btn';manage.addEventListener('click',templates.open);
    const start=button('New from template');start.className='btn';start.addEventListener('click',templates.newWork);host.insertBefore(manage,status);host.insertBefore(start,status);
  }
  save.addEventListener('click',async()=>{
    save.disabled=true;status.textContent='';
    try{
      const {hash,value}=await capture();
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

export {scope,el,button,store,failure,modal,nameField} from './recent-ui.js';
