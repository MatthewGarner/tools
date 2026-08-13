import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse as parsePaths} from '../parse.js';
import {evaluate} from '../evaluate.js';
import {enumeratePlans} from '../plans.js';
import {assignmentKey, buildRoadmapProjection, deliveryAssignment, inspectRoadmapProjection,
  projectionAcceptance, roadmapProjectionChoices, roadmapProjectionWorlds} from '../handoff-roadmap.js';
import {parse as parseRoadmap} from '../../roadmap/parse.js';

const decision = (name, fields = '') => `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner\n  answer-by: 2026-08-10${fields}`;
const doc = (head, items) => parsePaths(`${head}\nNow\n${items.now || ''}\nNext\n${items.next || ''}\nLater\n${items.later || ''}`);
const acceptance = inspected => projectionAcceptance(inspected);
const codes = result => result.code;

test('assignment keys are canonical and reject malformed maps', () => {
  assert.equal(assignmentKey({B:'no', a:'yes'}), 'a=yes&b=no');
  assert.equal(assignmentKey({a:'won'}), null);
  assert.equal(assignmentKey({a:'YES'}), null, 'directions are canonical world data, not free text');
  assert.equal(assignmentKey(null), null);
});

test('a non-first assignment inside a merged Possible Plan becomes its own exact Roadmap', () => {
  const source = doc(`title: Habitat\npalette: plum\naccent: #445566\n${decision('x')}\n${decision('y')}`, {
    now:'  Core: Shared',
    next:'  Growth: Either route [risk] [if x or y] -- Preserve this note -> https://example.test/either',
    later:'  Growth: Neither route [if not x and not y]',
  });
  const merged = enumeratePlans(source, '2026-08-12').worlds.plans.find(plan => plan.covers === 3);
  const answers = {x:'no', y:'yes'};
  assert.ok(merged.assignments.some((entry, index) => index > 0 && assignmentKey(entry.answers) === assignmentKey(answers)),
    'fixture selects a non-first exact member of a merged card');

  const inspected = inspectRoadmapProjection(source, '2026-08-12', answers);
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.receipt.assumed, [
    {key:'x', direction:'no', date:'2026-08-12'},
    {key:'y', direction:'yes', date:'2026-08-12'},
  ]);
  assert.equal(Object.hasOwn(inspected, 'text'), false, 'inspection cannot accidentally generate a target');

  const built = buildRoadmapProjection(source, '2026-08-12', answers, acceptance(inspected));
  assert.equal(built.ok, true);
  assert.doesNotMatch(built.text, /\[(?:if|unless)\b|\[bet:/i);
  const target = parseRoadmap(built.text);
  assert.equal(target.title, 'Habitat — delivery projection');
  assert.equal(target.dateStr, '2026-08-12');
  assert.equal(target.wip, 0);
  assert.equal(target.palette, 'plum');
  assert.equal(target.accent, '#445566');
  assert.deepEqual(target.basis, {
    source:'Habitat', answered:[], assumed:[
      {key:'x', direction:'no', date:'2026-08-12'},
      {key:'y', direction:'yes', date:'2026-08-12'},
    ], srcLine:3,
  });
  assert.deepEqual(target.items.map(item => ({h:item.h, lane:item.lane, title:item.title,
    status:item.status, note:item.note, url:item.url})), [
    {h:0, lane:'Core', title:'Shared', status:null, note:'', url:null},
    {h:1, lane:'Growth', title:'Either route', status:'risk', note:'Preserve this note', url:'https://example.test/either'},
  ]);
  assert.equal(target.warnings.length, 0, built.text);
});

test('delivery projection omits Paths learning contracts with the rest of the decision model', () => {
  const source = doc(`title: Contract boundary\n${decision('x', '\n  learn: Interview 12 customers\n  enough: Yes at 8 of 12; no at 3 or fewer')}`, {
    now:'  Core: Shared', next:'  Growth: Expansion [if x]', later:'  Growth: Alternative [unless x]',
  });
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {x:'yes'});
  const built = buildRoadmapProjection(source, '2026-08-12', {x:'yes'}, acceptance(inspected));
  assert.equal(built.ok, true);
  assert.doesNotMatch(built.text, /(?:learn|enough):|Interview 12|8 of 12/);
});

