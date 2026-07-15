/* The focus composition: a movable lens — one horizon as the hero of big cards,
   the rest as a ranked rail. TWO paint passes over the shared model — the DECK
   export (byte-identical) and the LIVE editable view (Task 4). Named render-*.js
   so renderer-coverage forces the live renderer into the injection corpus. */
import {txt} from '../assets/svg.js';
import {rect, line, clip1, wrapN, capFit, statusCapsule, SANS} from './deck-parts.js';
import {deckFrame, paletteColors, M} from './render-deck.js';
/* Fixed deck geometry as LITERALS — RAIL_W must NOT be `INNER - HERO_W - HGAP`
   with INNER imported from render-deck.js: across the import cycle those consts
   are in the TDZ at module-load and throw. INNER is 1720 on the 1920 deck. */
const HERO_W = 1060, HGAP = 60, RAIL_W = 600, HWASH_PAD = 22;

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

export function renderFocusDeck(model, ctx, C){
  return deckFrame(model, ctx, C, focusBodyFn(model, ctx, C));
}
export function renderFocusBody(model, ctx, y0, y1){
  return focusBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
}
