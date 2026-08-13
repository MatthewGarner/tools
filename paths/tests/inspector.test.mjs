import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {treeProjection} from '../tree.js';
import {auditableAnswerDraft, decisionEditSurface, decisionInspectorData,
  inspectorEditSurfaceMarkup, resolveSelectedDecision} from '../inspector.js';

const doc = `decision host:
  question: Is the host open?
  signal: host experiment
  reading: 42%
  learn: Run the host evidence move
  enough: Yes at 60%; no below 30%; otherwise stay open
  owner: Core
  answer-by: 2026-09-01
  assume: yes 2026-09-02
decision child:
  question: Is the child useful?
  answer-by: 2026-09-10
  when: host
NOW
  Core: Child work [if child]`;

test('selection resolves exact heading identity and follows the same key after line shifts', () => {
  const first = project(parse(doc), '2026-08-20');
  assert.equal(resolveSelectedDecision(first, {key:'child', srcLine:7}).name, 'child');
  const shifted = project(parse('// inserted\n' + doc), '2026-08-20');
  const resolved = resolveSelectedDecision(shifted, {key:'child', srcLine:7});
  assert.equal(resolved.key, 'child');
  assert.equal(resolved.srcLine, 10);
  assert.equal(resolveSelectedDecision(shifted, {key:'missing', srcLine:7}), null);
  assert.equal(resolveSelectedDecision(null, {key:'child', srcLine:7}), null);
});

test('inspector data retains authored source fields and reports active/testable state', () => {
  const topology = treeProjection(project(parse(doc), '2026-08-20'));
  const data = decisionInspectorData(topology.questions.find(question => question.key === 'host'));
  assert.deepEqual(data, {
    key:'host', name:'host', srcLine:0,
    question:'Is the host open?', signal:'host experiment', reading:'42%',
    learn:'Run the host evidence move', enough:'Yes at 60%; no below 30%; otherwise stay open', owner:'Core',
    answerBy:'2026-09-01', answer:'', assumption:'yes 2026-09-02', when:'',
    availability:{kind:'active', label:'Available now'},
    testability:{kind:'testable', label:'Testable', missing:[]},
    answerNotice:'', answerActionsEnabled:true,
    arms:{yes:[], no:[]},
  });
});

test('dormant and incomplete decisions expose availability and precise testability gaps', () => {
  const topology = treeProjection(project(parse(doc), '2026-08-20'));
  const data = decisionInspectorData(topology.questions.find(question => question.key === 'child'));
  assert.deepEqual(data.availability, {kind:'dormant', label:'Not open yet'});
  assert.deepEqual(data.testability,
    {kind:'untestable', label:'Needs signal + owner', missing:['signal', 'owner']});
  assert.equal(data.when, 'host');
});

test('answer receipt uses the authored answer raw value, including a conflicting first answer', () => {
  const answered = treeProjection(project(parse(doc.replace('  assume: yes 2026-09-02',
    '  answer: yes 2026-08-18 -- experiment H-42')), '2026-08-20')).questions[0];
  assert.equal(decisionInspectorData(answered).answer, 'yes 2026-08-18 -- experiment H-42');

  const conflict = project(parse(doc.replace('  assume: yes 2026-09-02',
    '  answer: yes 2026-08-18 -- first\n  answer: no 2026-08-19 -- second')),
  '2026-08-20');
  assert.equal(conflict.decisionByName.host.answer, null);
  const conflictQuestion = treeProjection(conflict).questions.find(question => question.key === 'host');
  assert.equal(decisionInspectorData(conflictQuestion).answer, 'yes 2026-08-18 -- first');
});

test('testability names every missing requirement including answer-by', () => {
  const source = `decision x:\n  question: X?\nNOW\n  Core: Work [if x]`;
  const question = treeProjection(project(parse(source), '2026-08-20')).questions[0];
  assert.deepEqual(decisionInspectorData(question).testability, {
    kind:'untestable', label:'Needs signal + owner + due date',
    missing:['signal', 'owner', 'answer-by'],
  });
});

