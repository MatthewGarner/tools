/* URL hash codec. {v:1, c:presetKey|null, p:{non-default params only}} —
   decode merges over DAY_DEFAULTS so old URLs survive new params; corrupt
   input → null (caller falls back to defaults). Decoded numerics are clamped
   to RANGES: the engine's back-off is quadratic in fleetGW·fleetH, so a
   crafted hash (fleetGW: 5000) must not be able to hang the page. No DOM. */
import {DAY_DEFAULTS} from './day.js';

/* [lo, hi] per param — matches the UI slider bounds (index.html) */
export const RANGES = {
  trough: [18, 40], peak: [30, 60], solarPeak: [0, 14],
  sunrise: [0, 12], sunset: [12, 24],
  gas: [40, 300], carbon: [0, 150], wind: [0, 1],
  fleetGW: [0, 12], fleetH: [1, 6], rte: [0.5, 1],
};

export function encodeDayState(p, preset = null){
  const diff = {};
  for(const k of Object.keys(DAY_DEFAULTS)) if(p[k] !== DAY_DEFAULTS[k]) diff[k] = p[k];
  return {v: 1, c: preset, p: diff};
}

export function decodeDayState(obj){
  if(!obj || obj.v !== 1 || typeof obj.p !== 'object' || !obj.p) return null;
  const p = {...DAY_DEFAULTS};
  for(const k of Object.keys(DAY_DEFAULTS)){
    if(!(k in obj.p)) continue;
    const raw = obj.p[k];
    // only a number or a numeric string counts: Number(null), Number('') and Number(true) would
    // otherwise read as 0 / 1 and clamp to a slider end instead of taking the default
    const v = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) ? Number(raw) : NaN;
    const [lo, hi] = RANGES[k];
    p[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DAY_DEFAULTS[k];
  }
  p.trough = Math.min(p.trough, p.peak);   // a link cannot carry a trough above the peak
  return {p, preset: obj.c ?? null};
}

/* One control moved: the Trough slider stops at the Peak's value and the Peak slider at the
   Trough's (their ranges overlap, 30..40). Returns a new params object. */
export function setParam(p, key, value){
  const next = {...p, [key]: value};
  if(key === 'trough') next.trough = Math.min(value, p.peak);
  if(key === 'peak') next.peak = Math.max(value, p.trough);
  return next;
}
