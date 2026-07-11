// energy/frequency/render.js
/* Pure renderer: a simulate() result → a deck-ready SVG frequency trace.
   XML discipline: txt()/esc() for content; hand-built tags single-quoted,
   numbers only. Root <svg> carries double-quoted integer width/height so the
   PNG export path (svgToCanvas) can read them. */
import {txt, esc} from '../../assets/svg.js';
import {F0, verdict, simulate} from './engine.js';

const FONT = 'Charter,Georgia,serif';
const r2 = n => Math.round(n * 100) / 100;

export function renderTrace(result, p, ctx){
  const C = ctx.colors;
  const W = 1200, H = 520;
  const x0 = 64, x1 = W - 24, y0 = 56, y1 = H - 96;
  const tEnd = result.t[result.t.length - 1];
  // no-battery counterfactual: only meaningful when a battery is actually active
  const ghost = (p.drMw > 0 || p.dmMw > 0 || p.dcMw > 0 || p.eGfm > 0)
    ? simulate({...p, drMw: 0, dmMw: 0, dcMw: 0, eGfm: 0}) : null;
  // tighter range: 48.8 UFLS always shows with margin; shallow nadirs fill the space;
  // extend to include the ghost's (deeper) dip when present
  // (kept in lockstep with app.js's drawCanvas — the live canvas mirrors this range)
  const lowNadir = ghost ? Math.min(result.nadir.f, ghost.nadir.f) : result.nadir.f;
  const fMin = Math.min(lowNadir - 0.4, 48.5), fMax = 50.3;
  const sx = t => x0 + (t / tEnd) * (x1 - x0);
  const sy = f => y1 - ((f - fMin) / (fMax - fMin)) * (y1 - y0);
  const P = [];

  /* pure display (export path — the live view is a canvas, already labelled
     in index.html) — no data-edit targets here, so role="img" is safe */
  P.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-label="${esc(verdict(result, p))}">`);
  P.push(`<rect width='${W}' height='${H}' fill='${C.bg}'/>`);

  // reference lines: 50 Hz, normal band 49.8–50.2, UFLS 48.8
  const line = (f, col, dash) =>
    `<line x1='${x0}' y1='${r2(sy(f))}' x2='${x1}' y2='${r2(sy(f))}' stroke='${col}' stroke-width='1'` +
    (dash ? ` stroke-dasharray='${dash}'` : '') + `/>`;
  P.push(`<rect x='${x0}' y='${r2(sy(50.2))}' width='${x1 - x0}' height='${r2(sy(49.8) - sy(50.2))}' fill='${C.accent}' opacity='0.06'/>`);
  // sub-48.8 Hz load-shedding zone — the danger floor, washed red so a dip into it reads at a glance
  P.push(`<rect x='${x0}' y='${r2(sy(48.8))}' width='${x1 - x0}' height='${r2(y1 - sy(48.8))}' fill='${C.err}' opacity='0.09'/>`);
  P.push(line(F0, C.muted, ''));
  P.push(txt(x1, sy(F0) - 6, '50 Hz', 12, C.muted, {anchor: 'end'}));
  P.push(line(48.8, C.err, '5 4'));
  P.push(txt(x1, sy(48.8) - 6, 'UFLS 48.8 Hz — demand disconnects', 12, C.err, {anchor: 'end'}));

  // ghost: no-battery counterfactual, drawn behind the main trace
  if(ghost){
    const gpts = ghost.t.map((t, i) => `${r2(sx(t))},${r2(sy(ghost.f[i]))}`).join(' ');
    P.push(`<polyline points='${gpts}' fill='none' stroke='${C.muted}' stroke-width='2' stroke-dasharray='6 4' opacity='0.55'/>`);
    P.push(txt(sx(ghost.nadir.t), sy(ghost.nadir.f) - 10, 'same grid, no battery', 12, C.muted, {anchor: 'middle'}));
  }

  // the frequency trace
  const pts = result.t.map((t, i) => `${r2(sx(t))},${r2(sy(result.f[i]))}`).join(' ');
  P.push(`<polyline points='${pts}' fill='none' stroke='${C.accent}' stroke-width='2.5'/>`);

  // nadir marker
  P.push(`<circle cx='${r2(sx(result.nadir.t))}' cy='${r2(sy(result.nadir.f))}' r='4' fill='${C.ink}'/>`);
  P.push(txt(sx(result.nadir.t), sy(result.nadir.f) + 20, `nadir ${result.nadir.f.toFixed(2)} Hz`, 12, C.ink, {anchor: 'middle'}));

  // RoCoF: the initial fall rate, as a dashed tangent peeling off the trace at t=0
  if(result.rocof > 0.01){
    const tRc = Math.min(Math.min(1.0, F0 - fMin - 0.2) / result.rocof, tEnd * 0.32);
    const fRc = F0 - result.rocof * tRc;
    P.push(`<line x1='${r2(sx(0))}' y1='${r2(sy(F0))}' x2='${r2(sx(tRc))}' y2='${r2(sy(fRc))}' stroke='${C.ink}' stroke-width='1.5' stroke-dasharray='4 3'/>`);
    P.push(txt(sx(tRc) + 8, sy(fRc) + 4, `RoCoF ${result.rocof.toFixed(2)} Hz/s`, 12, C.ink));
  }

  // axes labels
  P.push(txt(x0, y1 + 22, '0 s', 12, C.muted));
  P.push(txt(x1, y1 + 22, `${Math.round(tEnd)} s`, 12, C.muted, {anchor: 'end'}));
  P.push(txt(x0 - 8, sy(F0) + 4, '50', 12, C.muted, {anchor: 'end'}));

  // verdict, wrapped is nice-to-have; single line is fine at this width
  P.push(txt(x0, H - 30, verdict(result, p), 14, C.ink));
  P.push('</svg>');
  return P.join('');
}

export function toMarkdown(result, p){
  return `**Frequency & inertia** — ${verdict(result, p)}\n\n` +
    `RoCoF ${result.rocof.toFixed(2)} Hz/s · nadir ${result.nadir.f.toFixed(2)} Hz ` +
    `· settle ${result.settle.toFixed(2)} Hz\n\nenergy.matthewgarner.me/frequency`;
}
