// Daily Tally – Service Worker: Start ohne Netz nach dem ersten Aufruf.
// Beim Installieren werden index.html und alle darin (und in den CSS-Dateien) verlinkten Dateien zwischengespeichert.
const CACHE = 'daily-tally-shell-v1';

const sameOrigin = (u) => new URL(u, self.registration.scope).origin === self.location.origin;

async function precache() {
  const cache = await caches.open(CACHE);
  const base = new URL('./', self.registration.scope).href;
  const res = await fetch(new Request(base, { cache: 'reload' }));
  if (!res.ok) return;
  await cache.put(base, res.clone());
  const html = await res.text();
  const urls = new Set(['./manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png']);
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+)[^"]*"/g)) if (sameOrigin(m[1])) urls.add(m[1]);
  for (const u of [...urls]) {
    if (!u.endsWith('.css')) continue;
    try {
      const cssUrl = new URL(u, base).href;
      const css = await (await fetch(cssUrl)).text();
      for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        if (!m[1].startsWith('data:')) urls.add(new URL(m[1], cssUrl).href);
      }
    } catch { /* weiter */ }
  }
  await Promise.all([...urls].map(async (u) => {
    try { const r = await fetch(new URL(u, base).href, { cache: 'reload' }); if (r.ok) await cache.put(new URL(u, base).href, r); } catch { /* weiter */ }
  }));
}

self.addEventListener('install', (e) => { e.waitUntil(precache()); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !sameOrigin(req.url)) return;
  if (req.mode === 'navigate') {
    // Netz zuerst (neue Versionen), ohne Netz die gespeicherte Seite.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const base = new URL('./', self.registration.scope).href;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(base, res.clone());
        return res;
      } catch {
        return (await cache.match(base)) || (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }
  // Dateien mit Hash im Namen: Cache zuerst, sonst Netz und merken.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
