/* Matt: "WIP can still be calculated based on how many items are active in a
   month", and any column over the limit warns — a planned crunch in March is a
   real plan smell, and only spans make it visible (today an item sits in exactly
   one column, so a future pile-up cannot be seen at all).
   Warnings STATE THE FACT. No editorial: the tool reports what is true and leaves
   the judgement to the author (same rule as the deck headline). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, activeCount, wipBreaches} from '../parse.js';

const Q = 'horizons: quarterly from Q3 2026 x4\nwip: 2\n';

test('activeCount counts items whose span COVERS the column, not just those written in it', () => {
  const m = parse(Q + 'Q3 2026\nCore: A x3\nQ4 2026\nCore: B');
  assert.equal(activeCount(m, 0), 1);
  assert.equal(activeCount(m, 1), 2, 'A is still running in Q4, and B starts there');
  assert.equal(activeCount(m, 2), 1, 'A alone');
  assert.equal(activeCount(m, 3), 0);
});

test('a breach names the column and states the fact — no editorial', () => {
  const m = parse(Q + 'Q3 2026\nCore: A x3\nCore: B x3\nCore: C x3');
  assert.deepEqual(wipBreaches(m), [
    'Q3 2026 has 3 items in flight (wip: 2).',
    'Q4 2026 has 3 items in flight (wip: 2).',
    'Q1 2027 has 3 items in flight (wip: 2).',
  ]);
});

test('the old editorial copy is GONE', () => {
  const m = parse('wip: 2\nNOW\nCore: A\nCore: B\nCore: C');
  assert.deepEqual(wipBreaches(m), ['Now has 3 items in flight (wip: 2).']);
  assert.doesNotMatch(wipBreaches(m).join(' '), /list, not a strategy/);
});

test('a span-free doc still only ever breaches on the first column it overloads', () => {
  const m = parse('wip: 2\nNOW\nCore: A\nCore: B\nCore: C\n\nNEXT\nCore: D');
  assert.deepEqual(wipBreaches(m), ['Now has 3 items in flight (wip: 2).']);
});

test('wip: off silences every column', () => {
  const m = parse('wip: off\nhorizons: quarterly from Q3 2026 x4\nQ3 2026\n' +
    Array.from({length: 9}, (_, i) => 'Core: I' + i + ' x2').join('\n'));
  assert.deepEqual(wipBreaches(m), []);
});

test('at the limit is not over it', () => {
  const m = parse(Q + 'Q3 2026\nCore: A x2\nCore: B x2');
  assert.deepEqual(wipBreaches(m), []);
});
