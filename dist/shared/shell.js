import{experiments}from'./catalog.js';
export function mountShell({active}={}) {
  if(document.querySelector('.lab-header')) return;
  const prefix = active ? '../' : './';
  const models=experiments.filter(x=>x.kind==='model').map(x=>[x.route,x.id+' · '+x.title]);
  const scaffolds=experiments.filter(x=>x.kind==='scaffold').map(x=>[x.route,x.id+' · '+x.title]);
  const options=pages=>pages.map(([key,label])=>`<option value="${key}" ${key===active?'selected':''}>${label}</option>`).join('');
  const header=document.createElement('header');header.className='lab-header';
  header.innerHTML=`<a class="lab-brand" href="${prefix}"><span class="lab-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Thinking Lab</a><nav class="lab-nav" aria-label="Experiments"><label for="lab-experiment">Explore the bench</label><select id="lab-experiment"><option value="" ${!active?'selected':''}>All 24 experiments</option><optgroup label="Models to play with">${options(models)}</optgroup><optgroup label="Scaffolds to think with">${options(scaffolds)}</optgroup></select></nav>`;
  header.querySelector('select').addEventListener('change',e=>{location.href=prefix+(e.target.value?e.target.value+'/':'');});
  document.body.prepend(header);
  const footer=document.createElement('footer');footer.className='lab-footer';footer.innerHTML=`<span>24 experiments in seeing things differently.</span><span><a href="${prefix}about.html">About &amp; model limits</a> · Your work stays in this browser.</span>`;document.body.append(footer);
  if(!document.querySelector('link[rel="icon"]')) {const icon=document.createElement('link');icon.rel='icon';icon.href=prefix+'favicon.svg';document.head.append(icon);}
}
