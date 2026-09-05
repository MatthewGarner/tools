/* Conditional roadmaps — slice A3 (render states, every surface).
   Spec: docs/superpowers/specs/2026-08-09-conditional-roadmap-spec.md §2.
   Plan: docs/superpowers/plans/2026-08-09-conditional-roadmap-plan.md A3. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, applyWorld, roadmapVerdict} from '../parse.js';
import {anyBet, cardTag, tagColors, stateOpacity, previewableBet, whatifHitRect} from '../cond-parts.js';

const measure = (s, f) => (s ? s.length : 0) * ((/(\d+)px/.exec(String(f)) || [])[1] || 12) * 0.55;
const colors = {
  bg: '#fff', card: '#fff', border: '#ccc', ink: '#111', muted: '#666', accent: '#08c', accentInk: '#067',
  err: '#c00', status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'},
};
const ctx = (extra = {}) => ({colors, measure, dark: false, today: '2026-08-09', ...extra});

const FORK_DOC = 'title: T\nNOW\nCore: Ship base [bet: reminders]\nNEXT\nCore: Smart nudges [if reminders]\nCore: Manual digest [unless reminders]\nLATER\nCore: Later thing';
const RESOLVED_WON = FORK_DOC.replace('[bet: reminders]', '[bet: reminders won]');
const RESOLVED_LOST = FORK_DOC.replace('[bet: reminders]', '[bet: reminders lost]');
/* a chained (moot) doc: root bet drops "gate", whose OWN [if gate] rider
   must then read as "never ran" — never "lost", per spec §1. */
const MOOT_DOC = 'title: T\nNOW\nCore: Root [bet: root lost]\nNEXT\nCore: Gate [bet: gate] [if root]\nLATER\nCore: Rider [if gate]';
const PLAIN_DOC = 'title: T\nNOW\nCore: Plain item\nNEXT\nCore: Another one';

/* ---------- cond-parts.js pure helpers ---------- */


test('anyBet is false for a bet-free doc, true once any bet/cond appears', () => {
  assert.equal(anyBet(parse(PLAIN_DOC)), false);
  assert.equal(anyBet(parse(FORK_DOC)), true);
});

test('cardTag: bet-open / cond / dropped / moot wording', () => {
  const m = parse(FORK_DOC);
  const [betItem, ifItem, unlessItem] = m.items;
  assert.deepEqual(cardTag(m, betItem), {kind: 'bet-open', label: 'bet: reminders'});
  assert.deepEqual(cardTag(m, ifItem), {kind: 'cond', label: 'if reminders'});
  // BOTH sides of an unresolved fork read as 'cond' — the fork hasn't answered,
  // so neither branch is dropped yet (that only happens once the bet resolves)
  assert.deepEqual(cardTag(m, unlessItem), {kind: 'cond', label: 'unless reminders'});

  const won = parse(RESOLVED_WON);
  assert.deepEqual(cardTag(won, won.items[0]), {kind: 'bet-won', label: 'reminders · paid off'});
  assert.deepEqual(cardTag(won, won.items[2]), {kind: 'dropped', label: 'not needed — reminders paid off'});

  const moot = parse(MOOT_DOC);
  const gate = moot.items[1], rider = moot.items[2];
  assert.equal(gate.worldState, 'dropped');
  assert.deepEqual(cardTag(moot, gate), {kind: 'dropped', label: "not needed — root didn't"});
  assert.deepEqual(cardTag(moot, rider), {kind: 'dropped', label: 'not needed — gate never ran'},
    'a moot bet\'s own [if] dependent reads "never ran", never "didn\'t"');
});

test('cardTag never emits ✓/✗ glyphs or NBSP', () => {
  for(const doc of [FORK_DOC, RESOLVED_WON, RESOLVED_LOST, MOOT_DOC]){
    const m = parse(doc);
    for(const it of m.items){
      const tag = cardTag(m, it);
      if(!tag) continue;
      assert.ok(!/[✓✗]/.test(tag.label));
      assert.ok(!tag.label.includes(' '), 'no NBSP in capsule text (PNG export trap)');
    }
  }
});

