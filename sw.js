// Offline app shell. Bump VERSION whenever any listed file changes.
const VERSION = 'life-rpg-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'fonts/ChakraPetch-500.woff2', 'fonts/ChakraPetch-600.woff2', 'fonts/ChakraPetch-700.woff2', 'fonts/Inter-400-700.woff2',
  'src/ui/styles.css', 'src/ui/app.js', 'src/ui/views.js', 'src/ui/html.js', 'src/ui/icons.js',
  'src/data/store.js', 'src/ai/provider.js',
  'src/core/config.js', 'src/core/engine.js', 'src/core/progression.js', 'src/core/achievements.js',
  'src/core/migrations.js', 'src/core/recommender.js', 'src/core/templates.js', 'src/core/analytics.js',
  'src/core/planner.js', 'src/core/time.js', 'src/core/util.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Same-origin GETs: cache first, then network (and cache the result). Cross-origin (AI API, SDK CDN) is never cached.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
