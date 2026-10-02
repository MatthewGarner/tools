import{experiments}from'./catalog.js?v=0.17.0';
export function mountShell({active}={}) {
  if(document.querySelector('.lab-header')) return;
  const prefix = active ? '../' : './';
  const activeItems=experiments.filter(x=>!x.status||x.status==='active'),archive=experiments.filter(x=>x.status&&x.status!=='active');
  const models=activeItems.filter(x=>x.kind==='model'),scaffolds=activeItems.filter(x=>x.kind==='scaffold');
  const options=pages=>pages.map(x=>`<option value="${x.route}" ${x.route===active?'selected':''}>${x.id} · ${x.title}</option>`).join('');
  const header=document.createElement('header');header.className='lab-header';
  header.innerHTML=`<a class="lab-brand" href="${prefix}"><span class="lab-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Thinking Lab</a><nav class="lab-nav" aria-label="Experiments"><label for="lab-experiment">Explore the bench</label><select id="lab-experiment"><option value="" ${!active?'selected':''}>${activeItems.length} active experiments</option><optgroup label="Models to play with">${options(models)}</optgroup><optgroup label="Scaffolds to think with">${options(scaffolds)}</optgroup>${archive.length?`<optgroup label="Archived and combined prototypes">${options(archive)}</optgroup>`:''}</select></nav><button type="button" class="lab-appearance" data-appearance aria-label="Appearance: switch colour theme"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 2.5a9.5 9.5 0 0 1 0 19Z" fill="currentColor"/></svg><span>Appearance</span></button>`;
  header.querySelector('select').addEventListener('change',e=>{location.href=prefix+(e.target.value?e.target.value+'/':'');});
  document.body.prepend(header);
  document.dispatchEvent(new Event('lab:shell-ready'));
  const item=experiments.find(x=>x.route===active);
  if(item?.status&&item.status!=='active'){
    const notice=document.createElement('aside');notice.className='lab-archive-notice';
    notice.innerHTML=`<strong>${item.status==='merged'?'Combined into another tool.':'Archived prototype.'}</strong> ${item.archiveReason} ${item.mergedInto?`<a href="${prefix}${item.mergedInto}/">Open ${experiments.find(x=>x.route===item.mergedInto)?.title||'the combined tool'} →</a>`:''} Your existing work remains available here. <a href="${prefix}">Return to the active bench →</a>`;
    header.after(notice);
  }
  const footer=document.createElement('footer');footer.className='lab-footer';footer.innerHTML=`<span>${activeItems.length} active experiments · <a href="${prefix}#archive">${archive.length} earlier prototypes</a></span><span><a href="${prefix}about.html">About &amp; model limits</a> · Your work stays in this browser.</span>`;document.body.append(footer);
  if(!document.querySelector('link[rel="icon"]')) {const icon=document.createElement('link');icon.rel='icon';icon.href=prefix+'favicon.svg?v=0.17.0';document.head.append(icon);}
}
