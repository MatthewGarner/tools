import {scope,el,button,store,failure} from './recent-ui.js';
import {RECENT_TOOLS,recentRoute} from './recent-store.js';
import {mountWorkLibrary} from './work-library.js';
import {filterWork} from './work-store.js';
import {decorateWork,workId} from './work-metadata.js';
import {mountWorkActions} from './work-actions.js';

const shelf=document.querySelector('[data-recent-work]');
if(shelf){
  const useDisclosure=scope==='tools'&&location.pathname==='/';
  let disclosure=null,count=null,content=shelf,announcement=null;
  if(useDisclosure){
    disclosure=document.createElement('details');disclosure.className='work-disclosure';
    const summary=document.createElement('summary');summary.className='work-disclosure-summary';
    summary.append(el('span','Your work','work-disclosure-title'));
    count=el('span',null,'work-disclosure-count');summary.append(count);
    content=el('div',null,'work-disclosure-content');disclosure.append(summary,content);shelf.append(disclosure);
    announcement=el('span',null,'work-announcement');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');shelf.after(announcement);
  }
  let expanded=false;
  const library=mountWorkLibrary(content,scope,()=>refresh(),useDisclosure?'Saved work':'Your work');
  const heading=el('h3','Saved copies');
  const list=el('ul',null,'recent-list'), more=button('Show all'), status=el('p',null,'recent-note');status.setAttribute('role','status');
  more.className='recent-more';content.append(heading,list,more,status);
  const openForAnchor=()=>{
    if(location.hash==='#recent-work'&&!shelf.hidden&&!disclosure.open){
      disclosure.open=true;
      requestAnimationFrame(()=>shelf.scrollIntoView({block:'start'}));
    }
  };
  const refresh=()=>{
    library.refresh();
    let records=[],copyReadFailed=false;try{records=store().list();}catch(error){copyReadFailed=true;status.textContent=failure(error);}
    const {query,kind,view}=library.filters();
    records=records.map(r=>{const key=`mg:recent:v1:${scope}:${r.id}`;return {...r,key,copyId:r.id,id:workId(key),kind:'copy',toolName:RECENT_TOOLS[scope][r.tool]};});
    let organised={records:[],unreadable:[]};
    try{organised=decorateWork(localStorage,records);}catch(error){copyReadFailed=true;status.textContent=failure(error);}
    if(organised.unreadable.length)status.textContent='Some work organisation needs recovery. Use Backup & restore.';
    const total=library.count()+records.length;
    if(count)count.textContent=library.hasIssue()||copyReadFailed?'Needs attention':`${total} saved`;
    library.setCompact(!library.hasWork()&&records.length<=3);
    const wasHidden=shelf.hidden;
    shelf.hidden=!records.length&&!library.hasWork()&&!library.hasIssue()&&!organised.unreadable.length&&!copyReadFailed;
    if(shelf.hidden){
      if(disclosure)disclosure.open=false;
      if(useDisclosure&&shelf.contains(document.activeElement))document.querySelector('#explore-query')?.focus({preventScroll:true});
      return;
    }
    if(wasHidden&&disclosure)disclosure.open=false;
    records=filterWork(organised.records,query,kind).filter(r=>view==='archived'?r.archived:!r.archived&&(view!=='pinned'||r.pinned));
    heading.hidden=!records.length;list.hidden=!records.length;
    if(!copyReadFailed&&!records.length&&!library.hasMatches())status.textContent=query||kind||view!=='active'?'No saved work matches these filters.':'No saved work yet. Workspaces and drafts appear here as you use your tools; Save a copy keeps a separate version.';
    else if(status.textContent.startsWith('No saved work'))status.textContent='';
    list.replaceChildren();
    for(const record of expanded?records:records.slice(0,3)){
      const row=el('li'), link=el('a',null,'recent-open');link.href=recentRoute(scope,record.tool,location.pathname)+'#'+record.hash;
      const name=el('span',(record.pinned?'★ ':'')+record.name,'recent-name'), meta=el('span',RECENT_TOOLS[scope][record.tool]+' · Saved copy · '+new Date(record.savedAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),'recent-meta');
      link.append(name,meta);
      row.append(link);list.append(row);link.dataset.recentId=record.copyId;
      mountWorkActions(row,record,{refresh,announce:message=>{
        if(useDisclosure&&shelf.hidden){announcement.textContent=message;document.querySelector('#explore-query')?.focus({preventScroll:true});}
        else{status.textContent=message;heading.focus();}
      },rename:name=>store().rename(record.copyId,name),remove:()=>store().remove(record.copyId)});
    }
    more.hidden=copyReadFailed||records.length<=3;more.textContent=expanded?'Show fewer':'Show all ('+records.length+')';more.setAttribute('aria-expanded',String(expanded));
    if(useDisclosure)openForAnchor();
  };
  heading.tabIndex=-1;more.addEventListener('click',()=>{expanded=!expanded;refresh();});
  // Refresh after another tab saves, and after Back restores a cached catalogue.
  document.addEventListener('click',event=>{for(const menu of shelf.querySelectorAll('details.recent-manage[open]'))if(!menu.contains(event.target))menu.open=false;});
  window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);if(useDisclosure)window.addEventListener('hashchange',openForAnchor);refresh();
}
