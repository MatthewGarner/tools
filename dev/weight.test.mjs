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
  'fermi/index.html': 185_000, 'rank/index.html': 95_000,   /* 90k->94k 2026-07-30 Swiss 6b: the shared verdict
     anatomy (assets/verdict.js ~4k, the DOM rendition only — the SVG emitter lives in
     verdict-svg.js so this page doesn't carry it) plus the page.css/tokens/controls
     growth it needs. rank had ~2.5k headroom; actual now ~90.3k, set with ~3.7k. */ 'flow/index.html': 107_000,   /* 90k->91k 2026-07-30 Swiss 6a: motion.js DEADLINE bytes */
  'alarm/index.html': 96_000,
  'duel/index.html': 90_000,   /* no editor/CodeMirror — pure engine + render + app shell */
  'premortem/index.html': 100_000,   /* register core + store + wizard + 2 renderers + app */
  'signal-vs-noise/index.html': 100_000,   /* no editor — seeded engine + 2 renderers + turn-loop app */
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
     ~591.9k, ~1.1k headroom. */
  'roadmap/index.html': 593_000,   /* 574k->576k 2026-07-30 Swiss 6a: uppercase add-ghost voice (+755B real) */
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
     render.js needs. Actual ~514.0k, ~1.0k headroom. */
  'why/index.html': 515_000,   /* 490k->492k 2026-07-30 Swiss 6a: square-ghost voice rides roadmap's delegated painter */
  /* raised 470k -> 478k (2026-07-17, B4 the priced-insistence walk's mobile
     treatment): tree/style.css gained the coarse-pointer sticky-bottom
     explore bar (spec I6 — position:fixed + safe-area padding + the 44px
     track/close sizing) and the touch-action:manipulation rule (spec C3).
     Genuinely new CSS, not creep — tree's own budget was already the
     tightest of the DSL pages (no headroom left after Stage 0's shared
     editor/workspace growth). Actual load ~470.9k, set with ~7.1k headroom,
     in line with the other DSL pages. */
  'tree/index.html': 491_000,
  'map/index.html': 480_000,
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
  'gauge/index.html': 496_000, 'timeline/index.html': 486_000,
  'wardley/index.html': 480_000,
  /* raised 480k → 486k (2026-07-16, mobile-input bets stage), consciously: the
     phone structure surface is real feature bytes across three modules —
     edit-targets.js grew the four parse-verified structure rewrites (~2.8k),
     render.js the edit-gated rename targets + ＋ capsules (~1.6k), app.js the
     betMenu/adds wiring (~1.9k). Tipped 182B over; actual now ~480.2k, ~5.8k
     headroom — in line with the other DSL pages. */
  'bets/index.html': 499_000,   /* 486k -> 489k (2026-07-30, Swiss 6a): motion.js liveness-DEADLINE fix + docs ride every mounted-motion page; ~2.7k real headroom */
  /* Swiss 6c (2026-07-30) gave the energy origin the tools origin's 6b anatomy
     plus its own chrome, so every page here grew the same real bytes: the shared
     assets/energy.css (the ember token block, hoisted out of five per-tool
     copies, + the masthead/series-nav/family-strip/footer, ~3.4k), the shared
     assets/verdict.js (~4k, new to this origin's module graph) and the masthead/
     nav/family/footer markup (~2k a page). Only two budgets actually tripped;
     the rest had headroom and stay put. cycles 470k -> 472k (actual ~466.8k,
     ~5.2k headroom) — it was the tightest energy page before this. */
  'energy/index.html': 40_000, 'energy/risk/index.html': 470_000, 'energy/cycles/index.html': 472_000,
  'energy/frequency/index.html': 470_000, 'energy/merit-order/index.html': 470_000,
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
  'energy/intraday/index.html': 152_000,
};

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
