/* Fixed 16:9 field summary for Copy PNG. Native SVG remains exhaustive. */
import {esc} from '../assets/svg.js';
import {mix, PALETTES, scheme} from '../assets/series.js';
import {paintOrder} from './zones.js';
import {measuredLines, presentationSelection} from './layout.js';

const W = 1920, H = 1080;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export function renderMapPresentation(model, resolved, ro, ctx = {}){
  const {measure, dark = false} = ctx;
  const paletteHex = model.accent || (PALETTES[model.palette] ? PALETTES[model.palette][dark ? 'dark' : 'light'] : null);
  const C = paletteHex ? {...ctx.colors, ...scheme(paletteHex, dark)} : ctx.colors;
  const selection = presentationSelection(model, ro);
  const fx = 110, fy = 230, fw = 1120, fh = 700, kx = 1290, kw = 520;
  const px = x => fx + x / 100 * fw, py = y => fy + (1 - y / 100) * fh;
  const s = [];
  s.push('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="' + FONT + '">');
  s.push('<rect width="1920" height="1080" fill="' + C.bg + '"/><rect width="18" height="1080" fill="' + C.accent + '"/>');
  const title = measuredLines(model.title || model.preset || 'Map', '700 44px ' + FONT, 1120, measure);
  title.forEach((line, i) => s.push('<text x="110" y="' + (92 + i * 50) + '" font-size="44" font-weight="700" fill="' + C.ink + '">' + esc(line) + '</text>'));
  const verdictLines = measuredLines(ro.verdict, '700 28px ' + FONT, 520, measure);
  verdictLines.forEach((line, i) => s.push('<text x="1810" y="' + (72 + i * 32) + '" text-anchor="end" font-size="28" font-weight="700" fill="' + C.accentInk + '">' + esc(line) + '</text>'));
  s.push('<text x="110" y="190" font-size="15" font-weight="700" letter-spacing="1.2" fill="' + C.muted + '">SELECTION · ' + selection.rule.toUpperCase() + '</text>');
  s.push('<text x="1810" y="190" text-anchor="end" font-size="15" font-weight="700" fill="' + C.muted + '">' +
    selection.selected.length + ' SHOWN · ' + selection.remainder + ' FURTHER IN FULL SVG</text>');
  s.push('<rect x="' + fx + '" y="' + fy + '" width="' + fw + '" height="' + fh + '" fill="' + C.card + '" stroke="' + C.border + '"/>');
  for(const {zone, pts} of paintOrder(resolved)){
    const tone = ({bad:C.status.blocked, warn:C.status.risk, good:C.status.done, accent:C.accent})[zone.tone];
    if(!tone) continue;
    const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + px(x).toFixed(1) + ' ' + py(y).toFixed(1)).join('') + 'Z';
    s.push('<path d="' + d + '" fill="' + mix(C.card, tone, dark ? 0.13 : 0.07) + '"/>');
  }
  if(resolved.grid){
    for(let c = 1; c < resolved.grid.cols; c++) s.push('<line x1="' + px(c * 100 / resolved.grid.cols) + '" y1="' + fy + '" x2="' + px(c * 100 / resolved.grid.cols) + '" y2="' + (fy + fh) + '" stroke="' + C.border + '"/>');
    for(let r = 1; r < resolved.grid.rows; r++) s.push('<line x1="' + fx + '" y1="' + py(r * 100 / resolved.grid.rows) + '" x2="' + (fx + fw) + '" y2="' + py(r * 100 / resolved.grid.rows) + '" stroke="' + C.border + '"/>');
  }
  for(const record of selection.selected){
    const cx = px(record.item.x), cy = py(record.item.y), tone = record.flagged ? C.err : C.accent;
    s.push('<rect x="' + (cx - 8) + '" y="' + (cy - 8) + '" width="16" height="16" fill="' + tone + '" transform="rotate(45 ' + cx + ' ' + cy + ')"/>');
    s.push('<rect x="' + (cx + 14) + '" y="' + (cy - 14) + '" width="48" height="28" fill="' + C.card + '" stroke="' + tone + '"/>');
    s.push('<text x="' + (cx + 38) + '" y="' + (cy + 5) + '" text-anchor="middle" font-size="13" font-weight="700" fill="' + C.ink + '">' + record.id + '</text>');
  }
  s.push('<rect x="' + kx + '" y="' + fy + '" width="' + kw + '" height="' + fh + '" fill="' + C.card + '" stroke="' + C.border + '"/>');
  s.push('<text x="' + (kx + 24) + '" y="' + (fy + 35) + '" font-size="14" font-weight="700" letter-spacing="1.2" fill="' + C.accentInk + '">SELECTED FIELD KEY</text>');
  let ky = fy + 64;
  for(const record of selection.selected){
    const lines = measuredLines(record.item.label, '600 20px ' + FONT, kw - 104, measure);
    s.push('<text x="' + (kx + 24) + '" y="' + (ky + 20) + '" font-size="14" font-weight="700" fill="' + (record.flagged ? C.err : C.accentInk) + '">' + record.id + '</text>');
    lines.forEach((line, i) => s.push('<text x="' + (kx + 86) + '" y="' + (ky + 20 + i * 23) + '" font-size="20" font-weight="600" fill="' + C.ink + '">' + esc(line) + '</text>'));
    s.push('<text x="' + (kx + 86) + '" y="' + (ky + 42 + lines.length * 23) + '" font-size="13" fill="' + C.muted + '">@ ' + record.item.x + ', ' + record.item.y + (record.flagged ? ' · FLAGGED' : '') + '</text>');
    ky += Math.max(72, 54 + lines.length * 23);
  }
  s.push('<text x="110" y="1032" font-size="14" font-weight="700" letter-spacing="1.4" fill="' + C.muted + '">PRESENTATION SUMMARY · FULL DETAIL: DOWNLOAD SVG</text>');
  s.push('</svg>');
  return s.join('');
}
