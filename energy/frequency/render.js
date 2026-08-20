// energy/frequency/render.js
/* Pure SVG painter: canonical trace scene → deck-ready frequency trace.
   renderTrace() remains a compatibility wrapper for a simulate() result.
   XML discipline: txt()/esc() for content; hand-built tags single-quoted,
   numbers only. Root <svg> carries double-quoted integer width/height so the
   PNG export path (svgToCanvas) can read them. */
import {txt, esc} from '../../assets/svg.js';
import {verdict} from './engine.js';
import {buildTraceScene} from './scene.js';

const FONT = "'Helvetica Neue',Helvetica,'Segoe UI',Roboto,sans-serif";   // Swiss Phase 4
const r2 = n => Math.round(n * 100) / 100;
const FALLBACK_COLORS = {bg: '#f7f8f6', ink: '#111', muted: '#666', accent: '#C05621', err: '#b00'};
export const TRACE_SVG_FRAME = {width: 1200, height: 520, x0: 64, x1: 1176, y0: 56, y1: 424};

export function projectTraceScene(scene, frame = TRACE_SVG_FRAME){
  const {x0, x1, y0, y1} = frame;
  return {
    x: time => x0 + ((time - scene.time.start) / (scene.time.end - scene.time.start)) * (x1 - x0),
    y: frequency => y1 - ((frequency - scene.frequency.min) /
      (scene.frequency.max - scene.frequency.min)) * (y1 - y0),
  };
}

export function renderTraceScene(scene, ctx = {}, {ariaLabel = 'Frequency trace', footer = ''} = {}){
  const C = {...FALLBACK_COLORS, ...(ctx.colors || {})};
  const {width: W, height: H, x0, x1, y0, y1} = TRACE_SVG_FRAME;
  const {x: sx, y: sy} = projectTraceScene(scene);
  const {nominalBand, threshold, gridTicks} = scene.frequency;
  const P = [];

  /* pure display (export path — the live view is a canvas, already labelled
     in index.html) — no data-edit targets here, so role="img" is safe */
  P.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-label="${esc(ariaLabel)}">`);
  P.push(`<rect width='${W}' height='${H}' fill='${C.bg}'/>`);

  // All teaching marks originate in the scene: SVG owns only this frame.
  const line = (f, col, dash, opacity = 1) =>
    `<line x1='${x0}' y1='${r2(sy(f))}' x2='${x1}' y2='${r2(sy(f))}' stroke='${col}' stroke-width='1' opacity='${opacity}'` +
    (dash ? ` stroke-dasharray='${dash}'` : '') + `/>`;
  P.push(`<rect x='${x0}' y='${r2(sy(nominalBand.high))}' width='${x1 - x0}' height='${r2(sy(nominalBand.low) - sy(nominalBand.high))}' fill='${C.accent}' opacity='0.06'/>`);
  // sub-48.8 Hz load-shedding zone — the danger floor, washed red so a dip into it reads at a glance
  P.push(`<rect x='${x0}' y='${r2(sy(threshold.frequency))}' width='${x1 - x0}' height='${r2(y1 - sy(threshold.frequency))}' fill='${C.err}' opacity='0.09'/>`);
  for(const tick of gridTicks){
    P.push(line(tick.frequency, C.muted, '', tick.frequency === nominalBand.frequency ? 1 : 0.3));
    P.push(txt(x0 - 8, sy(tick.frequency) + 4, String(tick.frequency), 12, C.muted, {anchor: 'end'}));
  }
  P.push(txt(x1, sy(nominalBand.frequency) - 6, nominalBand.label, 12, C.muted, {anchor: 'end'}));
  P.push(line(threshold.frequency, C.err, '5 4'));
  P.push(txt(x1, sy(threshold.frequency) - 6, threshold.label, 12, C.err, {anchor: 'end'}));

  // ghost: no-battery counterfactual, drawn behind the main trace
  if(scene.ghost){
    const gpts = scene.ghost.points.map(point => `${r2(sx(point.time))},${r2(sy(point.frequency))}`).join(' ');
    P.push(`<polyline points='${gpts}' fill='none' stroke='${C.muted}' stroke-width='2' stroke-dasharray='6 4' opacity='0.55'/>`);
    P.push(txt(sx(scene.ghost.nadir.time), sy(scene.ghost.nadir.frequency) - 10, scene.ghost.label, 12, C.muted, {anchor: 'middle'}));
  }

  // the frequency trace
  const pts = scene.trace.points.map(point => `${r2(sx(point.time))},${r2(sy(point.frequency))}`).join(' ');
  P.push(`<polyline points='${pts}' fill='none' stroke='${C.accent}' stroke-width='2.5'/>`);

  // nadir marker
  P.push(`<circle cx='${r2(sx(scene.nadir.time))}' cy='${r2(sy(scene.nadir.frequency))}' r='4' fill='${C.ink}'/>`);
  P.push(txt(sx(scene.nadir.time), sy(scene.nadir.frequency) + 20, scene.nadir.label, 12, C.ink, {anchor: 'middle'}));

  // RoCoF: the initial fall rate, as a dashed tangent peeling off the trace at t=0
  if(scene.rocof){
    P.push(`<line x1='${r2(sx(scene.rocof.from.time))}' y1='${r2(sy(scene.rocof.from.frequency))}' x2='${r2(sx(scene.rocof.to.time))}' y2='${r2(sy(scene.rocof.to.frequency))}' stroke='${C.ink}' stroke-width='1.5' stroke-dasharray='4 3'/>`);
    P.push(txt(sx(scene.rocof.to.time) + 8, sy(scene.rocof.to.frequency) + 4, scene.rocof.label, 12, C.ink));
  }

  // axes labels
  P.push(txt(x0, y1 + 22, scene.axes.start.label, 12, C.muted));
  P.push(txt(x1, y1 + 22, scene.axes.end.label, 12, C.muted, {anchor: 'end'}));

  if(footer) P.push(txt(x0, H - 30, footer, 14, C.ink));
  P.push('</svg>');
  return P.join('');
}

// Compatibility entry point for callers that hold an engine result rather than
// a prepared display scene. App code uses renderTraceScene directly.
export function renderTrace(result, params, ctx){
  const copy = verdict(result, params);
  return renderTraceScene(buildTraceScene(result, params), ctx, {ariaLabel: copy, footer: copy});
}

export function toMarkdown(result, p){
  return `**Frequency & inertia** — ${verdict(result, p)}\n\n` +
    `RoCoF ${result.rocof.toFixed(2)} Hz/s · nadir ${result.nadir.f.toFixed(2)} Hz ` +
    `· settle ${result.settle.toFixed(2)} Hz\n\nenergy.matthewgarner.me/frequency`;
}
