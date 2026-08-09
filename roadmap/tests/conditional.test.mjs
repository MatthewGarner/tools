/* Conditional roadmaps — slice A1 (parse + worlds + WIP routing).
   Spec: docs/superpowers/specs/2026-08-09-conditional-roadmap-spec.md §1, §2, §5.
   Plan: docs/superpowers/plans/2026-08-09-conditional-roadmap-plan.md A1. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, applyWorld, activeCount, wipBreaches, roadmapVerdict, roadmapMetrics} from '../parse.js';

/* ---------- token recognition ---------- */

test('[bet: name] flags the item and registers the bet, casing kept for display', () => {
  const m = parse('NOW\nCore: Reminders push [bet: Reminders]');
  assert.deepEqual(m.items[0].bet, {name: 'Reminders', outcome: null});
  assert.ok(m.bets.reminders, 'keyed lowercase');
  assert.equal(m.bets.reminders.display, 'Reminders');
  assert.equal(m.bets.reminders.outcome, null);
});

test('[bet: name won] / [bet: name lost] record a resolution', () => {
  const won = parse('NOW\nCore: A [bet: x won]');
  assert.equal(won.items[0].bet.outcome, 'won');
  assert.equal(won.bets.x.outcome, 'won');
  const lost = parse('NOW\nCore: A [bet: x lost]');
  assert.equal(lost.items[0].bet.outcome, 'lost');
  assert.equal(lost.bets.x.outcome, 'lost');
});

test('[if name] / [unless name] set cond, case-insensitive keyword', () => {
  const m = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [if x]\nCore: C [UNLESS x]');
  assert.deepEqual(m.items[1].cond, {name: 'x', when: 'if'});
  assert.deepEqual(m.items[2].cond, {name: 'x', when: 'unless'});
});

test('won/lost are reserved bet names — refused, token dropped, warns', () => {
  const m = parse('NOW\nCore: A [bet: won]');
  assert.equal(m.items[0].bet, null);
  assert.ok(m.warnings.some(w => w.includes('reserved')));
});

test('bet/condition names are case-insensitive but original casing survives for display', () => {
  const m = parse('NOW\nCore: A [bet: Reminders]\nNEXT\nCore: B [if REMINDERS]');
  assert.equal(m.bets.reminders.display, 'Reminders');
  assert.equal(m.items[1].worldState, 'cond');
});

/* ---------- first-wins (bet/cond) vs last-wins (status) asymmetry ---------- */

test('status is LAST-wins; bet/cond are FIRST-wins — the asymmetry is deliberate', () => {
  const status = parse('NOW\nCore: A [doing] [risk]');
  assert.equal(status.items[0].status, 'risk', 'later status token wins');

  const bet = parse('NOW\nCore: A [bet: x] [bet: y]');
  assert.equal(bet.items[0].bet.name, 'x', 'first bet token wins');
  assert.ok(bet.warnings.some(w => w.includes('duplicate [bet:')));

  const two = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [if x] [unless x]');
  assert.equal(two.items[1].cond.when, 'if', 'first condition token wins');
  assert.ok(two.warnings.some(w => w.includes('second condition')));
});

/* ---------- resolution beats declaration, regardless of order ---------- */

test('a later resolution beats an earlier bare declaration', () => {
  const m = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [bet: x won]');
  assert.equal(m.bets.x.outcome, 'won');
});

test('an earlier resolution beats a later bare declaration too — order-independent', () => {
  const m = parse('NOW\nCore: A [bet: x lost]\nNEXT\nCore: B [bet: x]');
  assert.equal(m.bets.x.outcome, 'lost');
});

test('won + lost for the same name conflict loudly and read unresolved', () => {
  const m = parse('NOW\nCore: A [bet: x won]\nNEXT\nCore: B [bet: x lost]');
  assert.equal(m.bets.x.outcome, null);
  assert.equal(m.bets.x.effective, 'unresolved');
  assert.ok(m.warnings.some(w => w.includes('conflicting resolutions')));
});

test('duplicate bare declarations: first wins, warns', () => {
  const m = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [bet: x]');
  assert.equal(m.bets.x.itemIndex, 0, 'first declaration is canonical');
  assert.ok(m.warnings.some(w => w.includes('duplicate [bet: x]')));
});

