/* Pure geometry and density decisions for Map. Display IDs exist for one
   composition only and never enter the parser model or URL state. */
import {wrapText} from '../assets/svg.js';

export const MAP_DIRECT_CAPACITY = 9;
export const MAP_PRESENTATION_LIMIT = 8;

export function measuredLines(text, font, maxWidth, measure){
  const out = [];
  for(const line of wrapText(String(text || ''), font, maxWidth, measure)){
    if(measure(line, font) <= maxWidth){ out.push(line); continue; }
    let current = '';
    for(const ch of line){
      const next = current + ch;
      if(current && measure(next, font) > maxWidth){ out.push(current); current = ch; }
      else current = next;
    }
    if(current) out.push(current);
  }
  return out.length ? out : [''];
}

export function sourceItems(model, ro){
  const flagged = new Set((ro?.flagged || []).map(f => f.item.srcLine));
  const digits = Math.max(2, String(model.items.length).length);
  return model.items.map((item, index) => ({
    id: 'M' + String(index + 1).padStart(digits, '0'),
    sourceOrder: index + 1,
    item,
    flagged: flagged.has(item.srcLine),
  }));
}

export function nudge(boxes, x0, y0, x1, y1, iters = 24){
  const b = boxes.map(o => ({...o}));
  for(let it = 0; it < iters; it++){
    let moved = false;
    for(let i = 0; i < b.length; i++) for(let j = i + 1; j < b.length; j++){
      const a = b[i], c = b[j];
      if(a.fixed && c.fixed) continue;
      const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
      const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      if(ox <= 0 || oy <= 0) continue;
      moved = true;
      const aShare = a.fixed ? 0 : (c.fixed ? 1 : 0.5);
      if(oy <= ox){
        const total = oy + 2, dir = a.y <= c.y ? -1 : 1;
        a.y += dir * total * aShare; c.y -= dir * total * (1 - aShare);
      } else {
        const total = ox + 2, dir = a.x <= c.x ? -1 : 1;
        a.x += dir * total * aShare; c.x -= dir * total * (1 - aShare);
      }
    }
    for(const o of b){
      if(o.fixed) continue;
      o.x = Math.min(Math.max(o.x, x0), x1 - o.w);
      o.y = Math.min(Math.max(o.y, y0), y1 - o.h);
    }
    if(!moved) break;
  }
  return b;
}

export function layoutPlaced(records, {planeX, planeY, planeW, planeH, scale = 1,
  measure, font, maxLabelW = 190, zoneObstacles = []}){
  const placed = records.filter(record => record.item.x != null);
  const prepared = placed.map(record => ({...record,
    lines: measuredLines(record.item.label, font, maxLabelW * scale, measure)}));
  const keyed = prepared.length > MAP_DIRECT_CAPACITY || prepared.some(record => record.lines.length > 2);
  const px = x => planeX + x / 100 * planeW;
  const py = y => planeY + (1 - y / 100) * planeH;
  if(keyed) return {mode: 'keyed', records: prepared.map(record => ({...record, it: record.item,
    cx: px(record.item.x), cy: py(record.item.y)}))};

  const boxes = prepared.map(record => {
    const w = Math.max(...record.lines.map(line => measure(line, font))) + 16 * scale;
    const h = record.lines.length * 13 * scale + 7 * scale;
    const cx = px(record.item.x), cy = py(record.item.y);
    let x = cx + 7 * scale;
    if(x + w > planeX + planeW - 4) x = cx - 7 * scale - w;
    return {...record, it: record.item, w, h, x, y: cy - h / 2, cx, cy};
  });
  const nudged = nudge([...boxes.map(({x, y, w, h}) => ({x, y, w, h})), ...zoneObstacles],
    planeX + 2, planeY + 2, planeX + planeW - 2, planeY + planeH - 2);
  boxes.forEach((box, i) => { box.x = nudged[i].x; box.y = nudged[i].y; });
  return {mode: 'direct', records: boxes};
}

export function presentationSelection(model, ro, limit = MAP_PRESENTATION_LIMIT){
  const records = sourceItems(model, ro).filter(record => record.item.x != null);
  const ranked = records.slice().sort((a, b) =>
    Number(b.flagged) - Number(a.flagged) ||
    (b.item.y - a.item.y) ||
    (a.item.x - b.item.x) ||
    (a.sourceOrder - b.sourceOrder));
  const selected = ranked.slice(0, Math.max(0, limit));
  return {selected, total: records.length, remainder: Math.max(0, records.length - selected.length),
    rule: 'flagged first · then field position · source order'};
}
