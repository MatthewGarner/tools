/* Network-first, cache-fallback service worker: fresh whenever online (the site
   auto-deploys, so stale caches would be worse than none), everything you've
   visited works offline. The gauge relay (/api/) is live-only by design. */
const CACHE = 'tools-v1';

self.addEventListener('install', () => self.skipWaiting());
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
    }).catch(() => caches.match(req, {ignoreSearch: false})
      .then(m => m || caches.match('/index.html')))
  );
});
