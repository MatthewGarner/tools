import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderDiff, orderDiffCopy} from '../engine.js';

const A = ['Onboarding revamp', 'Enterprise SSO', 'Mobile parity', 'Billing self-serve', 'Analytics'];

test('identical orders: full agreement', () => {
  const d = orderDiff(A, [...A]);
  assert.equal(d.tau, 1);
  assert.equal(d.agreementPct, 100);
  assert.equal(d.movers.length, 0);
  assert.match(orderDiffCopy(d), /agree on 100%/);
});

test('reversed order: full disagreement', () => {
  const d = orderDiff(A, [...A].reverse());
  assert.equal(d.tau, -1);
  assert.equal(d.agreementPct, 0);
});

test('one swap: tau and the movers name the culprits', () => {
  const B = ['Enterprise SSO', 'Onboarding revamp', 'Mobile parity', 'Billing self-serve', 'Analytics'];
  const d = orderDiff(A, B);
  assert.equal(d.common.length, 5);
  assert.ok(d.tau > 0.7 && d.tau < 1);
  const names = d.movers.map(m => m.title);
  assert.ok(names.includes('Onboarding revamp') && names.includes('Enterprise SSO'));
});

test('items only in one list are reported, ranks re-based on the shared set', () => {
  const B = ['Mobile parity', 'New idea', 'Onboarding revamp'];
  const d = orderDiff(A, B);
  assert.deepEqual(d.onlyA.length, 3);
  assert.deepEqual(d.onlyB, ['New idea']);
  assert.equal(d.common.length, 2);
  const mob = d.common.find(c => c.title === 'Mobile parity');
  assert.equal(mob.a, 2);        // 2nd of the shared items in A (after Onboarding)
  assert.equal(mob.b, 1);        // 1st in B
});

test('normalisation: case, whitespace, duplicates (first occurrence wins)', () => {
  const d = orderDiff(['  Mobile   Parity ', 'mobile parity', 'SSO'], ['MOBILE PARITY', 'sso']);
  assert.equal(d.common.length, 2);
  assert.equal(d.onlyA.length, 0);
});

test('fewer than two shared items → honest copy', () => {
  const d = orderDiff(['A', 'B'], ['C', 'D']);
  assert.match(orderDiffCopy(d), /No shared items|share fewer than two/i);
});

test('movers sorted by displacement, capped copy names the biggest', () => {
  const B = ['Analytics', 'Onboarding revamp', 'Enterprise SSO', 'Mobile parity', 'Billing self-serve'];
  const d = orderDiff(A, B);
  assert.equal(d.movers[0].title, 'Analytics');   // #5 → #1
  assert.equal(Math.abs(d.movers[0].delta), 4);
  assert.match(orderDiffCopy(d), /Analytics \(#5 → #1\)/);
});
