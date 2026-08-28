/* The focus composition: a movable lens — one horizon as the hero of big cards,
   the rest as a ranked rail. TWO paint passes over the shared model — the DECK
   export (byte-identical) and the LIVE editable view (Task 4). Named render-*.js
   so renderer-coverage forces the live renderer into the injection corpus. */
import {txt, esc, btnAttrs, wrapText} from '../assets/svg.js';
import {rect, line, clip1, wrapN, capFit, capsule, badgeCapsule, serifGroup, SANS, standfirst, storyLine,
  basisBand, basisDesc} from './deck-parts.js';
import {deckFrame, paletteColors, deckMetrics, M} from './render-deck.js';
import {STATUS_LABEL, activeCount, condCount} from './parse.js';
import {anyBet, cardTag, tagColors, stateOpacity, previewableBet, whatifHitRect, condCountLabel, betChain} from './cond-parts.js';
/* Fixed deck geometry as LITERALS — RAIL_W must NOT be `INNER - HERO_W - HGAP`
   with INNER imported from render-deck.js: across the import cycle those consts
   are in the TDZ at module-load and throw. INNER is 1720 on the 1920 deck. */
const HERO_W = 1060, HGAP = 60, RAIL_W = 600, HWASH_PAD = 22;

/* FOCUS: attention-weighted. Hero = the horizon named by `focus:`, or — when
   that key is absent, blank, or names no real horizon — the first NON-EMPTY
   horizon (an empty Now must not produce an empty hero by default; a doc
   with no focus: key resolves exactly as before the key existed). An
   explicitly named horizon wins even if it's empty — that's the lens doing
   its job, not a bug. Hero column ~1060px has one decisive typographic datum;
   cards, rather than a content-hugging grey wash, carry the surface. This
   avoids arbitrary field bottoms beside the factual rail. 1 column at <=5 items, 2 at
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

function layoutHeroCard(it, cardW, measure, tag){
  const fT = '700 26px ' + SANS, fN = '16px ' + SANS;
  const PAD = HWASH_PAD;
  const laneH = it.lane ? 22 : 0;
  const tl = wrapN(it.title, fT, cardW - PAD * 2, 2, measure);
  const nl = it.note ? wrapN(it.note, fN, cardW - PAD * 2, 2, measure) : [];
  const statusH = it.status ? 34 : 0;
  const tagH = tag ? 30 : 0;
  const h = PAD * 2 + laneH + tagH + tl.length * 32 + (nl.length ? nl.length * 21 + 6 : 0) + statusH;
  return {it, tl, nl, tag, h: Math.max(h, PAD * 2 + 32)};
}

function paintHeroCard(c, x, y, w, C, measure){
  const PAD = HWASH_PAD;
  const s = [];
  // dropped's treatment wins over the flag border
  const flag = c.it.worldState === 'dropped' ? null :
    c.it.status === 'risk' ? C.status.risk : c.it.status === 'blocked' ? C.status.blocked : null;
  /* Focus earns scale, not another stack of framed cards. Like Board, hero work is
     a sequence of ruled slips; only an actual risk gets a local status edge. */
  s.push(rect(x, y, w, c.h, 'none', {rx: 0}));
  if(flag) s.push(rect(x, y, 3, c.h, flag, {rx: 0}));
  s.push(line(x, y + c.h, x + w, y + c.h, C.border, 1, 0.8));
  if(c.it.lane){
    const laneLbl = c.it.lane.toUpperCase();
    const lw = measure(laneLbl, '700 11px ' + SANS) + laneLbl.length * 0.6;
    s.push(txt(x + w - PAD - lw, y + PAD + 8, laneLbl, 11, C.muted, {weight: 700, tracking: 1.2}));
  }
  let ty = y + PAD + (c.it.lane ? 22 : 0) + 24;
  if(c.tag){
    const [tcol, tink] = tagColors(c.tag, C);
    s.push(capsule(x + PAD, ty - 20, c.tag.label, tcol, tink, measure).svg);
    ty += 30;
  }
  for(const ln of c.tl){ s.push(txt(x + PAD, ty, ln, 26, C.ink, {weight: 700})); ty += 32; }
  if(c.nl.length){ ty += 4; for(const ln of c.nl){ s.push(txt(x + PAD, ty, ln, 16, C.muted)); ty += 21; } }
  if(c.it.status) s.push(txt(x + PAD, y + c.h - PAD, STATUS_LABEL[c.it.status].toUpperCase(), 11,
    C.statusInk[c.it.status] || C.status[c.it.status], {weight:700, tracking:1.1}));
  return s.join('');
}

