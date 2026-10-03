import {el,button,modal,nameField,failure} from './recent-ui.js';
import {organiseWork} from './work-metadata.js';

// Catalogue names and archives organise the index. They never edit a problem
// statement, delete a native workspace, or change the model carried in a link.
export function mountWorkActions(row,record,{refresh,announce,rename,remove}={}) {
  const manage=el('details',null,'recent-manage'), summary=el('summary','•••');
  summary.setAttribute('aria-label','Manage '+record.name);
  const actions=el('div',null,'recent-row-actions');manage.append(summary,actions);row.append(manage);
  const add=(label,handler)=>{const b=button(label);b.setAttribute('aria-label',label+' '+record.name);actions.append(b);b.addEventListener('click',handler);return b;};
  const update=(change,message)=>{try{organiseWork(localStorage,record,change);refresh();announce(message);}catch(error){announce(failure(error));}};
  add(record.pinned?'Unpin':'Pin',()=>update({pinned:!record.pinned},record.pinned?'Work unpinned.':'Work pinned.'));
  add('Rename',()=>{
    manage.open=false;const ui=modal(rename?'Rename copy':'Name in Your work',summary), input=nameField(ui.form,ui.error,record.name), submit=button('Save name');
    if(!rename){input.parentElement.firstChild.textContent='Name in Your work';input.maxLength=160;ui.info.textContent='Changes its name in this catalogue. The workspace content stays as written.';}
    submit.type='submit';ui.actions.append(submit);input.addEventListener('input',()=>input.setCustomValidity(''));
    ui.form.addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim()){input.setCustomValidity('Give this work a name.');input.reportValidity();return;}
      try{if(rename)rename(input.value);else organiseWork(localStorage,record,{name:input.value});ui.dialog.close();refresh();announce('Work renamed.');}catch(error){ui.error.textContent=failure(error);}});
    ui.dialog.showModal();input.focus();input.select();
  });
  add(record.archived?'Restore':'Archive',()=>update({archived:!record.archived},record.archived?'Work restored.':'Work archived. Find it in Archived work; its contents remain in the tool.'));
  if(remove)add('Remove',()=>{
    manage.open=false;const ui=modal('Remove copy?',summary);ui.info.textContent='Remove “'+record.name+'” from Your work?';
    const confirm=button('Remove copy');confirm.type='submit';ui.actions.append(confirm);
    ui.form.addEventListener('submit',event=>{event.preventDefault();try{remove();ui.dialog.close();refresh();announce('Copy removed.');}catch(error){ui.error.textContent=failure(error);}});
    ui.dialog.showModal();
  });
  manage.addEventListener('keydown',event=>{if(event.key==='Escape'){manage.open=false;summary.focus();event.preventDefault();}});
}
