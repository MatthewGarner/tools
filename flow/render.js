/* Flow readout → SVG string. Pure: colours and text measure come from ctx.
   Layout: verdict block, cycle-time histogram, two small WIP-sweep charts
   (never dual-axis). This SVG is what exports — the canvas strip never does. */
import {esc, txt} from '../assets/svg.js';

const W = 860, PAD = 26;

const day = n => {
  const v = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return v + (v === 1 ? ' day' : ' days');
};
const f1 = n => (Math.round(n * 10) / 10).toString();

/* plain-text mirror of the SVG readout's headline — the HTML text app.js
   shows next to the diagram. Pure; same inputs renderReadout itself uses. */
export function readoutVerdict(result){
  const lead = result.lead;
  const bits = ['A typical item takes ' + day(lead.p50) + ' — ' + day(result.workDays) +
    ' working, ' + day(Math.max(0, lead.p50 - result.workDays)) + ' waiting.'];
  if(result.backlogSlopePerWeek > 0.5){
    bits.push('Backlog growing ~' + f1(result.backlogSlopePerWeek) +
      '/week — demand exceeds capacity; no WIP limit fixes that.');
  }
  return bits.join('  ');
}

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

const gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
const wk = days => {                       // 5 working days per week, as in the engine
  const w = days / 5;
  const v = w < 10 ? Math.round(w * 10) / 10 : Math.round(w);
  return v + (v === 1 ? ' week' : ' weeks');
};

/* ---- batch-size U-curve (#75): pure SVG, same visual grammar as the readout ---- */
export function renderBatch(econ, params, ctx){
  const C = ctx.colors;
  const s = [];
  let y = PAD + 6;
  s.push(txt(PAD, y + 14, 'THE ECONOMICS OF YOUR BATCH', 10, C.muted, {weight: 600, tracking: 1}));
  y += 38;
  s.push('<text x="' + PAD + '" y="' + y + '" font-size="19" fill="' + C.ink + '">' +
    'Economic batch ≈ <tspan font-weight="700">' + econ.optimum +
    (econ.optimum === 1 ? ' item' : ' items') + '</tspan> — about ' +
    esc(wk(econ.optimumWeeks * 5)) + ' of demand per release.' + '</text>');
  y += 24;
  const meaningfulPenalty = econ.penaltyPerItem >= 0.5;
  if(meaningfulPenalty){
    s.push(txt(PAD, y, 'Your batch of ' + econ.currentBatch + ' costs ' + gbp(econ.penaltyPerItem) +
      ' more per item — ≈ ' + gbp(econ.penaltyPerWeek) + '/week left on the table.', 12.5, C.err, {weight: 600}));
  } else {
    s.push(txt(PAD, y, 'Your batch of ' + econ.currentBatch +
      ' is at the economic batch already — nothing left on the table.', 12.5, C.muted));
  }
  y += 26;

  const chW = W - PAD * 2, chH = 170, top = y;
  const maxB = econ.curve.length;
  const maxV = Math.max(...econ.curve.map(p => p.total)) * 1.08;
  const sx = b => PAD + (b - 1) / (maxB - 1) * chW;
  const sy = v => top + (chH - 30) * (1 - v / maxV);
  s.push('<rect x="' + PAD + '" y="' + top + '" width="' + chW + '" height="' + (chH - 30) +
    '" fill="none" stroke="' + C.border + '"/>');
  const line = (key, colour, width, dash) =>
    s.push('<polyline points="' + econ.curve.map(p => f1(sx(p.batch)) + ',' + f1(sy(p[key]))).join(' ') +
      '" fill="none" stroke="' + colour + '" stroke-width="' + width + '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>');
  line('transaction', C.muted, 1.5, '2 5');
  line('holding', C.muted, 1.5, '7 3');
  line('total', C.accent, 2.5);
  const last = econ.curve[maxB - 1];
  s.push(txt(PAD + chW - 6, sy(last.transaction) - 5, 'transaction cost / item', 10.5, C.muted, {anchor: 'end'}));
  s.push(txt(PAD + chW - 6, sy(last.holding) - 5, 'holding cost / item', 10.5, C.muted, {anchor: 'end'}));
  const ox = sx(econ.optimum), oy = sy(econ.optimumCost);
  s.push('<circle cx="' + f1(ox) + '" cy="' + f1(oy) + '" r="4.5" fill="' + C.accent +
    '" stroke="' + C.card + '" stroke-width="1.5"/>');
  s.push(txt(ox + 7, oy - 7, 'economic batch: ' + econ.optimum, 10.5, C.ink, {weight: 600}));
  const cx = sx(Math.min(maxB, econ.currentBatch));
  s.push('<line x1="' + f1(cx) + '" y1="' + top + '" x2="' + f1(cx) + '" y2="' + (top + chH - 30) +
    '" stroke="' + (meaningfulPenalty ? C.err : C.muted) + '" stroke-width="1" stroke-dasharray="3 3"/>');
  s.push(txt(cx + 5, top + 12, 'yours: ' + econ.currentBatch, 10.5, meaningfulPenalty ? C.err : C.muted, {weight: 600}));
  s.push(txt(PAD, top + chH - 8, '1 item per batch', 10, C.muted));
  s.push(txt(PAD + chW, top + chH - 8, maxB + ' items', 10, C.muted, {anchor: 'end'}));
  s.push(txt(PAD, top - 6, gbp(maxV) + ' / item', 10, C.muted));
  y = top + chH + 8;

  const H = y;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + C.card + '"/>' + s.join('') + '</svg>';
}

