/* The front door's returning strip: "Pick up where you left off". It reads the same stores and
   applies the same organisation as the catalogue's Your work shelf (assets/your-work.js) — saved
   copies, native workspaces and drafts, pins and archive — and shows at most three, plus any
   favourites. With nothing stored the section stays hidden and takes no space. It deliberately
   does not import the work library, the work actions or the template editor: opening, renaming and
   removing work stay in Your work. Text only; storage values never reach innerHTML. */
import {scope,store} from './recent-ui.js';
import {RECENT_TOOLS,recentRoute} from './recent-store.js';
import {readNativeWork} from './work-store.js';
import {decorateWork,workId} from './work-metadata.js';
import {encodeHash} from './series.js';
import {readFavourites} from './catalogue-favourites.js';

const strip=document.querySelector('[data-door-resume]');
if(strip){
  const list=strip.querySelector('[data-door-work]'),favBox=strip.querySelector('[data-door-favourites]'),favLinks=strip.querySelector('[data-door-favourite-links]');
  let titles={};
  try{titles=JSON.parse(document.getElementById('door-catalog')?.textContent||'{}');}catch{}
  const LIMIT=3;
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
  const day=ms=>ms?new Date(ms).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'';

  function readWork(){
    let copies=[],native=[];
    try{copies=store().list().map(r=>{const key=`mg:recent:v1:${scope}:${r.id}`;return {...r,key,id:workId(key),kind:'copy',toolName:RECENT_TOOLS[scope][r.tool],href:recentRoute(scope,r.tool,location.pathname)+'#'+r.hash};});}catch{}
    try{native=readNativeWork(localStorage,{scope,pathname:location.pathname}).records;}catch{}
    try{return decorateWork(localStorage,[...copies,...native]).records.filter(r=>!r.archived).slice(0,LIMIT);}catch{return [];}
  }
  // Items that carry model state (a named save, a Fermi estimate) need the portable hash, exactly as Your work builds it.
  async function link(record){
    let href=record.href;
    if(record.state){try{href+='#'+await encodeHash(record.state);}catch{}}
    const a=el('a');a.href=href;
    a.append(el('span',(record.pinned?'★ ':'')+record.name,'door-name'),el('span',[record.toolName,{copy:'Saved copy',draft:'Current draft',workspace:'Workspace',baseline:'Baseline'}[record.kind],day(record.savedAt)].filter(Boolean).join(' · '),'door-line'));
    const item=el('li');item.append(a);return item;
  }
  function favourites(){
    try{return [...readFavourites(localStorage,Object.keys(titles))].map(id=>[id,...titles[id]]);}catch{return [];}
  }
  let revision=0;
  async function refresh(){
    const mine=++revision,items=await Promise.all(readWork().map(link)),favs=favourites();
    if(mine!==revision)return;
    list.replaceChildren(...items);list.hidden=!items.length;
    favLinks.replaceChildren();
    favs.forEach(([,title,href],i)=>{if(i)favLinks.append(', ');const a=el('a',title);a.href=href;favLinks.append(a);});
    favBox.hidden=!favs.length;
    strip.hidden=!items.length&&!favs.length;
  }
  addEventListener('storage',refresh);addEventListener('pageshow',refresh);
  refresh();
}
