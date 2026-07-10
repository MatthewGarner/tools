/* Pure renderer: runDay() result → the price-shape SVG. x = hour 0..23,
   y = £/MWh. Raw shape = dashed muted ghost; flattened = solid ink; charge/
   discharge bars in a strip under the axis, storage hue (tinted fill, never
   colour-alone: bars carry ▲/▼ direction via position). Narrow (<520px):
   12-hourly axis labels + short strip caption. Changeover labels flip to
   end-anchor near the right edge at ANY width (h23 changeovers sit ON it).
   forExport: verdict wrapped to the plot width in its own band below the
   strip — the root height grows to hold it. XML discipline: all text goes
   through txt() (it escapes internally — never esc() it again); hand-built
   tags single-quoted, numbers/tokens only; empty-string data-* attributes
   (never bare). Root <svg> carries double-quoted integer width/height so
   the PNG export path (svgToCanvas) can read them; the rest of the root
   attrs — including font-family, matching roadmap/map/tree's convention —
   stay single-quoted. Text metrics come from ctx.measure (app-common's
   canvas measure); the char-width fallback keeps the module pure in node. */
import {txt, wrapText} from '../../assets/svg.js';

const FONT = 'Charter,Georgia,serif';
const r1 = n => Math.round(n * 10) / 10;
const fallbackMeasure = (t, font) => parseFloat(font) * 0.55 * t.length;

export function buildDayVerdict(result, p){
  const {raw, flat, achievedMargin, plannedMargin, dischargedGWh, droppedGWh} = result;
  const at = h => String(h).padStart(2, '0') + ':00';
  if(p.fleetGW <= 0 || (dischargedGWh <= 0 && droppedGWh <= 0)){
    return `The day's spread is £${Math.round(raw.spread)}: cheapest £${Math.round(raw.prices[raw.troughHour])}/MWh at ${at(raw.troughHour)}, dearest £${Math.round(raw.prices[raw.peakHour])}/MWh at ${at(raw.peakHour)}.`;
  }
  const perMW = Math.round(achievedMargin / p.fleetGW);
  const perMWPlanned = Math.round(plannedMargin / p.fleetGW);
  const dropped = droppedGWh > 0.05
    ? ` — walking away from ${r1(droppedGWh)} GWh of trades the flattened day no longer paid for`
    : '';
  return `${r1(p.fleetGW)} GW × ${r1(p.fleetH)} h of storage flattens the day's spread £${Math.round(raw.spread)} → £${Math.round(flat.spread)}. It planned £${perMWPlanned} per MW on the raw shape and kept £${perMW}${dropped}.`;
}

