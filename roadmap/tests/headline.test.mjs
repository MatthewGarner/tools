/* The deck's headline is AUTHORED, never synthesised.

   An earlier cut of this build generated it from the model (WIP breach → flags →
   diff → a plain load claim). It was cut deliberately: an export headline is a
   claim the author makes to a room, and a tool that writes it for them puts words
   in their mouth. The DSL key and the field above the preview are the same act —
   both land as one `headline:` line in the doc.

   The WIP breach survives as what it always was: an EDITOR warning to the author,
   not a sentence printed on their slide. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, wipBreaches} from '../parse.js';
import {setHeadline, setStyle} from '../edit-targets.js';

/* ---------------- parse ---------------- */

test('headline: is a config key, kept verbatim', () => {
  assert.equal(parse('headline: Retention first — everything in Now defends the streak\nNOW\nCore: A').headline,
    'Retention first — everything in Now defends the streak');
});

test('no headline: line means an EMPTY headline, not a generated one', () => {
  const m = parse('wip: 2\nNOW\nCore: A [risk]\nCore: B\nCore: C');
  assert.equal(m.headline, '', 'over-WIP AND flagged — the exact state that used to synthesise a verdict');
});

test('an empty headline: line is empty, not the literal string', () => {
  assert.equal(parse('headline:\nNOW\nCore: A').headline, '');
  assert.equal(parse('headline:   \nNOW\nCore: A').headline, '');
});

test('last headline: wins (the whole-document last-wins rule every config key follows)', () => {
  assert.equal(parse('headline: first\nNOW\nCore: A\nheadline: second').headline, 'second');
});

test('a colon-less "headline Foo" is caught as the near-miss it is, not filed as an item', () => {
  const m = parse('headline Retention first\nNOW\nCore: A');
  assert.equal(m.items.length, 1, 'the item line is the only item');
  assert.match(m.warnings.join(' '), /did you mean "headline:"/);
});

/* A settings key and a lane prefix are the same shape. A doc with a lane
   genuinely called "Headline" loses those items to the config parser — and the
   text would surface on the exported deck, which is the exact thing an authored
   headline exists to prevent. It still parses as config (last-wins, like every
   key), but it must not do so in silence. */
test('a lane called "Headline" is eaten as config — and SAYS SO', () => {
  const m = parse('NOW\nHeadline: New pricing page\nCore: B');
  assert.equal(m.headline, 'New pricing page');
  assert.deepEqual(m.items.map(i => i.title), ['B'], 'the "item" was consumed as config');
  assert.match(m.warnings.join(' '), /read as the headline: setting, not an item in a lane called "Headline"/);
});

test('the same guard covers every key a lane could collide with', () => {
  assert.match(parse('NOW\nDate: pick a launch window').warnings.join(' '),
    /read as the date: setting/);
  assert.match(parse('NOW\nStyle: rebuild the design system').warnings.join(' '),
    /read as the style: setting/);
});

test('settings in the config block (where the UI writes them) never warn', () => {
  const m = parse('title: T\nheadline: Retention first\nstyle: focus\nNOW\nCore: A');
  assert.deepEqual(m.warnings, []);
});

/* ---------------- the WIP breach is an editor warning, and only that ---------------- */

test('the WIP breach is an editor warning, and it states the fact', () => {
  const m = parse('wip: 2\nNOW\nCore: A\nCore: B\nCore: C');
  assert.deepEqual(wipBreaches(m), ['Now has 3 items in flight (wip: 2).']);
});

test('wipBreaches: silent at the threshold, silent when off', () => {
  assert.deepEqual(wipBreaches(parse('wip: 3\nNOW\nCore: A\nCore: B\nCore: C')), []);
  assert.deepEqual(wipBreaches(parse('wip: off\nNOW\n' +
    Array.from({length: 9}, (_, i) => 'Core: I' + i).join('\n'))), []);
});

/* ---------------- setHeadline: the field and the DSL are one act ---------------- */

test('setHeadline inserts into the config block — before the first horizon header, never at line 0', () => {
  const out = setHeadline('title: T\nhorizons: Now, Next\n\nNOW\nCore: A', 'We are betting on retention');
  assert.equal(out, 'title: T\nhorizons: Now, Next\n\nheadline: We are betting on retention\nNOW\nCore: A');
  assert.equal(parse(out).headline, 'We are betting on retention');
});

test('setHeadline rewrites the line that actually WINS (parse is last-wins)', () => {
  const src = 'headline: old\nNOW\nCore: A\nheadline: newer';
  const out = setHeadline(src, 'final');
  assert.equal(out, 'headline: old\nNOW\nCore: A\nheadline: final',
    'rewriting the FIRST one would leave "newer" still winning');
  assert.equal(parse(out).headline, 'final');
});

test('clearing the field DELETES the line — no empty `headline:` litter left in the doc', () => {
  const out = setHeadline('title: T\nheadline: something\nNOW\nCore: A', '');
  assert.equal(out, 'title: T\nNOW\nCore: A');
  assert.equal(parse(out).headline, '');
});

test('clearing deletes EVERY headline: line — an earlier one must not resurrect the headline', () => {
  const out = setHeadline('headline: old\nNOW\nCore: A\nheadline: newer', '');
  assert.equal(parse(out).headline, '', 'deleting only the winner would hand the crown back to "old"');
  assert.doesNotMatch(out, /^headline:/m);
});

test('clearing when there was never a headline is a no-op', () => {
  const src = 'title: T\nNOW\nCore: A';
  assert.equal(setHeadline(src, ''), src);
  assert.equal(setHeadline(src, '   '), src);
});

test('newlines pasted into the field cannot forge extra DSL lines', () => {
  const out = setHeadline('NOW\nCore: A', 'one\nwip: 99\ntwo');
  assert.equal(parse(out).wip, 6, 'the pasted "wip: 99" is text in a headline, not a config line');
  assert.equal(parse(out).headline, 'one wip: 99 two');
});

test('a headline round-trips through parse unchanged, colons and all', () => {
  const h = 'Q3: retention — and only retention';
  assert.equal(parse(setHeadline('NOW\nCore: A', h)).headline, h);
});

test('setStyle and setHeadline are the same rewrite, and do not tread on each other', () => {
  let src = 'title: T\nNOW\nCore: A';
  src = setStyle(src, 'focus');
  src = setHeadline(src, 'A claim');
  src = setStyle(src, 'register');
  const m = parse(src);
  assert.equal(m.style, 'register');
  assert.equal(m.headline, 'A claim');
  assert.equal((src.match(/^style:/gm) || []).length, 1, 'no duplicate style: line');
  assert.equal((src.match(/^headline:/gm) || []).length, 1, 'no duplicate headline: line');
});
