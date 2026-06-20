/*
  Service Worker - Stowage Plan Pro
  Coloque este arquivo na raiz pública do site, acessível como: /sw.js
*/

const SW_VERSION = '2026-06-19-v18';
const STATIC_CACHE = `stowage-plan-static-${SW_VERSION}`;
const RUNTIME_CACHE = `stowage-plan-runtime-${SW_VERSION}`;
const HTML_CACHE = `stowage-plan-html-${SW_VERSION}`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/sw.js'
];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

function isHttpRequest(request) {
  return request && (request.url.startsWith('http://') || request.url.startsWith('https://'));
}

async function putSafe(cacheName, request, response) {
  if (!response) return;
  const cache = await caches.open(cacheName);

  try {
    await cache.put(request, response.clone());
  } catch (err) {
    console.warn('[SW] Não foi possível salvar no cache:', request.url, err);
  }
}

async function cacheAppShell() {
  const cache = await caches.open(STATIC_CACHE);

  await Promise.allSettled(
    APP_SHELL.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response && response.ok) {
          await cache.put(url, response.clone());
        }
      } catch (err) {
        console.warn('[SW] Falha ao pré-cachear app shell:', url, err);
      }
    })
  );

  await Promise.allSettled(
    CDN_ASSETS.map(async url => {
      try {
        const request = new Request(url, { mode: 'cors' });
        const response = await fetch(request);

        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(request, response.clone());
        }
      } catch (err) {
        console.warn('[SW] Falha ao pré-cachear CDN:', url, err);
      }
    })
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key.startsWith('stowage-plan-'))
            .filter(key => ![STATIC_CACHE, RUNTIME_CACHE, HTML_CACHE].includes(key))
            .map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await putSafe(HTML_CACHE, request, response);
      await putSafe(HTML_CACHE, '/index.html', response);
    }

    return response;
  } catch (err) {
    const cachedRequest = await caches.match(request);
    if (cachedRequest) return cachedRequest;

    const cachedIndex = await caches.match('/index.html');
    if (cachedIndex) return cachedIndex;

    return new Response(
      `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Stowage Plan Pro - Offline</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              background: #e4e7eb;
              color: #1a2a3a;
            }

            .box {
              max-width: 560px;
              margin: 12vh auto;
              background: #fff;
              padding: 24px;
              border-radius: 10px;
              box-shadow: 0 8px 24px rgba(0,0,0,.15);
            }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Stowage Plan Pro</h1>
            <p>Você está offline e ainda não há uma versão salva desta página no cache.</p>
            <p>Abra o site uma vez com internet para o Service Worker salvar a aplicação.</p>
          </div>
        </body>
      </html>`,
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      }
    );
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);

  if (response && (response.ok || response.type === 'opaque')) {
    await putSafe(STATIC_CACHE, request, response);
  }

  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then(async response => {
      if (response && (response.ok || response.type === 'opaque')) {
        await putSafe(RUNTIME_CACHE, request, response);
      }

      return response;
    })
    .catch(() => null);

  return cached || fetchPromise || new Response('', {
    status: 504,
    statusText: 'Offline'
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (!isHttpRequest(request) || request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navegação: tenta rede primeiro para pegar atualizações; se falhar, usa cache.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // CDN do html2pdf e demais recursos externos: cache primeiro.
  if (url.origin !== self.location.origin) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // JS/CSS/imagens/fontes locais: stale-while-revalidate.
  if (/\.(?:js|css|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Outros GET locais: rede primeiro, cache como fallback.
  event.respondWith(
    fetch(request)
      .then(async response => {
        if (response && response.ok) {
          await putSafe(RUNTIME_CACHE, request, response);
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);

        return cached || new Response('', {
          status: 504,
          statusText: 'Offline'
        });
      })
  );
});

self.addEventListener('message', event => {
  if (!event.data || !event.data.type) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'CLEAR_STOWAGE_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => {
        return Promise.all(
          keys
            .filter(key => key.startsWith('stowage-plan-'))
            .map(key => caches.delete(key))
        );
      })
    );
  }
});
