import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applies, validators, addItemLine, removeItemLine, moveHorizon, setStyle} from '../edit-targets.js';
import {parse} from '../parse.js';
import {moveItem} from '../edit.js';
/* Every drag gesture is ONE text edit, committed as a single CodeMirror
   transaction — one undo step, URL-coherent, re-rendered by the normal loop.
   The renderer is never mutated as a model. */
import {setSpan, setSpanStart, moveItemKeepingSpan} from '../edit-targets.js';
import {setLane, addNote, addStatus, ensureHorizonHeader} from '../edit-targets.js';

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

test('moveHorizon: into a headerless default horizon creates the header, then moves — no more silent no-op', () => {
  const text = 'NOW\nCore: A\nCore: B';
  const model = parse(text);
  assert.equal(model.horizons[2], 'Later', 'default horizons: Now/Next/Later, no header line written for Later');
  const out = moveHorizon(text, 1, 'Later');   // srcLine 1 = "Core: A"
  assert.ok(out, 'must not silently no-op just because Later has no header line');
  const m = parse(out);
  const moved = m.items.find(i => i.title === 'A');
  assert.equal(m.horizons[moved.h], 'Later');
  assert.equal(moved.lane, 'Core');
  const other = m.items.find(i => i.title === 'B');
  assert.equal(m.horizons[other.h], 'Now', 'sibling item untouched');
});

test('moveHorizon: a move into a horizon that already HAS a header is byte-identical to calling moveItem directly (ensureHorizonHeader is a no-op there — regression guard)', () => {
  const model = parse(DOC);
  const item = model.items.find(i => i.srcLine === 4);
  const direct = moveItem(DOC, model, 4, {h: 1, lane: item.lane, beforeLine: null});
  assert.equal(moveHorizon(DOC, 4, 'Next'), direct.text);
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

/* ---- register cell edits: setLane / addNote / addStatus / ensureHorizonHeader ---- */

const REG = 'horizons: Now, Next\nNOW\nCore: Sync engine rewrite [doing] -- conflicts\nAlpha\n';

/* ---- setLane ---- */
test('setLane changes an existing lane prefix, keeping status and note', () => {
  const out = setLane(REG, 2, 'Platform');
  assert.match(out, /^Platform: Sync engine rewrite \[doing\] -- conflicts$/m);
  assert.equal(parse(out).items[0].lane, 'Platform');
});
test('setLane ADDS a prefix to a laneless item', () => {
  const out = setLane(REG, 3, 'Growth');
  assert.match(out, /^Growth: Alpha$/m);
});
test('setLane("") CLEARS the prefix', () => {
  assert.match(setLane(REG, 2, ''), /^Sync engine rewrite \[doing\] -- conflicts$/m);
});
test('setLane refuses a config-key name — it would eat the item and print it as a standfirst', () => {
  for(const bad of ['Headline', 'headline', 'Title', 'style', 'Wip']){
    const out = setLane(REG, 3, bad);
    assert.equal(out, REG, bad + ' must be rejected as a lane (config-key collision, parse.js:121)');
  }
});
test('setLane refuses brackets, a leading //, and a colon inside the name', () => {
  for(const bad of ['a[b', 'x]y', '// note', 'Ship v2: done']){
    assert.equal(setLane(REG, 3, bad), REG);
  }
});
test('setLane will not CLEAR when the title itself contains ": " (would re-parse as a lane)', () => {
  const laned = 'NOW\nCore: Ship v2: the sequel\n';
  assert.equal(setLane(laned, 1, ''), laned, 'clearing would leave "Ship v2: the sequel" → re-lanes as "Ship v2"');
});

/* ---- addNote / addStatus (the empty-cell inserts the shipped appliers corrupt) ---- */
test('addNote inserts " -- note" on a note-less item, before any -> url', () => {
  assert.match(addNote('NOW\nCore: A -> https://x.test/y\n', 1, 'why it matters'),
    /^Core: A -- why it matters -> https:\/\/x\.test\/y$/m);
});
test('addNote lands after an xN token and preserves the span (round-trips)', () => {
  const out = addNote('horizons: quarterly from Q3 2026 x2\nQ3 2026\nCore: A x2\n', 2, 'note');
  assert.match(out, /^Core: A x2 -- note$/m);
  const it = parse(out).items[0];
  assert.equal(it.span, 2);
  assert.equal(it.note, 'note');
});
test('addStatus inserts a bracket status on a status-less item', () => {
  assert.match(addStatus('NOW\nCore: A -- n\n', 1, 'risk'), /^Core: A \[risk\] -- n$/m);
});
test('addStatus rejects an unknown status', () => {
  assert.equal(addStatus('NOW\nCore: A\n', 1, 'banana'), 'NOW\nCore: A\n');
});

/* ---- ensureHorizonHeader ---- */
test('ensureHorizonHeader appends a missing horizon header at the end, and a subsequent moveItem lands in it', () => {
  const text = 'NOW\nCore: A';
  const model = parse(text);         // default horizons: Now, Next, Later — only NOW written
  assert.equal(model.horizons[2], 'Later');
  const out = ensureHorizonHeader(text, model, 2);
  assert.match(out, /\nLater$/, 'header appended at the end');

  const model2 = parse(out);
  const item = model2.items[0];
  const r = moveItem(out, model2, item.srcLine, {h: 2, lane: item.lane, beforeLine: null});
  assert.ok(r, 'moveItem now finds the Later header and succeeds');
  const moved = parse(r.text).items[0];
  assert.equal(parse(r.text).horizons[moved.h], 'Later');
});
test('ensureHorizonHeader is a no-op when the header already exists', () => {
  const text = 'NOW\nCore: A\nNEXT\nCore: B';
  const model = parse(text);
  assert.equal(ensureHorizonHeader(text, model, 1), text);
});
