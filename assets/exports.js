/* Shared export wiring (moved from gauge 2026-07-06). Four actions, in one
   fixed order everywhere: Copy PNG · Copy as markdown · PNG · SVG. Every
   button is optional — pass the ones the surface has.

   Simplified 2026-07-31: the Poster and slide-size downloads are gone. The
   deck-shaped render didn't need a button of its own — where a tool has one,
   it passes it as getCopy and Copy PNG (the one-click, paste-into-a-deck
   action) hands it over. Downloads always give you what's on screen. */
import {download, svgToCanvas} from './app-common.js';

export function wireExports({buttons, getSvg, getCopy, getMarkdown, slug}){
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
  if(buttons.copypng) buttons.copypng.addEventListener('click', () => {
    const svg = (getCopy || getSvg)();   // getCopy: the deck-shaped render, where the tool has one
    if(!svg) return;
    if(!navigator.clipboard || !window.ClipboardItem)
      return flash(buttons.copypng, 'Clipboard unavailable — use Download', 'Copy PNG');
    // stays synchronous to clipboard.write — awaiting first loses Safari's transient-activation window
    const blobPromise = new Promise((resolve, reject) =>
      svgToCanvas(svg, c => c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/png')));
    navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})])
      .then(() => flash(buttons.copypng, 'Copied — paste into your deck', 'Copy PNG'))
      .catch(() => flash(buttons.copypng, 'Copy blocked — use Download', 'Copy PNG'));
  });
  if(buttons.copymd) buttons.copymd.addEventListener('click', () => {
    const md = getMarkdown();
    if(!md || !navigator.clipboard)
      return flash(buttons.copymd, 'Clipboard unavailable', 'Copy as markdown');
    navigator.clipboard.writeText(md)
      .then(() => flash(buttons.copymd, 'Copied — paste into your doc', 'Copy as markdown'))
      .catch(() => flash(buttons.copymd, 'Copy blocked', 'Copy as markdown'));
  });
}
