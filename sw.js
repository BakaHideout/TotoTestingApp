const CACHE_NAME = 'totoquest-v111';
const ASSETS = [
'./assets/totos/eternal/scythecrow.png',
'./assets/totos/eternal/pharaoh_mummy.png',
'./assets/totos/eternal/gravewarden.png',
'./assets/ui/colosseum_map.jpg',
'./assets/stages/colosseum.jpg',
'./assets/stages/arena_dawn.jpg',
'./assets/stages/arena_day.jpg',
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
  './assets/items/gem.webp',
  './assets/items/gem-sm.png',
  './assets/battle/village.jpg',
  './assets/ui/coin-sm.png',
  './assets/ui/coin.png',
  './assets/ui/island.jpg',
  './assets/ui/toto_stage.jpg',
  './assets/stages/amethyst_night.jpg',
  './assets/stages/blood_moon.jpg',
  './assets/stages/ember_fields.jpg',
  './assets/stages/frost_hollow.jpg',
  './assets/stages/ghostly_mist.jpg',
  './assets/stages/golden_dawn.jpg',
  './assets/stages/moonlit_village.jpg',
  './assets/stages/shadow_realm.jpg',
  './assets/stages/sunny_harvest.jpg',
  './assets/stages/witchwood_swamp.jpg',
  './assets/totos/eternal/champ_pve1.png',
  './assets/totos/eternal/champ_pvp1.png',
  './assets/totos/eternal/harvest_warden.png',
  './assets/totos/eternal/lanternessa.png',
  './assets/totos/eternal/max_front.png',
  './assets/totos/eternal/max_side.png',
  './assets/totos/eternal/pumpkinsnare.png',
  './assets/totos/eternal/toni_scarecrow.png',
  './assets/totos/eternal/vesper_nightshade.png',
  './assets/totos/legendary/ember_fox.png',
  './assets/totos/legendary/pumpkin_golem.png',
  './assets/totos/legendary/void_guardian.png',
  './assets/totos/normal/banshee.png',
  './assets/totos/normal/batling.png',
  './assets/totos/normal/black_cat_tot.png',
  './assets/totos/normal/blaze_hare.png',
  './assets/totos/normal/bone_moth.png',
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
  './assets/totos/normal/pumpkin_tot.png',
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
  './assets/totos/normal/translucent_tot.png',
  './assets/totos/normal/voodoo_doll.png',
  './assets/totos/normal/web_spinner.png',
  './assets/totos/normal/wispkin.png',
  './assets/totos/normal/witchling.png'
];

// The game page itself lives in its own small cache, one copy per release: "index.html?tqv=v66".
// Those addresses are unique per release, so no web cache along the way can ever hand back an
// older copy of the page — which is what used to make the update banner come back after updating.
const VERSION = CACHE_NAME.replace('totoquest-', '');
const SHELL = 'totoquest-shell';
const pageKey = (v) => new URL('./index.html?tqv=' + encodeURIComponent(v), self.registration.scope).href;

function timeout(ms){ return new Promise((resolve) => setTimeout(() => resolve(null), ms)); }
async function latestVersion(){
  try {
    const r = await Promise.race([fetch(new URL('./version.json?t=' + Date.now(), self.registration.scope).href, { cache: 'no-store' }), timeout(2500)]);
    if (!r || !r.ok) return null;
    const j = await r.json();
    return (j && j.version) || null;
  } catch (e) { return null; }
}
// Download one release's page (only kept if it really is that release).
async function fetchPage(v){
  try {
    const r = await fetch(pageKey(v), { cache: 'no-store' });
    if (!r.ok) return null;
    const html = await r.text();
    const resp = new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (html.indexOf("TQ_APP_VERSION = '" + v + "'") >= 0){
      const cache = await caches.open(SHELL), cur = await getCurrent();
      // keep just this release and the one the player is on
      for (const k of await cache.keys()) if (k.url !== pageKey(v) && (!cur || k.url !== pageKey(cur))) await cache.delete(k);
      await cache.put(pageKey(v), resp.clone());
    }
    return resp;
  } catch (e) { return null; }
}
async function newestCachedPage(){
  const cache = await caches.open(SHELL);
  const keys = await cache.keys();
  let best = null, bestN = -1;
  for (const k of keys){ const n = parseInt((new URL(k.url).searchParams.get('tqv') || '').replace(/\D+/g, ''), 10) || 0; if (n > bestN){ bestN = n; best = k; } }
  return best ? cache.match(best) : null;
}
// Which release the player is on. The game only moves to a newer one when the player taps the
// "update" banner (a new release is downloaded in the background so the switch is instant).
const META = 'totoquest-meta';
const metaKey = () => new URL('./__tq-current', self.registration.scope).href;
async function getCurrent(){ try { const r = await caches.match(metaKey(), { cacheName: META }); return r ? (await r.text()).trim() : null; } catch (e) { return null; } }
async function setCurrent(v){ try { const c = await caches.open(META); await c.put(metaKey(), new Response(String(v))); } catch (e) {} }
// Opening the game: the release the player is on, straight from the phone.
async function gamePage(req){
  const cur = await getCurrent();
  if (cur){
    const hit = await caches.match(pageKey(cur), { cacheName: SHELL });
    if (hit) return hit;
    const again = await fetchPage(cur);
    if (again) return again;
  }
  // first time (or that release can't be found): the newest one, which becomes the player's release
  const v = (await latestVersion()) || VERSION;
  const page = (await caches.match(pageKey(v), { cacheName: SHELL })) || (await fetchPage(v));
  if (page){ await setCurrent(v); return page; }
  const saved = await newestCachedPage();
  if (saved) return saved;
  try { return await fetch(req); } catch (e) { return caches.match('./index.html'); }
}
// the update banner: move to this release (downloading its page first if needed)
async function useRelease(v){
  const page = (await caches.match(pageKey(v), { cacheName: SHELL })) || (await fetchPage(v));
  if (!page) return new Response('not ready', { status: 503 });
  await setCurrent(v);
  return new Response('ok', { status: 200 });
}

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(()=>{}),
    fetchPage(VERSION),
  ]));
  // No self.skipWaiting() here: the page decides. If it's already this release the helper takes
  // over quietly; otherwise the player gets the "update" banner and the switch happens on a tap.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHELL && k !== META).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
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
  // opening (or restarting) the game
  if (req.mode === 'navigate'){ event.respondWith(gamePage(req)); return; }
  // the player tapped "update"
  if (url.pathname.endsWith('/__tq-use')){ event.respondWith(useRelease(url.searchParams.get('v') || VERSION)); return; }
  // a specific release's page (the update banner grabs it before restarting)
  if (url.searchParams.has('tqv')){
    const v = url.searchParams.get('tqv');
    event.respondWith(caches.match(pageKey(v), { cacheName: SHELL }).then((hit) => hit || fetchPage(v)).then((r) => r || fetch(req)));
    return;
  }
  // Scripts and data always revalidate with the server (a quick 304 when nothing changed).
  // Images keep the normal cache.
  const shell = /\.(html|js|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  const netReq = shell ? new Request(req, { cache: 'no-cache' }) : req;
  event.respondWith(
    fetch(netReq).then((resp) => {
      // a missing file (404 and the like) never replaces a good copy the phone already has
      if (!resp.ok) return caches.match(event.request).then((hit) => hit || resp);
      const copy = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(()=>{});
      return resp;
    }).catch(() => caches.match(event.request))
  );
});
