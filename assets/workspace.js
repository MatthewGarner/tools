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

export const FIT_READABILITY_FLOOR = 0.70;

/* Pure threshold decision: Fit is an automatic convenience, so it may not make
   data illegible. Explicit numeric zoom remains the user's choice and bypasses
   this guard. A renderer can raise (never lower) the shared floor by declaring
   data-min-readable-scale on its SVG root. */
export function fitReadabilityDecision({naturalWidth,fitWidth,declaredMinScale}){
  const natural=Number(naturalWidth),fit=Number(fitWidth),declared=Number(declaredMinScale);
  const minScale=Math.max(FIT_READABILITY_FLOOR,
    Number.isFinite(declared)&&declared>0?declared:FIT_READABILITY_FLOOR);
  const scale=natural>0&&Number.isFinite(fit)?fit/natural:1;
  return {guard:Number.isFinite(scale)&&scale<minScale,scale,minScale};
}

export function readingEligibility({pointerCoarse, workspaceWide = true, initialCollapsed, guarded, manualOverride = false}){
  return !pointerCoarse && workspaceWide && !initialCollapsed && !manualOverride && !!guarded;
}

/* Keep the transient presentation state distinct from the persisted rail state.
   This is deliberately pure: an automatic reader decision can never be
   `collapsed`, so it has no route to an app's onCollapseChange/hash writer. */
export function initialReadingState(options){
  if(options.initialCollapsed) return 'collapsed';
  return readingEligibility(options) ? 'reading' : 'expanded';
}

