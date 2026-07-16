/* model + per-question stats → overlay SVG string. Pure; colours from ctx only. */
import {esc, tint, wrapText} from '../assets/svg.js';
import {fmt} from '../assets/series.js';
import {verdict, delphiVerdict} from './engine.js';

/* single-quoted family names: these stacks land inside double-quoted SVG
   attributes, where an embedded double quote is invalid XML (breaks PNG export) */
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const SERIF = 'Charter,Georgia,serif';
const WIDE_W = 960, NARROW = 520, MIN_W = 300;   // 300 floor matches bets' narrow clamp
const ROW_H = 24, DOT_STEP = 11, DOT_R = 4.5;

/* keep a centred label inside the chart plane (narrow-only guard) */
const clampX = (x, halfW, cw) => Math.max(halfW, Math.min(cw - halfW, x));

function niceTicks(lo, hi, target = 4){
  const span = (hi - lo) || Math.abs(hi) || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for(let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(v);
  return out;
}

function pill(xRight, y, label, color, measure){
  const up = label.toUpperCase();
  const w = measure(up, '600 10px ' + SANS) + 16;
  return '<rect x="' + (xRight - w) + '" y="' + y + '" width="' + w + '" height="18" rx="9" fill="' + tint(color) + '"/>' +
    '<text x="' + (xRight - w / 2) + '" y="' + (y + 12.5) + '" text-anchor="middle" font-size="10"' +
    ' font-weight="600" letter-spacing=".06em" fill="' + color + '">' + esc(up) + '</text>';
}

/* Each panel builder returns {h, body} with body in panel-local coords.
   `narrow` (and `wrapW` for messages) is the phone relayout: guarded branches
   only — the wide output stays byte-identical. */
function messagePanel(msg, c, wrapW, measure){
  const lines = wrapW ? wrapText(msg, '13px ' + SANS, wrapW, measure) : [msg];
  return {h: 26 + (lines.length - 1) * 17, body: lines.map((t, i) =>
    '<text x="0" y="' + (17 + i * 17) + '" font-size="13" fill="' + c.muted + '">' + esc(t) + '</text>').join('')};
}

function rangePanel(q, s, cw, c, dl, narrow, measure){
  const named = s.rows.some(r => r.name);
  const labelW = named ? Math.min(narrow ? 96 : 150, Math.max(...s.rows.map(r => (r.name || '').length)) * 7 + 14) : 0;
  const x0 = labelW, x1 = cw;
  let lo = s.pooled.lo, hi = s.pooled.hi;
  if(dl && dl.prev && dl.prev.pooled){          // scale must cover round 1 too
    lo = Math.min(lo, dl.prev.pooled.lo);
    hi = Math.max(hi, dl.prev.pooled.hi);
  }
  if(lo === hi){ lo -= 1; hi += 1; }
  const padSpan = (hi - lo) * 0.05;
  lo -= padSpan; hi += padSpan;
  const X = v => x0 + (v - lo) / (hi - lo) * (x1 - x0);
  const rowsTop = s.overlap ? 20 : 4;
  const extraRows = dl ? 2 : 0;
  const axisY = rowsTop + (s.rows.length + extraRows) * ROW_H + 8;
  const parts = [];
  if(s.overlap){
    parts.push('<rect x="' + X(s.overlap.lo) + '" y="' + rowsTop + '" width="' +
      Math.max(2, X(s.overlap.hi) - X(s.overlap.lo)) + '" height="' + (axisY - rowsTop) +
      '" fill="' + tint(c.status.done) + '"/>');
    const gLabel = 'common ground ' + fmt(s.overlap.lo) + '–' + fmt(s.overlap.hi) + (q.unit ? ' ' + q.unit : '');
    const gx = narrow ? clampX(X((s.overlap.lo + s.overlap.hi) / 2),
      measure(gLabel, '600 11px ' + SANS) / 2, cw) : X((s.overlap.lo + s.overlap.hi) / 2);
    parts.push('<text x="' + gx + '" y="' + (rowsTop - 6) +
      '" text-anchor="middle" font-size="11" font-weight="600" fill="' + c.status.done + '">common ground ' +
      fmt(s.overlap.lo) + '–' + fmt(s.overlap.hi) + (q.unit ? ' ' + esc(q.unit) : '') + '</text>');
  }
  s.rows.forEach((r, i) => {
    const y = rowsTop + i * ROW_H + ROW_H / 2;
    if(r.name) parts.push('<text x="' + (labelW - 10) + '" y="' + (y + 4) +
      '" text-anchor="end" font-size="12" fill="' + c.muted + '">' + esc(r.name) + '</text>');
    parts.push('<line x1="' + X(r.low) + '" y1="' + y + '" x2="' + X(r.high) + '" y2="' + y +
      '" stroke="' + c.accent + '" stroke-width="2.5" stroke-linecap="round"/>');
    for(const v of [r.low, r.high]) parts.push('<line x1="' + X(v) + '" y1="' + (y - 5) +
      '" x2="' + X(v) + '" y2="' + (y + 5) + '" stroke="' + c.accent + '" stroke-width="2.5"/>');
    parts.push('<circle cx="' + X(r.mid) + '" cy="' + y + '" r="3" fill="' + c.accent + '"/>');
  });
  if(dl){
    const d = dl.d, prev = dl.prev;
    const py = rowsTop + s.rows.length * ROW_H + ROW_H / 2;
    if(d.pooledRange){
      parts.push('<line x1="' + X(d.pooledRange[0]) + '" y1="' + py + '" x2="' + X(d.pooledRange[1]) +
        '" y2="' + py + '" stroke="' + c.ink + '" stroke-width="4" stroke-linecap="round"/>');
      parts.push('<circle cx="' + X(d.pooledMid) + '" cy="' + py + '" r="4" fill="' + c.ink +
        '" stroke="' + c.card + '" stroke-width="1.5"/>');
      parts.push('<text x="' + x1 + '" y="' + (py - 8) + '" text-anchor="end" font-size="10.5"' +
        ' font-weight="600" fill="' + c.ink + '">pooled ' + fmt(d.pooledRange[0]) + '–' +
        fmt(d.pooledRange[1]) + (q.unit ? ' ' + esc(q.unit) : '') + '</text>');
    }
    if(prev && prev.pooled){
      const ry = py + ROW_H;
      parts.push('<line x1="' + X(prev.pooled.lo) + '" y1="' + ry + '" x2="' + X(prev.pooled.hi) +
        '" y2="' + ry + '" stroke="' + c.muted + '" stroke-width="1.5" stroke-dasharray="5 4"/>');
      parts.push('<text x="' + x1 + '" y="' + (ry - 8) + '" text-anchor="end" font-size="10.5" fill="' +
        c.muted + '">round 1: ' + fmt(prev.pooled.lo) + '–' + fmt(prev.pooled.hi) + '</text>');
    }
  }
  parts.push('<line x1="' + x0 + '" y1="' + axisY + '" x2="' + x1 + '" y2="' + axisY +
    '" stroke="' + c.border + '"/>');
  for(const t of niceTicks(lo, hi, narrow ? 3 : 4)) parts.push('<text x="' + X(t) + '" y="' + (axisY + 16) +
    '" text-anchor="middle" font-size="11" fill="' + c.muted + '">' + fmt(t) + '</text>');
  if(q.unit) parts.push('<text x="' + x1 + '" y="' + (axisY + 32) +
    '" text-anchor="end" font-size="11" fill="' + c.muted + '">' + esc(q.unit) + '</text>');
  return {h: axisY + (q.unit ? 38 : 24), body: parts.join('')};
}

function probPanel(s, cw, c, dl, narrow, measure){
  const X = v => v / 100 * cw;
  /* deterministic beeswarm: sorted dots stack upward within x-bins */
  const bins = new Map();
  const dots = s.rows.map(r => {
    const bin = Math.round(X(r.value) / DOT_STEP);
    const k = bins.get(bin) || 0;
    bins.set(bin, k + 1);
    return {x: X(r.value), stack: k};
  });
  const maxStack = Math.max(...dots.map(d => d.stack));
  const top = 16;                                       // room for the median label
  const baseY = top + (maxStack + 1) * DOT_STEP + 4;
  const axisY = baseY + 8;
  const parts = [];
  const mx = X(s.median);
  parts.push('<line x1="' + mx + '" y1="' + top + '" x2="' + mx + '" y2="' + axisY +
    '" stroke="' + c.ink + '" stroke-width="1.5" stroke-dasharray="4 3"/>');
  const mLabel = (dl ? 'pooled median ' : 'median ') + Math.round(s.median) + '%';
  const mlx = narrow ? clampX(mx, measure(mLabel, '600 11px ' + SANS) / 2, cw) : mx;
  parts.push('<text x="' + mlx + '" y="' + (top - 4) + '" text-anchor="middle" font-size="11"' +
    ' font-weight="600" fill="' + c.ink + '">' + (dl ? 'pooled median ' : 'median ') +
    Math.round(s.median) + '%</text>');
  for(const d of dots) parts.push('<circle cx="' + d.x + '" cy="' + (baseY - DOT_R - d.stack * DOT_STEP) +
    '" r="' + DOT_R + '" fill="' + c.accent + '" fill-opacity=".85"/>');
  parts.push('<line x1="0" y1="' + axisY + '" x2="' + cw + '" y2="' + axisY + '" stroke="' + c.border + '"/>');
  for(const t of [0, 25, 50, 75, 100]) parts.push('<text x="' + X(t) + '" y="' + (axisY + 16) +
    '" text-anchor="middle" font-size="11" fill="' + c.muted + '">' + t + '%</text>');
  let h = axisY + 24;
  if(dl && dl.prev && dl.prev.rows && dl.prev.rows.length > 1){
    /* compact round-1 strip; replaces the camps annotation in delphi view */
    const p = dl.prev;
    const pmin = p.rows[0].value, pmax = p.rows[p.rows.length - 1].value;
    const sy = axisY + 38;                 // clear of the axis tick labels
    parts.push('<line x1="' + X(pmin) + '" y1="' + sy + '" x2="' + X(pmax) + '" y2="' + sy +
      '" stroke="' + c.muted + '" stroke-width="1.5" stroke-dasharray="5 4"/>');
    parts.push('<line x1="' + X(p.median) + '" y1="' + (sy - 4) + '" x2="' + X(p.median) +
      '" y2="' + (sy + 4) + '" stroke="' + c.muted + '" stroke-width="1.5"/>');
    parts.push('<text x="' + cw + '" y="' + (sy - 6) + '" text-anchor="end" font-size="10.5" fill="' +
      c.muted + '">round 1: ' + Math.round(pmin) + '–' + Math.round(pmax) + '%, median ' +
      Math.round(p.median) + '%</text>');
    h = sy + 14;
  } else if(s.camps && !dl){
    for(const camp of [s.camps.lo, s.camps.hi]) parts.push('<text x="' +
      (narrow ? clampX(X(camp.center), measure(camp.n + ' here', '600 11px ' + SANS) / 2, cw) : X(camp.center)) + '" y="' +
      (axisY + 32) + '" text-anchor="middle" font-size="11" font-weight="600" fill="' +
      c.status.risk + '">' + camp.n + ' here</text>');
    h = axisY + 40;
  }
  return {h, body: parts.join('')};
}

/* Confidence auction reveal: a bar per option (chip share; conviction winner in
   full accent), the first-choice count, an outlined SHOW OF HANDS pill on the
   stated winner, and a dot strip under each bar (one dot per person's allocation
   to that option, on a 0–100 scale). measure (not dl — chips are delphi-excluded). */
function chipsPanel(q, s, cw, c, measure, narrow){
  const named = s.rows.some(r => r.name);
  if(narrow){
    /* phone rows: label line (share + first-choice count right-anchored), then a
       full-width bar, then the allocation dot strip; SHOW OF HANDS on its own row */
    const X = v => Math.max(0, Math.min(100, v)) / 100 * cw;
    const parts = [];
    let yy = 0;
    s.perOption.forEach((o, j) => {
      const isConv = j === s.conviction, isStated = j === s.stated;
      const right = Math.round(o.share) + '% · ' + o.votes + ' first choice' + (o.votes === 1 ? '' : 's');
      const rightW = measure(right, '600 11px ' + SANS);
      const label = wrapText(o.option, '600 12px ' + SANS, cw - rightW - 12, measure)[0] || '';
      parts.push('<text x="0" y="' + (yy + 11) + '" font-size="12" font-weight="600" fill="' + c.ink + '">' + esc(label) + '</text>');
      parts.push('<text x="' + cw + '" y="' + (yy + 11) + '" text-anchor="end" font-size="11" font-weight="600" fill="' +
        (isConv ? c.accent : c.muted) + '">' + esc(right) + '</text>');
      const barY = yy + 18, barH = 14;
      const w = Math.max(2, o.share / 100 * cw);
      parts.push('<rect x="0" y="' + barY + '" width="' + w.toFixed(1) + '" height="' + barH + '" rx="3" fill="' +
        (isConv ? c.accent : tint(c.accent)) + '"' + (isConv ? '' : ' stroke="' + c.accent + '"') + '/>');
      const dy = barY + barH + 11;
      const showNames = named && s.n <= 8;
      o.allocs.forEach((v, k) => {
        parts.push('<circle cx="' + X(v).toFixed(1) + '" cy="' + dy + '" r="3.5" fill="' + c.accent + '" fill-opacity=".7"/>');
        if(showNames && s.rows[k] && s.rows[k].name)
          parts.push('<text x="' + X(v).toFixed(1) + '" y="' + (dy + 12) + '" text-anchor="middle" font-size="8" fill="' + c.muted + '">' + esc(s.rows[k].name) + '</text>');
      });
      yy = dy + (showNames ? 16 : 8);
      if(isStated){
        const sohW = measure('SHOW OF HANDS', '600 10px ' + SANS) + 16;
        parts.push('<rect x="0" y="' + yy + '" width="' + sohW.toFixed(1) + '" height="18" rx="9" fill="none" stroke="' + c.ink + '"/>' +
          '<text x="' + (sohW / 2).toFixed(1) + '" y="' + (yy + 12.5) + '" text-anchor="middle" font-size="10"' +
          ' font-weight="600" letter-spacing=".06em" fill="' + c.ink + '">SHOW OF HANDS</text>');
        yy += 24;
      }
      yy += 8;
    });
    let h = Math.max(26, yy - 6);
    if(s.abstentions){
      parts.push('<text x="0" y="' + (h + 4) + '" font-size="11" fill="' + c.muted + '">' +
        s.abstentions + ' split their top pile evenly</text>');
      h += 18;
    }
    return {h, body: parts.join('')};
  }
  const labelW = Math.min(160, Math.max(64, ...s.perOption.map(o => measure(o.option, '600 12px ' + SANS) + 12)));
  const x0 = labelW, barW = cw - x0;
  const X = v => x0 + Math.max(0, Math.min(100, v)) / 100 * barW;
  const ROWH = 46;
  const parts = [];
  s.perOption.forEach((o, j) => {
    const y = j * ROWH;
    const isConv = j === s.conviction, isStated = j === s.stated;
    const barY = y + 2, barH = 14;
    const w = Math.max(2, o.share / 100 * barW);
    const label = wrapText(o.option, '600 12px ' + SANS, labelW - 8, measure)[0] || '';
    parts.push('<text x="0" y="' + (barY + 11) + '" font-size="12" font-weight="600" fill="' + c.ink + '">' + esc(label) + '</text>');
    parts.push('<rect x="' + x0 + '" y="' + barY + '" width="' + w.toFixed(1) + '" height="' + barH + '" rx="3" fill="' +
      (isConv ? c.accent : tint(c.accent)) + '"' + (isConv ? '' : ' stroke="' + c.accent + '"') + '/>');
    parts.push('<text x="' + (x0 + w + 6).toFixed(1) + '" y="' + (barY + 11) + '" font-size="11" font-weight="600" fill="' + c.ink + '">' + Math.round(o.share) + '%</text>');
    const votesLabel = o.votes + ' first choice' + (o.votes === 1 ? '' : 's');
    parts.push('<text x="' + cw + '" y="' + (barY + 11) + '" text-anchor="end" font-size="11" fill="' + (isConv ? c.accent : c.muted) + '">' + votesLabel + '</text>');
    if(isStated){
      const vw = measure(votesLabel, '11px ' + SANS), sohW = measure('SHOW OF HANDS', '600 10px ' + SANS) + 16;
      const xR = cw - vw - 12;
      parts.push('<rect x="' + (xR - sohW).toFixed(1) + '" y="' + (barY - 2) + '" width="' + sohW.toFixed(1) + '" height="18" rx="9" fill="none" stroke="' + c.ink + '"/>' +
        '<text x="' + (xR - sohW / 2).toFixed(1) + '" y="' + (barY + 10.5) + '" text-anchor="middle" font-size="10" font-weight="600" letter-spacing=".06em" fill="' + c.ink + '">SHOW OF HANDS</text>');
    }
    const dy = barY + barH + 11;
    o.allocs.forEach((v, k) => {
      parts.push('<circle cx="' + X(v).toFixed(1) + '" cy="' + dy + '" r="3.5" fill="' + c.accent + '" fill-opacity=".7"/>');
      if(named && s.n <= 8 && s.rows[k] && s.rows[k].name)
        parts.push('<text x="' + X(v).toFixed(1) + '" y="' + (dy + 12) + '" text-anchor="middle" font-size="8" fill="' + c.muted + '">' + esc(s.rows[k].name) + '</text>');
    });
  });
  let h = s.perOption.length * ROWH + 2;
  if(s.abstentions){
    parts.push('<text x="0" y="' + (h + 4) + '" font-size="11" fill="' + c.muted + '">' +
      s.abstentions + ' split their top pile evenly</text>');
    h += 18;
  }
  return {h, body: parts.join('')};
}

export function renderOverlay(model, stats, ctx, opts = {}){
  const c = ctx.colors, measure = ctx.measure;
  const delphi = opts.delphi || null, round1 = opts.round1 || null;
  /* width-aware: exports and desktop never pass opts.width (960, byte-stable);
     the phone preview passes its container width and re-lays-out below 520 */
  const W = opts.width ? Math.max(MIN_W, Math.round(opts.width)) : WIDE_W;
  const narrow = W < NARROW;
  const PAD = narrow ? 16 : 28, PP = narrow ? 12 : 18;    // page pad, panel pad
  const panelW = W - PAD * 2, cw = panelW - PP * 2;
  const count = Math.max(0, ...stats.map(s => s.n));

  /* header */
  const head = [];
  let y = PAD + 24;
  if(delphi && narrow){    // no room beside the title — the pill gets its own row
    head.push(pill(W - PAD, PAD - 4, 'delphi round 2', c.accent, measure));
    y += 24;
  }
  const title = model.title || 'Gauge the room';
  const titleLines = narrow ? wrapText(title, '700 22px ' + SERIF, panelW, measure) : [title];
  titleLines.forEach((t, i) => {
    if(i) y += 26;
    head.push('<text x="' + PAD + '" y="' + y + '" font-family="' + SERIF +
      '" font-size="22" font-weight="700" fill="' + c.ink + '">' + esc(t) + '</text>');
  });
  if(delphi && !narrow) head.push(pill(W - PAD, PAD + 6, 'delphi round 2', c.accent, measure));
  y += 24;
  const v = delphi ? delphiVerdict(delphi) : verdict(stats);
  if(v){
    const vLines = narrow ? wrapText(v, '600 14px ' + SANS, panelW, measure) : [v];
    vLines.forEach((t, i) => {
      if(i) y += 18;
      head.push('<text x="' + PAD + '" y="' + y + '" font-size="14" font-weight="600" fill="' +
        c.accent + '">' + esc(t) + '</text>');
    });
    y += 20;
  }
  const countText = count + ' response' + (count === 1 ? '' : 's') + ' · ' + stats.length + ' question' + (stats.length === 1 ? '' : 's') +
    (delphi ? ' · final answers (round 2, round 1 carried forward)' : '');
  const countLines = narrow ? wrapText(countText, '12px ' + SANS, panelW, measure) : [countText];
  countLines.forEach((t, i) => {
    if(i) y += 16;
    head.push('<text x="' + PAD + '" y="' + y + '" font-size="12" fill="' + c.muted + '">' + esc(t) + '</text>');
  });
  y += 18;

  /* panels */
  const parts = [];
  stats.forEach((s, i) => {
    const q = s.question;
    /* narrow: the status pill gets its own row, so the title wraps at full width
       (the wide 110px pill reserve would leave next to nothing on a phone) */
    const qLines = wrapText((i + 1) + '. ' + q.text, '600 15px ' + SANS, narrow ? cw : cw - 110, measure);
    const pillRow = narrow ? 22 : 0;
    const dl = delphi && s.kind !== 'empty' && s.kind !== 'single'
      ? {d: delphi[i], prev: round1 ? round1[i] : null} : null;
    const isMsg = s.kind === 'empty' || s.kind === 'single';
    const hLines = isMsg ? []
      : narrow ? wrapText(dl ? delphi[i].headline : s.headline, '13px ' + SANS, cw, measure)
      : [dl ? delphi[i].headline : s.headline];
    const headH = pillRow + qLines.length * 20 + 24 + Math.max(0, hLines.length - 1) * 17;
    const inner = isMsg ? messagePanel(s.headline, c, narrow ? cw : 0, measure)
      : q.type === 'chips' ? (dl ? messagePanel(delphi[i].headline, c, narrow ? cw : 0, measure)
        : chipsPanel(q, s, cw, c, measure, narrow))
      : q.type === 'range' ? rangePanel(q, s, cw, c, dl, narrow, measure)
      : probPanel(s, cw, c, dl, narrow, measure);
    const panelH = PP + headH + inner.h + PP;
    parts.push('<rect x="' + PAD + '" y="' + y + '" width="' + panelW + '" height="' + panelH +
      '" rx="10" fill="' + c.card + '" stroke="' + c.border + '"/>');
    let ty = y + PP + 15 + pillRow;
    for(const lnText of qLines){
      parts.push('<text x="' + (PAD + PP) + '" y="' + ty + '" font-size="15" font-weight="600" fill="' +
        c.ink + '">' + esc(lnText) + '</text>');
      ty += 20;
    }
    const pillSpec = s.kind === 'empty' ? {label: 'no responses', color: c.muted}
      : s.kind === 'single' ? {label: '1 response', color: c.muted}
      : s.discuss ? {label: 'discuss', color: c.status.risk}
      : {label: 'aligned', color: c.status.done};
    parts.push(pill(PAD + panelW - PP, y + PP - 2, pillSpec.label, pillSpec.color, measure));
    if(!isMsg){
      hLines.forEach((t, k) => {
        parts.push('<text x="' + (PAD + PP) + '" y="' + (ty - 2 + k * 17) + '" font-size="13" fill="' +
          c.muted + '">' + esc(t) + '</text>');
      });
    }
    parts.push('<g transform="translate(' + (PAD + PP) + ',' + (y + PP + headH) + ')">' + inner.body + '</g>');
    y += panelH + 16;
  });

  const H = Math.round(y + PAD - 16);
  /* pure display — no data-edit targets here, so a role="img" summary is
     safe (it never hides interactive descendants); the same headline is
     also mirrored as HTML next to this overlay (session.js/app.js) */
  const svgLabel = (model.title || 'Gauge the room') + (v ? ' — ' + v : '');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + SANS + '" role="img" aria-label="' +
    esc(svgLabel) + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' +
    head.join('') + parts.join('') + '</svg>';
}
