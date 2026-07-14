/* (model, ctx) → SVG string. ctx = {colors, measure, diff?, slide?}. No DOM. */
import {STATUS_LABEL} from './parse.js';
import {packLane} from './pack.js';

const F = {
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Charter, Georgia, "Times New Roman", serif',
};

/* Every dimension in one place. All values are pre-scale; render multiplies by S. */
export const TOKENS = {
  pad: 26, laneW: 118, colGap: 12,
  colWNarrow: 236, colWWide: 200,      // ≤4 columns vs more
  headerH: 58, headerHNoTitle: 24, colHeadH: 30,
  titleSize: 22, titleY: 38, dateSize: 11,
  colHeadSize: 11, colHeadTracking: 1.6, colHeadTextY: 14,
  colHeadBarW: 22, colHeadBarH: 3, colHeadBarY: 20,
  wipSize: 10.5,
  laneSize: 11, laneTracking: 1.2, laneTextY: 20, laneLh: 15,
  laneSepInset: 4, laneMinH: 34, laneBottomPad: 18,
  cardPadX: 12, cardPadY: 11, cardGap: 8, cardRadius: 8, stackTop: 6,
  cardTitleSize: 13, cardTitleLh: 17, titleBaseline: 12,
  noteSize: 11.5, noteLh: 15, noteRaise: 2,
  pillSize: 9, pillH: 17, pillPadX: 7, pillTracking: 0.6, pillTopGap: 5,
  statusH: 24, badgeH: 23,
  legendH: 34, legendHEmpty: 8, legendY: 22, legendKeyGap: 12, legendSize: 11,
  droppedSize: 11, droppedRowH: 16, droppedHeadH: 20, droppedIndent: 8, droppedYOffset: 6,
  droppedHeadSize: 10, droppedHeadTracking: 1.2,
  fadeMax: 0.35,
  slideScale: 1.35,
  bottomPad: 14,
};


/* Palette schemes are shared series-wide. Re-exported for existing importers. */
export {PALETTES, scheme} from '../assets/series.js';
import {PALETTES, scheme} from '../assets/series.js';
import {esc, tint, wrapText, btnAttrs, editTarget} from '../assets/svg.js';

/* stable per-card identity for the shared FLIP (renumber-safe, unlike srcLine) —
   the title, normalised. Matches the app's drop-FLIP key. */
const titleKey = t => t.toLowerCase().replace(/\s+/g, ' ').trim();

/* One card's paint: rect + badge/title/note/status/ghost/url. Pure — returns an SVG
   string for a single card at the given top-left (x, cy). Shared by the wide nested-
   loop layout below and (a later narrow layout) at stacked coordinates. */
