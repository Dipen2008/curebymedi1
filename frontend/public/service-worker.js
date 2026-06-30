/* CureByMedi service worker — offline shell for recently viewed pages */
const CACHE = "cbm-v1";
const SHELL = [
  "/",
  "/dashboard.html",
  "/scan.html",
  "/favorites.html",
  "/interactions.html",
  "/symptoms.html",
  "/compare.html",
  "/reminders.html",
  "/profile.html",
  "/medicine.html",
  "/css/style.css",
  "/js/api.js",
  "/js/dashboard.js",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API calls
  if (url.pathname.startsWith("/api/")) return;
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchAndCache = fetch(e.request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchAndCache;
    })
  );
});
