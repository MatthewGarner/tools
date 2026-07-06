/* OST projection renderer: left-to-right box tree. (model, projection, ctx) → SVG. */
import {PALETTES, scheme} from '../assets/series.js';
import {esc, tint, wrapText} from '../assets/svg.js';

const F = {
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Charter, Georgia, "Times New Roman", serif',
};

export const TOKENS = {
  pad: 26, colW: 206, cardW: 182, cardPadX: 10, cardPadY: 8, rowGap: 14,
  labelSize: 12, labelLh: 15, assumpSize: 10, assumpLh: 13,
  pillSize: 8.5, pillH: 15, pillPadX: 6, pillTracking: 0.6, pillGap: 5,
  titleSize: 22, titleY: 36, dateSize: 11, headerH: 54, headerHNoTitle: 18,
  outcomeSize: 13.5, edgeW: 1.25, dimOp: 0.42,
  slideScale: 1.35, bottomPad: 16,
};

const ASSUMP_GLYPH = {untested: '?', testing: '~', holds: '✓', broken: '✗'};
const STATUS_LABEL = {candidate: 'Candidate', testing: 'Testing', delivering: 'Delivering',
  shipped: 'Shipped', parked: 'Parked'};


export function renderOst(model, projection, ctx, diff = null){
  const {measure, slide = false, dark = false, edit = false} = ctx;
  const paletteHex = model.accent ||
    (PALETTES[model.palette] ? PALETTES[model.palette][dark ? 'dark' : 'light'] : null);
  const C = paletteHex ? {...ctx.colors, ...scheme(paletteHex, dark)} : ctx.colors;
  const T = TOKENS;
  const S = slide ? T.slideScale : 1;
  const statusColor = st => ({
    candidate: C.muted, testing: C.accent, delivering: C.status ? C.status.done : C.accent,
    shipped: C.muted, parked: C.muted,
  })[st] || C.muted;
  const assumpColor = st => ({
    untested: C.muted, testing: C.accent, holds: (C.status ? C.status.done : C.accent), broken: C.err,
  })[st] || C.muted;
  const labelFont = '600 ' + T.labelSize*S + 'px ' + F.body;
  const assumpFont = T.assumpSize*S + 'px ' + F.body;
  const innerW = (T.cardW - T.cardPadX*2)*S;
  const aLines = new Map();   // assumption node → wrapped display lines

  /* measure every node card; assumptions fold into their solution's card */
  function prep(node){
    node._assumps = node.children.filter(c => c.kind === 'assumption');
    node._kids = node.children.filter(c => c.kind !== 'assumption');
    node._lines = wrapText(node.label, labelFont, innerW, measure);
    let h = T.cardPadY*2*S + node._lines.length * T.labelLh*S;
    if(node.kind === 'solution') h += T.pillH*S + T.pillGap*S;
    for(const a of node._assumps){
      aLines.set(a, wrapText(ASSUMP_GLYPH[a.status] + ' ' + a.label, assumpFont, innerW, measure));
      h += aLines.get(a).length * T.assumpLh*S;
    }
    node._h = h;
    node._kids.forEach(prep);
  }
  /* rows: post-order, leaves stacked with real heights */
  let cursorY = 0, maxDepth = 0;
  function place(node, depth){
    maxDepth = Math.max(maxDepth, depth);
    node._depth = depth;
    if(node._kids.length === 0){
      node._y = cursorY;
      cursorY += node._h + T.rowGap*S;
    } else {
      node._kids.forEach(k => place(k, depth + 1));
      const first = node._kids[0], last = node._kids[node._kids.length - 1];
      node._y = (first._y + last._y + last._h) / 2 - node._h / 2;
    }
  }
  model.outcomes.forEach(o => { prep(o); place(o, 0); cursorY += 10*S; });

  const headerH = ((model.title ? T.headerH : T.headerHNoTitle) + (diff ? 20 : 0))*S;
  const W = Math.round(T.pad*2*S + (maxDepth + 1) * T.colW*S);
  const droppedH = diff && diff.dropped.length ? (20 + diff.dropped.length * 15)*S : 0;
  const H = Math.round(headerH + cursorY + droppedH + T.bottomPad*S);
  const nx = n => T.pad*S + n._depth * T.colW*S;
  const nyTop = n => headerH + n._y;

  const s = [];
  s.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + F.body + '\'>');
  s.push('<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>');
  if(model.title){
    s.push('<text x="' + T.pad*S + '" y="' + T.titleY*S + '" font-family=\'' + F.serif +
      '\' font-size="' + T.titleSize*S + '" font-weight="700" fill="' + C.ink + '">' + esc(model.title) + '</text>');
  }
  s.push('<text x="' + (W - T.pad*S) + '" y="' + (model.title ? T.titleY : 14)*S +
    '" text-anchor="end" font-size="' + T.dateSize*S + '" fill="' + C.muted + '">' +
    new Date().toISOString().slice(0, 10) + '</text>');
  if(diff){
    s.push('<text x="' + T.pad*S + '" y="' + ((model.title ? T.titleY + 19 : 14))*S +
      '" font-size="' + 12*S + '" font-weight="600" fill="' + C.accent + '">' +
      esc(diff.narrative) + '</text>');
  }

  function drawCard(node){
    const x = nx(node), y = nyTop(node);
    const dimmed = projection.ost.dimmed.has(node);
    const unaddressed = projection.ost.unaddressed.has(node);
    if(dimmed) s.push('<g opacity="' + T.dimOp + '">');
    const isOutcome = node.kind === 'outcome';
    /* edit-gated: the card body is a popover target (add child / remove branch) */
    const cardEip = edit ? ' data-edit="card-' + node.kind + '" data-raw=""' +
      ' role="button" aria-label="' + esc(node.label) + ' — add or remove"' : '';
    s.push('<rect' + cardEip + ' data-line="' + node.srcLine + '" x="' + x + '" y="' + y + '" width="' + T.cardW*S +
      '" height="' + node._h + '" rx="8" fill="' + (isOutcome ? tint(C.accent) : C.card) +
      '" stroke="' + (isOutcome ? C.accent : C.border) + '" stroke-width="1"' +
      (unaddressed ? ' stroke-dasharray="3 3"' : '') + '/>');
    const dBadge = diff && diff.badge(node);
    if(dBadge){
      const bcol = dBadge.kind === 'new' ? C.accent : C.muted;
      const blabel = dBadge.label.toUpperCase();
      const bw = measure(blabel, '600 ' + T.pillSize*S + 'px ' + F.body) + T.pillPadX*2*S;
      const bx = x + T.cardW*S - bw - 4*S, by = y - T.pillH*S/2;
      /* outcome cards are already accent-tinted — a tinted pill vanishes there,
         so the badge inverts to solid-on-card (Matt's 2026-07-06 review note) */
      const solid = isOutcome;
      s.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + T.pillH*S +
        '" rx="' + T.pillH*S/2 + '" fill="' + (solid ? bcol : tint(bcol)) +
        '" stroke="' + (solid ? C.card : bcol) + '" stroke-width="' + (solid ? 1.25 : 0.75) + '"/>');
      s.push('<text x="' + (bx + T.pillPadX*S) + '" y="' + (by + T.pillH*S - 4.5*S) +
        '" font-size="' + T.pillSize*S + '" font-weight="600" letter-spacing="' + T.pillTracking +
        '" fill="' + (solid ? C.card : bcol) + '">' + esc(blabel) + '</text>');
    }
    let ty = y + T.cardPadY*S + T.labelSize*S;
    for(const line of node._lines){
      s.push('<text data-edit="label" data-line="' + node.srcLine + '" data-raw="' + esc(node.label) +
        '" x="' + (x + T.cardPadX*S) + '" y="' + ty + '" font-size="' + T.labelSize*S +
        '" font-weight="600"' + (isOutcome ? ' font-family=\'' + F.serif + '\'' : '') +
        ' fill="' + C.ink + '">' + esc(line) + '</text>');
      ty += T.labelLh*S;
    }
    if(node.kind === 'solution'){
      const col = statusColor(node.status);
      const label = STATUS_LABEL[node.status].toUpperCase();
      const eip = ' data-edit="status" data-line="' + node.srcLine + '" data-raw="' + node.status + '"';
      const tw = measure(label, '600 ' + T.pillSize*S + 'px ' + F.body) + label.length * T.pillTracking;
      s.push('<rect' + eip + ' x="' + (x + T.cardPadX*S) + '" y="' + (ty - T.labelSize*S + 3*S) + '" width="' + (tw + T.pillPadX*2*S) +
        '" height="' + T.pillH*S + '" rx="' + T.pillH*S/2 + '" fill="' + tint(col) + '"/>');
      s.push('<text' + eip + ' x="' + (x + T.cardPadX*S + T.pillPadX*S) + '" y="' + (ty - T.labelSize*S + 3*S + T.pillH*S - 4.5*S) +
        '" font-size="' + T.pillSize*S + '" font-weight="600" letter-spacing="' + T.pillTracking +
        '" fill="' + col + '">' + esc(label) + '</text>');
      ty += T.pillH*S + T.pillGap*S;
    }
    for(const a of node._assumps){
      const col = assumpColor(a.status);
      const rows = aLines.get(a);
      rows.forEach((row, i) => {
        s.push('<text data-edit="astatus" data-line="' + a.srcLine + '" data-raw="' + a.status +
          '" x="' + (x + T.cardPadX*S) + '" y="' + ty + '" font-size="' + T.assumpSize*S +
          '" fill="' + col + '">' + esc(row) + '</text>');
        if(edit && i === rows.length - 1){   /* one-click remove just past the row text (map's × idiom) */
          const xx = Math.min(x + T.cardPadX*S + measure(row, assumpFont) + 8*S, x + (T.cardW - T.cardPadX)*S);
          s.push('<text data-edit="removeassump" data-line="' + a.srcLine + '" data-raw="" role="button"' +
            ' aria-label="Remove assumption ' + esc(a.label) + '" x="' + xx +
            '" y="' + ty + '" text-anchor="end" font-size="' + T.assumpSize*S +
            '" fill="' + C.muted + '">×</text>');
        }
        ty += T.assumpLh*S;
      });
    }
    if(dimmed) s.push('</g>');
  }
  function drawEdges(node){
    const x1 = nx(node) + T.cardW*S, y1 = nyTop(node) + node._h/2;
    for(const k of node._kids){
      const x2 = nx(k), y2 = nyTop(k) + k._h/2;
      const mx = (x1 + x2) / 2;
      const dim = projection.ost.dimmed.has(k);
      s.push('<path d="M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2 +
        '" fill="none" stroke="' + C.border + '" stroke-width="' + T.edgeW*S + '"' +
        (dim ? ' opacity="' + T.dimOp + '"' : '') + '/>');
      drawEdges(k);
    }
  }
  for(const o of model.outcomes){
    drawEdges(o);
    (function drawAll(n){ drawCard(n); n._kids.forEach(drawAll); })(o);
  }
  if(diff && diff.dropped.length){
    let dy = headerH + cursorY + 14*S;
    s.push('<text x="' + T.pad*S + '" y="' + dy + '" font-size="' + 10*S +
      '" font-weight="600" letter-spacing="1" fill="' + C.muted + '">DROPPED SINCE ' +
      esc(diff.since.toUpperCase()) + '</text>');
    for(const label of diff.dropped){
      dy += 15*S;
      s.push('<text x="' + T.pad*S + '" y="' + dy + '" font-size="' + 11*S +
        '" fill="' + C.muted + '" text-decoration="line-through">' + esc(label) + '</text>');
    }
  }
  s.push('</svg>');
  for(const o of model.outcomes){
    (function clean(n){
      delete n._y; delete n._h; delete n._depth; delete n._lines;
      const kids = n._kids; delete n._kids; delete n._assumps;
      kids.forEach(clean);
    })(o);
  }
  return s.join('');
}
