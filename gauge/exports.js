/* SVG / PNG / Copy PNG / Copy-markdown export wiring. */
import {download, svgToCanvas} from '../assets/app-common.js';

export function wireExports({buttons, getSvg, getMarkdown, slug}){
  const flash = (btn, msg, revert) => {
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = revert; }, 2000);
  };
  buttons.dlsvg.addEventListener('click', () => {
    const svg = getSvg();
    if(svg) download(slug() + '.svg', new Blob([svg], {type: 'image/svg+xml'}));
  });
  buttons.dlpng.addEventListener('click', () => {
    const svg = getSvg();
    if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '.png', b), 'image/png'));
  });
  buttons.copypng.addEventListener('click', () => {
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
  buttons.copymd.addEventListener('click', () => {
    const md = getMarkdown();
    if(!md || !navigator.clipboard)
      return flash(buttons.copymd, 'Clipboard unavailable', 'Copy for doc');
    navigator.clipboard.writeText(md)
      .then(() => flash(buttons.copymd, 'Copied — paste into your doc', 'Copy for doc'))
      .catch(() => flash(buttons.copymd, 'Copy blocked', 'Copy for doc'));
  });
}
