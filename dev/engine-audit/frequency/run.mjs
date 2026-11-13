// Audit harness: energy/frequency. Run: node dev/engine-audit/frequency/run.mjs
// Units: GW, GVA·s (== GW·s of stored kinetic energy), Hz, s.
// Swing identity used throughout: df/dt = F0 * dP / (2 * E)   (E in GVA·s, dP in GW)
import {check, done, rng} from './lib.mjs';
import {simulate, verdict, leverDeltas, effectiveInertia, UFLS_STAGES, fmtHz} from '../../../energy/frequency/engine.js';
import {PRESETS, paramsFromControls} from '../../../energy/frequency/state.js';
import {assumptionLines} from '../../../energy/frequency/render.js';

const F0 = 50;
const R = rng(20261112);
const pick = (lo, hi, step) => lo + Math.round(R() * Math.round((hi - lo) / step)) * step;
const r1 = x => Math.round(x * 10) / 10;
// random point on the real slider grid (index.html ranges/steps)
const randControls = () => ({inertia: pick(40, 300, 5), trip: r1(pick(0.2, 1.8, 0.1)), dr: r1(pick(0, 1.5, 0.1)),
  dm: r1(pick(0, 1.5, 0.1)), dc: r1(pick(0, 4.5, 0.1)), gfm: pick(0, 40, 2)});
const P = c => paramsFromControls(c);

// ---------- A1. hand case: initial RoCoF with no response -------------------------------
// df/dt(0) = -F0*trip/(2E).  1.8 GW on 90 GVA·s = 50*1.8/180 = 0.5 Hz/s (hand).
{
  const r = simulate({eSync: 90, trip: 1.8, load: 30});
  check('A1a rocof 1.8GW/90GVAs = 0.5 Hz/s (hand)', Math.abs(r.rocof - 0.5) < 1e-12, `rocof=${r.rocof}`);
  check('A1b first Euler step slope equals -rocof', Math.abs((r.f[1] - r.f[0]) / 0.01 + 0.5) < 1e-12, `slope=${(r.f[1]-r.f[0])/0.01}`);
  let worst = 0;
  for(let i = 0; i < 300; i++){
    const c = randControls(), p = P(c), rr = simulate(p);
    const eEff = c.inertia + Math.min(c.gfm, 20 * Math.max(1, c.dr + c.dm + c.dc));
    worst = Math.max(worst, Math.abs(rr.rocof - F0 * c.trip / (2 * eEff)), Math.abs((rr.f[1] - rr.f[0]) / 0.01 + F0 * c.trip / (2 * eEff)));
  }
  check('A1c rocof == F0*trip/(2*Eeff) over 300 UI-grid inputs', worst < 1e-9, `max abs err ${worst.toExponential(2)}`);
}

