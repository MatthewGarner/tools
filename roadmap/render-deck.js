/* (model, ctx, {style}) → a 16:9 DECK svg. Pure — no DOM, no `new Date()`.
   SEPARATE from render.js: /why's map view delegates to renderRoadmap, so
   anything added there lands in /why too (shifted its goldens once).
   render.js stays the working chart; the deck lives here. Named render-*.js
   so renderer-coverage.test.mjs FORCES this into the injection corpus.

   1920×1080, one shared frame (accent rule → Charter title → date → the
   author's `headline:` standfirst, if they wrote one → body band → footer rule
   + metrics). Styles fill the body; colour comes from the doc (palette:/accent:
   via scheme()), never the style — a style owns STRUCTURE. */
import {txt, wrapText} from '../assets/svg.js';
import {PALETTES, scheme} from '../assets/series.js';
import {render as renderChart} from './render.js';
import {rect, line, serifGroup, clip1, wrapN, capsule, statusCapsule,
  SANS, SERIF, r2, capFit, basisBand, basisDesc} from './deck-parts.js';
import {renderRegisterDeck} from './render-register.js';
import {renderBoardDeck} from './render-board.js';
import {renderFocusDeck} from './render-focus.js';
import {layoutRoadmap} from './layout.js';
import {roadmapVerdict} from './parse.js';
export {registerColumns, capFit} from './deck-parts.js';
export {renderRegisterBody} from './render-register.js';
export {renderBoardBody, boardGeometry, typeRamp} from './render-board.js';
export {renderFocusBody, focusHeroIndex, focusColumnCount} from './render-focus.js';

export const W = 1920, H = 1080, M = 100;
const INNER = W - M * 2;                      // 1720

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* metrics footer — the same facts every deck carries */
export function deckMetrics(model){
  /* dropped items leave the status tallies (same rule as activeCount): a dropped
     [risk] item isn't live trouble — except [doing], which is still in flight */
  const by = s => model.items.filter(i => i.status === s &&
    (i.worldState !== 'dropped' || s === 'doing')).length;
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
  const sourceModel = ctx.sourceModel || model;
  const page = ctx.exportPage || null;
  const {measure} = ctx;
  const s = [];
  s.push(rect(0, 0, W, H, C.bg));
  s.push(rect(M, 64, 56, 5, C.accent, {rx: 2.5}));
  /* The frame is a source artefact: a long title or headline must gain height,
     not become an ellipsis in the very export that claims to be complete. */
  const titleLines = wrapText(sourceModel.title || 'Roadmap', '700 38px ' + SERIF, INNER - 390, measure);
  titleLines.forEach((entry, i) => s.push(serifGroup(txt(M, 124 + i * 42, entry, 38, C.ink, {weight: 700}))));
  const dateLabel = sourceModel.dateStr === 'off' ? '' : (sourceModel.dateStr || ctx.today || '');
  if(dateLabel) s.push(txt(W - M, 124, String(dateLabel), 17, C.muted, {anchor: 'end'}));

  const headline = (sourceModel.headline || '').trim();
  const frameTop = 146 + Math.max(0, titleLines.length - 1) * 42;
  let bodyTop = frameTop + 30;
  const basis = basisBand(sourceModel, M, frameTop, INNER, measure, C);
  if(basis.height){
    s.push(basis.svg);
    const afterBasis = frameTop + basis.height;
    bodyTop = afterBasis + 14;
    if(headline){
      const vLines = wrapText(headline, '600 22px ' + SERIF, INNER, measure);
      s.push(serifGroup(vLines.map((ln, i) => txt(M, afterBasis + 22 + i * 30, ln, 22, C.ink, {weight: 600})).join('')));
      bodyTop = afterBasis + 66 + (vLines.length - 1) * 30;
    }
  } else if(headline){
    const vLines = wrapText(headline, '600 22px ' + SERIF, INNER, measure);
    s.push(serifGroup(vLines.map((ln, i) => txt(M, frameTop + 24 + i * 30, ln, 22, C.ink, {weight: 600})).join('')));
    bodyTop = frameTop + 68 + (vLines.length - 1) * 30;
  }
  /* Baseline and story belong to every comparison page. They are separate:
     an author may quite reasonably have no story, but that must never erase
     the identity of the baseline from the exported change artefact. */
  if(ctx.diff?.any){
    const baseline = wrapText('BASELINE · ' + (ctx.diff.since || 'Selected snapshot'), '700 11px ' + SANS, INNER, measure);
    baseline.forEach((entry, i) => s.push(txt(M, bodyTop + 11 + i * 15, entry, 11, C.muted, {weight:700, tracking:1.05})));
    bodyTop += baseline.length * 15 + 6;
    const story = String(sourceModel.story || '').trim();
    if(story){
      const storyLines = wrapText(story, '13px ' + SERIF, INNER, measure);
      s.push(serifGroup(storyLines.map((entry, i) => txt(M, bodyTop + 13 + i * 18, entry, 13, C.ink)).join('')));
      bodyTop += storyLines.length * 18 + 8;
    }
  }

  /* Verdict is an authored/model fact, not a decorative live-only readout.
     It gets as many lines as it needs; the body gives space back rather than
     clipping it or quietly dropping the claim from an exported artefact. */
  const verdict = roadmapVerdict(sourceModel);
  const verdictLines = verdict?.line ? wrapText(verdict.line, '600 14px ' + SANS, INNER - 300, measure) : [];
  const verdictTop = 988 - verdictLines.length * 18;
  s.push(bodyFn(bodyTop, verdictLines.length ? verdictTop - 18 : 968));
  if(verdictLines.length){
    verdictLines.forEach((entry, i) => s.push(txt(M, verdictTop + 14 + i * 18, entry, 14, C.ink, {weight: 600})));
  }
  if(page){
    s.push(txt(W - M, 990, 'PAGE ' + (page.index + 1) + ' OF ' + page.total, 13, C.muted,
      {anchor: 'end', weight: 700, tracking: 1.1}));
  } else if(ctx.roadmapLayout && ctx.roadmapLayout.selection){
    s.push(txt(W - M, 990, ctx.roadmapLayout.selection.line, 13, C.muted,
      {anchor: 'end', weight: 700, tracking: 1.1}));
  }
  s.push(line(M, 1002, W - M, 1002, C.border));
  s.push(txt(M, 1036, deckMetrics(sourceModel), 17, C.muted, {weight: 600}));
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + SANS + '\'>' + basisDesc(model) + s.join('') + '</svg>';
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
    /* headline+story cleared with title/date: the frame prints each ONCE —
       leaving them on the clone doubled the standfirst inside the scaled body */
    const inner = renderChart({...model, title: '', dateStr: 'off', headline: '', story: '', basis: null},
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

function renderStyledDeck(model, ctx, kind){
  const roadmapLayout = layoutRoadmap(model, {kind, measure: ctx.measure, width: W});
  const selectedModel = roadmapLayout.model;
  const renderFn = STYLE_RENDERERS[effectiveStyle(selectedModel)] || STYLE_RENDERERS.board;
  const selectedCtx = {...ctx, roadmapLayout};
  return renderFn(selectedModel, selectedCtx, paletteColors(selectedModel, selectedCtx));
}

export function renderDeck(model, ctx = {}){
  return renderStyledDeck(model, ctx, 'presentation');
}

/* A single, complete page may use the established style-specific composition.
   This is deliberately exported for render-deck-pages only: /why imports the
   legacy presentation renderer and must not pay for Roadmap's page-set planner. */
export function renderDeckNative(model, ctx = {}){
  return renderStyledDeck(model, ctx, 'native');
}
