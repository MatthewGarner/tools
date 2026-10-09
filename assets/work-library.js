import {readNativeWork, filterWork, WORK_KINDS} from './work-store.js';
import {encodeHash} from './series.js';
import {decorateWork} from './work-metadata.js';
import {mountWorkActions} from './work-actions.js';

const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
// Native models stay in their own stores; catalogue organisation is separate.
export function mountWorkLibrary(shelf,scope,onFilter){
  const heading=node('h2','Saved work'), intro=node('p','Saved in this browser at this website address. Open an item to continue in its tool.','recent-note');
  const controls=node('div',null,'work-filters'), searchLabel=node('label','Find saved work'), search=node('input');
  search.type='search';search.maxLength=200;searchLabel.append(search);
  const kindLabel=node('label','Work type'), kind=node('select');
  for(const [value,text] of [['','All work'],...Object.entries(WORK_KINDS)]){const option=node('option',text);option.value=value;kind.append(option);}
  const viewLabel=node('label','Show'),view=node('select');
  for(const [value,text] of [['active','Active work'],['pinned','Pinned work'],['archived','Archived work']]){const option=node('option',text);option.value=value;view.append(option);}
  viewLabel.append(view);kindLabel.append(kind);controls.append(searchLabel,kindLabel,viewLabel);
  const section=node('section'), title=node('h3','In your tools'), list=node('ul',null,'work-list recent-list'), more=node('button','Show more work','recent-more'), status=node('p',null,'recent-note');
  more.type='button';status.setAttribute('role','status');section.append(title,list,more);shelf.append(heading,intro,controls,section,status);
  let expanded=false,records=[],issue='',revision=0;
  const filters=()=>({query:search.value,kind:kind.value,view:view.value});
  const matches=()=>filterWork(records,search.value,kind.value).filter(item=>view.value==='archived'?item.archived:!item.archived&&(view.value!=='pinned'||item.pinned));
  const announce=message=>{status.textContent=message;search.focus({preventScroll:true});};
  function render(){
    const currentRevision=++revision, visible=matches();
    section.hidden=!visible.length;list.replaceChildren();status.textContent=issue;
    for(const item of expanded?visible:visible.slice(0,3)){
      const row=node('li'), link=node('a',null,'recent-open');link.href=item.href;
      link.dataset.workKind=item.kind;
      const date=item.savedAt?' · Updated '+new Date(item.savedAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):' · Date unavailable';
      link.append(node('span',(item.pinned?'★ ':'')+item.name,'recent-name'),node('span',`${item.toolName} · ${WORK_KINDS[item.kind]}${date}`,'recent-meta'));row.append(link);list.append(row);
      mountWorkActions(row,item,{refresh:()=>onFilter(filters()),announce});
      if(item.state){
        // Prevent navigation until the portable copy is ready, including modifier
        // clicks. Failed encoding leaves the item visible without a misleading URL.
        link.removeAttribute('href');link.setAttribute('aria-disabled','true');
        encodeHash(item.state).then(hash=>{if(currentRevision!==revision)return;link.href=item.href+'#'+hash;link.removeAttribute('aria-disabled');}).catch(()=>{if(currentRevision===revision){link.href=item.href;link.lastChild.textContent+=' · open the tool to load this copy';}});
      }
    }
    more.hidden=visible.length<=3;more.textContent=expanded?'Show less work':`Show all work (${visible.length})`;more.setAttribute('aria-expanded',String(expanded));
  }
  function refresh(){
    try{const result=readNativeWork(localStorage,{scope,pathname:location.pathname}), organised=decorateWork(localStorage,result.records);records=organised.records;issue=result.unreadable.length||organised.unreadable.length?'Some saved work or its organisation could not be listed. Open its tool or use Backup & restore to recover it.':'';}
    catch{records=[];issue='Browser storage is unavailable. Allow site storage to find your work.';}
    render();
  }
  for(const input of [search,kind,view])input.addEventListener(input===search?'input':'change',()=>{render();onFilter(filters());});
  more.addEventListener('click',()=>{expanded=!expanded;render();});
  return {refresh,filters,count:()=>records.length,hasWork:()=>records.length>0,hasIssue:()=>Boolean(issue),hasMatches:()=>matches().length>0,setCompact:value=>{controls.hidden=Boolean(value);}};
}
