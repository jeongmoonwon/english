// 앱 파일을 기기에 저장해 오프라인에서도 열리게 합니다.
// index.html 등을 수정해 다시 올릴 때는 아래 버전 숫자와 index.html의 APP_VERSION을 같이 올려 주세요.
const CACHE = 'freedom-v10';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/ts-fsrs.mjs',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 페이지: 온라인이면 최신 버전, 오프라인이면 저장된 버전
  // (브라우저 HTTP 캐시를 건너뛰고 서버에 확인해서 push 직후에도 새 버전을 받음)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 나머지 파일: 저장된 것 먼저
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
