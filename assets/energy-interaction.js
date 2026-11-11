/* Small DOM affordances shared by the Energy instruments. */
import {mountRecentSave} from './recent-work.js';
import {offer} from './recent-ui.js';
import {SHARE_MAX} from './model-link.js';
/* The page's own link builder is what Share copies and Save a copy stores, so a link reopens
   exactly the model the page shows, including what it pins or selects. */
export function wireModelLink(getLink){
  mountRecentSave({getHash:getLink});
  offer({shareMax:SHARE_MAX});
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
