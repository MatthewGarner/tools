/* Swiss 6b — the SVG rendition of the shared verdict anatomy, for the tools
   whose verdict is part of the exported artefact. Byte-for-byte the same
   anatomy as the HTML block in ./verdict.js, which owns the pure primitives
   both renditions share.

   Letterspacing is relative in CSS and ABSOLUTE here: 10px × .18em = 1.8px,
   24px × -.015em = -0.36px. Uppercase is literal — there is no text-transform
   in an exported file. */

import {esc, wrapText, btnAttrs} from './svg.js';
import {markFigure, countsLine} from './verdict.js';

/* A plain space, held by xml:space. NOT a non-breaking space: the export path
   reads the live SVG's outerHTML — HTML serialisation — and an NBSP comes back
   out as &nbsp;, an entity XML does not define, so the PNG decoder rejects the
   whole file. (Shipped broken once here; smoke's "svg decodes as an image"
   caught it.) Ordinary spaces adjacent to a tspan are collapsible under the
   default whitespace rules, hence xml:space="preserve" on the text elements
   this module emits. */
const NB = ' ';
const r2 = n => (Math.round(n * 100) / 100).toString();

/* SVG strings are XML, and a font stack quotes its family names — so whichever
   quote character the ATTRIBUTE uses, some caller's stack will collide with it
   and emit malformed XML that the browser forgives inline and the PNG export
   decoder rejects. Callers here pass whatever their own file already uses, so
   this normalises rather than trusting: family names are re-quoted to single
   quotes (CSS treats ' and " identically) and the attribute is double-quoted.
   Both conventions in the repo therefore emit the same bytes. */
const normFont = f => String(f).replace(/"/g, "'");
function textOpen(x, y, font, size, weight, tracking, fill){
  return '<text xml:space="preserve" x="' + r2(x) + '" y="' + r2(y) + '" font-family="' + normFont(font) +
    '" font-size="' + r2(size) + '" font-weight="' + weight + '"' +
    (tracking ? ' letter-spacing="' + r2(tracking) + '"' : '') +
    ' fill="' + fill + '">';
}

/* MODEL TITLE   COUNTS — one line, 700 ink then 500 muted after a 3-NBSP gap.
   Returns '' when there is nothing to say.

   Pass model:'' where the artefact ALREADY prints its title (timeline and map both
   set a 22px title line above this row) — repeating it one line down in caps reads
   as a stutter, not as anatomy. Counts-only then renders as the muted 500 strap,
   matching the strap bets has always drawn under its title. */
export function svgMetrics({x, y, model, counts, ink, muted, font, scale = 1}){
  const title = String(model ?? '').trim().toUpperCase();
  const line = countsLine(counts).toUpperCase();
  if(!title && !line) return '';
  const size = 10 * scale;
  let s = textOpen(x, y, font, size, title ? 700 : 500, 0.18 * size, title ? ink : muted) +
    esc(title || line);
  if(title && line){
    s += '<tspan fill="' + muted + '" font-weight="500">' + NB + NB + NB + esc(line) + '</tspan>';
  }
  return s + '</text>';
}

/* VERDICT kicker + wrapped display line with ONE brand tspan.
   Returns {svg, height} — height is the block's full advance from `y` (the
   kicker baseline) so callers can lay out beneath it. */
export function svgVerdict({x, y, width, line, fig, ink, muted, brandText, font,
                            measure, size = 24, scale = 1, edit, copyTap}){
  const s = String(line ?? '').trim();
  if(!s) return {svg: '', height: 0};
  const kickSize = 10 * scale;
  const vSize = size * scale;
  const advance = Math.round(vSize * 4 / 3);          // 32px at 24px, 23px at 17px
  const maxW = Math.min(width, 820 * scale);
  const kick = textOpen(x, y, font, kickSize, 500, 0.18 * kickSize, muted) + 'VERDICT</text>';

  const lines = wrapText(s, '700 ' + vSize + 'px ' + font, maxW, measure);
  /* Colour by character range, not per-line search: a multi-word fig that
     wraps ("18 days") is invisible to an indexOf on any single line, and the
     one brand figure silently rendered plain. Lines re-joined with single
     spaces reproduce wrapText's normalised input, so a cursor into that
     string maps the fig's range onto each line — a straddling fig keeps its
     red on both sides of the break. */
  const sN = lines.join(' ');
  const figText = markFigure(sN, fig).find(r => r.fig)?.t ?? '';
  const fs = figText ? sN.indexOf(figText) : -1;       // mark the FIRST occurrence only
  const fe = fs + figText.length;
  const out = [kick];
  let by = y + 30 * scale;
  let cursor = 0;
  for(const ln of lines){
    const a = Math.max(fs, cursor), b = Math.min(fe, cursor + ln.length);
    let body;
    if(fs < 0 || a >= b) body = esc(ln);
    else {
      const pre = ln.slice(0, a - cursor), mid = ln.slice(a - cursor, b - cursor), post = ln.slice(b - cursor);
      body = esc(pre) +
        '<tspan class="vfig" fill="' + brandText + '">' + esc(mid) + '</tspan>' +
        esc(post);
    }
    out.push(textOpen(x, by, font, vSize, 700, -0.015 * vSize, ink) + body + '</text>');
    by += advance;
    cursor += ln.length + 1;                            // +1: the space the wrap consumed
  }
  /* live-preview affordances only — exports and goldens never pass these.
     `edit` ({raw}) lays an invisible hit rect over the block (menu-first target,
     Matt 2026-08-02); `copyTap` is the no-DSL tools' tap-to-copy mark. Painted
     LAST so it captures pointers over the text. */
  if(edit || copyTap){
    const box = ' x="' + r2(x - 4) + '" y="' + r2(y - 12) + '" width="' + r2(maxW + 8) +
      '" height="' + r2(by - y - advance + vSize * 0.5 + 16) + '" fill="transparent"';
    if(edit){
      /* two stacked rects: the UNDER one anchors the menu's "Edit the line…"
         opens-row (data-edit="verdictedit" is what it queries for); the TOP one
         is the click/keyboard target that opens the menu. */
      out.push('<rect' + box + ' data-edit="verdictedit" data-line="-1" data-raw="' +
        esc(edit.raw || '') + '"/>');
      out.push('<rect' + box + ' style="cursor:pointer" data-edit="verdict" data-line="-1" data-raw=""' +
        btnAttrs('Verdict — edit, copy, or switch it off') + '/>');
    } else {
      out.push('<rect' + box + ' style="cursor:pointer" data-copy="verdict"' +
        btnAttrs('Copy the verdict') + '/>');
    }
  }
  return {svg: out.join(''), height: by - y};
}