test('Known comes only from a source answer; injected and authored assumptions remain Assumed', () => {
  const source = doc(`title: Classification\n${decision('priced', '\n  answer: yes 2026-08-03')}\n${decision('groups', '\n  assume: no 2026-08-11')}`, {
    now:'  Core: Foundation', next:'  Growth: Combined [if priced and groups]', later:'',
  });
  const answers = {groups:'no'};
  const mechanical = evaluate(source, '2026-08-12', answers);
  assert.deepEqual([...mechanical.decisionByName.groups.provenance], ['answered'],
    'the evaluator mechanically labels injected arms as answered');

  const inspected = inspectRoadmapProjection(source, '2026-08-12', answers);
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.receipt.known, [{key:'priced', direction:'yes', date:'2026-08-03'}]);
  assert.deepEqual(inspected.receipt.assumed, [{key:'groups', direction:'no', date:'2026-08-12'}]);
  const target = parseRoadmap(buildRoadmapProjection(source, '2026-08-12', answers, acceptance(inspected)).text);
  assert.deepEqual(target.basis.answered, inspected.receipt.known);
  assert.deepEqual(target.basis.assumed, inspected.receipt.assumed);
});

test('moot decisions are omitted while their active when-ancestry stays in the receipt', () => {
  const source = doc(`title: Chain\n${decision('host')}\n${decision('child', '\n  when: host')}`, {
    now:'  Core: Base', next:'  Growth: Child route [if child]', later:'',
  });
  const answers = {host:'no', child:'yes'};
  const inspected = inspectRoadmapProjection(source, '2026-08-12', answers);
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.receipt.assumed, [{key:'host', direction:'no', date:'2026-08-12'}]);
  assert.deepEqual(inspected.receipt.omitted, [{
    key:'child', name:'child', availability:'moot',
    reason:{kind:'moot', hostKey:'host', host:'host', direction:'no'},
  }]);
  const target = parseRoadmap(buildRoadmapProjection(source, '2026-08-12', answers, acceptance(inspected)).text);
  assert.deepEqual(target.basis.assumed, inspected.receipt.assumed);
  assert.deepEqual(target.items.map(item => item.title), ['Base']);
});

test('done false-branch history stays and conditions disappear from the target', () => {
  const source = doc(`title: History\n${decision('launch')}`, {
    now:'  Core: Historical fallback [done] [unless launch]',
    next:'  Core: Expansion [if launch]', later:'',
  });
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {launch:'yes'});
  const built = buildRoadmapProjection(source, '2026-08-12', {launch:'yes'}, acceptance(inspected));
  assert.equal(built.ok, true);
  const target = parseRoadmap(built.text);
  assert.deepEqual(target.items.map(item => ({title:item.title, status:item.status, cond:item.cond})), [
    {title:'Historical fallback', status:'done', cond:null},
    {title:'Expansion', status:null, cond:null},
  ]);
});

test('AND/OR semantics and duplicate occurrences survive as selected work, not merged identities', () => {
  const source = doc(`title: Occurrences\n${decision('a')}\n${decision('b')}`, {
    now:'  Core: Repeat [if a and b]\n  Core: Repeat [if a or b]',
    next:'  Core: Repeat [unless a]', later:'  Core: Always',
  });
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {a:'yes', b:'no'});
  assert.equal(inspected.ok, true);
  const target = parseRoadmap(buildRoadmapProjection(source, '2026-08-12', {a:'yes', b:'no'}, acceptance(inspected)).text);
  assert.deepEqual(target.items.map(item => item.title), ['Repeat', 'Always']);
  assert.deepEqual(target.items.map(item => item.h), [0, 2]);
});

test('assumptions require an exact current acceptance ledger', () => {
  const source = doc(`title: Confirmation\n${decision('x')}\n${decision('y')}`, {
    now:'  Core: Work [if x or y]', next:'', later:'',
  });
  const answers = {x:'yes', y:'no'};
  const inspected = inspectRoadmapProjection(source, '2026-08-12', answers);
  assert.equal(inspected.ok, true);
  assert.equal(buildRoadmapProjection(source, '2026-08-12', answers).code, 'assumptions-not-accepted');
  assert.equal(buildRoadmapProjection(source, '2026-08-12', answers, true).code, 'assumptions-not-accepted');
  assert.equal(buildRoadmapProjection(source, '2026-08-12', answers, [{key:'x', direction:'yes'}]).code,
    'assumptions-not-accepted');
  assert.equal(buildRoadmapProjection(source, '2026-08-12', answers,
    {assignmentKey:inspected.assignmentKey, date:inspected.receipt.date,
      assumed:[{key:'x', direction:'yes'}, {key:'y', direction:'yes'}]}).code, 'assumptions-not-accepted');
  assert.equal(buildRoadmapProjection(source, '2026-08-12', answers, acceptance(inspected)).ok, true);
});

