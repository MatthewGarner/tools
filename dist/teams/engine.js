import {HORIZON,TICK,TEAM_IDS,CAPABILITIES,DEFAULT_LAYOUT,DEFAULT_ASSUMPTIONS,FLOWS,SCENARIOS} from './definitions.js?v=0.20.0';
export * from './definitions.js?v=0.20.0';
import {generateWorkload} from './workload.js?v=0.20.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value * 1e9) / 1e9;
const sum = values => values.reduce((total, value) => total + value, 0);
export function normalizeLayout(raw = {}) {
  return Object.fromEntries(CAPABILITIES.map(cap => [cap.id, TEAM_IDS.includes(raw?.[cap.id]) ? raw[cap.id] : DEFAULT_LAYOUT[cap.id]]));
}
export function normalizeAssumptions(raw = {}) {
  const value = (key, min, max) => clamp(typeof raw?.[key] === 'number' && Number.isFinite(raw[key]) ? raw[key] : DEFAULT_ASSUMPTIONS[key], min, max);
  return { coordination: value('coordination', 0, 0.12), handoffDelay: Math.round(value('handoffDelay', 0, 2) / TICK) * TICK, handoffEffort: value('handoffEffort', 0, 0.5) };
}
export function capacityFor(layout, assumptions = DEFAULT_ASSUMPTIONS) {
  const normalized = normalizeLayout(layout);
  const model = normalizeAssumptions(assumptions);
  return Object.fromEntries(CAPABILITIES.map(cap => {
    const teamSize = CAPABILITIES.filter(other => normalized[other.id] === normalized[cap.id]).length;
    return [cap.id, 1 - model.coordination * (teamSize - 1)];
  }));
}
export function routeFor(flow, layout) {
  const route = (typeof flow === 'string' ? FLOWS[flow].stages : flow).map(stage => ({ capability: Array.isArray(stage) ? stage[0] : stage.capability, team: layout[Array.isArray(stage) ? stage[0] : stage.capability] }));
  return route.map((stage, index) => ({ ...stage, crossing: index > 0 && stage.team !== route[index - 1].team }));
}
export function createWorkload(scenarioId = 'rush') {
  if(scenarioId&&typeof scenarioId==='object')return generateWorkload(scenarioId);
  const scenario = SCENARIOS[scenarioId] || SCENARIOS.rush;
  let seed = scenario.seed >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: scenario.count }, (_, index) => {
    const pick = random();
    let cumulative = 0;
    const type = scenario.weights.find(([, weight]) => { cumulative += weight; return pick < cumulative; })?.[0] || scenario.weights.at(-1)[0];
    const arrival = Math.max(0, Math.round((index * scenario.spacing + (random() - 0.5) * 0.25) / TICK) * TICK);
    const stages = FLOWS[type].stages.map(([capability, effort]) => ({ capability, effort: round(effort * (0.9 + random() * 0.2)) }));
    return { id: `work-${String(index + 1).padStart(2, '0')}`, label: `${FLOWS[type].short} ${String(index + 1).padStart(2, '0')}`, type, arrival, stages };
  });
}
function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}
function snapshot(jobs, day, active, used, capacities) {
  const arrived = jobs.filter(job => job.arrival <= day);
  const completed = arrived.filter(job => job.completedAt !== null);
  const open = arrived.filter(job => job.completedAt === null);
  const queues = Object.fromEntries(CAPABILITIES.map(cap => [cap.id, open.filter(job => job.stages[job.stageIndex].capability === cap.id && job.readyAt <= day).sort((a, b) => a.readyAt - b.readyAt || a.arrival - b.arrival || a.id.localeCompare(b.id)).map(job => job.id)]));
  return {
    day, completed: completed.length, arrived: arrived.length, unfinished: open.length,
    medianLeadTime: median(completed.map(job => job.completedAt - job.arrival)),
    handoffs: sum(jobs.map(job => job.transfers.length)),
    queueTime: sum(jobs.map(job => job.queueTime)),
    transferTime: sum(jobs.map(job => job.transferTime)),
    effortUsed: sum(Object.values(used)),
    handoffEffortUsed: sum(jobs.map(job => job.handoffEffortUsed)),
    baseEffortUsed: sum(jobs.map(job => job.baseEffortUsed)),
    capacityAvailable: sum(Object.values(capacities)) * day,
    oldestOpen: Math.max(0, ...open.map(job => day - job.arrival)),
    queues, active: structuredClone(active), used: { ...used },
    jobs: jobs.map(job => ({ id: job.id, type: job.type, label: job.label, arrival: job.arrival, stageIndex: job.stageIndex, remaining: job.remaining, handoffRemaining: job.handoffRemaining, baseEffortUsed: job.baseEffortUsed, handoffEffortUsed: job.handoffEffortUsed, readyAt: job.readyAt, completedAt: job.completedAt, completions: structuredClone(job.completions), transfers: structuredClone(job.transfers), queueTime: job.queueTime, transferTime: job.transferTime, processingTime: job.processingTime })),
  };
}

