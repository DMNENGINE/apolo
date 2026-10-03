// Service worker de la app móvil: caché del "cascarón" (red primero, caché si no hay red), push y clic en notificaciones.
// La API (/v1) NUNCA se cachea. Solo funciona en origen seguro (HTTPS o localhost); en http://IP-de-la-LAN el navegador no lo registra.
'use strict';
const CACHE = 'apolo-m-v2';
const CASCARON = ['./', 'index.html', 'app.css', 'app.js', 'escritorio.js', 'robot.js', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png',
  '../i18n.js', '../robot3d.js', '../casco.glb', '../vendor/three.module.min.js', '../vendor/GLTFLoader.js', '../vendor/BufferGeometryUtils.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCARON)).catch(() => { }).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/v1/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => { }); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'APOLO', {
    body: d.cuerpo || '', tag: d.tag || 'apolo', renotify: true, requireInteraction: !!d.urgente,
    icon: 'icono-192.png', badge: 'icono-192.png', data: { url: d.url || '/m/' }, vibrate: d.urgente ? [120, 60, 120] : undefined,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/m/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url.includes('/m/')) { c.navigate(url).catch(() => { }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
