import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, applyWorld} from '../parse.js';
import {inspectionFacts, inspectionIdentity, inspectedItem} from '../inspect-item.js';

test('inspection resolves by the existing source-line identity, not a duplicated title', () => {
  const model = parse('NOW\nCore: Same title [doing]\nGrowth: Same title -- distinct note');
  const target = model.items[1];
  assert.equal(inspectedItem(model, inspectionIdentity(target)), target);
  const facts = inspectionFacts(model, inspectionIdentity(target));
  assert.equal(facts.title, 'Same title');
  assert.ok(facts.facts.some(([label, value]) => label === 'Lane' && value === 'Growth'));
  assert.ok(facts.facts.some(([label, value]) => label === 'Source' && value === 'Line ' + target.srcLine));
  assert.equal(facts.note, 'distinct note');
});

test('inspection reports the current projected condition state without mutating source identity', () => {
  const model = parse('NOW\nCore: Bet [bet: launch]\nNEXT\nGrowth: Rider [if launch]');
  const rider = model.items.find(item => item.title === 'Rider');
  const facts = inspectionFacts(applyWorld(model, {launch:'lost'}), inspectionIdentity(rider));
  assert.equal(facts.facts.find(([label]) => label === 'Plan state')[1], 'Not needed in this world');
  assert.equal(facts.facts.find(([label]) => label === 'Condition')[1], 'if launch');
});
