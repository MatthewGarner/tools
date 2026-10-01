export function mountShell({active}={}) {
  if(document.querySelector('.lab-header')) return;
  const prefix = active ? '../' : './';
  const pages=[['commitment','Commitment'],['flexibility','Flexibility'],['reframe','Reframing'],['mixer','Possibility mixer']];
  const header=document.createElement('header');header.className='lab-header';
  header.innerHTML=`<a class="lab-brand" href="${prefix}"><span class="lab-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Thinking Lab</a><nav class="lab-nav" aria-label="Experiments">${pages.map(([key,label])=>`<a href="${prefix}${key}/" ${key===active?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
  document.body.prepend(header);
  const footer=document.createElement('footer');footer.className='lab-footer';footer.innerHTML=`<span>Four small experiments in seeing things differently.</span><span><a href="${prefix}about.html">About &amp; model limits</a> · Your work stays in this browser.</span>`;document.body.append(footer);
  if(!document.querySelector('link[rel="icon"]')) {const icon=document.createElement('link');icon.rel='icon';icon.href=prefix+'favicon.svg';document.head.append(icon);}
}
