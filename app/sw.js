// Service worker: app shell offline (cache-first) con aggiornamento in background.
const CACHE = 'aipm-v1.0.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png',
  'js/main.js', 'js/store.js', 'js/notify.js', 'js/bridge.js', 'js/integrations.js',
  'js/core/units.js', 'js/core/time.js', 'js/core/catalog.js', 'js/core/monitor.js', 'js/core/forecast.js',
  'js/core/alerts.js', 'js/core/selector.js', 'js/core/advisor.js', 'js/core/indices.js', 'js/core/history.js',
  'js/core/export.js', 'js/core/snapshot.js', 'js/core/state.js',
  'js/ui/dom.js', 'js/ui/forms.js', 'js/ui/dashboard.js', 'js/ui/services.js', 'js/ui/usage.js', 'js/ui/advisor.js',
  'js/ui/compare.js', 'js/ui/indices.js', 'js/ui/history.js', 'js/ui/settings.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // proxy e API mai in cache
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list[0]?.focus() ?? self.clients.openWindow('./')));
});
