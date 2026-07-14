/* (model, ctx, {style}) → a 16:9 DECK svg. Pure — no DOM, no `new Date()`.
   SEPARATE from render.js: /why's map view delegates to renderRoadmap, so
   anything added there lands in /why too (shifted its goldens once).
   render.js stays the working chart; the deck lives here. Named render-*.js
   so renderer-coverage.test.mjs FORCES this into the injection corpus.

   1920×1080, one shared frame (accent rule → Charter title → date → the
   VERDICT standfirst → body band → footer rule + metrics). Styles fill the
   body; colour comes from the doc (palette:/accent: via scheme()), never
   the style — a style owns STRUCTURE. */
import {txt, wrapText, tint, esc} from '../assets/svg.js';
import {STATUS_LABEL} from './parse.js';
import {PALETTES, scheme} from '../assets/series.js';
import {render as renderChart} from './render.js';

export const W = 1920, H = 1080, M = 100;
const INNER = W - M * 2;                      // 1720
/* local font stacks — not threaded through svg.js's txt() (no font-family
   override there): serif's double-quoted "Times New Roman" rides in a
   single-quoted <g font-family='…'>, mirroring render.js's own pattern. */
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
   pinned by verdict.test.mjs. app.js's live diff (and the badges below) is
   shaped for BADGES instead: `badge(item)` plus a `dropped` array of titles.
   Bridges the two without forcing app.js to compute the counts twice. */
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

/* shared SVG micro-builders (deck-local, NOT assets/svg.js — render.js/
   svg.js/series.js stay at zero hunks, and svg.js has no rect/line helper or
   font-family override). Attribute order is fixed; deck.test.mjs's bounds
   sweep parses by name so it doesn't care. */
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

/* ellipsis-clip to one line; wrap-to-N-lines with an ellipsis on overflow.
   measure passed explicitly (pure helpers take it as an arg, never close
   over a DOM-side singleton). */
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

/* capsule pill: tinted fill (house 12% tint via svg.js's tint()), contrast
   ink — render.js's local capsule, at deck scale. Never colour-alone: the
   label text always carries the word. */
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

/* Shared frame: accent rule -> Charter title -> date -> verdict standfirst
   (wrapped to <=2 lines, budgeting the body band down when it wraps) -> body
   -> footer rule -> metrics. `today` is INJECTED via ctx (no `new Date()`
   here): printed when model.dateStr is null, suppressed entirely on the
   literal string 'off' (mirrors render.js's date semantics). */
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
   of excluding the frame's own footer text (legitimately below y=1036). */
export function renderBoardBody(model, ctx, y0, y1){
  return boardBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
}

/* REGISTER: the roadmap as a formal table. Columns are FRACTIONS of the
   1720 inner width (item .35/lane .12/horizon .11/status .12/note .30) — an
   unused column (no lanes/statuses/notes) is DROPPED, its share
   redistributed (item always stays). Rows sort horizon -> lane -> srcLine;
   the horizon name prints once per group (ditto-suppressed). Diff: a NEW
   capsule after the title; a moved item's "was X" label prints italic in
   the horizon cell; dropped items become struck rows with a DROPPED
   capsule. Live table + dropped section are both capFit-capped. */
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
  let x = M;
  return used.map(c => {
    const w = c.frac / total * INNER;
    const col = {key: c.key, label: c.label, x, w};
    x += w;
    return col;
  });
}

function registerRows(model){
  const laneRank = new Map(model.lanes.map((l, i) => [l, i]));
  return [...model.items].sort((a, b) =>
    (a.h - b.h) || ((laneRank.get(a.lane) ?? 0) - (laneRank.get(b.lane) ?? 0)) || (a.srcLine - b.srcLine));
}

const italTxt = (x, y, s, size, fill) => '<text x="' + r2(x) + '" y="' + r2(y) +
  '" font-size="' + size + '" font-style="italic" fill="' + fill + '">' + esc(s) + '</text>';

