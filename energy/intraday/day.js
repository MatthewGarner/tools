/* Pure day engine for the intraday toy: 24 hourly clearings over /merit-order's
   dispatch, a greedy storage schedule decided on the RAW shape, and one re-clear
   with the schedule applied as net demand. No DOM. Storage acts through the
   demand line (charge adds, discharge subtracts) — no fleet block in the stack,
   and the catalogue's static storage rows are EXCLUDED (double-count guard:
   the day-aware fleet is the only storage). */

/* Normalised GB-flavoured day shape (0 = trough, 1 = peak): overnight trough
   ~03:00, morning ramp, midday plateau, evening peak 18:00. Fixed shape — the
   trough/peak params scale it; the shape itself is not editable. */
export const BASE_PROFILE = [
  0.18, 0.10, 0.04, 0.00, 0.02, 0.08, 0.22, 0.42, 0.55, 0.62, 0.66, 0.68,
  0.67, 0.65, 0.63, 0.66, 0.74, 0.88, 1.00, 0.97, 0.85, 0.68, 0.48, 0.30,
];

export const DAY_DEFAULTS = {
  trough: 28, peak: 44,                    // GW
  solarPeak: 6, sunrise: 5, sunset: 21,    // GW; hours (summer-ish default)
  gas: 100, carbon: 50, wind: 0.28,        // merit-order levers passed through
  fleetGW: 0, fleetH: 2, rte: 0.85,        // the day-aware storage fleet
};

export function demandAt(h, p){ return p.trough + BASE_PROFILE[h] * (p.peak - p.trough); }

/* Half-sine solar bell between sunrise and sunset; zero outside. */
export function solarAt(h, p){
  if(p.solarPeak <= 0 || p.sunset <= p.sunrise || h <= p.sunrise || h >= p.sunset) return 0;
  return p.solarPeak * Math.sin(Math.PI * (h - p.sunrise) / (p.sunset - p.sunrise));
}