// ---------- A2. closed form (matrix exponential) in the linear regime -------------------
// No services, no UFLS, governor unsaturated:  x=[df,pGov]
//   df'   = k(-trip + pGov - D df),  k = F0/(2E)
//   pGov' = (-G df - pGov)/tau          (G=5 GW/Hz, tau=5 s)   steady state df_ss = -trip/(G + D)
const G = 5, TAUG = 5, DPU = 1.5, LOAD = 30;
function expm2(A, t){            // exp(A t) by scaling-and-squaring Taylor (independent of any integrator)
  let s = 0, n = Math.max(Math.abs(A[0][0]), Math.abs(A[0][1]), Math.abs(A[1][0]), Math.abs(A[1][1])) * t;
  while(n > 0.25){ n /= 2; s++; }
  const h = t / 2 ** s, M = [[A[0][0]*h, A[0][1]*h], [A[1][0]*h, A[1][1]*h]];
  let E = [[1, 0], [0, 1]], T = [[1, 0], [0, 1]];
  for(let k = 1; k < 20; k++){
    T = [[(T[0][0]*M[0][0] + T[0][1]*M[1][0]) / k, (T[0][0]*M[0][1] + T[0][1]*M[1][1]) / k],
         [(T[1][0]*M[0][0] + T[1][1]*M[1][0]) / k, (T[1][0]*M[0][1] + T[1][1]*M[1][1]) / k]];
    E = [[E[0][0] + T[0][0], E[0][1] + T[0][1]], [E[1][0] + T[1][0], E[1][1] + T[1][1]]];
  }
  for(let i = 0; i < s; i++) E = [[E[0][0]*E[0][0] + E[0][1]*E[1][0], E[0][0]*E[0][1] + E[0][1]*E[1][1]],
                                  [E[1][0]*E[0][0] + E[1][1]*E[1][0], E[1][0]*E[0][1] + E[1][1]*E[1][1]]];
  return E;
}
function analyticLinear(E, trip, t){
  const k = F0 / (2 * E), D = DPU * LOAD / F0;
  const A = [[-k * D, k], [-G / TAUG, -1 / TAUG]];
  const ss = -trip / (G + D), x0 = [-ss, -(-G * ss)];     // x0 - xss with x0=[0,0], xss=[ss, -G ss]
  const M = expm2(A, t);
  return F0 + ss + M[0][0] * x0[0] + M[0][1] * x0[1];
}
{
  let worstSettle = 0, worstNadir = 0, n = 0, worstDt = 0;
  for(let i = 0; i < 200; i++){
    const E = pick(150, 300, 5), trip = r1(pick(0.2, 1.0, 0.1));
    const sim = simulate({eSync: E, trip, load: LOAD});
    // linearity guard: headroom 0.012E >= G*|df|max
    const dfMax = F0 - sim.nadir.f;
    if(G * dfMax > 0.012 * E || sim.shedOccurred) continue;
    n++;
    worstSettle = Math.max(worstSettle, Math.abs(sim.settle - analyticLinear(E, trip, 30)));
    let an = 1e9; for(let t = 0; t <= 30; t += 0.01) an = Math.min(an, analyticLinear(E, trip, t));
    worstNadir = Math.max(worstNadir, Math.abs(sim.nadir.f - an));
    const dt1 = simulate({eSync: E, trip, load: LOAD, dt: 0.0025});
    worstDt = Math.max(worstDt, Math.abs(dt1.nadir.f - sim.nadir.f));
  }
  check('A2a engine settle (t=30s) vs exact exp(At) in linear regime', worstSettle < 0.005, `${n} cases, max |err| ${worstSettle.toExponential(2)} Hz`);
  check('A2b engine nadir vs exact exp(At) in linear regime', worstNadir < 0.005, `max |err| ${worstNadir.toExponential(2)} Hz`);
  console.log(`   info: dt=10ms vs dt=2.5ms nadir spread in linear regime, max ${worstDt.toExponential(2)} Hz`);
  const steadyDroop = -1.0 / (G + DPU * LOAD / F0);
  check('A2c steady droop offset = -trip/(G+D) = -1/5.9 Hz (hand)', Math.abs(analyticLinear(300, 1.0, 600) - (F0 + steadyDroop)) < 1e-9);
}

// ---------- A3. time-step convergence (dt halving) --------------------------------------
{
  const cases = {grid2010: PRESETS.grid2010, grid2030: PRESETS.grid2030, stack: PRESETS.stack, procure3x: PRESETS.procure3x};
  for(const [name, c] of Object.entries(cases)){
    const p = P(c), ref = simulate({...p, dt: 0.00125});
    let line = '';
    let mono = true, prev = Infinity;
    for(const dt of [0.04, 0.02, 0.01, 0.005, 0.0025]){
      const r = simulate({...p, dt});
      const e = Math.abs(r.nadir.f - ref.nadir.f); line += ` dt=${dt}:${e.toExponential(1)}`;
      if(e > prev * 1.001 + 1e-6) mono = false; prev = e;
    }
    const at10 = Math.abs(simulate(p).nadir.f - ref.nadir.f), set10 = Math.abs(simulate(p).settle - ref.settle);
    check(`A3 ${name}: nadir at default dt within 0.01 Hz of dt=1.25ms`, at10 < 0.01, `err ${at10.toExponential(2)} settle err ${set10.toExponential(2)};${line}`);
    check(`A3 ${name}: shed total identical across dt`, simulate(p).shedTotal === ref.shedTotal, `${simulate(p).shedTotal} vs ${ref.shedTotal}`);
  }
}

