import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate, oversizedUrlWarning} from '../evaluate.js';
import {enumeratePlans} from '../plans.js';

function one(model, code, line, phase, message){
  const found = model.warnings.filter(w => w.code === code);
  assert.equal(found.length, 1, `${code} should fire exactly once`);
  assert.equal(found[0].line, line, `${code} line`);
  assert.equal(found[0].phase, phase, `${code} phase`);
  if(message) assert.equal(found[0].message, message);
}

const complete = (name, extra = '') => `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-15${extra}`;

test('every parse warning has its owning phase, exact source line and dedupe key', () => {
  let model = parse('NOW\ndecision Coach Pricing:');
  one(model, 'invalid-decision-heading', 2, 'parse', 'line 2: "decision Coach Pricing:" is not a valid decision heading — use one word with letters, numbers or hyphens, such as "decision coach-pricing:"');

  model = parse('NOW\n\tCore: A');
  one(model, 'tab-indent', 2, 'parse', 'line 2: tab used for indentation — read as 2 spaces; replace it with 2 spaces');
  model = parse('NOW\n   Core: A');
  one(model, 'odd-indent', 2, 'parse', 'line 2: item is indented by 3 spaces — read as 2 spaces; use 2 spaces');
  model = parse('decision groups:\n    question: q');
  one(model, 'odd-indent', 2, 'parse', 'line 2: decision field is indented by 4 spaces — read as 2 spaces; use 2 spaces');
  model = parse('title: x\ndate: off\ntoday: 2026-08-10\n  Core: Streak repair');
  one(model, 'item-before-period', 4, 'parse', 'line 4: "Core: Streak repair" appears before any period — kept in the first period, "Now"; add a period heading above it');

  model = parse('decision groups:\n  question: q\n  signal: s\n  owner: o\n  answer-by: 2026-12-15\n  measure: x');
  one(model, 'unknown-decision-field', 6, 'parse', 'line 6: unknown decision field "measure:" — field ignored; use question / signal / reading / owner / answer-by / when / assume / answer');
  model = parse('decision groups:\n  question: q\n  signal: s\n  owner: first\n  answer-by: 2026-12-15\n  owner: second');
  one(model, 'duplicate-decision-field', 6, 'parse', 'line 6: second "owner:" field ignored — the value on line 4 is kept; keep one "owner:" field');
  model = parse(`${complete('groups')}\n  answer: yes\n  answer: yes`);
  one(model, 'repeated-answer', 7, 'parse', 'line 7: decision "groups" has a second "Answer: yes" — the answer on line 6 is kept; keep one answer');
  model = parse(`${complete('groups')}\n  answer: yes\n  answer: no`);
  one(model, 'conflicting-answers', 7, 'parse', 'line 7: decision "groups" has both "Answer: yes" and "Answer: no" — no answer is used; keep one answer');

  model = parse('title: x\ndate: 10/08/2026');
  one(model, 'invalid-date', 2, 'parse', 'line 2: date "10/08/2026" is not valid — use YYYY-MM-DD or "off"; date ignored');
  model = parse('title: x\ndate: off\ntoday: 2026-02-30');
  one(model, 'invalid-today', 3, 'parse', 'line 3: today "2026-02-30" is not a valid date — use YYYY-MM-DD; date ignored');
  model = parse('decision groups:\n  question: q\n  signal: s\n  owner: o\n  answer-by: 2026-02-30');
  one(model, 'invalid-due-date', 5, 'parse', 'line 5: answer-by "2026-02-30" is not a valid date — use YYYY-MM-DD; due date ignored');
  model = parse(`${complete('groups')}\n  answer: yes 15-12-2026`);
  one(model, 'invalid-answer-date', 6, 'parse', 'line 6: answer date "15-12-2026" is not valid — use YYYY-MM-DD; answer date ignored');
  model = parse(`${complete('groups')}\n  answer: maybe`);
  one(model, 'invalid-answer-value', 6, 'parse', 'line 6: answer "maybe" is not valid — use "yes" or "no"; answer ignored');
  model = parse(`${complete('groups')}\n  assume: yes 15-12-2026`);
  one(model, 'invalid-assumption-date', 6, 'parse', 'line 6: assumption date "15-12-2026" is not valid — use YYYY-MM-DD; assumption ignored');

  model = parse(`${complete('groups')}\nNOW\n  Core: Bad [if groups not]`);
  one(model, 'malformed-condition', 7, 'parse', 'line 7: condition "[if groups not]" cannot be read — use "[if groups]" or "[if not groups]"; item labelled "Condition needs fixing"');
  model = parse(`${complete('groups')}\n${complete('pricing')}\n${complete('reminders')}\nNOW\n  Core: Bad [if groups and pricing or reminders]`);
  one(model, 'mixed-condition', 17, 'parse', 'line 17: condition "[if groups and pricing or reminders]" mixes "and" and "or" — use one operator, or split this into two items; item labelled "Condition needs fixing"');
  model = parse('NOW\n  Core: A [planned]');
  one(model, 'unknown-item-tag', 2, 'parse', 'line 2: unknown tag "[planned]" — tag ignored; use done / doing / risk / blocked');
  model = parse('NOW\n  Core: A [doing] [blocked]');
  one(model, 'duplicate-status', 2, 'parse', 'line 2: both "[doing]" and "[blocked]" are present — "[blocked]" is used because it appears last; keep one status');
  model = parse(`${complete('groups')}\n${complete('pricing')}\nNOW\n  Core: A [if groups] [if pricing]`);
  one(model, 'duplicate-condition', 12, 'parse', 'line 12: second condition "[if pricing]" ignored — "[if groups]" appears first; keep one condition');
  model = parse('Later\n  Core: A\nLater');
  one(model, 'duplicate-period', 3, 'parse', 'line 3: period "Later" already appears on line 1 — items below continue in the existing "Later" period; keep one heading');
  model = parse('Later\ndecision later work');
  one(model, 'invalid-period-heading', 2, 'parse', 'line 2: "decision later work" cannot be used as a period heading — kept as an item in "Later"; use a heading that does not begin with "decision"');
  model = parse('Later\ndecisionx:');
  one(model, 'invalid-decision-heading', 2, 'parse', 'line 2: "decisionx:" is not a valid decision heading — use one word with letters, numbers or hyphens, such as "decision coach-pricing:"');
  model = parse('style: banana');
  one(model, 'invalid-style', 1, 'parse', 'line 1: style "banana" is not valid — use "tree" or "plans"; style read as "tree"');
  model = parse('Later\n  title: Research');
  one(model, 'setting-in-item-position', 2, 'parse', 'line 2: "title: Research" read as the title setting, not an item in a lane called "title" — move settings above the first period, or rename the lane');
  model = parse('Later\n  Research follow-up');
  one(model, 'unmatched-line', 2, 'parse', 'line 2: "Research follow-up" cannot be read as a setting, decision or period — kept as an item in "Later"; use "Lane: Title" for an item');
});

