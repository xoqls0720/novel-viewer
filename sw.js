// 노벨 뷰어 오프라인 캐시: 앱 파일과 라이브러리는 캐시에서, 새 버전은 다음 실행 때 반영
const CACHE = 'nv-v53';
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
  // 구글 드라이브 영상·그림: 화면이 ./__drv/<id>?t=토큰 으로 부르면 토큰을 머리글로 바꿔 드라이브에 구간 요청한다(<video> 는 머리글을 못 붙인다)
  if (url.origin === location.origin && url.pathname.includes('/__drv/')){ e.respondWith(drvProxy(req, url)); return; }
  // 같은 와이파이로 본 PC 서재·영상(구간 요청)·번역·다운로더는 캐시에 넣지 않는다 (크고, 늘 새것)
  if (url.origin === location.origin && (/\/t\/[^/]+\/(lan|tr|moa|toki)(\/|$)/.test(url.pathname) || req.headers.has('range'))) return;
  if (url.origin === location.origin) {
    // 앱 파일: 네트워크 먼저(새 버전 반영), 안 되면 캐시
    e.respondWith(fetch(req).then(res => { if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req, {ignoreSearch: true})));
  } else if (LIBS.test(req.url)) {
    // 라이브러리·글꼴: 캐시 먼저
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
  }
});

// 구간 응답의 Content-Range 는 드라이브가 다른 주소에는 보여 주지 않아서, 목록에서 받은 크기(s)로 직접 만든다 (iPhone 사파리는 206·Content-Range 가 꼭 있어야 재생한다)
async function drvProxy(req, url){
  const id = url.pathname.split('/__drv/')[1], size = +url.searchParams.get('s') || 0, type = url.searchParams.get('m') || 'application/octet-stream';
  const h = {Authorization: 'Bearer ' + url.searchParams.get('t')};
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let a = 0, b = size - 1;
  if (m && size){ if (m[1] === '') a = Math.max(0, size - +m[2]); else { a = +m[1]; if (m[2] !== '') b = Math.min(size - 1, +m[2]); } h.Range = `bytes=${a}-${b}`; }
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {headers: h});
  if (!r.ok) return new Response(r.body, {status: r.status});
  const out = {'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'};
  if (h.Range){ out['Content-Range'] = `bytes ${a}-${b}/${size}`; out['Content-Length'] = String(b - a + 1); return new Response(r.body, {status: 206, headers: out}); }
  if (size) out['Content-Length'] = String(size);
  return new Response(r.body, {status: 200, headers: out});
}