/* ---------- warnings ---------- */

test('condition on an undeclared bet warns, with a near-match suggestion', () => {
  const m = parse('NOW\nCore: A [bet: reminders]\nNEXT\nCore: B [if reminder]');
  assert.ok(m.warnings.some(w => w.includes('no bet named "reminder"') && w.includes('did you mean "reminders"')));
  assert.equal(m.items[1].cond, null, 'dangling condition dropped');
});

test('condition on a totally unrelated name warns without a false suggestion', () => {
  const m = parse('NOW\nCore: A [if zzz]');
  assert.ok(m.warnings.some(w => w.includes('no bet named "zzz"') && !w.includes('did you mean')));
});

test('unknown outcome word in [bet: x WORD] warns and stays unresolved', () => {
  const m = parse('NOW\nCore: A [bet: x maybe]');
  assert.equal(m.items[0].bet.outcome, null);
  assert.equal(m.bets.x.outcome, null);
  assert.ok(m.warnings.some(w => w.includes('unknown outcome') && w.includes('maybe')));
});

test('self-condition (an item conditions on its own bet) is dropped and warned', () => {
  const m = parse('NOW\nCore: A [bet: x] [if x]');
  assert.equal(m.items[0].cond, null);
  assert.ok(m.warnings.some(w => w.includes('own bet')));
});

test('near-miss forms get a bet/condition-specific hint, never the generic status one', () => {
  const bet = parse('NOW\nCore: A [bet x]');
  assert.ok(bet.warnings.some(w => w.includes('did you mean "[bet: x]"')));
  assert.ok(!bet.warnings.some(w => w.includes('use done / doing / risk / blocked')));

  const cond = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [if: x]');
  assert.ok(cond.warnings.some(w => w.includes('did you mean "[if x]"')));
  assert.ok(!cond.warnings.some(w => w.includes('use done / doing / risk / blocked')));
});

test('a non-word-ish bet or condition name warns and is dropped', () => {
  const bet = parse('NOW\nCore: A [bet: my cool bet]');
  assert.equal(bet.items[0].bet, null);
  assert.ok(bet.warnings.some(w => w.includes('letters, numbers, hyphens')));

  const cond = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [if my thing]');
  assert.equal(cond.items[1].cond, null);
  assert.ok(cond.warnings.some(w => w.includes('letters, numbers, hyphens')));
});

test('a bet nothing conditions on warns', () => {
  const m = parse('NOW\nCore: A [bet: x]');
  assert.ok(m.warnings.some(w => w.includes('nothing conditions on it')));
});

test('a conditioned item in the first horizon warns — a maybe in the commitment column', () => {
  const m = parse('NOW\nCore: A [bet: x]\nCore: B [if x]');
  assert.ok(m.warnings.some(w => w.includes('commitment column')));
});

test('a conditioned item in an earlier horizon than its bet warns', () => {
  const m = parse('NOW\nCore: B [if x]\nNEXT\nCore: A [bet: x]');
  assert.ok(m.warnings.some(w => w.includes('earlier horizon than its bet')));
});

test('[done] on an item conditioned on an unresolved or lost bet warns; done outranks the fork', () => {
  const m = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [if x] [done]');
  assert.equal(m.items[1].worldState, null, 'done never ghosts');
  assert.ok(m.warnings.some(w => w.includes('[done] item is conditioned') && w.includes('unresolved')));

  const lost = parse('NOW\nCore: A [bet: x lost]\nNEXT\nCore: B [if x] [done]');
  assert.equal(lost.items[1].worldState, null, 'done never drops either');
  assert.ok(lost.warnings.some(w => w.includes('[done] item is conditioned') && w.includes('lost')));
});

test('[done] under a WON bet does not warn', () => {
  const m = parse('NOW\nCore: A [bet: x won]\nNEXT\nCore: B [if x] [done]');
  assert.ok(!m.warnings.some(w => w.includes('[done] item is conditioned')));
});

test('cascade cycle: a depends on b, b depends on a — warns, both read unresolved', () => {
  const m = parse('NOW\nCore: A [bet: a] [if b]\nCore: B [bet: b] [if a]');
  assert.ok(m.warnings.some(w => w.includes('condition cycle')));
  assert.equal(m.bets.a.effective, 'unresolved');
  assert.equal(m.bets.b.effective, 'unresolved');
});

