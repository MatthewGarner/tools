import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {kinds, validators, rewriteStake, rewriteOdds, rewritePayoff, rewriteKill,
  renameBet, removeBet, addBetLine, addGroupLine} from '../edit-targets.js';

/* same fixture as parse.test.mjs — srcLines are 1-based (bets/parse.js) */
const FULL = `title: Q3 product portfolio
unit: £k
palette: ocean

Growth
  Search revamp: stake 120, odds 30-50%, payoff 400-900
    kill: CTR flat after 2 sprints by 2026-09-01
  Referral loop: stake 45, odds 15-35%, payoff 200-600
    kill: <5% invite rate by March

Platform
  Billing rewrite: stake 200, odds 85-95%, payoff 250-350`;

/* mirrors wardley/tests' local apply helper: edits use 0-based `line`
   (matching applyLineOps/lineOpsChanges), text:null deletes the line */
const apply = (text, edits) => {
  const lines = text.split('\n');
  for(const e of edits) lines[e.line] = e.text;
  return lines.filter(l => l !== null).join('\n');
};

test('kinds: stake/odds/payoff/kill are all plain input kinds (no cycle/menu/options)', () => {
  for(const k of ['stake', 'odds', 'payoff', 'kill']){
    assert.ok(kinds[k], k + ' kind present');
    assert.equal(typeof kinds[k].validate, 'function', k + ' has validate');
    assert.ok(!kinds[k].cycle && !kinds[k].menu && !kinds[k].options && !kinds[k].actions, k + ' is input-kind only');
  }
});

test('odds rewrite: 30-50% -> 20-60% leaves stake/payoff byte-identical, updates odds', () => {
  const edits = rewriteOdds(FULL, 6, '30-50%', '20-60');
  assert.equal(edits.length, 1);
  assert.equal(edits[0].line, 5);                      // 0-based: srcLine 6 - 1
  assert.equal(edits[0].text, '  Search revamp: stake 120, odds 20-60%, payoff 400-900');
  const out = apply(FULL, edits);
  const b = parse(out).groups[0].bets[0];
  assert.deepEqual(b.odds, [20, 60]);
  assert.deepEqual(b.stake, [120, 120]);
  assert.deepEqual(b.payoff, [400, 900]);
});

test('point stake 120 -> 150 stays a point', () => {
  const edits = rewriteStake(FULL, 6, '120', '150');
  assert.match(edits[0].text, /stake 150,/);
  const b = parse(apply(FULL, edits)).groups[0].bets[0];
  assert.deepEqual(b.stake, [150, 150]);
});

test('range stake stays a range after rewrite', () => {
  const edits = rewriteStake(FULL, 6, '120', '100-200');
  assert.match(edits[0].text, /stake 100-200,/);
  const b = parse(apply(FULL, edits)).groups[0].bets[0];
  assert.deepEqual(b.stake, [100, 200]);
});

test('payoff rewrite leaves stake and odds untouched', () => {
  const edits = rewritePayoff(FULL, 6, '400-900', '500-1000');
  const out = apply(FULL, edits);
  const b = parse(out).groups[0].bets[0];
  assert.deepEqual(b.payoff, [500, 1000]);
  assert.deepEqual(b.stake, [120, 120]);
  assert.deepEqual(b.odds, [30, 50]);
});

test('kill rewrite preserves the existing by-date when the new text omits one', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', 'CTR flat after 3 sprints');
  assert.equal(edits.length, 1);
  assert.equal(edits[0].line, 6);                      // 0-based: srcLine 7 - 1
  const k = parse(apply(FULL, edits)).groups[0].bets[0].kill;
  assert.equal(k.text, 'CTR flat after 3 sprints');
  assert.equal(k.by, '2026-09-01');
});

