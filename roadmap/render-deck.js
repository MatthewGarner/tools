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
export {registerColumns, capFit} from './deck-parts.js';
export {renderRegisterBody} from './render-register.js';
export {renderBoardBody, boardGeometry, typeRamp} from './render-board.js';

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

/* FOCUS: attention-weighted. Hero = the first NON-EMPTY horizon (an empty
   Now must not produce an empty hero). Hero column ~1060px under an accent
   wash that HUGS the card stack: the stack lays out FIRST (pure geometry),
   then the wash is sized to its painted extent and emitted before it —
   content-driven height, never a stretched box. 1 column at <=5 items, 2 at
   >=6 (row-pair equalised). Remaining horizons flatten into a ~600px rail
   of ranked indexes, certainty-faded (gated on model.fade). */
export function focusHeroIndex(model){
  const idx = model.horizons.findIndex((_, h) => model.items.some(it => it.h === h));
  return idx < 0 ? 0 : idx;
}
export function focusColumnCount(n){ return n >= 6 ? 2 : 1; }

const HERO_W = 1060, HGAP = 60, RAIL_W = INNER - HERO_W - HGAP;   // 1060 + 60 + 600 = 1720
const HWASH_PAD = 22;

function layoutHeroCard(it, cardW, measure){
  const fT = '700 26px ' + SANS, fN = '16px ' + SANS;
  const PAD = HWASH_PAD;
  const laneH = it.lane ? 22 : 0;
  const tl = wrapN(it.title, fT, cardW - PAD * 2, 2, measure);
  const nl = it.note ? wrapN(it.note, fN, cardW - PAD * 2, 2, measure) : [];
  const statusH = it.status ? 34 : 0;
  const h = PAD * 2 + laneH + tl.length * 32 + (nl.length ? nl.length * 21 + 6 : 0) + statusH;
  return {it, tl, nl, h: Math.max(h, PAD * 2 + 32)};
}

function paintHeroCard(c, x, y, w, C, measure){
  const PAD = HWASH_PAD;
  const s = [];
  const flag = c.it.status === 'risk' ? C.status.risk : c.it.status === 'blocked' ? C.status.blocked : null;
  s.push(rect(x, y, w, c.h, C.card, {rx: 14, stroke: flag || C.border, sw: flag ? 1.5 : 1}));
  if(c.it.lane){
    const laneLbl = c.it.lane.toUpperCase();
    const lw = measure(laneLbl, '700 11px ' + SANS) + laneLbl.length * 0.6;
    s.push(txt(x + w - PAD - lw, y + PAD + 8, laneLbl, 11, C.muted, {weight: 700, tracking: 1.2}));
  }
  let ty = y + PAD + (c.it.lane ? 22 : 0) + 24;
  for(const ln of c.tl){ s.push(txt(x + PAD, ty, ln, 26, C.ink, {weight: 700})); ty += 32; }
  if(c.nl.length){ ty += 4; for(const ln of c.nl){ s.push(txt(x + PAD, ty, ln, 16, C.muted)); ty += 21; } }
  if(c.it.status) s.push(statusCapsule(x + PAD, y + c.h - PAD - 22, c.it.status, C, measure).svg);
  return s.join('');
}

function paintHeroStack(list, {x, y0, w, availH, heroName, C, measure}){
  const twoCol = focusColumnCount(list.length) === 2;
  const colGap = 18, rowGap = 16;
  const cardW = twoCol ? (w - colGap) / 2 : w;
  const laid = list.map(it => layoutHeroCard(it, cardW, measure));
  const rows = [];
  if(twoCol) for(let i = 0; i < laid.length; i += 2) rows.push(laid.slice(i, i + 2));
  else for(const c of laid) rows.push([c]);
  const rowH = r => Math.max(...r.map(c => c.h));
  const shown = capFit(rows.map(rowH), availH, rowGap, 40);

  const s = [];
  let cy = y0;
  for(const row of rows.slice(0, shown)){
    const h = rowH(row);
    row.forEach((c, i) => s.push(paintHeroCard({...c, h}, x + i * (cardW + colGap), cy, cardW, C, measure)));
    cy += h + rowGap;
  }
  if(shown < rows.length){
    s.push(rect(x, cy, w, 40, 'none', {rx: 20, stroke: C.border, sw: 1, dash: '4 4'}));
    const hiddenItems = rows.slice(shown).reduce((a, r) => a + r.length, 0);
    s.push(txt(x + 18, cy + 26, '+ ' + hiddenItems + ' more in ' + heroName, 14, C.muted, {weight: 600}));
    cy += 40;
  }
  return {svg: s.join(''), bottom: cy};
}

