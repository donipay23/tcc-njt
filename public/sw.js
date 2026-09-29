// Service worker PWA:
// - aset statis (/_next/static, ikon): cache-first
// - halaman Input Absensi: network-first, salinan terakhir disimpan agar bisa dibuka tanpa sinyal
// - halaman lain saat offline: tampilkan /offline.html
// Data absensi yang diinput offline disimpan di IndexedDB oleh aplikasi (bukan di sini).
const STATIC = "mps-static-v2";
const PAGES = "mps-pages";
const OFFLINE_PAGES = ["/absensi/input"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(["/icons/icon.svg", "/icons/icon-192.png", "/offline.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

async function networkFirstPage(request, key) {
  try {
    const res = await fetch(request);
    const finalPath = new URL(res.url || request.url).pathname;
    // hanya simpan halaman yang benar-benar tampil (bukan hasil redirect ke /login)
    if (res.ok && !res.redirected && finalPath === key) {
      const copy = res.clone();
      caches.open(PAGES).then((c) => c.put(key, copy));
    }
    return res;
  } catch {
    const hit = await caches.match(key, { cacheName: PAGES, ignoreVary: true });
    return hit || caches.match("/offline.html");
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    const key = OFFLINE_PAGES.find((p) => url.pathname === p);
    if (key) return e.respondWith(networkFirstPage(req, key));
    return e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
