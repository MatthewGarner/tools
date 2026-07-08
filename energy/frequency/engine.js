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

/* GB LFDD, illustrative staging: first stage 48.8 Hz @ ~5%; sums to 0.60 over
   9 stages (the scheme sheds up to ~60% of demand). */
export const UFLS_STAGES = [
  {f: 48.8, shed: 0.05}, {f: 48.75, shed: 0.05}, {f: 48.7, shed: 0.05},
  {f: 48.6, shed: 0.10}, {f: 48.5, shed: 0.10}, {f: 48.4, shed: 0.05},
  {f: 48.2, shed: 0.05}, {f: 48.0, shed: 0.10}, {f: 47.8, shed: 0.05},
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

/* Forward-Euler integration of the swing equation. dt=10 ms over 30 s.
   UFLS closes the loop: a breached stage disconnects load = a positive
   power step that re-enters the balance and arrests the fall. */
export function simulate(p){
  const dt = p.dt ?? 0.01, tEnd = p.tEnd ?? 30;
  const load = p.load ?? 30;
  const eEff = effectiveInertia(p.eSync, p.eGfm ?? 0, p.battMW ?? 0);
  const headroom = govHeadroom(p.eSync);
  const D = dampingCoeff(load, p.dampingPu ?? 1.5);
  const dcMw = p.dcMw ?? 0, dcDelay = p.dcDelay ?? 0.5;

  let df = 0, pGov = 0, pDc = 0, pUfls = 0, shedIdx = 0, shedTotal = 0;
  const t = [], f = [], shed = [];
  let nadir = {f: F0, t: 0};
  const steps = Math.round(tEnd / dt);

  for(let k = 0; k <= steps; k++){
    const time = k * dt;
    const freq = F0 + df;
    t.push(time); f.push(freq);
    if(freq < nadir.f) nadir = {f: freq, t: time};

    // UFLS: trip every stage now breached, in order (positive power step)
    while(shedIdx < UFLS_STAGES.length && freq <= UFLS_STAGES[shedIdx].f){
      const s = UFLS_STAGES[shedIdx];
      pUfls += s.shed * load; shedTotal += s.shed;
      shed.push({f: s.f, t: time, shed: s.shed});
      shedIdx++;
    }

    const govTarget = Math.min(headroom, Math.max(0, GOV_GAIN * (-df)));
    pGov += (govTarget - pGov) * dt / GOV_TAU;
    const dcTarget = time >= dcDelay ? dcResponse(df, dcMw) : 0;
    pDc += (dcTarget - pDc) * dt / DC_TAU;
    const pDamp = -D * df;

    const pNet = -p.trip + pGov + pDc + pUfls + pDamp;
    df += (pNet * F0 / (2 * eEff)) * dt;
  }

  return {
    t, f, eEff,
    rocof: rocof(p.trip, eEff),   // analytic initial magnitude (matches identity)
    nadir, settle: F0 + df,
    shed, shedTotal, shedOccurred: shed.length > 0,
  };
}

const hz = v => (Math.round(v * 100) / 100).toFixed(2);

/* Isolate each battery lever's effect against a no-battery baseline. */
export function leverDeltas(p){
  const base   = simulate({...p, dcMw: 0, eGfm: 0});
  const withDc = simulate({...p, eGfm: 0});
  const withGfm= simulate({...p, dcMw: 0});
  return {
    dc:  {rocof: withDc.rocof  - base.rocof, nadir: withDc.nadir.f  - base.nadir.f},
    gfm: {rocof: withGfm.rocof - base.rocof, nadir: withGfm.nadir.f - base.nadir.f},
  };
}

/* One quotable line. All figures come from the result, which obeys the
   swing identity — never hand-write a RoCoF here. */
export function verdict(r, p){
  const shed = r.shedOccurred
    ? ` Load shedding catches it — ~${Math.round(r.shedTotal * 100)}% of demand disconnected to save the rest.`
    : ` The nadir holds at ${hz(r.nadir.f)} Hz, clear of the ${UFLS_STAGES[0].f} Hz shedding line.`;
  return `A ${p.trip} GW loss on a ${Math.round(p.eSync)} GVA·s grid falls at ` +
    `${hz(r.rocof)} Hz/s and bottoms at ${hz(r.nadir.f)} Hz.${shed}`;
}
