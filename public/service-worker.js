const CACHE_NAME = 'air-gesture-shell-__AIR_GESTURE_CACHE_VERSION__';
const BUILD_ASSETS = "__AIR_GESTURE_BUILD_ASSETS__";
const PRECACHE_ASSETS = Array.isArray(BUILD_ASSETS) ? BUILD_ASSETS : [];
const APP_SHELL = [
  '/',
  '/index.html',
  '/app/',
  '/app/index.html',
  '/air-gesture/',
  '/air-gesture/index.html',
  '/manifest.webmanifest',
  '/moderno-logo.png',
  '/moderno-logo-192.png',
  '/moderno-logo-512.png',
  '/air-gesture-onboarding.png'
];
const OFFLINE_RESOURCES = [
  '/models/hand_landmarker.task',
  '/models/pose_landmarker_lite.task',
  '/models/face_landmarker.task',
  '/wasm/vision_wasm_internal.js',
  '/wasm/vision_wasm_internal.wasm',
  '/wasm/vision_wasm_module_internal.js',
  '/wasm/vision_wasm_module_internal.wasm',
  '/wasm/vision_wasm_nosimd_internal.js',
  '/wasm/vision_wasm_nosimd_internal.wasm'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...new Set([...APP_SHELL, ...PRECACHE_ASSETS])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('air-gesture-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        const pathname = url.pathname.startsWith('/air-gesture')
          ? '/air-gesture/index.html'
          : url.pathname.startsWith('/app')
            ? '/app/index.html'
            : '/index.html';
        return (await caches.match(request)) || (await caches.match(pathname)) ||
          new Response('Air Gesture no está disponible sin conexión. Abrí la aplicación online y prepará los recursos offline primero.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response('Recurso no disponible sin conexión.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

self.addEventListener('message', (event) => {
  const client = event.source;
  if (!client || typeof client.postMessage !== 'function') return;
  const reply = (message) => {
    if (event.ports[0]) event.ports[0].postMessage(message);
    else client.postMessage(message);
  };

  if (event.data?.type === 'offline-status') {
    event.waitUntil((async () => {
      const missing = [];
      for (const resource of OFFLINE_RESOURCES) {
        if (!await caches.match(resource, { cacheName: CACHE_NAME })) missing.push(resource);
      }
      reply({
        type: 'offline-status',
        ready: missing.length === 0,
        missing: missing.length,
        total: OFFLINE_RESOURCES.length
      });
    })());
    return;
  }

  if (event.data?.type === 'prepare-offline') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        for (let index = 0; index < OFFLINE_RESOURCES.length; index += 1) {
          const resource = OFFLINE_RESOURCES[index];
          const response = await fetch(resource);
          if (!response.ok) {
            throw new Error(`No se pudo descargar ${resource} (HTTP ${response.status}).`);
          }
          await cache.put(resource, response);
          reply({
            type: 'offline-progress',
            completed: index + 1,
            total: OFFLINE_RESOURCES.length,
            resource
          });
        }
        reply({ type: 'offline-prepared', total: OFFLINE_RESOURCES.length });
      } catch (error) {
        reply({
          type: 'offline-error',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    })());
  }
});
