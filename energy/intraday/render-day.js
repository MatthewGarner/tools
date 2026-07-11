/* Pure renderer: runDay() result → the price-shape SVG. x = hour 0..23,
   y = £/MWh. The flat (achieved) price line is drawn as SEGMENTS coloured by
   the marginal unit's fuel-family hue (the same colour language as the stack
   card above) — so the line itself teaches which plant sets each hour's price;
   the raw shape rides behind it as a muted dashed ghost. A muted night wash
   sits outside sunrise..sunset and a solar wash inside, both driven by
   p.sunrise/p.sunset so the season presets move them. Changeover verticals are
   short top ticks with staggered labels; the scrub cursor is an ink dashed
   line, distinct from everything. Charge/discharge bars in a strip under the
   axis, storage hue (tinted fill, never colour-alone: bars carry ▲/▼ direction
   via position); at fleet 0 the strip band is dropped and the canvas shrinks.
   Narrow (<520px): 12-hourly axis labels + short strip caption. Changeover
   labels flip to end-anchor near the right edge at ANY width (h23 changeovers
   sit ON it).

   House anatomy: an in-plane letterspaced title (both screen + export, merit-
   order's exact style). forExport additionally gets a page bg + chart-card
   rect, a date top-right (only when ctx.today is a string — pure/deterministic
   otherwise), a metrics line, and the verdict wrapped to the plot width in its
   own band below the strip — the root height grows to hold it. The plot-left
   constant matches renderStack's (116 wide / 44 narrow) so the two cards' plots
   share edges.

   XML discipline: all text goes through txt() (it escapes internally — never
   esc() it again); hand-built tags single-quoted, numbers/tokens only; empty-
   string data-* attributes (never bare). Root <svg> carries double-quoted
   integer width/height so the PNG export path (svgToCanvas) can read them; the
   rest of the root attrs — including font-family, matching roadmap/map/tree's
   convention — stay single-quoted. Text metrics come from ctx.measure (app-
   common's canvas measure); the char-width fallback keeps the module pure in
   node. opts.upTo (hour index): the flat segments and raw ghost truncate to
   hours ≤ upTo and changeover labels ahead of it are suppressed — "the price
   shape draws itself" during Play; the storage strip stays full (it reads as
   planned/kept, not as unrevealed future) and forExport never passes upTo. */
import {txt, wrapText} from '../../assets/svg.js';

const FONT = 'Charter,Georgia,serif';
const r1 = n => Math.round(n * 10) / 10;
const fallbackMeasure = (t, font) => parseFloat(font) * 0.55 * t.length;

/* Marginal-name → colour, mirroring merit-order's famColour: gas efficiency
   bands step through the thermal tonal ramp (cheap→dirty); everything else
   takes its fuel-family hue. The name is all render-day carries from the engine
   (day.js is unchanged), so the family map is local; an unknown name falls back
   to a neutral grey (never leaks the raw string into a colour attribute). */
const THERMAL_ORDER = ['CCGT 60%', 'CCGT 54%', 'CCGT 49%', 'OCGT 42%', 'OCGT 36%', 'Gas-CCS', 'Hydrogen'];
const NAME_FAMILY = {
  'Wind': 'wind', 'Solar': 'solar', 'Hydro': 'other', 'Nuclear': 'nuclear',
  'Waste/CHP': 'other', 'Biomass': 'biomass', 'Imports': 'imports',
  'BESS': 'storage', 'Pumped storage': 'storage',
};
function segColour(name, palette){
  const ti = THERMAL_ORDER.indexOf(name);
  if(ti >= 0) return palette.thermal[Math.min(ti, palette.thermal.length - 1)];
  const fam = NAME_FAMILY[name];
  return (fam && palette[fam]) || '#888888';
}

