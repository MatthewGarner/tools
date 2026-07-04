/* (model, ctx) → SVG string. ctx = {colors, measure, diff?, slide?}. No DOM. */
import {STATUS_LABEL} from './parse.js';

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
  legendH: 34, legendHEmpty: 8, legendY: 22, legendKeyGap: 12,
  droppedSize: 11, droppedRowH: 16, droppedHeadH: 20, droppedIndent: 8, droppedYOffset: 6,
  droppedHeadSize: 10, droppedHeadTracking: 1.2,
  fadeMax: 0.35,
  slideScale: 1.35,
  bottomPad: 14,
};

/* status/badge tints: 6-digit hex gets a 12% alpha fill; anything else falls back to stroke-only */
function tint(hex){
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + '1F' : 'none';
}

/* Palette schemes are shared series-wide. Re-exported for existing importers. */
export {PALETTES, scheme} from '../assets/series.js';
import {PALETTES, scheme} from '../assets/series.js';

function wrapText(text, font, maxW, measure){
  const words = text.split(/\s+/);
  const out = [];
  let cur = '';
  for(const w of words){
    const trial = cur ? cur + ' ' + w : w;
    if(measure(trial, font) <= maxW || !cur) cur = trial;
    else { out.push(cur); cur = w; }
  }
  if(cur) out.push(cur);
  /* widow control: no single-word last lines when rebalancing fits */
  if(out.length > 1){
    const last = out[out.length - 1], prev = out[out.length - 2];
    if(!last.includes(' ') && prev.includes(' ')){
      const prevWords = prev.split(' ');
      const pulled = prevWords.pop();
      if(measure(pulled + ' ' + last, font) <= maxW){
        out[out.length - 2] = prevWords.join(' ');
        out[out.length - 1] = pulled + ' ' + last;
      }
    }
  }
  return out;
}

function esc(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;');
}

