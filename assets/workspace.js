/* Collapsible rail + zoom controller for the DSL tools' workspace. */

/* Export/copy/snapshot buttons act on the rendered diagram; until one exists
   they'd be silent no-ops, so reflect that state instead. */
export function setActionsEnabled(on){
  for(const el of document.querySelectorAll('.actions button, .actions select'))
    el.disabled = !on;
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
  const FIT_FLOOR = 560;                                   // px: never shrink a board below this tall
  function foldHeight(){
    const top = preview.getBoundingClientRect().top + scrollY;   // the pane's document offset
    return Math.max(FIT_FLOOR, innerHeight - top - 28);           // 28 = breathing room under the fold
  }
  function applyZoom(){
    const svg = svgEl();
    if(!svg) return;
    if(zoom === 'fit'){
      const vb = svg.viewBox.baseVal;
      const aspect = (vb && vb.height) ? vb.width / vb.height : 0;
      const capped = aspect && !workspace.classList.contains('collapsed');
      svg.style.width = '100%';
      svg.style.maxWidth = capped ? Math.round(aspect * foldHeight()) + 'px' : '';
    } else {
      svg.style.width = Math.round(naturalWidth(svg) * zoom) + 'px';
      svg.style.maxWidth = 'none';
    }
  }
  addEventListener('resize', applyZoom);                   // the fold moves with the window
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
