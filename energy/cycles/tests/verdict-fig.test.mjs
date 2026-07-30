/* Swiss 6c: the threshold verdict's ONE key figure — the P50 cycle price.
   assets/verdict.js inks the FIRST occurrence, so the test that matters is
   that the first occurrence is the P50 and not a later quantile. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate, verdict, thresholdFigure, fmtUnit} from '../engine.js';

const FULL = `battery: 100MW / 200MWh
spread: 35..85
charge: 15..45
second: 35..60%
rte: 86..90%
fade: 0.006..0.012 %/cycle
calendar: 1.0..1.8 %/yr
cycles: 6000 over 15yr`;
const N = {seed: 1, n: 1500};

test('no result ⇒ no figure', () => {
  assert.equal(thresholdFigure(null), '');
  assert.equal(thresholdFigure(simulate(parse('spread: 35..85'), N)), '');
});

test('the figure is the P50, quoted verbatim, and is the line’s first £', () => {
  for(const spread of ['20..40', '35..85', '90..300']){
    const out = simulate(parse(FULL.replace('spread: 35..85', 'spread: ' + spread)), N);
    const line = verdict('threshold', out), fig = thresholdFigure(out);
    assert.equal(fig, fmtUnit(out.threshold.p50, '£/MWh'));
    assert.ok(line.includes(fig), 'verbatim: ' + fig + ' / ' + line);
    assert.equal(line.indexOf(fig), line.indexOf('£'),
      'the P50 is the first £ the sentence quotes: ' + line);
  }
});
