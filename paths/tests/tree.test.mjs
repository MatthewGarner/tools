import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {treeProjection} from '../tree.js';

const decision = (name, fields = '', due = '2026-12-15') =>
  `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner\n  answer-by: ${due}${fields}`;

const titles = items => items.map(item => item.title);
const treeFor = (document, today) => treeProjection(project(parse(document), today));

test('an item with no condition is on the spine and nowhere else', () => {
  const tree = treeFor(`${decision('fork')}\nNOW\n  Core: Shared\n  Core: Branch [if fork]`, '2026-12-01');
  assert.deepEqual(titles(tree.spine), ['Shared']);
  assert.deepEqual(titles(tree.questions[0].arms.yes), ['Branch']);
  assert.equal(tree.questions.flatMap(question => [...question.arms.yes, ...question.arms.no])
    .some(item => item.title === 'Shared'), false);
});

test('a compound item appears once under its engine parent and keeps its secondary dependencies', () => {
  const tree = treeFor(`${decision('early', '', '2026-12-10')}\n${decision('late', '', '2026-12-20')}\nNOW\n  Core: Compound [if early and late]`, '2026-12-01');
  const memberships = tree.questions.flatMap(question => ['yes', 'no'].flatMap(side =>
    question.arms[side].filter(item => item.title === 'Compound').map(item => ({question:question.key, side, item}))));
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].question, 'late');
  assert.equal(memberships[0].side, 'yes');
  assert.deepEqual(memberships[0].item.secondaryDependencies, ['early']);
});

test('an answered question continues chosen work on the spine and collapses its rejected arm', () => {
  const tree = treeFor(`${decision('fork', '\n  answer: yes')}\nNOW\n  Core: Chosen [if fork]\n  Core: Fallback [unless fork]`, '2026-12-20');
  const question = tree.questions[0];
  assert.deepEqual(question.arms, {yes:[], no:[]});
  assert.deepEqual(titles(question.continuation), ['Chosen']);
  assert.deepEqual({side:question.stump.side, count:question.stump.count,
    titles:titles(question.stump.items)}, {side:'no', count:1, titles:['Fallback']});
});

test('a question with no dependent items retains two explicit empty arms', () => {
  const question = treeFor(decision('unused'), '2026-12-01').questions[0];
  assert.deepEqual(question.arms, {yes:[], no:[]});
  assert.equal(question.stump, null);
});

test('an answered rejected arm creates a stump even when the chosen continuation is empty', () => {
  const question = treeFor(`${decision('fork', '\n  answer: yes')}\nNOW\n  Core: Fallback [unless fork]`, '2026-12-20').questions[0];
  assert.deepEqual(question.arms, {yes:[], no:[]});
  assert.equal(question.stump.count, 1);
});

test('an answered question never creates an empty rejected-arm stump', () => {
  const question = treeFor(`${decision('fork', '\n  answer: yes')}\nNOW\n  Core: Chosen [if fork]`, '2026-12-20').questions[0];
  assert.deepEqual(titles(question.continuation), ['Chosen']);
  assert.equal(question.stump, null);
});

test('completed work rejected by the answer remains included and is excluded from the stump count', () => {
  const question = treeFor(`${decision('fork', '\n  answer: yes')}\nNOW\n` +
    '  Core: Already shipped [unless fork] [done]\n  Core: Unbuilt fallback [unless fork]', '2026-12-20').questions[0];
  assert.deepEqual(titles(question.continuation), []);
  assert.deepEqual(titles(question.arms.no), ['Already shipped']);
  assert.equal(question.arms.no[0].itemState, 'in-plan');
  assert.deepEqual({count:question.stump.count, titles:titles(question.stump.items)},
    {count:1, titles:['Unbuilt fallback']});
});

test('an answered parent retains waiting compound work on its selected continuation', () => {
  const tree = treeFor(`${decision('approved', '\n  answer: yes', '2026-12-31')}\n` +
    `${decision('research', '', '2026-12-01')}\nNOW\n` +
    '  Core: Launch after both [if approved and research]', '2026-12-20');
  const approved = tree.questions.find(question => question.key === 'approved');
  assert.deepEqual(titles(approved.continuation), ['Launch after both']);
  assert.equal(approved.continuation[0].itemState, 'waiting');
  assert.deepEqual(approved.continuation[0].displayEvidence,
    {kind:'pending-answer', decision:'research'});
  assert.equal(approved.stump, null);
});

test('identical due dates and source lines retain deterministic document order', () => {
  const model = parse(`${decision('first')}\n${decision('second')}`);
  model.decisions[1].srcLine = model.decisions[0].srcLine;
  const keys = treeProjection(project(model, '2026-12-01')).questions.map(question => question.key);
  assert.deepEqual(keys, ['first', 'second']);
});

test('a dormant chain two levels deep remains complete and exposes non-engine display states', () => {
  const tree = treeFor(`${decision('host')}\n${decision('child', '\n  when: host')}\n${decision('grandchild', '\n  when: child')}\nNOW\n  Core: End [if grandchild]`, '2026-12-01');
  assert.deepEqual(tree.questions.map(question => question.key), ['host', 'child', 'grandchild']);
  assert.deepEqual(tree.questions.map(question => question.displayState),
    [{kind:'open'}, {kind:'not-open'}, {kind:'not-open'}]);
  assert.deepEqual(titles(tree.unplaced), ['End']);
});

