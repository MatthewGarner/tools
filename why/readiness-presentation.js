/* One complete 16:9 readiness plate, or an explicit refusal. */
import {esc} from '../assets/svg.js';
import {renderReadinessLedger} from './readiness-ledger.js';
import {causalColours, wrapCausal} from './causal-field.js';

const dims = svg => ({
  width: +((svg.match(/\bwidth="([\d.]+)"/) || [, 1])[1]),
  height: +((svg.match(/\bheight="([\d.]+)"/) || [, 1])[1]),
});
const inner = svg => svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
function refusal(model, ctx, c, title, {titleOverflow = false} = {}){
  const reason = titleOverflow ? 'TITLE EXCEEDS THIS COMPLETE DELIVERY LENS PLATE' : 'CANNOT FIT COMPLETE DELIVERY LENS';
  const body = titleOverflow
    ? 'The native Delivery Lens retains the full authored title and every readiness row.'
    : 'Copy PNG keeps one complete plate. This readiness view needs the native SVG.';
  const footer = titleOverflow
    ? 'COPY PNG HAS NOT CROPPED THE SOURCE · EXPORT THE NATIVE DELIVERY LENS'
    : 'NO ROW HAS BEEN SELECTED OR OMITTED · EXPORT THE NATIVE DELIVERY LENS';
  return '<svg xmlns="http://www.w3.org/2000/svg" data-readiness-presentation="refusal"' + (titleOverflow ? ' data-readiness-title-refusal=""' : '') + ' width="1920" height="1080" viewBox="0 0 1920 1080" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="1920" height="1080" fill="' + c.bg + '"/>' +
    title.map((line, i) => '<text x="100" y="' + (130 + i * 48) + '" font-size="42" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>').join('') +
    '<line x1="100" y1="226" x2="1820" y2="226" stroke="' + c.ink + '" stroke-width="2"/><text x="100" y="322" font-size="16" font-weight="700" letter-spacing="1.7" fill="' + c.err + '">' + reason + '</text><text x="100" y="388" font-size="25" fill="' + c.ink + '">' + body + '</text><text x="100" y="936" font-size="17" fill="' + c.muted + '">' + footer + '</text></svg>';
}

export function renderReadinessPresentation(model, projection, ctx, diff = null){
  const c = causalColours(model, ctx);
  const title = wrapCausal(model.title || 'Delivery Lens', '700 42px sans-serif', 1450,
    ctx.measure || (text => String(text).length * 7));
  if(title.length > 2) return refusal(model, ctx, c, title.slice(0, 2), {titleOverflow:true});
  const diffLines = diff ? wrapCausal(diff.narrative, '600 16px sans-serif', 1480, ctx.measure || (text => String(text).length * 7)) : [];
  const chart = renderReadinessLedger(model, projection, {...ctx, bare:true, edit:false, width:undefined}, diff);
  const d = dims(chart);
  const reserve = diffLines.length ? 18 + diffLines.length * 20 : 0;
  const bodyH = 650 - reserve;
  const scale = Math.min(1720 / d.width, bodyH / d.height, 1.25);
  if(scale < 1) return refusal(model, ctx, c, title);
  const x = 100 + (1720 - d.width * scale) / 2;
  const y = 230 + reserve + (bodyH - d.height * scale) / 2;
  return '<svg xmlns="http://www.w3.org/2000/svg" data-readiness-presentation="plate" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="1920" height="1080" fill="' + c.bg + '"/>' +
    title.map((line, i) => '<text x="100" y="' + (124 + i * 44) + '" font-size="38" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>').join('') +
    '<text x="1820" y="124" text-anchor="end" font-size="17" fill="' + c.muted + '">' + esc(String(ctx.today || '')) + '</text><text x="100" y="210" font-size="14" font-weight="700" letter-spacing="1.8" fill="' + c.muted + '">DELIVERY LENS · COMPLETE DERIVED READINESS</text>' + diffLines.map((line, i) => '<text data-readiness-presentation-diff="' + i + '" x="100" y="' + (238 + i * 20) + '" font-size="16" font-weight="600" fill="' + c.muted + '">' + esc(line) + '</text>').join('') + '<svg x="' + x + '" y="' + y + '" width="' + (d.width * scale) + '" height="' + (d.height * scale) + '" viewBox="0 0 ' + d.width + ' ' + d.height + '">' + inner(chart) + '</svg><line x1="100" y1="1002" x2="1820" y2="1002" stroke="' + c.border + '"/><text x="100" y="1036" font-size="17" font-weight="600" fill="' + c.muted + '">COMPLETE DELIVERY LENS · NATIVE SVG REMAINS EXHAUSTIVE</text></svg>';
}
