// Minimal cache-first service worker so the app works offline once loaded.
const CACHE = 'gin-darts-v0.5.5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/dart.svg',
  './assets/dartboard.svg',
  './lib/qrious.min.js',
  './styles/main.css',
  './js/app.js',
  './js/ui/screens.js',
  './js/game/engine.js',
  './js/game/index.js',
  './js/util/helpers.js',
  './js/util/store.js',
  './js/util/debug-overlay.js',
  './js/net/rtc.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      }).catch(() => cached)
    )
  );
});
