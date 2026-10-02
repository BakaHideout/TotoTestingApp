const CACHE_NAME = 'totoquest-v51';
const ASSETS = [
'./index.html',
'./manifest.json',
'./icon-192.png',
'./icon-512.png',
'./assets/loading-art.jpg',
'./assets/brand/icon-192.png',
'./assets/brand/icon-512.png',
'./assets/brand/icon-maskable-192.png',
'./assets/brand/icon-maskable-512.png',
'./assets/brand/apple-touch-icon.png',
'./assets/brand/favicon-48.png',
'./assets/battle/village.jpg',
'./assets/battle/village-blood.jpg',
'./assets/wardrobe/tee-tex2.jpg',
'./assets/wardrobe/l100broom-pumpkin.jpg',
'./assets/wardrobe/l100broom-glow.png',
'./assets/wardrobe/l100broom-thumb.png',
'./assets/wardrobe/tee-thumb.png',
'./assets/wardrobe/l100hat-thumb.png',
'./assets/wardrobe/l100hat-cone.jpg',
'./assets/wardrobe/l100hat-band.jpg',
'./assets/wardrobe/l100hat-brim.jpg',
'./assets/stops/stop.png',
'./assets/stops/stop-rest.png',
'./assets/items/raid-pass.png',
'./assets/items/elixir.png',
'./assets/vendor/three.module.min.js',
'./assets/vendor/GLTFLoader.js',
'./assets/girl-front.png',
'./assets/girl-back.png',
'./assets/boy-front.png',
'./assets/boy-back.png',
'./assets/girl-front-sm.png',
'./assets/girl-back-sm.png',
'./assets/boy-front-sm.png',
'./assets/boy-back-sm.png',
  './assets/totos/normal/banshee.png',
  './assets/totos/normal/batling.png',
  './assets/totos/normal/blaze_hare.png',
  './assets/totos/normal/bone_moth.png',
  './assets/totos/normal/boo_berry.png',
  './assets/totos/normal/candle_imp.png',
  './assets/totos/normal/candy_bat.png',
  './assets/totos/normal/candycorn_golem.png',
  './assets/totos/normal/cinder_cub.png',
  './assets/totos/normal/coffin_pup.png',
  './assets/totos/normal/crystal_bat.png',
  './assets/totos/normal/cursed_bunny.png',
  './assets/totos/normal/cursed_crow.png',
  './assets/totos/normal/fang_pup.png',
  './assets/totos/normal/flame_sprite.png',
  './assets/totos/normal/frost_fang.png',
  './assets/totos/normal/frost_owl.png',
  './assets/totos/normal/ghoul_kitten.png',
  './assets/totos/normal/grave_golem.png',
  './assets/totos/normal/grave_pebble.png',
  './assets/totos/normal/hex_hound.png',
  './assets/totos/normal/ice_pumpkin.png',
  './assets/totos/normal/jackalope.png',
  './assets/totos/normal/lantern_sprite.png',
  './assets/totos/normal/lava_pup.png',
  './assets/totos/normal/moon_rabbit.png',
  './assets/totos/normal/moonie.png',
  './assets/totos/normal/mummy_pup.png',
  './assets/totos/normal/nightcap.png',
  './assets/totos/normal/poison_frog.png',
  './assets/totos/normal/pumpkin_finch.png',
  './assets/totos/normal/pumpkin_ghost.png',
  './assets/totos/normal/pumpkin_pup.png',
  './assets/totos/normal/pumpkin_turtle.png',
  './assets/totos/normal/ravenette.png',
  './assets/totos/normal/rune_pixie.png',
  './assets/totos/normal/scarecrow_tot.png',
  './assets/totos/normal/shadow_slime.png',
  './assets/totos/normal/shadow_sprite.png',
  './assets/totos/normal/slime_wraith.png',
  './assets/totos/normal/soul_fox.png',
  './assets/totos/normal/specter_cat.png',
  './assets/totos/normal/spiderling.png',
  './assets/totos/normal/starling.png',
  './assets/totos/normal/thorn_imp.png',
  './assets/totos/normal/tomb_tot.png',
  './assets/totos/normal/toxic_spider.png',
  './assets/totos/normal/voodoo_doll.png',
  './assets/totos/normal/web_spinner.png',
  './assets/totos/normal/wispkin.png',
  './assets/totos/normal/witchling.png',
  './assets/totos/normal/pumpkin_tot.png',
  './assets/totos/normal/black_cat_tot.png',
  './assets/totos/normal/translucent_tot.png',
  './assets/totos/legendary/bone_steed.png',
  './assets/totos/legendary/ember_fox.png',
  './assets/totos/legendary/frost_howl.png',
  './assets/totos/legendary/grimlet.png',
  './assets/totos/legendary/nightwing_drake.png',
  './assets/totos/legendary/pumpkin_golem.png',
  './assets/totos/legendary/pumpkin_reaper.png',
  './assets/totos/legendary/royal_slime.png',
  './assets/totos/legendary/soul_witch.png',
  './assets/totos/legendary/void_guardian.png',
  './assets/totos/eternal/blossom_wraith.png',
  './assets/totos/eternal/harvest_warden.png',
  './assets/totos/eternal/max.png',
  './assets/totos/eternal/shadow_sovereign.png',
  './assets/totos/eternal/toni_scarecrow.png',
  './assets/totos/eternal/vesper_nightshade.png',
  './assets/totos/eternal/witch_hana.png'
];

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
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // other sites (map servers, weather) go straight to the network — the game keeps its
  // own long-lived copy of the map on the phone, and caching those here only filled the
  // app cache, which is wiped on every update anyway
  if (url.origin !== self.location.origin) return;
  // the in-app "is there a newer release?" check must always reach the server and is
  // never worth keeping a copy of
  if (url.pathname.endsWith('/version.json')) return;
  // Pages, scripts and data always revalidate with the server (a quick 304 when nothing
  // changed), so a new release shows up on the next launch rather than whenever the
  // HTTP cache happens to expire. Images keep the normal cache.
  const shell = url.origin === self.location.origin && (req.mode === 'navigate' || /\.(html|js|json)$/.test(url.pathname) || url.pathname.endsWith('/'));
  const netReq = shell ? new Request(req, { cache: 'no-cache' }) : req;
  event.respondWith(
    fetch(netReq).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(()=>{});
      return resp;
    }).catch(() => caches.match(event.request))
  );
});
