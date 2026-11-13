import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mdEscape} from '../format.js';
import {mdEscape as bets} from '../../bets/format.js';
import {mdEscape as paths} from '../../paths/md-escape.js';

/* The same rule in all three tools (each has its own copy; this test is the only place they meet). */
const VECTOR = 'a|b *c* _d_ <b>e</b> [f] \\ & "g"';
const WANT = 'a\\|b \\*c\\* \\_d\\_ \\<b\\>e\\</b\\> \\[f\\] \\\\ & "g"';

test('mdEscape: the shared vector, in Tree, Bets and Paths alike', () => {
  for(const fn of [mdEscape, bets, paths]) assert.equal(fn(VECTOR), WANT);
});