// ---------- A4. independent RK4 reference with events, seeded sweep ---------------------
function refSim(c, dt){          // slow reference: RK4, fresh implementation of the documented model
  const E = effectiveInertia(c.eSync, c.eGfm, c.battMW), k = F0 / (2 * E), D = DPU * c.load / F0, head = 0.012 * c.eSync;
  const env = (d, fs, fa, ra) => d <= 0.015 ? 0 : fa == null ? Math.min(1, (d - 0.015) / (fs - 0.015))
    : d <= fa ? ra * (d - 0.015) / (fa - 0.015) : ra + (1 - ra) * Math.min(1, (d - fa) / (fs - fa));
  const svc = [[c.drMw, 0.2, null, 0, 2.0, 2.7], [c.dmMw, 0.2, null, 0, 0.5, 0.2], [c.dcMw, 0.5, 0.2, 0.05, 0.5, 0.2]];
  let x = [0, 0, 0, 0, 0], pU = 0, shedIdx = 0, shedTot = 0, t = 0, nad = {f: F0, t: 0};
  const f = x => {};
  const deriv = (x, t) => {
    const df = x[0];
    const out = [k * (-c.trip + x[1] + x[2] + x[3] + x[4] + pU - D * df), (Math.min(head, Math.max(0, G * -df)) - x[1]) / TAUG];
    svc.forEach(([mw, fs, fa, ra, dl, tau], i) => out.push(((t >= dl - 1e-12 && df < 0) ? mw * env(-df, fs, fa, ra) : 0) - x[2 + i]) , 0);
    svc.forEach(([, , , , , tau], i) => out[2 + i] /= tau);
    return out;
  };
  const steps = Math.round(30 / dt);
  for(let n = 0; n <= steps; n++){
    t = n * dt;
    const fr = F0 + x[0]; if(fr < nad.f) nad = {f: fr, t};
    while(shedIdx < UFLS_STAGES.length && fr <= UFLS_STAGES[shedIdx].f){ pU += UFLS_STAGES[shedIdx].shed * c.load; shedTot += UFLS_STAGES[shedIdx].shed; shedIdx++; }
    if(n === steps) break;
    const add = (a, b, s) => a.map((v, i) => v + b[i] * s);
    const k1 = deriv(x, t), k2 = deriv(add(x, k1, dt / 2), t + dt / 2), k3 = deriv(add(x, k2, dt / 2), t + dt / 2), k4 = deriv(add(x, k3, dt), t + dt);
    x = x.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  return {nadir: nad, settle: F0 + x[0], shedTotal: shedTot};
}
{
  let eN = 0, eS = 0, eT = 0, flips = 0, flipEx = null, nShedDiff = 0, n = 300;
  const big = [];
  for(let i = 0; i < n; i++){
    const c = randControls(), p = P(c), a = simulate(p), b = refSim(p, 0.002);
    const dn = Math.abs(a.nadir.f - b.nadir.f), ds = Math.abs(a.settle - b.settle);
    eN = Math.max(eN, dn); eS = Math.max(eS, ds); eT = Math.max(eT, Math.abs(a.nadir.t - b.nadir.t));
    if(Math.abs(a.shedTotal - b.shedTotal) > 1e-9){ flips++; if(!flipEx) flipEx = {c, eng: a.shedTotal, ref: b.shedTotal, engN: a.nadir.f, refN: b.nadir.f}; }
    if(dn > 0.02) big.push({c, dn});
  }
  console.log(`   info: Euler(10ms) vs RK4(2ms): max nadir err ${eN.toFixed(4)} Hz, settle err ${eS.toFixed(4)} Hz, nadir-time err ${eT.toFixed(2)} s, shed-total disagreements ${flips}/${n}`);
  check('A4a engine nadir within 0.02 Hz of RK4 reference (300 UI-grid inputs)', eN < 0.02, `max ${eN.toFixed(4)} Hz; ${big.length} cases >0.02`);
  check('A4b engine settle within 0.02 Hz of RK4 reference', eS < 0.02, `max ${eS.toFixed(4)} Hz`);
  check('A4c UFLS outcome (stages tripped) identical to reference', flips === 0, `${flips}/${n} differ; first: ${JSON.stringify(flipEx)}`);
}

// ---------- A5. monotonicity / bounds / conservation (seeded sweeps) -------------------
{
  const viol = {inertiaRocof: 0, inertiaNadir: 0, tripNadir: 0, tripRocof: 0, drNadir: 0, dmNadir: 0, dcNadir: 0, gfmNadir: 0, gfmRocof: 0};
  const ex = {};
  const N = 400, TOL = 1e-9;
  const rec = (k, c, a, b) => { viol[k]++; if(!ex[k]) ex[k] = {c, before: a, after: b}; };
  for(let i = 0; i < N; i++){
    const c = randControls();
    const base = simulate(P(c));
    // more inertia
    if(c.inertia + 5 <= 300){ const m = simulate(P({...c, inertia: c.inertia + 5}));
      if(m.rocof > base.rocof + TOL) rec('inertiaRocof', c, base.rocof, m.rocof);
      if(m.nadir.f < base.nadir.f - TOL) rec('inertiaNadir', c, base.nadir.f, m.nadir.f); }
    // bigger trip
    if(c.trip + 0.1 <= 1.8 + 1e-9){ const m = simulate(P({...c, trip: r1(c.trip + 0.1)}));
      if(m.nadir.f > base.nadir.f + TOL) rec('tripNadir', c, base.nadir.f, m.nadir.f);
      if(m.rocof < base.rocof - TOL) rec('tripRocof', c, base.rocof, m.rocof); }
    for(const k of ['dr', 'dm', 'dc']){
      const mx = k === 'dc' ? 4.5 : 1.5;
      if(c[k] + 0.1 <= mx + 1e-9){ const m = simulate(P({...c, [k]: r1(c[k] + 0.1)}));
        if(m.nadir.f < base.nadir.f - TOL) rec(k + 'Nadir', c, base.nadir.f, m.nadir.f); }
    }
    if(c.gfm + 2 <= 40){ const m = simulate(P({...c, gfm: c.gfm + 2}));
      if(m.nadir.f < base.nadir.f - TOL) rec('gfmNadir', c, base.nadir.f, m.nadir.f);
      if(m.rocof > base.rocof + TOL) rec('gfmRocof', c, base.rocof, m.rocof); }
  }
  for(const [k, v] of Object.entries(viol)) check(`A5 monotone: ${k}`, v === 0, v ? `${v}/${N} violations; e.g. ${JSON.stringify(ex[k])}` : `0/${N}`);
}
{
  let bad = 0, nanC = 0, shedBig = 0, ovMax = F0, ex = null;
  for(let i = 0; i < 400; i++){
    const c = randControls(), r = simulate(P(c));
    const mn = Math.min(...r.f);
    if(!(r.nadir.f === mn)) { bad++; ex = ex || c; }   // (settle is df after one further step, t=30.01 s, so it is not compared to the last sample)
    if(r.f.some(v => !Number.isFinite(v))) nanC++;
    if(r.shedTotal > 0.6 + 1e-12) shedBig++;
    ovMax = Math.max(ovMax, Math.max(...r.f));
  }
  check('A6a nadir==min(trace), finite', bad === 0 && nanC === 0, `bad ${bad}, nan ${nanC}`);
  check('A6b shed total <= 60 %', shedBig === 0);
  console.log(`   info: max frequency seen on UI grid ${ovMax.toFixed(3)} Hz (over-shoot above nominal after load shedding?)`);
}

// ---------- A7. presets: do the page's claims hold? ------------------------------------
{
  const out = {};
  for(const [k, c] of Object.entries(PRESETS)){ const r = simulate(P(c)); out[k] = {rocof: +r.rocof.toFixed(3), nadir: +r.nadir.f.toFixed(3), tN: r.nadir.t, settle: +r.settle.toFixed(3), shed: r.shedTotal}; }
  console.log('   info: presets', JSON.stringify(out));
  check('A7a grid2030 (no battery) breaches 48.8 and sheds (state.js comment)', out.grid2030.shed > 0);
  check('A7b stack/procure3x hold above 48.8 without shedding (state.js comment)', out.stack.shed === 0 && out.procure3x.shed === 0);
  check('A7c every preset settles at or below nominal (page copy: settles off-nominal)', Object.values(out).every(o => o.settle <= 50), JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, o]) => [k, o.settle]))));
}