function focusBodyFn(model, ctx, C){
  return (y0, y1) => {
    const {measure} = ctx;
    const hs = model.horizons, nH = hs.length;
    const heroIdx = focusHeroIndex(model);
    const heroItems = model.items.filter(i => i.h === heroIdx).sort((a, b) => a.srcLine - b.srcLine);
    const heroX = M, headerH = 44;

    const s = [];
    const overWip = heroIdx === 0 && model.wip > 0 && heroItems.length > model.wip;
    const countLbl = overWip ? heroItems.length + ' — OVER WIP ' + model.wip : String(heroItems.length);
    s.push(txt(heroX, y0 + 30, hs[heroIdx].toUpperCase(), 16, C.accent, {weight: 700, tracking: 1.6}));
    s.push(txt(heroX + HERO_W, y0 + 30, countLbl, 13, overWip ? C.err : C.muted, {anchor: 'end', weight: 700, tracking: 1}));

    const washY0 = y0 + headerH;
    let stack;
    if(!heroItems.length){
      stack = {
        svg: rect(heroX + HWASH_PAD, washY0 + HWASH_PAD, HERO_W - HWASH_PAD * 2, 84, 'none',
          {rx: 12, stroke: C.border, sw: 1, dash: '4 4'}) +
          txt(heroX + HERO_W / 2, washY0 + HWASH_PAD + 48, 'Nothing scheduled', 14, C.muted, {anchor: 'middle'}),
        bottom: washY0 + HWASH_PAD + 84,
      };
    } else {
      const availH = Math.max(60, y1 - (washY0 + HWASH_PAD) - HWASH_PAD);
      stack = paintHeroStack(heroItems, {
        x: heroX + HWASH_PAD, y0: washY0 + HWASH_PAD, w: HERO_W - HWASH_PAD * 2,
        availH, heroName: hs[heroIdx], C, measure,
      });
    }
    const washH = Math.min(y1, stack.bottom + HWASH_PAD) - washY0;
    s.push(rect(heroX, washY0, HERO_W, Math.max(0, washH), C.accent + '0D', {rx: 16}));
    s.push(stack.svg);

    /* rail: every other horizon, flattened into ranked rows, certainty-faded
       by the house formula (only when model.fade) — capFit-capped as a
       single flat sequence of header/row units so termination is provable
       without per-section bookkeeping. */
    const railX = heroX + HERO_W + HGAP;
    const units = [];
    let rank = 0;
    for(let h = 0; h < nH; h++){
      if(h === heroIdx) continue;
      const list = model.items.filter(i => i.h === h).sort((a, b) => a.srcLine - b.srcLine);
      if(!list.length) continue;
      units.push({type: 'header', h, height: 34});
      for(const it of list){ rank++; units.push({type: 'row', h, it, rank, height: 38}); }
    }
    const railAvail = Math.max(0, y1 - y0 - 6);
    const shownU = capFit(units.map(u => u.height), railAvail, 0, 34);
    let ry = y0 + 6;
    for(const u of units.slice(0, shownU)){
      const fadeOp = model.fade && nH > 1 ? 1 - (u.h / (nH - 1)) * 0.35 : 1;
      if(u.type === 'header'){
        s.push(txt(railX, ry + 16, hs[u.h].toUpperCase(), 13, C.muted, {weight: 700, tracking: 1.4}));
        s.push(line(railX, ry + 24, railX + RAIL_W, ry + 24, C.border, 1, 0.6));
      } else {
        const numeral = String(u.rank).padStart(2, '0');
        const laneLbl = u.it.lane ? u.it.lane.toUpperCase() : '';
        const laneW = laneLbl ? measure(laneLbl, '700 10px ' + SANS) + laneLbl.length * 0.6 : 0;
        const titleMaxW = Math.max(20, RAIL_W - 34 - (laneW ? laneW + 14 : 0));
        s.push('<g opacity="' + fadeOp.toFixed(2) + '">');
        s.push(txt(railX, ry + 24, numeral, 15, C.muted, {weight: 700}));
        s.push(txt(railX + 34, ry + 24, clip1(u.it.title, '15px ' + SANS, titleMaxW, measure), 15, C.ink));
        if(laneLbl) s.push(txt(railX + RAIL_W, ry + 22, laneLbl, 10, C.muted, {anchor: 'end', weight: 700, tracking: 1}));
        s.push('</g>');
      }
      ry += u.height;
    }
    if(shownU < units.length){
      const hiddenRows = units.slice(shownU).filter(u => u.type === 'row').length;
      if(hiddenRows) s.push(txt(railX, ry + 20, '+ ' + hiddenRows + ' more', 13, C.muted, {weight: 600}));
    }
    return s.join('');
  };
}

function renderFocusDeck(model, ctx, C){
  return deckFrame(model, ctx, C, focusBodyFn(model, ctx, C));
}
export function renderFocusBody(model, ctx, y0, y1){
  return focusBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
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