/* ---------- applyWorld: moot derivation, cascade, written-beats-cascade ---------- */

test('a bet whose own item is dropped is MOOT, not lost or won', () => {
  const m = parse('NOW\nCore: A [bet: a]\nNEXT\nCore: A2 [if a] [bet: b]\nLater\nCore: C [if b]\nCore: D [unless b]');
  const w = applyWorld(m, {a: 'lost'});
  assert.equal(w.bets.a.effective, 'lost');
  assert.equal(w.items[1].worldState, 'dropped', 'A2 (if a) drops when a is lost');
  assert.equal(w.bets.b.effective, 'moot', 'b\'s own declaring item (A2) is dropped, so b never ran');
});

test('[if b] under a moot b DROPS with a never-ran-flavoured reason; [unless b] is LIVE', () => {
  const m = parse('NOW\nCore: A [bet: a]\nNEXT\nCore: A2 [if a] [bet: b]\nLater\nCore: C [if b]\nCore: D [unless b]');
  const w = applyWorld(m, {a: 'lost'});
  const ifItem = w.items[2], unlessItem = w.items[3];
  assert.equal(ifItem.worldState, 'dropped', '[if b] dependents of a moot bet drop');
  assert.equal(ifItem.dropReason.effective, 'moot');
  assert.equal(unlessItem.worldState, null, '[unless b] fallback of a moot bet is LIVE — b certainly did not pay off');
});

test('a written resolution beats an assumed preview, in either direction', () => {
  const m = parse('NOW\nCore: A [bet: x won]\nNEXT\nCore: B [if x]');
  const w = applyWorld(m, {x: 'lost'});
  assert.equal(w.bets.x.effective, 'won', 'text resolution wins over the preview');
  assert.equal(w.items[1].worldState, null);
});

test('an unresolved bet under an assumed preview projects cond/dropped correctly', () => {
  const m = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [if x]\nCore: C [unless x]');
  assert.equal(m.items[1].worldState, 'cond', 'text world: unresolved, both branches ghosted');
  assert.equal(m.items[2].worldState, 'cond');

  const won = applyWorld(m, {x: 'won'});
  assert.equal(won.items[1].worldState, null);
  assert.equal(won.items[2].worldState, 'dropped');

  const lost = applyWorld(m, {x: 'lost'});
  assert.equal(lost.items[1].worldState, 'dropped');
  assert.equal(lost.items[2].worldState, null);
});

test('applyWorld never mutates the input model and returns a new object', () => {
  const m = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [if x]');
  const before = JSON.parse(JSON.stringify(m.items));
  const w = applyWorld(m, {x: 'won'});
  assert.deepEqual(m.items, before, 'original model untouched');
  assert.notEqual(w, m);
  assert.notEqual(w.items, m.items);
});

test('applyWorld never appends new warnings — a preview never disagrees with the text world', () => {
  const m = parse('NOW\nCore: A [bet: a] [if b]\nCore: B [bet: b] [if a]');   // cycle
  const before = m.warnings.length;
  const w = applyWorld(m, {a: 'won'});
  assert.equal(w.warnings.length, before, 'no new warnings from a preview call');
  assert.equal(w.warnings, m.warnings, 'same array, not re-derived');
});

test('multi-bet preview composes through the cascade', () => {
  const m = parse('NOW\nCore: A [bet: a]\nNEXT\nCore: B [bet: b] [if a]\nLater\nCore: C [if b]');
  const w = applyWorld(m, {a: 'won', b: 'won'});
  assert.equal(w.items[1].worldState, null);
  assert.equal(w.bets.b.effective, 'won');
  assert.equal(w.items[2].worldState, null);
});

/* ---------- WIP routing ---------- */

test('a dropped item leaves activeCount/wipBreaches unless still [doing]', () => {
  const m = parse('wip: 1\nNOW\nCore: A [bet: x lost]\nNEXT\nCore: B [if x]\nCore: C [if x] [doing]');
  assert.equal(activeCount(m, 1), 1, 'B is dropped and exempt; C is dropped but [doing] still counts');
  assert.ok(m.warnings.some(w => w.includes('[doing] item is dropped')));
});

