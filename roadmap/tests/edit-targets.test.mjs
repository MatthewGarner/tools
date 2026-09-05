import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applies, validators, addItemLine, removeItemLine, moveHorizon, setStyle} from '../edit-targets.js';
import {parse} from '../parse.js';
import {moveItem} from '../edit.js';
/* Every drag gesture is ONE text edit, committed as a single CodeMirror
   transaction — one undo step, URL-coherent, re-rendered by the normal loop.
   The renderer is never mutated as a model. */
import {setSpan, setSpanStart, moveItemKeepingSpan} from '../edit-targets.js';
import {setLane, addNote, addStatus, ensureHorizonHeader, setNote} from '../edit-targets.js';
import {resolveBet, setCondition, clearCondition} from '../edit-targets.js';

test('title rewrite keeps lane, status, note, link', () => {
  assert.equal(applies.title('Core: Resume where you left off [doing] -- top request -> https://x', 'Resume where you left off', 'Resume shield'),
               'Core: Resume shield [doing] -- top request -> https://x');
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
  assert.ok(validators.note('fine') && !validators.note('a -- b') && !validators.note('a -> b') && !validators.note('a\t->\tb'));
});

const DOC = `title: Lantern — Product Roadmap
horizons: Now, Next, Later

NOW
Core: Resume where you left off [doing] -- the fix
Growth: Referral flow [risk]

NEXT
Core: Reading reminders
Platform: Offline downloads

LATER
Growth: Publisher storefront`;

test('addItemLine lands at the end of the horizon section, lane-prefixed', () => {
  const {afterLine} = addItemLine(DOC, 'Growth', 'NEXT');
  assert.equal(afterLine, 9);           // after "Platform: Offline downloads"
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
  const text = moveHorizon(DOC, 4, 'Next');   // srcLine 4 = "Core: Resume where you left off [doing] -- the fix"
  assert.ok(text);
  const m = parse(text);
  const moved = m.items.find(i => i.title === 'Resume where you left off');
  assert.equal(m.horizons[moved.h], 'Next');
  assert.equal(moved.lane, 'Core');
  assert.equal(moved.status, 'doing');
  assert.equal(moved.note, 'the fix');
});

