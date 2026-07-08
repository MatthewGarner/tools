// energy/frequency/engine.js
/* Pure single-bus System Frequency Response (SFR) model. Deterministic.
   Units: power GW, energy/inertia GVA·s (≈GW·s), frequency Hz, time s.
   Swing equation:  2·E_eff/F0 · dΔf/dt = −trip + P_gov + P_dc + P_ufls − D·Δf
   Constants are ILLUSTRATIVE (the toy teaches shape); pinned by the swing
   identity and the degenerate cases, not by any real-grid dataset. */

export const F0 = 50;                       // nominal frequency, Hz

export const GOV_GAIN = 5;                  // GW/Hz — aggregate primary-response droop gain
export const GOV_TAU = 5;                   // s — primary response lag (≈full by 2·τ = 10 s)
export const HEADROOM_PER_GVAS = 0.012;     // GW primary headroom per GVA·s (couples to synchronous plant)
export const DC_TAU = 0.2;                  // s — Dynamic Containment ramp time constant
export const DC_FULL_HZ = 0.5;              // full contracted DC output at ±0.5 Hz
export const DC_DEADBAND = 0.015;           // Hz — DC deadband near nominal
export const GFM_GVAS_PER_GW = 20;          // grid-forming virtual-inertia soft cap per GW of battery

/* GB LFDD, illustrative staging: first stage 48.8 Hz @ ~5%; sums ≈ 0.60 over 9 stages */
export const UFLS_STAGES = [
  {f: 48.8, shed: 0.05}, {f: 48.75, shed: 0.05}, {f: 48.7, shed: 0.10},
  {f: 48.6, shed: 0.10}, {f: 48.5, shed: 0.075}, {f: 48.4, shed: 0.075},
  {f: 48.2, shed: 0.10}, {f: 48.0, shed: 0.10}, {f: 47.8, shed: 0.05},
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function effectiveInertia(eSync, eGfmReq, battMW){
  const cap = GFM_GVAS_PER_GW * battMW;
  return eSync + clamp(eGfmReq, 0, cap);
}
export function govHeadroom(eSync){ return HEADROOM_PER_GVAS * eSync; }        // GW
export function dampingCoeff(load, dampingPu){ return dampingPu * load / F0; } // GW/Hz
export function rocof(trip, eEff){ return trip * F0 / (2 * eEff); }            // Hz/s magnitude

/* DC target power (GW) for a frequency deviation df (Hz): 0 in the deadband,
   ramping linearly to the full MW cap at ±DC_FULL_HZ. */
export function dcResponse(df, dcMw){
  const frac = (Math.abs(df) - DC_DEADBAND) / (DC_FULL_HZ - DC_DEADBAND);
  return clamp(frac, 0, 1) * dcMw;
}
