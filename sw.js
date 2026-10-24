/* ============================================================
   Service Worker - Cải Xanh Học MAS202 (PWA)
   Chiến lược cache:
   - Navigation (trang chính): Network-first -> fallback cache -> offline shell
   - Static same-origin (icons, manifest): Cache-first
   - CDN (KaTeX, fonts, Firebase SDK, Google Fonts): Stale-while-revalidate
   ============================================================ */

const CACHE_NAME = "cai-xanh-hoc-mas-v2";
const OFFLINE_URL = "./index.html";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
];

// CDN thưởng thức: cache runtime để dùng offline
const CDN_HOSTS = [
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "www.gstatic.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Dọn cache phiên bản cũ
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1) Điều hướng trang -> network-first, fallback cache/offline shell
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(OFFLINE_URL, await fresh.clone());
          return fresh;
        } catch (err) {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match(OFFLINE_URL)) ||
            new Response(
              "<h1>Bạn đang offline</h1><p>Vui lòng kết nối Internet để tải phiên bản mới nhất.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
          );
        }
      })()
    );
    return;
  }

  // 2) Same-origin static -> cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch (err) {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // 3) CDN tin cậy -> stale-while-revalidate
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME + "-cdn");
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await network) || new Response("", { status: 504, statusText: "Offline" });
      })()
    );
  }
});