function paintHeroStack(list, {x, y0, w, availH, heroName, C, measure, model}){
  const hasBets = anyBet(model);
  const twoCol = focusColumnCount(list.length) === 2;
  const colGap = 18, rowGap = 16;
  const cardW = twoCol ? (w - colGap) / 2 : w;
  const laid = list.map(it => layoutHeroCard(it, cardW, measure, hasBets ? cardTag(model, it) : null));
  const rows = [];
  if(twoCol) for(let i = 0; i < laid.length; i += 2) rows.push(laid.slice(i, i + 2));
  else for(const c of laid) rows.push([c]);
  const rowH = r => Math.max(...r.map(c => c.h));
  const shown = capFit(rows.map(rowH), availH, rowGap, 40);

  const s = [];
  let cy = y0;
  for(const row of rows.slice(0, shown)){
    const h = rowH(row);
    row.forEach((c, i) => {
      const op = stateOpacity(c.it, 1);
      const svg = paintHeroCard({...c, h}, x + i * (cardW + colGap), cy, cardW, C, measure);
      s.push(op < 1 ? '<g opacity="' + op.toFixed(2) + '">' + svg + '</g>' : svg);
    });
    cy += h + rowGap;
  }
  if(shown < rows.length){
    s.push(rect(x, cy, w, 40, 'none', {rx: 0, stroke: C.border, sw: 1, dash: '4 4'}));
    const hiddenItems = rows.slice(shown).reduce((a, r) => a + r.length, 0);
    s.push(txt(x + 18, cy + 26, '+ ' + hiddenItems + ' more in ' + heroName, 14, C.muted, {weight: 600}));
    cy += 40;
  }
  return {svg: s.join(''), bottom: cy};
}

/* Turns a cardTag() result into the rail's compact export-only suffix word
   (F4) — reuses cardTag's own label wording (kept in one place), only
   reshaping 'not needed — X' into 'not needed (X)' to read naturally after " — ". */
function railTagSuffix(tag){
  if(!tag) return '';
  if(tag.kind === 'dropped') return 'not needed (' + tag.label.replace(/^not needed — /, '') + ')';
  return tag.label;
}

