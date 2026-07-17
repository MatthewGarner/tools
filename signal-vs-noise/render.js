/* /signal-vs-noise renderers — pure SVG strings. The play GRID shows only
   quarters ≤ turn and no truth markers (the game's integrity, tested by
   byte-invariance). The COLLAPSE is the verdict artefact: all six on one shared
   band, acts ringed, the real signal walking out of the band, true-mean ticks. */
import {esc, txt} from '../assets/svg.js';
import {verdict} from './engine.js';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const f1 = n => (Math.round(n * 10) / 10).toString();

/* map a value to y within a plot of height h (domain 0..hiDomain) */
const yMap = (v, top, h, lo, hi) => top + (h) * (1 - (v - lo) / (hi - lo));

function bandRect(x, w, top, h, c, lo, hi, band){
  const yt = yMap(band.hi, top, h, lo, hi), yb = yMap(band.lo, top, h, lo, hi);
  return '<rect x="' + f1(x) + '" y="' + f1(yt) + '" width="' + f1(w) + '" height="' + f1(yb - yt) +
    '" fill="' + c.muted + '" fill-opacity="0.12"/>';
}

/* ---------- the play grid ---------- */
export function renderGrid(s, c, {turn = s.quarters - 1, calls = [], cols = 3, width} = {}){
  const PAD = 22, gap = 12;
  // cardW: pinned 230 for phone (cols=1, whose ~274 SVG is CSS-scaled ×1.27 to clear
  // the 44px tap bar) and for the width-less default (keeps the 758/274 goldens + the
  // injection corpus byte-identical); derived to fill `width` at cols>=2, clamped so
  // cards neither shrink below 230 nor bloat past 360 (grid then centers under the wrap).
  const cardW = (cols === 1 || width == null) ? 230
    : Math.round(Math.max(230, Math.min(360, (width - PAD * 2 - gap * (cols - 1)) / cols)));
  // one-column phones scale this ~274-wide SVG up to the container (iPhone 13
  // stage ≈348 ⇒ ×1.27; Pixel 7 ≈372 ⇒ ×1.36), so a 38px button clears the 44px
  // coarse-pointer target on both gate devices (38×1.27 ≈ 48px). (Landscape phones
  // / tablets can land in cols 2–3 where the 16px SVG buttons fall short of 44px —
  // a known limit beyond the two-device bar; app.js keeps portrait phones in cols 1.)
  const btnH = cols === 1 ? 38 : 16, cardH = cols === 1 ? 134 : 96;
  const W = PAD * 2 + cols * cardW + gap * (cols - 1);
  const rows = Math.ceil(s.people / cols);
  const gridTop = 70;
  const HT = gridTop + rows * (cardH + gap) + PAD;
  // y-domain from ONLY the visible quarters (never future) so the grid can't leak
  const visible = [];
  for(let p = 0; p < s.people; p++) for(let q = 0; q <= turn; q++) visible.push(s.shown[p][q]);
  const lo = Math.max(0, Math.min(s.band.lo, ...visible) - 2);
  const hi = Math.max(s.band.hi, ...visible) + 2;
  const acted = new Set(calls.map(x => x.person + ':' + x.quarter));
  const parts = [];
  parts.push(txt(PAD, 30, 'SIGNAL vs NOISE', 15, c.ink, {weight: 700, tracking: 0.5}));
  const sub = cols === 1 ? 'Q' + (turn + 1) + '/' + s.quarters + ' · judge each number'
    : 'Quarter ' + (turn + 1) + ' of ' + s.quarters + ' · features shipped · judge each new number';
  parts.push(txt(PAD, 50, sub, 11.5, c.muted));
  parts.push(txt(W - PAD, 30, 'your calls: ' + calls.length, 11.5, c.muted, {anchor: 'end'}));

  for(let p = 0; p < s.people; p++){
    const col = p % cols, row = Math.floor(p / cols);
    const cx = PAD + col * (cardW + gap), cy = gridTop + row * (cardH + gap);
    const now = s.shown[p][turn];
    parts.push('<rect x="' + f1(cx) + '" y="' + f1(cy) + '" width="' + f1(cardW) + '" height="' + cardH +
      '" rx="8" fill="' + c.card + '" stroke="' + c.border + '"/>');
    parts.push(txt(cx + 11, cy + 20, s.names[p], 13, c.ink, {weight: 650}));
    parts.push(txt(cx + cardW - 11, cy + 20, String(now), 15, c.ink, {weight: 700, anchor: 'end'}));
    // mini run-chart quarters 0..turn
    const chTop = cy + 28, chH = 34, chL = cx + 11, chW = cardW - 22;
    parts.push(bandRect(chL, chW, chTop, chH, c, lo, hi, s.band));
    const xq = q => chL + (turn < 1 ? chW / 2 : q / turn * chW);
    const pts = [];
    for(let q = 0; q <= turn; q++) pts.push(f1(xq(q)) + ',' + f1(yMap(s.shown[p][q], chTop, chH, lo, hi)));
    parts.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + c.muted + '" stroke-width="1.4"/>');
    for(let q = 0; q <= turn; q++){
      const last = q === turn;
      parts.push('<circle cx="' + f1(xq(q)) + '" cy="' + f1(yMap(s.shown[p][q], chTop, chH, lo, hi)) +
        '" r="' + (last ? 3.2 : 1.8) + '" fill="' + (last ? c.accent : c.muted) + '"/>');
    }
    // act / hold targets for THIS quarter (app wires the clicks via data-*)
    const bt = cy + cardH - btnH - 6, bw = (cardW - 22 - 6) / 2;
    const on = acted.has(p + ':' + turn);
    parts.push(btn(cx + 11, bt, bw, btnH, 'talk', p, turn, on, c));
    parts.push(btn(cx + 11 + bw + 6, bt, bw, btnH, 'leave', p, turn, false, c));
  }
  return svg(W, HT, c, parts.join(''), 'Signal vs noise — quarter ' + (turn + 1));
}

