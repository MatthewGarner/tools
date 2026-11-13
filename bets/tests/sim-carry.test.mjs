/* The pending picture's figures: the last result carried onto the edited portfolio by bet, a coarse run only for what was not in it,
   and the memo's peek/put (the single place a result is looked up) answering without ever simulating. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {carrySim, createSimMemo, isSmall} from '../sim-memo.js';
import {betsLarge} from '../../dev/feel-audit/stress-btp.mjs';

/* the built-in examples, read from the page that offers them (the tests hold no second copy) */
const EXAMPLES = [...readFileSync(new URL('../app.js', import.meta.url), 'utf8').matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)].map(m => ({name: m[1], src: m[2]}));

const SRC = `title: T
unit: £k
G
  A: stake 100, odds 40-60%, payoff 300-500
    kill: stop
  B: stake 50, odds 20-30%, payoff 100-200`;

test('an edited bet keeps its last figures; they are the last result, not the new one', () => {
  const before = parse(SRC), sim = simulate(before);
  const edited = parse(SRC.replace('stake 100', 'stake 250'));
  const carried = carrySim({model: before, sim}, edited);
  assert.deepStrictEqual(carried.bets.get(edited.groups[0].bets[0].srcLine), sim.bets.get(before.groups[0].bets[0].srcLine));
  assert.equal(carried.portfolio, sim.portfolio);
});

test('figures follow a bet when a line is inserted above it; the new bet has none yet', () => {
  const before = parse(SRC), sim = simulate(before);
  const edited = parse(SRC.replace('  B:', '  Extra: stake 10, odds 50%, payoff 30\n  B:'));
  const carried = carrySim({model: before, sim}, edited);
  const [, extra, b] = edited.groups[0].bets;
  assert.deepStrictEqual(carried.bets.get(b.srcLine), sim.bets.get(before.groups[0].bets[1].srcLine), 'B keeps B\'s figures at its new line');
  assert.equal(carried.bets.get(extra.srcLine).pending, true, 'the new bet is pending: an ellipsis, no bar');
  assert.equal(carried.pendingAll, undefined);
});

test('a renamed bet keeps its figures (same place, name gone from the portfolio)', () => {
  const before = parse(SRC), sim = simulate(before);
  const edited = parse(SRC.replace('A:', 'Alpha:'));
  const carried = carrySim({model: before, sim}, edited);
  assert.deepStrictEqual(carried.bets.get(edited.groups[0].bets[0].srcLine), sim.bets.get(before.groups[0].bets[0].srcLine));
});

test('with no last result every bet and the portfolio are pending; an invalid bet stays not scored', () => {
  const model = parse(SRC + '\n  Bad: stake 5');
  const carried = carrySim(null, model);
  assert.equal(carried.pendingAll, true);
  assert.equal(carried.portfolio, null);
  const recs = [...carried.bets.values()];
  assert.equal(recs.length, 3);
  assert.ok(recs.every(r => r.pending));
  assert.deepStrictEqual(recs.map(r => r.scoreable), [true, true, false]);
});

test('peek answers from the kept result and never simulates; put keeps a result computed elsewhere', () => {
  let runs = 0;
  const memo = createSimMemo(m => { runs++; return simulate(m); });
  const model = parse(SRC);
  assert.equal(memo.peek(model), null);
  memo.put(model, simulate(model));
  const hit = memo.peek(parse(SRC.replace('title: T', 'title: Other')));
  assert.ok(hit && hit.bets.size === 2);
  assert.equal(runs, 0, 'peek and put never ran the simulation');
  assert.equal(memo.peek(parse(SRC.replace('stake 100', 'stake 101'))), null, 'an input changed: not kept');
  memo.get(model);
  assert.equal(runs, 0, 'get finds what was put');
});

test('the built-in examples are drawn from the simulation at load; a large portfolio is drawn pending and filled in', () => {
  assert.equal(isSmall(parse(SRC)), true);
  for(const e of EXAMPLES) assert.equal(isSmall(parse(e.src)), true, e.name);
  assert.equal(isSmall(parse(betsLarge())), false);
});
