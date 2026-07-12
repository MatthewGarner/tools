/* Signal-detection engine for /alarm. Pure — no DOM.
   One normal "score" per case (benign centred 0, real centred d′); a threshold t
   splits alarm from quiet. Everything the page quotes — sensitivity, FPR, the
   1,000-dot classification, the natural-frequency verdict — is defined here. */
import {mulberry32, gaussian} from '../assets/series.js';

export const SEED = 0xA1A2;
export const N = 1000;

/* Standard normal CDF via Abramowitz & Stegun 7.1.26 (erf, |err| < 1.5e-7). */
export function phi(x){ return 0.5 * (1 + erf(x / Math.SQRT2)); }
function erf(x){
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/* Inverse normal CDF via Acklam's rational approximation (rel err ~1.15e-9). */
export function probit(p){
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q;
  if(p < plow){
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
      ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if(p <= phigh){
    q = p - 0.5; const r = q*q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
      (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
    ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

/* The four rates implied by (d′, t); base rate doesn't move them (it moves the mix). */
export function derived({dprime, t}){
  const sensitivity = phi(dprime - t);   // P(alarm | real)
  const fpr = phi(-t);                    // P(alarm | benign)
  return {sensitivity, fpr, specificity: 1 - fpr, auc: phi(dprime / Math.SQRT2)};
}

/* A vendor's "99% sensitive, 99% specific" claim → the (d′, t) that produces it. */
export function fromClaim(sens, spec){
  return {dprime: probit(sens) + probit(spec), t: probit(spec)};
}

/* One seeded init of per-dot (u, g) — uniform for the class draw, gaussian for the
   score. Call order fixed (u then g) so results are stable; classify() re-derives
   from these without resampling, so dragging a slider flips dots, never reshuffles. */
export function population(seed = SEED, n = N){
  const rand = mulberry32(seed);
  const gauss = gaussian(rand);
  const out = [];
  for(let i = 0; i < n; i++){
    const u = rand();
    const g = gauss();
    out.push({u, g});
  }
  return out;
}

export function classify(pop, {baseRate, dprime, t}){
  const dots = pop.map((p, i) => {
    const real = p.u < baseRate;
    const score = p.g + (real ? dprime : 0);
    return {i, real, score, alarm: score > t};
  });
  const counts = {tp: 0, fp: 0, tn: 0, fn: 0};
  for(const dt of dots){
    if(dt.real) counts[dt.alarm ? 'tp' : 'fn']++;
    else counts[dt.alarm ? 'fp' : 'tn']++;
  }
  return {dots, counts};
}

/* Smallest honest small-integer fraction: first denominator whose nearest k/d lands
   within 0.02 of frac (tighter than a first look suggests — 0.9 must reject 7/8's
   0.025 miss and reach the exact 9/10; 0.87 still takes 7/8 at 0.005). */
const DENOMS = [2, 3, 4, 5, 6, 8, 10, 12, 20, 25, 50, 100];
const TOL = 0.02;
export function inN(frac){
  if(!(frac > 0)) return {k: 0, d: 0, text: 'none'};
  if(frac >= 1) return {k: 1, d: 1, text: 'every one'};
  for(const d of DENOMS){
    const k = Math.max(1, Math.min(d - 1, Math.round(frac * d)));
    if(Math.abs(frac - k / d) <= TOL) return {k, d, text: k + ' in ' + d};
  }
  const k = Math.max(1, Math.min(99, Math.round(frac * 100)));
  return {k, d: 100, text: k + ' in 100'};
}

/* The quotable lines. alarm = share of alarms that are false (the headline);
   miss = share of real issues that sail through; fine = the expected-value fine print. */
export function verdicts(counts){
  const {tp, fp, tn, fn} = counts;
  const alarms = tp + fp, reals = tp + fn;
  let alarm;
  if(alarms === 0) alarm = 'No alarms at this threshold — and ' + reals +
    (reals === 1 ? ' real issue sails' : ' real issues sail') + ' through.';
  else if(fp === 0) alarm = 'Every alarm here is real — no false positives at this threshold.';
  else alarm = inN(fp / alarms).text + ' alarms at this threshold are false.';

  let miss;
  if(reals === 0) miss = 'No real issues in the room at this base rate.';
  else if(fn === 0) miss = '…and every real issue trips an alarm.';
  else miss = '…and ' + inN(fn / reals).text + ' real issues sails through.';

  const pct = x => Math.round(x * 100);
  const precision = alarms ? tp / alarms : 0;
  const recall = reals ? tp / reals : 0;
  const spec = (fp + tn) ? tn / (fp + tn) : 0;
  const fine = 'Expected: precision ' + pct(precision) + '%, sensitivity ' + pct(recall) +
    '%, specificity ' + pct(spec) + '%.';
  return {alarm, miss, fine};
}

/* Copy-for-doc markdown: the picture as a paste-able paragraph. */
export function markdown(params, d, counts, v, href){
  const pct = x => Math.round(x * 100);
  const lines = [
    '**Base-rate check** — base rate ' + pct(params.baseRate) + '%, d′ ' + params.dprime.toFixed(2) +
      ', threshold ' + params.t.toFixed(2) + '.',
    '',
    '- ' + v.alarm,
    '- ' + v.miss.replace(/^…/, '') ,
    '- Of 1,000: ' + counts.tp + ' true alarms, ' + counts.fp + ' false alarms, ' +
      counts.fn + ' missed, ' + counts.tn + ' correctly quiet.',
    '- ' + v.fine,
  ];
  if(href) lines.push('', '[Open in the base-rate playground](' + href + ')');
  return lines.join('\n') + '\n';
}
