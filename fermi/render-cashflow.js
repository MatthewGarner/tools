/* Cashflow readout (#13): cumulative-cash fan chart + verdict. Pure — SVG string
   out, colours/measure from ctx. The fan is undiscounted cumulative cash; NPV
   and IRR are the discounted numbers in the verdict. */
import {esc, tint, txt} from '../assets/svg.js';
import {fmt, sig} from './engine.js';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const W = 860, PAD = 26;
const f1 = n => (Math.round(n * 100) / 100).toString();
const pctS = v => Math.round(v * 100) + '%';
const money = v => (v < 0 ? '−' : v > 0 ? '+' : '') + fmt(Math.abs(v));

function periodWord(grain, t){ return grain === 'month' ? 'month ' + t : 'year ' + t; }

export function verdictLines(r){
  const {npv, irr, period, grain, framing} = r;
  if(framing === 'runway'){
    const head = period.neverShare >= 0.5
      ? 'Cash probably lasts the horizon — cash-out in only ' + pctS(1 - period.neverShare) + ' of runs.'
      : 'Cash lasts until ' + periodWord(grain, period.p50) + ' (P50) — 10% chance of cash-out before ' +
        periodWord(grain, period.p10) + '.';
    const bits = [];
    if(period.neverShare < 1)
      bits.push('cash-out P10 ' + periodWord(grain, period.p10) + ' · P90 ' + periodWord(grain, period.p90));
    if(period.neverShare > 0)
      bits.push('survives the whole horizon in ' + pctS(period.neverShare) + ' of runs');
    return {head, sub: bits.join(' · ')};
  }
  const head = 'NPV P50 ' + money(npv.p50) + ' — 90% range ' + money(npv.p10) + ' to ' + money(npv.p90) + '.';
  const bits = ['P(NPV > 0) ' + pctS(npv.pPos)];
  if(irr.p50 !== null){
    bits.push('IRR P50 ' + pctS(irr.p50) +
      (irr.undefinedShare > 0 ? ' (undefined in ' + pctS(irr.undefinedShare) + ' of runs)' : ''));
  }
  bits.push(period.neverShare >= 1 ? 'never pays back'
    : 'payback P50 ' + periodWord(r.grain, period.p50) +
      (period.neverShare > 0 ? ' (never in ' + pctS(period.neverShare) + ')' : ''));
  return {head, sub: bits.join(' · ')};
}

export function renderCashflow(r, spec, ctx){
  const c = ctx.colors;
  const s = [];
  let y = PAD + 6;
  s.push(txt(PAD, y + 14, r.framing === 'runway' ? 'THE RUNWAY VERDICT' : 'THE CASHFLOW VERDICT',
    10, c.muted, {weight: 600, tracking: 1}));
  y += 38;
  const v = verdictLines(r);
  s.push(txt(PAD, y, v.head, 19, c.ink, {weight: 600}));
  y += 24;
  s.push(txt(PAD, y, v.sub, 12.5, c.muted));
  y += 26;

  /* fan chart: cumulative cash, undiscounted */
  const chW = W - PAD * 2, chH = 190, top = y;
  const H = r.horizon;
  let lo = Math.min(0, ...r.band.map(b => b.p10));
  let hi = Math.max(0, ...r.band.map(b => b.p90));
  const padSpan = (hi - lo) * 0.06 || 1;
  lo -= padSpan; hi += padSpan;
  const X = t => PAD + t / H * chW;
  const Y = val => top + (chH - 30) * (1 - (val - lo) / (hi - lo));
  s.push('<rect x="' + PAD + '" y="' + top + '" width="' + chW + '" height="' + (chH - 30) +
    '" fill="none" stroke="' + c.border + '"/>');
  const up = r.band.map((b, t) => f1(X(t)) + ',' + f1(Y(b.p90)));
  const down = r.band.map((b, t) => f1(X(t)) + ',' + f1(Y(b.p10))).reverse();
  s.push('<polygon points="' + up.concat(down).join(' ') + '" fill="' + tint(c.accent) + '"/>');
  s.push('<polyline points="' + r.band.map((b, t) => f1(X(t)) + ',' + f1(Y(b.p50))).join(' ') +
    '" fill="none" stroke="' + c.accent + '" stroke-width="2.5"/>');
  s.push('<line data-zero="" x1="' + PAD + '" y1="' + f1(Y(0)) + '" x2="' + (PAD + chW) + '" y2="' + f1(Y(0)) +
    '" stroke="' + c.ink + '" stroke-width="1" stroke-dasharray="4 3"/>');
  if(r.period.p50 !== null){
    const ex = X(r.period.p50);
    s.push('<line data-event="" x1="' + f1(ex) + '" y1="' + top + '" x2="' + f1(ex) + '" y2="' + (top + chH - 30) +
      '" stroke="' + c.err + '" stroke-width="1" stroke-dasharray="3 3"/>');
    s.push(txt(ex + 5, top + 14, (r.period.kind === 'cashout' ? 'cash out' : 'payback') + ' P50', 10.5,
      c.err, {weight: 600}));
  } else {
    s.push('<g data-event="" display="none"></g>');
  }
  s.push(txt(PAD, top + chH - 10, periodWord(r.grain, 0), 10, c.muted));
  s.push(txt(PAD + chW, top + chH - 10, periodWord(r.grain, H), 10, c.muted, {anchor: 'end'}));
  s.push(txt(PAD, top - 6, 'CUMULATIVE CASH (UNDISCOUNTED) · P10–P90 BAND, P50 LINE', 9.5, c.muted,
    {weight: 600, tracking: 1}));
  const halo = (yy, str) => '<text x="' + (PAD + chW - 6) + '" y="' + f1(yy) +
    '" font-size="10" text-anchor="end" fill="' + c.muted + '" paint-order="stroke" stroke="' +
    c.card + '" stroke-width="3" stroke-linejoin="round">' + esc(str) + '</text>';
  s.push(halo(Y(hi - padSpan) + 12, money(hi - padSpan)));
  s.push(halo(Y(lo + padSpan) - 5, money(lo + padSpan)));
  y = top + chH + 8;

  const HT = y;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + HT +
    '" viewBox="0 0 ' + W + ' ' + HT + '" font-family="' + SANS + '">' +
    '<rect width="' + W + '" height="' + HT + '" fill="' + c.card + '"/>' + s.join('') + '</svg>';
}

export function cashflowMarkdown(r, spec, url){
  const v = verdictLines(r);
  const lines = ['**Cashflow — ' + v.head + '**', '', v.sub, '', 'Assumptions (90% ranges per period):'];
  spec.periods.forEach((p, t) => {
    lines.push('- t' + t + ': ' + money(p.lo) + ' to ' + money(p.hi));
  });
  if(r.horizon > spec.periods.length - 1)
    lines.push('- t' + spec.periods.length + '…t' + r.horizon + ': repeats the last range, resampled');
  lines.push('- discount rate: ' + spec.rate.lo + '–' + spec.rate.hi + '%/yr · grain: ' + r.grain);
  lines.push('');
  lines.push('_' + r.n.toLocaleString('en-GB') + ' seeded runs · [live model](' + url + ')_');
  return lines.join('\n');
}
