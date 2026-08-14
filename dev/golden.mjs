/* Golden-output harness: renders fixed models through render.js and writes/compares
   exact SVG strings. Usage: node dev/golden.mjs capture|compare|verify
   - compare: byte-identical check, warns if dev/golden has uncommitted changes
   - verify : compare AND assert dev/golden is fully committed (pre-merge gate) */
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parse} from '../roadmap/parse.js';
import {render} from '../roadmap/render.js';

const ctxBase = {
  colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E',doing:'#1F4FD8',risk:'#9A6A00',blocked:'#B3403A'},
    statusInk:{done:'#1C753C',doing:'#1A44C2',risk:'#8E6200',blocked:'#B3403A'}, accentInk:'#0A6C94',
    brand:'#E2231A', brandText:'#D62015'},
  measure: (t) => t.length * 7,
};
const docs = {
  lanes: 'title: T\ndate: 2026-07-04\nNOW\nCore: Streak freeze [doing] -- note here\nGrowth: Referral flow [risk]\nNEXT\nCore: Smart reminders\nLATER\nGrowth: Coach marketplace [done]',
  nolanes: 'date: 2026-07-04\nNOW\nplain item\nNEXT\nanother much longer item title that wraps across lines for sure definitely',
  quarterly: 'title: Q\ndate: 2026-07-04\nhorizons: quarterly from Q3 2026 x5\nwip: off\nfade: off\nQ3 2026\nA: one\nQ1 2027\nB: two',
};
const basisDoc = 'title: Growth delivery\ndate: 2026-08-12\n' +
  'basis: paths "Growth decisions"; answered pricing=yes@2026-08-03, retention=no@2026-08-09; assumed groups=no@2026-08-12\n' +
  'headline: Keep shared work moving while the open choice resolves.\n' +
  'NOW\nCore: Repair the streak [doing]\nNEXT\nGrowth: Improve invitations\nLATER\nCore: Deepen retention';
const variants = {};
for(const [k, src] of Object.entries(docs)){
  const m = parse(src);
  variants[k] = render(m, {...ctxBase});
  variants[k + '-slide'] = render(m, {...ctxBase, slide: true});
}
{
  const m = parse(docs.lanes);
  variants['lanes-diff'] = render(m, {...ctxBase, diff: {
    badge: it => it.title === 'Smart reminders' ? {kind:'new', label:'New'} :
                 it.title === 'Referral flow' ? {kind:'moved', label:'was Next'} : null,
    dropped: ['old thing one', 'old thing two', 'old thing three'],
    since: '2026-06-01', any: true,
  }});
  /* narrow (phone) relayout, edit:true — the only real-world path (exports
     never set ctx.width): plain no-lanes stack, lane sub-labels + certainty
     fade + status pills, and the diff strip's single-column dropped list. */
  /* the chart artefact's authored standfirst — WIDE (it grows headerH, pushing
     every column down) and NARROW (it advances the running y cursor). */
  const hlDoc = 'headline: We are consolidating — three bets, no more\n' + docs.lanes;
  variants['roadmap-headline'] = render(parse(hlDoc), {...ctxBase});
  /* `story:` (2026-07-31) — the authored diff narrative, which renders ONLY with
     an active comparison. Both states pinned: with a diff it appears under the
     standfirst and pushes the board down; without one it must be absent. */
  const storyDoc = 'story: We chose depth over breadth this cycle\n' + hlDoc;
  const storyDiff = {
    badge: it => it.title === 'Smart reminders' ? {kind: 'new', label: 'New'} : null,
    dropped: ['old thing one'], since: '2026-06-01', any: true,
  };
  variants['roadmap-story'] = render(parse(storyDoc), {...ctxBase, diff: storyDiff});
  variants['roadmap-story-nodiff'] = render(parse(storyDoc), {...ctxBase});
  variants['roadmap-headline-narrow'] = render(parse(hlDoc), {...ctxBase, edit: true, width: 360});
  variants['roadmap-narrow'] = render(parse(docs.nolanes), {...ctxBase, edit: true, width: 360});
  variants['roadmap-narrow-lanes'] = render(m, {...ctxBase, edit: true, width: 360});
  variants['roadmap-narrow-diff'] = render(m, {...ctxBase, edit: true, width: 360, diff: {
    badge: it => it.title === 'Smart reminders' ? {kind:'new', label:'New'} :
                 it.title === 'Referral flow' ? {kind:'moved', label:'was Next'} : null,
    dropped: ['old thing one', 'old thing two', 'old thing three'],
    since: '2026-06-01', any: true,
  }});
  /* two cards stacked in ONE cell, at slide scale — the ONLY fixture exercising
     the track-to-track y accumulation at S=1.35, where (a+h)+g !== a+(h+g).
     Captured BEFORE the packer landed: it pins the pre-change bytes. */
  variants['roadmap-stack-slide'] = render(parse(
    'title: Stacked\ndate: 2026-07-04\nNOW\nCore: First card\nCore: Second card\nCore: Third card\n' +
    'NEXT\nCore: Lonely'), {...ctxBase, slide: true});

  /* SPANS: mixed lengths in one lane (the torture case the layout was chosen on),
     and an item running past the board edge. Wide + slide; the narrow span layout
     is captured in Task 6. */
  const spanDoc = 'title: Platform Delivery Plan\ndate: 2026-07-04\n' +
    'horizons: monthly from Jul 2026 x6\nwip: 4\n' +
    'Jul 2026\nPlatform: Sync engine rewrite [doing] x6 -- conflicts are the #1 support driver\n' +
    'Platform: Habit templates library [done]\nPlatform: Streak freeze [doing] x2\n' +
    'Aug 2026\nPlatform: Referral flow [risk] x3 -- waiting on app-store review\n' +
    'Platform: Widget gallery\n' +
    'Sep 2026\nPlatform: Accountability circles x2\nPlatform: Coach marketplace\n';
  const spanModel = parse(spanDoc);
  variants['roadmap-spans'] = render(spanModel, {...ctxBase});
  variants['roadmap-spans-slide'] = render(spanModel, {...ctxBase, slide: true});

  const spanEdgeDoc = 'title: Platform Delivery Plan\ndate: 2026-07-04\n' +
    'horizons: quarterly from Q3 2026 x4\nwip: 4\n' +
    'Q3 2026\nInfra: Data platform rebuild x6 -- runs well past this board\n' +
    'Infra: Sync engine rewrite [doing] x4\n' +
    'Q4 2026\nApp: Smart reminders x2\n';
  variants['roadmap-spans-edge'] = render(parse(spanEdgeDoc), {...ctxBase});

  /* the phone span layout: a span is a LABEL in its start section, plus every
     section it runs THROUGH lists it under "also running" — a span-free doc
     has runLines = [] and no through items, so no OTHER narrow golden can move. */
  variants['roadmap-spans-narrow'] = render(spanModel, {...ctxBase, edit: true, width: 360});

  /* CONDITIONAL (A6): an unresolved fork — one declared bet, an [if] rider, an
     [unless] fallback, and the bet's own item still [doing] (in-flight WIP
     counts even while the fork is open). Chart style, wide. Pins the open-bet
     capsule (`BET name`), the cond dashed-muted treatment + `if`/`unless`
     capsules, and the what-if hit rect the live preview paints under them. */
  const forkDoc = 'title: Fork doc\ndate: 2026-08-09\nhorizons: Now, Next, Later\nwip: off\nNOW\n' +
    'Core: Foundation\nNEXT\n' +
    'Core: Retention engine [bet: retention] [doing] -- ships behind a flag\n' +
    'Core: Proactive nudges [if retention]\n' +
    'Core: Manual outreach [unless retention]\n' +
    'LATER\nGrowth: Cross-sell push';
  variants['roadmap-fork'] = render(parse(forkDoc), {...ctxBase, edit: true});
  /* Projection basis: one named Paths world, with known answers and an
     explicit planning assumption. Pinned wide + narrow so neither header
     composition can silently flatten the assumption into certainty. */
  variants['roadmap-basis'] = render(parse(basisDoc), {...ctxBase});
  variants['roadmap-basis-narrow'] = render(parse(basisDoc), {...ctxBase, width: 360});
}