test('inspector arms come from real topology with title, status and treatment, including empty arms', () => {
  const source = `decision groups:\n  question: Groups?\n  signal: experiment\n  owner: Growth\n  answer-by: 2026-09-01\nNOW\n  Core: Shared\n  Growth: Invite [doing] [if groups]\n  Growth: Manual [blocked] [unless groups]`;
  const question = treeProjection(project(parse(source), '2026-08-20')).questions[0];
  assert.deepEqual(decisionInspectorData(question).arms, {
    yes:[{title:'Invite', status:'doing', treatment:'Waiting'}],
    no:[{title:'Manual', status:'blocked', treatment:'Waiting'}],
  });
  const empty = treeProjection(project(parse(source.replace(/\n  Growth: Invite[\s\S]*/, '')),
    '2026-08-20')).questions[0];
  assert.deepEqual(decisionInspectorData(empty).arms, {yes:[], no:[]});
});

test('held and moot authored answers explain why they are not active and disable answer actions', () => {
  const heldDoc = `decision host:\n  question: Host?\n  signal: test\n  owner: Core\n  answer-by: 2026-09-01\n` +
    `decision child:\n  question: Child?\n  signal: test\n  owner: Core\n  answer-by: 2026-09-02\n  when: host\n  answer: yes 2026-08-20 -- held receipt\n` +
    `NOW\n  Core: Child work [if child]`;
  const heldProjection = project(parse(heldDoc), '2026-08-20');
  const held = decisionInspectorData(treeProjection(heldProjection).questions.find(q => q.key === 'child'));
  assert.equal(held.availability.kind, 'dormant');
  assert.equal(held.answerNotice, 'Answer kept, but not used until this question opens.');
  assert.equal(held.answerActionsEnabled, false);

  const mootProjection = project(parse(heldDoc.replace('  answer-by: 2026-09-01\n',
    '  answer-by: 2026-09-01\n  answer: no 2026-08-19 -- host receipt\n')), '2026-08-20');
  const moot = decisionInspectorData(treeProjection(mootProjection).questions.find(q => q.key === 'child'));
  assert.equal(moot.availability.kind, 'moot');
  assert.equal(moot.answerNotice,
    'Answer kept, but not used because host resolved no; this question did not apply.');
  assert.equal(moot.answerActionsEnabled, false);
});

test('answer action drafts are dated, preserve audit metadata, and never produce a bare answer', () => {
  const active = project(parse(doc), '2026-08-20').decisionByName.host;
  assert.equal(auditableAnswerDraft(active, 'no', '2026-08-20'), 'no 2026-08-20 -- ');
  const answered = project(parse(doc.replace('  assume: yes 2026-09-02',
    '  answer: yes 2026-08-18 target: 20% actual: 22% -- cohort 42')),
  '2026-08-20').decisionByName.host;
  assert.equal(auditableAnswerDraft(answered, 'no', '2026-08-20'),
    'no 2026-08-18 target: 20% actual: 22% -- cohort 42');
});

test('selected inspector edit surface is the app/meta-test contract with ten safe kinds', () => {
  const question = treeProjection(project(parse(doc), '2026-08-20')).questions[0];
  const surface = decisionEditSurface(question);
  assert.deepEqual(surface.fields.map(field => field.kind),
    ['question', 'signal', 'reading', 'learn', 'enough', 'owner', 'answer-by', 'assume', 'when', 'answer']);
  const hostile = treeProjection(project(parse(doc.replace('host experiment', 'host & <signal>')),
    '2026-08-20')).questions[0];
  const markup = inspectorEditSurfaceMarkup(hostile);
  assert.equal((markup.match(/data-edit=/g) || []).length, 10);
  assert.match(markup, /data-raw="host &amp; &lt;signal&gt;"/);
  assert.doesNotMatch(markup, /data-raw="host & <signal>"/);
  assert.equal(inspectorEditSurfaceMarkup(null), '');
});
