import {scope,el,button,store,failure} from './recent-ui.js';
import {RECENT_TOOLS,recentRoute} from './recent-store.js';
import {mountWorkLibrary} from './work-library.js';
import {filterWork} from './work-store.js';
import {decorateWork,workId} from './work-metadata.js';
import {mountWorkActions} from './work-actions.js';

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
    const {query,kind,view}=library.filters();
    records=records.map(r=>{const key=`mg:recent:v1:${scope}:${r.id}`;return {...r,key,copyId:r.id,id:workId(key),kind:'copy',toolName:RECENT_TOOLS[scope][r.tool]};});
    const organised=decorateWork(localStorage,records);
    if(organised.unreadable.length)status.textContent='Some work organisation needs recovery. Use Backup & restore.';
    records=filterWork(organised.records,query,kind).filter(r=>view==='archived'?r.archived:!r.archived&&(view!=='pinned'||r.pinned));
    heading.hidden=!records.length;list.hidden=!records.length;
    if(!records.length&&!library.hasMatches())status.textContent=query||kind||view!=='active'?'No saved work matches these filters.':'No saved work yet. Workspaces and drafts appear here as you use your tools; Save a copy keeps a separate version.';
    else if(status.textContent.startsWith('No saved work'))status.textContent='';
    list.replaceChildren();
    for(const record of expanded?records:records.slice(0,3)){
      const row=el('li'), link=el('a',null,'recent-open');link.href=recentRoute(scope,record.tool,location.pathname)+'#'+record.hash;
      const name=el('span',(record.pinned?'★ ':'')+record.name,'recent-name'), meta=el('span',RECENT_TOOLS[scope][record.tool]+' · Saved copy · '+new Date(record.savedAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),'recent-meta');
      link.append(name,meta);
      row.append(link);list.append(row);link.dataset.recentId=record.copyId;
      mountWorkActions(row,record,{refresh,announce:message=>{status.textContent=message;heading.focus();},rename:name=>store().rename(record.copyId,name),remove:()=>store().remove(record.copyId)});
    }
    more.hidden=records.length<=3;more.textContent=expanded?'Show fewer':'Show all ('+records.length+')';more.setAttribute('aria-expanded',String(expanded));
  };
  heading.tabIndex=-1;more.addEventListener('click',()=>{expanded=!expanded;refresh();});
  // Refresh after another tab saves, and after Back restores a cached catalogue.
  document.addEventListener('click',event=>{for(const menu of shelf.querySelectorAll('details[open]'))if(!menu.contains(event.target))menu.open=false;});
  window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);refresh();
}