/* deck exports (roadmap/render-deck.js) — a separate module from render.js
   (the whole containment story: /why delegates to render.js, never to the
   deck). `date:` is fixed in the doc, so the capture is deterministic without
   needing ctx.today at all. */
{
  const {renderDeck} = await import('../roadmap/render-deck.js');
  variants['deck-board'] = renderDeck(parse(docs.lanes), {...ctxBase});
  variants['deck-board-basis'] = renderDeck(parse(basisDoc), {...ctxBase});
  /* the flipped-to-list rendering path (a distinct code path from card
     columns — the prototype's version of this had no cap and overflowed the
     frame, which is exactly what this golden pins down). */
  const listDoc = 'title: Portfolio board\ndate: 2026-07-04\nNOW\n' +
    Array.from({length: 24}, (_, i) => (i % 3 === 0 ? 'Core: ' : i % 3 === 1 ? 'Growth: ' : 'Platform: ') +
      'Item number ' + i + (i % 5 === 0 ? ' [risk]' : i % 7 === 0 ? ' [blocked]' : '') +
      (i % 4 === 0 ? ' -- a short note on this one' : '')).join('\n') +
    '\nNEXT\nCore: placeholder\nLATER\nCore: placeholder';
  variants['deck-board-list'] = renderDeck(parse(listDoc), {...ctxBase});

  const wipDoc = 'title: Habitat board\ndate: 2026-07-04\nwip: 2\nNOW\n' +
    'Core: Streak freeze\nCore: Widget gallery\nGrowth: Referral loop\nNEXT\nCore: Coach marketplace';
  variants['deck-board-wip'] = renderDeck(parse(wipDoc), {...ctxBase});

  const emptyColDoc = 'title: Habitat board\ndate: 2026-07-04\nNOW\nCore: Streak freeze\nNEXT\nLATER\nGrowth: Coach marketplace';
  variants['deck-board-empty'] = renderDeck(parse(emptyColDoc), {...ctxBase});

  const boardDiffDoc = 'title: Habitat board\ndate: 2026-07-04\nNOW\n' +
    'Core: Streak freeze [doing] -- ship first\nGrowth: Widget gallery\nNEXT\nCore: Coach marketplace';
  const boardDiff = {
    since: 'Q1', badge: it => it.title === 'Streak freeze' ? {kind: 'new', label: 'NEW'}
      : it.title === 'Widget gallery' ? {kind: 'moved', label: 'was Next'} : null,
    dropped: ['Legacy import'],
  };
  variants['deck-board-diff'] = renderDeck(parse(boardDiffDoc), {...ctxBase, diff: boardDiff});

  /* REGISTER: badges (NEW capsule + "was X" italic horizon cell) + dropped
     rows (struck, DROPPED capsule) — the formal-table diff read. Also the one
     fixture carrying an AUTHORED `headline:`, so the standfirst (and the body
     band it pushes down) stays pinned; the others prove the no-headline frame. */
  const registerDoc = 'title: Portfolio register\nstyle: register\ndate: 2026-07-04\n' +
    'headline: We are consolidating — three bets, no more\nNOW\n' +
    'Core: Streak freeze [doing] -- shipping soon\n' +
    'Growth: Referral flow [risk] -- needs legal review\n' +
    'Platform: Billing migration [blocked] -- waiting on vendor\n' +
    'NEXT\nCore: Smart reminders\nGrowth: Onboarding v2\n' +
    'LATER\nGrowth: Coach marketplace [done]';
  const registerDiff = {
    any: true, since: '2026-06-01',
    badge: it => it.title === 'Smart reminders' ? {kind: 'new', label: 'New'} :
                 it.title === 'Referral flow' ? {kind: 'moved', label: 'was Next'} : null,
    dropped: ['old thing one', 'old thing two', 'old thing three'],
  };
  variants['deck-register-diff'] = renderDeck(parse(registerDoc), {...ctxBase, diff: registerDiff});

  /* Register byte-gate (2026-07-15): deck-register-diff carries a diff and is the
     only register golden. Pin the shapes a live-view refactor could perturb —
     no diff, dropped-column redistribution, the 8-horizon type ramp — BEFORE the
     refactor, so "IDENTICAL" actually guards the export path. */
  const regPlain = 'title: Portfolio register\nstyle: register\ndate: 2026-07-04\n' +
    'NOW\nCore: Streak freeze [doing] -- shipping soon\nGrowth: Referral flow [risk]\n' +
    'NEXT\nCore: Smart reminders\nLATER\nGrowth: Coach marketplace [done] -- eventually';
  variants['deck-register'] = renderDeck(parse(regPlain), {...ctxBase});
  /* laneless AND status-less AND note-less → LANE/STATUS/NOTE columns all drop */
  const regDrop = 'title: Bare\nstyle: register\ndate: 2026-07-04\nNOW\nAlpha\nBeta\nNEXT\nGamma';
  variants['deck-register-dropcol'] = renderDeck(parse(regDrop), {...ctxBase});
  /* 8 horizons — the smallest type ramp / widest horizon set */
  const reg8 = 'title: Long horizon\nstyle: register\ndate: 2026-07-04\n' +
    'horizons: quarterly from Q1 2026 x8\n' +
    Array.from({length: 8}, (_, i) => 'Q' + (i % 4 + 1) + ' ' + (2026 + Math.floor(i / 4)) +
      '\nCore: Item ' + i + (i % 2 ? ' [doing]' : '')).join('\n');
  variants['deck-register-8h'] = renderDeck(parse(reg8), {...ctxBase});

  /* FOCUS: an over-WIP Now (which the deck must NOT editorialise about — the
     breach is an editor warning, never a line on the slide) with enough items
     to force the 2-column hero (>=6) and a faded ranked rail. */
  const focusDoc = 'title: Product roadmap\nstyle: focus\ndate: 2026-07-04\nwip: 6\nNOW\n' +
    Array.from({length: 8}, (_, i) => (['Core', 'Growth', 'Platform'][i % 3]) + ': Item number ' + i +
      (i % 3 === 0 ? ' -- a short supporting note' : '') +
      (i === 2 ? ' [risk]' : i === 5 ? ' [blocked]' : '')).join('\n') +
    '\nNEXT\nCore: Next horizon item one\nGrowth: Next horizon item two\n' +
    'LATER\nCore: Later horizon item';
  variants['deck-focus'] = renderDeck(parse(focusDoc), {...ctxBase});

  const focusEmptyDoc = 'title: Habitat roadmap\nstyle: focus\ndate: 2026-07-04\nNOW\nNEXT\nCore: Smart reminders\nCore: Widget gallery\nLATER\nGrowth: Coach marketplace';
  variants['deck-focus-empty'] = renderDeck(parse(focusEmptyDoc), {...ctxBase});

  const focus2colDoc = 'title: Habitat roadmap\nstyle: focus\ndate: 2026-07-04\nNOW\n' +
    'Core: Streak freeze\nCore: Habit templates\nGrowth: Referral flow\nGrowth: Widget gallery\nPlatform: Sync rewrite\nPlatform: Offline mode\nNEXT\nCore: Smart reminders';
  variants['deck-focus-2col'] = renderDeck(parse(focus2colDoc), {...ctxBase});

  const focusDiffDoc = 'title: Habitat roadmap\nstyle: focus\ndate: 2026-07-04\nNOW\nCore: Streak freeze [doing]\nGrowth: Referral flow\nNEXT\nCore: Smart reminders';
  variants['deck-focus-diff'] = renderDeck(parse(focusDiffDoc), {...ctxBase, diff: {since: 'Q1', dropped: ['Legacy import', 'Old onboarding']}});

  /* focus: config key — proves the lens overrides the default first-non-empty
     pick on the deck too (heroes LATER, not NOW, even though NOW has items). */
  const focusKeyDoc = 'title: Habitat roadmap\nstyle: focus\nfocus: Later\ndate: 2026-07-04\nNOW\nCore: Streak freeze\nNEXT\nCore: Smart reminders\nLATER\nGrowth: Coach marketplace';
  variants['deck-focus-keyed'] = renderDeck(parse(focusKeyDoc), {...ctxBase});   // heroes LATER, not NOW

  /* GRID: a quarterly (time-axis) doc — style: grid is also the DEFAULT here
     (no style: line needed) since genHorizons sets model.timeAxis. */
  variants['deck-grid'] = renderDeck(parse(docs.quarterly), {...ctxBase});

  /* REGISTER LIVE (Task 4): the editable-table preview paint, captured at
     edit:false (the export/golden path — zero edit markup) so this golden
     pins the LAYOUT (fixed live width, content-driven height, the light
     frame, the column header row, one section per horizon) rather than the
     edit-only affordances, which dev/injection.test.mjs exercises instead. */
  const {renderRegisterLive} = await import('../roadmap/render-register.js');
  const regLiveDoc = 'title: Plan\nstyle: register\ndate: 2026-07-04\nNOW\nCore: Sync engine rewrite [doing] -- conflicts\n' +
    'Growth: Referral flow [risk]\nNEXT\nCore: Smart reminders\nLATER\nGrowth: Coach marketplace [done]';
  variants['register-live'] = renderRegisterLive(parse(regLiveDoc), {...ctxBase});   // edit:false pins layout
  variants['register-live-basis'] = renderRegisterLive(parse(basisDoc), {...ctxBase});
  /* the AUTHORED standfirst on the live artefacts (2026-07-31). `headline:` used
     to reach the deck alone, so two of four exports ignored what the author wrote.
     One golden per artefact pins the block AND the layout it pushes down. */
  variants['register-live-headline'] = renderRegisterLive(parse('headline: We are consolidating — three bets, no more\n' + regLiveDoc), {...ctxBase});

  /* CONDITIONAL (A6): a RESOLVED world — a lost bet whose own [if] rider drops
     (making that rider's own declared bet MOOT: a moot-chain drop, "never ran"),
     an [unless] fallback that stays LIVE because a lost bet still didn't pay off,
     and a won bet whose [unless] fallback drops ("won") while its [if] rider
     stays live. Register style, edit:false (pins layout, not edit affordances —
     injection.test.mjs covers those) so the won/lost/moot dropped-tag wordings
     and the muted dropped-row wash golden-lock. */
  const resolvedDoc = 'title: Resolved world\nstyle: register\ndate: 2026-08-09\nwip: off\nNOW\n' +
    'Core: Foundation\nNEXT\n' +
    'Core: Root gate [bet: gate lost]\n' +
    'Core: Cascade bet [bet: cascade] [if gate] -- runs only if gate pays off\n' +
    'Core: Downstream rider [if cascade] -- depends on cascade paying off\n' +
    'Core: Fallback when gate fails [unless gate] -- still live, gate certainly did not pay off\n' +
    'LATER\n' +
    'Growth: Expansion bet [bet: expansion won]\n' +
    'Growth: Won fallback dropped [unless expansion] -- superseded once expansion shipped\n' +
    'Growth: Won rider stays [if expansion]';
  variants['register-live-conditional'] = renderRegisterLive(parse(resolvedDoc), {...ctxBase});

  /* S4 (E10): `group: outcome` — the register's regrouping lens, captured
     edit:false (layout, not edit affordances — dev/injection.test.mjs covers
     those). One doc exercises all five sections: an open fork (gate: pays
     off / doesn't), a genuine condition cycle (alpha/beta each conditioned
     on the other), and a resolved-world casualty (the won fallback drops). */
  const outcomeDoc = 'title: Portfolio register\nstyle: register\ngroup: outcome\ndate: 2026-08-10\nwip: off\nNOW\n' +
    'Core: Foundation\nNEXT\n' +
    'Core: Root gate [bet: gate]\n' +
    'Core: Feature ships [if gate] -- ships once gate pays off\n' +
    'Core: Fallback plan [unless gate] -- covers if gate fails\n' +
    'Core: Alpha loop [bet: alpha] [if beta]\n' +
    'Core: Beta loop [bet: beta] [if alpha]\n' +
    'LATER\n' +
    'Growth: Expansion bet [bet: expansion won]\n' +
    'Growth: Won fallback dropped [unless expansion] -- superseded once expansion shipped\n' +
    'Growth: Won rider stays [if expansion]';
  variants['register-outcome'] = renderRegisterLive(parse(outcomeDoc), {...ctxBase});

  /* BOARD LIVE (Task 3): the editable-board preview paint, captured at
     edit:false (the export/golden path — zero edit markup) so this golden
     pins the LAYOUT (content-width columns, content-driven height, the
     light frame, one section per horizon) rather than the edit-only
     affordances, which dev/injection.test.mjs exercises instead. */
  const {renderBoardLive} = await import('../roadmap/render-board.js');
  const boardLiveDoc = 'title: Habitat board\ndate: 2026-07-04\nNOW\nCore: Streak freeze [doing] -- ship first\n' +
    'Growth: Widget gallery\nNEXT\nLATER\nCore: Coach marketplace';
  variants['board-live'] = renderBoardLive(parse(boardLiveDoc), {...ctxBase});          // edit:false pins layout
  variants['board-live-basis'] = renderBoardLive(parse(basisDoc), {...ctxBase});
  variants['board-live-headline'] = renderBoardLive(parse('headline: We are consolidating — three bets, no more\n' + boardLiveDoc), {...ctxBase});
  variants['board-live-story'] = renderBoardLive(
    parse('story: We chose depth over breadth this cycle\n' + boardLiveDoc),
    {...ctxBase, diff: {badge: () => null, dropped: ['old thing'], since: 'JUNE', any: true}});

  /* E1 (S3): an OPEN fork on the live board — a live item, both halves of one
     bet's zone (if-so + if-not), and a second open bet whose zone has only
     an if-so half (its if-not is empty and must not paint) — pins the wash/
     label markup, the live-flow-then-zones order, and the empty-half
     omission all in one golden. edit:false, matching every other board-live
     golden's export-path convention. */
  const zonesDoc = 'title: Habitat board\ndate: 2026-07-04\nNOW\nCore: Streak freeze [doing]\nCore: Ship reminders [bet: reminders]\n' +
    'Core: Ship digest [bet: digest]\nNEXT\nCore: Widget gallery\n' +
    'Core: Smart nudges [if reminders]\nCore: Manual outreach [unless reminders]\n' +
    'Core: Digest follow-up [if digest]\nLATER\nCore: Coach marketplace';
  variants['board-live-zones'] = renderBoardLive(parse(zonesDoc), {...ctxBase});

  /* FOCUS LIVE (Task 4): the editable-focus-lens preview paint, captured at
     edit:false (the export/golden path — zero edit markup) so this golden
     pins the LAYOUT (fixed live width, content-driven height, the light
     frame, the hero zone + ranked rail) rather than the edit-only
     affordances, which dev/injection.test.mjs exercises instead. */
  const {renderFocusLive} = await import('../roadmap/render-focus.js');
  const focusLiveDoc = 'title: Habitat\nstyle: focus\ndate: 2026-07-04\nNOW\nCore: Streak freeze [doing] -- ship first\nGrowth: Referral flow\nNEXT\nCore: Smart reminders\nLATER\nGrowth: Coach marketplace';
  variants['focus-live'] = renderFocusLive(parse(focusLiveDoc), {...ctxBase});   // edit:false pins layout
  variants['focus-live-basis'] = renderFocusLive(parse(basisDoc), {...ctxBase});
  variants['focus-live-headline'] = renderFocusLive(parse('headline: We are consolidating — three bets, no more\n' + focusLiveDoc), {...ctxBase});

  /* E6 (S5): the "hinges on" strip on a live hero card — a chained pair of
     bets two links deep (root resolves won, gate stays open), pinning the
     capsule text, the +22 card height, and the strip's absence from every
     other card on the same doc. edit:false, matching every other focus-live
     golden's export-path convention. */
  const hingesDoc = 'title: Habitat\nstyle: focus\ndate: 2026-07-04\nNOW\n' +
    'Core: Root milestone [bet: root won]\nCore: Gate check [bet: gate] [if root]\n' +
    'Core: Send digest [if gate]\nNEXT\nGrowth: Referral flow\nLATER\nGrowth: Coach marketplace';
  variants['focus-live-hinges'] = renderFocusLive(parse(hingesDoc), {...ctxBase});
}

