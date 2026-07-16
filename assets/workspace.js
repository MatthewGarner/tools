/* Collapsible rail + zoom controller for the DSL tools' workspace. */

/* Export/copy/snapshot buttons act on the rendered diagram; until one exists
   they'd be silent no-ops, so reflect that state instead. The touch Undo
   button is exempt: it acts on the EDITOR's history, which exists (and may
   hold a revertable edit) even while the preview shows a placeholder. */
export function setActionsEnabled(on){
  for(const el of document.querySelectorAll('.actions button:not(.touch-undo), .actions select'))
    el.disabled = !on;
}

/* Rule 2 (mobile input): phones have no ⌘Z, so "every edit is an undoable text
   rewrite" is only true with a visible control. One ↶ Undo button per tool,
   mounted in the stage's actions row (on phones the stage sits ABOVE the
   editor, so the button is next to the diagram the mis-tap happened on).
   Coarse pointers only — workspace.css hides it wherever a keyboard is likely.
   Always enabled: undo on an empty history is a harmless no-op, and the
   vendored bundle doesn't export undoDepth to gate it more precisely. */
export function mountTouchUndo(actionsEl, editor){
  if(!actionsEl) return null;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn touch-undo';
  b.textContent = '↶ Undo';
  b.setAttribute('aria-label', 'Undo');
  b.addEventListener('click', () => editor.undo());
  const zoom = actionsEl.querySelector('.zoomctl');
  actionsEl.insertBefore(b, zoom ? zoom.nextSibling : actionsEl.firstChild);
  return b;
}

