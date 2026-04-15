// Service Worker for 虾书
const CACHE_NAME = 'xiabook-v3';
const urlsToCache = [];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // 导航请求（页面跳转）不拦截，让浏览器正常处理
  if (event.request.mode === 'navigate') {
    return;
  }
  
  // 只缓存同源请求
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).catch(() => {
          // 非关键请求网络失败时静默忽略
          return new Response(null, { status: 204 });
        });
      })
  );
});
