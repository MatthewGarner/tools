/* The browser suites, partitioned into balanced shards for CI's parallel matrix.
   ONE source of truth: .github/workflows/verify.yml expands this via
   `node dev/pw/shards.mjs --json` (fromJSON), and dev/ci-shards.test.mjs asserts the
   flattened set equals the canonical `verify` chain in package.json — so a suite
   added to verify but not here fails at test time instead of silently never running
   in CI (the same single-source drift guard the repo uses for tool-dirs and the
   injection corpus). This partition is CI-ONLY (per-runner browser-install sets +
   cache keys); the LOCAL `run.mjs --jobs` mode does NOT read it — it runs a
   work-stealing pool over the flat verify chain instead, using SUITE_SECONDS below
   only to order longest-first. (Don't wire --jobs to SHARDS: a static 5-way split
   load-balances worse than a pool on one machine.)

   Balanced by MEASURED suite time (see SUITE_SECONDS). **check-eip is the longest
   single suite** — not smoke, as this comment claimed until 2026-08-17 on hints that had
   gone stale by ~2.5x. The packing rule follows: no shard containing check-eip finishes
   sooner than check-eip does, so giving it a shard of its own puts the ceiling at its
   own runtime — optimal AGAINST THESE LOCAL SECONDS. It is not optimal in CI, and the
   numbers at the bottom of this file say so: CI pays a fixed per-suite startup that
   local seconds don't model, which is why motion-webkit (six suites) is CI's real
   ceiling. Treat the packing as a good heuristic, not a proof.

     eip 208 · mobile-core 185 · motion-webkit 178 · smoke 147 · layout-gauge 134

   Ceiling 208s (2026-08-18, after Batch C and the review's corrections). The ceiling
   suite is unchanged — eip is still the longest and is a single suite, so no packing
   can put the ceiling below its own runtime and none is attempted. eip is 208s rather
   than the 190s Batch C briefly reported: that speedup came from converting undoStep's
   CodeMirror history-group boundary to a poll, which CI proved wrong (see the helper's
   comment in check-eip.mjs) and which is reverted. The LOCAL spread is 74s, because
   the shrinking landed unevenly (layout 158→103, smoke 197→147) while the ceiling
   went back up; the obvious next move, if CI's balance is ever re-measured, is
   check.mjs off motion-webkit and onto layout-gauge (178/134 → 148/164), which also
   follows this file's own advice to
   move small suites OFF that shard rather than onto it. Not done here: it is a
   CI-balance change and nothing in this round measured CI.

   The pre-Batch-C figures, for the record:
     eip 212 · motion-webkit 201 · smoke 197 · mobile-core 194 · layout-gauge 189
   A 23s spread, ceiling 212s. Two moves got there on 2026-08-17, in one day: first the
   three small suites (paths-budget, map, case) came off check-eip's shard, which was
   the only reason it ran 356s; then check-eip's fixed sleeps were converted to
   condition polling and it fell 314s → 212s, which made mobile-core the new ceiling at
   241s, so check.mjs (47s) moved off it too.

   Only the motion+webkit shard needs the real WebKit engine; the rest install chromium
   only (which also trims their apt-deps step). Everything moved onto it is
   chromium-only, so it costs that shard no extra install — webkit is already there. */
export const SHARDS = [
  {name: 'smoke',         suites: ['smoke.mjs'],                          browsers: 'chromium'},
  {name: 'eip',           suites: ['check-eip.mjs'],                      browsers: 'chromium'},
  {name: 'mobile-core',   suites: ['mobile.mjs', 'pwa.mjs'],             browsers: 'chromium'},
  {name: 'motion-webkit', suites: ['motion.mjs', 'webkit.mjs', 'check.mjs', 'paths-budget.mjs', 'map.mjs', 'case.mjs'], browsers: 'chromium webkit'},
  {name: 'layout-gauge',  suites: ['layout.mjs', 'gauge.mjs', 'signal.mjs', 'intraday-export.mjs', 'frequency.mjs'], browsers: 'chromium'},
];

export const ALL_SUITES = SHARDS.flatMap(s => s.suites);