test('warning dedupe suppresses a diagnostic genuinely emitted twice with one key', () => {
  const model = parse('NOW\n  Core: A [planned] [planned]');
  const warnings = model.warnings.filter(w => w.code === 'unknown-item-tag');
  assert.equal(warnings.length, 1);
  assert.deepEqual({code:warnings[0].code, line:warnings[0].line, subject:warnings[0].subject},
    {code:'unknown-item-tag', line:2, subject:'planned'});
});

test('every build warning has its owning phase, exact source line and dedupe key', () => {
  let model = parse(`${complete('groups')}\n${complete('groups')}`);
  one(model, 'duplicate-decision', 6, 'build', 'line 6: decision "groups" is already declared on line 1 — second declaration ignored; keep one declaration');
  model = parse('decision groups:');
  one(model, 'missing-question', 1, 'build', 'line 1: decision "groups" has no question — add "question:" below its heading');
  one(model, 'missing-signal', 1, 'build', 'line 1: decision "groups" has no signal — add "signal:" to say what would answer it');
  one(model, 'missing-owner', 1, 'build', 'line 1: decision "groups" has no owner — add "owner:" to say who will answer it');
  one(model, 'missing-due-date', 1, 'build', 'line 1: decision "groups" has no due date — add "answer-by:"');

  model = parse('NOW\n  Core: A [if group]\n' + complete('groups'));
  one(model, 'unknown-item-decision', 2, 'build', 'line 2: no decision named "group" — did you mean "groups"? Item labelled "Condition needs fixing"');
  model = parse(`${complete('pricing', '\n  when: group')}\n${complete('groups')}`);
  one(model, 'unknown-when-decision', 6, 'build', 'line 6: no decision named "group" — "pricing" is labelled "Condition needs fixing"; correct the name');
  model = parse('NOW\n  Core: A [if groups]\n' + complete('groups'));
  one(model, 'decision-after-use', 2, 'build', 'line 2: "groups" is used before its declaration on line 3 — move the decision above this item');
  model = parse(`${complete('groups', '\n  when: pricing')}\n${complete('pricing', '\n  when: groups')}`);
  one(model, 'when-cycle', 1, 'build', 'lines 1 and 7: "groups" and "pricing" depend on each other — neither question can open; remove one "when:" dependency');
  model = parse(complete('groups'));
  one(model, 'unused-decision', 1, 'build', 'line 1: nothing depends on decision "groups" — use it in an item condition or remove it');
});

