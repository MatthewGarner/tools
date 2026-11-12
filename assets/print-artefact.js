/* Print prints the current view's artefact alone: no controls, no essay, light theme, landscape, fitted to the
   page width, and a row or card is never cut across pages. On beforeprint the artefact is rendered afresh in the
   light theme (whatever the page is showing), cut into page-sized slices at the gaps between rows, and put in a
   holder the print stylesheet shows instead of the page; afterprint takes it away. Nothing changes on screen. */
const PAGE_RATIO = .6;   // landscape A4/Letter body: height / width

/* y positions where a page may end: just under a row, with no row crossing the line */
export function cutPoints(boxes, total, pageHeight){
  const cuts = [];
  let start = 0;
  while(total - start > pageHeight + .5){
    const limit = start + pageHeight;
    const gaps = boxes.map(b => b.bottom + 1)
      .filter(y => y > start + pageHeight * .3 && y <= limit && !boxes.some(b => b.top < y - .5 && b.bottom > y + .5));
    const cut = gaps.length ? Math.max(...gaps) : limit;   // a row taller than a page is the only thing that is cut
    cuts.push(cut); start = cut;
  }
  return cuts;
}

export function printPages(svgText, doc = document){
  const holder = doc.createElement('div');
  holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px';
  holder.innerHTML = svgText;
  doc.body.appendChild(holder);
  const root = holder.querySelector('svg');
  const [, , vw, vh] = root.getAttribute('viewBox').split(/\s+/).map(Number);
  const boxes = [...root.querySelectorAll('[data-key],[data-field-item]')].map(g => { const b = g.getBBox(); return {top: b.y, bottom: b.y + b.height}; });
  const cuts = cutPoints(boxes, vh, vw * PAGE_RATIO);
  const edges = [0, ...cuts, vh];
  const pages = [];
  for(let i = 0; i < edges.length - 1; i++){
    const page = root.cloneNode(true);
    page.setAttribute('viewBox', `0 ${edges[i]} ${vw} ${edges[i + 1] - edges[i]}`);
    page.removeAttribute('width'); page.removeAttribute('height');
    page.setAttribute('style', 'display:block;width:100%;height:auto');
    pages.push(page);
  }
  holder.remove();
  return pages;
}

export function wirePrintArtefact({getSvg}){
  let holder = null;
  addEventListener('beforeprint', () => {
    holder?.remove(); holder = null;   // a second beforeprint (some browsers send two) must not print the artefact twice
    const svg = getSvg();
    if(!svg) return;
    holder = document.createElement('div');
    holder.id = 'print-artefact';
    for(const page of printPages(svg)){
      const sheet = document.createElement('div');
      sheet.className = 'print-page';
      sheet.appendChild(page);
      holder.appendChild(sheet);
    }
    document.body.appendChild(holder);
  });
  addEventListener('afterprint', () => { holder?.remove(); holder = null; });
}
