
(function(){
  const ADMIN_EMAIL = "tyeandmaxgates@gmail.com";
  const root = document.getElementById('toto-root');
  const $ = (sel, ctx) => (ctx||root).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx||root).querySelectorAll(sel));

  // ---------------- SOUND ----------------
  // Everything here is synthesized live with the Web Audio API rather than loaded from
  // sound files — this is a static GitHub Pages site with no audio assets shipped, and
  // synthesizing keeps the PWA fully offline-capable with zero extra download weight.
  // A soft, minor-key ambient loop plays as "music"; catch/attack/victory are short
  // procedural stingers. Everything respects one mute toggle, persisted in localStorage
  // (a device setting, not account data, so it isn't part of the save-game payload).
  const Sound = (function(){
    let ctx = null, master = null, musicGain = null, musicTimer = null, started = false;
    let muted = (function(){ try { return localStorage.getItem('totoquest_muted')==='1'; } catch(e){ return false; } })();
    function ensureCtx(){
      if (ctx) return ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
        musicGain = ctx.createGain(); musicGain.gain.value = 0.35; musicGain.connect(master);
      } catch(e){ ctx = null; }
      return ctx;
    }
    function tone(freq, startAt, dur, opts){
      opts = opts||{};
      const c = ensureCtx(); if (!c) return;
      const osc = c.createOscillator(); osc.type = opts.type||'sine'; osc.frequency.value = freq;
      const g = c.createGain(); g.gain.value = 0;
      osc.connect(g); g.connect(opts.bus||master);
      const t0 = c.currentTime + startAt;
      const peak = opts.gain!=null ? opts.gain : 0.5;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0+(opts.attack||0.02));
      g.gain.exponentialRampToValueAtTime(0.001, t0+dur);
      osc.start(t0); osc.stop(t0+dur+0.05);
    }
    function noiseBurst(startAt, dur, opts){
      opts = opts||{};
      const c = ensureCtx(); if (!c) return;
      const bufSize = Math.max(1, Math.floor(c.sampleRate*dur));
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i=0;i<bufSize;i++) data[i] = (Math.random()*2-1) * (1-i/bufSize);
      const src = c.createBufferSource(); src.buffer = buf;
      const filt = c.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value = opts.freq||1200;
      const g = c.createGain(); g.gain.value = opts.gain!=null?opts.gain:0.35;
      src.connect(filt); filt.connect(g); g.connect(master);
      src.start(c.currentTime+startAt);
    }
    // Short, cheerful ascending chime — plays when you catch a Toto.
    function playCatch(){
      if (!ensureCtx()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f,i)=> tone(f, i*0.09, 0.32, {type:'triangle', gain:0.4}));
    }
    // A quick percussive thump for a landed attack — noise + a low sine "punch".
    function playAttack(){
      if (!ensureCtx()) return;
      noiseBurst(0, 0.09, {freq:900, gain:0.28});
      tone(140, 0, 0.14, {type:'square', gain:0.3});
    }
    // A brighter double-chime for abilities (heal/buff/charge) so they read as distinct
    // from a plain attack without needing a whole separate sound per role.
    function playAbility(){
      if (!ensureCtx()) return;
      tone(880, 0, 0.18, {type:'sine', gain:0.32});
      tone(1174.66, 0.08, 0.22, {type:'sine', gain:0.3});
    }
    // Short victory fanfare — a little major-key run.
    function playVictory(){
      if (!ensureCtx()) return;
      [523.25,659.25,783.99,1046.5,1318.5].forEach((f,i)=> tone(f, i*0.1, 0.4, {type:'triangle', gain:0.42}));
    }
    function playDefeat(){
      if (!ensureCtx()) return;
      [400,340,280].forEach((f,i)=> tone(f, i*0.15, 0.35, {type:'sawtooth', gain:0.25}));
    }
    // Soft spooky ambient loop: a slow minor pad + an occasional high "twinkle" note,
    // scheduled a bar at a time so it can keep looping indefinitely without ever loading
    // an audio file. Re-schedules itself every 8s (a "bar") while music is playing.
    const PAD_CHORD = [110, 130.81, 164.81]; // A minor-ish pad (A2, C3, E3)
    const TWINKLE_NOTES = [880, 987.77, 1046.5, 1318.5, 1174.66];
    function scheduleMusicBar(){
      if (!ctx || !started) return;
      const barStart = ctx.currentTime;
      PAD_CHORD.forEach((f,i)=> tone(f, 0, 7.8, {type:'sine', gain:0.10, attack:1.2, bus:musicGain}));
      // sprinkle 2-3 twinkle notes at random offsets within this 8s bar
      const count = 2 + Math.floor(Math.random()*2);
      for (let i=0;i<count;i++){
        const note = TWINKLE_NOTES[Math.floor(Math.random()*TWINKLE_NOTES.length)];
        tone(note, Math.random()*7, 0.9, {type:'sine', gain:0.09, attack:0.05, bus:musicGain});
      }
      musicTimer = setTimeout(scheduleMusicBar, 8000);
    }
    function startMusic(){
      if (!ensureCtx() || started) return;
      started = true;
      if (ctx.state==='suspended') ctx.resume();
      scheduleMusicBar();
    }
    function stopMusic(){ started = false; if (musicTimer) clearTimeout(musicTimer); musicTimer=null; }
    function setMuted(m){
      muted = !!m;
      try { localStorage.setItem('totoquest_muted', muted?'1':'0'); } catch(e){}
      if (master) master.gain.value = muted ? 0 : 0.6;
    }
    function isMuted(){ return muted; }
    function resumeIfNeeded(){ if (ctx && ctx.state==='suspended') ctx.resume(); }
    return { playCatch, playAttack, playAbility, playVictory, playDefeat, startMusic, stopMusic, setMuted, isMuted, resumeIfNeeded, ensureCtx };
  })();
  function updateMuteIcon(){ const el = document.getElementById('btn-mute-icon'); if (el) el.textContent = Sound.isMuted() ? '🔇' : '🔊'; }
  // Audio can't start until a real user gesture on most browsers — piggyback on the very
  // first tap/click anywhere in the game to unlock the AudioContext and kick off music.
  document.addEventListener('pointerdown', function firstGesture(){
    Sound.ensureCtx(); Sound.resumeIfNeeded(); Sound.startMusic();
    document.removeEventListener('pointerdown', firstGesture);
  }, { once:true });

  // ---------------- SPECIES ROSTER ----------------
  // Every species the game currently knows about. Mythical/Eternal don't have their own
  // art yet (coming later) — see makeToto, which borrows Legendary art for those tiers
  // in the meantime so nothing errors out.
  //
  // Starters — also spawn in the wild like any other normal Toto, just guaranteed to be
  // one of each role so a new trainer always has a real choice.
  const STARTER_SPECIES = [
    { name:'Pumpkin Pup',  role:'attacker',  img:'pumpkin_pup' },
    { name:'Candle Imp',   role:'supporter', img:'candle_imp' },
    { name:'Grave Pebble', role:'tanker',    img:'grave_pebble' },
    { name:'Boo Berry',    role:'healer',    img:'boo_berry' },
  ];
  // The other 47 normal-tier species.
  const WILD_NORMAL_SPECIES = [
    {name:'Coffin Pup',role:'tanker',img:'coffin_pup'},{name:'Wispkin',role:'attacker',img:'wispkin'},
    {name:'Spiderling',role:'tanker',img:'spiderling'},{name:'Ravenette',role:'supporter',img:'ravenette'},
    {name:'Tomb Tot',role:'healer',img:'tomb_tot'},{name:'Flame Sprite',role:'attacker',img:'flame_sprite'},
    {name:'Candycorn Golem',role:'tanker',img:'candycorn_golem'},{name:'Ghoul Kitten',role:'healer',img:'ghoul_kitten'},
    {name:'Batling',role:'attacker',img:'batling'},{name:'Pumpkin Finch',role:'supporter',img:'pumpkin_finch'},
    {name:'Slime Wraith',role:'tanker',img:'slime_wraith'},{name:'Cursed Bunny',role:'attacker',img:'cursed_bunny'},
    {name:'Lantern Sprite',role:'healer',img:'lantern_sprite'},{name:'Frost Fang',role:'tanker',img:'frost_fang'},
    {name:'Hex Hound',role:'supporter',img:'hex_hound'},{name:'Witchling',role:'attacker',img:'witchling'},
    {name:'Bone Moth',role:'healer',img:'bone_moth'},{name:'Cinder Cub',role:'attacker',img:'cinder_cub'},
    {name:'Moonie',role:'supporter',img:'moonie'},{name:'Grave Golem',role:'tanker',img:'grave_golem'},
    {name:'Poison Frog',role:'healer',img:'poison_frog'},{name:'Thorn Imp',role:'attacker',img:'thorn_imp'},
    {name:'Crystal Bat',role:'supporter',img:'crystal_bat'},{name:'Mummy Pup',role:'tanker',img:'mummy_pup'},
    {name:'Soul Fox',role:'healer',img:'soul_fox'},{name:'Jackalope',role:'attacker',img:'jackalope'},
    {name:'Shadow Slime',role:'supporter',img:'shadow_slime'},{name:'Pumpkin Turtle',role:'tanker',img:'pumpkin_turtle'},
    {name:'Starling',role:'healer',img:'starling'},{name:'Toxic Spider',role:'attacker',img:'toxic_spider'},
    {name:'Fang Pup',role:'supporter',img:'fang_pup'},{name:'Specter Cat',role:'tanker',img:'specter_cat'},
    {name:'Candy Bat',role:'attacker',img:'candy_bat'},{name:'Rune Pixie',role:'healer',img:'rune_pixie'},
    {name:'Blaze Hare',role:'supporter',img:'blaze_hare'},{name:'Ice Pumpkin',role:'tanker',img:'ice_pumpkin'},
    {name:'Web Spinner',role:'attacker',img:'web_spinner'},{name:'Voodoo Doll',role:'supporter',img:'voodoo_doll'},
    {name:'Nightcap',role:'healer',img:'nightcap'},{name:'Shadow Sprite',role:'attacker',img:'shadow_sprite'},
    {name:'Frost Owl',role:'tanker',img:'frost_owl'},{name:'Cursed Crow',role:'supporter',img:'cursed_crow'},
    {name:'Pumpkin Ghost',role:'healer',img:'pumpkin_ghost'},{name:'Scarecrow Tot',role:'tanker',img:'scarecrow_tot'},
    {name:'Banshee',role:'supporter',img:'banshee'},{name:'Lava Pup',role:'healer',img:'lava_pup'},
    {name:'Moon Rabbit',role:'healer',img:'moon_rabbit'},
    // New arrivals from the latest art pass — not part of the original 47.
    {name:'Pumpkin Tot',role:'tanker',img:'pumpkin_tot'},{name:'Black Cat Tot',role:'attacker',img:'black_cat_tot'},
    {name:'Translucent Tot',role:'supporter',img:'translucent_tot'},
  ];
  const NORMAL_SPECIES = STARTER_SPECIES.concat(WILD_NORMAL_SPECIES);
  const LEGENDARY_SPECIES = [
    {name:'Pumpkin Reaper',role:'attacker',img:'pumpkin_reaper'},{name:'Frost Howl',role:'tanker',img:'frost_howl'},
    {name:'Soul Witch',role:'healer',img:'soul_witch'},{name:'Nightwing Drake',role:'supporter',img:'nightwing_drake'},
    {name:'Pumpkin Golem',role:'tanker',img:'pumpkin_golem'},{name:'Ember Fox',role:'attacker',img:'ember_fox'},
    {name:'Royal Slime',role:'healer',img:'royal_slime'},{name:'Bone Steed',role:'supporter',img:'bone_steed'},
    {name:'Grimlet',role:'attacker',img:'grimlet'},{name:'Void Guardian',role:'tanker',img:'void_guardian'},
  ];
  const SPECIES_ROLE = {}, TOTO_IMG = {};
  // Art is split across tier folders (normal/, legendary/, eternal/) so no single folder ever
  // gets near GitHub's 100-files-per-upload limit.
  NORMAL_SPECIES.forEach(sp=>{ SPECIES_ROLE[sp.name]=sp.role; TOTO_IMG[sp.name]='normal/'+sp.img; });
  LEGENDARY_SPECIES.forEach(sp=>{ SPECIES_ROLE[sp.name]=sp.role; TOTO_IMG[sp.name]='legendary/'+sp.img; });
  SPECIES_ROLE['Witch Hana']='attacker'; SPECIES_ROLE['Max']='attacker'; SPECIES_ROLE['Toni']='supporter';
  TOTO_IMG['Witch Hana']='eternal/witch_hana'; TOTO_IMG['Max']='eternal/max'; TOTO_IMG['Toni']='eternal/toni_scarecrow';
  const ROLE_INFO = {
    attacker:{ label:'Attacker', icon:'🔥', color:'#ff6a3d' },
    tanker:{ label:'Tanker', icon:'🛡️', color:'#4d9fff' },
    healer:{ label:'Healer', icon:'✚', color:'#3ddc7a' },
    supporter:{ label:'Supporter', icon:'★', color:'#c07dff' }
  };
  function roleOf(name){ return SPECIES_ROLE[name] || 'attacker'; }
  // Painted-art totos (as opposed to the hand-coded SVG bodies below) — cropped from
  // provided reference art, background removed, only the character kept.
  function totoImgMarkup(name, small){
    const file = TOTO_IMG[name];
    if (!file) return null;
    const src = 'assets/totos/'+file+'.png'; // file already includes its tier folder, e.g. normal/coffin_pup
    return '<img class="creature-img" src="'+src+'" alt="'+name+'" draggable="false">';
  }
  const TIER_CAP = {normal:1500, legendary:3500, mythical:6500, eternal:20000};
  const TIER_ORDER = ['normal','legendary','mythical','eternal'];
  const TOTO_MAX_LEVEL = 50;
  const PLAYER_MAX_LEVEL = 100;

  // ---------------- COSMETICS / WARDROBE (earned wearables) ----------------
  // One catalog entry per equippable item, grouped by the same slot names the 3D player
  // model's equip system already uses (window.PLAYER_EQUIP_CATALOG, defined in the module
  // script at the bottom of the page). 'default' items are free and always owned; anything
  // else needs its unlock condition met (see checkCosmeticUnlocks). A `preset` here is just
  // the handful of fields the 3D model's own slot config understands (color/trim/kind) —
  // equipping an item means merging its preset into that slot and asking the model to
  // rebuild, not writing new render code per item.
  const COSMETIC_CATALOG = {
    hat: [
      { id:'hat_default', name:'Classic Witch Hat', rarity:'Starter', unlock:'default',
        description:'Your trusty wide-brimmed hat — comes with every trainer.' },
      { id:'hat_prestige', name:'Level 100 Witch Hat', rarity:'Level 100 Achievement', unlock:'level100',
        description:'Purple velvet embroidered in gold — LEVEL 100 across the front, jack-o\'-lanterns, autumn leaves and a band of golden bats. Only for trainers who reach Level 100.',
        thumb:'assets/wardrobe/l100hat-thumb.png',
        preset:{ kind:'level100Hat', color:'#4a1c5c', trim:'#d9a93a' } },
    ],
    top: [
      { id:'top_default', name:'Classic Robe', rarity:'Starter', unlock:'default',
        description:'The moon-and-pumpkin robe you started your journey in.' },
      { id:'top_level100_tee', name:'Level 100 Achievement Tee', rarity:'Level 100 Achievement', unlock:'level100',
        description:'The TotoQuest "Master Achiever" medallion on the front and LEVEL 100 across the back. Only for trainers who reach Level 100.',
        thumb:'assets/wardrobe/tee-thumb.png',
        preset:{ kind:'tee', color:'#3a2850', trim:'#d4af37' } },
    ],
    legwear: [
      { id:'legwear_default', name:'Candy-Corn Leggings', rarity:'Starter', unlock:'default',
        description:'Striped leggings, sweet as the holiday itself.' },
    ],
    shoes: [
      { id:'shoes_default', name:'Classic Boots', rarity:'Starter', unlock:'default',
        description:'Comfortable boots for long nights of trick-or-treating.' },
    ],
    accessory: [
      { id:'accessory_default', name:'Jack-o-Staff & Basket', rarity:'Starter', unlock:'default',
        description:'Your enchanted staff and candy basket.' },
    ],
  };
  const COSMETIC_SLOT_LABEL = { hat:'Hat', top:'Top', legwear:'Legwear', shoes:'Shoes', accessory:'Accessory' };
  function ownsCosmetic(item){ return item.unlock==='default' || (state.unlockedCosmetics||[]).includes(item.id); }
  // Called from refreshHUD() every time charLevel is recomputed — cheap, idempotent (the
  // includes() check means it only ever grants an item once no matter how often this runs).
  function checkCosmeticUnlocks(){
    state.unlockedCosmetics = state.unlockedCosmetics || [];
    if (state.charLevel >= PLAYER_MAX_LEVEL){
      const fresh = ['top_level100_tee','hat_prestige'].filter(id=> !state.unlockedCosmetics.includes(id));
      if (fresh.length){
        fresh.forEach(id=> state.unlockedCosmetics.push(id));
        showToast('🏆 Level 100! Unlocked the Level 100 Achievement Tee and the Level 100 Witch Hat — wear them from Customize Character.');
        markDirty();
      }
    }
  }
  // The 3D module calls this (via window.applyEquippedCosmetics) right before every
  // mount/rebuild, so whatever's saved in state.equippedCosmetics always wins over the
  // model's own hardcoded per-gender defaults — exposed on window because the module script
  // that owns PLAYER_EQUIP_CATALOG can't see this classic script's top-level bindings
  // (it's wrapped in its own IIFE), only what's explicitly attached to window.
  let cosmeticDefaults = null;
  window.applyEquippedCosmetics = function applyEquippedCosmetics(overrides){
    if (!window.PLAYER_EQUIP_CATALOG || !state) return;
    // First call: remember the model's own built-in look for every slot, so every later
    // call starts from that clean default. (Merging onto whatever was there before meant
    // that once a preset was applied it could never be taken off again.)
    if (!cosmeticDefaults) cosmeticDefaults = JSON.parse(JSON.stringify(window.PLAYER_EQUIP_CATALOG));
    const g = state.avatar==='male' ? 'male' : 'female';
    const target = window.PLAYER_EQUIP_CATALOG[g], base = cosmeticDefaults[g];
    if (!target || !base) return;
    state.equippedCosmetics = state.equippedCosmetics || {};
    Object.keys(COSMETIC_CATALOG).forEach(slot=>{
      const tryId = overrides && overrides[slot];                 // "trying on" in the wardrobe
      const equippedId = tryId || state.equippedCosmetics[slot];
      const item = equippedId && COSMETIC_CATALOG[slot].find(i=>i.id===equippedId);
      const preset = (item && item.preset && (ownsCosmetic(item) || tryId === item.id)) ? item.preset : null;
      target[slot] = base[slot] ? Object.assign({}, base[slot], preset || {}) : (preset ? Object.assign({}, preset) : base[slot]);
    });
  };
  // Whatever level a Toto had in the wild (or as a boss), the one you catch starts at
  // Lv 1 — you raise it yourself through battles (XP) or candy (Power Up).
  function freshCaughtToto(opp){
    const t = {};
    Object.keys(opp).forEach(k=>{ if (k.charAt(0) !== '_') t[k] = opp[k]; });   // drop map-only bits
    delete t.abilities; delete t.moves;
    t.id = uid(); t.isToni = !!opp.isToni; t.xp = 0;
    applyLevelStats(t, 1);
    return t;
  }
  function finalizeCatch(opp){
    // The wild/gym Toto you fought already has correct, level-derived stats (see
    // makeToto/applyLevelStats) — catching it just gives your copy a new id, it doesn't
    // reset or re-roll anything. Whatever level you found it at is your starting point;
    // leveling it further from there is on you, same as any other Toto.
    const caught = freshCaughtToto(opp);
    state.collection.push(caught);
    return caught;
  }
  const WORLD_CENTER = 13000;
  const GPS_SCALE = 3.2;
  const CHUNK_SIZE_M = 350;   // each real-map data fetch covers one chunk
  const GYM_RADIUS_M = 3;     // ~10 feet
  const WILD_RADIUS_M = 40;   // wild Totos can be caught from up to 40 m away
  const DEFAULT_LAT = 42.9587, DEFAULT_LON = -83.8394; // Swartz Creek, MI — used only if real GPS can't be reached
  const ZOOM_MIN = 0.6, ZOOM_MAX = 1.9, TILT_MAX = 58;

  // ---------------- CREATURE ART (original designs — standing bodies, not flat emoji) ----------------
  function standingCreature(c){
    return '<svg class="creature-svg" viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="50" cy="105" rx="27" ry="5" fill="rgba(0,0,0,0.22)"/>'
      // Small bat wings behind every standing creature — regardless of its element, this is
      // what reads instantly as "Halloween monster" rather than "colored elemental blob".
      // Bold, jagged, high-contrast silhouette on purpose: at the ~34px size these render
      // on the map, soft/detailed shapes disappear, but a simple dark zigzag flare reads
      // clearly as "wings" even that small.
      + '<path d="M30,64 L3,28 L19,52 L1,60 L14,66 L2,74 L22,70 Z" fill="#1a1420" opacity="0.92"/>'
      + '<path d="M70,64 L97,28 L81,52 L99,60 L86,66 L98,74 L78,70 Z" fill="#1a1420" opacity="0.92"/>'
      + '<ellipse cx="35" cy="97" rx="9" ry="6" fill="'+c.leg+'" class="cr-leg cr-legL"/>'
      + '<ellipse cx="65" cy="97" rx="9" ry="6" fill="'+c.leg+'" class="cr-leg cr-legR"/>'
      + '<ellipse cx="50" cy="74" rx="25" ry="23" fill="'+c.body+'" stroke="'+c.stroke+'" stroke-width="2.5"/>'
      + '<ellipse cx="50" cy="87" rx="21" ry="9" fill="#000" opacity="0.1"/>'
      + '<ellipse cx="21" cy="70" rx="7" ry="10" fill="'+c.body+'" stroke="'+c.stroke+'" stroke-width="2" class="cr-arm cr-armL"/>'
      + '<ellipse cx="79" cy="70" rx="7" ry="10" fill="'+c.body+'" stroke="'+c.stroke+'" stroke-width="2" class="cr-arm cr-armR"/>'
      + '<circle cx="50" cy="35" r="26" fill="'+c.head+'" stroke="'+c.stroke+'" stroke-width="2.5"/>'
      + '<ellipse cx="50" cy="47" rx="19" ry="7" fill="#000" opacity="0.08"/>'
      + c.accent
      + '<circle class="cr-eye" cx="41" cy="33" r="5" fill="'+c.eye+'"/>'
      + '<circle class="cr-eye" cx="59" cy="33" r="5" fill="'+c.eye+'"/>'
      + '<path d="M43,45 Q50,50 57,45" stroke="'+c.stroke+'" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
      + '<ellipse cx="38" cy="21" rx="11" ry="7" fill="#fff" opacity="0.35" transform="rotate(-20 38 21)"/>'
      + '</svg>';
  }
  // Four-legged animal stance — distinct silhouette from the standing template, with a tail.
  function quadrupedCreature(c){
    return '<svg class="creature-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="52" cy="93" rx="32" ry="5" fill="rgba(0,0,0,0.22)"/>'
      // Same idea on the four-legged template: bold, jagged, dark wing silhouette that
      // survives shrinking down to marker size.
      + '<path d="M42,52 L18,18 L34,42 L14,32 L18,50 L4,44 L16,58 Z" fill="#1a1420" opacity="0.92"/>'
      + '<path d="M62,52 L86,18 L70,42 L90,32 L86,50 L100,44 L88,58 Z" fill="#1a1420" opacity="0.92"/>'
      + '<ellipse cx="26" cy="81" rx="6" ry="10" fill="'+c.leg+'" class="cr-leg cr-legL"/>'
      + '<ellipse cx="43" cy="84" rx="6" ry="9" fill="'+c.leg+'"/>'
      + '<ellipse cx="60" cy="84" rx="6" ry="9" fill="'+c.leg+'"/>'
      + '<ellipse cx="77" cy="81" rx="6" ry="10" fill="'+c.leg+'" class="cr-leg cr-legR"/>'
      + '<path d="M18,56 Q8,46 19,40 Q24,54 34,58 Z" fill="'+c.body+'" stroke="'+c.stroke+'" stroke-width="2"/>'
      + '<ellipse cx="56" cy="62" rx="35" ry="21" fill="'+c.body+'" stroke="'+c.stroke+'" stroke-width="2.5"/>'
      + '<ellipse cx="56" cy="73" rx="27" ry="8" fill="#000" opacity="0.1"/>'
      + '<circle cx="81" cy="47" r="19" fill="'+c.head+'" stroke="'+c.stroke+'" stroke-width="2.5"/>'
      + c.accent
      + '<circle class="cr-eye" cx="87" cy="44" r="4" fill="'+c.eye+'"/>'
      + '<path d="M75,55 Q81,58 88,54" stroke="'+c.stroke+'" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
      + '<ellipse cx="70" cy="38" rx="8" ry="5" fill="#fff" opacity="0.3" transform="rotate(-20 70 38)"/>'
      + '</svg>';
  }
  // Floating/hovering — no legs, wispy trailing base, distinct from both other templates.
  function floatingCreature(c){
    return '<svg class="creature-svg" viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="50" cy="100" rx="18" ry="4" fill="rgba(0,0,0,0.15)"/>'
      + '<path d="M30,52 Q25,82 34,99 Q42,87 50,99 Q58,87 66,99 Q75,82 70,52 Z" fill="'+c.body+'" stroke="'+c.stroke+'" stroke-width="2.5" class="cr-ghost"/>'
      + '<ellipse cx="50" cy="78" rx="16" ry="8" fill="#000" opacity="0.08"/>'
      + '<circle cx="50" cy="38" r="26" fill="'+c.head+'" stroke="'+c.stroke+'" stroke-width="2.5"/>'
      + '<ellipse cx="50" cy="50" rx="19" ry="7" fill="#000" opacity="0.08"/>'
      + c.accent
      + '<circle class="cr-eye" cx="41" cy="36" r="5" fill="'+c.eye+'"/>'
      + '<circle class="cr-eye" cx="59" cy="36" r="5" fill="'+c.eye+'"/>'
      + '<ellipse cx="38" cy="24" rx="11" ry="7" fill="#fff" opacity="0.35" transform="rotate(-20 38 24)"/>'
      + '</svg>';
  }
  // Every one of the 4 elemental species we kept (rest replaced with painted art above)
  // gets its own body shape + look — not just a recolored copy of its nature-mate.
  const SPECIES_SVG = {
    'Vine Wraith': standingCreature({ body:'#6fbf5a', head:'#8fd67a', leg:'#4a8f3a', stroke:'#2e5c24', eye:'#fff7d6',
      accent:'<path d="M50,3 Q39,15 50,25 Q61,15 50,3 Z" fill="#3fae4a" stroke="#2e5c24" stroke-width="1.5"/>' }),
    'Bramble Ghoul': quadrupedCreature({ body:'#5c8f4a', head:'#7fbf5c', leg:'#3a5c2e', stroke:'#243d1c', eye:'#fff7d6',
      accent:'<path d="M75,30 L80,20 M85,32 L92,24 M78,38 L84,30" stroke="#2e5c24" stroke-width="2" stroke-linecap="round"/>' }),
    'Hollow Treant': standingCreature({ body:'#8a6a4a', head:'#a8835c', leg:'#5c452f', stroke:'#3a2a1c', eye:'#fff2c2',
      accent:'<line x1="50" y1="2" x2="50" y2="15" stroke="#3a2a1c" stroke-width="3"/><circle cx="45" cy="7" r="4" fill="#4fae4a"/><circle cx="55" cy="7" r="4" fill="#4fae4a"/>' }),
    'Rootbound Ghast': quadrupedCreature({ body:'#6a4f33', head:'#8a6a4a', leg:'#4a3620', stroke:'#2c1f12', eye:'#c2ffcf',
      accent:'<path d="M74,28 Q78,20 82,28 M84,30 Q90,24 94,30" stroke="#4fae4a" stroke-width="2" fill="none" stroke-linecap="round"/>' })
  };
  const SPOOKY_SVG = {
    'Pumpkin Fiend': '<svg class="creature-svg" viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="50" cy="105" rx="27" ry="5" fill="rgba(0,0,0,0.22)"/>'
      + '<ellipse cx="35" cy="97" rx="9" ry="6" fill="#3a5c2e" class="cr-leg cr-legL"/>'
      + '<ellipse cx="65" cy="97" rx="9" ry="6" fill="#3a5c2e" class="cr-leg cr-legR"/>'
      + '<ellipse cx="50" cy="74" rx="25" ry="23" fill="#5c8a4a" stroke="#2e5c24" stroke-width="2.5"/>'
      + '<ellipse cx="50" cy="87" rx="21" ry="9" fill="#000" opacity="0.1"/>'
      + '<ellipse cx="21" cy="70" rx="7" ry="10" fill="#5c8a4a" stroke="#2e5c24" stroke-width="2" class="cr-arm cr-armL"/>'
      + '<ellipse cx="79" cy="70" rx="7" ry="10" fill="#5c8a4a" stroke="#2e5c24" stroke-width="2" class="cr-arm cr-armR"/>'
      + '<line x1="50" y1="9" x2="50" y2="2" stroke="#3a5c2e" stroke-width="3"/>'
      + '<circle cx="50" cy="35" r="26" fill="#ff8a3d" stroke="#8a3a10" stroke-width="2.5"/>'
      + '<ellipse cx="50" cy="47" rx="19" ry="7" fill="#000" opacity="0.08"/>'
      + '<path d="M32,32 Q50,25 68,32" stroke="#b85a1e" stroke-width="1.5" fill="none" opacity="0.5"/>'
      + '<path d="M32,38 Q50,44 68,38" stroke="#b85a1e" stroke-width="1.5" fill="none" opacity="0.5"/>'
      + '<path class="cr-eye" d="M36,29 L45,27 L40,39 Z" fill="#fff2b0"/>'
      + '<path class="cr-eye" d="M64,29 L55,27 L60,39 Z" fill="#fff2b0"/>'
      + '<path d="M38,45 L44,49 L48,44 L52,49 L56,44 L62,45" stroke="#fff2b0" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<ellipse cx="38" cy="21" rx="11" ry="7" fill="#fff" opacity="0.3" transform="rotate(-20 38 21)"/>'
      + '</svg>',
    'Grave Wisp': '<svg class="creature-svg" viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="50" cy="103" rx="24" ry="5" fill="rgba(0,0,0,0.18)"/>'
      + '<path d="M22,60 Q20,20 50,18 Q80,20 78,60 L78,95 L68,86 L58,97 L50,87 L42,97 L32,86 L22,95 Z" fill="#f4f4fb" stroke="#c9c9de" stroke-width="2.5" class="cr-ghost"/>'
      + '<ellipse cx="50" cy="70" rx="18" ry="16" fill="#000" opacity="0.05"/>'
      + '<circle class="cr-eye" cx="40" cy="50" r="5" fill="#2a2a3a"/><circle class="cr-eye" cx="60" cy="50" r="5" fill="#2a2a3a"/>'
      + '<ellipse cx="50" cy="64" rx="5" ry="7" fill="#2a2a3a"/>'
      + '<ellipse cx="38" cy="32" rx="10" ry="6" fill="#fff" opacity="0.5" transform="rotate(-15 38 32)"/>'
      + '</svg>',
    'Bone Rattler': standingCreature({ body:'#f2f2e8', head:'#f7f7ee', leg:'#d8d8c8', stroke:'#8a8a78', eye:'#ff5040',
      accent:'<path d="M38,20 L38,30 M46,18 L46,32 M54,18 L54,32 M62,20 L62,30" stroke="#8a8a78" stroke-width="2" stroke-linecap="round"/>' }),
    'Web Stalker': '<svg class="creature-svg" viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="50" cy="99" rx="30" ry="5" fill="rgba(0,0,0,0.2)"/>'
      + '<g class="cr-legL" stroke="#2a2030" stroke-width="3" fill="none" stroke-linecap="round">'
      + '<path d="M38,60 L14,50 M38,66 L10,66 M38,72 L14,82 M38,78 L20,94"/></g>'
      + '<g class="cr-legR" stroke="#2a2030" stroke-width="3" fill="none" stroke-linecap="round">'
      + '<path d="M62,60 L86,50 M62,66 L90,66 M62,72 L86,82 M62,78 L80,94"/></g>'
      + '<circle cx="50" cy="66" r="26" fill="#4a2f6b" stroke="#2a1a44" stroke-width="2.5"/>'
      + '<ellipse cx="50" cy="78" rx="20" ry="8" fill="#000" opacity="0.12"/>'
      + '<circle class="cr-eye" cx="42" cy="60" r="4.5" fill="#ff4040"/><circle class="cr-eye" cx="58" cy="60" r="4.5" fill="#ff4040"/>'
      + '<circle class="cr-eye" cx="46" cy="70" r="3" fill="#ff4040"/><circle class="cr-eye" cx="54" cy="70" r="3" fill="#ff4040"/>'
      + '<ellipse cx="40" cy="55" rx="9" ry="6" fill="#fff" opacity="0.25" transform="rotate(-20 40 55)"/>'
      + '</svg>',
    'Night Bat': '<svg class="creature-svg" viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="50" cy="90" rx="20" ry="5" fill="rgba(0,0,0,0.18)"/>'
      + '<g class="toni-wing toni-wing-l"><path d="M45,55 C25,40 8,44 4,58 C14,56 26,60 38,68 Z" fill="#3c2a52" stroke="#241a35" stroke-width="2"/></g>'
      + '<g class="toni-wing toni-wing-r"><path d="M55,55 C75,40 92,44 96,58 C86,56 74,60 62,68 Z" fill="#3c2a52" stroke="#241a35" stroke-width="2"/></g>'
      + '<circle cx="50" cy="58" r="24" fill="#5c4373" stroke="#241a35" stroke-width="2.5"/>'
      + '<ellipse cx="50" cy="68" rx="18" ry="7" fill="#000" opacity="0.1"/>'
      + '<path d="M38,38 L34,26 L44,36 Z" fill="#5c4373" stroke="#241a35" stroke-width="2"/><path d="M62,38 L66,26 L56,36 Z" fill="#5c4373" stroke="#241a35" stroke-width="2"/>'
      + '<circle class="cr-eye" cx="42" cy="56" r="5" fill="#ff4040"/><circle class="cr-eye" cx="58" cy="56" r="5" fill="#ff4040"/>'
      + '<ellipse cx="40" cy="48" rx="9" ry="6" fill="#fff" opacity="0.3" transform="rotate(-20 40 48)"/>'
      + '</svg>'
  };
  // Single lookup used everywhere a Toto's art is needed: painted art first (the new
  // roster), then hand-coded SVG bodies for whatever's left.
  function spriteFor(name, nature){
    const img = totoImgMarkup(name, false);
    if (img) return img;
    return nature==='spooky' ? SPOOKY_SVG[name] : SPECIES_SVG[name];
  }
  function rand(seed){ const x = Math.sin(seed) * 10000; return x - Math.floor(x); }
  function uid(){ return 'id'+Date.now()+Math.floor(Math.random()*100000); }
  // Explicit level-50 (max) stats per role per tier — each tier is exactly double the one
  // below it (normal -> legendary -> mythical -> eternal), so "eternal is always way
  // better" is true by construction, not by coincidence. Healers get a "heal" stat
  // (their heals are a % of it, see HEAL_* below); Supporters get a "buff" stat (how
  // strong their team buff is). Tanker/Attacker just use hp/atk/def/spd directly.
  const ROLE_MAX_STATS = {
    attacker:  { eternal:{hp:12000,atk:20000,def:8000, spd:15000} },
    healer:    { eternal:{hp:40000,atk:5000, def:10000,spd:5000, heal:20000} },
    tanker:    { eternal:{hp:20000,atk:5000, def:20000,spd:5000} },
    supporter: { eternal:{hp:15000,atk:8000, def:9000, spd:10000,buff:15000} },
  };
  (function buildTierTable(){
    // mythical = eternal/2, legendary = eternal/4, normal = eternal/8
    Object.keys(ROLE_MAX_STATS).forEach(role=>{
      const eternal = ROLE_MAX_STATS[role].eternal;
      ROLE_MAX_STATS[role].mythical  = {}; ROLE_MAX_STATS[role].legendary = {}; ROLE_MAX_STATS[role].normal = {};
      Object.keys(eternal).forEach(stat=>{
        ROLE_MAX_STATS[role].mythical[stat]  = Math.round(eternal[stat]/2);
        ROLE_MAX_STATS[role].legendary[stat] = Math.round(eternal[stat]/4);
        ROLE_MAX_STATS[role].normal[stat]    = Math.round(eternal[stat]/8);
      });
    });
  })();
  // Level is the one source of truth for a Toto's stats. Level 1 starts at 10% of its
  // tier+role's max (still recognizably weak, not a zero), and climbs in a straight line
  // to exactly 100% at TOTO_MAX_LEVEL (50) — so every Toto, regardless of tier, is fully
  // maxed out at the same level, just at very different heights.
  function statsForLevel(tier, role, level, mult){
    const max = (ROLE_MAX_STATS[role] || ROLE_MAX_STATS.attacker)[tier] || ROLE_MAX_STATS.attacker.normal;
    const lvl = Math.max(1, Math.min(TOTO_MAX_LEVEL, level));
    const t = 0.1 + 0.9*(lvl-1)/(TOTO_MAX_LEVEL-1); // 10% at level 1 -> 100% at level 50
    const out = {};
    Object.keys(max).forEach(stat=> out[stat] = Math.max(1, Math.round(max[stat]*t*(mult||1))));
    return out;
  }
  // Power level is just the sum of a Toto's actual combat stats (hp+atk+def+spd) — no
  // separate hidden number. The role-specific stat (heal/buff) isn't counted here since
  // it's a utility number, not a combat one, and would make healers/supporters look
  // artificially stronger than an attacker/tanker of the same real fighting weight.
  function powerLevelOf(s){ return (s.hp||0) + (s.atk||0) + (s.def||0) + (s.spd||0); }
  function applyLevelStats(t, level){
    const ratio = (t.maxHp > 0 && t.hp != null && isFinite(t.hp)) ? Math.max(0, Math.min(1, t.hp / t.maxHp)) : 1;
    t.level = level;
    const s = statsForLevel(t.tier, t.role, level, t.statMult);
    t.maxHp=s.hp; t.hp=Math.round(s.hp*ratio); t.atk=s.atk; t.def=s.def; t.spd=s.spd;
    t.heal = s.heal || 0; t.buff = s.buff || 0;
    t.strength = t.atk; t.maxEnergy = 100; t.energy = 100; // legacy fields some UI/battle code still reads
    t.cp = powerLevelOf(s);
    return t;
  }
  // Wild/gym Totos start at a random level for their tier instead of a flat 1 — normal
  // ones skew low (an easy first catch), higher tiers start further along — but NEVER
  // maxed: whatever you catch, from a raid or otherwise, still needs candy and manual
  // leveling afterward to actually reach TOTO_MAX_LEVEL.
  const TIER_START_LEVEL_RANGE = { normal:[1,15], legendary:[5,25], mythical:[10,35], eternal:[15,40] };
  function randomStartLevel(tier){
    const [lo,hi] = TIER_START_LEVEL_RANGE[tier] || TIER_START_LEVEL_RANGE.normal;
    return lo + Math.floor(Math.random()*(hi-lo+1));
  }
  // Used to fill out a group battle's computer allies: when there's nobody real to fight
  // alongside, each bot gets a Mythical-tier Toto (borrowing Legendary art — Mythical
  // doesn't have its own yet) in a specific role, so the whole squad ends up covering
  // Attacker/Tanker/Healer/Supporter rather than four random duplicates of your own role.
  function makeMythicalOfRole(role){
    const options = LEGENDARY_SPECIES.filter(sp=>sp.role===role);
    const pool = options.length ? options : LEGENDARY_SPECIES;
    const sp = pool[Math.floor(Math.random()*pool.length)];
    const sprite = spriteFor(sp.name, sp.role);
    const t = { id:uid(), name:sp.name, sprite, tier:'mythical', nature:sp.role, role:sp.role, level:1, cp:0, maxHp:0, hp:0, atk:0, strength:0, def:0, spd:0, maxEnergy:0, energy:0 };
    applyLevelStats(t, randomStartLevel('mythical'));
    return t;
  }
  function makeToto(tier){
    let name, sprite, emoji, nature;
    if (tier === 'legendary'){
      const sp = LEGENDARY_SPECIES[Math.floor(Math.random()*LEGENDARY_SPECIES.length)];
      name = sp.name; nature = sp.role; sprite = spriteFor(name, nature);
    } else if (tier === 'mythical' || tier === 'eternal'){
      // Mythical/Eternal don't have their own dedicated art/roster yet (coming later) —
      // borrow a Legendary's look for now so these tiers still work end-to-end (admin
      // testing, gym bosses) rather than erroring out or being unreachable.
      const sp = LEGENDARY_SPECIES[Math.floor(Math.random()*LEGENDARY_SPECIES.length)];
      name = sp.name; nature = sp.role; sprite = spriteFor(name, nature);
    } else {
      const sp = NORMAL_SPECIES[Math.floor(Math.random()*NORMAL_SPECIES.length)];
      name = sp.name; nature = sp.role; sprite = spriteFor(name, nature);
    }
    const role = roleOf(name);
    const t = { id:uid(), name, sprite, tier, nature, role, level:1, cp:0, maxHp:0, hp:0, atk:0, strength:0, def:0, spd:0, maxEnergy:0, energy:0 };
    applyLevelStats(t, randomStartLevel(tier));
    return t;
  }
  // Toni — a custom Eternal, always guarding the first Challenger shrine so she's easy to find.
  // Original artwork (not the reference photo) — a small animated inline SVG so she reads
  // clearly at any size, with fluttering wings, glowing eyes, and a pulsing staff orb.
  const CANDY_ICON = '<svg class="candy-icon" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">' + '<path d="M20,2 L34,19 L34,37 Q34,46 20,46 Q6,46 6,37 L6,19 Z" fill="#ff8a3d" stroke="#b85a1e" stroke-width="1.5"/>' + '<path d="M7,19 L33,19 L33,29 L7,29 Z" fill="#ffe066"/>' + '<path d="M7,29 L33,29 L33,37 Q33,45 20,45 Q7,45 7,37 Z" fill="#fff8ea"/>' + '<path d="M14,12 L18,10 L16,17 Z" fill="#8a3a10"/>' + '<path d="M26,12 L22,10 L24,17 Z" fill="#8a3a10"/>' + '<path d="M15,21 L20,25 L25,21 L22,26 L18,26 Z" fill="#8a3a10"/>' + '<path d="M20,2 Q17,6 20,9 Q23,6 20,2 Z" fill="#4a8f3a"/>' + '</svg>';
  // The gym marker: a twisted, vine-wrapped trunk studded with lit jack-o'-lanterns, with
  // the gym's guardian creature perched on top — the reference art's centerpiece prop.
  const PUMPKIN_TOWER_SVG = '<svg class="tower-svg" viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M42,128 Q38,90 46,70 Q36,60 40,42 Q30,34 38,16 Q44,6 50,4 Q56,6 62,16 Q70,34 60,42 Q64,60 54,70 Q62,90 58,128 Z" fill="#4a3420" stroke="#2c2013" stroke-width="2.5"/>'
    + '<path d="M42,128 Q38,90 46,70 Q40,62 41,50" fill="none" stroke="#2c2013" stroke-width="2" opacity="0.6"/>'
    + '<g>' // lower big jack-o-lantern
      + '<circle cx="50" cy="100" r="17" fill="#ff8f2e" stroke="#a8500f" stroke-width="2.5"/>'
      + '<path d="M42,96 L47,92 L45,100 Z" fill="#5c2e0a"/><path d="M58,96 L53,92 L55,100 Z" fill="#5c2e0a"/>'
      + '<path d="M43,104 Q50,112 57,104 Q54,109 50,108 Q46,109 43,104 Z" fill="#5c2e0a"/>'
    + '</g>'
    + '<g>' // mid-left lantern
      + '<circle cx="28" cy="78" r="10" fill="#ffb347" stroke="#a8500f" stroke-width="2"/>'
      + '<circle cx="25" cy="76" r="1.6" fill="#5c2e0a"/><circle cx="31" cy="76" r="1.6" fill="#5c2e0a"/>'
      + '<path d="M24,81 Q28,85 32,81" fill="none" stroke="#5c2e0a" stroke-width="1.4"/>'
    + '</g>'
    + '<g>' // mid-right lantern
      + '<circle cx="73" cy="78" r="10" fill="#ffb347" stroke="#a8500f" stroke-width="2"/>'
      + '<circle cx="70" cy="76" r="1.6" fill="#5c2e0a"/><circle cx="76" cy="76" r="1.6" fill="#5c2e0a"/>'
      + '<path d="M69,81 Q73,85 77,81" fill="none" stroke="#5c2e0a" stroke-width="1.4"/>'
    + '</g>'
    + '<g>' // upper lantern
      + '<circle cx="50" cy="40" r="9" fill="#ffb347" stroke="#a8500f" stroke-width="2"/>'
      + '<circle cx="47" cy="38" r="1.4" fill="#5c2e0a"/><circle cx="53" cy="38" r="1.4" fill="#5c2e0a"/>'
      + '<path d="M46,43 Q50,46 54,43" fill="none" stroke="#5c2e0a" stroke-width="1.2"/>'
    + '</g>'
    + '</svg>';
  const GEM_ICON = '<svg class="gem-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M8,14 L20,4 L32,14 L20,36 Z" fill="#7a4fd6" stroke="#4a2a90" stroke-width="1.5"/>'
    + '<path d="M8,14 L20,20 L32,14 L20,4 Z" fill="#b98bff"/>'
    + '<path d="M8,14 L20,20 L20,36 Z" fill="#5a30b0"/>'
    + '<path d="M32,14 L20,20 L20,36 Z" fill="#6c3dc4"/>'
    + '<path d="M8,14 L14,14 L20,4 Z" fill="#d9c2ff" opacity="0.7"/>'
    + '</svg>';
  const COIN_ICON = '<svg class="coin-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">'
    + '<circle cx="20" cy="20" r="17" fill="#ffd25c" stroke="#b8860b" stroke-width="2"/>'
    + '<circle cx="20" cy="20" r="12.5" fill="none" stroke="#b8860b" stroke-width="1.5"/>'
    + '<text x="20" y="26" font-size="16" text-anchor="middle" fill="#b8860b" font-family="Arial, sans-serif" font-weight="bold">T</text>'
    + '</svg>';
  function gemIconHtml(size){ return '<span class="gem-icon-wrap" style="display:inline-block; width:'+(size||16)+'px; height:'+(size||16)+'px; vertical-align:middle;">'+GEM_ICON+'</span>'; }
  function coinIconHtml(size){ return '<span class="coin-icon-wrap" style="display:inline-block; width:'+(size||16)+'px; height:'+(size||16)+'px; vertical-align:middle;">'+COIN_ICON+'</span>'; }
  function pumpkinTowerHtml(bossSprite){ return '<div class="pumpkin-tower">'+PUMPKIN_TOWER_SVG+'<div class="tower-boss">'+bossSprite+'</div></div>'; }
  const PUMPKIN_DUST_ICON = 'data:image/png;base64,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';
  function candyIconHtml(size){ return '<span style="display:inline-block; width:'+(size||16)+'px; height:'+(size||16)+'px; vertical-align:middle;">'+CANDY_ICON+'</span>'; }
  function dustIconHtml(size){ return '<img src="'+PUMPKIN_DUST_ICON+'" style="width:'+(size||16)+'px; height:'+(size||16)+'px; vertical-align:middle; object-fit:contain;" alt="pumpkin dust"/>'; }
  // Full-body trainer characters — used in the HUD, on the map, the profile, character
  // select, and the leaderboard, all sized via em so one set of art works everywhere.
  const FEMALE_AVATAR_SVG = '<svg class="player-avatar-svg" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">'
    + '<rect x="38" y="108" width="10" height="24" rx="3" fill="#3a2a52"/><rect x="52" y="108" width="10" height="24" rx="3" fill="#3a2a52"/>'
    + '<ellipse cx="43" cy="133" rx="8" ry="5" fill="#241a3a"/><ellipse cx="57" cy="133" rx="8" ry="5" fill="#241a3a"/>'
    + '<path d="M50,58 L29,114 Q50,122 71,114 Z" fill="#6b3fa0" stroke="#442868" stroke-width="2.5"/>'
    + '<path d="M50,58 L39,114 Q50,119 61,114 Z" fill="#7b4fb0" opacity="0.45"/>'
    + '<rect x="39" y="87" width="22" height="5" rx="1.5" fill="#ffb85c"/>'
    + '<ellipse cx="26" cy="81" rx="7" ry="16" fill="#6b3fa0" stroke="#442868" stroke-width="1.5" transform="rotate(-18 26 81)"/>'
    + '<ellipse cx="74" cy="81" rx="7" ry="16" fill="#6b3fa0" stroke="#442868" stroke-width="1.5" transform="rotate(18 74 81)"/>'
    + '<circle cx="18" cy="95" r="5.5" fill="#ffcf9e" stroke="#d9a668" stroke-width="1"/>'
    + '<circle cx="82" cy="95" r="5.5" fill="#ffcf9e" stroke="#d9a668" stroke-width="1"/>'
    + '<line x1="82" y1="95" x2="92" y2="58" stroke="#6b4a2f" stroke-width="3" stroke-linecap="round"/>'
    + '<circle class="toni-orb" cx="92" cy="55" r="5.5" fill="#ff8a3d"/>'
    + '<circle cx="50" cy="40" r="18" fill="#ffcf9e" stroke="#d9a668" stroke-width="1.5"/>'
    + '<path d="M31,38 Q29,60 38,67 L35,43 Z" fill="#3a2a1c"/><path d="M69,38 Q71,60 62,67 L65,43 Z" fill="#3a2a1c"/>'
    + '<path d="M50,1 L27,39 Q50,31 73,39 Z" fill="#4a2f6b" stroke="#2c1a44" stroke-width="2.5"/>'
    + '<ellipse cx="50" cy="39" rx="27" ry="6" fill="#4a2f6b" stroke="#2c1a44" stroke-width="2.5"/>'
    + '<circle cx="50" cy="3" r="4.2" fill="#ff8a3d" stroke="#b85a1e" stroke-width="1"/>'
    + '<circle cx="44" cy="41" r="2.2" fill="#2a2a2a"/><circle cx="56" cy="41" r="2.2" fill="#2a2a2a"/>'
    + '<path d="M45,47 Q50,50 55,47" stroke="#a05840" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="42" cy="34" rx="7" ry="4.5" fill="#fff" opacity="0.3" transform="rotate(-18 42 34)"/>'
    + '</svg>';
  const MALE_AVATAR_SVG = '<svg class="player-avatar-svg" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">'
    + '<rect x="37" y="106" width="11" height="26" rx="3" fill="#2a4a3a"/><rect x="52" y="106" width="11" height="26" rx="3" fill="#2a4a3a"/>'
    + '<ellipse cx="42" cy="133" rx="9" ry="5" fill="#1c3226"/><ellipse cx="58" cy="133" rx="9" ry="5" fill="#1c3226"/>'
    + '<path d="M50,56 L26,112 Q50,121 74,112 Z" fill="#3f7d4a" stroke="#254a2c" stroke-width="2.5"/>'
    + '<path d="M50,56 L37,112 Q50,117 63,112 Z" fill="#529a5c" opacity="0.4"/>'
    + '<rect x="37" y="86" width="26" height="5.5" rx="1.5" fill="#8a6a4a"/>'
    + '<ellipse cx="23" cy="80" rx="7.5" ry="17" fill="#3f7d4a" stroke="#254a2c" stroke-width="1.5" transform="rotate(-16 23 80)"/>'
    + '<ellipse cx="77" cy="80" rx="7.5" ry="17" fill="#3f7d4a" stroke="#254a2c" stroke-width="1.5" transform="rotate(16 77 80)"/>'
    + '<circle cx="15" cy="95" r="6" fill="#e8b98a" stroke="#b8875c" stroke-width="1"/>'
    + '<circle cx="85" cy="95" r="6" fill="#e8b98a" stroke="#b8875c" stroke-width="1"/>'
    + '<line x1="85" y1="95" x2="85" y2="46" stroke="#6b4a2f" stroke-width="3.5" stroke-linecap="round"/>'
    + '<circle class="toni-orb" cx="85" cy="42" r="6" fill="#6bd88a"/>'
    + '<circle cx="50" cy="39" r="19" fill="#e8b98a" stroke="#b8875c" stroke-width="1.5"/>'
    + '<path d="M40,52 Q50,58 60,52 L58,46 Q50,50 42,46 Z" fill="#8a6a4a"/>'
    + '<path d="M50,0 L25,36 Q50,26 75,36 Z" fill="#2f5c38" stroke="#1c3a22" stroke-width="2.5"/>'
    + '<ellipse cx="50" cy="36" rx="28" ry="6" fill="#2f5c38" stroke="#1c3a22" stroke-width="2.5"/>'
    + '<circle cx="50" cy="2" r="4.2" fill="#ff8a3d" stroke="#b85a1e" stroke-width="1"/>'
    + '<circle cx="43" cy="39" r="2.2" fill="#2a2a2a"/><circle cx="57" cy="39" r="2.2" fill="#2a2a2a"/>'
    + '<path d="M44,46 Q50,48 56,46" stroke="#8a5c3c" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="41" cy="32" rx="7" ry="4.5" fill="#fff" opacity="0.28" transform="rotate(-18 41 32)"/>'
    + '</svg>';
  // Hand-painted witch art replaces the old inline SVGs: a front-facing portrait for
  // menus/HUD/profile/character-confirm, and a from-behind pose for the on-map marker,
  // since the game camera follows the player from over-the-shoulder. Small ("Sm") variants
  // are pre-downscaled copies for spots that only ever show the art at ~30-70px — using
  // those instead of decoding the full char-confirm-screen-sized image in a dozen places
  // (HUD chip, profile, leaderboard rows, the on-map marker) was one of the easy wins for
  // the general sluggishness.
  const AVATAR_IMG = {
    female: { front:'assets/girl-front.png', back:'assets/girl-back.png', frontSm:'assets/girl-front-sm.png', backSm:'assets/girl-back-sm.png' },
    male:   { front:'assets/boy-front.png',  back:'assets/boy-back.png',  frontSm:'assets/boy-front-sm.png',  backSm:'assets/boy-back-sm.png' }
  };
  function frontAvatarMarkup(gender, small){
    const g = gender==='male' ? 'male' : 'female';
    return '<img class="player-avatar-svg" src="'+(small?AVATAR_IMG[g].frontSm:AVATAR_IMG[g].front)+'" alt="'+g+' witch" draggable="false">';
  }
  function backAvatarMarkup(gender, small){
    const g = gender==='male' ? 'male' : 'female';
    return '<img class="player-avatar-svg" src="'+(small?AVATAR_IMG[g].backSm:AVATAR_IMG[g].back)+'" alt="'+g+' witch, seen from behind" draggable="false">';
  }
  function playerAvatarMarkup(gender, small){ return frontAvatarMarkup(gender, small); } // kept for any old call sites — portrait view
  // The trick-or-treat costume worn on the map itself (matches the reference art) — your
  // chosen trainer look still shows in the avatar badge, profile, and character select.
  const PLAYER_GHOST_COSTUME_SVG = '<svg class="player-avatar-svg" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">'
    + '<ellipse cx="50" cy="133" rx="14" ry="4" fill="rgba(0,0,0,0.25)"/>'
    + '<path d="M50,50 Q22,55 24,95 Q24,120 34,128 L40,116 L46,128 L54,116 L60,128 L66,116 Q76,120 76,95 Q78,55 50,50 Z" fill="#f4f0ea" stroke="#c9c3ba" stroke-width="2.5"/>'
    + '<ellipse cx="22" cy="80" rx="6" ry="13" fill="#e9e3d8" stroke="#c9c3ba" stroke-width="2" transform="rotate(-12 22 80)"/>'
    + '<ellipse cx="78" cy="80" rx="6" ry="13" fill="#e9e3d8" stroke="#c9c3ba" stroke-width="2" transform="rotate(12 78 80)"/>'
    + '<path d="M50,10 Q30,10 27,32 Q25,48 32,58 Q40,44 50,44 Q60,44 68,58 Q75,48 73,32 Q70,10 50,10 Z" fill="#f4f0ea" stroke="#c9c3ba" stroke-width="2.5"/>'
    + '<path d="M31,26 L23,10 L38,20 Z" fill="#f4f0ea" stroke="#c9c3ba" stroke-width="2"/>'
    + '<path d="M69,26 L77,10 L62,20 Z" fill="#f4f0ea" stroke="#c9c3ba" stroke-width="2"/>'
    + '<path d="M31,26 L25,13 L36,20 Z" fill="#7a5aa8"/><path d="M69,26 L75,13 L64,20 Z" fill="#7a5aa8"/>'
    + '<circle cx="42" cy="40" r="3.4" fill="#2a2530"/><circle cx="58" cy="40" r="3.4" fill="#2a2530"/>'
    + '<path d="M45,49 Q50,52 55,49" stroke="#2a2530" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
    + '<path d="M33,102 Q50,110 67,102" stroke="#d9d2c6" stroke-width="2" fill="none" stroke-linecap="round"/>'
    + '</svg>';
  const TONI_SVG = '<img class="creature-img" src="assets/totos/eternal/toni_scarecrow.png" alt="Toni" draggable="false">';
  // Always resolve the sprite fresh from the live TOTO_IMG table instead of trusting a
  // Toto's cached t.sprite string. Older caught Totos have that HTML baked in from
  // whenever they were caught, so when the asset folder layout changes (e.g. the
  // normal/legendary/eternal split) any already-caught Toto's cached path goes stale and
  // renders as a broken image / blank card. Resolving by name every time means a caught
  // Toto always shows whatever the current art actually is.
  function spriteMarkup(t){
    if (!t) return '';
    if (t.isToni) return TONI_SVG;
    return spriteFor(t.name, t.nature) || t.sprite || '';
  }
  function glowClassFor(tier){ return tier==='eternal' ? ' toni-glow' : (tier==='mythical' ? ' mythical-glow' : (tier==='legendary' ? ' legendary-glow' : '')); }
  // Master species list for the Encyclopedia — every name the game can roll, with its art.
  const DEX_SPECIES = NORMAL_SPECIES.map(sp=>({ name: sp.name, nature: sp.role, role: sp.role, sprite: spriteFor(sp.name, sp.role) }));
  // The 10 fixed legendaries get their own Dex list (see LEGENDARY_SPECIES) since that
  // tier no longer rolls from the general species pool above.
  const LEGENDARY_DEX = LEGENDARY_SPECIES.map(sp=>({ name: sp.name, nature: sp.role, role: sp.role, sprite: spriteFor(sp.name, sp.role) }));
  function makeToniGuardian(){
    const t = { id:uid(), name:'Toni', sprite:TONI_SVG, tier:'eternal', role:'supporter', isToni:true };
    applyLevelStats(t, TOTO_MAX_LEVEL);
    return t;
  }
  function makeFixedEternal(name, sprite, roleOverride, statMult){
    const role = roleOverride || roleOf(name);
    const t = { id:uid(), name, sprite, tier:'eternal', role, statMult: statMult||1 };
    applyLevelStats(t, TOTO_MAX_LEVEL);
    return t;
  }
  // Grimhollow — the Ashen Shrine's guardian: a grim-reaper skeleton in a black cloak
  // with a glowing-edged scythe.
  const GRIMHOLLOW_SVG = '<svg class="creature-svg" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">'
    + '<ellipse cx="55" cy="133" rx="30" ry="6" fill="rgba(0,0,0,0.3)"/>'
    + '<line x1="95" y1="10" x2="58" y2="118" stroke="#3a2a1c" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M95,10 Q126,16 118,46 Q100,36 87,25 Z" fill="#c9c9c9" stroke="#6a6a6a" stroke-width="2"/>'
    + '<path d="M95,11 Q117,19 111,38" fill="none" stroke="#f0f0f0" stroke-width="1.5" opacity="0.75"/>'
    + '<path d="M55,45 C25,55 14,92 20,128 Q55,139 90,128 C96,92 85,55 55,45 Z" fill="#1c1c24" stroke="#0a0a0e" stroke-width="2.5" class="cr-ghost"/>'
    + '<path d="M35,70 Q29,100 35,125" stroke="#0a0a0e" stroke-width="1.5" fill="none" opacity="0.55"/>'
    + '<path d="M75,70 Q81,100 75,125" stroke="#0a0a0e" stroke-width="1.5" fill="none" opacity="0.55"/>'
    + '<path d="M20,128 L27,139 L34,126 L41,139 L48,126 L55,139 L62,126 L69,139 L76,126 L83,139 L90,128" fill="#1c1c24" stroke="#0a0a0e" stroke-width="2"/>'
    + '<path d="M55,60 Q29,75 24,96" stroke="#1c1c24" stroke-width="9" stroke-linecap="round"/>'
    + '<ellipse cx="23" cy="98" rx="6" ry="7" fill="#e8e0d0" stroke="#a89f8a" stroke-width="1"/>'
    + '<path d="M35,40 Q55,14 75,40 Q78,56 70,66 Q55,73 40,66 Q32,56 35,40 Z" fill="#1c1c24" stroke="#0a0a0e" stroke-width="2.5"/>'
    + '<ellipse cx="55" cy="51" rx="16" ry="18" fill="#e8e0d0" stroke="#a89f8a" stroke-width="1"/>'
    + '<ellipse class="cr-eye" cx="49" cy="48" rx="4" ry="5" fill="#0a0a0e"/>'
    + '<ellipse class="cr-eye" cx="61" cy="48" rx="4" ry="5" fill="#0a0a0e"/>'
    + '<circle cx="49" cy="48" r="1.4" fill="#ff8ad0"/><circle cx="61" cy="48" r="1.4" fill="#ff8ad0"/>'
    + '<path d="M46,58 L48,54 L51,59 L54,53 L57,59 L60,54 L62,58" stroke="#0a0a0e" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="60" cy="81" rx="6" ry="8" fill="#e8e0d0" stroke="#a89f8a" stroke-width="1"/>'
    + '</svg>';
  // MaxiPadi — the Crypt Tower's guardian: a hulking demon dog with horns, back spikes,
  // and glowing red eyes.
  const MAXIPADI_SVG = '<svg class="creature-svg" viewBox="0 0 130 100" xmlns="http://www.w3.org/2000/svg">'
    + '<ellipse cx="65" cy="94" rx="46" ry="6" fill="rgba(0,0,0,0.3)"/>'
    + '<path d="M30,70 L24,92 L34,92 L38,72 Z" fill="#2a1418" stroke="#150a0c" stroke-width="1.5" class="cr-leg cr-legL"/>'
    + '<path d="M50,74 L46,92 L56,92 L58,76 Z" fill="#2a1418" stroke="#150a0c" stroke-width="1.5"/>'
    + '<path d="M75,74 L73,92 L83,92 L83,76 Z" fill="#3a1c22" stroke="#150a0c" stroke-width="1.5"/>'
    + '<path d="M95,70 L95,92 L105,92 L100,72 Z" fill="#3a1c22" stroke="#150a0c" stroke-width="1.5" class="cr-leg cr-legR"/>'
    + '<path d="M24,92 L21,97 M29,92 L29,98 M34,92 L37,97" stroke="#0a0505" stroke-width="1.5" stroke-linecap="round"/>'
    + '<path d="M95,92 L92,97 M100,92 L100,98 M105,92 L108,97" stroke="#0a0505" stroke-width="1.5" stroke-linecap="round"/>'
    + '<path d="M20,60 Q2,50 6,30 Q16,42 26,54 Z" fill="#3a1c22" stroke="#150a0c" stroke-width="2"/>'
    + '<circle cx="7" cy="28" r="5" fill="#ff5020"/>'
    + '<ellipse cx="62" cy="60" rx="42" ry="24" fill="#3a1c22" stroke="#150a0c" stroke-width="2.5"/>'
    + '<ellipse cx="62" cy="72" rx="32" ry="9" fill="#000" opacity="0.2"/>'
    + '<path d="M35,40 L38,26 L42,40 M50,36 L53,20 L57,36 M65,35 L68,18 L72,35 M80,37 L83,22 L87,37" fill="#1c0d10" stroke="#0a0505" stroke-width="1"/>'
    + '<ellipse cx="105" cy="42" rx="24" ry="20" fill="#4a2028" stroke="#150a0c" stroke-width="2.5"/>'
    + '<path d="M92,26 L88,12 L97,24 Z" fill="#1c0d10" stroke="#0a0505" stroke-width="1"/>'
    + '<path d="M110,24 L114,10 L118,24 Z" fill="#1c0d10" stroke="#0a0505" stroke-width="1"/>'
    + '<path d="M122,42 Q135,44 130,55 Q120,52 116,46 Z" fill="#4a2028" stroke="#150a0c" stroke-width="2"/>'
    + '<path d="M122,50 L120,59 L126,52 M128,52 L128,61 L132,53" fill="#f0ece0" stroke="#a89080" stroke-width="0.8"/>'
    + '<ellipse class="cr-eye" cx="100" cy="37" rx="5" ry="4" fill="#ff2020"/>'
    + '<ellipse class="cr-eye" cx="116" cy="36" rx="4.5" ry="4" fill="#ff2020"/>'
    + '<ellipse cx="100" cy="37" rx="2" ry="1.7" fill="#ffd0d0"/><ellipse cx="116" cy="36" rx="1.8" ry="1.6" fill="#ffd0d0"/>'
    + '<ellipse cx="50" cy="48" rx="12" ry="7" fill="#fff" opacity="0.12" transform="rotate(-15 50 48)"/>'
    + '</svg>';
  // Pumpkin Rider — headless horseman on a galloping horse, raising his lit jack-o-lantern.
  const PUMPKIN_RIDER_SVG = '<svg class="creature-svg" viewBox="0 0 160 135" xmlns="http://www.w3.org/2000/svg">'
    + '<ellipse cx="75" cy="127" rx="55" ry="6" fill="rgba(0,0,0,0.3)"/>'
    + '<path d="M35,85 L25,112 L33,112 L42,88 Z" fill="#1c1c22" stroke="#0a0a0e" stroke-width="1.5"/>'
    + '<path d="M55,88 L50,110 L58,110 L62,90 Z" fill="#1c1c22" stroke="#0a0a0e" stroke-width="1.5"/>'
    + '<path d="M95,86 L100,110 L108,110 L100,88 Z" fill="#26262e" stroke="#0a0a0e" stroke-width="1.5"/>'
    + '<path d="M112,82 L124,104 L132,100 L118,80 Z" fill="#26262e" stroke="#0a0a0e" stroke-width="1.5"/>'
    + '<path d="M25,55 Q4,60 8,85 Q18,68 30,60 Z" fill="#141418" stroke="#0a0a0e" stroke-width="2"/>'
    + '<ellipse cx="75" cy="65" rx="48" ry="24" fill="#1c1c22" stroke="#0a0a0e" stroke-width="2.5"/>'
    + '<ellipse cx="75" cy="78" rx="36" ry="9" fill="#000" opacity="0.2"/>'
    + '<path d="M108,52 Q129,35 123,18 Q112,28 100,42 Z" fill="#1c1c22" stroke="#0a0a0e" stroke-width="2.5"/>'
    + '<path d="M123,18 Q136,15 133,27 Q126,24 120,25 Z" fill="#1c1c22" stroke="#0a0a0e" stroke-width="2"/>'
    + '<path d="M108,21 Q100,31 104,43 M114,17 Q106,27 110,39" stroke="#0a0a0e" stroke-width="3" fill="none" stroke-linecap="round"/>'
    + '<ellipse class="cr-eye" cx="127" cy="22" rx="2.2" ry="2" fill="#ff8ad0"/>'
    + '<path d="M55,28 C41,38 39,56 46,69 L85,69 C90,54 85,34 68,26 Z" fill="#242430" stroke="#0e0e14" stroke-width="2.5"/>'
    + '<path d="M62,29 Q42,14 32,28 Q46,32 55,42 Z" fill="#1a1a24" stroke="#0e0e14" stroke-width="2"/>'
    + '<ellipse cx="62" cy="28" rx="8" ry="5" fill="#3a1414"/>'
    + '<path d="M50,38 Q31,29 22,15" stroke="#242430" stroke-width="8" stroke-linecap="round"/>'
    + '<circle cx="20" cy="15" r="14" fill="#ff8a3d" stroke="#8a3a10" stroke-width="2"/>'
    + '<path d="M10,10 L15,4 L13,13 Z" fill="#8a3a10"/><path d="M30,10 L25,4 L27,13 Z" fill="#8a3a10"/>'
    + '<path d="M11,19 L15,22 L18,18 L21,22 L25,19" stroke="#8a3a10" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
    + '<circle class="cr-eye" cx="15" cy="14" r="1.8" fill="#fff2b0"/><circle class="cr-eye" cx="25" cy="14" r="1.8" fill="#fff2b0"/>'
    + '</svg>';
  const MAX_IMG = '<img class="creature-img" src="assets/totos/eternal/max.png" alt="Max" draggable="false">';
  const HANA_IMG = '<img class="creature-img" src="assets/totos/eternal/witch_hana.png" alt="Witch Hana" draggable="false">';
  // Max: one of the strongest Attackers in the game, with his own bite moves (see the
  // Savage Bite / Frenzy Bite buttons in battle). Witch Hana: the strongest Challenger to
  // beat right now, so she carries an extra stat multiplier on top of Eternal.
  function makeMax(){ return makeFixedEternal('Max', MAX_IMG, 'attacker', 1.15); }
  function makeWitchHana(){ return makeFixedEternal('Witch Hana', HANA_IMG, 'attacker', 1.3); }
  // Four more Eternal Challengers — a coven of witches/spirits, split across the roles that
  // still needed a dedicated Eternal (Healer, Supporter, Tanker), plus one more Attacker.
  const VESPER_IMG = '<img class="creature-img" src="assets/totos/eternal/vesper_nightshade.png" alt="Vesper Nightshade" draggable="false">';
  const HARVEST_IMG = '<img class="creature-img" src="assets/totos/eternal/harvest_warden.png" alt="Harvest Warden" draggable="false">';
  const BLOSSOM_IMG = '<img class="creature-img" src="assets/totos/eternal/blossom_wraith.png" alt="Blossom Wraith" draggable="false">';
  const SOVEREIGN_IMG = '<img class="creature-img" src="assets/totos/eternal/shadow_sovereign.png" alt="Shadow Sovereign" draggable="false">';
  function makeVesperNightshade(){ return makeFixedEternal('Vesper Nightshade', VESPER_IMG, 'attacker'); }
  function makeHarvestWarden(){ return makeFixedEternal('Harvest Warden', HARVEST_IMG, 'healer'); }
  function makeBlossomWraith(){ return makeFixedEternal('Blossom Wraith', BLOSSOM_IMG, 'supporter'); }
  function makeShadowSovereign(){ return makeFixedEternal('Shadow Sovereign', SOVEREIGN_IMG, 'tanker'); }
  function makeGrimhollow(){ return makeFixedEternal('Grimhollow', GRIMHOLLOW_SVG); }
  function makePumpkinRider(){ return makeFixedEternal('Pumpkin Rider', PUMPKIN_RIDER_SVG); }
  // PandaQueen — a fifth Eternal, using the user's own provided artwork (background
  // already removed) instead of the game's line-art creature style.
  const PANDAQUEEN_IMG = 'data:image/png;base64,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';
  const PANDAQUEEN_SVG = '<img class="pandaqueen-img" src="'+PANDAQUEEN_IMG+'" alt="PandaQueen"/>';
  function makePandaQueen(){ return makeFixedEternal('PandaQueen', PANDAQUEEN_SVG); }
  // Powering up now costs only Candy — Pumpkin Dust has been retired as a currency.
  // Costs still scale by tier and current level, capping out at a flat Eternal cost.
  const TIER_POWERUP_BASE = {
    normal:    { candy: 3 },
    legendary: { candy: 35 },
    mythical:  { candy: 120 },
    eternal:   { candy: 400 }
  };
  // ---------------- TOTO XP (earned in battles) ----------------
  function xpToNext(level){ return 60 + 30*level; }
  // Adds XP and levels the Toto up as many times as it fills the bar (its stats grow with
  // every level, exactly like a candy Power Up). Returns how many levels it gained.
  function grantTotoXp(t, amount){
    if (!t || t.level >= TOTO_MAX_LEVEL) return 0;
    t.xp = (t.xp||0) + Math.max(0, Math.round(amount));
    let ups = 0;
    while (t.level < TOTO_MAX_LEVEL && t.xp >= xpToNext(t.level)){ t.xp -= xpToNext(t.level); applyLevelStats(t, t.level + 1); ups++; }
    if (t.level >= TOTO_MAX_LEVEL) t.xp = 0;
    return ups;
  }
  function powerUpCost(t){
    const base = TIER_POWERUP_BASE[t.tier] || TIER_POWERUP_BASE.normal;
    if (t.tier==='eternal') return { candy: base.candy }; // flat, as specified
    const mult = 1 + (t.level-1)*0.15;
    return { candy: Math.max(1, Math.round(base.candy*mult)) };
  }
  function applyPowerUp(t){
    if (t.level >= TOTO_MAX_LEVEL) return false;
    applyLevelStats(t, t.level + 1);
    t.xp = Math.min(t.xp||0, xpToNext(t.level)-1);
    return true;
  }

  // ---------------- STATE ----------------
  let state = {
    loggedIn:false, username:'', email:'', gender:'female', age:'',
    avatar:'female', candy:150, gems:20, coins:0, collection:[], geo:null, activeTab:'map',
    chunkEls: new Map(),
    // Earned wearables (see COSMETIC_CATALOG below) — unlockedCosmetics is every non-default
    // item id the player has earned, equippedCosmetics is what's currently worn per slot
    // ('default' or absent = the game's built-in starting look for that slot).
    unlockedCosmetics: [], equippedCosmetics: {}
  };
  let detailTarget = null;

  // ---------------- SAVE QUEUE (fixes "cannot save" loop) ----------------
  // Two storage backends: window.storage (only exists inside a Claude artifact
  // preview) and localStorage (works everywhere, incl. the downloaded standalone
  // app). We use whichever is actually available so the same file works both ways.
  const hasCloudStorage = (typeof window.storage !== 'undefined');
  // Optional real cross-device leaderboard backend. A static GitHub Pages site has no
  // server of its own, so without this the leaderboard can only ever show your own
  // device. Paste your own free Firebase Realtime Database URL below to turn on a real
  // shared leaderboard for the downloaded/GitHub-hosted version too — see the README in
  // the app bundle for the 2-minute setup. Leave it blank to keep current behavior
  // (shared only when played through the hosted Claude link).
  // Optional real cross-device leaderboard, stored as a JSON file in the SAME GitHub repo
  // you're already using to host this game — no new third-party service or account needed
  // beyond the GitHub account hosting already requires. See the README for the 2-minute
  // setup (a free fine-grained personal access token scoped to just this one repo).
  // Leave GITHUB_LB_REPO blank to keep the fallback behavior (shared only when played
  // through the hosted Claude link; local-only otherwise).
  const GITHUB_LB_OWNER = '';  // e.g. 'yourusername'
  const GITHUB_LB_REPO = '';   // e.g. 'totoquest'
  const GITHUB_LB_TOKEN = '';  // a fine-grained PAT with Contents: read/write on just this repo
  const GITHUB_LB_PATH = 'leaderboard.json';
  const githubLbConfigured = !!(GITHUB_LB_OWNER && GITHUB_LB_REPO && GITHUB_LB_TOKEN);
  function githubLbUrl(){ return 'https://api.github.com/repos/'+GITHUB_LB_OWNER+'/'+GITHUB_LB_REPO+'/contents/'+GITHUB_LB_PATH; }
  function b64EncodeUnicode(str){ return btoa(unescape(encodeURIComponent(str))); }
  function b64DecodeUnicode(str){ return decodeURIComponent(escape(atob(str.replace(/\n/g,'')))); }
  async function githubLbRead(){
    const res = await fetch(githubLbUrl(), { headers:{ Authorization:'Bearer '+GITHUB_LB_TOKEN, Accept:'application/vnd.github+json' } });
    if (res.status===404) return { board:{}, sha:null };
    if (!res.ok) throw new Error('github read failed '+res.status);
    const data = await res.json();
    let board = {};
    try { board = JSON.parse(b64DecodeUnicode(data.content)||'{}'); } catch(e){ board = {}; }
    return { board, sha: data.sha };
  }
  async function githubLbWrite(mutateFn){
    // Read-modify-write with one retry on a SHA conflict from a concurrent writer.
    for (let attempt=0; attempt<2; attempt++){
      const { board, sha } = await githubLbRead();
      mutateFn(board);
      const body = { message:'update leaderboard', content: b64EncodeUnicode(JSON.stringify(board)) };
      if (sha) body.sha = sha;
      const res = await fetch(githubLbUrl(), {
        method:'PUT', headers:{ Authorization:'Bearer '+GITHUB_LB_TOKEN, Accept:'application/vnd.github+json' },
        body: JSON.stringify(body)
      });
      if (res.ok) return true;
      if (res.status!==409 || attempt===1) throw new Error('github write failed '+res.status);
    }
    return false;
  }
  // Lightweight real-player lobby matchmaking, piggybacking on the exact same GitHub
  // JSON file trick as the leaderboard above (no separate backend/account needed). If
  // GITHUB_LB_* isn't configured, this silently no-ops and group battles just go straight
  // to the bots-after-40s fallback, which is also correct behavior with nobody else to see it.
  const GITHUB_PRESENCE_PATH = 'lobby-presence.json';
  function githubPresenceUrl(){ return 'https://api.github.com/repos/'+GITHUB_LB_OWNER+'/'+GITHUB_LB_REPO+'/contents/'+GITHUB_PRESENCE_PATH; }
  async function githubPresenceRead(){
    const res = await fetch(githubPresenceUrl(), { headers:{ Authorization:'Bearer '+GITHUB_LB_TOKEN, Accept:'application/vnd.github+json' } });
    if (res.status===404) return { data:{lobbies:{}}, sha:null };
    if (!res.ok) throw new Error('presence read failed '+res.status);
    const d = await res.json();
    let data = {lobbies:{}};
    try { data = JSON.parse(b64DecodeUnicode(d.content)||'{}'); if (!data.lobbies) data.lobbies={}; } catch(e){}
    return { data, sha: d.sha };
  }
  async function githubPresenceWrite(mutateFn){
    for (let attempt=0; attempt<2; attempt++){
      const { data, sha } = await githubPresenceRead();
      mutateFn(data);
      const body = { message:'lobby presence', content: b64EncodeUnicode(JSON.stringify(data)) };
      if (sha) body.sha = sha;
      const res = await fetch(githubPresenceUrl(), {
        method:'PUT', headers:{ Authorization:'Bearer '+GITHUB_LB_TOKEN, Accept:'application/vnd.github+json' },
        body: JSON.stringify(body)
      });
      if (res.ok) return true;
      if (res.status!==409 || attempt===1) return false;
    }
    return false;
  }
  async function rawGet(key){
    if (hasCloudStorage){
      try { const res = await window.storage.get(key, false); return (res && res.value) ? res.value : null; }
      catch(e){ return null; }
    }
    try { return localStorage.getItem(key); } catch(e){ return null; }
  }
  async function rawSet(key, value){
    if (hasCloudStorage){
      try { const res = await window.storage.set(key, value, false); return !!res; }
      catch(e){ return false; }
    }
    try { localStorage.setItem(key, value); return true; } catch(e){ return false; }
  }
  async function rawDelete(key){
    if (hasCloudStorage){ try { await window.storage.delete(key, false); } catch(e){} return; }
    try { localStorage.removeItem(key); } catch(e){}
  }

  let dirty = false, saving = false, saveTimer = null;
  async function saveNow(force){
    if (!state.loggedIn || !state.email) return true;
    if (saving){
      dirty = true;
      if (!force) return false;
      // A forced save (e.g. right after picking a starter) must not silently defer to the
      // next autosave tick — wait for the in-flight save to finish, then save again so the
      // latest state is guaranteed to be written before we return.
      await new Promise(resolve=>{
        const check = setInterval(()=>{ if (!saving){ clearInterval(check); resolve(); } }, 80);
      });
      return saveNow(true);
    }
    saving = true;
    let ok = false;
    for (let attempt=0; attempt<3 && !ok; attempt++){
      ok = await rawSet('totoquest-profile:'+state.email, JSON.stringify(state));
      if (!ok && attempt<2) await new Promise(r=>setTimeout(r, 400*(attempt+1)));
    }
    saving = false;
    if (ok){ dirty = false; }
    else if (force){ showToast('⚠️ Could not save — will retry automatically'); dirty = true; }
    return ok;
  }
  function markDirty(){ dirty = true; }
  function startAutosave(){
    if (saveTimer) clearInterval(saveTimer);
    saveTimer = setInterval(()=>{ if (dirty) saveNow(false); }, 5000);
  }
  function stopAutosave(){ if (saveTimer) clearInterval(saveTimer); saveTimer=null; }
  async function loadProfileByEmail(email){
    const raw = await rawGet('totoquest-profile:'+email);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e){ return null; }
  }
  // "Remember me" — stays logged in across closes/reopens until an explicit Logout.
  async function rememberEmail(email){ await rawSet('totoquest-last-email', email); }
  async function forgetRememberedEmail(){ await rawDelete('totoquest-last-email'); }
  async function tryAutoLogin(){
    const email = await rawGet('totoquest-last-email');
    if (!email) { return false; }
    const prof = await loadProfileByEmail(email);
    if (!prof) { return false; }
    state = Object.assign({}, state, prof, {loggedIn:true});
    enterGame(false);
    return true;
  }

  // In-game message boxes. The browser's own confirm()/prompt() pop-ups show the website's
  // address ("bakahideout.github.io says"), so the game asks its questions itself.
  function gameDialog({ title='', message='', ok='OK', cancel='Cancel', input=null }){
    return new Promise(resolve=>{
      const back = $('#game-dialog'), inp = $('#gd-input'), rootEl = document.getElementById('toto-root');
      if (back.parentNode !== rootEl) rootEl.appendChild(back);      // above every screen, even the tutorial
      $('#gd-title').textContent = title; $('#gd-msg').textContent = message;
      $('#gd-ok').textContent = ok;
      $('#gd-cancel').textContent = cancel || ''; $('#gd-cancel').style.display = cancel ? '' : 'none';
      inp.style.display = input ? '' : 'none'; inp.value = ''; if (input) inp.placeholder = input;
      const done = val=>{ back.classList.remove('show'); $('#gd-ok').onclick = $('#gd-cancel').onclick = null; resolve(val); };
      $('#gd-ok').onclick = ()=> done(input ? (inp.value.trim() || null) : true);
      $('#gd-cancel').onclick = ()=> done(input ? null : false);
      back.classList.add('show');
      if (input) setTimeout(()=> inp.focus(), 50);
    });
  }
  const gameConfirm = (message, title, ok, cancel)=> gameDialog({ title: title||'', message, ok: ok||'OK', cancel: cancel||'Cancel' });
  const gamePrompt = (message, placeholder, title)=> gameDialog({ title: title||'', message, input: placeholder||' ', ok:'Continue' });
  // long-pressing anything in the game never brings up the phone's save/share menu
  document.addEventListener('contextmenu', e=>{ if (!(e.target.closest && e.target.closest('input, textarea'))) e.preventDefault(); }, true);
  document.addEventListener('dragstart', e=>{ if (e.target && /^(IMG|CANVAS|svg)$/i.test(e.target.tagName||'')) e.preventDefault(); }, true);

  function showScreen(name){ $$('.screen').forEach(s=>s.classList.toggle('active', s.dataset.screen===name)); }
  function showToast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000); }

  // ---------------- AUTH ----------------
  $('#tab-login').onclick = ()=>{ $('#tab-login').classList.add('active'); $('#tab-register').classList.remove('active'); $('#login-fields').style.display='block'; $('#register-fields').style.display='none'; };
  $('#tab-register').onclick = ()=>{ $('#tab-register').classList.add('active'); $('#tab-login').classList.remove('active'); $('#register-fields').style.display='block'; $('#login-fields').style.display='none'; };
  $$('.auth-wrap').forEach(w=> w.addEventListener('scroll', ()=>{ if (w.scrollLeft) w.scrollLeft = 0; }));   // older browsers without overflow:clip
  $$('#gender-select .pill-btn').forEach(btn=>{ btn.onclick = ()=>{ $$('#gender-select .pill-btn').forEach(b=>b.classList.remove('sel')); btn.classList.add('sel'); }; });

  async function doLogin(email){
    if (!email){ $('#login-error').textContent='Enter your email.'; return; }
    $('#login-error').textContent='Checking…';
    const prof = await loadProfileByEmail(email.trim().toLowerCase());
    if (!prof){ $('#login-error').textContent='No account found — register first.'; return; }
    $('#login-error').textContent='';
    state = Object.assign({}, state, prof, {loggedIn:true});
    await rememberEmail(state.email);
    enterGame(false);
  }
  $('#btn-login').onclick = ()=> doLogin($('#login-email').value);
  $('#btn-google-login').onclick = async ()=> doLogin((await gamePrompt('Enter the Google email you signed up with.', 'you@gmail.com', 'Continue with Google')) || '');

  // TotoQuest is for players 13 and older (see terms.html / privacy.html). The age box doesn't
  // say where the line is, and an under-13 answer is remembered on this device for a day so it
  // can't simply be retyped.
  const MIN_AGE = 13, AGE_BLOCK_KEY = 'totoquest-age-block';
  const AGE_BLOCK_MSG = 'Sorry, TotoQuest is for players 13 and older.';
  function ageBlocked(){ try { const t = +localStorage.getItem(AGE_BLOCK_KEY) || 0; return Date.now() - t < 24*3600*1000; } catch(e){ return false; } }
  function checkSignupAge(raw){
    if (ageBlocked()) return AGE_BLOCK_MSG;
    const s = String(raw == null ? '' : raw).trim();
    const a = /^\d{1,3}$/.test(s) ? parseInt(s, 10) : NaN;
    if (!isFinite(a) || a < 1 || a > 120) return 'Please enter your age.';
    if (a < MIN_AGE){ try { localStorage.setItem(AGE_BLOCK_KEY, String(Date.now())); } catch(e){} return AGE_BLOCK_MSG; }
    return '';
  }
  // saves made before the age rule (or with no age) — never put an under-13 save online or in the store
  function underAge(){ const a = parseInt(state.age, 10); return isFinite(a) && a < MIN_AGE; }

  async function doRegister(email, username, gender, age, viaGoogle){
    email = (email||'').trim().toLowerCase();
    const ageErr = checkSignupAge(age);
    if (ageErr){ $('#reg-error').textContent = ageErr; return; }
    age = String(parseInt(String(age).trim(), 10));
    if (!email || !username){ $('#reg-error').textContent='Fill in username and email.'; return; }
    $('#reg-error').textContent='Checking…';
    const existing = await loadProfileByEmail(email);
    if (existing){ $('#reg-error').textContent='Account already exists — log in instead.'; return; }
    $('#reg-error').textContent='';
    // Merge into the existing state object rather than replacing it outright — if the
    // loading screen already got a GPS fix and started fetching the map for this spot
    // (see runLoadingSequence), that in-flight/loaded world data lives on the state
    // object too, and replacing state wholesale used to throw it all away and start over
    // right as you reached the map, which was a chunk of the "lag" getting into a new game.
    Object.assign(state, { loggedIn:true, username, email, gender, age: age||'—', avatar: gender==='male'?'male':'female', candy:150, gems:20, coins:0, collection:[], activeTab:'map', viaGoogle: !!viaGoogle, tutorialDone:false, playerId: newUuid(), playerSecret: newPlayerSecret(), pendingCheckoutAt:0, items:{ raidPass:3, elixir:5 }, stopCooldownUntil:0, lastPassDay:'' });
    const ok = await saveNow(true);
    await rememberEmail(email);
    if (!ok) $('#reg-error').textContent = 'Could not reach save storage — you can still play, it will retry automatically.';
    $('#char-portrait-img').src = AVATAR_IMG[state.avatar].front;
    $('#char-portrait-title').textContent = 'This is you, '+username+'…';
    showScreen('char');
  }
  $('#btn-register').onclick = ()=>{ const gender = $('#gender-select .sel').dataset.g; doRegister($('#reg-email').value, $('#reg-username').value, gender, $('#reg-age').value, false); };
  $('#btn-google-register').onclick = async ()=>{
    const ageErr = checkSignupAge($('#reg-age').value);
    if (ageErr){ $('#reg-error').textContent = ageErr; return; }
    const email = await gamePrompt('Enter the Google email to sign up with.', 'you@gmail.com', 'Sign up with Google'); if (!email) return;
    const username = email.split('@')[0]; const gender = $('#gender-select .sel').dataset.g;
    doRegister(email, username, gender, $('#reg-age').value, true);
  };
  $('#btn-enter-world').onclick = ()=>{
    if (state.collection.length===0){ showStarterSelect(); } else { enterGame(true); }
  };

  // ---------------- STARTER SELECT (new accounts only) ----------------
  function makeStarterToto(name){
    const role = roleOf(name);
    const t = { id:uid(), name, sprite: spriteFor(name, role), tier:'normal', nature:role, role, level:1, cp:0, maxHp:0, hp:0, atk:0, strength:0, def:0, spd:0, maxEnergy:0, energy:0 };
    applyLevelStats(t, 1); // starters always begin at level 1 — no head start, everyone levels up from scratch
    return t;
  }
  function showStarterSelect(){
    const grid = $('#starter-grid'); grid.innerHTML='';
    STARTER_SPECIES.forEach((sp, i)=>{
      const name = sp.name, role = sp.role, ri = ROLE_INFO[role];
      const card = document.createElement('div'); card.className='starter-card' + (i===0?' sel':'');
      card.dataset.name = name;
      card.innerHTML = '<div class="sp">'+spriteFor(name, role)+'</div><div class="nm">'+name+'</div>'
        + '<div class="role-badge" style="color:'+ri.color+';">'+ri.icon+' '+ri.label+'</div>';
      card.onclick = ()=>{ $$('.starter-card').forEach(c=>c.classList.remove('sel')); card.classList.add('sel'); };
      grid.appendChild(card);
    });
    showScreen('starter');
  }
  $('#btn-confirm-starter').onclick = ()=>{
    // Read the selection straight from the DOM at confirm-time — no separately-tracked
    // variable that could ever drift out of sync with what's actually highlighted.
    const selCard = $('#starter-grid .starter-card.sel') || $('#starter-grid .starter-card');
    const name = (selCard && selCard.dataset.name) || STARTER_SPECIES[0].name;
    const starter = makeStarterToto(name);
    state.collection.push(starter);
    showToast('Welcome, '+starter.name+'!');
    enterGame(true);
  };

  async function enterGame(isNew){
    // Exposes the SAME state object (not a copy) to the 3D-avatar module script below —
    // login/register swap in a whole new state object via Object.assign, and this call
    // always runs right after either of those, so re-pointing the alias here keeps it
    // correct across logins without touching every place state gets reassigned.
    window.__gameState = state;
    const avFront = frontAvatarMarkup(state.avatar, true), avBack = backAvatarMarkup(state.avatar, true);
    $('#hud-avatar').innerHTML = avFront; $('#player-avatar').innerHTML = avBack; $('#profile-avatar').innerHTML = avFront;
    // Try to upgrade the flat on-map marker to a real rotatable 3D model. This is purely
    // additive: if the 3D module hasn't finished loading yet (slow network) we stash the
    // gender and it mounts itself as soon as it's ready; if WebGL/Three.js is unavailable
    // on this device, mountPlayer3D never gets defined and the 2D image set just above
    // stays exactly as the display, untouched.
    if (window.mountPlayer3D) window.mountPlayer3D(state.avatar); else window.__pendingPlayer3DGender = state.avatar;
    $('#avatar-corn-l').innerHTML = CANDY_ICON; $('#avatar-corn-r').innerHTML = CANDY_ICON;
    $('#profile-name').textContent = state.username;
    $('#profile-email').textContent = state.email; $('#profile-gender').textContent = state.gender; $('#profile-age').textContent = state.age;
    $('#admin-panel').style.display = (state.email && state.email.toLowerCase()===ADMIN_EMAIL) ? 'block' : 'none';
    showScreen('game');
    refreshHUD(); renderCollection(); startAutosave(); spawnClouds();
    // online: register this trainer, post the score, and collect anything bought (coming back
    // from checkout lands here with ?purchase=done)
    if (onlineOn()){
      const fromCheckout = /[?&]purchase=done/.test(location.search);
      if (fromCheckout){ try { history.replaceState(null, '', location.pathname); } catch(e){} }
      onlineRegister().then(()=> submitScoreOnline(true));
      watchForPurchase(fromCheckout || checkoutRecent() ? 120 : 1);
    }
    // ALWAYS (re)build the world here, every single session. A returning player's last
    // geoAnchor gets saved into their profile along with everything else — so on a
    // returning session state.geoAnchor is already truthy before this line ever runs,
    // and skipping the build "because it's already set" (what this used to do) meant
    // buildWorld(), and therefore every chunk/road/toto load, silently never ran at all
    // for anyone except a brand-new character. Rebuilding is cheap (it just re-seeds the
    // chunk queue), so there's no real cost to always doing it — reuse the last known
    // anchor as a starting point if we have one (closer to reality than the hardcoded
    // default), and let real GPS correct it moments later either way.
    setAnchorAndBuild(state.geoAnchor ? state.geoAnchor.lat : DEFAULT_LAT, state.geoAnchor ? state.geoAnchor.lon : DEFAULT_LON);
    locate();
    startLocateRetries();
    runMapLoadingOverlay();
    // brand-new trainers get the tutorial as soon as the map is up (and again next time if
    // they closed the app before finishing it)
    if (state.tutorialDone === false || (isNew && !state.tutorialDone)){
      const waitMap = setInterval(()=>{
        const w = $('#game-loading-wrap');
        if (!w || w.classList.contains('hide')){ clearInterval(waitMap); setTimeout(()=> Tutorial.start(), 700); }
      }, 300);
    }
    await saveNow(true);
  }
  // Keeps a cover screen up over the map for as long as it takes for something real to
  // actually be on screen (an anchor + that spot's roads/buildings/totos) instead of
  // dropping you onto a blank map with just the ambient clouds while everything loads in
  // behind it. Capped hard at MAX_MS so a stuck/blocked fetch can never trap you here.
  async function runMapLoadingOverlay(){
    const wrap = $('#game-loading-wrap'); if (!wrap) return;
    const statusEl = $('#map-loading-status'), tipEl = $('#map-loading-tip'),
          fillEl = $('#map-loading-bar-fill'), pctEl = $('#map-loading-pct'), retryBtn = $('#map-loading-retry');
    wrap.classList.remove('hide');
    retryBtn.style.display = 'none';
    let progress = 6;
    function setP(p, label){
      progress = Math.max(progress, Math.min(97, p));
      fillEl.style.width = progress.toFixed(0)+'%'; pctEl.textContent = Math.round(progress)+'%';
      if (label) statusEl.textContent = label;
    }
    let tipIdx = 0;
    const tipTimer = setInterval(()=>{
      tipIdx = (tipIdx+1) % LOADING_TIPS.length;
      tipEl.style.opacity = '0';
      setTimeout(()=>{ tipEl.textContent = LOADING_TIPS[tipIdx]; tipEl.style.opacity = '1'; }, 220);
    }, 2200);
    const creepTimer = setInterval(()=> setP(progress + (progress<75 ? 2.2 : 0.4)), 160);
    retryBtn.onclick = ()=>{ setP(progress, 'Retrying GPS…'); retryBtn.style.display='none'; locate(); };
    const retryShowTimer = setTimeout(()=>{ retryBtn.style.display = 'inline-block'; }, 7000);

    setP(15, state.geoAnchor ? 'Loading your neighborhood…' : 'Finding your location…');
    // A real fetch that fails fast (blocked network, quick CORS/DNS error) used to make
    // this whole screen resolve in well under a second — technically "done" but with no
    // real roads/buildings ever loaded, so you'd land on a half-built map without knowing
    // it. MIN_MS guarantees this screen is up long enough to read as an actual loading
    // screen (and gives a slow-but-working connection real time to land) even when the
    // underlying wait resolves instantly; MAX_MS is just the hard safety cap so a
    // genuinely stuck connection can't trap you here forever.
    const MIN_MS = 6000, MAX_MS = 20000;
    let done = false;
    await Promise.all([
      Promise.race([
        (async ()=>{
          await waitForAnchor();
          setP(55, 'Loading your neighborhood…');
          await waitForPriorityChunk();
          done = true;
        })(),
        new Promise(res=> setTimeout(res, MAX_MS))
      ]),
      new Promise(res=> setTimeout(res, MIN_MS))
    ]);
    clearTimeout(retryShowTimer); clearInterval(tipTimer); clearInterval(creepTimer);
    setP(100, done ? 'Ready!' : 'Still working on it…');
    await new Promise(res=> setTimeout(res, done ? 300 : 600));
    wrap.classList.add('hide');
  }
  function computePowerLevel(){
    return state.collection.slice().sort((a,b)=>b.cp-a.cp).slice(0,6).reduce((sum,t)=>sum+t.cp,0);
  }
  // Trainer level is separate from Power Level — it simply tracks progress (currently tied
  // to how many Totos you've caught) and is capped at PLAYER_MAX_LEVEL (100). It only ever
  // goes up: naturally as your collection grows, or instantly if admin sets it directly —
  // recomputing from collection size alone would otherwise stomp an admin-set level back
  // down the next time this runs.
  function computeCharLevel(){
    const natural = 1 + Math.floor(state.collection.length/2);
    return Math.min(PLAYER_MAX_LEVEL, Math.max(natural, state.charLevel||1));
  }
  function refreshHUD(){
    try { ensureItems(); syncStopRest(); } catch(e){}
    $('#hud-candy-chip').innerHTML = candyIconHtml(16)+' <span id="hud-candy">'+state.candy.toLocaleString()+'</span>';
    $('#hud-gems-chip').innerHTML = gemIconHtml(16)+' <span id="hud-gems">'+state.gems.toLocaleString()+'</span>';
    $('#profile-candy-label').innerHTML = candyIconHtml(15)+' Candy';
    $('#profile-gems-label').innerHTML = gemIconHtml(15)+' Gems';
    $('#profile-candy').textContent = state.candy.toLocaleString();
    $('#profile-gems').textContent = state.gems.toLocaleString();
    $('#profile-count').textContent = state.collection.length;
    state.powerLevel = computePowerLevel();
    state.charLevel = computeCharLevel();
    checkCosmeticUnlocks();
    $('#profile-power').textContent = state.powerLevel.toLocaleString();
    $('#profile-charlevel').textContent = state.charLevel;
    $('#hud-level').textContent = 'Lv '+state.charLevel;
    updateLeaderboard();
  }
  // ---------------- ONLINE: shared leaderboard + real-money store ----------------
  // The game's own small online service (a Supabase database) holds the leaderboard and
  // records Stripe payments. Each phone's trainer gets a random id plus a secret only that
  // phone knows; the server only accepts scores and hands out purchases for the right pair.
  // With these left blank the game simply plays offline: Ranks shows just you, and the
  // store can't sell anything.
  const TQ_ONLINE = {
    url: 'https://bawabhjturevmftfulez.supabase.co',            // Supabase project URL
    anonKey: 'sb_publishable_27UP6Q4MTcfCibEx-xduyA__nUpUgbc',  // public key (safe in the page — every write is checked server-side)
    payLinks: {         // Stripe Payment Links, one per store pack
      'candy:100':  'https://buy.stripe.com/8x27sL04r2ky7zw9y9bo400',
      'candy:500':  'https://buy.stripe.com/3cI4gz4kH8IWcTQ9y9bo401',
      'candy:1000': 'https://buy.stripe.com/8x27sLg3p4sG3jgcKlbo402',
      'candy:1500': 'https://buy.stripe.com/00w5kDcRd7ES8DAcKlbo403',
      'candy:2500': 'https://buy.stripe.com/28EfZh4kH0cq3jg5hTbo404',
      'gems:50':    'https://buy.stripe.com/00wbJ13gD0cqf1YdOpbo405',
      'gems:150':   'https://buy.stripe.com/5kQeVd04r6AOdXU8u5bo406',
      'gems:350':   'https://buy.stripe.com/00wbJ16sP7ES1b85hTbo407',
      'gems:800':   'https://buy.stripe.com/9B65kD5oLgbo074h0Bbo408'
    }
  };
  try { if (window.__TQ_ONLINE_TEST) Object.assign(TQ_ONLINE, window.__TQ_ONLINE_TEST); } catch(e){}
  const onlineOn = ()=> !!(TQ_ONLINE.url && TQ_ONLINE.anonKey);
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=> ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
  const paymentsOn = ()=> onlineOn() && Object.values(TQ_ONLINE.payLinks||{}).some(Boolean);
  async function sb(path, opts){
    opts = opts || {};
    const r = await fetch(TQ_ONLINE.url.replace(/\/$/,'') + '/rest/v1/' + path, Object.assign({}, opts, {
      headers: Object.assign({ apikey:TQ_ONLINE.anonKey, Authorization:'Bearer '+TQ_ONLINE.anonKey, 'Content-Type':'application/json' }, opts.headers || {}) }));
    if (!r.ok) throw new Error('online service said '+r.status);
    return r;
  }
  const sbRpc = (fn, args)=> sb('rpc/'+fn, { method:'POST', body: JSON.stringify(args) }).then(r=> r.json());
  function newPlayerSecret(){ const b = new Uint8Array(24); crypto.getRandomValues(b); return Array.from(b, x=> x.toString(16).padStart(2,'0')).join(''); }
  function newUuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6]&15)|64; b[8] = (b[8]&63)|128;
    const h = Array.from(b, x=> x.toString(16).padStart(2,'0')).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function ensurePlayerId(){ if (!state.playerId || !state.playerSecret){ state.playerId = newUuid(); state.playerSecret = newPlayerSecret(); markDirty(); } }
  let onlineReady = null;            // promise: this trainer is registered with the online service
  function onlineRegister(){
    if (!onlineOn() || !state.loggedIn) return Promise.resolve(false);
    ensurePlayerId();
    if (!onlineReady || onlineReady.forId !== state.playerId){
      const pr = sbRpc('register_player', { p_id: state.playerId, p_secret: state.playerSecret }).then(ok=> !!ok, ()=>{ onlineReady = null; return false; });
      pr.forId = state.playerId; onlineReady = pr;
    }
    return onlineReady;
  }
  const lbLast = { at:0, sig:'', timer:null };
  async function submitScoreOnline(force){
    if (!onlineOn() || !state.loggedIn || underAge()) return;
    const sig = [state.username, state.avatar, state.powerLevel, state.charLevel, state.collection.length].join('|');
    if (!force && sig === lbLast.sig) return;
    if (!force && Date.now() - lbLast.at < 15000){ clearTimeout(lbLast.timer); lbLast.timer = setTimeout(()=> submitScoreOnline(), 15500); return; }
    lbLast.at = Date.now(); lbLast.sig = sig;
    try {
      if (!(await onlineRegister())) { lbLast.sig = ''; return; }
      await sbRpc('submit_score', { p_id:state.playerId, p_secret:state.playerSecret, p_name:String(state.username||'Trainer').slice(0,24),
        p_avatar: state.avatar==='male' ? 'male' : 'female', p_power: Math.max(0, Math.round(state.powerLevel||0)),
        p_level: Math.max(1, Math.min(100, state.charLevel||1)), p_totos: state.collection.length });
    } catch(e){ lbLast.sig = ''; console.warn('leaderboard update failed', e); }
  }
  // Anything bought for this trainer (Stripe -> webhook -> database) that the game hasn't
  // handed over yet: add it, save straight away, say thanks.
  let claiming = false;
  async function claimPurchases(){
    if (!onlineOn() || !state.loggedIn || claiming) return 0;
    claiming = true;
    try {
      if (!(await onlineRegister())) return 0;
      const rows = await sbRpc('claim_purchases', { p_id:state.playerId, p_secret:state.playerSecret });
      if (!Array.isArray(rows) || !rows.length) return 0;
      const sum = {};
      rows.forEach(r=>{ if (r.kind==='candy' || r.kind==='gems'){ state[r.kind] = (state[r.kind]||0) + (r.amount|0); sum[r.kind] = (sum[r.kind]||0) + (r.amount|0); } });
      state.purchaseLog = (state.purchaseLog||[]).concat(rows.map(r=> ({ id:r.session_id, kind:r.kind, amount:r.amount, at:Date.now() }))).slice(-50);
      state.pendingCheckoutAt = 0;
      refreshHUD(); markDirty(); await saveNow(true);
      showToast('🎉 Thank you! '+Object.keys(sum).map(k=> '+'+sum[k].toLocaleString()+' '+(k==='candy' ? 'candy' : 'gems')).join(' and ')+' added');
      if (Sound.playCatch) Sound.playCatch();
      if ($('#store-modal').classList.contains('active')) renderStore();
      return rows.length;
    } catch(e){ console.warn('could not collect purchases', e); return 0; }
    finally { claiming = false; }
  }
  // after checkout the payment can take a few seconds to reach the game — keep looking
  let purchaseWatch = null;
  function watchForPurchase(seconds){
    if (!onlineOn()) return;
    clearTimeout(purchaseWatch);
    const until = Date.now() + seconds*1000;
    const tick = async ()=>{ const got = await claimPurchases(); if (!got && Date.now() < until) purchaseWatch = setTimeout(tick, 3000); };
    tick();
  }
  const checkoutRecent = ()=> !!state.pendingCheckoutAt && Date.now() - state.pendingCheckoutAt < 3600*1000;
  document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState === 'visible' && state.loggedIn) watchForPurchase(checkoutRecent() ? 90 : 1); });

  async function updateLeaderboard(){
    if (!state.loggedIn) return;
    if (onlineOn()){ submitScoreOnline(); return; }
    const entry = { email: state.email, username: state.username, avatar: state.avatar, powerLevel: state.powerLevel };
    if (githubLbConfigured){
      try { await githubLbWrite(board=>{ board[state.email] = entry; }); return; }
      catch(e){ console.warn('github leaderboard update failed', e); }
    }
    if (!hasCloudStorage) return;
    try {
      const cur = await window.storage.get('totoquest-leaderboard', true);
      let board = {};
      if (cur && cur.value){ try { board = JSON.parse(cur.value); } catch(e){ board={}; } }
      board[state.email] = entry;
      await window.storage.set('totoquest-leaderboard', JSON.stringify(board), true);
    } catch(e){ console.warn('leaderboard update failed', e); }
  }
  function leaderboardRowHtml(r, rank, isMe){
    const medal = rank===1 ? '🥇' : rank===2 ? '🥈' : rank===3 ? '🥉' : '#'+rank;
    return '<div class="lb-row'+(isMe ? ' me' : '')+'"><div class="lb-rank">'+medal+'</div>'
      + '<div class="lb-av">'+playerAvatarMarkup(r.avatar, true)+'</div>'
      + '<div class="lb-info"><div class="lb-name">'+escapeHtml(r.name||'Trainer')+(isMe ? ' <span>(you)</span>' : '')+'</div>'
      + '<div class="lb-sub">Lv '+(r.level||1)+' · '+(r.totos||0)+' Totos</div></div>'
      + '<div class="lb-power">'+Number(r.power||0).toLocaleString()+'</div></div>';
  }
  async function loadLeaderboard(){
    const list = $('#leaderboard-list');
    list.innerHTML = '<p style="color:#999; font-weight:700; font-size:12.5px;">Loading…</p>';
    let rows = [];
    if (onlineOn()){
      try {
        await submitScoreOnline(true);
        rows = await sb('leaderboard?select=player_id,name,avatar,power,level,totos&order=power.desc,updated_at.asc&limit=100').then(r=> r.json());
        const meIdx = rows.findIndex(r=> r.player_id === state.playerId);
        let html = rows.length ? rows.map((r,i)=> leaderboardRowHtml(r, i+1, i===meIdx)).join('') : '<p style="color:#999; font-weight:700; font-size:12.5px;">No trainers on the board yet — you\'re first!</p>';
        if (meIdx < 0 && state.playerId){
          let myRank = null;
          try {
            const r = await sb('leaderboard?select=player_id&power=gt.'+Math.max(0, Math.round(state.powerLevel||0)), { method:'HEAD', headers:{ Prefer:'count=exact' } });
            const n = parseInt(String(r.headers.get('content-range')||'').split('/')[1], 10);
            if (isFinite(n)) myRank = n + 1;
          } catch(e){}
          html += '<div class="lb-gap">⋯</div>' + leaderboardRowHtml({ name:state.username, avatar:state.avatar, power:state.powerLevel, level:state.charLevel, totos:state.collection.length }, myRank || '—', true);
        }
        list.innerHTML = html;
      } catch(e){
        console.warn('leaderboard load failed', e);
        list.innerHTML = '<p style="color:#999; font-weight:700; font-size:12.5px;">Couldn\'t reach the leaderboard — check your connection and try again.</p>';
      }
      return;
    }
    if (githubLbConfigured){
      try {
        const { board } = await githubLbRead();
        rows = board ? Object.values(board) : [];
      } catch(e){ console.warn('github leaderboard load failed', e); list.innerHTML = '<p style="color:#999; font-weight:700; font-size:12.5px;">Could not reach the leaderboard file on GitHub.</p>'; return; }
    } else if (hasCloudStorage){
      try {
        const res = await window.storage.get('totoquest-leaderboard', true);
        let board = {};
        if (res && res.value){ try { board = JSON.parse(res.value); } catch(e){} }
        rows = Object.values(board);
      } catch(e){ list.innerHTML = '<p style="color:#999; font-weight:700; font-size:12.5px;">Could not load the leaderboard right now.</p>'; return; }
    } else {
      list.innerHTML = '<p style="color:#999; font-weight:700; font-size:12.5px;">The online leaderboard is coming soon. Your power: <b>'+(state.powerLevel||0).toLocaleString()+'</b></p>';
      return;
    }
    rows.sort((a,b)=>b.powerLevel-a.powerLevel);
    if (!rows.length){ list.innerHTML = '<p style="color:#999; font-weight:700; font-size:12.5px;">No trainers on the board yet.</p>'; return; }
    list.innerHTML = rows.map((r,i)=>{
      const isMe = r.email===state.email;
      const av = playerAvatarMarkup(r.avatar, true);
      return '<div class="toto-card" style="display:flex; align-items:center; gap:10px; text-align:left; margin-bottom:8px;'+(isMe?' border:2px solid #ff8a3d;':'')+'">'+
        '<div style="font-weight:800; width:22px;">'+(i+1)+'</div>'+
        '<div style="width:22px; height:26px; overflow:hidden;">'+av+'</div>'+
        '<div style="flex:1;"><div class="nm" style="font-size:13px;">'+r.username+(isMe?' (you)':'')+'</div></div>'+
        '<div style="font-weight:800; color:#ff8a3d;">'+r.powerLevel.toLocaleString()+'</div>'+
      '</div>';
    }).join('');
  }

  // ---------------- GEO / WORLD / CAMERA ----------------
  let watchId = null, simulateMode = false, lastMoveTs = Date.now(), idleCheckTimer = null;
  state.cameraRotate = 0; state.worldOffset = {x:0,y:0}; state.playerWorldPos = {x:WORLD_CENTER, y:WORLD_CENTER};
  state.cameraZoom = 1; state.cameraTilt = TILT_MAX * (1-ZOOM_MIN)/(ZOOM_MAX-ZOOM_MIN);
  // viewOrbit is the ONLY thing that turns the camera now — a plain one-finger
  // left/right drag that orbits the camera all the way around your character, Pokémon-GO
  // style, with no phone-compass/device-orientation sensor involved at all. It has no
  // "snap back" — wherever you leave it is where the camera stays until you drag again.
  state.viewOrbit = 0;

  function metersDelta(lat0, lon0, lat1, lon1){
    const mPerDegLat = 110540, mPerDegLon = 111320 * Math.cos(lat0*Math.PI/180);
    return { east:(lon1-lon0)*mPerDegLon, north:(lat1-lat0)*mPerDegLat };
  }
  function applyWorldTransform(){
    // These camera fields are only ever set once at script load, on the *original* state
    // object — but logging in / registering replaces state.geo state.avatar etc with a
    // freshly loaded profile, and doRegister in particular swaps in a brand-new state
    // object entirely. Defaulting here means the camera always has something sane to
    // render even before enterGame() has had a chance to re-seed it, instead of throwing
    // and silently halting the whole render loop (which is what used to happen — the map
    // would look "stuck"/blank right after a fresh signup).
    if (typeof state.cameraTilt !== 'number') state.cameraTilt = TILT_MAX * (1-ZOOM_MIN)/(ZOOM_MAX-ZOOM_MIN);
    if (typeof state.cameraZoom !== 'number') state.cameraZoom = 1;
    if (typeof state.viewOrbit !== 'number') state.viewOrbit = 0;
    // World rotation is driven ONLY by your one-finger left/right drag (viewOrbit) — a
    // full Pokémon-GO-style camera orbit all the way around your character, never by a
    // phone compass/device-orientation sensor.
    state.cameraRotate = ((state.viewOrbit % 360) + 360) % 360;
    if (!state.playerWorldPos) state.playerWorldPos = {x:WORLD_CENTER, y:WORLD_CENTER};
    const o = state.worldOffset || {x:0,y:0};
    // Tilt lives on the outermost wrapper only, so it always tilts the camera toward
    // whatever you're currently facing — panning/rotating underneath never fights with it.
    $('#world-tilt').style.transform = 'rotateX('+state.cameraTilt.toFixed(1)+'deg)';
    // Panning keeps your CURRENT real position centered on screen.
    $('#world-pan').style.transform =
      'translate(calc(-50% - '+o.x.toFixed(1)+'px), calc(-50% + '+o.y.toFixed(1)+'px))';
    // Rotate/zoom pivot around your current position too (set as the transform-origin
    // dynamically) rather than the map's fixed starting point — otherwise, once you'd
    // walked away from where you started, turning the camera would swing the world
    // around that distant original spot and make you appear to jump to a different road.
    const p = state.playerWorldPos;
    $('#world').style.transformOrigin = p.x.toFixed(1)+'px '+p.y.toFixed(1)+'px';
    $('#world').style.transform = 'rotate('+state.cameraRotate+'deg) scale('+state.cameraZoom.toFixed(2)+')';
    // Every Toto/gym/tree marker counter-rotates against this so they always stay upright
    // and face you, no matter which way the camera is currently turned.
    $('#world').style.setProperty('--rot', state.cameraRotate+'deg');
    // your trainer is part of the scene: zoom out and she gets smaller with everything else
    const z = state.cameraZoom, pz = z < 1 ? z : 1 + (z-1)*0.35;
    const pin = $('.player-pin'); if (pin) pin.style.setProperty('--pz', pz.toFixed(3));
    updatePlayerFacing();
  }
  // Your character herself never moves or slides on screen when you drag to rotate —
  // .player-pin sits outside #world entirely (see the HTML), so turning the camera only
  // ever spins the map underneath her. What SHOULD change as you orbit the camera around
  // her is which side of her you're looking at, same as walking in a circle around a real
  // person standing still: drag the camera about halfway around (past 90°) and you're now
  // facing her, drag it the rest of the way (past 270°) and you're back behind her. We
  // only have a front and a back image (no left/right profile art), so the swap happens
  // in two clean halves of the orbit rather than a smooth turn — still gets you "see the
  // front and the back" at the 180°-apart points, just not the angles in between.
  let _facing = { gender:null, front:null };
  function updatePlayerFacing(){
    const holder = document.getElementById('player-avatar');
    const img = holder && holder.querySelector('img');
    if (!img) return;
    const g = state.avatar==='male' ? 'male' : 'female';
    const orbit = ((state.viewOrbit||0) % 360 + 360) % 360;
    const showFront = orbit > 90 && orbit < 270;
    if (_facing.gender !== g || _facing.front !== showFront){
      img.src = showFront ? AVATAR_IMG[g].frontSm : AVATAR_IMG[g].backSm;
      img.style.transform = '';
      _facing.gender = g; _facing.front = showFront;
    }
  }
  // Plain-language notes on the last thing that happened with each network call, shown
  // in the on-screen Map Status panel — since we can't see the browser console on
  // someone's phone, this is how we actually find out what's failing and why.
  const diag = {
    lastRegionAttempt: null, lastRegionResult: null, lastRegionError: null,
    lastWeatherAttempt: null, lastWeatherResult: null, lastWeatherError: null,
  };
  function describeFetchError(e){
    if (!e) return 'unknown error';
    if (e.name === 'AbortError') return 'timed out waiting for a response';
    if (e instanceof TypeError) return 'network request blocked or failed before reaching the server (TypeError: '+e.message+') — often a connectivity, CORS, or DNS problem rather than the server itself';
    if (e.errors && e.errors.length) return e.errors.map(describeFetchError).join(' | ');
    return (e.message || String(e));
  }
  let anchorReadyResolvers = [];
  function waitForAnchor(){
    if (state.geoAnchor) return Promise.resolve();
    return new Promise(res=> anchorReadyResolvers.push(res));
  }
  function setAnchorAndBuild(lat, lon){
    state.geo = {lat, lon}; state.geoAnchor = {lat, lon}; state.worldOffset = {x:0,y:0};
    state.playerWorldPos = {x:WORLD_CENTER, y:WORLD_CENTER};
    try {
      applyWorldTransform();
      buildWorld();
      updateDayNight();
      fetchWeather(true);
    } finally {
      anchorReadyResolvers.splice(0).forEach(r=>r());
    }
  }
  function updateGpsStatusText(viaSim){
    $('#gps-status').textContent = (viaSim?'SIMULATED · ':'GPS: ')+state.geo.lat.toFixed(5)+', '+state.geo.lon.toFixed(5);
  }
  // A raw GPS fix goes through here before it's allowed to move the world. Phone GPS
  // occasionally throws out one wildly-wrong low-accuracy reading (common right after a
  // cold start, or near tall buildings) before settling — without filtering, that single
  // bad fix would recenter the whole chunk system on the wrong spot for a moment, which is
  // what made roads/buildings load in and then immediately get unloaded again. A fix is
  // trusted immediately if it's reasonably precise or the jump is small; a big jump paired
  // with poor accuracy is held back — unless several in a row get rejected, in which case
  // we assume it's real (you may have actually moved fast, or restarted somewhere new).
  let rejectedFixStreak = 0;
  function isPlausibleFix(lat, lon, accuracy){
    if (!state.geo) return true;
    const d = metersDelta(state.geo.lat, state.geo.lon, lat, lon);
    const dist = Math.hypot(d.east, d.north);
    const elapsedS = Math.max(0.5, (Date.now() - (state.lastFixTs||Date.now()))/1000);
    const plausibleMax = Math.max(25, elapsedS * 12); // ~43 km/h ceiling, plus a jitter floor
    const acc = (typeof accuracy === 'number') ? accuracy : 30;
    if (dist <= plausibleMax) return true;
    if (acc <= 35) return true; // trust a big jump if the fix itself claims to be precise
    if (rejectedFixStreak >= 2) return true; // don't get stuck forever on a stale position
    return false;
  }
  function handleGpsFix(lat, lon, accuracy, viaSim){
    if (!viaSim && state.geo && !isPlausibleFix(lat, lon, accuracy)){
      rejectedFixStreak++;
      return;
    }
    rejectedFixStreak = 0;
    state.lastFixTs = Date.now();
    state.lastFixAccuracy = accuracy;
    onPositionUpdate(lat, lon, viaSim);
  }
  function onPositionUpdate(lat, lon, viaSim){
    if (!state.geoAnchor){ setAnchorAndBuild(lat, lon); updateGpsStatusText(viaSim); return; }
    const prevGeo = state.geo;
    const step = prevGeo ? metersDelta(prevGeo.lat, prevGeo.lon, lat, lon) : {east:0,north:0};
    const stepDist = Math.hypot(step.east, step.north);
    state.geo = {lat, lon};
    // The status text always reflects the latest known fix, even if you're standing
    // still — only the expensive camera/world updates below are skipped when you
    // haven't actually moved.
    updateGpsStatusText(viaSim);
    if (!viaSim && stepDist < 1.0) return;
    lastMoveTs = Date.now();
    $('#player-avatar').classList.add('walking');

    // The anchor never resets — the world just keeps extending as you walk, like a real map —
    // EXCEPT once you've wandered far enough that the fixed-size map canvas would start
    // clipping things at its edge, at which point we quietly re-anchor on your current spot
    // (same trick Pokemon-GO-style games use) so roads never just stop rendering because
    // you've walked off the edge of the coordinate space.
    const fromAnchor = metersDelta(state.geoAnchor.lat, state.geoAnchor.lon, lat, lon);
    const proposedX = WORLD_CENTER + fromAnchor.east*GPS_SCALE, proposedY = WORLD_CENTER - fromAnchor.north*GPS_SCALE;
    const distFromCenter = Math.hypot(proposedX - WORLD_CENTER, proposedY - WORLD_CENTER);
    if (distFromCenter > WORLD_CENTER * 0.82){
      setAnchorAndBuild(lat, lon);
      showToast('🌍 Recentering the map…');
      return;
    }
    state.worldOffset = { x: fromAnchor.east*GPS_SCALE, y: fromAnchor.north*GPS_SCALE };
    state.playerWorldPos = { x: proposedX, y: proposedY };
    applyWorldTransform();
    refreshNodeDistances();
    ensureChunksLoaded();
  }
  let heartbeatTimer = null, retryTimer = null, gotRealFix = false;
  function startWatch(){
    if (!navigator.geolocation) return;
    try {
      if (watchId!==null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        pos => { gotRealFix = true; handleGpsFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false); },
        err => {
          if (gotRealFix) return; // we already have a fix; don't overwrite a good status with a transient error
          const msgs = {1:'Location permission blocked (this in-chat preview may not allow it — try the downloaded app on your phone).', 2:'Position unavailable right now.', 3:'GPS is taking too long to respond.'};
          $('#gps-status').textContent = 'Using default area · ' + (msgs[err.code] || err.message) + ' Try 🕹️ to test walking.';
        },
        {enableHighAccuracy:true, maximumAge:0, timeout:15000}
      );
    } catch(e){
      console.warn('watchPosition threw', e);
      $('#gps-status').textContent = 'Using default area · location tracking blocked here. Try 🕹️ to test walking, or use the downloaded app on your phone.';
    }
    // Backup heartbeat: some mobile browsers silently stop delivering watchPosition updates
    // (screen lock, backgrounding, etc). This redundant poll keeps the camera tracking your
    // real position even if the primary watch stalls, without needing you to tap anything.
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(()=>{
      if (!navigator.geolocation || simulateMode) return;
      try {
        navigator.geolocation.getCurrentPosition(
          pos => { gotRealFix = true; handleGpsFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false); },
          ()=>{}, {enableHighAccuracy:true, maximumAge:3000, timeout:8000}
        );
      } catch(e){}
    }, 6000);
  }
  if (!idleCheckTimer){ idleCheckTimer = setInterval(()=>{ if (Date.now()-lastMoveTs>1500) $('#player-avatar').classList.remove('walking'); }, 500); }

  function locate(){
    if (!navigator.geolocation){ $('#gps-status').textContent='Using default area · GPS unavailable on this device/browser. Try 🕹️ to test walking.'; return; }
    if (!gotRealFix) $('#gps-status').textContent = 'Using default area · looking for real GPS…';
    try {
      navigator.geolocation.getCurrentPosition(pos=>{
        gotRealFix = true;
        if (!state.geoAnchor) setAnchorAndBuild(pos.coords.latitude, pos.coords.longitude);
        else onPositionUpdate(pos.coords.latitude, pos.coords.longitude, false);
        updateGpsStatusText(false);
        startWatch();
      }, err=>{
        if (gotRealFix) return;
        const msgs = {1:'Location permission was blocked. This in-chat preview may not be allowed to use GPS — the downloaded Android app should work once installed on your phone.', 2:'Position unavailable.', 3:'GPS timed out.'};
        $('#gps-status').textContent = 'Using default area · ' + (msgs[err.code] || err.message) + ' Try 🕹️ to test walking.';
      }, {enableHighAccuracy:true, timeout:12000});
    } catch(e){
      console.warn('getCurrentPosition threw', e);
      $('#gps-status').textContent = 'Using default area · location is blocked in this preview. Try 🕹️ to test walking, or use the downloaded app on your phone.';
    }
  }
  $('#btn-locate').onclick = locate;
  // Auto-retry persistently once the game starts, front-loaded faster at first (a cold GPS
  // radio commonly needs a couple of quick tries before it locks on) — so you never HAVE
  // to tap the locate button yourself; it's just there as a manual re-center option.
  let locateAttempts = 0;
  function startLocateRetries(){
    locateAttempts = 0;
    if (retryTimer) clearInterval(retryTimer);
    // Also kick the heartbeat/watch off immediately in parallel — extra independent
    // attempts at getting a fix rather than relying on one single retry loop.
    startWatch();
    const schedule = [3000,3000,4000,5000,6000,8000,10000];
    function next(){
      if (gotRealFix || simulateMode) return;
      const delay = schedule[Math.min(locateAttempts, schedule.length-1)];
      retryTimer = setTimeout(()=>{
        locateAttempts++;
        if (gotRealFix || simulateMode) return;
        locate();
        next();
      }, delay);
    }
    next();
  }
  // Re-check location whenever the app regains focus — covers being backgrounded,
  // screen-locked, or switched away from and back, without needing the locate tap.
  if (!window.__totoVisibilityRelocate){
    window.__totoVisibilityRelocate = true;
    document.addEventListener('visibilitychange', ()=>{
      if (document.visibilityState==='visible' && state.loggedIn && !simulateMode) startWatch();
    });
    window.addEventListener('focus', ()=>{
      if (state.loggedIn && !simulateMode) startWatch();
    });
  }

  // ---------------- DAY / NIGHT ----------------
  // Computed locally from GPS lat/lon + the device clock (a standard sunrise/sunset
  // approximation) rather than fetched from anywhere — it's cheap, works offline, and
  // updates the moment a real GPS fix arrives instead of waiting on a network round trip.
  function sunTimesUTC(lat, lon, date){
    // Returns {riseUTC, setUTC} as decimal UTC hours for the given calendar date at lat/lon.
    // Standard NOAA-style approximation — plenty accurate for "is it light out right now".
    const rad = Math.PI/180, deg = 180/Math.PI;
    const start = Date.UTC(date.getUTCFullYear(),0,1);
    const dayOfYear = Math.floor((Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()) - start)/86400000) + 1;
    const zenith = 90.833;
    function calc(isRise){
      const lngHour = lon/15;
      const t = dayOfYear + ((isRise?6:18) - lngHour)/24;
      const M = (0.9856*t) - 3.289;
      let L = M + (1.916*Math.sin(M*rad)) + (0.020*Math.sin(2*M*rad)) + 282.634;
      L = ((L%360)+360)%360;
      let RA = deg*Math.atan(0.91764*Math.tan(L*rad));
      RA = ((RA%360)+360)%360;
      const Lquad = Math.floor(L/90)*90, RAquad = Math.floor(RA/90)*90;
      RA = (RA + (Lquad-RAquad))/15;
      const sinDec = 0.39782*Math.sin(L*rad), cosDec = Math.cos(Math.asin(sinDec));
      const cosH = (Math.cos(zenith*rad) - (sinDec*Math.sin(lat*rad))) / (cosDec*Math.cos(lat*rad));
      if (cosH > 1 || cosH < -1) return null; // polar day/night — no real sunrise/set
      let H = isRise ? 360 - deg*Math.acos(cosH) : deg*Math.acos(cosH);
      H = H/15;
      let T = H + RA - (0.06571*t) - 6.622;
      let UT = T - lngHour;
      UT = ((UT%24)+24)%24;
      return UT;
    }
    return { riseUTC: calc(true), setUTC: calc(false) };
  }
  function updateDayNight(){
    const geo = state.geo || state.geoAnchor;
    const mapView = $('#map-view');
    const icon = $('#daynight-icon'), label = $('#daynight-label');
    if (!geo){ return; }
    const now = new Date();
    const nowUTCh = now.getUTCHours() + now.getUTCMinutes()/60;
    const { riseUTC, setUTC } = sunTimesUTC(geo.lat, geo.lon, now);
    let isDay;
    if (riseUTC===null || setUTC===null){
      // Polar day/night edge case — fall back to a plain local-clock guess.
      const localH = now.getHours() + now.getMinutes()/60;
      isDay = localH >= 7 && localH < 19;
    } else if (riseUTC < setUTC){
      isDay = nowUTCh >= riseUTC && nowUTCh < setUTC;
    } else {
      isDay = nowUTCh >= riseUTC || nowUTCh < setUTC;
    }
    mapView.classList.toggle('is-daytime', isDay);
    icon.textContent = isDay ? '☀️' : '🌙';
    label.textContent = isDay ? 'Daytime' : 'Night';
  }

  // ---------------- WEATHER ----------------
  // Open-Meteo — free, no API key, CORS-friendly. Re-checked every 10 minutes and whenever
  // you've moved far enough that the old reading no longer applies to where you are.
  const WEATHER_REFRESH_MS = 10*60*1000;
  let lastWeatherFetch = 0, lastWeatherGeo = null, lastHazardCode = null;
  const WEATHER_CODES = {
    0:{icon:'☀️', label:'Clear', kind:'clear'}, 1:{icon:'🌤️', label:'Mostly clear', kind:'clear'},
    2:{icon:'⛅', label:'Partly cloudy', kind:'clouds'}, 3:{icon:'☁️', label:'Overcast', kind:'clouds'},
    45:{icon:'🌫️', label:'Fog', kind:'fog'}, 48:{icon:'🌫️', label:'Fog', kind:'fog'},
    51:{icon:'🌦️', label:'Light drizzle', kind:'rain'}, 53:{icon:'🌦️', label:'Drizzle', kind:'rain'}, 55:{icon:'🌦️', label:'Heavy drizzle', kind:'rain'},
    61:{icon:'🌧️', label:'Light rain', kind:'rain'}, 63:{icon:'🌧️', label:'Rain', kind:'rain'}, 65:{icon:'🌧️', label:'Heavy rain', kind:'rain', hazard:'Heavy rain in your area — watch for flooding and slick roads.'},
    66:{icon:'🌧️', label:'Freezing rain', kind:'rain', hazard:'Freezing rain nearby — surfaces may be icy.'}, 67:{icon:'🌧️', label:'Freezing rain', kind:'rain', hazard:'Freezing rain nearby — surfaces may be icy.'},
    71:{icon:'🌨️', label:'Light snow', kind:'snow'}, 73:{icon:'❄️', label:'Snow', kind:'snow'}, 75:{icon:'❄️', label:'Heavy snow', kind:'snow', hazard:'Heavy snow in your area — visibility and footing may be poor.'},
    77:{icon:'❄️', label:'Snow grains', kind:'snow'},
    80:{icon:'🌦️', label:'Rain showers', kind:'rain'}, 81:{icon:'🌧️', label:'Rain showers', kind:'rain'}, 82:{icon:'🌧️', label:'Violent showers', kind:'rain', hazard:'Violent rain showers nearby — consider heading indoors.'},
    85:{icon:'🌨️', label:'Snow showers', kind:'snow'}, 86:{icon:'🌨️', label:'Heavy snow showers', kind:'snow', hazard:'Heavy snow showers nearby — visibility and footing may be poor.'},
    95:{icon:'⛈️', label:'Thunderstorm', kind:'storm', hazard:'Thunderstorms in your area — get to safe shelter.'},
    96:{icon:'⛈️', label:'Thunderstorm + hail', kind:'storm', hazard:'Thunderstorms with hail nearby — get to safe shelter.'},
    99:{icon:'⛈️', label:'Severe thunderstorm', kind:'storm', hazard:'Severe thunderstorm in your area — get to safe shelter immediately.'}
  };
  function renderWeatherFx(kind){
    const fx = $('#weather-fx');
    if (fx.dataset.kind === kind) return; // already showing this — don't rebuild every poll
    fx.dataset.kind = kind;
    fx.innerHTML = '';
    fx.classList.toggle('storm-flash', kind==='storm');
    if (kind==='rain' || kind==='storm'){
      const n = kind==='storm' ? 46 : 34;
      let html = '';
      for (let i=0;i<n;i++){
        const left = Math.random()*100, dur = (0.5+Math.random()*0.4).toFixed(2), delay = (Math.random()*2).toFixed(2);
        html += '<div class="w-drop" style="left:'+left.toFixed(1)+'%; animation-duration:'+dur+'s; animation-delay:-'+delay+'s;"></div>';
      }
      fx.innerHTML = html;
    } else if (kind==='snow'){
      let html = '';
      for (let i=0;i<40;i++){
        const left = Math.random()*100, size = (2+Math.random()*3).toFixed(1), dur=(4+Math.random()*3).toFixed(2), delay=(Math.random()*6).toFixed(2);
        html += '<div class="w-flake" style="left:'+left.toFixed(1)+'%; width:'+size+'px; height:'+size+'px; animation-duration:'+dur+'s; animation-delay:-'+delay+'s;"></div>';
      }
      fx.innerHTML = html;
    }
    // fog/clouds/clear get no particle layer — just the icon/label chip.
  }
  function showHazard(code, msg){
    if (lastHazardCode === code) return; // already showing/shown for this exact condition
    lastHazardCode = code;
    $('#hazard-title').textContent = 'Severe weather nearby';
    $('#hazard-sub').textContent = msg;
    $('#hazard-banner').classList.add('show');
  }
  $('#hazard-close').onclick = ()=> $('#hazard-banner').classList.remove('show');
  let weatherFetchInFlight = false;
  async function fetchWeather(force){
    const geo = state.geo || state.geoAnchor;
    if (!geo) return;
    if (weatherFetchInFlight) return; // a slow one is already out there — don't pile another on top of it
    const now = Date.now();
    if (!force && now-lastWeatherFetch < WEATHER_REFRESH_MS && lastWeatherGeo){
      const moved = Math.hypot(geo.lat-lastWeatherGeo.lat, geo.lon-lastWeatherGeo.lon);
      if (moved < 0.02) return; // ~2km — same weather, don't hammer the API
    }
    lastWeatherFetch = now; lastWeatherGeo = {lat:geo.lat, lon:geo.lon};
    weatherFetchInFlight = true;
    diag.lastWeatherAttempt = new Date().toLocaleTimeString();
    try {
      // rounded to ~1 km: plenty for the weather, and the exact spot never leaves the phone
      const url = 'https://api.open-meteo.com/v1/forecast?latitude='+geo.lat.toFixed(2)+'&longitude='+geo.lon.toFixed(2)+'&current=weather_code,wind_speed_10m&timezone=auto';
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 20000);
      const res = await fetch(url, {signal: ctrl.signal}).finally(()=> clearTimeout(timer));
      if (!res.ok){ diag.lastWeatherError = 'HTTP '+res.status; return; }
      const data = await res.json();
      diag.lastWeatherError = null; diag.lastWeatherResult = 'ok';
      const code = data.current && data.current.weather_code;
      const wind = data.current && data.current.wind_speed_10m;
      const info = WEATHER_CODES[code] || WEATHER_CODES[0];
      $('#weather-icon').textContent = info.icon;
      $('#weather-label').textContent = info.label;
      renderWeatherFx(info.kind);
      const windHazard = typeof wind==='number' && wind >= 60;
      if (info.hazard) showHazard(code, info.hazard);
      else if (windHazard) showHazard('wind'+Math.round(wind), 'High winds in your area ('+Math.round(wind)+' km/h) — be careful out there.');
      else lastHazardCode = null;
    } catch(e){ diag.lastWeatherError = describeFetchError(e); console.warn('weather fetch failed', e); }
    finally { weatherFetchInFlight = false; }
  }
  if (!window.__totoEnvTicker){
    window.__totoEnvTicker = true;
    setInterval(()=>{ if (state.loggedIn){ updateDayNight(); fetchWeather(false); } }, 60*1000);
  }

  // Simulated walking — lets you test movement/scrolling/proximity even where real GPS isn't reachable.
  $('#btn-simulate').onclick = ()=>{
    simulateMode = !simulateMode;
    $('#dpad').classList.toggle('show', simulateMode);
    if (simulateMode){
      try { if (watchId!==null) navigator.geolocation.clearWatch(watchId); } catch(e){}
      watchId=null;
      showToast('Test-walk mode on — use the arrows');
    } else { showToast('Test-walk mode off — resuming real GPS'); startWatch(); }
  };
  $$('#dpad button[data-dir]').forEach(btn=>{
    btn.onclick = ()=>{
      if (!state.geo) return;
      const stepM = 9; // meters per tap
      const dirs = { n:{east:0,north:stepM}, s:{east:0,north:-stepM}, e:{east:stepM,north:0}, w:{east:-stepM,north:0} };
      const d = dirs[btn.dataset.dir];
      const mPerDegLat = 110540, mPerDegLon = 111320*Math.cos(state.geo.lat*Math.PI/180);
      const newLat = state.geo.lat + d.north/mPerDegLat;
      const newLon = state.geo.lon + d.east/mPerDegLon;
      onPositionUpdate(newLat, newLon, true);
    };
  });

  // Camera zoom/tilt are the same gesture, Pokemon GO style: zooming in also lowers the
  // camera to ground level so you can see further down the road; zooming out returns to
  // the flat sky view. Rotation is a separate, single-finger left/right swipe.
  function setZoom(z){
    state.cameraZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const t = (state.cameraZoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
    state.cameraTilt = TILT_MAX * t;
    applyWorldTransform();
  }
  $('#btn-zoom-in').onclick = ()=> setZoom(state.cameraZoom + 0.15);
  $('#btn-zoom-out').onclick = ()=> setZoom(state.cameraZoom - 0.15);
  // Rotate buttons nudge the camera orbit by a fixed step — same viewOrbit the drag
  // gesture below drives, just without touching the screen.
  $('#btn-rotate-l').onclick = ()=>{ state.viewOrbit = (state.viewOrbit-20+360)%360; applyWorldTransform(); };
  $('#btn-rotate-r').onclick = ()=>{ state.viewOrbit = (state.viewOrbit+20+360)%360; applyWorldTransform(); };

  // One finger, dragged left or right, orbits the camera all the way around your
  // character — a full 360°, Pokémon-GO style — and it stays exactly where you leave it;
  // there is no phone-compass/device-orientation sensor involved anywhere in this game,
  // and no auto-return snapping the view back to center.
  // Two fingers = pinch out to zoom into ground level, pinch in to return to sky view.
  (function setupLookAround(){
    const mapView = $('#map-view');
    mapView.style.touchAction = 'none';
    const ROTATE_SENSITIVITY = 0.5; // degrees per pixel dragged horizontally
    const activePointers = new Map();
    let rotateDrag = null;
    let pinchState = null;

    function distanceBetween(pts){ return Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y); }

    mapView.addEventListener('pointerdown', (e)=>{
      if (e.target.closest('.toto-node, .gym-node, .map-controls, .dpad')) return;
      activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
      try { mapView.setPointerCapture(e.pointerId); } catch(err){}
      if (activePointers.size===1){
        rotateDrag = { startX:e.clientX, startOrbit: state.viewOrbit, pointerId:e.pointerId };
        pinchState = null;
      } else if (activePointers.size===2){
        rotateDrag = null;
        const pts = Array.from(activePointers.values());
        pinchState = { startDist: distanceBetween(pts), startZoom: state.cameraZoom };
      }
    });
    mapView.addEventListener('pointermove', (e)=>{
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if (activePointers.size>=2 && pinchState){
        const pts = Array.from(activePointers.values());
        const ratio = distanceBetween(pts) / pinchState.startDist;
        setZoom(pinchState.startZoom * ratio);
      } else if (rotateDrag && e.pointerId===rotateDrag.pointerId){
        const dx = e.clientX - rotateDrag.startX;
        let r = (rotateDrag.startOrbit + dx*ROTATE_SENSITIVITY) % 360;
        if (r < 0) r += 360;
        state.viewOrbit = r;
        applyWorldTransform();
      }
    });
    function releasePointer(e){
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) pinchState = null;
      if (rotateDrag && e.pointerId===rotateDrag.pointerId){ rotateDrag = null; }
      if (activePointers.size===1){
        const entry = Array.from(activePointers.entries())[0];
        rotateDrag = { startX: entry[1].x, startOrbit: state.viewOrbit, pointerId: entry[0] };
      }
    }
    mapView.addEventListener('pointerup', releasePointer);
    mapView.addEventListener('pointercancel', releasePointer);
    mapView.addEventListener('pointerleave', releasePointer);
  })();

  // ---------------- COORDINATE HELPERS ----------------
  function worldPosFromMeters(east, north){ return { x: WORLD_CENTER + east*GPS_SCALE, y: WORLD_CENTER - north*GPS_SCALE }; }
  function latLonFromMeters(east, north){
    const lat0 = state.geoAnchor.lat, lon0 = state.geoAnchor.lon;
    const lat = lat0 + north/110540;
    const lon = lon0 + east/(111320*Math.cos(lat0*Math.PI/180));
    return {lat, lon};
  }
  function centroidOfGeometry(geometry, project){
    let sx=0, sy=0;
    geometry.forEach(pt=>{ const p = project(pt.lat, pt.lon); sx+=p.x; sy+=p.y; });
    return { x: sx/geometry.length, y: sy/geometry.length };
  }
  function distanceMetersToWorldPoint(x, y){ return Math.hypot(x-state.playerWorldPos.x, y-state.playerWorldPos.y)/GPS_SCALE; }
  function refreshNodeDistances(){
    (state.wildTotos||[]).forEach(t=>{ if (t._distEl){ const d = distanceMetersToWorldPoint(t._x,t._y); t._distEl.textContent = Math.round(d)+'m'; t._distEl.classList.toggle('catchable', d <= WILD_RADIUS_M); } });
    (state.gyms||[]).forEach(g=>{ if (g._distEl) g._distEl.textContent = Math.round(distanceMetersToWorldPoint(g.x,g.y))+'m'; });
    const nearby = (state.wildTotos||[]).filter(t=> distanceMetersToWorldPoint(t._x,t._y) < 150).length;
    $('#hud-nearby').textContent = nearby;
  }

  const GYM_NAMES = ['Ashfall Gym','Frostpeak Gym','Thunder Gym','Bramble Gym','Cinderpeak Gym','Mossmere Gym','Stormvale Gym','Hollowreach Gym'];
  const MAX_WILD_TOTOS = 38, MAX_GYMS = 10; // raised from 24 now that the painted-art totos render as plain <img>s (cheaper than the animated multi-path SVGs) — see performance notes elsewhere in this file before raising further

  function appendTotoNode(t){
    const node = document.createElement('div'); node.className='toto-node';
    node.style.left=t._x+'px'; node.style.top=t._y+'px';
    node.innerHTML = '<div class="node-ring"></div><div class="node-shadow"></div><div class="node-spin"><div class="node-orbit"><div class="node-orbit-fix"><div class="bubble">'+spriteMarkup(t)+'</div></div></div><div class="cp-tag">PWR '+t.cp+'</div><div class="dist-tag">…m</div></div>';
    t._distEl = node.querySelector('.dist-tag');
    t._node = node;
    if (!t._expiresAt) t._expiresAt = Date.now() + WILD_LIFETIME_MS;
    node.onclick = ()=> tryStartEncounter(t);
    $('#toto-layer').appendChild(node);
  }
  const RESPAWN_DELAY_MS = 60*1000;          // a caught spot gets a new Toto a minute later
  const WILD_LIFETIME_MS = 3*60*1000;        // a wild Toto wanders off after 3 minutes …
  const WILD_REPLACE_DELAY_MS = 60*1000;     // … and a new one turns up in the same spot a minute after that
  const AMBIENT_SPAWN_INTERVAL_MS = 12*1000; // check fairly often, keeps the area from ever feeling empty
  const NEARBY_KEEP_MIN = 6, NEARBY_KEEP_MAX = 9; // aim to always have this many within easy walking reach
  const NEARBY_RADIUS_M = 200;
  const PRUNE_RADIUS_M = 450; // Totos further than this than are quietly removed to keep the map light
  function removeTotoFromMap(t){
    const idx = state.wildTotos.indexOf(t);
    if (idx>=0) state.wildTotos.splice(idx,1);
    if (t._node && t._node.parentNode) t._node.parentNode.removeChild(t._node);
  }
  function pruneFarTotos(){
    if (!state.playerWorldPos) return;
    state.wildTotos.slice().forEach(t=>{
      if (distanceMetersToWorldPoint(t._x, t._y) > PRUNE_RADIUS_M) removeTotoFromMap(t);
    });
  }
  function spawnWildTotoAt(x, y, chunkKey){
    if (state.wildTotos.length >= MAX_WILD_TOTOS) pruneFarTotos();
    if (state.wildTotos.length >= MAX_WILD_TOTOS) return;
    const t = makeToto(Math.random() < 0.05 ? 'legendary' : 'normal'); // 5% of wild spawns are legendary
    t._x = x; t._y = y; t._chunkKey = chunkKey;
    state.wildTotos.push(t);
    appendTotoNode(t);
    refreshNodeDistances();
    return t;
  }
  // Guarantees 3 wild Totos are standing right around the player the instant they log in,
  // instead of waiting on the wider chunk system (which scatters its 5-7-per-chunk spawns
  // anywhere across a 350m chunk, so the nearest one could easily start out well outside
  // the visible screen). Called once as soon as the world is built around a fresh GPS
  // anchor — close range (12-34m) so all 3 are on-screen and catchable straight away.
  function spawnStartingTotosNearPlayer(){
    if (!state.playerWorldPos) return;
    const n = 3;   // 2-3 right around you, all close enough to catch
    for (let i=0;i<n;i++){
      const ang = (Math.PI*2*i/n) + (Math.random()-0.5)*0.7;
      const distM = 12 + Math.random()*22;
      const px = state.playerWorldPos.x + Math.cos(ang)*distM*GPS_SCALE;
      const py = state.playerWorldPos.y + Math.sin(ang)*distM*GPS_SCALE;
      spawnWildTotoAt(px, py, null);
    }
  }
  // Despawns: every wild Toto leaves after its 3 minutes (not while you're catching it),
  // and a fresh one appears on that same spot a minute later.
  if (!window.__totoDespawnTimer){
    window.__totoDespawnTimer = setInterval(()=>{
      if (!state || !state.wildTotos || !state.wildTotos.length) return;
      const now = Date.now(); let gone = 0;
      state.wildTotos.slice().forEach(t=>{
        if (!t._expiresAt || t._expiresAt > now || t._hold || pendingCatch === t) return;
        const x = t._x, y = t._y, ck = t._chunkKey, anchor = state.geoAnchor;
        removeTotoFromMap(t); gone++;
        setTimeout(()=>{
          if (state.geoAnchor !== anchor || !state.playerWorldPos) return;
          if (distanceMetersToWorldPoint(x, y) > PRUNE_RADIUS_M) return;
          spawnWildTotoAt(x, y, ck);
        }, WILD_REPLACE_DELAY_MS);
      });
      if (gone) refreshNodeDistances();
    }, 2000);
  }
  if (!window.__totoAmbientSpawnTimer){
    window.__totoAmbientSpawnTimer = setInterval(()=>{
      if (!state.geoAnchor || !state.playerWorldPos) return;
      pruneFarTotos();
      // Keep 5-7 wild Totos within easy walking reach at all times — spawn more the
      // moment the count nearby drops below that, not on a fixed low-odds timer.
      const nearbyCount = state.wildTotos.filter(t=> distanceMetersToWorldPoint(t._x,t._y) < NEARBY_RADIUS_M).length;
      if (nearbyCount < NEARBY_KEEP_MAX && state.wildTotos.length < MAX_WILD_TOTOS){
        const ang = Math.random()*Math.PI*2;
        const distM = 40 + Math.random()*(NEARBY_RADIUS_M-40);
        const px = state.playerWorldPos.x + Math.cos(ang)*distM*GPS_SCALE;
        const py = state.playerWorldPos.y + Math.sin(ang)*distM*GPS_SCALE;
        spawnWildTotoAt(px, py, null);
      }
    }, AMBIENT_SPAWN_INTERVAL_MS);
  }
  // Terrain watchdog: ensureChunksLoaded() previously only ever got called again on a
  // real GPS movement update — so if the very first automatic fetch after entering the
  // game happened to fail (a cold connection, one bad round-trip, anything transient)
  // and GPS wasn't producing fresh fixes often enough, NOTHING ever prompted a retry and
  // the map just stayed empty forever, even though the exact same call made manually
  // (the "Retry Map Data" button) worked fine. This just keeps trying on its own — it's
  // a no-op for anything already loaded (see ensureRegionTerrain's cache/dedup), so it's
  // safe to call this often.
  if (!window.__totoTerrainWatchdog){
    window.__totoTerrainWatchdog = setInterval(()=>{
      if (!state.geoAnchor) return;
      ensureChunksLoaded();
    }, 15000);
  }
  function appendGymNode(gym){
    const ring = document.createElement('div'); ring.className='gym-radius';
    const ringPx = GYM_RADIUS_M*2*GPS_SCALE;
    ring.style.width=ringPx+'px'; ring.style.height=ringPx+'px'; ring.style.left=gym.x+'px'; ring.style.top=(gym.y-14)+'px';
    $('#gym-layer').appendChild(ring);
    gym._ringEl = ring;
    const node = document.createElement('div'); node.className='gym-node';
    node.style.left=gym.x+'px'; node.style.top=gym.y+'px';
    node.innerHTML = '<div class="node-ring"></div><div class="node-shadow" style="width:34px; height:11px;"></div><div class="node-spin"><div class="node-orbit"><div class="node-orbit-fix">'+pumpkinTowerHtml(spriteMarkup(gym.boss))+'</div></div><div class="gym-label">'+gym.name+'</div><div class="dist-tag">…m</div></div>';
    gym._distEl = node.querySelector('.dist-tag');
    gym._node = node;
    node.onclick = ()=> tryStartGymRaid(gym);
    $('#gym-layer').appendChild(node);
  }
  function refreshGymNode(gym){
    if (gym._ringEl){ gym._ringEl.style.left = gym.x+'px'; gym._ringEl.style.top = (gym.y-14)+'px'; }
    if (gym._node){
      gym._node.style.left = gym.x+'px'; gym._node.style.top = gym.y+'px';
    }
  }

  // ---------------- CHUNKED, NEVER-ENDING WORLD ----------------
  // The anchor is set once and never resets. As you walk, we track which ~350m chunk
  // you're in and quietly load real roads/buildings/parks/water + spawns for that chunk
  // and its neighbors the first time you get near them — chunks already loaded are never
  // cleared or redrawn, so you can keep walking indefinitely, like a real map.
  function chunkKey(cx, cy){ return cx+','+cy; }
  function currentChunkCoords(){
    const east = (state.playerWorldPos.x - WORLD_CENTER)/GPS_SCALE;
    const north = (WORLD_CENTER - state.playerWorldPos.y)/GPS_SCALE;
    return { cx: Math.floor(east/CHUNK_SIZE_M), cy: Math.floor(north/CHUNK_SIZE_M) };
  }
  let chunkQueue = [], chunkQueueSet = new Set(), chunkLoading = false;
  // Tracks the one chunk that matters most for the loading screen: wherever the player is
  // actually standing. Resolves once that chunk's roads/buildings/totos have actually
  // landed (or it fails/skip), so the loading screen can wait for something real instead
  // of a guessed timer.
  let pendingPriorityKey = null, priorityChunkResolvers = [];
  function waitForPriorityChunk(){
    if (!pendingPriorityKey) return Promise.resolve();
    return new Promise(res=> priorityChunkResolvers.push(res));
  }
  function resolvePriorityChunk(key){
    if (key !== pendingPriorityKey) return;
    pendingPriorityKey = null;
    priorityChunkResolvers.splice(0).forEach(r=>r());
  }
  function ensureChunksLoaded(){
    if (!state.geoAnchor) return;
    const {cx, cy} = currentChunkCoords();
    const priKey = chunkKey(cx, cy);
    if (state.loadedChunks.has(priKey)){
      pendingPriorityKey = null;
      priorityChunkResolvers.splice(0).forEach(r=>r());
    } else {
      pendingPriorityKey = priKey;
    }
    // Load the chunk you're standing in first — this is what makes the map feel instant —
    // then the surrounding ring loads in behind it as a lower priority.
    queueChunk(cx, cy, true);
    for (let dx=-1; dx<=1; dx++){
      for (let dy=-1; dy<=1; dy++){
        if (dx===0 && dy===0) continue;
        queueChunk(cx+dx, cy+dy, false);
      }
    }
    processChunkQueue();
    pruneFarChunksThrottled(cx, cy);
  }
  const CHUNK_KEEP_RADIUS = 3; // keep this ring of chunks around the player loaded; anything further gets unloaded
  const PRUNE_MIN_INTERVAL_MS = 4000; // don't unload more than once every few seconds — gives
  // an in-flight chunk fetch time to land, and rides out a single noisy GPS fix without
  // yanking nearby roads out from under you the moment it arrives.
  let lastPruneTs = 0, prunePending = null;
  function pruneFarChunksThrottled(centerCx, centerCy){
    const now = Date.now();
    if (now - lastPruneTs < PRUNE_MIN_INTERVAL_MS){
      prunePending = {cx:centerCx, cy:centerCy};
      return;
    }
    lastPruneTs = now; prunePending = null;
    pruneFarChunks(centerCx, centerCy);
  }
  if (!window.__totoPruneTicker){
    window.__totoPruneTicker = true;
    setInterval(()=>{
      if (prunePending && Date.now()-lastPruneTs >= PRUNE_MIN_INTERVAL_MS){
        lastPruneTs = Date.now();
        const p = prunePending; prunePending = null;
        pruneFarChunks(p.cx, p.cy);
      }
    }, 1000);
  }
  function pruneFarChunks(centerCx, centerCy){
    // Chunks never used to unload at all — every deco and every road/building shape you'd
    // ever walked near just piled up in the DOM forever. That unbounded growth was the
    // main reason the game got progressively laggier the longer you played. Now, once a
    // chunk falls outside CHUNK_KEEP_RADIUS, its DOM nodes are removed and it's dropped
    // from loadedChunks so it can simply reload (fresh, seeded the same way) if you walk
    // back — nothing is lost, it's just not sitting in memory the whole time.
    state.chunkEls.forEach((els, key)=>{
      const [cx, cy] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx-centerCx), Math.abs(cy-centerCy)) <= CHUNK_KEEP_RADIUS) return;
      els.deco.forEach(el=> el.remove());
      els.terrain.forEach(el=> el.remove());
      dropMapProps('c:'+key);
      state.chunkEls.delete(key);
      state.loadedChunks.delete(key);
    });
    // Same idea for terrain regions (see ensureRegionTerrain) — a region is kept as long
    // as any of its chunks are still within range, and dropped (so it can be re-queried
    // fresh) only once the whole 3x3 block is well outside it.
    if (!state.regionEls) return;
    const keepPx = 2200*GPS_SCALE, pp = state.playerWorldPos;
    state.regionEls.forEach((entry, key)=>{
      if (!pp || Math.hypot(entry.wx - pp.x, entry.wy - pp.y) <= keepPx) return;
      entry.els.forEach(el=> el.remove());
      dropMapProps('r:'+key);
      state.regionEls.delete(key);
    });
  }
  function queueChunk(cx, cy, priority){
    const key = chunkKey(cx, cy);
    if (state.loadedChunks.has(key) || chunkQueueSet.has(key)) return;
    chunkQueueSet.add(key);
    const job = {key, cx, cy};
    if (priority) chunkQueue.unshift(job); else chunkQueue.push(job);
  }
  const CHUNK_CONCURRENCY = 3; // load a few chunks at once instead of one-by-one
  async function processChunkQueue(){
    if (chunkLoading) return;
    chunkLoading = true;
    const workers = [];
    for (let i=0; i<CHUNK_CONCURRENCY; i++) workers.push(chunkWorker());
    await Promise.all(workers);
    chunkLoading = false;
  }
  async function chunkWorker(){
    while (chunkQueue.length){
      const job = chunkQueue.shift();
      chunkQueueSet.delete(job.key);
      if (state.loadedChunks.has(job.key)) continue;
      state.loadedChunks.add(job.key);
      try { await loadChunk(job.cx, job.cy); } catch(e){ console.warn('chunk load failed', e); }
      resolvePriorityChunk(job.key);
    }
  }
  async function loadChunk(cx, cy){
    const centerEast = (cx+0.5)*CHUNK_SIZE_M, centerNorth = (cy+0.5)*CHUNK_SIZE_M;
    const {lat, lon} = latLonFromMeters(centerEast, centerNorth);
    const baseSeed = Math.abs(Math.floor(lat*100000) + Math.floor(lon*100000) + cx*7919 + cy*104729);

    // procedural decorations for this chunk (Halloween props — atmosphere, not GPS-accurate).
    // Tagged with their chunk key and tracked in chunkEls so pruneFarChunks() can remove
    // them again once you've walked away — without this, decorations piled up forever
    // and were the biggest cause of the map getting laggy the longer you played.
    const key = chunkKey(cx, cy);
    const chunkEls = state.chunkEls.get(key) || { deco:[], terrain:[] };
    if (Math.abs(cx)+Math.abs(cy) < 40){ // sanity guard against runaway generation far off-map
      const decoLayer = $('#deco-layer');
      // A few standing Halloween props per chunk (atmosphere, not GPS-accurate) — drawn
      // upright by the 3D layer like the houses/trees from the real map data, instead of
      // the old flat emoji lying on the ground.
      const DECO_KINDS = ['pumpkin','deadtree','pumpkin','tomb','tree','pine'];
      const chunkProps = [];
      for (let i=0;i<4;i++){
        const s = baseSeed + i*17.3;
        const east = centerEast + (rand(s)-0.5)*CHUNK_SIZE_M;
        const north = centerNorth + (rand(s+1)-0.5)*CHUNK_SIZE_M;
        const pos = worldPosFromMeters(east, north);
        const kind = DECO_KINDS[Math.floor(rand(s+3)*DECO_KINDS.length)];
        const w = kind==='pumpkin' ? 20+rand(s+2)*8 : (kind==='tomb' ? 18+rand(s+2)*6 : 42+rand(s+2)*14);
        chunkProps.push({ x:pos.x, y:pos.y, kind, w, seed:Math.floor(rand(s+4)*1e6) });
      }
      setMapProps('c:'+key, chunkProps);
      // Occasional candy corn scatter — a little scenery bonus you can tap for a few candies.
      if (rand(baseSeed+40) < 0.5){
        const s = baseSeed + 4*17.3;
        const east = centerEast + (rand(s)-0.5)*CHUNK_SIZE_M;
        const north = centerNorth + (rand(s+1)-0.5)*CHUNK_SIZE_M;
        const pos = worldPosFromMeters(east, north);
        const el = document.createElement('div'); el.className='deco candy-corn-pickup';
        el.style.left = pos.x+'px'; el.style.top = pos.y+'px';
        el.innerHTML = '<span class="counter-rot corn-cluster" style="position:relative; z-index:2; display:inline-block;">'
          + candyIconHtml(15)+candyIconHtml(19)+candyIconHtml(14) + '</span>';
        el.onclick = ()=>{
          if (el.dataset.taken) return;
          el.dataset.taken = '1';
          state.candy += 5; markDirty(); refreshHUD();
          showToast('+5 candy 🍬');
          el.style.transition = 'opacity 0.3s, transform 0.3s';
          el.style.opacity = '0'; el.style.transform += ' scale(0.4)';
          setTimeout(()=> el.remove(), 300);
        };
        decoLayer.appendChild(el);
        chunkEls.deco.push(el);
      }
    }
    state.chunkEls.set(key, chunkEls);

    // wild Totos for this chunk — spawn immediately, don't wait on the network. At least
    // 5 show up right around the player (not just scattered one-per-chunk over a wide
    // area), with a 5% chance of any one of them being a legendary instead of normal.
    if (state.wildTotos.length < MAX_WILD_TOTOS){
      const wildCount = 5 + Math.floor(rand(baseSeed+50)*3);
      for (let i=0;i<wildCount;i++){
        const s = baseSeed + i*233.7;
        const east = centerEast + (rand(s)-0.5)*CHUNK_SIZE_M;
        const north = centerNorth + (rand(s+1)-0.5)*CHUNK_SIZE_M;
        const pos = worldPosFromMeters(east, north);
        const t = makeToto(rand(s+2) < 0.05 ? 'legendary' : 'normal');
        t._x = pos.x; t._y = pos.y; t._chunkKey = chunkKey(cx, cy);
        // scattered spawns have already been around a while, so they don't all leave at once
        t._expiresAt = Date.now() + WILD_LIFETIME_MS*(0.4 + rand(s+5)*0.6);
        state.wildTotos.push(t);
        appendTotoNode(t);
      }
    }

    // Gym spawns immediately at a walkable fallback spot — no waiting on the network for it
    // to appear — then quietly slides onto a real nearby park if the terrain fetch finds one.
    let gym = null;
    if (state.gyms.length < MAX_GYMS && rand(baseSeed+90) < 0.22){
      const east = centerEast + (rand(baseSeed+91)-0.5)*CHUNK_SIZE_M*0.6;
      const north = centerNorth + (rand(baseSeed+92)-0.5)*CHUNK_SIZE_M*0.6;
      const pos = worldPosFromMeters(east, north);
      const boss = makeToto(rand(baseSeed+93)<0.5 ? 'legendary' : 'mythical');
      gym = { id:uid(), x:pos.x, y:pos.y, boss, name: GYM_NAMES[Math.floor(rand(baseSeed+94)*GYM_NAMES.length)], atPark:false };
      state.gyms.push(gym);
      appendGymNode(gym);
      renderBattleList();
    }

    // Live roads/buildings/parks/water — from the fixed map tile(s) this chunk touches
    // (see ensureRegionTerrain): drawn straight from the phone when saved, otherwise
    // downloaded through the shared, rate-limit-friendly queue.
    try {
      const parks = await ensureRegionTerrain(cx, cy);
      if (gym && parks.length){
        // the nearest park that doesn't already have a gym (two gyms never share a park)
        const free = parks.filter(pk=> !state.gyms.some(o=> o !== gym && o.atPark && Math.hypot(o.x-pk.x, o.y-pk.y) < 60*GPS_SCALE))
          .map(pk=> ({ pk, d:Math.hypot(pk.x-gym.x, pk.y-gym.y) })).filter(o=> o.d < 600*GPS_SCALE).sort((a,b)=> a.d-b.d);
        if (free.length){
          gym.x = free[0].pk.x; gym.y = free[0].pk.y; gym.atPark = true;
          refreshGymNode(gym);
        }
      }
    } catch(e){ console.warn('terrain fetch failed', e); }

    refreshNodeDistances();
  }

  // ---------------- REAL MAP DATA: fixed map tiles, saved on the phone ----------------
  // Roads/buildings/parks come from OpenStreetMap (Overpass). They're fetched per fixed
  // geographic tile (~1.1 x 1.1 km, the same grid every session, wherever the GPS anchor
  // lands) and every tile is SAVED ON THE PHONE (IndexedDB). So:
  //  - reopening the app — including right after an update — draws your neighbourhood
  //    straight from the phone instead of waiting on the internet;
  //  - a saved tile is quietly refreshed in the background once it's a few days old;
  //  - downloads go through one small queue, nearest tile first, two at a time, so the
  //    free map servers don't rate-limit us; a slow server gets backup from the next one
  //    and a failed tile is retried automatically (it used to stay blank until you walked).
  const TILE_LAT = 0.01, TILE_LON = 0.014;            // ≈1.1 km x 1.0–1.1 km
  const MAP_DATA_VERSION = 3;                         // bump when the query changes (older saved tiles still draw, then refresh)
  const TILE_FRESH_MS = 3*24*3600*1000;               // older than this → refresh in the background
  const TILE_MAX_SAVED = 90;
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];
  let overpassCursor = 0;
  const MapCache = (()=>{
    let dbp = null;
    function db(){
      if (!dbp) dbp = new Promise((res, rej)=>{
        try {
          const r = indexedDB.open('totoquest-map', 1);
          r.onupgradeneeded = ()=>{ if (!r.result.objectStoreNames.contains('tiles')) r.result.createObjectStore('tiles'); };
          r.onsuccess = ()=> res(r.result); r.onerror = ()=> rej(r.error);
        } catch(e){ rej(e); }
      });
      return dbp;
    }
    async function get(key){
      try { const d = await db(); return await new Promise(res=>{ const q = d.transaction('tiles','readonly').objectStore('tiles').get(key); q.onsuccess = ()=> res(q.result||null); q.onerror = ()=> res(null); }); }
      catch(e){ return null; }
    }
    async function put(key, val){
      try {
        const d = await db();
        await new Promise(res=>{ const tx = d.transaction('tiles','readwrite'); tx.objectStore('tiles').put(val, key); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; });
        trim(d);
      } catch(e){}
    }
    function trim(d){
      try {
        const rows = []; const tx = d.transaction('tiles','readwrite'); const st = tx.objectStore('tiles');
        st.openCursor().onsuccess = ev=>{
          const c = ev.target.result;
          if (c){ rows.push({ k:c.key, ts:(c.value && c.value.ts) || 0 }); c.continue(); return; }
          if (rows.length > TILE_MAX_SAVED){ rows.sort((a,b)=> a.ts-b.ts); rows.slice(0, rows.length-TILE_MAX_SAVED).forEach(r=> st.delete(r.k)); }
        };
      } catch(e){}
    }
    return { get, put };
  })();

  function tileKey(ilat, ilon){ return ilat+':'+ilon; }
  function tileBox(ilat, ilon){ return { s:+(ilat*TILE_LAT).toFixed(6), n:+((ilat+1)*TILE_LAT).toFixed(6), w:+(ilon*TILE_LON).toFixed(6), e:+((ilon+1)*TILE_LON).toFixed(6) }; }
  function mapProject(la, lo){ const md = metersDelta(state.geoAnchor.lat, state.geoAnchor.lon, la, lo); return worldPosFromMeters(md.east, md.north); }
  // Every tile a chunk touches (usually one, at most four).
  function tilesForChunk(cx, cy){
    const a = latLonFromMeters(cx*CHUNK_SIZE_M, cy*CHUNK_SIZE_M), b = latLonFromMeters((cx+1)*CHUNK_SIZE_M, (cy+1)*CHUNK_SIZE_M);
    const out = [];
    for (let i=Math.floor(Math.min(a.lat,b.lat)/TILE_LAT); i<=Math.floor(Math.max(a.lat,b.lat)/TILE_LAT); i++)
      for (let j=Math.floor(Math.min(a.lon,b.lon)/TILE_LON); j<=Math.floor(Math.max(a.lon,b.lon)/TILE_LON); j++) out.push({ ilat:i, ilon:j });
    return out;
  }
  function tileDistM(t){
    if (!state.geo) return 0;
    const bx = tileBox(t.ilat, t.ilon), d = metersDelta(state.geo.lat, state.geo.lon, (bx.s+bx.n)/2, (bx.w+bx.e)/2);
    return Math.hypot(d.east, d.north);
  }
  function overpassQuery(bx){
    const bbox = bx.s+','+bx.w+','+bx.n+','+bx.e;
    const areas = '["leisure"~"^(park|garden|pitch|playground|sports_centre|stadium|track|swimming_pool|golf_course|dog_park)$"]';
    const land = '["landuse"~"^(recreation_ground|cemetery|forest|grass|meadow|village_green|reservoir|residential|commercial|retail|industrial|farmland|farmyard)$"]';
    return '[out:json][timeout:25];('
      +'way["highway"]('+bbox+');'
      +'way["building"]('+bbox+');'
      +'way'+areas+'('+bbox+');'
      +'way'+land+'('+bbox+');'
      +'way["amenity"~"^(grave_yard|parking|school|college|university|hospital|kindergarten|place_of_worship)$"]('+bbox+');'
      +'way["natural"~"^(water|wood)$"]('+bbox+');'
      +'way["waterway"~"^(river|stream|canal)$"]('+bbox+');'
      +'way["railway"="rail"]('+bbox+');'
      // areas drawn as multi-part "relations" (big parks, lakes, sports complexes, some ball
      // fields) and ball fields that are only a single dot on the map
      +'way["sport"~"baseball|softball"]('+bbox+');'
      +'relation["leisure"~"^(park|pitch|sports_centre|stadium|playground|garden)$"]('+bbox+');'
      +'relation["landuse"~"^(recreation_ground|cemetery|forest|grass|reservoir)$"]('+bbox+');'
      +'relation["natural"~"^(water|wood)$"]('+bbox+');'
      +'relation["building"]('+bbox+');'
      +'node["leisure"="pitch"]('+bbox+');'
      // landmarks that get a PumpkinStop: churches, libraries, monuments, public art,
      // playgrounds, trail signs … the same kind of spots other GPS games use
      +'node["amenity"~"^(place_of_worship|library|townhall|fountain|post_office|community_centre|arts_centre|theatre|clock)$"]('+bbox+');'
      +'node["historic"~"^(memorial|monument|statue|wayside_shrine|wayside_cross|milestone|cannon|ruins|building|church|marker|plaque)$"]('+bbox+');'
      +'node["tourism"~"^(artwork|attraction|viewpoint|museum|information)$"]('+bbox+');'
      +'node["leisure"~"^(playground|park|garden|fitness_station)$"]('+bbox+');'
      +'node["man_made"~"^(water_tower|lighthouse|windmill|obelisk)$"]('+bbox+');'
      +'way["tourism"~"^(attraction|museum|artwork)$"]('+bbox+');'
      +');out geom;';
  }
  // Ask the map servers, one at a time — but if the first is slow, bring in the next
  // one as well and take whichever answers first.
  function overpassFetch(query){
    return new Promise((resolve, reject)=>{
      const N = OVERPASS_ENDPOINTS.length;
      let started = 0, failed = 0, done = false, lastErr = null;
      const ctrls = [];
      const start = ()=>{
        if (done || started >= N) return;
        const idx = (overpassCursor + started) % N; started++;
        const ctrl = new AbortController(); ctrls.push(ctrl);
        const timer = setTimeout(()=> ctrl.abort(), 25000);
        fetch(OVERPASS_ENDPOINTS[idx]+'?data='+encodeURIComponent(query), { signal: ctrl.signal })
          .then(r=>{ if (!r.ok) throw new Error('HTTP '+r.status+' from '+new URL(OVERPASS_ENDPOINTS[idx]).hostname); return r.json(); })
          .then(j=>{
            clearTimeout(timer);
            if (!j || !Array.isArray(j.elements)) throw new Error('unexpected reply');
            if (j.remark && /error|timed out|out of memory/i.test(j.remark) && !j.elements.length) throw new Error(j.remark);
            if (done) return;
            done = true; overpassCursor = idx;
            ctrls.forEach(c=>{ if (c !== ctrl) try { c.abort(); } catch(e){} });
            resolve(j.elements);
          })
          .catch(err=>{
            clearTimeout(timer);
            if (done) return;
            failed++; lastErr = err;
            if (failed >= N){ done = true; reject(lastErr); } else start();
          });
        setTimeout(()=>{ if (!done) start(); }, 7000);   // slow server → hedge with the next one
      };
      start();
    });
  }
  const netQueue = []; let netActive = 0;
  const NET_MAX = 2;
  function queueTileDownload(t){ return new Promise((res, rej)=>{ netQueue.push({ t, res, rej }); pumpTileDownloads(); }); }
  function pumpTileDownloads(){
    while (netActive < NET_MAX && netQueue.length){
      netQueue.sort((a,b)=> tileDistM(a.t) - tileDistM(b.t));      // nearest to you first
      const job = netQueue.shift(); netActive++;
      diag.lastRegionAttempt = new Date().toLocaleTimeString();
      overpassFetch(overpassQuery(tileBox(job.t.ilat, job.t.ilon)))
        .then(els=>{ diag.lastRegionError = null; diag.lastRegionResult = els.length+' map features'; job.res(els); },
              err=>{ diag.lastRegionError = describeFetchError(err); job.rej(err); })
        .finally(()=>{ netActive--; pumpTileDownloads(); });
    }
  }

  // Multi-part areas ("relations") arrive as pieces of outline — stitch the outer pieces
  // into closed rings so they draw like any other area.
  function relationRings(rel){
    const parts = (rel.members||[]).filter(m=> m.type==='way' && m.geometry && m.geometry.length > 1 && m.role !== 'inner').map(m=> m.geometry.slice());
    const same = (a,b)=> Math.abs(a.lat-b.lat) < 1e-7 && Math.abs(a.lon-b.lon) < 1e-7;
    const rings = [];
    while (parts.length){
      let ring = parts.shift(), grew = true;
      while (!same(ring[0], ring[ring.length-1]) && grew){
        grew = false;
        for (let i=0;i<parts.length;i++){
          const p = parts[i], end = ring[ring.length-1];
          if (same(p[0], end)){ ring = ring.concat(p.slice(1)); }
          else if (same(p[p.length-1], end)){ ring = ring.concat(p.slice(0,-1).reverse()); }
          else if (same(p[p.length-1], ring[0])){ ring = p.slice(0,-1).concat(ring); }
          else if (same(p[0], ring[0])){ ring = p.slice(1).reverse().concat(ring); }
          else continue;
          parts.splice(i,1); grew = true; break;
        }
      }
      if (ring.length > 3) rings.push(ring);
    }
    return rings;
  }
  // A pitch mapped as a single point: give it a regulation-sized outline to draw.
  function pitchFromNode(n){
    const sport = String((n.tags||{}).sport||'');
    const [w, h] = /baseball|softball/.test(sport) ? [80, 80] : /tennis/.test(sport) ? [24, 11] : /basketball/.test(sport) ? [28, 15] : [90, 55];
    const mLat = 1/110540, mLon = 1/(111320*Math.cos(n.lat*Math.PI/180));
    let g;
    if (/baseball|softball/.test(sport)){
      // a fan: home plate at the south, foul lines out to the north-east / north-west, arc outfield
      g = [{ lat:n.lat - 0.35*h*mLat, lon:n.lon }];
      for (let k=0;k<=8;k++){ const a = Math.PI/4 + k*(Math.PI/2)/8; g.push({ lat:n.lat - 0.35*h*mLat + Math.sin(a)*h*mLat, lon:n.lon + Math.cos(a)*w*mLon }); }
    } else {
      g = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=> ({ lat:n.lat + y*h/2*mLat, lon:n.lon + x*w/2*mLon }));
    }
    g.push(g[0]);
    return { type:'way', id:'n'+n.id, tags:n.tags, geometry:g };
  }
  // Everything Overpass gives back, as plain areas/lines renderTerrainArt understands.
  function normalizeMapElements(elements){
    const out = [];
    (elements||[]).forEach(el=>{
      if (el.type === 'way'){ out.push(el); return; }
      if (el.type === 'relation'){ relationRings(el).forEach((ring,i)=> out.push({ type:'way', id:'r'+el.id+'_'+i, tags:el.tags, geometry:ring })); return; }
      if (el.type === 'node' && el.tags && el.tags.leisure === 'pitch') out.push(pitchFromNode(el));
      else if (el.type === 'node' && el.tags && stopPoiName(el.tags)) out.push({ type:'poi', id:'n'+el.id, tags:el.tags, lat:el.lat, lon:el.lon });
    });
    // a way can come back twice (e.g. a ball field that's also matched by sport) — draw it once
    const seen = new Set();
    return out.filter(e=>{ const k = e.type+e.id; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // Is this map feature a landmark worth a PumpkinStop? Returns its sign name (or null).
  const POI_LABEL = { place_of_worship:'Chapel', library:'Library', townhall:'Town Hall', fountain:'Fountain', post_office:'Post Office',
    community_centre:'Community Center', arts_centre:'Arts Center', theatre:'Theater', clock:'Town Clock', museum:'Museum',
    memorial:'Memorial', monument:'Monument', statue:'Statue', wayside_shrine:'Wayside Shrine', wayside_cross:'Wayside Cross', milestone:'Old Milestone',
    cannon:'Old Cannon', ruins:'Ruins', marker:'Historic Marker', plaque:'Historic Plaque', artwork:'Public Art', attraction:'Landmark',
    viewpoint:'Scenic View', information:'Trail Sign', playground:'Playground', fitness_station:'Fitness Trail', water_tower:'Water Tower',
    lighthouse:'Lighthouse', windmill:'Windmill', obelisk:'Obelisk', park:'Park', garden:'Garden', church:'Old Church', building:'Historic Building' };
  function stopPoiName(t){
    if (!t) return null;
    let k = null;
    if (/^(place_of_worship|library|townhall|fountain|post_office|community_centre|arts_centre|theatre|clock)$/.test(t.amenity||'')) k = t.amenity;
    else if (t.historic && t.historic !== 'no') k = POI_LABEL[t.historic] ? t.historic : 'marker';
    else if (/^(artwork|attraction|viewpoint|museum)$/.test(t.tourism||'')) k = t.tourism;
    else if (t.tourism === 'information' && (!t.information || /^(board|map)$/.test(t.information))) k = 'information';
    else if (/^(water_tower|lighthouse|windmill|obelisk)$/.test(t.man_made||'')) k = t.man_made;
    else if (/^(playground|park|garden|fitness_station)$/.test(t.leisure||'') && !t.building) k = t.leisure;
    if (!k) return null;
    return String(t.name || POI_LABEL[k] || 'Landmark').slice(0, 40);
  }

  function drawTile(key, t, elements){
    if (!state.geoAnchor) return [];
    const bx = tileBox(t.ilat, t.ilon);
    const p1 = mapProject(bx.n, bx.w), p2 = mapProject(bx.s, bx.e);
    const art = renderTerrainArt(normalizeMapElements(elements), mapProject, key, { x0:p1.x, y0:p1.y, x1:p2.x, y1:p2.y });
    const old = state.regionEls.get(key);
    if (old) old.els.forEach(el=> el.remove());
    let g = null;
    if (art.svg){
      g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.innerHTML = art.svg;
      $('#terrain-svg').appendChild(g);
    }
    setMapProps('r:'+key, art.props);
    state.regionEls.set(key, { els: g ? [g] : [], parks: art.parkCentroids, ilat:t.ilat, ilon:t.ilon, wx:(p1.x+p2.x)/2, wy:(p1.y+p2.y)/2 });
    return art.parkCentroids;
  }
  // Fetches (or reuses) the map for every tile a chunk touches; parks from all of them.
  function ensureRegionTerrain(cx, cy){
    return Promise.all(tilesForChunk(cx, cy).map(t=> ensureTile(t))).then(list=> [].concat(...list.map(x=> x||[])));
  }
  const tileRetryAt = new Map();      // key -> earliest time to try a failed tile again
  function ensureTile(t){
    if (!state.regionEls) state.regionEls = new Map();
    if (!state.regionPromises) state.regionPromises = new Map();
    const key = tileKey(t.ilat, t.ilon);
    const have = state.regionEls.get(key);
    if (have) return Promise.resolve(have.parks);
    const pending = state.regionPromises.get(key);
    if (pending) return pending;
    if ((tileRetryAt.get(key)||0) > Date.now()) return Promise.resolve([]);
    const anchorAt = state.geoAnchor;
    const p = (async ()=>{
      const saved = await MapCache.get(key);
      const usable = saved && saved.v >= 2 && Array.isArray(saved.elements);
      if (usable && state.geoAnchor === anchorAt){
        const parks = drawTile(key, t, saved.elements);
        diag.lastRegionResult = 'drawn from the phone ('+saved.elements.length+' map features)';
        if (saved.v !== MAP_DATA_VERSION || Date.now() - saved.ts > TILE_FRESH_MS){
          // old copy: show it now, swap in fresh data once it arrives
          queueTileDownload(t).then(els=>{
            if (!els.length) return;
            MapCache.put(key, { v:MAP_DATA_VERSION, ts:Date.now(), elements:els });
            if (state.geoAnchor === anchorAt && state.regionEls.has(key)) drawTile(key, t, els);
          }, ()=>{});
        }
        return parks;
      }
      try {
        const els = await queueTileDownload(t);
        tileRetryAt.delete(key);
        if (els.length) MapCache.put(key, { v:MAP_DATA_VERSION, ts:Date.now(), elements:els });
        if (state.geoAnchor !== anchorAt) return [];
        return drawTile(key, t, els);
      } catch(e){
        const fails = (state.tileFails = state.tileFails || {});
        fails[key] = (fails[key]||0) + 1;
        tileRetryAt.set(key, Date.now() + Math.min(60000, 4000 * Math.pow(2, fails[key]-1)));
        console.warn('map tile failed', key, e);
        return [];
      }
    })().finally(()=> state.regionPromises.delete(key));
    state.regionPromises.set(key, p);
    return p;
  }
  // Keeps every tile around you loaded: anything missing (never fetched, or a download
  // that failed) is asked for again — this is what fills in a map that came up half-drawn.
  function ensureNearbyTiles(){
    if (!state.geoAnchor || !state.loadedChunks) return;
    const {cx, cy} = currentChunkCoords();
    for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++) ensureRegionTerrain(cx+dx, cy+dy);
  }
  setInterval(ensureNearbyTiles, 5000);

  // ---------------- MAP ART: stone roads, real building lots, fields & parks ----------------
  // Everything flat on the ground is SVG in #terrain-svg (world units: GPS_SCALE px per
  // metre). Everything that STANDS on the ground — houses on real building footprints,
  // trees in parks/woods, tombstones in cemeteries — is a "map prop" published on
  // window.__mapProps (deliberately NOT on state: state is JSON-saved whole, and a town's
  // worth of props would bloat every save) and drawn upright by the 3D layer at the
  // bottom of the page, so it stands up properly at any camera tilt/rotation.
  window.__mapProps = window.__mapProps || { groups:new Map(), version:0 };
  function setMapProps(groupKey, list){ window.__mapProps.groups.set(groupKey, list||[]); window.__mapProps.version++; }
  function dropMapProps(groupKey){ if (window.__mapProps.groups.delete(groupKey)) window.__mapProps.version++; }
  function clearMapProps(){ window.__mapProps.groups.clear(); window.__mapProps.version++; }

  const TERRAIN_DEFS = '<defs>'
    // Cobblestones (world-aligned tile, ~9m) — irregular rounded stones on dark grout,
    // each with a lit top edge so the road reads as cut stone under the night lighting.
    + '<pattern id="pat-cobble" patternUnits="userSpaceOnUse" width="30" height="30">'
    +   '<rect width="30" height="30" fill="#221c2a"/>'
    +   '<g stroke="#8d859c" stroke-opacity="0.35" stroke-width="1.2">'
    +     '<rect x="1.2" y="1.2" width="12" height="8.5" rx="3.6" fill="#625b72"/>'
    +     '<rect x="14.8" y="1" width="14" height="8" rx="3.6" fill="#57506a"/>'
    +     '<rect x="1" y="11.5" width="7.5" height="8" rx="3" fill="#514a62"/>'
    +     '<rect x="10" y="11" width="11.5" height="8.6" rx="3.6" fill="#6a6380"/>'
    +     '<rect x="23" y="11.2" width="6" height="8.4" rx="2.6" fill="#5a5368"/>'
    +     '<rect x="1.5" y="21.4" width="13" height="7.4" rx="3.2" fill="#5f5872"/>'
    +     '<rect x="16.2" y="21" width="12.6" height="7.8" rx="3.2" fill="#544d66"/>'
    +   '</g>'
    + '</pattern>'
    // Flagstone footpaths — bigger, paler slabs.
    + '<pattern id="pat-flag" patternUnits="userSpaceOnUse" width="24" height="24">'
    +   '<rect width="24" height="24" fill="#3a3340"/>'
    +   '<rect x="1" y="1" width="13" height="10" rx="2.5" fill="#8a7f86"/><rect x="15.5" y="1" width="7.5" height="10" rx="2.5" fill="#7b7178"/>'
    +   '<rect x="1" y="12.5" width="8" height="10.5" rx="2.5" fill="#766c74"/><rect x="10.5" y="12.5" width="12.5" height="10.5" rx="2.5" fill="#857a82"/>'
    + '</pattern>'
    // Rail ties.
    + '<pattern id="pat-ties" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="none"/></pattern>'
    + '</defs>';
  function ensureTerrainDefs(){
    const svg = $('#terrain-svg');
    if (!svg.querySelector('#pat-cobble')) svg.insertAdjacentHTML('afterbegin', TERRAIN_DEFS);
  }

  // Road widths in world px (3.2px = 1m). Deliberately chunkier than survey-true so a
  // street reads at the same scale as your character and the creatures on it.
  const ROAD_W = { motorway:80, trunk:76, primary:72, secondary:66, tertiary:62, motorway_link:52, trunk_link:52, primary_link:52,
    secondary_link:48, tertiary_link:48, residential:58, unclassified:56, living_street:52, road:52, service:36, track:28, busway:44 };
  const PATH_W = { footway:17, path:17, pedestrian:30, cycleway:17, steps:15, bridleway:17, corridor:0 };

  function polyArea(ptsArr){ let a=0; for (let i=0,j=ptsArr.length-1;i<ptsArr.length;j=i++) a += (ptsArr[j].x+ptsArr[i].x)*(ptsArr[j].y-ptsArr[i].y); return Math.abs(a/2); }
  function polyCentroid(ptsArr){ let x=0,y=0; ptsArr.forEach(p=>{x+=p.x;y+=p.y;}); return {x:x/ptsArr.length, y:y/ptsArr.length}; }
  function pointInPoly(x, y, ptsArr){
    let inside=false;
    for (let i=0,j=ptsArr.length-1;i<ptsArr.length;j=i++){
      const xi=ptsArr[i].x, yi=ptsArr[i].y, xj=ptsArr[j].x, yj=ptsArr[j].y;
      if (((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi)) inside=!inside;
    }
    return inside;
  }
  // Oriented bounding box via the vertices' principal axis — lets a sports pitch get its
  // markings laid out along the field's real long side, whichever way it faces.
  function orientedBox(ptsArr){
    const c = polyCentroid(ptsArr);
    let sxx=0, syy=0, sxy=0;
    ptsArr.forEach(p=>{ const dx=p.x-c.x, dy=p.y-c.y; sxx+=dx*dx; syy+=dy*dy; sxy+=dx*dy; });
    const ang = 0.5*Math.atan2(2*sxy, sxx-syy);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    ptsArr.forEach(p=>{ const dx=p.x-c.x, dy=p.y-c.y; const u=dx*ux+dy*uy, v=-dx*uy+dy*ux; u0=Math.min(u0,u);u1=Math.max(u1,u);v0=Math.min(v0,v);v1=Math.max(v1,v); });
    const cu=(u0+u1)/2, cv=(v0+v1)/2;
    return { cx:c.x+cu*ux-cv*uy, cy:c.y+cu*uy+cv*ux, len:u1-u0, wid:v1-v0, deg:ang*180/Math.PI };
  }
  function seededRand(seed){ let s = seed>>>0 || 1; return ()=>{ s = (s*1664525 + 1013904223)>>>0; return s/4294967296; }; }
  function scatterInPoly(ptsArr, count, rnd, minSep){
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    ptsArr.forEach(p=>{x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);});
    const out=[];
    for (let tries=0; tries<count*12 && out.length<count; tries++){
      const x = x0+rnd()*(x1-x0), y = y0+rnd()*(y1-y0);
      if (!pointInPoly(x,y,ptsArr)) continue;
      if (minSep && out.some(q=>Math.hypot(q.x-x,q.y-y)<minSep)) continue;
      out.push({x,y});
    }
    return out;
  }
  // A baseball/softball outline is a fan: two straight foul lines meeting at a right angle
  // at home plate, closed by the outfield arc. Finds home plate and the direction to
  // centre field, or null if the outline isn't fan-shaped.
  function ballFieldApex(P){
    let pts = P.slice();
    if (pts.length > 3 && Math.hypot(pts[0].x-pts[pts.length-1].x, pts[0].y-pts[pts.length-1].y) < 2) pts.pop();
    const n = pts.length; if (n < 4) return null;
    const b = orientedBox(pts);
    if (b.len < 80 || polyArea(pts) / Math.max(1, b.len*b.wid) > 0.86) return null;   // rectangles aren't ball fields
    let maxD = 0, best = null;
    for (let i=0;i<n;i++){
      const prev = pts[(i-1+n)%n], cur = pts[i], next = pts[(i+1)%n];
      const v1x = prev.x-cur.x, v1y = prev.y-cur.y, v2x = next.x-cur.x, v2y = next.y-cur.y;
      const l1 = Math.hypot(v1x,v1y), l2 = Math.hypot(v2x,v2y);
      if (l1 < 1 || l2 < 1) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (v1x*v2x+v1y*v2y)/(l1*l2)))) * 180/Math.PI;
      if (ang < 65 || ang > 115) continue;
      const leg = Math.min(l1, l2);
      if (!best || leg > best.leg) best = { cur, leg, v1x:v1x/l1, v1y:v1y/l1, v2x:v2x/l2, v2y:v2y/l2 };
    }
    if (!best) return null;
    pts.forEach(q=>{ maxD = Math.max(maxD, Math.hypot(q.x-best.cur.x, q.y-best.cur.y)); });
    if (best.leg < 0.45*maxD) return null;
    // centre field = straight down the middle of the two foul lines
    let ux = best.v1x + best.v2x, uy = best.v1y + best.v2y; const ul = Math.hypot(ux,uy) || 1; ux/=ul; uy/=ul;
    return { x:best.cur.x, y:best.cur.y, ux, uy, depth:maxD };
  }
  function ballFieldMarkings(a){
    const side = Math.max(36, Math.min(88, a.depth*0.3));      // 27.4 m base paths, scaled to fit
    const d = side/Math.SQRT2, line = 'fill="none" stroke="#f4f1e6" stroke-opacity="0.85" stroke-width="2.4"';
    const r = side*1.45, c45 = Math.SQRT1_2;
    const deg = Math.atan2(a.uy, a.ux)*180/Math.PI;
    const inner = '<path d="M0,0 L'+(r*c45).toFixed(1)+','+(r*c45).toFixed(1)+' A'+r.toFixed(1)+','+r.toFixed(1)+' 0 0 0 '+(r*c45).toFixed(1)+','+(-r*c45).toFixed(1)+' Z" fill="#8a5a3a" opacity="0.95"/>'
      + '<path d="M'+(d*0.16).toFixed(1)+',0 L'+d.toFixed(1)+','+(d*0.84).toFixed(1)+' L'+(2*d*0.92).toFixed(1)+',0 L'+d.toFixed(1)+','+(-d*0.84).toFixed(1)+' Z" fill="#3f7a4c"/>'
      + '<path d="M0,0 L'+d.toFixed(1)+','+d.toFixed(1)+' L'+(2*d).toFixed(1)+',0 L'+d.toFixed(1)+','+(-d).toFixed(1)+' Z" '+line+'/>'
      + '<circle cx="'+(side*0.67).toFixed(1)+'" cy="0" r="'+(side*0.09).toFixed(1)+'" fill="#a06a44" stroke="#f4f1e6" stroke-opacity="0.6" stroke-width="1"/>'
      + '<circle cx="0" cy="0" r="'+(side*0.13).toFixed(1)+'" fill="#8a5a3a"/>'
      + [[0,0],[d,d],[2*d,0],[d,-d]].map(([x,y])=>'<rect x="'+(x-3).toFixed(1)+'" y="'+(y-3).toFixed(1)+'" width="6" height="6" fill="#fffdf2" transform="rotate(45 '+x.toFixed(1)+' '+y.toFixed(1)+')"/>').join('')
      + '<path d="M0,0 L'+(a.depth*0.7*c45).toFixed(1)+','+(a.depth*0.7*c45).toFixed(1)+' M0,0 L'+(a.depth*0.7*c45).toFixed(1)+','+(-a.depth*0.7*c45).toFixed(1)+'" '+line+' stroke-dasharray="6 4"/>';
    return '<g transform="translate('+a.x.toFixed(1)+','+a.y.toFixed(1)+') rotate('+deg.toFixed(1)+')">'+inner+'</g>';
  }
  function pitchMarkings(ptsArr, sport){
    const b = orientedBox(ptsArr);
    if (b.len < 30 || b.wid < 20) return '';
    const L = b.len, W = b.wid, line = 'fill="none" stroke="#f4f1e6" stroke-opacity="0.85" stroke-width="2.4"';
    let inner = '';
    if (/baseball|softball/.test(sport)){
      const side = Math.min(88, Math.min(L, W)*0.42);            // 27.4m base paths, scaled to fit
      const d = side/Math.SQRT2;
      inner = '<circle cx="0" cy="'+(d*0.15)+'" r="'+(side*1.02)+'" fill="#8a5a3a" opacity="0.95"/>'
        + '<rect x="'+(-side/2+3)+'" y="'+(-side/2+3)+'" width="'+(side-6)+'" height="'+(side-6)+'" fill="#3f7a4c" transform="rotate(45)"/>'
        + '<rect x="'+(-side/2)+'" y="'+(-side/2)+'" width="'+side+'" height="'+side+'" '+line+' transform="rotate(45)"/>'
        + '<circle cx="0" cy="0" r="'+(side*0.09)+'" fill="#a06a44" stroke="#f4f1e6" stroke-opacity="0.6" stroke-width="1"/>'
        + [[0,-d],[d,0],[0,d],[-d,0]].map(([x,y],i)=>'<rect x="'+(x-3)+'" y="'+(y-3)+'" width="6" height="6" fill="#fffdf2" transform="rotate(45 '+x+' '+y+')"/>').join('')
        + '<path d="M0,'+d+' L'+(-L*0.48)+','+(d-L*0.48)+' M0,'+d+' L'+(L*0.48)+','+(d-L*0.48)+'" '+line+' stroke-dasharray="6 4"/>';
      return '<g transform="translate('+b.cx.toFixed(1)+','+b.cy.toFixed(1)+') rotate('+(b.deg+90).toFixed(1)+')">'+inner+'</g>';
    }
    if (/tennis/.test(sport)){
      inner = '<rect x="'+(-L/2+3)+'" y="'+(-W/2+3)+'" width="'+(L-6)+'" height="'+(W-6)+'" fill="#3d6f96"/>'
        + '<rect x="'+(-L/2+6)+'" y="'+(-W/2+6)+'" width="'+(L-12)+'" height="'+(W-12)+'" '+line+'/>'
        + '<path d="M0,'+(-W/2+6)+' V'+(W/2-6)+' M'+(-L*0.27)+','+(-W/2+10)+' V'+(W/2-10)+' M'+(L*0.27)+','+(-W/2+10)+' V'+(W/2-10)+' M'+(-L*0.27)+',0 H'+(L*0.27)+'" '+line+'/>';
    } else if (/basketball/.test(sport)){
      inner = '<rect x="'+(-L/2+3)+'" y="'+(-W/2+3)+'" width="'+(L-6)+'" height="'+(W-6)+'" fill="#a8602e"/>'
        + '<rect x="'+(-L/2+6)+'" y="'+(-W/2+6)+'" width="'+(L-12)+'" height="'+(W-12)+'" '+line+'/>'
        + '<path d="M0,'+(-W/2+6)+' V'+(W/2-6)+'" '+line+'/><circle r="'+(W*0.16)+'" '+line+'/>'
        + '<rect x="'+(-L/2+6)+'" y="'+(-W*0.17)+'" width="'+(L*0.2)+'" height="'+(W*0.34)+'" '+line+'/><rect x="'+(L/2-6-L*0.2)+'" y="'+(-W*0.17)+'" width="'+(L*0.2)+'" height="'+(W*0.34)+'" '+line+'/>';
    } else {
      // soccer / football / rugby / anything else on grass: touchlines, halfway line,
      // centre circle and both penalty boxes
      const bw = W*0.44, bd = Math.min(L*0.17, 60);
      inner = '<rect x="'+(-L/2+5)+'" y="'+(-W/2+5)+'" width="'+(L-10)+'" height="'+(W-10)+'" '+line+'/>'
        + '<path d="M0,'+(-W/2+5)+' V'+(W/2-5)+'" '+line+'/><circle r="'+Math.min(W*0.13, 30)+'" '+line+'/>'
        + '<rect x="'+(-L/2+5)+'" y="'+(-bw/2)+'" width="'+bd+'" height="'+bw+'" '+line+'/><rect x="'+(L/2-5-bd)+'" y="'+(-bw/2)+'" width="'+bd+'" height="'+bw+'" '+line+'/>';
    }
    return '<g transform="translate('+b.cx.toFixed(1)+','+b.cy.toFixed(1)+') rotate('+b.deg.toFixed(1)+')">'+inner+'</g>';
  }
  function buildingKind(t, areaM2, seed){
    const b = String(t.building||'yes').toLowerCase();
    if (/church|chapel|cathedral|temple|mosque|synagogue|shrine/.test(b) || t.amenity==='place_of_worship') return 'church';
    if (/garage|shed|carport|roof/.test(b)) return null;     // just its lot — it isn't another house
    if (/hut|kiosk|shelter|cabin|greenhouse/.test(b)) return areaM2 < 18 ? null : 'shed';
    if (/apartments|dormitory/.test(b) || (b==='residential' && areaM2 > 600)) return 'apartment';
    if (/school|university|college|hospital|public|civic|government|townhall|library|fire_station|train_station|kindergarten/.test(b)) return areaM2 > 220 ? 'hall' : 'house1';
    if (/commercial|retail|supermarket|office|industrial|warehouse|hotel|shop|manufacture|service/.test(b)) return areaM2 > 200 ? 'shop' : 'house2';
    if (areaM2 < 26) return null;          // tiny outbuilding: just the stone lot
    if (areaM2 < 48) return 'shed';
    if (areaM2 > 1300) return 'shop';
    if (areaM2 > 430) return 'manor';
    return ['house1','house2','house3','house1','house2'][seed % 5];
  }
  const PROP_W = {  // [min, max, perSqrtArea] — sprite width in world px
    house1:[52,92,1.5], house2:[54,94,1.5], house3:[52,90,1.5], shed:[32,50,1.3], manor:[92,132,1.3],
    shop:[92,170,1.1], hall:[100,170,1.1], church:[96,120,1.0], apartment:[84,132,1.0]
  };

  function renderTerrainArt(elements, project, regionKeyStr, bounds){
    const L = { land:[], water:[], marks:[], lots:[], rail:[], roadCase:[], roadTop:[], pathCase:[], pathTop:[], bridge:[] };
    const props = [], parkCentroids = [], clearPolys = [];   // clearPolys: fields/courts trees must not stand on
    // gathered for the building and PumpkinStop passes at the end
    const roads = [], bldgs = [], noBuild = [], resPolys = [], farmPolys = [];
    const stopCands = [], poiAreas = [], parkAreas = [];
    const withBB = P=>{ let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; P.forEach(p=>{x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}); return {P,x0,y0,x1,y1}; };
    const rnd = seededRand(Array.from(String(regionKeyStr)).reduce((h,c)=>h*31+c.charCodeAt(0),7));
    const M2 = GPS_SCALE*GPS_SCALE;
    elements.forEach(el=>{
      if (el.type === 'poi'){ const q = project(el.lat, el.lon); stopCands.push({ x:q.x, y:q.y, pri:4, name:stopPoiName(el.tags), id:el.id }); return; }
      if (!el.geometry || el.geometry.length<2) return;
      const t = el.tags || {};
      let geom = el.geometry;
      if (geom.length > 80){
        const stride = Math.ceil(geom.length/80), thinned = [];
        for (let i=0;i<geom.length;i+=stride) thinned.push(geom[i]);
        if (thinned[thinned.length-1] !== geom[geom.length-1]) thinned.push(geom[geom.length-1]);
        geom = thinned;
      }
      const P = geom.map(pt=> project(pt.lat, pt.lon));
      const pts = P.map(p=> p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
      const closed = P.length>3 && Math.hypot(P[0].x-P[P.length-1].x, P[0].y-P[P.length-1].y) < 2;
      const poly = (fill, stroke, sw, extra)=> '<polygon points="'+pts+'" fill="'+fill+'"'+(stroke?' stroke="'+stroke+'" stroke-width="'+sw+'"':'')+(extra||'')+'/>';
      const line = (stroke, sw, extra)=> '<polyline points="'+pts+'" fill="none" stroke="'+stroke+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"'+(extra||'')+'/>';

      if (t.highway){
        if (t.tunnel==='yes' || t.area==='yes') return;
        const isBridge = !!t.bridge && t.bridge !== 'no';
        if (PATH_W[t.highway] !== undefined){
          const w = PATH_W[t.highway]; if (!w) return;
          roads.push({ P, half:w/2+2, path:true, hw:t.highway, name:t.name||'', id:el.id });
          if (isBridge){ woodenBridge(P, Math.max(w+6, 24)); return; }
          L.pathCase.push(line('#1d1823', w+5)); L.pathTop.push(line('url(#pat-flag)', w));
        } else {
          const w = ROAD_W[t.highway] || 48;
          roads.push({ P, half:w/2+6, path:false, hw:t.highway, name:t.name||'', id:el.id });
          if (isBridge){ woodenBridge(P, w); return; }
          L.roadCase.push(line('#16121c', w+12)); L.roadCase.push(line('#3b3446', w+6));
          L.roadTop.push(line('url(#pat-cobble)', w));
          if (w >= 56) L.roadTop.push(line('#ffd9a0', 1.6, ' stroke-opacity="0.18" stroke-dasharray="14 18"'));
        }
        return;
      }
      if (t.railway==='rail'){ L.rail.push(line('#2a2530', 16)); L.rail.push(line('#6f6878', 3.5, ' stroke-dasharray="3 7"')); L.rail.push(line('#9a93a6', 1.6)); return; }
      if (t.waterway){
        const w = t.waterway==='river' ? 30 : (t.waterway==='canal' ? 24 : 12);
        L.water.push(line('#22385a', w+6)); L.water.push(line('#35577f', w)); return;
      }
      if (!closed) return;
      const area = polyArea(P), areaM2 = area/M2;
      const poiNm = (t.leisure==='park' || t.leisure==='garden' || t.leisure==='playground') ? null : stopPoiName(t);
      if (poiNm){ const c = polyCentroid(P); poiAreas.push({ x:c.x, y:c.y, r:Math.sqrt(area/Math.PI), name:poiNm, id:el.id }); }
      if (t.building){
        L.lots.push(poly('#231d2e', '#4a405a', 3));
        const c = polyCentroid(P);
        bldgs.push({ x:c.x, y:c.y, r:Math.sqrt(area/Math.PI), area, areaM2, t, seed:Math.floor(rnd()*1e6), P });
        return;
      }
      // land-use areas that aren't drawn themselves
      if (t.landuse==='residential'){ resPolys.push(withBB(P)); return; }
      if (t.landuse==='farmland' || t.landuse==='farmyard'){ farmPolys.push(withBB(P)); return; }
      if (/^(commercial|retail|industrial)$/.test(t.landuse||'') || /^(school|college|university|hospital|kindergarten|place_of_worship)$/.test(t.amenity||'')){ noBuild.push(withBB(P)); return; }
      noBuild.push(withBB(P));   // everything below (water, fields, parks, woods, lots…) stays house-free
      if (t.natural==='water' || t.landuse==='reservoir' || t.leisure==='swimming_pool'){
        L.water.push(poly(t.leisure==='swimming_pool' ? '#3d86b8' : '#2c4a72', '#4a6f9e', 4)); return;
      }
      const sportTag = String(t.sport||'').toLowerCase();
      if (t.leisure==='pitch' || (/baseball|softball/.test(sportTag) && t.leisure!=='sports_centre' && t.leisure!=='park')){
        let sport = sportTag;
        const apex = ballFieldApex(P);
        if (!sport && apex) sport = 'baseball';       // untagged, but shaped like a ball field
        L.land.push(poly(/tennis|basketball/.test(sport) ? '#3c4a44' : '#3f7048', '#2c4a34', 3));
        L.marks.push(/baseball|softball/.test(sport) && apex ? ballFieldMarkings(apex) : pitchMarkings(P, sport));
        clearPolys.push(P);
        return;
      }
      if (t.landuse==='cemetery' || t.amenity==='grave_yard'){
        L.land.push(poly('#2f3f36', '#1c1a20', 5, ' stroke-dasharray="2 6"'));
        scatterInPoly(P, Math.min(22, Math.max(3, Math.round(areaM2/160))), rnd, 16).forEach(q=> props.push({ x:q.x, y:q.y, kind:'tomb', w:16+rnd()*7, seed:Math.floor(rnd()*1e6) }));
        scatterInPoly(P, Math.min(3, Math.round(areaM2/1500)), rnd, 40).forEach(q=> props.push({ x:q.x, y:q.y, kind:'deadtree', w:44+rnd()*14, seed:Math.floor(rnd()*1e6) }));
        return;
      }
      if (t.landuse==='forest' || t.natural==='wood'){
        L.land.push(poly('#24392f', '#1b2a23', 3));
        scatterInPoly(P, Math.min(28, Math.max(2, Math.round(areaM2/260))), rnd, 22).forEach(q=> props.push({ x:q.x, y:q.y, kind: rnd()<0.55 ? 'pine' : 'tree', w:38+rnd()*16, seed:Math.floor(rnd()*1e6) }));
        return;
      }
      if (t.amenity==='parking'){ L.land.push(poly('#27232d', '#3a3442', 3)); return; }
      if (t.leisure==='playground'){ L.land.push(poly('#6e5a3e', '#4a3b28', 3)); clearPolys.push(P); const c = polyCentroid(P); stopCands.push({ x:c.x, y:c.y, pri:3, name:String(t.name||'Playground').slice(0,40), id:el.id }); return; }
      if (t.leisure==='track'){ L.land.push(poly('#8a4234', '#5a2a22', 3)); return; }
      if (t.leisure==='park' || t.leisure==='garden' || t.leisure==='dog_park' || t.leisure==='golf_course' || t.leisure==='sports_centre' || t.leisure==='stadium'
          || /^(recreation_ground|grass|meadow|village_green)$/.test(t.landuse||'')){
        L.land.push(poly('#38584a', '#27403a', 3));
        if (t.leisure==='park' || t.leisure==='garden' || t.landuse==='recreation_ground'){
          parkCentroids.push(polyCentroid(P));
          parkAreas.push({ P, name:String(t.name||(t.leisure==='garden'?'Garden':'Park')).slice(0,40), id:el.id, areaM2 });
          scatterInPoly(P, Math.min(8, Math.max(1, Math.round(areaM2/1100))), rnd, 40).forEach(q=> props.push({ x:q.x, y:q.y, kind: rnd()<0.25 ? 'deadtree' : 'tree', w:44+rnd()*16, seed:Math.floor(rnd()*1e6) }));
        }
        return;
      }
    });
    placeBuildingProps();
    placePumpkinStops();
    // keep trees/tombs off ball fields, courts and playgrounds
    const isGreenery = k=> k==='tree' || k==='deadtree' || k==='pine';
    const inTile = pr=> !bounds || (pr.x >= bounds.x0 && pr.x < bounds.x1 && pr.y >= bounds.y0 && pr.y < bounds.y1);
    const keptProps = props.filter(pr=> inTile(pr) && (!isGreenery(pr.kind) || !clearPolys.some(P=> pointInPoly(pr.x, pr.y, P))));
    props.length = 0; keptProps.forEach(pr=> props.push(pr));
    const svg = L.land.join('') + L.water.join('') + L.marks.join('') + L.lots.join('') + L.rail.join('')
      + L.pathCase.join('') + L.roadCase.join('') + L.pathTop.join('') + L.roadTop.join('') + L.bridge.join('');
    return { svg, props, parkCentroids };

    // ---- wooden bridges ----
    // Any road or path the map marks as a bridge is drawn as a timber bridge: a shadow on
    // the water below, dark support beams, a plank deck (the planks run across the deck)
    // and a post-and-rail fence along both edges. Drawn last, so it passes over the water,
    // other roads and paths underneath.
    function offsetLine(P, d){
      const out = [];
      for (let i=0;i<P.length;i++){
        const a = P[Math.max(0,i-1)], b = P[Math.min(P.length-1,i+1)];
        let dx = b.x-a.x, dy = b.y-a.y; const l = Math.hypot(dx,dy) || 1; dx/=l; dy/=l;
        let k = 1;
        if (i>0 && i<P.length-1){
          const ax = P[i].x-P[i-1].x, ay = P[i].y-P[i-1].y, la = Math.hypot(ax,ay)||1;
          const cos = (ax*dx + ay*dy)/la; k = 1/Math.max(0.5, cos);
        }
        out.push({ x:P[i].x - dy*d*k, y:P[i].y + dx*d*k });
      }
      return out;
    }
    function woodenBridge(P, w){
      const ptsOf = Q=> Q.map(q=> q.x.toFixed(1)+','+q.y.toFixed(1)).join(' ');
      const pl = (Q, stroke, sw, extra)=> '<polyline points="'+ptsOf(Q)+'" fill="none" stroke="'+stroke+'" stroke-width="'+sw+'" stroke-linejoin="round"'+(extra||'')+'/>';
      L.bridge.push('<g transform="translate(5,9)" opacity="0.45">'+pl(P, '#05040a', w+16)+'</g>');
      L.bridge.push(pl(P, '#24160b', w+12));
      L.bridge.push(pl(P, '#8a5a30', w));
      L.bridge.push(pl(P, '#4f2f16', w, ' stroke-dasharray="1.6 5.2"'));
      L.bridge.push(pl(P, '#c08a52', w*0.82, ' stroke-dasharray="1 5.8" stroke-dashoffset="3.4" stroke-opacity="0.5"'));
      [-1,1].forEach(side=>{
        const R = offsetLine(P, side*(w/2 + 3));
        L.bridge.push(pl(R, '#2b1a0c', 6, ' stroke-linecap="round"'));
        L.bridge.push(pl(R, '#b07a44', 2, ' stroke-opacity="0.75" stroke-linecap="round"'));
        L.bridge.push(pl(R, '#1e1208', 9, ' stroke-dasharray="4 26"'));
      });
    }

    // ---- buildings: only what's really on the map ----
    // One standing building per real mapped building. A small untagged outbuilding right
    // beside a much bigger one (a detached garage or shed) stays a lot outline, so a home
    // with a garage doesn't show up as two houses.
    function placeBuildingProps(){
      bldgs.forEach(b=>{
        const kind = buildingKind(b.t, b.areaM2, b.seed);
        if (!kind) return;
        const untyped = String(b.t.building||'yes').toLowerCase() === 'yes';
        if ((kind==='shed' || (untyped && b.areaM2 < 70))
            && bldgs.some(o=> o!==b && o.areaM2 >= b.areaM2*2 && Math.hypot(o.x-b.x, o.y-b.y) < o.r + b.r + 8*GPS_SCALE)) return;
        const cfg = PROP_W[kind];
        const w = Math.max(cfg[0], Math.min(cfg[1], Math.sqrt(b.area)*cfg[2]));
        props.push({ x:b.x, y:b.y, kind, w, seed:b.seed });
      });
    }

    // ---- PumpkinStops ----
    // Landmarks (churches, libraries, monuments, public art, trail signs…), every
    // playground, the entrance of every park, and one on every named street. Nearby
    // candidates merge (landmarks win), so stops end up at least ~40 m apart.
    function placePumpkinStops(){
      const MP = GPS_SCALE;
      const segs = [];
      roads.forEach(r=>{ if (!r.path) for (let i=1;i<r.P.length;i++) segs.push({ a:r.P[i-1], b:r.P[i] }); });
      const nearestRoad = (x, y, list)=>{
        let best = null;
        for (const s of (list || segs)){
          const dx = s.b.x-s.a.x, dy = s.b.y-s.a.y, L2 = dx*dx+dy*dy;
          let u = L2 ? ((x-s.a.x)*dx+(y-s.a.y)*dy)/L2 : 0; u = Math.max(0, Math.min(1, u));
          const px = s.a.x+u*dx, py = s.a.y+u*dy, d = Math.hypot(x-px, y-py);
          if (!best || d < best.d) best = { x:px, y:py, d };
        }
        return best;
      };
      // landmark buildings/areas: the stop stands out front, toward the street
      poiAreas.forEach(a=>{
        const nr = nearestRoad(a.x, a.y);
        let x = a.x, y = a.y;
        if (nr && nr.d > 1){ const k = Math.min(a.r + 5*MP, nr.d*0.8)/nr.d; x = a.x + (nr.x-a.x)*k; y = a.y + (nr.y-a.y)*k; }
        stopCands.push({ x, y, pri:4, name:a.name, id:'a'+a.id });
      });
      // parks: at the entrance — the edge point closest to a street, a few steps inside
      parkAreas.forEach(pk=>{
        let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; pk.P.forEach(q=>{ x0=Math.min(x0,q.x); y0=Math.min(y0,q.y); x1=Math.max(x1,q.x); y1=Math.max(y1,q.y); });
        const pad = 60*MP;
        const near = segs.filter(s=> Math.max(s.a.x,s.b.x) > x0-pad && Math.min(s.a.x,s.b.x) < x1+pad && Math.max(s.a.y,s.b.y) > y0-pad && Math.min(s.a.y,s.b.y) < y1+pad);
        const c = polyCentroid(pk.P);
        let gate = null;
        if (near.length) pk.P.forEach(v=>{ const nr = nearestRoad(v.x, v.y, near); if (nr && (!gate || nr.d < gate.d)) gate = { x:v.x, y:v.y, d:nr.d }; });
        let x = c.x, y = c.y;
        if (gate){ const dx = c.x-gate.x, dy = c.y-gate.y, l = Math.hypot(dx,dy)||1, k = Math.min(10*MP, l*0.5)/l; x = gate.x + dx*k; y = gate.y + dy*k; }
        stopCands.push({ x, y, pri:3, name:pk.name, id:'p'+pk.id });
      });
      // one on every named street, at the middle of its longest stretch, on the roadside
      const STREET = /^(residential|living_street|unclassified|tertiary|secondary|primary|pedestrian|road)$/;
      const byName = new Map();
      roads.forEach(r=>{
        if (!r.name || (r.path && r.hw!=='pedestrian') || !STREET.test(r.hw)) return;
        let len = 0; for (let i=1;i<r.P.length;i++) len += Math.hypot(r.P[i].x-r.P[i-1].x, r.P[i].y-r.P[i-1].y);
        const cur = byName.get(r.name);
        if (!cur || len > cur.len) byName.set(r.name, { r, len });
      });
      byName.forEach(({ r, len }, name)=>{
        if (len < 40*MP) return;
        let acc = 0, target = len/2;
        for (let i=1;i<r.P.length;i++){
          const a = r.P[i-1], b = r.P[i], sl = Math.hypot(b.x-a.x, b.y-a.y);
          if (acc + sl >= target && sl > 0){
            const u = (target-acc)/sl, px = a.x+(b.x-a.x)*u, py = a.y+(b.y-a.y)*u;
            const nx = -(b.y-a.y)/sl, ny = (b.x-a.x)/sl;
            let h = 0; for (const ch of name) h = (h*31 + ch.charCodeAt(0))|0;
            const side = (h & 1) ? 1 : -1, off = r.half + 4*MP;
            stopCands.push({ x:px+nx*side*off, y:py+ny*side*off, alt:{ x:px-nx*side*off, y:py-ny*side*off }, pri:1, name, id:'s'+r.id });
            break;
          }
          acc += sl;
        }
      });
      const inTileB = q=> !bounds || (q.x >= bounds.x0 && q.x < bounds.x1 && q.y >= bounds.y0 && q.y < bounds.y1);
      const onBuilding = q=> bldgs.some(b=> Math.hypot(b.x-q.x, b.y-q.y) < b.r*2.5 + 3*MP && (pointInPoly(q.x, q.y, b.P) || Math.hypot(b.x-q.x, b.y-q.y) < Math.min(b.r, 6*MP)));
      const kept = [];
      stopCands.sort((a,b)=> (b.pri-a.pri) || String(a.id).localeCompare(String(b.id))).forEach(c=>{
        let q = c;
        if (onBuilding(q) && c.alt) q = c.alt;
        if (!inTileB(q) || onBuilding(q)) return;
        if (kept.some(k=> Math.hypot(k.x-q.x, k.y-q.y) < 40*MP)) return;
        kept.push({ x:q.x, y:q.y, name:c.name, id:c.id });
      });
      kept.forEach(k=> props.push({ x:k.x, y:k.y, kind:'pstop', w:64, seed:Math.floor(rnd()*1e6), stop:{ id:String(k.id), name:k.name } }));
    }

  }

  // ---------------- SESSION SETUP (runs once per anchor) ----------------
  function buildWorld(){
    $('#terrain-svg').innerHTML = '';
    ensureTerrainDefs();
    clearMapProps();
    $('#deco-layer').innerHTML = '';
    $('#toto-layer').innerHTML = '';
    $('#gym-layer').innerHTML = '';
    state.wildTotos = [];
    state.gyms = [];
    state.loadedChunks = new Set();
    state.chunkEls = new Map();
    state.regionEls = new Map();
    state.regionPromises = new Map();
    chunkQueue = []; chunkQueueSet = new Set();

    const {lat, lon} = state.geoAnchor;
    const baseSeed = Math.abs(Math.floor((lat*10000) + (lon*10000)));

    // Challenger shrines: fixed, named guardians for the whole session, always
    // battle-ready from anywhere — deliberately NOT placed on the map, only reachable
    // through the Challenger tab.
    state.shrines = [
      { id:uid(), guardian: makeWitchHana(),         name: "Hana's Village" },
      { id:uid(), guardian: makeMax(),                name: "Max's Domain" },
      { id:uid(), guardian: makeToniGuardian(),      name: "Toni's Hollow" },
      { id:uid(), guardian: makeVesperNightshade(),   name: 'Nightshade Manor' },
      { id:uid(), guardian: makeHarvestWarden(),      name: 'Harvest Hollow' },
      { id:uid(), guardian: makeBlossomWraith(),      name: 'Wraith Garden' },
      { id:uid(), guardian: makeShadowSovereign(),    name: "Sovereign's Keep" },
      { id:uid(), guardian: makeGrimhollow(),         name: 'Ashen Shrine' },
      { id:uid(), guardian: makePumpkinRider(),       name: 'Hollow Crossing' },
      { id:uid(), guardian: makePandaQueen(),         name: 'Hexwood Grove' }
    ];
    renderChallenger(); renderBattleList();

    ensureChunksLoaded();
    spawnStartingTotosNearPlayer();
  }

  function spawnClouds(){
    const c = $('#clouds'); c.innerHTML='';
    // Soft drifting mist puffs drawn in CSS (the old emoji clouds — the fog emoji in
    // particular — rendered as grey square tiles on Android).
    for (let i=0;i<3;i++){ const el=document.createElement('div'); el.className='cloud mist'; el.style.top=(6+i*16)+'%'; el.style.width=(140+i*45)+'px'; el.style.height=(50+i*14)+'px'; el.style.animationDuration=(34+i*10)+'s'; el.style.animationDelay=(-i*9)+'s'; c.appendChild(el); }
    const ghost = document.createElement('div'); ghost.className='cloud ghost'; ghost.textContent='👻'; ghost.style.top='30%'; ghost.style.animationDuration='26s'; ghost.style.animationDelay='-4s'; c.appendChild(ghost);
  }


  // ---------------- NAV ----------------
  function closeQuickMenu(){ $('#quick-menu').classList.remove('show'); $('#quick-menu-backdrop').classList.remove('show'); }
  function toggleQuickMenu(){
    const open = $('#quick-menu').classList.toggle('show');
    $('#quick-menu-backdrop').classList.toggle('show', open);
  }
  $('#btn-menu').onclick = toggleQuickMenu;
  $('#quick-menu-backdrop').onclick = closeQuickMenu;
  // Shared by the quick-menu nav buttons AND the HUD avatar's own little
  // Customize/Profile popup (see below) — one place that knows how to switch
  // which full-screen panel is showing, so both entry points stay in sync.
  function openGamePanel(tab){
    // Leaving the wardrobe panel stops its own little rotating-preview WebGL loop rather
    // than leaving it spinning forever in the background once the panel's hidden.
    if (tab!=='wardrobe'){
      const wc = $('#wardrobe-preview-canvas');
      if (wc && wc.__wardrobe3d){ wc.__wardrobe3d.dispose(); wc.__wardrobe3d = null; }
    }
    $$('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    if (tab==='map'){ $$('.panel-screen').forEach(p=>p.classList.remove('active')); return; }
    $$('.panel-screen').forEach(p=>p.classList.toggle('active', p.dataset.panel===tab));
    if (tab==='totos') renderCollection();
    if (tab==='items'){ healPickOpen = false; renderItems(); }
    if (tab==='dex') renderDex();
    if (tab==='challenger') renderChallenger();
    if (tab==='battle') renderBattleList();
    if (tab==='profile') refreshHUD();
    if (tab==='wardrobe') renderWardrobe();
  }
  $$('.nav-btn').forEach(btn=>{
    btn.onclick = ()=>{
      closeQuickMenu();
      openGamePanel(btn.dataset.tab);
    };
  });
  $$('[data-close]').forEach(x=> x.onclick = ()=> openGamePanel('map'));

  // ---------------- WARDROBE (character customization) ----------------
  let wardrobeUi = { slot:'hat', selectedId:null, closeUp:false };
  const SLOT_ICON = { hat:'🧙', top:'👕', legwear:'🧦', shoes:'🥾', accessory:'🪄' };
  const SLOT_FOCUS = { hat:'head', top:'torso', legwear:'legs', shoes:'feet', accessory:'full' };
  function wardrobePreview(){ const c = $('#wardrobe-preview-canvas'); return c && c.__wardrobe3d; }
  // what the preview shows: the item you've tapped, even before you equip it
  function wardrobeOverrides(){
    const sel = wardrobeUi.selectedId, eq = wardrobeEquippedId(wardrobeUi.slot);
    return (sel && sel !== eq) ? { [wardrobeUi.slot]: sel } : null;
  }
  function updateTryOnLabel(){
    const el = $('#wardrobe-tryon'); if (!el) return;
    const ov = wardrobeOverrides();
    if (!ov){ el.style.display = 'none'; return; }
    const item = (COSMETIC_CATALOG[wardrobeUi.slot]||[]).find(i=> i.id===wardrobeUi.selectedId);
    el.textContent = '👀 Trying on: '+item.name+(ownsCosmetic(item) ? '' : ' 🔒');
    el.style.display = '';
  }
  function refreshWardrobePreview(){
    if (window.rebuildWardrobePreview3D) window.rebuildWardrobePreview3D($('#wardrobe-preview-canvas'), state.avatar, wardrobeOverrides());
    updateTryOnLabel();
  }
  function wardrobeView(view){
    const pv = wardrobePreview(); if (pv) pv.setView(view);
    $$('#wardrobe-view-btns button').forEach(b=> b.classList.toggle('on', b.dataset.view===view));
  }
  function wardrobeFocus(){
    const pv = wardrobePreview(); if (pv) pv.setFocus(wardrobeUi.closeUp ? SLOT_FOCUS[wardrobeUi.slot] : 'full');
    const z = $('#wardrobe-zoom'); if (z){ z.classList.toggle('on', wardrobeUi.closeUp); z.textContent = wardrobeUi.closeUp ? '🧍 Whole body' : '🔍 Close-up'; }
  }
  $$('#wardrobe-view-btns button').forEach(b=> b.onclick = ()=> wardrobeView(b.dataset.view));
  $('#wardrobe-zoom').onclick = ()=>{ wardrobeUi.closeUp = !wardrobeUi.closeUp; wardrobeFocus(); };
  const WARDROBE_SLOTS = ['hat','top','legwear','shoes','accessory'];
  function wardrobeEquippedId(slot){
    const items = COSMETIC_CATALOG[slot] || [];
    return (state.equippedCosmetics||{})[slot] || (items[0] && items[0].id);
  }
  function renderWardrobeTabs(){
    const tabsEl = $('#wardrobe-tabs'); if (!tabsEl) return;
    tabsEl.innerHTML = '';
    WARDROBE_SLOTS.forEach(slot=>{
      const b = document.createElement('button');
      b.className = 'wardrobe-tab-btn' + (slot===wardrobeUi.slot ? ' active' : '');
      b.textContent = COSMETIC_SLOT_LABEL[slot] || slot;
      b.onclick = ()=>{ wardrobeUi.slot = slot; wardrobeUi.selectedId = null; wardrobeUi.closeUp = true; renderWardrobeTabs(); renderWardrobeGrid(); refreshWardrobePreview(); wardrobeFocus(); wardrobeView('front'); };
      tabsEl.appendChild(b);
    });
  }
  function renderWardrobeGrid(){
    const gridEl = $('#wardrobe-grid'); if (!gridEl) return;
    gridEl.innerHTML = '';
    const items = COSMETIC_CATALOG[wardrobeUi.slot] || [];
    const equippedId = wardrobeEquippedId(wardrobeUi.slot);
    if (!wardrobeUi.selectedId) wardrobeUi.selectedId = equippedId;
    items.forEach(item=>{
      const owned = ownsCosmetic(item);
      const card = document.createElement('div');
      card.className = 'wardrobe-item-card' + (item.id===wardrobeUi.selectedId?' sel':'') + (!owned?' locked':'');
      const icon = item.thumb ? '<img class="wi-thumb" src="'+item.thumb+'" alt="">' + (owned ? '' : '<span class="wi-lock">🔒</span>') : (owned ? (SLOT_ICON[wardrobeUi.slot]||'👕') : '🔒');
      card.innerHTML = '<div class="wi-icon">'+icon+'</div><div class="wi-name">'+item.name+'</div>' + (item.id===equippedId?'<div class="wi-equipped-tag">Worn</div>':'');
      card.onclick = ()=>{
        wardrobeUi.selectedId = item.id; wardrobeUi.closeUp = true;
        renderWardrobeGrid(); refreshWardrobePreview(); wardrobeFocus(); wardrobeView('front');
      };
      gridEl.appendChild(card);
    });
    renderWardrobeDetail();
  }
  function renderWardrobeDetail(){
    const detailEl = $('#wardrobe-detail'), equipBtn = $('#btn-wardrobe-equip');
    if (!detailEl || !equipBtn) return;
    const items = COSMETIC_CATALOG[wardrobeUi.slot] || [];
    const item = items.find(i=>i.id===wardrobeUi.selectedId) || items[0];
    if (!item){ detailEl.innerHTML=''; equipBtn.disabled = true; return; }
    const owned = ownsCosmetic(item);
    const equippedId = wardrobeEquippedId(wardrobeUi.slot);
    const worn = items.find(i=> i.id===equippedId);
    detailEl.innerHTML = '<b>ITEM:</b> '+item.name+'<br><b>RARITY:</b> '+item.rarity+'<br><b>DESCRIPTION:</b> '+item.description
      + (owned ? '' : '<br><span style="color:#c0392b; font-weight:800;">🔒 Unlocks at trainer Level 100 — you can still try it on here</span>');
    const alreadyWorn = item.id===equippedId;
    equipBtn.disabled = !owned || alreadyWorn;
    equipBtn.textContent = alreadyWorn ? 'Wearing it' : ('Equip'+(worn ? ' (replaces '+worn.name+')' : ''));
    equipBtn.style.opacity = equipBtn.disabled ? '0.55' : '1';
  }
  function equipSelectedWardrobeItem(){
    const items = COSMETIC_CATALOG[wardrobeUi.slot] || [];
    const item = items.find(i=>i.id===wardrobeUi.selectedId);
    if (!item || !ownsCosmetic(item)) return;
    state.equippedCosmetics = state.equippedCosmetics || {};
    const before = (COSMETIC_CATALOG[wardrobeUi.slot]||[]).find(i=> i.id===wardrobeEquippedId(wardrobeUi.slot));
    state.equippedCosmetics[wardrobeUi.slot] = item.id;      // one item per slot: the new one replaces the old
    markDirty(); saveNow(false);
    if (window.mountPlayer3D) window.mountPlayer3D(state.avatar); // keep the map/HUD avatar in sync
    if (window.rebuildWardrobePreview3D) window.rebuildWardrobePreview3D($('#wardrobe-preview-canvas'), state.avatar);
    renderWardrobeGrid(); updateTryOnLabel();
    showToast('Equipped: '+item.name+(before && before.id !== item.id ? ' (replaced '+before.name+')' : ''));
  }
  function renderWardrobe(){
    wardrobeUi = { slot:'hat', selectedId:null, closeUp:false };
    renderWardrobeTabs();
    renderWardrobeGrid();
    if (window.mountWardrobePreview3D) window.mountWardrobePreview3D($('#wardrobe-preview-canvas'), state.avatar);
    updateTryOnLabel(); wardrobeFocus(); wardrobeView('spin');
  }
  $('#btn-wardrobe-equip').onclick = equipSelectedWardrobeItem;
  $('#btn-wardrobe-exit').onclick = ()=> openGamePanel('map');

  // ---------------- TRANSFER (release Totos for candy, multi-select) ----------------
  let transferMode = false;
  let transferSelected = new Set();
  const TIER_TRANSFER_BASE = { normal:3, legendary:20, mythical:60, eternal:200 };
  function transferRewardFor(t){
    const base = TIER_TRANSFER_BASE[t.tier] || TIER_TRANSFER_BASE.normal;
    return Math.round(base * (1 + (t.level-1)*0.08));
  }
  function updateTransferBar(){
    const bar = $('#transfer-bar');
    if (!transferMode){ bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    const ids = [...transferSelected];
    const totos = state.collection.filter(t=> ids.includes(t.id));
    const reward = totos.reduce((sum,t)=> sum + transferRewardFor(t), 0);
    $('#transfer-count').textContent = ids.length+' selected';
    $('#transfer-reward').innerHTML = ids.length ? ('+'+reward+' '+candyIconHtml(13)+' if transferred') : 'Tap Totos below to select them';
    $('#btn-transfer-confirm').disabled = ids.length===0;
  }
  $('#btn-transfer-mode').onclick = ()=>{
    transferMode = !transferMode; transferSelected.clear();
    $('#btn-transfer-mode').classList.toggle('active', transferMode);
    renderCollection();
  };
  $('#btn-transfer-cancel').onclick = ()=>{
    transferMode = false; transferSelected.clear();
    $('#btn-transfer-mode').classList.remove('active');
    renderCollection();
  };
  $('#btn-transfer-confirm').onclick = async ()=>{
    const ids = [...transferSelected];
    if (!ids.length) return;
    const totos = state.collection.filter(t=> ids.includes(t.id));
    const reward = totos.reduce((sum,t)=> sum + transferRewardFor(t), 0);
    if (!(await gameConfirm('Transfer '+ids.length+' Toto'+(ids.length===1?'':'s')+' for '+reward.toLocaleString()+' candy? This can\'t be undone.', 'Transfer Totos', 'Transfer'))) return;
    state.collection = state.collection.filter(t=> !ids.includes(t.id));
    state.candy += reward;
    transferMode = false; transferSelected.clear();
    $('#btn-transfer-mode').classList.remove('active');
    refreshHUD(); markDirty(); saveNow(false); renderCollection();
    showToast('Transferred '+ids.length+' Toto'+(ids.length===1?'':'s')+' for '+reward+' candy!');
  };
  // Strongest-first / weakest-first, by PWR (ties broken by level). The choice is
  // remembered with the rest of your save.
  $$('#toto-sort-bar .sort-btn').forEach(b=> b.onclick = ()=>{ state.totoSort = b.dataset.sort; markDirty(); renderCollection(); });
  function renderCollection(){
    const grid = $('#toto-collection'); grid.innerHTML='';
    const dir = state.totoSort==='asc' ? 'asc' : 'desc';
    $$('#toto-sort-bar .sort-btn').forEach(b=> b.classList.toggle('on', b.dataset.sort===dir));
    if (state.collection.length===0){ grid.innerHTML = '<p style="grid-column:1/-1; color:#999; font-weight:700; font-size:13px;">No Totos yet — battle a wild Toto on the map to catch one.</p>'; updateTransferBar(); return; }
    const sign = dir==='asc' ? 1 : -1;
    state.collection.slice().sort((a,b)=> sign*((a.cp-b.cp) || ((a.level||1)-(b.level||1)))).forEach(t=>{
      const card = document.createElement('div'); card.className='toto-card'+(transferMode?' transfer-mode':'')+(transferSelected.has(t.id)?' transfer-selected':'');
      card.style.position = 'relative';
      const ri = ROLE_INFO[t.role] || ROLE_INFO.attacker;
      card.innerHTML = '<div class="sp'+glowClassFor(t.tier)+'">'+spriteMarkup(t)+'</div><div class="nm">'+t.name+'</div>'
        + '<div class="role-badge" style="color:'+ri.color+';">'+ri.icon+' '+ri.label+'</div>'
        + '<div class="lv">Lv.'+t.level+'</div><div class="cp">PWR '+t.cp+'</div><div class="tier-badge tier-'+t.tier+'">'+t.tier+'</div>'
        + (transferMode ? '<div class="transfer-check">'+(transferSelected.has(t.id)?'✓':'')+'</div>' : '')
        + (!transferMode && learnableAbilities(t).length ? '<div class="new-move-badge">✨ NEW ABILITY</div>' : '')
        + (hpOf(t) < t.maxHp ? '<div class="hp-mini"><div style="width:'+Math.round(hpOf(t)/Math.max(1,t.maxHp)*100)+'%;background:'+hpColor(Math.round(hpOf(t)/Math.max(1,t.maxHp)*100))+'"></div></div>'+(hpOf(t)<=0 ? '<div class="fainted-tag">💤 Fainted</div>' : '') : '');
      card.onclick = ()=>{
        if (transferMode){
          if (transferSelected.has(t.id)) transferSelected.delete(t.id); else transferSelected.add(t.id);
          renderCollection();
        } else {
          openDetail(t.id);
        }
      };
      grid.appendChild(card);
    });
    updateTransferBar();
  }
  function dexCardHtml(name, sprite, owned){
    if (owned){
      return '<div class="dex-card owned"><div class="sp'+glowClassFor(owned.tier)+'">'+sprite+'</div><div class="nm">'+name+'</div><div class="cp">PWR '+owned.cp+'</div></div>';
    }
    return '<div class="dex-card unowned"><div class="sp">❓</div><div class="nm">???</div></div>';
  }
  function renderDex(){
    const body = $('#dex-body');
    function bestFor(name, tier){
      const matches = state.collection.filter(t=>t.name===name && t.tier===tier);
      return matches.length ? matches.sort((a,b)=>b.cp-a.cp)[0] : null;
    }
    const ETERNAL_ROSTER = [
      { name:'Witch Hana', sprite:HANA_IMG },
      { name:'Max', sprite:MAX_IMG },
      { name:'Toni', sprite:TONI_SVG },
      { name:'Vesper Nightshade', sprite:VESPER_IMG },
      { name:'Harvest Warden', sprite:HARVEST_IMG },
      { name:'Blossom Wraith', sprite:BLOSSOM_IMG },
      { name:'Shadow Sovereign', sprite:SOVEREIGN_IMG },
      { name:'Grimhollow', sprite:GRIMHOLLOW_SVG },
      { name:'Pumpkin Rider', sprite:PUMPKIN_RIDER_SVG },
      { name:'PandaQueen', sprite:PANDAQUEEN_SVG }
    ];
    let caughtCount = 0, totalCount = ETERNAL_ROSTER.length + DEX_SPECIES.length*2 + LEGENDARY_DEX.length;
    let html = '<div class="dex-tier-header">👑 Eternal</div><div class="dex-grid">';
    ETERNAL_ROSTER.forEach(e=>{
      const owned = e.name==='Toni' ? state.collection.find(t=>t.isToni) : state.collection.find(t=>t.name===e.name);
      if (owned) caughtCount++;
      html += dexCardHtml(e.name, e.sprite, owned);
    });
    html += '</div>';
    ['mythical','legendary','normal'].forEach(tier=>{
      const label = {mythical:'💜 Mythical', legendary:'💙 Legendary', normal:'💚 Normal'}[tier];
      const list = tier==='legendary' ? LEGENDARY_DEX : DEX_SPECIES;
      html += '<div class="dex-tier-header">'+label+'</div><div class="dex-grid">';
      list.forEach(sp=>{
        const owned = bestFor(sp.name, tier);
        if (owned) caughtCount++;
        html += dexCardHtml(sp.name, sp.sprite, owned);
      });
      html += '</div>';
    });
    body.innerHTML = '<p style="font-weight:800; font-size:12.5px; color:#777; margin-bottom:10px;">'+caughtCount+' / '+totalCount+' discovered</p>' + html;
  }
  function gymRowHtml(g){
    const distM = state.geoAnchor ? Math.round(distanceMetersToWorldPoint(g.x, g.y)) : 0;
    const inRange = distM <= GYM_RADIUS_M;
    return '<div class="toto-card shrine-row" data-gym="'+g.id+'">'+
      '<div class="sp'+glowClassFor(g.boss.tier)+'">'+spriteMarkup(g.boss)+'</div>'+
      '<div class="info"><div class="nm" style="font-size:13px;">'+g.name+'</div><div class="cp">'+g.boss.name+' · PWR '+g.boss.cp+' · '+g.boss.tier+'</div></div>'+
      '<div><span class="range-tag '+(inRange?'range-in':'range-out')+'">'+distM+'m '+(inRange?'· In range':'· Too far')+'</span></div>'+
    '</div>';
  }
  function shrineRowHtml(sh){
    return '<div class="toto-card shrine-row" data-shrine="'+sh.id+'">'+
      '<div class="sp'+glowClassFor(sh.guardian.tier)+'">'+spriteMarkup(sh.guardian)+'</div>'+
      '<div class="info"><div class="nm" style="font-size:13px;">'+sh.name+'</div><div class="cp">Guardian: '+sh.guardian.name+' · PWR '+sh.guardian.cp+'</div></div>'+
      '<div><span class="range-tag range-in">Always ready</span></div>'+
    '</div>';
  }
  function renderChallenger(){
    const list = $('#challenger-list'); if (!list) return; list.innerHTML='';
    (state.shrines||[]).forEach(sh=>{ list.insertAdjacentHTML('beforeend', shrineRowHtml(sh)); });
    $$('.shrine-row[data-shrine]', list).forEach(row=>{
      const sh = (state.shrines||[]).find(s=>s.id===row.dataset.shrine);
      row.onclick = ()=> openBattleSetup({ type:'challenge', shrine: sh });
    });
  }
  function renderBattleList(){
    const list = $('#battle-shrine-list'); if (!list) return; list.innerHTML='';
    if (!state.gyms || state.gyms.length===0){ list.innerHTML = '<p style="color:#999; font-weight:700; font-size:13px;">Walk around to discover nearby gyms…</p>'; return; }
    state.gyms.slice().sort((a,b)=> distanceMetersToWorldPoint(a.x,a.y) - distanceMetersToWorldPoint(b.x,b.y)).slice(0,10).forEach(g=>{
      list.insertAdjacentHTML('beforeend', gymRowHtml(g));
    });
    $$('.shrine-row[data-gym]', list).forEach(row=>{
      const g = (state.gyms||[]).find(x=>x.id===row.dataset.gym);
      row.onclick = ()=> tryStartGymRaid(g);
    });
  }

  // ---------------- ITEMS ----------------
  const ITEM_INFO = {
    raidPass: { name:'Pumpkin Raid Pass', short:'Raid Pass', img:'assets/items/raid-pass.png',
      desc:'Lets you battle a Gym champion. Walk up to a Gym (a pumpkin tower on the map) and tap it — one pass is used when the battle starts.',
      how:'Spin PumpkinStops (your first spin each day always has one).' },
    elixir: { name:"Witch's Brew Healing Elixir", short:'Healing Elixir', img:'assets/items/elixir.png',
      desc:'Totos keep their injuries after a battle. One elixir heals a Toto back to full health — even one that fainted.',
      how:'Spin PumpkinStops.' }
  };
  // every trainer starts with a few (older saves get them once too)
  function ensureItems(){
    if (!state.items || typeof state.items !== 'object') state.items = { raidPass:3, elixir:5 };
    ['raidPass','elixir'].forEach(k=>{ if (typeof state.items[k] !== 'number') state.items[k] = 0; });
    return state.items;
  }
  function hpOf(t){ return (t.hp != null && isFinite(t.hp)) ? Math.max(0, Math.min(t.maxHp, Math.round(t.hp))) : t.maxHp; }
  function hpColor(pct){ return pct > 50 ? '#3fbf6a' : pct > 20 ? '#f0a020' : '#e04848'; }
  function hurtTotos(){ return state.collection.filter(t=> hpOf(t) < t.maxHp).sort((a,b)=> hpOf(a)/a.maxHp - hpOf(b)/b.maxHp); }
  let healPickOpen = false;
  function healRowHtml(t){
    const hp = hpOf(t), pct = Math.round(hp/Math.max(1,t.maxHp)*100);
    return '<div class="heal-pick-row" data-id="'+t.id+'"><div class="hp-sp">'+spriteMarkup(t)+'</div><div class="hp-info"><div class="hp-nm">'+t.name+' <span>Lv.'+t.level+'</span></div>'
      + '<div class="hp-bar"><div style="width:'+pct+'%;background:'+hpColor(pct)+'"></div></div><div class="hp-num">'+(hp<=0?'💤 Fainted · ':'')+hp+' / '+t.maxHp+' HP</div></div><div class="hp-go">🧪</div></div>';
  }
  function renderItems(){
    const it = ensureItems(), el = $('#items-list'); if (!el) return;
    el.innerHTML = ['raidPass','elixir'].map(k=>{
      const I = ITEM_INFO[k], n = it[k]||0;
      let extra = '';
      if (k==='elixir'){
        const hurt = hurtTotos();
        extra = '<button class="item-use" data-use="elixir"'+(n && hurt.length ? '' : ' disabled')+'>'+(hurt.length ? (healPickOpen ? 'Cancel' : 'Use') : 'All your Totos are healthy')+'</button>';
        if (healPickOpen && n && hurt.length) extra += '<div class="heal-pick"><div class="heal-pick-title">Heal which Toto?</div>'+hurt.map(healRowHtml).join('')+'</div>';
      }
      return '<div class="item-card" data-item="'+k+'"><img class="item-img" src="'+I.img+'" alt=""><div class="item-info"><div class="item-name">'+I.name+'<span class="item-count">×'+n+'</span></div>'
        + '<div class="item-desc">'+I.desc+'</div><div class="item-how">Get more: '+I.how+'</div>'+extra+'</div></div>';
    }).join('');
    $$('[data-use="elixir"]', el).forEach(b=> b.onclick = ()=>{ healPickOpen = !healPickOpen; renderItems(); });
    $$('.heal-pick-row', el).forEach(r=> r.onclick = ()=> useElixirOn(r.dataset.id));
  }
  function useElixirOn(id){
    const t = state.collection.find(x=>x.id===id), it = ensureItems();
    if (!t) return;
    if (!it.elixir){ showToast('No Healing Elixirs left — spin PumpkinStops for more.'); return; }
    it.elixir--; t.hp = t.maxHp;
    Sound.playCatch && Sound.playCatch();
    showToast('🧪 '+t.name+' is fully healed! ('+it.elixir+' left)');
    if (!hurtTotos().length) healPickOpen = false;
    markDirty(); saveNow(false); renderItems(); renderCollection();
    if (detailTarget && detailTarget.id===id && $('#detail-modal').classList.contains('active')) openDetail(id);
  }
  // A Toto keeps whatever damage it took once the battle's over (heal it with an elixir).
  function saveBattleHp(){
    if (!battle || battle.hpSaved || !battle.player || !battle.player.ref) return;
    battle.hpSaved = true;
    const t = state.collection.find(x=> x.id === battle.player.ref.id); if (!t) return;
    t.hp = Math.max(0, Math.min(t.maxHp, Math.round(battle.player.hp)));
    markDirty(); renderCollection();
    if (t.hp < t.maxHp) setTimeout(()=> showToast(t.hp <= 0 ? ('💤 '+t.name+' fainted — heal it with a Healing Elixir (Items)') : ('❤️ '+t.name+' has '+t.hp+'/'+t.maxHp+' HP — heal it in Items')), 2700);
  }

  // ---------------- PUMPKINSTOPS ----------------
  // Real landmarks, park entrances and one on every street (placed from the map data, see
  // placePumpkinStops). Walk within 40 m and spin one: 5 candy every time, usually a
  // Healing Elixir, sometimes a Raid Pass (always on your first spin of the day). One spin
  // every 10 minutes, at any stop.
  const STOP_RADIUS_M = 40, STOP_COOLDOWN_MS = 10*60*1000;
  function stopCooldownLeft(){ return Math.max(0, (state.stopCooldownUntil||0) - Date.now()); }
  function syncStopRest(){ window.__stopRestingUntil = state.stopCooldownUntil || 0; }
  function fmtMS(ms){ const s = Math.ceil(ms/1000); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  function allStops(){ const out = []; window.__mapProps.groups.forEach(list=> list.forEach(pr=>{ if (pr.stop) out.push(pr); })); return out; }
  function nearestStop(){
    if (!state.playerWorldPos) return null;
    let best = null, bd = Infinity;
    allStops().forEach(pr=>{ const d = distanceMetersToWorldPoint(pr.x, pr.y); if (d < bd){ bd = d; best = pr; } });
    return best ? { pr:best, d:bd } : null;
  }
  window.__nearestStop = nearestStop;
  let openStop = null, stopTimer = null;
  function renderStopModal(){
    if (!openStop) return;
    const d = distanceMetersToWorldPoint(openStop.x, openStop.y), left = stopCooldownLeft(), btn = $('#btn-stop-spin');
    $('#stop-sub').textContent = Math.round(d)+' m away';
    const src = (left && !openStop.spun) ? 'assets/stops/stop-rest.png' : 'assets/stops/stop.png';
    if ($('#stop-img').getAttribute('src') !== src) $('#stop-img').setAttribute('src', src);
    if (openStop.spun){ btn.disabled = true; btn.textContent = 'Spun!'; }
    else if (left){ btn.disabled = true; btn.textContent = '⏳ '+fmtMS(left); $('#stop-msg').textContent = 'You can spin 1 PumpkinStop every 10 minutes — next spin in '+fmtMS(left)+'.'; }
    else if (d > STOP_RADIUS_M){ btn.disabled = true; btn.textContent = 'Too far'; $('#stop-msg').textContent = 'Walk within '+STOP_RADIUS_M+' m of it to spin.'; }
    else { btn.disabled = false; btn.textContent = '🎃 Spin'; $('#stop-msg').textContent = 'Spin it for candy and items!'; }
    btn.style.opacity = btn.disabled ? '0.55' : '1';
  }
  window.__openPumpkinStop = pr=>{
    openStop = { x:pr.x, y:pr.y, id:pr.stop.id, name:pr.stop.name, spun:false };
    $('#stop-name').textContent = pr.stop.name; $('#stop-rewards').innerHTML = ''; $('#stop-msg').textContent = '';
    renderStopModal();
    $('#stop-modal').classList.add('active');
    clearInterval(stopTimer);
    stopTimer = setInterval(()=>{ if (!$('#stop-modal').classList.contains('active')){ clearInterval(stopTimer); return; } renderStopModal(); }, 1000);
  };
  $$('[data-close-stop]').forEach(b=> b.onclick = ()=>{ $('#stop-modal').classList.remove('active'); openStop = null; });
  $('#btn-stop-spin').onclick = ()=>{
    if (!openStop || openStop.spun) return;
    if (stopCooldownLeft() || distanceMetersToWorldPoint(openStop.x, openStop.y) > STOP_RADIUS_M){ renderStopModal(); return; }
    openStop.spun = true;
    const img = $('#stop-img'); img.classList.remove('spin'); void img.offsetWidth; img.classList.add('spin');
    const today = new Date().toDateString();
    const got = [{ k:'candy', n:5 }];
    if (Math.random() < 0.7) got.push({ k:'elixir', n:1 });
    if (state.lastPassDay !== today || Math.random() < 0.25){ got.push({ k:'raidPass', n:1 }); state.lastPassDay = today; }
    const it = ensureItems();
    state.candy += 5;
    got.forEach(g=>{ if (g.k !== 'candy') it[g.k] = (it[g.k]||0) + g.n; });
    state.stopCooldownUntil = Date.now() + STOP_COOLDOWN_MS; syncStopRest();
    state.stopSpins = (state.stopSpins||0) + 1;
    refreshHUD(); markDirty(); saveNow(false);
    renderStopModal();
    setTimeout(()=>{
      Sound.playCatch && Sound.playCatch();
      $('#stop-rewards').innerHTML = got.map((g,i)=> '<div class="stop-reward" style="animation-delay:'+(i*0.14)+'s">'
        + (g.k==='candy' ? '<span class="ic">'+candyIconHtml(40)+'</span>' : '<img src="'+ITEM_INFO[g.k].img+'" alt="">')
        + '<span>+'+g.n+' '+(g.k==='candy' ? 'Candy' : ITEM_INFO[g.k].short)+'</span></div>').join('');
      $('#stop-msg').textContent = 'Next spin in 10:00 — at any PumpkinStop.';
    }, 950);
  };

  // ---------------- PROXIMITY GATES ----------------
  let pendingCatch = null;
  function tryStartEncounter(t){
    const distM = distanceMetersToWorldPoint(t._x, t._y);
    if (distM > WILD_RADIUS_M){ showToast('Too far ('+Math.round(distM)+'m) — get within '+WILD_RADIUS_M+'m of it.'); return; }
    pendingCatch = t;
    $('#enc-sprite').innerHTML = spriteMarkup(t); $('#enc-name').textContent = t.name;
    const sub = ()=>{
      const left = Math.max(0, (t._expiresAt||0) - Date.now());
      $('#enc-sub').textContent = 'PWR '+t.cp+' · '+(t.tier||'normal')+(t._expiresAt && !t._hold ? ' · ⏳ leaves in '+Math.floor(left/60000)+':'+String(Math.floor(left/1000)%60).padStart(2,'0') : '');
    };
    sub(); clearInterval(window.__encTimer);
    window.__encTimer = setInterval(()=>{ if (!$('#encounter-modal').classList.contains('active')){ clearInterval(window.__encTimer); return; } sub(); }, 1000);
    $('#encounter-modal').classList.add('active');
  }
  $$('[data-close-enc]').forEach(x=> x.onclick = ()=>{ $('#encounter-modal').classList.remove('active'); pendingCatch=null; });
  $('#btn-throw').onclick = ()=>{
    if (!pendingCatch) return;
    const caught = pendingCatch;
    const respawnX = caught._x, respawnY = caught._y, respawnChunk = caught._chunkKey;
    finalizeCatch(caught);
    removeTotoFromMap(caught);
    Sound.playCatch();
    showToast('Caught '+caught.name+'! It starts at Lv 1 — train it in battles or with candy.');
    renderCollection(); refreshHUD(); markDirty(); saveNow(false);
    $('#encounter-modal').classList.remove('active');
    pendingCatch = null;
    // Something new turns up on this same spot a minute later.
    setTimeout(()=>{ spawnWildTotoAt(respawnX, respawnY, respawnChunk); }, RESPAWN_DELAY_MS);
  };
  function tryStartGymRaid(gym){
    const distM = distanceMetersToWorldPoint(gym.x, gym.y);
    if (distM > GYM_RADIUS_M){ showToast('Too far ('+Math.round(distM)+'m) — get within '+GYM_RADIUS_M+'m of the gym.'); return; }
    if ((ensureItems().raidPass||0) <= 0){ showToast('🎟️ You need a Pumpkin Raid Pass to battle a Gym — spin PumpkinStops to get one.'); return; }
    openBattleSetup({ type:'gym', gym });
  }

  // ---------------- TOTO DETAIL / POWER UP ----------------
  function statBarRow(label, val, max, color){
    const pct = Math.max(4, Math.min(100, Math.round(val/max*100)));
    return '<div class="stat-line"><span class="lbl">'+label+'</span><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:'+color+';"></div></div><span class="val">'+val+'</span></div>';
  }
  // ---------------- ROLE ABILITIES ----------------
  // Every Toto fights to its role. It always has its basic CHARGE ATTACK (attackers hit
  // hardest by far, then tanks, supports and healers), and learns one role ability at
  // Lv 10, 20, 30, 40 and 50 — five in all by max level:
  //   Attacker — only damage abilities (the hardest hitters in the game)
  //   Tank     — armour, one shield strike, a self-heal, team armour and (Lv 50) Taunt
  //   Healer   — only heals, and the strongest heals in the game
  //   Support  — protect one ally (e.g. your tank), heal one ally, team damage boost,
  //              cooldown haste and a weakening hex on the boss
  // Higher tiers learn the same abilities under their own names, a bit stronger:
  // Normal x1.0, Legendary x1.1, Mythical x1.2, Eternal x1.3. Support heals are set so a
  // support only matches a healer two tiers below it (eternal support ≈ legendary healer,
  // mythical support ≈ normal healer) and is always weaker than a healer of its own tier.
  const ABILITY_LEVELS = [10, 20, 30, 40, 50];
  const TIER_IDX = { normal:0, legendary:1, mythical:2, eternal:3 };
  const TIER_POWER = { normal:1.0, legendary:1.1, mythical:1.2, eternal:1.3 };
  const ROLE_BASIC_MULT = { attacker:1.0, tanker:0.45, supporter:0.4, healer:0.3 };
  const ROLE_KITS = {
    attacker: [
      { id:'strike',   glyph:'claw',    cd:6,  kind:'damage',  mult:2.2, names:['Fury Swipe','Fury Slicer','Fury Rend','Fury Annihilator'] },
      { id:'bleed',    glyph:'gash',    cd:12, kind:'bleed',   mult:1.0, dot:0.45, names:['Gash','Deep Gash','Savage Gash','Eternal Laceration'] },
      { id:'rage',     glyph:'rage',    cd:20, kind:'rage',    pct:0.40, dur:8, names:['Battle Rage','Blood Rage','Frenzied Rage','Undying Rage'] },
      { id:'flurry',   glyph:'fangs',   cd:14, kind:'multi',   mult:1.15, hits:3, names:['Twin Fangs','Triple Fangs','Storm of Fangs','Thousand Fangs'] },
      { id:'finisher', glyph:'execute', cd:30, kind:'execute', mult:3.5, names:['Final Strike','Doom Strike','Cataclysm Strike','Oblivion Strike'] }
    ],
    tanker: [
      { id:'armor', glyph:'armor', cd:15, kind:'selfArmor', pct:0.40, dur:8, names:['Stone Skin','Iron Skin','Obsidian Skin','Eternal Bastion'] },
      { id:'bash',  glyph:'slam',  cd:9,  kind:'damage',    mult:1.8, scale:0.8, names:['Shield Bash','Shield Slam','Titan Slam','Colossus Slam'] },
      { id:'wind',  glyph:'heart', cd:20, kind:'selfHeal',  pct:0.08, names:['Second Wind','Stalwart Heart','Ironheart','Undying Heart'] },
      { id:'guard', glyph:'aura',  cd:22, kind:'teamArmor', pct:0.30, dur:8, names:['Guard Aura','Bulwark Aura','Fortress Aura','Aegis of Ages'] },
      { id:'taunt', glyph:'taunt', cd:0,  kind:'taunt',     pct:0.15, dur:6, once:true, names:['Challenge Roar','Provoking Roar','Dread Challenge','Eternal Challenge'] }
    ],
    healer: [
      { id:'selfheal', glyph:'selfheal', cd:4,  kind:'selfHeal', pct:0.10, names:['Self Mend','Self Renewal','Self Restoration','Eternal Renewal'] },
      { id:'touch',    glyph:'touch',    cd:10, kind:'allyHeal', pct:0.30, target:true, names:['Healing Touch','Healing Light','Healing Radiance','Divine Touch'] },
      { id:'rain',     glyph:'rain',     cd:20, kind:'teamHot',  pct:0.03, ticks:8, names:['Soothing Rain','Soothing Bloom','Soothing Grace','Everbloom'] },
      { id:'wave',     glyph:'wave',     cd:15, kind:'teamHeal', pct:0.50, names:['Healing Wave','Healing Tide','Healing Nova','Eternal Tide'] },
      { id:'revive',   glyph:'revive',   cd:40, kind:'revive',   pct:0.35, target:true, names:['Spirit Revive','Spirit Return','Soul Rebirth','Eternal Rebirth'] }
    ],
    supporter: [
      { id:'ward',  glyph:'ward',  cd:14, kind:'allyArmor', pct:0.35, dur:10, target:true, names:['Warding Charm','Warding Sigil','Warding Seal','Eternal Ward'] },
      { id:'mend',  glyph:'mend',  cd:12, kind:'allyHeal',  pct:0.25, target:true, names:['Mend','Mending Light','Mending Grace','Eternal Mend'] },
      { id:'hymn',  glyph:'hymn',  cd:20, kind:'teamDmgUp', pct:0.30, dur:10, names:['Battle Hymn','War Hymn','Valor Anthem','Anthem of Ages'] },
      { id:'haste', glyph:'haste', cd:24, kind:'teamHaste', secs:4, names:['Quickening','Haste Charm','Time Warp','Eternal Haste'] },
      { id:'hex',   glyph:'hex',   cd:28, kind:'bossHex',   pct:0.25, taken:0.20, dur:10, names:['Hex of Weakness','Curse of Weakness','Doom Hex','Eternal Hex'] }
    ]
  };
  // One Toto's whole role kit (all five slots), named and scaled for its tier.
  function abilityKit(t){
    const role = ROLE_KITS[t && t.role] ? t.role : 'attacker';
    const tier = TIER_IDX[t && t.tier] != null ? t.tier : 'normal';
    const tp = TIER_POWER[tier];
    return ROLE_KITS[role].map((a,i)=>{
      const s = Object.assign({}, a, { slot:i, level:ABILITY_LEVELS[i], name:a.names[TIER_IDX[tier]], role, tier, tp });
      if (a.mult) s.mult = +(a.mult*tp).toFixed(2);
      if (a.dot) s.dot = +(a.dot*tp).toFixed(3);
      if (a.pct) s.pct = Math.min(/Armor|taunt/.test(a.kind) ? 0.65 : 1, a.pct*tp);
      if (a.taken) s.taken = a.taken*tp;
      if (a.secs) s.secs = +(a.secs*tp).toFixed(1);
      return s;
    });
  }
  const pctTxt = v=> Math.round(v*100)+'%';
  function abilityDesc(a){
    switch(a.kind){
      case 'damage':    return 'Strike the boss for '+a.mult+'× a basic hit.';
      case 'bleed':     return 'Hit for '+a.mult+'×, then the boss bleeds for '+a.dot+'× every second for 6s.';
      case 'rage':      return 'Your hits deal +'+pctTxt(a.pct)+' damage for '+a.dur+'s.';
      case 'multi':     return a.hits+' rapid hits of '+a.mult+'× each.';
      case 'execute':   return 'A '+a.mult+'× blow — 1.8× harder again when the boss is under 30% health.';
      case 'selfArmor': return 'You take '+pctTxt(a.pct)+' less damage for '+a.dur+'s.';
      case 'selfHeal':  return 'Heal yourself '+pctTxt(a.pct)+' of your max HP.';
      case 'teamArmor': return 'The whole team takes '+pctTxt(a.pct)+' less damage for '+a.dur+'s.';
      case 'taunt':     return 'Taunt: the boss attacks only you until you fall (+'+pctTxt(a.pct)+' armour for '+a.dur+'s).';
      case 'allyHeal':  return 'Heal one ally '+pctTxt(a.pct)+' of their max HP — tap who on the team list.';
      case 'teamHot':   return 'The whole team heals '+pctTxt(a.pct)+' every second for '+a.ticks+'s.';
      case 'teamHeal':  return 'Heal the whole team '+pctTxt(a.pct)+' of their max HP.';
      case 'revive':    return 'Bring a fallen ally back with '+pctTxt(a.pct)+' HP (or heal one ally that much).';
      case 'allyArmor': return 'One ally takes '+pctTxt(a.pct)+' less damage for '+a.dur+'s — tap who (great on your tank).';
      case 'teamDmgUp': return 'The whole team deals +'+pctTxt(a.pct)+' damage for '+a.dur+'s.';
      case 'teamHaste': return "Everyone's abilities come back "+a.secs+'s sooner.';
      case 'bossHex':   return 'The boss deals '+pctTxt(a.pct)+' less damage and takes '+pctTxt(a.taken)+' more for '+a.dur+'s.';
    }
    return '';
  }
  function abilityCdTxt(a){ return a.once ? 'Once per battle.' : 'Every '+a.cd+'s.'; }
  // Which slots a Toto has learned. (v40 "moves" learned at Lv 10-50 carry over.)
  function abilityProgress(t){
    if (!t.abilities || !Array.isArray(t.abilities.learned)){
      const old = (t.moves && Array.isArray(t.moves.learned)) ? t.moves.learned.filter(i=> i>0).map(i=> i-1) : [];
      t.abilities = { learned: old.filter(i=> i>=0 && i<ABILITY_LEVELS.length) };
    }
    return t.abilities;
  }
  function learnableAbilities(t){ const p = abilityProgress(t); return abilityKit(t).filter(a=> (t.level||1) >= a.level && !p.learned.includes(a.slot)); }
  function learnedAbilities(t){ const p = abilityProgress(t); return abilityKit(t).filter(a=> p.learned.includes(a.slot)); }
  window.__totoAbilities = { abilityKit, learnedAbilities, learnableAbilities, abilityDesc };

  // Ability icons (crisp SVG, same on every phone) and per-role button colours.
  const ABG = inner=> '<svg class="bx-ab-ic" viewBox="0 0 48 48">'+inner+'</svg>';
  const ABILITY_GLYPH = {
    claw: ABG('<g fill="none" stroke-linecap="round"><path d="M12 40C17 28 24 17 36 7" stroke="#fff6dc" stroke-width="5"/><path d="M19 43C24 31 31 21 42 12" stroke="#ffd27a" stroke-width="4.5"/><path d="M6 35C11 24 17 14 28 5" stroke="#ffb347" stroke-width="4"/></g>'),
    gash: ABG('<path d="M10 40L36 8l4 3-24 31z" fill="#f4f1ea" stroke="#5a1406" stroke-width="2"/><path d="M8 42l5-6 3 3-6 5z" fill="#7a3a12"/><path d="M34 26c0 3-2 5-4 5s-4-2-4-5 4-8 4-8 4 5 4 8zM42 34c0 2.4-1.6 4-3.2 4s-3.2-1.6-3.2-4 3.2-6.4 3.2-6.4 3.2 4 3.2 6.4zM26 38c0 2-1.3 3.3-2.7 3.3s-2.7-1.3-2.7-3.3 2.7-5.3 2.7-5.3 2.7 3.3 2.7 5.3z" fill="#ff3b3b" stroke="#5a0a0a" stroke-width="1.2"/>'),
    rage: ABG('<path d="M25 4c1 6-3 9-5.5 12.5C17 20 14 23.5 14 29c0 8 5.7 14 11 14 7.3 0 12-6 12-13 0-5-2.6-9-5.3-12 .4 3.2-.8 5.6-3.2 7 .8-9-1.2-17-3.5-21z" fill="#ffd27a" stroke="#7a2a06" stroke-width="2" stroke-linejoin="round"/><path d="M25.3 26c2.8 2.6 4.7 5.2 4.7 8.2 0 3.2-2.4 5.8-5.4 5.8s-5.2-2.4-5.2-5.4c0-3.2 2.8-5.4 5.9-8.6z" fill="#ff5a1a"/>'),
    fangs: ABG('<path d="M6 10h36l-4 5H10z" fill="#fff6dc" stroke="#5a1406" stroke-width="2" stroke-linejoin="round"/><path d="M10 15l4 22 5-22zM21 15l3 26 3-26zM29 15l5 22 4-22z" fill="#ffffff" stroke="#5a1406" stroke-width="2" stroke-linejoin="round"/>'),
    execute: ABG('<path d="M24 3l3 5v22h-6V8z" fill="#f4f1ea" stroke="#3a1206" stroke-width="2" stroke-linejoin="round"/><path d="M14 30h20l-2 4H16z" fill="#ffc444" stroke="#3a1206" stroke-width="2"/><path d="M22 34h4v8h-4z" fill="#7a3a12" stroke="#3a1206" stroke-width="1.6"/><path d="M6 20l6 2-2-6M42 20l-6 2 2-6M8 40l6-4M40 40l-6-4" stroke="#fff3b0" stroke-width="2.4" stroke-linecap="round" fill="none"/>'),
    armor: ABG('<path d="M24 4l15 5v12c0 10-6.6 17.4-15 21-8.4-3.6-15-11-15-21V9z" fill="#d8ecff" stroke="#0e2f6b" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 9l10 3.4V21c0 7-4.2 12.2-10 15z" fill="#3d8cff"/><circle cx="17" cy="15" r="1.8" fill="#0e2f6b"/><circle cx="31" cy="15" r="1.8" fill="#0e2f6b"/><path d="M15 24h18" stroke="#0e2f6b" stroke-width="2"/>'),
    slam: ABG('<path d="M20 8l13 4.5v10c0 8.5-5.6 14.6-13 17.8C12.6 37.1 7 31 7 22.5v-10z" fill="#d8ecff" stroke="#0e2f6b" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 12.5l8.5 3v7.5c0 6-3.6 10.4-8.5 12.8z" fill="#3d8cff"/><path d="M36 10l7-4M38 20h8M36 30l7 4" stroke="#fff3b0" stroke-width="3" stroke-linecap="round"/>'),
    heart: ABG('<path d="M24 42S6 30.5 6 18.5C6 12 10.7 7 16.5 7c3.4 0 5.9 1.7 7.5 4.2C25.6 8.7 28.1 7 31.5 7 37.3 7 42 12 42 18.5 42 30.5 24 42 24 42z" fill="#ff6f8f" stroke="#5a0a22" stroke-width="2.4" stroke-linejoin="round"/><path d="M21 15h6v6h6v6h-6v6h-6v-6h-6v-6h6z" fill="#fff"/>'),
    aura: ABG('<circle cx="24" cy="25" r="19" fill="none" stroke="#bfe4ff" stroke-width="2.5" stroke-dasharray="5 4"/><path d="M24 11l9 3.2v7c0 6.2-4 10.8-9 12.8-5-2-9-6.6-9-12.8v-7z" fill="#d8ecff" stroke="#0e2f6b" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 30l5 1.8v4c0 3.4-2.2 5.9-5 7-2.8-1.1-5-3.6-5-7v-4zM38 30l5 1.8v4c0 3.4-2.2 5.9-5 7-2.8-1.1-5-3.6-5-7v-4z" fill="#8fd0ff" stroke="#0e2f6b" stroke-width="1.8" stroke-linejoin="round"/>'),
    taunt: ABG('<path d="M24 3l5 9 10-3-3 10 9 5-9 5 3 10-10-3-5 9-5-9-10 3 3-10-9-5 9-5-3-10 10 3z" fill="#ff4d4d" stroke="#5a0a0a" stroke-width="2" stroke-linejoin="round"/><path d="M21.5 12h5l-1 15h-3z" fill="#fff"/><circle cx="24" cy="33" r="2.8" fill="#fff"/>'),
    selfheal: ABG('<circle cx="24" cy="24" r="17" fill="none" stroke="#eafff2" stroke-width="3" stroke-dasharray="80 30" stroke-linecap="round"/><path d="M38 12l3 8-8-1z" fill="#eafff2"/><path d="M20 14h8v6h6v8h-6v6h-8v-6h-6v-8h6z" fill="#eafff2" stroke="#0e5a2a" stroke-width="2" stroke-linejoin="round"/>'),
    touch: ABG('<path d="M18 6h12v12h12v12H30v12H18V30H6V18h12z" fill="#eafff2" stroke="#0e5a2a" stroke-width="2.6" stroke-linejoin="round"/><path d="M21 9h6v12h12v6H27v12h-6V27H9v-6h12z" fill="#3be07e"/>'),
    rain: ABG('<path d="M13 24a7 7 0 0 1 1-13.9A10 10 0 0 1 33 9a8 8 0 0 1 2 15.8z" fill="#eafff2" stroke="#0e5a2a" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 30l-2 6M24 30l-2 6M33 30l-2 6M19 38l-2 6M29 38l-2 6" stroke="#3be07e" stroke-width="3" stroke-linecap="round"/>'),
    wave: ABG('<circle cx="24" cy="24" r="20" fill="none" stroke="#b6ffd4" stroke-width="2.4"/><circle cx="24" cy="24" r="14.5" fill="none" stroke="#eafff2" stroke-width="2.4" opacity="0.8"/><path d="M20.5 13h7v7.5H35v7h-7.5V35h-7v-7.5H13v-7h7.5z" fill="#eafff2" stroke="#0e5a2a" stroke-width="2" stroke-linejoin="round"/>'),
    revive: ABG('<ellipse cx="24" cy="9" rx="9" ry="3.2" fill="none" stroke="#fff3b0" stroke-width="2.6"/><path d="M22 20C16 14 8 14 3 18c4 1 7 3 8 6-3-1-6 0-7 2 4 0 7 1 9 4 3-4 7-6 9-10zM26 20c6-6 14-6 19-2-4 1-7 3-8 6 3-1 6 0 7 2-4 0-7 1-9 4-3-4-7-6-9-10z" fill="#eafff2" stroke="#0e5a2a" stroke-width="1.8" stroke-linejoin="round"/><path d="M21 22h6v7h7v6h-7v7h-6v-7h-7v-6h7z" fill="#3be07e" stroke="#0e5a2a" stroke-width="1.6"/>'),
    ward: ABG('<path d="M24 4l17 10v20L24 44 7 34V14z" fill="none" stroke="#f0dcff" stroke-width="2.6" stroke-linejoin="round"/><path d="M24 12l9 3.4v7.4c0 6.6-4 11.4-9 13.6-5-2.2-9-7-9-13.6v-7.4z" fill="#e8c8ff" stroke="#4a1a7a" stroke-width="2.2" stroke-linejoin="round"/><path d="M24 16v17" stroke="#7b3fe0" stroke-width="2.4"/>'),
    mend: ABG('<path d="M24 6c10 6 14 14 12 22-1.6 6.4-7 10-12 14-5-4-10.4-7.6-12-14C10 20 14 12 24 6z" fill="#e8c8ff" stroke="#4a1a7a" stroke-width="2.2" stroke-linejoin="round"/><path d="M21 17h6v6h6v6h-6v6h-6v-6h-6v-6h6z" fill="#fff"/>'),
    hymn: ABG('<path d="M18 34V10l20-5v24" fill="none" stroke="#f0dcff" stroke-width="3.2" stroke-linejoin="round"/><ellipse cx="13.5" cy="35" rx="6" ry="4.6" fill="#f0dcff" transform="rotate(-18 13.5 35)"/><ellipse cx="33.5" cy="30" rx="6" ry="4.6" fill="#f0dcff" transform="rotate(-18 33.5 30)"/><path d="M18 15l20-5" stroke="#f0dcff" stroke-width="3.2"/>'),
    haste: ABG('<path d="M12 5h24M12 43h24" stroke="#f0dcff" stroke-width="3.4" stroke-linecap="round"/><path d="M15 6c0 9 7 12 9 18-2 6-9 9-9 18h18c0-9-7-12-9-18 2-6 9-9 9-18z" fill="none" stroke="#f0dcff" stroke-width="2.6" stroke-linejoin="round"/><path d="M18 41c1-5 4-7 6-9 2 2 5 4 6 9z" fill="#ffd27a"/><path d="M27 13l-5 7h4l-3 7 7-9h-4l3-5z" fill="#ffd27a"/>'),
    hex: ABG('<path d="M4 24C10 14 17 10 24 10s14 4 20 14c-6 10-13 14-20 14S10 34 4 24z" fill="#e8c8ff" stroke="#4a1a7a" stroke-width="2.4" stroke-linejoin="round"/><circle cx="24" cy="24" r="8" fill="#7b3fe0"/><path d="M24 18c3 0 5 2.2 5 5 0 2.4-2 4-4 4s-3-1.4-3-3 1.2-2.4 2.2-2.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>')
  };
  const ROLE_AB_COLORS = {
    attacker:  { c1:'#ffb066', c2:'#a3240f', b:'#ffcf8a', g:'rgba(255,110,40,0.8)' },
    tanker:    { c1:'#8fd0ff', c2:'#123f8c', b:'#bfe4ff', g:'rgba(70,150,255,0.85)' },
    healer:    { c1:'#8dffc0', c2:'#0e6b38', b:'#b6ffd4', g:'rgba(50,220,120,0.8)' },
    supporter: { c1:'#d9a6ff', c2:'#4b1a8c', b:'#e8c8ff', g:'rgba(176,100,255,0.85)' }
  };
  function abilityIconHtml(a){
    const c = ROLE_AB_COLORS[a.role] || ROLE_AB_COLORS.attacker;
    return '<span class="ab-ic" style="--abc-1:'+c.c1+';--abc-2:'+c.c2+';--abc-b:'+c.b+'">'+ABILITY_GLYPH[a.glyph]+'</span>';
  }
  function renderAbilities(t){
    const p = abilityProgress(t), role = ROLE_KITS[t.role] ? t.role : 'attacker';
    const ri = ROLE_INFO[role] || ROLE_INFO.attacker;
    $('#det-ab-title').innerHTML = 'Abilities <span>· '+ri.label+' · '+(t.tier||'normal')+' versions · new one every 10 levels</span>';
    const basic = '<div class="move-row equipped"><span class="ab-ic basic">⚔️</span><div class="move-info"><div class="move-name">Charge Attack</div>'
      + '<div class="move-desc">Your basic hit, always ready.'+(role==='attacker' ? ' Attackers hit the hardest.' : '')+'</div></div><span class="move-tag on">Always</span></div>';
    $('#det-moves').innerHTML = basic + abilityKit(t).map(a=>{
      const learned = p.learned.includes(a.slot), unlocked = (t.level||1) >= a.level;
      const act = learned ? '<span class="move-tag on">✓ Active</span>'
        : unlocked ? '<button class="move-act learn" data-learn="'+a.slot+'">Learn</button>'
        : '<span class="move-lock">🔒 Lv '+a.level+'</span>';
      return '<div class="move-row'+(learned?' equipped':'')+(!learned && !unlocked?' locked':'')+'">'+abilityIconHtml(a)
        + '<div class="move-info"><div class="move-name">'+a.name+' <span class="move-lv">Lv '+a.level+'</span></div>'
        + '<div class="move-desc">'+abilityDesc(a)+' '+abilityCdTxt(a)+'</div></div>'+act+'</div>';
    }).join('');
    $$('#det-moves [data-learn]').forEach(b=> b.onclick = ()=>{
      const a = abilityKit(t)[+b.dataset.learn];
      if (!a || (t.level||1) < a.level) return;
      if (!p.learned.includes(a.slot)) p.learned.push(a.slot);
      p.learned.sort((x,y)=> x-y);
      Sound.playCatch && Sound.playCatch();
      showToast(t.name+' learned '+a.name+'!');
      markDirty(); saveNow(false); renderAbilities(t); renderCollection();
    });
  }
  function openDetail(id){
    const t = state.collection.find(x=>x.id===id); if (!t) return;
    detailTarget = t;
    $('#det-sprite').innerHTML = spriteMarkup(t); $('#det-name').textContent = t.name;
    $('#det-sub').textContent = 'Lv.'+t.level+' · PWR '+t.cp+' · '+t.tier;
    if (t.level >= TOTO_MAX_LEVEL) $('#det-xp').innerHTML = '';
    else {
      const need = xpToNext(t.level), have = Math.min(need, t.xp||0);
      $('#det-xp').innerHTML = '<div class="xp-txt"><span>XP '+have.toLocaleString()+' / '+need.toLocaleString()+'</span><span>Lv '+(t.level+1)+' next</span></div>'
        + '<div class="xp-track"><div class="xp-fill" style="width:'+Math.round(have/need*100)+'%"></div></div>';
    }
    const hpNow = hpOf(t), itNow = ensureItems();
    $('#det-heal').innerHTML = hpNow < t.maxHp ? '<div class="det-heal-box"><span>'+(hpNow<=0 ? '💤 Fainted' : '❤️ Hurt')+' · '+hpNow+' / '+t.maxHp+' HP</span><button id="btn-det-heal"'+(itNow.elixir?'':' disabled')+'>🧪 Heal ('+itNow.elixir+')</button></div>' : '';
    if ($('#btn-det-heal')) $('#btn-det-heal').onclick = ()=> useElixirOn(t.id);
    $('#det-stats').innerHTML = statBarRow('HP', hpNow, Math.max(t.maxHp,1), '#4dbf4d') + statBarRow('Attack', t.atk, 1600, '#ff5470') +
      statBarRow('Strength', t.strength, 1600, '#ff8a3d') + statBarRow('Defense', t.def, 1300, '#4d7cff') +
      statBarRow('Speed', t.spd, 260, '#7b5cff');
    const maxed = t.level >= TOTO_MAX_LEVEL; const cost = powerUpCost(t);
    $('#det-msg').innerHTML = maxed ? 'Max level for this tier!' : ('Power Up cost: '+cost.candy+' '+candyIconHtml(14));
    $('#btn-power-up').disabled = maxed; $('#btn-power-up').innerHTML = maxed ? '★ MAX LEVEL' : 'Power Up';
    const isAdmin = state.email && state.email.toLowerCase()===ADMIN_EMAIL;
    $('#btn-admin-max-toto').style.display = (isAdmin && !maxed) ? 'block' : 'none';
    renderAbilities(t);
    $('#detail-modal').classList.add('active');
  }
  $$('[data-close-det]').forEach(x=> x.onclick = ()=> $('#detail-modal').classList.remove('active'));
  $('#btn-power-up').onclick = ()=>{
    if (!detailTarget) return;
    const cost = powerUpCost(detailTarget);
    if (state.candy < cost.candy){
      $('#det-msg').innerHTML = 'Not enough! Need '+cost.candy+' '+candyIconHtml(14);
      return;
    }
    const before = learnableAbilities(detailTarget).length;
    state.candy -= cost.candy; applyPowerUp(detailTarget);
    refreshHUD(); markDirty(); saveNow(false);
    openDetail(detailTarget.id); renderCollection();
    const fresh = learnableAbilities(detailTarget);
    showToast(fresh.length > before ? ('✨ '+detailTarget.name+' reached Lv.'+detailTarget.level+' — it can learn '+fresh[fresh.length-1].name+'!') : (detailTarget.name+' leveled up to Lv.'+detailTarget.level+'!'));
  };

  // ---------------- ADMIN ----------------
  $$('.admin-btn[data-give]').forEach(btn=>{
    btn.onclick = ()=>{
      const t = makeToto(btn.dataset.give); state.collection.push(t);
      showToast('Admin: added '+t.name+' ('+btn.dataset.give+')');
      renderCollection(); refreshHUD(); markDirty(); saveNow(false);
    };
  });
  $('#btn-admin-energy').onclick = ()=>{ state.candy += 1000000; state.gems += 1000000; refreshHUD(); markDirty(); saveNow(false); showToast('Admin: +1,000,000 Candy & Gems'); };
  $('#btn-admin-max-player').onclick = ()=>{ state.charLevel = PLAYER_MAX_LEVEL; refreshHUD(); markDirty(); saveNow(false); showToast('Admin: Player level maxed to '+PLAYER_MAX_LEVEL); };
  $('#btn-admin-max-toto').onclick = ()=>{
    if (!detailTarget) return;
    applyLevelStats(detailTarget, TOTO_MAX_LEVEL);
    refreshHUD(); markDirty(); saveNow(false);
    openDetail(detailTarget.id); renderCollection();
    showToast('Admin: '+detailTarget.name+' maxed to Lv.'+TOTO_MAX_LEVEL+'!');
  };

  $('#btn-leaderboard').onclick = ()=>{ closeQuickMenu(); $('#leaderboard-modal').classList.add('active'); loadLeaderboard(); };
  $('#hud-avatar').style.cursor = 'pointer';
  $('#hud-avatar').onclick = ()=>{ $('#avatar-menu-modal').classList.add('active'); };
  $('#btn-avatar-customize').onclick = ()=>{ $('#avatar-menu-modal').classList.remove('active'); openGamePanel('wardrobe'); };
  $('#btn-avatar-viewprofile').onclick = ()=>{ $('#avatar-menu-modal').classList.remove('active'); openGamePanel('profile'); };
  $('[data-close-avatar-menu]').onclick = ()=> $('#avatar-menu-modal').classList.remove('active');
  function renderDiagnostics(){
    const a = state.geoAnchor;
    const regionCount = state.regionEls ? state.regionEls.size : 0;
    const chunkCount = state.loadedChunks ? state.loadedChunks.size : 0;
    const lines = [
      'GPS anchor: '+(a ? a.lat.toFixed(5)+', '+a.lon.toFixed(5) : 'NOT SET — this is why nothing else can load'),
      'Using default location: '+(a && state.geo && a.lat===DEFAULT_LAT && a.lon===DEFAULT_LON ? 'yes (real GPS hasn\'t come in)' : 'no'),
      'Chunks loaded: '+chunkCount+'   Queue waiting: '+chunkQueue.length,
      'Map tiles drawn: '+regionCount+'   downloading: '+netActive+'   waiting: '+netQueue.length,
      'Wild totos on map: '+(state.wildTotos ? state.wildTotos.length : 0),
      'Online leaderboard & store: '+(onlineOn() ? 'switched on' : 'not set up yet'),
      '',
      'Last road/building fetch: '+(diag.lastRegionAttempt || 'never attempted'),
      '  result: '+(diag.lastRegionError ? 'FAILED — '+diag.lastRegionError : (diag.lastRegionResult || 'pending…')),
      '',
      'Last weather fetch: '+(diag.lastWeatherAttempt || 'never attempted'),
      '  result: '+(diag.lastWeatherError ? 'FAILED — '+diag.lastWeatherError : (diag.lastWeatherResult || 'pending…')),
    ];
    $('#diag-body').textContent = lines.join('\n');
  }
  $('#btn-diagnostics').onclick = ()=>{ closeQuickMenu(); renderDiagnostics(); $('#diag-overlay').classList.add('show'); };
  updateMuteIcon();
  $('#btn-mute').onclick = ()=>{
    Sound.setMuted(!Sound.isMuted());
    updateMuteIcon();
    if (Sound.isMuted()) Sound.stopMusic(); else Sound.startMusic();
    showToast(Sound.isMuted() ? '🔇 Sound muted' : '🔊 Sound on');
  };
  $('#diag-close-btn').onclick = ()=> $('#diag-overlay').classList.remove('show');
  $('#diag-retry-btn').onclick = ()=>{
    locate();
    if (state.geoAnchor){
      const {cx, cy} = currentChunkCoords();
      tilesForChunk(cx, cy).forEach(t=>{
        const k = tileKey(t.ilat, t.ilon);
        tileRetryAt.delete(k);
        queueTileDownload(t).then(els=>{ if (els.length) MapCache.put(k, { v:MAP_DATA_VERSION, ts:Date.now(), elements:els }); drawTile(k, t, els); }, ()=>{});
      });
      ensureChunksLoaded();
    }
    fetchWeather(true);
    setTimeout(renderDiagnostics, 400);
  };
  $('[data-close-leaderboard]').onclick = ()=> $('#leaderboard-modal').classList.remove('active');

  // ---------------- STORE (honor system — see store-warning banner for why) ----------------
  const PAYPAL_ME = 'https://paypal.me/TotoQuest';
  const CANDY_TIERS = [
    { amount:100,  price:2.00 },
    { amount:500,  price:9.00 },
    { amount:1000, price:16.00 },
    { amount:1500, price:22.50 },
    { amount:2500, price:35.00 }
  ];
  const GEM_TIERS = [
    { amount:50,  price:2.00 },
    { amount:150, price:5.00 },
    { amount:350, price:10.00 },
    { amount:800, price:20.00 }
  ];
  const CURRENCY_META = {
    candy: { label:'Candy', icon: candyIconHtml },
    gems:  { label:'Gems',  icon: gemIconHtml }
  };
  function storeTierRow(kind, amount, price){
    const meta = CURRENCY_META[kind];
    const rate = (price/amount);
    return '<div class="store-tier" data-kind="'+kind+'" data-amount="'+amount+'" data-price="'+price+'">'+
      '<div class="icon">'+meta.icon(22)+'</div>'+
      '<div class="info"><div class="amt">'+amount.toLocaleString()+' '+meta.label+'</div>'+
      '<div class="rate">$'+(rate*1000/1000).toFixed(4).replace(/0+$/,'').replace(/\.$/,'')+' each</div></div>'+
      '<button class="price-btn">$'+price.toFixed(2)+'</button>'+
    '</div>';
  }
  function payLinkFor(kind, amount){ return (TQ_ONLINE.payLinks||{})[kind+':'+amount] || ''; }
  async function startCheckout(kind, amount, price){
    const link = payLinkFor(kind, amount);
    if (!link){ showToast('That pack isn\'t on sale yet.'); return; }
    if (underAge()){ showToast('Purchases are for players 13 and older.'); return; }
    $('#store-body').innerHTML = '<div style="text-align:center; padding:26px 6px; font-weight:800; color:#6b3fa0;">🔒 Opening secure checkout…</div>';
    ensurePlayerId();
    await saveNow(true);
    if (!(await onlineRegister())){ showToast('Can\'t reach the store right now — check your connection.'); renderStore(); return; }
    const u = new URL(link);
    u.searchParams.set('client_reference_id', state.playerId);
    if (state.email && /@/.test(state.email)) u.searchParams.set('prefilled_email', state.email);
    state.pendingCheckoutAt = Date.now(); markDirty(); await saveNow(true);
    location.assign(u.toString());
  }
  function renderStore(){
    const warn = $('#store-warning');
    if (warn) warn.textContent = !paymentsOn() ? 'The store is opening soon.'
      : underAge() ? 'Purchases are for players 13 and older.'
      : '🔒 Secure checkout by Stripe. Your candy or gems are added automatically as soon as your payment goes through. Under 18? Ask a parent before buying.';
    let html = '<div class="store-section-title">🍬 Candy</div>' + CANDY_TIERS.map(t=>storeTierRow('candy', t.amount, t.price)).join('');
    html += '<div class="store-section-title">💎 Gems</div>' + GEM_TIERS.map(t=>storeTierRow('gems', t.amount, t.price)).join('');
    // Coins are on the roadmap — the infrastructure (currency + this row) is in place now,
    // but spending Gems to buy Coins isn't live yet.
    html += '<div class="store-section-title">🪙 Coins</div>'+
      '<div class="store-tier" style="opacity:0.6;">'+
        '<div class="icon">'+coinIconHtml(22)+'</div>'+
        '<div class="info"><div class="amt">Buy Coins with Gems</div><div class="rate">Coming soon</div></div>'+
        '<button class="price-btn" disabled style="opacity:0.5; cursor:default;">Soon</button>'+
      '</div>';
    if (state.email && state.email.toLowerCase()===ADMIN_EMAIL){
      html += '<div class="store-section-title">🧪 Admin Testing</div>'+
        '<div class="store-tier test" data-kind="candy" data-amount="10000" data-price="0" data-test="1">'+
          '<div class="icon">'+candyIconHtml(22)+'</div>'+
          '<div class="info"><div class="amt">10,000 Candy</div><div class="rate">test only, not shown to players</div></div>'+
          '<button class="price-btn">FREE</button>'+
        '</div>'+
        '<div class="store-tier test" data-kind="gems" data-amount="1000" data-price="0" data-test="1">'+
          '<div class="icon">'+gemIconHtml(22)+'</div>'+
          '<div class="info"><div class="amt">1,000 Gems</div><div class="rate">test only, not shown to players</div></div>'+
          '<button class="price-btn">FREE</button>'+
        '</div>';
    }
    $('#store-body').innerHTML = html;
    $$('.store-tier[data-kind]', $('#store-body')).forEach(row=>{
      row.querySelector('.price-btn').onclick = ()=>{
        const kind = row.dataset.kind, amount = parseInt(row.dataset.amount,10), price = parseFloat(row.dataset.price);
        const label = CURRENCY_META[kind].label;
        if (row.dataset.test){
          state[kind] += amount;
          refreshHUD(); markDirty(); saveNow(false);
          showToast('Admin test: +'+amount.toLocaleString()+' '+label);
          return;
        }
        if (paymentsOn()){ startCheckout(kind, amount, price); return; }
        showToast('The store is opening soon!');
      };
    });
  }
  $('#btn-open-store').onclick = ()=>{ $('#store-modal').classList.add('active'); renderStore(); if (paymentsOn()) watchForPurchase(1); };
  $('[data-close-store]').onclick = ()=> $('#store-modal').classList.remove('active');

  // ---------------- LOGOUT ----------------
  $('#btn-logout').onclick = async ()=>{
    await saveNow(true); stopAutosave();
    await forgetRememberedEmail();
    try { if (watchId!==null) navigator.geolocation.clearWatch(watchId); } catch(e){}
    watchId=null;
    state.loggedIn = false; showScreen('auth'); showToast('Logged out — progress saved.');
  };

  // ================= BATTLE SETUP: mode select -> lobby -> countdown =================
  let pendingBattle = null; // {type, wildToto|gym|shrine}
  function openBattleSetup(ctx){
    if (state.collection.length===0){ showToast('You need a Toto to battle with first!'); return; }
    pendingBattle = ctx;
    if (ctx.type==='catch'){ renderCountdownStep('Wild Toto approaching!', ()=> launchBattle({mode:'catch', kind:'catch', opponent: ctx.wildToto, allies:[]})); }
    else if (ctx.type==='gym'){ renderModeSelectStep({ name: ctx.gym.name, boss: ctx.gym.boss, label:'Champion' }); }
    else { renderModeSelectStep({ name: ctx.shrine.name, boss: ctx.shrine.guardian, label:'Guardian' }); }
    $('#setup-modal').classList.add('active');
  }
  function closeSetup(){ $('#setup-modal').classList.remove('active'); pendingBattle=null; }

  function renderModeSelectStep(target){
    $('#setup-card').innerHTML =
      '<div class="setup-title">'+target.name+'</div>'+
      '<div class="setup-sub">'+target.label+': '+target.boss.name+' · PWR '+target.boss.cp+' · '+target.boss.tier+'</div>'+
      (target.label==='Champion' ? '<div class="setup-pass"><img src="'+ITEM_INFO.raidPass.img+'" alt="">Uses 1 Raid Pass · you have '+(ensureItems().raidPass||0)+'</div>' : '')+
      '<div class="mode-options">'+
        '<div class="mode-card" id="mode-solo"><div class="mi">🧍</div><div class="mn">Solo Battle</div></div>'+
        '<div class="mode-card" id="mode-group"><div class="mi">👥</div><div class="mn">Group Battle</div></div>'+
      '</div>'+
      '<div class="btn-row"><button class="btn-cancel" id="setup-cancel" style="width:100%;">Cancel</button></div>';
    $('#mode-solo').onclick = ()=>{
      renderTeamSelectStep(target, 'solo', []);
    };
    $('#mode-group').onclick = ()=> renderLobbyStep(target);
    $('#setup-cancel').onclick = closeSetup;
  }
  function renderTeamSelectStep(target, mode, allies){
    // Exactly one Toto goes into battle now — no bench. If it's defeated, you don't swap
    // to a backup; see endBattle()/spectate handling for what happens instead in a group
    // fight (you watch your teammates finish it, and still win if they pull it off).
    const sorted = state.collection.slice().sort((a,b)=> ((hpOf(b)>0) - (hpOf(a)>0)) || (b.cp-a.cp));
    const healthy = sorted.filter(t=> hpOf(t) > 0);
    let selected = healthy.length ? healthy[0].id : null;
    function cardsHtml(){
      return sorted.map(t=>{
        const isSel = selected===t.id; const ri = ROLE_INFO[t.role]||ROLE_INFO.attacker;
        const hp = hpOf(t), pct = Math.round(hp/Math.max(1,t.maxHp)*100);
        return '<div class="team-card'+(isSel?' sel':'')+(hp<=0?' fainted':'')+'" data-id="'+t.id+'">'+
          '<div class="sp">'+spriteMarkup(t)+'</div><div class="nm">'+t.name+'</div>'
          + '<div class="role-badge" style="color:'+ri.color+';">'+ri.icon+' '+ri.label+'</div>'
          + '<div class="cp">PWR '+t.cp+'</div>'
          + (hp < t.maxHp ? '<div class="hp-mini"><div style="width:'+pct+'%;background:'+hpColor(pct)+'"></div></div><div class="hp-num">'+(hp<=0?'💤 Fainted':hp+'/'+t.maxHp+' HP')+'</div>' : '')+
        '</div>';
      }).join('');
    }
    $('#setup-card').innerHTML =
      '<div class="setup-title">Choose Your Toto</div>'+
      '<div class="setup-sub">Pick exactly 1 — this is who fights</div>'+
      '<div class="team-grid" id="team-grid">'+cardsHtml()+'</div>'+
      '<div class="btn-row"><button class="btn-cancel" id="team-cancel">Cancel</button><button class="btn-catch" id="team-confirm">Battle!</button></div>';
    if (!healthy.length) $('#team-grid').insertAdjacentHTML('beforebegin', '<div class="setup-sub" style="color:#c0392b;">All your Totos have fainted — heal one with a Healing Elixir (Items) first.</div>');
    $$('.team-card', $('#team-grid')).forEach(card=>{
      card.onclick = ()=>{
        if (card.classList.contains('fainted')){ showToast('💤 It fainted — heal it with a Healing Elixir first (Items).'); return; }
        selected = card.dataset.id;
        $$('.team-card', $('#team-grid')).forEach(c=> c.classList.toggle('sel', c.dataset.id===selected));
      };
    });
    $('#team-confirm').onclick = ()=>{
      if (!selected){ showToast(healthy.length ? 'Pick a Toto to battle with!' : '💤 Your Totos need healing first — use a Healing Elixir (Items).'); return; }
      const team = [state.collection.find(t=>t.id===selected)].filter(Boolean);
      // Bots that joined the lobby before you picked (see renderLobbyStep) don't know
      // their role yet — now that we know YOUR role, hand each pending bot one of the
      // roles you didn't take (a random Mythical Toto in that role), so a solo group
      // battle ends up with a squad covering Attacker/Tanker/Healer/Supporter instead of
      // three computer copies of whatever you chose.
      if (allies && allies.length){
        const myRole = team[0] ? team[0].role : 'attacker';
        const rolePool = ['attacker','tanker','healer','supporter'].filter(r=>r!==myRole);
        let ri = 0;
        allies.forEach(ally=>{
          if (!ally.pendingRole) return;
          const role = rolePool[ri % rolePool.length]; ri++;
          const mt = makeMythicalOfRole(role);
          ally.sprite = spriteMarkup(mt); ally.name = mt.name; ally.role = mt.role; ally.tier = 'mythical'; ally.level = mt.level;
          delete ally.pendingRole;
        });
      }
      renderCountdownStep('Preparing battle…', ()=> launchBattle({mode, kind: target.label==='Guardian' ? 'shrine' : 'gym', opponent: target.boss, allies, shrineName: target.name, team}));
    };
    $('#team-cancel').onclick = closeSetup;
  }
  function renderLobbyStep(target){
    const WAIT_SECS = 40;
    const maxSlots = 4;
    const myId = uid();
    // Grouping key: same shrine, same rough arrival window, so people who queue up
    // within about a minute of each other land in the same lobby.
    const lobbyId = target.name.replace(/\s+/g,'_')+'_'+Math.floor(Date.now()/60000);
    let secondsLeft = WAIT_SECS, realAllies = [], botsAdded = [], started = false, presenceOk = githubLbConfigured;
    $('#setup-card').innerHTML =
      '<div class="setup-title">Group Battle Lobby</div>'+
      '<div class="setup-sub">'+target.name+' · '+(presenceOk ? 'waiting for real trainers…' : 'gathering a team…')+'</div>'+
      '<div class="lobby-count" id="lobby-count">1/'+maxSlots+' ready</div>'+
      '<div class="lobby-list" id="lobby-list"></div>'+
      '<div class="setup-sub" id="lobby-timer">Waiting for players… '+secondsLeft+'s</div>'+
      '<div class="btn-row"><button class="btn-cancel" id="lobby-cancel">Leave</button><button class="btn-catch" id="lobby-start">Start Now</button></div>';
    function renderSlots(){
      const el = $('#lobby-list'); el.innerHTML='';
      el.insertAdjacentHTML('beforeend', '<div class="lobby-slot filled" title="You">🧙</div>');
      realAllies.forEach(p=> el.insertAdjacentHTML('beforeend', '<div class="lobby-slot filled real" title="'+(p.name||'Trainer')+' (real)">'+(p.avatar||'🧑')+'</div>'));
      botsAdded.forEach(p=> el.insertAdjacentHTML('beforeend', '<div class="lobby-slot filled" title="'+p.name+' (bot)">'+p.avatar+'</div>'));
      const filled = 1+realAllies.length+botsAdded.length;
      for (let i=filled; i<maxSlots; i++) el.insertAdjacentHTML('beforeend', '<div class="lobby-slot">?</div>');
      $('#lobby-count').textContent = filled+'/'+maxSlots+' ready';
    }
    renderSlots();
    async function registerPresence(){
      if (!presenceOk) return;
      try {
        await githubPresenceWrite(data=>{
          if (!data.lobbies[lobbyId]) data.lobbies[lobbyId]=[];
          data.lobbies[lobbyId] = data.lobbies[lobbyId].filter(p=> Date.now()-p.ts<25000 && p.id!==myId);
          data.lobbies[lobbyId].push({ id:myId, name:state.username||'Trainer', avatar:state.avatar||'🧙', ts:Date.now() });
        });
      } catch(e){ presenceOk = false; } // API unreachable — fall back to bots-only silently
    }
    async function pollPresence(){
      if (!presenceOk || started) return;
      try {
        const { data } = await githubPresenceRead();
        const list = (data.lobbies && data.lobbies[lobbyId]) || [];
        realAllies = list.filter(p=> p.id!==myId && Date.now()-p.ts<25000).slice(0, maxSlots-1);
        renderSlots();
        if (1+realAllies.length >= maxSlots) start();
      } catch(e){}
    }
    async function removePresence(){
      if (!presenceOk) return;
      try { await githubPresenceWrite(data=>{ if (data.lobbies[lobbyId]) data.lobbies[lobbyId]=data.lobbies[lobbyId].filter(p=>p.id!==myId); }); } catch(e){}
    }
    registerPresence();
    const presenceTimer = setInterval(()=>{ registerPresence(); pollPresence(); }, 3000);
    const botNames = [['Ghosty','🧟'],['Vamp','🧛'],['Sleuth','🕵️']];
    function fillRemainingWithBots(){
      const openSlots = maxSlots - (1+realAllies.length+botsAdded.length);
      // pendingRole: true — we don't know your role yet at this point in the flow, so the
      // bot's actual Toto/role gets decided in renderTeamSelectStep's #team-confirm handler
      // once your own pick is known (see makeMythicalOfRole).
      for (let i=0;i<openSlots;i++) botsAdded.push({ name:botNames[i%3][0], avatar:botNames[i%3][1], pendingRole:true });
      renderSlots();
    }
    const tickTimer = setInterval(()=>{
      if (started) return;
      secondsLeft--;
      const filled = 1+realAllies.length+botsAdded.length;
      $('#lobby-timer').textContent = filled>=maxSlots ? 'Ready!' : ('Waiting for players… '+Math.max(0,secondsLeft)+'s');
      if (secondsLeft<=0){ fillRemainingWithBots(); start(); }
    }, 1000);
    function start(){
      if (started) return; started = true;
      clearInterval(presenceTimer); clearInterval(tickTimer); removePresence();
      const allies = realAllies.map(p=>({ sprite:p.avatar||'🧑', hp:100, name:p.name||'Trainer', isReal:true }))
        .concat(botsAdded.map(p=>({ sprite:p.avatar, hp:100, name:p.name, isReal:false, pendingRole:true })));
      renderTeamSelectStep(target, 'group', allies);
    }
    $('#lobby-start').onclick = ()=>{ if (1+realAllies.length+botsAdded.length < maxSlots) fillRemainingWithBots(); start(); };
    $('#lobby-cancel').onclick = ()=>{ clearInterval(presenceTimer); clearInterval(tickTimer); removePresence(); closeSetup(); };
  }
  function renderCountdownStep(label, onDone){
    $('#setup-card').innerHTML = '<div class="setup-title">'+label+'</div><div class="countdown-num" id="cd-num">3</div><div class="setup-sub">Get your Toto ready…</div>';
    let n = 3;
    const t = setInterval(()=>{
      n--;
      if (n<=0){ clearInterval(t); $('#cd-num').textContent='GO!'; setTimeout(()=>{ closeSetup(); onDone(); }, 350); }
      else { $('#cd-num').textContent = n; }
    }, 700);
  }

  // ================= BATTLE SCREEN =================
  let battle = null;
  // ================= COMBAT NUMBERS (role-based PvE) =================
  // Tuned with a fight simulator so raids take a while and need the right team:
  //  - A hero's hit is a share of the boss's health pool, scaled by its role (attackers
  //    hit hardest) and by how its Attack stacks up against the boss's Defense — so a
  //    basic hit is a few hundred on a guardian, abilities more, never a one-shot.
  //  - The boss hits with its own Attack against each hero's Defense, much harder in a
  //    group (it's built for four) than solo. Solo, an Eternal attacker can beat a
  //    Challenger guardian; a group needs its tank, healer and support doing their jobs.
  //  - Boss mechanics: a Shockwave on the whole team every 14s (group), an Enrage below
  //    30% health, and after 4 minutes it keeps getting stronger, so a fight can't stall.
  const DMG_P = 0.0045;
  const BOSS_K = { solo:0.0055, group:0.13 };
  const BOSS_HP_MULT = { solo:5.5, group:8, catch:1.5 };
  const BOSS_ROLE_FLAVOR = { attacker:{atk:1,hp:1,def:1}, supporter:{atk:0.85,hp:1.15,def:1.1}, tanker:{atk:0.75,hp:1.4,def:1.3}, healer:{atk:0.7,hp:1.25,def:1.15} };
  const SWING_MS = 1000, BOSS_SWING_MS = 1600, SWEEP_EVERY_MS = 14000, SWEEP_WARN_MS = 1700;
  // Kept for any older callers: plain attack-vs-defence damage with a per-hit cap.
  function damageCapPct(mode){ return mode==='catch' ? 0.34 : 0.04; }
  function computeDamage(attackPower, defenderDef, defenderMaxHp, capPct){
    const mitigated = attackPower * (attackPower/(attackPower+Math.max(1,defenderDef)));
    return Math.max(2, Math.round(Math.min(mitigated*(0.85+Math.random()*0.3), defenderMaxHp*capPct)));
  }
  // One member of your side. `allKnown` (bots / other trainers) knows every ability its
  // level allows; your own Toto uses exactly what you've learned for it.
  function fighterFromToto(t, allKnown, spriteHtml){
    const role = ROLE_KITS[t.role] ? t.role : 'attacker';
    const kit = allKnown ? abilityKit(t).filter(a=> (t.level||1) >= a.level) : learnedAbilities(t);
    return { ref:t, name:t.name, sprite: spriteHtml || spriteMarkup(t), level:t.level||1, cp:t.cp, tier:t.tier||'normal', role,
             maxHp:t.maxHp, hp:(t.hp != null && isFinite(t.hp)) ? Math.max(0, Math.min(t.maxHp, t.hp)) : t.maxHp, atk:Math.max(1,t.atk||1), def:Math.max(1,t.def||1), spd:t.spd||1, isToni:!!t.isToni,
             kit, cds:{}, fx:{}, used:{}, swingAt:0, thinkAt:0 };
  }
  // The boss: an Attacker-strength body for its tier/level, flavoured by its role (a tank
  // boss is tougher but hits softer, a healer boss has more health, …) with a raid-sized
  // health pool that's bigger for a group.
  function bossFighter(t, mode){
    const tier = TIER_IDX[t.tier] != null ? t.tier : 'eternal';
    const lvl = t.level || TOTO_MAX_LEVEL;
    const base = statsForLevel(tier, 'attacker', lvl, t.statMult || 1);
    const fl = BOSS_ROLE_FLAVOR[t.role] || BOSS_ROLE_FLAVOR.attacker;
    const hpBase = base.hp*fl.hp;
    const maxHp = Math.round(hpBase*(BOSS_HP_MULT[mode] || BOSS_HP_MULT.solo));
    return { ref:t, name:t.name, sprite:spriteMarkup(t), level:lvl, tier, role:t.role||'attacker', maxHp, hp:maxHp,
             atk: base.atk*fl.atk, def: base.def*fl.def, unit: hpBase*BOSS_HP_MULT.solo*DMG_P };
  }
  function strongestToto(){
    const healthy = state.collection.filter(t=> hpOf(t) > 0), pool = healthy.length ? healthy : state.collection;
    return pool.length ? pool.slice().sort((a,b)=>b.cp-a.cp)[0] : null;
  }

  // ---------------- BATTLE VIEW: layout, icons, rendering ----------------
  // Role look (aura/ring/plate colours) and crisp SVG role icons — emoji role icons render
  // differently on every phone, these don't.
  const BX_ROLE = {
    attacker: { c:'#ff7a2e', a:'rgba(255,110,30,0.55)', label:'Attacker' },
    tanker:   { c:'#4da3ff', a:'rgba(60,140,255,0.55)', label:'Tank' },
    supporter:{ c:'#c27bff', a:'rgba(176,100,255,0.55)', label:'Support' },
    healer:   { c:'#3be07e', a:'rgba(50,220,120,0.5)',  label:'Healer' }
  };
  const BX_ICON = {
    attacker:'<svg viewBox="0 0 24 24"><path d="M12.5 2c.6 3.2-1.4 4.7-2.7 6.4C8.4 10.2 7 12 7 14.6 7 18.6 9.9 22 13 22c3.7 0 6-3 6-6.6 0-2.6-1.3-4.6-2.7-6.1.2 1.6-.4 2.9-1.6 3.6.4-4.6-.6-8.6-2.2-10.9z" fill="#ffd27a" stroke="#7a2a06" stroke-width="1.3" stroke-linejoin="round"/><path d="M12.6 13.2c1.4 1.3 2.4 2.6 2.4 4.1 0 1.6-1.2 2.9-2.7 2.9s-2.6-1.2-2.6-2.7c0-1.6 1.4-2.7 2.9-4.3z" fill="#ff8a2a"/></svg>',
    tanker:'<svg viewBox="0 0 24 24"><path d="M12 2.5l8 3v6.2c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V5.5z" fill="#cfe6ff" stroke="#123a7a" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 5.2l5.4 2v4.6c0 3.5-2.2 6-5.4 7.3z" fill="#5aa8ff"/></svg>',
    supporter:'<svg viewBox="0 0 24 24"><path d="M12 2.4l2.8 6.1 6.6.7-5 4.5 1.4 6.6L12 17l-5.8 3.3 1.4-6.6-5-4.5 6.6-.7z" fill="#f1dcff" stroke="#4a1a7a" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    healer:'<svg viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#dcffe9" stroke="#0e5a2a" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  };
  function bxEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  // Sprite markup is either real art (<img>/<svg>) or, for real-player allies, just an emoji.
  function bxArt(sprite){ const s = String(sprite||''); return /^\s*</.test(s) ? s : '<span class="bx-emoji">'+bxEsc(s||'❔')+'</span>'; }
  function fmt(n){ return Math.max(0, Math.round(n)).toLocaleString(); }

  // Landscape: the stage is laid out in a 540-unit-tall design space whose width follows the
  // screen's aspect. When the phone is upright the whole battle screen is turned 90° so the
  // fight plays sideways like the reference (and we try a real orientation lock first, which
  // installed web apps on Android allow).
  let bxOrientationLocked = false, bxRotated = false;
  function layoutBattleScreen(){
    const scr = $('#battle-screen'), stage = $('#bx-stage'), host = document.getElementById('toto-root');
    if (!scr || !host) return;
    // On a phone the fight always takes the whole real screen (fixed to the viewport), even
    // if the phone is already sideways and the app's desktop "phone frame" has kicked in;
    // a desktop browser window that's wider than tall gets the same treatment, so the fight
    // plays in proper landscape instead of sideways inside the portrait phone frame.
    const touch = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
    const full = touch || window.innerWidth > window.innerHeight;
    scr.style.position = full ? 'fixed' : '';
    const vw = full ? window.innerWidth : host.clientWidth, vh = full ? window.innerHeight : host.clientHeight;
    const portrait = vh > vw;
    bxRotated = portrait;
    const W = portrait ? vh : vw, H = portrait ? vw : vh;
    scr.style.width = W+'px'; scr.style.height = H+'px';
    scr.style.transform = portrait ? 'translate('+vw+'px,0) rotate(90deg)' : 'none';
    const scale = H/540;
    const dw = Math.max(820, Math.min(1260, W/scale));
    const fit = Math.min(scale, W/dw);
    stage.style.width = dw+'px';
    stage.style.transform = 'translate('+((W - dw*fit)/2)+'px,'+((H - 540*fit)/2)+'px) scale('+fit+')';
    stage.dataset.dw = dw;
    // horizontal anchors that depend on the design width
    const rosterL = dw - 14 - 212;
    stage.style.setProperty('--bx-bossbar-x', Math.min(dw/2, rosterL - 166)+'px');
    // narrow screens (tablets, the desktop phone-frame) drop the right-hand roster so the
    // arena keeps enough room for the boss and the whole party side by side
    const narrowStage = dw < 1080;
    stage.classList.toggle('bx-narrow', narrowStage);
    const abilW = narrowStage ? 5*52 + 4*7 + 18 + 4 : 5*60 + 4*9 + 18 + 4;   // five ability slots
    stage.style.setProperty('--bx-charge-x', ((14+2*50+9+14) + (dw - 14 - abilW - 14))/2 + 'px');
    if (battle) placeBattlers();
  }
  window.addEventListener('resize', ()=>{ if ($('#battle-screen').classList.contains('active')) layoutBattleScreen(); });
  function lockLandscape(){
    try {
      if (screen.orientation && screen.orientation.lock){
        screen.orientation.lock('landscape').then(()=>{ bxOrientationLocked = true; setTimeout(layoutBattleScreen, 250); }).catch(()=>{});
      }
    } catch(e){}
  }
  function unlockOrientation(){
    if (!bxOrientationLocked) return;
    bxOrientationLocked = false;
    try { screen.orientation.lock('portrait').catch(()=>{ try{ screen.orientation.unlock(); }catch(e){} }); } catch(e){}
  }

  // Everyone on your side, in one list: your Toto first, then real/computer allies.
  function teamMembers(){
    if (!battle) return [];
    const list = [{ key:'p', f:battle.player, isPlayer:true }];
    battle.allies.forEach((a,i)=> list.push({ key:'a'+i, f:a, isPlayer:false, idx:i }));
    return list;
  }
  // Field order left→right follows the reference (tank, support, attacker, healer).
  const BX_FIELD_ORDER = { tanker:0, supporter:1, attacker:2, healer:3 };

  function buildBattleView(){
    const team = teamMembers();
    // arena line-up
    const fieldEl = $('#bx-team'); fieldEl.innerHTML = '';
    const ordered = team.slice().sort((a,b)=> (BX_FIELD_ORDER[a.f.role]??2) - (BX_FIELD_ORDER[b.f.role]??2));
    ordered.forEach(m=>{
      const r = BX_ROLE[m.f.role] || BX_ROLE.attacker;
      const el = document.createElement('div');
      el.className = 'bx-member' + (m.isPlayer ? ' me' : '');
      el.style.setProperty('--rc', r.c); el.style.setProperty('--rc-a', r.a);
      let sparks = '';
      for (let i=0;i<4;i++) sparks += '<span class="bx-spark" style="left:'+(30+i*26)+'px; animation-delay:'+(i*0.55)+'s"></span>';
      el.innerHTML = '<div class="bx-fig"><div class="bx-aura"></div><div class="bx-circle"></div>'+sparks
        + '<div class="bx-sprite">'+bxArt(m.f.sprite)+'</div><div class="bx-shield"></div></div>'
        + '<div class="bx-plate"><div class="bx-plate-ic">'+BX_ICON[m.f.role||'attacker']+'</div>'
        + '<div class="bx-plate-body"><div class="bx-plate-row"><span class="bx-plate-name">'+bxEsc(m.f.name)+'</span><span class="bx-plate-lv">Lv. '+(m.f.level||1)+'</span></div>'
        + '<div class="bx-hp"><div class="bx-hp-fill"></div><div class="bx-hp-text"></div></div></div></div>';
      el.onclick = ()=> pickTarget(m.f);
      fieldEl.appendChild(el);
      m.el = el; m.f._el = el;
    });
    // right-hand roster
    const rosterEl = $('#bx-roster'); rosterEl.innerHTML = '';
    team.forEach(m=>{
      const r = BX_ROLE[m.f.role] || BX_ROLE.attacker;
      const card = document.createElement('div');
      card.className = 'bx-card' + (m.isPlayer ? ' active' : '');
      card.style.setProperty('--rc', r.c);
      card.innerHTML = '<div class="bx-portrait">'+bxArt(m.f.sprite)+'</div><div class="bx-card-body">'
        + '<div class="bx-card-name">'+bxEsc(m.f.name)+'</div>'
        + '<div class="bx-card-sub"><span class="bx-role-ic">'+BX_ICON[m.f.role||'attacker']+'</span><span>'+r.label+'</span><span class="bx-lv">Lv. '+(m.f.level||1)+'</span></div>'
        + '<div class="bx-hp"><div class="bx-hp-fill"></div><div class="bx-hp-text"></div></div></div>';
      card.onclick = ()=> pickTarget(m.f);
      rosterEl.appendChild(card);
      m.f._card = card;
    });
    // boss + top bars
    const e = battle.enemy;
    setSpriteHtml($('#bf-e-sprite'), bxArt(e.sprite));
    setSpriteHtml($('#bf-e-portrait'), bxArt(e.sprite));
    $('#bf-e-name').textContent = e.name; $('#bf-e-level').textContent = 'Lv. '+(e.level||1);
    $('#bx-boss').classList.remove('down','hit','lunge');
    // active hero (you)
    const p = battle.player, pr = BX_ROLE[p.role] || BX_ROLE.attacker;
    setSpriteHtml($('#bx-active-portrait'), bxArt(p.sprite));
    $('#bx-active-roleic').innerHTML = BX_ICON[p.role||'attacker'];
    $('#bx-active-name').textContent = p.name;
    $('#bx-active-role').textContent = pr.label; $('#bx-active-role').style.color = pr.c;
    $('#bx-active-lv').textContent = 'Lv. '+(p.level||1);
    $('#bx-move-name').textContent = '';
    // your Toto's five role-ability slots: learned ones ready to use, the rest locked
    // with the level they unlock at
    const abEl = $('#bx-abilities'); abEl.innerHTML = '';
    const known = new Set(p.kit.map(a=> a.id));
    abilityKit(p.ref).forEach((a,i)=>{
      const c = ROLE_AB_COLORS[a.role] || ROLE_AB_COLORS.attacker;
      const b = document.createElement('button');
      b.className = 'bx-ab' + (known.has(a.id) ? '' : ' locked'); b.dataset.id = a.id;
      b.style.setProperty('--abc-1', c.c1); b.style.setProperty('--abc-2', c.c2); b.style.setProperty('--abc-b', c.b); b.style.setProperty('--abc-g', c.g);
      b.innerHTML = ABILITY_GLYPH[a.glyph] + '<span class="bx-ab-cd"></span><span class="bx-ab-num">'+(i+1)+'</span>'
        + (known.has(a.id) ? '' : '<span class="bx-ab-lock">🔒<b>'+((p.level||1) >= a.level ? 'Learn' : 'Lv '+a.level)+'</b></span>');
      b.title = a.name+' — '+abilityDesc(a);
      b.onclick = ()=> onAbilityButton(a.id);
      abEl.appendChild(b);
    });
    // embers
    const emb = $('#bx-embers'); emb.innerHTML = '';
    for (let i=0;i<14;i++){
      const d = document.createElement('span'); d.className = 'bx-ember';
      d.style.left = (8+Math.random()*84)+'%'; d.style.animationDuration = (5+Math.random()*5)+'s'; d.style.animationDelay = (-Math.random()*8)+'s';
      d.style.transform = 'scale('+(0.6+Math.random())+')';
      emb.appendChild(d);
    }
  }
  // Positions the boss and the line-up for the current design width.
  function placeBattlers(){
    const stage = $('#bx-stage'); const dw = parseFloat(stage.dataset.dw || 960);
    const narrow = stage.classList.contains('bx-narrow');
    const fieldL = 24, fieldR = narrow ? dw - 24 : dw - 14 - 212 - 12;
    const boss = $('#bx-boss');
    const team = Array.from($('#bx-team').children);
    const n = team.length;
    // How wide the boss really is on screen: its picture is fitted into a 340x266 box, so
    // a tall sitting dog is much narrower than a wide scarecrow. The party stands clear of
    // that width (plus a little breathing room) — half to its left, half to its right.
    const img = $('#bf-e-sprite img');
    let bossW = 240;
    if (img && img.naturalWidth && img.naturalHeight) bossW = Math.min(340, 266*img.naturalWidth/img.naturalHeight);
    else if (img && !img.__bxWaitLoad){ img.__bxWaitLoad = true; img.addEventListener('load', ()=>{ if (battle) placeBattlers(); }, { once:true }); }
    const gapHalf = bossW/2 + 26;
    const nL = Math.ceil(n/2), nR = n - nL;
    const fieldW = fieldR - fieldL;
    const slot = Math.max(96, Math.min(220, (fieldW - 2*gapHalf) / Math.max(1,n)));
    const total = n*slot + 2*gapHalf;
    const x0 = fieldL + Math.max(0, (fieldW - total)/2);
    const bossX = x0 + nL*slot + gapHalf;
    boss.style.left = bossX+'px'; boss.style.top = '50px';
    // the boss's health bar sits over the boss, kept clear of the top-right hero card
    stage.style.setProperty('--bx-bossbar-x', Math.max(164, Math.min(bossX, dw - 14 - 232 - 12 - 150))+'px');
    const ms = Math.max(0.6, Math.min(n===1 ? 1.12 : 1, slot/188));
    // Field order (tank, support, attacker, healer) reads left→right across the gap.
    team.forEach((el,i)=>{
      const x = i < nL ? x0 + slot*(i+0.5) : bossX + gapHalf + slot*(i-nL+0.5);
      // member box is 212 tall and scales from its bottom edge, so the nameplates always
      // finish just above the battle log / charge button
      el.style.left = x+'px'; el.style.top = '206px';
      el.style.setProperty('--ms', ms.toFixed(3));
      el.style.setProperty('--lx', ((bossX - x)*0.12).toFixed(0)+'px');
    });
  }

  function setSpriteHtml(el, html){ if (el && el.__spriteHtml !== html){ el.innerHTML = html; el.__spriteHtml = html; } }
  function setBar(fillEl, textEl, hp, maxHp, withMax){
    const pct = Math.max(0, Math.min(100, hp/Math.max(1,maxHp)*100));
    if (fillEl){ fillEl.style.width = pct+'%'; fillEl.classList.toggle('low', pct<50 && pct>=25); fillEl.classList.toggle('crit', pct<25); }
    if (textEl) textEl.textContent = withMax===false ? fmt(hp) : (fmt(hp)+' / '+fmt(maxHp));
  }
  function renderBattle(){
    if (!battle) return;
    const e = battle.enemy, now = Date.now();
    $('#bf-e-hp').style.width = Math.max(0, e.hp/e.maxHp*100)+'%';
    $('#bf-e-hpfrac').textContent = fmt(e.hp)+' / '+fmt(e.maxHp);
    const teamUp = !!(battle.teamDmgUp && battle.teamDmgUp.until > now);
    teamMembers().forEach(m=>{
      const f = m.f, down = f.hp <= 0;
      if (f._el){
        setBar(f._el.querySelector('.bx-hp-fill'), f._el.querySelector('.bx-hp-text'), f.hp, f.maxHp, true);
        f._el.classList.toggle('down', down);
        f._el.classList.toggle('fortified', !down && armorOf(f) > 0);
        f._el.classList.toggle('buffed', !down && (teamUp || !!fxOn(f,'rage')));
        f._el.classList.toggle('taunting', !down && battle.taunter===f);
      }
      if (f._card){
        setBar(f._card.querySelector('.bx-hp-fill'), f._card.querySelector('.bx-hp-text'), f.hp, f.maxHp, true);
        f._card.classList.toggle('down', down);
        f._card.classList.toggle('taunting', !down && battle.taunter===f);
      }
    });
    const p = battle.player;
    setBar($('#bx-active-hp'), null, p.hp, p.maxHp);
    $('#bx-active-hptext').textContent = fmt(p.hp)+' / '+fmt(p.maxHp);
    const left = x=> Math.ceil((x.until-now)/1000)+'s';
    let buffs = '';
    if (p.hp > 0){
      if (battle.taunter===p) buffs += '<span class="bx-buff" style="color:#ff7a7a">TAUNT</span>';
      const arm = armorOf(p); if (arm > 0) buffs += '<span class="bx-buff" style="color:#8fd0ff">DEF ▲'+Math.round(arm*100)+'%</span>';
      const rage = fxOn(p,'rage'); if (rage) buffs += '<span class="bx-buff" style="color:#ffb347">RAGE '+left(rage)+'</span>';
      if (teamUp) buffs += '<span class="bx-buff" style="color:#d9a6ff">ATK ▲ '+left(battle.teamDmgUp)+'</span>';
      if (battle.hots.length) buffs += '<span class="bx-buff" style="color:#5dff9a">REGEN</span>';
    }
    $('#bx-buffs').innerHTML = buffs;
    // the glow along CHARGE ATTACK fills back up as your next hit recharges
    const ready = 1 - Math.max(0, Math.min(1, (p.swingAt - now)/SWING_MS));
    $('#bx-energy').style.width = (ready*100).toFixed(0)+'%';
    $('#btn-attack').classList.toggle('disabled', !!battle.spectating || !!battle.over || p.hp <= 0);
    updateAbilityButtons();
  }

  // ---------------- effects ----------------
  // Centre of an element in the stage's own (unscaled, unrotated) design coordinates, so
  // effects can be dropped onto it whichever way the screen is turned.
  function bxCenterOf(el, fracY){
    const fy = fracY==null ? 0.5 : fracY;
    const st = $('#bx-stage'), r = el.getBoundingClientRect(), sr = st.getBoundingClientRect();
    if (!bxRotated){
      const s = sr.height/540 || 1;
      return { x:(r.left + r.width/2 - sr.left)/s, y:(r.top + r.height*fy - sr.top)/s };
    }
    // turned 90° clockwise: stage x runs down the screen, stage y runs right-to-left
    const s = sr.width/540 || 1;
    return { x:(r.top + r.height/2 - sr.top)/s, y:(sr.right - (r.right - fy*r.width))/s };
  }
  function bxAt(el, fracY){ return el ? bxCenterOf(el, fracY) : { x:0, y:0 }; }
  function bxFx(html, pos, life){
    const fx = $('#bx-fx'); const d = document.createElement('div');
    d.innerHTML = html; const node = d.firstChild;
    node.style.left = pos.x+'px'; node.style.top = pos.y+'px';
    fx.appendChild(node); setTimeout(()=> node.remove(), life||1000);
    return node;
  }
  function popNumber(target, val, kind){
    const el = target==='boss' ? $('#bf-e-sprite') : target;
    if (!el) return;
    const pos = bxAt(el, target==='boss' ? 0.45 : 0.35);
    pos.x += (Math.random()-0.5)*40; pos.y += (Math.random()-0.5)*16;
    const colors = { hit:'#ffffff', crit:'#ffd23d', hurt:'#ff5470', heal:'#5dff9a', small:'#ffe2b8' };
    const cls = kind==='crit' ? ' big' : (kind==='small' ? ' small' : '');
    const text = (kind==='heal' ? '+' : '-') + fmt(val);
    bxFx('<div class="bx-num'+cls+'" style="color:'+(colors[kind]||'#fff')+'">'+text+'</div>', pos, 900);
  }
  function bxShake(){ const st = $('#bx-stage'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); }
  function bxPulse(el, cls, ms){ if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(()=> el.classList.remove(cls), ms||450); }
  let bxLogHoldUntil = 0;
  function battleLog(msg, important){
    const el = $('#battle-log'), now = Date.now();
    if (!important && now < bxLogHoldUntil) return;     // routine chatter never hides your last action / a warning
    if (important) bxLogHoldUntil = now + 1500;
    el.textContent = msg; clearTimeout(el.__t); el.__t = setTimeout(()=>{ el.textContent=''; }, 2600);
  }
  function fxSlash(){
    const pos = bxAt($('#bf-e-sprite'), 0.45);
    bxFx('<svg class="bx-slash" viewBox="0 0 260 200"><path d="M20 180 Q120 120 240 20" stroke="#fff6d0" stroke-width="14"/><path d="M30 190 Q130 130 250 34" stroke="#ff8a2a" stroke-width="7" opacity="0.9"/><path d="M10 168 Q110 108 228 10" stroke="#ffcf6a" stroke-width="4"/></svg>', pos, 600);
    bxFx('<div class="bx-burst"></div>', pos, 420);
  }
  function fxSpark(){ bxFx('<div class="bx-burst" style="width:80px;height:80px"></div>', bxAt($('#bf-e-sprite'), 0.5+(Math.random()-0.5)*0.3), 420); }
  function fxTeam(kind){
    teamMembers().forEach(m=>{
      if (!m.f._el || m.f.hp<=0) return;
      const pos = bxAt(m.f._el.querySelector('.bx-fig'), 0.92);
      if (kind==='heal'){ for (let i=0;i<3;i++) setTimeout(()=> bxFx('<div class="bx-rise" style="color:#5dff9a">✚</div>', { x:pos.x+(Math.random()-0.5)*70, y:pos.y-30-Math.random()*40 }, 1000), i*140); }
      else if (kind==='buff'){ bxFx('<div class="bx-ring" style="color:#c98bff"></div>', pos, 800); setTimeout(()=> bxFx('<div class="bx-ring" style="color:#e6c8ff"></div>', pos, 800), 180); }
      else if (kind==='shield'){ bxFx('<div class="bx-ring" style="color:#7cc0ff"></div>', pos, 800); }
      bxPulse(m.f._el, 'cast', 700);
    });
  }

  // ---------------- combat engine ----------------
  function livingTeam(){ return battle ? battle.team.filter(f=> f.hp > 0) : []; }
  function fxOn(f, key){ const e = f && f.fx[key]; return e && e.until > Date.now() ? e : null; }
  function hpPct(f){ return f.hp / Math.max(1, f.maxHp); }
  function lowestAlly(){ let best = null; livingTeam().forEach(m=>{ if (!best || hpPct(m) < hpPct(best)) best = m; }); return best; }
  function teamTank(){ return (battle.taunter && battle.taunter.hp > 0) ? battle.taunter : (livingTeam().find(m=> m.role==='tanker') || (battle.bossTarget && battle.bossTarget.hp>0 ? battle.bossTarget : null)); }
  // A hero's hit on the boss: share of the boss pool x role x (Attack vs boss Defense) x buffs.
  function heroHit(f, mult, scale){
    const e = battle.enemy, now = Date.now();
    const r = f.atk/(f.atk + e.def);
    let up = 1;
    const rage = fxOn(f, 'rage'); if (rage) up += rage.pct;
    if (battle.teamDmgUp && battle.teamDmgUp.until > now) up += battle.teamDmgUp.pct;
    const hexed = (battle.hex && battle.hex.until > now) ? 1 + battle.hex.taken : 1;
    const s = scale != null ? scale : (ROLE_BASIC_MULT[f.role] || 0.4);
    return Math.max(1, Math.round(e.unit * s * r * mult * up * hexed * (0.9 + Math.random()*0.2)));
  }
  function damageBoss(amount, kind){
    if (!battle || battle.over) return;
    const e = battle.enemy;
    if (e.hp <= 0) return;
    e.hp = Math.max(0, e.hp - amount);
    popNumber('boss', amount, kind || 'hit');
    if (!battle.enraged && e.hp > 0 && e.hp < e.maxHp*0.3){
      battle.enraged = true; $('#bx-boss').classList.add('enraged');
      battleLog('😡 '+e.name+' is enraged — it hits harder and faster!', true);
    }
    if (e.hp <= 0) setTimeout(()=> endBattle(true), 260);
  }
  // Damage reduction from every armour source on a hero (they stack multiplicatively).
  function armorOf(f){
    const now = Date.now(); let keep = 1;
    ['armor','ward','tauntArmor'].forEach(k=>{ const x = f.fx[k]; if (x && x.until > now) keep *= (1 - x.pct); });
    if (battle.teamArmor && battle.teamArmor.until > now) keep *= (1 - battle.teamArmor.pct);
    return Math.min(0.8, 1 - keep);
  }
  function bossPower(){
    const now = Date.now();
    let m = battle.enraged ? 1.3 : 1;
    const secs = (now - battle.startedAt)/1000;
    if (secs > 240) m *= Math.pow(1.5, Math.floor((secs-240)/30) + 1);   // no stalling forever
    if (battle.hex && battle.hex.until > now) m *= (1 - battle.hex.pct);
    return m;
  }
  function bossHitOn(f, mult){
    if (battle.practice) return f.hp - f.maxHp*0.05 < f.maxHp*0.25 ? 1 : Math.max(1, Math.round(f.maxHp*0.05*(mult||1)));
    const e = battle.enemy;
    const g = e.atk/(e.atk + f.def);
    return Math.max(1, Math.round(e.atk * battle.bossK * g * mult * (1 - armorOf(f)) * bossPower() * (0.9 + Math.random()*0.2)));
  }
  function hurtHero(f, dmg){
    if (!battle || battle.over || f.hp <= 0) return;
    f.hp = Math.max(0, f.hp - dmg);
    if (f._el){ bxPulse(f._el, 'hit', 380); popNumber(f._el.querySelector('.bx-sprite'), dmg, 'hurt'); }
    if (f.hp <= 0) heroDown(f);
  }
  function heroDown(f){
    battleLog('💀 '+f.name+' is down!', true);
    if (battle.taunter === f){
      battle.taunter = null;
      setTimeout(()=>{ if (battle && !battle.over) battleLog(battle.enemy.name+' breaks free of the taunt!', true); }, 1000);
    }
    if (f === battle.player){ cancelTargeting(); if (battle.group) battle.spectating = true; }
    if (!livingTeam().length || (f === battle.player && !battle.group)) setTimeout(()=> endBattle(false), 450);
  }
  function healHero(f, amount){
    if (!f || f.hp <= 0) return 0;
    const before = f.hp; f.hp = Math.min(f.maxHp, f.hp + Math.round(amount));
    const got = f.hp - before;
    if (got > 0 && f._el) popNumber(f._el.querySelector('.bx-sprite'), got, 'heal');
    return got;
  }
  function fxOnMember(f, kind){
    if (!f || !f._el) return;
    const pos = bxAt(f._el.querySelector('.bx-fig'), 0.92);
    if (kind==='heal'){ for (let i=0;i<3;i++) setTimeout(()=> bxFx('<div class="bx-rise" style="color:#5dff9a">✚</div>', { x:pos.x+(Math.random()-0.5)*60, y:pos.y-30-Math.random()*40 }, 1000), i*140); }
    else if (kind==='shield') bxFx('<div class="bx-ring" style="color:#7cc0ff"></div>', pos, 800);
    else if (kind==='taunt') bxFx('<div class="bx-ring" style="color:#ff5050"></div>', pos, 900);
    bxPulse(f._el, 'cast', 700);
  }
  function fxShockwave(){ bxFx('<div class="bx-shock"></div>', bxAt($('#bf-e-sprite'), 0.8), 900); }

  function abilityReadyIn(f, a){
    if (a.once && f.used[a.id]) return Infinity;
    return Math.max(0, (f.cds[a.id]||0) - Date.now());
  }
  function canCast(f, a){ return !!battle && !battle.over && f.hp > 0 && abilityReadyIn(f, a) === 0; }
  // Runs one ability for anyone on your side (you, a bot, or AUTO). `target` is the ally
  // picked for single-target abilities.
  function castAbility(f, a, target){
    if (!canCast(f, a)) return false;
    const e = battle.enemy, now = Date.now();
    f.cds[a.id] = now + a.cd*1000; if (a.once) f.used[a.id] = true;
    if (f._el) bxPulse(f._el, 'cast', 700);
    if (f === battle.player) Sound.playAbility();
    const mine = f === battle.player;
    const who = mine ? '' : f.name+' — ';
    const say = msg=> battleLog(msg, mine);
    switch (a.kind){
      case 'damage': {
        if (f._el) bxPulse(f._el, 'lunge', 420);
        const d = heroHit(f, a.mult, a.scale);
        setTimeout(()=>{ if (!battle || battle.over) return; fxSlash(); bxPulse($('#bx-boss'), 'hit', 380); damageBoss(d, 'crit'); if (mine) bxShake(); }, 160);
        say((f.role==='tanker'?'🛡️ ':'🔥 ')+who+a.name+' hits for '+fmt(d)+'!');
        break;
      }
      case 'bleed': {
        if (f._el) bxPulse(f._el, 'lunge', 420);
        const d = heroHit(f, a.mult), tick = heroHit(f, a.dot);
        battle.bleeds.push({ next: now+1000, left:6, dmg:tick });
        setTimeout(()=>{ if (!battle || battle.over) return; fxSlash(); damageBoss(d, 'hit'); $('#bx-boss').classList.add('bleeding'); }, 160);
        say('🩸 '+who+a.name+' — '+fmt(d)+' and the boss is bleeding!');
        break;
      }
      case 'rage':
        f.fx.rage = { pct:a.pct, until: now + a.dur*1000 };
        say('🔥 '+who+a.name+'! +'+pctTxt(a.pct)+' damage for '+a.dur+'s');
        break;
      case 'multi': {
        if (f._el) bxPulse(f._el, 'lunge', 420);
        let total = 0;
        for (let i=0;i<a.hits;i++){ const d = heroHit(f, a.mult); total += d; setTimeout(()=>{ if (!battle || battle.over) return; fxSpark(); bxPulse($('#bx-boss'), 'hit', 300); damageBoss(d, 'hit'); }, 150 + i*230); }
        say('🔥 '+who+a.name+' — '+a.hits+' hits for '+fmt(total)+'!');
        break;
      }
      case 'execute': {
        if (f._el) bxPulse(f._el, 'lunge', 420);
        const low = e.hp < e.maxHp*0.3;
        const d = heroHit(f, a.mult*(low ? 1.8 : 1));
        setTimeout(()=>{ if (!battle || battle.over) return; fxSlash(); damageBoss(d, 'crit'); bxShake(); }, 200);
        say('💥 '+who+a.name+(low ? ' — finishing blow! ' : ' hits for ')+fmt(d)+'!');
        break;
      }
      case 'selfArmor':
        f.fx.armor = { pct:a.pct, until: now + a.dur*1000 }; fxOnMember(f, 'shield');
        say('🛡️ '+who+a.name+' — '+pctTxt(a.pct)+' less damage for '+a.dur+'s');
        break;
      case 'selfHeal': {
        const got = healHero(f, f.maxHp*a.pct); fxOnMember(f, 'heal');
        say('✚ '+who+a.name+' +'+fmt(got));
        break;
      }
      case 'teamArmor':
        battle.teamArmor = { pct:a.pct, until: now + a.dur*1000 }; fxTeam('shield');
        say('🛡️ '+who+a.name+' — the team takes '+pctTxt(a.pct)+' less damage');
        break;
      case 'taunt':
        battle.taunter = f; f.fx.tauntArmor = { pct:a.pct, until: now + a.dur*1000 }; fxOnMember(f, 'taunt'); bxShake();
        say('📣 '+(mine ? 'You' : f.name)+' taunted '+e.name+'! It will only attack '+f.name+' now.');
        break;
      case 'allyHeal': {
        const tg = (target && target.hp > 0) ? target : lowestAlly();
        if (!tg) break;
        const got = healHero(tg, tg.maxHp*a.pct); fxOnMember(tg, 'heal');
        say('✚ '+who+a.name+' heals '+(tg===battle.player && mine ? 'you' : tg.name)+' +'+fmt(got));
        break;
      }
      case 'teamHot':
        battle.hots.push({ next: now+1000, left:a.ticks, pct:a.pct }); fxTeam('heal');
        say('🌧️ '+who+a.name+' — healing the team for '+a.ticks+'s');
        break;
      case 'teamHeal': {
        let total = 0; livingTeam().forEach(m=> total += healHero(m, m.maxHp*a.pct)); fxTeam('heal');
        say('✚ '+who+a.name+' heals the team +'+fmt(total)+'!');
        break;
      }
      case 'revive': {
        let tg = target || battle.team.find(m=> m.hp <= 0) || null;
        if (tg && tg.hp <= 0){
          tg.hp = Math.round(tg.maxHp*a.pct); tg.swingAt = now + 600;
          if (tg === battle.player) battle.spectating = false;
          fxOnMember(tg, 'heal');
          say('✨ '+who+a.name+' — '+tg.name+' is back in the fight!');
        } else {
          tg = (tg && tg.hp > 0) ? tg : lowestAlly();
          if (tg){ const got = healHero(tg, tg.maxHp*a.pct); fxOnMember(tg, 'heal'); say('✚ '+who+a.name+' heals '+tg.name+' +'+fmt(got)); }
        }
        break;
      }
      case 'allyArmor': {
        const tg = (target && target.hp > 0) ? target : (teamTank() || f);
        tg.fx.ward = { pct:a.pct, until: now + a.dur*1000 }; fxOnMember(tg, 'shield');
        say('🔮 '+who+a.name+' on '+(tg===battle.player && mine ? 'you' : tg.name)+' — '+pctTxt(a.pct)+' less damage');
        break;
      }
      case 'teamDmgUp':
        battle.teamDmgUp = { pct:a.pct, until: now + a.dur*1000 }; fxTeam('buff');
        say('🎵 '+who+a.name+' — team deals +'+pctTxt(a.pct)+' damage');
        break;
      case 'teamHaste':
        livingTeam().forEach(m=>{ Object.keys(m.cds).forEach(k=>{ m.cds[k] -= a.secs*1000; }); m.swingAt = Math.min(m.swingAt, now); });
        f.cds[a.id] = now + a.cd*1000;
        fxTeam('buff');
        say('⏳ '+who+a.name+' — abilities come back '+a.secs+'s sooner');
        break;
      case 'bossHex':
        battle.hex = { pct:a.pct, taken:a.taken, until: now + a.dur*1000 }; $('#bx-boss').classList.add('hexed');
        say('👁️ '+who+a.name+' — '+e.name+' is weakened!');
        break;
    }
    renderBattle();
    return true;
  }

  // Basic hit (CHARGE ATTACK) on a swing timer.
  function heroSwing(f){
    if (!battle || battle.over || f.hp <= 0) return false;
    const now = Date.now();
    if (now < f.swingAt) return false;
    f.swingAt = now + SWING_MS*(f === battle.player ? 1 : 0.95 + Math.random()*0.3);
    const crit = f.role==='attacker' && Math.random() < 0.12;
    const d = heroHit(f, crit ? 1.6 : 1);
    if (f._el) bxPulse(f._el, 'lunge', 420);
    setTimeout(()=>{ if (!battle || battle.over) return; fxSpark(); bxPulse($('#bx-boss'), 'hit', 300); damageBoss(d, crit ? 'crit' : (f===battle.player ? 'hit' : 'small')); }, 150);
    return d;
  }

  // What a teammate (or you, on AUTO) does next — each role plays its own part.
  function aiAct(f){
    if (!battle || battle.over || f.hp <= 0) return false;
    const e = battle.enemy, now = Date.now(), team = livingTeam();
    const by = id=> f.kit.find(a=> a.id===id);
    const tryA = (id, target)=>{ const a = by(id); return !!(a && canCast(f, a) && castAbility(f, a, target)); };
    const hurt = th=> team.filter(m=> hpPct(m) < th);
    switch (f.role){
      case 'attacker':
        if (e.hp < e.maxHp*0.3 && tryA('finisher')) return true;
        return tryA('rage') || tryA('flurry') || tryA('strike') || tryA('bleed') || tryA('finisher');
      case 'tanker':
        if (battle.group && !battle.taunter && tryA('taunt')) return true;
        if ((battle.bossTarget===f || battle.taunter===f || !battle.group) && !fxOn(f,'armor') && tryA('armor')) return true;
        if (hpPct(f) < 0.75 && tryA('wind')) return true;
        if (battle.group && (hurt(0.8).length >= 2 || battle.sweepWarned) && tryA('guard')) return true;
        return tryA('bash');
      case 'healer': {
        const dead = battle.team.find(m=> m.hp <= 0);
        if (dead && tryA('revive', dead)) return true;
        if (hurt(0.65).length >= 2 && tryA('wave')) return true;
        const low = lowestAlly();
        if (low && hpPct(low) < 0.7 && tryA('touch', low)) return true;
        if (hurt(0.85).length >= 2 && tryA('rain')) return true;
        if (hpPct(f) < 0.85 && tryA('selfheal')) return true;
        if (low && hpPct(low) < 0.45 && tryA('revive', low)) return true;
        return false;
      }
      case 'supporter': {
        const tank = teamTank();
        if (tank && !fxOn(tank,'ward') && tryA('ward', tank)) return true;
        const low = lowestAlly();
        if (low && hpPct(low) < 0.65 && tryA('mend', low)) return true;
        if (tryA('hex') || tryA('hymn')) return true;
        if (team.some(m=> m!==f && Object.values(m.cds).some(t=> t - now > 4000)) && tryA('haste')) return true;
        return false;
      }
    }
    return false;
  }

  // ---- your ability buttons + picking a target on the team list ----
  function onAbilityButton(id){
    if (!battle || battle.over) return;
    const f = battle.player;
    if (battle.spectating || f.hp <= 0){ battleLog('Your Toto is down — your team fights on!', true); return; }
    const a = f.kit.find(x=> x.id===id);
    if (!a){
      const k = abilityKit(f.ref).find(x=> x.id===id);
      battleLog('🔒 '+(!k ? 'Locked' : ((f.level||1) >= k.level ? k.name+' is ready to learn — tap Learn in the Totos tab' : k.name+' unlocks at Lv '+k.level)), true);
      return;
    }
    if (battle.targeting && battle.targeting.id===id){ cancelTargeting(); battleLog('Cancelled', true); return; }
    const left = abilityReadyIn(f, a);
    if (left === Infinity){ battleLog(a.name+' can only be used once per battle', true); return; }
    if (left > 0){ battleLog(a.name+' is ready in '+Math.ceil(left/1000)+'s', true); return; }
    if (a.target){
      const anyDown = battle.team.some(m=> m.hp <= 0);
      if (!battle.group || battle.team.length <= 1){ castAbility(f, a, a.kind==='revive' && anyDown ? battle.team.find(m=> m.hp<=0) : f); return; }
      startTargeting(a);
      return;
    }
    castAbility(f, a);
  }
  function startTargeting(a){
    cancelTargeting();
    battle.targeting = a;
    $('#bx-stage').classList.add('bx-targeting');
    const btn = $('.bx-ab[data-id="'+a.id+'"]'); if (btn) btn.classList.add('selecting');
    const verb = a.kind==='allyArmor' ? 'protect' : (a.kind==='revive' ? 'revive or heal' : 'heal');
    battleLog('👆 '+a.name+': tap who to '+verb+' on the team list', true);
    battle.team.forEach(m=>{
      const ok = a.kind==='revive' ? true : m.hp > 0;
      if (m._card) m._card.classList.toggle('pickable', ok);
      if (m._el) m._el.classList.toggle('pickable', ok);
    });
    $('#bx-active').classList.toggle('pickable', battle.player.hp > 0 || a.kind==='revive');
    clearTimeout(battle.targetTimer); battle.targetTimer = setTimeout(cancelTargeting, 8000);
  }
  function cancelTargeting(){
    if (!battle) return;
    battle.targeting = null; clearTimeout(battle.targetTimer);
    $('#bx-stage').classList.remove('bx-targeting');
    $$('.bx-ab.selecting').forEach(b=> b.classList.remove('selecting'));
    $('#bx-active').classList.remove('pickable');
    battle.team.forEach(m=>{ if (m._card) m._card.classList.remove('pickable'); if (m._el) m._el.classList.remove('pickable'); });
  }
  function pickTarget(f){
    if (!battle || !battle.targeting || !f) return;
    const a = battle.targeting;
    if (a.kind !== 'revive' && f.hp <= 0) return;
    cancelTargeting();
    castAbility(battle.player, a, f);
  }
  function updateAbilityButtons(){
    if (!battle) return;
    const f = battle.player;
    $$('.bx-ab', $('#bx-abilities')).forEach(b=>{
      const a = f.kit.find(x=> x.id===b.dataset.id);
      if (!a) return;
      const left = abilityReadyIn(f, a);
      const usedUp = left === Infinity;
      const cooling = left > 0 || battle.over || f.hp <= 0 || !!battle.spectating;
      b.classList.toggle('cooling', cooling && !usedUp);
      b.classList.toggle('used', usedUp);
      b.classList.toggle('ready', !cooling);
      const cdEl = b.querySelector('.bx-ab-cd');
      if (left > 0 && !usedUp){ cdEl.textContent = Math.ceil(left/1000); b.style.setProperty('--cdp', Math.min(100, left/(Math.max(1,a.cd)*1000)*100).toFixed(1)+'%'); }
      else { cdEl.textContent = usedUp ? '✓' : ''; b.style.setProperty('--cdp', '100%'); }
    });
  }

  // ---------------- launch / timers / end ----------------
  function launchBattle(opts){
    // For catch battles there's no team pick — just your strongest Toto, like before.
    const team = (opts.team && opts.team.length) ? opts.team : [strongestToto()].filter(Boolean);
    if (!team.length) return;
    // a Gym battle uses up one Raid Pass
    if (opts.kind === 'gym' && !opts.practice){
      const it = ensureItems();
      if ((it.raidPass||0) <= 0){ showToast('🎟️ You need a Pumpkin Raid Pass to battle a Gym.'); return; }
      it.raidPass--; markDirty(); saveNow(false);
      setTimeout(()=> showToast('🎟️ Used 1 Raid Pass ('+it.raidPass+' left)'), 700);
    }
    const lead = team.slice().sort((a,b)=>b.cp-a.cp)[0];
    const group = !!(opts.allies && opts.allies.length);
    const mode = opts.mode==='catch' ? 'catch' : (group ? 'group' : 'solo');
    const enemy = bossFighter(opts.opponent, mode);
    const player = fighterFromToto(lead); player.isPlayer = true;
    // Teammates fight as Mythicals of their role at your Toto's level (other trainers as
    // max-level attackers), knowing every ability that level allows.
    const allies = (opts.allies||[]).map(a=>{
      const role = ROLE_KITS[a.role] ? a.role : 'attacker';
      const tier = TIER_IDX[a.tier] != null ? a.tier : 'mythical';
      const lvl = a.isReal ? TOTO_MAX_LEVEL : Math.max(10, Math.min(TOTO_MAX_LEVEL, lead.level || a.level || 30));
      const s = statsForLevel(tier, role, lvl);
      const f = fighterFromToto({ name:a.name, tier, role, level:lvl, maxHp:s.hp, atk:s.atk, def:s.def, spd:s.spd }, true, a.sprite);
      f.isBot = !a.isReal; f.isReal = !!a.isReal;
      return f;
    });
    const now = Date.now();
    battle = { mode, kind:opts.kind||(opts.mode==='catch'?'catch':'gym'), shrineName:opts.shrineName||null, group, team:[player].concat(allies), player, allies, enemy,
               opponentTemplate:opts.opponent, bossK: group ? BOSS_K.group : BOSS_K.solo,
               taunter:null, bossTarget:null, hex:null, teamDmgUp:null, teamArmor:null, bleeds:[], hots:[], enraged:false,
               startedAt:now, nextBossAt: now + 1800, nextSweepAt: now + SWEEP_EVERY_MS, sweepWarned:false,
               timers:{}, auto:false, over:false, spectating:false, targeting:null };
    allies.forEach((f,i)=>{ f.thinkAt = now + 1200 + i*400; f.swingAt = now + 500 + i*250; });
    // the tutorial's practice fight: a gentle opponent that goes down in ~15 good hits
    battle.practice = !!opts.practice;
    if (battle.practice){
      const hit = enemy.unit * (ROLE_BASIC_MULT[player.role] || 0.4) * player.atk/(player.atk + enemy.def);
      enemy.maxHp = enemy.hp = Math.max(40, Math.round(hit*15));
      battle.bossK = 0.0012; battle.nextBossAt = now + 3000; battle.coach = { i:0 }; battle.coachHits = 0;
    }
    $('#btn-auto').classList.remove('on');
    $('#bx-bg').style.backgroundImage = 'url(assets/battle/'+(battle.kind==='shrine' ? 'village-blood' : 'village')+'.jpg)';
    $('#bx-menu').classList.remove('show');
    $('#bx-banner').className = 'bx-banner';
    $('#battle-log').textContent = '';
    $('#bx-boss').classList.remove('enraged','hexed','charging','bleeding');
    $('#battle-screen').classList.add('active');
    layoutBattleScreen();
    buildBattleView();
    placeBattlers();
    renderBattle();
    lockLandscape();
    battleLog(opts.mode==='catch' ? 'A wild '+enemy.name+' appears!' : enemy.name+' blocks the way!', true);
    renderCoach();
    if (!battle.practice && !player.kit.length) setTimeout(()=>{ if (battle && !battle.over) battleLog('Tip: your Toto learns its first ability at Lv 10 — check the Totos tab', true); }, 2600);
    else if (!group && player.role !== 'attacker') setTimeout(()=>{ if (battle && !battle.over) battleLog('Tip: '+(ROLE_INFO[player.role]||{label:'This role'}).label+'s shine in Group Battles — attackers deal the damage', true); }, 2600);
    startBattleTimers();
  }

  function bossTick(now){
    const e = battle.enemy;
    if (e.hp <= 0) return;
    if (battle.group){
      if (!battle.sweepWarned && now >= battle.nextSweepAt - SWEEP_WARN_MS){
        battle.sweepWarned = true; $('#bx-boss').classList.add('charging');
        battleLog('⚠️ '+e.name+' is winding up a Shockwave!', true);
      }
      if (now >= battle.nextSweepAt){
        battle.sweepWarned = false; battle.nextSweepAt = now + SWEEP_EVERY_MS;
        $('#bx-boss').classList.remove('charging');
        bxPulse($('#bx-boss'), 'lunge', 450); bxShake(); fxShockwave();
        livingTeam().forEach(m=> hurtHero(m, bossHitOn(m, 0.8)));
        battleLog('💥 '+e.name+' hits the whole team with a Shockwave!', true);
      }
    }
    if (now >= battle.nextBossAt){
      battle.nextBossAt = now + BOSS_SWING_MS/(battle.enraged ? 1.2 : 1);
      const tg = pickBossTarget(); if (!tg) return;
      battle.bossTarget = tg;
      const d = bossHitOn(tg, 1);
      bxPulse($('#bx-boss'), 'lunge', 450);
      setTimeout(()=>{ if (!battle || battle.over) return; hurtHero(tg, d); if (tg === battle.player) bxShake(); renderBattle(); }, 200);
      battleLog(e.name+' strikes '+tg.name+' for '+fmt(d)+'!');
    }
  }
  // Taunted: only the tank. Otherwise tanks draw most of the boss's attention anyway.
  function pickBossTarget(){
    const alive = livingTeam(); if (!alive.length) return null;
    if (battle.taunter && battle.taunter.hp > 0) return battle.taunter;
    const w = alive.map(m=> m.role==='tanker' ? 4 : 1);
    let r = Math.random()*w.reduce((s,x)=> s+x, 0);
    for (let i=0;i<alive.length;i++){ r -= w[i]; if (r <= 0) return alive[i]; }
    return alive[alive.length-1];
  }
  // One heartbeat drives the whole fight: bleeds, heal-over-time, the boss, your
  // teammates (and you, on AUTO), and the on-screen bars.
  function battleLoop(){
    if (!battle || battle.over) return;
    const now = Date.now();
    battle.bleeds.forEach(b=>{ if (b.left > 0 && now >= b.next){ b.left--; b.next += 1000; damageBoss(b.dmg, 'small'); } });
    battle.bleeds = battle.bleeds.filter(b=> b.left > 0);
    if (!battle || battle.over) return;
    if (!battle.bleeds.length) $('#bx-boss').classList.remove('bleeding');
    battle.hots.forEach(h=>{ if (h.left > 0 && now >= h.next){ h.left--; h.next += 1000; livingTeam().forEach(m=> healHero(m, m.maxHp*h.pct)); } });
    battle.hots = battle.hots.filter(h=> h.left > 0);
    if (battle.hex && battle.hex.until <= now){ battle.hex = null; $('#bx-boss').classList.remove('hexed'); }
    bossTick(now);
    battle.team.forEach(f=>{
      if (!battle || battle.over || f.hp <= 0) return;
      if (f === battle.player && !battle.auto) return;
      if (now >= f.thinkAt){ f.thinkAt = now + 650 + Math.random()*350; aiAct(f); }
      if (now >= f.swingAt) heroSwing(f);
    });
    if (battle && !battle.over && now - (battle.lastRender||0) > 200){ battle.lastRender = now; renderBattle(); }
    if (battle && battle.practice) coachTick();
  }
  const PRACTICE_COACH = [
    { text:'This is a battle! Your Toto is on the left and the wild Toto is in the middle — its health bar is at the top.', next:true },
    { text:'Tap CHARGE ATTACK to hit it. It recharges in about a second — watch the glow fill back up.', target:'#btn-attack', until:()=> (battle.coachHits||0) >= 3 },
    { text:'These five slots are your abilities. Your Toto learns a new one every 10 levels (tap Learn in the Totos tab), then you use them here.', target:'#bx-abilities', next:true },
    { text:'Tap AUTO and your Toto fights all by itself — abilities too.', target:'#btn-auto', until:()=> !!battle.auto },
    { text:'That\'s it — finish it off! ⚔️' }
  ];
  function renderCoach(){
    const box = $('#bx-coach'), hand = $('#bx-coach-hand');
    if (!battle || !battle.practice || battle.over){ box.classList.remove('show'); hand.classList.remove('show'); return; }
    const st = PRACTICE_COACH[battle.coach.i];
    if (!st){ box.classList.remove('show'); hand.classList.remove('show'); return; }
    $('#bx-coach-text').textContent = st.text;
    $('#bx-coach-next').style.display = st.next ? '' : 'none';
    box.classList.add('show');
    coachTick();
  }
  function coachTick(){
    if (!battle || !battle.practice) return;
    const st = PRACTICE_COACH[battle.coach.i], hand = $('#bx-coach-hand');
    if (!st){ hand.classList.remove('show'); return; }
    if (st.until && st.until()){ battle.coach.i++; renderCoach(); return; }
    const t = st.target ? $(st.target) : null;
    if (t){ const c = bxCenterOf(t, 0.5); hand.style.left = (c.x - 6)+'px'; hand.style.top = (c.y - 6)+'px'; hand.classList.add('show'); }
    else hand.classList.remove('show');
  }
  $('#bx-coach-next').onclick = ()=>{ if (battle && battle.practice){ battle.coach.i++; renderCoach(); } };
  function startBattleTimers(){
    clearBattleTimers();
    battle.timers.loop = setInterval(battleLoop, 100);
  }
  function clearBattleTimers(){ if (!battle) return; Object.values(battle.timers).forEach(t=>t&&clearInterval(t)); battle.timers={}; }

  // CHARGE ATTACK: your Toto's basic hit. It recharges in a second (the glow along the
  // button fills back up); attackers hit hardest and can crit.
  function doPlayerAttack(){
    if (!battle || battle.over) return;
    if (battle.spectating || battle.player.hp <= 0){ battleLog('Your Toto is down — your team fights on!', true); return; }
    const d = heroSwing(battle.player);
    if (d){ Sound.playAttack(); if (battle.practice) battle.coachHits = (battle.coachHits||0) + 1; renderBattle(); }
  }
  $('#btn-attack').onclick = doPlayerAttack;
  $('#btn-auto').onclick = ()=>{
    if (!battle || battle.over) return;
    battle.auto = !battle.auto;
    $('#btn-auto').classList.toggle('on', battle.auto);
    if (battle.auto){ cancelTargeting(); battle.player.thinkAt = 0; }
    battleLog(battle.auto ? 'AUTO on — your Toto fights and uses its abilities by itself' : 'AUTO off', true);
  };
  $('#btn-gear').onclick = ()=>{ $('#bx-menu').classList.toggle('show'); $('#bx-menu-sound').textContent = (Sound.isMuted && Sound.isMuted() ? '🔇' : '🔊')+' Sound'; };
  $('#bx-menu-close').onclick = ()=> $('#bx-menu').classList.remove('show');
  $('#bx-active').onclick = ()=>{ if (battle) pickTarget(battle.player); };
  $('#bx-menu-sound').onclick = ()=>{ const mb = $('#btn-mute'); if (mb) mb.click(); $('#bx-menu-sound').textContent = (Sound.isMuted && Sound.isMuted() ? '🔇' : '🔊')+' Sound'; };

  function closeBattleScreen(){
    saveBattleHp();      // retreating keeps the damage too
    if (battle && battle.practice) window.__tutorialPracticeDone = true;
    $('#bx-coach').classList.remove('show'); $('#bx-coach-hand').classList.remove('show');
    $('#battle-screen').classList.remove('active');
    $('#bx-menu').classList.remove('show');
    unlockOrientation();
    battle = null;
  }
  // XP for the Toto you fought with: tougher bosses give more, a loss still teaches a
  // little (a quarter). Levels it gains are real levels — its stats grow and new
  // abilities unlock to learn.
  function awardBattleXp(won){
    if (!battle || !battle.player || !battle.player.ref || battle.mode==='catch') return;
    const t = state.collection.find(x=> x.id === battle.player.ref.id);
    if (!t) return;
    const e = battle.enemy;
    const base = { normal:60, legendary:120, mythical:200, eternal:320 }[e.tier] || 100;
    let xp = base * (0.6 + Math.min(TOTO_MAX_LEVEL, e.level||1)/TOTO_MAX_LEVEL*0.8);
    if (battle.group) xp *= 0.9;
    if (!won) xp *= 0.25;
    xp = Math.round(xp);
    const beforeLearn = learnableAbilities(t).length;
    const ups = grantTotoXp(t, xp);
    let msg = t.name+' +'+xp+' XP';
    if (ups) msg += ' — reached Lv '+t.level+'!';
    const fresh = learnableAbilities(t);
    if (fresh.length > beforeLearn) msg += ' ✨ It can learn '+fresh[fresh.length-1].name+'!';
    setTimeout(()=> showToast(msg), won ? 900 : 300);
    renderCollection(); markDirty(); saveNow(false);
  }
  let pendingEternalCatch = null;
  function endBattle(won){
    if (!battle || battle.over) return;
    // If your Toto goes down in a group fight and your team is still swinging, you don't
    // just lose on the spot — you watch (and command) the rest of it, and still win if
    // they pull it off.
    if (!won && battle.group && battle.team.some(m=> m.hp > 0)){ battle.spectating = true; renderBattle(); return; }
    cancelTargeting();
    battle.over = true; clearBattleTimers(); renderBattle();
    saveBattleHp();
    awardBattleXp(won);
    const banner = $('#bx-banner');
    banner.textContent = won ? 'VICTORY!' : 'DEFEAT';
    banner.className = 'bx-banner show ' + (won ? 'win' : 'lose');
    if (won){
      $('#bx-boss').classList.add('down');
      Sound.playVictory();
      const opp = battle.opponentTemplate;
      const teamCarried = !!battle.spectating;
      if (battle.practice){
        battleLog('Practice complete! Every battle gives your Toto XP — and beating a gym or shrine boss wins it for your team.', true);
        renderCoach();
        setTimeout(closeBattleScreen, 1900);
        return;
      }
      if (opp.tier === 'eternal'){
        battleLog('Victory! '+opp.name+' stands before you, weakened...');
        pendingEternalCatch = opp;
        $('#ccc-name').textContent = opp.name;
        setTimeout(()=> $('#catch-choice-overlay').classList.add('show'), 1300);
        return;
      }
      finalizeCatch(opp);
      battleLog((teamCarried ? 'Your team pulled through! ' : 'Victory! ')+opp.name+(battle.mode==='catch'?' was caught!':' joined you!'));
      showToast(battle.mode==='catch' ? ('Caught '+opp.name+'!') : (teamCarried ? ('Your team won it — '+opp.name+' joined you too!') : ('Raid won! '+opp.name+' joined you.')));
      renderCollection(); refreshHUD(); markDirty(); saveNow(false);
    } else {
      Sound.playDefeat();
      battleLog(battle.mode==='catch' ? (battle.opponentTemplate.name+' got away!') : (battle.spectating ? 'Your whole team was defeated...' : 'Your Toto was defeated — retreat!'));
      showToast('Defeated — better luck next time.');
    }
    setTimeout(closeBattleScreen, 1700);
  }
  $('#btn-eternal-catch').onclick = ()=>{
    if (!pendingEternalCatch) return;
    const caught = finalizeCatch(pendingEternalCatch);
    Sound.playCatch();
    showToast('Caught '+caught.name+'! (PWR '+caught.cp+')');
    renderCollection(); refreshHUD(); markDirty(); saveNow(false);
    closeCatchChoice();
  };
  $('#btn-eternal-transfer').onclick = ()=>{
    if (!pendingEternalCatch) return;
    state.gems += 100;
    showToast('Transferred '+pendingEternalCatch.name+' for 100 Gems!');
    refreshHUD(); markDirty(); saveNow(false);
    closeCatchChoice();
  };
  function closeCatchChoice(){
    pendingEternalCatch = null;
    $('#catch-choice-overlay').classList.remove('show');
    closeBattleScreen();
  }
  $('#btn-retreat').onclick = ()=>{ if (battle){ clearBattleTimers(); } closeBattleScreen(); };

  // ================= TUTORIAL (new trainers) =================
  // Runs once after sign-up + starter pick (and any time from the menu's "Tutorial"
  // button). Each step dims the screen except the thing it's talking about, explains it,
  // and either waits for "Next" or for the player to actually do it (catch a Toto, open
  // the menu, open a Toto's abilities …). It ends with a short practice battle that has
  // its own coach inside the battle screen, and 100 candy for finishing.
  const Tutorial = (()=>{
    let steps = [], i = -1, layer = null, ticker = null, running = false, tutToto = null, startCatches = 0;
    const root = ()=> document.getElementById('toto-root');
    const q = sel=> document.querySelector(sel);
    function totoBox(t){
      if (!t || !t._node || !t._node.isConnected) return null;
      const h = window.__toto3dHitBox && window.__toto3dHitBox(t.id);
      if (h) return { left:h.x0, top:h.y0, width:h.x1-h.x0, height:h.y1-h.y0 };
      const b = t._node.querySelector('.bubble') || t._node;
      const r = b.getBoundingClientRect();
      return r.width ? { left:r.left-6, top:r.top-6, width:r.width+12, height:r.height+12 } : null;
    }
    // The map spot that shows up (sx, sy) pixels away from your trainer on screen (the map
    // can be turned, zoomed and tilted, so measure it with two invisible markers).
    function worldOffsetForScreen(sx, sy){
      const layer = $('#toto-layer'), P = state.playerWorldPos, k = 100;
      const mk = (x,y)=>{ const d = document.createElement('div'); d.style.cssText = 'position:absolute;width:0;height:0;left:'+x+'px;top:'+y+'px'; layer.appendChild(d); const r = d.getBoundingClientRect(); d.remove(); return { x:r.left, y:r.top }; };
      const o = mk(P.x, P.y), ex = mk(P.x+k, P.y), ey = mk(P.x, P.y+k);
      const ax = (ex.x-o.x)/k, ay = (ex.y-o.y)/k, bx = (ey.x-o.x)/k, by = (ey.y-o.y)/k;
      const det = ax*by - bx*ay;
      if (!isFinite(det) || Math.abs(det) < 1e-6) return { x:sx, y:sy };
      return { x:(sx*by - bx*sy)/det, y:(ax*sy - ay*sx)/det };
    }
    function ensureTutorialToto(){
      if (tutToto && state.wildTotos.includes(tutToto)) return tutToto;
      if (!state.playerWorldPos) return null;
      // beside your trainer on screen (clear of it, and of the speech card), on whichever
      // side has the most room from the other Totos — and always close enough to catch
      const P = state.playerWorldPos;
      let bestPt = null, bestRoom = -1;
      // (straight out to the side: the map's tilt squashes up/down distances, and anything
      // just behind your trainer would be hidden by it)
      [[130,12],[-130,12],[130,-30],[-130,-30]].forEach(([sx,sy])=>{
        const w = worldOffsetForScreen(sx, sy);
        const m = Math.hypot(w.x, w.y)/GPS_SCALE, f = m > 36 ? 36/m : (m < 14 ? 14/Math.max(1,m) : 1);
        const pt = { x:P.x + w.x*f, y:P.y + w.y*f };
        const room = state.wildTotos.reduce((m,o)=> Math.min(m, Math.hypot(o._x-pt.x, o._y-pt.y)/GPS_SCALE), 999);
        if (room > bestRoom + 4){ bestRoom = room; bestPt = pt; }
      });
      const x = bestPt.x, y = bestPt.y;
      tutToto = spawnWildTotoAt(x, y, null) || null;
      if (!tutToto && state.wildTotos.length){   // map's full — make room by sending the farthest one home
        const far = state.wildTotos.slice().sort((a,b)=> distanceMetersToWorldPoint(b._x,b._y) - distanceMetersToWorldPoint(a._x,a._y))[0];
        removeTotoFromMap(far);
        tutToto = spawnWildTotoAt(x, y, null) || null;
      }
      if (tutToto) tutToto._hold = true;          // it waits for you — no wandering off mid-lesson
      return tutToto;
    }
    function closeAll(){
      try { $('#quick-menu').classList.remove('show'); $('#quick-menu-backdrop').classList.remove('show'); } catch(e){}
      try { $('#detail-modal').classList.remove('active'); } catch(e){}
      openGamePanel('map');
    }
    function keepDetail(){
      if ($('#detail-modal').classList.contains('active') || !state.collection.length) return;
      openGamePanel('totos'); openDetail(state.collection.slice().sort((a,b)=> (b.cp||0)-(a.cp||0))[0].id);
    }
    // the PumpkinStop closest to you (the lesson points at it, and has you spin it if you can)
    let tutStop = null;
    function pickStop(){ tutStop = (window.__nearestStop && window.__nearestStop()) || null; return tutStop; }
    function stopBox(){
      const n = tutStop || pickStop(); if (!n) return null;
      const h = window.__stopHitBox && window.__stopHitBox(n.pr.stop.id);
      return h ? { left:h.x0, top:h.y0, width:h.x1-h.x0, height:h.y1-h.y0 } : null;
    }
    const canSpinNow = ()=>{ const n = tutStop || pickStop(); return !!n && n.d <= 40 && !((state.stopCooldownUntil||0) > Date.now()); };
    const stopOpen = ()=> $('#stop-modal').classList.contains('active');
    // a stop right behind your trainer would be hidden by her — let it show through
    const ghostTrainer = on=>{ const pin = q('.player-pin'); if (pin) pin.style.opacity = on ? '0.28' : ''; };
    const needsHeal = ()=> hurtTotos().length > 0;
    const showMenu = ()=>{ if (!$('#quick-menu').classList.contains('show')){ $('#quick-menu').classList.add('show'); $('#quick-menu-backdrop').classList.add('show'); } };
    function makeSteps(){
      const name = state.username || 'Trainer';
      return [
        { title:'Welcome to TotoQuest, '+name+'! 🎃', text:'Totos — spooky little monsters — are hiding all around the real world. I\'ll show you how everything works. It only takes a couple of minutes.' },
        { title:'This is you', target:()=> q('#player-avatar'), text:'Your trainer stands where you are. Walk around in real life and your trainer walks with you. The map is your real neighbourhood — streets, houses, parks and ball fields.' },
        { title:'Look around', text:'Drag with one finger to turn the map. Pinch with two fingers to zoom in and out.' },
        { title:'A wild Toto!', enter: ensureTutorialToto, target:()=> totoBox(ensureTutorialToto()), text:'Wild Totos stand on glowing rings. The tag shows its power (PWR) and how far away it is. When the distance turns green you\'re close enough to catch it — within 40 m.' },
        { title:'Catch it', enter:()=>{ const t = ensureTutorialToto(); if (t) t._hold = true; }, target:()=> totoBox(ensureTutorialToto()), tap:true, text:'Tap the Toto.', until:()=> $('#encounter-modal').classList.contains('active') },
        { title:'Throw!', target:()=> q('#btn-throw'), tap:true, cardAt:'top', text:'Tap Throw to catch it. Every Toto you catch starts at Lv 1 — you train it up yourself.', until:()=> state.collection.length > startCatches,
          keep:()=>{ if (!$('#encounter-modal').classList.contains('active') && state.collection.length <= startCatches) go(i-1); },   // ran away? try again
          leave:()=>{ if (tutToto) tutToto._hold = false; } },
        { title:'Totos nearby', target:()=> q('#hud-nearby-chip'), text:'This counts the Totos near you. Wild Totos wander off after 3 minutes, and a new one turns up in the same spot a minute later — so keep checking around!' },
        { title:'PumpkinStops', enter:()=>{ pickStop(); ghostTrainer(true); }, target:stopBox,
          text:()=> 'Glowing signposts like this are PumpkinStops — at parks, playgrounds, churches, monuments and on every street. Spin one for 5 candy, and usually a Healing Elixir or a Raid Pass too. You can spin 1 stop every 10 minutes.'
            + (canSpinNow() ? ' There\'s one right by you — let\'s spin it!' : (stopBox() ? ' Walk within 40 m of one to spin it.' : ' There isn\'t one on screen right now — look out for them as you walk.')) },
        { title:'Spin a PumpkinStop', skipIf:()=> !canSpinNow(), enter:()=> ghostTrainer(true), target:stopBox, tap:true, text:'Tap the PumpkinStop.', until:stopOpen, leave:()=> ghostTrainer(false) },
        { title:'Spin!', skipIf:()=> !stopOpen(), target:()=> q('#btn-stop-spin'), tap:true, cardAt:'top', text:'Tap Spin.', until:()=> !!q('#stop-rewards .stop-reward'),
          keep:()=>{ if (!stopOpen()) go(i-1); } },
        { title:'Your rewards', skipIf:()=> !stopOpen(), target:()=> q('#stop-rewards'), cardAt:'top', text:'They go straight into your bag. The stop turns purple while you wait for your next spin.',
          leave:()=>{ $('#stop-modal').classList.remove('active'); } },
        { title:'Candy & gems', enter:()=> ghostTrainer(false), target:()=> q('#hud-candy-chip'), text:'Candy levels up your Totos. Grab the candy corn you spot on the map for free candy. Gems (just below) are for the Store.' },
        { title:'Real time & weather', target:()=> q('#hud-daynight'), text:'The map follows your real time of day and weather.' },
        { title:'The menu', target:()=> q('#btn-menu'), tap:true, text:'Tap the pumpkin to open the menu.', until:()=> $('#quick-menu').classList.contains('show') },
        { title:'Your Totos', target:()=> q('.qm-btn[data-tab="totos"]'), tap:true, text:'Tap Totos to see your collection.', until:()=> !!q('.panel-screen[data-panel="totos"].active'),
          keep:()=>{ if (!$('#quick-menu').classList.contains('show')){ $('#quick-menu').classList.add('show'); $('#quick-menu-backdrop').classList.add('show'); } } },
        { title:'Your collection', target:()=> q('#toto-sort-bar'), text:'All your Totos live here. Sort them strongest-first or weakest-first, and use Transfer (top) to swap extras for candy.' },
        { title:'Open a Toto', target:()=> q('#toto-collection .toto-card'), tap:true, text:'Tap a Toto to see everything about it.', until:()=> $('#detail-modal').classList.contains('active'),
          keep:()=>{ if (!q('.panel-screen[data-panel="totos"].active')) openGamePanel('totos'); } },
        { title:'Levels & XP', keep:keepDetail, target:()=> q('#det-xp') && q('#det-xp').innerHTML ? q('#det-xp') : q('#det-sub'), text:'Its level and XP. Totos earn XP from every battle they fight — or level up instantly with candy using Power Up.' },
        { title:'Abilities', keep:keepDetail, enter:()=>{ const b = q('.moves-box'); if (b) b.scrollIntoView({ block:'center' }); }, target:()=> q('.moves-box'),
          text:'Every Toto has a role — Attacker, Tank, Healer or Support — and learns a new role ability at Lv 10, 20, 30, 40 and 50. When one unlocks, tap Learn here. Learned abilities appear in battle.' },
        { title:'Practice battle', enter:closeAll, text:'Let\'s try a quick practice battle with your Toto. I\'ll show you the controls.', nextLabel:'Start battle ⚔️' },
        { practice:true },
        { title:'Ouch — your Toto got hurt', enter:closeAll, skipIf:()=> !needsHeal(),
          text:'Totos keep their injuries after every battle, and one that faints can\'t battle again until it\'s healed. Let\'s heal yours with a Healing Elixir.' },
        { title:'Open the menu', skipIf:()=> !needsHeal(), target:()=> q('#btn-menu'), tap:true, text:'Tap the pumpkin.', until:()=> $('#quick-menu').classList.contains('show') },
        { title:'Items', skipIf:()=> !needsHeal(), target:()=> q('.qm-btn[data-tab="items"]'), tap:true, text:'Tap Items — this is your bag.', until:()=> !!q('.panel-screen[data-panel="items"].active'), keep:showMenu },
        { title:'Healing Elixir', skipIf:()=> !needsHeal(), target:()=> q('[data-use="elixir"]'), tap:true, text:'Tap Use on the Healing Elixir.', until:()=> !!q('.heal-pick-row'),
          keep:()=>{ if (!q('.panel-screen[data-panel="items"].active')) openGamePanel('items'); } },
        { title:'Pick your Toto', skipIf:()=> !needsHeal(), target:()=> q('.heal-pick-row'), tap:true, text:'Tap your Toto to heal it back to full health.', until:()=> !needsHeal(),
          keep:()=>{ if (!q('.heal-pick-row') && needsHeal()){ if (!q('.panel-screen[data-panel="items"].active')) openGamePanel('items'); healPickOpen = true; renderItems(); } } },
        { title:'Raid Passes', enter:()=>{ if (!q('.panel-screen[data-panel="items"].active')){ closeAll(); openGamePanel('items'); } }, target:()=> q('.item-card[data-item="raidPass"]'),
          text:'Gyms need a Pumpkin Raid Pass — one is used each time you battle a Gym champion. You start with 3, and PumpkinStops give you more (always on your first spin of the day).' },
        { title:'Gyms', enter:()=>{ closeAll(); openGamePanel('battle'); }, target:()=> q('#battle-shrine-list > *') || q('.panel-screen[data-panel="battle"] .panel-header'),
          text:'Pumpkin towers on the map are Gyms — this list shows the ones near you. Walk right up to one and tap it to battle its champion (that uses a Raid Pass). Win, and the champion joins your team.' },
        { title:'Challenger Shrines', enter:()=> openGamePanel('challenger'), target:()=> q('#challenger-list > *') || q('.panel-screen[data-panel="challenger"] .panel-header'),
          text:'Mighty Eternal guardians you can battle from anywhere, alone or in a group — no pass needed. They\'re tough: train your Totos first, or bring a team with a Tank, Healer and Support.' },
        { title:'Teamwork', enter:closeAll, text:'In Group Battles, each Toto plays its role: Tanks can Taunt so the boss attacks only them, Healers keep everyone alive, Supports protect and power up the team, and Attackers deal the big damage. For a heal or shield, tap the ability, then tap who on the team list.' },
        { title:'Your trainer', target:()=> q('#hud-avatar'), text:'Tap your picture to dress your trainer — new items replace what she\'s wearing, and you can try things on first. Reach trainer Level 100 to earn the Level 100 Achievement Tee and the Level 100 Witch Hat. Your Profile and the Store are here too.' },
        { title:'More in the menu', enter:()=>{ $('#quick-menu').classList.add('show'); $('#quick-menu-backdrop').classList.add('show'); }, target:()=> q('#quick-menu'),
          text:'Items is your bag (Raid Passes and Healing Elixirs), Dex tracks every kind of Toto you\'ve found, Ranks shows the top trainers, and Tutorial plays this lesson again any time.', leave:closeAll },
        { title:'You\'re ready! 🎃', text:'Here are 100 candy to get you started. Go catch some Totos!', nextLabel:'Let\'s go!' }
      ];
    }
    function ensureLayer(){
      if (layer) return layer;
      layer = document.createElement('div');
      layer.id = 'tut-layer'; layer.className = 'tut-layer';
      layer.innerHTML = '<div class="tut-block" data-b="t"></div><div class="tut-block" data-b="b"></div><div class="tut-block" data-b="l"></div><div class="tut-block" data-b="r"></div>'
        + '<div class="tut-ring"></div><div class="tut-hand">👆</div>'
        + '<div class="tut-card"><img class="tut-guide" src="assets/brand/icon-192.png" alt=""><div class="tut-body"><div class="tut-step"></div><div class="tut-title"></div><div class="tut-text"></div>'
        + '<div class="tut-actions"><button class="tut-skip">Skip tutorial</button><button class="tut-next">Next</button></div></div></div>';
      root().appendChild(layer);
      layer.querySelector('.tut-next').onclick = ()=> next();
      layer.querySelector('.tut-skip').onclick = async ()=>{ if (await gameConfirm('You can replay it from the menu any time.', 'Skip the tutorial?', 'Skip', 'Keep going')) finish(true); };
      return layer;
    }
    function rectOf(t){
      if (!t) return null;
      if (t.getBoundingClientRect){ const r = t.getBoundingClientRect(); if (!r.width && !r.height) return null; return { left:r.left, top:r.top, width:r.width, height:r.height }; }
      return t;
    }
    function place(){
      if (!running || !layer) return;
      const s = steps[i]; if (!s || s.practice) return;
      const rr = root().getBoundingClientRect(), W = rr.width, H = rr.height;
      let tr = null;
      try { tr = s.target ? rectOf(s.target()) : null; } catch(e){ tr = null; }
      const pad = 8;
      const hole = tr ? { x:Math.max(0, tr.left - rr.left - pad), y:Math.max(0, tr.top - rr.top - pad), w:tr.width + pad*2, h:tr.height + pad*2 } : null;
      const ring = layer.querySelector('.tut-ring'), hand = layer.querySelector('.tut-hand');
      const B = k=> layer.querySelector('.tut-block[data-b="'+k+'"]');
      const box = (el, x, y, w, h)=>{ el.style.left = x+'px'; el.style.top = y+'px'; el.style.width = Math.max(0,w)+'px'; el.style.height = Math.max(0,h)+'px'; };
      if (hole && s.tap){
        // only the highlighted thing can be tapped
        box(B('t'), 0, 0, W, hole.y); box(B('b'), 0, hole.y+hole.h, W, H-hole.y-hole.h);
        box(B('l'), 0, hole.y, hole.x, hole.h); box(B('r'), hole.x+hole.w, hole.y, W-hole.x-hole.w, hole.h);
      } else { box(B('t'), 0, 0, W, H); box(B('b'),0,0,0,0); box(B('l'),0,0,0,0); box(B('r'),0,0,0,0); }
      ring.classList.toggle('nohole', !hole);
      if (hole) box(ring, hole.x, hole.y, hole.w, hole.h);
      else box(ring, W/2, H/2, 0, 0);
      hand.style.display = (hole && s.tap) ? '' : 'none';
      if (hole && s.tap){ hand.style.left = (hole.x + hole.w*0.62)+'px'; hand.style.top = (hole.y + hole.h*0.62)+'px'; }
      // the speech card sits below the highlight if it's in the top half, otherwise above
      const card = layer.querySelector('.tut-card');
      const ch = card.offsetHeight || 150, cw = Math.min(360, W - 24);
      card.style.width = cw+'px'; card.style.left = ((W - cw)/2)+'px';
      let top;
      if (s.cardAt === 'top') top = 12;
      else if (!hole) top = (H - ch)/2;
      else if (hole.y + hole.h/2 < H*0.5) top = Math.min(H - ch - 12, hole.y + hole.h + 14);
      else top = Math.max(12, hole.y - ch - 14);
      card.style.top = top+'px';
    }
    function render(){
      const s = steps[i];
      ensureLayer();
      if (s.practice){ layer.style.display = 'none'; return; }
      layer.style.display = '';
      layer.querySelector('.tut-step').textContent = 'Tutorial · '+(i+1)+' / '+steps.length;
      layer.querySelector('.tut-title').textContent = s.title || '';
      layer.querySelector('.tut-text').textContent = (typeof s.text === 'function' ? s.text() : s.text) || '';
      const nb = layer.querySelector('.tut-next');
      nb.style.display = s.until ? 'none' : '';
      nb.textContent = s.nextLabel || (i === steps.length-1 ? 'Finish' : 'Next');
      layer.querySelector('.tut-skip').style.display = i === steps.length-1 ? 'none' : '';
      place();
      setTimeout(place, 60); setTimeout(place, 400);
    }
    function go(k){
      const prev = steps[i];
      if (prev && prev.leave) { try { prev.leave(); } catch(e){} }
      if (k > i) while (k < steps.length && steps[k].skipIf && (()=>{ try { return steps[k].skipIf(); } catch(e){ return true; } })()) k++;
      i = k;
      if (i >= steps.length){ finish(false); return; }
      const s = steps[i]; s._fired = false;
      if (s.enter){ try { s.enter(); } catch(e){} }
      if (s.practice) startPractice();
      render();
    }
    function next(){ go(i+1); }
    function startPractice(){
      const fit = state.collection.filter(t=> hpOf(t) > 0), pool = fit.length ? fit : state.collection;
      const lead = pool.slice().sort((a,b)=> (b.cp||0)-(a.cp||0))[0];
      if (!lead){ setTimeout(next, 50); return; }
      lead.hp = Math.max(hpOf(lead), Math.round(lead.maxHp*0.6));   // practice never starts on a fainted Toto
      const opp = makeToto('normal'); applyLevelStats(opp, 1);
      window.__tutorialPracticeDone = false;
      launchBattle({ mode:'solo', kind:'gym', opponent:opp, team:[lead], allies:[], practice:true });
    }
    function tick(){
      if (!running) return;
      const s = steps[i]; if (!s) return;
      if (s.practice){ if (window.__tutorialPracticeDone && !$('#battle-screen').classList.contains('active')) next(); return; }
      if (s.until && !s._fired){ let ok = false; try { ok = s.until(); } catch(e){} if (ok){ s._fired = true; setTimeout(()=>{ if (steps[i] === s) next(); }, 350); return; } }
      if (s.keep && !s._fired){ try { s.keep(); } catch(e){} if (steps[i] !== s) return; }
      place();
    }
    function start(){
      if (running) return;
      running = true; steps = makeSteps(); i = -1;
      startCatches = state.collection.length;
      closeAll();
      ensureLayer();
      ticker = setInterval(tick, 200);
      next();
    }
    function finish(skipped){
      running = false; clearInterval(ticker); ticker = null;
      if (tutToto){ tutToto._hold = false; tutToto = null; }
      tutStop = null; ghostTrainer(false);
      if (layer){ layer.remove(); layer = null; }
      closeAll();
      if (!state.tutorialDone && !skipped){ state.candy += 100; refreshHUD(); showToast('🎃 Tutorial complete — +100 candy!'); }
      state.tutorialDone = true; markDirty(); saveNow(false);
    }
    return { start, isRunning: ()=> running };
  })();
  window.TotoTutorial = Tutorial;
  $('#btn-tutorial').onclick = ()=>{ closeQuickMenu(); Tutorial.start(); };

  // ---------------- BOOT: stay logged in until an explicit Logout ----------------
  // ---------------- LOADING SCREEN ----------------
  // Shown first, every launch. Two real jobs happen here, not just for show: (1) it warms
  // up the GPS radio / asks for location permission as early as possible, since a cold GPS
  // fix is the slowest part of getting into the game and the roads/buildings can't be
  // fetched until a fix exists; (2) it tries to restore your last session. The progress bar
  // itself creeps forward on a timer so it always feels alive, then snaps to 100% once both
  // jobs (and a short minimum display time, so it never just flickers) are done.
  const LOADING_TIPS = [
    "Tip: Don't forget your magical items!",
    'Tip: Totos hide near parks and water after dark.',
    "Tip: Tap a gym to challenge its guardian.",
    'Tip: The farther you roam, the rarer what you find.',
    'Tip: Swipe to look around — pinch to get closer to the ground.'
  ];
  (async function runLoadingSequence(){
    const fill = $('#loading-bar-fill'), pctEl = $('#loading-pct'), tipEl = $('#loading-tip'), statusEl = $('#loading-status');
    let progress = 2, tipIdx = 0;
    function setProgress(p, label){
      progress = Math.max(progress, Math.min(99, p));
      fill.style.width = progress.toFixed(0)+'%'; pctEl.textContent = Math.round(progress)+'%';
      if (label) statusEl.textContent = label;
    }
    const tipTimer = setInterval(()=>{
      tipIdx = (tipIdx+1) % LOADING_TIPS.length;
      tipEl.style.opacity = '0';
      setTimeout(()=>{ tipEl.textContent = LOADING_TIPS[tipIdx]; tipEl.style.opacity='1'; }, 220);
    }, 2200);
    const creepTimer = setInterval(()=> setProgress(progress + (progress<65?2.4:0.5)), 140);

    setProgress(12, 'Waking the pumpkins…');
    // Kick off a real GPS fix AND, the moment it lands, start building the world at that
    // spot immediately — the map's Overpass fetches begin right here on the loading
    // screen, running in the background through the rest of signup/character-pick, so
    // there's a real head start by the time you actually reach the game instead of the
    // whole chunk-loading pipeline only starting once you tap through everything.
    let primed = false;
    function primeWorldIfPossible(lat, lon){
      if (primed || state.geoAnchor) return;
      primed = true;
      setAnchorAndBuild(lat, lon);
    }
    const gpsWarmup = new Promise(res=>{
      if (!navigator.geolocation){ res(); return; }
      try {
        navigator.geolocation.getCurrentPosition(
          pos => { primeWorldIfPossible(pos.coords.latitude, pos.coords.longitude); res(); },
          ()=>res(), {enableHighAccuracy:true, timeout:6000, maximumAge:60000}
        );
      } catch(e){ res(); }
    });
    setProgress(30, 'Finding your street…');
    const minDisplay = new Promise(res=> setTimeout(res, 1500));
    const autoLoginPromise = tryAutoLogin(); // fires enterGame()/showScreen('game') itself if a session is found
    setProgress(58, 'Loading your trainer…');
    await Promise.all([minDisplay, Promise.race([gpsWarmup, new Promise(res=>setTimeout(res,4500))])]);
    setProgress(94, 'Almost there…');
    const found = await autoLoginPromise;
    clearInterval(tipTimer); clearInterval(creepTimer);
    progress = 100; fill.style.width='100%'; pctEl.textContent='100%'; statusEl.textContent='Ready!';
    await new Promise(res=> setTimeout(res, 200));
    if (!found) showScreen('auth');
  })();

})();
