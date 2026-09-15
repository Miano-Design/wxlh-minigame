/* 《残域》· 离线缓存（PWA）
   ------------------------------------------------------------
   手机「添加到主屏幕」之后再打开就是全屏 App，断网也能玩。

   两条规矩：
   ① **改版本号 = 换一份新缓存**：VERSION 一变，旧缓存在 activate 里全清掉，
      不会出现"更新了代码但手机还是旧的"。
   ② 页面（导航请求）走"网络优先、断网回缓存"，静态资源走"先用缓存、后台顺手更新"，
      既保证拿得到新版，也保证没网能开。 */
const V = '9.5.22';
const CACHE = 'wxlh-v' + V;

// 要预缓存的本地文件（和 index.html 里引用的资源一一对应，改版本号时一起改）
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=' + V,
  './js/data.js?v=' + V,
  './js/core.js?v=' + V,
  './js/battle.js?v=' + V,
  './js/dungeon.js?v=' + V,
  './js/ui.js?v=' + V,
  './js/main.js?v=' + V,
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(() => {})          // 个别文件缺失不该让安装失败（离线兜底优先）
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 只管家里的文件

  // 页面：先走网络（拿到新版本），断网或超时再用缓存顶上
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // 静态资源：先用缓存（秒开），同时在后台悄悄更新一份新的
  e.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
