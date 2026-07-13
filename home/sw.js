/* Network-first with full precache: the whole suite is cached at install, so an
   installed app works offline after ONE online launch (iOS home-screen apps get
   isolated storage — the Safari-tab service worker doesn't carry over, so lazy
   visited-page caching wasn't enough; Matt hit exactly that on 2026-07-06).
   Online requests still go network-first, so the auto-deploying site never
   serves stale pages when connected. /api/ (gauge relay) stays live-only.
   PRECACHE is generated from the filesystem; dev/pwa-precache.test.mjs fails
   if a shipped file is missing from it. */
const CACHE = 'tools-1e38016b13';
const PRECACHE = [
  '/',
  '/alarm/',
  '/alarm/app.js',
  '/alarm/engine.js',
  '/alarm/gate-canvas.js',
  '/alarm/render.js',
  '/alarm/style.css',
  '/assets/about.css',
  '/assets/app-common.js',
  '/assets/controls.css',
  '/assets/edit-in-place.js',
  '/assets/editor-common.js',
  '/assets/exports.js',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/assets/mobile.css',
  '/assets/mobile.js',
  '/assets/narrow-width.js',
  '/assets/popover-focus.js',
  '/assets/poster.js',
  '/assets/pwa.js',
  '/assets/saved-items.js',
  '/assets/schedule.js',
  '/assets/series.js',
  '/assets/snapshots.js',
  '/assets/svg.js',
  '/assets/tokens.css',
  '/assets/workspace.css',
  '/assets/workspace.js',
  '/bets/',
  '/bets/app.js',
  '/bets/diff.js',
  '/bets/edit-targets.js',
  '/bets/editor.js',
  '/bets/engine.js',
  '/bets/parse.js',
  '/bets/render-quadrant.js',
  '/bets/render.js',
  '/bets/style.css',
  '/duel/',
  '/duel/app.js',
  '/duel/engine.js',
  '/duel/render.js',
  '/duel/style.css',
  '/fermi/',
  '/fermi/app.js',
  '/fermi/cashflow.js',
  '/fermi/engine.js',
  '/fermi/render-cashflow.js',
  '/fermi/render-driver.js',
  '/flow/',
  '/flow/app.js',
  '/flow/economics.js',
  '/flow/engine.js',
  '/flow/render.js',
  '/gauge/',
  '/gauge/app.js',
  '/gauge/edit-targets.js',
  '/gauge/editor.js',
  '/gauge/engine.js',
  '/gauge/handoff.js',
  '/gauge/parse.js',
  '/gauge/relay-client.js',
  '/gauge/render-form.js',
  '/gauge/render-overlay.js',
  '/gauge/session.js',
  '/gauge/style.css',
  '/manifest.webmanifest',
  '/map/',
  '/map/app.js',
  '/map/diff.js',
  '/map/edit-targets.js',
  '/map/editor.js',
  '/map/handoff.js',
  '/map/parse.js',
  '/map/readout.js',
  '/map/render.js',
  '/map/style.css',
  '/map/zones.js',
  '/premortem/',
  '/premortem/app.js',
  '/premortem/register.js',
  '/premortem/render-board.js',
  '/premortem/render-register.js',
  '/premortem/render-wizard.js',
  '/premortem/store.js',
  '/premortem/style.css',
  '/premortem/wizard.js',
  '/rank/',
  '/rank/app.js',
  '/rank/engine.js',
  '/roadmap/',
  '/roadmap/app.js',
  '/roadmap/edit-targets.js',
  '/roadmap/edit.js',
  '/roadmap/editor.js',
  '/roadmap/parse.js',
  '/roadmap/render.js',
  '/roadmap/style.css',
  '/roadmap/vendor/codemirror.js',
  '/timeline/',
  '/timeline/app.js',
  '/timeline/diff.js',
  '/timeline/edit-targets.js',
  '/timeline/editor.js',
  '/timeline/parse.js',
  '/timeline/render.js',
  '/timeline/style.css',
  '/tree/',
  '/tree/app.js',
  '/tree/edit-targets.js',
  '/tree/editor.js',
  '/tree/engine.js',
  '/tree/parse.js',
  '/tree/render.js',
  '/tree/style.css',
  '/wardley/',
  '/wardley/app.js',
  '/wardley/edit-targets.js',
  '/wardley/editor.js',
  '/wardley/layout.js',
  '/wardley/parse.js',
  '/wardley/render.js',
  '/wardley/style.css',
  '/why/',
  '/why/app-menu.js',
  '/why/app.js',
  '/why/diff.js',
  '/why/edit-targets.js',
  '/why/editor.js',
  '/why/parse.js',
  '/why/project.js',
  '/why/render-map.js',
  '/why/render-ost.js',
  '/why/style.css'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== location.origin) return;
  if(url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req).then(res => {
      if(res.ok){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req)
      .then(m => m || caches.match(url.pathname.replace(/\/$/, '/') === url.pathname ? url.pathname + 'index.html' : '/')))
  );
});
