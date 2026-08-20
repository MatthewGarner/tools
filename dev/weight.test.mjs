/* Bloat tripwires: (a) each page's real load — html + css + its full module
   graph — stays under budget; (b) every shipped .js file is reachable from
   some page (orphans fail). Budgets are ~25% above today's actuals: they trip
   on creep, not on honest features. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {TOOL_DIRS} from './tool-dirs.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');
const size = p => statSync(join(ROOT, p)).size;

function resolveRef(fromDir, ref){
  if(ref.startsWith('/')) return ref.slice(1);
  const parts = (fromDir + '/' + ref).split('/');
  const out = [];
  for(const part of parts){
    if(part === '.' || part === '') continue;
    else if(part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}
function moduleGraph(entry, seen = new Set()){
  if(seen.has(entry)) return seen;
  seen.add(entry);
  const dir = entry.split('/').slice(0, -1).join('/');
  const src = read(entry);
  for(const m of src.matchAll(/(?:import[^'"]*|from\s*|import\()\s*['"]([^'"]+)['"]/g)){
    if(m[1].endsWith('.js')) moduleGraph(resolveRef(dir, m[1]), seen);
  }
  /* new Worker(new URL('./x.js', import.meta.url)) — a module Worker's script
     is a real load-time dependency (the browser fetches it) even though it's
     not a static import; the cycles perf fix (2026-07-12) is the first of
     these. Match it explicitly so a future worker doesn't need an orphan
     exception. */
  for(const m of src.matchAll(/new\s+Worker\(\s*new\s+URL\(\s*['"]([^'"]+)['"]/g))
    if(m[1].endsWith('.js')) moduleGraph(resolveRef(dir, m[1]), seen);
  return seen;
}
function pageLoad(page){
  const dir = page.split('/').slice(0, -1).join('/');
  const html = read(page);
  const files = new Set([page]);
  for(const m of html.matchAll(/<script[^>]*src="([^"]+)"/g))
    moduleGraph(resolveRef(dir, m[1]), files);
  for(const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g))
    files.add(resolveRef(dir, m[1]));
  return files;
}

