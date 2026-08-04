/* /map renderer: (model, resolved, readout, ctx) → SVG string. Pure. */
import {PALETTES, scheme, mix} from '../assets/series.js';
import {esc, wrapText, editTarget, btnAttrs} from '../assets/svg.js';
import {paintOrder, labelAnchors} from './zones.js';
import {svgMetrics, svgVerdict} from '../assets/verdict-svg.js';
import {layoutPlaced, measuredLines, sourceItems} from './layout.js';
export {nudge} from './layout.js';

const F = {
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: '"Helvetica Neue", Helvetica, "Segoe UI", Roboto, sans-serif',
};

export const TOKENS = {
  pad: 26, titleSize: 22, titleY: 36, dateSize: 11, headerH: 70, headerHNoTitle: 18,
  /* axisTracking is ABSOLUTE px (10px × .18em = 1.8): SVG letter-spacing takes
     a length, and an exported file has no CSS to apply em tracking for it. */
  planeW: 620, planeH: 470, axisW: 46, axisH: 42, axisSize: 10, axisTracking: 1.8, endSize: 9.5,
  zoneSize: 10, zoneTracking: 0.8, zoneTint: 0.07, zoneTintDark: 0.13,
  dotR: 3.5, cardH: 20, cardPadX: 8, cardSize: 11, cardGapX: 7, cardMaxW: 190,
  trayW: 200, trayGap: 18, trayCardH: 26, trayHeadSize: 9.5,
  roGap: 24, roColW: 300, roColGap: 26, verdictSize: 24,
  roZoneSize: 10.5, roItemSize: 11, roItemLh: 16, roMetaSize: 9.5,
  roAdviceSize: 10, roAdviceLh: 13, roCap: 6, blockGap: 16,
  slideScale: 1.35, bottomPad: 18,
};

