// Service worker: tiene l'app in cache così funziona senza internet.
// Quando modifichi i file dell'app, aumenta il numero di versione qui sotto.
const CACHE = 'agenda-beb-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './pdf.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Prima la cache (risposta immediata, anche offline), poi aggiorna in background se c'è rete.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          // aggiorna in cache solo i file dell'app
          const rel = './' + new URL(req.url).pathname.slice(new URL(self.registration.scope).pathname.length);
          if (res && res.ok && ASSETS.includes(rel)) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (cached) return cached;
      const res = await network;
      if (res) return res;
      // offline e pagina non in cache: apre comunque l'app
      if (req.mode === 'navigate') { const home = await cache.match('./index.html'); if (home) return home; }
      return new Response('Offline', { status: 503 });
    })
  );
});
