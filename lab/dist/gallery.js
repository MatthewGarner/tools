import{mountShell}from'./shared/shell.js?v=0.26.0';
import{experiments}from'./shared/catalog.js?v=0.21.0';
mountShell();
let filter=location.hash==='#archive'?'archive':'all';
const search=document.querySelector('#search'),grid=document.querySelector('.experiment-grid');
const active=experiments.filter(x=>!x.status||x.status==='active'),archived=experiments.filter(x=>x.status&&x.status!=='active');
// The cards (and their specimen diagrams) are static markup, so a catalogue entry with no card would be
// silently absent. Give any such entry a plain card; dev/lab-index.test.mjs makes the markup complete.
for(const item of experiments){
  if(grid.querySelector(`.experiment[data-id="${item.id}"]`))continue;
  const card=document.createElement('a');card.className=`experiment ${item.route} new`;card.href=`${item.route}/`;
  card.dataset.id=item.id;card.dataset.kind=item.kind;card.dataset.new='true';
  const part=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=text;return n;};
  const top=part('div','experiment-top','');top.append(part('span','type',`${item.id} · ${item.kind==='scaffold'?'WORKBENCH':item.kind.toUpperCase()} · NEW`));
  const specimen=part('div','specimen new-art','');specimen.setAttribute('aria-hidden','true');specimen.append(part('span','art-caption',item.caption));
  const copy=part('div','experiment-copy','');copy.append(part('h3','',item.title),part('p','',item.question));
  const move=part('div','try','');move.append(part('strong','','First move'),` ${item.move}`);copy.append(move);
  card.append(top,specimen,copy);grid.append(card);
}
const cards=[...document.querySelectorAll('.experiment')];
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
const names={all:'Active',model:'Models',scaffold:'Workbenches',archive:'Archive'};
document.querySelector('.note-small').textContent=`${active.length} active experiments · ${archived.length} earlier prototypes.`;
for(const button of document.querySelectorAll('[data-filter]')){button.textContent=`${names[button.dataset.filter]} · ${counts[button.dataset.filter]}`;button.onclick=()=>{filter=button.dataset.filter;history.replaceState(null,'',filter==='archive'?'#archive':location.pathname);update();};}
window.addEventListener('hashchange',()=>{filter=location.hash==='#archive'?'archive':'all';update();});
search.oninput=update;update();
