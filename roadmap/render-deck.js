/* (model, ctx, {style}) → a 16:9 DECK svg. Pure — no DOM, no `new Date()`.
   SEPARATE from render.js: /why's map view delegates to renderRoadmap, so
   anything added there lands in /why too (shifted its goldens once).
   render.js stays the working chart; the deck lives here. Named render-*.js
   so renderer-coverage.test.mjs FORCES this into the injection corpus.

   1920×1080, one shared frame (accent rule → Charter title → date → the
   author's `headline:` standfirst, if they wrote one → body band → footer rule
   + metrics). Styles fill the body; colour comes from the doc (palette:/accent:
   via scheme()), never the style — a style owns STRUCTURE. */
import {txt} from '../assets/svg.js';
import {PALETTES, scheme} from '../assets/series.js';
import {render as renderChart} from './render.js';
import {rect, line, serifGroup, clip1, wrapN, capsule, statusCapsule,
  SANS, SERIF, r2, capFit} from './deck-parts.js';
import {renderRegisterDeck} from './render-register.js';
import {renderBoardDeck} from './render-board.js';
import {renderFocusDeck} from './render-focus.js';
export {registerColumns, capFit} from './deck-parts.js';
export {renderRegisterBody} from './render-register.js';
export {renderBoardBody, boardGeometry, typeRamp} from './render-board.js';
export {renderFocusBody, focusHeroIndex, focusColumnCount} from './render-focus.js';

export const W = 1920, H = 1080, M = 100;
const INNER = W - M * 2;                      // 1720

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* metrics footer — the same facts every deck carries */
export function deckMetrics(model){
  const by = s => model.items.filter(i => i.status === s).length;
  return [plural(model.items.length, 'item', 'items'),
          plural(model.horizons.length, 'horizon', 'horizons'),
          by('doing') ? by('doing') + ' in progress' : null,
          by('risk') ? by('risk') + ' at risk' : null,
          by('blocked') ? by('blocked') + ' blocked' : null].filter(Boolean).join(' · ');
}


/* Shared frame: accent rule -> Charter title -> date -> the AUTHORED headline
   standfirst (wrapped to <=2 lines, budgeting the body band down when it wraps)
   -> body -> footer rule -> metrics. `today` is INJECTED via ctx (no `new Date()`
   here): printed when model.dateStr is null, suppressed entirely on the
   literal string 'off' (mirrors render.js's date semantics).

   No headline is not a defect: the standfirst is dropped and the body takes the
   band back, so the deck reads as a titled board rather than one with a hole. */
export function deckFrame(model, ctx, C, bodyFn){
  const {measure} = ctx;
  const s = [];
  s.push(rect(0, 0, W, H, C.bg));
  s.push(rect(M, 64, 56, 5, C.accent, {rx: 2.5}));
  s.push(serifGroup(txt(M, 124, model.title || 'Roadmap', 38, C.ink, {weight: 700})));
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || ctx.today || '');
  if(dateLabel) s.push(txt(W - M, 124, dateLabel, 17, C.muted, {anchor: 'end'}));

  const headline = (model.headline || '').trim();
  let bodyTop = 176;
  if(headline){
    const vLines = wrapN(headline, '600 22px ' + SERIF, INNER, 2, measure);
    s.push(serifGroup(vLines.map((ln, i) => txt(M, 170 + i * 30, ln, 22, C.ink, {weight: 600})).join('')));
    bodyTop = 214 + (vLines.length - 1) * 30;
  }

  s.push(bodyFn(bodyTop, 968));
  s.push(line(M, 1002, W - M, 1002, C.border));
  s.push(txt(M, 1036, deckMetrics(model), 17, C.muted, {weight: 600}));
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + SANS + '\'>' + s.join('') + '</svg>';
}

export function paletteColors(model, ctx){
  const dark = !!ctx.dark;
  const paletteHex = model.accent ||
    (PALETTES[model.palette] ? PALETTES[model.palette][dark ? 'dark' : 'light'] : null);
  return paletteHex ? {...ctx.colors, ...scheme(paletteHex, dark)} : ctx.colors;
}

/* GRID: the existing chart, scaled to fit the deck. Deliberately REPLACES a
   bespoke timeline: render.js already stacks N items per lane x period —
   stacking IS the grid. render.js is only ever CALLED, never edited (the
   containment story). title/date are suppressed on the INNER chart via a
   model clone (the frame prints them once); the chart rides in a nested
   <svg x y width height viewBox>, which clips to its own box for free. */
/* Vector, so a small board may grow to fill the frame — a 3-item chart printed
   at 1:1 on a 1920 slide is a stamp in a field of air, and projected type wants
   the size. Capped at MAX_UP: past that the cards read as a mistake, not a chart. */
export const MAX_UP = 1.4;
export function gridFit(w, h, boxW, boxH){
  const scale = Math.max(0, Math.min(w > 0 ? boxW / w : 1, h > 0 ? boxH / h : 1, MAX_UP));
  return {scale, x: (boxW - w * scale) / 2, y: (boxH - h * scale) / 2};
}
function svgDims(svg){
  const w = svg.match(/\swidth="(\d+(?:\.\d+)?)"/);
  const h = svg.match(/\sheight="(\d+(?:\.\d+)?)"/);
  return {w: w ? +w[1] : 1, h: h ? +h[1] : 1};
}
function innerOfSvg(svg){
  const open = svg.indexOf('>') + 1;
  const close = svg.lastIndexOf('</svg>');
  return svg.slice(open, close > 0 ? close : svg.length);
}

function gridBodyFn(model, ctx, C){
  return (y0, y1) => {
    const {measure, diff = null, dark = false} = ctx;
    const inner = renderChart({...model, title: '', dateStr: 'off'},
      {colors: ctx.colors, measure, diff, dark, slide: true});
    const {w, h} = svgDims(inner);
    const bodyH = Math.max(0, y1 - y0);
    const fit = gridFit(w, h, INNER, bodyH);
    const x = M + fit.x, y = y0 + fit.y;
    return '<svg x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w * fit.scale) +
      '" height="' + r2(h * fit.scale) + '" viewBox="0 0 ' + w + ' ' + h + '">' + innerOfSvg(inner) + '</svg>';
  };
}

function renderGridDeck(model, ctx, C){
  return deckFrame(model, ctx, C, gridBodyFn(model, ctx, C));
}
export function renderGridBody(model, ctx, y0, y1){
  return gridBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
}

/* Style dispatch (E): style: DSL key, else grid on a time axis, else board.
   Exported so the picker (app.js) can show which chip is ACTIVE without a
   second copy of this resolution rule. */
export function effectiveStyle(model){
  return model.style || (model.timeAxis ? 'grid' : 'board');
}
const STYLE_RENDERERS = {
  board: renderBoardDeck, register: renderRegisterDeck, focus: renderFocusDeck, grid: renderGridDeck,
};

export function renderDeck(model, ctx = {}){
  const renderFn = STYLE_RENDERERS[effectiveStyle(model)] || STYLE_RENDERERS.board;
  return renderFn(model, ctx, paletteColors(model, ctx));
}
