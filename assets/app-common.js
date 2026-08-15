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

/* Native PNG is deliberately bounded. SVG remains the exhaustive format for
   artefacts beyond this budget; attempting a browser canvas above it is both
   unreliable and liable to consume a surprising amount of memory. The side
   limit applies to the root artboard before the existing 2x raster scale. */
export const PNG_RASTER_SCALE = 2;
export const PNG_MAX_ARTBOARD_AREA = 3_000_000;
export const PNG_MAX_ARTBOARD_SIDE = 4_096;

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
      detail: `${width} × ${height} exceeds the ${PNG_MAX_ARTBOARD_SIDE}px artboard-side limit.`};
  if(width * height > PNG_MAX_ARTBOARD_AREA)
    return {ok: false, code: 'area', width, height,
      detail: `${width} × ${height} exceeds the ${PNG_MAX_ARTBOARD_AREA.toLocaleString('en')} unit² artboard limit.`};
  return {ok: true, width, height, scale: PNG_RASTER_SCALE,
    canvasWidth: Math.ceil(width * PNG_RASTER_SCALE),
    canvasHeight: Math.ceil(height * PNG_RASTER_SCALE)};
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
      cctx.scale(plan.scale, plan.scale);
      cctx.drawImage(img, 0, 0);
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
/* the example-chip row every DSL tool builds: one `.chip` button per item
   (labelled ex.name) that calls onPick(ex) — replaces a byte-identical 7-line
   loop copied into 10 tools. Host is the container element (e.g. $('chips')).
   opts.start = {src, label?} prepends the "Start your own" chip AHEAD of the
   row's "Try:" lead, so the on-ramp reads before the examples instead of as one
   of them — every tool autoloads an example, and until 2026-08-15 the examples
   were the only way in. src is the tool's starter (see <tool>/starter.js). */
export function exampleChips(host, list, onPick, opts = {}){
  const chip = (name, pick) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = name;
    b.addEventListener('click', pick);
    return b;
  };
  if(opts.start){
    const {src, label = 'Start your own'} = opts.start;
    const b = chip(label, () => onPick({name: label, src}));
    b.classList.add('start');
    host.insertBefore(b, host.firstChild);
  }
  for(const ex of list) host.appendChild(chip(ex.name, () => onPick(ex)));
}

export function renderWarningList(el, warnings){
  el.textContent = '';
  for(const w of warnings){
    const li = document.createElement('li');
    li.textContent = w;
    el.appendChild(li);
  }
}
