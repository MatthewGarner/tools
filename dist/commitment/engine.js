export const HORIZON = 36;
export const BASE_CAPACITY = 12;
export const REPAIR_COST = 1.7;
export const DEFAULT_ASSUMPTIONS = Object.freeze({ repairCost: REPAIR_COST, fatigueCapacityLoss: 0.45, lateReportingCost: 0.065 });
export const DEFAULT_POLICY = Object.freeze({ commitment: 95, quality: 25, recovery: 4 });
export const SCENARIOS = Object.freeze({
  rush: { name: 'The launch rush', description: 'A demand surge arrives in weeks 9–16. Today’s promises carry into tomorrow’s workload.', seed: 47, demand: 10.6, surge: 5.8, policy: DEFAULT_POLICY },
  squeeze: { name: 'The steady squeeze', description: 'Demand stays a little above comfortable capacity. Small gaps have time to compound.', seed: 19, demand: 13.4, surge: 0, policy: { commitment: 95, quality: 20, recovery: 3 } },
  runway: { name: 'Room to breathe', description: 'Lower demand and protected recovery leave some room to try a more ambitious policy.', seed: 83, demand: 10.3, surge: 0, policy: { commitment: 85, quality: 75, recovery: 12 } },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
export function normalizePolicy(policy = DEFAULT_POLICY) {
  return { commitment: clamp(Number(policy.commitment), 40, 100), quality: clamp(Number(policy.quality), 0, 100), recovery: clamp(Number(policy.recovery), 0, 25) };
}
export function normalizeAssumptions(raw = DEFAULT_ASSUMPTIONS) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const bounded = (key, min, max) => clamp(typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : DEFAULT_ASSUMPTIONS[key], min, max);
  return { repairCost: bounded('repairCost', 0.5, 4), fatigueCapacityLoss: bounded('fatigueCapacityLoss', 0, 0.75), lateReportingCost: bounded('lateReportingCost', 0, 0.15) };
}
export function demandForWeek(scenario, week) {
  // Stateless pseudo-randomness keeps every branch on exactly the same demand tape.
  let x = (scenario.seed + week * 374761393) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  const noise = ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  const surge = week >= 9 && week <= 16 ? scenario.surge : 0;
  return Math.max(0, (scenario.demand + surge) * (0.92 + noise * 0.16));
}
export function createState() {
  return { week: 0, fatigue: 0.08, trust: 0.92, promises: [], hiddenDefects: [], knownDefects: 0, accepted: 0, declined: 0, shipped: 0, defectsCreated: 0, repaired: 0, history: [] };
}
export function policyAt(scenario, events, week) {
  let policy = normalizePolicy(scenario.policy);
  for (const event of [...events].sort((a, b) => a.week - b.week)) if (event.week <= week) policy = normalizePolicy(event.policy);
  return policy;
}

export function step(previous, scenario, rawPolicy, rawAssumptions = DEFAULT_ASSUMPTIONS) {
  const state = structuredClone(previous);
  const policy = normalizePolicy(rawPolicy);
  const assumptions = normalizeAssumptions(rawAssumptions);
  const week = state.week + 1;
  const demand = demandForWeek(scenario, week);
  const accepted = demand * policy.commitment / 100;
  state.accepted += accepted;
  state.declined += demand - accepted;
  state.promises.push({ amount: accepted, due: week + 1 });

  const returned = state.hiddenDefects.filter(d => d.due <= week).reduce((sum, d) => sum + d.amount, 0);
  state.hiddenDefects = state.hiddenDefects.filter(d => d.due > week);
  state.knownDefects += returned;
  const openAtStart = state.promises.reduce((sum, p) => sum + p.amount, 0);
  const lateAtStart = state.promises.filter(p => p.due < week).reduce((sum, p) => sum + p.amount, 0);
  const capacity = BASE_CAPACITY * (1 - assumptions.fatigueCapacityLoss * state.fatigue);
  const reporting = Math.min(capacity * 0.4, 0.4 + assumptions.lateReportingCost * lateAtStart + 1.4 * (1 - state.trust));
  const recovery = capacity * policy.recovery / 100;
  const normal = Math.max(0, capacity - reporting - recovery);
  const work = openAtStart + state.knownDefects * assumptions.repairCost;
  const pressure = work / Math.max(1, normal);
  const overtime = Math.min(3, Math.max(0, work - normal)) * (1 - policy.recovery / 25);
  let available = normal + overtime;

  // Returned defects get first claim on capacity; repairs are never shortcut.
  const repairs = Math.min(state.knownDefects, available / assumptions.repairCost);
  const repairEffort = repairs * assumptions.repairCost;
  state.knownDefects -= repairs;
  state.repaired += repairs;
  available -= repairEffort;
  const shortcuts = clamp((pressure - 1) / 1.2, 0, 0.75) * (1 - policy.quality / 100);
  const effortPerPoint = 1 - 0.38 * shortcuts;
  const shipped = Math.min(openAtStart, available / effortPerPoint);
  const deliveryEffort = shipped * effortPerPoint;
  available -= deliveryEffort;
  let toShip = shipped;
  for (const promise of state.promises) {
    const completed = Math.min(promise.amount, toShip);
    promise.amount -= completed;
    toShip -= completed;
  }
  state.promises = state.promises.filter(p => p.amount > 1e-9);
  state.shipped += shipped;
  const defectRate = 0.01 + 0.38 * shortcuts + 0.09 * state.fatigue * (1 - 0.7 * policy.quality / 100);
  const defects = shipped * defectRate;
  state.defectsCreated += defects;
  state.hiddenDefects.push({ amount: defects, due: week + 2 });

  const outstanding = state.promises.reduce((sum, p) => sum + p.amount, 0);
  const overdue = state.promises.filter(p => p.due <= week).reduce((sum, p) => sum + p.amount, 0);
  const utilization = (reporting + repairEffort + deliveryEffort) / Math.max(1, capacity);
  const fatigueChange = 0.08 * Math.max(0, utilization - 0.85) + 0.035 * overtime + 0.018 * Math.min(2, overdue / BASE_CAPACITY) - 0.24 * (recovery + available) / BASE_CAPACITY;
  state.fatigue = clamp(state.fatigue + fatigueChange, 0, 1);
  const lateRatio = Math.min(1, overdue / Math.max(1, accepted));
  state.trust = clamp(state.trust + 0.028 * (1 - lateRatio) - 0.12 * lateRatio - 0.022 * returned, 0, 1);
  const hidden = state.hiddenDefects.reduce((sum, d) => sum + d.amount, 0);
  state.week = week;
  state.history.push({ week, policy, demand, accepted, declined: demand - accepted, cumulativeDeclined: state.declined, capacity, reporting, recovery, overtime, repairEffort, repairs, deliveryEffort, idle: Math.max(0, available), shipped, cumulativeShipped: state.shipped, usable: state.shipped - state.knownDefects - hidden, defects, hidden, known: state.knownDefects, repairWork: (state.knownDefects + hidden) * assumptions.repairCost, returned, outstanding, overdue, shortcuts, effortPerPoint, defectRate, fatigue: state.fatigue, trust: state.trust, cumulativeAccepted: state.accepted, pressure, openAtStart, lateAtStart, fatigueBefore: previous.fatigue });
  return state;
}

export function simulate(scenario, events = [], until = HORIZON, rawAssumptions = DEFAULT_ASSUMPTIONS) {
  let state = createState();
  const assumptions = normalizeAssumptions(rawAssumptions);
  const end = clamp(Math.trunc(until), 0, HORIZON);
  for (let week = 1; week <= end; week++) state = step(state, scenario, policyAt(scenario, events, week), assumptions);
  return state;
}

export function schedulePolicy(events, week, policy) {
  return [...events.filter(event => event.week !== week), { week, policy: normalizePolicy(policy) }].sort((a, b) => a.week - b.week);
}