test('single-strongest-state opacity never multiplies — dropped/cond override the certainty fade outright', () => {
  assert.equal(stateOpacity({worldState: 'dropped'}, 0.5), stateOpacity({worldState: 'dropped'}, 1),
    'dropped opacity is the SAME regardless of column fade');
  assert.equal(stateOpacity({worldState: 'cond'}, 0.5), stateOpacity({worldState: 'cond'}, 1));
  assert.equal(stateOpacity({worldState: null}, 0.72), 0.72, 'a plain item keeps the passed-through certainty fade');
});

test('previewableBet: the bet-declaring item of an unresolved bet is previewable', () => {
  const m = parse(FORK_DOC);
  assert.equal(previewableBet(m.bets, m.items[0]), 'reminders');
});

test('previewableBet: null for a non-bet item (cond/plain), and for a missing item', () => {
  const m = parse(FORK_DOC);
  assert.equal(previewableBet(m.bets, m.items[1]), null, 'a [if] item carries no bet of its own');
  assert.equal(previewableBet(m.bets, null), null);
});

test('previewableBet: null once the bet is resolved IN TEXT (won or lost)', () => {
  const won = parse(RESOLVED_WON), lost = parse(RESOLVED_LOST);
  assert.equal(previewableBet(won.bets, won.items[0]), null);
  assert.equal(previewableBet(lost.bets, lost.items[0]), null);
});

test('previewableBet: null for a MOOT bet — its own item is dropped, previewing it is incoherent (F2)', () => {
  const moot = parse(MOOT_DOC);
  const gateItem = moot.items.find(i => i.bet && i.bet.name.toLowerCase() === 'gate');
  assert.equal(moot.bets.gate.effective, 'moot');
  assert.equal(previewableBet(moot.bets, gateItem), null);
});

test('previewableBet: null for a bet sitting in a condition cycle', () => {
  const cyc = parse('title: T\nNOW\nA [bet: x] [if y]\nB [bet: y] [if x]');
  assert.ok(cyc.bets.x.cycle && cyc.bets.y.cycle);
  assert.equal(previewableBet(cyc.bets, cyc.items[0]), null);
  assert.equal(previewableBet(cyc.bets, cyc.items[1]), null);
});

test('previewableBet: STILL previewable under a what-if preview that shows it won/lost — only a TEXT resolution is a no-op', () => {
  const m = parse(FORK_DOC);
  const projectedWon = applyWorld(m, {reminders: 'won'});
  // the projected model's cardTag now reads 'bet-won', but the bet carries no
  // WRITTEN resolution — outcome is still null — so the capsule stays clickable.
  // The TEXT-WORLD bets map (m.bets, never projectedWon.bets) is what every
  // caller must pass — reading the projected map would wrongly disable
  // cycling the instant a preview shows a resolved-looking world.
  assert.equal(cardTag(projectedWon, projectedWon.items[0]).kind, 'bet-won');
  assert.equal(previewableBet(m.bets, projectedWon.items[0]), 'reminders',
    'a preview-only outcome must not disable further cycling');
});

test('previewableBet: every reason a previously-previewable bet stops being previewable (the prune cases)', () => {
  const fork = parse(FORK_DOC);
  assert.equal(previewableBet(fork.bets, fork.items[0]), 'reminders', 'sanity: previewable before any of this');

  // 1. stale key: the bet no longer exists in the freshly-parsed map at all
  //    (renamed away) — pruneWhatIf's `!b` branch.
  const renamed = parse(FORK_DOC.replace(/reminders/g, 'launch'));
  assert.equal(renamed.bets.reminders, undefined, 'the old name is gone from the new bets map');
  assert.equal(previewableBet(fork.bets, fork.items[0]), 'reminders');   // still true against the OLD map
  assert.equal(previewableBet(renamed.bets, fork.items[0]), null, 'gone from the NEW map — not previewable');

  // 2. resolved (won or lost) in text — the bare declaration gained a resolution.
  const resolved = parse(RESOLVED_WON);
  assert.equal(previewableBet(resolved.bets, resolved.items[0]), null);

  // 3. moot — a text edit made the bet's own host item drop.
  const moot = parse(MOOT_DOC);
  const gateItem = moot.items.find(i => i.bet && i.bet.name.toLowerCase() === 'gate');
  assert.equal(moot.bets.gate.effective, 'moot');
  assert.equal(previewableBet(moot.bets, gateItem), null);

  // 4. condition cycle — a text edit made the bet's reachability circular.
  const cyc = parse('title: T\nNOW\nA [bet: x] [if y]\nB [bet: y] [if x]');
  assert.ok(cyc.bets.x.cycle);
  assert.equal(previewableBet(cyc.bets, cyc.items[0]), null);

  // 5. the item itself carries no bet at all in the fresh parse (e.g. the
  //    `[bet: …]` token was deleted from that line by the same edit).
  const noBet = parse('title: T\nNOW\nCore: Ship base\nNEXT\nCore: Smart nudges');
  assert.equal(previewableBet(noBet.bets, noBet.items[0]), null);
});

