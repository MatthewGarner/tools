import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {EXAMPLES, INVITATION_HUNT, MONITOR_HUNT, TRADE_OFF_HUNT} from '../example.js';

test('every shell example parses into a renderable hunt', () => {
  assert.equal(EXAMPLES.length, 3);
  for(const example of EXAMPLES){
    const model = parse(example.src);
    const hunt = project(model);
    assert.ok(hunt.target.outcome, example.name);
    assert.ok(hunt.measurement.proxy, example.name);
    assert.ok(hunt.target.action, example.name);
    assert.ok(hunt.intendedRoute.mechanism, example.name);
    assert.ok(hunt.failureTheories.length, example.name);
    assert.match(hunt.verdict.limit, /authored hypothesis, not proof/i);
  }
});

test('default example exercises selection, pattern and speculative states', () => {
  const hunt = project(parse(INVITATION_HUNT), 'support-load');
  assert.equal(hunt.failureTheories.length, 2);
  assert.equal(hunt.reportedPattern.complete, true);
  assert.equal(hunt.selectedReceipt.id, 'support-load');
  assert.equal(hunt.selectedReceipt.basis, 'speculative-concern');
  assert.equal(hunt.verdict.authoritative, false);
});

test('monitor and pending trade-off examples exercise non-approval gates', () => {
  const monitor = project(parse(MONITOR_HUNT));
  assert.equal(monitor.target.mode, 'monitor');
  assert.equal(monitor.verdict.authoritative, true);
  const pending = project(parse(TRADE_OFF_HUNT));
  assert.equal(pending.status, 'trade-off not yet decided');
  assert.equal(pending.verdict.authoritative, false);
});
