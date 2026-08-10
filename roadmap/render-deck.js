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
  SANS, SERIF, r2, capFit, storyLine, italTxt} from './deck-parts.js';
import {renderRegisterDeck} from './render-register.js';
import {renderBoardDeck} from './render-board.js';
import {renderFocusDeck} from './render-focus.js';
import {layoutRoadmap} from './layout.js';
import {forkEntries, applyWorld, STATUS_LABEL} from './parse.js';
import {cardTag, tagColors} from './cond-parts.js';
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
  const {measure} = ctx;
  const s = [];
  s.push(rect(0, 0, W, H, C.bg));
  s.push(rect(M, 64, 56, 5, C.accent, {rx: 2.5}));
  s.push(serifGroup(txt(M, 124, model.title || 'Roadmap', 38, C.ink, {weight: 700})));
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || ctx.today || '');
  if(dateLabel) s.push(txt(W - M, 124, dateLabel, 17, C.muted, {anchor: 'end'}));

  const headline = (model.headline || '').trim();
  let bodyTop = 176;
  let storyY = 150;
  if(headline){
    const vLines = wrapN(headline, '600 22px ' + SERIF, INNER, 2, measure);
    s.push(serifGroup(vLines.map((ln, i) => txt(M, 170 + i * 30, ln, 22, C.ink, {weight: 600})).join('')));
    bodyTop = 214 + (vLines.length - 1) * 30;
    storyY = 182 + (vLines.length - 1) * 30;
  }
  /* the diff narrative rides the FRAME, so every deck style carries it — the
     export that shows the change must carry the author's line about the change */
  const st = storyLine(model, ctx.diff || null, M, storyY, INNER, measure, C);
  if(st.svg){ s.push(st.svg); bodyTop = storyY + st.height + 14; }

  s.push(bodyFn(bodyTop, 968));
  if(ctx.roadmapLayout && ctx.roadmapLayout.selection){
    s.push(txt(W - M, 990, ctx.roadmapLayout.selection.line, 13, C.muted,
      {anchor: 'end', weight: 700, tracking: 1.1}));
  }
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
    /* headline+story cleared with title/date: the frame prints each ONCE —
       leaving them on the clone doubled the standfirst inside the scaled body */
    const inner = renderChart({...model, title: '', dateStr: 'off', headline: '', story: ''},
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

/* ------------------------------------------------------------------- *
 * E7 — world spread (`deck: spread`). Opt-in, and full-model ONLY: unlike
 * every style body above, this never runs through layoutRoadmap's
 * presentation strip — a spread panel's membership is a claim about the
 * WHOLE plan (`k of t items`, `t` = model.items.length), so trimming to
 * three horizons first would silently make that claim about a subset while
 * still printing the total. deckFrame still prints the same title/date/
 * standfirst/metrics — it's handed the identical, unstripped model, so
 * every number on the slide describes one document.
 *
 * Compare (per-item diff badges) and what-if are deliberately NOT part of
 * this lens: compare answers "what changed since a snapshot", spread answers
 * "what does this ONE open bet decide" — different questions, so diff badges
 * are ignored here rather than layered on top (frame's own storyLine still
 * carries the diff narrative). What-if previews are never exported at all
 * (existing doctrine, cond-parts.js) — this body renders the TEXT world's
 * own biggest fork, never a hypothetical one a viewer clicked into.
 * ------------------------------------------------------------------- */

/* compact left/right cards: title + lane/status subline, oldest-declared
   first (srcLine) — same ordering rule as every other roadmap listing. */
function spreadCardRows(idxs, model){
  return idxs.map(i => model.items[i]).sort((a, b) => a.srcLine - b.srcLine).map(it => {
    const sub = [it.lane ? it.lane.toUpperCase() : '', it.status ? STATUS_LABEL[it.status].toUpperCase() : '']
      .filter(Boolean).join('   ·   ');
    return {it, sub, h: sub ? 46 : 28};
  });
}

function paintSpreadPanel(rows, {cx, cy0, cw, availH, C, measure}){
  const s = [];
  const heights = rows.map(r => r.h);
  const shown = capFit(heights, availH, 10, 34);
  let cy = cy0;
  for(let i = 0; i < shown; i++){
    const {it, sub} = rows[i];
    s.push(txt(cx, cy + 17, clip1(it.title, '600 15px ' + SANS, cw, measure), 15, C.ink, {weight: 600}));
    if(sub) s.push(txt(cx, cy + 35, sub, 11, C.muted, {weight: 700, tracking: 0.5}));
    cy += rows[i].h + 10;
  }
  if(shown < rows.length) s.push(txt(cx, cy + 12, '+ ' + (rows.length - shown) + ' more', 13, C.muted, {weight: 600}));
  return s.join('');
}

/* centre panel: EITHER WAY — count + up to 5 titles, items still cond in
   BOTH the won and lost projections (waiting on some OTHER, unrelated bet)
   render ghosted with their existing capsule (cardTag reads the ORIGINAL
   text-world model — the other bet is exactly as unresolved there). */
function paintCentrePanel(idxs, model, won, lost, {cx, cy0, cw, availH, C, measure}){
  const rows = [...idxs].sort((a, b) => model.items[a].srcLine - model.items[b].srcLine);
  const s = [];
  s.push(txt(cx, cy0 - 8, String(rows.length) + (rows.length === 1 ? ' item' : ' items'), 15, C.ink, {weight: 700}));
  const CAP = 5;
  let cy = cy0 + 20;
  const rowH = 26;
  for(let i = 0; i < Math.min(CAP, rows.length) && (cy - cy0) < availH; i++){
    const idx = rows[i], it = model.items[idx];
    const ghost = won.items[idx].worldState === 'cond' && lost.items[idx].worldState === 'cond';
    const tag = ghost ? cardTag(model, it) : null;
    if(tag){
      const [tcol, tink] = tagColors(tag, C);
      const cap = capsule(cx, cy, tag.label, tcol, tink, measure);
      s.push('<g opacity="0.65">' + cap.svg +
        txt(cx, cy + 40, clip1(it.title, '600 13px ' + SANS, cw, measure), 13, C.ink, {weight: 600}) + '</g>');
      cy += 58;
    } else {
      s.push(txt(cx, cy + 12, clip1(it.title, '600 13px ' + SANS, cw, measure), 13, C.ink, {weight: 600}));
      cy += rowH;
    }
  }
  if(rows.length > CAP) s.push(txt(cx, cy + 6, '+ ' + (rows.length - CAP) + ' more', 12, C.muted, {weight: 600}));
  return s.join('');
}

function spreadBodyFn(model, ctx){
  return (y0, y1, C) => {
    const {measure} = ctx;
    const entries = forkEntries(model);
    const top = entries[0];
    const nameLc = top.name, display = top.display;
    const won = applyWorld(model, {[nameLc]: 'won'});
    const lost = applyWorld(model, {[nameLc]: 'lost'});
    const items = model.items;
    const leftIdx = [], rightIdx = [], centreIdx = [];
    for(let i = 0; i < items.length; i++){
      const w = won.items[i].worldState !== 'dropped';
      const l = lost.items[i].worldState !== 'dropped';
      if(w && !l) leftIdx.push(i);
      else if(!w && l) rightIdx.push(i);
      else if(w && l && items[i].status !== 'done') centreIdx.push(i);
    }

    const gap = 28;
    const usable = INNER - gap * 2;
    const leftW = r2(usable * 0.4), centreW = r2(usable * 0.2), rightW = usable - leftW - centreW;
    const leftX = M, centreX = leftX + leftW + gap, rightX = centreX + centreW + gap;

    const bandBottom = Math.min(968, y1) - 34;   // room for the reading line
    const kickerY = y0 + 20;
    const panelTop = y0 + 44;
    const availH = Math.max(0, bandBottom - panelTop);

    /* each panel emits as one self-contained block — background, kicker,
       body — rather than interleaving all three kickers first: keeps every
       panel's markup contiguous in the output (nothing but geometry rides
       on the order; SVG has no z-order concern here since the panels never
       overlap). */
    const s = [];
    const leftRows = spreadCardRows(leftIdx, model);
    const rightRows = spreadCardRows(rightIdx, model);

    s.push(rect(leftX, y0, leftW, bandBottom - y0, C.status.done + '0D', {rx: 14}));
    s.push(txt(leftX + 20, kickerY, ('IF ' + display + ' PAYS OFF').toUpperCase(), 14, C.statusInk.done,
      {weight: 700, tracking: 1.3}));
    s.push(leftRows.length
      ? paintSpreadPanel(leftRows, {cx: leftX + 20, cy0: panelTop, cw: leftW - 40, availH, C, measure})
      : italTxt(leftX + 20, panelTop + 20, 'nothing new starts', 14, C.muted));

    s.push(rect(centreX, y0, centreW, bandBottom - y0, C.ink + '05', {rx: 14}));
    s.push(txt(centreX + centreW / 2, kickerY, 'EITHER WAY', 13, C.muted, {anchor: 'middle', weight: 700, tracking: 1.3}));
    s.push(paintCentrePanel(centreIdx, model, won, lost,
      {cx: centreX + 16, cy0: panelTop, cw: centreW - 32, availH, C, measure}));

    s.push(rect(rightX, y0, rightW, bandBottom - y0, C.status.blocked + '0D', {rx: 14}));
    s.push(txt(rightX + 20, kickerY, "IF IT DOESN'T", 14, C.statusInk.blocked, {weight: 700, tracking: 1.3}));
    s.push(rightRows.length
      ? paintSpreadPanel(rightRows, {cx: rightX + 20, cy0: panelTop, cw: rightW - 40, availH, C, measure})
      : italTxt(rightX + 20, panelTop + 20, 'nothing new starts', 14, C.muted));

    const readingY = bandBottom + 26;
    s.push(txt(M, readingY, 'The ' + display + ' answer decides ' + top.n + ' of ' + items.length + ' items.',
      15, C.muted, {weight: 600}));
    return s.join('');
  };
}

function renderSpreadDeck(model, ctx, C){
  return deckFrame(model, ctx, C, (y0, y1) => spreadBodyFn(model, ctx)(y0, y1, C));
}

export function renderDeck(model, ctx = {}){
  /* E7: the spread branch renders the ORIGINAL, full model — no presentation
     strip, no strip note — and runs BEFORE layoutRoadmap so its numbers can
     never disagree with the frame's. forkEntries(model).length is the same
     guard parse.js's own end-of-parse warning uses (re-derived here, not
     stored on the model, so a caller that mutates a model after parsing —
     applyWorld previews, /why's synthetic model — always gets a fresh read).
     /why's map view builds a model with no `deck` key at all, so this branch
     is unreachable there by construction — the call at why/render-map.js:105
     is untouched. */
  if(model.deck === 'spread' && model.bets && forkEntries(model).length){
    return renderSpreadDeck(model, ctx, paletteColors(model, ctx));
  }
  const roadmapLayout = layoutRoadmap(model, {kind: 'presentation', measure: ctx.measure, width: W});
  const selectedModel = roadmapLayout.model;
  const renderFn = STYLE_RENDERERS[effectiveStyle(selectedModel)] || STYLE_RENDERERS.board;
  const selectedCtx = {...ctx, roadmapLayout};
  return renderFn(selectedModel, selectedCtx, paletteColors(selectedModel, selectedCtx));
}
