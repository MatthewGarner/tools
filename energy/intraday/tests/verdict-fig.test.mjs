/* Swiss 6c: the verdict's ONE key figure. assets/verdict.js inks the FIRST
   occurrence of `fig` in `line`, so two things must hold on every branch — the
   figure appears verbatim, and the first occurrence is the one we meant. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runDay, DAY_DEFAULTS} from '../day.js';
import {buildDayVerdict, buildDayVerdictParts} from '../render-day.js';

const parts = p => buildDayVerdictParts(runDay(p), p);

test('the line is exactly what buildDayVerdict has always returned', () => {
  for(const p of [DAY_DEFAULTS, {...DAY_DEFAULTS, fleetGW: 6, fleetH: 2}])
    assert.equal(parts(p).line, buildDayVerdict(runDay(p), p));
});

test('no fleet: the figure is the day’s spread, and it is the line’s first £', () => {
  const {line, fig} = parts({...DAY_DEFAULTS, fleetGW: 0});
  assert.match(fig, /^£\d+$/);
  assert.equal(line.indexOf(fig), line.indexOf('£'), 'the spread is the first £ quoted');
});

test('empty book: the figure is the spread that was too thin to trade', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 0.5, fleetH: 1, trough: 34, peak: 35, solarPeak: 0};
  const {line, fig} = parts(p);
  if(/finds nothing worth trading/.test(line)){
    assert.ok(line.includes('(' + fig + ')'), 'the figure is the bracketed spread');
  }
});

test('trading fleet: the compound kept-of-planned figure, first occurrence, over a sweep', () => {
  let seen = 0;
  for(const fleetGW of [0.5, 1, 2, 4, 6, 10, 12])
    for(const fleetH of [1, 2, 4])
      for(const gas of [40, 100, 250]){
        const p = {...DAY_DEFAULTS, fleetGW, fleetH, gas};
        const {line, fig} = parts(p);
        if(!/perfect foresight/.test(line)) continue;   // a different branch
        seen++;
        assert.ok(fig.includes(' of the '), 'the trading branch quotes the pair');
        const at = line.indexOf(fig);
        assert.ok(at > 0, 'figure appears verbatim: ' + fig + ' / ' + line);
        assert.equal(at, line.indexOf('it keeps ') + 'it keeps '.length,
          'the FIRST occurrence is the kept figure, not a prefix of an earlier £: ' + line);
      }
  assert.ok(seen >= 20, 'the sweep exercised the trading branch (' + seen + ')');
});
