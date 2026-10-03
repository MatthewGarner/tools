import {scope,el,button,store,failure,modal,nameField} from './recent-work.js';
import {RECENT_TOOLS,recentRoute} from './recent-store.js';
import {mountWorkLibrary} from './work-library.js';
import {filterWork} from './work-store.js';

const shelf=document.querySelector('[data-recent-work]');
if(shelf){
  let expanded=false;
  const library=mountWorkLibrary(shelf,scope,()=>refresh());
  const heading=el('h3','Saved copies');
  const list=el('ul',null,'recent-list'), more=button('Show all'), status=el('p',null,'recent-note');status.setAttribute('role','status');
  more.className='recent-more';shelf.append(heading,list,more,status);
  const refresh=()=>{
    library.refresh();
    let records;try{records=store().list();}catch(error){shelf.hidden=false;status.textContent=failure(error);list.replaceChildren();more.hidden=true;return;}
    // Preserve a removal confirmation announcement even when the last row is gone.
    shelf.hidden=false;
    const {query,kind}=library.filters();records=filterWork(records.map(r=>({...r,kind:'copy',toolName:RECENT_TOOLS[scope][r.tool]})),query,kind);
    heading.hidden=!records.length;list.hidden=!records.length;
    if(!records.length&&!library.hasMatches())status.textContent=query||kind?'No saved work matches these filters.':'No saved work yet. Workspaces and drafts appear here as you use your tools; Save a copy keeps a separate version.';
    else if(status.textContent.startsWith('No saved work'))status.textContent='';
    list.replaceChildren();
    for(const record of expanded?records:records.slice(0,3)){
      const row=el('li'), link=el('a',null,'recent-open');link.href=recentRoute(scope,record.tool,location.pathname)+'#'+record.hash;
      const name=el('span',record.name,'recent-name'), meta=el('span',RECENT_TOOLS[scope][record.tool]+' · Saved copy · '+new Date(record.savedAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),'recent-meta');
      link.append(name,meta);
      const edit=button('Rename'), remove=button('Remove');edit.setAttribute('aria-label','Rename '+record.name);remove.setAttribute('aria-label','Remove '+record.name);
      const manage=el('details',null,'recent-manage'), summary=el('summary','•••');summary.setAttribute('aria-label','Manage '+record.name);
      const actions=el('div',null,'recent-row-actions');actions.append(edit,remove);manage.append(summary,actions);row.append(link,manage);list.append(row);
      manage.addEventListener('keydown',event=>{if(event.key==='Escape'){manage.open=false;summary.focus();event.preventDefault();}});
      edit.addEventListener('click',()=>{
        manage.open=false;const ui=modal('Rename copy',summary), input=nameField(ui.form,ui.error,record.name), submit=button('Save name');submit.type='submit';ui.actions.append(submit);
        input.addEventListener('input',()=>input.setCustomValidity(''));
        ui.form.addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim()){input.setCustomValidity('Give this copy a name.');input.reportValidity();return;}
          try{store().rename(record.id,input.value);ui.dialog.close();refresh();list.querySelector(`[data-recent-id="${record.id}"]`)?.focus();}
          catch(error){ui.error.textContent=failure(error);}});
        ui.dialog.showModal();input.focus();input.select();
      });
      link.dataset.recentId=record.id;
      remove.addEventListener('click',()=>{
        manage.open=false;const ui=modal('Remove copy?',summary);ui.info.textContent='Remove “'+record.name+'” from Your work?';
        const confirm=button('Remove copy');confirm.type='submit';ui.actions.append(confirm);
        ui.form.addEventListener('submit',event=>{event.preventDefault();try{store().remove(record.id);ui.dialog.close();status.textContent='Copy removed.';refresh();heading.focus();}catch(error){ui.error.textContent=failure(error);}});
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
