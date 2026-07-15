/* Shared pure model + SVG micro-builders for the deck compositions and their
   live editable siblings. NO DOM, NO edit markup — measure is passed explicitly.
   NOT named render-*.js on purpose: it emits no standalone artefact, so
   renderer-coverage must not force it into the injection corpus.
   registerColumns/registerRows/spanRange are the register ROW/CELL MODEL, shared
   byte-for-byte by the deck export paint and the live editable view. */
import {txt, wrapText, tint, esc} from '../assets/svg.js';
import {STATUS_LABEL} from './parse.js';

/* local font stacks — not threaded through svg.js's txt() (no font-family
   override there): serif's double-quoted "Times New Roman" rides in a
   single-quoted <g font-family='…'>, mirroring render.js's own pattern. */
export const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const SERIF = 'Charter, Georgia, "Times New Roman", serif';
export const r2 = n => Math.round(n * 100) / 100;

/* shared SVG micro-builders (deck-local, NOT assets/svg.js — render.js/
   svg.js/series.js stay at zero hunks, and svg.js has no rect/line helper or
   font-family override). Attribute order is fixed; deck.test.mjs's bounds
   sweep parses by name so it doesn't care. */
export function rect(x, y, w, h, fill, o = {}){
  return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
    '" fill="' + fill + '"' +
    (o.rx != null ? ' rx="' + o.rx + '"' : '') +
    (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.sw || 1) + '"' : '') +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
}
export function line(x1, y1, x2, y2, stroke, w = 1, opacity = 1){
  return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
    '" stroke="' + stroke + '" stroke-width="' + w + '" opacity="' + opacity + '"/>';
}
export const serifGroup = inner => '<g font-family=\'' + SERIF + '\'>' + inner + '</g>';

/* ellipsis-clip to one line; wrap-to-N-lines with an ellipsis on overflow.
   measure passed explicitly (pure helpers take it as an arg, never close
   over a DOM-side singleton). */
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

/* capsule pill: tinted fill (house 12% tint via svg.js's tint()), contrast
   ink — render.js's local capsule, at deck scale. Never colour-alone: the
   label text always carries the word. */
export function capsule(x, y, label, col, inkCol, measure){
  const font = '600 12px ' + SANS;
  const w = measure(label, font) + label.length * 0.6 + 18, h = 22;
  const fill = tint(col);
  return {
    svg: rect(x, y, w, h, fill, {rx: 11, stroke: fill === 'none' ? col : null, sw: 1}) +
      txt(x + 9, y + 15.5, label, 12, inkCol || col, {weight: 600, tracking: 0.6}),
    w,
  };
}
export const statusCapsule = (x, y, st, C, measure) =>
  capsule(x, y, STATUS_LABEL[st].toUpperCase(), C.status[st], C.statusInk[st], measure);
export const badgeCapsule = (x, y, b, C, measure) => b.kind === 'new'
  ? capsule(x, y, b.label.toUpperCase(), C.accent, C.accentInk, measure)
  : capsule(x, y, b.label.toUpperCase(), C.muted, C.muted, measure);

/* REGISTER: the roadmap as a formal table. Columns are FRACTIONS of the
   1720 inner width (item .35/lane .12/horizon .11/status .12/note .30) — an
   unused column (no lanes/statuses/notes) is DROPPED, its share
   redistributed (item always stays). Rows sort horizon -> lane -> srcLine;
   the horizon name prints once per group (ditto-suppressed). Diff: a NEW
   capsule after the title; a moved item's "was X" label prints italic in
   the horizon cell; dropped items become struck rows with a DROPPED
   capsule. Live table + dropped section are both capFit-capped.

   REGISTER_GEOM mirrors render-deck.js's own W/M/INNER constants (1920/100/
   1720) — duplicated on purpose to avoid a value-only import back into
   render-deck.js; roadmap/tests/register-live.test.mjs guards the two stay
   in lockstep. */
export const REGISTER_GEOM = {W: 1920, M: 100, INNER: 1720};

const REGISTER_COLS = [
  {key: 'item', label: 'ITEM', frac: 0.35, always: true},
  {key: 'lane', label: 'LANE', frac: 0.12},
  {key: 'horizon', label: 'HORIZON', frac: 0.11},
  {key: 'status', label: 'STATUS', frac: 0.12},
  {key: 'note', label: 'NOTE', frac: 0.30},
];

export function registerColumns(model){
  const hasLane = model.lanes.some(l => l);
  const hasStatus = model.items.some(i => i.status);
  const hasNote = model.items.some(i => i.note);
  const used = REGISTER_COLS.filter(c => c.always ||
    (c.key === 'lane' && hasLane) ||
    (c.key === 'horizon' && model.horizons.length > 1) ||
    (c.key === 'status' && hasStatus) ||
    (c.key === 'note' && hasNote));
  const total = used.reduce((a, c) => a + c.frac, 0) || 1;
  let x = REGISTER_GEOM.M;
  return used.map(c => {
    const w = c.frac / total * REGISTER_GEOM.INNER;
    const col = {key: c.key, label: c.label, x, w};
    x += w;
    return col;
  });
}

export function registerRows(model){
  const laneRank = new Map(model.lanes.map((l, i) => [l, i]));
  return [...model.items].sort((a, b) =>
    (a.h - b.h) || ((laneRank.get(a.lane) ?? 0) - (laneRank.get(b.lane) ?? 0)) || (a.srcLine - b.srcLine));
}

/* a SPAN is a property of the ITEM, not of the group it's printed in — must
   be recomputed per row (not ditto-suppressed) or a spanning item that isn't
   first in its horizon group would show no range at all. */
export function spanRange(model, it){
  return ((it.span || 1) > 1 || it.spanEnd)
    ? model.horizons[it.h] + ' – ' +
      (it.spanEnd || model.horizons[Math.min(model.horizons.length - 1, it.h + it.span - 1)])
    : null;
}

export const italTxt = (x, y, s, size, fill) => '<text x="' + r2(x) + '" y="' + r2(y) +
  '" font-size="' + size + '" font-style="italic" fill="' + fill + '">' + esc(s) + '</text>';
