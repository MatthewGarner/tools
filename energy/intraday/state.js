/* URL hash codec. {v:2, c:presetKey|null, p:{non-default params only}} — decode merges over DAY_DEFAULTS so
   old URLs survive new params. A link stores only differences from the defaults, so the version says which
   defaults: v:1 links (before the summer-weekday default) are read against LEGACY_DEFAULTS_V1 and keep their
   day; v:2 links are read against today's DAY_DEFAULTS; corrupt
   input → null (caller falls back to defaults). Decoded numerics are clamped
   to RANGES: the engine's back-off is quadratic in fleetGW·fleetH, so a
   crafted hash (fleetGW: 5000) must not be able to hang the page. No DOM. */
import {DAY_DEFAULTS} from './day.js';

/* [lo, hi] per param — matches the UI slider bounds (index.html) */
/* The defaults a v:1 link was written against (the day before the season-consistent default). A v:1 hash
   stores only differences from these, so it is read against them forever. */
export const LEGACY_DEFAULTS_V1 = {
  trough: 22, peak: 44, solarPeak: 6, sunrise: 5, sunset: 21, gas: 100, carbon: 50, wind: 0.32,
  fleetGW: 0, fleetH: 2, rte: 0.85,
};

export const RANGES = {
  trough: [18, 40], peak: [30, 60], solarPeak: [0, 14],
  sunrise: [0, 12], sunset: [12, 24],
  gas: [40, 300], carbon: [0, 150], wind: [0, 1],
  fleetGW: [0, 12], fleetH: [1, 6], rte: [0.5, 1],
};

export function encodeDayState(p, preset = null){
  const diff = {};
  for(const k of Object.keys(DAY_DEFAULTS)) if(p[k] !== DAY_DEFAULTS[k]) diff[k] = p[k];
  return {v: 2, c: preset, p: diff};
}

export function decodeDayState(obj){
  if(!obj || (obj.v !== 1 && obj.v !== 2) || typeof obj.p !== 'object' || !obj.p) return null;
  const base = obj.v === 1 ? {...DAY_DEFAULTS, ...LEGACY_DEFAULTS_V1} : DAY_DEFAULTS;
  const p = {...base};
  for(const k of Object.keys(DAY_DEFAULTS)){
    if(!(k in obj.p)) continue;
    const raw = obj.p[k];
    // only a number or a numeric string counts: Number(null), Number('') and Number(true) would
    // otherwise read as 0 / 1 and clamp to a slider end instead of taking the default
    const v = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) ? Number(raw) : NaN;
    const [lo, hi] = RANGES[k];
    p[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : base[k];
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
