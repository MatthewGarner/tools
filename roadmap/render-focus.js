/* The focus composition: a movable lens — one horizon as the hero of big cards,
   the rest as a ranked rail. TWO paint passes over the shared model — the DECK
   export (byte-identical) and the LIVE editable view (Task 4). Named render-*.js
   so renderer-coverage forces the live renderer into the injection corpus. */
import {txt, esc, btnAttrs} from '../assets/svg.js';
import {rect, line, clip1, wrapN, capFit, capsule, statusCapsule, badgeCapsule, serifGroup, SANS} from './deck-parts.js';
import {deckFrame, paletteColors, deckMetrics, M} from './render-deck.js';
import {STATUS_LABEL} from './parse.js';
/* Fixed deck geometry as LITERALS — RAIL_W must NOT be `INNER - HERO_W - HGAP`
   with INNER imported from render-deck.js: across the import cycle those consts
   are in the TDZ at module-load and throw. INNER is 1720 on the 1920 deck. */
const HERO_W = 1060, HGAP = 60, RAIL_W = 600, HWASH_PAD = 22;

/* FOCUS: attention-weighted. Hero = the horizon named by `focus:`, or — when
   that key is absent, blank, or names no real horizon — the first NON-EMPTY
   horizon (an empty Now must not produce an empty hero by default; a doc
   with no focus: key resolves exactly as before the key existed). An
   explicitly named horizon wins even if it's empty — that's the lens doing
   its job, not a bug. Hero column ~1060px under an accent
   wash that HUGS the card stack: the stack lays out FIRST (pure geometry),
   then the wash is sized to its painted extent and emitted before it —
   content-driven height, never a stretched box. 1 column at <=5 items, 2 at
   >=6 (row-pair equalised). Remaining horizons flatten into a ~600px rail
   of ranked indexes, certainty-faded (gated on model.fade). */
