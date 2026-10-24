// Offline app shell. Bump VERSION when shipped files change. The AI runtime is cached on first use.
const VERSION = 'whatif-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/Inter-400-700.woff2', 'fonts/SpaceGrotesk-500-700.woff2', 'fonts/JetBrainsMono-500-700.woff2',
  'src/ui/styles.css', 'src/ui/app.js', 'src/ui/html.js',
  'src/ui/views/common.js', 'src/ui/views/home.js', 'src/ui/views/create.js', 'src/ui/views/scenario.js', 'src/ui/views/tools.js', 'src/ui/views/system.js',
  'src/data/store.js', 'src/ai/provider.js', 'src/ai/rules.js', 'src/ai/schema.js', 'src/ai/gguf.js', 'src/ai/models.js', 'src/ai/explain.js',
  'src/engine/validate.js', 'src/engine/business.js', 'src/engine/career.js', 'src/engine/custom.js', 'src/engine/expr.js',
  'src/engine/montecarlo.js', 'src/engine/analysis.js', 'src/engine/tree.js', 'src/engine/scenario.js', 'src/engine/report.js',
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSION).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // model downloads are never cached here
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && !url.pathname.endsWith('.gguf')) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
