/* Engine-audit fixes: the Tree reader (TR-1, TR-2/3 words, TR-11, TR-12, TR-13, TR-16). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseMoney} from '../parse.js';
import {evaluate} from '../engine.js';
import {validators, applies} from '../edit-targets.js';

/* ---------- TR-1: a percent probability is the same probability ---------- */
test('TR-1: p=40% reads as 0.4 in a point, a range and beside rest', () => {
  const m = parse('Root\n  Launch\n    Works (p=40%): 1M\n    Fails (p=60%): -500k\n  Hold: 100k');
  const launch = m.root.children[0];
  assert.equal(launch.kind, 'chance');
  assert.deepEqual(launch.children[0].p, {lo: 0.4, hi: 0.4});
  assert.deepEqual(launch.children[1].p, {lo: 0.6, hi: 0.6});
  assert.deepEqual(m.warnings, []);
  const r = evaluate(m, {sims: 200});
  assert.equal(Math.round(r.stats.get(launch).mean), 100000, 'the chance reading (0.4 x 1M - 0.6 x 500k), not the best outcome');

  const range = parse('Root\n  A\n    Hit (p=30%-50%): 100\n    Miss (p=rest): 0\n  B: 1').root.children[0].children[0].p;
  assert.deepEqual(range, {lo: 0.3, hi: 0.5});
  const spaced = parse('Root\n  A\n    Hit (p=30% to 50%): 100\n    Miss (p=rest): 0\n  B: 1').root.children[0].children[0].p;
  assert.deepEqual(spaced, {lo: 0.3, hi: 0.5});
  const alongside = parse('Root\n  A\n    Hit (p=25%): 100\n    Miss (p=rest): 0\n  B: 1');
  assert.deepEqual(alongside.root.children[0].children[0].p, {lo: 0.25, hi: 0.25});
  assert.deepEqual(alongside.warnings, []);
});

test('TR-1: an over-100% percent still warns; an unreadable probability never turns a chance node into a decision', () => {
  const over = parse('Root\n  A\n    Hit (p=150%): 100\n    Miss (p=rest): 0\n  B: 1');
  assert.ok(over.warnings.some(w => /outside 0–1/.test(w)));
  const bad = parse('Root\n  Launch\n    Works (p=likely): 1M\n    Fails (p=unlikely): -500k\n  Hold: 100k');
  const launch = bad.root.children[0];
  assert.equal(launch.kind, 'chance', 'every sibling carries a p= annotation, readable or not');
  assert.ok(bad.warnings.some(w => w.includes('line 3') && /unreadable probability "likely"/.test(w)));
  assert.ok(bad.warnings.some(w => w.includes('line 4') && /unreadable probability "unlikely"/.test(w)));
  assert.ok(evaluate(bad, {sims: 50}).warnings.some(w => /no outcome contributed/.test(w)), 'and the zero total is named');
});

/* ---------- TR-12 / TR-13: the dashes and the minus the tool itself uses ---------- */
test('TR-12: en-dash and em-dash ranges read like hyphen ranges', () => {
  assert.deepEqual(parseMoney('2M–5M'), {lo: 2e6, hi: 5e6});
  assert.deepEqual(parseMoney('30–50'), {lo: 30, hi: 50});
  assert.deepEqual(parseMoney('£2M — £5M'), {lo: 2e6, hi: 5e6});
  const m = parse('Root\n  A: 2M–5M\n  B: 1M');
  assert.deepEqual(m.root.children[0].value, {lo: 2e6, hi: 5e6});
  assert.equal(m.root.children[0].label, 'A');
  assert.deepEqual(m.warnings, []);
  assert.deepEqual(parse('Root\n  A\n    Hit (p=0.3–0.45): 10\n    Miss (p=rest): 0\n  B: 1').root.children[0].children[0].p, {lo: 0.3, hi: 0.45});
});

test('TR-13: the minus sign the tool prints (U+2212) reads back, so its own output round-trips', () => {
  assert.deepEqual(parseMoney('−150k'), {lo: -150000, hi: -150000});
  assert.deepEqual(parseMoney('−£150k'), {lo: -150000, hi: -150000});
  assert.deepEqual(parseMoney('−£1M to −£500k'), {lo: -1e6, hi: -5e5});
  const m = parse('Root\n  A: −£150k\n  B: 0');
  assert.deepEqual(m.root.children[0].value, {lo: -150000, hi: -150000});
  assert.deepEqual(m.warnings, []);
});

