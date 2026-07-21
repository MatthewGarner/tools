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

/* Each lane's completion milestone = its latest OPEN item (tie: max p50, then max
   p90), fitted Normal(p50,p90). [done] is landed (P=1). [fixed] is an external
   event, not a workstream: a lane holding BOTH a real whisker and a fixed gate
   must fit the whisker, or the lane silently drops out of the joint and the plan
   looks safer than it is. */
export function laneFits(model, today = 0){
  const byLane = new Map();
  for(const it of model.items){
    if(it.status === 'done' || it.status === 'fixed') continue;
    const cur = byLane.get(it.lane);
    if(!cur || it.p50 > cur.p50 || (it.p50 === cur.p50 && it.p90 > cur.p90)) byLane.set(it.lane, it);
  }
  const lanes = []; let excludedSingle = 0, stale = 0;
  for(const [lane, it] of byLane){
    if(!it.single && it.p90 - it.p50 > 0){
      lanes.push({name: lane || it.label, p50: it.p50, p90: it.p90, sigma: (it.p90 - it.p50) / Z_P90});
      // stale = a fitted lane already PAST its own P90 finish and still open: the joint
      // treats it as ~98% safe, so the pAll it feeds is falsified-optimistic. FLAG it (a
      // prose caveat), never exclude it — dropping the riskiest lane would only RAISE pAll.
      // Strict: p90 === today is "due today", not past.
      if(it.p90 < today) stale++;
    }
    else excludedSingle++;                               // single-date or same-day range: no distribution to fit
  }
  return {lanes, excludedSingle, stale};
}

export function mergeBias(model, today = 0){
  const {lanes, excludedSingle, stale} = laneFits(model, today);
  if(lanes.length < 2) return null;

  /* The plan's OWN nominal end. This lane sits at Φ(0)=0.5, so jointAt(nominal) ≤ 0.5
     — the invariant the d80 bracket below depends on. d80 stays anchored HERE even
     when byDate moves to an external deadline: d80 is a property of the plan, not
     of any date we measure it against. */
  const nominal = Math.max(...lanes.map(l => l.p50));
  // every lane's median finish already past ⇒ the fit is fiction; say nothing. (This
  // used to ride on `byDate <= today`, which stops protecting us once byDate can be
  // a future deadline — an all-overdue plan would headline ">99% clear it".)
  if(nominal <= today) return null;
  const byDate = nominal;

  const pAll = jointAt(lanes, byDate);
  const laneP = lanes.map(l => normCdf((byDate - l.p50) / l.sigma));
  // d80: the first whole day reaching 80% joint. Root is above `nominal`
  // (jointAt(nominal) ≤ 0.5 < 0.8), unique (product strictly monotone, σ>0
  // guaranteed). Expansion only bites at ~166+ lanes.
  let lo = nominal, hi = Math.max(...lanes.map(l => l.p50 + 3 * l.sigma));
  for(let g = 0; g < 40 && jointAt(lanes, hi) < 0.80; g++) hi = nominal + (hi - nominal) * 2;
  for(let i = 0; i < 60; i++){ const m = (lo + hi) / 2; if(jointAt(lanes, m) < 0.80) lo = m; else hi = m; }
  const d80 = Math.ceil(hi);                              // whole day, so the quoted date actually clears 0.80
  return {rangedLanes: lanes.length, byDate, pAll, d80, weeksLater: (d80 - byDate) / 7,
    laneP, excludedSingle, stale};
}
