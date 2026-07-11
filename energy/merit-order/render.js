/* Pure renderer: {generators, demand} → dispatch() result → a GB supply-stack SVG.
   x = cumulative capacity (GW offered, cheapest-first — result.sorted's order);
   y = price (£/MWh), fixed £0 line, negative region below it. XML discipline:
   txt()/esc() for content; hand-built tags single-quoted, numbers/tokens only.
   Root <svg> carries double-quoted integer width/height so the PNG export path
   (svgToCanvas) can read them.

   Colour language: each block is filled by its FUEL FAMILY hue (ctx.palette) —
   the gas fleet is one hue in 5 tonal steps (the efficiency staircase); storage
   is one hue + a diagonal hatch + data-storage marker ("not a fuelled plant").
   dispatched = solid family fill; stranded = same fill, dimmed. Rent overlay
   (translucent accent) on any dispatched block bidding below the clearing price —
   for storage that overlay IS the arbitrage spread. Marginal block + clearing
   line = accent; clearingPrice < 0 = err tint below £0 + worded label. */
import {esc, txt, tint, wrapText} from '../../assets/svg.js';
import {dispatch} from './engine.js';

const FONT = 'Charter,Georgia,serif';
const r2 = n => Math.round(n * 100) / 100;
const fmtGW = v => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');
const fmtPrice = v => Math.round(v).toString();

/* Fuel-family palette — validated with the dataviz validate_palette.js against the
   card surface both themes (light #FFFFFF worst-adjacent ΔE 12.9; dark #1B242C ΔE
   11.4, floor band — legitimate given in-place labels + 2px gaps + storage hatch).
   `thermal` is a 5-step tonal ramp (cheap→dirty) for the gas efficiency staircase. */
/* thermal ramp: 5 gas efficiency steps (cheap→dirty) + 2 Phase-2 net-zero blocks —
   gas-CCS (index 5, a greyed "abated" red) and hydrogen (index 6, a deep distinct
   red). CCS/H₂ colour is by TYPE (THERMAL_ORDER index), not cost, and their dot/
   cross-hatch textures + own labels carry the real distinction (≤8 chart hues). */
export const MERIT_PALETTE = {
  light: {
    wind:'#2a78d6', solar:'#eda100', nuclear:'#4a3aa7', biomass:'#008300',
    storage:'#1baf7a', imports:'#e87ba4', other:'#eb6834',
    thermal:['#f4a3a2', '#ec7675', '#e34948', '#bf3636', '#932a2d', '#b5766a', '#722a4e'],
  },
  dark: {
    wind:'#3987e5', solar:'#c98500', nuclear:'#9085e9', biomass:'#008300',
    storage:'#199e70', imports:'#d55181', other:'#d95926',
    thermal:['#f2a6a6', '#ec8585', '#e66767', '#d24f4f', '#b93c3c', '#cf9a8c', '#c46a8e'],
  },
};
export const THERMAL_ORDER = ['CCGT 60%', 'CCGT 54%', 'CCGT 49%', 'OCGT 42%', 'OCGT 36%', 'Gas-CCS', 'Hydrogen'];
const FAM_LABEL = {thermal: 'Gas', storage: 'Storage'};   // multi-block runs; single blocks use their own name

/* thermal blocks step through the tonal ramp by band; everything else takes its
   family hue. NOTE for Phase 2: CCS/H₂ tonal thermal steps must set `thermal:true`
   AND get a THERMAL_ORDER entry, else palette.thermal (an array) would stringify. */
function famColour(g, palette){
  if(g.thermal){ const i = THERMAL_ORDER.indexOf(g.name); return palette.thermal[i >= 0 ? i : palette.thermal.length - 1]; }
  return palette[g.family] || '#888888';
}

/* One quotable line (+ clauses) built from a dispatch() result. Shared by the
   SVG verdict and toMarkdown so the two never drift. */