export function buildDayVerdict(result, p){
  const {raw, flat, achievedMargin, plannedMargin, dischargedGWh, droppedGWh} = result;
  const at = h => String(h).padStart(2, '0') + ':00';
  const req = (a, b) => Math.round(a) === Math.round(b);
  // plateau: report "from hh:00" when the extreme extends over a run of equal-
  // priced hours (a flat-topped peak/trough), else the single hour "at hh:00"
  const extremeAt = (prices, hour) => {
    let s = hour; while(s > 0 && req(prices[s - 1], prices[hour])) s--;
    let e = hour; while(e < 23 && req(prices[e + 1], prices[hour])) e++;
    return e > s ? `from ${at(s)}` : `at ${at(hour)}`;
  };

  if(p.fleetGW <= 0){
    const {prices, troughHour, peakHour} = raw;
    return `The day's spread is £${Math.round(raw.spread)}: cheapest £${Math.round(prices[troughHour])}/MWh ${extremeAt(prices, troughHour)}, ` +
      `dearest £${Math.round(prices[peakHour])}/MWh ${extremeAt(prices, peakHour)}.`;
  }
  // empty book: a fleet that finds nothing worth trading (spread too thin to
  // cover the round-trip loss) — distinct from a fleet that trades and flattens
  if(dischargedGWh <= 0.05){
    return `${r1(p.fleetGW)} GW of storage finds nothing worth trading: the day's spread (£${Math.round(raw.spread)}) is thinner than the round-trip loss.`;
  }
  const perMW = Math.round(achievedMargin / p.fleetGW);
  const perMWPlanned = Math.round(plannedMargin / p.fleetGW);
  // verb honesty: only claim "flattens X → Y" when the spread actually drops by
  // a whole pound; a small fleet that trades without moving the peak/trough
  // "leaves the day's spread at X"
  const Xr = Math.round(raw.spread), Yr = Math.round(flat.spread);
  const verb = (Xr - Yr >= 1)
    ? `flattens the day's spread £${Xr} → £${Yr}`
    : `leaves the day's spread at £${Xr}`;
  const dropped = droppedGWh > 0.05
    ? ` — walking away from ${r1(droppedGWh)} GWh of trades the day no longer paid for`
    : '';
  return `${r1(p.fleetGW)} GW × ${r1(p.fleetH)} h of storage ${verb}. It planned £${perMWPlanned} per MW per day on the raw shape and kept £${perMW}${dropped}.`;
}