function drawCard(c, x, cy, colW, fadeOp, edit, st){
  const {T, S, C, capsule, cardPadX, cardPadY, fsTitle, fsNote, lhTitle, lhNote} = st;
  const s = [];
  s.push('<g' + (c.it.ghost ? '' : ' data-edit="cardmenu"') + ' data-line="' + c.it.srcLine +
    '" data-key="' + esc(titleKey(c.it.title)) + '" opacity="' + fadeOp.toFixed(2) + '"' +
    (c.it.ghost ? '' : btnAttrs('More options: ' + c.it.title)) +
    (edit && !c.it.ghost ? ' data-menu=""' : '') + '>');
  s.push('<rect' + (c.it.ghost ? '' : ' data-hit=""') + ' x="' + x + '" y="' + cy + '" width="' + colW + '" height="' + c.cardH +
    '" rx="' + T.cardRadius + '" fill="' + (c.it.ghost ? 'none' : C.card) +
    '" stroke="' + C.border + '" stroke-width="1"' +
    (c.it.ghost ? ' stroke-dasharray="3 3"' : '') + '/>');
  /* top-anchored cursor: each block advances by its budgeted height */
  let cursor = cy + cardPadY;
  if(c.badge){
    const bcol = c.badge.kind === 'new' ? C.accent :
                 c.badge.kind === 'alert' ? C.err : C.muted;
    s.push(capsule(x + cardPadX, cursor, c.badge.label.toUpperCase(), bcol, c.badge.kind === 'new' ? C.accentInk : bcol).svg);
    cursor += T.badgeH*S;
  }
  if(c.it.url) s.push('<a href="' + esc(c.it.url) + '" target="_blank" rel="noopener">');
  if(c.it.ghost && c.lines.length === 1){
    cursor = cy + (c.cardH - lhTitle) / 2;
  } else {
    /* lane-equalised cards with less content centre it in the slack
       (between badge and pill) instead of leaving a bottom-heavy hole */
    const contentH = c.lines.length*lhTitle + c.noteLines.length*lhNote;
    const footH = c.it.status ? T.statusH*S : 0;
    const slack = (cy + c.cardH - cardPadY - footH) - cursor - contentH;
    if(slack > 0) cursor += slack / 2;
  }
  const ed = c.it.edit || {};
  const titleEip = (!c.it.ghost && ed.title !== false)
    ? ' data-edit="title" data-line="' + c.it.srcLine + '" data-raw="' + esc(c.it.title) +
      '"' + btnAttrs('Rename: ' + c.it.title) : '';
  c.lines.forEach((line, li2) => {
    const lastLine = li2 === c.lines.length - 1;
    s.push('<text' + titleEip + ' x="' + (x + cardPadX) + '" y="' + (cursor + T.titleBaseline*S) + '" font-size="' + fsTitle +
      '" font-weight="' + (c.it.ghost ? '400" font-style="italic' : '600') +
      '" fill="' + (c.it.ghost ? C.muted : C.ink) + '">' + esc(line) +
      (c.it.url && lastLine ? ' <tspan font-size="' + 9*S + '" font-weight="600" fill="' + C.accent + '">↗</tspan>' : '') +
      '</text>');
    cursor += lhTitle;
  });
  if(c.it.url) s.push('</a>');
  const noteEip = (c.it.note && (c.it.edit || {}).note !== false)
    ? ' data-edit="note" data-line="' + c.it.srcLine + '" data-raw="' + esc(c.it.note) +
      '"' + btnAttrs('Edit note: ' + c.it.title) : '';
  for(const line of c.noteLines){
    s.push('<text' + noteEip + ' x="' + (x + cardPadX) + '" y="' + (cursor + (T.titleBaseline - T.noteRaise)*S) + '" font-size="' + fsNote +
      '" fill="' + C.muted + '">' + esc(line) + '</text>');
    cursor += lhNote;
  }
  if(c.it.status){
    const stEip = (c.it.edit || {}).status !== false
      ? '<g data-edit="status" data-line="' + c.it.srcLine + '" data-raw="' + c.it.status +
        '"' + btnAttrs('Cycle status: ' + c.it.title) + '>' : '<g>';
    s.push(stEip + capsule(x + cardPadX, cy + c.cardH - cardPadY - T.pillH*S,
      STATUS_LABEL[c.it.status].toUpperCase(), C.status[c.it.status], C.statusInk[c.it.status]).svg + '</g>');
  }
  s.push('</g>');
  return s.join('');
}

/* Narrow (phone) relayout: horizons stack top-to-bottom in reading order
   (NOW, then NEXT, then LATER), lanes group within each horizon as a
   labelled sub-section, cards run full width at their OWN natural height —
   no cross-horizon lane-height equalisation (that's meaningless once
   horizons no longer share a grid row). Same drawCard markup, so every
   data-edit/data-line/data-hit target is identical to the wide pass — the
   card menu and edit-in-place need no app-side routing change. Exports
   never set ctx.width, so this path is preview-only (mirrors wardley's
   renderNarrow: an early-return, fully self-contained pass).
   laneGroups (why's map view rides this): the wide path's accent/serif band
   header reappears here too, once per horizon section before the group's
   first lane — mirrors how the lane sub-label itself already repeats per
   horizon. Models without laneGroups (plain roadmap) render exactly as
   before: groupAtLane stays empty and nothing new is emitted. */
