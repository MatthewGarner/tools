/* Shared exports: getSvg is exhaustive native output; getCopy is an optional
   presentation PNG source. */
import {download, pngRasterPlan, svgToCanvas} from './app-common.js';

const buttonText = (btn, fallback) => btn.textContent || fallback;
const buttonDescriptions = new WeakMap();
const restingLabels = new WeakMap(), flashTimers = new WeakMap();

/* A confirmation ("Copied…") on a button for a moment. It returns to the label it first had; pressing again restarts the timer. */
export function flashButton(btn, msg, ms = 2000){
  if(!flashTimers.has(btn)) restingLabels.set(btn, btn.textContent);
  const rest = restingLabels.get(btn);
  clearTimeout(flashTimers.get(btn));
  btn.textContent = msg;
  if(btn.setAttribute) btn.setAttribute('aria-label', msg);
  flashTimers.set(btn, setTimeout(() => {
    flashTimers.delete(btn);
    btn.textContent = rest;
    if(btn.setAttribute) btn.setAttribute('aria-label', buttonDescriptions.get(btn) || rest);
  }, ms));
}

const rasterMessage = error => {
  if(error?.code === 'side' || error?.code === 'area') return 'PNG too large even at 1x — download SVG';
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

export function wireExports({buttons, getSvg, getCopy, getMarkdown, slug, labels = {}, descriptions = {}, status}){
  // A status line, where the page has one, keeps what happened until the next export action; the button
  // label alone reverts after two seconds. Pages without one keep the label.
  const line = status || (typeof document !== 'undefined' && document.getElementById ? document.getElementById('exportstatus') : null);
  const say = text => { if(line){ line.textContent = text || ''; line.hidden = !text; } };
  const scaleNote = (plan, what) => plan.reduced ? `${what} at ${plan.scale}x, not 2x: the picture is too large for 2x in this browser.` : '';
  const flash = (btn, msg) => flashButton(btn, msg);
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
    say('');
    const plan = pngRasterPlan(svg);
    const fail = msg => { flash(buttons.dlpng, msg, revert); say(msg + '.'); };
    if(!plan.ok) return fail(rasterMessage(plan));
    svgToCanvas(svg, c => {
      try {
        c.toBlob(b => { if(b){ download(slug() + '.png', b); say(scaleNote(plan, 'PNG saved')); } else fail('PNG could not be encoded — download SVG'); }, 'image/png');
      }catch(_){
        fail('PNG could not be encoded — download SVG');
      }
    }, error => fail(rasterMessage(error)));
  });
  if(buttons.copypng) buttons.copypng.addEventListener('click', () => {
    const svg = (getCopy || getSvg)();
    const revert = buttonText(buttons.copypng, copyLabel);
    say('');
    const fail = msg => { flash(buttons.copypng, msg, revert); say(msg + '.'); };
    if(!svg) return fail('Copy PNG unavailable — download SVG');
    if(!navigator.clipboard || !window.ClipboardItem)
      return fail('Clipboard unavailable — use Download');
    const plan = pngRasterPlan(svg);
    if(!plan.ok) return fail(rasterMessage(plan));

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
        .then(() => { flash(buttons.copypng, 'Copied — paste into your deck', revert); say(scaleNote(plan, 'PNG copied')); })
        .catch(() => fail(rasterError ? rasterMessage(rasterError) : 'Copy blocked — use Download'));
    }catch(_){
      fail('Copy blocked — use Download');
    }
  });
  if(buttons.copymd) buttons.copymd.addEventListener('click', () => {
    const md = getMarkdown();
    if(!md || !navigator.clipboard)
      return flash(buttons.copymd, 'Clipboard unavailable');
    navigator.clipboard.writeText(md)
      .then(() => flash(buttons.copymd, 'Copied — paste into your doc'))
      .catch(() => flash(buttons.copymd, 'Copy blocked'));
  });
}
