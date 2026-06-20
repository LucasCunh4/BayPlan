const CACHE_BUSTER = 'stowage-plan-cachefix-2026-06-20-v3';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys.map(key => caches.delete(key))
    );

    await self.clients.claim();

    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of clients) {
      client.postMessage({
        type: 'STOWAGE_CACHE_CLEARED',
        version: CACHE_BUSTER
      });
    }
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      return await fetch(event.request, {
        cache: 'no-store'
      });
    } catch (err) {
      return new Response('Offline e sem cache disponível.', {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      });
    }
  })());
});
