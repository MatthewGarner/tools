/* Cashflow readout (#13): cumulative-cash fan chart + verdict. Pure — SVG string
   out, colours/measure from ctx. The fan is undiscounted cumulative cash; NPV
   and IRR are the discounted numbers in the verdict. */
import {esc, tint, txt, wrapText} from '../assets/svg.js';
import {fmt, sig} from './engine.js';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const W = 860, PAD = 26;
const f1 = n => (Math.round(n * 100) / 100).toString();
const pctS = v => Math.round(v * 100) + '%';
const money = v => (v < 0 ? '−' : v > 0 ? '+' : '') + fmt(Math.abs(v));

function periodWord(grain, t){ return grain === 'month' ? 'month ' + t : 'year ' + t; }

const pct1 = v => v == null ? '—' : (v < 0 ? '−' : '') + (Math.abs(v) * 100).toFixed(1) + '%';
const dscrF = n => n.toFixed(2);

/* the financing verdict: what gearing does to the EQUITY returns. Levered vs
   unlevered IRR is the headline (Matt's day-job metric); the sub-line carries
   the honest downside (leverage cuts both ways) + the per-operating-year cover
   shortfall. All IRR quantiles null-guarded (high gearing ⇒ undefined). */
export function financeVerdict(d){
  const un = d.unlevIrr.p50, lv = d.levIrr.p50, lp10 = d.levIrr.p10;
  const caseWord = d.sizingCase === 'downside' ? 'downside' : 'central';
  const verb = (lv != null && un != null) ? (lv > un ? 'lifts' : 'trims') : 'reshapes';
  const dv = dscrF(d.dscrTarget), cover = Math.round(d.coverShortfall * 100);
  const head = lv == null
    ? 'Gearing to ' + fmt(d.D) + ' at ' + dv + '× DSCR — equity IRR undefined at this gearing.'
    : 'Gearing to ' + fmt(d.D) + ' (' + dv + '× DSCR, ' + caseWord + ' case) ' + verb +
      ' equity IRR ' + pct1(un) + ' → ' + pct1(lv) + ' (P50).';
  // data-driven downside: only claim "cuts both ways" when the levered downside
  // actually dips below the unlevered P50 (with independent years it often doesn't).
  const crosses = lp10 != null && un != null && lp10 < un;
  const bits = [crosses
    ? 'leverage cuts both ways — levered IRR P10 ' + pct1(lp10) + ' vs unlevered ' + pct1(un)
    : 'levered IRR P10 ' + pct1(lp10) + ' holds above unlevered ' + pct1(un),
    'equity NPV P50 ' + money(d.eqNpv.p50),
    '~' + cover + '% of operating-years under ' + dv + '× cover'];
  let sub = bits.join('; ') + '.';
  if(!crosses && cover >= 25) sub += ' The risk sits in cover, not the (independent-year) IRR spread.';
  if(d.capped) sub += ' Gearing capped at 100% of build.';
  if(d.tenorClamped) sub += ' Tenor capped at the operating life.';
  if(d.sizingCase === 'central' && cover >= 25) sub += ' Size off the downside case for a bankable structure.';
  return {head, sub};
}

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

  /* financing card — appended only when debt is sized, so existing renders
     (debt off / null) are byte-identical. */
  let ariaTail = '';
  if(r.debt && r.debt.ok){
    const d = r.debt, fv = financeVerdict(d);
    ariaTail = ' ' + fv.head;
    const measure = ctx.measure || (str => str.length * 6.2);   // cfPaint passes no measure
    y += 12;
    s.push('<line x1="' + PAD + '" y1="' + f1(y) + '" x2="' + (W - PAD) + '" y2="' + f1(y) + '" stroke="' + c.border + '"/>');
    y += 24;
    s.push(txt(PAD, y, 'THE FINANCING VERDICT', 10, c.muted, {weight: 600, tracking: 1}));
    y += 22;
    s.push(txt(PAD, y, fv.head, 18, c.ink, {weight: 600}));
    y += 22;
    for(const ln of wrapText(fv.sub, 12.5, W - PAD * 2, measure)){ s.push(txt(PAD, y, ln, 12.5, c.muted)); y += 17; }
    y += 16;

    // paired PROJECT vs EQUITY IRR range bars on a shared axis
    const chW2 = W - PAD * 2, nn = x => x != null && isFinite(x);
    const pool = [0, d.costOfDebt];
    for(const qd of [d.unlevIrr, d.levIrr]) for(const k of ['p10', 'p90']) if(nn(qd[k])) pool.push(qd[k]);
    let axLo = Math.min(...pool), axHi = Math.max(...pool);
    const axSpan = (axHi - axLo) || 0.1; axLo -= axSpan * 0.06; axHi += axSpan * 0.06;
    const XI = irr => PAD + (irr - axLo) / (axHi - axLo) * chW2;
    s.push(txt(PAD, y, 'PROJECT vs EQUITY IRR · P10–P90 BAND, P50 MARK', 9.5, c.muted, {weight: 600, tracking: 1}));
    y += 8;
    for(const [gx, lbl] of [[0, '0%'], [d.costOfDebt, 'debt ' + pct1(d.costOfDebt)]]){
      if(gx < axLo || gx > axHi) continue;
      const xx = XI(gx);
      s.push('<line x1="' + f1(xx) + '" y1="' + f1(y) + '" x2="' + f1(xx) + '" y2="' + f1(y + 74) + '" stroke="' + c.border + '" stroke-dasharray="3 3"/>');
      s.push(txt(xx + 3, y + 9, lbl, 9, c.muted));
    }
    let ry = y + 10;
    for(const [name, qd, col] of [['UNLEVERED', d.unlevIrr, c.muted], ['LEVERED', d.levIrr, c.accent]]){
      s.push(txt(PAD, ry + 14, name, 10, c.ink, {weight: 600, tracking: 0.5}));
      const bx = PAD + 82;
      if(nn(qd.p10) && nn(qd.p90)){
        const x0 = Math.max(bx, XI(qd.p10)), x1 = XI(qd.p90);
        s.push('<rect x="' + f1(x0) + '" y="' + f1(ry + 4) + '" width="' + f1(Math.max(2, x1 - x0)) + '" height="16" rx="4" fill="' + tint(col) + '" stroke="' + col + '"/>');
        if(nn(qd.p50)){
          const xm = XI(qd.p50);
          s.push('<line x1="' + f1(xm) + '" y1="' + f1(ry + 1) + '" x2="' + f1(xm) + '" y2="' + f1(ry + 23) + '" stroke="' + col + '" stroke-width="2.5"/>');
          s.push(txt(Math.min(W - PAD, Math.max(PAD + 20, xm)), ry + 36, pct1(qd.p50), 11, col, {weight: 600, anchor: 'middle'}));
        }
      } else s.push(txt(bx, ry + 15, 'undefined (' + Math.round((qd.undefinedShare || 0) * 100) + '% of runs)', 11, c.muted));
      ry += 40;
    }
    y = ry + 4;

    // stat strip
    const stats = [['GEARING', Math.round(d.gearingPct * 100) + '%'],
      ['EQUITY NPV P50', money(d.eqNpv.p50)],
      ['UNDER COVER', Math.round(d.coverShortfall * 100) + '%'],
      ['WORST-YEAR DSCR', d.minDscr.p10 != null ? dscrF(d.minDscr.p10) + '×' : '—']];
    if(d.levIrr.undefinedShare >= 0.01) stats.push(['LEV IRR UNDEF', Math.round(d.levIrr.undefinedShare * 100) + '%']);
    let sx = PAD;
    for(const [lbl, val] of stats){
      s.push(txt(sx, y + 11, lbl, 8.5, c.muted, {weight: 600, tracking: 0.5}));
      s.push(txt(sx, y + 28, val, 15, c.ink, {weight: 600}));
      sx += 158;
    }
    y += 40;
  } else if(r.debt && !r.debt.ok){
    y += 12;
    s.push('<line x1="' + PAD + '" y1="' + f1(y) + '" x2="' + (W - PAD) + '" y2="' + f1(y) + '" stroke="' + c.border + '"/>');
    y += 24;
    s.push(txt(PAD, y, 'DEBT SIZING — ' + r.debt.reason, 12.5, c.muted, {weight: 600}));
    y += 12;
  }

  const HT = y;
  /* pure display — no data-edit targets here, so a role="img" summary is
     safe (it never hides interactive descendants) */
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + HT +
    '" viewBox="0 0 ' + W + ' ' + HT + '" font-family="' + SANS + '" role="img" aria-label="' +
    esc(v.head + (v.sub ? ' ' + v.sub : '') + ariaTail) + '">' +
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
  if(r.debt && r.debt.ok){
    const d = r.debt, fv = financeVerdict(d);
    lines.push('');
    lines.push('**Financing — ' + fv.head + '**');
    lines.push('');
    lines.push(fv.sub);
    lines.push('');
    lines.push('- senior debt ' + fmt(d.D) + ' · gearing ' + Math.round(d.gearingPct * 100) + '% · tenor ' + d.tenor + ' ' + r.grain + 's');
    lines.push('- sculpted to ' + dscrF(d.dscrTarget) + '× DSCR off the ' + d.sizingCase + ' case · cost of debt ' + (d.costOfDebt * 100).toFixed(2) + '%');
    lines.push('- Levered IRR P50 ' + pct1(d.levIrr.p50) + ' (P10 ' + pct1(d.levIrr.p10) + ' – P90 ' + pct1(d.levIrr.p90) + ') vs unlevered P50 ' + pct1(d.unlevIrr.p50));
    lines.push('- _cover shortfall counts operating-years below covenant; periods are sampled independently, so the levered spread is tighter than correlated revenue would give_');
  } else if(r.debt && !r.debt.ok){
    lines.push('- debt sizing: ' + r.debt.reason);
  }
  lines.push('');
  lines.push('_' + r.n.toLocaleString('en-GB') + ' seeded runs · [live model](' + url + ')_');
  return lines.join('\n');
}