export function render(model, ctx){
  const {measure, diff = null, slide = false, dark = false} = ctx;
  const paletteHex = model.accent ||
    (PALETTES[model.palette] ? PALETTES[model.palette][dark ? 'dark' : 'light'] : null);
  const C = paletteHex ? {...ctx.colors, ...scheme(paletteHex, dark)} : ctx.colors;
  const T = TOKENS;
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
  const innerW = colW - cardPadX*2;

  /* pre-lay every card */
  const cells = {};   // lane -> [per horizon: array of {it,lines,noteLines,badge,cardH}]
  for(const lane of model.lanes) cells[lane] = model.horizons.map(() => []);
  for(const it of model.items){
    const badge = diff ? diff.badge(it) : null;    // {kind:'new'|'moved', label}
    const lines = wrapText(it.title, titleFont, innerW, measure);
    const noteLines = it.note ? wrapText(it.note, noteFont, innerW, measure) : [];
    const h = cardPadY*2 + lines.length*lhTitle + noteLines.length*lhNote +
      (it.status ? T.statusH*S : 0) + (badge ? T.badgeH*S : 0);
    cells[it.lane][it.h].push({it, lines, noteLines, badge, cardH: h});
  }

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
  let y = headerH + colHeadH;
  for(const lane of model.lanes){
    if(groupAtLane.has(lane)) y += bandH;
    let maxH = 0;
    for(let h = 0; h < nH; h++){
      const stack = cells[lane][h];
      const sH = stack.reduce((a, c) => a + c.cardH, 0) + Math.max(0, stack.length-1)*cardGap;
      if(sH > maxH) maxH = sH;
    }
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
  const capsule = (px, py, label, col) => {
    const font = '600 ' + T.pillSize*S + 'px ' + F.body;
    const tw = measure(label, font) + label.length * T.pillTracking;
    const pw = tw + T.pillPadX*2*S, ph = T.pillH*S;
    return {
      svg: '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph +
        '" rx="' + ph/2 + '" fill="' + tint(col) + '"' +
        (tint(col) === 'none' ? ' stroke="' + col + '" stroke-width="1"' : '') + '/>' +
        '<text x="' + (px + T.pillPadX*S) + '" y="' + (py + ph - 5.5*S) + '" font-size="' + T.pillSize*S +
        '" font-weight="600" letter-spacing="' + T.pillTracking + '" fill="' + col + '">' + esc(label) + '</text>',
      w: pw,
    };
  };

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
    for(let h = 0; h < nH; h++){
      /* drop-zone hit rect under the cards (full cell band, transparent) */
      const laneH = (laneTops[li + 1] !== undefined ? laneTops[li + 1] : y) - top;
      s.push('<rect data-cell="' + h + '|' + esc(lane) + '" x="' + colX(h) + '" y="' + top +
        '" width="' + colW + '" height="' + laneH + '" fill="transparent"/>');
      /* confidence fade: certainty decreases toward the horizon */
      const fadeOp = (model.fade && nH > 1) ? (1 - (h / (nH - 1)) * T.fadeMax) : 1;
      let cy = top + T.stackTop*S;
      for(const c of cells[lane][h]){
        const x = colX(h);
        s.push('<g data-line="' + c.it.srcLine + '" opacity="' + fadeOp.toFixed(2) + '">');
        s.push('<rect x="' + x + '" y="' + cy + '" width="' + colW + '" height="' + c.cardH +
          '" rx="' + T.cardRadius + '" fill="' + (c.it.ghost ? 'none' : C.card) +
          '" stroke="' + C.border + '" stroke-width="1"' +
          (c.it.ghost ? ' stroke-dasharray="3 3"' : '') + '/>');
        /* top-anchored cursor: each block advances by its budgeted height */
        let cursor = cy + cardPadY;
        if(c.badge){
          const bcol = c.badge.kind === 'new' ? C.accent :
                       c.badge.kind === 'alert' ? C.err : C.muted;
          s.push(capsule(x + cardPadX, cursor, c.badge.label.toUpperCase(), bcol).svg);
          cursor += T.badgeH*S;
        }
        if(c.it.url) s.push('<a href="' + esc(c.it.url) + '" target="_blank" rel="noopener">');
        c.lines.forEach((line, li2) => {
          const lastLine = li2 === c.lines.length - 1;
          s.push('<text x="' + (x + cardPadX) + '" y="' + (cursor + T.titleBaseline*S) + '" font-size="' + fsTitle +
            '" font-weight="' + (c.it.ghost ? '400" font-style="italic' : '600') +
            '" fill="' + (c.it.ghost ? C.muted : C.ink) + '">' + esc(line) +
            (c.it.url && lastLine ? ' <tspan font-size="' + 9*S + '" font-weight="600" fill="' + C.accent + '">↗</tspan>' : '') +
            '</text>');
          cursor += lhTitle;
        });
        if(c.it.url) s.push('</a>');
        for(const line of c.noteLines){
          s.push('<text x="' + (x + cardPadX) + '" y="' + (cursor + (T.titleBaseline - T.noteRaise)*S) + '" font-size="' + fsNote +
            '" fill="' + C.muted + '">' + esc(line) + '</text>');
          cursor += lhNote;
        }
        if(c.it.status){
          s.push(capsule(x + cardPadX, cursor + T.pillTopGap*S,
            STATUS_LABEL[c.it.status].toUpperCase(), C.status[c.it.status]).svg);
        }
        s.push('</g>');
        cy += c.cardH + cardGap;
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
      const p = capsule(lx, capTop, STATUS_LABEL[st].toUpperCase(), C.status[st]);
      s.push(p.svg);
      lx += p.w + T.legendKeyGap*S;
    }
    if(diff && diff.any){
      const p = capsule(lx, capTop, 'NEW', C.accent);
      s.push(p.svg);
      lx += p.w + 6*S;
      s.push('<text x="' + lx + '" y="' + (y + T.legendY*S) + '" font-size="' + T.legendSize*S + '" fill="' + C.muted + '">' +
        esc('added since ' + diff.since) + '</text>');
    }
  }
  s.push('</svg>');
  return s.join('');
}
