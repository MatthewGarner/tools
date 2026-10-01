import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_CAPACITY, DEFAULT_ASSUMPTIONS, HORIZON, REPAIR_COST, SCENARIOS, createState, demandForWeek, normalizeAssumptions, simulate, step } from './engine.js';

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);

test('accepted work, defects and weekly effort each balance across all policy extremes', () => {
  for (const scenario of Object.values(SCENARIOS)) {
    for (const commitment of [40, 100]) for (const quality of [0, 100]) for (const recovery of [0, 25]) {
      let state = createState();
      for (let week = 1; week <= HORIZON; week++) {
        state = step(state, scenario, { commitment, quality, recovery });
        const row = state.history.at(-1);
        close(state.accepted, state.shipped + row.outstanding, 'Accepted work is shipped or still promised');
        close(state.defectsCreated, state.repaired + row.known + row.hidden, 'Every defect is repaired, known or hidden');
        close(row.capacity + row.overtime, row.reporting + row.recovery + row.repairEffort + row.deliveryEffort + row.idle, 'Every effort point is allocated');
        close(row.usable, state.shipped - row.known - row.hidden, 'Usable output excludes outstanding defects');
        close(row.repairEffort, row.repairs * REPAIR_COST, 'Repairs have their stated cost');
        for (const key of ['fatigue', 'trust']) assert.ok(row[key] >= 0 && row[key] <= 1, `${key} is bounded`);
        for (const key of ['outstanding', 'repairWork', 'usable', 'capacity', 'idle']) assert.ok(row[key] >= -1e-7 && Number.isFinite(row[key]), `${key} is finite and nonnegative`);
        assert.ok(row.capacity >= BASE_CAPACITY * 0.55 && row.capacity <= BASE_CAPACITY);
        assert.ok(row.overtime >= 0 && row.overtime <= 3);
      }
    }
  }
});

test('a fork has identical demand and identical history before its intervention', () => {
  const event = { week: 12, policy: { commitment: 65, quality: 80, recovery: 20 } };
  const original = simulate(SCENARIOS.rush);
  const branch = simulate(SCENARIOS.rush, [event]);
  assert.deepEqual(branch.history.slice(0, 11), original.history.slice(0, 11));
  assert.deepEqual(branch.history.map(r => r.demand), original.history.map(r => r.demand));
  assert.notEqual(branch.history.at(-1).usable, original.history.at(-1).usable);
  assert.deepEqual(simulate(SCENARIOS.rush, [event]), branch, 'Same seed and policies reproduce the whole run');
});

test('hidden defects cannot consume repair capacity before their two-week return', () => {
  let state = createState();
  const policy = { commitment: 100, quality: 0, recovery: 0 };
  state = step(state, SCENARIOS.squeeze, policy);
  const firstDefects = state.history[0].defects;
  assert.ok(firstDefects > 0);
  assert.equal(state.history[0].repairEffort, 0);
  state = step(state, SCENARIOS.squeeze, policy);
  assert.equal(state.history[1].repairEffort, 0);
  state = step(state, SCENARIOS.squeeze, policy);
  close(state.history[2].returned, firstDefects, 'First defects return in week 3');
  close(state.history[2].repairEffort, firstDefects * REPAIR_COST, 'Returned work gets capacity');
});

test('the same intervention has a consequential early/late difference', () => {
  const policy = { commitment: 70, quality: 85, recovery: 15 };
  const early = simulate(SCENARIOS.rush, [{ week: 7, policy }]).history.at(-1);
  const late = simulate(SCENARIOS.rush, [{ week: 20, policy }]).history.at(-1);
  assert.ok(early.usable > late.usable + 30, 'Protected future capacity can outweigh early declined work');
  assert.ok(early.outstanding < late.outstanding - 30, 'Late intervention inherits commitments already made');
  assert.ok(early.cumulativeDeclined > late.cumulativeDeclined, 'Early intervention pays a visible opportunity cost');
});

test('lower commitments are not universally better: spare capacity can go unused', () => {
  const original = simulate(SCENARIOS.runway).history.at(-1);
  const cautious = simulate(SCENARIOS.runway, [{ week: 7, policy: { commitment: 60, quality: 75, recovery: 12 } }]).history.at(-1);
  assert.equal(original.outstanding, 0);
  assert.equal(cautious.outstanding, 0);
  assert.ok(original.usable > cautious.usable + 40);
  assert.ok(cautious.cumulativeDeclined > original.cumulativeDeclined + 40);
});

test('recovery at its maximum turns overtime off and helps a depleted team recover', () => {
  let state = createState();
  state.fatigue = 0.8;
  const next = step(state, SCENARIOS.runway, { commitment: 40, quality: 100, recovery: 25 });
  assert.equal(next.history.at(-1).overtime, 0);
  assert.ok(next.fatigue < state.fatigue);
  assert.deepEqual(state.history, [], 'Stepping must not mutate a fork source');
  assert.equal(state.fatigue, 0.8);
});

test('quality protection removes pressure shortcuts, without erasing ordinary defects', () => {
  const overloaded = simulate(SCENARIOS.squeeze, [], 6);
  const low = step(overloaded, SCENARIOS.squeeze, { commitment: 100, quality: 0, recovery: 4 }).history.at(-1);
  const high = step(overloaded, SCENARIOS.squeeze, { commitment: 100, quality: 100, recovery: 4 }).history.at(-1);
  assert.ok(low.shortcuts > 0);
  assert.equal(high.shortcuts, 0);
  assert.ok(high.defects < low.defects);
  assert.ok(high.defects > 0);
  assert.ok(high.shipped < low.shipped, 'Protecting quality has an immediate apparent throughput cost');
});

