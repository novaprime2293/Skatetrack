// Service worker — cache app shell for offline use.
// Skatetrack is offline-first: data lives in IndexedDB, this just caches the static assets.
//
// Cache version is bumped when the app code changes in a way that requires a forced refresh
// for users (e.g., a fix that the stale SW would otherwise keep serving). Old caches are
// deleted by the activate handler below.

const CACHE = 'skatetrack-v27';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isHtml = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  // Network-first for HTML so users always pick up the latest app shell (and the asset hash refs
  // inside it). Fall back to cached index.html when offline so the PWA still boots.
  if (isHtml) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('/'))
    );
    return;
  }
  // Cache-first for hashed assets (their URL changes when the bundle changes, so stale entries
  // get orphaned naturally and the new hash is fetched from network).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
