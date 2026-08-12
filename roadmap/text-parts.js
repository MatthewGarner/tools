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

function basisDescription(basis){
  if(!basis) return '';
  const describe = (entries, kind) => (entries || []).map(e =>
    e.key + ' equals ' + e.direction + ' (' + kind + ' ' + e.date + ')').join('; ');
  const descriptions = [];
  if(basis.answered && basis.answered.length) descriptions.push('Known: ' + describe(basis.answered, 'answered'));
  if(basis.assumed && basis.assumed.length) descriptions.push('Assumed: ' + describe(basis.assumed, 'assumed'));
  return 'Delivery projection from Paths: ' + String(basis.source || '').trim() + '. ' + descriptions.join('. ') + '.';
}

/* wrapText keeps whole words, which is normally the right editorial rule. A
   basis can contain machine keys with no spaces, though; one long key must not
   force horizontal overflow on a phone or be elided. Split only an individually
   over-wide run, and retain every character. */
function wrapBasisText(text, font, maxW, measure){
  const lines = wrapText(text, font, maxW, measure);
  const out = [];
  for(const line of lines){
    let rest = line;
    while(rest && measure(rest, font) > maxW){
      let lo = 1, hi = rest.length;
      while(lo < hi){
        const mid = Math.ceil((lo + hi) / 2);
        if(measure(rest.slice(0, mid), font) <= maxW) lo = mid;
        else hi = mid - 1;
      }
      const take = Math.max(1, lo);
      out.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
    if(rest) out.push(rest);
  }
  return out;
}

/* A Roadmap generated from Paths is a projection of one explicit world, not a
   promise that every upstream question has been answered. This small ledger
   stamp therefore belongs in the document header on EVERY artefact. It is
   deliberately text, not a legend: the provenance and the known/assumed split
   must survive SVG/PNG export and must be readable without learning a key.

   `scale` is used by the working chart's slide pass; coordinates passed by that
   renderer are already scaled, so only the type/rhythm scale here. With no
   basis the zero result lets every existing artefact remain byte-identical. */
export function basisBand(model, x, y, innerW, measure, colors, scale = 1){
  const basis = model && model.basis;
  if(!basis) return {svg:'', height:0, description:''};

  const first = 'DELIVERY PROJECTION · FROM PATHS: ' + String(basis.source || '').trim();
  const ledger = [];
  if(basis.answered && basis.answered.length){
    ledger.push('Known: ' + basis.answered.map(e => e.key + ' = ' + e.direction).join(' · '));
  }
  if(basis.assumed && basis.assumed.length){
    ledger.push('Assumed: ' + basis.assumed.map(e => e.key + ' = ' + e.direction).join(' · '));
  }
  const second = ledger.join(' · ');

  const labelSize = 10.5 * scale, valueSize = 12.5 * scale;
  const labelLh = 15 * scale, valueLh = 18 * scale;
  const inset = 12 * scale, ruleGap = 8 * scale, bottom = 8 * scale;
  const textX = x + inset;
  const textW = Math.max(1, innerW - inset);
  const firstLines = wrapBasisText(first, '700 ' + labelSize + 'px ' + SANS, textW, measure);
  const secondLines = wrapBasisText(second, '600 ' + valueSize + 'px ' + SANS, textW, measure);
  const firstH = firstLines.length * labelLh;
  const secondH = secondLines.length * valueLh;
  const h = firstH + ruleGap + secondH + bottom;
  const parts = [
    '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y + h - bottom) +
      '" stroke="' + colors.accent + '" stroke-width="' + (3 * scale) + '"/>',
  ];
  firstLines.forEach((ln, i) => parts.push(txt(textX, y + labelSize + i * labelLh, ln,
    labelSize, colors.muted, {weight:700, tracking:1.05 * scale})));
  const secondY = y + firstH + ruleGap;
  secondLines.forEach((ln, i) => parts.push(txt(textX, secondY + valueSize + i * valueLh, ln,
    valueSize, colors.ink, {weight:600})));

  return {
    svg: parts.join(''),
    height: h,
    description: basisDescription(basis),
  };
}

/* Put the dated machine-readable account once at the root of each standalone
   SVG. The visible band stays concise; screen readers and detached SVGs retain
   when each upstream answer/assumption was recorded. */
export function basisDesc(model){
  const description = basisDescription(model && model.basis);
  return description ? '<desc>' + esc(description) + '</desc>' : '';
}

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
