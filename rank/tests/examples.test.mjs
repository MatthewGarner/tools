import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES, DEFAULT_CRITERIA, DEFAULT_EFFORT} from '../examples.js';
import {simulate, perRowKnife} from '../engine.js';

// Build the state the APP opens with: the default example under the default weights.
const stateFrom = (ex, criteria = DEFAULT_CRITERIA) => ({
  criteria: criteria.map(c => ({...c})),
  effort: {...DEFAULT_EFFORT},
  items: ex.items.map(r => ({name: r[0], s: r.slice(1, 1 + criteria.length), e: r[4]})),
  k: ex.k, ww: 50, sw: 1,
});
const scoreOf = (crit, it) => crit.reduce((a, c, ci) => a + c.w * it.s[ci], 0) / it.e;
const order = st => st.items.map((_, i) => i)
  .filter(i => st.items[i].s.every(v => isFinite(v) && v > 0) && isFinite(st.items[i].e) && st.items[i].e > 0)
  .sort((a, b) => scoreOf(st.criteria, st.items[b]) - scoreOf(st.criteria, st.items[a])).join(',');

test('every example is a valid, rankable set (≥2 ready items, simulate returns)', () => {
  for(const ex of EXAMPLES){
    const st = stateFrom(ex);
    assert.ok(st.items.length >= 2, `${ex.name} has ≥2 items`);
    assert.ok(simulate(st), `${ex.name} simulate returns non-null`);
    assert.equal(ex.items.every(r => r.length === 5), true, `${ex.name} rows are [name,3 scores,effort]`);
  }
});

// The whole point of /rank's first-load: the mechanism must SHOW itself. The old default
// (3 identical rows) could never re-sort under a weight drag and never lit a knife-edge.
test('the default example (EXAMPLES[0]) demonstrates the mechanism on load', () => {
  const ex = EXAMPLES[0];
  const st = stateFrom(ex);

  // (1) at least one row is knife-edge at the default weights — the pill is visible on load
  const knife = perRowKnife(st);
  assert.ok(knife.some(Boolean), 'default shows ≥1 knife-edge pill on load');

  // (2) at least one row is genuinely contested — P(top-k) strictly between settled and out,
  //     so the verdict separates "settled" from "a toss-up" rather than reading all-100%
  const {stats} = simulate(st);
  assert.ok(stats.some(s => s.ptop > 0.1 && s.ptop < 0.9),
    'default has a genuinely contested slot (0.1 < P(top-k) < 0.9)');

  // (3) dragging a weight actually re-ranks: zeroing the top criterion changes the order
  const zeroed = {...st, criteria: st.criteria.map((c, i) => i === 0 ? {...c, w: 0} : c)};
  assert.notEqual(order(st), order(zeroed), 'a weight change re-sorts the default (not identical rows)');
});
