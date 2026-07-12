/* SVG for the score distributions + an HTML natural-frequency box. Pure — SVG as
   strings, XML-safe (double-quoted attrs, single-quoted font stacks via txt()).
   The two Gaussians are drawn at EQUAL height with a caption, not scaled by class
   share: at the base rates this tool is about (1–2%) a share-scaled real curve is
   invisible, so the dots below carry the base rate and the curves show the
   overlap/threshold trade-off (the standard signal-detection picture). */
import {esc, txt} from '../assets/svg.js';

/* score axis + plot margins, shared so app.js can invert a drag's clientX → t */
export const AXIS = {X0: -3, X1: 6, ML: 16, MR: 16};
const {X0, X1} = AXIS;
const pdf = z => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
const PEAK = pdf(0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = n => (Math.round(n * 10) / 10).toString();

/* invert the x-map: a pointer x within the SVG's own coordinate space → threshold */
export function tFromSvgX(svgX, w){
  return clamp(X0 + (svgX - AXIS.ML) / (w - AXIS.ML - AXIS.MR) * (X1 - X0), X0, X1);
}

export function renderDistributions({baseRate, dprime, t}, c, {w, h}){
  const ml = AXIS.ML, mr = AXIS.MR, mt = 26, mb = 30;
  const px = w - ml - mr, py = h - mt - mb, base = mt + py;
  const xp = x => ml + (x - X0) / (X1 - X0) * px;
  const yp = v => base - clamp(v, 0, 1) * py * 0.9;   // v in 0..1, headroom at top

  const curve = center => {
    const pts = [];
    for(let k = 0; k <= 120; k++){
      const x = X0 + (X1 - X0) * k / 120;
      pts.push([xp(x), yp(pdf(x - center) / PEAK)]);
    }
    return pts;
  };
  const line = pts => 'M' + pts.map(p => r1(p[0]) + ',' + r1(p[1])).join(' L');
  const area = pts => 'M' + r1(pts[0][0]) + ',' + r1(base) + ' L' +
    pts.map(p => r1(p[0]) + ',' + r1(p[1])).join(' L') + ' L' + r1(pts[pts.length - 1][0]) + ',' + r1(base) + ' Z';

  const benign = curve(0), real = curve(clamp(dprime, 0, X1));
  const tx = xp(clamp(t, X0, X1));

  const parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
    '" viewBox="0 0 ' + w + ' ' + h + '" class="dists" font-family="system-ui,-apple-system,sans-serif">');

  // alarm region wash (score > t)
  parts.push('<rect x="' + r1(tx) + '" y="' + mt + '" width="' + r1(ml + px - tx) + '" height="' + py +
    '" fill="' + c.accent + '" fill-opacity="0.05"/>');

  // baseline + integer ticks
  parts.push('<line x1="' + ml + '" y1="' + base + '" x2="' + (ml + px) + '" y2="' + base +
    '" stroke="' + c.border + '" stroke-width="1"/>');
  for(let x = X0; x <= X1; x++){
    parts.push('<line x1="' + r1(xp(x)) + '" y1="' + base + '" x2="' + r1(xp(x)) + '" y2="' + (base + 4) +
      '" stroke="' + c.border + '" stroke-width="1"/>');
    parts.push(txt(xp(x), base + 16, String(x), 10, c.muted, {anchor: 'middle'}));
  }

  // curves: benign (muted ring-language), real (accent), area fills then strokes
  parts.push('<path d="' + area(benign) + '" fill="' + c.muted + '" fill-opacity="0.10"/>');
  parts.push('<path d="' + area(real) + '" fill="' + c.accent + '" fill-opacity="0.14"/>');
  parts.push('<path d="' + line(benign) + '" fill="none" stroke="' + c.muted + '" stroke-width="1.5"/>');
  parts.push('<path d="' + line(real) + '" fill="none" stroke="' + c.accent + '" stroke-width="2"/>');

  // curve labels
  parts.push(txt(xp(0), yp(1) - 6, 'benign', 11, c.muted, {anchor: 'middle', weight: 600}));
  parts.push(txt(xp(clamp(dprime, 0, X1)), yp(1) - 6, 'real', 11, c.accentInk || c.accent, {anchor: 'middle', weight: 700}));

  // threshold: drag group — visible grip pill + 44px invisible hit rect + value
  parts.push('<g data-drag="threshold" tabindex="0" role="slider" aria-label="Alarm threshold"' +
    ' aria-valuemin="-3" aria-valuemax="6" aria-valuenow="' + r1(t) + '">');
  parts.push('<line x1="' + r1(tx) + '" y1="' + mt + '" x2="' + r1(tx) + '" y2="' + base +
    '" stroke="' + c.ink + '" stroke-width="1.5" stroke-dasharray="4 3"/>');
  parts.push('<rect x="' + r1(tx - 6) + '" y="' + (mt - 4) + '" width="12" height="14" rx="3" fill="' + c.ink + '"/>');
  parts.push(txt(tx, mt - 8, 'threshold ' + r1(t), 10, c.ink, {anchor: 'middle', weight: 600, halo: c.card}));
  parts.push('<rect data-hit="" x="' + r1(tx - 22) + '" y="' + mt + '" width="44" height="' + py +
    '" fill="' + c.bg + '" fill-opacity="0"/>');
  parts.push('</g>');

  // caption
  parts.push(txt(ml, h - 4, 'curves at equal height — the dots below carry the base rate', 9, c.muted));

  parts.push('</svg>');
  return parts.join('');
}

/* HTML natural-frequency box of 1,000 + precision/sensitivity/specificity chips. */
export function renderBox(counts, c){
  const {tp, fp, tn, fn} = counts;
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
  const cell = (n, label, kind) =>
    '<div class="fq-cell fq-' + kind + '"><b>' + n + '</b><span>' + esc(label) + '</span></div>';
  const chip = (label, val) => '<span class="cap"><i>' + esc(label) + '</i> ' + val + '</span>';
  return '<div class="fqbox">' +
    '<div class="fq-grid" role="table" aria-label="Outcomes per 1,000">' +
      cell(tp, 'true alarms', 'tp') + cell(fn, 'missed', 'fn') +
      cell(fp, 'false alarms', 'fp') + cell(tn, 'correctly quiet', 'tn') +
    '</div>' +
    '<div class="fq-chips">' +
      chip('precision', pct(tp, tp + fp)) +
      chip('sensitivity', pct(tp, tp + fn)) +
      chip('specificity', pct(tn, tn + fp)) +
    '</div></div>';
}
