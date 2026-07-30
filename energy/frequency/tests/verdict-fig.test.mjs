/* Swiss 6c: the verdict's ONE key figure — the nadir. The RoCoF is quoted
   first but in Hz/s, so the nadir must be the first bare "NN.NN Hz". */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, verdict, verdictFigure} from '../engine.js';
import {paramsFromControls} from '../state.js';

test('no result ⇒ no figure', () => assert.equal(verdictFigure(null), ''));

test('the figure is the nadir, verbatim, and the first bare Hz in the line', () => {
  for(const v of [{inertia: 90, trip: 1.8, dr: 0, dm: 0, dc: 0, gfm: 0},
                  {inertia: 300, trip: 0.2, dr: 0, dm: 0, dc: 0, gfm: 0},
                  {inertia: 40, trip: 1.8, dr: 1.5, dm: 1.5, dc: 4.5, gfm: 40}]){
    const p = paramsFromControls(v);
    const r = simulate(p);
    const line = verdict(r, p), fig = verdictFigure(r);
    assert.equal(fig, r.nadir.f.toFixed(2) + ' Hz');
    assert.ok(line.includes(fig), 'verbatim: ' + fig + ' / ' + line);
    assert.equal(line.indexOf(fig), line.search(/\d+\.\d+ Hz(?!\/s)/),
      'the nadir is the first bare Hz figure: ' + line);
  }
});
