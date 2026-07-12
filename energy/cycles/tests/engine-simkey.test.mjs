import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simKey} from '../engine.js';

/* real complete example — the Wexcombe base case from app.js's EXAMPLES */
const BASE = `title: Cycle budget — Wexcombe 100MW/2h
battery: 100MW / 200MWh
spread: 35..85               // £/MWh, day-to-day 90% range
charge: 15..45
second: 35..60%              // second cycle: % of the day's best
drift: -4..0 %/yr
rte: 86..90%
fade: 0.006..0.012 %/cycle
calendar: 1.0..1.8 %/yr
cycles: 6000 over 15yr
augment: 120..180 £/kWh
discount: 7..10%`;

test('simKey: stable across non-sim edits, changes on sim inputs, null when incomplete', () => {
  const withComment = BASE + '\n// a note';
  assert.equal(simKey(parse(BASE)), simKey(parse(withComment)), 'comment-only addition does not change the key');

  const titleChanged = BASE.replace('title: Cycle budget — Wexcombe 100MW/2h', 'title: Something else entirely');
  assert.equal(simKey(parse(BASE)), simKey(parse(titleChanged)), 'title edit does not change the key');

  const paletteAdded = BASE + '\npalette: ocean';
  assert.equal(simKey(parse(BASE)), simKey(parse(paletteAdded)), 'palette edit does not change the key');

  /* battery.mw-only edit: simulate() never reads mw, only mwh */
  const mwOnly = BASE.replace('battery: 100MW / 200MWh', 'battery: 120MW / 200MWh');
  assert.equal(simKey(parse(BASE)), simKey(parse(mwOnly)), 'MW-only edit does not change the key (simulate ignores mw)');

  /* battery.mwh edit: simulate() reads this — must re-sim */
  const mwhChanged = BASE.replace('battery: 100MW / 200MWh', 'battery: 100MW / 250MWh');
  assert.notEqual(simKey(parse(BASE)), simKey(parse(mwhChanged)), 'MWh edit changes the key');

  /* a genuine sim-input change */
  const spreadChanged = BASE.replace('spread: 35..85', 'spread: 40..90');
  assert.notEqual(simKey(parse(BASE)), simKey(parse(spreadChanged)), 'spread edit changes the key');

  assert.equal(simKey(parse('')), null, 'empty text → incomplete → null');
  assert.equal(simKey(parse('spread: 35..85')), null, 'partial model → null');
});