/* ---- queue triage (#65): ranked levers, drain-or-lead framing ---- */
export function renderTriage(triage, params, initialBacklog, ctx){
  const C = ctx.colors;
  const s = [];
  let y = PAD + 6;
  const drainMode = triage.mode === 'drain';
  const top0 = triage.levers[0];
  s.push(txt(PAD, y + 14, 'QUEUE TRIAGE — WHICH LEVER FIRST', 10, C.muted, {weight: 600, tracking: 1}));
  y += 38;
  let head;
  if(drainMode){
    if(top0.drainDays == null){
      head = 'No single lever clears this pile — cut intake <tspan font-weight="700">and</tspan> add capacity.';
    } else if(triage.base.drainDays == null){
      head = 'Today the pile <tspan font-weight="700">never clears</tspan>. ' +
        esc(top0.label) + ' clears it in <tspan font-weight="700">' + esc(wk(top0.drainDays)) + '</tspan>.';
    } else {
      head = 'Fastest way out: <tspan font-weight="700">' + esc(top0.label) + '</tspan> — the pile clears in ' +
        '<tspan font-weight="700">' + esc(wk(top0.drainDays)) + '</tspan> instead of ' +
        esc(wk(triage.base.drainDays)) + '.';
    }
  } else {
    head = 'Best lever for lead time: <tspan font-weight="700">' + esc(top0.label) + '</tspan>' +
      ' — P85 goes from ' + esc(day(triage.base.leadP85)) + ' to <tspan font-weight="700">' +
      esc(day(top0.leadP85)) + '</tspan>.';
  }
  s.push('<text x="' + PAD + '" y="' + y + '" font-size="19" fill="' + C.ink + '">' + head + '</text>');
  y += 22;
  s.push(txt(PAD, y, drainMode
    ? 'Ranked by time to clear the backlog of ' + initialBacklog + ' — steady-state P85 lead breaks ties.'
    : 'Queue is healthy — ranked by steady-state P85 lead time.', 12.5, C.muted));
  y += 22;

  const labW = 250, barX = PAD + labW, barW = W - PAD - barX - 130, rowH = 34;
  const val = l => drainMode ? l.drainDays : l.leadP85;
  const finite = triage.levers.map(val).filter(v => v != null);
  const baseVal = drainMode ? triage.base.drainDays : triage.base.leadP85;
  if(baseVal != null) finite.push(baseVal);
  const maxV = Math.max(...finite, 1) * 1.05;
  triage.levers.forEach((l, i) => {
    const ry = y + i * rowH, rec = l.id === triage.recommended;
    s.push(txt(PAD, ry + 15, l.label, 12.5, rec ? C.ink : C.muted, rec ? {weight: 700} : {}));
    const v = val(l);
    if(v == null){
      s.push('<rect data-bar="' + l.id + '" x="' + barX + '" y="' + (ry + 4) + '" width="' + barW +
        '" height="16" rx="3" fill="none" stroke="' + C.err + '" stroke-dasharray="4 3"/>');
      s.push(txt(barX + barW + 8, ry + 16, 'never drains', 11.5, C.err, {weight: 600}));
    } else {
      const bw = Math.max(3, v / maxV * barW);
      s.push('<rect data-bar="' + l.id + '" x="' + barX + '" y="' + (ry + 4) + '" width="' + f1(bw) +
        '" height="16" rx="3" fill="' + (rec ? C.accent : C.track) + '"' +
        (rec ? '' : ' stroke="' + C.border + '"') + '/>');
      s.push(txt(barX + bw + 8, ry + 16, drainMode ? wk(v) : day(v) + ' P85', 11.5,
        rec ? C.ink : C.muted, rec ? {weight: 600} : {}));
    }
  });
  const rowsH = triage.levers.length * rowH;
  if(baseVal != null){
    const bx = barX + baseVal / maxV * barW;
    s.push('<line x1="' + f1(bx) + '" y1="' + (y - 2) + '" x2="' + f1(bx) + '" y2="' + (y + rowsH - 6) +
      '" stroke="' + C.ink + '" stroke-width="1" stroke-dasharray="3 3"/>');
    s.push(txt(bx + 5, y + rowsH - 8, 'today', 10, C.muted));
  }
  y += rowsH + 10;

  const H = y;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + C.card + '"/>' + s.join('') + '</svg>';
}

export function markdownSummary(result, sweep, knee, params, extras){
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
  if(extras && extras.econ){
    const e = extras.econ;
    lines.push('');
    lines.push('**Economic batch ≈ ' + e.optimum + (e.optimum === 1 ? ' item' : ' items') + '**' +
      (e.penaltyPerItem >= 0.5
        ? ' — the current batch of ' + e.currentBatch + ' costs ~' + gbp(e.penaltyPerItem) +
          ' more per item (≈ ' + gbp(e.penaltyPerWeek) + '/week).'
        : ' — the current batch of ' + e.currentBatch + ' is already there.'));
  }
  if(extras && extras.triage){
    const t = extras.triage, top = t.levers[0];
    lines.push('');
    if(t.mode === 'drain'){
      lines.push('**Queue triage** (backlog of ' + (extras.initialBacklog ?? 0) + '): fastest lever is ' +
        top.label.toLowerCase() + ' — ' + (top.drainDays == null
          ? 'even that never clears the pile; combine levers.'
          : 'the pile clears in ' + wk(top.drainDays) +
            (t.base.drainDays == null ? ' (today it never clears).' : ' vs ' + wk(t.base.drainDays) + ' today.')));
    } else {
      lines.push('**Queue triage:** best lever is ' + top.label.toLowerCase() + ' — P85 lead ' +
        day(t.base.leadP85) + ' → ' + day(top.leadP85) + '.');
    }
  }
  lines.push('');
  lines.push('_Seeded queue simulation · [live playground](' +
    (typeof location !== 'undefined' ? location.href : 'https://tools.matthewgarner.me/flow/') + ')_');
  return lines.join('\n');
}
