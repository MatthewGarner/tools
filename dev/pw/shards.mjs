/* The browser suites, partitioned into balanced shards for CI's parallel matrix.
   ONE source of truth: .github/workflows/verify.yml expands this via
   `node dev/pw/shards.mjs --json` (fromJSON), and dev/ci-shards.test.mjs asserts the
   flattened set equals the canonical `verify` chain in package.json — so a suite
   added to verify but not here fails at test time instead of silently never running
   in CI (the same single-source drift guard the repo uses for tool-dirs and the
   injection corpus). A future `run.mjs --jobs` mode will read this too, to
   parallelise the LOCAL gate the same way.

   Balanced by MEASURED CI time (smoke 138s · check-eip 124s · mobile 88s · motion
   81s · layout 77s · webkit 45s · gauge 27s · check 25s · pwa 19s · map 8s). The
   critical path is smoke (138s) — the one suite too big to split — so 5 shards is
   the floor; a 6th buys nothing. Only the motion+webkit shard needs the real WebKit
   engine; the rest install chromium only (which also trims their apt-deps step). */
export const SHARDS = [
  {name: 'smoke',         suites: ['smoke.mjs'],                          browsers: 'chromium'},
  {name: 'eip',           suites: ['check-eip.mjs', 'map.mjs'],           browsers: 'chromium'},
  {name: 'mobile-core',   suites: ['mobile.mjs', 'check.mjs', 'pwa.mjs'], browsers: 'chromium'},
  {name: 'motion-webkit', suites: ['motion.mjs', 'webkit.mjs'],           browsers: 'chromium webkit'},
  {name: 'layout-gauge',  suites: ['layout.mjs', 'gauge.mjs'],            browsers: 'chromium'},
];

export const ALL_SUITES = SHARDS.flatMap(s => s.suites);

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
