/* Shared pure primitives for the SVG planning artefacts. These live outside a
   render-*.js file because they do not emit an artefact on their own. */

/* Muted type is set on tinted panels (an accent wash over the paper): it must read at 4.5:1 there, not only on the bare paper.
   Where it does not, it moves toward the ink colour, a step at a time, until it does. Hex colours only; anything else is left. */
const hexRgb = hex => /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) : null;
const channel = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b);
const ratio = (a, b) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };
export function legibleMuted(muted, ink, bg, accent, minimum = 4.6){
  const m = hexRgb(muted), i = hexRgb(ink), b = hexRgb(bg), a = hexRgb(accent);
  if(!m || !i || !b) return muted;
  const panel = a ? b.map((c, k) => c * .9 + a[k] * .1) : b;   // the worst of the washes the artefacts lay over the paper
  let t = 0, mix = m;
  while(t < 1 && Math.min(ratio(mix, b), ratio(mix, panel)) < minimum){ t += .04; mix = m.map((c, k) => Math.round(c + (i[k] - c) * Math.min(1, t))); }
  return t === 0 ? muted : '#' + mix.map(c => c.toString(16).padStart(2, '0')).join('');
}

function at(source, path){
  let value = source;
  for(const part of path.split('.')) value = value?.[part];
  return typeof value === 'string' && value ? value : null;
}
export function artefactPalette(colors){
  const pick = (fallback, ...paths) => paths.map(path => at(colors, path)).find(Boolean) || fallback;
  const ink = pick('currentColor', 'ink', 'text', 'fg');
  const muted = pick(ink, 'muted', 'secondary', 'subtle', 'ink');
  const bg = pick('none', 'bg', 'paper', 'canvas');
  const surface = pick(bg, 'card', 'surface', 'panel', 'paper', 'bg');
  const border = pick(muted, 'line', 'border', 'rule', 'muted', 'ink');
  const accent = pick(ink, 'accent', 'brand', 'ink');
  return {ink, muted: legibleMuted(muted, ink, bg, accent), bg, surface, border, accent,
    accentInk:pick(accent, 'accentInk', 'brandText', 'accent', 'brand', 'ink'),
    urgent:pick(accent, 'err', 'danger', 'status.blocked', 'accent', 'ink')};
}

function safeMeasure(measure, value, font){
  const measured = Number(measure(String(value ?? ''), font));
  return Number.isFinite(measured) && measured >= 0 ? measured : String(value ?? '').length * 7;
}

/* Breaks hostile single tokens as well as ordinary prose so no authored value
   can widen an SVG plane beyond its measured bounds. */
export function wrappedArtefactText(value, maxWidth, measure, font){
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const pieces = [];
  for(const word of words){
    if(safeMeasure(measure, word, font) <= maxWidth){ pieces.push(word); continue; }
    let rest = word;
    while(rest){
      let lo = 1, hi = rest.length, fit = 1;
      while(lo <= hi){
        const mid = Math.floor((lo + hi) / 2);
        if(safeMeasure(measure, rest.slice(0, mid), font) <= maxWidth){ fit = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      pieces.push(rest.slice(0, fit)); rest = rest.slice(fit);
    }
  }
  const lines = [];
  let current = '';
  for(const piece of pieces){
    const trial = current ? `${current} ${piece}` : piece;
    if(!current || safeMeasure(measure, trial, font) <= maxWidth) current = trial;
    else { lines.push(current); current = piece; }
  }
  if(current) lines.push(current);
  return lines;
}
