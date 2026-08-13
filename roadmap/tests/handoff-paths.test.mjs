import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse as parseRoadmap} from '../parse.js';
import {CONFIG_KEYS as PATHS_CONFIG_KEYS, parse as parsePaths} from '../../paths/parse.js';
import {evaluate as evaluatePaths} from '../../paths/evaluate.js';
import {roadmapConditionalityHealth, roadmapToPathsStarter} from '../handoff-paths.js';

const warningCodes = model => model.warnings.map(w => w.code);

test('a canonical Roadmap becomes an explicitly incomplete Paths starter', () => {
  const source = parseRoadmap(`title: Habitat
horizons: Now, Next, Later
Now
Discovery: Price pilot [bet: Pricing] -- Test willingness -> https://example.test/pilot
Discovery: Invite study [bet: Groups]
Next
Growth: Coach expansion [risk] [if Pricing] -- Start only after evidence -> https://example.test/expand
Growth: Fixed-fee trial [unless Pricing]
Growth: Invitation polish [if Groups]
Later
Growth: Shared foundations`);

  const text = roadmapToPathsStarter(source);
  assert.ok(text);
  assert.equal(text.split('\n')[0],
    '// Generated from Roadmap conditional work. Complete every decision before using this plan.');
  assert.equal(text.split('\n')[1], 'title: Habitat — decision-plan starter');
  assert.ok(text.indexOf('decision Pricing:') < text.indexOf('decision Groups:'),
    'decision declarations retain source occurrence order');
  assert.match(text, /Now\n  Discovery: Price pilot -- Test willingness -> https:\/\/example\.test\/pilot/);
  assert.match(text, /Next\n  Growth: Coach expansion \[risk\] \[if Pricing\] -- Start only after evidence -> https:\/\/example\.test\/expand/);
  assert.match(text, /  Growth: Fixed-fee trial \[unless Pricing\]/);

  const target = parsePaths(text);
  assert.equal(target.title, 'Habitat — decision-plan starter');
  assert.deepEqual(warningCodes(target), [
    'missing-question', 'missing-signal', 'missing-owner', 'missing-due-date',
    'missing-question', 'missing-signal', 'missing-owner', 'missing-due-date',
  ]);
  assert.deepEqual(target.decisions.map(d => d.name), ['Pricing', 'Groups']);
  assert.deepEqual(target.periods.map(p => p.name), ['Now', 'Next', 'Later']);
  assert.deepEqual(target.items.map(i => ({lane:i.lane, title:i.title, status:i.status, note:i.note, url:i.url})), [
    {lane:'Discovery', title:'Price pilot', status:null, note:'Test willingness', url:'https://example.test/pilot'},
    {lane:'Discovery', title:'Invite study', status:null, note:'', url:null},
    {lane:'Growth', title:'Coach expansion', status:'risk', note:'Start only after evidence', url:'https://example.test/expand'},
    {lane:'Growth', title:'Fixed-fee trial', status:null, note:'', url:null},
    {lane:'Growth', title:'Invitation polish', status:null, note:'', url:null},
    {lane:'Growth', title:'Shared foundations', status:null, note:'', url:null},
  ]);
  assert.deepEqual(target.items.slice(2, 5).map(i => ({kind:i.condition.kind, name:i.condition.terms[0].name,
    negated:i.condition.terms[0].negated})), [
    {kind:'if', name:'Pricing', negated:false},
    {kind:'unless', name:'Pricing', negated:true},
    {kind:'if', name:'Groups', negated:false},
  ]);
});

test('an untitled Roadmap gets a neutral visible provenance title', () => {
  const source = parseRoadmap(`Now
Core: Probe [bet: x]
Next
Core: Work [if x]`);
  const target = parsePaths(roadmapToPathsStarter(source));
  assert.equal(target.title, 'Roadmap conditional work — decision-plan starter');
});

test('an unsafe source title is refused rather than omitted or truncated', () => {
  const source = parseRoadmap(`title: Habitat
Now
Core: Probe [bet: x]
Next
Core: Work [if x]`);
  source.title = 'Habitat // concealed suffix';
  assert.equal(roadmapToPathsStarter(source), null);

  source.title = 'Habitat\tforged';
  assert.equal(roadmapToPathsStarter(source), null);
});

