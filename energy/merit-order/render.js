/* Pure renderer: {generators, demand} → dispatch() result → a supply-stack SVG.
   x = cumulative capacity (GW, cheapest-first — result.sorted's own order);
   y = price (£/MWh), a fixed £0 line, negative region below it. XML discipline
   throughout: txt()/esc() for content; hand-built tags single-quoted, numbers
   and tokens only. Root <svg> carries double-quoted integer width/height so
   the PNG export path (svgToCanvas) can read them.

   Colour language (tokens only, via ctx.colors):
   - dispatched capacity: C.ink, solid — "this MW is running"
   - stranded capacity:   C.muted, dimmed — "this MW is not"
   - rent (cost < clearing, on the dispatched slice): a translucent C.accent
     overlay — the one place colour calls out "this plant earns above its
     running cost" (never "profit" — no fixed costs are priced here)
   - marginal plant + clearing line: C.accent — "this sets the price"
   - clearingPrice < 0: C.err tint below £0 + the line's label reads in words
     ("paying to generate"), not just a numeral that happens to be negative */
import {esc, txt, tint, wrapText} from '../../assets/svg.js';
import {dispatch} from './engine.js';

const FONT = 'Charter,Georgia,serif';
const r2 = n => Math.round(n * 100) / 100;
const fmtGW = v => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');
const fmtPrice = v => Math.round(v).toString();

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
  if(cp < 0) parts.push('The market is paying to generate: price runs negative until the must-run block clears.');
  if(result.unmet > 0) parts.push(`${fmtGW(result.unmet)} GW of demand goes unmet — capacity runs out first.`);
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

