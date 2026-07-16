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

/* The house card-menu shape, shared by the DSL card tools (why, tree): Rename
   first, one type-specific field row (`field` — a {label, opens} spec), an
   ＋ Add action, and a danger Remove last. Building all six per-node-kind menus
   from this keeps the row order and the ＋ (U+FF0B) glyph from drifting between
   tools. `add` is the noun after "＋ Add "; `remove` defaults to "Remove branch"
   (leaf/terminal nodes pass "Remove"). The onCommit guards match the resulting
   '✖'-prefixed sentinels: startsWith('✖＋ Add') and the exact Remove strings. */
export function cardMenu({field, add, remove = 'Remove branch'}){
  return {menu: [
    {label: 'Rename…', opens: 'label'},
    field,
    {label: '＋ Add ' + add, action: true},
    {label: remove, action: true, danger: true},
  ]};
}

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
       document.body. Deferred + guarded: close() can run from the capturing
       "away" pointerdown listener (clicking a DIFFERENT control to dismiss),
       from an input's blur (focus already moving elsewhere), or right before
       a commit that itself grabs focus on purpose (e.g. tree/wardley focus
       the editor to pre-select a new item's placeholder) — calling .focus()
       synchronously, or unconditionally even deferred, steals that gesture
       (confirmed empirically both ways: a chip's click handler never ran,
       and separately the editor lost its placeholder selection). A macrotask
       runs after the browser finishes the current gesture, and by then
       activeElement is <body> ONLY if nothing else claimed focus in the
       meantime — that's the one case a genuine dismiss (Escape, or a blur
       with nowhere to go) actually needs restoring. */
    if(el && typeof el.focus === 'function') setTimeout(() => {
      if(!active && document.activeElement === document.body) el.focus();
    }, 0);
  }
  /* Build a popover of menu rows at `rect`. `activeEl` is the SVG trigger the
     popover belongs to — used by opens/action rows for their data-line/edit
     payload and as the focus-restore target. Rows: opens | action | commit
     (self-contained {kind,line,oldRaw,value}) | submenu (nested rows). Shared
     by the top-level menu open and every submenu row so there's one build path. */
  function renderPopoverRows(rows, rect, activeEl){
    const pop = document.createElement('div');
    pop.className = 'eip-pop';
    pop.style.left = rect.left + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
    for(const row of rows){
      const b = document.createElement('button');
      b.textContent = row.label;
      if(row.danger) b.classList.add('danger');
      if(row.on) b.classList.add('on');
      b.addEventListener('click', () => {
        if(row.commit){
          close();
          onCommit(row.commit.kind, row.commit.line, row.commit.oldRaw || '', row.commit.value, activeEl);
        } else if(row.opens){
          const t = activeEl.closest('svg').querySelector('[data-line="' + activeEl.dataset.line + '"][data-edit="' + row.opens + '"]' + (row.sel || ''));
          close();
          if(t) open(t);
        } else if(row.submenu){
          const r = b.getBoundingClientRect();        // capture BEFORE close() disposes the button
          close();
          renderPopoverRows(row.submenu, r, activeEl); // sub-popover; same focus-restore target
        } else {                                       // action row
          close();
          onCommit(activeEl.dataset.edit, +activeEl.dataset.line, activeEl.dataset.raw || '', '✖' + row.label, activeEl);
        }
      });
      pop.appendChild(b);
    }
    document.body.appendChild(pop);
    clampToViewport(pop, rect);
    const away = e => { if(!pop.contains(e.target)) close(); };
    active = {input: pop, el: activeEl, away};
    document.addEventListener('pointerdown', away, true);
    trapPopoverFocus(pop, close);
  }
  /* coarse-pointer cycle popover (Rule 1): a multi-value cycle → marked option
     buttons that commit the picked value (empty value reads as "none"); a ['×']
     remove cycle → a single danger button that commits '×'. Positioned + dismissed
     like the choice popover; the app's onCommit maps the value exactly as a fine
     click would, so no per-tool changes are needed. */
  function openCyclePopover(el, rect, kind, raw, cyc, isRemove){
    const line = +el.dataset.line;
    const pop = document.createElement('div');
    pop.className = 'eip-pop';
    pop.style.left = rect.left + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
    if(isRemove){
      const b = document.createElement('button');
      b.textContent = 'Remove'; b.classList.add('danger');
      b.addEventListener('click', () => { close(); onCommit(kind, line, raw, '×', el); });
      pop.appendChild(b);
    } else {
      for(const v of cyc){
        const b = document.createElement('button');
        b.textContent = v || 'none';
        if(v === raw) b.classList.add('on');
        b.addEventListener('click', () => { close(); if(v !== raw) onCommit(kind, line, raw, v, el); });
        pop.appendChild(b);
      }
    }
    document.body.appendChild(pop);
    clampToViewport(pop, rect);
    const away = e => { if(!pop.contains(e.target)) close(); };
    active = {input: pop, el, away};
    document.addEventListener('pointerdown', away, true);
    trapPopoverFocus(pop, close);
  }
  function open(el){
    close();
    const kind = el.dataset.edit;
    const spec = kinds[kind];
    if(!spec) return;
    const rect = el.getBoundingClientRect();
    const raw = el.dataset.raw || '';
    /* cycle kinds step to the next value on click. On a COARSE pointer a bare tap
       must NOT commit silently (the mis-tap trap): a multi-value cycle opens a
       marked options popover to PICK; a ['×'] remove cycle opens a one-row danger
       confirm. Fine pointers, and a single non-× step sentinel (timeline's wide
       status), keep the instant step. (mobile-input Rule 1) */
    if(spec.cycle){
      const cyc = spec.cycle;
      const isRemove = cyc.length === 1 && cyc[0] === '×';
      if(coarse() && (cyc.length > 1 || isRemove)){ openCyclePopover(el, rect, kind, raw, cyc, isRemove); return; }
      const i = cyc.indexOf(raw);
      onCommit(kind, +el.dataset.line, raw, cyc[(i + 1 + cyc.length) % cyc.length], el);
      return;
    }
    /* menu kinds open a card popover: rows either open another target on the
       same card (data-line routes to the right sibling) or commit a '✖'-prefixed
       action sentinel, same as the actions rows below. spec.menu may be a
       function (el)=>rows, resolved here so it can read the trigger's own
       data- payload (why's assumption submenus need the clicked line). */
    if(spec.menu){
      const rows = typeof spec.menu === 'function' ? spec.menu(el) : spec.menu;
      renderPopoverRows(rows, rect, el);
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
    if(spec.inputmode) input.inputMode = spec.inputmode;   // numeric keypad on phones (Rule 3); dates stay text for `..`
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

  const coarse = () => matchMedia('(pointer: coarse)').matches;
  preview.addEventListener('click', e => {
    let el = e.target.closest && e.target.closest('[data-edit]');
    if(!el || !preview.contains(el)) return;
    /* coarse pointers are menu-first: a tap on an in-card field opens that
       card's menu (which routes to the same field at a 44px row) instead of
       the field, and can't silently cycle a status pill. Gate on the tap
       landing inside the menu's own hit-rect, so a field that shares the line
       but lives elsewhere (map's readout panel) keeps its direct edit. Fine
       pointers are unchanged. */
    if(coarse() && !el.hasAttribute('data-menu') && el.dataset.line != null){
      const svg = el.closest('svg');
      if(svg) for(const m of svg.querySelectorAll('[data-menu][data-line="' + el.dataset.line + '"]')){
        const r = (m.querySelector('[data-hit]') || m).getBoundingClientRect();
        if(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom){ el = m; break; }
      }
    }
    e.preventDefault();
    open(el);
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