function btn(x, y, w, h, act, person, quarter, on, c){
  const label = act === 'talk' ? 'talk to them' : 'leave it';
  const fill = on ? c.err : c.card, stroke = on ? c.err : c.border, ink = on ? c.card : c.muted;
  const fs = h >= 28 ? 11 : 9.5;
  return '<g data-act="' + act + '" data-person="' + person + '" data-quarter="' + quarter + '" role="button" tabindex="0">' +
    '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + h + '" rx="5" fill="' + fill +
    '" stroke="' + stroke + '"/>' + txt(x + w / 2, y + h / 2 + 3.4, label, fs, ink, {weight: 600, anchor: 'middle'}) + '</g>';
}

/* ---------- the collapse / verdict artefact ---------- */
// width-aware: narrow (<520) is the phone RELAYOUT (re-wrapped for 356px, not a
// shrink or a pan), wide (>=900) opens the chart to the full container so the six
// noise-walks separate, and everything in between (incl. no width) reproduces the
// original 760 layout byte-for-byte. Exports always pass the wide artefact —
// app.js's getSvg pins {width: 1088}.
export function renderCollapse(s, c, calls = [], {width} = {}){
  const w = width ?? 760;
  const narrow = w < 520;          // phone: pinned 356 layout, byte-identical to before
  const wide = w >= 900;           // desktop-wide: chart opens; prose stays capped
  const W = narrow ? 356 : Math.min(1090, Math.max(760, Math.round(w))), PAD = narrow ? 16 : 24;
  const vFont = narrow ? 16 : wide ? 20 : 18, vLine = narrow ? 21 : wide ? 26 : 24;
  // headline (display type) is exempt from the body-prose measure — at wide it runs to
  // ~100ch so a ~90-char verdict sits on one line; narrow/non-wide keep today's widths.
  const vWrap = narrow ? 30 : wide ? 100 : 74;
  // body prose caps by CHARACTERS (~95ch), NOT the chart width; today's 760 values kept.
  const descWrap = narrow ? 44 : wide ? 95 : 130;
  const statWrap = narrow ? 42 : wide ? 95 : 96;
  const closeWrap = narrow ? 40 : wide ? 95 : 90;
  const descFont = wide ? 13 : 12, statFont = wide ? 13 : 11.5, closeFont = wide ? 14 : 12.5;
  const v = verdict(s, calls);
  const parts = [];
  let y = 34;
  parts.push(txt(PAD, y, 'THE VERDICT', 10, c.muted, {weight: 600, tracking: 1})); y += 26;
  // wrap the verdict line
  for(const line of wrap(v.line, vWrap)){ parts.push(txt(PAD, y, line, vFont, c.ink, {weight: 600})); y += vLine; }
  y += 4;
  for(const line of wrap('Every call you made, on one shared band. Rings = you opened a conversation. Only the sustained walk out of the band was real.',
    descWrap)){ parts.push(txt(PAD, y, line, descFont, c.muted)); y += 17; }
  y += 6;

  // the shared collapse chart
  const chTop = y, chH = narrow ? 140 : (width != null && w > 760) ? Math.max(180, Math.min(260, Math.round(W * 0.24))) : 180, chL = PAD, chW = W - PAD * 2;
  const lo = Math.max(0, Math.min(s.band.lo, ...s.shown.flat()) - 2);
  const hi = Math.max(s.band.hi, ...s.shown.flat()) + 2;
  parts.push(bandRect(chL, chW, chTop, chH, c, lo, hi, s.band));
  parts.push(txt(chL + chW - 4, yMap(s.band.hi, chTop, chH, lo, hi) - 3, 'routine-variation band', narrow ? 10 : 9, c.muted, {anchor: 'end'}));
  const xq = q => chL + q / (s.quarters - 1) * chW;
  const acted = new Set(calls.map(x => x.person + ':' + x.quarter));
  for(let p = 0; p < s.people; p++){
    const isSig = p === s.signalPerson;
    const col = isSig ? c.err : c.muted;
    const pts = s.shown[p].map((val, q) => f1(xq(q)) + ',' + f1(yMap(val, chTop, chH, lo, hi)));
    parts.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="' +
      (isSig ? 2.2 : 1.1) + '" opacity="' + (isSig ? 0.95 : 0.5) + '"/>');
    for(let q = 0; q < s.quarters; q++){
      parts.push('<circle cx="' + f1(xq(q)) + '" cy="' + f1(yMap(s.shown[p][q], chTop, chH, lo, hi)) + '" r="' +
        (isSig ? 2.4 : 1.6) + '" fill="' + col + '"/>');
      if(acted.has(p + ':' + q))
        parts.push('<circle cx="' + f1(xq(q)) + '" cy="' + f1(yMap(s.shown[p][q], chTop, chH, lo, hi)) +
          '" r="5.5" fill="none" stroke="' + c.accent + '" stroke-width="1.6"/>');
    }
  }
  if(s.signalPerson != null)
    parts.push(txt(f1(chL + chW), f1(yMap(s.shown[s.signalPerson][s.quarters - 1], chTop, chH, lo, hi) + 15),
      s.names[s.signalPerson] + ' — the one real decline', 10, c.err, {weight: 700, anchor: 'end'}));
  y = chTop + chH + 26;

  for(const line of wrap(v.coinFlip + ' of your calls were single-point coin flips · ' + v.correctHolds +
    ' noise readings left alone · re-aiming the target to each quarter’s number would review a gap with about twice the variance (Deming’s funnel).', statWrap)){
    parts.push(txt(PAD, y, line, statFont, c.muted)); y += 16;
  }
  y += 6;
  for(const line of wrap('You only get this band in a simulation — your real team doesn’t come with one. What transfers isn’t the band, it’s the question: spike, or shift?', closeWrap)){
    parts.push(txt(PAD, y, line, closeFont, c.ink, {weight: 600})); y += 17;
  }
  return svg(W, y + PAD - 6, c, parts.join(''), esc(v.line));
}

function wrap(text, maxChars){
  const words = text.split(' '), out = []; let cur = '';
  for(const w of words){ if((cur + ' ' + w).trim().length > maxChars){ out.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if(cur.trim()) out.push(cur.trim());
  return out;
}

function svg(W, H, c, inner, label){
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Math.round(H) +
    '" viewBox="0 0 ' + W + ' ' + Math.round(H) + '" font-family="' + SANS + '" role="img" aria-label="' + esc(label) + '">' +
    '<rect width="' + W + '" height="' + Math.round(H) + '" fill="' + c.bg + '"/>' + inner + '</svg>';
}
