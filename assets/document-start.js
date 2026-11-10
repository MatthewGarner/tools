/* Keep personal authoring independent of the optional source rail. Relocating
   the existing controls preserves the tool's own start/example semantics. */
import {offer} from './recent-ui.js';
export function mountDocumentStart(chips){
  // A global masthead must never receive New/Examples actions.
  const header = document.querySelector('[data-tool-header]');
  if(!header || !chips) return null;
  /* Stamped shell: File shows New and Examples; the source rail's row goes quiet. */
  const chipStart = chips.querySelector('.start');
  const picks = [...chips.querySelectorAll('.chip:not(.start)')].map(b => ({name: b.textContent, pick: () => b.click()}));
  if(offer({blank: chipStart ? () => chipStart.click() : undefined, examples: picks})){ chips.hidden = true; return null; }
  let actions = header.querySelector('.instrument-actions');
  if(!actions){ actions = document.createElement('div'); actions.className = 'instrument-actions'; header.append(actions); }
  actions.classList.add('document-actions');
  const start = chips.querySelector('.start');
  if(start){
    start.classList.add('btn'); start.textContent = 'New'; start.setAttribute('aria-label', 'Start your own');
    actions.prepend(start);
  }
  chips.querySelector('.lead')?.remove();
  const examples = document.createElement('details'); examples.className = 'action-disclosure document-examples';
  const summary = document.createElement('summary'); summary.className = 'btn'; summary.textContent = 'Examples';
  chips.classList.add('action-menu');
  examples.append(summary, chips);
  if(start) start.after(examples); else actions.prepend(examples);
  chips.addEventListener('click', event => {
    if(!event.target.closest('button')) return;
    examples.open = false; summary.focus();
  });
  examples.addEventListener('keydown', event => {
    if(event.key === 'Escape'){examples.open = false;summary.focus();event.preventDefault();}
  });
  return actions;
}
