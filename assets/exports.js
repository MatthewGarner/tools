/* Shared export wiring. Four optional actions, in one fixed order everywhere:
   Copy PNG · Copy as markdown · PNG · SVG.

   getSvg is the full-detail native artefact used by both downloads. SVG is
   exhaustive; PNG is available while that artboard fits the shared raster
   budget. getCopy may supply a distinct presentation-summary render for the
   paste-into-a-deck action, otherwise Copy PNG falls back to getSvg. */
import {download, pngRasterPlan, svgToCanvas} from './app-common.js';

const buttonText = (btn, fallback) => btn.textContent || fallback;
const buttonDescriptions = new WeakMap();

const rasterMessage = error => {
  if(error?.code === 'side') return 'PNG exceeds 4,096px side — download SVG';
  if(error?.code === 'area') return 'PNG exceeds 3M-unit area — download SVG';
  if(error?.code === 'dimensions' || error?.code === 'root') return 'PNG has no valid size — download SVG';
  if(error?.code === 'decode' || error?.code === 'encode') return 'SVG could not be rasterised — download SVG';
  return 'PNG could not be created — download SVG';
};

const describe = (btn, description) => {
  if(!btn) return;
  buttonDescriptions.set(btn, description);
  btn.title = description;
  if(btn.setAttribute){
    btn.setAttribute('aria-label', description);
    btn.setAttribute('aria-live', 'polite');
  }
};

export function wireExports({buttons, getSvg, getCopy, getMarkdown, slug, labels = {}, descriptions = {}}){
  const flash = (btn, msg, revert) => {
    btn.textContent = msg;
    if(btn.setAttribute) btn.setAttribute('aria-label', msg);
    setTimeout(() => {
      btn.textContent = revert;
      if(btn.setAttribute) btn.setAttribute('aria-label', buttonDescriptions.get(btn) || revert);
    }, 2000);
  };
  const copyLabel = labels.copypng || 'Copy PNG';
  if(buttons.copypng && labels.copypng) buttons.copypng.textContent = copyLabel;
  describe(buttons.copypng, descriptions.copypng || (getCopy
    ? 'Copy PNG — presentation summary'
    : 'Copy PNG — full-detail artefact'));
  describe(buttons.copymd, descriptions.copymd || 'Copy full-detail artefact as markdown');
  describe(buttons.dlpng, descriptions.dlpng || 'Download full-detail PNG — available within the raster limit');
  describe(buttons.dlsvg, descriptions.dlsvg || 'Download full-detail SVG — exhaustive at any supported size');
  if(buttons.dlsvg) buttons.dlsvg.addEventListener('click', () => {
    const svg = getSvg();
    if(svg) download(slug() + '.svg', new Blob([svg], {type: 'image/svg+xml'}));
  });
  if(buttons.dlpng) buttons.dlpng.addEventListener('click', () => {
    const svg = getSvg();
    if(!svg) return;
    const revert = buttonText(buttons.dlpng, 'PNG');
    const plan = pngRasterPlan(svg);
    if(!plan.ok) return flash(buttons.dlpng, rasterMessage(plan), revert);
    svgToCanvas(svg, c => {
      try {
        c.toBlob(b => b
          ? download(slug() + '.png', b)
          : flash(buttons.dlpng, 'PNG could not be encoded — download SVG', revert), 'image/png');
      }catch(_){
        flash(buttons.dlpng, 'PNG could not be encoded — download SVG', revert);
      }
    }, error => flash(buttons.dlpng, rasterMessage(error), revert));
  });
  if(buttons.copypng) buttons.copypng.addEventListener('click', () => {
    const svg = (getCopy || getSvg)();
    if(!svg) return;
    const revert = buttonText(buttons.copypng, copyLabel);
    if(!navigator.clipboard || !window.ClipboardItem)
      return flash(buttons.copypng, 'Clipboard unavailable — use Download', revert);
    const plan = pngRasterPlan(svg);
    if(!plan.ok) return flash(buttons.copypng, rasterMessage(plan), revert);

    // clipboard.write remains in this synchronous click turn: awaiting Image
    // decode first loses Safari's transient-activation window.
    let rasterError = null;
    const blobPromise = new Promise((resolve, reject) =>
      svgToCanvas(svg, c => {
        try {
          c.toBlob(b => {
            if(b) resolve(b);
            else {
              rasterError = {ok: false, code: 'canvas', detail: 'PNG encoding returned no data.'};
              reject(new Error(rasterError.detail));
            }
          }, 'image/png');
        }catch(error){
          rasterError = {ok: false, code: 'canvas', detail: error?.message || 'PNG encoding failed.'};
          reject(error);
        }
      }, error => { rasterError = error; reject(error); }));
    try {
      navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})])
        .then(() => flash(buttons.copypng, 'Copied — paste into your deck', revert))
        .catch(() => flash(buttons.copypng,
          rasterError ? rasterMessage(rasterError) : 'Copy blocked — use Download', revert));
    }catch(_){
      flash(buttons.copypng, 'Copy blocked — use Download', revert);
    }
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
