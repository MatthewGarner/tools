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
import {STATUS_LABEL} from './parse.js';
import {PALETTES, scheme} from '../assets/series.js';
import {render as renderChart} from './render.js';
import {rect, line, serifGroup, clip1, wrapN, capsule, statusCapsule, badgeCapsule,
  SANS, SERIF, r2} from './deck-parts.js';
import {renderRegisterDeck} from './render-register.js';
export {registerColumns} from './deck-parts.js';
export {renderRegisterBody} from './render-register.js';

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


/* Column type ramp, by width: wider columns get bigger type and room for a
   note; the narrowest ramp (nH ~6-8) drops notes entirely (fsN: 0, notes: 0). */
export function typeRamp(colW){
  return colW >= 500 ? {fsT: 21, fsN: 15, pad: 20, notes: 2}
       : colW >= 380 ? {fsT: 19, fsN: 14, pad: 16, notes: 2}
       : colW >= 300 ? {fsT: 17, fsN: 13, pad: 14, notes: 1}
       : {fsT: 15, fsN: 0, pad: 12, notes: 0};
}

/* Greedy "how many rows/cards fit" with a reserved chip budget — the terminal
   rung of the overflow ladder, shared by card and list columns. Invariant
   that makes containment provable: whenever the returned count is less than
   heights.length, shown-height + gaps + chipReserve is still <= availH — so
   the "+N more" chip the caller draws right after always lands in bounds. */
export function capFit(heights, availH, gap, chipReserve){
  const n = heights.length;
  const total = heights.reduce((a, h) => a + h, 0) + Math.max(0, n - 1) * gap;
  if(total <= availH) return n;
  let acc = 0, shown = 0;
  for(const h of heights){
    if(acc + h + (shown ? gap : 0) + chipReserve > availH) break;
    acc += h + (shown ? gap : 0);
    shown++;
  }
  return shown;
}

/* Board-wide density check: estimate every column with the SMALLEST clamped
   card height for this ramp — if that estimate would still hide >25% of a
   column's items (after budgeting the "+N more" chip), the WHOLE board flips
   to list rows. A worst-case estimate keeps the decision a single
   deterministic pass, independent of card layout order. */
export function boardGeometry(model, zoneH){
  const nH = model.horizons.length;
  const gap = 28;
  const colW = nH > 0 ? (INNER - (nH - 1) * gap) / nH : INNER;
  const ramp = typeRamp(colW);
  const headH = 56;
  const availH = zoneH - headH - 14;
  const minCardH = ramp.pad * 2 + ramp.fsT + 5 + 30;
  const counts = model.horizons.map((_, h) => model.items.filter(i => i.h === h).length);
  const listMode = counts.some(k => {
    if(!k) return false;
    const fitAll = Math.floor((availH + 14) / (minCardH + 14));
    if(k <= fitAll) return false;
    const fitWithChip = Math.floor((availH - 54 + 14) / (minCardH + 14));
    return (k - Math.max(0, fitWithChip)) / k > 0.25;
  });
  return {colW, gap, ramp, headH, availH, minCardH, counts, listMode};
}

/* CARD column: drop-notes -> clamp-title -> cap+chip ladder, capFit sharing
   the same proven-terminating helper the list path uses. */
