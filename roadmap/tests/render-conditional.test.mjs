/* Conditional roadmaps — slice A3 (render states, every surface).
   Spec: docs/superpowers/specs/2026-08-09-conditional-roadmap-spec.md §2.
   Plan: docs/superpowers/plans/2026-08-09-conditional-roadmap-plan.md A3. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, applyWorld, roadmapVerdict} from '../parse.js';
import {render} from '../render.js';
import {renderBoardDeck, renderBoardLive, typeRamp, boardGeometry} from '../render-board.js';
import {renderRegisterDeck, renderRegisterLive} from '../render-register.js';
import {renderFocusDeck, renderFocusLive} from '../render-focus.js';
import {renderDeck} from '../render-deck.js';
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

/* ---------- byte-identity: a bet-free doc renders with NO new markup ---------- */

test('a bet-free doc: chart/board/register/focus/deck carry no capsule/dashed markup', () => {
  const m = parse(PLAIN_DOC);
  const svgs = [
    render(m, ctx()),
    render(m, ctx({width: 380})),                 // narrow chart
    renderBoardDeck(m, ctx(), colors),
    renderBoardLive(m, ctx({edit: true})),
    renderRegisterDeck(m, ctx(), colors),
    renderRegisterLive(m, ctx({edit: true})),
    renderFocusDeck(m, ctx(), colors),
    renderFocusLive(m, ctx({edit: true})),
    renderDeck(m, ctx()),
  ];
  for(const svg of svgs){
    // a direct, non-disjunctive check: NONE of the cond/bet-specific markup ever
    // appears on a betless doc, full stop (the old `!dash || !BET` form could
    // never fail for a betless doc regardless of dash usage, since dashes
    // painted for unrelated reasons — spans, ghosts — would make the LHS true).
    assert.ok(!svg.includes('BET '), 'no bet-open capsule text on a bet-free doc');
    assert.ok(!svg.includes('bet: '), 'no bet-open capsule text on a bet-free doc');
    assert.ok(!/\bif [A-Za-z]/.test(svg) && !/\bunless [A-Za-z]/.test(svg), 'no cond capsule text');
    assert.ok(!/not needed —/.test(svg));
    assert.ok(!/·\s*(paid off|didn't|never ran)/.test(svg));
    assert.ok(!svg.includes('data-whatif'), 'no what-if hit rect');
  }
});

/* ---------- chart (render.js) ---------- */

test('chart: bet/cond/dropped capsules render, full EIP kept (never the ghost treatment)', () => {
  const m = parse(FORK_DOC);
  const svg = render(m, ctx({edit: true}));
  assert.ok(svg.includes('bet: reminders'));
  assert.ok(svg.includes('if reminders'));
  assert.ok(svg.includes('data-edit="title"'), 'cond/bet cards keep full edit-in-place markup');
  assert.ok(svg.includes('data-edit="cardmenu"'));

  const won = parse(RESOLVED_WON);
  const svgWon = render(won, ctx({edit: true}));
  assert.ok(svgWon.includes('reminders · paid off'));
  assert.ok(svgWon.includes('not needed — reminders paid off'));
  assert.ok(svgWon.includes('data-edit="title"'), 'a dropped card keeps full edit markup too');
});

test('chart narrow: same capsule/dashed treatment as wide', () => {
  const svg = render(parse(FORK_DOC), ctx({width: 380}));
  assert.ok(svg.includes('bet: reminders'));
  assert.ok(svg.includes('if reminders'));
});

test('chart: diff badge suppressed on a dropped item', () => {
  const before = 'title: T\nNOW\nCore: Ship base [bet: reminders won]\nNEXT\nCore: Manual digest [unless reminders]\nLATER\nCore: X';
  const m = parse(before);
  // any:false — a bare card badge, not the legend's own always-on NEW key
  const diff = {badge: it => it.title === 'Manual digest' ? {kind: 'new', label: 'new'} : null, any: false, dropped: []};
  const svg = render(m, ctx({diff}));
  assert.ok(!svg.includes('>NEW<'), 'the dropped item\'s NEW badge never paints');
});

test('chart: a moot bet\'s own item shows "never ran" and its [if] rider drops the same way', () => {
  const svg = render(parse(MOOT_DOC), ctx());
  assert.match(svg, /not needed — root didn&#39;t/);
  assert.match(svg, /not needed — gate never ran/);
  assert.ok(!svg.includes("gate didn't"));
});

/* ---------- board ---------- */

/* card mode's tag is a real capsule() — a rx="0" rect immediately followed
   by its own <text>label</text>; list mode's tag rides the dot-joined
   sub-line as plain text, no capsule rect at all. The two fixtures below
   are sized to actually LAND in each mode (render-board.js's boardGeometry
   flips to list mode once >25% of a column's items would be hidden at the
   card ramp's worst-case height — read at test-write time, not asserted
   generically here since it's an implementation detail, not the contract). */
const CAPSULE_TAG = /<rect[^>]*rx="0"[^>]*\/><text[^>]*>if reminders<\/text>/;

test('board deck, card mode (few items): the cond tag renders as its own capsule rect+text', () => {
  const m = parse(FORK_DOC);   // 2 items in NEXT — nowhere near the list-mode threshold
  const svg = renderBoardDeck(m, ctx(), colors);
  assert.match(svg, CAPSULE_TAG, 'card mode paints the tag as an isolated capsule');
});

test('board deck, list mode (many items in one column): the cond tag rides the dot-joined sub-line as plain text', () => {
  const many = 'title: T\nNOW\nCore: Root [bet: reminders]\n' +
    Array.from({length: 20}, (_, i) => 'Lane' + i + ': Item' + i + ' [if reminders] [risk]').join('\n') +
    '\nNEXT\nCore: X';
  const m = parse(many);
  const {listMode} = boardGeometry(m, 1000);
  assert.ok(listMode, 'sanity: this fixture really does flip to list mode');
  const svg = renderBoardDeck(m, ctx(), colors);
  assert.doesNotMatch(svg, CAPSULE_TAG, 'list mode never paints an isolated tag capsule');
  assert.match(svg, /LANE0\s+·\s+AT RISK\s+·\s+if reminders/, 'the tag rides the sub-line, dot-joined with lane/status');
});

test('board deck: the tag still renders at the NARROWEST card-column ramp (fsN:0) — exports carry every path (F4)', () => {
  const manyHorizons = 'title: T\nhorizons: ' + Array.from({length: 6}, (_, i) => 'H' + i).join(', ') +
    '\nH0\nCore: Ship base [bet: reminders]\nH1\nCore: Smart nudges [if reminders]';
  const m = parse(manyHorizons);
  const {colW} = boardGeometry(m, 800);
  assert.ok(colW < 300, 'sanity: 6 columns really do hit the narrowest ramp, colW=' + colW);
  assert.equal(typeRamp(colW).fsN, 0, 'sanity: fsN:0 confirms the narrowest ramp');
  const svg = renderBoardDeck(m, ctx(), colors);
  assert.ok(svg.includes('if reminders'), 'the cond tag still paints even with zero note-line room');
});

test('board live: full capsule + edit markup kept on cond/dropped cards', () => {
  const m = parse(RESOLVED_LOST);
  const svg = renderBoardLive(m, ctx({edit: true}));
  assert.ok(svg.includes("reminders · didn&#39;t"));
  assert.ok(svg.includes("not needed — reminders didn&#39;t"));
  assert.ok(svg.includes('data-edit="cardmenu"'));
});

test('board: dropped item carries no flag border even when [risk]', () => {
  const doc = 'title: T\nNOW\nCore: Root [bet: root lost]\nNEXT\nCore: Fallout [if root] [risk]\nLATER\nCore: X';
  const m = parse(doc);
  const fallout = m.items.find(i => i.title.startsWith('Fallout'));
  assert.equal(fallout.worldState, 'dropped');
  const svg = renderBoardLive(m, ctx({edit: true}));
  // the flag-coloured stroke (status.risk) must not appear on the dropped card's rect
  assert.ok(!new RegExp('stroke="' + colors.status.risk + '"').test(svg.split('Fallout')[0].slice(-400)));
});

/* ---------- register ---------- */

test('register deck + live: tag under the title, no risk/blocked wash on a dropped row', () => {
  // risk's wash is tint(C.status.risk) === C.status.risk + '1F'; blocked's is
  // C.status.blocked + '33' (render-register.js's `wash` ternary) — a doc that
  // used [risk] and asserted the '33' suffix could never fail, since risk never
  // emits that suffix in the first place. Cover BOTH real suffixes, scoped to
  // the dropped row's own markup (the slice from "Fallout" back to the
  // previous row's closing tag), not the whole document.
  for(const [flag, suffix] of [['risk', colors.status.risk + '1F'], ['blocked', colors.status.blocked + '33']]){
    const doc = 'title: T\nNOW\nCore: Root [bet: root lost]\nNEXT\nCore: Fallout [if root] [' + flag + ']\nLATER\nCore: X';
    const m = parse(doc);
    const deckSvg = renderRegisterDeck(m, ctx(), colors);
    const liveSvg = renderRegisterLive(m, ctx({edit: true}));
    for(const svg of [deckSvg, liveSvg]){
      assert.ok(svg.includes("not needed — root didn&#39;t"));
      const i = svg.indexOf('Fallout');
      const rowStart = Math.max(0, svg.lastIndexOf('/>', i - 20));   // the previous row's separator <line .../>
      const row = svg.slice(rowStart, i + 400);
      assert.ok(!row.includes(suffix), flag + ': wash suffix ' + suffix + ' leaked onto the dropped row');
    }
  }
});

test('register: BET/resolved capsules render', () => {
  const svg = renderRegisterLive(parse(RESOLVED_WON), ctx({edit: true}));
  assert.ok(svg.includes('reminders · paid off'));
});

/* ---------- focus ---------- */

test('focus hero: full capsule; LIVE rail degrades to fade-only (no capsule text); DECK rail carries a compact suffix (F4)', () => {
  const doc = 'title: T\nstyle: focus\nNOW\nCore: Ship base [bet: reminders]\nNEXT\nCore: Smart nudges [if reminders]\nLATER\nCore: Later thing';
  const m = parse(doc);
  const deckSvg = renderFocusDeck(m, ctx(), colors);
  const liveSvg = renderFocusLive(m, ctx({edit: true}));
  for(const svg of [deckSvg, liveSvg]) assert.ok(svg.includes('bet: reminders'), 'hero carries the capsule');
  assert.ok(deckSvg.includes('Smart nudges'));
  assert.ok(liveSvg.includes('Smart nudges'));
  // DECK: an export has no card menu to fall back on — the rail row states the
  // fact as a compact text suffix instead of a capsule (F4, exports-carry-
  // all-paths). LIVE: unchanged — the card menu carries the info (A5), the
  // rail stays purely fade-only.
  assert.ok(deckSvg.includes('>Smart nudges</text>') && deckSvg.includes('> — if reminders</text>'),
    'deck rail states the condition as a suffix (a separate muted text run, title unaffected)');
  assert.ok(!liveSvg.includes('if reminders'), 'the live rail row is fade-only — no capsule, no suffix');
});

/* ---------- deck grid (delegates to the chart) ---------- */

test('deck grid style shows the capsule through the delegated chart', () => {
  const doc = 'title: T\nhorizons: quarterly from Q1 2026 x4\nQ1 2026\nCore: Ship base [bet: reminders]\nQ2 2026\nCore: Smart nudges [if reminders]';
  const svg = renderDeck(parse(doc), ctx());
  assert.ok(svg.includes('bet: reminders'));
});

/* ---------- SVG is XML, not HTML (dev/svg-wellformed.test.mjs scans only the
   committed goldens, which carry no bet/cond doc yet — A6 captures those.
   This is the same strict tag-level pattern, applied here to the NEW markup
   directly, so it's proven before the golden ever exists). ---------- */

const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
function assertWellFormedTags(svg, label){
  for(const tag of svg.match(/<[^!/][^>]*>/g) || [])
    assert.match(tag, TAG, label + ': malformed tag ' + tag.slice(0, 140));
}

test('new cond/dropped/bet markup is well-formed XML everywhere it renders', () => {
  const fork = parse(FORK_DOC), won = parse(RESOLVED_WON), moot = parse(MOOT_DOC);
  const cases = [
    ['chart', render(fork, ctx({edit: true}))],
    ['chart-narrow', render(fork, ctx({width: 380, edit: true}))],
    ['chart-dropped', render(won, ctx({edit: true}))],
    ['chart-moot', render(moot, ctx())],
    ['board-deck', renderBoardDeck(fork, ctx(), colors)],
    ['board-live', renderBoardLive(won, ctx({edit: true}))],
    ['register-deck', renderRegisterDeck(fork, ctx(), colors)],
    ['register-live', renderRegisterLive(won, ctx({edit: true}))],
    ['focus-deck', renderFocusDeck(fork, ctx(), colors)],
    ['focus-live', renderFocusLive(won, ctx({edit: true}))],
    ['deck-dispatch', renderDeck(fork, ctx())],
  ];
  for(const [label, svg] of cases) assertWellFormedTags(svg, label);
});

/* Injection coverage for cond/bet markup (hostile titles/notes, boundary-
   shape bet names) lives in dev/injection.test.mjs's dedicated "roadmap
   CONDITIONAL" case — a prior version of this test built a doc, then called
   `doc.replace('Ship base', hostile)` where the doc contained no such
   substring, so the replace was a silent no-op and the assertion tested an
   unrelated title ("T") that was never hostile. Removed rather than patched:
   duplicating the injection corpus's job here would just be a second place
   to drift, and this file's real subject (cardTag's own output shape) is
   covered by the tests above. */

test('deckMetrics: dropped items leave the status tallies, except [doing] still in flight', async () => {
  const {parse} = await import('../parse.js');
  const {deckMetrics} = await import('../render-deck.js');
  const m = parse('NOW\nA [bet: x lost]\nNEXT\nB [if x] [risk]\nC [if x] [doing]\nD [risk]');
  const foot = deckMetrics(m);
  assert.ok(foot.includes('1 at risk'), 'only the live [risk] item counts: ' + foot);
  assert.ok(foot.includes('1 in progress'), 'dropped [doing] stays in flight: ' + foot);
});

/* ---------- A4: what-if preview — previewableBet / whatifHitRect ---------- */
/* Spec §3. Plan A4. previewableBet(bets, it) takes the TEXT-WORLD bets map
   (never a projected model's) — it must stay reliable no matter what world is
   CURRENTLY previewed, since that's exactly what the live renderers are
   handed once a preview is active: every call site passes the unprojected
   model's `.bets`, threaded via ctx.textBets (review finding F2). */

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
/* app.js's pruneWhatIf(m) walks the CURRENT whatIf preview map's keys and
   drops any key whose bet, in the freshly-parsed text-world `m.bets`, no
   longer satisfies previewableBet's own test — the API is (bets, it), so a
   pruned key is exercised here the same way pruneWhatIf itself does: look
   the stale name up in the new bets map (it has no `it` of its own once
   renamed/gone, so pruneWhatIf's real check is `!b || b.cycle ||
   b.effective !== 'unresolved'`, i.e. previewableBet's guard minus the `it`
   argument) — every one of the five ways a previously-previewable bet can
   stop being previewable, all against the CURRENT API. */
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

test('render.js: the hit rect is emitted ONLY in edit mode, only for the previewable bet item, as a sibling of the card <g>', () => {
  const m = parse(FORK_DOC);
  const live = render(m, ctx({edit: true}));
  const exported = render(m, ctx());   // edit omitted -> false, the export/golden path
  assert.equal((live.match(/data-whatif='reminders'/g) || []).length, 1);
  assert.ok(!exported.includes('data-whatif'), 'exports/goldens must never carry the hit rect');
  // sibling, never nested inside the cardmenu <g> — eip's closest('[data-edit]')
  // must not resolve a click on it back to the card menu
  const i = live.indexOf("data-whatif='reminders'");
  const cardGClose = live.lastIndexOf('</g>', i);
  assert.ok(cardGClose !== -1 && cardGClose < i, 'the hit rect sits AFTER the card <g> has already closed');
});
test('render.js: a resolved bet emits NO hit rect at all (not merely inert)', () => {
  const won = parse(RESOLVED_WON);
  assert.ok(!render(won, ctx({edit: true})).includes('data-whatif'));
});
test('the hit rect rides board/register/focus-hero live views too; the fade-only rail carries none', () => {
  const fork = parse(FORK_DOC);
  for(const svg of [renderBoardLive(fork, ctx({edit: true})), renderRegisterLive(fork, ctx({edit: true})),
    renderFocusLive(fork, ctx({edit: true}))]){
    assert.ok(svg.includes("data-whatif='reminders'"), svg.slice(0, 40));
  }
  // FOCUS: "Ship base" (the bet) is in NOW, the hero by default — put a SECOND
  // bet in a rail horizon to prove the rail itself never gets a hit rect
  // (spec: rail is fade-only, the card menu carries the info in A5)
  const railDoc = 'title: T\nNOW\nCore: Ship base [bet: reminders]\nNEXT\nCore: Second bet [bet: other]\nLATER\nCore: X [if other]';
  const railSvg = renderFocusLive(parse(railDoc), ctx({edit: true}));
  assert.ok(railSvg.includes("data-whatif='reminders'"), 'hero bet still gets a rect');
  assert.ok(!railSvg.includes("data-whatif='other'"), 'the rail bet (not the hero) gets none');
});

/* ---------- F1: WIP counts route through activeCount everywhere ---------- */
/* Repro (review F1): wip: 2, three NOW items, one dropped by a lost bet's
   [if] rider. activeCount(model, 0) === 2 (the dropped rider is exempt,
   [doing] aside) — so the column must NOT read as over WIP, and every count
   label shown alongside the flag must say 2, never the raw item count 3. */
const WIP_DROP_DOC = 'title: T\nwip: 2\nNOW\nCore: Gate [bet: gate lost]\n' +
  'Core: Dropped rider [if gate]\nCore: Plain item';

test('F1 chart (wide + narrow): a dropped item never counts toward WIP', () => {
  const m = parse(WIP_DROP_DOC);
  assert.equal(m.items.filter(i => i.h === 0).length, 3, 'sanity: 3 raw items in NOW');
  const wide = render(m, ctx());
  assert.ok(!wide.includes('OVER WIP') && !/\d+ ITEMS/.test(wide), 'wide: not flagged over wip');
  assert.ok(wide.includes('>2 ITEMS<') === false, 'never states the raw count either');
  const narrow = render(m, ctx({width: 400}));
  assert.ok(!narrow.includes('OVER WIP'), 'narrow: not flagged over wip');
});

test('F1 board (deck + live): dropped item excluded from the count/flag, still painted', () => {
  const m = parse(WIP_DROP_DOC);
  for(const svg of [renderBoardDeck(m, ctx(), colors), renderBoardLive(m, ctx({edit: true}))]){
    assert.ok(!svg.includes('OVER WIP'), 'not flagged over wip: ' + svg.slice(0, 30));
    assert.ok(svg.includes('>2<') || svg.includes('2</text>'), 'column count label reads 2 (active), not 3');
    assert.ok(svg.includes('Dropped rider'), 'the dropped card itself still paints');
  }
});

test('F1 focus (deck + live): hero count/flag matches activeCount, dropped card still paints', () => {
  const m = parse(WIP_DROP_DOC);
  for(const svg of [renderFocusDeck(m, ctx(), colors), renderFocusLive(m, ctx({edit: true}))]){
    assert.ok(!svg.includes('OVER WIP'), 'not flagged over wip: ' + svg.slice(0, 30));
    assert.ok(svg.includes('Dropped rider'), 'the dropped card itself still paints');
  }
});

/* ---------- F8: ctx.coarse strips the whatif rect's a11y attrs everywhere ---------- */
test('F8: ctx.coarse=true strips tabindex/role/aria-label from the whatif rect on every live surface, rect still present', () => {
  const fork = parse(FORK_DOC);
  for(const svg of [render(fork, ctx({edit: true, coarse: true})),
    renderBoardLive(fork, ctx({edit: true, coarse: true})),
    renderRegisterLive(fork, ctx({edit: true, coarse: true})),
    renderFocusLive(fork, ctx({edit: true, coarse: true}))]){
    assert.ok(svg.includes("data-whatif='reminders'"), 'the rect itself still paints: ' + svg.slice(0, 40));
    const i = svg.indexOf("data-whatif='reminders'");
    const rectTag = svg.slice(svg.lastIndexOf('<rect', i), svg.indexOf('/>', i) + 2);
    assert.ok(!rectTag.includes('tabindex') && !rectTag.includes('role=') && !rectTag.includes('aria-label'),
      'no a11y attrs on a coarse render: ' + rectTag);
  }
});
test('F8: ctx.coarse=false (default) keeps tabindex/role/aria-label — fine-pointer/keyboard unaffected', () => {
  const fork = parse(FORK_DOC);
  assert.ok(render(fork, ctx({edit: true})).includes("data-whatif='reminders' tabindex='0' role='button'"));
});

test('F1: a genuinely over-wip column (excluding the dropped item) still flags', () => {
  const overDoc = 'title: T\nwip: 1\nNOW\nCore: Gate [bet: gate lost]\n' +
    'Core: Dropped rider [if gate]\nCore: A\nCore: B';
  const m = parse(overDoc);   // 3 active (Gate, A, B) > wip:1
  assert.ok(render(m, ctx()).includes('OVER WIP') === false, 'chart uses "N ITEMS" wording, not OVER WIP');
  assert.ok(/3 ITEMS/.test(render(m, ctx())), 'chart flag states the ACTIVE count (3), not the raw 4');
  assert.ok(renderBoardLive(m, ctx({edit: true})).includes('3 · OVER WIP'));
  assert.ok(renderFocusLive(m, ctx({edit: true})).includes('3 — OVER WIP 1'));
});

/* ---------- test-quality audit additions (2026-08-09) ---------- */

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

test('narrow chart\'s "also running" line excludes a dropped spanning item, even while a live spanning item still gets named', () => {
  const doc = 'title: T\nhorizons: quarterly from Q1 2026 x4\nQ1 2026\n' +
    'Core: Root [bet: root lost]\nCore: Dropped span [if root] x3\nCore: Live span x3\nQ2 2026\nCore: Filler';
  const m = parse(doc);
  const dropped = m.items.find(i => i.title === 'Dropped span');
  assert.equal(dropped.worldState, 'dropped', 'sanity: it really is dropped');
  const svg = render(m, ctx({width: 380}));
  const also = /also running: ([^<]*)/.exec(svg);
  assert.ok(also, 'the live spanning item keeps an "also running" line');
  assert.ok(also[1].includes('Live span'), also[1]);
  assert.ok(!also[1].includes('Dropped span'), 'a dropped spanning item never appears in "also running": ' + also[1]);
});