const PAGES = {
  /* --- unset-edit fix batch (2026-08-04): assets/edit-in-place.js's shared
     opens-row fallback (a missing inline target now opens the same
     interaction anchored at the card-menu trigger, never a silent no-op) —
     plus the opts.kind/opts.raw override, the never-silent announce() path,
     and the review-pass doc comments that came with it — rides EVERY
     attachEditInPlace page, all eleven of them (tree, bets, why, roadmap,
     wardley, map, gauge, case, timeline, energy/risk, energy/cycles).
     Reason written here once rather than per page: only the seven that had
     under ~5k headroom actually needed a bump — roadmap, tree, gauge,
     wardley, case, energy/risk, energy/cycles, each with its own comment
     below — the other four absorbed the same few hundred bytes inside
     existing slack and are untouched. --- */
  /* --- try-it specimens (2026-08-02): syntax-try.js + syntax.css affordance +
     data-try attrs ride the ten DSL pages; each +3k, reason written once. --- */
  /* --- Copy-the-verdict (2026-08-02): wireCopyVerdict/wireCopyTap (~2.6k on
     assets/verdict.js) + the .vcopy chip css (~0.7k on page.css) ride EVERY
     page graph, so every budget below moved once, +3-4k, reason written here
     rather than nineteen times (the Swiss 6b precedent). --- */
  'home/index.html': 40_000,
  /* fermi 120k -> 132k (2026-07-15, debt sizing / levered returns): debt.js
     (sculpt + co-fund + leverTrials), engine.js probit/distQuantile/irrOf, the
     financing card in render-cashflow.js, and the debt inputs in app.js. Eager
     in the first-load graph (cashflow mode shares the module set).
     132k -> 148k (2026-07-16, the "Replay the maths" pour): histlayout.js (shared
     axis geometry), engine.js traceDraws (seeded telescoping replay), pour.js
     (mountPour canvas overlay + the honest verdict), and the Replay wiring in app.js.
     148k -> 152k (2026-07-16, Fable pour scrutiny): the verdict metric moved from IQR
     to variance-delta (telescopes additively, so equal drivers read equal — kills a
     false-dominance verdict) and the animation became timestamp-driven (frame-rate
     independent). Genuinely new code, not creep; actual load ~148.2k, ~3.8k real
     headroom on purpose (Stage B's confession lands on this page next — see the
     roadmap live-view raises for why thin headroom is a trap).
     152k -> 176k (2026-07-16, Stage B step 2 — the "What must be true" confession, the
     flagged raise above): solve.js (the bisection solver — solveStretch + confess) plus
     the confession interaction in app.js (threshold grab-handle drag, live #tout, the
     ghost-row render + dashed ghost sparklines, Adopt/undo, the err-tinted verdict) and
     its CSS. Genuinely new first-load code (the whole feature), not creep; actual load
     ~169.5k, ~6.5k real headroom on purpose (see the "previous six raises" note for why
     thin headroom is a trap). */
  /* fermi 176k -> 183k (2026-07-30, Swiss 6b — the shared verdict anatomy).
     Every tool page now carries the 6b header/verdict treatment: assets/verdict.js
     (the DOM rendition + the pure figure-splitting, ~4k) plus the page.css /
     tokens.css / controls.css growth the pattern needs (~1.9k). fermi is a
     DOM-verdict tool, so it takes verdict.js only — the SVG emitter was split into
     assets/verdict-svg.js precisely so a page carries one rendition, not both.
     ~1.1k of the raise is fermi's own (the say-it-out-loud line becoming the verdict
     block, the metrics row). Genuinely new shipped code, not creep. fermi's headroom
     was ~900B before this; actual now ~180.2k, set with ~2.8k. */
  /* --- Swiss 6b (2026-07-30), the shared verdict/header anatomy: EVERY page's
     budget below moved, so the reason is written once here rather than eight times.
     Three costs, all genuinely new shipped code:
       - assets/verdict.js (~4k) — the DOM rendition (kicker/metrics/verdict painters)
         plus the pure figure-splitting both renditions share;
       - assets/verdict-svg.js (~3.7k) — the in-SVG rendition, on the seven tools whose
         verdict is part of the exported artefact ONLY. The module was deliberately
         SPLIT from verdict.js so no page carries a rendition it never uses (before the
         split, DOM-only pages like rank paid for the SVG emitter AND pulled svg.js in
         behind it);
       - ~1.9k of page.css/tokens.css/controls.css that every page has always loaded.
     On top of that each tool carries its own verdict projection and metrics derivation
     (~1-5k, largest on roadmap and why, which had NO verdict before this phase and
     gained a whole tested projection each — and why pays roadmap's too, via the
     render-map.js delegation documented below).
     Every raise is set with ~5k real headroom, on purpose: the fermi/roadmap history
     below records what happens when a raise leaves 300B and the next author learns to
     bump the gate reflexively. --- */
  /* fermi 183k -> 185k, rank 94k -> 95k (2026-07-31, the `verdict:` key):
     assets/verdict.js gains firstFigure + resolveVerdict (~400B) — the shared
     three-state semantics that stop seven parsers each inventing their own idea
     of what "off" means. Both pages import verdict.js for its DOM rendition, so
     both pay. Neither is a verdict: tool itself; they carry the helper because
     the module is shared, which is the trade that keeps the semantics single.
     Both were on hair-thin headroom before this (fermi ~900B, rank ~240B) and
     tripped on 400B, so the raise buys back real room rather than the next
     400B of anything: fermi actual ~183.4k (~1.6k headroom), rank ~94.2k
     (~840B). See the "previous six raises" note above on why thin is a trap. */
  /* 190k -> 197k (2026-08-04 interaction reliability): fermi's explicit
     pending-state/export flush, URL-coherent cashflow threshold and horizon,
     reduced-motion cleanup, and tested interaction helper are first-load
     correctness code. Actual 191.6k; the budget restores ~5k headroom instead
     of leaving the next small reliability fix to trip a 1.6k overage. */
  /* 199k -> 215k (2026-08-12 Fermi provenance): receipt normalisation, durable
     URL/save state, the review-needed Gauge draft gate, semantic export copy and
     taller accessible driver-tree leaves are product correctness, not optional
     decoration. Actual 210k; retain roughly 5k headroom. */
  /* 215k -> 217k (2026-08-13 semantic-quality foundation): the shared, bounded
     no-writeback return receipt is part of the review-needed Gauge handoff, and
     Driver Tree now carries the source-aware semantic description needed by
     accessible exports. Actual 215.7k; 1.3k headroom keeps those correctness
     seams eager and avoids loading a second runtime solely to save bytes. */
  /* 217k -> 235k (2026-08-15 review-first Fermi): the single-sheet model trace,
     textual percentile receipt and explicit author return replace a competing
     input card; their a11y/focus state stays eager so an offline model is never
     reduced to chart pixels. Actual 225.4k; ~9.6k headroom. */
  'fermi/index.html': 235_000, 'rank/index.html': 107_500, /* 106k->107.5k 2026-08-15 start-your-own: rank/starter.js plus the on-ramp chip — rank opened on a full example and the only other route to your own list was deleting five rows one at a time. Actual 106.1k; ~1.4k headroom. */ /* 104.5k -> 106k 2026-08-14: the shared phone-control floor in assets/controls.css makes compact controls genuinely tappable on fine-pointer phone viewports too; Rank inherits it despite no Rank-specific feature. Actual 104.8k, so this restores useful room rather than leaving a 259B trap. */ /* +2.5k 2026-08-05 slider-runaway fix: sliderScale calibration + fmt readouts + eased rescale tween (rank was 796B from the line before it) */  /* +2k 2026-08-02 compressed-hash: series.js +1.1k rides every page; rank had 45B slack */   /* 2026-08-02 review: +1k each off hair-thin (662B/300B) headroom — see the thin-is-a-trap notes */   /* 90k->94k 2026-07-30 Swiss 6b: the shared verdict
     anatomy (assets/verdict.js ~4k, the DOM rendition only — the SVG emitter lives in
     verdict-svg.js so this page doesn't carry it) plus the page.css/tokens/controls
     growth it needs. rank had ~2.5k headroom; actual now ~90.3k, set with ~3.7k. */
  /* 116k -> 122k (2026-08-04 interaction reliability): the visibility-gated
     queue animation runtime, export/hash flush and preset state semantics are
     first-load correctness code. Actual 116.9k; retain about 5k headroom. */
  'flow/index.html': 146_000,   /* 144k->146k 2026-08-15 start-your-own: the shared on-ramp chip (assets/app-common.js exampleChips + .chip.start in controls.css) — flow carries no starter of its own, it just pays for shared code. NB the 2026-08-13 note below claimed ~6k headroom; flow had already grown to 143.7k (313 bytes slack) before this change, so that figure was stale. Actual 144.5k; ~1.5k headroom. */   /* 124k->144k 2026-08-13: two bounded operational lenses (expedite service-class sensitivity + dependent dice), their seeded/exportable models and live-hash state. Actual 138.0k; retain ~6k headroom. */   /* 108k->110k 2026-08-02 verdict-eip: verdict-edit.js + EIP menu/placeholder + svgVerdict targets (real feature bytes) */   /* 107k->108k 2026-08-02 review: radiogroup ARIA sync (real a11y bytes); 90k->91k 2026-07-30 Swiss 6a: motion.js DEADLINE bytes */
  /* 102k -> 108k (2026-08-04 interaction reliability): keyboard threshold
     policy, pointer lifecycle cleanup, selected-preset state and dialog focus
     restoration are first-load interaction correctness. Actual 103.1k; leave
     real room for the next small safety fix. */
  'alarm/index.html': 116_000,   /* 2026-08-04 fold wave 2: trapPopoverFocus replaces the hand-rolled claim-dialog Tab trap; actual 111.1k, ~5k headroom */
  /* 444k -> 454k (2026-08-04 interaction reliability): the Case parity pass
     adds status editing and honest absent-field affordances to the rendered
     artifact. Actual 448.6k; keep ~5k of headroom for this CodeMirror page. */
  /* 467k -> 479k (2026-08-12 planning-family context): canonical URL
     recognition, bounded Roadmap-basis decoding and claim-labelled exports
     are the Case binder's job, not decorative shell bytes. Actual 472.8k;
     retain ~6.2k headroom for this CodeMirror page. */
  'case/index.html': 490_000,   /* 479k -> 490k (2026-08-20 P1): shared export and reader-state code brings the real eager graph to 484.0k; retain ~6k headroom rather than turning a cross-suite safety seam into a recurring 300B trap. */   /* unset-edit fix batch (2026-08-04, see the PAGES-map note above): actual 462.8k, ~4.2k headroom */   /* 2026-08-04 fold: density + interaction branches both land real bytes; merged actual 456.7k, ~5k headroom */   /* new binder 2026-08-02: actual ~439.7k (the CodeMirror-editor page class, like every DSL tool), set with ~4k */   /* +2k sweep (12 pages) 2026-08-02 compressed-hash: series.js +1.1k rides every page; six pages tripped, six sat <500B — thin-is-a-trap */
  'duel/index.html': 93_000,   /* no editor/CodeMirror — pure engine + render + app shell */
  /* 113k -> 125k (2026-08-13 pre-parade): the inverse workshop adds a distinct
     opportunity register, commitment-only rendering/markdown, explicit home
     entry point and shared phase language. It deliberately does not reuse risk
     scoring, so the retained code is semantic protection rather than duplicated
     presentation. Actual ~120.2k; retain ~4.8k headroom. */
  'premortem/index.html': 132_000, /* 125k -> 132k (2026-08-13 integration): the pre-parade surface and imported-risk handoff state coexist; actual 126.4k, retaining a meaningful guardrail. */
  'signal-vs-noise/index.html': 107_000,   /* 103k -> 107k (2026-08-20 P1): shared first-load code now totals 103.0k; restore real headroom. */
  /* roadmap 480k -> 515k (2026-07-14). Two features, both eager in the first-load
     graph by design, on a page whose bulk is vendored CodeMirror:
       - the 16:9 DECK EXPORT (render-deck.js) — roadmap is the first tool to ship a
         SECOND renderer; app.js needs its effectiveStyle() on every render to light
         the right picker chip, so it cannot be lazy;
       - multi-column SPANS — pack.js, the span mark, the three drag gestures, the
         phone run-line, and the pure rewrites in edit-targets.js.
     Set with real headroom on purpose: the previous six raises each left ~300B, so
     every subsequent commit tripped the gate and taught the next author to raise it
     reflexively — which is how a budget stops being a budget. Actual load ~507.7k.
     515k -> 516k (2026-07-15, register model layer): the register table's pure cell
     rewrites (setLane/addNote/addStatus/ensureHorizonHeader in edit-targets.js) are
     genuinely new code, not creep, and tipped the page 67B over on their own — the
     "real headroom" above was already down to ~4k after the previous raise. Expect
     another raise when renderRegisterLive lands (the register deck's live-edit
     renderer, tracked separately) — noted here so that one isn't a surprise.
     516k -> 533k (2026-07-15, renderRegisterLive — the flagged raise above landed):
     the register's LIVE editable-table renderer (render-register.js: renderRegisterLive
     + paintRow + cellText + statusWithTarget) plus its column-model sibling
     (deck-parts.js: registerColumnsLive) — genuinely new first-load code (this renderer
     is reached from render-deck.js's existing eager import, same reasoning as the deck
     export above), not creep. Actual load ~525.4k; set with ~7.6k real headroom on
     purpose (see the "previous six raises" note above for why thin headroom is a trap).
     533k -> 548k (2026-07-15, renderBoardLive — the board deck's live-edit sibling):
     render-board.js gained renderBoardLive + paintBoardCard (columns-as-cards analogue
     of renderRegisterLive/paintRow), reached via render-deck.js's existing eager import
     of render-board.js — genuinely new first-load code, not creep. Actual load ~540.9k;
     set with ~7k real headroom on purpose (see the "previous six raises" note above).
     548k -> 566k (2026-07-15, renderFocusLive — the focus deck's live-edit sibling):
     render-focus.js gained renderFocusLive + paintFocusHeroCard + paintFocusRailRow
     (the hero-plus-rail analogue of renderBoardLive/paintBoardCard, plus a compact
     ranked-row paint the other two live views don't have), reached via
     render-deck.js's existing eager import of render-focus.js — genuinely new
     first-load code, not creep. Actual load ~557.9k; set with ~8k real headroom on
     purpose (see the "previous six raises" note above for why thin headroom is a
     trap — this is now the fourth consecutive live-view raise on this page).
     566k -> 574k (2026-07-16, mobile-input Stage 0): the shared editor/workspace
     modules every DSL page loads grew ~2.6k real bytes — createEditorCore's undo()
     via the vendored historyKeymap, mountTouchUndo + the coarse-only button CSS
     (Rule 2, phones have no ⌘Z). The chip-bypass merge had already eaten the old
     headroom (actual was ~565.6k before this change); actual now ~568.2k, set with
     ~5.8k real headroom. */
  /* roadmap 591k -> 593k (2026-07-31, the standfirst on every export): the shared
     standfirst() block in deck-parts.js plus its call site in each of the four
     renderers. `headline:` previously reached only the deck, so the author's claim
     was absent from two of their four exports — this is the fix for that, and the
     four call sites are the irreducible cost of four separate artefacts. Actual
     ~591.9k. Then 593k -> 596k for `story:` — the diff narrative: storyLine()
     plus a call site in each of the same four renderers, and the markdown path.
     Actual ~595.1k, ~900B headroom. */
  /* --- 2026-07-31, assets/syntax.css. The DSL syntax reference's CSS lived in ten
     BYTE-IDENTICAL copies (verified before the move, at Matt's explicit condition).
     It is now one sheet — but a DEDICATED one, not page.css: page.css is loaded by
     every page, and the nine tools with no syntax block would have paid ~1.6k for
     markup they don't have (fermi tripped by 43B proving exactly that). Only the ten
     grammar tools link syntax.css, so the cost lands where the feature is. Each of
     those pages nets ~+1.15k (the shared sheet, less the ~450B copy it deleted).
     roadmap also gained `story:` and a corrected `headline:` gloss. --- */
  /* 611k -> 622k (2026-08-04 interaction reliability): menu moves now use
     the same FLIP path as drags and the pointer-scoped post-drag guard makes
     cancellation safe. Actual 616.1k; preserve ~6k headroom. */
  /* 636k -> 641k (unset-edit fix batch): assets/edit-in-place.js grows an
     opens-row fallback (missing inline target ⇒ same interaction anchored at
     the card-menu trigger, never a silent no-op) plus the opts.kind/opts.raw
     override threaded through open() — shared bytes every EIP-using page
     pays once. Actual 636.1k; preserve ~5k headroom. */
  /* 705k -> 716k (2026-08-10, E9 honest counts): condCount() +
     the F/M split label (board/focus/grid/register), register per-horizon group headers, and the
     roadmapMetrics min/max "in play" range enumeration (parse.js) + its memo. Actual 710.8k,
     ~5.2k headroom. */
  /* 716k -> 723k (2026-08-10, E1 board outcome zones): render-board.js's card-mode
     column ladder gains group-aware capFit heights (zone header bundled into its
     group's first card) plus the wash/label paint, and cond-parts.js gains
     splitColumnZones — roadmap-only, both boards (deck card mode + live).
     Actual 717.5k, ~5.5k headroom. */
  /* 736k -> 751k (2026-08-12, planning-family Gate 1): the reject-by-default
     Roadmap -> Paths builder preserves conditional work only when the fresh
     starter can be truthful, plus its compact health/action surface. The
     22.3k Paths parser remains test-only: target-parser round trips prove the
     contract without making every Roadmap visit load it. Actual 743.2k; keep
     ~7.8k headroom.
     751k -> 765k (2026-08-12, Gate 2 projection basis): the export-wide
     `basis:` datum, its atomic parser and the readable conditional Markdown /
     Focus treatment are first-load Roadmap semantics. Why also pays the shared
     renderer/parser through its Roadmap delegation, but remains under its own
     budget. Actual 758.4k; this restores ~6.6k headroom rather than masking a
     known shipped feature behind a permanently red gate.
     765k -> 800k (2026-08-14 view-system): the exhaustive deck page planner,
     dense-Board navigation and accessible slide-set preflight stay eager so
     exports, URL-local view state and offline use share one factual model.
     Actual 788.0k; 12k headroom covers the complete artefact contract.
     800k -> 808k (2026-08-14 remediation): bounded source-item continuation
     pages keep arbitrarily long titles and notes exhaustive at the existing
     type floor, rather than hiding text or adding a second export model.
     Actual 802.8k; retain ~5.2k meaningful headroom.
     808k -> 822k (2026-08-14 focused item review): source-safe selection,
     a textual receipt and keyboard restoration remain eager so the review
     surface cannot diverge from the URL-owned artefact. Actual 816.5k;
     retain ~5.5k meaningful headroom. */
  'roadmap/index.html': 830_000,
  /* 2026-08-09 adversarial-review fix batch (F1-F8): activeCount
     routing for WIP counts, previewableBet's TEXT-WORLD bets contract (+ ctx.textBets threading in
     app.js/render*.js), the setWhatIf/restoreWhatIfFocus keyboard-focus-survives-repaint fix, the
     DECK-only always-show-tag path (board narrowest ramp + focus rail suffix) — actual 703.1k,
     ~1.9k headroom. */
  /* 2026-08-09 review-fix batch: parse.js gains the resolution-
     beats-bare same-line rule, the cross-line duplicate sweep, direct-unless aftermath tracking,
     cycle-member exclusion from the fork tier, the two structural warnings moved into deriveWorld
     (world-state gated), the [done]-under-moot warning, near-miss/multi-word tolerances, and the
     moot-before-assumed effectiveOf precedence — actual 697.9k, ~2.1k headroom. */
  /* 2026-08-09 conditional roadmap A4: what-if preview — the
     whatIf state/prune/cycle/chip/cross-fade wiring in app.js, the whatifHitRect/previewableBet
     helpers in cond-parts.js, and the sibling-rect emission in render.js/render-board.js/
     render-register.js/render-focus.js (all roadmap-only — the opacity cross-fade stayed local
     to app.js rather than growing the shared assets/motion.js, so no other page pays for it);
     actual 683.6k, ~1.4k headroom. */   /* 2026-08-09 A5: resolveBet/setCondition/clearCondition
     + the addStatus/status/setLane/setSpan hardening in edit-targets.js, plus the Resolve…/
     Condition…/What-if menu rows + onCommit arms in app.js; actual 694.6k, ~3.4k headroom. */
  /* 2026-08-09 conditional roadmap A3: render states for cond/
     dropped/bet items across chart+board+register+focus+deck (a new cond-parts.js module, plus
     capsule/opacity/flag-suppression wiring in every renderer); actual 671.3k, ~5k headroom.
     Was 666_000 (A2: the verdict ladder gains the aftermath/fork tiers (+ the applyWorld diff
     each fork candidate runs) and the authored `verdict:` key's EIP wiring (verdict-edit.js +
     a second attachEditInPlace root); actual 661.0k, ~5k headroom, same convention as the folds
     below. Was 656_000 (A1: parse.js gains bet/cond tokens + the applyWorld cascade engine;
     actual 650.6k, ~5.4k headroom). */
     /* 2026-08-04 fold: density + interaction branches both land real bytes; merged actual 630.8k, ~5k headroom */   /* 599k->601k 2026-08-02 review: 436B headroom was the thin trap again; actual 598.6k, set with ~2.4k. 598k->599k 2026-08-02 review: deck storyLine + editor story/focus keys; 574k->576k 2026-07-30 Swiss 6a: uppercase add-ghost voice (+755B real) */
  /* why 470k -> 480k (2026-07-14, roadmap spans). why/render-map.js DELEGATES to
     roadmap/render.js, so every byte of the span layout is a cost /why pays for a
     feature it can never use (it has no time axis, so it can never carry a span —
     which is also why it emits not one span-edge rect). Honest shared-code cost of
     the delegation, set with headroom for the same reason as roadmap above.
     the span mark, the per-column counts, the narrow run-line, the packer and the
     edge-handle wrapper all live in the shared renderer. Actual load ~475.5k.
     480k -> 490k (2026-07-16, mobile-input Stage 0): why pulls the same shared
     editor/workspace growth every DSL page did — createEditorCore.undo() via the
     vendored historyKeymap + mountTouchUndo (Rule 2). why's old headroom was already
     thin (delegates the whole roadmap renderer), so the ~2.6k shared bytes tipped it
     4k over; actual now ~484.1k, set with ~5.9k headroom. Only why tripped — every
     other DSL page had >8k headroom and stays put. */
  /* why 511k -> 515k (2026-07-31, the standfirst): /why renders its map view
     THROUGH roadmap/render.js, so it inherits roadmap/text-parts.js (~2.4k of
     font stacks, clip1/wrapN and standfirst). Stated plainly: /why has no
     `headline:` key, so the block is inert there — it pays for a delegated
     renderer's feature it cannot use. The alternative was worse in both
     directions: leaving standfirst in deck-parts.js dragged that whole 9.2k deck
     toolkit into /why instead (measured: 520.7k, +9.7k), and duplicating
     clip1/wrapN into a why-local copy breaks the no-duplication rule for a
     helper three renderers already share. text-parts.js is the minimum subset
     render.js needs. Raised again to 517k the same day when `story:` added
     storyLine() to the same module — /why inherits that too, and cannot use it
     either (no snapshot compare, no `story:` key). Actual ~515.6k, ~1.4k. */
  /* 530k -> 539k (2026-08-04 interaction reliability): Why now consumes the
     exact post-render add locator, which prevents the reported DSL-focus jump
     and supplies Escape/undo-safe creation. Actual 533.3k; retain ~5.7k. */
  /* 678k -> 686k (2026-08-10, E9 honest counts): why pays render.js's
     grid condLabel + parse.js's condCount/roadmapMetrics range growth too (same delegation as
     below). Actual 680.3k, ~5.7k headroom. */
  /* 686k -> 693k (2026-08-10, E1 board outcome zones): why pays cond-parts.js's
     splitColumnZones growth too — render.js imports the whole module even though
     the chart doesn't paint zones. Actual 687.0k, ~6.0k headroom. */
  /* 700k -> 716k (2026-08-12, Roadmap projection basis): Why deliberately
     delegates Roadmap's parser and renderer for its delivery lens, so the
     atomic `basis:` grammar and non-erasable conditional export text are an
     honest shared dependency rather than Why-local creep. Actual 710.3k;
     restore ~5.7k headroom. */
  /* Shared workspace’s joined rail/stage edge replaces the old gutter for every
     DSL surface, including Why. Actual 716110 bytes; retain a small 90-byte
     allowance rather than making this common visual correction an untracked overage. */
  /* 716.2k -> 730k (2026-08-15 Mapping family): Why now shares the lightweight
     review-margin stylesheet with Map and Wardley, keeping its causal artefact
     readable in review without adding a runtime dependency. Actual 722.6k. */
  'why/index.html': 730_000,
  /* 2026-08-09 adversarial-review fix batch: why pays render.js's
     activeCount routing and cond-parts.js's previewableBet(bets, it) signature change too
     (delegation — /why's map view renders through renderRoadmap); actual 672.9k, ~5.1k headroom. */
  /* 2026-08-09 review-fix batch: why pays parse.js's growth too (it
     imports roadmap/parse.js directly for the same bet/cond model); actual 669.8k, ~2.2k headroom. */
  /* 2026-08-09 conditional roadmap A3: why pays roadmap/render.js's
     new cond-parts.js import too (delegation — /why's map view renders through renderRoadmap,
     so every render-state byte lands here); actual 662.8k, ~5.2k headroom. Was 653_000 (A1: why
     pays roadmap/parse.js's bet/cond+applyWorld growth too; actual 647.5k, ~5.5k headroom). */
     /* 519k->521k 2026-08-02 review: 637B headroom, thin trap; actual 518.4k, ~2.6k */   /* 490k->492k 2026-07-30 Swiss 6a: square-ghost voice rides roadmap's delegated painter */   /* 2026-08-04 fold wave 2: popover-focus.js roving-focus + role=menu, editor-common's isolate-tagged insertLinesAfter; actual 630.5k, ~5.5k headroom */
  /* raised 470k -> 478k (2026-07-17, B4 the priced-insistence walk's mobile
     treatment): tree/style.css gained the coarse-pointer sticky-bottom
     explore bar (spec I6 — position:fixed + safe-area padding + the 44px
     track/close sizing) and the touch-action:manipulation rule (spec C3).
     Genuinely new CSS, not creep — tree's own budget was already the
     tightest of the DSL pages (no headroom left after Stage 0's shared
     editor/workspace growth). Actual load ~470.9k, set with ~7.1k headroom,
     in line with the other DSL pages. */
  /* 506k -> 515k (2026-08-04 interaction reliability): Tree consumes the
     exact post-render add locator for inline default creation (the other
     reported DSL-focus path). Actual 508.8k; retain ~6k headroom. */
  /* 536k -> 541k (unset-edit fix batch): edit-in-place.js's shared opens-row
     fallback (above) plus tree's own cardmenu-chance gating (hasIncomingProb,
     a functional cardMenu `field`) and the prob/value set-when-unset
     rewrites in edit-targets.js. Actual 536.2k; preserve ~5k headroom. */
  /* 541k -> 553k (2026-08-12, Decision comparison Copy PNG): comparison.js
     projects every root option's paired evidence, chance provenance and nearest
     flip range status; render-density.js replaces the selected policy-path slide
     with the complete/explicitly-partial fixed-canvas comparison. Copy PNG must
     resolve during its originating click, so this is honest first-load code, not
     a payload that can be deferred. Actual 547.1k; preserve ~5.9k headroom. */
  /* The same shared joined rail/stage edge reaches Tree. Roadmap's named DSL
     return path is an optional workspace label, so Tree pays only the tiny
     shared parameter. Actual 554669 bytes; retain 331 bytes of headroom. */
  'tree/index.html': 568_000,   /* 557k -> 568k (2026-08-20 P1): reader-state workspace code is eager by design; actual 561.2k retains ~6.8k. */   /* 555k->557k 2026-08-15 start-your-own: tree/starter.js plus the shared on-ramp chip (exampleChips + .chip.start). Actual 556.0k. */   /* 491k->497k 2026-08-02 verdict-eip: verdict-edit.js + EIP menu/placeholder + svgVerdict targets (real feature bytes) */   /* 2026-08-04 fold wave 2: popover-focus.js roving-focus + role=menu, editor-common's isolate-tagged insertLinesAfter; actual 531.1k, ~5k headroom. 553k->554k 2026-08-14: Roadmap’s shared workspace guard keeps an active editor visible before reclaiming artefact space; Tree shares the tiny module. Actual 553.4k. */
  /* 497k -> 507k (2026-08-04 interaction reliability): Map's reachable-menu
     derivation and scoped drag click guard prevent dead field actions and
     stale suppression. Actual 500.8k; retain ~6k headroom. */
  /* 538k -> 550k (2026-08-15 Mapping family): Map now includes the shared
     review-margin treatment for source-owned spatial inspection. Actual 542.8k. */
  'map/index.html': 556_000,
  /* raised 470k → 476k (2026-07-17, Camp A phone width), consciously: the shared
     workspace.css gained the "16px prose / 10px surface" phone edge block (~1k) —
     every workspace page pays it; gauge was simply the page nearest its ceiling
     and tipped 682B over. Actual now ~470.7k, ~5.3k headroom — in line with the
     other DSL pages. */
  /* gauge 494k -> 496k (2026-07-31, `verdict:`). gauge carries FOUR verdict
     mirrors — the SVG band, the facilitator console headline, the composer's
     on-screen headline, and markdownSummary (itself wired to three copy buttons)
     — and review caught two of them bypassing the key, so app.js and engine.js
     both had to route through resolveVerdict. ~400B of imports and call sites on
     a page that had 103B of headroom. Actual ~494.4k, ~1.6k headroom. */
  /* 515k -> 533k (2026-08-04 interaction reliability): Gauge now carries
     participant draft recovery/race safety plus precise default-add targeting.
     Actual 526.6k; retain ~6k headroom. */
  /* Timeline also carries the shared exact post-render add locator: 505k ->
     516k (2026-08-04), actual 509.2k with ~6k remaining. */
  /* gauge 540k -> 546k (unset-edit fix batch): edit-in-place.js's shared
     opens-row fallback lands on every EIP page, gauge included. Actual
     540.4k; preserve ~5.6k headroom. */
  /* 560k -> 562k (2026-08-13 semantic-quality foundation): Timeline's target
     handoff now retains bounded source-local return context and no-writeback
     semantics. Actual 560.7k; this preserves that navigation correctness with
     enough headroom for small shared-module changes.
     562k -> 563k (2026-08-14 Roadmap remediation): the shared workspace Source
     control now remains named and truthful when leaving focused-artefact mode.
     Timeline imports that same workspace module; actual 562.0k, retain a real
     ~1k guardrail rather than stripping the accessibility fix. */
  /* gauge 561k -> 570k (2026-08-15 workshop review): the revealed-room surface
     now keeps a screen-reader reading receipt, a compact discussion queue, an
     explicit author route, and focus-safe session feedback. They share the live
     SVG statistics rather than creating a second model; actual 565.6k leaves a
     4.4k guardrail. */
  'gauge/index.html': 580_000, 'timeline/index.html': 576_000,   /* P1 shared workspace/export seams: actual Gauge 572.5k, Timeline 569.6k; each regains ~6k headroom. */   /* 564k->566k 2026-08-15 start-your-own: timeline/starter.js plus the shared on-ramp chip. Actual 564.3k. */   /* Mapping's precache addition updates the shared worker carried by every tools-origin page; Timeline actual 563.1k. */
  /* 482k -> 494k (2026-08-04 interaction reliability): Wardley's pre-entry
     add returns focus to the fresh semantic component and its pointer-scoped
     guard prevents stale post-drag clicks. Actual 487.6k; retain ~6k. */
  /* wardley 512k -> 518k (unset-edit fix batch): edit-in-place.js's shared
     opens-row fallback lands on every EIP page, wardley included. Actual
     512.5k; preserve ~5.5k headroom. */
  /* 518k -> 530k (2026-08-15 Mapping family): Wardley's review margin adds
     source-owned inspection while retaining the native strategic landscape. Actual 523.4k. */
  'wardley/index.html': 530_000,
  /* raised 480k → 486k (2026-07-16, mobile-input bets stage), consciously: the
     phone structure surface is real feature bytes across three modules —
     edit-targets.js grew the four parse-verified structure rewrites (~2.8k),
     render.js the edit-gated rename targets + ＋ capsules (~1.6k), app.js the
     betMenu/adds wiring (~1.9k). Tipped 182B over; actual now ~480.2k, ~5.8k
     headroom — in line with the other DSL pages. */
  /* 506k -> 516k (2026-08-04 interaction reliability): Bets' shareable view
     state and exact pre-entry/default add targeting are first-load behavior.
     Actual 509.8k; retain ~6k headroom. */
  /* 541k -> 570k (2026-08-12 shared-outcome stress): Bets now carries a paired
     independent/shared-outcome portfolio reading across Board, Quadrant, PNG
     and Markdown, plus fail-closed invalid-row handling and occurrence-safe
     snapshot protection. This is first-load decision truth, not optional
     chrome. Actual 563.3k; retain ~6.7k headroom. */
  'bets/index.html': 580_000,   /* 570k -> 580k (2026-08-20 P1): shared reader/export seams put the eager graph at 572.3k; retain ~7.7k. */   /* 499k->497k 2026-08-02 review re-tighten: poster/bare dead code gone — budgets back to actual+~3k so the tripwire trips; actual 494.3k */   /* 486k -> 489k (2026-07-30, Swiss 6a): motion.js liveness-DEADLINE fix + docs ride every mounted-motion page; ~2.7k real headroom */   /* 2026-08-04 fold wave 2: kill-add undo() rollback + popover-focus.js roving-focus; actual 536.0k, ~5k headroom */
  /* Swiss 6c (2026-07-30) gave the energy origin the tools origin's 6b anatomy
     plus its own chrome, so every page here grew the same real bytes: the shared
     assets/energy.css (the ember token block, hoisted out of five per-tool
     copies, + the masthead/series-nav/family-strip/footer, ~3.4k), the shared
     assets/verdict.js (~4k, new to this origin's module graph) and the masthead/
     nav/family/footer markup (~2k a page). Only two budgets actually tripped;
     the rest had headroom and stay put. cycles 470k -> 472k (actual ~466.8k,
     ~5.2k headroom) — it was the tightest energy page before this. */
  /* Risk 462k -> 472k (2026-08-04): exact default-add target and Escape/
     two-step undo safety are first-load behavior. Actual 466.1k; keep ~6k. */
  'energy/index.html': 40_000, 'energy/risk/index.html': 498_000,   /* 486k -> 498k (2026-08-20 P1): the reader-state workspace path is eager; actual 490.2k retains ~7.8k. */   /* unset-edit fix batch (2026-08-04, see the PAGES-map note above): actual 481k, ~5k headroom */   /* 2026-08-04 fold: merged actual 474.1k, ~6k headroom */   /* 449k->453k 2026-08-02 verdict-eip bytes */
  /* Cycles 486k -> 501k (2026-08-04): worker-revision stale-edit protection,
     exact default-add focus and the narrow editable discount field. Actual
     494.2k; retain ~6.8k. */
  'energy/cycles/index.html': 526_000,   /* 514k -> 526k (2026-08-20 P1): the reader-first workspace is first-load code; actual 518.2k retains ~7.8k. */   /* unset-edit fix batch (2026-08-04, see the PAGES-map note above): actual 509k, ~5k headroom */   /* 2026-08-04 fold: merged actual 502.2k, ~6k headroom */   /* 472k->477k 2026-08-02 verdict-eip bytes */   /* risk 470k->449k 2026-08-02 review re-tighten: poster/bare dead code gone — budgets back to actual+~3k so the tripwire trips; actual 445.5k */
  'energy/frequency/index.html': 118_000, 'energy/merit-order/index.html': 163_000,   /* P1: Frequency’s semantic scene/canvas graph is 111.4k; Merit Order’s shared seams are 158.1k. Keep 4.9–6.6k rather than hairline budget traps. */   /* 156.2k->157.5k 2026-08-15 start-your-own: merit-order carries no starter, it just pays for the shared chip bytes; its own 138-byte tripwire (below) left no room for them. Actual 156.8k. */   /* 470k->97k/145k 2026-08-02 review: both wore the big-CodeMirror-page tier while actually loading 93k/139k — a page could triple before the tripwire noticed. No editor on either; set actual+~4%. 2026-08-14: shared workspace seam refinement adds 486 bytes to every consumer; retain a 138-byte tripwire. */
  /* raised 100k -> 106k (a11y batch, 2026-07): the shared renderStack() module
     it pulls in grew real bytes (tabindex/role/aria-label on every data-plant
     block) and app.js gained a small popover focus-trap import + keydown
     handler — an honest feature cost, not creep; actual load ~102.2k. */
  /* Raised 120k → 126k (2026-07-14), consciously. intraday is the heaviest page — it
     carries BOTH the merit-order renderer and the shared motion layer — so it's the
     one that trips first when a shared module grows. Two deliberate growths pushed it
     580B over: assets/motion.js 9.1k → 11.6k (the reveal gate rewrite, which fixed six
     tools shipping blank), and the shared component-CSS/exampleChips extraction. Both
     bought correctness or de-duplication, neither is fat to trim. Headroom now ~5.4k;
     next tightest page is flow at 3.4k, so this is intraday-specific, not suite bloat. */
  /* Raised 126k → 127k (2026-07-17, phone width reclamation), consciously: the
     ~330B "16px prose / full-bleed card" phone edge block in style.css tipped it
     285B over. Every card-band page pays the same ~330B; intraday trips first
     because it was already the heaviest. Actual ~126.3k, headroom ~0.7k. */
  /* Raised 127k → 128k (2026-07-17, desktop width pass), consciously: two honest
     growths landed together — the Route B true-measured-width render (app.js resize
     plumbing + comments, ~0.5k) and the merged tokens.css color-scheme Safari
     dark-flash fix (~0.5k, paid by every page, intraday trips first as the heaviest).
     301B over. Neither is fat to trim. Actual ~127.3k, headroom ~0.7k. */
  /* Raised 128k → 130k (2026-07-30, Swiss Phase 1), consciously: the shared control
     re-skin (controls.css Swiss buttons/chips + page.css micro utilities + tokens
     --brand/--brand-text/--data, ~0.5k paid by every page) — intraday trips first
     as ever. 528B over. Actual ~128.5k, headroom ~1.5k. */
  /* Raised 133k → 135k (2026-07-30, Swiss 6c), consciously: the shared
     .segmented control landed in controls.css (~1.3k, paid by every page) and
     REPLACED eight local copies, so the suite net-shrank — intraday just has no
     local copy to give back, and as ever it's the page that trips first.
     1,026B over. Actual ~134.0k, headroom ~1.0k. */
  /* Raised 135k -> 152k (2026-07-30, Swiss 6c), consciously: the energy origin's
     share of the 6c growth described above (energy.css + verdict.js + the chrome
     markup) is ~12k on every page here, and intraday had ~1.0k headroom, so it
     tripped by 11.3k. None of it is intraday-specific and none is fat to trim —
     energy.css replaced five per-tool token blocks and verdict.js replaced this
     page's hand-rolled verdict paragraph. Actual ~146.3k, ~5.7k headroom, which
     puts it back in line with the other pages instead of on the edge. */
  /* 156k -> 163k (2026-08-04 interaction reliability): stable callout-focus
     restoration, one owned playback loop, reduced-motion settle and viewport
     clamping are first-load interaction safety. Actual 156.9k; keep ~6k. */
  'energy/intraday/index.html': 178_000,  /* 166k -> 178k (2026-08-20 P1): the composite export renderer is eager for reliable actions; actual 170.3k retains ~7.7k. */
  /* 817k -> 878k (2026-08-13 integration): Paths deliberately carries both
     the all-outcomes Brief / Question lens / Conditions renderers and the
     fail-closed exact-world Roadmap projection. These share the evaluator and
     must stay eager for offline export parity. Actual 869.6k; retain ~8k. */
  /* 878k -> 881k (2026-08-13 semantic-quality foundation): return-safe
     Roadmap handoff metadata and selected-decision receipt behaviour are live
     across the contingency lenses; keeping them eager preserves keyboard,
     export and offline parity. Actual 878.7k; retain ~2.3k. */
  /* 881k -> 925k (2026-08-13 Learning Agenda dossier): the approved sixth
     eager Paths lens adds a full, evaluator-backed decision dossier alongside
     a parallel roster and all-state static export. Its exact authored learning
     contract and yes/no effects must remain offline and export-ready rather
     than being a smaller, second model. The scoped decision-receipt export
     keeps this same complete semantics instead of generating a second model.
     Actual ~917.8k; retain ~7.2k headroom. */
  /* 925k -> 980k (2026-08-13 Learning Close-out): the selected-decision
     receipt reuses the existing evaluator and four-view Paths surface, but adds
     an authored, append-only close-out projection, scoped semantic export and
     undoable source edits. They deliberately stay eager: a Close-out opened
     from any Paths view must preserve the same URL-local state offline. Actual
     971.7k; 8.3k headroom avoids disguising this complete semantic layer as a
     lazy second model. */
  /* 980k -> 990k (2026-08-14 Decision Margin): the review-first Paths surface
     adds a source-line provenance/action contract, URL-neutral reader folding,
     and stable Tree return handling. These stay eager with the existing
     CodeMirror/evaluator graph so author handoff works offline without a
     second, lossy review model. Actual 981.1k; ~8.9k headroom. */
  'paths/index.html': 990_000,
  /* New Instrument 17 (2026-08-13): Proxy Hunt is a standalone parser →
     projection → SVG surface. The full graph includes CodeMirror, renderer,
     URL state, full/scoped exports and the common workspace modules; no runtime
     dependency or lazy data path is introduced. Actual 448.2k; 11.8k headroom. */
  /* 460k -> 500k (2026-08-14 authored sharing statement): the Proxy-specific
     author-stated verdict is intentionally a menu-first, undoable CodeMirror
     edit in the stage chrome. It imports the shared edit-in-place/menu helpers
     so the annotation remains URL-local and accessible on phone rather than
     becoming an untracked DOM field. Actual 492.1k; 7.9k headroom. */
  'proxy/index.html': 510_000,
};