test('a lost bet clears a WIP breach that a live world would have', () => {
  const text = 'wip: 1\nNOW\nCore: A [bet: x lost]\nNEXT\nCore: B [if x]\nCore: C [if x]';
  const m = parse(text);
  assert.deepEqual(wipBreaches(m), [], 'both conditioned items dropped, Next has 0 active');

  const preview = applyWorld(parse('wip: 1\nNOW\nCore: A [bet: x]\nNEXT\nCore: B [if x]\nCore: C [if x]'), {x: 'won'});
  assert.equal(activeCount(preview, 1), 2, 'a won bet keeps both — resolving can also CREATE a breach');
});

test('a bet-free doc keeps the exact pre-existing shape (additive model only)', () => {
  const m = parse('NOW\nCore: A\nCore: B [doing]');
  assert.equal(m.items[0].bet, null);
  assert.equal(m.items[0].cond, null);
  assert.equal(m.items[0].worldState, null);
  assert.deepEqual(m.bets, {});
  assert.equal(activeCount(m, 0), 2, 'unchanged WIP behaviour when no bets exist');
});

/* ---------- slice A2: verdict ladder (aftermath, fork) + metrics + verdict: ---------- */

test('roadmapMetrics appends "N bets" only when bets are declared', () => {
  const none = parse('NOW\nCore: A');
  assert.ok(!roadmapMetrics(none).some(s => s.includes('bet')));

  const one = parse('NOW\nCore: A [bet: x]');
  assert.ok(roadmapMetrics(one).includes('1 bet'));

  const two = parse('NOW\nCore: A [bet: x]\nNEXT\nCore: B [bet: y]');
  assert.ok(roadmapMetrics(two).includes('2 bets'));
});

test('aftermath (tier 2): a LOST bet with dropped riders — plural wording, house nOfT fig', () => {
  const m = parse('wip: off\nNOW\nCore: A [bet: reminders lost]\nNEXT\nCore: B [if reminders]\nCore: C [if reminders]\nCore: D [if reminders]');
  const v = roadmapVerdict(m);
  assert.equal(v.line, 'The reminders bet lost — 3 items fall away.');
  assert.equal(v.fig, '3 of 4');
});

test('aftermath (tier 2): a WON bet drops its own fallbacks — "fallback items", not bare "items"', () => {
  const m = parse('wip: off\nNOW\nCore: A [bet: x won]\nNEXT\nCore: B [unless x]\nCore: C [unless x]');
  const v = roadmapVerdict(m);
  assert.equal(v.line, 'The x bet won — 2 fallback items fall away.');
  assert.equal(v.fig, '2 of 3');
});

test('aftermath singular: "1 item falls away" / "1 fallback item falls away"', () => {
  const lost = roadmapVerdict(parse('wip: off\nNOW\nCore: A [bet: x lost]\nNEXT\nCore: B [if x]'));
  assert.equal(lost.line, 'The x bet lost — 1 item falls away.');

  const won = roadmapVerdict(parse('wip: off\nNOW\nCore: A [bet: x won]\nNEXT\nCore: B [unless x]'));
  assert.equal(won.line, 'The x bet won — 1 fallback item falls away.');
});

test('aftermath: moot bets never speak for themselves — their drops attribute to the resolved root', () => {
  const m = parse('wip: off\nNOW\nCore: A [bet: a lost]\nNEXT\nCore: A2 [if a] [bet: b]\nLater\nCore: C [if b]\nCore: D [unless b]');
  const v = roadmapVerdict(m);
  // A2 (dropped by a-lost) and C (dropped by moot b, chained to root a) both attribute to "a"
  assert.equal(v.line, 'The a bet lost — 2 items fall away.');
  assert.ok(!v.line.includes('The b bet'), 'the moot bet never gets its own aftermath line');
});

