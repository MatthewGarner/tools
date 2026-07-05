/* Edit-in-place: interactions on the rendered diagram become text edits.
   attach(preview, {kinds, onCommit}) — kinds: {kindName: {validate(v), placeholder?}};
   editable elements carry data-edit (kind), data-line (source line), data-raw
   (exact source component, pre-filled). Commit calls onCommit(kind, line, raw, value, el)
   — el is the clicked element, for apps whose targets carry extra data- payload;
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
    const raw = el.dataset.raw || '';
    /* cycle kinds commit immediately: click steps to the next value */
    if(spec.cycle){
      const i = spec.cycle.indexOf(raw);
      onCommit(kind, +el.dataset.line, raw, spec.cycle[(i + 1 + spec.cycle.length) % spec.cycle.length], el);
      return;
    }
    /* choice kinds open a popover menu (options, actions, or both) */
    if(spec.options || spec.actions){
      const pop = document.createElement('div');
      pop.className = 'eip-pop';
      pop.style.left = rect.left + 'px';
      pop.style.top = (rect.bottom + 4) + 'px';
      for(const opt of spec.options || []){
        const b = document.createElement('button');
        b.textContent = opt;
        if(opt === raw) b.classList.add('on');
        b.addEventListener('click', () => {
          const line = +el.dataset.line;
          close();
          if(opt !== raw) onCommit(kind, line, raw, opt, el);
        });
        pop.appendChild(b);
      }
      /* action rows (e.g. Remove) commit a '✖'-prefixed sentinel the app maps
         to a rewrite; a bare string is a danger row, {label, danger} spells it out */
      if(spec.actions && spec.actions.length){
        if(spec.options && spec.options.length){
          const sep = document.createElement('div');
          sep.className = 'eip-sep';
          pop.appendChild(sep);
        }
        for(const a of spec.actions){
          const act = typeof a === 'string' ? {label: a, danger: true} : a;
          const b = document.createElement('button');
          b.textContent = act.label;
          if(act.danger) b.classList.add('danger');
          b.addEventListener('click', () => {
            const line = +el.dataset.line;
            close();
            onCommit(kind, line, raw, '✖' + act.label, el);
          });
          pop.appendChild(b);
        }
      }
      document.body.appendChild(pop);
      active = {input: pop, el};
      const away = e => {
        if(!pop.contains(e.target)){ close(); document.removeEventListener('pointerdown', away, true); }
      };
      document.addEventListener('pointerdown', away, true);
      return;
    }
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
      onCommit(kind, line, el.dataset.raw || '', v.trim(), el);
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
  /* page scrolls close the editor; scrolls INSIDE it (select() on an
     overflowing prefill scrolls the input's own content) must not */
  window.addEventListener('scroll', e => {
    if(active && e.target !== active.input) close();
  }, true);
  return {close};
}
