import {recentStore} from './recent-store.js';

const scope = document.documentElement.dataset.recentScope || document.documentElement.dataset.mgSection;
const tool = location.pathname.split('/').filter(part=>part && part!=='index.html').at(-1);
const el = (tag, text, cls) => {const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
const button = text => {const b=el('button',text);b.type='button';return b;};
const store = () => recentStore(localStorage,scope);
const failure = error => error?.name === 'QuotaExceededError'
  ? 'Device storage is full. Nothing was saved. Remove an older copy or free some browser storage.'
  : error?.name === 'SecurityError' ? 'Browser storage is unavailable. Allow site storage to use Your work.'
  : error.message || 'Could not access Your work. Try again.';

function modal(title, opener){
  const dialog=el('dialog',null,'recent-dialog'), heading=el('h2',title);
  const form=el('form'), info=el('p',null,'recent-note'), error=el('p',null,'recent-error');
  heading.id='recent-heading';dialog.setAttribute('aria-labelledby',heading.id);
  error.setAttribute('role','alert');const actions=el('div',null,'recent-dialog-actions');
  const cancel=button('Cancel');cancel.addEventListener('click',()=>dialog.close());actions.append(cancel);
  form.append(heading,info,error,actions);dialog.append(form);document.body.append(dialog);
  dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus();});
  return {dialog,form,info,error,actions};
}
function nameField(form, before, value){
  const label=el('label','Copy name'), input=el('input');input.type='text';input.required=true;input.maxLength=120;input.value=value;
  label.append(input);form.insertBefore(label,before);return input;
}

export {scope,tool,el,button,store,failure,modal,nameField};
