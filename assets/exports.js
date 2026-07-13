/* Shared SVG / PNG / Copy PNG / Copy-markdown export wiring (moved from gauge
   2026-07-06). Every button is optional — pass the ones the surface has. */
import {download, svgToCanvas} from './app-common.js';

export function wireExports({buttons, getSvg, getSvgSlide, getPoster, getMarkdown, slug}){
  const flash = (btn, msg, revert) => {
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = revert; }, 2000);
  };
  if(buttons.dlsvg) buttons.dlsvg.addEventListener('click', () => {
    const svg = getSvg();
    if(svg) download(slug() + '.svg', new Blob([svg], {type: 'image/svg+xml'}));
  });
  if(buttons.dlpng) buttons.dlpng.addEventListener('click', () => {
    const svg = getSvg();
    if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '.png', b), 'image/png'));
  });
  if(buttons.dlslide) buttons.dlslide.addEventListener('click', () => {
    const svg = getSvgSlide();
    if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '-slide.png', b), 'image/png'));
  });
  if(buttons.dlposter) buttons.dlposter.addEventListener('click', () => {
    const svg = getPoster();
    if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '-poster.png', b), 'image/png'));
  });
  if(buttons.copypng) buttons.copypng.addEventListener('click', () => {
    const svg = getSvg();
    if(!svg) return;
    if(!navigator.clipboard || !window.ClipboardItem)
      return flash(buttons.copypng, 'Clipboard unavailable — use Download', 'Copy PNG');
    const blobPromise = new Promise((resolve, reject) =>
      svgToCanvas(svg, c => c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/png')));
    navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})])
      .then(() => flash(buttons.copypng, 'Copied — paste into your deck', 'Copy PNG'))
      .catch(() => flash(buttons.copypng, 'Copy blocked — use Download', 'Copy PNG'));
  });
  if(buttons.copymd) buttons.copymd.addEventListener('click', () => {
    const md = getMarkdown();
    if(!md || !navigator.clipboard)
      return flash(buttons.copymd, 'Clipboard unavailable', 'Copy for doc');
    navigator.clipboard.writeText(md)
      .then(() => flash(buttons.copymd, 'Copied — paste into your doc', 'Copy for doc'))
      .catch(() => flash(buttons.copymd, 'Copy blocked', 'Copy for doc'));
  });
}
