const CACHE_NAME = 'kawal-suara-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html'
];

// Install Service Worker & Cache assets
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate & Cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cache => cache !== CACHE_NAME)
                          .map(cache => caches.delete(cache))
            );
        })
    );
});

// Intercept fetch requests (Offline fallback)
self.addEventListener('fetch', event => {
    // Abaikan request API POST (biarkan IndexDB yang menangani offline data entry)
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        }).catch(() => {
            // Jika gagal ambil dari network dan tidak ada di cache, arahkan ke halaman utama
            return caches.match('./index.html');
        })
    );
});