export function initWorkspace({workspace, tab, preview, zoomHost, onCollapseChange}){
  let zoom = 'fit';   // 'fit' | number (1 = natural size)

  function svgEl(){ return preview.querySelector('svg'); }
  function naturalWidth(svg){
    const w = svg.getAttribute('width');
    return w ? parseFloat(w) : svg.viewBox.baseVal.width;
  }
  /* On LANDING, "Fit" fits the FOLD — not just the pane width. Filling the pane's
     width makes a square-ish board (map, gauge) taller than the viewport, so you
     arrive at half a diagram; and the reveal, which waits for the whole thing to be
     in view, was left holding that half at opacity 0. So cap the width by the
     board's OWN aspect (never letterbox it), with a floor below which we'd rather
     overflow than shrink past legibility.
     Collapsing the rail is the user asking for ROOM, so it releases the cap and the
     board grows to the full pane as it always has — they can scroll, and the reveal
     now follows them. Coarse pointers open at natural size and pan (setZoom below),
     so none of this touches phones. */
  const FIT_FLOOR = 560;        // px: never chase a fold shorter than this
  const WIDE = 520;             // the narrow-relayout bucket (assets/narrow-width.js) — below it, don't cap
  const LEGIBLE = 0.7;          // never shrink a board past this fraction of the width Fit would give it
  function foldHeight(){
    const top = preview.getBoundingClientRect().top + scrollY;   // the pane's document offset
    return Math.max(FIT_FLOOR, innerHeight - top - 28);           // 28 = breathing room under the fold
  }
  /* The cap is a LANDING nicety, and it must never cost legibility to get it:
     - below the narrow bucket the renderer already emits a tall, pane-width
       artefact; capping THAT by its own (very tall) aspect crushes it to a
       fraction of the pane (a 120px roadmap), so leave narrow panes alone;
     - if fitting the fold would shrink the board past LEGIBLE, don't. Better a
       full-size board you scroll (the reveal now follows you) than a legible-
       ceiling breach. */
  /* border-box, NOT clientWidth: a scrollbar appearing inside the pane changes
     clientWidth, which would feed back into the cap and let it oscillate */
  const paneWidth = () => preview.getBoundingClientRect().width;
  function fitCap(svg){
    if(workspace.classList.contains('collapsed')) return 0;      // collapse = "give it room"
    const vb = svg.viewBox.baseVal;
    const aspect = (vb && vb.height) ? vb.width / vb.height : 0;
    const pane = paneWidth();
    if(!aspect || pane < WIDE) return 0;
    const cap = Math.round(aspect * foldHeight());
    return cap >= pane * LEGIBLE ? cap : 0;
  }
  function applyZoom(){
    const svg = svgEl();
    if(!svg) return;
    let w, mw, mi;
    if(zoom === 'fit'){
      const cap = fitCap(svg);
      w = '100%'; mw = cap ? cap + 'px' : '';
      mi = cap ? 'auto' : '';        // centre ONLY a capped board; a zoomed board stays put
    } else { w = Math.round(naturalWidth(svg) * zoom) + 'px'; mw = 'none'; mi = ''; }
    if(svg.style.width !== w) svg.style.width = w;         // idempotent: no style write, no ResizeObserver echo
    if(svg.style.maxWidth !== mw) svg.style.maxWidth = mw;
    if(svg.style.marginInline !== mi) svg.style.marginInline = mi;
  }
  /* The rail collapse ANIMATES the pane's width, so the applyZoom() in setCollapsed
     runs against the pre-transition width. Watch the pane itself and re-apply as it
     settles; window resize is still needed for a vertical-only resize, which moves
     the fold without moving the pane.
     Both live for the page's lifetime by design: initWorkspace runs exactly once per
     page (gauge's sits inside a one-shot boot()), so there is nothing to tear down —
     and a destroy() no caller invokes would be dead API, not hygiene. */
  new ResizeObserver(applyZoom).observe(preview);
  addEventListener('resize', applyZoom);
  function setZoom(z){
    zoom = z;
    for(const b of zoomHost.querySelectorAll('button')){
      const active = b.dataset.z === String(z);
      b.classList.toggle('on', active);
      b.setAttribute('aria-pressed', String(active));   // a SR user hears which zoom is active
    }
    applyZoom();
  }

  /* zoom control */
  const mk = (label, z, title) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.z = String(z);
    b.title = title;
    b.addEventListener('click', () => {
      if(z === 'minus') setZoom((zoom === 'fit' ? 1 : zoom) / 1.25);
      else if(z === 'plus') setZoom((zoom === 'fit' ? 1 : zoom) * 1.25);
      else setZoom(z);
    });
    zoomHost.appendChild(b);
    return b;
  };
  mk('Fit', 'fit', 'Scale to the pane width');
  mk('100%', 1, 'Natural size');
  mk('−', 'minus', 'Zoom out');
  mk('+', 'plus', 'Zoom in');
  /* fingers: Fit shrinks a board-width diagram below legibility — start at
     natural size and let the pane pan (the preview already scrolls) */
  setZoom(matchMedia('(pointer: coarse)').matches ? 1 : 'fit');

  /* re-apply zoom whenever the app re-renders the preview */
  new MutationObserver(applyZoom).observe(preview, {childList: true});

  /* collapse */
  function setCollapsed(c){
    workspace.classList.toggle('collapsed', c);
    tab.textContent = c ? '›' : '‹';
    tab.title = (c ? 'Show' : 'Hide') + ' the editor  [';
    tab.setAttribute('aria-expanded', String(!c));
    applyZoom();                                    // collapsing releases the fold cap (see applyZoom)
    if(onCollapseChange) onCollapseChange(c);
  }
  tab.addEventListener('click', () => setCollapsed(!workspace.classList.contains('collapsed')));
  window.addEventListener('keydown', e => {
    if(e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey){
      const el = document.activeElement;
      if(el && (el.closest('.cm-editor') || /INPUT|TEXTAREA|SELECT/.test(el.tagName))) return;
      setCollapsed(!workspace.classList.contains('collapsed'));
    }
  });
  setCollapsed(false);

  return {
    collapsed: () => workspace.classList.contains('collapsed'),
    setCollapsed,
    applyZoom,                          // run synchronously post-swap so a FLIP reads final-scale rects
    scale: () => {                      // MEASURED effective scale (fit has no numeric zoom)
      const svg = svgEl(); if(!svg) return 1;
      const vbw = svg.viewBox.baseVal.width || naturalWidth(svg);
      return vbw ? svg.getBoundingClientRect().width / vbw : 1;
    },
  };
}
