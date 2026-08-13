import assert from 'node:assert/strict';

/* Test-only interaction budgets. These measure already-loaded application work,
 * so one warm-up removes module/JIT startup while a median filters scheduler
 * noise. Run the owning tests serially, as with dev/perf.test.mjs. PERF_SCALE is
 * the existing slower-runner allowance used by CI. */
const PERF_SCALE = Number(process.env.PERF_SCALE) || 1;

export async function assertInteractionBudget({
  name,
  budgetMs,
  run,
  warmups = 1,
  samples = 5,
  scale = PERF_SCALE,
}){
  assert.ok(name, 'an interaction budget needs a name');
  assert.ok(Number.isFinite(budgetMs) && budgetMs > 0, `${name}: budget must be positive`);
  assert.equal(typeof run, 'function', `${name}: run must be a function`);
  assert.ok(Number.isInteger(warmups) && warmups >= 0, `${name}: warmups must be a non-negative integer`);
  assert.ok(Number.isInteger(samples) && samples >= 3 && samples % 2 === 1,
    `${name}: samples must be an odd integer of at least three`);

  let value;
  for(let i = 0; i < warmups; i++) value = await run();
  const timings = [];
  for(let i = 0; i < samples; i++){
    const started = performance.now();
    value = await run();
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  const medianMs = timings[Math.floor(timings.length / 2)];
  const allowedMs = budgetMs * scale;
  assert.ok(medianMs < allowedMs,
    `${name}: ${medianMs.toFixed(1)}ms median > ${allowedMs}ms budget` +
    (scale !== 1 ? ` (${budgetMs}ms × ${scale})` : ''));
  return {value, medianMs, allowedMs};
}

export async function assertInteractionCases({name, budgetMs, cases, run, ...options}){
  assert.ok(Array.isArray(cases) && cases.length, `${name}: cases are required`);
  const results = [];
  for(const entry of cases){
    assert.ok(entry?.id, `${name}: every case needs an id`);
    results.push(await assertInteractionBudget({
      name:`${name} [${entry.id}]`, budgetMs, run:() => run(entry), ...options,
    }));
  }
  return results;
}
