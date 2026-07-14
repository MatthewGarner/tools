import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applies, validators, addItemLine, removeItemLine, moveHorizon, setStyle} from '../edit-targets.js';
import {parse} from '../parse.js';
/* Every drag gesture is ONE text edit, committed as a single CodeMirror
   transaction — one undo step, URL-coherent, re-rendered by the normal loop.
   The renderer is never mutated as a model. */
import {setSpan, setSpanStart, moveItemKeepingSpan} from '../edit-targets.js';

test('title rewrite keeps lane, status, note, link', () => {
  assert.equal(applies.title('Core: Streak freeze [doing] -- top request -> https://x', 'Streak freeze', 'Streak shield'),
               'Core: Streak shield [doing] -- top request -> https://x');
});
test('note rewrite touches only the note', () => {
  assert.equal(applies.note('Core: Freeze [doing] -- top request', 'top request', 'most-wanted fix'),
               'Core: Freeze [doing] -- most-wanted fix');
});
test('status swap', () => {
  assert.equal(applies.status('Core: Freeze [doing]', 'doing', 'risk'), 'Core: Freeze [risk]');
});
test('validators reject structure-breakers', () => {
  assert.ok(validators.title('Nice title') && !validators.title('a -- b') && !validators.title('[x]'));
  assert.ok(validators.note('fine') && !validators.note('a -- b'));
});

const DOC = `title: Habitat — Product Roadmap
horizons: Now, Next, Later

NOW
Core: Streak freeze [doing] -- the fix
Growth: Referral flow [risk]

NEXT
Core: Smart reminders
Platform: Full offline mode

LATER
Growth: Coach marketplace`;

test('addItemLine lands at the end of the horizon section, lane-prefixed', () => {
  const {afterLine} = addItemLine(DOC, 'Growth', 'NEXT');
  assert.equal(afterLine, 9);           // after "Platform: Full offline mode"
});

test('addItemLine into an empty horizon inserts after its header', () => {
  const doc = 'NOW\n\nNEXT\nCore: Later thing';
  const {afterLine} = addItemLine(doc, 'Core', 'NOW');
  assert.equal(afterLine, 0);
});

test('removeItemLine accepts only item lines', () => {
  assert.equal(removeItemLine(DOC, 5), true);    // Growth: Referral flow
  assert.equal(removeItemLine(DOC, 3), false);   // NOW header
  assert.equal(removeItemLine(DOC, 0), false);   // title
});

/* moveHorizon — the card-menu "Move to…" row (phone replacement for drag) */
test('moveHorizon: round-trips through the parser under the target horizon', () => {
  const text = moveHorizon(DOC, 4, 'Next');   // srcLine 4 = "Core: Streak freeze [doing] -- the fix"
  assert.ok(text);
  const m = parse(text);
  const moved = m.items.find(i => i.title === 'Streak freeze');
  assert.equal(m.horizons[moved.h], 'Next');
  assert.equal(moved.lane, 'Core');
  assert.equal(moved.status, 'doing');
  assert.equal(moved.note, 'the fix');
});

test('moveHorizon: is case-insensitive on the target horizon name', () => {
  const text = moveHorizon(DOC, 4, 'later');
  assert.ok(text);
  const m = parse(text);
  const moved = m.items.find(i => i.title === 'Streak freeze');
  assert.equal(m.horizons[moved.h], 'Later');
});

test('moveHorizon: no-op when the target IS the item\'s current horizon', () => {
  assert.equal(moveHorizon(DOC, 4, 'Now'), null);
});

test('moveHorizon: null for an unknown horizon or a non-item line', () => {
  assert.equal(moveHorizon(DOC, 4, 'Someday'), null);
  assert.equal(moveHorizon(DOC, 3, 'Next'), null);   // line 3 is the NOW header, not an item
});

test('moveHorizon: lands right after the header when the lane is new to that horizon', () => {
  const text = moveHorizon(DOC, 5, 'Next');   // "Growth: Referral flow [risk]" — NEXT has no Growth lane
  assert.ok(text);
  const lines = text.split('\n');
  const nextIdx = lines.indexOf('NEXT');
  assert.equal(lines[nextIdx + 1].trim(), 'Growth: Referral flow [risk]');
});

/* setStyle — the export-style picker's rewrite (S4) */
test('setStyle on an empty doc produces just the config line', () => {
  assert.equal(setStyle('', 'grid'), 'style: grid');
  assert.equal(setStyle('   \n  ', 'board'), 'style: board');
});

test('setStyle inserts into the config block, right before the first horizon header', () => {
  const text = setStyle(DOC, 'grid');
  const lines = text.split('\n');
  assert.equal(lines[3], 'style: grid');
  assert.equal(lines[4], 'NOW');
  assert.equal(text, DOC.replace('\nNOW', '\nstyle: grid\nNOW'));   // rest untouched
});

test('setStyle rewrites an existing style: line in place, not a prepend', () => {
  const withStyle = 'style: board\n' + DOC;
  const text = setStyle(withStyle, 'register');
  assert.equal(text, 'style: register\n' + DOC);
});

test('setStyle targets the LAST style: line so a duplicate can never mask the new value', () => {
  const text = 'style: board\nNOW\nCore: thing\nstyle: focus';
  const out = setStyle(text, 'grid');
  const lines = out.split('\n');
  assert.equal(lines[0], 'style: board');    // earlier duplicate left alone
  assert.equal(lines[3], 'style: grid');     // the one that actually wins gets rewritten
  assert.equal(parse(out).style, 'grid');    // last-wins: this is what the doc resolves to
});

test('setStyle appends at the end when the doc has no horizon header to anchor to', () => {
  const text = setStyle('Core: stray item', 'focus');
  assert.equal(text, 'Core: stray item\nstyle: focus');
});

