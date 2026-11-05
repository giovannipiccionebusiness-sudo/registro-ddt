/* Cache only the public app shell. Google data, PDFs and access tokens are never cached. */
const CACHE='registro-ddt-shell-v13';
const ASSETS=['./orders-core-v12.js','./orders-api-v12.js','./orders-v12.js','./orders-v12.css','./ordini-attivazione.html','./gas/ImportazioneOrdini.gs','./','./index.html','./app-v10.js','./api-v10.js','./mobile.css','./pwa.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('registro-ddt-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const allowed=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).pathname));
 if(!allowed.has(url.pathname))return;
 event.respondWith((async()=>{
 const cache=await caches.open(CACHE);
 try{const response=await fetch(request,{cache:'no-store'});if(response.ok)await cache.put(request,response.clone());return response;}
 catch(error){const cached=await cache.match(request,{ignoreSearch:true});if(cached)return cached;throw error;}
 })());
});
