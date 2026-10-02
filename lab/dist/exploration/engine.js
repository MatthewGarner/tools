export const WEEKS = 20;
export const EFFORT = 10;
export const SCENARIOS = {
  product: { name: 'An unfamiliar product', seed: 41, need: 0.8, technical: 0.25, turn: false, usefulness: 0.85, delay: 2 },
  battery: { name: 'A battery retrofit', seed: 73, need: 0.6, technical: 0.88, turn: false, usefulness: 0.45, delay: 3 },
  change: { name: 'The market changes', seed: 19, need: 0.82, technical: 0.3, turn: true, usefulness: 0.8, delay: 3 },
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const defaultPlan = () => Array(WEEKS).fill(2);
export function normalizePlan(plan) { return Array.from({ length: WEEKS }, (_, i) => clamp(Number.isFinite(plan?.[i]) ? Math.round(plan[i]) : 2, 0, EFFORT)); }
export function normalizeAssumptions(raw = {}, scenario = SCENARIOS.product) { return { usefulness: clamp(Number.isFinite(raw.usefulness) ? raw.usefulness : scenario.usefulness, 0, 1), delay: clamp(Number.isFinite(raw.delay) ? Math.round(raw.delay) : scenario.delay, 1, 5) }; }
function noise(seed, week, channel) { let x = Math.imul(seed + week * 997 + channel * 6151, 374761393); x = Math.imul(x ^ x >>> 13, 1274126177); return (((x ^ x >>> 16) >>> 0) / 4294967296) * 2 - 1; }
export function worldFor(scenarioId, week) {
  const scenario = SCENARIOS[scenarioId] || SCENARIOS.product;
  return { need: clamp((scenario.turn && week >= 11 ? 0.25 : scenario.need) + noise(scenario.seed, week, 1) * 0.025, 0, 1), technical: clamp((scenario.turn && week >= 11 ? 0.62 : scenario.technical) + noise(scenario.seed, week, 2) * 0.02, 0, 1) };
}
export function simulate({ plan = defaultPlan(), scenario = 'product', assumptions } = {}) {
  const context = SCENARIOS[scenario] || SCENARIOS.product;
  const allocation = normalizePlan(plan);
  const model = normalizeAssumptions(assumptions, context);
  let belief = { need: 0.5, technical: 0.5 };
  let value = 0, shipped = 0;
  const pending = [], history = [];
  for (let week = 1; week <= WEEKS; week++) {
    const evidence = [];
    for (const observation of pending.filter(item => item.due === week)) {
      belief.need += observation.needWeight * (observation.need - belief.need);
      belief.technical += observation.technicalWeight * (observation.technical - belief.technical);
      evidence.push({ source: 'delivery', from: observation.from, need: observation.need, technical: observation.technical, needWeight: observation.needWeight, technicalWeight: observation.technicalWeight });
    }
    const world = worldFor(scenario, week);
    const research = allocation[week - 1], build = EFFORT - research;
    if (research > 0 && model.usefulness > 0) {
      const signal = clamp(world.need + noise(context.seed, week, 3) * 0.55 * (1.1 - model.usefulness) / Math.sqrt(research), 0, 1);
      const weight = research * model.usefulness / (research * model.usefulness + 4);
      belief.need += weight * (signal - belief.need);
      evidence.push({ source: 'research', from: week, need: signal, needWeight: weight });
    }
    // Output is evaluated against the hidden world, but actions only update from
    // the noisy research signal or observations whose delivery delay has elapsed.
    const needError = Math.abs(belief.need - world.need);
    const technicalError = Math.abs(belief.technical - world.technical);
    const fit = Math.exp(-2.8 * needError - 2.4 * technicalError);
    const useful = build * fit;
    value += useful; shipped += build;
    if (build > 0) pending.push({ from: week, due: week + model.delay, need: clamp(world.need + noise(context.seed, week, 4) * 0.24 / Math.sqrt(build), 0, 1), technical: clamp(world.technical + noise(context.seed, week, 5) * 0.14 / Math.sqrt(build), 0, 1), needWeight: Math.min(0.3, build / 35), technicalWeight: Math.min(0.65, build / 16) });
    history.push({ week, research, build, belief: { ...belief }, world, needError, technicalError, fit, useful, value, shipped, evidence, pending: pending.filter(item => item.due > week).length });
  }
  return { scenario, plan: allocation, assumptions: model, history, final: history.at(-1) };
}
