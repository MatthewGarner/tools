import {mountRecentSave} from './recent-work.js';
import {encodeHash} from './series.js';
import {offer} from './recent-ui.js';

/* The longest link Share will copy: the limit Case always had and the Energy pages' old Copy link allowed.
   Pages whose models stay small keep the 6000 default in mountModelLink. */
export const SHARE_MAX = 24000;

// Snapshot the model at click time: location.hash can lag behind a recent edit.
// Used by the shell's Share; getHash is the same hook
// Save a copy uses, and the link never comes from location.hash.
export async function shareModel({getState, getHash, maxLength = 6000, status, button, done = 'Model link copied — opens a separate copy.', title = 'Copy model link'}){
  status.textContent = ''; button.disabled = true;
  try{
    const state = getState ? getState() : null;
    const hash = getHash ? (await getHash(state)).replace(/^.*#/, '') : await encodeHash(state);
    if(hash.length >= maxLength){
      status.textContent = 'This model is too large for a link. Export the source instead.';
      return;
    }
    const url = new URL(location.pathname, location.origin); url.hash = hash;
    try{
      await navigator.clipboard.writeText(url.href);
      status.textContent = done;
    }catch{
      const dialog = document.createElement('dialog'); dialog.className = 'model-link-dialog';
      dialog.setAttribute('aria-label', title);
      const heading = document.createElement('h2'); heading.textContent = title;
      const field = document.createElement('label'); field.textContent = 'Select and copy this link';
      const input = document.createElement('textarea'); input.readOnly = true; input.value = url.href;
      const close = document.createElement('button'); close.className = 'btn'; close.textContent = 'Done';
      field.append(input); dialog.append(heading, field, close); document.body.append(dialog);
      close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => { dialog.remove(); button.focus(); });
      dialog.showModal(); input.focus(); input.select();
    }
  }catch{ status.textContent = 'Could not create the link. Try again or export the source.'; }
  finally{ button.disabled = false; }
}

/* Every page has the stamped header, so a page's link is Share (and Save a copy): hand the shell the state
   getter and the size limit. */
export function mountModelLink({getState, maxLength = 6000}){
  mountRecentSave({getState});
  offer({shareMax: maxLength});
}
