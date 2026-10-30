// Offline shell + poor-network caching + push notifications.
const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const API = `api-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

// Only public catalogue data is cached; personal data (orders, account) always goes to the network.
const PUBLIC_API = /^\/api\/(settings|categories|products)(\/|\?|$)/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/admin')) return; // staff app is not part of the customer PWA

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      caches.open(SHELL).then((c) => c.put('/', res.clone()));
      return res;
    }).catch(() => caches.match('/')));
    return;
  }
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) return e.respondWith(cacheFirst(req));
  if (url.origin === location.origin && url.pathname.startsWith('/uploads/')) return e.respondWith(cacheFirst(req));
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return e.respondWith(cacheFirst(req));
  if (url.origin === location.origin && PUBLIC_API.test(url.pathname + url.search) && !req.headers.has('authorization')) {
    e.respondWith(networkFirst(req, API, 6000));
  }
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'Update', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Update', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) {
        c.navigate(url);
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