function renderNarrow(model, ctx, C, T){
  const {measure, diff = null} = ctx;
  const edit = !!ctx.edit;
  const W = ctx.width;
  const PAD = T.pad;
  const nH = model.horizons.length;
  const hasLanes = model.lanes.some(l => l);
  const colW = W - PAD * 2;
  const cardPadX = T.cardPadX, cardPadY = T.cardPadY, cardGap = T.cardGap;
  const fsTitle = T.cardTitleSize, fsNote = T.noteSize;
  const lhTitle = T.cardTitleLh, lhNote = T.noteLh;
  const titleFont = '600 ' + fsTitle + 'px ' + F.body;
  const noteFont = fsNote + 'px ' + F.body;
  const innerW = colW - cardPadX * 2;

  /* pre-lay every card at the FULL narrow width — its own wrap pass, since
     colW here differs from the wide grid's columns. Per-card height only. */
  const cells = {};
  for(const lane of model.lanes) cells[lane] = model.horizons.map(() => []);
  for(const it of model.items){
    const badge = diff ? diff.badge(it) : null;
    const lines = wrapText(it.title, titleFont, innerW, measure);
    const noteLines = it.note ? wrapText(it.note, noteFont, innerW, measure) : [];
    const h = cardPadY*2 + lines.length*lhTitle + noteLines.length*lhNote +
      (it.status ? T.statusH : 0) + (badge ? T.badgeH : 0);
    cells[it.lane][it.h].push({it, lines, noteLines, badge, cardH: h});
  }

  const capsule = (px, py, label, col, inkCol = col) => {
    const font = '600 ' + T.pillSize + 'px ' + F.body;
    const tw = measure(label, font) + label.length * T.pillTracking;
    const pw = tw + T.pillPadX*2, ph = T.pillH;
    return {
      svg: '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph +
        '" rx="' + ph/2 + '" fill="' + tint(col) + '"' +
        (tint(col) === 'none' ? ' stroke="' + col + '" stroke-width="1"' : '') + '/>' +
        '<text x="' + (px + T.pillPadX) + '" y="' + (py + ph - 5.5) + '" font-size="' + T.pillSize +
        '" font-weight="600" letter-spacing="' + T.pillTracking + '" fill="' + inkCol + '">' + esc(label) + '</text>',
      w: pw,
    };
  };
  const cardStyle = {T, S: 1, C, capsule, cardPadX, cardPadY, fsTitle, fsNote, lhTitle, lhNote};

  const s = [];
  let y = 24;

  /* title + date stack vertically (a right-aligned date would collide with
     a wrapped title at phone width) */
  if(model.title){
    for(const l of wrapText(model.title, '700 19px ' + F.serif, W - PAD*2, measure)){
      s.push('<text x="' + PAD + '" y="' + y + '" font-family=\'' + F.serif +
        '\' font-size="19" font-weight="700" fill="' + C.ink + '">' + esc(l) + '</text>');
      y += 24;
    }
  }
  if(model.dateStr !== 'off'){
    const d = model.dateStr || new Date().toISOString().slice(0, 10);
    const dLabel = diff && diff.since ? d + ' · vs ' + diff.since : d;
    s.push('<text x="' + PAD + '" y="' + y + '" font-size="' + T.dateSize + '" fill="' + C.muted + '">' + esc(dLabel) + '</text>');
    y += 20;
  } else y += 6;
  y += 10;

  const firstColCount = model.items.filter(i => i.h === 0).length;
  const overWip = model.wip > 0 && firstColCount > model.wip;
  const addH = 40;

  /* optional lane groups (why's map view rides this): the same first-lane
     association the wide path builds, so a phone user still sees which
     lanes belong to which outcome band, not an undifferentiated lane list. */
  const groupAtLane = new Map();
  if(model.laneGroups){
    for(const g of model.laneGroups){
      const first = g.lanes.find(l => model.lanes.includes(l));
      if(first !== undefined) groupAtLane.set(first, g.label);
    }
  }

  model.horizons.forEach((hName, h) => {
    /* horizon header + full-width accent bar */
    s.push('<text x="' + PAD + '" y="' + (y + 12) + '" font-size="13" font-weight="700" letter-spacing="' +
      T.colHeadTracking + '" fill="' + C.ink + '">' + esc(hName.toUpperCase()) + '</text>');
    if(h === 0 && overWip){
      s.push('<text x="' + (W - PAD) + '" y="' + (y + 12) + '" text-anchor="end" font-size="' + T.wipSize +
        '" font-weight="600" fill="' + C.err + '">' + firstColCount + ' ITEMS</text>');
    }
    y += 20;
    s.push('<rect x="' + PAD + '" y="' + y + '" width="' + colW + '" height="3" rx="1.5" fill="' + C.accent + '"/>');
    y += 16;

    /* confidence fade: certainty decreases toward the horizon (unchanged formula) */
    const fadeOp = (model.fade && nH > 1) ? (1 - (h / (nH - 1)) * T.fadeMax) : 1;
    for(const lane of model.lanes){
      if(groupAtLane.has(lane)){
        s.push('<text x="' + PAD + '" y="' + (y + 11) + '" font-family=\'' + F.serif +
          '\' font-size="14" font-weight="700" fill="' + C.accent + '">' +
          esc(groupAtLane.get(lane).toUpperCase()) + '</text>');
        y += 18;
        s.push('<line x1="' + PAD + '" y1="' + y + '" x2="' + (W - PAD) + '" y2="' + y +
          '" stroke="' + C.accent + '" stroke-width="1" opacity="0.5"/>');
        y += 10;
      }
      if(hasLanes && lane){
        s.push('<text x="' + PAD + '" y="' + (y + 10) + '" font-size="' + T.laneSize + '" font-weight="600" letter-spacing="' +
          T.laneTracking + '" fill="' + C.muted + '">' + esc(lane.toUpperCase()) + '</text>');
        y += 20;
      }
      for(const c of cells[lane][h]){
        s.push(drawCard(c, PAD, y, colW, fadeOp, edit, cardStyle));
        y += c.cardH + cardGap;
      }
      if(edit){
        s.push(editTarget(
          '<rect x="' + PAD + '" y="' + y + '" width="' + colW + '" height="' + addH +
            '" rx="10" fill="none" stroke="' + C.border + '" stroke-dasharray="3 4"/>' +
            '<text x="' + (PAD + colW/2) + '" y="' + (y + addH/2 + 4) +
            '" text-anchor="middle" font-size="12" font-weight="600" fill="' + C.muted + '">＋ Add' +
            (lane ? ' to ' + esc(lane) : '') + '</text>',
          {x: PAD, y, w: colW, h: addH, bg: C.bg},
          {kind: 'additem', line: -1, raw: '', extra: 'data-lane="' + esc(lane) + '" data-col="' + esc(hName) + '"',
            label: 'Add item to ' + (lane || 'roadmap') + ' ' + hName}));
        y += addH;
      }
      y += 14;   // gap after a lane group (or the single implicit lane)
    }
    y += 12;   // gap between horizons
  });

  /* legend: same capsules as wide, flow-wrapped across lines at this width */
  const usedStatuses = [...new Set(model.items.map(i => i.status).filter(Boolean))];
  const dropped = diff ? diff.dropped : [];
  if(usedStatuses.length || (diff && diff.any)){
    y += 6;
    const rowH = T.pillH + 10;
    let lx = PAD;
    const capsuleWidth = label => measure(label, '600 ' + T.pillSize + 'px ' + F.body) + label.length*T.pillTracking + T.pillPadX*2;
    const place = w => {
      if(lx + w > W - PAD && lx > PAD){ lx = PAD; y += rowH; }
      const at = lx; lx += w + 10; return at;
    };
    for(const st of ['done','doing','risk','blocked']){
      if(!usedStatuses.includes(st)) continue;
      const label = STATUS_LABEL[st].toUpperCase();
      const px = place(capsuleWidth(label));
      s.push(capsule(px, y, label, C.status[st], C.statusInk[st]).svg);
    }
    if(diff && diff.any){
      const px = place(capsuleWidth('NEW'));
      s.push(capsule(px, y, 'NEW', C.accent, C.accentInk).svg);
    }
    y += rowH;
    if(diff && diff.any){
      s.push('<text x="' + PAD + '" y="' + y + '" font-size="' + T.legendSize + '" fill="' + C.muted + '">' +
        esc('added since ' + diff.since) + '</text>');
      y += 18;
    }
    y += 6;
  }

  /* dropped-items strip (diff mode): single column when narrow (wide's two-up
     split only reads well with the extra width) */
  if(dropped.length){
    y += 4;
    s.push('<text x="' + PAD + '" y="' + y + '" font-size="' + T.droppedHeadSize + '" font-weight="600" letter-spacing="' +
      T.droppedHeadTracking + '" fill="' + C.muted + '">DROPPED SINCE ' + esc(diff.since.toUpperCase()) + '</text>');
    y += 16;
    for(const d of dropped){
      s.push('<text x="' + (PAD + T.droppedIndent) + '" y="' + y + '" font-size="' + T.droppedSize +
        '" fill="' + C.muted + '" text-decoration="line-through">' + esc(d) + '</text>');
      y += T.droppedRowH;
    }
    y += 6;
  }

  const H = Math.round(y + T.bottomPad);
  /* data-narrow lets CSS scope touch-action to the ROOT svg — Chromium only
     honours touch-action on the svg root, never on child elements */
  return '<svg xmlns="http://www.w3.org/2000/svg" data-narrow="" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + F.body + '\'>' +
    '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>' + s.join('') + '</svg>';
}

