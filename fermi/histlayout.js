/* Pure geometry of the distribution histogram: axis (linear/log), the 44 bins, and
   the value→x transform. Extracted from drawHist so the pour (and later Feature B's
   threshold hit-testing) share ONE source of the axis/bins/px. Canvas geometry, no
   SVG — deliberately NOT a render*.js file (stays out of the injection/coverage
   corpora). `threshold` is reserved for B's hit-testing (unused here); `forceLinear`
   lets the pour override the log axis when >5% of grains would map to ≤0. */
import {quantile} from '../assets/series.js';   // engine.js does not re-export quantile

export function histLayout(sorted, {width, threshold = null, NB = 44, forceLinear = false} = {}){
  const lo = quantile(sorted, .003), hi = quantile(sorted, .997);
  if(!(hi > lo)) return {ok: false};
  const useLog = !forceLinear && lo > 0 && hi / lo > 30;
  const tx = useLog ? Math.log : (x => x);
  const inv = useLog ? Math.exp : (x => x);
  const tlo = tx(lo), thi = tx(hi);
  const px = v => (tx(v) - tlo) / (thi - tlo) * width;
  const counts = new Array(NB).fill(0);
  let total = 0;
  for(let i = 0; i < sorted.length; i++){
    const v = sorted[i];
    if(v < lo || v > hi) continue;
    let b = Math.floor((tx(v) - tlo) / (thi - tlo) * NB);
    if(b === NB) b = NB - 1;
    if(b >= 0 && b < NB){ counts[b]++; total++; }
  }
  const cmax = Math.max(...counts) || 1;
  const bw = width / NB;
  const bins = [];
  for(let b = 0; b < NB; b++){
    bins.push({x: b * bw, w: bw, v0: inv(tlo + (thi - tlo) * b / NB),
      v1: inv(tlo + (thi - tlo) * (b + 1) / NB), count: counts[b], share: total ? counts[b] / total : 0});
  }
  return {ok: true, lo, hi, useLog, tx, inv, tlo, thi, NB, px, bins, cmax, total};
}
