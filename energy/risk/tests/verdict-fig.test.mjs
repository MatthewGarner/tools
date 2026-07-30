/* Swiss 6c: the trade verdict's ONE key figure. It must be the FIRST money
   figure the sentence quotes — otherwise assets/verdict.js's first-occurrence
   split could ink an earlier number that happens to format the same. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate, tradeFigure} from '../engine.js';
import {riskVerdict, riskVerdictParts} from '../render.js';

const src = extra => 'merchant: 60..180\n' + extra;
const money = /£[\d.,]+[a-zA-Z/]*/;

test('no sim / no trade ⇒ no line and no figure', () => {
  assert.deepEqual(riskVerdictParts(null, {}), {line: '', fig: ''});
  assert.equal(tradeFigure({kind: 'merchant'}, '£k/MW/yr'), '');
});

test('the line still reads exactly as riskVerdict always returned it', () => {
  const m = parse(src('floor: 70 share 60% fee 5'));
  const sim = simulate(m);
  assert.equal(riskVerdictParts(sim, m, 1).line, riskVerdict(sim, m, 1));
});

for(const [what, leg] of [['floor', 'floor: 70 share 60% fee 5'],
                          ['toll', 'toll: 95'],
                          ['insure', 'insure: premium 6 attach 65 limit 30']]){
  test(what + ': the figure is the first money figure in the sentence', () => {
    const m = parse(src(leg));
    const sim = simulate(m);
    const {line, fig} = riskVerdictParts(sim, m, 1);
    assert.ok(fig, what + ': no figure');
    assert.ok(line.includes(fig), 'verbatim: ' + fig + ' / ' + line);
    assert.equal(line.indexOf(fig), line.search(money),
      'first occurrence is the intended figure: ' + line);
  });
}