/* Measured LOCAL wall-clock per suite (seconds), keyed by suite file. Provenance is
   two dated passes, not one snapshot: the 2026-08-17 serial `npm run gate` (with
   check-eip re-measured later that day after its sleep conversion, 314s → 212s),
   then 2026-08-18's Batch C re-measuring the seven suites it changed (smoke, layout,
   check-eip, check, pwa, map, case). Untouched suites keep their 08-17 values and sat
   within ~1s across both runs.
   ORDERING-ONLY hints for the local `run.mjs --jobs` pool (longest-first
   scheduling) and for `run.mjs`'s drift note (±1.75x) — NOT a budget, and NOT the
   same number as CI wall-clock (CI runs on different, usually slower,
   hardware). check-eip.mjs used to be largely immune to that, because most of its
   time was pure waitForTimeout sleeping, which is wall-clock rather than CPU-bound;
   after the 2026-08-17 and 2026-08-18 conversions its literal sleeps static-sum to
   ~97s of a 208s run, so it is not immune any more. The figure this comment carried,
   269s, described a suite its own table put at 212s and was a pre-conversion number.
   Update these by
   re-running the gate and reading its per-suite timings whenever they drift
   past the note's own ±1.75x threshold — the note tells you when.
   dev/ci-shards.test.mjs asserts a hint exists for every verify suite.

   The rank was actively WRONG before 2026-08-17, not just stale: smoke was hinted as
   the long pole (138s) when check-eip was always the real one (measured 314s that
   morning, 212s after its sleeps were converted the same day). The OLD hints had the
   two in the wrong order, which made `--jobs`'s longest-first pool start the wrong
   suite first.

   Separately, REAL CI shard totals (run 32015876950, ubuntu-latest, includes
   ~40-60s of fixed per-shard setup: checkout, cache, playwright install) —
   this is the actual CI-balance rationale, kept here because it's the only
   place SHARDS' composition is explained:
     eip 387s · mobile-core 298s · smoke 236s · layout-gauge 229s · motion-webkit 176s
   eip was CI's critical path — see the SHARDS rebalance below and its comment.

   CONFIRMED after the first rebalance (run 32030096080):
     eip 342s · motion-webkit 298s · mobile-core 284s · smoke 238s · layout-gauge 233s
   CI's critical path fell 387s → 342s. Then after check-eip's sleep conversion and the
   second repack (run 32053909016):
     motion-webkit 269s · eip 241s · mobile-core 233s · smoke 230s · layout-gauge 219s
   387s → 269s in total, a 30% cut, spread down from 211s to 50s.

   One honest correction to the paragraph above: the ranks did NOT fully transfer the
   second time. Locally eip is the ceiling (212s then, 190s after Batch C — still the
   longest single suite, so the local ceiling moved but did not change hands); in CI
   motion-webkit is, at 269s,
   because it now carries SIX suites and CI pays a fixed per-suite startup (browser
   launch, first paint) that local seconds don't capture — a shard's CI cost is its
   suite time PLUS a per-suite tax, so packing many small suites into one shard is
   worth less than the arithmetic suggests. Any further repack should move a small
   suite OFF motion-webkit, not onto it. Diminishing returns from here: the remaining
   CI spread is 50s (the 56s figure at the top of this file is LOCAL — different
   machines, different numbers, and they are not comparable). */
export const SUITE_SECONDS = {
  'smoke.mjs': 147, 'check-eip.mjs': 208, 'paths-budget.mjs': 28, 'mobile.mjs': 170, 'motion.mjs': 56,
  'layout.mjs': 103, 'webkit.mjs': 56, 'gauge.mjs': 27, 'check.mjs': 30,
  'pwa.mjs': 15, 'signal.mjs': 4, 'map.mjs': 5, 'case.mjs': 3,
  'intraday-export.mjs': 24, 'frequency.mjs': 10,
};

/* `node shards.mjs --json` → the GitHub Actions matrix (single line on stdout).
   `suites` is space-joined for the shard's `for s in …` loop; `cachekey` collapses
   the browser set to a safe cache-key fragment so shards with the same browsers
   share one Playwright-browser cache. */
if(process.argv.includes('--json')){
  process.stdout.write(JSON.stringify(SHARDS.map(s => ({
    name: s.name,
    suites: s.suites.join(' '),
    browsers: s.browsers,
    cachekey: s.browsers.replace(/ /g, '-'),
  }))));
}
