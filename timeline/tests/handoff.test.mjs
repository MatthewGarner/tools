/* timeline/tests/handoff.test.mjs — the merge-risk → premortem hop, round-tripped
   through the TARGET tool's own link codec (#93 rule: never hand-assembled URLs). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {premortemHandoff} from '../handoff.js';
import {withoutHandoffMeta} from '../../assets/handoff.js';
import {parse, parseDate} from '../parse.js';
import {toLink, fromLink} from '../../premortem/store.js';

const today = parseDate('2026-08-01');
const MERGE_DOC = ['title: Lantern 2.0 launch',
  'App: Beta cut 2026-09 .. 2026-10',
  'App: Store review 2026-10 .. 2026-11',
  'Marketing: Campaign 2026-10 .. 2026-12',
  'Ofgem decision 2026-12-01 [fixed]'].join('\n');

test('builder: a merge-risk plan yields a framed premortem doc', () => {
  const doc = premortemHandoff(parse(MERGE_DOC), today);
  assert.ok(doc, 'non-null on a mergeable plan');
  assert.equal(doc.title, 'Lantern 2.0 launch');
  assert.match(doc.question, /^It’s .*2026 and Lantern 2\.0 launch slipped\. Why\?$/);
  assert.equal(doc.phase, 'FRAME');
  assert.deepEqual(doc.entries, []);
  assert.deepEqual(doc.x, {v: 1, mode: 'draft', from: 'timeline', label: 'Timeline', kind: 'risk-register'});
});

test('round-trip: the doc survives premortem\'s own toLink/fromLink', async () => {
  const doc = premortemHandoff(parse(MERGE_DOC), today);
  const link = await toLink(doc);
  assert.ok(link && link.startsWith('#'), 'links under the size cap');
  const back = await fromLink(link);
  assert.equal(back.title, doc.title);
  assert.equal(back.question, doc.question);
  assert.equal(back.phase, 'FRAME');
  assert.deepEqual(back.x, doc.x, 'provenance survives the target codec');
  assert.notEqual(back.id, 'handoff', 'import mints a fresh id');
});

test('import remains separate until explicitly saved under its minted id', async () => {
  const backend = new Map();
  const storage = {getItem: k => backend.get(k) ?? null,
    setItem: (k, v) => backend.set(k, v), removeItem: k => backend.delete(k)};
  const {makeStore} = await import('../../premortem/store.js');
  const store = makeStore(storage);
  store.save({v: 1, id: 'current', title: 'Existing register', entries: []});
  const imported = await fromLink(await toLink(premortemHandoff(parse(MERGE_DOC), today)));

  assert.equal(store.list().length, 1, 'decoding alone never enters the target library');
  assert.equal(store.load('current').title, 'Existing register', 'the prior register is untouched');
  store.save(imported);
  assert.equal(store.list().length, 2, 'Save as new adds a separate register');
  assert.equal(store.load('current').title, 'Existing register');
  assert.equal(store.load(imported.id).title, 'Lantern 2.0 launch');
  store.save(withoutHandoffMeta(imported));
  assert.equal(store.load(imported.id).x, undefined, 'promotion removes transient provenance');
});

test('null when there is nothing to premortem — the button must never be a dead link', () => {
  assert.equal(premortemHandoff(parse('title: T\nOne thing 2026-09 .. 2026-10'), today), null);
  assert.equal(premortemHandoff(parse(''), today), null);
});

test('oversized target-native handoff is refused by Premortem codec', async () => {
  const random = Array.from({length: 700}, (_, i) =>
    createHash('sha256').update('timeline-handoff-' + i).digest('base64url')).join('');
  const doc = premortemHandoff(parse(MERGE_DOC), today);
  doc.title = random;
  doc.question = random.split('').reverse().join('');
  assert.equal(await toLink(doc), null);
});
