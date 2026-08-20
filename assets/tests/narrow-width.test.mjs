import {test} from 'node:test';
import assert from 'node:assert/strict';
import {narrowWidth, watchNarrowBucket} from '../narrow-width.js';

test('narrowWidth returns only a non-zero width below the threshold', () => {
  assert.equal(narrowWidth({clientWidth: 519}), 519);
  assert.equal(narrowWidth({clientWidth: 520}, {fallback: 900}), 900);
  assert.equal(narrowWidth({clientWidth: 0}, {fallback: 900}), 900);
  assert.equal(narrowWidth({clientWidth: 399}, {threshold: 400}), 399);
});

test('watchNarrowBucket fires initially and only when the bucket flips', t => {
  let callback;
  const observed = [];
  const ro = {observe: (...args) => observed.push(args), disconnect() {}};
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(fn){ callback = fn; }
    observe(...args){ ro.observe(...args); }
    disconnect(){ ro.disconnect(); }
  };
  t.after(() => { delete globalThis.ResizeObserver; });
  const el = {clientWidth: 480};
  const buckets = [];
  const result = watchNarrowBucket(el, bucket => buckets.push(bucket));
  assert.equal(result.constructor.name, 'ResizeObserver');
  assert.deepEqual(observed, [[el, {box: 'content-box'}]]);
  callback();
  callback();
  el.clientWidth = 700;
  callback();
  callback();
  el.clientWidth = 0;
  callback();
  assert.deepEqual(buckets, ['narrow', 'wide']);
});