function focusBodyFn(model, ctx, C){
  return (y0, y1) => {
    const {measure} = ctx;
    const hs = model.horizons, nH = hs.length;
    const heroIdx = focusHeroIndex(model);
    const heroItems = model.items.filter(i => i.h === heroIdx).sort((a, b) => a.srcLine - b.srcLine);
    const heroX = M, headerH = 44;
    const hasBets = anyBet(model);   // gates the rail row suffix below (F4)

    const s = [];
    /* activeCount for the flag/label; heroItems (all, incl. dropped) still paints below. */
    const heroActive = activeCount(model, heroIdx);
    const overWip = heroIdx === 0 && model.wip > 0 && heroActive > model.wip;
    const countLbl = overWip ? heroActive + ' — OVER WIP ' + model.wip
      : condCountLabel(heroActive, condCount(model, heroIdx));
    s.push(txt(heroX, y0 + 30, hs[heroIdx].toUpperCase(), 16, C.ink, {weight: 700, tracking: 1.6}));
    s.push(txt(heroX + HERO_W, y0 + 30, countLbl, 13, overWip ? C.err : C.muted, {anchor: 'end', weight: 700, tracking: 1}));

    const heroCardsY = y0 + headerH;
    let stack;
    if(!heroItems.length){
      stack = {
        svg: rect(heroX + HWASH_PAD, heroCardsY + HWASH_PAD, HERO_W - HWASH_PAD * 2, 84, 'none',
          {rx: 0, stroke: C.border, sw: 1, dash: '4 4'}) +
          txt(heroX + HERO_W / 2, heroCardsY + HWASH_PAD + 48, 'Nothing scheduled', 14, C.muted, {anchor: 'middle'}),
        bottom: heroCardsY + HWASH_PAD + 84,
      };
    } else {
      const availH = Math.max(60, y1 - (heroCardsY + HWASH_PAD) - HWASH_PAD);
      stack = paintHeroStack(heroItems, {
        x: heroX + HWASH_PAD, y0: heroCardsY + HWASH_PAD, w: HERO_W - HWASH_PAD * 2,
        availH, heroName: hs[heroIdx], C, measure, model,
      });
    }
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
      for(const it of list){
        rank++;
        const tag = hasBets ? cardTag(model, it) : null;
        units.push({type: 'row', h, it, rank, tag, height: tag ? 58 : 38});
      }
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
        // rail rows are the fade-only degrade (A3 §3) — dropped/cond override the
        // column fade outright, same single-strongest-state rule as the hero. No
        // room for a capsule here, but a DECK EXPORT has no card menu to fall
        // back on (unlike the live rail), so it gives the fact its OWN line.
        // The title may clip; the condition never competes with it or vanishes.
        const suffixWord = u.tag ? railTagSuffix(u.tag) : '';
        const titleFont = '15px ' + SANS;
        s.push('<g opacity="' + stateOpacity(u.it, fadeOp).toFixed(2) + '">');
        s.push(txt(railX, ry + 24, numeral, 15, C.muted, {weight: 700}));
        s.push(txt(railX + 34, ry + 24, clip1(u.it.title, titleFont, titleMaxW, measure), 15, C.ink));
        if(suffixWord) s.push(txt(railX + 34, ry + 44,
          clip1(suffixWord, '13px ' + SANS, RAIL_W - 34, measure), 13, C.muted, {weight: 600}));
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
 * label, plus a dedicated second line when its work is conditional — no
 * status/lane/note targets at all; rail status moves through a
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
/* Colour pair for one hinges-on link, by betChain() state — reuses the SAME
   validated pairs cardTag/tagColors already ride (S5/E6, Rev A: "existing
   tagColors pairs only"), plus the house risk pair for a cycle (already
   shipped on hero cards via the status flag border, never invented here). */
function hingeColors(state, C){
  if(state === 'in a cycle') return [C.status.risk, C.statusInk.risk];
  const kind = state === 'open' ? 'bet-open'
    : state === 'paid off' ? 'bet-won'
    : state === "didn't pay off" ? 'bet-lost'
    : 'bet-moot';   // 'never ran'
  return tagColors({kind}, C);
}

/* HINGES ON strip (S5/E6): one extra foot row under a LIVE hero card whose
   item is worldState==='cond' — the upstream betChain() rendered as small
   capsules, root-first, joined by '→'. Informational only: no data-edit, no
   data-hit, no new tap target (coarse pointers are unaffected — nothing
   here is reachable or needs to be). `y` is the row's TOP (capsule height
   is the shared, fixed 22px from deck-parts' capsule() — exactly the +22
   this row's presence adds to the card, so it fills its budget flush, with
   no extra margin above or below).  Clipping keeps the FIRST (root) links
   visible and drops from the END when the chain doesn't fit `maxW` — the
   same "show what fits" idiom as capFit/clip1 elsewhere in this file,
   rather than shrinking every capsule to squeeze the whole chain in. */
function paintHinges(chain, x, y, maxW, C, measure){
  const prefixFont = '700 10px ' + SANS;
  const prefix = 'HINGES ON';
  const prefixW = measure(prefix, prefixFont) + prefix.length * 0.6;
  const capFont = '600 12px ' + SANS;
  const arrowGap = measure('→', capFont) + 10;
  const labels = chain.map(l => (l.when === 'unless' ? 'unless ' : '') + l.display + ' · ' + l.state);
  const widths = labels.map(lbl => measure(lbl, capFont) + lbl.length * 0.6 + 18);
  const availW = Math.max(0, maxW - prefixW - 10);
  const shown = Math.max(1, capFit(widths, availW, arrowGap, 0));
  const baseline = y + 15;
  const g = ['<text x="' + x + '" y="' + baseline + '" font-size="10" font-weight="700" letter-spacing="1" fill="' +
    C.muted + '">' + esc(prefix) + '</text>'];
  let cx = x + prefixW + 10;
  for(let i = 0; i < shown; i++){
    const [col, ink] = hingeColors(chain[i].state, C);
    const cap = capsule(cx, y, labels[i], col, ink, measure);
    g.push(cap.svg);
    cx += cap.w;
    if(i < shown - 1){ g.push(txt(cx + 4, baseline, '→', 12, C.muted)); cx += arrowGap; }
  }
  return g.join('');
}

function paintFocusHeroCard(it, x, y, w, {C, measure, edit, badgeOf, model, hasBets, textBets, coarse}){
  const {RPAD} = FOCUS_LIVE;
  const fT = '700 26px ' + SANS, fN = '16px ' + SANS;
  const b = it.worldState === 'dropped' ? null : badgeOf(it);   // diff badges suppressed on dropped items
  const tag = hasBets ? cardTag(model, it) : null;
  const tl = wrapText(it.title, fT, w - RPAD * 2, measure);
  const nl = it.note ? wrapText(it.note, fN, w - RPAD * 2, measure) : [];
  const footH = it.lane || it.status || edit ? 30 : 10;
  // Reserve a quiet reveal row for the real add-note control: it only appears
  // while the editor is directly engaging with this item, never as resting UI.
  const noteH = nl.length ? nl.length * 21 + 6 : (edit ? 21 : 0);
  const tagH = tag ? 30 : 0;   // unified with deck layoutHeroCard + board live paintBoardCard (F5) —
  // EXCEPT for height: a LIVE cond-card is 22px TALLER than its deck twin
  // (S5/E6's "hinges on" strip below is painted by THIS function only; the
  // deck's layoutHeroCard/paintHeroCard never gained the extra row, so the
  // two heights deliberately diverge for worldState==='cond' cards).
  const hinge = it.worldState === 'cond' ? betChain(model, it) : [];
  const hingeH = hinge.length ? 22 : 0;
  const hBody = RPAD * 2 + tagH + tl.length * 32 + noteH + footH;
  const h = hBody + hingeH;
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
  // dropped's treatment wins over the flag border
  const flag = it.worldState === 'dropped' ? null :
    it.status === 'risk' ? C.status.risk : it.status === 'blocked' ? C.status.blocked : null;
  const op = stateOpacity(it, 1);   // 1 for a plain card — attribute omitted, byte-identical
  const g = [];
  g.push('<g' + (op < 1 ? ' opacity="' + op.toFixed(2) + '"' : '') +
    (edit ? ' data-edit="cardmenu" data-line="' + it.srcLine + '" data-key="' + esc(key) + '"' +
    btnAttrs('More options: ' + it.title) + ' data-menu=""' : '') + '>');
  g.push(rect(x, y, w, h, 'none', {rx: 0}));
  if(flag) g.push(rect(x, y, 3, h, flag, {rx: 0}));
  g.push(line(x, y + h, x + w, y + h, C.border, 1, 0.8));
  let whatifRect = null;   // sibling of the card's <g>, pushed after it closes
  if(tag){
    const [tcol, tink] = tagColors(tag, C);
    const cap = capsule(x + RPAD, y + RPAD - 4, tag.label, tcol, tink, measure);
    g.push(cap.svg);
    const nameLc = edit ? previewableBet(textBets || model.bets, it) : null;
    if(nameLc) whatifRect = whatifHitRect(nameLc, it.bet.name, x + RPAD, y + RPAD - 4, cap.w, 22, coarse);
  }
  if(edit) g.push('<rect data-hit="" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="transparent"/>');
  let ty = y + RPAD + 20 + tagH;
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
    g.push('<text data-empty-control="" data-edit="note" data-line="' + it.srcLine + '" data-raw="" x="' + (x + RPAD) + '" y="' + ty +
      '" font-size="14" fill="' + C.muted + '" opacity="0"' + btnAttrs('Add note: ' + it.title) + '>+ note</text>');
    ty += 21;
  }
  const fy = y + hBody - RPAD;
  // lane tag (edit target even when empty)
  if(it.lane){
    g.push('<text' + (edit ? ' data-edit="lane" data-line="' + it.srcLine + '" data-raw="' + esc(it.lane) + '"' +
      btnAttrs('Edit lane: ' + it.title) : '') + ' x="' + (x + RPAD) + '" y="' + (fy - 2) +
      '" font-size="12" font-weight="700" letter-spacing="1.2" fill="' + C.muted + '">' + esc(it.lane.toUpperCase()) + '</text>');
  } else if(edit){
    g.push('<text data-empty-control="" data-edit="lane" data-line="' + it.srcLine + '" data-raw="" x="' + (x + RPAD) + '" y="' + (fy - 2) +
      '" font-size="12" fill="' + C.muted + '" opacity="0"' + btnAttrs('Add lane: ' + it.title) + '>+ lane</text>');
  }
  // Status is factual text, not another coloured surface.
  if(it.status){
    g.push('<text' + (edit ? ' data-edit="status" data-line="' + it.srcLine + '" data-raw="' + esc(it.status) + '"' +
      btnAttrs('Change status: ' + it.title) : '') + ' x="' + (x + w - RPAD) + '" y="' + (fy - 2) +
      '" text-anchor="end" font-size="12" font-weight="700" letter-spacing="1.1" fill="' +
      (C.statusInk[it.status] || C.status[it.status]) + '">' + esc(STATUS_LABEL[it.status].toUpperCase()) + '</text>');
  } else if(edit){
    g.push('<text data-empty-control="" data-edit="status" data-line="' + it.srcLine + '" data-raw="" x="' + (x + w - RPAD) + '" y="' + (fy - 2) +
      '" font-size="12" fill="' + C.muted + '" opacity="0" text-anchor="end"' + btnAttrs('Set status: ' + it.title) + '>+ status</text>');
  }
  if(b){
    g.push(b.kind === 'new'
      ? badgeCapsule(x + RPAD, y - 12, b, C, measure).svg
      : capsule(x + RPAD, y - 12, b.label, C.muted, C.muted, measure).svg);
  }
  if(hinge.length) g.push(paintHinges(hinge, x + RPAD, y + hBody, w - RPAD * 2, C, measure));
  g.push('</g>');
  if(whatifRect) g.push(whatifRect);
  return {svg: g.join(''), h};
}

/* RAIL row — CLEAN index: rename + cardmenu only. NO status/lane/note
   targets (rail status is a card-menu submenu, Task 5). Buffered by the
   caller. Returns {svg, h}. data-raw on the title is the FULL title even
   when clip1 truncates the on-screen text — the editor needs the real
   value, not the ellipsis. */
function paintFocusRailRow(it, rank, x, y, w, {C, measure, edit, tag}){
  const condition = tag ? railTagSuffix(tag) : '';
  const numeral = String(rank).padStart(2, '0');
  const laneLbl = it.lane ? it.lane.toUpperCase() : '';
  const laneFont = '700 10px ' + SANS;
  const laneW = laneLbl ? measure(laneLbl, laneFont) + laneLbl.length * 0.6 : 0;
  const titleFont = '15px ' + SANS;
  const titleMaxW = Math.max(20, w - 34 - (laneW ? laneW + 14 : 0));
  const titleLines = wrapText(it.title, titleFont, titleMaxW, measure);
  const conditionLines = condition ? wrapText(condition, '13px ' + SANS, w - 34, measure) : [];
  const ROWH = Math.max(36, titleLines.length * 19 + (conditionLines.length ? conditionLines.length * 17 + 4 : 0));
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').trim();
  // The rail remains a clean index, but uncertainty is not allowed to vanish
  // behind the card menu: it gets a quiet, dedicated second line. Both grow
  // with their source text; a live factual rail must not trade meaning for fit.
  const op = stateOpacity(it, 1);   // 1 for a plain row — attribute omitted, byte-identical
  const g = [];
  g.push('<g' + (op < 1 ? ' opacity="' + op.toFixed(2) + '"' : '') +
    (edit ? ' data-edit="cardmenu" data-line="' + it.srcLine + '" data-key="' + esc(key) + '"' +
    btnAttrs('More options: ' + it.title) + ' data-menu=""' : '') + '>');
  if(edit) g.push('<rect data-hit="" x="' + x + '" y="' + y + '" width="' + w + '" height="' + ROWH + '" fill="transparent"/>');
  g.push(txt(x, y + 24, numeral, 15, C.muted, {weight: 700}));
  titleLines.forEach((lineText, i) => g.push('<text' + (edit && i === 0 ? ' data-edit="title" data-line="' + it.srcLine + '" data-raw="' + esc(it.title) + '"' +
    btnAttrs('Rename: ' + it.title) : '') +
    ' x="' + (x + 34) + '" y="' + (y + 24 + i * 19) + '" font-size="15" fill="' + C.ink + '">' + esc(lineText) + '</text>'));
  conditionLines.forEach((lineText, i) => g.push(txt(x + 34, y + titleLines.length * 19 + 22 + i * 17, lineText,
    13, C.muted, {weight:600})));
  if(laneLbl) g.push(txt(x + w, y + 22, laneLbl, 10, C.muted, {anchor: 'end', weight: 700, tracking: 1}));
  g.push('</g>');
  return {svg: g.join(''), h: ROWH};
}

export function renderFocusLive(model, ctx){
  const C = paletteColors(model, ctx);
  const {measure, diff = null, edit = false, textBets, coarse} = ctx;
  const {M, HERO_W: baseHeroW, HGAP: baseGap, RAIL_W: baseRailW, RPAD, HEADH} = FOCUS_LIVE;
  const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;   // HERO only — never wired to rail rows
  const hs = model.horizons, nH = hs.length;
  const heroIdx = focusHeroIndex(model);
  const hasBets = anyBet(model);   // hoisted (F6) — was recomputed per hero card
  /* A phone preserves the Focus lens rather than falling through to Grid:
     its hero occupies the full measure and the ranked rail follows below. */
  const vertical = Number.isFinite(ctx.width) && ctx.width < 520;
  const W = vertical ? ctx.width : M * 2 + baseHeroW + baseGap + baseRailW;
  const HERO_W = vertical ? W - M * 2 : baseHeroW;
  const HGAP = vertical ? 0 : baseGap;
  const RAIL_W = vertical ? HERO_W : baseRailW;
  const heroX = M, railX = vertical ? M : M + HERO_W + HGAP;
  const inH = h => model.items.filter(i => i.h === h).sort((a, b) => a.srcLine - b.srcLine);
  const addRow = (x, w, h, cy) => edit ? ('<g data-add-control="" opacity="0"><rect x="' + x + '" y="' + cy + '" width="' + w + '" height="26" rx="0" fill="transparent"/>' +
    '<text data-edit="additem" data-lane="" data-col="' + esc(hs[h]) + '" data-line="-1" data-raw="" x="' + (x + 12) + '" y="' + (cy + 17) + '" font-size="10" font-weight="700" letter-spacing=".08em" fill="' + C.muted + '"' + btnAttrs('Add item to ' + hs[h]) + '>＋ ADD TO ' + esc(hs[h].toUpperCase()) + '</text></g>') : '';
  const band = (h, x, w, top, bot) => edit ? ('<rect data-hdrop="' + h + '" x="' + x + '" y="' + top + '" width="' + w + '" height="' + Math.max(28, bot - top) + '" fill="transparent"/>') : '';

  const s = [];
  let y = vertical ? 30 : 34;
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || (typeof ctx.today === 'string' ? ctx.today : ''));
  if(vertical){
    const titleLines = wrapText(model.title || 'Roadmap', '700 20px ' + SANS, W - M * 2, measure);
    titleLines.forEach((lineText, i) => s.push(serifGroup(txt(M, y + i * 24, lineText, 20, C.ink, {weight:700}))));
    y += titleLines.length * 24;
    if(dateLabel){ s.push(txt(M, y, dateLabel, 11, C.muted)); y += 18; }
  } else {
    s.push(serifGroup(txt(M, y, model.title || 'Roadmap', 22, C.ink, {weight: 700})));
    if(dateLabel) s.push(txt(W - M, y, dateLabel, 12, C.muted, {anchor: 'end'}));
    y += 22;
  }
  const basis = basisBand(model, M, y, W - M * 2, measure, C);
  if(basis.height){ s.push(basis.svg); y += basis.height; }
  const sfF = standfirst(model, M, y, W - M * 2, measure, C, !!ctx.edit);   // the authored standfirst
  if(sfF.height){ s.push(sfF.svg); y += sfF.height; }
  const sfFStory = storyLine(model, diff, M, y, W - M * 2, measure, C, !!ctx.edit);   // the diff narrative
  if(sfFStory.height){ s.push(sfFStory.svg); y += sfFStory.height; }
  const zoneTop = y;

  // ---- HERO zone (the focused horizon — cards, or "Nothing scheduled" when EMPTY) ----
  const heroItems = inH(heroIdx);
  const heroActive = activeCount(model, heroIdx);
  const overWip = heroIdx === 0 && model.wip > 0 && heroActive > model.wip;
  const heroLbl = overWip ? heroActive + ' — OVER WIP ' + model.wip
    : condCountLabel(heroActive, condCount(model, heroIdx));
  s.push(txt(heroX, zoneTop + 22, hs[heroIdx].toUpperCase(), 16, C.ink, {weight: 700, tracking: 1.6}));
  s.push(txt(heroX + HERO_W, zoneTop + 22, heroLbl, 13, overWip ? C.err : C.muted, {anchor: 'end', weight: 700}));
  const heroCardsTop = zoneTop + HEADH;
  const heroBuf = [];
  let hy = heroCardsTop + RPAD;
  if(heroItems.length){
    for(const it of heroItems){ const c = paintFocusHeroCard(it, heroX + RPAD, hy, HERO_W - RPAD * 2, {C, measure, edit, badgeOf, model, hasBets, textBets, coarse}); heroBuf.push(c.svg); hy += c.h + 14; }
  } else {
    heroBuf.push(rect(heroX + RPAD, hy, HERO_W - RPAD * 2, 84, 'none', {rx: 0, stroke: C.border, sw: 1, dash: '4 4'}));
    heroBuf.push(txt(heroX + HERO_W / 2, hy + 48, 'Nothing scheduled', 14, C.muted, {anchor: 'middle'})); hy += 84 + 14;
  }
  if(edit){ heroBuf.push(addRow(heroX + RPAD, HERO_W - RPAD * 2, heroIdx, hy)); hy += 26; }
  // dropped-since line (Matt's compare decision): under the hero, struck, muted
  if(diff && diff.dropped && diff.dropped.length){
    const lbl = 'Dropped since ' + (diff.since || '') + ':  ' + diff.dropped.join('  ·  ');
    heroBuf.push(txt(heroX + RPAD, hy + 14, clip1(lbl, '13px ' + SANS, HERO_W - RPAD * 2, measure), 13, C.muted, {strike: true}));
    hy += 24;
  }
  if(diff?.added?.length){
    const lbl = 'Added since ' + (diff.since || '') + ':  ' + diff.added.join('  ·  ');
    const lines = wrapText(lbl, '13px ' + SANS, HERO_W - RPAD * 2, measure);
    lines.forEach((lineText, index) => heroBuf.push(txt(heroX + RPAD, hy + 14 + index * 17, lineText, 13, C.muted)));
    hy += lines.length * 17 + 7;
  }
  const heroBottom = hy;
  s.push(band(heroIdx, heroX, HERO_W, heroCardsTop - 8, heroBottom));
  s.push(heroBuf.join(''));

  // ---- RAIL zone (EVERY other horizon, empty ones INCLUDED — each is a lens + drop + add) ----
  let ry = vertical ? heroBottom + 24 : zoneTop, rank = 0;
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
    if(list.length){ for(const it of list){
      rank++;
      const tag = hasBets ? cardTag(model, it) : null;
      const r = paintFocusRailRow(it, rank, railX, ry, RAIL_W, {C, measure, edit, tag});
      secBuf.push(r.svg); ry += r.h;
    } }
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
  return '<svg xmlns="http://www.w3.org/2000/svg"' + (vertical ? ' data-focus-layout="vertical"' : '') + ' width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + SANS + '\'>' +
    basisDesc(model) + '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>' + s.join('') + '</svg>';
}