test('whatifHitRect: single-quoted XML-legal attrs, tabindex/role/aria-label present, no bare booleans', () => {
  const svg = whatifHitRect('reminders', 'Reminders', 10, 20, 100, 17);
  assert.match(svg, /^<rect data-whatif='reminders' tabindex='0' role='button' aria-label='[^']*' x='10' y='20' width='100' height='17' fill='transparent'\/>$/);
  assert.ok(!svg.includes('"'), 'single-quoted throughout, matching the span-edge discipline');
});

test('whatifHitRect: coarse=true omits tabindex/role/aria-label entirely — no inert-button VoiceOver announcement (F8)', () => {
  const svg = whatifHitRect('reminders', 'Reminders', 10, 20, 100, 17, true);
  assert.equal(svg, "<rect data-whatif='reminders' x='10' y='20' width='100' height='17' fill='transparent'/>");
  assert.ok(!svg.includes('tabindex') && !svg.includes('role=') && !svg.includes('aria-label'));
});

test('whatifHitRect: aria-label never contains the literal cond-capsule substring "if <name>"', () => {
  // the render-conditional rail/hero test above greps live SVG for exactly
  // "if reminders" to prove a rail row carries no cond capsule; a hero's own
  // what-if aria-label must never collide with that check
  const svg = whatifHitRect('reminders', 'reminders', 0, 0, 10, 10);
  assert.ok(!svg.includes('if reminders'));
});

test('whatifHitRect: escapes a hostile bet name/display', () => {
  const svg = whatifHitRect('x', '<script>alert(1)</script>', 0, 0, 10, 10);
  assert.ok(!svg.includes('<script>'));
});

test('forkTier: two unresolved bets with equal transitive reach — the earliest DECLARED speaks, not the first alphabetically or in doc order of riders', () => {
  // both bets have exactly one rider each (n=1) — a genuine tie on reach.
  // "beta" is declared on an EARLIER line than "alpha" (NOW, before NEXT), so
  // beta must speak despite alpha's rider appearing first in the document.
  const doc = 'title: T\nNOW\nCore: Root beta [bet: beta]\nNEXT\nCore: Rider alpha [if alpha]\n' +
    'Core: Root alpha [bet: alpha]\nCore: Rider beta [if beta]';
  const m = parse(doc);
  assert.ok(m.bets.alpha.srcLine > m.bets.beta.srcLine, 'sanity: beta really is declared earlier');
  const r = roadmapVerdict(m);
  assert.ok(r.line.includes('beta'), 'the earlier-declared bet speaks on a tie: ' + r.line);
  assert.ok(!r.line.includes('the alpha bet'), r.line);
});

test('a bet declared on a merely-GHOSTED host (worldState "cond", not dropped) stays unresolved — moot requires the host to actually drop', () => {
  // Gate declares bet "gate" but is ITSELF conditioned on the still-unresolved
  // "outer" bet — Gate's worldState is 'cond' (ghosted), never 'dropped', so
  // "gate" must read unresolved, not moot: only an actually-dropped host bakes
  // a moot effective (parse.js's stateOf/effectiveOf: moot needs eff==='dropped').
  const doc = 'title: T\nNOW\nCore: Outer [bet: outer]\nCore: Gate [bet: gate] [if outer]\nNEXT\nCore: Rider [if gate]';
  const m = parse(doc);
  const gateItem = m.items.find(i => i.title === 'Gate');
  assert.equal(gateItem.worldState, 'cond', 'sanity: Gate is ghosted, not dropped');
  assert.equal(m.bets.gate.effective, 'unresolved');
});
