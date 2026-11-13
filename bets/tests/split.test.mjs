/* BT-1 detection: split exactly when the runs do not pin the median down to the step it is printed at. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {simulate, medianSplitTest} from '../engine.js';
import {mulberry32, gaussian} from '../../assets/series.js';
import {STARTER} from '../starter.js';

const ROOT = new URL('../../', import.meta.url);
const SRC = [...readFileSync(new URL('bets/app.js', ROOT), 'utf8').matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)].map(m => m[2]);
const LANTERN = SRC[0], QUICK = SRC[1];
const sortedOf = values => Float64Array.from(values).sort();
const g = gaussian(mulberry32(5));
const normal = n => sortedOf(Array.from({length: n}, () => 100 + 30 * g()));

test('the level window is 1.5 / sqrt(n) either side of the median, and a split needs hi - lo > 3 steps', () => {
  const xs = normal(40000), t = medianSplitTest(xs, 1);
  assert.ok(Math.abs(t.d - 0.0075) < 1e-9);
  assert.equal(t.lo, xs[Math.round((0.5 - t.d) * 39999)]);
  assert.equal(t.hi, xs[Math.round((0.5 + t.d) * 39999)]);
  assert.ok(t.hi - t.lo < 3 * 5, 'a normal pins its median down to a fraction of 3 steps of 5');
});
test('a single-peaked distribution does not split at a step that matches its spread; it does at a fine enough step', () => {
  const xs = normal(40000);
  assert.equal(medianSplitTest(xs, 5).split, null);
  assert.ok(medianSplitTest(xs, 0.1).split, 'at a step of 0.1 the runs cannot pin a median to 3 steps');
});
test('two clusters with an empty stretch at the median split at any run count; A and B are cluster medians', () => {
  for(const n of [1000, 4000, 40000]){
    const xs = sortedOf([...Array.from({length: n / 2}, () => -300 + 20 * g()), ...Array.from({length: n / 2}, () => 200 + 60 * g())]);
    const t = medianSplitTest(xs, 10);
    assert.ok(t.split, 'n = ' + n);
    assert.ok(Math.abs(t.split.lo + 300) < 10 && Math.abs(t.split.hi - 200) < 20, `A ${t.split.lo}, B ${t.split.hi}`);
    assert.ok(t.point > -200 && t.point < 100, 'the split point is the middle of the widest central gap: ' + t.point);
  }
});
test('point-valued books: two outcomes at 50/50 split; 30/40/30 and all-equal do not', () => {
  const book = shares => { const xs = []; shares.forEach(([v, p]) => { for(let i = 0; i < p * 20000; i++) xs.push(v); }); return sortedOf(xs); };
  const two = medianSplitTest(book([[-10, .5], [20, .5]]), 1);
  assert.ok(two.split && two.split.lo === -10 && two.split.hi === 20);
  assert.equal(medianSplitTest(book([[-10, .3], [5, .4], [20, .3]]), 1).split, null);
  assert.equal(medianSplitTest(book([[7, 1]]), 1).split, null);
});

test('Lantern shared splits on 60 seeds; Lantern independent, Quick gut check do not; Start your own does', () => {
  const m = parse(LANTERN);
  for(let i = 0; i < 60; i++){
    const e = simulate(m, {seed: 1000 + i * 7919});
    assert.ok(e.scenarios.shared.split, 'seed index ' + i + ', span ' + e.scenarios.shared.splitSpan);
    assert.equal(e.portfolio.split, null, 'independent, seed index ' + i);
  }
  const q = simulate(parse(QUICK));
  assert.equal(q.portfolio.split, null); assert.equal(q.scenarios.shared.split, null);
  const s = simulate(parse(STARTER));
  assert.ok(s.portfolio.split && s.scenarios.shared.split);
});
test('the engine agrees with the pure test on its own sorted runs', () => {
  const m = parse(LANTERN), e = simulate(m, {keepRuns: true});
  for(const [pf, runs] of [[e.scenarios.shared, e.runs.shared], [e.portfolio, e.runs.independent]]){
    const t = medianSplitTest(Float64Array.from(runs).sort(), pf.step);
    assert.equal(!!t.split, !!pf.split);
    if(t.split){ assert.equal(t.split.lo, pf.split.lo); assert.equal(t.split.hi, pf.split.hi); }
    assert.equal(t.span, pf.splitSpan);
  }
});
