import {mountRecentSave} from './recent-work.js';
import {encodeHash} from './series.js';
import {offer} from './recent-ui.js';

/* The longest link Share will copy: the limit Case always had and the Energy pages' old Copy link allowed.
   Pages whose models stay small keep the 6000 default in mountModelLink. */
export const SHARE_MAX = 24000;

// Snapshot the model at click time: location.hash can lag behind a recent edit.
// Used by the shell's Share; getHash is the same hook
// Save a copy uses, and the link never comes from location.hash.
const sharing = new WeakSet();
export async function shareModel({getState, getHash, maxLength = 6000, status, button, done = 'Model link copied — opens a separate copy.', title = 'Copy model link'}){
  /* never disable the button while it works: a disabled button drops keyboard focus to the page. Ignore a re-press instead. */
  if(sharing.has(button)) return;
  sharing.add(button);
  status.textContent = '';
  try{
    const state = getState ? getState() : null;
    let hash;
    try{ hash = getHash ? await getHash(state) : await encodeHash(state); }
    catch(error){
      /* the page's own link builder refused: its message is the reason (an Error from a page that has none gets the generic line) */
      status.textContent = error instanceof Error && error.message ? error.message : 'Could not create the link. Try again or export the source.';
      return;
    }
    hash = typeof hash === 'string' ? hash.replace(/^.*#/, '') : '';
    /* a missing or empty hash is a model too big to encode, not a crash */
    if(!hash || hash.length >= maxLength){
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
  finally{ sharing.delete(button); }
}

/* Every page has the stamped header, so a page's link is Share (and Save a copy): hand the shell the state
   getter and the size limit. */
export function mountModelLink({getState, maxLength = 6000}){
  mountRecentSave({getState});
  offer({shareMax: maxLength});
}
