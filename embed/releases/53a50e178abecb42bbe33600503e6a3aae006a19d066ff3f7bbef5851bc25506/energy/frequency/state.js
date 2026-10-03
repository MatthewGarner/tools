// energy/frequency/state.js — pure control→params mapping + presets (no DOM)
// Shared stressed-grid inertia (GVA·s) for the three low-inertia presets: low
// enough that the no-battery case (grid2030) actually breaches 48.8 Hz and
// sheds a UFLS stage, but not so low that the battery (stack/procure3x)
// can't catch it above the line. Tuned empirically — see state.test.mjs for
// the invariants.
// Must be a multiple of the #inertia slider's step (5): the range input's
// value sanitization snaps any programmatically-set value to the nearest
// step, so a non-step value here would silently display/simulate as
// something else once a preset button applies it.
const LOW_INERTIA = 80;

export const PRESETS = {
  grid2010:  {inertia: 250, trip: 1.0, dr: 0,   dm: 0,   dc: 0,   gfm: 0},
  grid2030:  {inertia: LOW_INERTIA, trip: 1.8, dr: 0,   dm: 0,   dc: 0,   gfm: 0},
  stack:     {inertia: LOW_INERTIA, trip: 1.8, dr: 0.5, dm: 0.5, dc: 1.5, gfm: 20},
  procure3x: {inertia: LOW_INERTIA, trip: 1.8, dr: 1.5, dm: 1.5, dc: 4.5, gfm: 40},
};

export function paramsFromControls(v){
  return {
    eSync: v.inertia, trip: v.trip,
    drMw: v.dr, dmMw: v.dm, dcMw: v.dc, eGfm: v.gfm,
    battMW: Math.max(1, v.dr + v.dm + v.dc),   // total contracted response caps grid-forming inertia
    load: 30,
  };
}