test('stale, malformed and non-enumerable assignments refuse with no partial output', () => {
  const source = doc(`title: Exact\n${decision('x')}`, {now:'  Core: Work [if x]', next:'', later:''});
  for(const [answers, code] of [[{x:'won'}, 'invalid-assignment'], [{x:'yes', stale:'no'}, 'stale-assignment'], [{}, 'stale-assignment']]){
    const result = inspectRoadmapProjection(source, '2026-08-12', answers);
    assert.equal(result.code, code);
    assert.equal(Object.hasOwn(result, 'text'), false);
  }
});

test('unrelated open questions do not block an exact delivery projection', () => {
  const unused = Array.from({length:7}, (_, index) => decision(`unused${index}`)).join('\n');
  const source = doc(`title: Bounded scope\n${decision('delivery', '\n  answer: yes 2026-08-03')}\n${unused}`, {
    now:'  Core: Work [if delivery]', next:'', later:'',
  });
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {});
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.receipt.known, [{key:'delivery', direction:'yes', date:'2026-08-03'}]);
});

test('delivery assignment removes unrelated Possible Plans matrix arms', () => {
  const source = doc(`title: Scoped\n${decision('delivery')}\n${decision('unrelated')}`, {
    now:'  Core: Work [if delivery]', next:'', later:'',
  });
  assert.deepEqual(deliveryAssignment(source, {delivery:'yes', unrelated:'no'}), {delivery:'yes'});
  assert.equal(inspectRoadmapProjection(source, '2026-08-12', deliveryAssignment(source,
    {delivery:'yes', unrelated:'no'})).ok, true);
});

test('delivery-scoped worlds survive global Possible Plans refusal from unrelated questions', () => {
  const unrelated = Array.from({length:7}, (_, index) => decision(`unrelated${index}`)).join('\n');
  const source = doc(`title: Scoped worlds\n${decision('delivery')}\n${unrelated}`, {
    now:'  Core: Work [if delivery]', next:'  Core: Fallback [unless delivery]', later:'',
  });
  assert.equal(enumeratePlans(source, '2026-08-12').worlds.refused, true,
    'the full comparison matrix is deliberately over its six-question cap');
  const worlds = roadmapProjectionWorlds(source, '2026-08-12');
  assert.equal(worlds.ok, true);
  assert.deepEqual(worlds.assignments.map(entry => entry.answers), [{delivery:'yes'}, {delivery:'no'}]);
  assert.equal(roadmapProjectionChoices(source, '2026-08-12').choices.length, 2);
});

test('delivery worlds re-evaluate a mutable parsed model after an answer is authored', () => {
  const source = doc(`title: Mutable\n${decision('x')}`, {
    now:'  Core: Yes work [if x]', next:'  Core: No work [unless x]', later:'',
  });
  assert.deepEqual(roadmapProjectionWorlds(source, '2026-08-12').assignments.map(row => row.answers),
    [{x:'yes'}, {x:'no'}]);

  const answer = {direction:'yes', date:'2026-08-11', target:null, actual:null,
    receipt:'decision log', raw:'yes 2026-08-11 -- decision log', srcLine:6, valid:true};
  source.decisionByName.x.answer = answer;
  source.decisionByName.x.answers = [answer];
  const refreshed = roadmapProjectionWorlds(source, '2026-08-12');
  assert.equal(refreshed.ok, true);
  assert.deepEqual(refreshed.assignments.map(row => row.answers), [{}]);
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {});
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.receipt.known, [{key:'x', direction:'yes', date:'2026-08-11'}]);
});

test('UI-ready choices dedupe dormant child arms by effective receipt and output', () => {
  const source = doc(`title: Effective choices\n${decision('host')}\n${decision('child', '\n  when: host')}`, {
    now:'  Core: Child route [if child]', next:'  Core: Host fallback [unless host]', later:'',
  });
  const worlds = roadmapProjectionWorlds(source, '2026-08-12');
  assert.equal(worlds.ok, true);
  assert.equal(worlds.assignments.length, 4, 'mechanical enumeration retains the dormant child arm');
  const choices = roadmapProjectionChoices(source, '2026-08-12');
  assert.equal(choices.ok, true);
  assert.equal(choices.choices.length, 3, 'host=no child=yes/no becomes one effective delivery outcome');
  const hostNo = choices.choices.filter(choice => choice.inspected.ok &&
    choice.inspected.receipt.assumed.some(entry => entry.key === 'host' && entry.direction === 'no'));
  assert.equal(hostNo.length, 1);
  assert.equal(hostNo[0].inspected.receipt.omitted[0].key, 'child');
});

