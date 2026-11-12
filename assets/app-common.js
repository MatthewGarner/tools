/* Shared DOM-side plumbing for tool app shells. */

const measCtx = document.createElement('canvas').getContext('2d');
export const measure = (text, font) => { measCtx.font = font; return measCtx.measureText(text).width; };

export function isDark(){
  const t = document.documentElement.dataset.theme;
  if(t === 'dark') return true;
  if(t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

export function themeColors(){
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  return {card: g('--card'), border: g('--border'), ink: g('--ink'), muted: g('--muted'),
    grid: g('--grid'),
    accent: g('--accent'), accentInk: g('--accent-ink'), bg: g('--bg'), err: g('--err'), track: g('--track'),
    status: {done: g('--st-done'), doing: g('--st-doing'), risk: g('--st-risk'), blocked: g('--st-blocked')},
    // contrast-boosted variants for pill TEXT over the 12% tint (WCAG 4.5:1) — the fill still uses `status`
    statusInk: {done: g('--st-done-ink'), doing: g('--st-doing-ink'), risk: g('--st-risk-ink'), blocked: g('--st-blocked-ink')},
    brand: g('--brand'), brandText: g('--brand-text')};
}

/* Filename-safe slug: lowercase, non-alnum runs collapsed to '-', trimmed.
   Falls back to `fallback` if the input is empty or slugifies to nothing. */
export function slugify(s, fallback){
  return (s || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

export function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* PNG is the SVG rasterised at up to 2x. The canvas, not a fixed artboard budget, is the limit: Safari
   caps a canvas at 16,777,216 pixels, so a larger picture is drawn at a lower scale (floor 1x) and the
   caller says so. Only a picture that cannot be made at 1x is refused. */
export const PNG_RASTER_SCALE = 2;
export const PNG_MAX_ARTBOARD_AREA = 16_777_216;   // canvas pixels
export const PNG_MAX_ARTBOARD_SIDE = 16_384;

const dimension = (root, name) => {
  const m = root.match(new RegExp(`\\b${name}\\s*=\\s*(['"])(\\d+(?:\\.\\d+)?)\\1`, 'i'));
  return m ? Number(m[2]) : NaN;
};

/* Pure, synchronous preflight. Keeping this separate from Image decoding lets
   Copy PNG reject an oversized artefact before clipboard.write is called,
   while valid copies still call clipboard.write inside the click activation. */
export function pngRasterPlan(svg){
  const root = typeof svg === 'string' && svg.match(/<svg\b[^>]*>/i)?.[0];
  if(!root) return {ok: false, code: 'root', detail: 'No root <svg> element was found.'};
  const width = dimension(root, 'width');
  const height = dimension(root, 'height');
  if(!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return {ok: false, code: 'dimensions', detail: 'The root <svg> needs positive numeric width and height attributes.'};
  if(width > PNG_MAX_ARTBOARD_SIDE || height > PNG_MAX_ARTBOARD_SIDE)
    return {ok: false, code: 'side', width, height,
      detail: `${width} × ${height} exceeds the ${PNG_MAX_ARTBOARD_SIDE.toLocaleString('en')}px canvas-side limit even at 1x.`};
  if(width * height > PNG_MAX_ARTBOARD_AREA)
    return {ok: false, code: 'area', width, height,
      detail: `${width} × ${height} exceeds the ${PNG_MAX_ARTBOARD_AREA.toLocaleString('en')}-pixel canvas limit even at 1x.`};
  let scale = Math.min(PNG_RASTER_SCALE, Math.sqrt(PNG_MAX_ARTBOARD_AREA / (width * height)), PNG_MAX_ARTBOARD_SIDE / Math.max(width, height));
  scale = Math.max(1, Math.floor(scale * 100) / 100);
  while(scale > 1 && (Math.ceil(width * scale) * Math.ceil(height * scale) > PNG_MAX_ARTBOARD_AREA || Math.ceil(Math.max(width, height) * scale) > PNG_MAX_ARTBOARD_SIDE)) scale = Math.max(1, Math.round((scale - .01) * 100) / 100);
  return {ok: true, width, height, scale, reduced: scale < PNG_RASTER_SCALE,
    canvasWidth: Math.ceil(width * scale),
    canvasHeight: Math.ceil(height * scale)};
}

/* Callback compatibility is retained for all current callers. The optional
   error callback receives a structured failure; without one, failures remain
   visible in the console for direct/legacy use. Returns false only when the
   synchronous dimension/budget preflight fails. */
export function svgToCanvas(svg, cb, onError){
  const fail = error => {
    if(onError) onError(error);
    else console.error(`svgToCanvas: ${error.detail}`);
  };
  const plan = pngRasterPlan(svg);
  if(!plan.ok){ fail(plan); return false; }

  const img = new Image();
  img.onerror = () => fail({ok: false, code: 'decode', detail: 'The SVG could not be decoded as an image.'});
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = plan.canvasWidth; c.height = plan.canvasHeight;
      const cctx = c.getContext('2d');
      if(!cctx) return fail({ok: false, code: 'canvas', detail: 'The browser could not create a PNG canvas.'});
      // Fill the whole canvas: at a fractional scale the artboard is a pixel short of it, which left a transparent edge.
      cctx.drawImage(img, 0, 0, c.width, c.height);
      cb(c);
    }catch(_){
      fail({ok: false, code: 'canvas', detail: 'The browser could not render this SVG to a PNG canvas.'});
    }
  };
  try {
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }catch(_){
    fail({ok: false, code: 'encode', detail: 'The SVG could not be prepared for PNG conversion.'});
  }
  return true;
}

/* Re-render hook: OS scheme change or explicit data-theme stamp. */
export function onThemeChange(fn){
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  new MutationObserver(fn).observe(document.documentElement,
    {attributes: true, attributeFilter: ['data-theme']});
}

/* Rebuild a soft-warning <ul> from a list of strings. Callers assemble their own
   array (one model, merged models, or a pre-computed extra) and pass it. */
export function renderWarningList(el, warnings){
  el.textContent = '';
  for(const w of warnings){
    const li = document.createElement('li');
    li.textContent = w;
    el.appendChild(li);
  }
}
