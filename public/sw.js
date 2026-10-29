// Kibitz service worker: makes the app load and run with no network.
//
// At build time scripts/postbuild.mjs fills in VERSION (a hash of the build) and PRECACHE (every file of the build).
// The first visit stores them all, so afterwards the app, the chess engine and the opening list work offline.
// Only same-origin GET requests are handled: calls to Chess.com's public data API always go to the network.
// A new version installs in the background and takes over the next time every Kibitz tab has been closed, so a tab
// that is open is never switched to different code half-way through.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `kibitz-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('kibitz-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        // The app is one page (hash routes), so every navigation gets the cached index.html.
        const page = await cache.match('./index.html');
        if (page) return page;
        return fetch(req);
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => undefined);
      return res;
    })(),
  );
});
