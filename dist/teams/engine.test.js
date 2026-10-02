import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, DEFAULT_ASSUMPTIONS, DEFAULT_LAYOUT, HORIZON, SCENARIOS, capacityFor, createWorkload, routeFor, simulate } from './engine.js';

const oneTeam = Object.fromEntries(CAPABILITIES.map(cap => [cap.id, 'a']));
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);

test('workload is seeded and identical across arrangements and assumption changes', () => {
  const first = simulate();
  const changed = simulate({ layout: oneTeam, assumptions: { coordination: 0.1, handoffDelay: 2 } });
  assert.deepEqual(first.workload, changed.workload);
  assert.deepEqual(first, simulate(), 'Replay is fully deterministic');
  assert.deepEqual(createWorkload('battery'), createWorkload('battery'));
});

test('every arrived job is accounted for, and each elapsed quarter-day has a state', () => {
  for (const scenario of Object.keys(SCENARIOS)) {
    const result = simulate({ scenario });
    for (const frame of result.history) {
      assert.equal(frame.arrived, frame.completed + frame.unfinished);
      assert.equal(frame.jobs.length, result.workload.length);
      for (const job of frame.jobs) {
        const elapsed = Math.max(0, (job.completedAt ?? frame.day) - job.arrival);
        close(job.processingTime + job.queueTime + job.transferTime, elapsed, 'Processing, queueing and transfers partition elapsed time');
      }
    }
  }
});

test('specialist capacity and both original and receiving effort are conserved', () => {
  for (const [layout, assumptions] of [[DEFAULT_LAYOUT, DEFAULT_ASSUMPTIONS], [oneTeam, { coordination: 0.12, handoffDelay: 2, handoffEffort: 0.5 }], [DEFAULT_LAYOUT, { coordination: 0, handoffDelay: 0, handoffEffort: 0.5 }]]) {
    const result = simulate({ layout, assumptions });
    for (const frame of result.history) {
      assert.ok(frame.effortUsed <= frame.capacityAvailable + 1e-7);
      close(frame.baseEffortUsed + frame.handoffEffortUsed, frame.effortUsed, 'Original and receiving effort exhaust actual effort');
      for (const cap of CAPABILITIES) assert.ok(frame.used[cap.id] <= result.capacities[cap.id] * frame.day + 1e-7, `${cap.name} cannot borrow capacity`);
      for (const job of frame.jobs) {
        const source = result.workload.find(work => work.id === job.id);
        const originalEffort = source.stages.reduce((total, stage) => total + stage.effort, 0);
        const futureEffort = source.stages.slice(job.stageIndex + 1).reduce((total, stage) => total + stage.effort, 0);
        close(job.baseEffortUsed + (job.completedAt !== null ? 0 : job.remaining - job.handoffRemaining + futureEffort), originalEffort, 'Original work is performed or remains');
        close(job.handoffEffortUsed + job.handoffRemaining, job.transfers.length * result.assumptions.handoffEffort, 'Every incurred handoff is paid or pending');
      }
    }
  }
});

test('boundary transfers follow the route and cannot release work before their delay', () => {
  const result = simulate();
  for (const job of result.final.jobs) {
    const source = result.workload.find(work => work.id === job.id);
    if (job.completedAt !== null) {
      assert.equal(job.transfers.length, routeFor(source.stages, result.layout).filter(stage => stage.crossing).length);
      close(job.handoffEffortUsed, job.transfers.length * result.assumptions.handoffEffort, 'Finished jobs paid every receiving cost');
    }
    for (const transfer of job.transfers) {
      close(transfer.end - transfer.start, result.assumptions.handoffDelay, 'Transfer duration');
      const nextCompletion = job.completions.find(stage => stage.capability === transfer.to);
      if (nextCompletion) assert.ok(nextCompletion.start >= transfer.end, 'Destination cannot start during transfer');
    }
  }
});

