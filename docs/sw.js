/* Cache statico per apertura offline, senza notifiche push o GPS in background. */
const VERSION='pure-web-cache-v8-map-files';
const ASSETS=['./','./index.html','./style.css','./app.js?v=map-files-v1','./enhancements.js','./dashboard.js','./hero-workspace.svg','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(
    fetch(event.request).then(response=>{
      if(response.ok){let duplicate=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,duplicate)).catch(()=>{});}
      return response;
    }).catch(()=>caches.match(event.request))
  );
});