export function renderStack(state, ctx){
  const C = ctx.colors;
  const result = dispatch(state.generators, state.demand);
  const cp = result.clearingPrice;

  const W = 1200;
  const x0 = 116, x1 = W - 32;
  const y0 = 64, chartH = 320, y1 = y0 + chartH;

  const costs = result.sorted.map(g => g.cost);
  const pMin = Math.min(-50, ...costs);
  const pMax = Math.max(300, ...costs);
  const totalCapacity = result.sorted.reduce((s, g) => s + g.capacity, 0);
  const maxX = Math.max(totalCapacity, state.demand, 1) * 1.04;

  const sx = gw => x0 + (Math.max(0, gw) / maxX) * (x1 - x0);
  const sy = price => y1 - ((price - pMin) / (pMax - pMin)) * (y1 - y0);

  const P = [];

  // --- plant stack (built first so height chrome below can reference it) ---
  const stackRows = [];
  let before = 0;
  for(const g of result.sorted){
    const pp = result.perPlant[g.name];
    const xA = sx(before), xB = sx(before + pp.dispatchedMW), xC = sx(before + g.capacity);
    const yTop = Math.min(sy(g.cost), sy(0)), yBot = Math.max(sy(g.cost), sy(0));
    const h = Math.max(0, yBot - yTop);
    const isMarginal = result.marginalName === g.name;
    const rows = [`<g data-plant='${esc(g.name)}'>`];

    if(pp.dispatchedMW > 0){
      rows.push(`<rect x='${r2(xA)}' y='${r2(yTop)}' width='${r2(xB - xA)}' height='${r2(h)}' fill='${C.ink}'` +
        (isMarginal ? ` stroke='${C.accent}' stroke-width='2'` : '') + `/>`);
    }
    if(pp.strandedMW > 0){
      rows.push(`<rect x='${r2(xB)}' y='${r2(yTop)}' width='${r2(xC - xB)}' height='${r2(h)}' fill='${C.muted}' opacity='0.35'/>`);
    }
    if(pp.dispatchedMW > 0 && g.cost < cp){
      const ryA = sy(cp), ryB = sy(g.cost);
      rows.push(`<rect class='rent' x='${r2(xA)}' y='${r2(Math.min(ryA, ryB))}' width='${r2(xB - xA)}' ` +
        `height='${r2(Math.abs(ryB - ryA))}' fill='${tint(C.accent)}'/>`);
    }
    if(isMarginal){
      const midX = (xA + xB) / 2;
      const labelY = (yTop - 10 >= y0) ? yTop - 10 : yTop + 14;
      rows.push(txt(midX, labelY, 'MARGINAL · sets the price', 11, C.accent, {weight: 700, anchor: 'middle'}));
    }
    if(g.mustRun && pp.strandedMW > 0){
      const midX = (xB + xC) / 2;
      const labelY = (yTop - 10 >= y0) ? yTop - 10 : yTop + 14;
      rows.push(txt(midX, labelY, 'would generate anyway', 10.5, C.muted, {anchor: 'middle'}));
    }
    // plant name caption under the axis
    const capMidX = (xA + xC) / 2;
    rows.push(txt(capMidX, y1 + 22, g.name, 12, C.muted, {anchor: 'middle', weight: 600}));

    rows.push('</g>');
    stackRows.push(rows.join(''));
    before += g.capacity;
  }

  const tickY = y1 + 44;
  const showLegend = result.totalRent > 0;
  const legendY = tickY + 26;
  const verdictTopBase = (showLegend ? legendY : tickY) + 34;
  const verdictText = buildVerdict(result, state);
  const vLines = wrapText(verdictText, '15px ' + FONT, W - 64 - 32, ctx.measure);
  const vBlockH = 28 + vLines.length * 22 + 16;
  const H = Math.round(verdictTopBase + vBlockH + 24);

  P.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
  P.push(`<rect width='${W}' height='${H}' fill='${C.bg}'/>`);
  P.push(txt(x0, 34, 'MERIT ORDER — £/MWh vs cumulative GW dispatched', 11.5, C.muted, {weight: 700, tracking: '.08em'}));

  // chart card
  P.push(`<rect x='${x0 - 16}' y='${y0 - 16}' width='${x1 - x0 + 32}' height='${chartH + 32}' rx='8' fill='${C.card}' stroke='${C.border}'/>`);

  // negative-price warning band: drawn as backdrop, before the bars
  if(cp < 0){
    P.push(`<rect class='negative-band' x='${r2(x0)}' y='${r2(sy(0))}' width='${r2(x1 - x0)}' height='${r2(y1 - sy(0))}' fill='${tint(C.err)}'/>`);
  }

  P.push(...stackRows);

  // £0 line — always drawn
  P.push(`<line class='zero-line' x1='${r2(x0)}' y1='${r2(sy(0))}' x2='${r2(x1)}' y2='${r2(sy(0))}' stroke='${C.border}' stroke-width='1.5'/>`);
  P.push(txt(x0 - 10, sy(0) + 4, '£0', 12, C.muted, {anchor: 'end'}));
  P.push(txt(x0 - 10, y0 + 4, `£${fmtPrice(pMax)}`, 11, C.muted, {anchor: 'end'}));
  P.push(txt(x0 - 10, y1 + 4, `£${fmtPrice(pMin)}`, 11, C.muted, {anchor: 'end'}));

  // clearing-price line
  const clearCol = cp < 0 ? C.err : C.accent;
  P.push(`<line class='clearing-line' x1='${r2(x0)}' y1='${r2(sy(cp))}' x2='${r2(x1)}' y2='${r2(sy(cp))}' ` +
    `stroke='${clearCol}' stroke-width='2' stroke-dasharray='6 4'/>`);
  const clearLabel = cp < 0 ? `paying to generate — £${fmtPrice(cp)}/MWh clears` : `clears at £${fmtPrice(cp)}/MWh`;
  P.push(txt(x1, sy(cp) - 8, clearLabel, 12.5, clearCol, {anchor: 'end', weight: 700}));

  // demand line
  P.push(`<line class='demand-line' x1='${r2(sx(state.demand))}' y1='${r2(y0)}' x2='${r2(sx(state.demand))}' y2='${r2(y1)}' ` +
    `stroke='${C.ink}' stroke-width='1.5' stroke-dasharray='4 3'/>`);
  P.push(txt(sx(state.demand), y0 - 8, `demand ${fmtGW(state.demand)} GW`, 12, C.ink, {anchor: 'middle', weight: 600}));

  // capacity axis ticks
  P.push(txt(x0, tickY, '0 GW', 11, C.muted));
  P.push(txt(x1, tickY, `${fmtGW(totalCapacity)} GW installed`, 11, C.muted, {anchor: 'end'}));

  // rent legend (only meaningful when something is actually shaded)
  if(showLegend){
    P.push(`<rect x='${x0}' y='${legendY - 11}' width='14' height='14' fill='${tint(C.accent)}' stroke='${C.accent}'/>`);
    P.push(txt(x0 + 20, legendY, 'shaded = earns above running cost', 11.5, C.muted));
  }

  // verdict
  const vy = (showLegend ? legendY : tickY) + 30;
  P.push(`<rect x='${x0 - 16}' y='${r2(vy)}' width='4' height='${vLines.length * 22 + 8}' fill='${C.accent}'/>`);
  P.push(txt(x0, vy - 4, 'THE TRADE', 11.5, C.muted, {weight: 700, tracking: '.08em'}));
  vLines.forEach((l, i) => P.push(txt(x0, vy + 20 + i * 22, l, 15, C.ink)));

  P.push('</svg>');
  return P.join('');
}

export function toMarkdown(state, result){
  const verdictText = buildVerdict(result, state);
  const lines = ['| Plant | Cost £/MWh | Dispatched GW | Stranded GW | Rent £/h |', '|---|---|---|---|---|'];
  for(const g of result.sorted){
    const pp = result.perPlant[g.name];
    lines.push(`| ${g.name} | ${fmtPrice(g.cost)} | ${fmtGW(pp.dispatchedMW)} | ${fmtGW(pp.strandedMW)} | ${Math.round(pp.rent)} |`);
  }
  return `**Merit order** — ${verdictText}\n\n` + lines.join('\n') +
    `\n\nClears at £${fmtPrice(result.clearingPrice)}/MWh · demand ${fmtGW(state.demand)} GW` +
    (result.marginalName ? ` · marginal ${result.marginalName}` : '') +
    `\n\nenergy.matthewgarner.me/merit-order`;
}