if(process.env.WEIGHT_DEBUG){
  for(const [page, budget] of Object.entries(PAGES)){
    const bytes = [...pageLoad(page)].reduce((a, f) => a + size(f), 0);
    console.error(page.padEnd(34), String(bytes).padStart(7), '/', budget, ' slack', budget - bytes);
  }
}
test('per-page load stays under budget', () => {
  for(const [page, budget] of Object.entries(PAGES)){
    const bytes = [...pageLoad(page)].reduce((a, f) => a + size(f), 0);
    assert.ok(bytes <= budget, page + ': ' + bytes + ' bytes > budget ' + budget);
  }
});

test('no orphaned shipped modules', () => {
  const reachable = new Set();
  for(const page of Object.keys(PAGES)) for(const f of pageLoad(page)) reachable.add(f);
  ['home/sw.js', 'energy/sw.js', 'assets/pwa.js'].forEach(f => reachable.add(f));
  const orphans = [];
  const DIRS = [...TOOL_DIRS, 'energy', 'home', 'assets'];   // was missing 'wardley' — the orphan check couldn't see the newest tool
  for(const d of DIRS){
    (function walk(dir){
      for(const f of readdirSync(join(ROOT, dir))){
        if(f === 'tests' || f === 'node_modules') continue;
        const rel = dir + '/' + f;
        if(statSync(join(ROOT, rel)).isDirectory()) walk(rel);
        else if(f.endsWith('.js') && !f.endsWith('.test.mjs') && !reachable.has(rel)) orphans.push(rel);
      }
    })(d);
  }
  assert.deepEqual(orphans, [], 'unreachable shipped modules: ' + orphans.join(', '));
});
