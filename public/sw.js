// Sổ CSKH service worker — lưu app để mở được khi mất mạng.
// Dữ liệu Firestore do enablePersistence() lo riêng, SW chỉ lo "vỏ" app.
const V = 'socskh-v18';
const APP_SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icon-192.png',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(APP_SHELL.map(async u => { try { await c.add(new Request(u, {cache:'reload'})); } catch(_){} }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Không chen vào gọi Firestore / Auth / nhật ký — để Firebase SDK tự lo cache dữ liệu.
  if (/firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|google-analytics|googletagmanager|fcmregistrations|firebaseinstallations/.test(url.hostname)) return;
  const isShell = url.origin === location.origin || url.hostname === 'www.gstatic.com';
  if (!isShell) return;
  e.respondWith((async () => {
    const cache = await caches.open(V);
    // Trang chính (navigate): ưu tiên mạng để lấy bản mới; mất mạng dùng bản cache.
    if (req.mode === 'navigate') {
      try {
        const net = await fetch(req);
        cache.put('./index.html', net.clone());
        return net;
      } catch(_) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    }
    // Tài nguyên khác: cache trước, lỗi thì ra mạng, lấy xong lưu lại.
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net && net.ok) cache.put(req, net.clone());
      return net;
    } catch(_) {
      return hit || Response.error();
    }
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
