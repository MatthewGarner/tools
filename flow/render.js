/* Flow readout → SVG string. Pure: colours and text measure come from ctx.
   Layout: verdict block, cycle-time histogram, two small WIP-sweep charts
   (never dual-axis). This SVG is what exports — the canvas strip never does. */
import {esc} from '../assets/svg.js';

const W = 860, PAD = 26;

const day = n => {
  const v = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return v + (v === 1 ? ' day' : ' days');
};
const f1 = n => (Math.round(n * 10) / 10).toString();

export function renderReadout(result, sweep, knee, params, ctx){
  const C = ctx.colors;
  const s = [];
  let y = PAD + 6;

  /* ---- verdict ---- */
  const overloaded = result.backlogSlopePerWeek > 0.5;
  s.push(txt(PAD, y + 14, 'THE HEADLINE', 10, C.muted, {weight: 600, tracking: 1}));
  y += 38;
  const lead = result.lead;
  s.push('<text x="' + PAD + '" y="' + y + '" font-size="19" fill="' + C.ink + '">' +
    'A typical item takes <tspan font-weight="700">' + esc(day(lead.p50)) + '</tspan>' +
    ' — <tspan font-weight="600">' + esc(day(result.workDays)) + ' working</tspan>, ' +
    '<tspan font-weight="600" fill="' + C.err + '">' + esc(day(Math.max(0, lead.p50 - result.workDays))) + ' waiting</tspan>.' +
    '</text>');
  y += 24;
  s.push(txt(PAD, y, 'P85 ' + day(lead.p85) + ' · P95 ' + day(lead.p95) +
    ' · throughput ' + f1(result.throughputPerWeek) + '/week vs demand ' + f1(params.demandPerWeek) + '/week' +
    ' · team busy ' + Math.round(result.utilisation * 100) + '%', 12.5, C.muted));
  y += 20;
  if(overloaded){
    s.push(txt(PAD, y, '⚠ Backlog growing ~' + f1(result.backlogSlopePerWeek) +
      '/week — demand exceeds capacity; no WIP limit fixes that.', 12.5, C.err, {weight: 600}));
    y += 20;
  }
  s.push(txt(PAD, y, 'WIP ' + knee + ' keeps ≥95% of max throughput — beyond it you buy cycle time, not delivery.',
    12.5, C.muted));
  y += 30;

  /* ---- cycle-time histogram ---- */
  const histH = 120, histW = W - PAD * 2;
  s.push(txt(PAD, y + 4, 'LEAD TIME, REQUEST → DONE (SIMULATED ITEMS)', 10, C.muted, {weight: 600, tracking: 1}));
  y += 14;
  const samples = result.leadSamples || [];
  const maxDay = Math.max(1, Math.ceil(lead.p95 * 1.3));
  const bins = 30;
  const counts = new Array(bins).fill(0);
  for(const v of samples){
    const b = Math.min(bins - 1, Math.floor(v / maxDay * bins));
    counts[b]++;
  }
  const maxC = Math.max(1, ...counts);
  const bw = histW / bins;
  for(let b = 0; b < bins; b++){
    const h = counts[b] / maxC * (histH - 18);
    if(h <= 0) continue;
    s.push('<rect x="' + f1(PAD + b * bw + 1) + '" y="' + f1(y + histH - 14 - h) +
      '" width="' + f1(bw - 2) + '" height="' + f1(h) + '" rx="2" fill="' + C.accent + '"/>');
  }
  for(const [q, label] of [[lead.p50, 'P50'], [lead.p85, 'P85']]){
    const x = PAD + Math.min(1, q / maxDay) * histW;
    s.push('<line x1="' + f1(x) + '" y1="' + y + '" x2="' + f1(x) + '" y2="' + (y + histH - 14) +
      '" stroke="' + C.ink + '" stroke-width="1" stroke-dasharray="3 3"/>');
    s.push(txt(x + 4, y + 10, label + ' ' + day(q), 10.5, C.ink, {weight: 600}));
  }
  s.push(txt(PAD, y + histH, '0', 10, C.muted));
  s.push(txt(PAD + histW, y + histH, day(maxDay), 10, C.muted, {anchor: 'end'}));
  y += histH + 24;

  /* ---- WIP sweep: two small charts, shared x ---- */
  const chW = (W - PAD * 3) / 2, chH = 110;
  const maxWip = sweep[sweep.length - 1].wip;
  const sx = i => (i - 1) / (maxWip - 1) * (chW - 8) + 4;
  const chart = (x0, title, vals, colour, marker) => {
    s.push(txt(x0, y + 4, title, 10, C.muted, {weight: 600, tracking: 1}));
    const top = y + 14, maxV = Math.max(...vals) * 1.08 || 1;
    s.push('<rect x="' + x0 + '" y="' + top + '" width="' + chW + '" height="' + (chH - 30) +
      '" fill="none" stroke="' + C.border + '"/>');
    const pts = vals.map((v, i) => f1(x0 + sx(i + 1)) + ',' + f1(top + (chH - 30) * (1 - v / maxV)));
    s.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + colour + '" stroke-width="2"/>');
    const kv = vals[knee - 1];
    const kx = x0 + sx(knee), ky = top + (chH - 30) * (1 - kv / maxV);
    s.push('<circle cx="' + f1(kx) + '" cy="' + f1(ky) + '" r="4" fill="' + colour +
      '" stroke="' + C.card + '" stroke-width="1.5"/>');
    if(marker) s.push(txt(kx + 6, ky - 4, 'WIP ' + knee, 10, C.ink, {weight: 600}));
    s.push(txt(x0, y + chH, 'WIP 1', 10, C.muted));
    s.push(txt(x0 + chW, y + chH, String(maxWip), 10, C.muted, {anchor: 'end'}));
  };
  chart(PAD, 'THROUGHPUT / WEEK vs WIP LIMIT', sweep.map(p => p.throughputPerWeek), C.accent, true);
  chart(PAD * 2 + chW, 'CYCLE TIME P85 (DAYS) vs WIP LIMIT', sweep.map(p => p.cycleP85), C.err, false);
  y += chH + 16;

  const H = y + 4;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + C.card + '"/>' + s.join('') + '</svg>';
}

