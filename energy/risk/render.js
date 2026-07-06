/* Pure renderer: model + simulate() → SVG string. XML discipline throughout —
   txt()/esc() only for content; hand-built tags use single-quoted attributes
   (numbers and escaped strings only inside them). */
import {esc, txt, tint, wrapText} from '../../assets/svg.js';
import {fmtUnit, verdict} from './engine.js';

const FONT = 'Charter,Georgia,serif';
const num = v => v === Infinity ? '∞' : (Math.round(v * 100) / 100).toString();

/* nice axis ticks: ≤6 steps of 1/2/5×10^k */
function ticks(min, max){
  const span = max - min || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(span / 5)));
  const step = [1, 2, 5, 10].map(s => s * mag).find(s => span / s <= 6) || mag * 10;
  const out = [];
  for(let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

export function render(model, sim, ctx, {edit = false, focus = null} = {}){
  if(!sim) return '';
  const C = ctx.colors;
  const accent = model.accent || C.accent;
  const W = ctx.slide ? 1280 : 1200;
  const LBL = 250, x0 = LBL + 20, x1 = W - 48;
  const ROW = 118, TOP = model.title ? 92 : 56;
  const rows = sim.rows;
  const fi = focus === null ? Math.min(1, rows.length - 1) : Math.max(0, Math.min(focus, rows.length - 1));
  const vX = v => x0 + (v - sim.min) / (sim.max - sim.min || 1) * (x1 - x0);
  const parts = [];

  /* verdict block height computed up front so the svg height is exact */
  const vText = verdict(rows[fi], model.unit);
  const vLines = vText ? wrapText(vText, '16px ' + FONT, W - 96 - 60, ctx.measure) : [];
  const AXIS = 34;
  const H = TOP + rows.length * ROW + AXIS + (vLines.length ? 40 + vLines.length * 24 + 24 : 24);

  parts.push('<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'' + W + '\' height=\'' + H +
    '\' viewBox=\'0 0 ' + W + ' ' + H + '\' font-family=\'' + FONT + '\'>');
  parts.push('<rect width=\'' + W + '\' height=\'' + H + '\' fill=\'' + C.bg + '\'/>');
  if(model.title){
    parts.push('<rect x=\'48\' y=\'34\' width=\'34\' height=\'4\' fill=\'' + accent + '\'/>');
    parts.push(txt(48, 66, model.title, 26, C.ink, {weight: 700}));
  }

  rows.forEach((r, i) => {
    const y = TOP + i * ROW;
    const isM = r.kind === 'merchant';
    const col = isM ? C.muted : accent;
    parts.push('<rect x=\'24\' y=\'' + y + '\' width=\'' + (W - 48) + '\' height=\'' + (ROW - 10) +
      '\' rx=\'8\' fill=\'' + (i === fi && !isM ? tint(accent) : C.card) + '\' stroke=\'' +
      (i === fi && !isM ? accent : C.border) + '\'' +
      (edit ? ' data-focus=\'' + i + '\' style=\'cursor:pointer\'' : '') + '/>');
    parts.push(txt(44, y + 30, r.label, 17, C.ink, {weight: 700}));

    const ry = y + 44, rh = 30;
    const wy = ry + rh;

    /* bind threshold: shaded binding region + dashed line (under the ribbon) */
    const bindAt = r.kind === 'floor' ? r.params.level : r.kind === 'insure' ? r.params.attach : null;
    if(bindAt !== null && bindAt > sim.min){
      parts.push('<rect x=\'' + x0 + '\' y=\'' + ry + '\' width=\'' + Math.max(0, vX(Math.min(bindAt, sim.max)) - x0).toFixed(1) +
        '\' height=\'' + rh + '\' fill=\'' + tint(C.err) + '\'/>');
      parts.push('<line x1=\'' + vX(bindAt).toFixed(1) + '\' y1=\'' + (ry - 4) + '\' x2=\'' + vX(bindAt).toFixed(1) +
        '\' y2=\'' + (wy + 6) + '\' stroke=\'' + C.err + '\' stroke-width=\'1.5\' stroke-dasharray=\'4 3\'/>');
    }

    /* ribbon (a toll is a spike; the whisker carries it) */
    if(r.p10 !== r.p90){
      let d = 'M' + vX(sim.min).toFixed(1) + ' ' + wy;
      r.ribbon.forEach((b, k) => {
        const bx = sim.min + (k + 0.5) / 64 * (sim.max - sim.min);
        d += ' L' + vX(bx).toFixed(1) + ' ' + (wy - b * rh).toFixed(1);
      });
      d += ' L' + vX(sim.max).toFixed(1) + ' ' + wy + ' Z';
      parts.push('<path d=\'' + d + '\' fill=\'' + tint(col === C.muted ? C.ink : col) + '\' stroke=\'none\'/>');
    }

    /* whisker P10–P90, P50 diamond */
    parts.push('<line x1=\'' + vX(r.p10).toFixed(1) + '\' y1=\'' + wy + '\' x2=\'' + vX(r.p90).toFixed(1) +
      '\' y2=\'' + wy + '\' stroke=\'' + col + '\' stroke-width=\'2.5\'/>');
    for(const p of [r.p10, r.p90])
      parts.push('<line x1=\'' + vX(p).toFixed(1) + '\' y1=\'' + (wy - 6) + '\' x2=\'' + vX(p).toFixed(1) +
        '\' y2=\'' + (wy + 6) + '\' stroke=\'' + col + '\' stroke-width=\'2.5\'/>');
    parts.push('<path d=\'M' + vX(r.p50).toFixed(1) + ' ' + (wy - 8) + ' l7 8 l-7 8 l-7 -8 Z\' fill=\'' + col + '\'/>');
    parts.push(txt(vX(r.p50), wy + 22, fmtUnit(r.p50, model.unit), 12.5, C.ink, {anchor: 'middle', weight: 600}));

    /* pills: parameters (editable) then readouts */
    let px = 44;
    const pill = (label, opts = {}) => {
      const w = ctx.measure(label, '600 12px -apple-system,sans-serif') + 20;
      const fill = tint(opts.col || col);
      const ink = opts.col || (isM ? C.muted : C.ink);
      let attrs = '';
      if(edit && opts.field) attrs = ' data-edit=\'num\' data-line=\'' + r.srcLine +
        '\' data-raw=\'' + esc(opts.raw) + '\' data-field=\'' + opts.field + '\' style=\'cursor:text\'';
      parts.push('<g' + attrs + '><rect x=\'' + px.toFixed(1) + '\' y=\'' + (y + ROW - 44) + '\' width=\'' + w.toFixed(1) +
        '\' height=\'22\' rx=\'11\' fill=\'' + fill + '\'/>' +
        txt(px + 10, y + ROW - 29, label, 12, ink, {weight: 600}) + '</g>');
      px += w + 8;
    };
    const P = r.params;
    if(r.kind === 'merchant'){
      pill('P5 ' + num(model.merchant.lo), {field: 'merchantLo', raw: num(model.merchant.lo)});
      pill('P95 ' + num(model.merchant.hi), {field: 'merchantHi', raw: num(model.merchant.hi)});
    }
    if(r.kind === 'floor'){
      pill('floor ' + num(P.level), {field: 'level', raw: num(P.level)});
      pill('share ' + Math.round(P.share * 100) + '%', {field: 'share', raw: String(Math.round(P.share * 100))});
      pill('fee ' + num(P.fee), {field: 'fee', raw: num(P.fee)});
    }
    if(r.kind === 'toll') pill('fixed ' + num(P.fixed), {field: 'fixed', raw: num(P.fixed)});
    if(r.kind === 'insure'){
      pill('premium ' + num(P.premium), {field: 'premium', raw: num(P.premium)});
      pill('attach ' + num(P.attach), {field: 'attach', raw: num(P.attach)});
      if(P.limit !== Infinity) pill('limit ' + num(P.limit), {field: 'limit', raw: num(P.limit)});
    }
    if(r.trade){
      pill('upside sold ' + fmtUnit(r.trade.upsideSold, model.unit), {col: C.muted});
      pill('protection ' + fmtUnit(r.trade.downsideBought, model.unit), {col: C.muted});
      if(r.bind) pill((r.kind === 'toll' ? 'beats merchant ' : 'binds ') +
        (r.bind.sensitive ? Math.round(r.bind.lo * 100) + '–' + Math.round(r.bind.hi * 100) + '%'
                          : Math.round(r.bind.p * 100) + '%'), {col: C.muted});
    }
  });

  /* shared axis */
  const ay = TOP + rows.length * ROW + 4;
  parts.push('<line x1=\'' + x0 + '\' y1=\'' + ay + '\' x2=\'' + x1 + '\' y2=\'' + ay +
    '\' stroke=\'' + C.border + '\' stroke-width=\'1.5\'/>');
  for(const t of ticks(sim.min, sim.max))
    parts.push(txt(vX(t), ay + 20, num(t), 12, C.muted, {anchor: 'middle'}));
  parts.push(txt(x1, ay + 20, model.unit, 12, C.muted, {anchor: 'end', weight: 600}));

  /* verdict band */
  if(vLines.length){
    const vy = ay + AXIS + 8;
    parts.push('<rect x=\'48\' y=\'' + (vy + 12) + '\' width=\'4\' height=\'' + (vLines.length * 24 + 8) +
      '\' fill=\'' + accent + '\'/>');
    parts.push(txt(66, vy + 4, 'THE TRADE — ' + rows[fi].label.toUpperCase(), 11.5, C.muted,
      {weight: 700, tracking: '.08em'}));
    vLines.forEach((l, k) => parts.push(txt(66, vy + 32 + k * 24, l, 16, C.ink)));
  }
  parts.push('</svg>');
  return parts.join('');
}

export function toMarkdown(model, sim){
  if(!sim) return '';
  const u = v => fmtUnit(v, model.unit);
  const lines = ['| Structure | P10 | P50 | P90 | Upside sold | Protection | Fees |',
                 '|---|---|---|---|---|---|---|'];
  for(const r of sim.rows)
    lines.push('| ' + r.label + ' | ' + u(r.p10) + ' | ' + u(r.p50) + ' | ' + u(r.p90) + ' | ' +
      (r.trade ? u(r.trade.upsideSold) + ' | ' + u(r.trade.downsideBought) + ' | ' + u(r.trade.fees) : '— | — | —') + ' |');
  lines.push('');
  for(const r of sim.rows){ const v = verdict(r, model.unit); if(v) lines.push('- **' + r.label + ':** ' + v); }
  return (model.title ? '## ' + model.title + '\n\n' : '') + lines.join('\n');
}