test('aftermath: multiple resolved bets with drops — most dropped speaks, ties by earliest declaration line', () => {
  const mostDropped = parse('wip: off\nNOW\nCore: A [bet: x lost]\nCore: E [bet: y lost]\nNEXT\nCore: B [if x]\nCore: F [if y]\nCore: G [if y]');
  const v1 = roadmapVerdict(mostDropped);
  assert.equal(v1.line, 'The y bet lost — 2 items fall away.', 'y dropped 2, x dropped 1 — y speaks');

  // tie (1 drop each): x is declared earlier in the text than y
  const tie = parse('wip: off\nNOW\nCore: A [bet: x lost]\nCore: E [bet: y lost]\nNEXT\nCore: B [if x]\nCore: F [if y]');
  const v2 = roadmapVerdict(tie);
  assert.equal(v2.line, 'The x bet lost — 1 item falls away.', 'tied counts — earliest declaration (x) speaks');
});

test('fork (tier 3): an unresolved bet with conditioned items — house nOfT + "turn(s) on"', () => {
  const m = parse('wip: off\nNOW\nCore: A [bet: x]\nNEXT\nCore: B [if x]\nLater\nCore: C [unless x]');
  const v = roadmapVerdict(m);
  assert.equal(v.line, '2 of 3 items turn on the x bet — the plan forks there, and says so.');
  assert.equal(v.fig, '2 of 3');
});

test('fork: singular reach uses "turns"', () => {
  const m = parse('wip: off\nNOW\nCore: A [bet: x]\nNEXT\nCore: B [if x]');
  const v = roadmapVerdict(m);
  assert.equal(v.line, '1 of 2 items turns on the x bet — the plan forks there, and says so.');
});

test('fork: transitive reach counts a moot-cascade dependent, and the wider-reaching bet speaks', () => {
  const m = parse('NOW\nCore: A [bet: a]\nNEXT\nCore: A2 [if a] [bet: b]\nLater\nCore: C [if b]\nCore: D [unless b]');
  const v = roadmapVerdict(m);
  // a's resolution ripples through A2, C and D (b's fate is downstream of a); b alone only reaches C/D
  assert.equal(v.line, '3 of 4 items turn on the a bet — the plan forks there, and says so.');
});

test('fork never fires for a moot or resolved bet — only truly unresolved ones', () => {
  const won = parse('wip: off\nNOW\nCore: A [bet: x won]\nNEXT\nCore: B [if x]');
  assert.ok(!roadmapVerdict(won).line.includes('turn'), 'a resolved bet is not a live fork');
});

test('dropped items leave the flags tier — a dropped [risk] item does not read as live trouble', () => {
  const m = parse('wip: off\nNOW\nCore: A [bet: x lost]\nCore: B [if x] [risk]');
  const v = roadmapVerdict(m);
  assert.ok(!v.line.includes('the risk sits inside'));
  assert.ok(!v.line.includes('trouble sits beyond'));
});

test('dropped items leave the shape tier denominator once no bet/fork/aftermath is in play', () => {
  // a WON bet with no dropped items at all (nothing conditions "on the failure branch")
  // falls through every earlier tier straight to shape; a separate, unrelated resolved
  // bet with one dropped fallback still fires aftermath first — kept apart here so the
  // shape tier itself is what's under test.
  const allLive = parse('wip: off\nNOW\nCore: A\nNEXT\nCore: B');
  const base = roadmapVerdict(allLive);
  assert.equal(base.fig, '1 of 2');

  const withDrop = parse('wip: off\nNOW\nCore: A [bet: x won]\nNEXT\nCore: B\nCore: C [unless x]');
  // C drops (unless a WON bet) — aftermath fires first, proving drops never leak into shape's count
  const v = roadmapVerdict(withDrop);
  assert.ok(v.line.startsWith('The x bet won'));
});

test('verdict: config key parses, comment-stripped, raw (assets/verdict.js resolves off/empty)', () => {
  const m = parse('title: T\nverdict: 3 of 5 bets are unfunded\nNOW\nCore: A');
  assert.equal(m.verdict, '3 of 5 bets are unfunded');

  const off = parse('verdict: off\nNOW\nCore: A');
  assert.equal(off.verdict, 'off');

  const commented = parse('verdict: text here // an aside\nNOW\nCore: A');
  assert.equal(commented.verdict, 'text here');

  const absent = parse('NOW\nCore: A');
  assert.equal(absent.verdict, null);
});

test('verdict: missing-colon near-miss gets the same hint as other config keys', () => {
  const m = parse('verdict off');
  assert.ok(m.warnings.some(w => w.includes('did you mean "verdict:"')));
});