test('active written answers require an actual non-future date', () => {
  for(const [answer, code] of [['yes', 'missing-answer-date'], ['yes 2026-08-13', 'future-answer-date']]){
    const source = doc(`title: Dates\n${decision('x', `\n  answer: ${answer}`)}`, {
      now:'  Core: Work [if x]', next:'', later:'',
    });
    assert.equal(inspectRoadmapProjection(source, '2026-08-12', {}).code, code);
  }
});

test('a known-only world needs no empty acceptance ceremony', () => {
  const source = doc(`title: Known\n${decision('x', '\n  answer: yes 2026-08-03')}`, {
    now:'  Core: Work [if x]', next:'', later:'',
  });
  const built = buildRoadmapProjection(source, '2026-08-12', {});
  assert.equal(built.ok, true);
  assert.deepEqual(built.receipt.assumed, []);
});

test('assumption confirmation is bound to its exact world and projection date', () => {
  const source = doc(`title: Bound\n${decision('x')}`, {now:'  Core: Work [if x]', next:'', later:''});
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {x:'yes'});
  const confirmation = acceptance(inspected);
  assert.equal(buildRoadmapProjection(source, '2026-08-13', {x:'yes'}, confirmation).code, 'assumptions-not-accepted');
  assert.equal(buildRoadmapProjection(source, '2026-08-12', {x:'no'}, confirmation).code, 'assumptions-not-accepted');
});

test('assumption confirmation cannot survive a source change with the same world and date', () => {
  const source = doc(`title: Bound source\n${decision('x')}`, {now:'  Core: Work [if x]', next:'', later:''});
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {x:'yes'});
  const confirmation = acceptance(inspected);
  source.items[0].title = 'Renamed work';
  assert.equal(buildRoadmapProjection(source, '2026-08-12', {x:'yes'}, confirmation).code, 'assumptions-not-accepted');
});

test('assumption confirmation cannot survive any emitted Roadmap setting change', () => {
  const source = doc(`title: Bound settings\n${decision('x')}`, {now:'  Core: Work [if x]', next:'', later:''});
  const confirmation = acceptance(inspectRoadmapProjection(source, '2026-08-12', {x:'yes'}));
  source.palette = 'plum';
  assert.equal(buildRoadmapProjection(source, '2026-08-12', {x:'yes'}, confirmation).code, 'assumptions-not-accepted');
  source.palette = 'ocean';
  const fresh = acceptance(inspectRoadmapProjection(source, '2026-08-12', {x:'yes'}));
  source.periods[1].name = 'Soon';
  assert.equal(buildRoadmapProjection(source, '2026-08-12', {x:'yes'}, fresh).code, 'assumptions-not-accepted');
});

test('a current authored answer invalidates an old injected assignment', () => {
  const source = doc(`title: Freshness\n${decision('x')}`, {
    now:'  Core: Yes route [if x]\n  Core: No route [unless x]', next:'', later:'',
  });
  const first = inspectRoadmapProjection(source, '2026-08-12', {x:'yes'});
  assert.equal(first.ok, true);
  const answer = {direction:'no', date:'2026-08-11', target:null, actual:null, receipt:'', raw:'no 2026-08-11', srcLine:0, valid:true};
  source.decisionByName.x.answer = answer;
  source.decisions[0].answer = answer;
  assert.equal(inspectRoadmapProjection(source, '2026-08-12', {x:'yes'}).code, 'stale-assignment');
});

test('only the effective active delivery basis can be selected', () => {
  const source = doc(`title: Effective\n${decision('host', '\n  answer: no 2026-08-03')}\n${decision('child', '\n  when: host')}`, {
    now:'  Core: Work [unless child]', next:'', later:'',
  });
  assert.equal(inspectRoadmapProjection(source, '2026-08-12', {child:'yes'}).code, 'stale-assignment');
  assert.equal(inspectRoadmapProjection(source, '2026-08-12', {}).ok, true);
});

