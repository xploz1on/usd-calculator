const VERSION = 'v3';
const APP_SHELL_CACHE = `astro-calc-shell-${VERSION}`;
const DATA_CACHE = `astro-calc-data-${VERSION}`;
const APP_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

function isApiRequest(url) {
    return url.pathname === '/api/rates' || url.pathname === '/api/history';
}

function isStaticAssetRequest(request, url) {
    if (request.destination === 'style' || request.destination === 'script' || request.destination === 'image' || request.destination === 'font') {
        return true;
    }
    return url.origin === self.location.origin &&
        (url.pathname === '/manifest.json' ||
            /\.(?:css|js|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$/i.test(url.pathname));
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys
                .filter((key) => key !== APP_SHELL_CACHE && key !== DATA_CACHE)
                .map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    if (url.origin === self.location.origin && isApiRequest(url)) {
        event.respondWith(networkFirstForApi(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirstForHtml(request));
        return;
    }

    if (isStaticAssetRequest(request, url)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

async function networkFirstForApi(request) {
    const cache = await caches.open(DATA_CACHE);
    try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

async function networkFirstForHtml(request) {
    const cache = await caches.open(APP_SHELL_CACHE);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put('/index.html', response.clone());
        }
        return response;
    } catch (error) {
        return (await cache.match('/index.html')) || (await cache.match('/'));
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
        .then((response) => {
            if (response && response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    if (cached) {
        return cached;
    }
    const networkResponse = await networkPromise;
    if (networkResponse) return networkResponse;
    return fetch(request);
}
