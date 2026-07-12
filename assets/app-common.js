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
    accent: g('--accent'), accentInk: g('--accent-ink'), bg: g('--bg'), err: g('--err'), track: g('--track'),
    status: {done: g('--st-done'), doing: g('--st-doing'), risk: g('--st-risk'), blocked: g('--st-blocked')},
    // contrast-boosted variants for pill TEXT over the 12% tint (WCAG 4.5:1) — the fill still uses `status`
    statusInk: {done: g('--st-done-ink'), doing: g('--st-doing-ink'), risk: g('--st-risk-ink'), blocked: g('--st-blocked-ink')}};
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

export function svgToCanvas(svg, cb){
  const img = new Image();
  const dims = svg.match(/width="(\d+)" height="(\d+)"/);
  const w = +dims[1], h = +dims[2], scale = 2;
  img.onerror = () => console.error('svgToCanvas: SVG failed to decode — invalid XML in the export string?');
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const cctx = c.getContext('2d');
    cctx.scale(scale, scale);
    cctx.drawImage(img, 0, 0);
    cb(c);
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
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