export function buildVerdict(result, state){
  const cp = result.clearingPrice;
  const parts = [];
  if(result.marginalName){
    parts.push(`${fmtGW(state.demand)} GW of demand clears at £${fmtPrice(cp)}/MWh — ` +
      `${result.marginalName} is the marginal plant and sets the price.`);
  } else {
    parts.push('No demand to clear — nothing dispatches, and no plant sets a price.');
  }
  if(result.marginalName === 'Hydrogen' || result.marginalName === 'Gas-CCS'){
    parts.push('The wind has dropped and gas is scarce — a net-zero grid’s firm low-carbon backup (hydrogen or gas-CCS) sets the price, not cheap gas.');
  }
  if(cp < 0) parts.push('The market is paying to generate: price runs negative until the must-run block clears.');
  if(result.unmet > 0) parts.push(`${fmtGW(result.unmet)} GW of demand goes unmet — capacity runs out first.`);
  const storageRent = result.sorted.filter(g => g.storage)
    .reduce((s, g) => s + result.perPlant[g.name].rent, 0);
  if(storageRent > 0){
    parts.push('Storage is dispatched ahead of gas — the shaded rent on it is the arbitrage spread it earns, not a fuel margin.');
  }
  const mustRunStranded = result.sorted.filter(g => g.mustRun)
    .reduce((s, g) => s + result.perPlant[g.name].strandedMW, 0);
  if(mustRunStranded > 0){
    parts.push(`${fmtGW(mustRunStranded)} GW would generate anyway — curtailed or exported, simplified away here.`);
  }
  if(result.totalRent > 0){
    parts.push('Shaded plants earn above running cost on every MW they dispatch — that rent, not the price itself, is what the merit order redistributes.');
  }
  return parts.join(' ');
}

