// Service worker: makes the app installable and usable offline.
// - App files: served from cache, refreshed in the background (stale-while-revalidate).
// - content/index.json: network first, so new text releases are noticed.
// - content shards: cache first (their URLs carry ?v=<version>, so new versions get new URLs).
// Bump SHELL_VERSION when you change the list of app files.

const SHELL_VERSION = 'shell-v1';
const CONTENT_CACHE = 'content-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/settings.js',
  'js/calendar/dates.js',
  'js/calendar/temporal.js',
  'js/calendar/sanctoral-data.js',
  'js/calendar/index.js',
  'js/content/store.js',
  'js/office/assemble.js',
  'js/office/render.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHELL_VERSION && key !== CONTENT_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/content/index.json')) {
    event.respondWith(networkFirst(req, CONTENT_CACHE));
  } else if (url.pathname.includes('/content/')) {
    event.respondWith(cacheFirst(req, CONTENT_CACHE));
  } else if (req.mode === 'navigate') {
    event.respondWith(networkFirst(new Request('index.html'), SHELL_VERSION));
  } else {
    event.respondWith(staleWhileRevalidate(req, SHELL_VERSION));
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || fresh;
}