/* ---------- TR-11: a time in a label is not a payoff ---------- */
test('TR-11: a colon between digits ("Meet at 10:30") belongs to the label, and the line says so', () => {
  const m = parse('Root\n  Meet at 10:30\n    Go (p=0.5): 100k\n    Stay (p=rest): 0\n  Skip: 20k');
  const meet = m.root.children[0];
  assert.equal(meet.label, 'Meet at 10:30');
  assert.equal(meet.value, null);
  assert.ok(m.warnings.some(w => w.includes('line 2') && /10:30/.test(w) && /label/.test(w)), JSON.stringify(m.warnings));
});

test('TR-11: every documented value form still reads as a payoff', () => {
  for(const [line, label, lo, hi] of [
    ['Submit bid: -150k', 'Submit bid', -150000, -150000],
    ['Walk away : 0', 'Walk away', 0, 0],
    ['Win (p=0.4) : 900k', 'Win', 900000, 900000],
    ['Win (p=0.3-0.45): 2M to 5M', 'Win', 2e6, 5e6],
    ['Build:1.5M', 'Build', 1.5e6, 1.5e6],
    ['Q3: 50k', 'Q3', 5e4, 5e4],
    ['Phase 2: £40k', 'Phase 2', 4e4, 4e4],
  ]){
    const m = parse('Root\n  ' + line + '\n  Other: 1');
    const n = m.root.children[0];
    assert.equal(n.label, label, line);
    assert.deepEqual(n.value, {lo, hi}, line);
  }
  const t = parse('Root\n  Meet at 10:30: 20k\n  Skip: 1');
  assert.equal(t.root.children[0].label, 'Meet at 10:30', 'a time in the label plus a real value colon');
  assert.deepEqual(t.root.children[0].value, {lo: 2e4, hi: 2e4});
});

test('TR-11: the edit helpers agree with the parser about which colon is the value colon', () => {
  assert.equal(validators.label('Meet at 10:30'), true);
  assert.equal(validators.label('Meet at 10: 30'), false);
  assert.equal(applies.value('  Meet at 10:30: 20k', '20k', '30k'), '  Meet at 10:30: 30k');
  assert.equal(applies.prob('  Meet at 10:30', '', '0.5'), '  Meet at 10:30 (p=0.5)');
});

/* ---------- TR-2 / TR-3: words only. The distributions stay. ---------- */
test('TR-2/3: a positive range wider than 1,000x warns once, naming the node; the figures are unchanged', () => {
  const m = parse('R\n  Wide: 1k to 1b\n  B: 0');
  const w = m.warnings.filter(x => /rare extremes/.test(x));
  assert.equal(w.length, 1, JSON.stringify(m.warnings));
  assert.ok(w[0].includes('line 2') && w[0].includes('"Wide"') && /above its own top/.test(w[0]));
  const r = evaluate(m);
  assert.equal(r.warnings.filter(x => /rare extremes/.test(x)).length, 0, 'not repeated by the simulation');
  assert.ok(r.stats.get(m.root.children[0]).mean > 1e9 / 1000, 'the draws did not change');
});

test('TR-2/3: ranges within 1,000x, ranges touching zero, and points stay quiet', () => {
  for(const src of ['R\n  A: 1k to 1M\n  B: 0', 'R\n  A: 0 to 1b\n  B: 0', 'R\n  A: -5M to 1b\n  B: 0', 'R\n  A: 1000\n  B: 0']){
    const m = parse(src);
    assert.ok(!m.warnings.some(x => /rare extremes/.test(x)), src);
    assert.ok(!evaluate(m, {sims: 500}).warnings.some(x => /rare extremes/.test(x)), src);
  }
});

test('TR-2/3: the expected value is exact, so a normal range never warns from seed noise (the exact-mean case is in exact.test.mjs)', () => {
  for(let seed = 1; seed <= 50; seed++){
    const m = parse('R\n  A: -10 to 10\n  B: 0');
    const r = evaluate(m, {sims: 1, seed});
    assert.equal(r.stats.get(m.root.children[0]).mean, 0);
    assert.ok(!r.warnings.some(x => /rare extremes/.test(x)), 'seed ' + seed);
  }
});

/* ---------- TR-16 ---------- */
test('TR-16: several top-level lines carrying p= make a chance root that is not called "Decision"', () => {
  const m = parse('Win (p=0.5): 10\nLose (p=rest): 0');
  assert.equal(m.root.kind, 'chance');
  assert.notEqual(m.root.label, 'Decision');
  const d = parse('A: 10\nB: 20');
  assert.equal(d.root.kind, 'decision');
  assert.equal(d.root.label, 'Decision');
});