function txt(x, y, str, size, fill, {weight, tracking, anchor} = {}){
  return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-size="' + size + '"' +
    (weight ? ' font-weight="' + weight + '"' : '') +
    (tracking ? ' letter-spacing="' + tracking + '"' : '') +
    (anchor ? ' text-anchor="' + anchor + '"' : '') +
    ' fill="' + fill + '">' + esc(str) + '</text>';
}

export function markdownSummary(result, sweep, knee, params){
  const lines = [];
  lines.push('**Flow check** — demand ' + params.demandPerWeek + '/week · item ~' + params.itemDays +
    ' days · team ' + params.team + ' · WIP limit ' + params.wipLimit);
  lines.push('');
  lines.push('A typical item takes **' + day(result.lead.p50) + '** — ' + day(result.workDays) +
    ' working, ' + day(Math.max(0, result.lead.p50 - result.workDays)) + ' waiting. P85 ' +
    day(result.lead.p85) + ', P95 ' + day(result.lead.p95) + '.');
  lines.push('Throughput ' + f1(result.throughputPerWeek) + '/week · team busy ' +
    Math.round(result.utilisation * 100) + '%.');
  if(result.backlogSlopePerWeek > 0.5){
    lines.push('**Backlog growing ~' + f1(result.backlogSlopePerWeek) +
      '/week — demand exceeds capacity; no WIP limit fixes that.**');
  }
  lines.push('WIP ' + knee + ' keeps ≥95% of max throughput; beyond it you buy cycle time, not delivery.');
  lines.push('');
  lines.push('_Seeded queue simulation · [live playground](' +
    (typeof location !== 'undefined' ? location.href : 'https://tools.matthewgarner.me/flow/') + ')_');
  return lines.join('\n');
}
