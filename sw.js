// 노벨 뷰어 오프라인 캐시: 앱 파일과 라이브러리는 캐시에서, 새 버전은 다음 실행 때 반영
const CACHE = 'nv-v10';
const APP = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const LIBS = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                        // Claude API(POST)는 손대지 않음
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // 앱 파일: 네트워크 먼저(새 버전 반영), 안 되면 캐시
    e.respondWith(fetch(req).then(res => { if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req, {ignoreSearch: true})));
  } else if (LIBS.test(req.url)) {
    // 라이브러리·글꼴: 캐시 먼저
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
  }
});
