/*
 * Service worker: lets the app open offline and install as a PWA.
 * This is a template: the build (vite.config.js, serviceWorkerPlugin) writes it
 * to dist/sw.js with VERSION and PRECACHE filled in, so every build installs a
 * new worker that caches all its files and drops the previous version's.
 *
 * - Pages (navigations): network first, so a new version shows up as soon as
 *   it is online; the cached index.html is the offline fallback (HashRouter
 *   means every screen is that one page).
 * - The app's own files: cache first. Vite gives them hashed names, so a
 *   cached file never goes stale; new versions arrive under new names.
 * - Google Fonts: served from the cache and refreshed in the background.
 * - Everything else (translators, Tatoeba, JLPT list...) goes to the network
 *   untouched: those need a connection anyway and must not be cached here.
 */
const VERSION = 'dev';
/** Every file of the build (JS, CSS, lazily loaded pages) plus public files; filled in by the build. */
const PRECACHE = [];
const CACHE = `vocab-cards-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icons/icon-192.png', './icons/icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  const files = [...new Set([...SHELL, ...PRECACHE.map((file) => `./${file}`)])];
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(files)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirstPage(request));
  } else if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
