/* Browser interaction budgets measure a real user action through to observable
 * app state. Median catches broad regressions; p95 is deliberately the worst
 * observed sample for our small fixed sample, so a single slow interaction is
 * visible rather than averaged away. */

export async function sampleInteraction(count, run){
  const values = [];
  for(let index = 0; index < count; index++) values.push(await run(index));
  const ordered = [...values].sort((a, b) => a - b);
  return {
    values,
    median:ordered[Math.floor(ordered.length / 2)],
    p95:ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * .95) - 1)],
    worst:ordered.at(-1),
  };
}

export function withinBudget(sample, {median, p95}){
  return sample.median <= median && sample.p95 <= p95;
}

export const describeBudget = sample =>
  `median ${Math.round(sample.median)}ms · p95/worst ${Math.round(sample.p95)}ms`;
