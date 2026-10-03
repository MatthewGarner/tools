/* Shared SVG helpers; numeric &#39; survives HTML serialisation. */
export function esc(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function tint(hex){
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + '1F' : 'none';
}

/* Reject invalid alpha colours rather than letting rasterisers paint black. */
export function wash(hex, alpha){
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + alpha : 'none';
}

/* One-line <text> element with the attribute set the renderers share.
   Coordinates round to 2 decimals. mono switches to the ui-monospace stack. */
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";   /* no double quotes: lands in SVG attrs */
const GRAPHEMES = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;
const r2 = n => (Math.round(n * 100) / 100).toString();
export function txt(x, y, str, size, fill, {weight, tracking, anchor, mono, halo, strike} = {}){
  // halo: a stroke in the given colour painted BEHIND the glyphs (paint-order)
  // so an underlying line/grid reads behind the text — no blanked rectangle.
  // strike: text-decoration line-through (ghost/removed content — bets' KILLED rows).
  return '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + size + '"' +
    (weight ? ' font-weight="' + weight + '"' : '') +
    (tracking ? ' letter-spacing="' + tracking + '"' : '') +
    (anchor ? ' text-anchor="' + anchor + '"' : '') +
    (mono ? ' font-family="' + MONO + '"' : '') +
    (halo ? ' stroke="' + halo + '" stroke-width="3" stroke-linejoin="round" paint-order="stroke"' : '') +
    (strike ? ' text-decoration="line-through"' : '') +
    ' fill="' + fill + '">' + esc(str) + '</text>';
}

/* a11y attributes for a keyboard-operable, screen-reader-named SVG target:
   a tab stop with button semantics (the shell handles Enter/Space). Extracted
   from the ~20 inline copies the a11y pass left across the renderers so the
   triplet and the escaping live in one place. `label` is plain text, escaped
   here; returns a leading-space attribute string ready to splice into a tag. */
export function btnAttrs(label){
  return ' tabindex="0" role="button" aria-label="' + esc(label) + '"';
}

/* Wraps `inner` in a <g data-edit …> with an invisible, box-positioned hit
   rect painted LAST (so it captures pointer events over the visual).
   Caller supplies the box ({x,y,w,h,bg}) within its own plane — no anchor
   inference and no viewBox clamping here; that's the caller's job.
   `label` (plain text, escaped here) becomes the keyboard/AT accessible
   name — every caller must supply one so the target is announced.
   `raw` is optional: omit it (undefined) and no data-raw is written — a menu
   trigger has no editable value. `hit: true` marks the rect data-hit="" so the
   mobile WIDENED gate measures it (only whole-card/marker menu targets set
   this; plane-level widens leave it off). */
export function editTarget(inner, box, {kind, line, raw, extra, label, hit}){
  return '<g data-edit="' + kind + '" data-line="' + line + '"' +
    (raw != null ? ' data-raw="' + esc(raw) + '"' : '') +
    (label ? btnAttrs(label) : '') +
    (extra ? ' ' + extra : '') + '>' + inner +
    '<rect' + (hit ? ' data-hit=""' : '') + ' x="' + box.x + '" y="' + box.y + '" width="' + box.w + '" height="' + box.h +
    '" fill="' + box.bg + '" fill-opacity="0"/></g>';
}

export function wrapText(text, font, maxW, measure){
  const tokens = [];
  let hard = false;
  for(const word of String(text).split(/\s+/)){
    if(measure(word, font) <= maxW){ tokens.push({text:word, space:true}); continue; }
    hard = true;
    const units = GRAPHEMES ? [...GRAPHEMES.segment(word)].map(part => part.segment) : Array.from(word);
    let part = '', first = true;
    for(const unit of units){
      const trial = part + unit;
      if(part && measure(trial, font) > maxW){ tokens.push({text:part, space:first}); first = false; part = unit; }
      else part = trial;
    }
    if(part) tokens.push({text:part, space:first});
  }
  const out = [];
  let cur = '';
  for(const token of tokens){
    const trial = cur ? cur + (token.space ? ' ' : '') + token.text : token.text;
    if(measure(trial, font) <= maxW || !cur) cur = trial;
    else { out.push(cur); cur = token.text; }
  }
  if(cur) out.push(cur);
  if(!hard && out.length > 1){
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
