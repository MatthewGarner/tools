/* Shared "poster" composer (2026-07-13): wraps a tool's chart SVG in a
   shareable artifact — faint grid-paper ground, a hero verdict line, and a
   name · date · metrics footer. Pure: no DOM; colours + measure come from the
   caller. `date` is injected (never new Date()) so goldens stay deterministic.
   Caller strings (verdict/name/metrics) escape via txt() from svg.js; `chart`
   is an already-rendered, already-escaped SVG embedded at natural size inside
   a translate group. The root <svg> carries integer, double-quoted width/height
   so app-common's svgToCanvas can size the PNG. */
import {txt, wrapText} from './svg.js';

const SERIF = "Charter, Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const M = 56;                    // outer margin — the grid-paper frame
const GAP = 24;
const HERO = 28, HEROLH = 38;    // hero verdict size + line height
const STEP = 26;                 // grid pitch, matches the landing pages

/* chart's natural pixel box, read from its root <svg> (renderers emit integer
   width/height — most double-quoted, cycles/risk single-quoted per their own
   XML-discipline convention, so the quote char is a wildcard here). */
function chartDims(chart){
  const m = chart.match(/width=['"](\d+)['"] height=['"](\d+)['"]/);
  return {w: m ? +m[1] : 900, h: m ? +m[2] : 400};
}

export function posterSvg({chart, verdict, name, date, metrics = [], accent, colors, measure}){
  const c = colors;
  const {w: cw, h: ch} = chartDims(chart);
  const innerW = cw, W = cw + M * 2;
  const heroLines = verdict ? wrapText(verdict, '700 ' + HERO + 'px ' + SERIF, innerW, measure) : [];

  const s = [];
  let y = M;

  s.push('<rect x="' + M + '" y="' + y + '" width="46" height="4" rx="2" fill="' + accent + '"/>');
  y += 22;

  heroLines.forEach((ln, i) => s.push(txt(M, y + HERO - 4 + i * HEROLH, ln, HERO, c.ink, {weight: 700})));
  y += heroLines.length * HEROLH + (heroLines.length ? GAP : 0);

  s.push('<g transform="translate(' + M + ' ' + y + ')">' + chart + '</g>');
  y += ch + GAP;

  s.push('<line x1="' + M + '" y1="' + y + '" x2="' + (W - M) + '" y2="' + y + '" stroke="' + c.border + '"/>');
  y += 22;
  s.push(txt(M, y, [name, date, ...metrics].filter(Boolean).join('   ·   '), 13, c.muted, {weight: 600}));
  y += 16;

  const H = y + M;
  const ground = '<rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' +
    '<defs><pattern id="poster-grid" width="' + STEP + '" height="' + STEP +
    '" patternUnits="userSpaceOnUse"><path d="M' + STEP + ' 0 H0 V' + STEP +
    '" fill="none" stroke="' + c.grid + '" stroke-width="1"/></pattern></defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#poster-grid)"/>';

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + SANS + '">' + ground + s.join('') + '</svg>';
}