export function renderStack(state, ctx, opts = {}){
  const C = ctx.colors;
  const P8 = ctx.palette;
  const result = dispatch(state.generators, state.demand);
  const cp = result.clearingPrice;

  const NARROW = 520;
  const isNarrow = !!(ctx.width && ctx.width < NARROW);
  const W = ctx.width ?? 1200;
  const x0 = isNarrow ? 44 : 116, x1 = W - 32;
  const y0 = 64, chartH = 320, y1 = y0 + chartH;

  const costs = result.sorted.map(g => g.cost);
  const pMin = Math.min(-50, ...costs);
  const pMax = Math.max(300, ...costs);
  const totalOffered = result.sorted.reduce((s, g) => s + g.capacity, 0);
  const maxX = Math.max(totalOffered, state.demand, 1) * 1.04;

  const sx = gw => x0 + (Math.max(0, gw) / maxX) * (x1 - x0);
  const sy = price => y1 - ((price - pMin) / (pMax - pMin)) * (y1 - y0);

  const P = [];

  // --- plant stack ---
  const stackRows = [];
  const runs = [];   // {family, name, x0gw, x1gw} contiguous same-family runs, for labels
  let before = 0;
  for(const g of result.sorted){
    const pp = result.perPlant[g.name];
    const xA = sx(before), xB = sx(before + pp.dispatchedMW), xC = sx(before + g.capacity);
    const yTop = Math.min(sy(g.cost), sy(0)), yBot = Math.max(sy(g.cost), sy(0));
    const h = Math.max(0, yBot - yTop);
    const isMarginal = result.marginalName === g.name;
    const fill = famColour(g, P8);

    if(g.capacity > 0){
      // texture marks the non-plain-fuel blocks: storage hatch, CCS dots, hydrogen cross-hatch
      const texId = g.storage ? 'mo-hatch' : g.family === 'ccs' ? 'mo-dots' : g.family === 'hydrogen' ? 'mo-cross' : null;
      const texAttr = g.storage ? " data-storage='1'" : g.family === 'ccs' ? " data-tex='ccs'" : g.family === 'hydrogen' ? " data-tex='h2'" : '';
      const rows = [`<g data-plant='${esc(g.name)}'${texAttr}>`];
      if(pp.dispatchedMW > 0){
        rows.push(`<rect x='${r2(xA)}' y='${r2(yTop)}' width='${r2(xB - xA)}' height='${r2(h)}' fill='${fill}'` +
          (isMarginal ? ` stroke='${C.accent}' stroke-width='2'` : '') + `/>`);
        if(texId){   // pattern overlay: not a plain fuelled plant
          rows.push(`<rect x='${r2(xA)}' y='${r2(yTop)}' width='${r2(xB - xA)}' height='${r2(h)}' fill='url(#${texId})'/>`);
        }
      }
      if(pp.strandedMW > 0){
        rows.push(`<rect x='${r2(xB)}' y='${r2(yTop)}' width='${r2(xC - xB)}' height='${r2(h)}' fill='${fill}' opacity='0.3'/>`);
      }
      if(pp.dispatchedMW > 0 && g.cost < cp){
        const ryA = sy(cp), ryB = sy(g.cost);
        rows.push(`<rect class='rent' x='${r2(xA)}' y='${r2(Math.min(ryA, ryB))}' width='${r2(xB - xA)}' ` +
          `height='${r2(Math.abs(ryB - ryA))}' fill='${tint(C.accent)}'/>`);
      }
      if(isMarginal){
        const midX = (xA + xB) / 2;
        // the marginal block's top sits ON the clearing line, so lift the badge clear of the
        // clearing-price label (which rides just above that line) to avoid a top-right collision
        const labelY = (yTop - 26 >= y0) ? yTop - 26 : yTop + 14;
        if(isNarrow){
          // narrow drops the per-run axis labels, so name the marginal plant here (it follows the
          // demand drag); x-clamp to the plot so a left-edge marginal (e.g. negative-price wind)
          // can't clip off-canvas
          const halfW = ctx.measure(g.name, '700 11px ' + FONT) / 2;
          const lx = Math.max(x0 + halfW, Math.min(x1 - halfW, midX));
          rows.push(txt(lx, labelY, g.name, 11, C.accent, {weight: 700, anchor: 'middle'}));
        } else {
          rows.push(txt(midX, labelY, 'MARGINAL · sets the price', 11, C.accent, {weight: 700, anchor: 'middle', halo: C.card}));
        }
      }
      rows.push('</g>');
      stackRows.push(rows.join(''));
    }

    // group into runs for the axis labels (skip zero-width blocks)
    if(g.capacity > 0){
      const last = runs[runs.length - 1];
      if(last && last.family === g.family){ last.x1gw = before + g.capacity; last.count++; last.name = g.name; }
      else runs.push({family: g.family, name: g.name, x0gw: before, x1gw: before + g.capacity, count: 1});
    }
    before += g.capacity;
  }

  const tickY = y1 + 44;
  const showLegend = result.totalRent > 0;
  const legendY = tickY + 26;
  const verdictTopBase = (showLegend ? legendY : tickY) + 34;
  const verdictText = buildVerdict(result, state);
  const vLines = wrapText(verdictText, '15px ' + FONT, x1 - x0, ctx.measure);
  const vBlockH = 28 + vLines.length * 22 + 16;
  const H = Math.round((opts.forExport ? verdictTopBase + vBlockH : verdictTopBase) + 24);

  P.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
  P.push(`<defs>` +
    `<pattern id='mo-hatch' width='6' height='6' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>` +
    `<line x1='0' y1='0' x2='0' y2='6' stroke='${C.card}' stroke-width='1.6' opacity='0.55'/></pattern>` +
    `<pattern id='mo-dots' width='6' height='6' patternUnits='userSpaceOnUse'>` +
    `<circle cx='3' cy='3' r='1.15' fill='${C.card}' opacity='0.6'/></pattern>` +
    `<pattern id='mo-cross' width='7' height='7' patternUnits='userSpaceOnUse'>` +
    `<path d='M0 0 L7 7 M7 0 L0 7' stroke='${C.card}' stroke-width='1' opacity='0.5'/></pattern>` +
    `</defs>`);
  P.push(`<rect width='${W}' height='${H}' fill='${C.bg}'/>`);
  P.push(txt(x0, 34, isNarrow ? 'MERIT ORDER — £/MWh' : 'MERIT ORDER — £/MWh vs cumulative GW offered', 11.5, C.muted, {weight: 700, tracking: '.08em'}));

  // chart card
  P.push(`<rect x='${x0 - 16}' y='${y0 - 16}' width='${x1 - x0 + 32}' height='${chartH + 32}' rx='8' fill='${C.card}' stroke='${C.border}'/>`);

  // negative-price warning band: backdrop, before the bars
  if(cp < 0){
    P.push(`<rect class='negative-band' x='${r2(x0)}' y='${r2(sy(0))}' width='${r2(x1 - x0)}' height='${r2(y1 - sy(0))}' fill='${tint(C.err)}'/>`);
  }

  P.push(...stackRows);

  // £0 line
  P.push(`<line class='zero-line' x1='${r2(x0)}' y1='${r2(sy(0))}' x2='${r2(x1)}' y2='${r2(sy(0))}' stroke='${C.border}' stroke-width='1.5'/>`);
  P.push(txt(x0 - 10, sy(0) + 4, '£0', 12, C.muted, {anchor: 'end'}));
  P.push(txt(x0 - 10, y0 + 4, `£${fmtPrice(pMax)}`, 11, C.muted, {anchor: 'end'}));
  P.push(txt(x0 - 10, y1 + 4, `£${fmtPrice(pMin)}`, 11, C.muted, {anchor: 'end'}));

  // family-run labels under the axis (in-place identity — never colour-only)
  // opts.labelCollide === 'drop' (opt-in; intraday's storage-less stack) adds
  // collision-aware suppression on the desktop branch: measure each label's
  // text extent (ctx.measure — same heuristic as the marginal label above),
  // compare against the previously KEPT label's extent, and on overlap keep
  // the wider run's label (the narrow branch's thin-sliver spirit, decided by
  // text extent). Absent/other values keep today's unconditional behaviour —
  // merit-order's own fixtures (negative, fes-ht, fes-he-coldpeak) have
  // pre-existing collisions and stay pinned until opted in deliberately.
  let labelRuns = runs;
  if(!isNarrow && opts.labelCollide === 'drop'){
    const kept = [];
    for(const run of runs){
      const label = run.count > 1 ? (FAM_LABEL[run.family] || run.name) : run.name;
      const midX = (sx(run.x0gw) + sx(run.x1gw)) / 2;
      const halfLabelW = ctx.measure(label, '600 12px ' + FONT) / 2;
      const cand = {run, runW: sx(run.x1gw) - sx(run.x0gw), left: midX - halfLabelW, right: midX + halfLabelW};
      const prev = kept[kept.length - 1];
      if(prev && cand.left < prev.right){
        if(cand.runW > prev.runW) kept[kept.length - 1] = cand;   // wider run keeps its label
        continue;   // the narrower of the colliding pair is dropped either way
      }
      kept.push(cand);
    }
    labelRuns = kept.map(k => k.run);
  }
  for(const run of labelRuns){
    const label = run.count > 1 ? (FAM_LABEL[run.family] || run.name) : run.name;
    const midX = (sx(run.x0gw) + sx(run.x1gw)) / 2;
    if(isNarrow){   // rotate so fuel labels don't overlap in a narrow stack
      const runW = sx(run.x1gw) - sx(run.x0gw);
      if(runW < 22){ continue; }   // drop the thin sliver labels (they collide even rotated); keep the wide ones — the marginal is named above its bar, tap any block to identify it
      P.push(`<g transform='rotate(-35 ${r2(midX)} ${y1 + 16})'>` +
        txt(midX, y1 + 16, label, 10.5, C.muted, {anchor: 'end', weight: 600}) + '</g>');
    } else
      P.push(txt(midX, y1 + 22, label, 12, C.muted, {anchor: 'middle', weight: 600}));
  }

  // clearing-price line
  const clearCol = cp < 0 ? C.err : C.accent;
  P.push(`<line class='clearing-line' x1='${r2(x0)}' y1='${r2(sy(cp))}' x2='${r2(x1)}' y2='${r2(sy(cp))}' ` +
    `stroke='${clearCol}' stroke-width='2' stroke-dasharray='6 4'/>`);
  const clearLabel = isNarrow
    ? `£${fmtPrice(cp)}/MWh` + (cp < 0 ? ' — paying' : '')
    : (cp < 0 ? `paying to generate — £${fmtPrice(cp)}/MWh clears` : `clears at £${fmtPrice(cp)}/MWh`);
  P.push(txt(isNarrow ? x0 : x1, sy(cp) - 8, clearLabel, 12.5, clearCol, {anchor: isNarrow ? 'start' : 'end', weight: 700}));

  // demand line — opts.demandLabel (opt-in, intraday) replaces the annotation
  // verbatim: its storage fleet nets demand through charge/discharge, so the
  // default `demand X GW` would quote a number the sliders no longer show.
  // Absent ⇒ today's label, byte-identical (golden-pinned).
  P.push(`<line class='demand-line' x1='${r2(sx(state.demand))}' y1='${r2(y0)}' x2='${r2(sx(state.demand))}' y2='${r2(y1)}' ` +
    `stroke='${C.ink}' stroke-width='1.5' stroke-dasharray='4 3'/>`);
  P.push(txt(sx(state.demand), y0 - 8, opts.demandLabel ?? `demand ${fmtGW(state.demand)} GW`, 12, C.ink, {anchor: 'middle', weight: 600}));

  // capacity axis ticks
  P.push(txt(x0, tickY, '0 GW', 11, C.muted));
  P.push(txt(x1, tickY, `${fmtGW(totalOffered)} GW offered`, 11, C.muted, {anchor: 'end'}));

  // rent legend — opts.legendStorageNote:false (opt-in, intraday) drops the
  // storage clause: its hourStack excludes every storage row, so the clause
  // describes a block that can't exist there. Absent/true ⇒ today's text,
  // byte-identical (golden-pinned). Narrow already omits the clause.
  if(showLegend){
    P.push(`<rect x='${x0}' y='${legendY - 11}' width='14' height='14' fill='${tint(C.accent)}' stroke='${C.accent}'/>`);
    P.push(txt(x0 + 20, legendY, (isNarrow || opts.legendStorageNote === false)
      ? 'shaded = earns above running cost'
      : 'shaded = earns above running cost (storage: the arbitrage spread)', 11.5, C.muted));
  }

  // narrow drops the thin sliver labels — point at the tap callout for identifying them
  if(isNarrow){
    P.push(txt(x0, (showLegend ? legendY : tickY) + 22, 'tap a band to name it', 11, C.muted));
  }

  // verdict — export-only (HTML #verdict carries it on screen)
  if(opts.forExport){
    const vy = (showLegend ? legendY : tickY) + 30;
    P.push(`<rect x='${x0 - 16}' y='${r2(vy)}' width='4' height='${vLines.length * 22 + 8}' fill='${C.accent}'/>`);
    P.push(txt(x0, vy - 4, 'THE TRADE', 11.5, C.muted, {weight: 700, tracking: '.08em'}));
    vLines.forEach((l, i) => P.push(txt(x0, vy + 20 + i * 22, l, 15, C.ink)));
  }

  P.push('</svg>');
  return P.join('');
}

export function toMarkdown(state, result){
  const verdictText = buildVerdict(result, state);
  const lines = ['| Plant | Cost £/MWh | Dispatched GW | Stranded GW | Rent £/h |', '|---|---|---|---|---|'];
  for(const g of result.sorted){
    if(g.capacity <= 0) continue;
    const pp = result.perPlant[g.name];
    lines.push(`| ${g.name} | ${fmtPrice(g.cost)} | ${fmtGW(pp.dispatchedMW)} | ${fmtGW(pp.strandedMW)} | ${Math.round(pp.rent)} |`);
  }
  return `**Merit order** — ${verdictText}\n\n` + lines.join('\n') +
    `\n\nClears at £${fmtPrice(result.clearingPrice)}/MWh · demand ${fmtGW(state.demand)} GW` +
    (result.marginalName ? ` · marginal ${result.marginalName}` : '') +
    `\n\nenergy.matthewgarner.me/merit-order`;
}