export function initWorkspace({workspace, tab, preview, zoomHost, onCollapseChange, autoFold = false,
  collapsedLabel = 'Source', collapsedAriaLabel = 'Show source editor', expandedLabel = '‹', initialCollapsed = false,
  initialReading = false, focusEditor = null}){
  let zoom = 'fit';   // 'fit' | number (1 = natural size)
  let reading = false;
  let readingResolved = initialReading !== 'when-guarded';
  let readingOverride = false;
  let manualRail = null;   // null = reader safeguard may fold; explicit choice wins
  const MIN_ZOOM = 0.5, MAX_ZOOM = 3;

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
  function fitCap(svg, {pane = paneWidth(), forExpanded = false} = {}){
    if(workspace.classList.contains('collapsed') || (!forExpanded && (reading || workspace.classList.contains('reading-pending')))) return 0; // collapse = "give it room"
    const vb = svg.viewBox.baseVal;
    const aspect = (vb && vb.height) ? vb.width / vb.height : 0;
    if(!aspect || pane < WIDE) return 0;
    return Math.round(aspect * foldHeight());
  }
  let fitAdvice = null;
  function editorFocused(){
    const el = document.activeElement;
    return !!(el && el.closest && el.closest('.cm-editor'));
  }
  function advisory(){
    if(fitAdvice) return fitAdvice;
    const el=document.createElement('div');
    el.className='fit-readability-advisory';
    el.hidden=true;
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    const copy=document.createElement('span');
    copy.textContent=initialReading === 'when-guarded'
      ? 'This artefact is wider than the authoring view.'
      : 'Fit would make this artefact hard to read. Finish the source edit to give the artefact room.';
    const action=document.createElement('button');
    action.type='button';
    action.textContent='Open reading view';
    action.addEventListener('click',()=>{
      readingOverride=true;
      setReading(true);
    });
    el.append(copy,action);
    preview.parentNode.insertBefore(el,preview);
    fitAdvice=el;
    return el;
  }
  function showAdvisory(show){
    if(!show&& !fitAdvice)return;
    advisory().hidden=!show;
  }
  function applyZoom(){
    const svg = svgEl();
    if(!svg){showAdvisory(false);return;}
    let w, mw, mi;
    if(zoom === 'fit'){
      const cap = fitCap(svg);
      const pane=paneWidth(),fitWidth=cap?Math.min(pane,cap):pane;
      const declared=svg.getAttribute('data-min-readable-scale');
      const decision=fitReadabilityDecision({naturalWidth:naturalWidth(svg),fitWidth,declaredMinScale:declared});
      const guard=!matchMedia('(pointer: coarse)').matches&&decision.guard;
      if(!initialReading && autoFold && guard && !workspace.classList.contains('collapsed') && !reading && !editorFocused() && manualRail !== false){
        setCollapsed(true, {auto:true});
        return;
      }
      if(guard){w=Math.round(naturalWidth(svg))+'px';mw='none';mi='';}
      else {w='100%';mw=cap?cap+'px':'';mi=cap?'auto':'';}
      showAdvisory(guard&&!reading&&!workspace.classList.contains('collapsed'));
    } else {
      w = Math.round(naturalWidth(svg) * zoom) + 'px'; mw = 'none'; mi = '';
      showAdvisory(false);
    }
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
  const reconcileLayout = () => {
    /* A fine-pointer browser can be narrowed into the stacked/mobile workspace
       without a reload. That layout hides the rail tab, so leave presentation
       mode rather than stranding the source behind it. This is not a collapse and
       therefore remains URL-neutral. */
    if(reading && !gridWorkspace()) setReading(false, {automatic:true});
    else applyZoom();
  };
  new ResizeObserver(reconcileLayout).observe(preview);
  addEventListener('resize', reconcileLayout);
  function setZoom(z){
    if(typeof z === 'number') z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    zoom = z;
    for(const b of zoomHost.querySelectorAll('button')){
      const active = b.dataset.z === String(z);
      b.classList.toggle('on', active);
      b.setAttribute('aria-pressed', String(active));   // a SR user hears which zoom is active
      if(b.dataset.z === 'minus') b.disabled = typeof zoom === 'number' && zoom <= MIN_ZOOM;
      if(b.dataset.z === 'plus') b.disabled = typeof zoom === 'number' && zoom >= MAX_ZOOM;
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
  let renderEpoch = 0;
  let readingFrame = 0;
  const gridWorkspace = () => getComputedStyle(workspace).display === 'grid';
  function resolveInitialReading(epoch, svg){
    if(readingResolved || readingOverride || !svg || !svg.isConnected || epoch !== renderEpoch) return;
    const rect = svg.getBoundingClientRect();
    if(!rect.width || !rect.height){
      readingFrame = requestAnimationFrame(() => resolveInitialReading(epoch, svg));
      return;
    }
    const railWidth = 420;
    const pane = paneWidth();
    /* `reading-pending` has already expanded #preview to the full reader pane.
       Back out the rail once to recover the ordinary authoring width that the
       guard must judge; `pane` is not the pre-pending stage width here. */
    const expandedPane = Math.max(0, pane - railWidth);
    const cap = fitCap(svg, {pane:expandedPane, forExpanded:true});
    const fitWidth = cap ? Math.min(expandedPane, cap) : expandedPane;
    const decision = fitReadabilityDecision({naturalWidth:naturalWidth(svg), fitWidth,
      declaredMinScale:svg.getAttribute('data-min-readable-scale')});
    readingResolved = true;
    workspace.classList.remove('reading-pending');
    const next = initialReadingState({pointerCoarse:matchMedia('(pointer: coarse)').matches,
      workspaceWide:gridWorkspace(), initialCollapsed:workspace.classList.contains('collapsed'),
      guarded:decision.guard, manualOverride:readingOverride});
    if(next === 'reading') setReading(true, {automatic:true});
    else applyZoom();
  }
  new MutationObserver(() => {
    renderEpoch++;
    applyZoom();
    if(initialReading === 'when-guarded' && !readingResolved && !readingOverride){
      const epoch = renderEpoch, svg = svgEl();
      if(!svg) return; // Empty/invalid documents retain their visible source rail.
      if(readingFrame) cancelAnimationFrame(readingFrame);
      readingFrame = requestAnimationFrame(() => resolveInitialReading(epoch, svg));
    }
  }).observe(preview, {childList: true});

  function setReading(open, {automatic = false} = {}){
    if(!automatic){ readingOverride=true; readingResolved=true; }
    reading=!!open;
    workspace.classList.toggle('focus-artefact', reading);
    workspace.dataset.workspaceView = reading ? 'reading' : 'expanded';
    tab.textContent = reading ? collapsedAriaLabel : expandedLabel;
    tab.title = reading ? collapsedAriaLabel : 'Hide source editor';
    tab.setAttribute('aria-label', reading ? collapsedAriaLabel : 'Hide source editor');
    tab.setAttribute('aria-expanded', String(!reading));
    applyZoom();
    if(!reading && !automatic && typeof focusEditor === 'function') requestAnimationFrame(() => focusEditor());
  }

  /* collapse */
  function setCollapsed(c, {auto = false} = {}){
    if(!auto){ manualRail = c; readingOverride=true; readingResolved=true; }
    reading=false;
    workspace.classList.remove('reading-pending');
    workspace.classList.remove('focus-artefact');
    workspace.classList.toggle('collapsed', c);
    workspace.dataset.workspaceView = c ? 'collapsed' : 'expanded';
    tab.textContent = c ? collapsedLabel : expandedLabel;
    tab.title = c ? collapsedAriaLabel : 'Hide source editor';
    tab.setAttribute('aria-label', c ? collapsedAriaLabel : 'Hide source editor');
    tab.setAttribute('aria-expanded', String(!c));
    applyZoom();                                    // collapsing releases the fold cap (see applyZoom)
    if(onCollapseChange) onCollapseChange(c, {auto});
  }
  function toggleCollapsed(){
    if(reading){
      setReading(false);
      return;
    }
    setCollapsed(!workspace.classList.contains('collapsed'));
  }
  tab.addEventListener('click', toggleCollapsed);
  tab.setAttribute('aria-controls', 'cmhost');
  window.addEventListener('keydown', e => {
    if(e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey){
      const el = document.activeElement;
      if(el && (el.closest('.cm-editor') || /INPUT|TEXTAREA|SELECT/.test(el.tagName))) return;
      toggleCollapsed();
    }
  });
  setCollapsed(initialCollapsed, {auto:true});
  if(initialReading === 'when-guarded' && !initialCollapsed && !matchMedia('(pointer: coarse)').matches && gridWorkspace()){
    workspace.classList.add('reading-pending');
    workspace.dataset.workspaceView = 'pending';
  }

  return {
    collapsed: () => workspace.classList.contains('collapsed'),
    reading: () => reading,
    readingPending: () => workspace.classList.contains('reading-pending'),
    setCollapsed,
    applyZoom,                          // run synchronously post-swap so a FLIP reads final-scale rects
    scale: () => {                      // MEASURED effective scale (fit has no numeric zoom)
      const svg = svgEl(); if(!svg) return 1;
      const vbw = svg.viewBox.baseVal.width || naturalWidth(svg);
      return vbw ? svg.getBoundingClientRect().width / vbw : 1;
    },
  };
}
