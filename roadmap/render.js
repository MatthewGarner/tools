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
  colHeadSize: 11, colHeadTracking: 1.2, colHeadTextY: 14, colHeadRuleY: 21,
  wipSize: 10.5,
  laneSize: 12, laneTextY: 20, laneLh: 15, laneSepInset: 4, laneMinH: 34, laneBottomPad: 18,
  cardPadX: 12, cardPadY: 10, cardGap: 8, cardRadius: 6, stackTop: 6,
  cardTitleSize: 13, cardTitleLh: 17, titleBaseline: 12,
  noteSize: 11.5, noteLh: 15, noteRaise: 2,
  badgeSize: 9.5, badgeTracking: 0.8, badgeAdvance: 15, badgeH: 17,
  statusSize: 10.5, statusH: 19, statusDotR: 4, statusDotDx: 4, statusDotDy: 1,
  statusTextDx: 13, statusTextDy: 5, statusTracking: 0.3,
  legendH: 30, legendHEmpty: 8, legendY: 20, legendKeyGap: 22, legendMarkW: 13,
  legendNewW: 32, legendSize: 11,
  droppedSize: 11, droppedRowH: 16, droppedHeadH: 20, droppedIndent: 8, droppedYOffset: 4,
  fadeMax: 0.35,
  slideScale: 1.35,
  bottomPad: 12,
};

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
  return out;
}

function esc(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;');
}

export function render(model, ctx){
  const {colors: C, measure, diff = null, slide = false} = ctx;
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
  const laneTops = [];
  let y = headerH + colHeadH;
  for(const lane of model.lanes){
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
    const dLabel = diff ? d + ' · changes since ' + diff.since : d;
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
    s.push('<line x1="' + colX(h) + '" y1="' + (headerH + T.colHeadRuleY*S) + '" x2="' + (colX(h) + colW) +
      '" y2="' + (headerH + T.colHeadRuleY*S) + '" stroke="' + C.border + '" stroke-width="1"/>');
  }

  /* lanes */
  model.lanes.forEach((lane, li) => {
    const top = laneTops[li];
    if(li > 0){
      s.push('<line x1="' + PAD + '" y1="' + (top - T.laneSepInset*S) + '" x2="' + (W - PAD) + '" y2="' + (top - T.laneSepInset*S) +
        '" stroke="' + C.border + '" stroke-width="1" stroke-dasharray="2 4"/>');
    }
    if(lane){
      const laneLines = wrapText(lane, '600 ' + T.laneSize*S + 'px ' + F.body, LANE_W - 22*S, measure);
      laneLines.forEach((l, i) => {
        s.push('<text x="' + PAD + '" y="' + (top + T.laneTextY*S + i*T.laneLh*S) +
          '" font-size="' + T.laneSize*S + '" font-weight="600" fill="' + C.muted + '">' + esc(l) + '</text>');
      });
    }
    for(let h = 0; h < nH; h++){
      /* confidence fade: certainty decreases toward the horizon */
      const fadeOp = (model.fade && nH > 1) ? (1 - (h / (nH - 1)) * T.fadeMax) : 1;
      let cy = top + T.stackTop*S;
      for(const c of cells[lane][h]){
        const x = colX(h);
        s.push('<g data-line="' + c.it.srcLine + '" opacity="' + fadeOp.toFixed(2) + '">');
        s.push('<rect x="' + x + '" y="' + cy + '" width="' + colW + '" height="' + c.cardH +
          '" rx="' + T.cardRadius + '" fill="' + C.card + '" stroke="' + C.border + '" stroke-width="1"/>');
        let ty = cy + cardPadY + T.titleBaseline*S;
        if(c.badge){
          const bcol = c.badge.kind === 'new' ? C.accent : C.muted;
          s.push('<text x="' + (x + cardPadX) + '" y="' + (ty - T.noteRaise*S) + '" font-size="' + T.badgeSize*S +
            '" font-weight="700" letter-spacing="' + T.badgeTracking + '" fill="' + bcol + '">' +
            esc(c.badge.label.toUpperCase()) + '</text>');
          ty += T.badgeAdvance*S;
        }
        for(const line of c.lines){
          s.push('<text x="' + (x + cardPadX) + '" y="' + ty + '" font-size="' + fsTitle +
            '" font-weight="600" fill="' + C.ink + '">' + esc(line) + '</text>');
          ty += lhTitle;
        }
        for(const line of c.noteLines){
          s.push('<text x="' + (x + cardPadX) + '" y="' + (ty - T.noteRaise*S) + '" font-size="' + fsNote +
            '" fill="' + C.muted + '">' + esc(line) + '</text>');
          ty += lhNote;
        }
        if(c.it.status){
          const col = C.status[c.it.status];
          s.push('<circle cx="' + (x + cardPadX + T.statusDotDx*S) + '" cy="' + (ty + T.statusDotDy*S) + '" r="' + T.statusDotR*S + '" fill="' + col + '"/>');
          s.push('<text x="' + (x + cardPadX + T.statusTextDx*S) + '" y="' + (ty + T.statusTextDy*S) +
            '" font-size="' + T.statusSize*S + '" font-weight="600" letter-spacing="' + T.statusTracking + '" fill="' + col + '">' +
            esc(STATUS_LABEL[c.it.status].toUpperCase()) + '</text>');
        }
        s.push('</g>');
        cy += c.cardH + cardGap;
      }
    }
  });

  /* dropped-items strip (diff mode) */
  if(dropped.length){
    const dy = y + legendH + T.droppedYOffset*S;
    s.push('<text x="' + PAD + '" y="' + dy + '" font-size="' + T.droppedSize*S +
      '" font-weight="600" fill="' + C.err + '">Dropped since ' + esc(diff.since) + ':</text>');
    dropped.forEach((d, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      s.push('<text x="' + (PAD + T.droppedIndent*S + col*((W - PAD*2)/2)) + '" y="' + (dy + (16 + row*T.droppedRowH)*S) +
        '" font-size="' + T.droppedSize*S + '" fill="' + C.muted + '">– ' + esc(d) + '</text>');
    });
  }

  /* legend */
  if(usedStatuses.length || (diff && diff.any)){
    let lx = PAD;
    const ly = y + T.legendY*S;
    const key = (mark, label, markW) => {
      s.push(mark(lx, ly));
      s.push('<text x="' + (lx + markW) + '" y="' + ly + '" font-size="' + T.legendSize*S + '" fill="' + C.muted + '">' +
        esc(label) + '</text>');
      lx += markW + measure(label, T.legendSize*S + 'px ' + F.body) + T.legendKeyGap*S;
    };
    for(const st of ['done','doing','risk','blocked']){
      if(!usedStatuses.includes(st)) continue;
      key((x, yy) => '<circle cx="' + (x + T.statusDotDx*S) + '" cy="' + (yy - T.statusDotR*S) + '" r="' + T.statusDotR*S + '" fill="' +
        C.status[st] + '"/>', STATUS_LABEL[st], T.legendMarkW*S);
    }
    if(diff && diff.any){
      key((x, yy) => '<text x="' + x + '" y="' + yy + '" font-size="' + T.badgeSize*S +
        '" font-weight="700" fill="' + C.accent + '">NEW</text>', '= added since ' + diff.since, T.legendNewW*S);
    }
  }
  s.push('</svg>');
  return s.join('');
}