test('laneless Roadmap items remain laneless occurrences in Paths', () => {
  const source = parseRoadmap(`Now
Probe [bet: x]
Next
Conditional work [if x]
Shared work`);
  const text = roadmapToPathsStarter(source);
  assert.ok(text);
  assert.match(text, /Now\n  Probe\nNext\n  Conditional work \[if x\]\n  Shared work/);
  const target = parsePaths(text);
  assert.deepEqual(target.items.map(i => ({lane:i.lane, title:i.title})), [
    {lane:'', title:'Probe'}, {lane:'', title:'Conditional work'}, {lane:'', title:'Shared work'},
  ]);
  assert.equal(target.warnings.filter(w => w.code === 'unmatched-line').length, 3,
    'Paths records its existing laneless-item guidance without changing the item');
  assert.equal(target.warnings.filter(w => w.code.startsWith('missing-')).length, 4);
});

test('conditional work in Now remains waiting in the generated Paths model', () => {
  const source = parseRoadmap(`Now
Core: Probe [bet: x]
Core: Near-term work [if x]
Next
Core: Shared work`);
  const target = evaluatePaths(parsePaths(roadmapToPathsStarter(source)), '2026-08-12');
  assert.equal(target.items.find(i => i.title === 'Near-term work').itemState, 'waiting');
});

test('a done rider is retained when the same fork has an unfinished dependent', () => {
  const source = parseRoadmap(`Now
Core: Probe [bet: x]
Next
Core: Historical [done] [unless x]
Core: Still pending [if x]`);
  const text = roadmapToPathsStarter(source);
  assert.ok(text);
  const target = evaluatePaths(parsePaths(text), '2026-08-12');
  assert.equal(target.items.find(i => i.title === 'Historical').itemState, 'in-plan');
  assert.equal(target.items.find(i => i.title === 'Still pending').itemState, 'waiting');
});

test('duplicate titles and lanes remain distinct source occurrences', () => {
  const source = parseRoadmap(`Now
Core: Probe [bet: signal]
Next
Core: Repeat [if signal]
Core: Repeat [if signal]
Later
Core: Repeat`);
  const target = parsePaths(roadmapToPathsStarter(source));
  assert.deepEqual(target.items.map(i => i.title), ['Probe', 'Repeat', 'Repeat', 'Repeat']);
  assert.deepEqual(target.items.map(i => i.lane), ['Core', 'Core', 'Core', 'Core']);
});

test('health counts direct unfinished occurrences only and reports starter truth separately', () => {
  const safe = parseRoadmap(`Now
Core: Probe [bet: x]
Next
Core: Live [if x]
Core: Historical [done] [unless x]
Core: Live again [unless x]`);
  const health = roadmapConditionalityHealth(safe);
  assert.equal(health.items, 2);
  assert.equal(health.forks, 1);
  assert.equal(health.message, '2 unfinished delivery items are directly conditional on 1 open fork.');
  assert.equal(typeof health.starter, 'string');

  const chained = parseRoadmap(`Now
Core: A [bet: a]
Next
Core: B [bet: b] [if a]
Later
Core: C [if b]`);
  const chainHealth = roadmapConditionalityHealth(chained);
  assert.deepEqual({items:chainHealth.items, forks:chainHealth.forks}, {items:2, forks:2},
    'the health count stays direct rather than flattening a chain');
  assert.equal(chainHealth.starter, null, 'the chain cannot become a truthful starter');
});

test('no affected unfinished work means no starter', () => {
  assert.equal(roadmapToPathsStarter(parseRoadmap('Now\nCore: Ordinary work')), null);
  assert.equal(roadmapToPathsStarter(parseRoadmap('Now\nCore: Probe [bet: x]')), null);
  assert.equal(roadmapToPathsStarter(parseRoadmap(`Now
Core: Probe [bet: x]
Next
Core: Historical [done] [if x]`)), null);
  assert.deepEqual(roadmapConditionalityHealth(parseRoadmap('Now\nCore: Ordinary work')), {
    items:0, forks:0, message:'No unfinished delivery items are directly conditional on open forks.', starter:null,
  });
});