export function render(model, resolved, ro, ctx, diff = null){
  const {measure, slide = false, dark = false} = ctx;
  const paletteHex = model.accent ||
    (PALETTES[model.palette] ? PALETTES[model.palette][dark ? 'dark' : 'light'] : null);
  const C = paletteHex ? {...ctx.colors, ...scheme(paletteHex, dark)} : ctx.colors;
  const T = TOKENS;
  const S = slide ? T.slideScale : 1;
  const toneHex = tone => ({bad: C.status.blocked, warn: C.status.risk,
    good: C.status.done, accent: C.accent})[tone] || null;

  const edit = !!ctx.edit;   // preview-only affordances; exports and goldens render without
  /* poster-embed: drop the chrome the poster frame owns — its own title, date and
     hero verdict — but keep the zone columns, which are content, not chrome. */
  const showTitle = !!model.title;
  const flaggedLines = new Set(ro.flagged.map(f => f.item.srcLine));
  const hasTray = ro.unplaced.length > 0;
  const titleFont = '700 ' + T.titleSize * S + 'px ' + F.serif;
  const titleLines = showTitle ? measuredLines(model.title, titleFont, T.planeW * S, measure) : [];

  /* ---- geometry ---- */
  const headerH = showTitle ? (T.headerH + Math.max(0, titleLines.length - 1) * 25) * S : T.headerHNoTitle * S;
  const planeX = (T.pad + T.axisW) * S, planeY = headerH;
  const planeW = T.planeW * S, planeH = T.planeH * S;
  const narrow = !!ctx.width && ctx.width < 520;
  const px = x => planeX + x / 100 * planeW;
  const py = y => planeY + (1 - y / 100) * planeH;

  /* ---- plane surface + zones ---- */
  const body = [];
  body.push('<rect data-plane="1" x="' + planeX + '" y="' + planeY + '" width="' + planeW +
    '" height="' + planeH + '" fill="' + C.card + '" stroke="' + C.border + '"/>');
  for(const {zone, pts} of paintOrder(resolved)){
    const hex = toneHex(zone.tone);
    if(!hex) continue;
    const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + px(x).toFixed(1) + ' ' + py(y).toFixed(1)).join('') + 'Z';
    body.push('<path d="' + d + '" fill="' + mix(C.card, hex, dark ? T.zoneTintDark : T.zoneTint) + '"/>');
  }
  if(resolved.grid){
    const {cols, rows} = resolved.grid;
    for(let c = 1; c < cols; c++)
      body.push('<line x1="' + px(c * 100 / cols) + '" y1="' + planeY + '" x2="' + px(c * 100 / cols) +
        '" y2="' + (planeY + planeH) + '" stroke="' + C.border + '" stroke-width="1" opacity="0.6"/>');
    for(let r = 1; r < rows; r++)
      body.push('<line x1="' + planeX + '" y1="' + py(r * 100 / rows) + '" x2="' + (planeX + planeW) +
        '" y2="' + py(r * 100 / rows) + '" stroke="' + C.border + '" stroke-width="1" opacity="0.6"/>');
  }
  /* zone labels — also collected as fixed obstacles for the card nudge */
  const anchors = labelAnchors(resolved);
  const zoneLabelBoxes = [];
  const zoneFont = '600 ' + T.zoneSize * S + 'px ' + F.body;
  for(const z of resolved.zones){
    if(z.kind === 'unzoned' || z.anonymous) continue;
    const a = anchors.get(z.id);
    if(!a) continue;
    const editable = z.kind === 'cell' || (z.kind === 'rule' && z.srcLine != null);
    const zcx = px(a[0]), zcy = py(a[1]);
    const lw = measure(z.name.toUpperCase(), zoneFont) + z.name.length * T.zoneTracking;
    const zg = model.preset === 'futures' ? 12 * S : 0;
    zoneLabelBoxes.push({x: zcx - lw / 2 - zg, y: zcy - T.zoneSize * S - zg,
      w: lw + zg * 2, h: T.zoneSize * S + 4 * S + zg * 2, fixed: true});
    const zoneText = '<text x="' + zcx + '" y="' + zcy + '" text-anchor="middle"' +
      ' font-size="' + T.zoneSize * S + '" font-weight="600" letter-spacing="' + T.zoneTracking +
      '" fill="' + (toneHex(z.tone) || C.muted) + '">' + esc(z.name.toUpperCase()) + '</text>';
    if(editable){
      /* plane-level widen: >=44px hit box centred on the label, no data-hit
         (only cardmenu cards get the WIDENED-gate marker) */
      const zoneAttr = z.kind === 'cell' ? 'c:' + z.col + ',' + z.row : 'r:' + esc(z.name);
      body.push(editTarget(zoneText, {x: Math.max(0, zcx - 22 * S), y: zcy - 22 * S, w: 44 * S, h: 44 * S, bg: C.bg},
        {kind: 'zonename', line: z.srcLine ?? -1, raw: z.name, extra: 'data-zone="' + zoneAttr + '"',
          label: 'Rename zone: ' + z.name}));
    } else {
      body.push(zoneText);
    }
  }

  /* ---- axes ---- */
  const ax = resolved.x, ay = resolved.y;
  /* plane-level widens: >=44px hit box centred on each label; the y-axis label
     sits close to the left edge so its box is clamped from running past x=0 */
  /* Swiss 6c: the axis names are uppercase micro, LITERALLY uppercased and with
     absolute letterspacing — a CSS text-transform would vanish the moment the
     SVG left the page. `data-raw` still carries the author's own casing, so the
     edit-in-place rewrite never re-cases their text. */
  const axFont = ' font-size="' + T.axisSize * S + '" letter-spacing="' + (T.axisTracking * S).toFixed(2) +
    '" font-weight="500" fill="' + C.muted + '"';
  const axCx = planeX + planeW / 2, axCy = planeY + planeH + 26 * S;
  body.push(editTarget(
    '<text x="' + axCx + '" y="' + axCy + '" text-anchor="middle"' + axFont + '>' +
      esc(ax.label.toUpperCase()) + '</text>',
    {x: Math.max(0, axCx - 22 * S), y: axCy - 22 * S, w: 44 * S, h: 44 * S, bg: C.bg},
    {kind: 'axis', line: ax.srcLine ?? -1, raw: ax.label, extra: 'data-axis="x"',
      label: 'Edit x-axis label: ' + ax.label}));
  const ayCx = planeX - 26 * S, ayCy = planeY + planeH / 2;
  body.push(editTarget(
    '<text x="' + ayCx + '" y="' + ayCy + '" text-anchor="middle"' + axFont +
      ' transform="rotate(-90 ' + ayCx + ' ' + ayCy + ')">' +
      esc(ay.label.toUpperCase()) + '</text>',
    {x: Math.max(0, ayCx - 22 * S), y: ayCy - 22 * S, w: 44 * S, h: 44 * S, bg: C.bg},
    {kind: 'axis', line: ay.srcLine ?? -1, raw: ay.label, extra: 'data-axis="y"',
      label: 'Edit y-axis label: ' + ay.label}));
  if(ax.low){
    body.push('<text x="' + planeX + '" y="' + (planeY + planeH + 12 * S) + '" font-size="' +
      T.endSize * S + '" fill="' + C.muted + '">' + esc(ax.low) + '</text>');
    body.push('<text x="' + (planeX + planeW) + '" y="' + (planeY + planeH + 12 * S) +
      '" text-anchor="end" font-size="' + T.endSize * S + '" fill="' + C.muted + '">' + esc(ax.high) + '</text>');
  }
  if(ay.low){
    body.push('<text x="' + (planeX - 8 * S) + '" y="' + (planeY + planeH - 2 * S) +
      '" text-anchor="end" font-size="' + T.endSize * S + '" fill="' + C.muted + '">' + esc(ay.low) + '</text>');
    body.push('<text x="' + (planeX - 8 * S) + '" y="' + (planeY + 8 * S) +
      '" text-anchor="end" font-size="' + T.endSize * S + '" fill="' + C.muted + '">' + esc(ay.high) + '</text>');
  }

  /* ---- drift ghosts (snapshot compare): old position, dashed trail ---- */
  if(diff){
    for(const g of diff.ghosts){
      const gx = px(g.from[0]), gy = py(g.from[1]);
      const tx = px(g.to[0]), ty = py(g.to[1]);
      body.push('<line x1="' + gx.toFixed(1) + '" y1="' + gy.toFixed(1) + '" x2="' + tx.toFixed(1) +
        '" y2="' + ty.toFixed(1) + '" stroke="' + C.muted + '" stroke-width="1" stroke-dasharray="3 4" opacity="0.7"/>');
      body.push('<circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="' + T.dotR * S +
        '" fill="none" stroke="' + C.muted + '" stroke-width="1.25" stroke-dasharray="2 2"/>');
    }
  }

  /* ---- items: diamond marker at the authored position, bare label beside it ----
     Swiss 6c (Claude Design 34): the label lost its white boxed chip — a box
     inside the artefact read as UI chrome, and the export carried it. The
     nudge/hit-box geometry is unchanged (the label still sits one card-padding
     in from the box's left edge, which is what the 44px hit rect and the suites
     tap), so only the paint changed. A flagged item can't rely on a missing
     border any more, so it carries an ink-weight rule under the label AND the
     err hue — shape first, colour second. */
  const marker = (cx, cy, fill) => {
    const r = T.dotR * S * 1.15;
    return '<rect x="' + (cx - r).toFixed(2) + '" y="' + (cy - r).toFixed(2) +
      '" width="' + (r * 2).toFixed(2) + '" height="' + (r * 2).toFixed(2) +
      '" fill="' + fill + '" transform="rotate(45 ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ')"/>';
  };
  const font = '700 ' + T.cardSize * S + 'px ' + F.body;
  const truncate = (label, maxW = T.cardMaxW) => {
    let t = label;
    while(t.length > 4 && measure(t + '…', font) > maxW * S) t = t.slice(0, -1);
    return t === label ? label : t + '…';
  };
  /* the ghost "+ Add item" row: plane-level widen, 44x44 hit box centred on
     the (visible dashed box + label), same editTarget treatment as axis/zonename */
  const additemGhost = (x, y, w, h, fill) => {
    const inner = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" rx="0" fill="' + fill + '" stroke="' + C.border + '" stroke-dasharray="2 3"/>' +
      '<text x="' + (x + T.cardPadX * S) + '" y="' + (y + h - 6 * S) + '" font-size="' + T.cardSize * S +
      '" fill="' + C.muted + '">＋ Add item</text>';
    const cx = x + w / 2, cy = y + h / 2;
    return editTarget(inner, {x: cx - 22 * S, y: cy - 22 * S, w: 44 * S, h: 44 * S, bg: C.bg},
      {kind: 'additem', line: -1, raw: '', label: 'Add item'});
  };
  if(!hasTray){
    const aw = measure('＋ Add item', font) + T.cardPadX * 2 * S;
    zoneLabelBoxes.push({x: planeX + planeW - aw - 8 * S, y: planeY + 8 * S,
      w: aw, h: T.cardH * S + 4 * S, fixed: true});
  }
  const records = sourceItems(model, ro);
  const mapLayout = layoutPlaced(records, {planeX, planeY, planeW, planeH, scale: S,
    measure, font, maxLabelW: T.cardMaxW, zoneObstacles: zoneLabelBoxes});
  const cards = mapLayout.records;
  const keyW = 320 * S, keyGap = T.trayGap * S;
  const keyBeside = mapLayout.mode === 'keyed' && !narrow;
  const keyX = planeX + planeW + keyGap;
  const trayX = planeX + planeW + keyGap + (keyBeside ? keyW + keyGap : 0);
  const W = Math.round(hasTray ? trayX + T.trayW * S + T.pad * S :
    (keyBeside ? keyX + keyW + T.pad * S : planeX + planeW + T.pad * S));
  let keyBottom = 0;
  if(mapLayout.mode === 'direct') for(const c of cards){
    const flagged = c.flagged;
    body.push('<g data-edit="cardmenu" data-line="' + c.it.srcLine + '" data-display-id="' + c.id + '" data-geometry="' +
      [c.cx, c.cy, c.x, c.y, c.w, c.h].map(v => Number(v).toFixed(2)).join(',') + '"' +
      btnAttrs('More options: ' + c.it.label) + (edit ? ' data-menu=""' : '') + '>');
    /* invisible hit rect covers the capsule AND its adjacent × control, centred on the capsule centre
       (not the dot — after nudge the capsule can sit well away from the
       authored dot). nudge() only separates the visible 20px capsules, never
       these 44px boxes, so cap each rect's HEIGHT to its nearest x-overlapping
       neighbour: half-height = min(22*S, gap/2) so adjacent boxes meet but
       never overlap, floored at the visible card's own half-height (h/2) so
       the tap target is never smaller than the card. A genuinely crowded pair
       whose capsule-height boxes still touch is a documented limit. First
       child so it paints under the visible capsule + label. */
    const capMidY = c.y + c.h / 2;
    let crowdedHit = false;
    for(const o of cards){
      if(o === c || o.x + o.w <= c.x || o.x >= c.x + c.w) continue;   // no x-overlap
      const gap = Math.abs((o.y + o.h / 2) - capMidY);
      if(gap < 44 * S) crowdedHit = true;
    }
    const halfH = crowdedHit ? c.h / 2 : 22 * S;
    body.push('<rect data-hit="" x="' + c.x + '" y="' + (capMidY - halfH) + '" width="' + (c.w + 16 * S) +
      '" height="' + (halfH * 2) + '" fill="' + C.card + '" fill-opacity="0"/>');
    const capX = c.x + c.w / 2, capY = c.y + c.h / 2;
    if(Math.hypot(capX - c.cx, capY - c.cy) > 26 * S)
      body.push('<line x1="' + c.cx + '" y1="' + c.cy + '" x2="' + capX + '" y2="' + capY +
        '" stroke="' + C.border + '" stroke-width="1"/>');
    body.push(marker(c.cx, c.cy, flagged ? C.err : C.accent));
    if(diff && diff.newLabels.has(String(c.it.label).toLowerCase().replace(/\s+/g, ' ').trim())){
      body.push('<circle cx="' + c.cx + '" cy="' + c.cy + '" r="' + (T.dotR + 3.5) * S +
        '" fill="none" stroke="' + C.accent + '" stroke-width="1.25"/>');
      body.push('<text x="' + (c.cx + (T.dotR + 6) * S) + '" y="' + (c.cy - (T.dotR + 3) * S) +
        '" font-size="' + 8.5 * S + '" font-weight="600" letter-spacing="0.6" fill="' + C.accent + '">NEW</text>');
    }
    const labX = c.x + T.cardPadX * S;
    const labBase = c.lines.length === 1 ? c.y + c.h - 6 * S : c.y + T.cardSize * S + 4 * S;
    body.push('<text data-edit="label" data-line="' + c.it.srcLine + '" data-raw="' + esc(c.it.label) +
      '" x="' + labX + '" y="' + labBase + '" font-size="' + T.cardSize * S +
      '" font-weight="700" fill="' + (flagged ? C.err : C.ink) + '"' + btnAttrs('Rename: ' + c.it.label) +
      '>' + esc(c.lines[0]) + '</text>');
    c.lines.slice(1).forEach((line, i) => body.push('<text x="' + labX + '" y="' +
      (labBase + (i + 1) * 13 * S) + '" font-size="' + T.cardSize * S + '" font-weight="700" fill="' +
      (flagged ? C.err : C.ink) + '">' + esc(line) + '</text>'));
    if(flagged) for(let i = 0; i < c.lines.length; i++)
      body.push('<rect x="' + labX + '" y="' + (labBase + i * 13 * S + 3 * S).toFixed(2) + '" width="' +
        measure(c.lines[i], font).toFixed(2) + '" height="' + (2 * S).toFixed(2) + '" fill="' + C.err + '"/>');
    if(edit) body.push('<text data-edit="removeitem" data-line="' + c.it.srcLine + '" data-raw=""' +
      ' x="' + Math.min(planeX + planeW - 4 * S, c.x + c.w + 12 * S) + '" y="' + (c.y + c.h / 2 + 4 * S) + '" text-anchor="end"' +
      ' font-size="' + T.cardSize * S + '" fill="' + C.muted + '"' + btnAttrs('Remove ' + c.it.label) +
      '>×</text>');
    body.push('</g>');
  } else {
    for(const c of cards){
      const tone = c.flagged ? C.err : C.accent;
      body.push('<g data-edit="cardmenu" data-line="' + c.it.srcLine + '" data-display-id="' + c.id + '" data-geometry="' +
        [c.cx, c.cy].map(v => Number(v).toFixed(2)).join(',') + '"' + btnAttrs('More options: ' + c.it.label) +
        (edit ? ' data-menu=""' : '') + '>');
      body.push('<rect data-hit="" x="' + (c.cx - 22 * S) + '" y="' + (c.cy - 22 * S) + '" width="' + (44 * S) + '" height="' + (44 * S) + '" fill="' + C.card + '" fill-opacity="0"/>');
      body.push(marker(c.cx, c.cy, tone));
      body.push('<rect x="' + (c.cx + 7 * S) + '" y="' + (c.cy - 9 * S) + '" width="' + (30 * S) + '" height="' + (18 * S) +
        '" fill="' + C.card + '" stroke="' + tone + '"/>');
      body.push('<text x="' + (c.cx + 22 * S) + '" y="' + (c.cy + 3.5 * S) + '" text-anchor="middle" font-size="' +
        (8 * S) + '" font-weight="700" fill="' + C.ink + '">' + c.id + '</text></g>');
    }
    const kx = narrow ? planeX : keyX;
    const ky0 = narrow ? planeY + planeH + T.axisH * S + 14 * S : planeY;
    const kw = narrow ? planeW : keyW;
    const keyRows = cards.map(c => ({...c, keyLines: measuredLines(c.it.label, '700 ' + T.cardSize * S + 'px ' + F.body,
      kw - 74 * S, measure)}));
    const keyH = 34 * S + keyRows.reduce((sum, row) => sum + Math.max(34 * S, (row.keyLines.length * 13 + 18) * S), 0) + 10 * S;
    body.push('<rect data-map-key="" x="' + kx + '" y="' + ky0 + '" width="' + kw + '" height="' + keyH +
      '" fill="' + C.card + '" stroke="' + C.border + '"/>');
    body.push('<text x="' + (kx + 12 * S) + '" y="' + (ky0 + 21 * S) + '" font-size="' + (9.5 * S) +
      '" font-weight="700" letter-spacing="' + (0.8 * S) + '" fill="' + C.accentInk + '">FULL MAP KEY · SOURCE ORDER</text>');
    let ky = ky0 + 34 * S;
    for(const row of keyRows){
      const rh = Math.max(34 * S, (row.keyLines.length * 13 + 18) * S);
      body.push('<line x1="' + (kx + 10 * S) + '" y1="' + ky + '" x2="' + (kx + kw - 10 * S) + '" y2="' + ky + '" stroke="' + C.border + '"/>');
      body.push('<text x="' + (kx + 12 * S) + '" y="' + (ky + 18 * S) + '" font-size="' + (9 * S) + '" font-weight="700" fill="' +
        (row.flagged ? C.err : C.accentInk) + '">' + row.id + '</text>');
      const tx = kx + 54 * S;
      body.push('<text data-edit="label" data-line="' + row.it.srcLine + '" data-raw="' + esc(row.it.label) + '" x="' + tx + '" y="' +
        (ky + 17 * S) + '" font-size="' + (T.cardSize * S) + '" font-weight="700" fill="' + (row.flagged ? C.err : C.ink) + '"' +
        btnAttrs('Rename: ' + row.it.label) + '>' + esc(row.keyLines[0]) + '</text>');
      row.keyLines.slice(1).forEach((line, i) => body.push('<text x="' + tx + '" y="' + (ky + (30 + i * 13) * S) +
        '" font-size="' + (T.cardSize * S) + '" font-weight="700" fill="' + (row.flagged ? C.err : C.ink) + '">' + esc(line) + '</text>'));
      body.push('<text x="' + tx + '" y="' + (ky + rh - 5 * S) + '" font-size="' + (8.5 * S) + '" fill="' + C.muted + '">@ ' +
        row.it.x + ', ' + row.it.y + (row.flagged ? ' · FLAGGED' : '') + '</text>');
      ky += rh;
    }
    keyBottom = ky0 + keyH;
  }

  /* ---- tray ---- */
  let trayBottom = planeY;
  if(hasTray){
    body.push('<text x="' + trayX + '" y="' + (planeY + 12 * S) + '" font-size="' + T.trayHeadSize * S +
      '" font-weight="600" letter-spacing="0.8" fill="' + C.muted + '">UNPLACED — DRAG ONTO THE MAP</text>');
    let ty = planeY + 24 * S;
    for(const it of ro.unplaced){
      const lines = measuredLines(it.label, font, (T.trayW - T.cardPadX * 2) * S, measure);
      const w = T.trayW * S, rowH = Math.max(T.trayCardH * S, (lines.length * 13 + 8) * S);
      /* edit mode: the tray card is a cardmenu trigger too (Place on map… is
         the coarse-pointer placement path — drag needs a fine pointer). The
         hit rect caps at the row pitch so adjacent rows meet, never overlap.
         Exports/goldens (edit:false) keep the plain group. */
      body.push('<g data-line="' + it.srcLine + '" data-tray="1"' +
        (edit ? ' data-edit="cardmenu"' + btnAttrs('More options: ' + it.label) + ' data-menu=""' : '') + '>');
      if(edit){
        body.push('<rect data-hit="" x="' + trayX + '" y="' + ty +
          '" width="' + w + '" height="' + rowH + '" fill="' + C.card + '" fill-opacity="0"/>');
      }
      body.push('<rect x="' + trayX + '" y="' + ty + '" width="' + w + '" height="' + rowH +
        '" rx="0" fill="none" stroke="' + C.border + '" stroke-dasharray="4 3"/>');
      body.push('<text data-edit="label" data-line="' + it.srcLine + '" data-raw="' + esc(it.label) +
        '" x="' + (trayX + T.cardPadX * S) + '" y="' + (ty + 15 * S) +
        '" font-size="' + T.cardSize * S + '" fill="' + C.muted + '"' + btnAttrs('Rename: ' + it.label) +
        '>' + esc(lines[0]) + '</text>');
      lines.slice(1).forEach((line, i) => body.push('<text x="' + (trayX + T.cardPadX * S) + '" y="' +
        (ty + (28 + i * 13) * S) + '" font-size="' + T.cardSize * S + '" fill="' + C.muted + '">' + esc(line) + '</text>'));
      if(edit) body.push('<text data-edit="removeitem" data-line="' + it.srcLine + '" data-raw=""' +
        ' x="' + (trayX + w - T.cardPadX * S) + '" y="' + (ty + 15 * S) + '" text-anchor="end"' +
        ' font-size="' + T.cardSize * S + '" fill="' + C.muted + '"' + btnAttrs('Remove ' + it.label) +
        '>×</text>');
      body.push('</g>');
      ty += rowH;
    }
    if(edit){
      const aw = measure('＋ Add item', font) + T.cardPadX * 2 * S;
      body.push('<g data-add="1">' + additemGhost(trayX, ty, aw, T.cardH * S, 'none') + '</g>');
      ty += T.trayCardH * S;
    }
    trayBottom = ty;
  } else if(edit){
    /* no tray: the add ghost sits top-right inside the plane (a fixed nudge obstacle) */
    const aw = measure('＋ Add item', font) + T.cardPadX * 2 * S;
    const axg = planeX + planeW - aw - 8 * S, ayg = planeY + 8 * S;
    body.push('<g data-add="1">' + additemGhost(axg, ayg, aw, T.cardH * S, C.card) + '</g>');
  }

  /* ---- readout panel ---- */
  const roX = T.pad * S, roW = W - T.pad * 2 * S;
  let roY = Math.max(planeY + planeH + T.axisH * S, trayBottom, keyBottom) + T.roGap * S;
  /* the VERDICT block (Swiss 6b): kicker + wrapped display line carrying exactly
     one brand-marked figure. Its returned advance drives the readout's flow, so
     a long verdict pushes the zone columns down instead of colliding with them. */
  {
    const vb = svgVerdict({x: roX, y: roY + 8 * S, width: roW,
      line: ro.verdict, fig: ro.verdictFig, ink: C.ink, muted: C.muted,
      brandText: C.brandText || C.ink, font: F.serif, measure,
      size: T.verdictSize, scale: S, edit: edit ? {raw: model.verdict ?? ''} : undefined});
    body.push(vb.svg);
    roY += 8 * S + vb.height;
  }
  roY += 6 * S;
  if(diff){
    body.push('<text x="' + roX + '" y="' + (roY + 12 * S) + '" font-size="' + 12 * S +
      '" font-weight="600" fill="' + C.accent + '">' + esc(diff.sinceLine) + '</text>');
    roY += 18 * S;
    if(diff.dropped.length){
      body.push('<text x="' + roX + '" y="' + (roY + 10 * S) + '" font-size="' + 9.5 * S +
        '" font-weight="600" letter-spacing="1" fill="' + C.muted + '">DROPPED SINCE ' +
        esc(diff.since.toUpperCase()) + '</text>');
      roY += 14 * S;
      for(const label of diff.dropped){
        body.push('<text x="' + roX + '" y="' + (roY + 11 * S) + '" font-size="' + 11 * S +
          '" fill="' + C.muted + '" text-decoration="line-through">' + esc(label) + '</text>');
        roY += 14 * S;
      }
    }
    roY += 4 * S;
  }
  for(const f of ro.flagged){
    body.push('<text x="' + roX + '" y="' + (roY + T.roItemSize * S) + '" font-size="' + T.roItemSize * S +
      '" fill="' + C.err + '">⚠ ' + esc(f.item.label + ' — ' + f.msg) + '</text>');
    roY += T.roItemLh * S;
  }
  roY += (ro.flagged.length ? 10 : 0) * S;

  /* zone blocks packed into shortest column */
  const colW = T.roColW * S, colGap = T.roColGap * S;
  const nCols = Math.max(1, Math.floor((roW + colGap) / (colW + colGap)));
  const colY = Array(nCols).fill(roY);
  for(const e of ro.zones){
    if(!e.items.length && !e.advice) continue;
    const adviceLines = e.advice ? wrapText(e.advice, T.roAdviceSize * S + 'px ' + F.body, colW, measure) : [];
    const shown = e.items.slice(0, T.roCap);
    const more = e.items.length - shown.length;
    const col = colY.indexOf(Math.min(...colY));
    const bx = roX + col * (colW + colGap);
    let by = colY[col];
    const hex = toneHex(e.zone.tone) || C.muted;
    body.push('<text x="' + bx + '" y="' + (by + T.roZoneSize * S) + '" font-size="' + T.roZoneSize * S +
      '" font-weight="600" letter-spacing="0.8" fill="' + hex + '">' +
      esc(e.zone.name.toUpperCase()) + ' · ' + e.items.length + '</text>');
    by += 15 * S;
    for(const line of adviceLines){
      body.push('<text x="' + bx + '" y="' + (by + T.roAdviceSize * S) + '" font-size="' + T.roAdviceSize * S +
        '" fill="' + C.muted + '">' + esc(line) + '</text>');
      by += T.roAdviceLh * S;
    }
    by += 3 * S;
    for(const it of shown){
      body.push('<text x="' + bx + '" y="' + (by + T.roItemSize * S) + '" font-size="' + T.roItemSize * S +
        '" fill="' + C.ink + '">' + esc(truncate(it.label, T.roColW)) + '</text>');
      by += T.roItemLh * S;
      if(it.fields.length){
        const f = it.fields[0];
        body.push('<text data-edit="field" data-line="' + it.srcLine + '" data-key="' + esc(f.key) +
          '" data-raw="' + esc(f.val) + '" x="' + (bx + 10 * S) + '" y="' + (by + T.roMetaSize * S - 3 * S) +
          '" font-size="' + T.roMetaSize * S + '" fill="' + C.muted + '"' +
          btnAttrs('Edit ' + f.key + ': ' + f.val) + '>' +
          esc((f.key + ': ' + f.val).slice(0, 60)) + '</text>');
        by += (T.roMetaSize + 3) * S;
      }
    }
    if(more > 0){
      body.push('<text x="' + bx + '" y="' + (by + T.roItemSize * S) + '" font-size="' + T.roItemSize * S +
        '" fill="' + C.muted + '">+ ' + more + ' more</text>');
      by += T.roItemLh * S;
    }
    colY[col] = by + T.blockGap * S;
  }

  const H = Math.round(Math.max(...colY, roY) + T.bottomPad * S);

  /* ---- assemble ---- */
  const s = [];
  s.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + F.body + '\'>');
  s.push('<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>');
  if(showTitle) titleLines.forEach((line, i) =>
    s.push('<text data-title-line="' + (i + 1) + '" x="' + T.pad * S + '" y="' + (T.titleY + i * 25) * S + '" font-family=\'' + F.serif +
      '\' font-size="' + T.titleSize * S + '" font-weight="700" fill="' + C.ink + '">' + esc(line) + '</text>'));
  /* the metrics row opening the artefact — counts only (the 22px title line above
     already names the model; repeating it in caps one line down reads as a stutter) */
  if(showTitle && model.items.length)
    s.push(svgMetrics({x: T.pad * S, y: (T.titleY + 17 + Math.max(0, titleLines.length - 1) * 25) * S, model: '',
      counts: ro.counts || [], ink: C.ink, muted: C.muted, font: F.body, scale: S}));
  s.push('<text x="' + (W - T.pad * S) + '" y="' + (showTitle ? T.titleY : 14) * S +
    '" text-anchor="end" font-size="' + T.dateSize * S + '" fill="' + C.muted + '">' +
    new Date().toISOString().slice(0, 10) + '</text>');
  if(narrow) s.push('<rect data-narrow="" width="0" height="0" fill="none"/>');
  s.push(...body, '</svg>');
  return s.join('');
}
