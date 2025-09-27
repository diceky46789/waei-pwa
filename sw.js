
const CACHE="waei-cache-v2-native-rebuilt";
const ASSETS=[
  "./","./index.html","./styles.css","./app.js","./manifest.webmanifest",
  "./resources/builtin_problems.csv",
  "./icons/icon-192.png","./icons/icon-512.png","./icons/icon-180.png"
];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  if (url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
  } else {
    e.respondWith(fetch(e.request).catch(()=> new Response("offline",{status:503})));
  }
});
