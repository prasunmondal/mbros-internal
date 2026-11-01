// Service worker for the installable app (PWA). Lives at the site root so its scope covers every page.
//
// - Same-origin files: network first, so a deploy shows up on the next load with no version bump;
//   the cached copy is used only when offline.
// - Pinned CDN scripts (jsDelivr) and Google Fonts: cache first, they never change.
// - The GridBase engine (script.google.com) is never touched: its calls are POSTs, which pass
//   straight through, and sheet data is never stored here (assets/js/config.js has its own cache).
//
// Bump VERSION only to drop old caches (e.g. after removing a page); normal deploys don't need it.
const VERSION = 'v1';
const SHELL = `mb-shell-${VERSION}`;
const CDN = `mb-cdn-${VERSION}`;

// Fetched on install so every tool opens offline even if it was never visited.
const PRECACHE = [
    './',
    'manifest.webmanifest',
    'pay/',
    'app/',
    'app/profits/', 'app/profits/profits.js', 'app/profits/profits.css',
    'app/mbros-statement/',
    'app/deliveries/', 'app/deliveries/deliveries.js', 'app/deliveries/deliveries.css',
    'app/statement/',
    'app/customer-performance/',
    'app/daily/',
    'app/customer-profit/',
    'app/balance/',
    'app/meters/',
    'app/calculator/',
    'assets/css/site.css',
    'assets/js/common.js',
    'assets/js/config.js',
    'assets/js/statement-pdf.js',
    'assets/img/favicon.svg',
    'assets/img/icon-192.png',
    'assets/img/upi-qr.jpeg'
].map(path => new URL(path, self.registration.scope).href);

const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(SHELL).then(cache =>
        // One by one, so a single missing file never blocks the install.
        Promise.all(PRECACHE.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})))
    ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(key => key !== SHELL && key !== CDN).map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
    } else if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(cacheFirst(request));
    }
    // Anything else (the engine, other sites) goes to the network untouched.
});

async function networkFirst(request) {
    const cache = await caches.open(SHELL);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // An uncached page while offline: open the app overview instead of the browser's error page.
        if (request.mode === 'navigate') {
            const overview = await cache.match(new URL('app/', self.registration.scope).href);
            if (overview) return overview;
        }
        throw error;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CDN);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    // Opaque (no-cors) responses have status 0 but are still usable from cache.
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
}
