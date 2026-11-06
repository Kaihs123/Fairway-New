// TheFairway service worker: instant loads, offline on the course
const V = 'fw-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const TILE_CACHE = 'fw-tiles';
const TILE_MAX = 600;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== TILE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name); const ks = await c.keys();
  for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache Supabase (accounts, live matches) or weather APIs
  if (/supabase\.co|open-meteo|api\./.test(url.host)) return;

  // Page: network first, fall back to cache when there's no signal
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('.html'))) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put('index.html', cp)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  // Satellite map tiles: cache first so holes load offline after one visit
  if (/arcgisonline|tile|tiles/.test(url.host + url.pathname)) {
    e.respondWith(caches.open(TILE_CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); trim(TILE_CACHE, TILE_MAX); } return r;
    }));
    return;
  }
  // Everything else (fonts, icons, scripts): stale-while-revalidate
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
