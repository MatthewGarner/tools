/* Merge-bias: fit each lane's completion milestone as Normal(p50, p90) and ask
   how likely ALL parallel lanes land by the nominal date. Pure; no DOM. The
   "five lanes each 80% ≈ 33%" insight, from the P50/P90 already parsed. */

const Z_P90 = 1.2815515655;                              // Φ⁻¹(0.90) — NOT series.Z90 (=Φ⁻¹(0.95))

function erf(x){                                         // A&S 7.1.26, |err| < 1.5e-7
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

export function jointAt(lanes, D){
  let p = 1;
  for(const l of lanes) p *= normCdf((D - l.p50) / l.sigma);
  return p;
}

export function mergeBias(model, today = 0){
  // latest non-done milestone per lane (tie: max p50, then max p90) = the workstream finish
  const byLane = new Map();
  for(const it of model.items){
    if(it.status === 'done') continue;                   // done = landed (P=1), not a workstream at risk
    const cur = byLane.get(it.lane);
    if(!cur || it.p50 > cur.p50 || (it.p50 === cur.p50 && it.p90 > cur.p90)) byLane.set(it.lane, it);
  }
  const lanes = []; let excludedSingle = 0;
  for(const it of byLane.values()){
    if(!it.single && it.p90 - it.p50 > 0) lanes.push({p50: it.p50, p90: it.p90, sigma: (it.p90 - it.p50) / Z_P90});
    else excludedSingle++;                               // single-date or same-day range: no distribution to fit
  }
  if(lanes.length < 2) return null;
  const byDate = Math.max(...lanes.map(l => l.p50));      // nominal end; this lane sits at Φ(0)=0.5, so pAll ≤ 0.5
  if(byDate <= today) return null;                        // stale/overdue plan → nonsense
  const pAll = jointAt(lanes, byDate);
  const laneP = lanes.map(l => normCdf((byDate - l.p50) / l.sigma));
  // d80: the date for 80% joint confidence. Root is above byDate (pAll(byDate) ≤ 0.5 < 0.8),
  // unique (product strictly monotone, σ>0 guaranteed). Expansion only bites at ~166+ lanes.
  let lo = byDate, hi = Math.max(...lanes.map(l => l.p50 + 3 * l.sigma));
  for(let g = 0; g < 40 && jointAt(lanes, hi) < 0.80; g++) hi = byDate + (hi - byDate) * 2;
  for(let i = 0; i < 60; i++){ const m = (lo + hi) / 2; if(jointAt(lanes, m) < 0.80) lo = m; else hi = m; }
  const d80 = Math.ceil(hi);                              // whole day, so the quoted date actually clears 0.80
  return {rangedLanes: lanes.length, byDate, pAll, d80, weeksLater: (d80 - byDate) / 7, laneP, excludedSingle};
}
