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

   Balanced by MEASURED suite time (see SUITE_SECONDS). **check-eip is the critical
   path at 314s** — not smoke, as this comment claimed until 2026-08-17 on hints that
   had gone stale by ~2.5x. Since no shard containing check-eip can finish sooner than
   check-eip does, giving it a shard of its own is provably the best packing available:
   it puts the ceiling at 314s, and every other shard sits under that (mobile-core 241,
   smoke 197, layout-gauge 189, motion-webkit 154). That is why the three small suites
   that used to ride with check-eip now ride with motion+webkit instead — they were the
   only reason its shard ran 356s.

   Only the motion+webkit shard needs the real WebKit engine; the rest install chromium
   only (which also trims their apt-deps step). The three small suites moved onto it are
   chromium-only, which costs that shard no extra install — webkit is already there.

   NB when check-eip's fixed-sleep cost comes down (its 314s is ~85% waitForTimeout
   sleeping), mobile-core at 241s becomes the ceiling and this wants repacking again. */
export const SHARDS = [
  {name: 'smoke',         suites: ['smoke.mjs'],                          browsers: 'chromium'},
  {name: 'eip',           suites: ['check-eip.mjs'],                      browsers: 'chromium'},
  {name: 'mobile-core',   suites: ['mobile.mjs', 'check.mjs', 'pwa.mjs'], browsers: 'chromium'},
  {name: 'motion-webkit', suites: ['motion.mjs', 'webkit.mjs', 'paths-budget.mjs', 'map.mjs', 'case.mjs'], browsers: 'chromium webkit'},
  {name: 'layout-gauge',  suites: ['layout.mjs', 'gauge.mjs', 'signal.mjs'], browsers: 'chromium'},
];

export const ALL_SUITES = SHARDS.flatMap(s => s.suites);

/* Measured LOCAL wall-clock per suite (seconds), keyed by suite file — from a
   full `npm run gate` serial run on this machine, 2026-08-17 (dev/pw/run.mjs's
   `report()`-line timing; see the git history around that date for the raw log).
   ORDERING-ONLY hints for the local `run.mjs --jobs` pool (longest-first
   scheduling) and for `run.mjs`'s drift note (±1.75x) — NOT a budget, and NOT the
   same number as CI wall-clock (CI runs on different, usually slower, hardware,
   though check-eip.mjs is mostly immune: 269s of its total is pure
   waitForTimeout sleeping, which is wall-clock, not CPU-bound). Update these by
   re-running the gate and reading its per-suite timings whenever they drift
   past the note's own ±1.75x threshold — the note tells you when.
   dev/ci-shards.test.mjs asserts a hint exists for every verify suite.

   The two numbers that were actively WRONG before 2026-08-17 (not just stale):
   smoke was hinted as the long pole (138s) when check-eip was always the real
   one — measured local reality is smoke 197s, check-eip 314s, so the OLD hints
   had them in the wrong rank order, which made `--jobs`'s longest-first pool
   start the wrong suite first.

   Separately, REAL CI shard totals (run 32015876950, ubuntu-latest, includes
   ~40-60s of fixed per-shard setup: checkout, cache, playwright install) —
   this is the actual CI-balance rationale, kept here because it's the only
   place SHARDS' composition is explained:
     eip 387s · mobile-core 298s · smoke 236s · layout-gauge 229s · motion-webkit 176s
   eip was CI's critical path — see the SHARDS rebalance below and its comment.

   CONFIRMED after the rebalance (run 32030096080, same workflow, clean checkout):
     eip 342s · motion-webkit 298s · mobile-core 284s · smoke 238s · layout-gauge 233s
   CI's critical path fell 387s → 342s and the spread flattened from 211s to 109s. The
   three small suites cost motion-webkit more in CI (+122s) than their local seconds
   predicted (+42s), because CI hardware runs everything ~2x slower — the ranks
   transferred, the absolute numbers did not, which is exactly what these hints claim. */
export const SUITE_SECONDS = {
  'smoke.mjs': 197, 'check-eip.mjs': 314, 'paths-budget.mjs': 28, 'mobile.mjs': 170, 'motion.mjs': 56,
  'layout.mjs': 158, 'webkit.mjs': 56, 'gauge.mjs': 27, 'check.mjs': 47,
  'pwa.mjs': 24, 'signal.mjs': 4, 'map.mjs': 9, 'case.mjs': 5,
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
