const VERSION = 'v12';
const SHELL = `gijon-hoy-shell-${VERSION}`;
const DATA = `gijon-hoy-data-${VERSION}`;
const TILES = `gijon-hoy-tiles-${VERSION}`;
const MAX_TILES = 300;

const SHELL_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/data.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/fonts/plus-jakarta-sans-latin.woff2',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' evita guardar copias antiguas de la caché HTTP del navegador.
  event.waitUntil(caches.open(SHELL)
    .then((cache) => cache.addAll(SHELL_FILES.map((file) => new Request(file, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const current = new Set([SHELL, DATA, TILES]);
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('gijon-hoy-') && !current.has(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Datos: primero la red; si falla, la última copia guardada.
async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const saved = await cache.match(request);
    if (saved) return saved;
    throw error;
  }
}

// App: respuesta inmediata desde caché y actualización en segundo plano.
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SHELL);
  // Todas las navegaciones comparten la misma entrada; no-cache obliga a revalidar con el servidor.
  const key = request.mode === 'navigate' ? 'index.html' : request;
  const saved = await cache.match(key);
  const update = fetch(request.url, { cache: 'no-cache' }).then((response) => {
    if (response.ok) cache.put(key, response.clone());
    return response;
  });
  if (saved) {
    event.waitUntil(update.catch(() => {}));
    return saved;
  }
  return update.catch(async (error) => {
    if (request.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw error;
  });
}

// Mapa: las teselas ya vistas siguen disponibles sin conexión, con un máximo guardado.
async function tile(request, event) {
  const cache = await caches.open(TILES);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    event.waitUntil((async () => {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_TILES)).map((key) => cache.delete(key)));
    })());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === 'opendata.gijon.es' || url.hostname === 'drupal.gijon.es') event.respondWith(networkFirst(request));
  else if (url.hostname === 'tile.openstreetmap.org') event.respondWith(tile(request, event));
  else if (url.origin === self.location.origin) event.respondWith(staleWhileRevalidate(request, event));
});