function registerBodyFn(model, ctx, C){
  return (y0, y1) => {
    const {measure, diff = null} = ctx;
    const badgeOf = it => diff && diff.badge ? diff.badge(it) : null;
    const dropped = diff && diff.dropped ? diff.dropped : [];
    const cols = registerColumns(model);
    const col = k => cols.find(c => c.key === k);
    const itemCol = col('item'), laneCol = col('lane'), hCol = col('horizon'),
      stCol = col('status'), noteCol = col('note');
    const RPAD = 12, headH = 40;
    const zoneH = y1 - y0;
    const availH = Math.max(0, zoneH - headH);

    const s = [];
    for(const c of cols)
      s.push(txt(c.x + RPAD, y0 + 24, c.label, 12, C.muted, {weight: 700, tracking: 1.4}));
    s.push(line(M, y0 + headH - 6, W - M, y0 + headH - 6, C.border, 1.5));

    const rows = registerRows(model);
    if(!rows.length && !dropped.length){
      s.push(rect(M, y0 + headH + 10, INNER, 60, 'none', {rx: 12, stroke: C.border, sw: 1, dash: '4 4'}));
      s.push(txt(W / 2, y0 + headH + 46, 'Nothing on the register yet', 14, C.muted, {anchor: 'middle'}));
      return s.join('');
    }

    /* budget: the dropped section (if any) gets up to 30% of the body, never
       crowding the live table out entirely and never itself left unbounded */
    const dRowH = 34, dHeadH = dropped.length ? 28 : 0;
    const dWant = dHeadH + dropped.length * dRowH;
    const dBudget = dropped.length ? Math.min(dWant, Math.max(dHeadH + dRowH, availH * 0.3), availH) : 0;
    const liveBudget = Math.max(0, availH - dBudget);

    const titleFont = '700 15px ' + SANS, secFont = '13px ' + SANS, noteFont = '13px ' + SANS;
    const capsuleW = label => measure(label, '600 12px ' + SANS) + label.length * 0.6 + 18;

    const layout = noteMax => rows.map((it, i) => {
      const b = badgeOf(it);
      const groupFirst = i === 0 || rows[i - 1].h !== it.h;
      const newCapW = b && b.kind === 'new' ? capsuleW(b.label.toUpperCase()) + 10 : 0;
      const tl = wrapN(it.title, titleFont, itemCol.w - RPAD * 2 - newCapW, 2, measure);
      const nl = noteCol && it.note ? wrapN(it.note, noteFont, noteCol.w - RPAD * 2, noteMax, measure) : [];
      const hLines = [];
      if(hCol && groupFirst) hLines.push(model.horizons[it.h]);
      if(hCol && b && b.kind === 'moved') hLines.push(b.label);
      const contentH = Math.max(tl.length * 19, nl.length * 17, hLines.length * 17,
        (stCol && it.status) ? 22 : 0, 17);
      return {it, b, tl, nl, hLines, groupFirst, h: RPAD * 2 + contentH};
    });
    let laidRows = layout(2);
    const sumH = list => list.reduce((a, r) => a + r.h, 0);
    if(sumH(laidRows) > liveBudget) laidRows = layout(1);
    const shown = capFit(laidRows.map(r => r.h), liveBudget, 0, 30);

    let ry = y0 + headH;
    for(const r of laidRows.slice(0, shown)){
      const {it, b, tl, nl, hLines} = r;
      const wash = it.status === 'blocked' ? C.status.blocked + '33'
        : it.status === 'risk' ? tint(C.status.risk) : null;
      if(wash) s.push(rect(M, ry, INNER, r.h, wash));
      let ty = ry + RPAD + 13;
      tl.forEach((ln, li) => {
        s.push(txt(itemCol.x + RPAD, ty, ln, 15, C.ink, {weight: 700}));
        if(li === 0 && b && b.kind === 'new'){
          const lw = measure(ln, titleFont);
          s.push(badgeCapsule(itemCol.x + RPAD + lw + 10, ty - 15, b, C, measure).svg);
        }
        ty += 19;
      });
      if(laneCol && it.lane)
        s.push(txt(laneCol.x + RPAD, ry + RPAD + 13, clip1(it.lane, secFont, laneCol.w - RPAD * 2, measure), 13, C.muted));
      if(hCol){
        let hy = ry + RPAD + 13;
        hLines.forEach((ln, li) => {
          if(li === 0 && r.groupFirst) s.push(txt(hCol.x + RPAD, hy, ln, 13, C.ink, {weight: 700}));
          else s.push(italTxt(hCol.x + RPAD, hy, ln, 12.5, C.muted));
          hy += 17;
        });
      }
      if(stCol && it.status)
        s.push(statusCapsule(stCol.x + RPAD, ry + (r.h - 22) / 2, it.status, C, measure).svg);
      if(noteCol && nl.length){
        let ny = ry + RPAD + 13;
        for(const ln of nl){ s.push(txt(noteCol.x + RPAD, ny, ln, 13, C.muted)); ny += 17; }
      }
      ry += r.h;
      s.push(line(M, ry, W - M, ry, C.border, 1, 0.5));
    }
    if(shown < laidRows.length){
      s.push(rect(M, ry, INNER, 30, 'none', {rx: 8, stroke: C.border, sw: 1, dash: '4 4'}));
      s.push(txt(M + 14, ry + 20, '+ ' + (laidRows.length - shown) + ' more', 13, C.muted, {weight: 600}));
      ry += 30 + 6;
    }

    if(dropped.length){
      ry += 8;
      s.push(txt(M, ry + 14, 'DROPPED SINCE ' + (diff.since || '').toUpperCase(), 11, C.muted, {weight: 700, tracking: 1.2}));
      ry += 26;
      const dLabel = 'DROPPED · ' + (diff.since || '');
      const dCapW = capsuleW(dLabel);   // capsule() below draws dLabel as-is (no uppercase), so no uppercase here either
      const dTitleFont = '14px ' + SANS;
      const dTitleMaxW = Math.max(20, INNER - 16 - dCapW - 12);
      const dRows = dropped.map(name => ({name, h: dRowH}));
      const room = Math.max(0, y1 - ry);
      const shownD = capFit(dRows.map(r => r.h), room, 0, 30);
      for(const d of dRows.slice(0, shownD)){
        const clipped = clip1(d.name, dTitleFont, dTitleMaxW, measure);
        s.push(txt(M + 8, ry + 20, clipped, 14, C.muted, {strike: true}));
        const tw = measure(clipped, dTitleFont);
        s.push(capsule(M + 8 + tw + 12, ry + 5, dLabel, C.muted, C.muted, measure).svg);
        ry += dRowH;
      }
      if(shownD < dRows.length)
        s.push(txt(M, ry + 16, '+ ' + (dRows.length - shownD) + ' more dropped', 13, C.muted, {weight: 600}));
    }
    return s.join('');
  };
}

function renderRegisterDeck(model, ctx, C){
  return deckFrame(model, ctx, C, registerBodyFn(model, ctx, C));
}
export function renderRegisterBody(model, ctx, y0, y1){
  return registerBodyFn(model, ctx, paletteColors(model, ctx))(y0, y1);
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
export function gridFit(w, h, boxW, boxH){
  const scale = Math.max(0, Math.min(w > 0 ? boxW / w : 1, h > 0 ? boxH / h : 1, 1));
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
