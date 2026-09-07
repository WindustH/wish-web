// Service worker — app shell precache with conservative strategies:
//   · navigations + static assets: cache-first with background refresh
//   · /wishd-api/*: never cached (always live)
// Offline = the shell loads and reports API unavailability (see sync slice).
const VERSION = 'wish-web-v2.0.0-1';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/styles/tokens.css', '/styles/base.css', '/styles/components.css',
  '/styles/layout.css', '/styles/features.css',
  '/vendor/preact/preact.module.js', '/vendor/preact/hooks.module.js',
  '/vendor/htm/htm.module.js',
  '/app-icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/wishd-api/')) return;              // live only
  if (url.pathname.startsWith('/app/')) return;                    // modules: fresh during dev
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreSearch: url.pathname === '/' });
    if (hit) {
      e.waitUntil(fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); }).catch(() => {}));
      return hit;
    }
    const res = await fetch(e.request);
    if (res.ok && url.origin === location.origin) cache.put(e.request, res.clone());
    return res;
  })());
});