test('moveHorizon: is case-insensitive on the target horizon name', () => {
  const text = moveHorizon(DOC, 4, 'later');
  assert.ok(text);
  const m = parse(text);
  const moved = m.items.find(i => i.title === 'Resume where you left off');
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

test('setStyle leaves one canonical declaration so old styles cannot re-emerge', () => {
  const text = 'style: board\nNOW\nCore: thing\nstyle: focus';
  const out = setStyle(text, 'grid');
  const lines = out.split('\n');
  assert.equal(lines.filter(line=>/^style:/.test(line)).length,1);
  assert.equal(lines.at(-1), 'style: grid');
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

/* setFocus — the focus lens (Task 3) */
test('setFocus commits/updates the focus: key; round-trips through parse', async () => {
  const {setFocus} = await import('../edit-targets.js');
  const t = setFocus('title: R\nNOW\nCore: A\nLATER\nCore: B', 'Later');
  assert.match(t, /focus:\s*Later/);
  assert.equal(parse(t).focus, 'Later');
});
test('CONFIG_KEYS reserves "focus", so setLane refuses to rename an item to "Focus:"', async () => {
  const {setLane, CONFIG_KEYS} = await import('../edit-targets.js');
  assert.ok(CONFIG_KEYS.test('focus'));
  const text = 'NOW\nCore: Ship it';                       // srcLine 1 is the item
  assert.equal(setLane(text, 1, 'Focus'), text);           // refused → text unchanged
});

/* ---- span edits (S7) ---- */

const SPAN_DOC = 'horizons: quarterly from Q3 2026 x4\n' +   // line 0
            'Q3 2026\n' +                                // line 1
            'Core: Sync engine rewrite [doing] x2\n' +   // line 2
            'Q4 2026\n' +                                // line 3
            'Core: Reading reminders\n';                   // line 4

test('setSpan rewrites an existing token in place, keeping status and note', () => {
  const out = setSpan(SPAN_DOC, 2, 3);
  assert.match(out, /^Core: Sync engine rewrite \[doing\] x3$/m);
  assert.equal(parse(out).items[0].span, 3);
});

test('setSpan ADDS a token to a plain item — this is how a card becomes a bar', () => {
  const out = setSpan(SPAN_DOC, 4, 2);
  assert.match(out, /^Core: Reading reminders x2$/m);
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

test('note rewrites reject a structural link delimiter without acknowledging source loss', () => {
  const source = 'NOW\nCore: Preserve the existing note -- retained context';
  const line = 1;
  for(const rejected of ['new note -> https://example.test/lost-suffix', 'new note\t->\thttps://example.test/lost-suffix']){
    assert.equal(addNote('NOW\nCore: Add safely', line, rejected), 'NOW\nCore: Add safely');
    assert.equal(setNote(source, line, rejected), source);
    const item = parse(setNote(source, line, rejected)).items[0];
    assert.equal(item.note, 'retained context');
    assert.equal(item.url, null);
  }
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

/* ---- A5: conditional-roadmap EIP rewrites ---- */

const BET_DOC = 'NOW\nCore: Ship reminders [bet: reminders]\nGrowth: Fallback plan [unless reminders]\n' +
  'NEXT\nCore: Depends on it [if reminders]\n';

/* ---- resolveBet ---- */
test('resolveBet writes "won" onto the [bet: …] token, preserving name casing and position', () => {
  const doc = 'NOW\nCore: Ship it [bet: Reminders] -- note\n';
  const out = resolveBet(doc, 1, 'won');
  assert.match(out, /^Core: Ship it \[bet: Reminders won\] -- note$/m);
  assert.equal(parse(out).items[0].bet.outcome, 'won');
});
test('resolveBet writes "lost"', () => {
  const out = resolveBet(BET_DOC, 1, 'lost');
  assert.match(out, /^Core: Ship reminders \[bet: reminders lost\]$/m);
});
test('resolveBet(null) unresolves an already-resolved token', () => {
  const doc = 'NOW\nCore: Ship it [bet: reminders won]\n';
  const out = resolveBet(doc, 1, null);
  assert.match(out, /^Core: Ship it \[bet: reminders\]$/m);
  assert.equal(parse(out).items[0].bet.outcome, null);
});
test('resolveBet is a no-op when the line carries no [bet: …] token', () => {
  const doc = 'NOW\nCore: Plain item\n';
  assert.equal(resolveBet(doc, 1, 'won'), doc);
});
test('resolveBet does not touch a bracket-shaped string in the note', () => {
  const doc = 'NOW\nCore: Plain item -- looks like [bet: not-real]\n';
  assert.equal(resolveBet(doc, 1, 'won'), doc);
});

/* ---- setCondition ---- */
test('setCondition inserts a fresh [if name] token after the title (no other brackets)', () => {
  const doc = 'NOW\nCore: A\nNEXT\nCore: B [bet: reminders]\n';
  const out = setCondition(doc, 1, 'reminders', 'if');
  assert.match(out, /^Core: A \[if reminders\]$/m);
  const it = parse(out).items.find(i => i.title === 'A');
  assert.deepEqual(it.cond, {name: 'reminders', when: 'if'});
});
test('setCondition inserts AFTER an existing [status]/[bet…] run, before xN (canonical order)', () => {
  const doc = 'horizons: quarterly from Q3 2026 x2\nQ3 2026\nCore: A [doing] x2\nQ4 2026\nCore: B [bet: reminders]\n';
  const out = setCondition(doc, 2, 'reminders', 'unless');
  assert.match(out, /^Core: A \[doing\] \[unless reminders\] x2$/m);
  const it = parse(out).items.find(i => i.title === 'A');
  assert.equal(it.span, 2);
  assert.deepEqual(it.cond, {name: 'reminders', when: 'unless'});
});
test('setCondition replaces an existing condition token in place (position preserved)', () => {
  const out = setCondition(BET_DOC, 4, 'reminders', 'unless');
  assert.match(out, /^Core: Depends on it \[unless reminders\]$/m);
});
test('setCondition round-trips through parse with an identical model otherwise', () => {
  const out = setCondition(BET_DOC, 2, 'reminders', 'if');   // "Fallback plan" was [unless reminders]
  const it = parse(out).items.find(i => i.title === 'Fallback plan');
  assert.deepEqual(it.cond, {name: 'reminders', when: 'if'});
});
test('setCondition is a no-op for an unknown `when`', () => {
  assert.equal(setCondition(BET_DOC, 1, 'reminders', 'maybe'), BET_DOC);
});
test('setCondition is a no-op for an out-of-range line', () => {
  assert.equal(setCondition(BET_DOC, 99, 'reminders', 'if'), BET_DOC);
});

/* ---- clearCondition ---- */
test('clearCondition removes the token and leaves no orphaned double space', () => {
  const out = clearCondition(BET_DOC, 4);
  assert.match(out, /^Core: Depends on it$/m);
});
test('clearCondition removes a token that sits mid-line, keeping the rest', () => {
  const doc = 'NOW\nCore: A [if reminders] -- a note\n';
  const out = clearCondition(doc, 1);
  assert.match(out, /^Core: A -- a note$/m);
});
test('clearCondition is a no-op when the line has no condition token', () => {
  assert.equal(clearCondition(BET_DOC, 1), BET_DOC);
});

/* ---- hardening: addStatus must be status-token-specific, not any-bracket ---- */
test('addStatus still works on a line that already carries a [bet: …] token', () => {
  const doc = 'NOW\nCore: A [bet: reminders]\n';
  const out = addStatus(doc, 1, 'doing');
  assert.match(out, /^Core: A \[doing\] \[bet: reminders\]$/m);
  const it = parse(out).items[0];
  assert.equal(it.status, 'doing');
  assert.equal(it.bet.name, 'reminders');
});
test('addStatus still works on a line that already carries a condition token', () => {
  const doc = 'NOW\nCore: A [if reminders]\nNEXT\nCore: reminders [bet: reminders]\n';
  const out = addStatus(doc, 1, 'risk');
  assert.match(out, /^Core: A \[risk\] \[if reminders\]$/m);
});

/* ---- hardening: the status REWRITE must target the status token, not the first bracket ---- */
test('applies.status cycles the status bracket without destroying a bet token', () => {
  const line = 'Core: Pilot [bet: x] [doing]';
  const out = applies.status(line, 'doing', 'risk');
  assert.equal(out, 'Core: Pilot [bet: x] [risk]');
});
test('applies.status cycles the status bracket when it comes BEFORE the bet token', () => {
  const line = 'Core: Pilot [doing] [bet: x]';
  const out = applies.status(line, 'doing', 'risk');
  assert.equal(out, 'Core: Pilot [risk] [bet: x]');
});

/* ---- hardening: setLane clear must ignore ": " inside bracket tokens ---- */
test('setLane("") clears the lane prefix on a line whose brackets contain ": "', () => {
  const doc = 'NOW\nCore: A [doing] [bet: x]\n';
  const out = setLane(doc, 1, '');
  assert.match(out, /^A \[doing\] \[bet: x\]$/m);
  assert.equal(parse(out).items[0].lane, '');
});

/* ---- hardening: setSpan must not mis-stack xN around bet/cond brackets ---- */
test('setSpan on a line with xN AFTER the bet bracket (canonical) rewrites in place', () => {
  const doc = 'horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: A [bet: reminders] x2\n';
  const out = setSpan(doc, 2, 3);
  assert.match(out, /^Core: A \[bet: reminders\] x3$/m);
  const it = parse(out).items[0];
  assert.equal(it.span, 3);
  assert.equal(it.bet.name, 'reminders');
});
test('setSpan on a line with xN BEFORE the bet bracket normalises rather than stacking a second token', () => {
  const doc = 'horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: A x2 [bet: reminders]\n';
  const out = setSpan(doc, 2, 3);
  assert.equal((out.match(/x3/g) || []).length, 1, 'exactly one xN token after the rewrite');
  const it = parse(out).items[0];
  assert.equal(it.span, 3);
  assert.equal(it.bet.name, 'reminders');
});
test('setSpan round-trips through parse with an identical model (title/bet/cond) on a bet+cond line', () => {
  const doc = 'horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: A [bet: reminders] [if other] x2\nQ4 2026\nCore: B [bet: other]\n';
  const before = parse(doc).items[0];
  const out = setSpan(doc, 2, 3);
  const after = parse(out).items[0];
  assert.equal(after.title, before.title);
  assert.deepEqual(after.bet, before.bet);
  assert.deepEqual(after.cond, before.cond);
  assert.equal(after.span, 3);
});
