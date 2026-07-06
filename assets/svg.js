/* Shared SVG-string helpers for the tools' renderers. */

export function esc(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;');
}

/* 12% tint for capsules; non-hex colors fall back to 'none' (stroke-only) */
export function tint(hex){
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + '1F' : 'none';
}

/* One-line <text> element with the attribute set the renderers share.
   Coordinates round to 2 decimals. mono switches to the ui-monospace stack. */
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
const r2 = n => (Math.round(n * 100) / 100).toString();
export function txt(x, y, str, size, fill, {weight, tracking, anchor, mono} = {}){
  return '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + size + '"' +
    (weight ? ' font-weight="' + weight + '"' : '') +
    (tracking ? ' letter-spacing="' + tracking + '"' : '') +
    (anchor ? ' text-anchor="' + anchor + '"' : '') +
    (mono ? ' font-family="' + MONO + '"' : '') +
    ' fill="' + fill + '">' + esc(str) + '</text>';
}

/* Greedy wrap with widow control: no single-word last lines when rebalancing fits. */
export function wrapText(text, font, maxW, measure){
  const words = text.split(/\s+/);
  const out = [];
  let cur = '';
  for(const w of words){
    const trial = cur ? cur + ' ' + w : w;
    if(measure(trial, font) <= maxW || !cur) cur = trial;
    else { out.push(cur); cur = w; }
  }
  if(cur) out.push(cur);
  if(out.length > 1){
    const last = out[out.length - 1], prev = out[out.length - 2];
    if(!last.includes(' ') && prev.includes(' ')){
      const prevWords = prev.split(' ');
      const pulled = prevWords.pop();
      if(measure(pulled + ' ' + last, font) <= maxW){
        out[out.length - 2] = prevWords.join(' ');
        out[out.length - 1] = pulled + ' ' + last;
      }
    }
  }
  return out;
}
