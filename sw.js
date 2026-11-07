/* IT-WORLD Routenplaner – Service Worker  © IT-WORLD – IT Solutions
   Strategie: sofort aus dem Speicher starten (kein Warten), im Hintergrund still nach neuen Dateien schauen.
   Kein skipWaiting: Ein Update wird erst beim nächsten Start aktiv – die laufende App wird nie gestört. */
const VERSION = '1.4.1';
const CACHE = 'itw-routenplaner-' + VERSION;
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('itw-routenplaner-') && k !== CACHE).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // Karten, Adresssuche & Routing gehen direkt (nie über den Cache)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const refresh = fetch(req, { cache: 'no-cache' }).then(res => { if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(refresh); return hit; }                       // sofort anzeigen, Update läuft still nebenher
    const res = await refresh;
    return res || (req.mode === 'navigate' ? (await cache.match('index.html')) : Response.error());
  })());
});