export function renderDay(result, p, ctx, opts = {}){
  const {width, colors} = ctx;
  const measure = ctx.measure || fallbackMeasure;
  const isNarrow = width < 520;
  const storageHue = ctx.palette.storage;
  const solarHue = ctx.palette.solar;
  const gridCol = colors.grid || colors.border || colors.muted;   // themeColors() omits grid on screen
  const {raw, flat, sched} = result;
  const hasFleet = p.fleetGW > 0 && result.dischargedGWh > 0;
  const upTo = opts.upTo;   // draw-as-you-play: truncate the drawn shape to hours ≤ upTo
  const at = h => String(h).padStart(2, '0') + ':00';

  const PLOT_L = isNarrow ? 44 : 116;                   // S1: share renderStack's plot-left
  const M = {l: PLOT_L, r: 32, t: opts.forExport ? 54 : 34};   // top holds the title (+ metrics on export)
  const plotH = 304;                                    // fixed: fleet / no-fleet share the price-shape proportions
  const plotW = width - M.l - M.r;
  const plotBottom = M.t + plotH;
  // content-driven bottom: the strip band only when a fleet trades, else a bare
  // x-axis — so the fleet-0 canvas shrinks instead of reserving an empty strip
  const belowBand = hasFleet ? 82 : 22;                 // strip: 28 gap + 40 strip + 11 cap + 3 ; bare: x-labels
  const baseH = plotBottom + belowBand;

  const dataMaxP = Math.max(...raw.prices, ...flat.prices, 10);
  const minP = Math.min(0, ...raw.prices, ...flat.prices);
  const step = dataMaxP > 150 ? 50 : 25;
  // headroom: pad the domain up to the next gridline so a LABELLED line always
  // sits at/above the data max (an unpadded domain let the true peak float above
  // the topmost label with no reference line)
  const maxP = Math.ceil(dataMaxP / step) * step;
  const x = h => M.l + (h / 23) * plotW;
  const y = v => M.t + plotH - ((v - minP) / (maxP - minP)) * plotH;

  // export verdict: wrapped to the plot width, its own band below the strip
  // caption (or the x labels when no strip) — the canvas grows to hold it
  const vLines = opts.forExport ? wrapText(buildDayVerdict(result, p), '12px ' + FONT, plotW, measure) : [];
  const bandBottom = plotBottom + (hasFleet ? 79 : 16);   // strip-caption / x-label baseline
  const vy0 = bandBottom + 24, vLineH = 18;
  const H = opts.forExport ? Math.max(baseH, Math.round(vy0 + (vLines.length - 1) * vLineH + 12)) : baseH;

  const parts = [`<svg width="${width}" height="${H}" viewBox='0 0 ${width} ${H}' xmlns='http://www.w3.org/2000/svg' font-family='${FONT}' data-tool='intraday'>`];

  // export chrome: page bg + chart card so the PNG stands alone in a deck
  if(opts.forExport){
    parts.push(`<rect x='0' y='0' width='${width}' height='${H}' fill='${colors.bg || colors.card}'/>`);
    const cardTop = M.t - 12, cardBottom = plotBottom + 8;
    parts.push(`<rect x='${r1(M.l - 16)}' y='${cardTop}' width='${r1(plotW + 32)}' height='${cardBottom - cardTop}' rx='8' fill='${colors.card}' stroke='${colors.border || colors.grid || colors.card}'/>`);
  }

  // house anatomy: in-plane letterspaced title (both screen + export)
  parts.push(txt(M.l, 20, isNarrow ? 'INTRADAY PRICE — £/MWh' : 'INTRADAY PRICE — £/MWh across 24 h',
    11.5, colors.muted, {weight: 700, tracking: '.08em'}));
  if(opts.forExport){
    if(typeof ctx.today === 'string')
      parts.push(txt(width - M.r, 20, ctx.today, 11, colors.muted, {anchor: 'end'}));
    const fleetTerm = p.fleetGW > 0 ? ` · fleet ${r1(p.fleetGW)} GW` : '';
    const metrics = isNarrow
      ? `spread £${Math.round(raw.spread)}${fleetTerm}`
      : `spread £${Math.round(raw.spread)} · trough ${at(raw.troughHour)} · peak ${at(raw.peakHour)}${fleetTerm}`;
    parts.push(txt(M.l, 38, metrics, 11, colors.muted));
  }

  // teaching surface: night wash outside sunrise..sunset, solar wash inside —
  // both from already-validated palette values (muted / MERIT_PALETTE.solar) at
  // low alpha on the card surface, so no new hue is introduced
  if(p.sunset > p.sunrise){
    const clamp = v => Math.max(M.l, Math.min(width - M.r, v));
    const xr = clamp(x(p.sunrise)), xs = clamp(x(p.sunset));
    const nightFill = colors.muted + '12', solarFill = solarHue + '1F';
    if(xr > M.l) parts.push(`<rect x='${r1(M.l)}' y='${r1(M.t)}' width='${r1(xr - M.l)}' height='${r1(plotH)}' fill='${nightFill}'/>`);
    if(xs < width - M.r) parts.push(`<rect x='${r1(xs)}' y='${r1(M.t)}' width='${r1(width - M.r - xs)}' height='${r1(plotH)}' fill='${nightFill}'/>`);
    parts.push(`<rect x='${r1(xr)}' y='${r1(M.t)}' width='${r1(xs - xr)}' height='${r1(plotH)}' fill='${solarFill}'/>`);
    const labelY = M.t + plotH - 8;
    if(xr - M.l > measure('NIGHT', '9px ' + FONT) + 12)
      parts.push(`<g opacity='0.6'>` + txt(M.l + 6, labelY, 'NIGHT', 9, colors.muted, {weight: 600, tracking: '.12em'}) + `</g>`);
    const solarLabel = isNarrow ? 'SOLAR' : 'SOLAR WINDOW';
    if(xs - xr > measure(solarLabel, '9px ' + FONT) + 12)
      parts.push(`<g opacity='0.6'>` + txt((xr + xs) / 2, labelY, solarLabel, 9, solarHue, {weight: 600, tracking: '.12em', anchor: 'middle'}) + `</g>`);
  }

  // y grid + labels (maxP is already padded to a step multiple, so the loop's
  // last iteration always lands a labelled line at/above the data peak)
  for(let v = Math.ceil(minP / step) * step; v <= maxP; v += step){
    parts.push(`<line x1='${M.l}' y1='${r1(y(v))}' x2='${width - M.r}' y2='${r1(y(v))}' stroke='${gridCol}' stroke-width='1'/>`);
    parts.push(txt(M.l - 8, y(v) + 4, `£${v}`, 11, colors.muted, {anchor: 'end'}));
  }
  // x labels every 6 h (12 h narrow)
  for(let h = 0; h <= 23; h += isNarrow ? 12 : 6)
    parts.push(txt(x(h), plotBottom + 16, `${String(h).padStart(2, '0')}:00`, 11, colors.muted, {anchor: 'middle'}));

  // raw shape: muted dashed ghost behind the coloured line (fleet only)
  if(hasFleet){
    const pts = upTo != null ? raw.prices.slice(0, upTo + 1) : raw.prices;
    parts.push(`<polyline data-raw-shape='' points='` +
      pts.map((v, h) => `${r1(x(h))},${r1(y(v))}`).join(' ') +
      `' fill='none' stroke='${colors.muted}' stroke-width='2' stroke-dasharray='5 4' opacity='0.55'/>`);
  }

  // flat (achieved) price line: one segment per hour-step, hued by that hour's
  // marginal fuel family (segColour, mirroring merit-order). Segments share
  // endpoints (round caps) so they read as one continuous line; the colour
  // changes exactly at a changeover tick. At fleet 0 flat === raw, so the
  // coloured line IS the lesson.
  const flatSegs = [];
  const lastSeg = upTo != null ? Math.min(upTo, 23) : 23;
  for(let h = 0; h < lastSeg; h++){
    const col = segColour(flat.hours[h].marginal, ctx.palette);
    flatSegs.push(`<line x1='${r1(x(h))}' y1='${r1(y(flat.prices[h]))}' x2='${r1(x(h + 1))}' y2='${r1(y(flat.prices[h + 1]))}' stroke='${col}' stroke-width='2.5' stroke-linecap='round'/>`);
  }
  parts.push(`<g data-flat-shape=''>` + flatSegs.join('') + `</g>`);

  // changeover ticks: short marks at the top of the plot where the incoming
  // marginal unit takes the price. Labels that would run off the canvas (h23
  // sits ON the right plot edge) anchor end — so a fixed tick-to-tick distance
  // can't tell crowding on its own: the last label often flips to end-anchor and
  // grows LEFTWARD, back over its neighbour. At narrow widths, measure each
  // label's real left/right extent (anchor-aware) and drop it if that box would
  // land within ~6px of the last one actually drawn — the tick always stays
  // (it's the honest signal). At non-narrow widths there's headroom to keep
  // every label: a colliding label drops to a second row (+12px) instead of
  // being dropped — two independent "last extent drawn" trackers, one per row.
  const TICK = 12;
  let lastLabelR = -Infinity;
  const rowR = [-Infinity, -Infinity];
  for(const c of flat.changeovers){
    const cx = x(c.h);
    parts.push(`<line x1='${r1(cx)}' y1='${M.t}' x2='${r1(cx)}' y2='${M.t + TICK}' stroke='${colors.accent}' stroke-width='1.5' opacity='0.7'/>`);
    if(upTo != null && c.h > upTo) continue;   // draw-as-you-play: no label ahead of the cursor
    const w = measure(c.to, '10px ' + FONT);
    const overflows = cx + 3 + w > width - 2;
    const labelL = overflows ? cx - 3 - w : cx + 3;
    if(isNarrow){
      if(labelL < lastLabelR + 6) continue;
      lastLabelR = labelL + w;
      if(overflows) parts.push(txt(cx - 3, M.t + 10, c.to, 10, colors.accent, {anchor: 'end'}));
      else parts.push(txt(cx + 3, M.t + 10, c.to, 10, colors.accent));
      continue;
    }
    const row = labelL >= rowR[0] + 6 ? 0 : 1;
    rowR[row] = labelL + w;
    const ly = M.t + 10 + row * 12;
    if(overflows) parts.push(txt(cx - 3, ly, c.to, 10, colors.accent, {anchor: 'end'}));
    else parts.push(txt(cx + 3, ly, c.to, 10, colors.accent));
  }

  // storage strip: charge below the strip midline, discharge above; abandoned
  // (back-off-dropped) volumes as dashed unfilled ghosts stacked directly on
  // top of the kept bars. Strip is 40px tall and every non-zero bar gets a
  // MIN_BAR_H floor so a real-but-tiny kept/dropped volume never disappears.
  // Ghosts anchor off the (possibly floored) kept height, not the raw scaled
  // value, so kept+ghost always stack flush with no gap or overlap.
  if(hasFleet){
    const stripY = plotBottom + 28, stripH = 40, mid = stripY + stripH / 2;
    const barW = plotW / 24 * 0.7;
    const MIN_BAR_H = 2;
    const planSched = result.planSched;
    const barScale = (stripH / 2) / Math.max(...planSched.charge, ...planSched.discharge, 0.1);
    const barH = v => v > 0.01 ? Math.max(MIN_BAR_H, v * barScale) : 0;
    for(let h = 0; h < 24; h++){
      const dDis = planSched.discharge[h] - sched.discharge[h];
      const dChg = planSched.charge[h] - sched.charge[h];
      const keptDisH = barH(sched.discharge[h]), keptChgH = barH(sched.charge[h]);
      if(dDis > 0.01)
        parts.push(`<rect data-dropped='' x='${r1(x(h) - barW / 2)}' y='${r1(mid - keptDisH - barH(dDis))}' width='${r1(barW)}' height='${r1(barH(dDis))}' fill='none' stroke='${storageHue}' stroke-width='1' stroke-dasharray='3 2' opacity='0.55'/>`);
      if(dChg > 0.01)
        parts.push(`<rect data-dropped='' x='${r1(x(h) - barW / 2)}' y='${r1(mid + keptChgH)}' width='${r1(barW)}' height='${r1(barH(dChg))}' fill='none' stroke='${storageHue}' stroke-width='1' stroke-dasharray='3 2' opacity='0.55'/>`);
      if(keptDisH > 0)
        parts.push(`<rect data-discharge='' x='${r1(x(h) - barW / 2)}' y='${r1(mid - keptDisH)}' width='${r1(barW)}' height='${r1(keptDisH)}' fill='${storageHue}'/>`);
      if(keptChgH > 0)
        parts.push(`<rect data-charge='' x='${r1(x(h) - barW / 2)}' y='${r1(mid)}' width='${r1(barW)}' height='${r1(keptChgH)}' fill='${storageHue}' opacity='0.45'/>`);
    }
    parts.push(txt(M.l, stripY + stripH + 11,
      isNarrow ? 'dashed = abandoned' : 'discharge ↑ / charge ↓ · dashed = planned then abandoned',
      10, colors.muted));
  }

  // scrub cursor: ink, dashed — distinct from the coloured line, the muted ghost
  // and the accent changeover ticks
  if(opts.cursor != null){
    parts.push(`<line data-cursor='${opts.cursor}' x1='${r1(x(opts.cursor))}' y1='${M.t}' x2='${r1(x(opts.cursor))}' y2='${r1(M.t + plotH)}' stroke='${colors.ink}' stroke-width='1.5' stroke-dasharray='2 3'/>`);
  }
  if(opts.forExport)
    parts.push(`<g data-verdict=''>` +
      vLines.map((l, i) => txt(M.l, vy0 + i * vLineH, l, 12, colors.ink)).join('') + `</g>`);

  parts.push('</svg>');
  return parts.join('');
}
