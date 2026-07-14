/* (model, ctx, {style}) → a 16:9 DECK svg. Pure — no DOM, no `new Date()`.
   Deliberately a SEPARATE module from render.js: /why's map view delegates to
   roadmap's renderRoadmap, so anything added there lands in /why too (it shifted
   why's goldens once). render.js stays the working chart; the deck lives here.

   Named render-*.js on purpose: dev/renderer-coverage.test.mjs then FORCES this file
   into the injection corpus, so the escaping guarantee is enforced, not remembered.

   The deck is 1920×1080 with one shared frame (accent rule → Charter title → date →
   the VERDICT as a standfirst → body band → footer rule + metrics). Styles fill the
   body; colour comes from the document (`palette:` / `accent:` via scheme()), never
   from the style — a style owns STRUCTURE. */
import {txt, wrapText, tint} from '../assets/svg.js';
import {STATUS_LABEL} from './parse.js';
import {PALETTES, scheme} from '../assets/series.js';

export const W = 1920, H = 1080, M = 100;
const INNER = W - M * 2;                      // 1720
/* local font stacks — deliberately NOT threaded through assets/svg.js's txt()
   (which has no font-family override): serif carries a double-quoted "Times
   New Roman", so it rides in a single-quoted font-family wrapper <g>, mirroring
   render.js's own font-family=\'…\' pattern for the same reason. */
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Charter, Georgia, "Times New Roman", serif';
const r2 = n => Math.round(n * 100) / 100;

/* The WIP warning is ONE string, shared with app.js's editor warning (which appends
   its own "(Raise or silence with wip: N / wip: off.)"). Two copies would drift. */
export function wipBreach(model){
  const first = model.items.filter(i => i.h === 0).length;
  if(!(model.wip > 0 && first > model.wip)) return null;
  return model.horizons[0] + ' has ' + first + ' items — that’s a list, not a strategy.';
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const clip = (s, max) => s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;

/* The quotable line. Priority-ordered: bad news leads, and the load claim
   ("Now carries 4 of 10 items") is the constant spine. */
export function roadmapVerdict(model, diff = null){
  const items = model.items, n = items.length;
  if(!n) return 'Nothing on the board yet.';

  const breach = wipBreach(model);
  if(breach) return breach;                                    // 1 — the tool's own words

  const first = model.horizons[0];
  const inFirst = items.filter(i => i.h === 0).length;
  if(!inFirst){                                                 /* "carries 0 of 3" reads like a bug */
    const rest = model.horizons.slice(1);
    const names = rest.length > 1
      ? rest.slice(0, -1).join(', ') + ' and ' + rest[rest.length - 1]
      : rest[0];
    return 'Nothing in ' + first + ' — ' + plural(n, 'item', 'items') + ' queued in ' + names + '.';
  }
  const load = first + ' carries ' + inFirst + ' of ' + plural(n, 'item', 'items');

  const flagged = [...items.filter(i => i.status === 'blocked'),   // blocked leads
                   ...items.filter(i => i.status === 'risk')];
  if(flagged.length){                                           // 2 — flags
    const named = flagged.slice(0, 2)
      .map(i => clip(i.title, 40) + ' ' + (i.status === 'blocked' ? 'blocked' : 'at risk'));
    const more = flagged.length - named.length;
    return load + ' — ' + named.join(', ') + (more ? ', +' + more + ' more flagged' : '') + '.';
  }
  if(diff && diff.any){                                         // 3 — what moved
    const bits = [];
    if(diff.added) bits.push(diff.added + ' added');
    if(diff.moved) bits.push(diff.moved + ' moved');
    if(diff.dropped) bits.push(diff.dropped + ' dropped');
    if(bits.length) return load + ' — since ' + diff.since + ': ' + bits.join(', ') + '.';
    return load + '.';                                          // never a dangling "since X: ."
  }
  const doing = items.filter(i => i.status === 'doing').length; // 4 — plain
  return load + (doing ? ' — ' + doing + ' in progress.' : '.');
}

/* metrics footer — the same facts every deck carries */
export function deckMetrics(model){
  const by = s => model.items.filter(i => i.status === s).length;
  return [plural(model.items.length, 'item', 'items'),
          plural(model.horizons.length, 'horizon', 'horizons'),
          by('doing') ? by('doing') + ' in progress' : null,
          by('risk') ? by('risk') + ' at risk' : null,
          by('blocked') ? by('blocked') + ' blocked' : null].filter(Boolean).join(' · ');
}

/* roadmapVerdict's diff contract is COUNTS (added/moved/dropped as numbers) —
   pinned by verdict.test.mjs. The live diff object app.js builds (and the
   board/card badges below need) is shaped for BADGES instead: a `badge(item)`
   function plus a `dropped` array of titles. Bridging the two here keeps both
   contracts honest without forcing app.js to compute the same counts twice. */
export function diffCounts(model, diff){
  if(!diff || !diff.any) return null;
  let added = 0, moved = 0;
  for(const it of model.items){
    const b = diff.badge ? diff.badge(it) : null;
    if(b && b.kind === 'new') added++;
    else if(b && b.kind === 'moved') moved++;
  }
  return {any: true, since: diff.since, added, moved, dropped: diff.dropped ? diff.dropped.length : 0};
}

/* ================= shared SVG micro-builders (deck-local; NOT assets/svg.js —
   render.js/svg.js/series.js stay at zero hunks, and svg.js has no rect/line
   helper or font-family override to extend). Attribute order is fixed, which
   the deck.test.mjs bounds-sweep relies on being attribute-order-independent
   anyway (it parses by name, not position). ================= */
function rect(x, y, w, h, fill, o = {}){
  return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
    '" fill="' + fill + '"' +
    (o.rx != null ? ' rx="' + o.rx + '"' : '') +
    (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.sw || 1) + '"' : '') +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
}
function line(x1, y1, x2, y2, stroke, w = 1, opacity = 1){
  return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
    '" stroke="' + stroke + '" stroke-width="' + w + '" opacity="' + opacity + '"/>';
}
const serifGroup = inner => '<g font-family=\'' + SERIF + '\'>' + inner + '</g>';