/* tree fixtures (dates normalised so captures are stable) */
{
  const {parse: tparse} = await import('../tree/parse.js');
  const {evaluate} = await import('../tree/engine.js');
  const {render: trender} = await import('../tree/render.js');
  const bid = 'title: T\nRoot\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';
  const m = tparse(bid);
  const r = evaluate(m);
  variants['tree-bid'] = trender(m, r, {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  variants['tree-bid-slide'] = trender(m, r, {...ctxBase, slide: true}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  /* `verdict:` (2026-07-31) — the two states that move layout: off collapses the
     band (the tree must rise to meet the header), authored replaces the line and
     drops the tool's evidence sentence with it. */
  const mOff = tparse('verdict: off\n' + bid);
  variants['tree-verdict-off'] = trender(mOff, evaluate(mOff), {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  const mAuth = tparse('verdict: We bid, and we bid high\n' + bid);
  variants['tree-verdict-authored'] = trender(mAuth, evaluate(mAuth), {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');

}

/* /why fixtures (dates normalised) */
{
  const {parse: wparse} = await import('../why/parse.js');
  const {project} = await import('../why/project.js');
  const {renderOst} = await import('../why/render-ost.js');
  const {renderMap} = await import('../why/render-map.js');
  const doc = 'title: T\noutcome: Retention\n  Forgetting habits\n    Smart reminders [testing]\n      ? wanted\n    Streak freeze [delivering]\n      ? works [holds]\n  Chores feeling\n  Orphan [delivering]';
  const m = wparse(doc);
  const pr = project(m);
  const norm = s => s.replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  variants['why-ost'] = norm(renderOst(m, pr, {...ctxBase}));
  const {whyDiff, whyDiffView} = await import('../why/diff.js');
  const oldDoc = 'title: T\noutcome: Retention\n  Forgetting habits\n    Smart reminders [candidate]\n      ? wanted\n  Chores feeling\n    Old idea [parked]';
  const wd = whyDiffView(whyDiff(wparse(oldDoc), m), 'SNAP');
  variants['why-ost-diff'] = norm(renderOst(m, pr, {...ctxBase}, wd));
  variants['why-map'] = norm(renderMap(m, pr, {...ctxBase}));
  variants['why-map-slide'] = norm(renderMap(m, pr, {...ctxBase, slide: true}));
  /* WIDE + edit:true — the shape a /why user actually sees in the browser, and the
     one the golden suite was BLIND to: every other why fixture is either edit:false
     (exports) or narrow. Roadmap's spans added an edit-only affordance (the span-edge
     handles) that /why silently inherited, and nothing here could see it. This is the
     containment guard: /why delegates to roadmap's renderer, so an edit-mode change
     there must be visible HERE. */
  variants['why-map-edit'] = norm(renderMap(m, pr, {...ctxBase, edit: true}));

  /* narrow (phone) relayout, edit:true — the only real-world path (exports
     never set ctx.width): the indented outline (OST) and its map-view
     inheritance of roadmap's narrow relayout (Task 2). */
  variants['why-ost-narrow'] = norm(renderOst(m, pr, {...ctxBase, edit: true, width: 360}));
  variants['why-map-narrow'] = norm(renderMap(m, pr, {...ctxBase, edit: true, width: 360}));

  /* multi-outcome map-view narrow fixture: every single-outcome fixture above
     hid the dropped-band-header regression (a lone laneGroup still reads fine
     without a heading) — two outcomes prove the fix actually distinguishes
     which lanes belong to which outcome on a phone. */
  const multiDoc = 'title: H2 product bets\noutcome: Improve 90-day retention\n  Users forget mid-afternoon habits\n' +
    '    Smart reminders [testing]\n      ? users want interruptions\noutcome: Grow referral revenue\n' +
    '  Sharing feels braggy\n    Private progress cards [delivering]\n      ? cards get shared [testing]\n' +
    '  No reason to invite others\n';
  const mm = wparse(multiDoc);
  const mpr = project(mm);
  variants['why-map-narrow-multi'] = norm(renderMap(mm, mpr, {...ctxBase, edit: true, width: 360}));

  /* deep-tree fixture (#4-5 levels of freely-nesting opportunities down to a
     solution): proves the depth clamp — depths 3, 4 and 5 all share the
     depth-3 indent/card width instead of collapsing or running off-screen. */
  const deepDoc = 'title: Deep chain\noutcome: Grow retention\n  Users forget mid-afternoon habits\n' +
    '    Notifications feel spammy\n      Users mute after first week\n        Frequency too high\n' +
    '          Smart batching [testing]\n            ? batching preserves timing';
  const dm = wparse(deepDoc);
  const dpr = project(dm);
  variants['why-ost-narrow-deep'] = norm(renderOst(dm, dpr, {...ctxBase, edit: true, width: 360}));

  /* Gate B: a committed solution with a broken assumption — the map view's
     at-risk ghost (dashed + BROKEN ASSUMPTION badge, still fully editable).
     Otherwise unreachable by the fixtures above, all of which stay healthy. */
  const brokenDoc = 'title: T\noutcome: Retention\n  Forgetting habits\n    Shaky reminders [delivering]\n      ? habit sticks [broken]';
  const bm = wparse(brokenDoc);
  const bpr = project(bm);
  variants['why-map-broken'] = norm(renderMap(bm, bpr, {...ctxBase, edit: true}));
}

/* /map fixtures (dates normalised) */
{
  const {parse: mparse} = await import('../map/parse.js');
  const {resolve: mresolve} = await import('../map/zones.js');
  const {readout: mreadout} = await import('../map/readout.js');
  const {render: mrender} = await import('../map/render.js');
  const norm = s => s.replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  const mk = (src, extra = {}) => {
    const m = mparse(src);
    const r = mresolve(m);
    return norm(mrender(m, r, mreadout(m, r), {...ctxBase, ...extra}));
  };
  const mdocs = {
    'map-assumptions': 'preset: assumptions\ntitle: T\nA @ 20,80 :: test: interview five\nB @ 70,60\nC @ 40,90\nD',
    'map-stakeholders': 'preset: stakeholders\nCFO @ 30,85 :: attitude: sceptical\nSupport lead @ 80,40',
    'map-futures': 'preset: futures\nx: Regulation (light → strict)\ny: Adoption (slow → fast)\nzone 1,2: Walled gardens\nSignal one @ 20,75\nSignal two @ 80,30',
    'map-risk': 'preset: risk\nSlip @ 60,85 :: owner: core\nRejection @ 35,90\nQuiet risk @ 20,20',
    'map-skills': 'preset: skills\ntitle: T\nPayments integration @ 20,90 :: owner: Priya\nRelease pipeline @ 30,80 :: owner: Sam :: backup: Jo\nDesign system @ 65,55\nCopywriting @ 85,25',
    'map-rag': 'preset: rag\ntitle: T\nBilling revamp @ 25,30 :: reported: green\nOnboarding funnel @ 75,70 :: reported: green\nPartner API @ 80,30 :: reported: red',
    'map-custom': 'title: C\nx: Effort (low → high)\ny: Value (low → high)\nzones: grid 3x3\nzone 1,3: Quick wins\nzone band: x + y > 120\nThing @ 20,80\nOther @ 60,40',
  };
  for(const [k, src] of Object.entries(mdocs)) variants[k] = mk(src);
  const {mapDiff, mapDiffView} = await import('../map/diff.js');
  const oldMap = mparse('preset: assumptions\ntitle: T\nA @ 60,30 :: test: interview five\nB @ 70,60\nGone @ 10,10\nD');
  const curMap = mparse(mdocs['map-assumptions']);
  const md = mapDiffView(mapDiff(oldMap, curMap), 'SNAP');
  const rr = mresolve(curMap);
  variants['map-diff'] = norm(mrender(curMap, rr, mreadout(curMap, rr), {...ctxBase}, md));
  variants['map-assumptions-slide'] = mk(mdocs['map-assumptions'], {slide: true});
  variants['map-verdict-off'] = mk('verdict: off\n' + mdocs['map-assumptions']);
  variants['map-verdict-authored'] = mk('verdict: We test A before anything else\n' + mdocs['map-assumptions']);

  const pm = mparse(mdocs['map-assumptions']);
  const pr = mresolve(pm);
  const pro = mreadout(pm, pr);
}

/* /gauge overlay fixtures (fully deterministic) */
{
  const {parse: gparse} = await import('../gauge/parse.js');
  const {sessionStats: gstats} = await import('../gauge/engine.js');
  const {renderOverlay: grender} = await import('../gauge/render-overlay.js');
  const doc = 'title: T\nnames: on\nShip by Q3 :: prob\nWeeks to migrate :: range weeks';
  const m = gparse(doc);
  const resp = [
    {values: [80, [4, 8]], name: 'Ana'},
    {values: [75, [6, 12]], name: 'Ben'},
    {values: [20, [5, 9]], name: 'Cy'},
    {values: [15, [30, 50]], name: 'Di'},
  ];
  variants['gauge-overlay'] = grender(m, gstats(m, resp), {...ctxBase});
  /* `verdict:` (2026-07-31): gauge was the one tool with no golden for the key,
     and the one where review found two live bypasses. */
  const gOff = gparse('verdict: off\n' + doc);
  variants['gauge-verdict-off'] = grender(gOff, gstats(gOff, resp), {...ctxBase});
  const gAuth = gparse('verdict: The room is split on shipping\n' + doc);
  variants['gauge-verdict-authored'] = grender(gAuth, gstats(gAuth, resp), {...ctxBase});
  const agree = [{values: [[4, 8]]}, {values: [[5, 9]]}, {values: [[3, 7]]}];
  const m2 = gparse('Weeks :: range weeks');
  variants['gauge-overlay-agree'] = grender(m2, gstats(m2, agree), {...ctxBase});
  const mc = gparse('title: Feature bets\nnames: on\nPick the Q3 bet :: chips Streak overhaul | Social feed | Onboarding polish');
  const cresp = [{values: [[50, 30, 20]], name: 'Ana'}, {values: [[45, 35, 20]], name: 'Ben'},
    {values: [[40, 35, 25]], name: 'Cy'}, {values: [[0, 100, 0]], name: 'Di'}];
  variants['gauge-overlay-chips'] = grender(mc, gstats(mc, cresp), {...ctxBase});
  /* narrow (phone) relayout: same fixtures at a 360px width */
  variants['gauge-overlay-narrow'] = grender(m, gstats(m, resp), {...ctxBase}, {width: 360});
  variants['gauge-overlay-chips-narrow'] = grender(mc, gstats(mc, cresp), {...ctxBase}, {width: 360});
}

/* /flow readout fixtures (seeded sim → deterministic) */
{
  const {simulate, wipSweep, kneeWip} = await import('../flow/engine.js');
  const {renderReadout} = await import('../flow/render.js');
  for(const [name, params] of [
    ['flow-default', {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5}],
    ['flow-overloaded', {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 12, cov: 1.0}],
  ]){
    const result = simulate(params);
    const sweep = wipSweep(params);
    variants[name] = renderReadout(result, sweep, kneeWip(sweep), params, {...ctxBase,
      colors: {...ctxBase.colors, track: '#edf0ee'}});
  }

  /* batch U-curve + queue triage panels (#75, #65) */
  const {leverTriage} = await import('../flow/engine.js');
  const {batchEconomics} = await import('../flow/economics.js');
  const {renderBatch, renderTriage, renderExpedite, renderDice} = await import('../flow/render.js');
  const {expediteSensitivity} = await import('../flow/expedite.js');
  const {diceGame} = await import('../flow/dice.js');
  const fctx = {...ctxBase, colors: {...ctxBase.colors, track: '#edf0ee'}};
  const econP = {demandPerWeek: 3, transactionCost: 1000, holdCostPerItemWeek: 500, currentBatch: 8, maxBatch: 30};
  variants['flow-batch'] = renderBatch(batchEconomics(econP), econP, fctx);
  const healthyP = {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
  const overP = {demandPerWeek: 6, itemDays: 4, team: 4, wipLimit: 4, cov: 0.5};
  variants['flow-triage-drain'] = renderTriage(leverTriage(overP, {initialBacklog: 20}), overP, 20, fctx);
  variants['flow-triage-lead'] = renderTriage(leverTriage(healthyP, {initialBacklog: 0}), healthyP, 0, fctx);
  variants['flow-expedite'] = renderExpedite(expediteSensitivity(healthyP, {expeditePerWeek: 1}), fctx);
  variants['flow-dependent-dice'] = renderDice(diceGame({days: 30, seed: 4}), fctx);
}

/* /fermi driver-tree fixtures (#73): seeded MC → deterministic sens → exact SVG */
{
  const E = await import('../fermi/engine.js');
  const {renderDriverTree} = await import('../fermi/render-driver.js');
  const {quantile} = await import('../assets/series.js');
  const build = (f, ranges) => {
    const ast = E.parse(E.tokenize(f));
    const varNames = E.collectVars(ast, []);
    const dists = {};
    for(const n of varNames) dists[n] = 'auto';
    const m = {ast, varNames, ranges, dists};
    const {sorted} = E.simulateModel(m, {seed: 0x5EED, n: 20000});
    const p10 = quantile(sorted, .1), p50 = quantile(sorted, .5), p90 = quantile(sorted, .9);
    return {...m, p10, p50, p90, ...E.computeSensitivity(m, {seed: 0x5EED, p10, p90})};
  };
  variants['fermi-driver-meeting'] = renderDriverTree(
    build('attendees * hourly_cost * meeting_hours * weeks_per_year',
      {attendees: [6, 10], hourly_cost: [60, 120], meeting_hours: [0.75, 1.5], weeks_per_year: [44, 48]}),
    {...ctxBase, colors: {...ctxBase.colors, accent2: '#c62'}});
  variants['fermi-driver-pianos'] = renderDriverTree(
    build('households * share_with_piano * tunings_per_year / (tunings_per_day * working_days)',
      {households: [3e6, 4e6], share_with_piano: [0.02, 0.08], tunings_per_year: [0.5, 2],
       tunings_per_day: [2, 5], working_days: [220, 260]}),
    {...ctxBase, colors: {...ctxBase.colors, accent2: '#c62'}});
}

/* /fermi cashflow fixtures (#13): seeded → deterministic */
{
  const {simulateCashflow} = await import('../fermi/cashflow.js');
  const {renderCashflow} = await import('../fermi/render-cashflow.js');
  const R = (lo, hi) => ({lo, hi});
  const cctx = {...ctxBase, colors: {...ctxBase.colors, accent2: '#c62'}};
  const invest = {periods: [R(-250e3, -180e3), R(-40e3, 20e3), R(30e3, 90e3), R(60e3, 140e3)],
    horizon: 5, grain: 'year', rate: R(8, 12)};
  variants['fermi-cashflow-invest'] = renderCashflow(simulateCashflow(invest, {seed: 0xCA5F, n: 10000}), invest, cctx);
  const runway = {periods: [R(400e3, 400e3), R(-45e3, -25e3)], horizon: 24, grain: 'month', rate: R(0, 0)};
  variants['fermi-cashflow-runway'] = renderCashflow(simulateCashflow(runway, {seed: 0xCA5F, n: 10000}), runway, cctx);
  const geared = {periods: [R(-7.2e6, -6.8e6), ...Array(15).fill(R(880e3, 1.35e6))], horizon: 15,
    grain: 'year', rate: R(9, 11), debt: {dscr: 1.45, costOfDebt: 0.065, tenor: 9, sizingCase: 'central'}};
  variants['fermi-cashflow-geared'] = renderCashflow(simulateCashflow(geared, {seed: 0xCA5F, n: 10000}), geared, cctx);
}

/* /timeline fixtures (today pinned in the doc → deterministic) */
{
  const {parse: tparse} = await import('../timeline/parse.js');
  const {render: trender} = await import('../timeline/render.js');
  const {timelineDiff, timelineDiffView} = await import('../timeline/diff.js');
  const tdoc = 'title: T — programme\ntoday: 2026-07-06\nGrid: Offer 2026-08 .. 2026-10\nGrid: Energisation 2027-02-15 .. 2027-06-01 [risk] // long pole\nBuild: FID 2026-06-30 [done]\nBuild: Vendor selection 2026-11';
  const tOld = 'title: T — programme\ntoday: 2026-07-06\nGrid: Offer 2026-08 .. 2026-10\nGrid: Energisation 2027-01 .. 2027-04\nBuild: FID 2026-06-30 [done]\nBuild: Dropped thing 2026-12 .. 2027-01';
  const tm = tparse(tdoc);
  const tctx = {...ctxBase, today: 20640};
  variants['timeline-default'] = trender(tm, tctx);
  variants['timeline-slide'] = trender(tm, {...tctx, slide: true});
  variants['timeline-diff'] = trender(tm, tctx,
    timelineDiffView(timelineDiff(tparse(tOld), tm), 'JUNE PACK'));

  // short whisker + long label → today the P90 diamond splices the date text.
  // NOTE SEPARATOR IS // (the DSL), not · (· is only the renderer's formatting of a
  // parsed note; a · in the source makes parse fail the 2nd date → a single, and the
  // re-anchor gate !single would EXCLUDE it — the fixture wouldn't pin the bug).
  // tlShort pins BOTH arms: Feature freeze → right-of-P90, Store review → flip-left.
  const tlShort = 'title: Q3 launch\nApp: Feature freeze 2026-08-14 .. 2026-08-28\n' +
    'App: Store review passed 2026-10-15 .. 2026-11-15 // review times vary wildly';
  variants['timeline-shortwhisker'] = trender(tparse(tlShort), {...tctx});
  /* `verdict:` (2026-07-31): off collapses the readout band; authored replaces the
     line AND drops the tool's operational "rest" bits that followed it. */
  variants['timeline-verdict-off'] = trender(tparse('verdict: off\n' + tdoc), tctx);
  variants['timeline-verdict-authored'] = trender(tparse('verdict: We hold the energisation date\n' + tdoc), tctx);
  // pins the M4 packing push: item 1's dates+note sub-line is wider than its label.
  const tlNote = 'title: Notes\nApp: Ship it 2026-08-01 .. 2026-08-05 // a deliberately long trailing note that runs wide\n' +
    'App: Next thing 2026-08-20';
  variants['timeline-longnote'] = trender(tparse(tlNote), {...tctx});

  // narrow relayout (Ship 2): the same docs at a phone container width render the
  // stacked shared-axis relayout (renderNarrow) — lane sections, per-milestone track
  // bands with the whisker on one shared axis. The diff variant carries width in its
  // ctx (2nd arg) so compare (ghosts/slips/since/NEW/dropped) is exercised on narrow.
  variants['timeline-narrow'] = trender(tm, {...tctx, width: 360});
  variants['timeline-narrow-diff'] = trender(tm, {...tctx, width: 360},
    timelineDiffView(timelineDiff(tparse(tOld), tm), 'JUNE PACK'));

  // merge-bias: ≥2 ranged lane-completions ⇒ the 2nd readout row + the merge-risk verdict
  const tMerge = 'title: Programme — merge risk\ntoday: 2026-07-06\n' +
    'Grid: Energisation 2027-02 .. 2027-06 [risk]\nBuild: Commissioning 2027-03 .. 2027-08\nConsents: DCO 2027-01 .. 2027-05';
  const tmm = tparse(tMerge);
  variants['timeline-mergebias'] = trender(tmm, tctx);

  // [fixed]: ink diamonds + the deadline verdict (3 ranged lanes racing an external gate)
  const tFix = 'title: Consent programme\ntoday: 2026-07-06\n' +
    'Ofgem decision 2026-12-01 [fixed]\n' +
    'Grid: Energisation 2026-09 .. 2026-11\nBuild: Commissioning 2026-10 .. 2027-01\n' +
    'Consents: DCO 2026-08 .. 2026-10';
  const tfm = tparse(tFix);
  variants['timeline-fixed'] = trender(tfm, tctx);
  variants['timeline-fixed-narrow'] = trender(tfm, {...tctx, width: 360});

  /* Last-responsible-moment: a named decision clock, not another forecast bar.
     Wide + phone pin the derived diamond/receipt, while the fixed event still
     participates as the ordinary external date it always was. */
  const tLead = 'title: Office move — decision clock\ntoday: 2026-08-01\n' +
    'Fit-out: Construction complete 2026-09 .. 2026-12\n' +
    'IT: Network installed 2026-11 .. 2027-01\n' +
    'Lease ends 2027-02-28 [fixed] [lead: 6w]';
  const tlm = tparse(tLead);
  variants['timeline-lrm'] = trender(tlm, tctx);
  variants['timeline-lrm-narrow'] = trender(tlm, {...tctx, width: 360});

}

/* /risk fixtures (seeded engine → deterministic) */
{
  const {parse: rparse} = await import('../energy/risk/parse.js');
  const {simulate, fmtUnit: rFmtUnit} = await import('../energy/risk/engine.js');
  const {render: rrender, riskVerdict, focusedIndex} = await import('../energy/risk/render.js');
  const rdoc = 'title: Route to market — Wexcombe 100MW/2h\nmerchant: 60..180\n' +
    'floor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30';
  const rm = rparse(rdoc);
  const rs = simulate(rm);
  variants['risk-routes'] = rrender(rm, rs, {...ctxBase});
  variants['risk-routes-slide'] = rrender(rm, rs, {...ctxBase, slide: true});
  variants['risk-routes-narrow'] = rrender(rm, rs, {...ctxBase, width: 360});
  variants['risk-routes-focus'] = rrender(rm, rs, {...ctxBase}, {edit: true, focus: 2});
  /* `verdict:` (2026-07-31): off collapses the trade band (the svg height follows),
     authored replaces the line and drops the row name from the kicker. */
  const rmOff = rparse('verdict: off\n' + rdoc);
  variants['risk-verdict-off'] = rrender(rmOff, simulate(rmOff), {...ctxBase});
  const rmAuth = rparse('verdict: We take the floor and live with the cap\n' + rdoc);
  variants['risk-verdict-authored'] = rrender(rmAuth, simulate(rmAuth), {...ctxBase});

  const rFi = focusedIndex(rs.rows, null);
  const rRow = rs.rows[rFi];
}

/* /cycles fixtures (seeded engine → deterministic; n reduced for capture speed) */
{
  const {parse: cparse} = await import('../energy/cycles/parse.js');
  const {simulate: csim, verdict: cVerdict, fmtUnit: cFmtUnit} = await import('../energy/cycles/engine.js');
  const {render: crender} = await import('../energy/cycles/render.js');
  const cdoc = 'title: Cycle budget — Wexcombe 100MW/2h\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over 15yr\naugment: 120..180 £/kWh\ndiscount: 7..10%';
  const cm = cparse(cdoc);
  const co = csim(cm, {seed: 1, n: 2000});
  variants['cycles-full'] = crender(cm, co, {...ctxBase});
  variants['cycles-full-slide'] = crender(cm, co, {...ctxBase, slide: true});
  variants['cycles-full-narrow'] = crender(cm, co, {...ctxBase, width: 360});
  const cmOff = cparse('verdict: off\n' + cdoc);
  variants['cycles-verdict-off'] = crender(cmOff, csim(cmOff, {seed: 1, n: 2000}), {...ctxBase});
  const cmAuth = cparse('verdict: Cycle harder, the spread pays\n' + cdoc);
  variants['cycles-verdict-authored'] = crender(cmAuth, csim(cmAuth, {seed: 1, n: 2000}), {...ctxBase});
  const cg = cparse(cdoc.replace('second: 35..60%\n', '').replace('augment: 120..180 £/kWh\n', ''));
  variants['cycles-ghosts'] = crender(cg, csim(cg, {seed: 1, n: 2000}), {...ctxBase}, {edit: true});

}

/* /frequency fixtures (pure ODE, no seed needed — deterministic by construction) */
{
  const {simulate: fsim} = await import('../energy/frequency/engine.js');
  const {renderTrace: frender} = await import('../energy/frequency/render.js');
  const fp = {trip: 1.8, eSync: 80, drMw: 0.5, dmMw: 0.5, dcMw: 1.5, battMW: 2.5, eGfm: 20, load: 30};
  variants['frequency-rescue'] = frender(fsim(fp), fp, {...ctxBase});
  const fShed = {trip: 1.8, eSync: 80, load: 30};
  variants['frequency-2030'] = frender(fsim(fShed), fShed, {...ctxBase});
}

/* /merit-order fixtures (pure engine, no seed needed — deterministic by construction) */
{
  const {renderStack, MERIT_PALETTE} = await import('../energy/merit-order/render.js');
  const {buildStack} = await import('../energy/merit-order/stack.js');
  const {DEFAULT_PARAMS, paramsFor, WORLDS} = await import('../energy/merit-order/scenarios.js');
  const mctx = {...ctxBase, palette: MERIT_PALETTE.light};
  const mk = p => ({generators: buildStack(p), demand: p.demand});
  const mkw = (w, p) => ({generators: buildStack(p, WORLDS[w].catalogue), demand: p.demand});
  // labelCollide:'drop' matches the live page (app.js) — merit-order opted in 2026-07-11
  const mopts = {forExport: true, labelCollide: 'drop'};
  variants['merit-order-typical'] = renderStack(mk(DEFAULT_PARAMS), mctx, mopts);
  variants['merit-order-typical-narrow'] = renderStack(mk(DEFAULT_PARAMS), {...mctx, width: 360}, mopts);
  variants['merit-order-negative'] = renderStack(mk(paramsFor('gbToday', 'negative')), mctx, mopts);
  variants['merit-order-fes-ht'] = renderStack(mkw('ht', paramsFor('ht', null)), mctx, mopts);
  variants['merit-order-fes-he-coldpeak'] = renderStack(mkw('he', paramsFor('he', 'coldPeak')), mctx, mopts);

  const {buildVerdict: moVerdict} = await import('../energy/merit-order/render.js');
  const {dispatch: moDispatch} = await import('../energy/merit-order/engine.js');
  const moState = mk(DEFAULT_PARAMS);
  const moResult = moDispatch(moState.generators, moState.demand);
}

/* /intraday fixtures (deterministic by construction) */
{
  const {runDay, DAY_DEFAULTS} = await import('../energy/intraday/day.js');
  const {renderDay} = await import('../energy/intraday/render-day.js');
  const {MERIT_PALETTE} = await import('../energy/merit-order/render.js');
  const ictx = {width: 900, height: 420, palette: MERIT_PALETTE.light,
    colors: {ink: '#1b2733', muted: '#66727e', accent: '#C05621', grid: '#e3e7ea', card: '#ffffff'}};
  const pFleet = {...DAY_DEFAULTS, fleetGW: 6};
  variants['intraday-raw'] = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ictx, {forExport: true});
  variants['intraday-fleet'] = renderDay(runDay(pFleet), pFleet, ictx, {forExport: true});
  variants['intraday-fleet-narrow'] = renderDay(runDay(pFleet), pFleet, {...ictx, width: 360}, {forExport: true});
}

/* /case fixtures (typographic cover → deterministic) */
{
  const {parse: cparse} = await import('../case/parse.js');
  const {render: crender} = await import('../case/render.js');
  const {planningRole} = await import('../case/planning-context.js');
  const cdoc = 'title: Wexcombe augmentation\nquestion: Augment in 2029, or run the fleet down?\n' +
    'status: decided\nverdict: We augment — the warranty binds 3 years before the wear does\n' +
    'Money: Augment NPV model -> /fermi/#abc // the £ case\nMoney: Board options -> /tree/#def\n' +
    'Decision: Outcome plan -> /paths/#ghi\nDelivery: Timing forecast -> /timeline/#jkl\n' +
    'Risk: Premortem register -> /premortem/#mno';
  const cctx = {...ctxBase, today: '2026-08-02'};
  const context = model => ({...model, exhibits:model.exhibits.map(exhibit =>
    ({...exhibit, planning:planningRole(exhibit.url)}))});
  const cm = context(cparse(cdoc));
  variants['case-cover'] = crender(cm, cctx);
  const cOpen = context(cparse(cdoc.replace('status: decided', 'status: open').replace(/verdict: [^\n]*\n/, '')));
  variants['case-open'] = crender(cOpen, cctx);
  const cGhost = context(cparse(cdoc + '\nUnlinked thing -> https://example.com/x'));
  variants['case-ghost'] = crender(cGhost, cctx);
  variants['case-narrow'] = crender(cm, {...cctx, width: 390});
  const cProjection = context(cparse('title: Habitat delivery projection\nstatus: open\n' +
    'Delivery: Chosen outcome -> /roadmap/#x'));
  cProjection.exhibits[0].planning = {kind:'roadmap', role:'Delivery projection', scope:'One exact Paths outcome',
    basis:{source:'Habitat growth decisions',
      known:[{key:'pricing', direction:'yes', date:'2026-08-03'}],
      assumed:[{key:'groups', direction:'no', date:'2026-08-12'}]}};
  variants['case-projection'] = crender(cProjection, cctx);
}

/* /wardley fixtures (pure layout → deterministic) */
{
  const {parse: wparse} = await import('../wardley/parse.js');
  const {layoutMap} = await import('../wardley/layout.js');
  const {renderMap: wrender, mapReadout} = await import('../wardley/render.js');
  const wdoc = 'title: Habitat platform\nanchor: Habit tracking\n' +
    'Streak engine @ custom\nNotification service @ product\nUser DB @ commodity\nPush gateway\n' +
    'Habit tracking -> Streak engine -> Notification service -> Push gateway\nStreak engine -> User DB';
  const wPrev = wdoc.replace('Streak engine @ custom', 'Streak engine @ 0.30')
    .replace('\nUser DB @ commodity', '\nUser DB @ commodity\nOld cache @ product')
    .replace('Streak engine -> User DB', 'Streak engine -> User DB\nStreak engine -> Old cache');
  const wctx = {...ctxBase, palette: ['#4C8DAE', '#5E9E6F', '#B5885A', '#8B7BB8']};
  const wm = wparse(wdoc);
  variants['wardley-map'] = wrender(wm, layoutMap(wm), wctx);
  const wmOff = wparse('verdict: off\n' + wdoc);
  variants['wardley-verdict-off'] = wrender(wmOff, layoutMap(wmOff), wctx);
  const wmAuth = wparse('verdict: Buy the gateway, build the engine\n' + wdoc);
  variants['wardley-verdict-authored'] = wrender(wmAuth, layoutMap(wmAuth), wctx);
  variants['wardley-compare'] = wrender(wm, layoutMap(wm), wctx,
    {compare: {prev: wparse(wPrev), label: 'March'}});
  variants['wardley-narrow'] = wrender(wm, layoutMap(wm), {...wctx, width: 390});
  variants['wardley-edit'] = wrender(wm, layoutMap(wm), wctx, {edit: true});
  variants['wardley-narrow-edit'] = wrender(wm, layoutMap(wm), {...wctx, width: 390}, {edit: true});

  const wComps = layoutMap(wm).nodes.filter(n => !n.anchor);
  const wGhosts = wComps.filter(n => n.ghost).length;
}

/* /bets fixtures (DSL → seeded MC → board; deterministic) */
{
  const {parse: bparse} = await import('../bets/parse.js');
  const {simulate} = await import('../bets/engine.js');
  const {renderBoard} = await import('../bets/render.js');
  const bdoc = 'title: Q3 product portfolio\nunit: £k\n' +
    'Growth\n  Search revamp: stake 120, odds 30-50%, payoff 400-900\n    kill: CTR flat after 2 sprints by 2026-09-01\n' +
    '  Paid acq push: stake 80, odds 20-30%, payoff 90-140\n' +
    'Platform\n  Billing rewrite: stake 200, odds 90-100%, payoff 250-350';
  const bm = bparse(bdoc), bsim = simulate(bm);
  variants['bets-board'] = renderBoard(bm, bsim, ctxBase);
  variants['bets-narrow'] = renderBoard(bm, bsim, {...ctxBase, width: 390});

  const {verdictCopy: betsVerdict} = await import('../bets/engine.js');
  const bCounts = {kill: 1};

  /* view 2: risk-return quadrant (read-only; no compare wiring) */
  const {renderQuadrant} = await import('../bets/render-quadrant.js');
  variants['bets-quadrant'] = renderQuadrant(bm, bsim, ctxBase);
  variants['bets-quadrant-narrow'] = renderQuadrant(bm, bsim, {...ctxBase, width: 390});

  /* crowded fixture: the point of the greedy label-placement task — 12 bets
     across 3 lanes, several deliberately clustered near break-even (odds
     ~42-58%) and near each other so placement is genuinely stress-tested. */
  const crowdedDoc = 'title: Q4 crowded portfolio\nunit: £k\n' +
    'Growth\n  Search revamp: stake 120, odds 40-55%, payoff 300-500\n' +
    '    kill: CTR flat after 2 sprints by 2026-09-01\n' +
    '  Onboarding tweak: stake 60, odds 45-55%, payoff 90-140\n' +
    '  Referral loop: stake 50, odds 42-52%, payoff 80-130\n' +
    '  Paid acq test: stake 70, odds 35-50%, payoff 100-160\n' +
    'Platform\n  Billing rewrite: stake 200, odds 90-100%, payoff 250-350\n' +
    '  Infra migration: stake 90, odds 48-58%, payoff 120-200\n' +
    '  API v2: stake 40, odds 44-54%, payoff 60-100\n' +
    '  Cache layer: stake 55, odds 46-56%, payoff 70-120\n' +
    'Risk\n  Sure loser: stake 100, odds 10-20%, payoff 50-80\n' +
    '  Moonshot: stake 30, odds 5-15%, payoff 800-1500\n' +
    '  Compliance fix: stake 80, odds 47-53%, payoff 100-150\n' +
    '    kill: no lift after 1 sprint by 2026-10-01\n' +
    '  Support tool: stake 45, odds 43-53%, payoff 65-110';
  const bmCrowded = bparse(crowdedDoc), bsimCrowded = simulate(bmCrowded);
  variants['bets-quadrant-crowded'] = renderQuadrant(bmCrowded, bsimCrowded, ctxBase);
  variants['bets-quadrant-crowded-narrow'] = renderQuadrant(bmCrowded, bsimCrowded, {...ctxBase, width: 390});

  /* snapshot compare fixture: vs bdoc, "Paid acq push" is new, "Old idea" was
     killed, and Billing rewrite's odds moved 60-75% -> 90-100%. */
  const {betsDiff, betsDiffView} = await import('../bets/diff.js');
  const boldDoc = 'title: Q3 product portfolio\nunit: £k\n' +
    'Growth\n  Search revamp: stake 120, odds 30-50%, payoff 400-900\n    kill: CTR flat after 2 sprints by 2026-09-01\n' +
    '  Old idea: stake 40, odds 25-35%, payoff 60-100\n' +
    'Platform\n  Billing rewrite: stake 200, odds 60-75%, payoff 250-350';
  const bOld = bparse(boldDoc), bPrevSim = simulate(bOld);
  const bView = betsDiffView(betsDiff(bOld, bm), '2026-06-01');
  const bCompareCtx = {...ctxBase, compare: {...bView, prevSim: bPrevSim}};
  variants['bets-compare'] = renderBoard(bm, bsim, bCompareCtx);
  variants['bets-compare-narrow'] = renderBoard(bm, bsim, {...bCompareCtx, width: 390});
}

/* /paths fixtures: real DSL through the complete semantic projection. The wide
   tree and narrow outline share one authored document so both presentations are
   byte-gated against the same answered/open topology; the refusal fixture pins
   the explicit Tree boundary when plan enumeration exceeds its safe limit. */
{
  const {parse: parsePaths} = await import('../paths/parse.js');
  const {project: projectPaths} = await import('../paths/project.js');
  const {treeProjection} = await import('../paths/tree.js');
  const {treeLayout} = await import('../paths/layout-tree.js');
  const {renderTree, renderOutline} = await import('../paths/render-tree.js');
  const {renderPlans, renderPlansNarrow} = await import('../paths/render-plans.js');
  const pathsDoc = 'title: Habitat decision paths\ndate: 2026-08-11\nverdict: Keep the rollout reversible while groups remains open\n' +
    'decision reminders:\n  question: Do adaptive reminders improve week-four retention?\n' +
    '  signal: week-four retention\n  reading: +6 percentage points\n  owner: Core\n' +
    '  answer-by: 2026-07-24\n  answer: yes 2026-07-22 -- experiment HBT-42\n' +
    'decision groups:\n  question: Will people invite three friends without prompting?\n' +
    '  signal: invites per active user\n  reading: 2.4\n  owner: Growth\n  answer-by: 2026-09-15\n' +
    'NOW\n  Core: Streak repair [done]\n  Core: Adaptive reminder rollout [doing] [if reminders] -- staged release\n' +
    '  Core: Manual reminder fallback [unless reminders]\n' +
    'NEXT\n  Growth: Friend invite prompt [risk] [if groups]\n' +
    '  Platform: Moderation controls [blocked] [if groups and reminders] -- privacy review\n' +
    'LATER\n  Growth: Solo challenges [unless groups]';
  const pathsProjected = projectPaths(parsePaths(pathsDoc), '2026-08-11');
  const pathsTree = treeProjection(pathsProjected);
  const pathsCtx = {...ctxBase, today:'2026-08-11', projection:pathsProjected};
  variants['paths-tree'] = renderTree(pathsTree,
    treeLayout(pathsTree, {width:1160, measure:ctxBase.measure}), pathsCtx);
  variants['paths-outline-narrow'] = renderOutline(pathsTree, {...pathsCtx, width:390});
  const plansProjected = projectPaths(parsePaths(pathsDoc.replace(
    'title: Habitat decision paths', 'style: plans\ntitle: Habitat possible plans')), '2026-08-11');
  const plansCtx = {...ctxBase, today:'2026-08-11', projection:plansProjected};
  variants['paths-plans'] = renderPlans(plansProjected, {...plansCtx, width:1160});
  variants['paths-plans-narrow'] = renderPlansNarrow(plansProjected, {...plansCtx, width:390});

  const openDecision = index => 'decision q' + index + ':\n  question: Is signal ' + index + ' strong enough?\n' +
    '  signal: signal ' + index + '\n  owner: Team ' + index + '\n  answer-by: 2026-09-' +
    String(index + 10).padStart(2, '0');
  const refusedDoc = 'title: Seven-question boundary\ndate: 2026-08-11\n' +
    Array.from({length:7}, (_, index) => openDecision(index)).join('\n') +
    '\nNOW\n  Core: Shared foundation\n' +
    Array.from({length:7}, (_, index) => '  Team ' + index + ': Conditional work ' + index + ' [if q' + index + ']').join('\n');
  const refusedProjected = projectPaths(parsePaths(refusedDoc), '2026-08-11');
  const refusedTree = treeProjection(refusedProjected);
  variants['paths-tree-refused'] = renderTree(refusedTree,
    treeLayout(refusedTree, {width:1160, measure:ctxBase.measure}),
    {...ctxBase, today:'2026-08-11', projection:refusedProjected});
  const refusedPlans = projectPaths(parsePaths('style: plans\n' + refusedDoc), '2026-08-11');
  variants['paths-plans-refused'] = renderPlans(refusedPlans,
    {...ctxBase, today:'2026-08-11', projection:refusedPlans, width:1160});
}

/* /alarm fixtures (pure numeric params → deterministic) */
{
  const {renderDistributions} = await import('../alarm/render.js');
  variants['alarm-dist'] = renderDistributions({baseRate: 0.02, dprime: 2, t: 1.2}, ctxBase.colors, {w: 900, h: 220});
}

/* /signal-vs-noise fixtures (seeded scenario → deterministic): mid-game grid at
   3 cols and the 1-col narrow relayout, plus the collapse verdict artefact. */
{
  const {makeScenario, AUTHORED_SEED} = await import('../signal-vs-noise/engine.js');
  const {renderGrid, renderCollapse} = await import('../signal-vs-noise/render.js');
  const s = makeScenario(AUTHORED_SEED);
  const calls = [{person: 3, quarter: 3}, {person: 5, quarter: 4}, {person: s.signalPerson, quarter: 7}];
  variants['signal-noise-grid'] = renderGrid(s, ctxBase.colors, {turn: 4, calls, width: 1088});
  variants['signal-noise-grid-narrow'] = renderGrid(s, ctxBase.colors, {turn: 4, calls, cols: 1});
  variants['signal-noise-collapse'] = renderCollapse(s, ctxBase.colors, calls, {width: 1088});
  variants['signal-noise-collapse-narrow'] = renderCollapse(s, ctxBase.colors, calls, {width: 356});
}

/* /paths Overview: one fixture deliberately carries parallel active work plus
   every secondary decision state. The wide export pins the canonical
   period-by-lane grid and complete state ledger; narrow pins the agenda
   relayout without changing the underlying work or decision identities. */
{
  const {parse:parsePaths} = await import('../paths/parse.js');
  const {project:projectPaths} = await import('../paths/project.js');
  const {overviewProjection, decisionImpactProjection} = await import('../paths/overview.js');
  const {renderOverview, renderOverviewNarrow} = await import('../paths/render-overview.js');
  const {renderDependencies, renderDependenciesNarrow} = await import('../paths/render-dependencies.js');
  const {renderQuestionLens, renderQuestionLensNarrow} = await import('../paths/render-question-lens.js');
  const {renderConditions, renderConditionsNarrow} = await import('../paths/render-conditions.js');
  const {learningAgendaProjection} = await import('../paths/learning-agenda.js');
  const {renderLearningAgenda, renderLearningAgendaNarrow} = await import('../paths/render-learning-agenda.js');
  const decision = (name, extra = '') => `decision ${name}:\n  question: Does ${name} hold?\n` +
    `  signal: measurable ${name}\n  reading: current ${name}\n  owner: ${name} owner\n` +
    `  answer-by: 2026-08-10${extra}\n`;
  const source = 'title: Parallel Habitat\ndate: 2026-08-11\nverdict: Keep both routes reversible\n' +
    decision('pricing') + decision('groups', '\n  assume: no 2026-08-11') +
    decision('settled', '\n  answer: yes 2026-08-10 -- experiment HBT-42') +
    decision('host', '\n  answer: yes 2026-08-10') + decision('pending') +
    decision('later-question', '\n  when: pending') + decision('retired-question', '\n  when: not host') +
    'decision repair:\n  question: Repair this?\n  answer-by: 2026-08-10\n' +
    'NOW\n  Core: Shared foundation [doing]\n  Growth: Price route [if pricing]\n' +
    'NEXT\n  Core: Joint route [if pricing and groups]\n  Growth: Either experiment [if pricing or groups]\n' +
    'LATER\n  Core: Fixed-fee route [unless pricing]\n  Growth: Historical launch [if settled] [done]';
  const pathsModel = parsePaths(source);
  const pathsProjected = projectPaths(pathsModel, '2026-08-11');
  const pathsOverview = overviewProjection(pathsProjected);
  const impact = decisionImpactProjection(pathsModel, pathsProjected, 'pricing');
  const pathsCtx = {...ctxBase, selectedKey:'pricing', impact};
  variants['paths-overview'] = renderOverview(pathsOverview, {...pathsCtx, width:1160});
  variants['paths-overview-narrow'] = renderOverviewNarrow(pathsOverview, {...pathsCtx, width:390});
  variants['paths-question'] = renderQuestionLens(pathsOverview, {...pathsCtx, width:1160});
  variants['paths-question-narrow'] = renderQuestionLensNarrow(pathsOverview, {...pathsCtx, width:390});
  variants['paths-conditions'] = renderConditions(pathsOverview, {...pathsCtx, width:1160});
  variants['paths-conditions-narrow'] = renderConditionsNarrow(pathsOverview, {...pathsCtx, width:390});
  const pathsAgenda = learningAgendaProjection(pathsModel, pathsProjected);
  variants['paths-agenda'] = renderLearningAgenda(pathsAgenda, {...pathsCtx, width:1160, selection:false});
  variants['paths-agenda-narrow'] = renderLearningAgendaNarrow(pathsAgenda, {...pathsCtx, width:390, selection:false});
  /* Dependencies is deliberately a selected-decision lens rather than an all-at-once
     graph. Pricing is third in source order here, pinning the focused-anchor behaviour
     alongside direct, AND, OR and negated work. */
  variants['paths-dependencies'] = renderDependencies(pathsOverview, {...pathsCtx, width:1160});
  variants['paths-dependencies-narrow'] = renderDependenciesNarrow(pathsOverview, {...pathsCtx, width:390});
}

/* /proxy: full Hunt is intentionally unselected; receipt is the separately
   scoped artefact. Both wide and narrow pin theory/pattern separation. */
{
  const {parse:parseProxy} = await import('../proxy/parse.js');
  const {project:projectProxy} = await import('../proxy/project.js');
  const {fullHuntProjection} = await import('../proxy/export-projection.js');
  const {renderHunt, renderHuntNarrow, renderHuntReceipt} = await import('../proxy/render-hunt.js');
  const source = 'title: Habitat invite pressure\ndate: 2026-08-13\noutcome: Groups retain after week one\n' +
    'proxy: Invitation rate\naction: Prompt every active member\nmode: optimise\nintended-theory:\n' +
    '  mechanism: A timely prompt helps a member invite a collaborator who returns\nprotects:\n  - New members retain trust\n' +
    'failure-theory fatigue:\n  mechanism: Repeated prompts pressure people into low-intent invitations\n' +
    '  harmed-outcome: New members retain trust\n  guardrail: Seven-day invitee retention\n' +
    '  basis: reasoned-mechanism\n  support: Support conversations show pressure is felt\n' +
    '  weaken-with: Matched cohorts show retained invitees do not fall\nreported-pattern:\n' +
    '  proxy-reading: Invitation rate rose from 11% to 19%\n  outcome: New members retain trust\n' +
    '  outcome-reading: Seven-day invitee retention fell from 42% to 35%\n' +
    '  population: New solo members\n  horizon: First seven days\n  comparator: Prior prompt\n  source: Habitat event readout';
  const model = parseProxy(source);
  const live = projectProxy(model, 'fatigue');
  const full = fullHuntProjection(model);
  variants['proxy-hunt'] = renderHunt(full, {...ctxBase, width:1160, interactive:false});
  variants['proxy-hunt-narrow'] = renderHuntNarrow(full, {...ctxBase, width:390, interactive:false});
  variants['proxy-hunt-receipt'] = renderHuntReceipt(live, {...ctxBase, width:900});
}

/* filenames under dev/golden with uncommitted changes (modified/deleted/untracked),
   or null if git can't be run. cwd-independent (worktree-safe) — resolves the
   repo root from this file, not process.cwd(). */
function dirtyGoldens(){
  const root = fileURLToPath(new URL('..', import.meta.url));
  const r = spawnSync('git', ['-C', root, 'status', '--porcelain', '--', 'dev/golden'], {encoding: 'utf8'});
  if(r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
  return r.stdout.split('\n').filter(Boolean).map(l => l.slice(3).replace(/^dev\/golden\//, ''));
}

const mode = process.argv[2];   // capture | compare | verify (compare + assert committed)
mkdirSync(new URL('./golden/', import.meta.url), {recursive: true});
let fails = 0;
for(const [k, svg] of Object.entries(variants)){
  const file = new URL('./golden/' + k + '.svg', import.meta.url);
  if(mode === 'capture'){
    writeFileSync(file, svg);
    console.log('captured ' + k + ' (' + svg.length + ' chars)');
  } else {
    const want = readFileSync(file, 'utf8');
    if(want === svg) console.log('IDENTICAL ' + k);
    else { console.log('DIFFERS ' + k + ' (' + want.length + ' -> ' + svg.length + ')'); fails++; }
  }
}

/* uncommitted-golden guard (the why-map incident): a `capture` writes to
   dev/golden, so `compare` can pass "IDENTICAL" against edits you never
   committed — a false green that only CI (clean checkout) would catch, and only
   post-merge. `compare` warns loudly at the tail (where the eye lands after the
   IDENTICAL wall); `verify` hard-fails, and is what the pre-merge runner invokes. */
if(mode === 'compare' || mode === 'verify'){
  const dirty = dirtyGoldens();
  if(dirty === null){
    if(mode === 'verify'){ console.error('\ngolden verify: could not run git to check for uncommitted goldens — failing closed.'); process.exit(1); }
    // compare: don't break the dev loop over a missing/again git
  } else if(dirty.length){
    console.error('\nWARNING: ' + dirty.length + ' golden file(s) uncommitted (' + dirty.join(', ') +
      ') — an "IDENTICAL" pass compared against your working-tree edits, NOT committed state.' +
      '\nCommit or revert them before merging (a delegating tool’s goldens shift when a shared renderer changes).');
    if(mode === 'verify') fails++;
  }
}
process.exit(fails ? 1 : 0);
