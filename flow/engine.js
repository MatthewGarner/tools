/* Pure flow engine: processor-sharing queue simulation, seeded and deterministic.
   Model (spec-fixed): one WIP-limited stage; in-progress items share the team's
   capacity evenly, capped at one person per item (swarming can't compress a
   3-day item below 3 days); arrivals the limit holds out wait in an unbounded
   backlog. Two clocks: cycle (start→done) and lead (request→done). No DOM. */
import {mulberry32, gaussian, quantile} from '../assets/series.js';

export const SEED = 0xF10D;
export const WEEK = 5;                       // working days
const COV = {low: 0.25, med: 0.5, high: 1.0};

export function simulate({demandPerWeek, itemDays, team, wipLimit, cov},
    {seed = SEED, horizonDays = 2000, trace = false} = {}){
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const c = typeof cov === 'number' ? cov : COV[cov];
  const sg2 = Math.log(1 + c * c), mu = Math.log(itemDays) - sg2 / 2, sg = Math.sqrt(sg2);
  const size = () => Math.exp(mu + sg * gauss());
  const nextArrival = t => t - Math.log(1 - rand()) / (demandPerWeek / WEEK);

  const backlog = [], active = [], done = [];
  const events = [];
  const ev = (t, kind, id) => { if(trace) events.push({t: +t.toFixed(3), kind, id}); };
  let t = 0, arrivalT = nextArrival(0), nextId = 0;
  let busyPersonDays = 0, wipIntegral = 0;

  /* per-item person-rate under even sharing, one person per item at most */
  const rate = () => active.length ? Math.min(1, team / active.length) : 0;
  const pull = () => {
    while(active.length < wipLimit && backlog.length){
      const it = backlog.shift();
      it.startT = t;
      active.push(it);
      ev(t, 'start', it.id);
    }
  };
  const nextDone = () => {
    const r = rate();
    let best = Infinity, bi = -1;
    active.forEach((it, i) => {
      const d = t + it.remaining / r;
      if(d < best){ best = d; bi = i; }
    });
    return {at: best, i: bi};
  };

  while(t < horizonDays){
    const nd = active.length ? nextDone() : {at: Infinity, i: -1};
    const tNext = Math.min(arrivalT, nd.at, horizonDays);
    const dt = tNext - t, r = rate();
    for(const it of active) it.remaining -= r * dt;
    busyPersonDays += active.length * r * dt;
    wipIntegral += active.length * dt;
    t = tNext;
    if(t >= horizonDays) break;
    if(nd.at <= arrivalT && nd.i >= 0){
      const it = active.splice(nd.i, 1)[0];
      it.doneT = t;
      done.push(it);
      ev(t, 'done', it.id);
      pull();
    } else {
      const it = {id: nextId++, arriveT: t, remaining: 0, work: 0};
      it.work = it.remaining = size();
      backlog.push(it);
      ev(t, 'arrive', it.id);
      pull();
      arrivalT = nextArrival(t);
    }
  }

  const warm = horizonDays * 0.2;
  const kept = done.filter(d => d.doneT >= warm);
  const cycleS = kept.map(d => d.doneT - d.startT).sort((a, b) => a - b);
  const leadS = kept.map(d => d.doneT - d.arriveT).sort((a, b) => a - b);
  const dist = s => ({p50: quantile(s, .5), p85: quantile(s, .85), p95: quantile(s, .95),
    mean: s.reduce((a, x) => a + x, 0) / (s.length || 1)});
  const lead = dist(leadS);
  const workMean = kept.reduce((a, d) => a + d.work, 0) / (kept.length || 1);
  return {
    cycle: dist(cycleS),
    lead,
    leadSamples: leadS.map(v => +v.toFixed(2)),
    throughputPerWeek: kept.length / (horizonDays - warm) * WEEK,
    utilisation: Math.min(1, busyPersonDays / (horizonDays * team)),
    impliedWip: wipIntegral / horizonDays,
    workDays: workMean,
    waitDays: lead.mean - workMean,
    waitShare: lead.mean ? (lead.mean - workMean) / lead.mean : 0,
    backlogSlopePerWeek: backlog.length / (horizonDays / WEEK),
    completed: kept.length,
    ...(trace ? {events} : {}),
  };
}

/* Re-run the sim across WIP limits — the knee is where more WIP stops buying throughput. */
export function wipSweep(params, {seed = SEED, maxWip = 20} = {}){
  const out = [];
  for(let w = 1; w <= maxWip; w++){
    const r = simulate({...params, wipLimit: w}, {seed});
    out.push({wip: w, throughputPerWeek: r.throughputPerWeek, cycleP50: r.cycle.p50, cycleP85: r.cycle.p85});
  }
  return out;
}

export function kneeWip(sweep){
  const max = Math.max(...sweep.map(s => s.throughputPerWeek));
  return (sweep.find(s => s.throughputPerWeek >= max * 0.95) || sweep[0]).wip;
}
