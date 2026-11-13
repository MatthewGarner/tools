/* Pure debt-sizing for fermi's cashflow mode (levered returns).
   sizeDebt() is deterministic — sculpts senior debt to a target DSCR off a
   central/downside case, co-funds the build with capitalised interest so the
   lender IRR equals the cost of debt, and freezes the schedule. leverTrials()
   then varies revenue against that frozen debt across the already-sampled
   trials (zero new RNG). Nothing here touches the random stream. */
import {distQuantile, irrOf, selectTrio} from './engine.js';

const mid = p => (p.lo + p.hi) / 2;
const perRate = (r, grain) => grain === 'month' ? Math.pow(1 + r, 1 / 12) - 1 : r;

/* Phase 1 (sculpt) + Phase 2 (co-fund). periods numeric; costOfDebt a fraction;
   dscr a number; tenor optional (default = available); sizingCase central|downside.
   Returns {ok:false, reason} or the frozen debt structure. */
export function sizeDebt({periods, horizon, grain = 'year', dscr, costOfDebt, tenor, sizingCase = 'central'}){
  // input-validity gates first: a blank field coerces to 0 (dscr) and a bad
  // rate must not sculpt Infinity/NaN into a plausible-looking card.
  if(!(dscr > 0)) return {ok: false, reason: 'DSCR must be positive'};
  if(!(costOfDebt > -1) || !isFinite(costOfDebt)) return {ok: false, reason: 'cost of debt must be above −100%'};

  const at = t => periods[Math.min(t, periods.length - 1)];

  // COD = cumulative-midpoint trough + 1 (blip-proof; aligns with peak funding)
  let cum = 0, trough = 0, tTrough = 0;
  for(let t = 0; t <= horizon; t++){ cum += mid(at(t)); if(cum < trough){ trough = cum; tTrough = t; } }
  if(trough >= 0) return {ok: false, reason: 'no construction spend to fund'};
  const tStar = tTrough + 1;
  const avail = horizon - tStar + 1;
  if(avail < 1) return {ok: false, reason: 'no operating periods to service debt'};

  const wantTenor = (tenor | 0) || avail;
  const useTenor = Math.max(1, Math.min(avail, wantTenor));
  const tenorClamped = wantTenor > avail || undefined;

  const rdPer = perRate(costOfDebt, grain);
  const q = sizingCase === 'downside' ? 0.10 : 0.50;

  // Phase 1 — sculpt DS off the chosen case; D_raw = PV of service to COD
  const dsByT = new Float64Array(horizon + 1);
  let Draw = 0;
  for(let t = tStar; t < tStar + useTenor; t++){
    const p = at(t);
    const cf = distQuantile(p.lo, p.hi, 'auto', q);
    const ds = Math.max(0, cf) / dscr;
    dsByT[t] = ds;
    Draw += ds / Math.pow(1 + rdPer, t - tStar);
  }
  if(!(Draw > 0)) return {ok: false, reason: 'no debt capacity at this DSCR'};

  // gearing cap at 100% of the build (peak funding) — scale service to match
  const peakFunding = -trough;
  let D = Draw, capped = false;
  if(D > peakFunding){
    const f = peakFunding / D;
    D = peakFunding; capped = true;
    for(let t = tStar; t < tStar + useTenor; t++) dsByT[t] *= f;
  }

  // Phase 2 — co-fund draws (weight = pre-COD outflow, never against an inflow),
  // capitalising construction interest so the lender IRR == rd exactly
  const drawByT = new Float64Array(horizon + 1);
  let outSum = 0;
  for(let t = 0; t < tStar; t++) outSum += Math.max(0, -mid(at(t)));
  let accr = 0;
  for(let t = 0; t < tStar; t++){ const w = Math.max(0, -mid(at(t))) / outSum; accr += w * Math.pow(1 + rdPer, tStar - t); }
  const D_drawn = D / accr;
  for(let t = 0; t < tStar; t++){ const w = Math.max(0, -mid(at(t))) / outSum; drawByT[t] = D_drawn * w; }

  const service = [];
  for(let t = tStar; t < tStar + useTenor; t++) service.push({t, ds: dsByT[t]});
  return {
    ok: true, D, D_drawn, tStar, tenor: useTenor, tenorClamped, peakFunding,
    gearingPct: D / peakFunding, capped, dscrTarget: dscr, costOfDebt, sizingCase,
    drawByT, dsByT, service,
  };
}

/* Phase 3 — vary revenue against the frozen debt across the already-sampled
   trials (no redraw). flowPaths is row-major n×(H+1) of per-trial project cash
   flows; rates the per-trial equity discount rate. Emits the levered/equity
   distributions + the per-operating-year cover-shortfall share. */
export function leverTrials(s, {flowPaths, rates, n, horizon, grain}){
  const W = horizon + 1;
  const eq = new Float64Array(W);
  const levIrr = [], eqNpv = [], minD = [];
  let posNpv = 0, irrUndef = 0, shortfall = 0, servedPeriods = 0, hint = NaN;
  for(let t = s.tStar; t < s.tStar + s.tenor; t++) if(s.dsByT[t] > 0) servedPeriods++;

  for(let i = 0; i < n; i++){
    const base = i * W, r = rates[i], perR = grain === 'month' ? Math.pow(1 + r, 1 / 12) - 1 : r;
    let npv = 0, minDscr = Infinity, df = 1;
    const dd = 1 / (1 + perR);                                     // a running discount factor, not a pow per period
    for(let t = 0; t < W; t++){
      const proj = flowPaths[base + t];
      eq[t] = proj + (s.drawByT[t] || 0) - (s.dsByT[t] || 0);
      npv += eq[t] * df;
      df *= dd;
      if(s.dsByT[t] > 0){
        const d = proj / s.dsByT[t];
        if(d < minDscr) minDscr = d;
        if(d < s.dscrTarget) shortfall++;
      }
    }
    if(npv > 0) posNpv++;
    eqNpv.push(npv);
    const ir = irrOf(eq, horizon, hint);
    if(ir === null) irrUndef++;
    else { hint = ir; levIrr.push(grain === 'month' ? Math.pow(1 + ir, 12) - 1 : ir); }
    if(isFinite(minDscr)) minD.push(minDscr);
  }

  /* quantiles of unsorted arrays by selection (selectTrio): the same figures as sorting, far less work */
  const T = a => { const [p10, p50, p90] = selectTrio(Float64Array.from(a)); return {p10, p50, p90}; };
  return {
    levIrr: {...T(levIrr), undefinedShare: irrUndef / n},
    eqNpv: {...T(eqNpv), pPos: posNpv / n},
    minDscr: T(minD),
    coverShortfall: servedPeriods ? shortfall / (n * servedPeriods) : 0,
  };
}