test('co-location can help light flow and hurt busy flow with the same capacity mechanism', () => {
  const quietPairs = simulate({ scenario: 'quiet' }).final;
  const quietOne = simulate({ scenario: 'quiet', layout: oneTeam }).final;
  assert.equal(quietPairs.completed, quietOne.completed);
  assert.ok(quietOne.medianLeadTime < quietPairs.medianLeadTime, 'Saving transfers shortens lead time when capacity is available');
  const busyPairs = simulate({ scenario: 'rush' }).final;
  const busyOne = simulate({ scenario: 'rush', layout: oneTeam }).final;
  assert.ok(busyOne.completed < busyPairs.completed, 'Internal coordination slows the busy specialist');
  assert.ok(busyOne.queueTime > busyPairs.queueTime);
  assert.equal(busyOne.handoffs, 0);
});

test('moving Test into Build removes a transfer and changes that team’s capacity', () => {
  const changed = { ...DEFAULT_LAYOUT, test: 'b' };
  assert.equal(routeFor('feature', DEFAULT_LAYOUT).filter(stage => stage.crossing).length, 2);
  assert.equal(routeFor('feature', changed).filter(stage => stage.crossing).length, 1);
  assert.ok(capacityFor(changed).software < capacityFor(DEFAULT_LAYOUT).software);
  const before = simulate();
  const after = simulate({ layout: changed });
  assert.notEqual(after.final.queueTime, before.final.queueTime);
  assert.deepEqual(after.workload, before.workload);
});

test('removing one local boundary can introduce another elsewhere in the work route', () => {
  // Design→Software becomes internal, but Product→Design becomes a crossing.
  // Count the entire route before claiming a move saves a handoff.
  const changed = { ...DEFAULT_LAYOUT, design: 'b' };
  const before = routeFor('feature', DEFAULT_LAYOUT);
  const after = routeFor('feature', changed);
  assert.equal(before.filter(stage => stage.crossing).length, 2);
  assert.equal(after.filter(stage => stage.crossing).length, 2);
  assert.equal(before[1].crossing, false);
  assert.equal(after[1].crossing, true);
  assert.equal(before[2].crossing, true);
  assert.equal(after[2].crossing, false);
});

test('when both coordination and boundary costs are removed, grouping cannot change delivery', () => {
  const assumptions = { coordination: 0, handoffDelay: 0, handoffEffort: 0 };
  const pairs = simulate({ assumptions });
  const combined = simulate({ layout: oneTeam, assumptions });
  assert.deepEqual(pairs.history.map(frame => frame.completed), combined.history.map(frame => frame.completed));
  assert.deepEqual(pairs.final.jobs.map(job => job.completedAt), combined.final.jobs.map(job => job.completedAt));
  close(pairs.final.effortUsed, combined.final.effortUsed, 'No concealed team-size penalty remains');
});

test('team labels do not change causality; equal group membership has equal outcomes', () => {
  const renamed = Object.fromEntries(Object.entries(DEFAULT_LAYOUT).map(([cap, team]) => [cap, { a: 'c', b: 'a', c: 'b' }[team]]));
  const original = simulate();
  const permuted = simulate({ layout: renamed });
  assert.deepEqual(permuted.final, original.final);
});

test('stronger boundary delay changes waiting, without inventing work or changing arrivals', () => {
  const shorter = simulate({ scenario: 'quiet', assumptions: { handoffDelay: 0 } });
  const longer = simulate({ scenario: 'quiet', assumptions: { handoffDelay: 2 } });
  assert.deepEqual(shorter.workload, longer.workload);
  assert.ok(longer.final.transferTime > shorter.final.transferTime);
  assert.ok(longer.final.medianLeadTime > shorter.final.medianLeadTime);
  assert.equal(shorter.final.transferTime, 0);
});

test('simulation is bounded and never mutates a pinned arrangement', () => {
  const layout = { ...DEFAULT_LAYOUT };
  const assumptions = { ...DEFAULT_ASSUMPTIONS };
  const result = simulate({ layout, assumptions, horizon: 300 });
  assert.equal(result.final.day, HORIZON);
  assert.deepEqual(layout, DEFAULT_LAYOUT);
  assert.deepEqual(assumptions, DEFAULT_ASSUMPTIONS);
  assert.equal(simulate({ horizon: -2 }).final.day, 0);
});
