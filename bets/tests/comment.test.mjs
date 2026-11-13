import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';

/* A `//` starts a comment only at the start of a line or after whitespace, so a URL in a kill criterion survives. */
test('https:// inside a kill criterion is text, not a comment', () => {
  const m = parse('G\n  A: stake 10, odds 40-60%, payoff 20-30\n    kill: stop when https://example.com/metric dips');
  assert.equal(m.groups[0].bets[0].kill.text, 'stop when https://example.com/metric dips');
});

test('a trailing // after whitespace and a whole-line // are still comments', () => {
  const m = parse('G\n  A: stake 10, odds 40-60%, payoff 20-30 // note\n// whole line\n    kill: stop here // aside');
  assert.equal(m.groups[0].bets[0].payoff[1], 30);
  assert.equal(m.groups[0].bets[0].kill.text, 'stop here');
});