export function renderDay(result, p, ctx, opts = {}){
  const {width, height, colors} = ctx;
  const measure = ctx.measure || fallbackMeasure;
  const isNarrow = width < 520;
  const storageHue = ctx.palette.storage;
  const {raw, flat, sched} = result;
  const hasFleet = p.fleetGW > 0 && result.dischargedGWh > 0;

  const M = {l: 54, r: 16, t: 18, b: 65};              // bottom band holds the bar strip
                                                        // (+1px over the strip caption's descenders — reviewer-measured 1.2px shave)
  const plotW = width - M.l - M.r, plotH = height - M.t - M.b;
  const maxP = Math.max(...raw.prices, ...flat.prices, 10);
  const minP = Math.min(0, ...raw.prices, ...flat.prices);
  const x = h => M.l + (h / 23) * plotW;
  const y = v => M.t + plotH - ((v - minP) / (maxP - minP)) * plotH;

  // export verdict: wrapped to the plot width, its own band below the strip
  // caption (or the x labels when no strip) — the canvas grows to hold it
  const vLines = opts.forExport ? wrapText(buildDayVerdict(result, p), '12px ' + FONT, plotW, measure) : [];
  const bandBottom = M.t + plotH + (hasFleet ? 63 : 16);   // strip-caption / x-label baseline
  const vy0 = bandBottom + 24, vLineH = 18;
  const H = opts.forExport ? Math.max(height, Math.round(vy0 + (vLines.length - 1) * vLineH + 12)) : height;

  const line = (prices, colour, dashed, tag) =>
    `<polyline ${tag}='' points='` +
    prices.map((v, h) => `${r1(x(h))},${r1(y(v))}`).join(' ') +
    `' fill='none' stroke='${colour}' stroke-width='2'` +
    (dashed ? ` stroke-dasharray='5 4' opacity='0.55'` : '') + `/>`;

  const parts = [`<svg width="${width}" height="${H}" viewBox='0 0 ${width} ${H}' xmlns='http://www.w3.org/2000/svg' font-family='${FONT}' data-tool='intraday'>`];
  if(opts.forExport) parts.push(`<rect x='0' y='0' width='${width}' height='${H}' fill='${colors.card}'/>`);

  // y grid + labels
  const step = maxP > 150 ? 50 : 25;
  for(let v = Math.ceil(minP / step) * step; v <= maxP; v += step){
    parts.push(`<line x1='${M.l}' y1='${r1(y(v))}' x2='${width - M.r}' y2='${r1(y(v))}' stroke='${colors.grid}' stroke-width='1'/>`);
    parts.push(txt(M.l - 8, y(v) + 4, `£${v}`, 11, colors.muted, {anchor: 'end'}));
  }
  // x labels every 6 h (12 h narrow)
  for(let h = 0; h <= 23; h += isNarrow ? 12 : 6)
    parts.push(txt(x(h), M.t + plotH + 16, `${String(h).padStart(2, '0')}:00`, 11, colors.muted, {anchor: 'middle'}));

  if(hasFleet) parts.push(line(raw.prices, colors.muted, true, 'data-raw-shape'));
  parts.push(line(flat.prices, colors.ink, false, 'data-flat-shape'));

  // changeover ticks: the incoming marginal unit takes the price. Labels that
  // would run off the canvas (h23 sits ON the right plot edge) anchor end — so
  // a fixed tick-to-tick distance can't tell crowding on its own: the last
  // label often flips to end-anchor and grows LEFTWARD, back over its neighbour.
  // At narrow widths, measure each label's real left/right extent (anchor-aware)
  // and drop it if that box would land within ~6px of the last one actually
  // drawn — the tick line always stays (it's the honest signal); sibling
  // renderers thin crowded labels the same way (e.g. merit-order's thin-run drop).
  let lastLabelR = -Infinity;
  for(const c of flat.changeovers){
    const cx = x(c.h);
    parts.push(`<line x1='${r1(cx)}' y1='${M.t}' x2='${r1(cx)}' y2='${M.t + plotH}' stroke='${colors.accent}' stroke-width='1' opacity='0.35'/>`);
    const w = measure(c.to, '10px ' + FONT);
    const overflows = cx + 3 + w > width - 2;
    const labelL = overflows ? cx - 3 - w : cx + 3;
    if(isNarrow && labelL < lastLabelR + 6) continue;
    if(overflows) parts.push(txt(cx - 3, M.t + 10, c.to, 10, colors.accent, {anchor: 'end'}));
    else parts.push(txt(cx + 3, M.t + 10, c.to, 10, colors.accent));
    lastLabelR = labelL + w;
  }

  // storage strip: charge below the strip midline, discharge above; abandoned
  // (back-off-dropped) volumes as dashed unfilled ghosts behind the kept bars
  if(hasFleet){
    const stripY = M.t + plotH + 28, stripH = 24, mid = stripY + stripH / 2;
    const barW = plotW / 24 * 0.7;
    const planSched = result.planSched;
    const barScale = (stripH / 2) / Math.max(...planSched.charge, ...planSched.discharge, 0.1);
    for(let h = 0; h < 24; h++){
      const dDis = planSched.discharge[h] - sched.discharge[h];
      const dChg = planSched.charge[h] - sched.charge[h];
      if(dDis > 0.01)
        parts.push(`<rect data-dropped='' x='${r1(x(h) - barW / 2)}' y='${r1(mid - planSched.discharge[h] * barScale)}' width='${r1(barW)}' height='${r1(dDis * barScale)}' fill='none' stroke='${storageHue}' stroke-width='1' stroke-dasharray='3 2' opacity='0.55'/>`);
      if(dChg > 0.01)
        parts.push(`<rect data-dropped='' x='${r1(x(h) - barW / 2)}' y='${r1(mid + sched.charge[h] * barScale)}' width='${r1(barW)}' height='${r1(dChg * barScale)}' fill='none' stroke='${storageHue}' stroke-width='1' stroke-dasharray='3 2' opacity='0.55'/>`);
      if(sched.discharge[h] > 0)
        parts.push(`<rect data-discharge='' x='${r1(x(h) - barW / 2)}' y='${r1(mid - sched.discharge[h] * barScale)}' width='${r1(barW)}' height='${r1(sched.discharge[h] * barScale)}' fill='${storageHue}'/>`);
      if(sched.charge[h] > 0)
        parts.push(`<rect data-charge='' x='${r1(x(h) - barW / 2)}' y='${r1(mid)}' width='${r1(barW)}' height='${r1(sched.charge[h] * barScale)}' fill='${storageHue}' opacity='0.45'/>`);
    }
    parts.push(txt(M.l, stripY + stripH + 11,
      isNarrow ? 'dashed = abandoned' : 'discharge ↑ / charge ↓ · dashed = planned then abandoned',
      10, colors.muted));
  }

  if(opts.cursor != null){
    parts.push(`<line data-cursor='${opts.cursor}' x1='${r1(x(opts.cursor))}' y1='${M.t}' x2='${r1(x(opts.cursor))}' y2='${M.t + plotH}' stroke='${colors.accent}' stroke-width='1.5'/>`);
  }
  if(opts.forExport)
    parts.push(`<g data-verdict=''>` +
      vLines.map((l, i) => txt(M.l, vy0 + i * vLineH, l, 12, colors.ink)).join('') + `</g>`);

  parts.push('</svg>');
  return parts.join('');
}