test('adversarial malformed authored directions and condition shapes fail closed', () => {
  const answerSource = doc(`title: Bad answer\n${decision('x')}`, {
    now:'  Core: Work [if x]', next:'', later:'',
  });
  const answer = {direction:'won', date:'2026-08-03', srcLine:0};
  answerSource.decisionByName.x.answer = answer;
  answerSource.decisions[0].answer = answer;
  answerSource.decisions[0].answers = [answer];
  assert.equal(inspectRoadmapProjection(answerSource, '2026-08-12', {}).code, 'invalid-authored-answer');

  const conditionSource = doc(`title: Bad condition\n${decision('x')}`, {
    now:'  Core: Work [if x]', next:'', later:'',
  });
  conditionSource.items[0].condition = {valid:true, operator:'or', terms:[]};
  assert.equal(inspectRoadmapProjection(conditionSource, '2026-08-12', {x:'yes'}).code, 'invalid-source-model');
});

test('a laneless title that Roadmap would read as a horizon refuses', () => {
  const source = parsePaths(`title: Header collision
${decision('x')}
Now
  Now [if x]
Next
Later`);
  assert.equal(inspectRoadmapProjection(source, '2026-08-12', {x:'yes'}).code, 'unsafe-item-text');
});

test('malformed, repeated and conflicting relevant authored answers never become assumptions', () => {
  const cases = [
    `${decision('x')}\n  answer: maybe 2026-08-03`,
    `${decision('x')}\n  answer: yes 2026-08-03\n  answer: yes 2026-08-04`,
    `${decision('x')}\n  answer: yes 2026-08-03\n  answer: no 2026-08-04`,
  ];
  for(const sourceDecision of cases){
    const source = doc(`title: Answer integrity\n${sourceDecision}`, {
      now:'  Core: Work [if x]', next:'', later:'',
    });
    const answers = source.decisionByName.x.answer?.direction ? {} : {x:'yes'};
    assert.equal(inspectRoadmapProjection(source, '2026-08-12', answers).code, 'invalid-authored-answer');
  }
});

test('invalid or unresolved delivery conditions refuse instead of dropping work', () => {
  const malformed = doc(`title: Invalid\n${decision('x')}`, {
    now:'  Core: Valid scope [if x]\n  Core: Work [if x and]', next:'', later:'',
  });
  assert.equal(inspectRoadmapProjection(malformed, '2026-08-12', {x:'yes'}).code, 'unresolved-item');

  const unknown = doc('title: Unknown', {now:'  Core: Work [if missing]', next:'', later:''});
  assert.equal(inspectRoadmapProjection(unknown, '2026-08-12', {}).code, 'invalid-source-model');
});

test('an ignored malformed extra condition on selected-out work does not block the exact world', () => {
  const source = doc(`title: Irrelevant warning\n${decision('x')}`, {
    now:'  Core: Included [if x]\n  Core: Dropped [unless x] [if x and]', next:'', later:'',
  });
  assert.ok(source.warnings.some(warning => warning.code === 'duplicate-condition'),
    'fixture carries a real malformed-extra-condition source warning');
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {x:'yes'});
  assert.equal(inspected.ok, true);
  const target = parseRoadmap(buildRoadmapProjection(source, '2026-08-12', {x:'yes'}, acceptance(inspected)).text);
  assert.deepEqual(target.items.map(item => item.title), ['Included']);
});

test('doing and blocked work cannot be projected into a world that drops it', () => {
  for(const status of ['doing', 'blocked']){
    const source = doc(`title: In flight\n${decision('x')}`, {
      now:`  Core: Started [${status}] [if x]`, next:'', later:'',
    });
    assert.equal(inspectRoadmapProjection(source, '2026-08-12', {x:'no'}).code, 'in-flight-item-dropped');
  }
});

test('Roadmap grammar bounds and unsafe source fields fail closed', () => {
  const base = () => doc(`title: Safe\n${decision('x')}`, {now:'  Core: Work [if x]', next:'', later:''});
  const cases = [
    [model => { model.title = 'Unsafe; forged'; }, 'unsafe-source-title'],
    [model => { model.periods.length = 1; }, 'unsupported-period-count'],
    [model => { model.periods[0].name = 'title: stolen'; model.items[0].period = 'title: stolen'; }, 'unsafe-period'],
    [model => { model.items[0].lane = 'basis'; }, 'unsafe-item-text'],
    [model => { model.items[0].url = 'javascript:alert(1)'; }, 'unsafe-item-text'],
    [model => { model.palette = 'neon'; }, 'unsupported-palette'],
    [model => { model.accent = '#xyz'; }, 'unsafe-accent'],
  ];
  for(const [mutate, code] of cases){
    const source = base(); mutate(source);
    assert.equal(inspectRoadmapProjection(source, '2026-08-12', {x:'yes'}).code, code);
  }
});

