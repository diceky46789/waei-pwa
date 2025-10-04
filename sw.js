/* PWA Service Worker – 3.4.2 */
const VERSION="3.4.2";
const STATIC_CACHE="waei-static-"+VERSION;
const RUNTIME_CACHE="waei-runtime-"+VERSION;

self.addEventListener("install", (event)=>{
  // Immediately activate new SW
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener("activate", (event)=>{
  event.waitUntil((async()=>{
    const names = await caches.keys();
    await Promise.all(names.filter(n => !n.endsWith(VERSION)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Allow page to tell SW to skip waiting
self.addEventListener("message", (event)=>{
  if (event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  const url = new URL(req.url);
  // Only GET requests are cached
  if (req.method !== "GET") return;

  // For navigations (HTML), always try network first so updates propagate
  if (req.mode === "navigate") {
    event.respondWith((async()=>{
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch(e) {
        const cached = await caches.match(req);
        return cached || new Response("offline", {status: 503});
      }
    })());
    return;
  }

  // For JS/CSS/manifest use network-first (so code updates arrive)
  if (/\.(?:js|css|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async()=>{
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch(e) {
        const cached = await caches.match(req);
        return cached || new Response("offline", {status: 503});
      }
    })());
    return;
  }

  // For images: cache-first
  if (/\.(?:png|jpg|jpeg|gif|svg|ico)$/.test(url.pathname)) {
    event.respondWith((async()=>{
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch(e) {
        return new Response("offline", {status: 503});
      }
    })());
    return;
  }

  // Default: try network then cache
  event.respondWith((async()=>{
    try { return await fetch(req); }
    catch(e) {
      const cached = await caches.match(req);
      return cached || new Response("offline", {status: 503});
    }
  })());
});
