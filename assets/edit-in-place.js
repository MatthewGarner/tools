/* Edit-in-place: interactions on the rendered diagram become text edits.
   attach(preview, {kinds, onCommit}) — kinds: {kindName: {validate(v), placeholder?}};
   editable elements carry data-edit (kind), data-line (source line), data-raw
   (exact source component, pre-filled). Commit calls onCommit(kind, line, raw, value);
   the app owns the line rewrite + editor dispatch (undoable). */

export function attachEditInPlace(preview, {kinds, onCommit}){
  let active = null;   // {input, el}

  function close(){
    if(!active) return;
    const {input} = active;
    active = null;          // null first: input.remove() fires blur synchronously
    input.remove();
  }
  function open(el){
    close();
    const kind = el.dataset.edit;
    const spec = kinds[kind];
    if(!spec) return;
    const rect = el.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'eip-input';
    input.value = el.dataset.raw || '';
    input.setAttribute('aria-label', 'Edit ' + kind);
    input.style.left = rect.left + 'px';
    input.style.top = (rect.top - 6) + 'px';
    input.style.minWidth = Math.max(rect.width + 34, 96) + 'px';
    document.body.appendChild(input);
    input.focus();
    input.select();
    active = {input, el};

    const commit = () => {
      if(!active) return;
      const v = input.value;
      if(v.trim() === (el.dataset.raw || '').trim()){ close(); return; }
      if(spec.validate && !spec.validate(v)){
        input.classList.remove('invalid');
        void input.offsetWidth;          // restart the shake
        input.classList.add('invalid');
        input.focus();
        return;
      }
      const line = +el.dataset.line;
      close();
      onCommit(kind, line, el.dataset.raw || '', v.trim());
    };
    input.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); commit(); }
      else if(e.key === 'Escape'){ e.preventDefault(); close(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', commit);
  }

  preview.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-edit]');
    if(el && preview.contains(el)){ e.preventDefault(); open(el); }
  });
  window.addEventListener('scroll', close, true);
  return {close};
}
