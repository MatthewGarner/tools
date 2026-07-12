/* Energy-origin worker — same strategy as the root sw.js (see its comment);
   PRECACHE lists URLs as served on energy.matthewgarner.me and is generated
   by dev/gen-sw.mjs (dev/pwa-precache.test.mjs enforces). */
const CACHE = 'energy-ceaf87ca7e';
const PRECACHE = [
  '/',
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
  '/assets/pwa.js',
  '/assets/saved-items.js',
  '/assets/schedule.js',
  '/assets/series.js',
  '/assets/snapshots.js',
  '/assets/svg.js',
  '/assets/tokens.css',
  '/assets/workspace.css',
  '/assets/workspace.js',
  '/cycles/',
  '/cycles/app.js',
  '/cycles/edit-targets.js',
  '/cycles/editor.js',
  '/cycles/engine.js',
  '/cycles/parse.js',
  '/cycles/render.js',
  '/cycles/sim-worker.js',
  '/cycles/style.css',
  '/frequency/',
  '/frequency/app.js',
  '/frequency/engine.js',
  '/frequency/render.js',
  '/frequency/state.js',
  '/frequency/style.css',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/intraday/',
  '/intraday/app.js',
  '/intraday/day.js',
  '/intraday/render-day.js',
  '/intraday/state.js',
  '/intraday/style.css',
  '/manifest.webmanifest',
  '/merit-order/',
  '/merit-order/app.js',
  '/merit-order/engine.js',
  '/merit-order/render.js',
  '/merit-order/scenarios.js',
  '/merit-order/stack.js',
  '/merit-order/state.js',
  '/merit-order/style.css',
  '/merit-order/technologies.js',
  '/risk/',
  '/risk/app.js',
  '/risk/edit-targets.js',
  '/risk/editor.js',
  '/risk/engine.js',
  '/risk/parse.js',
  '/risk/render.js',
  '/risk/style.css',
  '/roadmap/vendor/codemirror.js'
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