export function simulate({ layout = DEFAULT_LAYOUT, scenario = 'rush', assumptions = DEFAULT_ASSUMPTIONS, horizon = HORIZON } = {}) {
  const arrangement = normalizeLayout(layout);
  const model = normalizeAssumptions(assumptions);
  const end = Number.isFinite(horizon) ? Math.round(clamp(horizon, 0, HORIZON) / TICK) * TICK : HORIZON;
  const workload = createWorkload(scenario);
  const capacities = capacityFor(arrangement, model);
  const used = Object.fromEntries(CAPABILITIES.map(cap => [cap.id, 0]));
  const jobs = workload.map(job => ({ ...structuredClone(job), stageIndex: 0, remaining: job.stages[0].effort, handoffRemaining: 0, readyAt: job.arrival, completedAt: null, completions: [], transfers: [], stageStartedAt: null, queueTime: 0, transferTime: 0, processingTime: 0, baseEffortUsed: 0, handoffEffortUsed: 0 }));
  const history = [snapshot(jobs, 0, {}, used, capacities)];
  for (let tick = 0; tick < end / TICK; tick++) {
    const day = tick * TICK;
    const active = {};
    const worked = new Set();
    const finishing = [];
    for (const cap of CAPABILITIES) {
      let budget = capacities[cap.id] * TICK;
      const ready = jobs.filter(job => job.arrival <= day && job.completedAt === null && job.readyAt <= day && job.stages[job.stageIndex].capability === cap.id).sort((a, b) => a.readyAt - b.readyAt || a.arrival - b.arrival || a.id.localeCompare(b.id));
      active[cap.id] = [];
      for (const job of ready) {
        if (budget <= 1e-9) break;
        const spent = Math.min(job.remaining, budget);
        const spentOnHandoff = Math.min(job.handoffRemaining, spent);
        job.handoffRemaining -= spentOnHandoff;
        job.handoffEffortUsed += spentOnHandoff;
        job.baseEffortUsed += spent - spentOnHandoff;
        job.remaining -= spent;
        budget -= spent;
        used[cap.id] += spent;
        if (job.stageStartedAt === null) job.stageStartedAt = day;
        worked.add(job.id);
        active[cap.id].push(job.id);
        if (job.remaining <= 1e-9) finishing.push(job);
      }
    }
    // Every capability spends its slice before any completed stage can feed the
    // next one. Card order therefore cannot create an artificial speed advantage.
    for (const job of jobs) {
      if (job.arrival > day || job.completedAt !== null) continue;
      if (worked.has(job.id)) job.processingTime += TICK;
      else if (job.readyAt > day) job.transferTime += TICK;
      else job.queueTime += TICK;
    }
    for (const job of finishing) {
      const finishedAt = day + TICK;
      const previous = job.stages[job.stageIndex].capability;
      job.completions.push({ capability: previous, start: job.stageStartedAt, end: finishedAt });
      job.stageIndex++;
      job.stageStartedAt = null;
      if (job.stageIndex === job.stages.length) { job.completedAt = finishedAt; job.remaining = 0; continue; }
      const next = job.stages[job.stageIndex].capability;
      const crossing = arrangement[previous] !== arrangement[next];
      job.handoffRemaining = crossing ? model.handoffEffort : 0;
      job.remaining = job.stages[job.stageIndex].effort + job.handoffRemaining;
      job.readyAt = finishedAt + (crossing ? model.handoffDelay : 0);
      if (crossing) job.transfers.push({ from: previous, to: next, start: finishedAt, end: job.readyAt });
    }
    history.push(snapshot(jobs, day + TICK, active, used, capacities));
  }
  return { layout: arrangement, scenario: typeof scenario==='string'?scenario:structuredClone(scenario), assumptions: model, capacities, workload, history, final: history.at(-1) };
}
