// energy/frequency/engine.js
/* Pure single-bus System Frequency Response (SFR) model. Deterministic.
   Units: power GW, energy/inertia GVA·s (≈GW·s), frequency Hz, time s.
   Swing equation:  2·E_eff/F0 · dΔf/dt = −trip + P_gov + P_dr + P_dm + P_dc + P_ufls − D·Δf
   Constants are ILLUSTRATIVE (the toy teaches shape); pinned by the swing
   identity and the degenerate cases, not by any real-grid dataset. */

export const F0 = 50;                       // nominal frequency, Hz

export const GOV_GAIN = 5;                  // GW/Hz — aggregate primary-response droop gain
export const GOV_TAU = 5;                   // s — primary response lag (≈full by 2·τ = 10 s)
export const HEADROOM_PER_GVAS = 0.012;     // GW primary headroom per GVA·s (couples to synchronous plant)
export const GFM_GVAS_PER_GW = 20;          // grid-forming virtual-inertia soft cap per GW of battery

/* NESO's three Dynamic response services (Response Service Terms Schedule 2).
   Envelope: deadband ±0.015 Hz → (optional shallow segment to breakpoint
   fa/ra) → steep segment to saturation fs (100%), then flat. DR and DM are
   pre-fault, single-slope, contracted purely on speed (DR slow, DM fast); DC
   is post-fault, two-slope (a shallow ~5% segment out to 0.2 Hz, then steep
   to full at 0.5 Hz), fast. `delay`/`tau` set the first-order-lag arrival:
   DR ≈full by 10 s, DM ≈full by 1 s, DC ≈full by 1 s. */
export const DEADBAND = 0.015;              // Hz — deadband near nominal, all services
export const DR = {fs: 0.2, fa: null, ra: 0, delay: 2.0, tau: 2.7};
export const DM = {fs: 0.2, fa: null, ra: 0, delay: 0.5, tau: 0.2};
export const DC = {fs: 0.5, fa: 0.2, ra: 0.05, delay: 0.5, tau: 0.2};

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

/* Envelope fraction (0..1) of a service's contracted MW delivered at
   deviation magnitude d (Hz). Below DEADBAND: 0. Single-slope services
   (fa == null, i.e. DR/DM) ramp linearly DEADBAND→fs reaching 1.0 at fs.
   Two-slope services (DC) ramp DEADBAND→fa reaching ra, then fa→fs
   reaching 1.0; clamps to 1.0 beyond fs either way. */
export function serviceEnv(d, svc){
  if(d <= DEADBAND) return 0;
  if(svc.fa == null){
    return clamp((d - DEADBAND) / (svc.fs - DEADBAND), 0, 1);
  }
  if(d <= svc.fa){
    return clamp((d - DEADBAND) / (svc.fa - DEADBAND), 0, 1) * svc.ra;
  }
  return svc.ra + clamp((d - svc.fa) / (svc.fs - svc.fa), 0, 1) * (1 - svc.ra);
}

/* A service's target power (GW) for a signed deviation df (Hz) and its
   contracted MW (GW) volume. */
export function serviceResponse(df, mw, svc){
  return mw * serviceEnv(Math.abs(df), svc);
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
  const drMw = p.drMw ?? 0, dmMw = p.dmMw ?? 0, dcMw = p.dcMw ?? 0;

  let df = 0, pGov = 0, pDR = 0, pDM = 0, pDC = 0, pUfls = 0, shedIdx = 0, shedTotal = 0;
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
    const drTarget = time >= DR.delay ? serviceResponse(df, drMw, DR) : 0;
    pDR += (drTarget - pDR) * dt / DR.tau;
    const dmTarget = time >= DM.delay ? serviceResponse(df, dmMw, DM) : 0;
    pDM += (dmTarget - pDM) * dt / DM.tau;
    const dcTarget = time >= DC.delay ? serviceResponse(df, dcMw, DC) : 0;
    pDC += (dcTarget - pDC) * dt / DC.tau;
    const pDamp = -D * df;

    const pNet = -p.trip + pGov + pDR + pDM + pDC + pUfls + pDamp;
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

/* Isolate each lever's effect against a baseline with every lever off
   (drMw/dmMw/dcMw/eGfm all zero). */
export function leverDeltas(p){
  const off = {drMw: 0, dmMw: 0, dcMw: 0, eGfm: 0};
  const base    = simulate({...p, ...off});
  const withGfm = simulate({...p, drMw: 0, dmMw: 0, dcMw: 0});
  const withDr  = simulate({...p, dmMw: 0, dcMw: 0, eGfm: 0});
  const withDm  = simulate({...p, drMw: 0, dcMw: 0, eGfm: 0});
  const withDc  = simulate({...p, drMw: 0, dmMw: 0, eGfm: 0});
  const delta = r => ({rocof: r.rocof - base.rocof, nadir: r.nadir.f - base.nadir.f});
  return {
    gfm: delta(withGfm),
    dr:  delta(withDr),
    dm:  delta(withDm),
    dc:  delta(withDc),
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
