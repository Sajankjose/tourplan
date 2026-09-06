const CACHE="trip-app-v11-persistent-login";
const STATIC_ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg"];

self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate",e=>{
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    ))
  ]));
});

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;

  const url=new URL(e.request.url);
  const dynamic=
    url.pathname.endsWith("/supabase-config.js") ||
    url.pathname.endsWith("/cloud-sync.js");

  if(dynamic){
    e.respondWith(
      fetch(e.request,{cache:"no-store"})
        .catch(()=>caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached=>
      cached ||
      fetch(e.request).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
        return resp;
      }).catch(()=>caches.match("./index.html"))
    )
  );
});