test('setStyle skips comments and blank lines when finding where to insert', () => {
  const doc = '// note\ntitle: X\n\nNOW\nCore: thing';
  const text = setStyle(doc, 'register');
  assert.equal(text, '// note\ntitle: X\n\nstyle: register\nNOW\nCore: thing');
});

test('setStyle round-trips: the new style is what parse() resolves', () => {
  const text = setStyle(DOC, 'focus');
  assert.equal(parse(text).style, 'focus');
});

/* ---- span edits (S7) ---- */

const SPAN_DOC = 'horizons: quarterly from Q3 2026 x4\n' +   // line 0
            'Q3 2026\n' +                                // line 1
            'Core: Sync engine rewrite [doing] x2\n' +   // line 2
            'Q4 2026\n' +                                // line 3
            'Core: Smart reminders\n';                   // line 4

test('setSpan rewrites an existing token in place, keeping status and note', () => {
  const out = setSpan(SPAN_DOC, 2, 3);
  assert.match(out, /^Core: Sync engine rewrite \[doing\] x3$/m);
  assert.equal(parse(out).items[0].span, 3);
});

test('setSpan ADDS a token to a plain item — this is how a card becomes a bar', () => {
  const out = setSpan(SPAN_DOC, 4, 2);
  assert.match(out, /^Core: Smart reminders x2$/m);
});

test('setSpan(1) REMOVES the token — a 1-column item carries none', () => {
  const out = setSpan(SPAN_DOC, 2, 1);
  assert.match(out, /^Core: Sync engine rewrite \[doing\]$/m);
  assert.equal(parse(out).items[0].span, 1);
});

test('setSpan clamps at 1 — a bar is never negative or zero columns', () => {
  assert.equal(parse(setSpan(SPAN_DOC, 2, 0)).items[0].span, 1);
  assert.equal(parse(setSpan(SPAN_DOC, 2, -3)).items[0].span, 1);
});

test('setSpan keeps the token AFTER the status and BEFORE the note (parse strips in that order)', () => {
  const doc = 'horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: A [risk] -- why it is late\n';
  const out = setSpan(doc, 2, 3);
  const it = parse(out).items[0];
  assert.equal(it.span, 3);
  assert.equal(it.note, 'why it is late');
  assert.equal(it.status, 'risk');
  assert.equal(it.title, 'A');
});

test('setSpan never eats a token out of the user’s NOTE', () => {
  /* parse strips the note BEFORE the span token, so a note may legitimately end in
     "x2". A whole-line regex would delete it on every right-edge drag. */
  const doc = 'horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: A -- twice weekly x2\n';
  const out = setSpan(doc, 2, 3);
  assert.match(out, /^Core: A x3 -- twice weekly x2$/m);
  const it = parse(out).items[0];
  assert.equal(it.span, 3);
  assert.equal(it.note, 'twice weekly x2', 'the note is intact');
});

test('the MIDDLE drag preserves duration for free — the token travels with the line', () => {
  const out = moveItemKeepingSpan(SPAN_DOC, 2, 'Q4 2026');
  const it = parse(out).items.find(i => i.title === 'Sync engine rewrite');
  assert.equal(it.h, 1, 'now starts in Q4');
  assert.equal(it.span, 2, 'still two columns long');
});

test('the LEFT edge moves the start and keeps the END where it was', () => {
  /* Sync engine rewrite runs Q3–Q4 (h0=0, h1=1). Drag its left edge to Q4:
     it becomes a 1-column item in Q4, NOT a 2-column item starting at Q4. */
  const m = parse(SPAN_DOC);
  const out = setSpanStart(SPAN_DOC, 2, 1, m);
  const it = parse(out).items.find(i => i.title === 'Sync engine rewrite');
  assert.equal(it.h, 1);
  assert.equal(it.span, 1);
});

test('the LEFT edge dragged EARLIER lengthens the item', () => {
  const doc = 'horizons: quarterly from Q3 2026 x4\nQ3 2026\nQ4 2026\nCore: A x2\n';
  const out = setSpanStart(doc, 3, 0, parse(doc));   // A ran Q4–Q1; drag its start to Q3
  const it = parse(out).items[0];
  assert.equal(it.h, 0);
  assert.equal(it.span, 3, 'Q3 → Q1 is three columns');
});

test('an OFF-BOARD item keeps its declared end when its start moves', () => {
  /* x6 on a 4-column board paints 4 wide but was DECLARED 6. Dragging the start
     one column right must leave x5 (the end stays put), not x3 (which would
     silently shorten work the author said runs past the board).
     NB the fixture carries an explicit "Q4 2026" header line — moveItem (edit.js)
     requires a literal header for an empty target cell (no header AND no items
     there returns null, per its own contract at edit.js:34-39); the plan's original
     fixture omitted it and the drag was a silent no-op, never reaching setSpan at
     all. Sibling test above ("dragged EARLIER") already writes both headers. */
  const doc = 'horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: Data platform rebuild x6\nQ4 2026\n';
  const out = setSpanStart(doc, 2, 1, parse(doc));
  assert.match(out, /Data platform rebuild x5/);
});

test('two items with the SAME title in one lane cannot cross-wire', () => {
  /* moveItem hands back the moved line's index, so nothing is re-found by title */
  const doc = 'horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: Cleanup x2\nCore: Cleanup\n';
  const out = setSpanStart(doc, 2, 1, parse(doc));
  const moved = parse(out).items.filter(i => i.title === 'Cleanup');
  assert.equal(moved.length, 2);
  assert.equal(moved.filter(i => i.span === 1).length, 1, 'the untouched twin keeps span 1');
});