/* ellipsis-clip to one line; wrap-to-N-lines with an ellipsis on the overflow
   line — mined from the prototype's clip1/wrapN, rewired onto wrapText/measure
   passed explicitly (house convention: pure helpers take measure as an arg,
   never close over a DOM-side singleton). */
function clip1(text, font, maxW, measure){
  let s = String(text);
  if(measure(s, font) <= maxW) return s;
  while(s.length > 1 && measure(s + '…', font) > maxW) s = s.slice(0, -1);
  return s + '…';
}
function wrapN(text, font, maxW, maxLines, measure){
  const lines = wrapText(text, font, maxW, measure);
  if(lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = clip1(kept[maxLines - 1] + ' ' + lines.slice(maxLines).join(' '), font, maxW, measure);
  return kept;
}

/* capsule pill: tinted fill (house 12% tint via assets/svg.js's tint()),
   contrast-boosted ink text — same shape as render.js's local capsule, at
   deck scale. Never colour-alone: the label text always carries the word. */
function capsule(x, y, label, col, inkCol, measure){
  const font = '600 12px ' + SANS;
  const w = measure(label, font) + label.length * 0.6 + 18, h = 22;
  const fill = tint(col);
  return {
    svg: rect(x, y, w, h, fill, {rx: 11, stroke: fill === 'none' ? col : null, sw: 1}) +
      txt(x + 9, y + 15.5, label, 12, inkCol || col, {weight: 600, tracking: 0.6}),
    w,
  };
}
const statusCapsule = (x, y, st, C, measure) =>
  capsule(x, y, STATUS_LABEL[st].toUpperCase(), C.status[st], C.statusInk[st], measure);
const badgeCapsule = (x, y, b, C, measure) => b.kind === 'new'
  ? capsule(x, y, b.label.toUpperCase(), C.accent, C.accentInk, measure)
  : capsule(x, y, b.label.toUpperCase(), C.muted, C.muted, measure);

/* Column type ramp, by width — exactly the prototype's breakpoints
   (_deck2.mjs:491-494): wider columns get bigger type and room for a note;
   the narrowest ramp (nH ~6-8) drops notes entirely (fsN: 0, notes: 0). */
export function typeRamp(colW){
  return colW >= 500 ? {fsT: 21, fsN: 15, pad: 20, notes: 2}
       : colW >= 380 ? {fsT: 19, fsN: 14, pad: 16, notes: 2}
       : colW >= 300 ? {fsT: 17, fsN: 13, pad: 14, notes: 1}
       : {fsT: 15, fsN: 0, pad: 12, notes: 0};
}

/* Greedy "how many rows/cards fit" with a reserved chip budget — the terminal
   rung of the overflow ladder, shared by card columns and list columns. Pure:
   given fixed-height items, returns how many can show before a trailing "+N
   more" chip is needed. Invariant that makes containment provable: whenever
   the returned count is less than heights.length, the accumulated height of
   the shown items (+ gaps) plus `chipReserve` is still <= availH — so the
   chip the caller draws immediately after always lands in bounds too. */
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

/* Board-wide density check (_deck2.mjs:499-509): estimate every column's
   layout with the SMALLEST clamped card height for this ramp — if even that
   estimate would still hide more than 25% of a column's items (after
   budgeting room for the "+N more" chip), the WHOLE board flips to list rows.
   A worst-case estimate (not each column's actual computed heights) keeps the
   decision a single deterministic pass, independent of card layout order. */
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

/* CARD column: the drop-notes -> clamp-title -> cap+chip ladder (steps 1-2
   are the prototype's; step 3 is capFit, which also FIXES the card path's own
   uncapped-in-theory tail by sharing the same proven-terminating helper the
   list path uses). */
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
   sub-line, single line each (clip1, never wraps) so row height is a fixed
   38/56 — flagged rows carry a 3px status-coloured edge bar, never colour
   alone (the status word is IN the sub-line). Capped with capFit + its own
   "+N more" chip: the prototype's list mode had NO cap here and overflowed
   the frame at 30+ items — this is the fix. */
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

/* BOARD body: horizons as columns (lane rail dropped — lane rides as a tag on
   each card/row instead), the first horizon washed with the accent, an
   in-plane letterspaced label + count per column, certainty fade across
   horizons (gated to model.fade), and the drop-notes/clamp-title/cap+chip/
   flip-to-list overflow ladder above. Returns a (y0, y1) -> svg fragment, so
   deckFrame can budget its body band around whatever the standfirst wrapped
   to (1 or 2 lines). */
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

/* Shared frame: accent rule -> Charter title -> date -> the verdict standfirst
   (wrapped to <=2 lines, budgeting the body band down when it wraps) -> body
   -> footer rule -> metrics. `today` is INJECTED via ctx (no `new Date()` in
   this module): printed when model.dateStr is null, suppressed entirely when
   it's the literal string 'off' (mirrors render.js's date semantics — the
   prototype printed the literal "off", which was a bug). */
function deckFrame(model, ctx, C, bodyFn){
  const {measure} = ctx;
  const verdict = roadmapVerdict(model, diffCounts(model, ctx.diff));
  const s = [];
  s.push(rect(0, 0, W, H, C.bg));
  s.push(rect(M, 64, 56, 5, C.accent, {rx: 2.5}));
  s.push(serifGroup(txt(M, 124, model.title || 'Roadmap', 38, C.ink, {weight: 700})));
  const dateLabel = model.dateStr === 'off' ? '' : (model.dateStr || ctx.today || '');
  if(dateLabel) s.push(txt(W - M, 124, dateLabel, 17, C.muted, {anchor: 'end'}));

  let bodyTop = 214;
  const vLines = wrapN(verdict, '600 22px ' + SERIF, INNER, 2, measure);
  s.push(serifGroup(vLines.map((ln, i) => txt(M, 170 + i * 30, ln, 22, C.ink, {weight: 600})).join('')));
  bodyTop += (vLines.length - 1) * 30;

  s.push(bodyFn(bodyTop, 968));
  s.push(line(M, 1002, W - M, 1002, C.border));
  s.push(txt(M, 1036, deckMetrics(model), 17, C.muted, {weight: 600}));
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + SANS + '\'>' + s.join('') + '</svg>';
}

function paletteColors(model, ctx){
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
   of having to exclude the frame's own footer text (which legitimately sits
   below the footer rule at y=1036 — metrics and the dropped-list caption). */
export function renderBoardBody(model, ctx, y0, y1){
  return boardBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
}

/* Style dispatch (E): style: DSL key, else grid on a time axis, else board.
   Grid/focus/register aren't built yet (stage 1 is board only) — an
   unimplemented pick falls back to board, and the map is the ONLY place a
   later stage needs to touch to slot styles 2-4 in. */
const STYLE_RENDERERS = {board: renderBoardDeck};

export function renderDeck(model, ctx = {}){
  const wanted = model.style || (model.timeAxis ? 'grid' : 'board');
  const renderFn = STYLE_RENDERERS[wanted] || STYLE_RENDERERS.board;
  return renderFn(model, ctx, paletteColors(model, ctx));
}
