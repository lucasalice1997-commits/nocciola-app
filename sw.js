const scope = self.registration.scope;
const prefix = 'nocciola:' + scope + ':';
const cacheName = prefix + 'nocciola-v60';
const shell = new URL('index.html', scope).href;
const offers = new URL('offers.json', scope).href;
// v44: anche i caratteri (prima arrivavano da Google Fonts), così funzionano offline
const assets = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'favicon-48.png', 'apple-touch-icon.png',
  'fonts/dm-sans-latin.woff2', 'fonts/dm-sans-latin-ext.woff2', 'fonts/fraunces-latin.woff2', 'fonts/fraunces-latin-ext.woff2']
  .map(path => new URL(path, scope).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    // cache: 'reload' = sempre dalla rete, mai una copia vecchia dalla cache del browser (v27)
    await cache.addAll([shell, offers, ...assets].map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // cache di questa app con nome nuovo (prefisso) o vecchio ("nocciola-vNN", fino alla v15)
    await Promise.all(keys.filter(key => (key.startsWith(prefix) && key !== cacheName) || /^nocciola-v\d+$/.test(key))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, key) {
  const cache = await caches.open(cacheName);
  try {
    // no-cache (v37): chiede sempre al server se c'è una versione nuova, invece di usare una copia vecchia del browser
    const response = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (response.ok) {
      if (key === offers) {
        const data = await response.clone().json();
        if (!Array.isArray(data?.offers)) throw new Error('Dati delle offerte non validi');
      }
      try { await cache.put(key, response.clone()); } catch { /* La rete resta disponibile. */ }
      return response;
    }
    return await cache.match(key) || response;
  } catch {
    return await cache.match(key) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.search = '';
  if (url.href === offers) {
    event.respondWith(networkFirst(request, offers));
  } else if (request.mode === 'navigate' && (url.href === scope || url.href === shell)) {
    event.respondWith(networkFirst(request, shell));
  } else if (assets.includes(url.href)) {
    event.respondWith(caches.open(cacheName).then(async cache => await cache.match(url.href) || fetch(request)));
  }
});
