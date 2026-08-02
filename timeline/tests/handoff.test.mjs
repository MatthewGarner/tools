/* timeline/tests/handoff.test.mjs — the merge-risk → premortem hop, round-tripped
   through the TARGET tool's own link codec (#93 rule: never hand-assembled URLs). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {premortemHandoff} from '../handoff.js';
import {parse, parseDate} from '../parse.js';
import {toLink, fromLink} from '../../premortem/store.js';

const today = parseDate('2026-08-01');
const MERGE_DOC = ['title: Habitat 2.0 launch',
  'App: Beta cut 2026-09 .. 2026-10',
  'App: Store review 2026-10 .. 2026-11',
  'Marketing: Campaign 2026-10 .. 2026-12',
  'Ofgem decision 2026-12-01 [fixed]'].join('\n');

test('builder: a merge-risk plan yields a framed premortem doc', () => {
  const doc = premortemHandoff(parse(MERGE_DOC), today);
  assert.ok(doc, 'non-null on a mergeable plan');
  assert.equal(doc.title, 'Habitat 2.0 launch');
  assert.match(doc.question, /^It’s .*2026 and Habitat 2\.0 launch slipped\. Why\?$/);
  assert.equal(doc.phase, 'FRAME');
  assert.deepEqual(doc.entries, []);
});

test('round-trip: the doc survives premortem\'s own toLink/fromLink', async () => {
  const doc = premortemHandoff(parse(MERGE_DOC), today);
  const link = await toLink(doc);
  assert.ok(link && link.startsWith('#'), 'links under the size cap');
  const back = await fromLink(link);
  assert.equal(back.title, doc.title);
  assert.equal(back.question, doc.question);
  assert.equal(back.phase, 'FRAME');
  assert.notEqual(back.id, 'handoff', 'import mints a fresh id');
});

test('null when there is nothing to premortem — the button must never be a dead link', () => {
  assert.equal(premortemHandoff(parse('title: T\nOne thing 2026-09 .. 2026-10'), today), null);
  assert.equal(premortemHandoff(parse(''), today), null);
});
