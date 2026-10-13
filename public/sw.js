/* TIKUV PRO service worker: app shell keshlash, oflayn rejim, API uchun tarmoq-ustuvor strategiya. */
const CACHE_NAME = 'tikuv-pro-v2';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/views/shared.js',
  '/js/views/auth.js',
  '/js/views/employee.js',
  '/js/views/admin.js',
  '/js/views/customer.js',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API so'rovlar: tarmoq-ustuvor, tarmoq yo'q bo'lsa JSON xato qaytaradi
  // (sahifa oflayn banneri orqali foydalanuvchini ogohlantiradi).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ ok: false, error: "Internet aloqasi yo'q" }),
        { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      ))
    );
    return;
  }

  // Navigatsiya: kesh, so'ng tarmoq, ikkalasi ham yo'q bo'lsa oflayn sahifa.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // Statik fayllar: kesh-ustuvor, yangilanish fonda keshga yoziladi.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