export function render(model, ctx){
  const {measure, diff = null, slide = false, dark = false} = ctx;
  const paletteHex = model.accent ||
    (PALETTES[model.palette] ? PALETTES[model.palette][dark ? 'dark' : 'light'] : null);
  const C = paletteHex ? {...ctx.colors, ...scheme(paletteHex, dark)} : ctx.colors;
  const T = TOKENS;
  const NARROW = 520;
  const isNarrow = !!(ctx.width && ctx.width < NARROW);
  if(isNarrow) return renderNarrow(model, ctx, C, T);
  const nH = model.horizons.length;
  const S = slide ? T.slideScale : 1;
  const PAD = T.pad*S, LANE_W = model.lanes.some(l => l) ? T.laneW*S : 0, GAP = T.colGap*S;
  const colW = (nH <= 4 ? T.colWNarrow : T.colWWide) * S;
  const W = Math.round(PAD*2 + LANE_W + nH*colW + (nH-1)*GAP);
  const cardPadX = T.cardPadX*S, cardPadY = T.cardPadY*S, cardGap = T.cardGap*S;
  const fsTitle = T.cardTitleSize*S, fsNote = T.noteSize*S;
  const lhTitle = T.cardTitleLh*S, lhNote = T.noteLh*S;
  const titleFont = '600 ' + fsTitle + 'px ' + F.body;
  const noteFont = fsNote + 'px ' + F.body;

  /* pre-lay every item. An item's paint width is its column span; width-1 items
     keep the historical numbers exactly. */
  const laneList = {};    // lane -> [{it,lines,noteLines,badge,cardH,h0,h1,span,w}] in SOURCE order
  for(const lane of model.lanes) laneList[lane] = [];
  for(const it of model.items){
    const badge = diff ? diff.badge(it) : null;    // {kind:'new'|'moved', label}
    const span = Math.max(1, Math.min(it.span || 1, nH - it.h));
    const w = colW + (span - 1)*(colW + GAP);
    const iw = w - cardPadX*2;
    const lines = wrapText(it.title, titleFont, iw, measure);
    const noteLines = it.note ? wrapText(it.note, noteFont, iw, measure) : [];
    const h = cardPadY*2 + lines.length*lhTitle + noteLines.length*lhNote +
      (it.status ? T.statusH*S : 0) + (badge ? T.badgeH*S : 0);
    laneList[it.lane].push({it, lines, noteLines, badge, cardH: h, h0: it.h, h1: it.h + span - 1, span, w});
  }

  /* cards in a lane are peers: equalise heights to the lane's tallest.
     LANE-WIDE, never per-track — a per-track height would shrink a short card in
     a quiet column and break the byte-identical degeneration. */
  for(const lane of model.lanes){
    let maxH = 0;
    for(const c of laneList[lane]) maxH = Math.max(maxH, c.cardH);
    if(maxH > 0) for(const c of laneList[lane]) c.cardH = maxH;
  }

  const edit = !!ctx.edit;               // preview-only affordances; exports/goldens render without
  /* does anything actually span? Several things (the drop-zone emission order below,
     and the per-column ACTIVE counts) must behave EXACTLY as they do today on a
     span-free doc — byte for byte — or the degeneration proof that keeps /why safe
     stops holding. Gating on the model, not on the time axis, is what buys that. */
  const anySpan = model.items.some(i => (i.span || 1) > 1);
  const addH = edit ? 20*S : 0;          // per-cell '+' ghost budget
  const headerH = (model.title ? T.headerH : T.headerHNoTitle)*S;
  const colHeadH = T.colHeadH*S;
  /* optional lane groups: [{label, lanes[]}] — a labelled band before its first lane */
  const bandH = 30*S;
  const groupAtLane = new Map();
  if(model.laneGroups){
    for(const g of model.laneGroups){
      const first = g.lanes.find(l => model.lanes.includes(l));
      if(first !== undefined) groupAtLane.set(first, g.label);
    }
  }
  const laneTops = [];
  const lanePack = {};   // lane -> {at, rowH[], depth[], yTrack[]}
  let y = headerH + colHeadH;
  for(const lane of model.lanes){
    if(groupAtLane.has(lane)) y += bandH;
    const list = laneList[lane];
    const {at, nTracks} = packLane(list);
    /* a track row is as tall as its tallest item — which, because equalisation is
       lane-wide, is the lane max for every non-empty track: uniform rows, exactly
       as today */
    const rowH = new Array(nTracks).fill(0);
    list.forEach((c, i) => { if(c.cardH > rowH[at[i]]) rowH[at[i]] = c.cardH; });
    /* deepest track covering each column — drives this lane's height */
    const depth = model.horizons.map(() => -1);
    list.forEach((c, i) => { for(let h = c.h0; h <= c.h1; h++) if(at[i] > depth[h]) depth[h] = at[i]; });
    let maxH = 0;
    for(let h = 0; h < nH; h++){
      /* accumulate, never multiply: slide renders at S=1.35 and these heights are
         non-integer — sum-by-addition is what reproduces today's reduce() bytes */
      let a = 0;
      for(let t = 0; t <= depth[h]; t++) a = a + rowH[t];
      const sH = a + Math.max(0, depth[h])*cardGap + addH;
      if(sH > maxH) maxH = sH;
    }
    /* y of each track. `cy += rowH[t] + cardGap` — the SAME shape as today's
       per-card accumulator. Do NOT flatten to `a + rowH[t] + cardGap`: that is
       (a+h)+g, a different double at S=1.35, and no current slide golden would
       catch the change. */
    const yTrack = [y + T.stackTop*S];
    for(let t = 0; t < nTracks; t++){
      let cy = yTrack[t];
      cy += rowH[t] + cardGap;
      yTrack.push(cy);
    }
    lanePack[lane] = {at, rowH, depth, yTrack};
    laneTops.push(y);
    y += Math.max(maxH, T.laneMinH*S) + T.laneBottomPad*S;
  }
  const usedStatuses = [...new Set(model.items.map(i => i.status).filter(Boolean))];
  const dropped = diff ? diff.dropped : [];
  const legendH = (usedStatuses.length || (diff && (diff.any || dropped.length)) ? T.legendH : T.legendHEmpty)*S;
  const droppedH = dropped.length ? (T.droppedHeadH + T.droppedRowH*Math.ceil(dropped.length / 2))*S : 0;
  const H = y + legendH + droppedH + T.bottomPad*S;

  const s = [];
  s.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Math.round(H) +
    '" viewBox="0 0 ' + W + ' ' + Math.round(H) + '" font-family=\'' + F.body + '\'>');
  s.push('<rect width="' + W + '" height="' + Math.round(H) + '" fill="' + C.bg + '"/>');

  /* title + date */
  if(model.title){
    s.push('<text x="' + PAD + '" y="' + T.titleY*S + '" font-family=\'' + F.serif +
      '\' font-size="' + T.titleSize*S + '" font-weight="700" fill="' + C.ink + '">' + esc(model.title) + '</text>');
  }
  if(model.dateStr !== 'off'){
    const d = model.dateStr || new Date().toISOString().slice(0, 10);
    const dLabel = diff && diff.since ? d + ' · vs ' + diff.since : d;
    s.push('<text x="' + (W - PAD) + '" y="' + (model.title ? T.titleY : 16)*S +
      '" text-anchor="end" font-size="' + T.dateSize*S + '" fill="' + C.muted + '">' + esc(dLabel) + '</text>');
  }

  /* column headers, with a WIP flag on the first column */
  const colX = h => PAD + LANE_W + h*(colW + GAP);
  const firstColCount = model.items.filter(i => i.h === 0).length;
  const overWip = model.wip > 0 && firstColCount > model.wip;
  for(let h = 0; h < nH; h++){
    s.push('<text x="' + colX(h) + '" y="' + (headerH + T.colHeadTextY*S) +
      '" font-size="' + T.colHeadSize*S + '" font-weight="600" letter-spacing="' + T.colHeadTracking + '" fill="' + C.muted + '">' +
      esc(model.horizons[h].toUpperCase()) + '</text>');
    if(h === 0 && overWip){
      s.push('<text x="' + (colX(0) + colW) + '" y="' + (headerH + T.colHeadTextY*S) +
        '" text-anchor="end" font-size="' + T.wipSize*S + '" font-weight="600" fill="' + C.err + '">' +
        firstColCount + ' ITEMS</text>');
    }
    s.push('<rect x="' + colX(h) + '" y="' + (headerH + T.colHeadBarY*S) + '" width="' + T.colHeadBarW*S +
      '" height="' + T.colHeadBarH*S + '" rx="' + (T.colHeadBarH*S/2) + '" fill="' + C.accent + '"/>');
  }

  /* capsule pill: tinted fill, coloured label; used by cards, badges, and the legend */
  const capsule = (px, py, label, col, inkCol = col) => {   // inkCol: contrast-boosted TEXT colour; fill still uses col
    const font = '600 ' + T.pillSize*S + 'px ' + F.body;
    const tw = measure(label, font) + label.length * T.pillTracking;
    const pw = tw + T.pillPadX*2*S, ph = T.pillH*S;
    return {
      svg: '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph +
        '" rx="' + ph/2 + '" fill="' + tint(col) + '"' +
        (tint(col) === 'none' ? ' stroke="' + col + '" stroke-width="1"' : '') + '/>' +
        '<text x="' + (px + T.pillPadX*S) + '" y="' + (py + ph - 5.5*S) + '" font-size="' + T.pillSize*S +
        '" font-weight="600" letter-spacing="' + T.pillTracking + '" fill="' + inkCol + '">' + esc(label) + '</text>',
      w: pw,
    };
  };

  /* shared context drawCard needs — same across every card in this render */
  const cardStyle = {T, S, C, capsule, cardPadX, cardPadY, fsTitle, fsNote, lhTitle, lhNote};

  const shortCol = name => String(name).split(' ')[0].toUpperCase();
  /* On-board ends drop the year — the column headers supply it. An OFF-board end
     must keep it: on a Q3 2026–Q2 2027 board, a bare "Q4" reads as Q4 2026, which
     is ON the board, so the label would claim a 2-column span for a bar painted 4
     columns wide. */
  const rangeLabel = c => shortCol(model.horizons[c.h0]) + ' – ' +
    (c.it.spanEnd ? c.it.spanEnd.toUpperCase() + ' ›' : shortCol(model.horizons[c.h1]));

  /* A spanning item is the SAME SPECIES as a card, drawn wider — drawCard at the
     span's width — so wrap, note, status pill, badge, URL, the data-edit targets
     and the card menu all behave exactly as they do for a 1-column card. A slim
     "beam" was prototyped and rejected: it drops the note and clips long titles,
     and in a tool whose content is the text, that is disqualifying. */
  function drawSpanItem(c, x, cy, fadeOp, edit2){
    const svg = [drawCard(c, x, cy, c.w, fadeOp, edit2, cardStyle)];
    /* A 1-column card gets NO cap and NO range label — it is just a card. It DOES
       still get its right-edge handle (Task 8), which is how a plain card becomes
       a spanning one by mouse; so this early return must skip the DECORATION only,
       never the handles. Task 8 appends them after this call, not inside it. */
    if(c.span === 1 && !c.it.spanEnd) return svg[0];
    /* duration cue: a slim left cap in the status colour — MUTED when the item has
       no status (in light theme the accent is the same hex as the doing status, so
       an accent cap would fake an IN PROGRESS pill) */
    const capCol = c.it.status ? C.status[c.it.status] : C.muted;
    const capOp = (c.it.status ? 1 : 0.55) * fadeOp;
    svg.push('<rect x="' + (x + 1.5) + '" y="' + (cy + 4*S) + '" width="' + 3*S +
      '" height="' + (c.cardH - 8*S) + '" rx="' + 1.5*S + '" fill="' + capCol +
      '" opacity="' + capOp.toFixed(2) + '"/>');
    svg.push('<text x="' + (x + c.w - cardPadX) + '" y="' + (cy + c.cardH - cardPadY + 2*S) +
      '" text-anchor="end" font-size="' + 9*S + '" font-weight="600" letter-spacing="0.8" fill="' + C.muted +
      '" opacity="' + fadeOp.toFixed(2) + '">' + esc(rangeLabel(c)) + '</text>');
    if(c.it.spanEnd){
      /* runs past the board: a dashed cut edge, drawn over a bg-coloured line so it
         reads as a cut rather than a border */
      svg.push('<line x1="' + (x + c.w) + '" y1="' + (cy + 3*S) + '" x2="' + (x + c.w) + '" y2="' + (cy + c.cardH - 3*S) +
        '" stroke="' + C.bg + '" stroke-width="2"/>');
      svg.push('<line x1="' + (x + c.w) + '" y1="' + (cy + 3*S) + '" x2="' + (x + c.w) + '" y2="' + (cy + c.cardH - 3*S) +
        '" stroke="' + C.muted + '" stroke-width="1.2" stroke-dasharray="3 3" opacity="' + fadeOp.toFixed(2) + '"/>');
    }
    return svg.join('');
  }

  /* lanes */
  model.lanes.forEach((lane, li) => {
    const top = laneTops[li];
    if(groupAtLane.has(lane)){
      s.push('<text x="' + PAD + '" y="' + (top - 12*S) + '" font-family=\'' + F.serif +
        '\' font-size="' + 13*S + '" font-weight="700" fill="' + C.accent + '">' +
        esc(groupAtLane.get(lane).toUpperCase()) + '</text>');
      s.push('<line x1="' + PAD + '" y1="' + (top - T.laneSepInset*S) + '" x2="' + (W - PAD) + '" y2="' + (top - T.laneSepInset*S) +
        '" stroke="' + C.accent + '" stroke-width="1" opacity="0.5"/>');
    } else if(li > 0){
      s.push('<line x1="' + PAD + '" y1="' + (top - T.laneSepInset*S) + '" x2="' + (W - PAD) + '" y2="' + (top - T.laneSepInset*S) +
        '" stroke="' + C.border + '" stroke-width="1" opacity="0.55"/>');
    }
    if(lane){
      const laneLines = wrapText(lane.toUpperCase(), '600 ' + T.laneSize*S + 'px ' + F.body, LANE_W - 22*S, measure);
      laneLines.forEach((l, i) => {
        s.push('<text x="' + PAD + '" y="' + (top + T.laneTextY*S + i*T.laneLh*S) +
          '" font-size="' + T.laneSize*S + '" font-weight="600" letter-spacing="' + T.laneTracking + '" fill="' + C.muted + '">' + esc(l) + '</text>');
      });
    }
    const {at, rowH, depth, yTrack} = lanePack[lane];
    const list = laneList[lane];
    const laneH = (laneTops[li + 1] !== undefined ? laneTops[li + 1] : y) - top;
    const cellRect = h => '<rect data-cell="' + h + '|' + esc(lane) + '" x="' + colX(h) + '" y="' + top +
      '" width="' + colW + '" height="' + laneH + '" fill="transparent"/>';
    /* A spanning card is drawn at its START column but paints across the ones after
       it — and a transparent rect is still a PAINTED hit target. Emitted per-column
       (rect, then that column's cards), the NEXT column's drop-zone lands on top of
       the bar and makes it pointer-dead: no card menu, no edit-in-place, and no
       edge handle, over everything past its first column.
       So when the doc has spans, lay ALL the drop zones down first, then the cards
       on top. Gated on anySpan, because the order is itself a byte: a span-free doc
       must emit exactly what it emits today, or the degeneration proof (and with it
       /why's containment) evaporates. Dropping is unaffected either way — cellAt
       uses elementsFromPoint, which sees the rect through the card. */
    if(anySpan) for(let h = 0; h < nH; h++) s.push(cellRect(h));
    for(let h = 0; h < nH; h++){
      if(!anySpan) s.push(cellRect(h));
      /* confidence fade: certainty decreases toward the horizon */
      const fadeOp = (model.fade && nH > 1) ? (1 - (h / (nH - 1)) * T.fadeMax) : 1;
      /* an item is DRAWN by its START column only — it paints across the rest.
         Emit in track order so the SVG reads top-to-bottom. */
      list.map((c, i) => [at[i], c, i]).filter(([, c]) => c.h0 === h)
        .sort((a, b) => a[0] - b[0])
        .forEach(([t, c]) => s.push(drawSpanItem(c, colX(h), yTrack[t], fadeOp, edit)));
      /* the ghost goes under the deepest track occupied in THIS column — a span
         passing through occupies a track here without starting here, and a
         "bottom of the last card I drew" rule would put the ghost on top of it.
         Degenerate-identical: with no spans, depth[h] = k-1 for a k-card cell, so
         yTrack[k] is exactly today's post-loop accumulator. */
      const cy = yTrack[depth[h] + 1];
      if(edit){
        const gw = 44*S, gh = 15*S;
        s.push('<g data-add="1" opacity="0.75">' +
          '<rect x="' + colX(h) + '" y="' + cy + '" width="' + gw + '" height="' + gh +
          '" rx="' + gh/2 + '" fill="none" stroke="' + C.border + '" stroke-dasharray="2 3"/>' +
          '<text data-edit="additem" data-lane="' + esc(lane) + '" data-col="' + esc(model.horizons[h]) +
          '" data-line="-1" data-raw="" x="' + (colX(h) + 8*S) + '" y="' + (cy + gh - 4*S) +
          '" font-size="' + 9*S + '" font-weight="600" fill="' + C.muted +
          '"' + btnAttrs('Add item to ' + (lane || 'roadmap') + ' ' + model.horizons[h]) +
          '>＋ add</text></g>');
      }
    }
  });

  /* dropped-items strip (diff mode): muted + struck through, not alarm-red */
  if(dropped.length){
    const dy = y + legendH + T.droppedYOffset*S;
    s.push('<text x="' + PAD + '" y="' + dy + '" font-size="' + T.droppedHeadSize*S +
      '" font-weight="600" letter-spacing="' + T.droppedHeadTracking + '" fill="' + C.muted + '">DROPPED SINCE ' +
      esc(diff.since.toUpperCase()) + '</text>');
    dropped.forEach((d, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      s.push('<text x="' + (PAD + T.droppedIndent*S + col*((W - PAD*2)/2)) + '" y="' + (dy + (16 + row*T.droppedRowH)*S) +
        '" font-size="' + T.droppedSize*S + '" fill="' + C.muted + '" text-decoration="line-through">' + esc(d) + '</text>');
    });
  }

  /* legend: keys are the same capsules the cards use */
  if(usedStatuses.length || (diff && diff.any)){
    let lx = PAD;
    const capTop = y + T.legendY*S - T.pillH*S + 3*S;
    for(const st of ['done','doing','risk','blocked']){
      if(!usedStatuses.includes(st)) continue;
      const p = capsule(lx, capTop, STATUS_LABEL[st].toUpperCase(), C.status[st], C.statusInk[st]);
      s.push(p.svg);
      lx += p.w + T.legendKeyGap*S;
    }
    if(diff && diff.any){
      const p = capsule(lx, capTop, 'NEW', C.accent, C.accentInk);
      s.push(p.svg);
      lx += p.w + 6*S;
      s.push('<text x="' + lx + '" y="' + (y + T.legendY*S) + '" font-size="' + T.legendSize*S + '" fill="' + C.muted + '">' +
        esc('added since ' + diff.since) + '</text>');
    }
  }
  s.push('</svg>');
  return s.join('');
}
