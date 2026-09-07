import {encodeHash} from './series.js';

// Snapshot the model at click time: location.hash can lag behind a recent edit.
export function mountModelLink(host, {getState, maxLength = 6000, label = 'Copy model link'}){
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'btn model-link'; button.textContent = label;
  const status = document.createElement('span');
  status.className = 'method model-link-status'; status.setAttribute('role', 'status');
  host.append(button, status);
  button.addEventListener('click', async () => {
    status.textContent = ''; button.disabled = true;
    try{
      const hash = await encodeHash(getState());
      if(hash.length >= maxLength){
        status.textContent = 'This model is too large for a link. Export the source instead.';
        return;
      }
      const url = new URL(location.pathname, location.origin); url.hash = hash;
      try{
        await navigator.clipboard.writeText(url.href);
        status.textContent = 'Model link copied — opens a separate copy.';
      }catch{
        const dialog = document.createElement('dialog'); dialog.className = 'model-link-dialog';
        dialog.setAttribute('aria-label', 'Copy model link');
        const heading = document.createElement('h2'); heading.textContent = 'Copy model link';
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
  });
  return button;
}
