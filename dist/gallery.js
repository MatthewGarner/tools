import{mountShell}from'./shared/shell.js?v=0.20.0';
import{experiments}from'./shared/catalog.js?v=0.20.0';
mountShell();
let filter=location.hash==='#archive'?'archive':'all';
const search=document.querySelector('#search'),cards=[...document.querySelectorAll('.experiment')];
const active=experiments.filter(x=>!x.status||x.status==='active'),archived=experiments.filter(x=>x.status&&x.status!=='active');
for(const card of cards){
  const item=experiments.find(x=>x.id===card.dataset.id);card.dataset.status=item?.status||'active';
  if(item?.status&&item.status!=='active'){
    card.querySelector('.type').textContent=`${item.id} · ${item.status==='merged'?'COMBINED':'ARCHIVED PROTOTYPE'}`;
    card.querySelector('.try').textContent=item.archiveReason;
  }
}
function update(){
  let count=0;const q=search.value.trim().toLowerCase();
  for(const card of cards){const isArchive=card.dataset.status!=='active';const match=(filter==='archive'?isArchive:!isArchive&&(filter==='all'||card.dataset.kind===filter))&&card.textContent.toLowerCase().includes(q);card.hidden=!match;if(match)count++;}
  document.querySelector('#count').textContent=`${count} ${filter==='archive'?'earlier prototype':'experiment'}${count===1?'':'s'}${filter==='archive'?' · existing work and links are retained':''}`;
  document.querySelector('#no-results').hidden=count!==0;
  document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
}
const counts={all:active.length,model:active.filter(x=>x.kind==='model').length,scaffold:active.filter(x=>x.kind==='scaffold').length,archive:archived.length};
const names={all:'Active',model:'Models',scaffold:'Scaffolds',archive:'Archive'};
for(const button of document.querySelectorAll('[data-filter]')){button.textContent=`${names[button.dataset.filter]} · ${counts[button.dataset.filter]}`;button.onclick=()=>{filter=button.dataset.filter;history.replaceState(null,'',filter==='archive'?'#archive':location.pathname);update();};}
window.addEventListener('hashchange',()=>{filter=location.hash==='#archive'?'archive':'all';update();});
search.oninput=update;update();