test('scenario demand is bounded and a one-off surge ends independently of policy', () => {
  const scenario = SCENARIOS.rush;
  assert.ok(demandForWeek(scenario, 9) > demandForWeek(scenario, 8));
  assert.ok(demandForWeek(scenario, 16) > demandForWeek(scenario, 17));
  assert.equal(simulate(scenario, [], 400).week, HORIZON);
  assert.equal(simulate(scenario, [], -4).week, 0);
});

test('optional assumptions preserve the original API and partial overrides keep other defaults', () => {
  assert.deepEqual(simulate(SCENARIOS.rush), simulate(SCENARIOS.rush, [], HORIZON, DEFAULT_ASSUMPTIONS));
  assert.deepEqual(normalizeAssumptions({ fatigueCapacityLoss: 0 }), { ...DEFAULT_ASSUMPTIONS, fatigueCapacityLoss: 0 });
  assert.deepEqual(normalizeAssumptions({ repairCost: NaN, lateReportingCost: Infinity }), DEFAULT_ASSUMPTIONS);
});

test('removing the fatigue-capacity and direct late-reporting feedback changes the outcome without removing other mechanisms', () => {
  const noFeedback = { fatigueCapacityLoss: 0, lateReportingCost: 0 };
  const state = simulate(SCENARIOS.rush, [], HORIZON, noFeedback);
  const normal = simulate(SCENARIOS.rush).history.at(-1);
  let previousTrust = createState().trust;
  for (const row of state.history) {
    assert.equal(row.capacity, BASE_CAPACITY, 'Even maximum fatigue no longer reduces capacity');
    close(row.reporting, Math.min(BASE_CAPACITY * 0.4, 0.4 + 1.4 * (1 - previousTrust)), 'Ordinary and trust-related reporting remain');
    previousTrust = row.trust;
  }
  assert.ok(state.fatigue > 0, 'This removes the capacity effect, not fatigue itself');
  assert.ok(state.defectsCreated > 0, 'Quality and repair mechanisms remain active');
  assert.ok(state.history.at(-1).usable > normal.usable + 50, 'The disputed feedbacks have a substantial outcome consequence');
});

test('weaker feedbacks produce an intermediate outcome in the launch scenario', () => {
  const original = simulate(SCENARIOS.rush).history.at(-1);
  const weaker = simulate(SCENARIOS.rush, [], HORIZON, { fatigueCapacityLoss: 0.15, lateReportingCost: 0.025 }).history.at(-1);
  const removed = simulate(SCENARIOS.rush, [], HORIZON, { fatigueCapacityLoss: 0, lateReportingCost: 0 }).history.at(-1);
  assert.ok(weaker.capacity > original.capacity && weaker.capacity < removed.capacity);
  assert.ok(weaker.usable > original.usable && weaker.usable < removed.usable);
  assert.ok(weaker.outstanding < original.outstanding && weaker.outstanding > removed.outstanding);
});

test('costlier repairs preserve accounting while using capacity that could have delivered new work', () => {
  const assumptions = { ...DEFAULT_ASSUMPTIONS, repairCost: 3.5 };
  let state = createState();
  for (let week = 1; week <= HORIZON; week++) {
    state = step(state, SCENARIOS.rush, SCENARIOS.rush.policy, assumptions);
    const row = state.history.at(-1);
    close(row.repairEffort, row.repairs * assumptions.repairCost, 'Paid repair cost');
    close(row.repairWork, (row.known + row.hidden) * assumptions.repairCost, 'Outstanding repair cost');
    close(row.capacity + row.overtime, row.reporting + row.recovery + row.repairEffort + row.deliveryEffort + row.idle, 'Effort remains conserved');
    close(state.accepted, state.shipped + row.outstanding, 'Promises remain conserved');
    close(state.defectsCreated, state.repaired + row.known + row.hidden, 'Defects remain conserved');
  }
  const original = simulate(SCENARIOS.rush).history.at(-1);
  assert.ok(state.history.at(-1).usable < original.usable - 20);
  assert.ok(state.history.at(-1).outstanding > original.outstanding + 20);
});

test('replaying both courses with changed assumptions preserves shared history and demand', () => {
  const events = [{ week: 12, policy: { commitment: 65, quality: 90, recovery: 20 } }];
  const before = structuredClone(events);
  const assumptions = { repairCost: 2.8, fatigueCapacityLoss: 0.2, lateReportingCost: 0.015 };
  const baseline = simulate(SCENARIOS.rush, [], HORIZON, assumptions);
  const branch = simulate(SCENARIOS.rush, events, HORIZON, assumptions);
  const current = simulate(SCENARIOS.rush, events, 18, assumptions);
  assert.deepEqual(current.history, branch.history.slice(0, 18), 'Current state is the same replay stopped at the selected week');
  assert.deepEqual(baseline.history.slice(0, 11), branch.history.slice(0, 11), 'Courses remain identical before their policy difference');
  assert.deepEqual(branch.history.map(row => row.demand), simulate(SCENARIOS.rush).history.map(row => row.demand), 'The demand tape is unchanged');
  assert.deepEqual(events, before, 'Replaying never edits policy history');
  assert.notEqual(baseline.history.at(-1).usable, simulate(SCENARIOS.rush).history.at(-1).usable, 'The baseline is replayed too');
});