test('kill rewrite replaces the by-date when the new text carries its own', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', 'Pivot signal by 2026-11-01');
  const k = parse(apply(FULL, edits)).groups[0].bets[0].kill;
  assert.equal(k.text, 'Pivot signal');
  assert.equal(k.by, '2026-11-01');
});

test('empty kill value deletes the child kill line', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', '');
  assert.deepEqual(edits, [{line: 6, text: null}]);
  const b = parse(apply(FULL, edits)).groups[0].bets[0];
  assert.equal(b.kill, null);
});

test('whitespace-only kill value also deletes the child kill line', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', '   ');
  assert.deepEqual(edits, [{line: 6, text: null}]);
});

test('a trailing // comment on a bet line survives an odds rewrite', () => {
  const doc = 'G\n  B: stake 10, odds 20-40%, payoff 5-9   // hot lead';
  const edits = rewriteOdds(doc, 2, '20-40%', '25-45');
  const out = apply(doc, edits);
  assert.match(out, /\/\/ hot lead$/);
  const b = parse(out).groups[0].bets[0];
  assert.deepEqual(b.odds, [25, 45]);
});

test('odds validate accepts an out-of-range value; rewrite clamps 20-150% to 20-100%', () => {
  assert.equal(kinds.odds.validate('20-150'), true);
  const edits = rewriteOdds(FULL, 6, '30-50%', '20-150');
  assert.match(edits[0].text, /odds 20-100%/);
  const b = parse(apply(FULL, edits)).groups[0].bets[0];
  assert.deepEqual(b.odds, [20, 100]);
});

test('invalid input returns null (no edit) and fails validate', () => {
  assert.equal(rewriteStake(FULL, 6, '120', 'abc'), null);
  assert.equal(rewriteOdds(FULL, 6, '30-50%', 'abc'), null);
  assert.equal(rewritePayoff(FULL, 6, '400-900', 'abc'), null);
  assert.equal(kinds.stake.validate('abc'), false);
  assert.equal(kinds.odds.validate('abc'), false);
  assert.equal(kinds.payoff.validate('abc'), false);
});

test('a stake/odds/payoff rewrite never touches other bets\' srcLines', () => {
  const edits = rewriteOdds(FULL, 6, '30-50%', '20-60');
  assert.equal(edits.length, 1);                       // only the target line changes
  const m = parse(apply(FULL, edits));
  assert.equal(m.groups[0].bets[1].srcLine, 8);
  assert.equal(m.groups[0].bets[1].kill.srcLine, 9);
  assert.equal(m.groups[1].srcLine, 11);
  assert.equal(m.groups[1].bets[0].srcLine, 12);
});

test('kill deletion shifts only subsequent srcLines by one line, nothing else changes shape', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', '');
  const m = parse(apply(FULL, edits));
  assert.equal(m.groups[0].bets[0].kill, null);
  assert.equal(m.groups[0].bets[1].srcLine, 7);        // was 8, shifted -1
  assert.equal(m.groups[0].bets[1].kill.srcLine, 8);   // was 9
  assert.equal(m.groups[1].srcLine, 10);               // was 11
  assert.equal(m.groups[1].bets[0].srcLine, 11);       // was 12
});

/* ---------------- structure rewrites (mobile-input stage: rename / remove /
   add bet / add group — the phone card menu + ＋ capsules) ---------------- */

/* simulate insertAndSelect: splice newLine in after afterLine (0-based) */
const applyAdd = (text, r) => {
  const lines = text.split('\n');
  lines.splice(r.afterLine + 1, 0, r.newLine);
  return lines.join('\n');
};

