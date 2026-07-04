/* Collapsible rail + zoom controller for the DSL tools' workspace. */

export function initWorkspace({workspace, tab, preview, zoomHost, onCollapseChange}){
  let zoom = 'fit';   // 'fit' | number (1 = natural size)

  function svgEl(){ return preview.querySelector('svg'); }
  function naturalWidth(svg){
    const w = svg.getAttribute('width');
    return w ? parseFloat(w) : svg.viewBox.baseVal.width;
  }
  function applyZoom(){
    const svg = svgEl();
    if(!svg) return;
    if(zoom === 'fit'){
      svg.style.width = '100%';
      svg.style.maxWidth = '';
    } else {
      svg.style.width = Math.round(naturalWidth(svg) * zoom) + 'px';
      svg.style.maxWidth = 'none';
    }
  }
  function setZoom(z){
    zoom = z;
    for(const b of zoomHost.querySelectorAll('button')){
      b.classList.toggle('on', b.dataset.z === String(z));
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
  setZoom('fit');

  /* re-apply zoom whenever the app re-renders the preview */
  new MutationObserver(applyZoom).observe(preview, {childList: true});

  /* collapse */
  function setCollapsed(c){
    workspace.classList.toggle('collapsed', c);
    tab.textContent = c ? '›' : '‹';
    tab.title = (c ? 'Show' : 'Hide') + ' the editor  [';
    tab.setAttribute('aria-expanded', String(!c));
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
  };
}
