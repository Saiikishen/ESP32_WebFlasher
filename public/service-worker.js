const CACHE_NAME = 'esp32-flasher-v1';

// Assets that MUST be cached immediately for the app to work offline
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon.svg'
];

// External assets to cache at runtime (Fonts, Libraries)
const EXTERNAL_ORIGINS = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://unpkg.com'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Force cache all core assets
            return cache.addAll(CORE_ASSETS);
        }).then(() => self.skipWaiting()) // Activate worker immediately
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all clients immediately
    );
});

// Fetch event
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Strategy 1: External Assets (Fonts, CDN) -> Cache First, Network Fallback
    if (EXTERNAL_ORIGINS.some(origin => requestUrl.origin.startsWith(origin))) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;

                return fetch(event.request).then((networkResponse) => {
                    // Check if valid response (allow opaque responses with status 0 for externals)
                    if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
                        return networkResponse;
                    }

                    // Cache it
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                }).catch(() => {
                    // Fallback or just return undefined to let browser handle failure
                    return new Response('', { status: 408, statusText: 'Request timed out' });
                });
            })
        );
        return;
    }

    // Strategy 2: App Assets (Same Origin) -> Stale-While-Revalidate
    if (requestUrl.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                // 1. Return cached response immediately if available
                if (cachedResponse) {
                    // Background update
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse.clone());
                            });
                        }
                    }).catch(() => { /* ignore network error for background update */ });

                    return cachedResponse;
                }

                // 2. Not in cache - fetch from network
                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }

                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                }).catch((error) => {
                    console.error('Fetch failed:', event.request.url, error);
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
                });
            })
        );
    }
});
