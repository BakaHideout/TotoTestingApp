const CACHE_NAME = 'totoquest-v23';
const ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './assets/loading-bg.jpg', './assets/girl-front.png', './assets/girl-back.png',
  './assets/boy-front.png', './assets/boy-back.png',
  './assets/girl-front-sm.png', './assets/girl-back-sm.png',
  './assets/boy-front-sm.png', './assets/boy-back-sm.png',
  './assets/totos/banshee.png', './assets/totos/sm/banshee.png',
  './assets/totos/batling.png', './assets/totos/sm/batling.png',
  './assets/totos/blaze_hare.png', './assets/totos/sm/blaze_hare.png',
  './assets/totos/bone_moth.png', './assets/totos/sm/bone_moth.png',
  './assets/totos/bone_steed.png', './assets/totos/sm/bone_steed.png',
  './assets/totos/boo_berry.png', './assets/totos/sm/boo_berry.png',
  './assets/totos/candle_imp.png', './assets/totos/sm/candle_imp.png',
  './assets/totos/candy_bat.png', './assets/totos/sm/candy_bat.png',
  './assets/totos/candycorn_golem.png', './assets/totos/sm/candycorn_golem.png',
  './assets/totos/cinder_cub.png', './assets/totos/sm/cinder_cub.png',
  './assets/totos/coffin_pup.png', './assets/totos/sm/coffin_pup.png',
  './assets/totos/crystal_bat.png', './assets/totos/sm/crystal_bat.png',
  './assets/totos/cursed_bunny.png', './assets/totos/sm/cursed_bunny.png',
  './assets/totos/cursed_crow.png', './assets/totos/sm/cursed_crow.png',
  './assets/totos/ember_fox.png', './assets/totos/sm/ember_fox.png',
  './assets/totos/fang_pup.png', './assets/totos/sm/fang_pup.png',
  './assets/totos/flame_sprite.png', './assets/totos/sm/flame_sprite.png',
  './assets/totos/frost_fang.png', './assets/totos/sm/frost_fang.png',
  './assets/totos/frost_howl.png', './assets/totos/sm/frost_howl.png',
  './assets/totos/frost_owl.png', './assets/totos/sm/frost_owl.png',
  './assets/totos/ghoul_kitten.png', './assets/totos/sm/ghoul_kitten.png',
  './assets/totos/grave_golem.png', './assets/totos/sm/grave_golem.png',
  './assets/totos/grave_pebble.png', './assets/totos/sm/grave_pebble.png',
  './assets/totos/grimlet.png', './assets/totos/sm/grimlet.png',
  './assets/totos/hex_hound.png', './assets/totos/sm/hex_hound.png',
  './assets/totos/ice_pumpkin.png', './assets/totos/sm/ice_pumpkin.png',
  './assets/totos/jackalope.png', './assets/totos/sm/jackalope.png',
  './assets/totos/lantern_sprite.png', './assets/totos/sm/lantern_sprite.png',
  './assets/totos/lava_pup.png', './assets/totos/sm/lava_pup.png',
  './assets/totos/moon_rabbit.png', './assets/totos/sm/moon_rabbit.png',
  './assets/totos/moonie.png', './assets/totos/sm/moonie.png',
  './assets/totos/mummy_pup.png', './assets/totos/sm/mummy_pup.png',
  './assets/totos/nightcap.png', './assets/totos/sm/nightcap.png',
  './assets/totos/nightwing_drake.png', './assets/totos/sm/nightwing_drake.png',
  './assets/totos/poison_frog.png', './assets/totos/sm/poison_frog.png',
  './assets/totos/pumpkin_finch.png', './assets/totos/sm/pumpkin_finch.png',
  './assets/totos/pumpkin_ghost.png', './assets/totos/sm/pumpkin_ghost.png',
  './assets/totos/pumpkin_golem.png', './assets/totos/sm/pumpkin_golem.png',
  './assets/totos/pumpkin_pup.png', './assets/totos/sm/pumpkin_pup.png',
  './assets/totos/pumpkin_reaper.png', './assets/totos/sm/pumpkin_reaper.png',
  './assets/totos/pumpkin_turtle.png', './assets/totos/sm/pumpkin_turtle.png',
  './assets/totos/ravenette.png', './assets/totos/sm/ravenette.png',
  './assets/totos/royal_slime.png', './assets/totos/sm/royal_slime.png',
  './assets/totos/rune_pixie.png', './assets/totos/sm/rune_pixie.png',
  './assets/totos/scarecrow_tot.png', './assets/totos/sm/scarecrow_tot.png',
  './assets/totos/shadow_slime.png', './assets/totos/sm/shadow_slime.png',
  './assets/totos/shadow_sprite.png', './assets/totos/sm/shadow_sprite.png',
  './assets/totos/slime_wraith.png', './assets/totos/sm/slime_wraith.png',
  './assets/totos/soul_fox.png', './assets/totos/sm/soul_fox.png',
  './assets/totos/soul_witch.png', './assets/totos/sm/soul_witch.png',
  './assets/totos/specter_cat.png', './assets/totos/sm/specter_cat.png',
  './assets/totos/spiderling.png', './assets/totos/sm/spiderling.png',
  './assets/totos/starling.png', './assets/totos/sm/starling.png',
  './assets/totos/thorn_imp.png', './assets/totos/sm/thorn_imp.png',
  './assets/totos/tomb_tot.png', './assets/totos/sm/tomb_tot.png',
  './assets/totos/toxic_spider.png', './assets/totos/sm/toxic_spider.png',
  './assets/totos/void_guardian.png', './assets/totos/sm/void_guardian.png',
  './assets/totos/voodoo_doll.png', './assets/totos/sm/voodoo_doll.png',
  './assets/totos/web_spinner.png', './assets/totos/sm/web_spinner.png',
  './assets/totos/wispkin.png', './assets/totos/sm/wispkin.png',
  './assets/totos/witchling.png', './assets/totos/sm/witchling.png'];

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
