/* Pure composite export for Intraday. The screen has two useful views — the
   day's shape and the selected hour's book — so the portable artefact keeps
   both on one artboard instead of silently choosing one. */
import {txt, esc, wrapText} from '../../assets/svg.js';
import {hourStack} from './day.js';
import {renderDay, buildDayVerdictParts} from './render-day.js';
import {renderStack} from '../merit-order/render.js';

const FONT = "'Helvetica Neue',Helvetica,'Segoe UI',Roboto,sans-serif";
const WIDTH = 1200;

function rootDimensions(svg){
  const m = svg.match(/^<svg\b[^>]*\bwidth=["'](\d+(?:\.\d+)?)["'][^>]*\bheight=["'](\d+(?:\.\d+)?)["'][^>]*>/);
  if(!m) throw new Error('intraday export child has no integer dimensions');
  return {width: Number(m[1]), height: Number(m[2])};
}

function childBody(svg){
  const open = svg.indexOf('>');
  const close = svg.lastIndexOf('</svg>');
  if(open < 0 || close < open) throw new Error('intraday export child is not SVG');
  return svg.slice(open + 1, close);
}

/** Return the stable geometry contract used by the composite and its tests. */
export function exportLayout(price, stack, width = WIDTH, footer = 52){
  const pad = 40, header = 146, gap = 28;
  const inner = width - pad * 2;
  const priceH = price.height;
  const stackH = stack.height;
  const priceY = header;
  const stackY = priceY + priceH + gap;
  return {
    width, height: stackY + stackH + footer,
    price: {x: pad, y: priceY, width: inner, height: priceH},
    stack: {x: pad, y: stackY, width: inner, height: stackH},
  };
}

/**
 * `snapshot` is assembled synchronously by the app. It deliberately contains
 * all mutable inputs needed by both child renderers so a slider/playback race
 * cannot produce a mixed-hour or mixed-parameter export.
 */
export function renderDayStackExport(snapshot){
  const {result, params, hour, catalogue, date, colors, palette, measure} = snapshot;
  if(!result || !params || typeof measure !== 'function' || !Number.isInteger(hour) || hour < 0 || hour > 23)
    throw new Error('intraday export requires a complete day snapshot');
  const C = colors;
  const childCtx = {width: WIDTH - 80, height: 420, colors: C, palette, measure, today: date};
  const priceSvg = renderDay(result, params, childCtx, {forExport: true, cursor: hour});
  const demand = result.flat.hours[hour].demand;
  const stackSvg = renderStack({generators: hourStack(params, hour, catalogue), demand},
    {...childCtx}, {forExport: true, labelCollide: 'drop', legendStorageNote: false});
  const price = rootDimensions(priceSvg), stack = rootDimensions(stackSvg);
  const verdict = buildDayVerdictParts(result, params).line;
  const verdictLines = wrapText(verdict, '12px ' + FONT, WIDTH - 200, measure);
  const footer = Math.max(52, 36 + (verdictLines.length - 1) * 18);
  const L = exportLayout(price, stack, WIDTH, footer);
  const scenario = date ? `${date} · ${params.fleetGW > 0 ? `${params.fleetGW} GW fleet` : 'no storage fleet'}` :
    (params.fleetGW > 0 ? `${params.fleetGW} GW fleet` : 'no storage fleet');
  const hourLabel = String(hour).padStart(2, '0') + ':00';
  const metrics = `24 hours · spread £${Math.round(result.raw.spread)} · selected hour ${hourLabel} · net demand ${Math.round(demand * 10) / 10} GW`;
  const aria = `Intraday day and merit-order stack at ${hourLabel}. ${scenario}. ${verdict}`;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${Math.round(L.height)}" viewBox="0 0 ${L.width} ${Math.round(L.height)}" font-family="${FONT}" data-tool="intraday-day-stack" role="img" aria-label="${esc(aria)}">`];
  parts.push(`<rect width="${L.width}" height="${Math.round(L.height)}" fill="${C.bg || C.card}"/>`);
  parts.push(txt(40, 34, 'E5 · INTRADAY', 11.5, C.accent, {weight: 700, tracking: '.08em'}));
  parts.push(txt(40, 72, 'A battery’s trading day', 28, C.ink, {weight: 700}));
  parts.push(txt(40, 98, scenario, 12, C.muted));
  parts.push(txt(L.width - 40, 72, `SELECTED HOUR · ${hourLabel}`, 11.5, C.accent, {weight: 700, tracking: '.08em', anchor: 'end'}));
  parts.push(txt(L.width - 40, 98, metrics, 11, C.muted, {anchor: 'end'}));
  parts.push(`<rect x="${L.price.x - 16}" y="${L.price.y - 16}" width="${L.price.width + 32}" height="${L.price.height + 32}" fill="${C.card}" stroke="${C.border || C.grid || C.card}"/>`);
  parts.push(`<rect x="${L.stack.x - 16}" y="${L.stack.y - 16}" width="${L.stack.width + 32}" height="${L.stack.height + 32}" fill="${C.card}" stroke="${C.border || C.grid || C.card}"/>`);
  parts.push(`<svg x="${L.price.x}" y="${L.price.y}" width="${L.price.width}" height="${L.price.height}" viewBox="0 0 ${price.width} ${price.height}" preserveAspectRatio="xMinYMin meet">${childBody(priceSvg)}</svg>`);
  parts.push(`<svg x="${L.stack.x}" y="${L.stack.y}" width="${L.stack.width}" height="${L.stack.height}" viewBox="0 0 ${stack.width} ${stack.height}" preserveAspectRatio="xMinYMin meet">${childBody(stackSvg)}</svg>`);
  const footerY = L.stack.y + L.stack.height + 21;
  parts.push(txt(40, footerY, 'THE TAKEAWAY', 11.5, C.muted, {weight: 700, tracking: '.08em'}));
  verdictLines.forEach((line, i) => parts.push(txt(160, footerY + i * 18, line, 12, C.ink)));
  parts.push('</svg>');
  return parts.join('');
}