// ---------- A8. is "settle" settled at 30 s? --------------------------------------------
{
  let n = 0, worst = 0, ex = null, big = 0;
  for(let i = 0; i < 300; i++){
    const c = randControls(), p = P(c), a = simulate(p), b = simulate({...p, tEnd: 300});
    const d = Math.abs(a.settle - b.settle); n++;
    if(d > 0.01) big++;
    if(d > worst){ worst = d; ex = c; }
  }
  check('A8 "settle" (t=30 s) within 0.01 Hz of the t=300 s value', big === 0, `${big}/${n} differ by >0.01 Hz; worst ${worst.toFixed(3)} Hz at ${JSON.stringify(ex)}`);
}

// ---------- A9. what the page prints vs the engine --------------------------------------
{
  const hz = fmtHz;       // the one formatter, now shared by verdict, tiles, SVG, markdown
  let mism = [], negZero = 0, negDelta = 0, ndeltas = 0, exNeg = null, clearLine = [], verdGrid = 0;
  for(let ti = 0; ti <= 8; ti++) for(let ii = 40; ii <= 300; ii += 5){
    const c = {inertia: ii, trip: r1(0.2 + 0.2 * ti), dr: 0, dm: 0, dc: 0, gfm: 0}, r = simulate(P(c));
    verdGrid++;
    const pp = P(c), vt = verdict(r, pp);
    if(vt.match(/falls at ([\d.]+) Hz\/s/)[1] !== hz(r.rocof)) mism.push(['rocof', c, vt, hz(r.rocof)]);
    if(vt.match(/bottoms at ([\d.]+) Hz/)[1] !== hz(r.nadir.f)) mism.push(['nadir', c, vt, hz(r.nadir.f)]);
    if(!r.shedOccurred && hz(r.nadir.f) === '48.80') clearLine.push(c);
  }
  check('A9a verdict text and the shared tile formatter print the same digits (no-response grid)', mism.length === 0, `${mism.length}/${verdGrid * 2} differ`);
  check('A9b "holds at X, clear of the 48.8 Hz line" never prints X = 48.80', clearLine.length === 0, `${clearLine.length} cases; first ${JSON.stringify(clearLine[0])}`);
  // lever deltas: sign and the text "lifts the nadir X Hz"
  let sign = 0, exs = null, exZ = null;
  for(let i = 0; i < 400; i++){
    const c = randControls(); if(!(c.dr + c.dm + c.dc + c.gfm > 0)) continue;
    const p = P(c), d = leverDeltas(p); ndeltas++;
    for(const k of ['dr', 'dm', 'dc']) if(p[{dr: 'drMw', dm: 'dmMw', dc: 'dcMw'}[k]] > 0 && d[k].nadir < -1e-9){ negDelta++; exs = exs || {c, k, v: d[k].nadir}; }
    for(const k of ['dr', 'dm', 'dc']) if(d[k].nadir.toFixed(2) === '-0.00'){ negZero++; exZ = exZ || {c, k, v: d[k].nadir}; }
  }
  check('A9c lever delta text "lifts the nadir X Hz" never negative', negDelta === 0, `${negDelta} negative of ${ndeltas}; first ${JSON.stringify(exs)}`);
  check('A9d lever delta never prints "-0.00 Hz"', negZero === 0, `${negZero} occurrences (gfm nadir delta is not printed; it was -7e-5 once, noise)`);
  // verdict sentence quotes eSync as "grid" inertia while RoCoF uses eEff
  const p = P({inertia: 80, trip: 1.8, dr: 0.5, dm: 0.5, dc: 1.5, gfm: 20}), r = simulate(p), v = verdict(r, p);
  const quoted = 1.8 * 50 / (2 * +v.match(/on a (\d+) GVA·s grid/)[1]);
  console.log('   info: stack preset verdict:', v, `| hand RoCoF from the quoted 80 GVA·s = ${quoted.toFixed(2)}`);
  check('A9e verdict RoCoF is reproducible from the inertia the same sentence quotes', Math.abs(parseFloat(v.match(/falls at ([\d.]+) Hz\/s/)[1]) - quoted) < 0.005,
    `sentence: ${v.slice(0, 90)}`);
}

