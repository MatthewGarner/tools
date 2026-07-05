import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, wipSweep, kneeWip, WEEK} from '../engine.js';

const healthy = {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
const overloaded = {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};

test('deterministic for a fixed seed', () => {
  assert.deepEqual(simulate(healthy), simulate(healthy));
});

test("Little's Law holds on a stable system (L ≈ λW within 15%)", () => {
  const r = simulate(healthy);
  const lambdaPerDay = r.throughputPerWeek / WEEK;
  const L = lambdaPerDay * r.cycle.mean;            // avg items in progress implied
  assert.ok(L > 0 && Math.abs(L - r.impliedWip) / L < 0.15,
    `L=${L.toFixed(2)} impliedWip=${r.impliedWip.toFixed(2)}`);
});

test('overload: backlog grows, lead time >> cycle time', () => {
  const r = simulate(overloaded);
  assert.ok(r.backlogSlopePerWeek > 0.5, 'slope ' + r.backlogSlopePerWeek);
  assert.ok(r.lead.p50 > r.cycle.p50 * 1.5);
});

test('healthy system: backlog stable', () => {
  assert.ok(Math.abs(simulate(healthy).backlogSlopePerWeek) < 0.5);
});

test('capacity sharing: raising WIP does not raise throughput but raises cycle time', () => {
  const lo = simulate(healthy), hi = simulate({...healthy, wipLimit: 20});
  assert.ok(hi.throughputPerWeek < lo.throughputPerWeek * 1.1);
  assert.ok(hi.cycle.p50 >= lo.cycle.p50);
});

test('an item is never worked faster than one person-day per day', () => {
  const r = simulate({demandPerWeek: 0.5, itemDays: 5, team: 8, wipLimit: 8, cov: 0.25});
  assert.ok(r.cycle.p50 >= 4, 'p50 ' + r.cycle.p50);
});

test('waitShare + work/wait days decompose the lead mean', () => {
  const r = simulate(overloaded);
  assert.ok(Math.abs(r.workDays + r.waitDays - r.lead.mean) < 0.5);
  assert.ok(r.waitShare > 0 && r.waitShare < 1);
});

test('trace events are ordered and balanced', () => {
  const {events, completed} = simulate(healthy, {trace: true});
  assert.ok(events.length > 0);
  for(let i = 1; i < events.length; i++) assert.ok(events[i].t >= events[i - 1].t);
  assert.ok(events.filter(e => e.kind === 'done').length >= completed);
});

test('no trace key unless asked', () => {
  assert.ok(!('events' in simulate(healthy)));
});

test('sweep: 20 entries; knee ≤ team+1 on a healthy system', () => {
  const sweep = wipSweep(healthy);
  assert.equal(sweep.length, 20);
  const knee = kneeWip(sweep);
  assert.ok(knee >= 1 && knee <= healthy.team + 1, 'knee ' + knee);
});

test('cov accepts named levels', () => {
  const r = simulate({...healthy, cov: 'high'});
  assert.ok(r.cycle.p95 > r.cycle.p50);
});

test('leadSamples are sorted post-warm lead times matching completed', () => {
  const r = simulate(healthy);
  assert.equal(r.leadSamples.length, r.completed);
  for(let i = 1; i < r.leadSamples.length; i++) assert.ok(r.leadSamples[i] >= r.leadSamples[i - 1]);
});
