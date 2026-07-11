/* Edit-in-place: interactions on the rendered diagram become text edits.
   attach(preview, {kinds, onCommit}) — kinds: {kindName: {validate(v), placeholder?}};
   editable elements carry data-edit (kind), data-line (source line), data-raw
   (exact source component, pre-filled). Commit calls onCommit(kind, line, raw, value, el)
   — el is the clicked element, for apps whose targets carry extra data- payload;
   the app owns the line rewrite + editor dispatch (undoable). */
import {trapPopoverFocus} from './popover-focus.js';
export {trapPopoverFocus};

/* Floating elements (popover, input) are positioned from the target's rect
   before their own size is known; clamp after append so they never render
   off the left/right edge, and flip above the target if they'd run past
   the bottom — phones near screen edges hit this often. */
function clampToViewport(el, rect){
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = parseFloat(el.style.left), y = parseFloat(el.style.top);
  x = Math.min(Math.max(8, x), Math.max(8, innerWidth - w - 8));
  if(y + h > innerHeight - 8) y = Math.max(8, rect.top - h - 6);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

let errUid = 0;

export function attachEditInPlace(preview, {kinds, onCommit}){
  let active = null;   // {input, el, away, errEl}

  function close(){
    if(!active) return;
    const {input, away, el, errEl} = active;
    if(away) document.removeEventListener('pointerdown', away, true);
    active = null;          // null first: input.remove() fires blur synchronously
    input.remove();
    if(errEl) errEl.remove();
    /* restore focus to the trigger — it's tabindex="0" now (keyboard-fix),
       so a keyboard/AT user lands back where they started instead of at
       document.body. A stale/detached el (e.g. a commit that already
       re-rendered the diagram) makes focus() a harmless no-op.
       Deferred: close() can run from the capturing "away" pointerdown
       listener (clicking a DIFFERENT control to dismiss) or from an
       input's blur (focus already moving elsewhere) — calling .focus()
       synchronously in either case steals that in-flight click/focus
       gesture (confirmed empirically: a chip's own click handler never
       ran when this fired synchronously). A macrotask runs after the
       browser finishes that gesture, so the real target still gets it. */
    if(el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0);
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
    /* menu kinds open a card popover: rows either open another target on the
       same card (data-line routes to the right sibling) or commit a '✖'-prefixed
       action sentinel, same as the actions rows below */
    if(spec.menu){
      const pop = document.createElement('div');
      pop.className = 'eip-pop';
      pop.style.left = rect.left + 'px';
      pop.style.top = (rect.bottom + 4) + 'px';
      for(const row of spec.menu){
        const b = document.createElement('button');
        b.textContent = row.label;
        if(row.danger) b.classList.add('danger');
        b.addEventListener('click', () => {
          const line = +el.dataset.line;
          if(row.opens){
            const t = el.closest('svg').querySelector('[data-line="' + el.dataset.line + '"][data-edit="' + row.opens + '"]' + (row.sel || ''));
            close();
            if(t) open(t);
          } else {                                  // action row
            close();
            onCommit(el.dataset.edit, line, el.dataset.raw || '', '✖' + row.label, el);
          }
        });
        pop.appendChild(b);
      }
      document.body.appendChild(pop);
      clampToViewport(pop, rect);
      const away = e => { if(!pop.contains(e.target)) close(); };
      active = {input: pop, el, away};
      document.addEventListener('pointerdown', away, true);
      trapPopoverFocus(pop, close);
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
      clampToViewport(pop, rect);
      const away = e => { if(!pop.contains(e.target)) close(); };
      active = {input: pop, el, away};
      document.addEventListener('pointerdown', away, true);
      trapPopoverFocus(pop, close);
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
    /* always-present (empty until invalid), sr-only error text — a screen
       reader hears it via aria-live the moment validate() fails; sighted
       users keep the existing shake + red border as the primary signal. */
    const errEl = document.createElement('div');
    errEl.className = 'eip-err sr-only';
    errEl.id = 'eip-err-' + (++errUid);
    errEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(errEl);
    input.setAttribute('aria-describedby', errEl.id);
    clampToViewport(input, rect);
    input.focus();
    input.select();
    active = {input, el, errEl};

    const commit = () => {
      if(!active) return;
      const v = input.value;
      if(v.trim() === (el.dataset.raw || '').trim()){ close(); return; }
      if(spec.validate && !spec.validate(v)){
        input.classList.remove('invalid');
        void input.offsetWidth;          // restart the shake
        input.classList.add('invalid');
        input.setAttribute('aria-invalid', 'true');
        errEl.textContent = 'That value isn’t valid for ' + kind + ' — try again.';
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
    /* a revision in progress silences the stale error rather than leaving a
       screen reader stuck on an announcement that may no longer apply */
    input.addEventListener('input', () => {
      if(!input.classList.contains('invalid')) return;
      input.classList.remove('invalid');
      input.removeAttribute('aria-invalid');
      errEl.textContent = '';
    });
    input.addEventListener('blur', commit);
  }

  preview.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-edit]');
    if(el && preview.contains(el)){ e.preventDefault(); open(el); }
  });
  /* keyboard equivalent: every [data-edit] target carries tabindex="0" at
     render time — Enter/Space fires the same open() the click path calls. */
  preview.addEventListener('keydown', e => {
    if(e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
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