test('revisiting an earlier period refuses rather than reordering item occurrences', () => {
  const source = parsePaths(`title: Re-entry
${decision('x')}
Now
  Core: First [if x]
Next
  Core: Second
Now
  Core: Third`);
  assert.equal(inspectRoadmapProjection(source, '2026-08-12', {x:'yes'}).code, 'nonmonotonic-period-order');
});

test('unsafe text blocks only when that occurrence is included in the selected world', () => {
  const dropped = doc(`title: Relevance\n${decision('x')}`, {
    now:'  Core: Included [if x]\n  basis: Unsafe omitted title [unless x]', next:'', later:'',
  });
  /* The second line parses as a Paths item in lane "basis". It has no target
     representation, but this exact world intentionally omits it. */
  const inspected = inspectRoadmapProjection(dropped, '2026-08-12', {x:'yes'});
  assert.equal(inspected.ok, true);
  const target = parseRoadmap(buildRoadmapProjection(dropped, '2026-08-12', {x:'yes'}, acceptance(inspected)).text);
  assert.deepEqual(target.items.map(item => item.title), ['Included']);

  assert.equal(inspectRoadmapProjection(dropped, '2026-08-12', {x:'no'}).code, 'unsafe-item-text',
    'the same occurrence blocks once it would travel');
});

test('every horizon is emitted in original order even when only Later has selected work', () => {
  const source = doc(`title: Spatial order\n${decision('x')}`, {
    now:'  Core: Near branch [if x]', next:'', later:'  Core: Later fallback [unless x]',
  });
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {x:'no'});
  const built = buildRoadmapProjection(source, '2026-08-12', {x:'no'}, acceptance(inspected));
  assert.ok(built.text.indexOf('\nNow\n') < built.text.indexOf('\nNext\n'));
  assert.ok(built.text.indexOf('\nNext\n') < built.text.indexOf('\nLater\n'));
  const target = parseRoadmap(built.text);
  assert.deepEqual(target.horizons, ['Now', 'Next', 'Later']);
  assert.deepEqual(target.items.map(item => ({h:item.h, title:item.title})), [{h:2, title:'Later fallback'}]);
});

test('the visible basis refuses more than eight active relevant entries', () => {
  const decisions = Array.from({length:9}, (_, index) =>
    decision(`known${index}`, `\n  answer: yes 2026-08-0${(index % 8) + 1}`)).join('\n');
  const rows = Array.from({length:9}, (_, index) => `  Core: Work ${index} [if known${index}]`).join('\n');
  const source = doc(`title: Ledger\n${decisions}`, {now:rows, next:'', later:''});
  assert.equal(inspectRoadmapProjection(source, '2026-08-12', {}).code, 'basis-too-large');
});

test('more than six open delivery questions refuses before accepting a fabricated assignment', () => {
  const decisions = Array.from({length:7}, (_, index) => decision(`q${index}`)).join('\n');
  const source = doc(`title: Too many delivery questions\n${decisions}`, {
    now:'  Core: Work [if q0 or q1 or q2 or q3 or q4 or q5 or q6]', next:'', later:'',
  });
  const answers = Object.fromEntries(Array.from({length:7}, (_, index) => [`q${index}`, 'yes']));
  assert.equal(inspectRoadmapProjection(source, '2026-08-12', answers).code, 'enumeration-refused');
});

test('an untitled source gets neutral visible provenance and can represent an empty chosen future', () => {
  const source = doc(decision('continue'), {now:'  Core: Expansion [if continue]', next:'', later:''});
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {continue:'no'});
  assert.equal(inspected.ok, true);
  const target = parseRoadmap(buildRoadmapProjection(source, '2026-08-12', {continue:'no'}, acceptance(inspected)).text);
  assert.equal(target.title, 'Paths decision plan — delivery projection');
  assert.equal(target.basis.source, 'Paths decision plan');
  assert.equal(target.items.length, 0, 'ending investment is a valid exact outcome');
  assert.deepEqual(target.horizons, ['Now', 'Next', 'Later']);
});