// ---------- A10. edges the controls can reach / not reach -------------------------------
{
  // phantom 1 GW battery: grid-forming inertia with NO contracted response
  const c = {inertia: 80, trip: 1.8, dr: 0, dm: 0, dc: 0, gfm: 40}, p = P(c), r = simulate(p);
  check('A10a (ruling: model kept) the 1 GW grid-forming floor is labelled as a minimum, not as response capacity', r.eEff === 100 && /grid-forming basis: 1 GW minimum/.test(assumptionLines(p)[1]), `eEff=${r.eEff}; ${assumptionLines(p)[1]}`);
  // zero / negative / unreachable
  const z = simulate({eSync: 0.0001, trip: 1, load: 30});
  check('A10b tiny inertia stays finite (slider min is 40 so unreachable)', Number.isFinite(z.nadir.f));
  const zi = simulate({eSync: 0, trip: 1, load: 30});
  console.log(`   info: eSync=0 (unreachable): rocof=${zi.rocof} nadir=${zi.nadir.f} finite=${Number.isFinite(zi.nadir.f)}`);
  const neg = simulate({eSync: 90, trip: -1, load: 30});
  console.log(`   info: trip=-1 (unreachable, slider min 0.2): nadir=${neg.nadir.f} settle=${neg.settle.toFixed(3)} (frequency rises, "nadir" stays 50, verdict says "bottoms at ${neg.nadir.f.toFixed(2)}")`);
  const big = simulate({eSync: 90, trip: 1e6, load: 30});
  console.log(`   info: trip=1e6: finite=${Number.isFinite(big.nadir.f)} nadir=${big.nadir.f.toFixed(1)} Hz shedTotal=${big.shedTotal}`);
  // overshoot above 50.2 after UFLS
  let mx = 0, ex = null;
  for(let i = 0; i < 400; i++){ const c = randControls(), r = simulate(P(c)); const m = Math.max(...r.f); if(m > mx){ mx = m; ex = c; } }
  console.log(`   info: highest frequency over UI grid: ${mx.toFixed(3)} Hz at ${JSON.stringify(ex)}`);
}
check('A8 shed-load simplification (FREQ-Q1, ruled) is stated in the assumptions', assumptionLines(P({inertia: 90, trip: 1.8, dr: 0, dm: 0, dc: 1, gfm: 0})).includes('Load that is shed stays off for the 30 seconds shown, and damping uses demand as it was before shedding.'));
done();
