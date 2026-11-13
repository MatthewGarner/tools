/* Q-GREEDY: the one-cycle-a-day rule is stated wherever "perfect foresight" is. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runDay, DAY_DEFAULTS} from '../day.js';
import {buildDayVerdict, buildDayVerdictParts, DAY_LIMITATION} from '../render-day.js';

test('the trading verdict says perfect foresight AND one cycle a day, across fleet sizes', () => {
  let seen = 0;
  for(const fleetGW of [0.5, 1, 2, 4, 6, 10, 12])
    for(const fleetH of [1, 2, 4]){
      const p = {...DAY_DEFAULTS, fleetGW, fleetH};
      const line = buildDayVerdict(runDay(p), p);
      if(!/foresight/.test(line)) continue;
      seen++;
      assert.match(line, /Even with perfect foresight and one cycle a day it keeps £\d+ of the £\d+ per MW per day/, line);
    }
  assert.ok(seen >= 10, 'exercised the trading branch: ' + seen);
});

test('the kept figure is still the first £ pair after "it keeps "', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const {line, fig} = buildDayVerdictParts(runDay(p), p);
  assert.equal(line.indexOf(fig), line.indexOf('it keeps ') + 'it keeps '.length);
});

test('the export limitation line names the one-cycle rule', () => {
  assert.match(DAY_LIMITATION, /one cycle a day/);
  assert.match(DAY_LIMITATION, /perfect foresight/);
});