test('renameBet rewrites only the name; attrs, kill and every other srcLine survive', () => {
  const edits = renameBet(FULL, 6, 'Search revamp', 'Search spine');
  assert.deepEqual(edits, [{line: 5, text: '  Search spine: stake 120, odds 30-50%, payoff 400-900'}]);
  const m = parse(apply(FULL, edits));
  const b = m.groups[0].bets[0];
  assert.equal(b.name, 'Search spine');
  assert.deepEqual(b.stake, [120, 120]);
  assert.deepEqual(b.odds, [30, 50]);
  assert.deepEqual(b.payoff, [400, 900]);
  assert.equal(b.kill.text, 'CTR flat after 2 sprints');
  assert.equal(m.groups[1].bets[0].srcLine, 12);       // nothing shifted
  assert.equal(m.warnings.length, parse(FULL).warnings.length, 'no new warnings');
});

test('renameBet keeps a trailing // comment untouched', () => {
  const doc = 'G\n  B: stake 10, odds 20-40%, payoff 5-9   // hot lead';
  const edits = renameBet(doc, 2, 'B', 'Bigger bet');
  assert.match(edits[0].text, /^  Bigger bet: stake 10.*\/\/ hot lead$/);
  assert.equal(parse(apply(doc, edits)).groups[0].bets[0].name, 'Bigger bet');
});

test('renameBet rejects degenerate names (empty / colon / comment / newline) with null', () => {
  for(const bad of ['', '   ', 'a: b', 'x // y', 'two\nlines'])
    assert.equal(renameBet(FULL, 6, 'Search revamp', bad), null, JSON.stringify(bad));
});

test('renameBet on a non-bet srcLine (group heading, kill child, blank) is a no-op null', () => {
  assert.equal(renameBet(FULL, 5, 'Growth', 'Bigger'), null);   // group heading
  assert.equal(renameBet(FULL, 7, 'kill', 'nope'), null);       // kill child
  assert.equal(renameBet(FULL, 4, '', 'nope'), null);           // blank line
});

test('removeBet deletes the bet line AND its kill child; siblings shift, shape survives', () => {
  const ops = removeBet(FULL, 6);
  assert.deepEqual(ops, [{line: 5, text: null}, {line: 6, text: null}]);
  const m = parse(apply(FULL, ops));
  assert.equal(m.groups[0].bets.length, 1);
  assert.equal(m.groups[0].bets[0].name, 'Referral loop');
  assert.equal(m.groups[1].bets[0].name, 'Billing rewrite');
  assert.equal(m.warnings.length, parse(FULL).warnings.length, 'no new warnings');
});

test('removeBet on a kill-less bet deletes exactly one line', () => {
  assert.deepEqual(removeBet(FULL, 12), [{line: 11, text: null}]);
  const m = parse(apply(FULL, removeBet(FULL, 12)));
  assert.equal(m.groups[1].bets.length, 0);
  assert.equal(m.groups[1].name, 'Platform');
});

test('removeBet takes indented comment lines in the bet block with it', () => {
  const doc = 'G\n  B: stake 10, odds 20-40%, payoff 5-9\n    // remember why\n    kill: x\n  C: stake 1, odds 50%, payoff 2';
  const ops = removeBet(doc, 2);
  assert.deepEqual(ops, [{line: 1, text: null}, {line: 2, text: null}, {line: 3, text: null}]);
  const m = parse(apply(doc, ops));
  assert.equal(m.groups[0].bets.length, 1);
  assert.equal(m.groups[0].bets[0].name, 'C');
});

test('removeBet still catches a kill child separated by an unindented comment line', () => {
  const doc = 'G\n  B: stake 10, odds 20-40%, payoff 5-9\n// margin note\n    kill: x';
  const ops = removeBet(doc, 2);
  assert.deepEqual(ops, [{line: 1, text: null}, {line: 3, text: null}]);   // the comment stays
  const m = parse(apply(doc, ops));
  assert.equal(m.groups[0].bets.length, 0);
});

test('removeBet on a non-bet srcLine is a no-op null', () => {
  assert.equal(removeBet(FULL, 5), null);    // group heading
  assert.equal(removeBet(FULL, 7), null);    // kill child
  assert.equal(removeBet(FULL, 4), null);    // blank
});

