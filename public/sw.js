const CACHE = "terrasatch-sim-shell-v1";
const CORE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/terrasatch-logo.png",
];
self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE))),
);
self.addEventListener("message", (e) => {
  if (e.data === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("terrasatch-sim-shell-") && key !== CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== "GET" ||
    u.origin !== self.location.origin ||
    u.pathname.startsWith("/api/")
  )
    return;
  const staticAsset = CORE.includes(u.pathname);
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
    return;
  }
  if (!staticAsset) return;
  e.respondWith(
    (async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      const response = await fetch(e.request);
      if (response.ok && response.type === "basic") {
        const c = await caches.open(CACHE);
        const keys = await c.keys();
        const bytes = Number(response.headers.get("content-length") || 0);
        if (keys.length < 50 && bytes < 2 * 1024 * 1024)
          await c.put(e.request, response.clone());
      }
      return response;
    })(),
  );
});
