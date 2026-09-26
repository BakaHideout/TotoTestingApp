const CACHE_NAME = 'totoquest-v22';
const ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './assets/loading-bg.jpg', './assets/girl-front.png', './assets/girl-back.png',
  './assets/boy-front.png', './assets/boy-back.png',
  './assets/girl-front-sm.png', './assets/girl-back-sm.png',
  './assets/boy-front-sm.png', './assets/boy-back-sm.png',
  './assets/totos/pumpkin_prowler.png', './assets/totos/sm/pumpkin_prowler.png',
  './assets/totos/moonlight_boo.png', './assets/totos/sm/moonlight_boo.png',
  './assets/totos/vinewing.png', './assets/totos/sm/vinewing.png',
  './assets/totos/graveguard.png', './assets/totos/sm/graveguard.png',
  './assets/totos/shadow_reaper.png', './assets/totos/sm/shadow_reaper.png',
  './assets/totos/frost_wyrm.png', './assets/totos/sm/frost_wyrm.png',
  './assets/totos/pumpkin_colossus.png', './assets/totos/sm/pumpkin_colossus.png',
  './assets/totos/nightmare_queen.png', './assets/totos/sm/nightmare_queen.png',
  './assets/totos/blood_moon_wolf.png', './assets/totos/sm/blood_moon_wolf.png',
  './assets/totos/thunder_serpent.png', './assets/totos/sm/thunder_serpent.png',
  './assets/totos/toxic_basilisk.png', './assets/totos/sm/toxic_basilisk.png',
  './assets/totos/soul_lantern.png', './assets/totos/sm/soul_lantern.png',
  './assets/totos/obsidian_golem.png', './assets/totos/sm/obsidian_golem.png',
  './assets/totos/hexen_drake.png', './assets/totos/sm/hexen_drake.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(()=>{})
  );
  // Intentionally no self.skipWaiting() here — the new version waits until the
  // player taps the in-app "Update available" banner before taking over.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Network-first for the app shell so a new deploy is detected promptly;
  // falls back to the cached copy when offline.
  event.respondWith(
    fetch(event.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(()=>{});
      return resp;
    }).catch(() => caches.match(event.request))
  );
});
