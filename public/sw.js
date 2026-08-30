const CACHE_PREFIX = 'sg-goals-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const SHELL_URLS = ['/', '/goals', '/manifest.webmanifest', '/sg-goals-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/goals', copy)));
          }
          return response;
        })
        .catch(() => caches.match('/goals'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      })
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'SG Goals timer';
  const body = payload.body || 'Your target timer is complete.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/sg-goals-icon.svg',
      badge: '/sg-goals-icon.svg',
      tag: payload.tag || 'sg-goals-alarm',
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
      data: { url: '/goals' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      const targetUrl = event.notification.data?.url || '/goals';
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
