/* Small DOM affordances shared by the Energy instruments. */
export function wireModelLink(button, getLink){
  button.addEventListener('click', async () => {
    try{ await navigator.clipboard.writeText(getLink()); button.textContent = 'Copied model link'; }
    catch{ button.textContent = 'Copy blocked — use browser URL'; }
    setTimeout(() => { button.textContent = 'Copy model link'; }, 2000);
  });
}
export function mountTargetPicker(host, {label, getTargets, open}){
  const group = document.createElement('div'); group.className = 'energy-target-picker';
  const select = document.createElement('select'); select.setAttribute('aria-label', label);
  const button = document.createElement('button'); button.className = 'btn'; button.textContent = label;
  group.append(select, button); host.append(group);
  const refresh = () => {
    const previous = select.value;
    const targets = getTargets();
    select.replaceChildren(...targets.map(({name}, i) => { const o=document.createElement('option'); o.value=String(i); o.textContent=name; return o; }));
    if([...select.options].some(o=>o.value===previous)) select.value=previous;
    button.disabled = !targets.length;
  };
  button.addEventListener('click', () => { const target=getTargets()[Number(select.value)]; if(target) open(target, button); });
  return refresh;
}
