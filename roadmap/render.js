/* (model, ctx) → SVG string. ctx = {colors, measure, diff?, slide?}. No DOM. */
import {STATUS_LABEL} from './parse.js';

const F = {
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Charter, Georgia, "Times New Roman", serif',
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
  const nH = model.horizons.length;
  const S = slide ? 1.35 : 1;
  const PAD = 26*S, LANE_W = model.lanes.some(l => l) ? 118*S : 0, GAP = 12*S;
  const colW = (nH <= 4 ? 236 : 200) * S;
  const W = Math.round(PAD*2 + LANE_W + nH*colW + (nH-1)*GAP);
  const cardPadX = 12*S, cardPadY = 10*S, cardGap = 8*S;
  const fsTitle = 13*S, fsNote = 11.5*S, lhTitle = 17*S, lhNote = 15*S;
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
      (it.status ? 19*S : 0) + (badge ? 17*S : 0);
    cells[it.lane][it.h].push({it, lines, noteLines, badge, cardH: h});
  }

  const headerH = (model.title ? 58 : 24)*S;
  const colHeadH = 30*S;
  const laneTops = [], laneHeights = [];
  let y = headerH + colHeadH;
  for(const lane of model.lanes){
    let maxH = 0;
    for(let h = 0; h < nH; h++){
      const stack = cells[lane][h];
      const sH = stack.reduce((a, c) => a + c.cardH, 0) + Math.max(0, stack.length-1)*cardGap;
      if(sH > maxH) maxH = sH;
    }
    laneTops.push(y);
    const lh = Math.max(maxH, 34*S) + 18*S;
    laneHeights.push(lh);
    y += lh;
  }
  const usedStatuses = [...new Set(model.items.map(i => i.status).filter(Boolean))];
  const dropped = diff ? diff.dropped : [];
  const legendH = (usedStatuses.length || (diff && (diff.any || dropped.length)) ? 30 : 8)*S;
  const droppedH = dropped.length ? (20 + 16*Math.ceil(dropped.length / 2))*S : 0;
  const H = y + legendH + droppedH + 12*S;

  const s = [];
  s.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Math.round(H) +
    '" viewBox="0 0 ' + W + ' ' + Math.round(H) + '" font-family=\'' + F.body + '\'>');
  s.push('<rect width="' + W + '" height="' + Math.round(H) + '" fill="' + C.bg + '"/>');

  /* title + date */
  if(model.title){
    s.push('<text x="' + PAD + '" y="' + 38*S + '" font-family=\'' + F.serif +
      '\' font-size="' + 22*S + '" font-weight="700" fill="' + C.ink + '">' + esc(model.title) + '</text>');
  }
  if(model.dateStr !== 'off'){
    const d = model.dateStr || new Date().toISOString().slice(0, 10);
    const dLabel = diff ? d + ' · changes since ' + diff.since : d;
    s.push('<text x="' + (W - PAD) + '" y="' + (model.title ? 38 : 16)*S +
      '" text-anchor="end" font-size="' + 11*S + '" fill="' + C.muted + '">' + esc(dLabel) + '</text>');
  }

  /* column headers, with a WIP flag on the first column */
  const colX = h => PAD + LANE_W + h*(colW + GAP);
  const firstColCount = model.items.filter(i => i.h === 0).length;
  const overWip = model.wip > 0 && firstColCount > model.wip;
  for(let h = 0; h < nH; h++){
    s.push('<text x="' + colX(h) + '" y="' + (headerH + 14*S) +
      '" font-size="' + 11*S + '" font-weight="600" letter-spacing="1.2" fill="' + C.muted + '">' +
      esc(model.horizons[h].toUpperCase()) + '</text>');
    if(h === 0 && overWip){
      s.push('<text x="' + (colX(0) + colW) + '" y="' + (headerH + 14*S) +
        '" text-anchor="end" font-size="' + 10.5*S + '" font-weight="600" fill="' + C.err + '">' +
        firstColCount + ' ITEMS</text>');
    }
    s.push('<line x1="' + colX(h) + '" y1="' + (headerH + 21*S) + '" x2="' + (colX(h) + colW) +
      '" y2="' + (headerH + 21*S) + '" stroke="' + C.border + '" stroke-width="1"/>');
  }

  /* lanes */
  model.lanes.forEach((lane, li) => {
    const top = laneTops[li];
    if(li > 0){
      s.push('<line x1="' + PAD + '" y1="' + (top - 4*S) + '" x2="' + (W - PAD) + '" y2="' + (top - 4*S) +
        '" stroke="' + C.border + '" stroke-width="1" stroke-dasharray="2 4"/>');
    }
    if(lane){
      const laneLines = wrapText(lane, '600 ' + 12*S + 'px ' + F.body, LANE_W - 22*S, measure);
      laneLines.forEach((l, i) => {
        s.push('<text x="' + PAD + '" y="' + (top + 20*S + i*15*S) +
          '" font-size="' + 12*S + '" font-weight="600" fill="' + C.muted + '">' + esc(l) + '</text>');
      });
    }
    for(let h = 0; h < nH; h++){
      /* confidence fade: certainty decreases toward the horizon */
      const fadeOp = (model.fade && nH > 1) ? (1 - (h / (nH - 1)) * 0.35) : 1;
      let cy = top + 6*S;
      for(const c of cells[lane][h]){
        const x = colX(h);
        s.push('<g data-line="' + c.it.srcLine + '" opacity="' + fadeOp.toFixed(2) + '">');
        s.push('<rect x="' + x + '" y="' + cy + '" width="' + colW + '" height="' + c.cardH +
          '" rx="6" fill="' + C.card + '" stroke="' + C.border + '" stroke-width="1"/>');
        let ty = cy + cardPadY + 12*S;
        if(c.badge){
          const bcol = c.badge.kind === 'new' ? C.accent : C.muted;
          s.push('<text x="' + (x + cardPadX) + '" y="' + (ty - 2*S) + '" font-size="' + 9.5*S +
            '" font-weight="700" letter-spacing="0.8" fill="' + bcol + '">' +
            esc(c.badge.label.toUpperCase()) + '</text>');
          ty += 15*S;
        }
        for(const line of c.lines){
          s.push('<text x="' + (x + cardPadX) + '" y="' + ty + '" font-size="' + fsTitle +
            '" font-weight="600" fill="' + C.ink + '">' + esc(line) + '</text>');
          ty += lhTitle;
        }
        for(const line of c.noteLines){
          s.push('<text x="' + (x + cardPadX) + '" y="' + (ty - 2*S) + '" font-size="' + fsNote +
            '" fill="' + C.muted + '">' + esc(line) + '</text>');
          ty += lhNote;
        }
        if(c.it.status){
          const col = C.status[c.it.status];
          s.push('<circle cx="' + (x + cardPadX + 4*S) + '" cy="' + (ty + 1*S) + '" r="' + 4*S + '" fill="' + col + '"/>');
          s.push('<text x="' + (x + cardPadX + 13*S) + '" y="' + (ty + 5*S) +
            '" font-size="' + 10.5*S + '" font-weight="600" letter-spacing="0.3" fill="' + col + '">' +
            esc(STATUS_LABEL[c.it.status].toUpperCase()) + '</text>');
        }
        s.push('</g>');
        cy += c.cardH + cardGap;
      }
    }
  });

  /* dropped-items strip (diff mode) */
  if(dropped.length){
    const dy = y + legendH + 4*S;
    s.push('<text x="' + PAD + '" y="' + dy + '" font-size="' + 11*S +
      '" font-weight="600" fill="' + C.err + '">Dropped since ' + esc(diff.since) + ':</text>');
    dropped.forEach((d, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      s.push('<text x="' + (PAD + 8*S + col*((W - PAD*2)/2)) + '" y="' + (dy + (16 + row*16)*S) +
        '" font-size="' + 11*S + '" fill="' + C.muted + '">– ' + esc(d) + '</text>');
    });
  }

  /* legend */
  if(usedStatuses.length || (diff && diff.any)){
    let lx = PAD;
    const ly = y + 20*S;
    const key = (mark, label, markW) => {
      s.push(mark(lx, ly));
      s.push('<text x="' + (lx + markW) + '" y="' + ly + '" font-size="' + 11*S + '" fill="' + C.muted + '">' +
        esc(label) + '</text>');
      lx += markW + measure(label, 11*S + 'px ' + F.body) + 22*S;
    };
    for(const st of ['done','doing','risk','blocked']){
      if(!usedStatuses.includes(st)) continue;
      key((x, yy) => '<circle cx="' + (x + 4*S) + '" cy="' + (yy - 4*S) + '" r="' + 4*S + '" fill="' +
        C.status[st] + '"/>', STATUS_LABEL[st], 13*S);
    }
    if(diff && diff.any){
      key((x, yy) => '<text x="' + x + '" y="' + yy + '" font-size="' + 9.5*S +
        '" font-weight="700" fill="' + C.accent + '">NEW</text>', '= added since ' + diff.since, 32*S);
    }
  }
  s.push('</svg>');
  return s.join('');
}
