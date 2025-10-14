const CACHE='waei-cache-v3-4-1';
self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll([
      './',
      './index.html',
      './app.js',
      './styles.css',
      './manifest.webmanifest'
    ].filter(Boolean))).catch(()=>{})
  );
});
self.addEventListener('activate', e=>{
  e.waitUntil(
    (async()=>{
      const keys = await caches.keys();
      await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
      await self.clients.claim();
    })()
  );
});
self.addEventListener('message', e=>{
  if(e.data && e.data.type==='SKIP_WAITING'){ self.skipWaiting(); }
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  e.respondWith((async()=>{
    try{
      const net = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, net.clone()).catch(()=>{});
      return net;
    }catch{
      const cached = await caches.match(req);
      if(cached) return cached;
      return new Response('offline', {status:503});
    }
  })());
});