/* Guards for the weight-slider runaway (2026-08-05): slider max/step derive from
   state, and recalibrating mid-drag moved the ceiling under the thumb — weights
   compounded exponentially to 1e13+ and the unrounded readouts broke the phone
   layout. The fix pins calibration to commit(); these tests pin the calibration
   maths and the readout compactness so the class can't quietly return. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sliderScale} from '../engine.js';
import {fmt} from '../../assets/series.js';

const isNice = step => {
  const pow = Math.pow(10, Math.floor(Math.log10(step)));
  const m = step / pow;
  return [1, 2, 5].some(n => Math.abs(m - n) < 1e-9);
};

test('max is 2× the largest weight, floored at 2', () => {
  assert.equal(sliderScale([1, 2, 3]).max, 6);
  assert.equal(sliderScale([0, 0]).max, 2);
  assert.equal(sliderScale([]).max, 2);
  assert.equal(sliderScale([0.2]).max, 2);
});

test('step is always a clean 1/2/5×10ⁿ value, never below 0.1', () => {
  for(const weights of [[1], [3], [7.5], [42], [999], [12345], [7e13], [0.3]]){
    const {step} = sliderScale(weights);
    assert.ok(step >= 0.1, `step ${step} >= 0.1 for ${weights}`);
    assert.ok(isNice(step), `step ${step} is nice for ${weights}`);
  }
});

test('a full drag-to-the-end gesture doubles the largest weight — geometric, not exponential', () => {
  // Each gesture: commit recalibrates, then the user drags the thumb to the far end.
  // Ten deliberate ratchets from 3 must land at exactly 2^10 × ... bounded ×2 a time,
  // nowhere near the 1e13 the mid-drag feedback loop produced in a single drag.
  let w = 3;
  for(let g = 0; g < 10; g++) w = sliderScale([w]).max;
  assert.equal(w, 3 * 2 ** 10);
});

test('slider positions land on clean decimals (nice step × index has no float tail)', () => {
  const {step} = sliderScale([3]);   // max 6, step 0.1
  for(let i = 0; i <= 60; i++){
    const v = Number((step * i).toPrecision(12));   // what the range input reports, post-clamp
    assert.ok(String(v).length <= 4, `value ${v} prints short`);
  }
});

test('fmt keeps any magnitude readout-sized — legacy runaway URLs stay bounded', () => {
  for(const w of [0.5, 1, 14.3, 999, 12345, 47208184968084.5, 70174405151985, 1e15]){
    const s = fmt(w);
    assert.ok(s.length <= 6, `fmt(${w}) = "${s}" fits the readout`);
    assert.ok(!/\d{5,}/.test(s), `fmt(${w}) = "${s}" has no long digit run`);
  }
});