test('a question that no longer applies is included with a renderer-neutral state', () => {
  const tree = treeFor(`${decision('host', '\n  answer: no')}\n${decision('child', '\n  when: host')}`, '2026-12-20');
  const child = tree.questions.find(question => question.key === 'child');
  assert.deepEqual(child.displayState, {kind:'not-applicable'});
});

test('an invalid condition stays visible as unplaced and retains its soft warning', () => {
  const tree = treeFor(`${decision('a')}\n${decision('b')}\nNOW\n  Core: Broken [if a and b or a]`, '2026-12-01');
  assert.deepEqual(titles(tree.unplaced), ['Broken']);
  assert.ok(tree.warnings.some(warning => warning.code === 'mixed-condition'));
});

test('zero items is a total projection with every question still present', () => {
  const tree = treeFor(decision('empty'), '2026-12-01');
  assert.deepEqual(tree.spine, []);
  assert.deepEqual(tree.unplaced, []);
  assert.equal(tree.questions.length, 1);
});

test('one unconditional item and no questions projects only the spine', () => {
  const tree = treeFor('NOW\n  Core: Only work', '2026-12-01');
  assert.deepEqual(titles(tree.spine), ['Only work']);
  assert.deepEqual(tree.questions, []);
  assert.deepEqual(tree.breadcrumbs, []);
  assert.equal(tree.terminal, null);
});

test('a fully answered real document has no open-plan terminal', () => {
  const tree = treeFor(`${decision('settled', '\n  answer: yes')}\nNOW\n` +
    '  Core: Chosen [if settled]\n  Core: Rejected [unless settled]', '2026-12-20');
  assert.deepEqual(tree.questions.map(question => question.displayState),
    [{kind:'answered', direction:'yes'}]);
  assert.equal(tree.terminal, null);
});

test('seven open questions project fully despite possible-plan refusal', () => {
  const decisions = Array.from({length:7}, (_, index) => decision(`q${index}`));
  const tree = treeFor(`${decisions.join('\n')}\nNOW\n  Core: Shared\n  Core: Branch [if q6]`, '2026-12-01');
  assert.equal(tree.questions.length, 7);
  assert.deepEqual(titles(tree.spine), ['Shared']);
  assert.deepEqual(titles(tree.questions[6].arms.yes), ['Branch']);
  assert.ok(tree.warnings.some(warning => warning.code === 'possible-plan-refusal'));
});

test('the terminal states the remaining possible-plan count from projected worlds', () => {
  const tree = treeFor(`${decision('a')}\n${decision('b')}`, '2026-12-01');
  assert.deepEqual(tree.terminal, {kind:'count', possibleCount:4});
});

test('the terminal exposes the enumeration limit without dropping Tree questions', () => {
  const decisions = Array.from({length:7}, (_, index) => decision(`q${index}`));
  const tree = treeFor(decisions.join('\n'), '2026-12-01');
  assert.deepEqual(tree.terminal, {
    kind:'limit',
    openQuestionCount:7,
    possibleCount:128,
    reason:'Seven open questions would make 128 possible plans. Answer one, or use the Tree view.',
  });
  assert.equal(tree.questions.length, 7);
});

test('an item naming an answered question continues after its diamond, not on the shared spine', () => {
  const tree = treeFor(`${decision('fork', '\n  answer: yes')}\nNOW\n  Core: Conditional [if fork]`, '2026-12-20');
  assert.deepEqual(tree.spine, []);
  assert.deepEqual(tree.questions[0].arms, {yes:[], no:[]});
  assert.deepEqual(titles(tree.questions[0].continuation), ['Conditional']);
  assert.deepEqual(tree.questions[0].displayState, {kind:'answered', direction:'yes'});
});

test('an overdue display state carries data, not renderer copy', () => {
  const tree = treeFor(`${decision('late')}\nNOW\n  Core: Conditional [if late]`, '2026-12-22');
  assert.deepEqual(tree.questions[0].displayState, {kind:'overdue', days:7});
});

test('breadcrumbs contain effective answers oldest-due first and leave collapse quantity to layout', () => {
  const tree = treeFor(`${decision('later', '\n  answer: no', '2026-12-20')}\n${decision('earlier', '\n  answer: yes', '2026-12-10')}\n${decision('open', '', '2026-12-01')}`, '2026-12-22');
  assert.deepEqual(tree.breadcrumbs.map(crumb => ({key:crumb.key, direction:crumb.direction})), [
    {key:'earlier', direction:'yes'}, {key:'later', direction:'no'},
  ]);
});

test('answered breadcrumbs retain continuation, rejected completed work, and the not-needed stump', () => {
  const tree = treeFor(`${decision('fork', '\n  answer: yes')}\nNOW\n` +
    '  Core: Chosen [if fork]\n  Core: Done fallback [unless fork] [done]\n' +
    '  Core: Unbuilt fallback [unless fork]', '2026-12-20');
  const crumb = tree.breadcrumbs[0];
  assert.deepEqual(titles(crumb.continuation), ['Chosen']);
  assert.deepEqual(titles(crumb.arms.no), ['Done fallback']);
  assert.deepEqual(titles(crumb.stump.items), ['Unbuilt fallback']);
});