test('resolved, conflicting, chained, moot and cyclic forks are refused', () => {
  const docs = [
    `Now\nCore: Probe [bet: x won]\nNext\nCore: Work [if x]`,
    `Now\nCore: Probe [bet: x won]\nCore: Again [bet: x lost]\nNext\nCore: Work [if x]`,
    `Now\nCore: A [bet: a]\nNext\nCore: B [bet: b] [if a]\nLater\nCore: Work [if b]`,
    `Now\nCore: A [bet: a lost]\nNext\nCore: B [bet: b] [if a]\nLater\nCore: Work [if b]`,
    `Now\nCore: A [bet: a] [if b]\nCore: B [bet: b] [if a]\nNext\nCore: Work [if a]`,
  ];
  for(const doc of docs) assert.equal(roadmapToPathsStarter(parseRoadmap(doc)), null, doc);
});

test('a projection-basis Roadmap refuses the starter until provenance has a deliberate mapping', () => {
  const source = parseRoadmap([
    'basis: paths "Growth decisions"; assumed pricing=yes@2026-08-12',
    'NOW',
    'Core: Price experiment [bet: pricing]',
    'NEXT',
    'Growth: Coach expansion [if pricing]',
  ].join('\n'));
  assert.ok(source.basis, 'fixture must carry a valid projection basis');
  assert.equal(roadmapToPathsStarter(source), null);
  const health = roadmapConditionalityHealth(source);
  assert.equal(health.starter, null);
  assert.equal(health.items, 1, 'the health warning remains useful even while conversion is refused');
});

test('conditional in-flight work is refused because either outcome could drop it', () => {
  const source = parseRoadmap(`Now
Core: Probe [bet: x]
Next
Core: Already underway [doing] [if x]`);
  assert.equal(roadmapToPathsStarter(source), null);
  const health = roadmapConditionalityHealth(source);
  assert.deepEqual({items:health.items, forks:health.forks, starter:health.starter}, {items:1, forks:1, starter:null});
});

test('lossy periods, lanes, spans, URLs and source delimiters are refused', () => {
  const docs = [
    `horizons: Now, Next, Next\nNow\nCore: Probe [bet: x]\nNext\nCore: Work [if x]`,
    `horizons: Now, decision-next\nNow\nCore: Probe [bet: x]\ndecision-next\nCore: Work [if x]`,
    `Now\nCore: Probe [bet: x]\nNext\nToday: Work [if x]`,
    `Now\nCore: Probe [bet: x]\nNext\nCore: Work [if x] -> javascript:alert(1)`,
    `Now\nCore: Probe [bet: x]\nNext\nCore: Work // hidden ambiguity [if x]`,
    `horizons: monthly from Aug 2026 x3\nAug 2026\nCore: Probe [bet: x]\nSep 2026\nCore: Work x2 [if x]`,
  ];
  for(const doc of docs) assert.equal(roadmapToPathsStarter(parseRoadmap(doc)), null, doc);
});

test('every Paths config key remains reserved as a generated period header', () => {
  for(const key of PATHS_CONFIG_KEYS){
    const source = parseRoadmap(`horizons: Now, ${key}: forged
Now
Core: Probe [bet: x]
${key}: forged
Core: Work [if x]`);
    assert.equal(roadmapToPathsStarter(source), null, key);
  }
});

test('legal but non-monotonic horizon re-entry is refused rather than reordered', () => {
  const source = parseRoadmap(`Now
Core: Probe [bet: x]
Next
Core: Conditional [if x]
Now
Core: Re-entered source occurrence`);
  assert.deepEqual(source.items.map(i => i.h), [0, 1, 0], 'Roadmap legally retains the source sequence');
  assert.equal(roadmapToPathsStarter(source), null,
    'one heading per Paths period cannot retain this global occurrence order');
});

test('malformed foreign models are total refusals, never exceptions', () => {
  const models = [null, {}, {horizons:['Now'], items:[null], warnings:[], bets:{}},
    {horizons:['Now'], items:[], warnings:'not-an-array', bets:{}},
    {title:'X', horizons:['Now'], items:[], warnings:[], bets:{x:null}}];
  for(const model of models){
    assert.doesNotThrow(() => roadmapToPathsStarter(model));
    assert.equal(roadmapToPathsStarter(model), null);
    assert.doesNotThrow(() => roadmapConditionalityHealth(model));
  }
});

test('the builder is pure and does not alter the Roadmap model', () => {
  const source = parseRoadmap(`Now
Core: Probe [bet: x]
Next
Core: Work [if x]`);
  const before = structuredClone(source);
  assert.ok(roadmapToPathsStarter(source));
  assert.deepEqual(source, before);
});