test('every project warning has its owning phase, exact source line and dedupe key', () => {
  let model = evaluate(parse(`${complete('groups', '\n  assume: yes 2026-12-01')}\nNOW\n  Core: A [if groups]`), '2026-12-15');
  one(model, 'assumption-before-due', 6, 'project', 'line 6: the assumption for "groups" is not used yet — the answer is due 15 December; remove the assumption or change its date');
  model = evaluate(parse('decision groups:\n  question: q\n  signal: s\n  owner: o\n  assume: yes 2026-12-01\nNOW\n  Core: A [if groups]'), '2026-12-20');
  one(model, 'assumption-no-due', 5, 'project', 'line 5: the assumption for "groups" has no start date — add a valid "answer-by:"; assumption not used');

  model = evaluate(parse(`${complete('groups')}\n${complete('pricing', '\n  when: groups\n  assume: yes 2026-12-20')}\nNOW\n  Core: A [if pricing]`), '2026-12-22');
  one(model, 'assumption-dormant', 12, 'project', 'line 12: assumption not used because "pricing" is not open yet — remove it, or wait until the question opens');
  model = evaluate(parse(`${complete('groups', '\n  answer: no')}\n${complete('pricing', '\n  when: groups\n  assume: yes 2026-12-20')}\nNOW\n  Core: A [if pricing]`), '2026-12-22');
  one(model, 'assumption-moot', 13, 'project', 'line 13: assumption not used — Pricing did not apply because Groups was no; remove the assumption');
  model = evaluate(parse(`${complete('groups', '\n  answer: yes\n  assume: no 2026-12-20')}\nNOW\n  Core: A [if groups]`), '2026-12-22');
  one(model, 'assumption-answered', 7, 'project', 'line 7: assumption not used because "groups" already has "Answer: yes" — remove the assumption');

  model = evaluate(parse(`${complete('groups')}\n${complete('pricing', '\n  when: groups\n  answer: yes')}\nNOW\n  Core: A [if pricing]`), '2026-12-22');
  one(model, 'answer-dormant', 12, 'project', 'line 12: the answer for "pricing" is kept, but is not used until this question opens');
  model = evaluate(parse(`${complete('groups', '\n  answer: no')}\n${complete('pricing', '\n  when: groups\n  answer: yes')}\nNOW\n  Core: A [if pricing]`), '2026-12-22');
  one(model, 'answer-moot', 13, 'project', 'line 13: the answer for "pricing" is kept, but is not used — Pricing did not apply because Groups was no; remove the answer if it is no longer useful');
  model = evaluate(parse(`${complete('groups', '\n  answer: no')}\nNOW\n  Core: Group challenges [if groups] [done]`), '2026-12-22');
  one(model, 'done-false-condition', 8, 'project', 'line 8: completed item "Group challenges" is labelled "Not needed" — kept because "[done]" records work already finished; remove the condition if the item was unconditional');

  const blocks = Array.from({length:7}, (_, i) => complete(`q${i}`));
  model = enumeratePlans(parse(`${blocks.join('\n')}\nNOW\n  Core: A [if q0]`), '2026-12-22');
  one(model, 'possible-plan-refusal', null, 'project', 'Seven open questions would make 128 possible plans. Answer one, or use the Tree view.');
  const url = oversizedUrlWarning();
  assert.deepEqual(url, {phase:'project', code:'oversized-url-state', line:null, subject:'url-state',
    message:'This plan is too large to store in the URL — shorten notes or remove unused items before sharing it.'});
});