function paintCardColumn(list, {cx, cy0, cw, availH, ramp, fadeOp, badgeOf, C, measure}){
  const fT = '700 ' + ramp.fsT + 'px ' + SANS, fN = ramp.fsN + 'px ' + SANS;
  const layCards = (noteLines, titleLines) => list.map(it => {
    const b = badgeOf(it);
    const tl = wrapN(it.title, fT, cw - ramp.pad * 2, titleLines, measure);
    const nl = it.note && noteLines ? wrapN(it.note, fN, cw - ramp.pad * 2, noteLines, measure) : [];
    const foot = it.lane || it.status ? 30 : 6;
    return {it, b, tl, nl,
      h: ramp.pad * 2 + (b ? 30 : 0) + tl.length * (ramp.fsT + 5) + nl.length * (ramp.fsN + 6) + foot};
  });
  const sumH = cards => cards.reduce((a, c) => a + c.h, 0) + Math.max(0, cards.length - 1) * 14;
  let cards = layCards(ramp.notes, 2);
  if(sumH(cards) > availH) cards = layCards(0, 2);          // drop notes
  if(sumH(cards) > availH) cards = layCards(0, 1);          // clamp titles to 1 line
  const shown = capFit(cards.map(c => c.h), availH, 14, 54); // cap + chip

  const s = [];
  let cy = cy0;
  const capsuleWidth = label => measure(label, '700 11px ' + SANS) + 16;
  for(const c of cards.slice(0, shown)){
    const {it} = c;
    const flag = it.status === 'risk' ? C.status.risk : it.status === 'blocked' ? C.status.blocked : null;
    s.push('<g opacity="' + fadeOp.toFixed(2) + '">');
    s.push(rect(cx, cy, cw, c.h, C.card, {rx: 12, stroke: flag || C.border, sw: flag ? 1.5 : 1}));
    let ty = cy + ramp.pad;
    if(c.b){ s.push(badgeCapsule(cx + ramp.pad, ty - 4, c.b, C, measure).svg); ty += 30; }
    ty += ramp.fsT - 4;
    for(const ln of c.tl){ s.push(txt(cx + ramp.pad, ty, ln, ramp.fsT, C.ink, {weight: 700})); ty += ramp.fsT + 5; }
    for(const ln of c.nl){ s.push(txt(cx + ramp.pad, ty, ln, ramp.fsN, C.muted)); ty += ramp.fsN + 6; }
    const fy = cy + c.h - ramp.pad - 6;
    if(it.lane) s.push(txt(cx + ramp.pad, fy + 4, it.lane.toUpperCase(), 11, C.muted, {weight: 700, tracking: 1.2}));
    if(it.status){
      const capW = measure(STATUS_LABEL[it.status].toUpperCase(), '600 12px ' + SANS) +
        STATUS_LABEL[it.status].length * 0.6 + 18;
      const laneW = it.lane ? capsuleWidth(it.lane.toUpperCase()) : 0;
      if(laneW + capW <= cw - ramp.pad * 2 + 8)
        s.push(statusCapsule(cx + cw - ramp.pad - capW, fy - 12, it.status, C, measure).svg);
    }
    s.push('</g>');
    cy += c.h + 14;
  }
  if(shown < cards.length){
    s.push(rect(cx, cy, cw, 40, 'none', {rx: 20, stroke: C.border, sw: 1, dash: '4 4'}));
    s.push(txt(cx + 18, cy + 26, '+ ' + (cards.length - shown) + ' more', 14, C.muted, {weight: 600}));
  }
  return {svg: s.join(''), shown, total: cards.length};
}

/* LIST column (the flipped board): title + a muted LANE · STATUS · note
   sub-line, single line each (clip1, never wraps), fixed row height 38/56 —
   flagged rows carry a 3px status-coloured edge bar, never colour alone.
   capFit-capped with its own "+N more" chip. */
function paintListColumn(list, {cx, cy0, cw, fadeOp, availH, C, measure}){
  const rows = list.map(it => {
    const sub = [it.lane ? it.lane.toUpperCase() : '',
      it.status ? STATUS_LABEL[it.status].toUpperCase() : '', it.note || ''].filter(Boolean).join('  ·  ');
    return {it, sub, h: sub ? 56 : 38};
  });
  const shown = capFit(rows.map(r => r.h), availH, 0, 48);

  const s = [];
  let ry = cy0;
  for(const r of rows.slice(0, shown)){
    const {it, sub} = r;
    const flag = it.status === 'risk' || it.status === 'blocked';
    s.push('<g opacity="' + fadeOp.toFixed(2) + '">');
    if(flag) s.push(rect(cx, ry + 2, 3, sub ? 44 : 28, C.status[it.status], {rx: 1.5}));
    const tx = cx + (flag ? 14 : 0);
    s.push(txt(tx, ry + 18, clip1(it.title, '600 17px ' + SANS, cw - (flag ? 14 : 0), measure), 17, C.ink, {weight: 600}));
    if(sub) s.push(txt(tx, ry + 38, clip1(sub, '12.5px ' + SANS, cw - (flag ? 14 : 0), measure), 12.5,
      flag ? C.statusInk[it.status] : C.muted, {tracking: 0.3}));
    s.push('</g>');
    ry += r.h;
    s.push(line(cx, ry - 12, cx + cw, ry - 12, C.border, 1, 0.55));
  }
  if(shown < rows.length){
    s.push(rect(cx, ry, cw, 40, 'none', {rx: 20, stroke: C.border, sw: 1, dash: '4 4'}));
    s.push(txt(cx + 18, ry + 26, '+ ' + (rows.length - shown) + ' more', 14, C.muted, {weight: 600}));
  }
  return {svg: s.join(''), shown, total: rows.length};
}