export function focusHeroIndex(model){
  if(model.focus){
    const want = model.focus.toLowerCase();
    const named = model.horizons.findIndex(h => h.toLowerCase() === want);
    if(named >= 0) return named;   // an explicitly named horizon wins, even if empty
  }
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

/* --------------------------------------------------------------------- *
 * LIVE editable focus lens (Task 4). A sibling of the deck paint above:
 * same hero-plus-rail composition (focusHeroIndex resolves the lens), but
 * a fixed-width two-zone layout, content-driven height, and edit markup
 * gated on ctx.edit. edit:false must emit ZERO edit markup — that's the
 * export/golden path.
 *
 * Density (Matt's call, 2026-07-15 — "clean rail + Status submenu"): the
 * HERO card gets FULL inline edit targets (title/note/status/lane),
 * mirroring render-board.js's paintBoardCard. The RAIL row stays a CLEAN
 * ranked index — numeral + an editable title (rename) + a read-only lane
 * label — no status/lane/note targets at all; rail status moves through a
 * card-menu submenu (Task 5), not an inline target. Both hero AND rail
 * rows carry a cardmenu group (rename + "more options" live everywhere);
 * only the hero paints new/moved diff badges — the rail stays diff-clean.
 *
 * W is computed INSIDE renderFocusLive from the LOCAL FOCUS_LIVE.M, never
 * at module top level: render-focus.js imports M from render-deck.js
 * across an import cycle, so a module-top const referencing that import
 * would throw a TDZ ReferenceError at load (see the HERO_W/RAIL_W comment
 * above, same trap). ------------------------------------------------------ */
const FOCUS_LIVE = {M: 24, HERO_W: 720, HGAP: 40, RAIL_W: 360, RPAD: 16, HEADH: 40};

/* HERO card — full edit targets + a new/moved badge, buffered by the
   caller so the drop band stays under it (A2). Returns {svg, h}. A near
   copy of paintBoardCard (render-board.js), scaled to hero type, but BOTH
   badge kinds paint here (paintBoardCard paints 'new' only — that is a
   board-live gap, not the contract here). The 'new' badge reuses
   badgeCapsule (accent pill, upper-cased label, the house "new" read); the
   'moved' badge is painted with the raw capsule() builder instead — it
   must NOT go through badgeCapsule's upper-casing, because the "was X"
   label is a horizon NAME and needs to stay readable in its given case. */
function paintFocusHeroCard(it, x, y, w, {C, measure, edit, badgeOf}){
  const {RPAD} = FOCUS_LIVE;
  const fT = '700 26px ' + SANS, fN = '16px ' + SANS;
  const b = badgeOf(it);
  const tl = wrapN(it.title, fT, w - RPAD * 2, 2, measure);
  const nl = it.note ? wrapN(it.note, fN, w - RPAD * 2, 2, measure) : [];
  const footH = it.lane || it.status || edit ? 30 : 10;
  // reserve the note row's height: a real note, OR (edit only) the "+ note"
  // ghost row emitted below — mirrors paintBoardCard's noteH reservation so
  // the ghost never collides with the lane/status foot.
  const noteH = nl.length ? nl.length * 21 + 6 : (edit ? 21 : 0);
  const h = RPAD * 2 + tl.length * 32 + noteH + footH;
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const flag = it.status === 'risk' ? C.status.risk : it.status === 'blocked' ? C.status.blocked : null;
  const g = [];
  g.push('<g' + (edit ? ' data-edit="cardmenu" data-line="' + it.srcLine + '" data-key="' + esc(key) + '"' +
    btnAttrs('More options: ' + it.title) + ' data-menu=""' : '') + '>');
  g.push(rect(x, y, w, h, C.card, {rx: 14, stroke: flag || C.border, sw: flag ? 1.5 : 1}));
  if(edit) g.push('<rect data-hit="" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="transparent"/>');
  let ty = y + RPAD + 20;
  tl.forEach((ln, li) => {
    g.push('<text' + (edit && li === 0 ? ' data-edit="title" data-line="' + it.srcLine + '" data-raw="' + esc(it.title) + '"' +
      btnAttrs('Rename: ' + it.title) : '') +
      ' x="' + (x + RPAD) + '" y="' + ty + '" font-size="26" font-weight="700" fill="' + C.ink + '">' + esc(ln) + '</text>');
    ty += 32;
  });
  if(nl.length){ ty += 4; nl.forEach((ln, i) => {
    g.push('<text' + (edit && i === 0 ? ' data-edit="note" data-line="' + it.srcLine + '" data-raw="' + esc(it.note) + '"' +
      btnAttrs('Edit note: ' + it.title) : '') +
      ' x="' + (x + RPAD) + '" y="' + ty + '" font-size="16" fill="' + C.muted + '">' + esc(ln) + '</text>');
    ty += 21;
  }); } else if(edit){
    g.push('<text data-edit="note" data-line="' + it.srcLine + '" data-raw="" x="' + (x + RPAD) + '" y="' + ty +
      '" font-size="14" fill="' + C.muted + '" opacity="0.55"' + btnAttrs('Add note: ' + it.title) + '>+ note</text>');
    ty += 21;
  }
  const fy = y + h - RPAD;
  // lane tag (edit target even when empty)
  if(it.lane){
    g.push('<text' + (edit ? ' data-edit="lane" data-line="' + it.srcLine + '" data-raw="' + esc(it.lane) + '"' +
      btnAttrs('Edit lane: ' + it.title) : '') + ' x="' + (x + RPAD) + '" y="' + (fy - 2) +
      '" font-size="12" font-weight="700" letter-spacing="1.2" fill="' + C.muted + '">' + esc(it.lane.toUpperCase()) + '</text>');
  } else if(edit){
    g.push('<text data-edit="lane" data-line="' + it.srcLine + '" data-raw="" x="' + (x + RPAD) + '" y="' + (fy - 2) +
      '" font-size="12" fill="' + C.muted + '" opacity="0.55"' + btnAttrs('Add lane: ' + it.title) + '>+ lane</text>');
  }
  // status capsule (edit target even when empty)
  if(it.status){
    const capW = measure(STATUS_LABEL[it.status].toUpperCase(), '600 12px ' + SANS) + 18;
    const cap = statusCapsule(x + w - RPAD - capW, fy - 16, it.status, C, measure).svg;
    g.push(edit ? '<g data-edit="status" data-line="' + it.srcLine + '" data-raw="' + esc(it.status) + '"' +
      btnAttrs('Change status: ' + it.title) + '>' + cap + '</g>' : cap);
  } else if(edit){
    g.push('<text data-edit="status" data-line="' + it.srcLine + '" data-raw="" x="' + (x + w - RPAD) + '" y="' + (fy - 2) +
      '" font-size="12" fill="' + C.muted + '" opacity="0.55" text-anchor="end"' + btnAttrs('Set status: ' + it.title) + '>+ status</text>');
  }
  if(b){
    g.push(b.kind === 'new'
      ? badgeCapsule(x + RPAD, y - 12, b, C, measure).svg
      : capsule(x + RPAD, y - 12, b.label, C.muted, C.muted, measure).svg);
  }
  g.push('</g>');
  return {svg: g.join(''), h};
}

/* RAIL row — CLEAN index: rename + cardmenu only. NO status/lane/note
   targets (rail status is a card-menu submenu, Task 5). Buffered by the
   caller. Returns {svg, h}. data-raw on the title is the FULL title even
   when clip1 truncates the on-screen text — the editor needs the real
   value, not the ellipsis. */
function paintFocusRailRow(it, rank, x, y, w, {C, measure, edit}){
  const ROWH = 36;
  const numeral = String(rank).padStart(2, '0');
  const laneLbl = it.lane ? it.lane.toUpperCase() : '';
  const laneFont = '700 10px ' + SANS;
  const laneW = laneLbl ? measure(laneLbl, laneFont) + laneLbl.length * 0.6 : 0;
  const titleFont = '15px ' + SANS;
  const titleMaxW = Math.max(20, w - 34 - (laneW ? laneW + 14 : 0));
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const g = [];
  g.push('<g' + (edit ? ' data-edit="cardmenu" data-line="' + it.srcLine + '" data-key="' + esc(key) + '"' +
    btnAttrs('More options: ' + it.title) + ' data-menu=""' : '') + '>');
  if(edit) g.push('<rect data-hit="" x="' + x + '" y="' + y + '" width="' + w + '" height="' + ROWH + '" fill="transparent"/>');
  g.push(txt(x, y + 24, numeral, 15, C.muted, {weight: 700}));
  const display = clip1(it.title, titleFont, titleMaxW, measure);
  g.push('<text' + (edit ? ' data-edit="title" data-line="' + it.srcLine + '" data-raw="' + esc(it.title) + '"' +
    btnAttrs('Rename: ' + it.title) : '') +
    ' x="' + (x + 34) + '" y="' + (y + 24) + '" font-size="15" fill="' + C.ink + '">' + esc(display) + '</text>');
  if(laneLbl) g.push(txt(x + w, y + 22, laneLbl, 10, C.muted, {anchor: 'end', weight: 700, tracking: 1}));
  g.push('</g>');
  return {svg: g.join(''), h: ROWH};
}

export function renderFocusLive(model, ctx){
  const C = paletteColors(model, ctx);
  const {measure, diff = null, edit = false} = ctx;
  const {M, HERO_W, HGAP, RAIL_W, RPAD, HEADH} = FOCUS_LIVE;
  const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;   // HERO only — never wired to rail rows
  const hs = model.horizons, nH = hs.length;
  const heroIdx = focusHeroIndex(model);
  const W = M * 2 + HERO_W + HGAP + RAIL_W;
  const heroX = M, railX = M + HERO_W + HGAP;
  const inH = h => model.items.filter(i => i.h === h).sort((a, b) => a.srcLine - b.srcLine);
  const addRow = (x, w, h, cy) => edit ? ('<g opacity="0.75"><rect x="' + x + '" y="' + cy + '" width="' + w + '" height="26" rx="6" fill="none" stroke="' + C.border + '" stroke-dasharray="2 3"/>' +
    '<text data-edit="additem" data-lane="" data-col="' + esc(hs[h]) + '" data-line="-1" data-raw="" x="' + (x + 12) + '" y="' + (cy + 17) + '" font-size="11" font-weight="600" fill="' + C.muted + '"' + btnAttrs('Add item to ' + hs[h]) + '>＋ add to ' + esc(hs[h]) + '</text></g>') : '';
  const band = (h, x, w, top, bot) => edit ? ('<rect data-hdrop="' + h + '" x="' + x + '" y="' + top + '" width="' + w + '" height="' + Math.max(28, bot - top) + '" fill="transparent"/>') : '';

  const s = [];
  let y = 34;
  s.push(serifGroup(txt(M, y, model.title || 'Roadmap', 22, C.ink, {weight: 700})));
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || (typeof ctx.today === 'string' ? ctx.today : ''));
  if(dateLabel) s.push(txt(W - M, y, dateLabel, 12, C.muted, {anchor: 'end'}));
  y += 22;
  const zoneTop = y;

  // ---- HERO zone (the focused horizon — cards, or "Nothing scheduled" when EMPTY) ----
  const heroItems = inH(heroIdx);
  const overWip = heroIdx === 0 && model.wip > 0 && heroItems.length > model.wip;
  s.push(txt(heroX, zoneTop + 22, hs[heroIdx].toUpperCase(), 16, C.accent, {weight: 700, tracking: 1.6}));
  s.push(txt(heroX + HERO_W, zoneTop + 22, overWip ? heroItems.length + ' — OVER WIP ' + model.wip : String(heroItems.length), 13, overWip ? C.err : C.muted, {anchor: 'end', weight: 700}));
  const heroCardsTop = zoneTop + HEADH;
  const heroBuf = [];
  let hy = heroCardsTop + RPAD;
  if(heroItems.length){
    for(const it of heroItems){ const c = paintFocusHeroCard(it, heroX + RPAD, hy, HERO_W - RPAD * 2, {C, measure, edit, badgeOf}); heroBuf.push(c.svg); hy += c.h + 14; }
  } else {
    heroBuf.push(rect(heroX + RPAD, hy, HERO_W - RPAD * 2, 84, 'none', {rx: 12, stroke: C.border, sw: 1, dash: '4 4'}));
    heroBuf.push(txt(heroX + HERO_W / 2, hy + 48, 'Nothing scheduled', 14, C.muted, {anchor: 'middle'})); hy += 84 + 14;
  }
  if(edit){ heroBuf.push(addRow(heroX + RPAD, HERO_W - RPAD * 2, heroIdx, hy)); hy += 26; }
  // dropped-since line (Matt's compare decision): under the hero, struck, muted
  if(diff && diff.dropped && diff.dropped.length){
    const lbl = 'Dropped since ' + (diff.since || '') + ':  ' + diff.dropped.join('  ·  ');
    heroBuf.push(txt(heroX + RPAD, hy + 14, clip1(lbl, '13px ' + SANS, HERO_W - RPAD * 2, measure), 13, C.muted, {strike: true}));
    hy += 24;
  }
  const heroBottom = hy;
  // wash behind the hero stack + the band UNDER it
  s.push(rect(heroX, heroCardsTop - 8, HERO_W, (heroBottom - heroCardsTop) + 12, C.accent + '0D', {rx: 16}));
  s.push(band(heroIdx, heroX, HERO_W, heroCardsTop - 8, heroBottom));
  s.push(heroBuf.join(''));

  // ---- RAIL zone (EVERY other horizon, empty ones INCLUDED — each is a lens + drop + add) ----
  let ry = zoneTop, rank = 0;
  for(let h = 0; h < nH; h++){
    if(h === heroIdx) continue;
    const list = inH(h);
    const secTop = ry;
    const secBuf = [];
    // lens header: a row-width transparent rect carrying data-lens (a 44px+
    // tap target, keyboardable) UNDER a label — the click/keyboard handler
    // that switches the hero is Task 5, this only marks the target.
    secBuf.push('<g' + (edit ? ' data-lens="' + esc(hs[h]) + '"' + btnAttrs('Focus ' + hs[h]) : '') + '>' +
      (edit ? '<rect x="' + railX + '" y="' + (ry - 8) + '" width="' + RAIL_W + '" height="44" fill="transparent"/>' : '') +
      txt(railX, ry + 18, hs[h].toUpperCase(), 13, C.muted, {weight: 700, tracking: 1.4}) + '</g>');
    secBuf.push(line(railX, ry + 26, railX + RAIL_W, ry + 26, C.border, 1, 0.6));
    ry += 34;
    if(list.length){ for(const it of list){ rank++; const r = paintFocusRailRow(it, rank, railX, ry, RAIL_W, {C, measure, edit}); secBuf.push(r.svg); ry += r.h; } }
    else { secBuf.push(txt(railX, ry + 16, 'Nothing scheduled', 12, C.muted)); ry += 26; }
    if(edit){ secBuf.push(addRow(railX, RAIL_W, h, ry)); ry += 26; }
    s.push(band(h, railX, RAIL_W, secTop, ry));   // band UNDER this section's content
    s.push(secBuf.join(''));
    ry += 10;
  }

  const bottom = Math.max(heroBottom, ry) + 14;
  s.push(line(M, bottom, W - M, bottom, C.border));
  s.push(txt(M, bottom + 22, deckMetrics(model), 13, C.muted, {weight: 600}));
  const H = Math.round(bottom + 38);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + SANS + '\'>' +
    '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>' + s.join('') + '</svg>';
}
