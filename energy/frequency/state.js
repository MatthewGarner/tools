// energy/frequency/state.js — pure control→params mapping + presets (no DOM)
// Shared stressed-grid inertia (GVA·s) for the three low-inertia presets: low
// enough that the no-battery case (grid2030) actually breaches 48.8 Hz and
// sheds a UFLS stage, but not so low that the battery (rescue) can't catch it
// above the line. Tuned empirically — see state.test.mjs for the invariants.
// Must be a multiple of the #inertia slider's step (5): the range input's
// value sanitization snaps any programmatically-set value to the nearest
// step, so a non-step value here would silently display/simulate as
// something else once a preset button applies it.
const LOW_INERTIA = 80;

export const PRESETS = {
  grid2010: {inertia: 250, trip: 1.0, dc: 0, dcspeed: 0.5, gfm: 0},
  grid2030: {inertia: LOW_INERTIA, trip: 1.8, dc: 0, dcspeed: 0.5, gfm: 0},
  rescue:   {inertia: LOW_INERTIA, trip: 1.8, dc: 1.2, dcspeed: 0.4, gfm: 20},
  gfmduel:  {inertia: LOW_INERTIA, trip: 1.8, dc: 1.0, dcspeed: 0.4, gfm: 20},
};

export function paramsFromControls(v){
  return {
    eSync: v.inertia, trip: v.trip,
    dcMw: v.dc, dcDelay: v.dcspeed, eGfm: v.gfm,
    battMW: Math.max(1, v.dc),   // DC volume proxies battery MW rating (caps GFM inertia)
    load: 30,
  };
}
