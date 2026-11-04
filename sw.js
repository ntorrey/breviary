// Service worker: makes the app installable and usable offline.
// - App files: served from cache, refreshed in the background (stale-while-revalidate).
// - content/editions.json and each content/<edition>/index.json: network first,
//   so new text releases are noticed.
// - content shards: cache first (their URLs carry ?v=<version>, so new versions get new URLs).
// - version.json: network first (shown in Settings).
// - fonts/: cache first, in their own cache that survives app updates.
// The deploy workflow (.github/workflows/deploy.yml) rewrites SHELL_VERSION on
// every deploy, which makes phones install the new service worker and replace
// all cached app files.

const SHELL_VERSION = 'shell-dev';
const CONTENT_CACHE = 'content-v1';
const FONT_CACHE = 'fonts-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/fonts.css',
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
  // cache: 'reload' bypasses the browser's HTTP cache so we store the files just deployed.
  event.waitUntil(caches.open(SHELL_VERSION)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (![SHELL_VERSION, CONTENT_CACHE, FONT_CACHE].includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(networkFirst(req, SHELL_VERSION));
  } else if (url.pathname.includes('/fonts/')) {
    event.respondWith(cacheFirst(req, FONT_CACHE));
  } else if (url.pathname.includes('/content/') && /\/(index|editions)\.json$/.test(url.pathname)) {
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
