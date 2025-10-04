const CACHE = 'waei-v11-' + Date.now();
const ASSETS=['./','./index.html','./app.js','./js/scheduler.js','./js/swipe-nav.js','./js/practice_navigator.js','./js/explain.js','./data/builtin.csv','./assets/icon-192.png','./assets/icon-512.png','./assets/silence.mp3','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin===location.origin){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return resp})))}});
