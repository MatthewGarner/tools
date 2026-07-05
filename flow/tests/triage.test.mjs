import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, wipSweep, kneeWip, leverTriage} from '../engine.js';

const healthy = {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
const overloaded = {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};

test('initialBacklog: 0 is byte-identical to the option being absent', () => {
  assert.deepEqual(simulate(healthy, {initialBacklog: 0}), simulate(healthy));
});

test('a healthy team drains an initial pile; drainDays reported', () => {
  const r = simulate(healthy, {initialBacklog: 20});
  assert.ok(r.drainDays !== null && r.drainDays > 0, 'drainDays ' + r.drainDays);
  assert.ok(r.drainDays < 2000);
});

test('an overloaded team never drains the pile', () => {
  const r = simulate(overloaded, {initialBacklog: 20});
  assert.equal(r.drainDays, null);
});

test('no initial pile → drainDays 0', () => {
  assert.equal(simulate(healthy).drainDays, 0);
});

test('a bigger pile takes longer to drain', () => {
  const small = simulate(healthy, {initialBacklog: 5});
  const big = simulate(healthy, {initialBacklog: 40});
  assert.ok(big.drainDays > small.drainDays, `${big.drainDays} vs ${small.drainDays}`);
});

test('leverTriage returns base + four levers with the recommended one first', () => {
  const t = leverTriage(healthy, {initialBacklog: 20});
  assert.equal(t.levers.length, 4);
  assert.ok(['person', 'demand', 'size', 'wip'].includes(t.recommended));
  assert.equal(t.levers[0].id, t.recommended);
  for(const l of t.levers) assert.ok(l.label && isFinite(l.leadP85));
});

test('adding a person never makes lead time materially worse', () => {
  const t = leverTriage(overloaded, {initialBacklog: 10});
  const person = t.levers.find(l => l.id === 'person');
  assert.ok(person.leadP85 <= t.base.leadP85 * 1.05);
});

test('the WIP lever lands on the knee', () => {
  const t = leverTriage(healthy, {initialBacklog: 0});
  const knee = kneeWip(wipSweep(healthy));
  const wip = t.levers.find(l => l.id === 'wip');
  assert.equal(wip.appliedWip, knee);
});

test('unstable base ranks by drain; stable base ranks by lead P85', () => {
  const drained = leverTriage(overloaded, {initialBacklog: 20});
  assert.equal(drained.mode, 'drain');
  const led = leverTriage(healthy, {initialBacklog: 0});
  assert.equal(led.mode, 'lead');
  const vals = led.levers.map(l => l.leadP85);
  assert.deepEqual(vals, [...vals].sort((a, b) => a - b));
});

test('triage is deterministic', () => {
  assert.deepEqual(leverTriage(healthy, {initialBacklog: 12}), leverTriage(healthy, {initialBacklog: 12}));
});

test('a precomputed knee is honoured and matches the self-computed result', () => {
  const knee = kneeWip(wipSweep(healthy));
  assert.deepEqual(leverTriage(healthy, {initialBacklog: 12, knee}), leverTriage(healthy, {initialBacklog: 12}));
});
