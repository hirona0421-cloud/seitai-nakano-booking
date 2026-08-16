const CACHE_NAME='nakano-pwa-shell-v1';
const OFFLINE_URL='./offline.html';
const SHELL=[
  OFFLINE_URL,
  './assets/nakano-logo.png',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.match(OFFLINE_URL)));
  }
});