test('addBetLine lands after the group\'s last bet block (kill included), parses clean', () => {
  const r = addBetLine(FULL, 5);             // Growth (srcLine 5)
  assert.equal(r.afterLine, 8);              // 0-based: Referral loop's kill (line 9)
  assert.equal(r.select, 'New bet');
  const m = parse(applyAdd(FULL, r));
  assert.equal(m.groups[0].bets.length, 3);
  const nb = m.groups[0].bets[2];
  assert.equal(nb.name, 'New bet');
  assert.deepEqual(nb.stake, [50, 50]);
  assert.deepEqual(nb.odds, [40, 60]);
  assert.deepEqual(nb.payoff, [100, 200]);
  assert.equal(m.warnings.length, parse(FULL).warnings.length, 'placeholder parses warning-free');
  assert.equal(m.groups[1].bets[0].name, 'Billing rewrite');   // Platform intact
});

test('addBetLine on the last group appends after its kill-less last bet', () => {
  const r = addBetLine(FULL, 11);            // Platform
  assert.equal(r.afterLine, 11);             // 0-based: Billing rewrite (line 12)
  const m = parse(applyAdd(FULL, r));
  assert.equal(m.groups[1].bets.length, 2);
  assert.equal(m.groups[1].bets[1].name, 'New bet');
});

test('addBetLine into an empty group inserts right under the heading', () => {
  const doc = 'G1\nG2\n  B: stake 1, odds 50%, payoff 2';
  const r = addBetLine(doc, 1);              // G1 (srcLine 1) is empty
  assert.equal(r.afterLine, 0);
  const m = parse(applyAdd(doc, r));
  assert.equal(m.groups[0].bets.length, 1);
  assert.equal(m.groups[0].bets[0].name, 'New bet');
  assert.equal(m.groups[1].bets.length, 1);
});

test('addBetLine on a non-group srcLine is a no-op null', () => {
  assert.equal(addBetLine(FULL, 6), null);   // a bet line
  assert.equal(addBetLine(FULL, 4), null);   // blank
});

test('addGroupLine appends a heading after the last non-blank line, parses clean', () => {
  const r = addGroupLine(FULL);
  assert.equal(r.afterLine, 11);             // 0-based: Billing rewrite, the last content line
  assert.equal(r.newLine, 'New group');
  assert.equal(r.select, 'New group');
  const m = parse(applyAdd(FULL, r));
  assert.equal(m.groups.length, 3);
  assert.equal(m.groups[2].name, 'New group');
  assert.equal(m.groups[2].bets.length, 0);
  assert.equal(m.warnings.length, parse(FULL).warnings.length, 'no new warnings');
});

test('addGroupLine ignores trailing blank lines when picking the anchor', () => {
  const r = addGroupLine(FULL + '\n\n');
  assert.equal(r.afterLine, 11);
});

test('name/group validators: reasonable names pass, structure-breaking ones fail', () => {
  for(const good of ['Search spine', 'Q4 hedges', 'Bet #2 (v2)'])
    assert.equal(validators.name(good), true, good);
  for(const bad of ['', '   ', 'a: b', 'with // comment', 'two\nlines']){
    assert.equal(validators.name(bad), false, JSON.stringify(bad));
    assert.equal(validators.group(bad), false, JSON.stringify(bad));
  }
});

test('kinds: name/addbet/addgroup are plain input kinds wired to the validators', () => {
  for(const k of ['name', 'addbet', 'addgroup']){
    assert.ok(kinds[k], k + ' kind present');
    assert.equal(typeof kinds[k].validate, 'function', k + ' has validate');
    assert.ok(!kinds[k].cycle && !kinds[k].menu && !kinds[k].options && !kinds[k].actions, k + ' is input-kind only');
  }
  assert.equal(kinds.name.validate('a: b'), false);
  assert.equal(kinds.addbet.validate('Pen test'), true);
  assert.equal(kinds.addgroup.validate('Ops bets'), true);
});
