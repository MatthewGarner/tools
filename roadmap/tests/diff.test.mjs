import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {roadmapDiff} from '../diff.js';

test('Roadmap comparison keeps new, moved, and dropped work explicit', () => {
  const oldModel = parse(`horizons: Now, Next, Later
Now
Core: Foundation
Core: Retired path
Next
Core: Migration`);
  const model = parse(`horizons: Now, Next, Later
Now
Core: Foundation
Next
Core: Launch
Later
Core: Migration`);
  const diff = roadmapDiff(oldModel, model, 'July review');

  assert.deepEqual(diff.badge(model.items.find(item => item.title === 'Launch')), {kind:'new', label:'New'});
  assert.deepEqual(diff.badge(model.items.find(item => item.title === 'Migration')), {kind:'moved', label:'was Next'});
  assert.deepEqual(diff.dropped, ['Retired path']);
  assert.deepEqual(diff.added, ['Launch']);
  assert.equal(diff.since, 'July review');
  assert.equal(diff.any, true);
});

test('Roadmap comparison refuses invented identity for duplicate titles', () => {
  const oldModel = parse(`horizons: Now, Next
Now
Core: Repeat
Next
Growth: Repeat`);
  const model = parse(`horizons: Now, Next
Now
Growth: Repeat
Next
Core: Repeat`);
  const diff = roadmapDiff(oldModel, model, 'Baseline');

  assert.deepEqual(diff.ambiguous, ['repeat']);
  assert.ok(model.items.every(item => diff.badge(item) === null));
});
