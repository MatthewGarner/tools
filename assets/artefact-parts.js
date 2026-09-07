/* Shared pure primitives for the SVG planning artefacts. These live outside a
   render-*.js file because they do not emit an artefact on their own. */

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
  return {ink, muted, bg, surface, border, accent,
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
