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

   Balanced by MEASURED CI time (see SUITE_SECONDS). The critical path is smoke
   (138s) — the one suite too big to split — so 5 shards is the floor; a 6th buys
   nothing. Only the motion+webkit shard needs the real WebKit engine; the rest
   install chromium only (which also trims their apt-deps step). */
export const SHARDS = [
  {name: 'smoke',         suites: ['smoke.mjs'],                          browsers: 'chromium'},
  {name: 'eip',           suites: ['check-eip.mjs', 'map.mjs'],           browsers: 'chromium'},
  {name: 'mobile-core',   suites: ['mobile.mjs', 'check.mjs', 'pwa.mjs'], browsers: 'chromium'},
  {name: 'motion-webkit', suites: ['motion.mjs', 'webkit.mjs'],           browsers: 'chromium webkit'},
  {name: 'layout-gauge',  suites: ['layout.mjs', 'gauge.mjs'],            browsers: 'chromium'},
];

export const ALL_SUITES = SHARDS.flatMap(s => s.suites);

/* Measured CI wall-clock per suite (seconds), keyed by suite file. Used by the
   local `run.mjs --jobs` pool to schedule longest-first, and documented as the
   balance rationale for the CI shards above. Approximate — for ORDERING only, not
   budgets. dev/ci-shards.test.mjs asserts a hint exists for every verify suite. */
export const SUITE_SECONDS = {
  'smoke.mjs': 138, 'check-eip.mjs': 124, 'mobile.mjs': 88, 'motion.mjs': 81,
  'layout.mjs': 77, 'webkit.mjs': 45, 'gauge.mjs': 27, 'check.mjs': 25,
  'pwa.mjs': 19, 'map.mjs': 8,
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
