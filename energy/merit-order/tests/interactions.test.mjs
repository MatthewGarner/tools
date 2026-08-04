import test from 'node:test';
import assert from 'node:assert/strict';
import {createPointerDrag, calloutPosition} from '../interactions.js';

test('drag owns one pointer and releases it on up, cancel, and lost capture', () => {
  const captured = [], released = [], moves = [], settles = [];
  const drag = createPointerDrag({
    capture: id => captured.push(id), release: id => released.push(id),
    onMove: x => moves.push(x), onSettle: () => settles.push('settled'),
  });

  assert.equal(drag.start(11), true);
  assert.equal(drag.start(12), false, 'second pointer cannot steal active drag');
  drag.move(12, 20);
  drag.move(11, 30);
  assert.deepEqual(moves, [30]);
  assert.equal(drag.finish(12), false);
  assert.equal(drag.finish(11), true);
  assert.deepEqual(captured, [11]);
  assert.deepEqual(released, [11]);
  assert.deepEqual(settles, ['settled']);

  drag.start(21);
  assert.equal(drag.cancel(21), true);
  drag.start(31);
  assert.equal(drag.lost(31), true);
  assert.equal(drag.activePointerId, null);
  assert.deepEqual(released, [11, 21], 'lost capture must not try to release again');
  assert.deepEqual(settles, ['settled', 'settled', 'settled']);
});

test('callout position clamps horizontally and flips above a bottom-edge anchor', () => {
  assert.deepEqual(calloutPosition(
    {left: 390, top: 700, bottom: 740}, {width: 260, height: 180}, {width: 420, height: 800}, 8, 6
  ), {left: 152, top: 514});
  assert.deepEqual(calloutPosition(
    {left: -20, top: 30, bottom: 60}, {width: 220, height: 100}, {width: 420, height: 800}, 8, 6
  ), {left: 8, top: 66});
});
