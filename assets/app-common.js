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
    accent: g('--accent'), bg: g('--bg'), err: g('--err'),
    status: {done: g('--st-done'), doing: g('--st-doing'), risk: g('--st-risk'), blocked: g('--st-blocked')}};
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
