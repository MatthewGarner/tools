/* Text primitives shared by the deck compositions AND roadmap/render.js.

   Split out of deck-parts.js (2026-07-31) for WEIGHT: standfirst() has to be
   reachable from render.js, and render.js is reached by /why, so leaving it in
   deck-parts made /why carry that whole 9.2k toolkit for one block of text.
   deck-parts re-exports everything here, so no other importer changed.

   No DOM; measure is passed explicitly. Deliberately not render-*.js — it emits
   no standalone artefact, so renderer-coverage must not demand a corpus entry. */
import {txt, wrapText, esc, btnAttrs} from '../assets/svg.js';

/* serif's double-quoted "Times New Roman" rides in a single-quoted <g>, since
   svg.js's txt() has no font-family override. Mirrors render.js's pattern. */
export const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const SERIF = '"Helvetica Neue", Helvetica, "Segoe UI", Roboto, sans-serif';

export const serifGroup = inner => '<g font-family=\'' + SERIF + '\'>' + inner + '</g>';

/* clip to one line / wrap to N, both with an ellipsis on overflow. */
export function clip1(text, font, maxW, measure){
  let s = String(text);
  if(measure(s, font) <= maxW) return s;
  while(s.length > 1 && measure(s + '…', font) > maxW) s = s.slice(0, -1);
  return s + '…';
}
export function wrapN(text, font, maxW, maxLines, measure){
  const lines = wrapText(text, font, maxW, measure);
  if(lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = clip1(kept[maxLines - 1] + ' ' + lines.slice(maxLines).join(' '), font, maxW, measure);
  return kept;
}

/* The AUTHORED standfirst, on all four artefacts (2026-07-31). `headline:` used
   to reach the deck alone, so two of the author's four exports ignored what they
   wrote. Height is the full advance from `y`, and 0 when there is no headline —
   which is what keeps a headline-free doc byte-identical. Two lines, then clipped:
   a standfirst that runs on is a paragraph, not a claim. */
export function standfirst(model, x, y, innerW, measure, colors, edit = false){
  const text = String((model && model.headline) || '').trim();
  if(!text) return {svg: '', height: 0};
  const SIZE = 17, LH = 23;
  const lines = wrapN(text, '600 ' + SIZE + 'px ' + SERIF, innerW, 2, measure);
  const h = lines.length * LH + 6;
  return {
    svg: serifGroup(lines.map((ln, i) => txt(x, y + SIZE + i * LH, ln, SIZE, colors.ink, {weight: 600})).join('')) +
      /* live-only edit target: the words are the author's, so they edit where they read */
      (edit ? '<rect x="' + x + '" y="' + y + '" width="' + innerW + '" height="' + h +
        '" fill="transparent" style="cursor:pointer" data-edit="headline" data-line="-1" data-raw="' +
        esc(text) + '"' + btnAttrs('Edit the headline') + '/>' : ''),
    height: h,
  };
}

/* The diff narrative (2026-07-31). The snapshot compare detects WHAT changed; it
   cannot say WHY, which is the whole content of a review. `story:` is one
   authored line about the comparison, printed with the diff legend.

   Shown ONLY when a comparison is active — it is a claim about a diff, so with no
   diff there is nothing for it to be about. Set in the serif at ink weight so it
   reads as a sentence a person wrote, against the uppercase mechanical labels
   around it. Height 0 when absent, like standfirst. */
export function storyLine(model, diff, x, y, innerW, measure, colors, edit = false){
  const text = String((model && model.story) || '').trim();
  if(!text || !diff || !diff.any) return {svg: '', height: 0};
  const SIZE = 13, LH = 18;
  const lines = wrapN(text, SIZE + 'px ' + SERIF, innerW, 3, measure);
  const h = lines.length * LH + 4;
  return {
    svg: serifGroup(lines.map((ln, i) => txt(x, y + SIZE + i * LH, ln, SIZE, colors.ink)).join('')) +
      (edit ? '<rect x="' + x + '" y="' + y + '" width="' + innerW + '" height="' + h +
        '" fill="transparent" style="cursor:pointer" data-edit="story" data-line="-1" data-raw="' +
        esc(text) + '"' + btnAttrs('Edit the change story') + '/>' : ''),
    height: h,
  };
}