/* BOARD body: horizons as columns (lane rides as a tag, no rail), first
   horizon washed with the accent, in-plane letterspaced label + count per
   column, certainty fade (gated to model.fade), the overflow ladder above.
   Returns (y0, y1) -> svg so deckFrame can budget the band around a 1- or
   2-line standfirst wrap. */
function boardBodyFn(model, ctx, C){
  return (y0, y1) => {
    const {measure, diff = null} = ctx;
    const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;
    const hs = model.horizons, nH = hs.length;
    const zoneH = y1 - y0;
    const {colW, gap, ramp, headH, availH, listMode} = boardGeometry(model, zoneH);
    const items = model.items;
    const inH = h => items.filter(i => i.h === h);
    const laneRank = new Map(model.lanes.map((l, i) => [l, i]));
    const byLane = arr => [...arr].sort((a, b) =>
      (laneRank.get(a.lane) - laneRank.get(b.lane)) || (a.srcLine - b.srcLine));
    const overWip = model.wip > 0 && inH(0).length > model.wip;

    const s = [];
    for(let h = 0; h < nH; h++){
      const x = M + h * (colW + gap);
      s.push(rect(x, y0, colW, zoneH, h === 0 ? C.accent + '0D' : C.ink + '05', {rx: 14}));
      s.push(txt(x + 20, y0 + 34, hs[h].toUpperCase(), 15, h === 0 ? C.accent : C.muted, {weight: 700, tracking: 1.6}));
      const list = byLane(inH(h));
      const countLbl = h === 0 && overWip ? list.length + ' · OVER WIP' : String(list.length);
      s.push(txt(x + colW - 20, y0 + 34, countLbl, 13, h === 0 && overWip ? C.err : C.muted,
        {anchor: 'end', weight: 700, tracking: 1}));

      const cx = x + 16, cw = colW - 32;
      if(!list.length){
        s.push(rect(cx, y0 + headH, cw, 84, 'none', {rx: 12, stroke: C.border, sw: 1, dash: '4 4'}));
        s.push(txt(cx + cw / 2, y0 + headH + 48, 'Nothing scheduled', 14, C.muted, {anchor: 'middle'}));
        continue;
      }
      const fadeOp = model.fade && nH > 1 ? 1 - (h / (nH - 1)) * 0.35 : 1;
      const r = listMode
        ? paintListColumn(list, {cx, cy0: y0 + headH + 8, cw, fadeOp, availH, C, measure})
        : paintCardColumn(list, {cx, cy0: y0 + headH, cw, availH, ramp, fadeOp, badgeOf, C, measure});
      s.push(r.svg);
    }
    if(diff && diff.dropped && diff.dropped.length){
      const lbl = 'Dropped since ' + diff.since + ':  ' + diff.dropped.join('  ·  ');
      s.push(txt(W - M, 1036, clip1(lbl, '15px ' + SANS, 760, measure), 15, C.muted, {anchor: 'end', strike: true}));
    }
    return s.join('');
  };
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

function renderBoardDeck(model, ctx, C){
  return deckFrame(model, ctx, C, boardBodyFn(model, ctx, C));
}

/* Test-only entry point: the board BODY fragment alone (no frame), so the
   overflow-ladder torture tests can bounds-sweep against y1 directly instead
   of excluding the frame's own footer text (legitimately below y=1036). */
export function renderBoardBody(model, ctx, y0, y1){
  return boardBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
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
