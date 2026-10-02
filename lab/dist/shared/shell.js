import{mountShell as mountLegacyShell}from'./legacy-shell.js?v=0.21.0';
import{experiments}from'./catalog.js?v=0.21.0';
export function mountShell({active}={}) {
  if(!document.querySelector('.mg-masthead'))return mountLegacyShell({active});
  if(document.querySelector('.lab-tool-switch')) return;
  const prefix = active ? '../' : './';
  const activeItems=experiments.filter(x=>!x.status||x.status==='active'),archive=experiments.filter(x=>x.status&&x.status!=='active');
  const models=activeItems.filter(x=>x.kind==='model'),scaffolds=activeItems.filter(x=>x.kind==='scaffold');
  const options=pages=>pages.map(x=>`<option value="${x.route}" ${x.route===active?'selected':''}>${x.id} · ${x.title}</option>`).join('');
  const header=document.querySelector('.mg-masthead');
  if(active&&!document.querySelector('.lab-tool-switch')){
    const nav=document.createElement('nav');nav.className='lab-tool-switch';nav.setAttribute('aria-label','Experiments');
    nav.innerHTML=`<label for="lab-experiment">Experiment</label><select id="lab-experiment"><option value="">All tools</option><optgroup label="Models to play with">${options(models)}</optgroup><optgroup label="Scaffolds to think with">${options(scaffolds)}</optgroup>${archive.length?`<optgroup label="Archived and combined prototypes">${options(archive)}</optgroup>`:''}</select>`;
    nav.querySelector('select').addEventListener('change',e=>{location.href=e.target.value?prefix+e.target.value+'/':document.querySelector('[data-suite-link="explore"]').href;});
    header.after(nav);
  }
  const item=experiments.find(x=>x.route===active);
  if(item?.status&&item.status!=='active'){
    const notice=document.createElement('aside');notice.className='lab-archive-notice';
    notice.innerHTML=`<strong>${item.status==='merged'?'Combined into another tool.':'Archived prototype.'}</strong> ${item.archiveReason} ${item.mergedInto?`<a href="${prefix}${item.mergedInto}/">Open ${experiments.find(x=>x.route===item.mergedInto)?.title||'the combined tool'} →</a>`:''} Your existing work remains available here. <a href="${document.querySelector('[data-suite-link="explore"]').href}">Browse all tools →</a>`;
    header.after(notice);
  }
  if(!document.querySelector('link[rel="icon"]')) {const icon=document.createElement('link');icon.rel='icon';icon.href=prefix+'favicon.svg?v=0.21.0';document.head.append(icon);}
}
