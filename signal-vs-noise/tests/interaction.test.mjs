import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transitionCue} from '../interaction.js';

test('each signal phase names one visible focus target and one concise announcement', () => {
  assert.deepEqual(transitionCue('play', 2, 8, 3), {
    target: 'stage',
    announcement: 'Quarter 3 ready. Choose who needs a conversation.',
  });
  assert.deepEqual(transitionCue('reveal', 2, 8, 3), {
    target: 'reveal',
    announcement: 'Quarter 4 results are ready. Review how your conversations landed.',
  });
  assert.deepEqual(transitionCue('done', 7, 8, 3), {
    target: 'again',
    announcement: 'Run complete. 3 conversations opened. Your verdict is ready.',
  });
});

test('done announcement has correct singular and zero grammar', () => {
  assert.match(transitionCue('done', 7, 8, 0).announcement, /0 conversations opened/);
  assert.match(transitionCue('done', 7, 8, 1).announcement, /1 conversation opened/);
});

test('invalid phases do not invent a focus destination', () => {
  assert.equal(transitionCue('loading', 0, 8, 0), null);
});
