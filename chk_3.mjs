
// ============================================================================
// PHASE 1 — real 3D player avatar + orbit camera (Three.js), additive only.
// ----------------------------------------------------------------------------
// This is a self-contained layer bolted onto the existing 2D GPS map game. It
// does not touch the map, GPS, nodes, battles, inventory, or progression — it
// only replaces what's drawn INSIDE the on-map "player-avatar" marker, and
// only once this device/browser is confirmed to support WebGL. If anything
// here goes wrong (WebGL missing, the CDN blocked, an old browser) it fails
// silently and the original flat front/back sprite set in enterGame() in the
// main game script above stays exactly as the display — nothing to repair.
//
// Camera vs. facing, kept separate the way a third-person game camera should be:
//   - state.viewOrbit (declared in the main game script) already tracked "how
//     far you've dragged the camera around your character" for the old 2D
//     marker, which swapped between two flat images at the halfway points of
//     the orbit. This reuses that exact same number as the angle a real 3D
//     camera orbits around the 3D model instead — smooth and continuous, not
//     a two-image swap, so every angle in between is visible, not just front
//     and back.
//   - The character model itself never rotates to follow the camera — it has
//     one fixed facing. (There's no free-roam "move in a direction and turn
//     to face it" concept to hook into here — this is a top-down GPS map
//     where the world pans under a screen-fixed marker — so there's nothing
//     that would ever turn the model, which is what keeps camera orbit and
//     character facing fully decoupled, same as the brief asked for.)
//
// Equip slots are a plain data object (PLAYER_EQUIP_CATALOG, exposed on
// window) read by buildPlayerModel() — swapping an item later from a future
// customization screen is just changing a value in that object and calling
// mountPlayer3D(gender) again to rebuild. Any slot can optionally point at a
// real .glb file (slot.modelUrl) loaded with GLTFLoader; with no URL it falls
// back to the procedural low-poly shape built right here, so real sculpted
// art can be dropped in later (per-Toto, per-item) without rewriting this
// system — see tryLoadRealModel().
//
// Not in this phase (by design, see the scoping discussion): Totos stay 2D
// map/battle sprites for now, there's no customization SCREEN yet (just the
// data model it would edit), and there's no pinch-zoom/elevation-drag on this
// viewport — only the same one-finger left/right orbit the map already used.
// ============================================================================
(async () => {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return; // No WebGL here — keep the original flat sprite, nothing more to do.

    const THREE = await import('three');

    // ---------------- Equip catalog (data-driven, extensible) ----------------
    // Colors echo the existing hand-painted witch art (robe purple/sash orange for
    // the female look, robe green/sash brown for the male look) so the new 3D model
    // reads as the SAME character, not an unrelated generic figure.
    const PLAYER_EQUIP_CATALOG = {
      female: {
        skin:'#ffcf9e', hair:'#d2691e',
        hat:       { kind:'witchHat', color:'#4a2f6b', trim:'#ffb347', modelUrl:null },
        top:       { kind:'robe',     color:'#6b3fa0', trim:'#ffb347', modelUrl:null },
        legwear:   { kind:'robeHem',  color:'#5a3690', modelUrl:null },
        shoes:     { color:'#5a3622', modelUrl:null },
        accessory: { kind:'staff', color:'#6b4a2f', orb:'#ff8a3d', modelUrl:null },
        backpack: null, glasses: null
      },
      // matches the male reference sheet: purple hat + coat with orange trim, orange/purple
      // striped leggings, tall black boots, orange jack-o'-lantern staff, cat on shoulder
      male: {
        skin:'#f0c29c', hair:'#c8601e',
        hat:       { kind:'witchHat',  color:'#4a2f6b', trim:'#e08a2e', modelUrl:null },
        top:       { kind:'robe',      color:'#57358a', trim:'#e08a2e', modelUrl:null },
        legwear:   { kind:'robeHem',   color:'#5a3690', modelUrl:null },
        shoes:     { color:'#1f1a24', modelUrl:null },
        accessory: { kind:'staff', color:'#6b4a2f', orb:'#ff8a3d', modelUrl:null },
        backpack: null, glasses: null
      }
    };
    // A future customization screen reads/writes this object directly, then calls
    // window.mountPlayer3D(gender) again to rebuild with the new values.
    window.PLAYER_EQUIP_CATALOG = PLAYER_EQUIP_CATALOG;

    let GLTFLoaderCls = null;
    async function getGLTFLoader(){
      if (GLTFLoaderCls) return GLTFLoaderCls;
      const mod = await import('./assets/vendor/GLTFLoader.js');
      GLTFLoaderCls = mod.GLTFLoader;
      return GLTFLoaderCls;
    }
    // No catalog entry sets modelUrl today, so this never fires yet — it exists so a
    // real sculpted asset can replace a procedural slot later with no system changes.
    function tryLoadRealModel(cfg, intoGroup){
      if (!cfg || !cfg.modelUrl) return;
      getGLTFLoader().then(Loader => {
        new Loader().load(cfg.modelUrl, gltf => { intoGroup.add(gltf.scene); }, undefined, () => {});
      }).catch(()=>{});
    }

    function limbPivot(y){ const g = new THREE.Group(); g.position.y = y; return g; }
    function stdMat(color, extra){ return new THREE.MeshStandardMaterial(Object.assign({ color, roughness:0.75, metalness:0.04 }, extra||{})); }

    // ---------------- Procedural textures (canvas-drawn, no image assets needed) -------
    // Matches the reference art's motifs — a moon+stars pattern on the BACK of the robe,
    // pumpkins on the FRONT, patch squares near the seams, candy-corn striped leggings —
    // using THREE.CylinderGeometry's own UV convention (u=0.25 wraps to +Z/back, u=0.75
    // wraps to -Z/front, matching the front=-Z/back=+Z convention used everywhere else in
    // this model) instead of hand-painted art, so it's cheap, crisp at any zoom, and easy
    // to recolor per outfit.
    const robeTexCache = {};
    function makeRobeTexture(baseColor, trimColor){
      const key = baseColor+'|'+trimColor;
      if (robeTexCache[key]) return robeTexCache[key];
      const W=512, H=512;
      const c = document.createElement('canvas'); c.width=W; c.height=H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = baseColor; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = trimColor;
      ctx.fillRect(0,0,W,24);
      ctx.fillRect(0,H-30,W,30);
      ctx.beginPath();
      const teeth=16, tw=W/teeth;
      for (let i=0;i<teeth;i++){ ctx.moveTo(i*tw, H-30); ctx.lineTo(i*tw+tw/2, H-30+13); ctx.lineTo((i+1)*tw, H-30); }
      ctx.closePath(); ctx.fill();

      const gold = '#ffd27a';
      function star(cx,cy,r,r2){
        ctx.beginPath();
        for (let i=0;i<10;i++){
          const ang = Math.PI/5*i - Math.PI/2, rad = i%2===0?r:r2;
          const x = cx+Math.cos(ang)*rad, y = cy+Math.sin(ang)*rad;
          if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.closePath(); ctx.fill();
      }
      // Both motifs are drawn big and bold — this marker renders tiny on the map (well
      // under 30px wide), so fine detail just blurs away under mipmapping; a large,
      // high-contrast shape is what actually survives at that size.
      //
      // U-coordinate calibration (checked empirically against this engine's actual
      // CylinderGeometry UV layout by rendering real orbit angles, since it did NOT match
      // either commonly-assumed formula): the canvas's own horizontal CENTER (x=256,
      // "u=0.5") lands on -Z, and the texture's own left/right SEAM (x=0/512) lands on +Z.
      // This model's convention is front=-Z/back=+Z (same one the head's hair/eyes already
      // use) — so the FRONT motif (pumpkin) is centered in the middle of the canvas, and
      // the BACK motif (moon) is drawn in two halves hugging the two edges, which rejoin
      // into one whole moon at the seam once wrapping is on.
      function moonCluster(cx,cy){
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.arc(cx,cy,78,0,Math.PI*2);
        ctx.arc(cx+30,cy-24,68,0,Math.PI*2);
        ctx.fill('evenodd');
        star(cx-86,cy+80,16,6.5); star(cx+89,cy+90,13,5.5); star(cx,cy-110,11,4.5);
      }
      moonCluster(0,220); moonCluster(512,220);

      function pumpkinCluster(cx,cy,s){
        ctx.fillStyle = '#ff8a3d';
        [-0.36,0,0.36].forEach(dx=>{ ctx.beginPath(); ctx.ellipse(cx+s*dx,cy,s*0.42,s*0.5,0,0,Math.PI*2); ctx.fill(); });
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth=3;
        [-0.3,0.3].forEach(dx=>{ ctx.beginPath(); ctx.moveTo(cx+s*dx,cy-s*0.46); ctx.lineTo(cx+s*dx,cy+s*0.46); ctx.stroke(); });
        ctx.fillStyle = '#3f7d4a'; ctx.fillRect(cx-5,cy-s*0.62,10,18);
        star(cx-s*0.95,cy+s*0.9,11,4.5); star(cx+s*0.95,cy+s*0.9,11,4.5);
      }
      pumpkinCluster(256,235,96);

      function patch(cx,cy,w,h){
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(cx-w/2,cy-h/2,w,h);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.setLineDash([4,4]); ctx.lineWidth=2;
        ctx.strokeRect(cx-w/2,cy-h/2,w,h); ctx.setLineDash([]);
      }
      patch(128,330,36,36); patch(384,100,36,36);

      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      robeTexCache[key] = tex;
      return tex;
    }

    // The one earned/unlockable top (see COSMETIC_CATALOG in the classic game script —
    // "Commemorative TotoQuest Tee", granted at character level 100). Same canvas-texture
    // technique and the same empirically-calibrated front=center/back=seam convention as
    // makeRobeTexture() above, just with a badge/typography design instead of the
    // moon-and-pumpkin pattern.
    const teeTexCache = {};
    function makeTeeTexture(baseColor, trimColor){
      const key = baseColor+'|'+trimColor;
      if (teeTexCache[key]) return teeTexCache[key];
      const W=512, H=512;
      const c = document.createElement('canvas'); c.width=W; c.height=H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = baseColor; ctx.fillRect(0,0,W,H);
      const gold = trimColor || '#d4af37';

      function arcText(cx, cy, text, radius, fontPx){
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = gold;
        ctx.font = 'bold '+fontPx+'px Georgia, serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const step = (fontPx*0.78)/radius;
        let angle = -step*(text.length-1)/2;
        for (const ch of text){
          ctx.save();
          ctx.rotate(angle);
          ctx.translate(0, -radius);
          ctx.fillText(ch, 0, 0);
          ctx.restore();
          angle += step;
        }
        ctx.restore();
      }
      function swirl(cx, cy, scale, mirror){
        ctx.save();
        ctx.translate(cx,cy); ctx.scale(mirror?-1:1,1);
        ctx.strokeStyle = gold; ctx.lineWidth = 3*scale; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(0,0);
        ctx.bezierCurveTo(14*scale,-10*scale, 30*scale,-6*scale, 34*scale,12*scale);
        ctx.bezierCurveTo(38*scale,30*scale, 20*scale,38*scale, 6*scale,30*scale);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(6*scale,30*scale,4*scale,0,Math.PI*2);
        ctx.fillStyle = gold; ctx.fill();
        ctx.restore();
      }
      function jackIcon(cx,cy,s){
        ctx.fillStyle = '#ff8a3d';
        ctx.beginPath(); ctx.ellipse(cx,cy,s,s*0.85,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2a1a3a';
        ctx.beginPath(); ctx.moveTo(cx-s*0.4,cy-s*0.15); ctx.lineTo(cx-s*0.15,cy-s*0.35); ctx.lineTo(cx+s*0.05,cy-s*0.15); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx+s*0.1,cy-s*0.15); ctx.lineTo(cx+s*0.35,cy-s*0.35); ctx.lineTo(cx+s*0.5,cy-s*0.15); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx-s*0.35,cy+s*0.25); ctx.quadraticCurveTo(cx,cy+s*0.55,cx+s*0.35,cy+s*0.25); ctx.quadraticCurveTo(cx,cy+s*0.4,cx-s*0.35,cy+s*0.25); ctx.fill();
      }

      // FRONT (canvas center = -Z): gold frame, arched "TOTOQUEST", a medallion with a
      // jack-o-lantern and "MASTER / ACHIEVER", ribbon tails below.
      ctx.strokeStyle = gold; ctx.lineWidth = 10;
      ctx.strokeRect(28,28,W-56,H-56);
      arcText(256, 150, 'TOTOQUEST', 95, 42);
      ctx.beginPath(); ctx.arc(256,290,78,0,Math.PI*2);
      ctx.fillStyle = gold; ctx.fill();
      ctx.strokeStyle = baseColor; ctx.lineWidth = 4; ctx.stroke();
      jackIcon(256,254,30);
      ctx.fillStyle = '#2a1a3a'; ctx.font = 'bold 24px Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('MASTER', 256, 304);
      ctx.fillText('ACHIEVER', 256, 332);
      ctx.fillStyle = '#b5431e';
      ctx.beginPath(); ctx.moveTo(220,360); ctx.lineTo(200,420); ctx.lineTo(226,405); ctx.lineTo(240,420); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(292,360); ctx.lineTo(312,420); ctx.lineTo(286,405); ctx.lineTo(272,420); ctx.closePath(); ctx.fill();

      // BACK (split across the seam = +Z, same two-copy trick as moonCluster): arched
      // "LEVEL 100" plus a little filigree either side of it.
      [0,512].forEach(seamX=>{
        arcText(seamX, 190, 'LEVEL 100', 110, 50);
        swirl(seamX-40, 260, 1.6, false); swirl(seamX+40, 260, 1.6, true);
        swirl(seamX-40, 340, 1.3, false); swirl(seamX+40, 340, 1.3, true);
      });

      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      teeTexCache[key] = tex;
      return tex;
    }

    // The earned tee wears the real shirt artwork (front: TotoQuest / Master Achiever
    // medallion, back: Level 100 filigree) laid out around the torso — print centred on
    // the front, back print split across the seam. The male figure is mirrored as a
    // whole (body.scale.x = -1), so he gets a horizontally flipped copy to keep the
    // lettering reading the right way round.
    const teePrintTex = {};
    function getTeePrintTexture(mirrored){
      const k = mirrored ? 'm' : 'n';
      if (teePrintTex[k]) return teePrintTex[k];
      const tex = new THREE.TextureLoader().load('assets/wardrobe/tee-tex.jpg');
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4;
      if (mirrored){ tex.repeat.x = -1; tex.offset.x = 1; }
      teePrintTex[k] = tex;
      return tex;
    }

    const stripeTexCache = {};
    function makeStripeTexture(colorA, colorB){
      const key = colorA+'|'+colorB;
      if (stripeTexCache[key]) return stripeTexCache[key];
      const c = document.createElement('canvas'); c.width=32; c.height=128;
      const ctx = c.getContext('2d');
      const bands = 8;
      for (let i=0;i<bands;i++){ ctx.fillStyle = i%2===0?colorA:colorB; ctx.fillRect(0, i*(128/bands), 32, 128/bands); }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      stripeTexCache[key] = tex;
      return tex;
    }

    // ======================================================================
    // v37 PLAYER MODEL — chibi-proportioned, toon-shaded, ink-outlined witch.
    // ----------------------------------------------------------------------
    // Replaces the first-pass capsule figure. Same public contract as before
    // (buildPlayerModel(gender) -> Group with userData.parts, driven by
    // PLAYER_EQUIP_CATALOG slots, rebuilt by mountPlayer3D for wardrobe
    // changes), so the equip/unlock system keeps working unchanged.
    //
    // Style choices, aiming at the painted reference (big-head chibi, soft
    // painterly shading, dark ink edge):
    //  - MeshToonMaterial with a soft, lifted gradient ramp: colours stay vivid
    //    like the painted art instead of going muddy in shadow.
    //  - Inverted-hull outlines (back faces pushed out along the normal) give
    //    every part a thin dark ink line, which is most of what makes a low-poly
    //    figure read as "stylized character" rather than "placeholder".
    //  - Repeated small parts (curls, candy) are merged into single meshes so
    //    the whole figure stays a modest number of draw calls.
    // Conventions kept from v1: front is -Z, feet on y=0. Lathe/cylinder UVs put
    // canvas-centre on -Z (front) and the canvas seam on +Z (back) — see the
    // calibration note on makeRobeTexture().
    // ======================================================================
    let toonGrad = null;
    function getToonGradient(){
      if (toonGrad) return toonGrad;
      const n = 32, data = new Uint8Array(n*4);
      for (let i=0;i<n;i++){
        const x = i/(n-1);
        const t = Math.min(1, Math.max(0, (x-0.30)/0.38));
        const s = t*t*(3-2*t);                 // smooth band, not a hard cel step
        const v = 0.40 + 0.60*s;               // lifted shadows keep colours rich, with real form
        data[i*4]=data[i*4+1]=data[i*4+2]=Math.round(v*255); data[i*4+3]=255;
      }
      toonGrad = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
      toonGrad.minFilter = toonGrad.magFilter = THREE.LinearFilter;
      toonGrad.generateMipmaps = false; toonGrad.needsUpdate = true;
      return toonGrad;
    }
    function toon(color, extra){ return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap:getToonGradient() }, extra||{})); }

    const OUTLINE_COLOR = 0x1c1128;
    const outlineMatCache = {};
    function outlineMat(th){
      const key = th.toFixed(4);
      if (outlineMatCache[key]) return outlineMatCache[key];
      const m = new THREE.MeshBasicMaterial({ color:OUTLINE_COLOR, side:THREE.BackSide });
      m.onBeforeCompile = (sh)=>{
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n  transformed += normalize(normal) * '+key+';');
      };
      m.customProgramCacheKey = ()=> 'tq-outline-'+key;
      outlineMatCache[key] = m;
      return m;
    }
    // Adds a mesh (plus its ink outline) to a parent and returns it.
    function part(parent, geo, material, opts){
      opts = opts || {};
      const mesh = new THREE.Mesh(geo, material);
      if (opts.pos) mesh.position.set(...opts.pos);
      if (opts.rot) mesh.rotation.set(...opts.rot);
      if (opts.scale) mesh.scale.set(...opts.scale);
      mesh.castShadow = opts.shadow !== false;
      const th = opts.outline === undefined ? 0.014 : opts.outline;
      if (th > 0){
        const ol = new THREE.Mesh(geo, outlineMat(th));
        ol.castShadow = false; ol.userData.isOutline = true; mesh.add(ol);
      }
      parent.add(mesh);
      return mesh;
    }
    // Bakes many small transformed geometries into one (for curls, candy…).
    function mergeParts(list){
      const P=[], N=[], U=[];
      const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const v = new THREE.Vector3();
      list.forEach(it=>{
        const g = it.geo.index ? it.geo.toNonIndexed() : it.geo;
        e.set(...(it.rot||[0,0,0])); q.setFromEuler(e);
        m.compose(new THREE.Vector3(...(it.pos||[0,0,0])), q, new THREE.Vector3(...(it.scale||[1,1,1])));
        nm.getNormalMatrix(m);
        const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
        for (let i=0;i<pa.count;i++){
          v.fromBufferAttribute(pa,i).applyMatrix4(m); P.push(v.x,v.y,v.z);
          v.fromBufferAttribute(na,i).applyMatrix3(nm).normalize(); N.push(v.x,v.y,v.z);
          if (ua) U.push(ua.getX(i), ua.getY(i)); else U.push(0,0);
        }
      });
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(P,3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(N,3));
      out.setAttribute('uv', new THREE.Float32BufferAttribute(U,2));
      return out;
    }

    // ---------------- Textures for the v2 outfit ----------------
    const coatTexCache = {};
    function makeCoatTexture(base, trim, closed){
      const key = base+'|'+trim+'|'+(closed?1:0);
      if (coatTexCache[key]) return coatTexCache[key];
      const W=512, H=512;
      const c = document.createElement('canvas'); c.width=W; c.height=H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = base; ctx.fillRect(0,0,W,H);
      // soft vertical fold shading so the coat doesn't read as a flat tube
      for (let i=0;i<10;i++){
        const x = (i+0.5)*W/10;
        const g = ctx.createLinearGradient(x-26,0,x+26,0);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.5,'rgba(0,0,0,0.10)'); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x-26, 120, 52, H-120);
      }
      const gold = '#ffd27a';
      function star(cx,cy,r){ ctx.beginPath(); for (let i=0;i<10;i++){ const a=Math.PI/5*i-Math.PI/2, rr=i%2?r*0.42:r; ctx.lineTo(cx+Math.cos(a)*rr, cy+Math.sin(a)*rr);} ctx.closePath(); ctx.fill(); }
      function moon(cx,cy,r){ ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.arc(cx+r*0.42,cy-r*0.3,r*0.86,0,Math.PI*2); ctx.fill('evenodd'); }
      // scattered small moons + stars all over (the reference coat's print)
      ctx.fillStyle = gold;
      let seed = 7; const rnd = ()=>{ seed = (seed*9301+49297)%233280; return seed/233280; };
      for (let i=0;i<46;i++){
        const x = rnd()*W, y = 60+rnd()*(H-120);
        if (Math.abs(x-256) < 70) continue;           // keep the front opening clear
        if (rnd() < 0.35) moon(x,y,7+rnd()*4); else star(x,y,5+rnd()*4);
      }
      // big moon + stars on the back (split across the seam = +Z)
      [0,W].forEach(sx=>{ moon(sx, 210, 46); star(sx-60, 300, 12); star(sx+58, 150, 10); });
      if (!closed){
        // front opening: striped dress showing between orange coat edges (witch look)
        const dressX0 = 256-40, dressX1 = 256+40;
        for (let y=40;y<H;y+=26){ ctx.fillStyle = (Math.floor(y/26)%2) ? '#2a1a2e' : '#ff8a3d'; ctx.fillRect(dressX0, y, dressX1-dressX0, 26); }
        ctx.fillStyle = trim; ctx.fillRect(dressX0-16, 40, 16, H-40); ctx.fillRect(dressX1, 40, 16, H-40);
      } else {
        // buttoned-up front with gold frog-toggle closures (wizard look)
        ctx.fillStyle = trim; ctx.fillRect(256-5, 30, 10, H-64);
        ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (let i=0;i<4;i++){
          const y = 70 + i*52;
          ctx.beginPath(); ctx.moveTo(256-26, y); ctx.quadraticCurveTo(256-12, y-10, 256, y); ctx.quadraticCurveTo(256+12, y+10, 256+26, y); ctx.stroke();
          ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.ellipse(256, y, 7, 5, 0, 0, Math.PI*2); ctx.fill();
        }
      }
      // pumpkin pockets either side of the opening
      function pumpkin(cx,cy,s){
        ctx.fillStyle = '#ff8a3d';
        [-0.38,0,0.38].forEach(dx=>{ ctx.beginPath(); ctx.ellipse(cx+s*dx,cy,s*0.45,s*0.52,0,0,Math.PI*2); ctx.fill(); });
        ctx.fillStyle = '#3d1f0b';
        ctx.beginPath(); ctx.moveTo(cx-s*0.45,cy-s*0.1); ctx.lineTo(cx-s*0.2,cy-s*0.3); ctx.lineTo(cx-s*0.08,cy-s*0.05); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx+s*0.45,cy-s*0.1); ctx.lineTo(cx+s*0.2,cy-s*0.3); ctx.lineTo(cx+s*0.08,cy-s*0.05); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx-s*0.4,cy+s*0.15); ctx.quadraticCurveTo(cx,cy+s*0.5,cx+s*0.4,cy+s*0.15); ctx.quadraticCurveTo(cx,cy+s*0.3,cx-s*0.4,cy+s*0.15); ctx.fill();
        ctx.fillStyle = '#3f7d4a'; ctx.fillRect(cx-4, cy-s*0.66, 8, 12);
      }
      pumpkin(256-112, 360, 46); pumpkin(256+112, 360, 46);
      // a couple of stitched patches
      function patch(cx,cy,w,h,col){ ctx.fillStyle=col; ctx.fillRect(cx-w/2,cy-h/2,w,h); ctx.strokeStyle='rgba(255,230,190,0.75)'; ctx.setLineDash([5,4]); ctx.lineWidth=2; ctx.strokeRect(cx-w/2+3,cy-h/2+3,w-6,h-6); ctx.setLineDash([]); }
      patch(70, 300, 40, 34, '#7d55b8'); patch(430, 250, 36, 36, '#c4612a');
      // hem trim: orange band with bat-wing scallops
      ctx.fillStyle = trim; ctx.fillRect(0, H-34, W, 34);
      ctx.beginPath();
      for (let i=0;i<=16;i++){ const x=i*W/16; ctx.moveTo(x, H-34); ctx.quadraticCurveTo(x+W/32, H-52, x+W/16, H-34); }
      ctx.fill();
      // collar band
      ctx.fillStyle = trim; ctx.fillRect(0,0,W,22);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      coatTexCache[key] = tex;
      return tex;
    }
    const hatTexCache = {};
    function makeHatTexture(base, accent){
      const key = base+'|'+accent;
      if (hatTexCache[key]) return hatTexCache[key];
      const W=256, H=256;
      const c = document.createElement('canvas'); c.width=W; c.height=H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = base; ctx.fillRect(0,0,W,H);
      for (let i=0;i<6;i++){ ctx.fillStyle='rgba(0,0,0,0.12)'; ctx.fillRect(i*W/6+8, 0, 6, H); }  // crumpled folds
      function patch(cx,cy,w,h,col,rot){ ctx.save(); ctx.translate(cx,cy); ctx.rotate(rot||0); ctx.fillStyle=col; ctx.fillRect(-w/2,-h/2,w,h); ctx.strokeStyle='rgba(255,230,190,0.8)'; ctx.setLineDash([4,3]); ctx.lineWidth=2; ctx.strokeRect(-w/2+3,-h/2+3,w-6,h-6); ctx.setLineDash([]); ctx.restore(); }
      patch(170, 170, 34, 30, '#7d55b8', 0.2);
      patch(60, 120, 30, 28, accent, -0.15);
      patch(10, 190, 28, 26, '#2e8a5a', 0.1); patch(W+10, 190, 28, 26, '#2e8a5a', 0.1);
      // gold crescent moon + stars on the front (canvas centre = -Z)
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath(); ctx.arc(118, 150, 22, 0, Math.PI*2); ctx.arc(128, 142, 19, 0, Math.PI*2); ctx.fill('evenodd');
      ctx.beginPath(); for (let i=0;i<10;i++){ const a=Math.PI/5*i-Math.PI/2, r=i%2?6:15; ctx.lineTo(150+Math.cos(a)*r, 108+Math.sin(a)*r);} ctx.closePath(); ctx.fill();
      ctx.beginPath(); for (let i=0;i<10;i++){ const a=Math.PI/5*i-Math.PI/2, r=i%2?4:9; ctx.lineTo(96+Math.cos(a)*r, 70+Math.sin(a)*r);} ctx.closePath(); ctx.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      hatTexCache[key] = tex;
      return tex;
    }
    // ---- Level 100 Witch Hat: the embroidered hat art, unwrapped for the cone, band and brim ----
    const l100TexCache = {};
    function l100Tex(part, mirrored){
      const k = part + (mirrored ? 'm' : '');
      if (l100TexCache[k]) return l100TexCache[k];
      const t = new THREE.TextureLoader().load('assets/wardrobe/l100hat-'+part+'.jpg');
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      if (part !== 'brim'){ t.wrapS = THREE.RepeatWrapping; if (mirrored){ t.repeat.x = -1; t.offset.x = 1; } }
      return (l100TexCache[k] = t);
    }

    let weaveTex = null;
    function makeWeaveTexture(){
      if (weaveTex) return weaveTex;
      const c = document.createElement('canvas'); c.width=128; c.height=64;
      const ctx = c.getContext('2d');
      ctx.fillStyle='#9a6a3a'; ctx.fillRect(0,0,128,64);
      for (let y=0;y<64;y+=8) for (let x=0;x<128;x+=16){
        ctx.fillStyle = ((x/16+y/8)%2) ? '#b9844d' : '#7d5229';
        ctx.fillRect(x+1,y+1,14,6);
      }
      weaveTex = new THREE.CanvasTexture(c);
      weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping; weaveTex.repeat.set(3,1);
      weaveTex.colorSpace = THREE.SRGBColorSpace;
      return weaveTex;
    }

    // ---------------- Accessory builders ----------------
    let lanternHaloTex = null;
    function getLanternHaloTexture(){
      if (lanternHaloTex) return lanternHaloTex;
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64,64,0, 64,64,64);
      g.addColorStop(0,'rgba(255,255,255,0.9)'); g.addColorStop(0.25,'rgba(255,255,255,0.45)');
      g.addColorStop(0.6,'rgba(255,255,255,0.12)'); g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      lanternHaloTex = new THREE.CanvasTexture(c);
      return lanternHaloTex;
    }
    function makeJackOLantern(r, glowColor){
      const g = new THREE.Group();
      const shell = toon('#f2731c', { emissive:'#ff5a00', emissiveIntensity:0.3 });
      const lobes = [];
      for (let i=0;i<6;i++){
        const a = i/6*Math.PI*2;
        lobes.push({ geo:new THREE.SphereGeometry(r*0.62, 16, 12), pos:[Math.sin(a)*r*0.42, 0, Math.cos(a)*r*0.42], scale:[0.8,1,0.8] });
      }
      lobes.push({ geo:new THREE.SphereGeometry(r*0.7, 16, 12), pos:[0,0,0], scale:[1,0.95,1] });
      part(g, mergeParts(lobes), shell, { scale:[1,0.86,1], outline:0.008 });
      part(g, new THREE.CylinderGeometry(r*0.12, r*0.16, r*0.35, 6), toon('#3f6b2a'), { pos:[0, r*0.82, 0], rot:[0,0,0.25], outline:0.006 });
      // carved face glowing from inside (front = -Z)
      const glow = new THREE.MeshBasicMaterial({ color: glowColor || '#ffe27a' });
      const tri = new THREE.Shape(); tri.moveTo(-0.5,-0.4); tri.lineTo(0.5,-0.4); tri.lineTo(0,0.5); tri.closePath();
      const triGeo = new THREE.ShapeGeometry(tri);
      [-1,1].forEach(sx=>{ const e = new THREE.Mesh(triGeo, glow); e.scale.set(r*0.34, r*0.34, 1); e.position.set(sx*r*0.32, r*0.12, -r*0.86); e.rotation.y = Math.PI; g.add(e); });
      const mouth = new THREE.Shape();
      mouth.moveTo(-0.9,0.1); mouth.lineTo(-0.5,-0.05); mouth.lineTo(-0.3,0.15); mouth.lineTo(0,-0.05); mouth.lineTo(0.3,0.15); mouth.lineTo(0.5,-0.05); mouth.lineTo(0.9,0.1); mouth.quadraticCurveTo(0,-0.75,-0.9,0.1);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(mouth), glow); m.scale.set(r*0.42, r*0.42, 1); m.position.set(0, -r*0.25, -r*0.88); m.rotation.y = Math.PI; g.add(m);
      return g;
    }
    function makeBat(scale, color){
      const g = new THREE.Group();
      const mat = toon(color || '#231a2e');
      part(g, new THREE.SphereGeometry(0.5, 12, 10), mat, { scale:[0.9,1,0.8], outline:0.05 });
      [-1,1].forEach(sx=>{ part(g, new THREE.ConeGeometry(0.18, 0.4, 6), mat, { pos:[sx*0.25, 0.55, 0], rot:[0,0,-sx*0.25], outline:0.04 }); });
      const wing = new THREE.Shape();
      wing.moveTo(0,0.25); wing.quadraticCurveTo(0.9,0.75,1.5,0.35); wing.quadraticCurveTo(1.25,0.05,1.1,-0.1); wing.quadraticCurveTo(0.95,0.05,0.75,-0.15); wing.quadraticCurveTo(0.55,0.0,0.35,-0.2); wing.quadraticCurveTo(0.2,-0.05,0,-0.1); wing.closePath();
      const wg = new THREE.ExtrudeGeometry(wing, { depth:0.06, bevelEnabled:false });
      const wl = new THREE.Group(), wr = new THREE.Group();
      part(wl, wg, mat, { outline:0.035 }); part(wr, wg, mat, { outline:0.035, rot:[0, Math.PI, 0] });
      wl.position.set(0.3,0.1,0); wr.position.set(-0.3,0.1,0); g.add(wl, wr);
      const eye = new THREE.MeshBasicMaterial({ color:'#ffd94a' });
      [-1,1].forEach(sx=>{ const e = new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6), eye); e.position.set(sx*0.17, 0.12, -0.4); g.add(e); });
      g.scale.setScalar(scale);
      g.userData.wings = [wl, wr];
      return g;
    }
    function makeBasket(){
      const g = new THREE.Group();
      const wood = toon('#ffffff', { map: makeWeaveTexture(), side: THREE.DoubleSide });
      const bowl = new THREE.LatheGeometry([ new THREE.Vector2(0.001,0), new THREE.Vector2(0.09,0.005), new THREE.Vector2(0.115,0.06), new THREE.Vector2(0.125,0.12) ], 18);
      part(g, bowl, wood, { outline:0.008 });
      part(g, new THREE.TorusGeometry(0.125, 0.012, 6, 20), toon('#7d5229'), { pos:[0,0.12,0], rot:[Math.PI/2,0,0], outline:0.005 });
      part(g, new THREE.TorusGeometry(0.11, 0.011, 6, 16, Math.PI), toon('#7d5229'), { pos:[0,0.12,0], outline:0.005 });
      const candyCols = ['#ff5b6e','#ffd166','#6bd1a0','#8a6bff','#ff9a3d','#5ec8ff'];
      candyCols.forEach((col,i)=>{
        const a = i/candyCols.length*Math.PI*2;
        part(g, new THREE.SphereGeometry(0.032, 10, 8), toon(col), { pos:[Math.cos(a)*0.06, 0.13+(i%2)*0.02, Math.sin(a)*0.06], scale:[1.3,0.9,0.9], rot:[0,a,0], outline:0.004 });
      });
      const pk = makeJackOLantern(0.05, '#ffb347'); pk.position.set(-0.03, 0.17, -0.02); g.add(pk);
      const bat = makeBat(0.07); bat.position.set(0.06, 0.2, 0.03); bat.rotation.y = 0.5; g.add(bat);
      return g;
    }
    // Small black cat with its own mini witch hat (kept for the male look, which
    // matches its reference sheet; the female look follows the newer reference).
    function makeCatCompanion(hatColor){
      const g = new THREE.Group();
      const black = toon('#221c28');
      part(g, new THREE.SphereGeometry(0.07, 14, 10), black, { scale:[0.8,1,1.25], outline:0.006 });
      part(g, new THREE.SphereGeometry(0.06, 14, 10), black, { pos:[0,0.09,-0.05], outline:0.006 });
      [-1,1].forEach(sx=> part(g, new THREE.ConeGeometry(0.022, 0.045, 6), black, { pos:[sx*0.032,0.15,-0.05], rot:[0,0,-sx*0.3], outline:0.004 }));
      const eye = new THREE.MeshBasicMaterial({ color:'#ffd94a' });
      [-1,1].forEach(sx=>{ const e = new THREE.Mesh(new THREE.SphereGeometry(0.011,8,6), eye); e.position.set(sx*0.022, 0.1, -0.104); g.add(e); });
      part(g, new THREE.ConeGeometry(0.04, 0.08, 10), toon(hatColor||'#4a2f6b'), { pos:[0,0.18,-0.05], rot:[0.2,0,0], outline:0.004 });
      const tailCurve = new THREE.CatmullRomCurve3([ new THREE.Vector3(0,-0.02,0.08), new THREE.Vector3(0.04,0.02,0.14), new THREE.Vector3(0.02,0.1,0.16), new THREE.Vector3(-0.02,0.14,0.13) ]);
      part(g, new THREE.TubeGeometry(tailCurve, 16, 0.013, 6, false), black, { outline:0.004 });
      return g;
    }

    // ---------------- Proportions (chibi) ----------------
    const BOOT_H = 0.2, LEG_LEN = 0.36, HIP_Y = BOOT_H + LEG_LEN - 0.02;
    const SHOULDER_Y = 1.06, HEAD_Y = 1.40, HEAD_R = 0.30;

    function buildPlayerModel(gender){
      const cfg = PLAYER_EQUIP_CATALOG[gender] || PLAYER_EQUIP_CATALOG.female;
      const isFemale = gender !== 'male';
      const root = new THREE.Group();
      const body = new THREE.Group(); root.add(body);         // rotates for facing
      const skin = toon(cfg.skin || '#ffcf9e');
      const hairCol = cfg.hair || '#d2691e';
      const topColor = (cfg.top&&cfg.top.color) || '#6b3fa0', topTrim = (cfg.top&&cfg.top.trim) || '#ffb347';
      const isTee = cfg.top && cfg.top.kind === 'tee';

      // ---- Legs: striped stockings + chunky strapped boots (hip pivots for walking) ----
      const stockMat = toon('#ffffff', { map: makeStripeTexture(isFemale ? '#2a1a2e' : '#e07a2a', (cfg.legwear&&cfg.legwear.color) || '#5a3690') });
      const bootMat = toon((cfg.shoes&&cfg.shoes.color) || '#4a2c1c');
      const strapMat = toon('#2a1a12'), buckleMat = toon('#ffd27a', { emissive:'#5a4010' });
      function makeLeg(sx){
        const pivot = new THREE.Group(); pivot.position.set(sx*0.1, HIP_Y, 0);
        part(pivot, new THREE.CapsuleGeometry(0.062, LEG_LEN-0.1, 6, 12), stockMat, { pos:[0, -LEG_LEN/2+0.02, 0] });
        const by = -HIP_Y; // boot sits on the ground
        part(pivot, new THREE.SphereGeometry(0.1, 16, 12), bootMat, { pos:[0, by+0.07, -0.035], scale:[0.95,0.72,1.35] });
        part(pivot, new THREE.CylinderGeometry(0.085, 0.09, 0.17, 16), bootMat, { pos:[0, by+0.15, 0.005] });
        part(pivot, new THREE.TorusGeometry(0.088, 0.018, 8, 18), bootMat, { pos:[0, by+0.235, 0.005], rot:[Math.PI/2,0,0], outline:0.006 });
        part(pivot, new THREE.TorusGeometry(0.092, 0.012, 6, 18), strapMat, { pos:[0, by+0.15, 0.005], rot:[Math.PI/2,0,0], outline:0.004 });
        part(pivot, new THREE.BoxGeometry(0.035, 0.03, 0.012), buckleMat, { pos:[sx*0.02, by+0.15, -0.098], outline:0.003 });
        body.add(pivot);
        return pivot;
      }
      const leftLeg = makeLeg(-1), rightLeg = makeLeg(1);

      // ---- Coat (lathe: fitted chest, flared hem) or the earned fitted tee ----
      let coat;
      if (!isTee){
        const prof = [[0.30,0.36],[0.315,0.40],[0.295,0.48],[0.27,0.58],[0.245,0.68],[0.225,0.78],[0.212,0.86],[0.218,0.94],[0.225,1.0],[0.205,1.05],[0.15,1.09],[0.10,1.11]]
          .map(([r,y])=> new THREE.Vector2(r,y));
        coat = part(body, new THREE.LatheGeometry(prof, 40), toon('#ffffff', { map: makeCoatTexture(topColor, topTrim, !isFemale) }), { outline:0.016 });
        part(body, new THREE.TorusGeometry(0.305, 0.022, 8, 40), toon(topTrim), { pos:[0,0.37,0], rot:[Math.PI/2,0,0], outline:0.008 });
      } else {
        // evenly spaced rings so the print maps on without stretching (lathe V follows the
        // point index, not the distance between points)
        const radii = [0.252,0.246,0.238,0.231,0.226,0.224,0.224,0.226,0.229,0.229,0.222,0.198,0.128];
        const prof = radii.map((r,i)=> new THREE.Vector2(r, 0.50 + i*0.05));
        coat = part(body, new THREE.LatheGeometry(prof, 48), toon('#ffffff', { map: getTeePrintTexture(!isFemale) }), { outline:0.016 });
        // ribbed hem band
        part(body, new THREE.TorusGeometry(0.25, 0.014, 6, 40), toon('#2c1e3e'), { pos:[0,0.505,0], rot:[Math.PI/2,0,0], outline:0.005 });
        // a short skirt / shorts under the tee so the silhouette still reads as the same character
        const sk = [[0.275,0.40],[0.262,0.45],[0.25,0.50],[0.24,0.55]].map(([r,y])=> new THREE.Vector2(r,y));
        part(body, new THREE.LatheGeometry(sk, 32), toon(isFemale ? ((cfg.legwear&&cfg.legwear.color) || '#3d2a5c') : '#2a2238'), { outline:0.012 });
      }

      // ---- Collar: orange hood folded on the shoulders + bow + little bat brooch ----
      if (!isTee){
        part(body, new THREE.TorusGeometry(0.16, 0.06, 12, 28), toon(topTrim), { pos:[0,1.085,0.01], rot:[Math.PI/2,0,0], outline:0.01 });
        part(body, new THREE.SphereGeometry(0.2, 18, 12, 0, Math.PI*2, 0, Math.PI/2), toon(topTrim, { side:THREE.DoubleSide }), { pos:[0,1.02,0.12], rot:[-1.3,0,0], scale:[1,0.7,0.8], outline:0.01 });
        [-1,1].forEach(sx=> part(body, new THREE.ConeGeometry(0.045, 0.09, 8), toon(topTrim), { pos:[sx*0.05,1.06,-0.17], rot:[0,0,sx*Math.PI/2], outline:0.006 }));
        part(body, new THREE.SphereGeometry(0.025, 10, 8), toon(topTrim), { pos:[0,1.06,-0.175], outline:0.005 });
      } else {
        // ribbed crew neck
        part(body, new THREE.TorusGeometry(0.118, 0.022, 8, 28), toon('#2c1e3e'), { pos:[0,1.098,0], rot:[Math.PI/2,0,0], outline:0.006 });
      }
      if (isFemale && !isTee){ const brooch = makeBat(0.07, '#2a1f3a'); brooch.position.set(0, 1.0, -0.215); body.add(brooch); }

      // ---- Arms: bell sleeves with trim cuffs, little hands (shoulder pivots) ----
      const sleeveMat = toon(topColor, { side:THREE.DoubleSide });
      function makeArm(sx){
        const pivot = new THREE.Group(); pivot.position.set(sx*0.2, SHOULDER_Y, 0);
        pivot.rotation.z = sx*0.32;
        if (!isTee){
          const sl = [[0.055,0],[0.07,-0.08],[0.085,-0.18],[0.11,-0.27],[0.125,-0.31]].map(([r,y])=> new THREE.Vector2(r,y));
          part(pivot, new THREE.LatheGeometry(sl, 18), sleeveMat, { outline:0.012 });
          part(pivot, new THREE.TorusGeometry(0.122, 0.018, 8, 20), toon(topTrim), { pos:[0,-0.31,0], rot:[Math.PI/2,0,0], outline:0.006 });
        } else {
          // short T-shirt sleeve, then a bare arm down to the hand
          const sl = [[0.07,0.03],[0.08,-0.04],[0.086,-0.11],[0.088,-0.15]].map(([r,y])=> new THREE.Vector2(r,y));
          part(pivot, new THREE.LatheGeometry(sl, 18), sleeveMat, { outline:0.012 });
          part(pivot, new THREE.TorusGeometry(0.086, 0.011, 6, 18), toon('#2c1e3e'), { pos:[0,-0.15,0], rot:[Math.PI/2,0,0], outline:0.004 });
          part(pivot, new THREE.CapsuleGeometry(0.04, 0.17, 4, 10), skin, { pos:[0,-0.235,0], outline:0.008 });
        }
        part(pivot, new THREE.SphereGeometry(0.055, 14, 10), skin, { pos:[0,-0.345,0], scale:[1,1.05,0.95], outline:0.008 });
        body.add(pivot);
        return pivot;
      }
      const leftArm = makeArm(-1), rightArm = makeArm(1);

      // ---- Head ----
      const headGroup = new THREE.Group(); headGroup.position.y = HEAD_Y; body.add(headGroup);
      part(headGroup, new THREE.SphereGeometry(HEAD_R, 32, 24), skin, { scale:[1.04,0.97,1], outline:0.012 });
      part(headGroup, new THREE.CylinderGeometry(0.07, 0.08, 0.1, 12), skin, { pos:[0,-HEAD_R*0.95,0], outline:0 });
      // face features sit on the sphere surface; each feature group's +Z is the outward normal
      function onFace(x, y, depth){
        const z = -Math.sqrt(Math.max(0.0001, HEAD_R*HEAD_R - x*x - y*y));
        const grp = new THREE.Group(); grp.position.set(x*1.04, y*0.97, z + (depth||0));
        grp.lookAt(new THREE.Vector3(x*2.5, y*2.2, z*2.5));
        headGroup.add(grp); return grp;
      }
      const eyeWhite = new THREE.MeshBasicMaterial({ color:'#fffaf2' });
      const irisMat = new THREE.MeshBasicMaterial({ color: isFemale ? '#3a9a5c' : '#8a5a2e' });
      const irisDark = new THREE.MeshBasicMaterial({ color: isFemale ? '#1c3a24' : '#3a2414' });
      const pupilMat = new THREE.MeshBasicMaterial({ color:'#120c10' });
      const shine = new THREE.MeshBasicMaterial({ color:'#ffffff' });
      const lashMat = new THREE.MeshBasicMaterial({ color:'#2a1612' });
      [-1,1].forEach(sx=>{
        const e = onFace(sx*0.112, -0.015);
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.068, 24), eyeWhite); w.scale.set(0.85,1.08,1); w.position.z = 0.004; e.add(w);
        const ir = new THREE.Mesh(new THREE.CircleGeometry(0.052, 24), irisDark); ir.scale.set(0.9,1.1,1); ir.position.set(0,-0.006,0.008); e.add(ir);
        const ir2 = new THREE.Mesh(new THREE.CircleGeometry(0.042, 24), irisMat); ir2.scale.set(0.9,1.1,1); ir2.position.set(0,-0.012,0.011); e.add(ir2);
        const pu = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), pupilMat); pu.position.set(0,-0.006,0.014); e.add(pu);
        const s1 = new THREE.Mesh(new THREE.CircleGeometry(0.016, 12), shine); s1.position.set(-sx*0.016, 0.02, 0.017); e.add(s1);
        const s2 = new THREE.Mesh(new THREE.CircleGeometry(0.008, 10), shine); s2.position.set(sx*0.014, -0.028, 0.017); e.add(s2);
        const lash = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 4, 16, Math.PI*0.95), lashMat); lash.scale.set(0.9,1.05,1); lash.position.set(0,0.004,0.016); lash.rotation.z = Math.PI*0.025; e.add(lash);
        if (isFemale){ const flick = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 4), lashMat); flick.position.set(sx*0.058, 0.04, 0.016); flick.rotation.z = -sx*0.9; e.add(flick); }
        const brow = onFace(sx*0.11, 0.105);
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.045, 3, 6), new THREE.MeshBasicMaterial({ color:'#a4481a' })); b.rotation.z = Math.PI/2 + sx*0.12; b.position.z = 0.006; brow.add(b);
        const ch = onFace(sx*0.175, -0.095);
        const blush = new THREE.Mesh(new THREE.CircleGeometry(0.038, 18), new THREE.MeshBasicMaterial({ color:'#ff8a8a', transparent:true, opacity:0.45 })); blush.scale.set(1.3,0.8,1); blush.position.z = 0.004; ch.add(blush);
      });
      const frk = new THREE.MeshBasicMaterial({ color:'#c9774d' });
      [[-0.15,-0.07],[-0.13,-0.09],[-0.17,-0.1],[0.15,-0.07],[0.13,-0.09],[0.17,-0.1]].forEach(([x,y])=>{ const f = onFace(x,y); const d = new THREE.Mesh(new THREE.CircleGeometry(0.006, 6), frk); d.position.z = 0.006; f.add(d); });
      const nose = onFace(0, -0.07); nose.add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), skin));
      const mouthG = onFace(0, -0.135);
      const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color:'#8a2a2a' }));
      smile.rotation.z = Math.PI; smile.position.z = 0.006; mouthG.add(smile);

      // ---- Hair: a solid cap over the back/top of the head (open at the face, open at the
      // crown where the hat sits) so no angle ever shows bare scalp, then a big curly
      // mass of clustered curls on top of it (merged into one mesh) ----
      const capGap = 0.95;   // half-width (radians) of the face opening, centred on -Z
      const capGeo = new THREE.SphereGeometry(HEAD_R*1.05, 40, 24, -Math.PI/2 + capGap, Math.PI*2 - capGap*2, 0.5, 1.75);
      part(headGroup, capGeo, toon(hairCol, { side:THREE.DoubleSide }), { scale:[1.04,0.97,1.04], outline:0.01 });
      const curls = [];
      let s = 11; const rnd = ()=>{ s = (s*9301+49297)%233280; return s/233280; };
      for (let i=0;i<96;i++){           // shell around back/top/sides, down to the nape
        const th = (rnd()*1.5 - 0.75)*Math.PI*0.95;   // around Y (0 = back +Z)
        const ph = 0.15 + rnd()*1.85;                 // down from the top
        const R = HEAD_R*1.04;
        const x = Math.sin(th)*Math.sin(ph)*R, y = Math.cos(ph)*R*0.95, z = Math.cos(th)*Math.sin(ph)*R;
        const cr = 0.085+rnd()*0.05;
        if (z < -0.05 && y < 0.12) continue;          // keep the face clear
        if (y + cr > 0.16) continue;                  // under the hat brim, never poking through it
        curls.push({ geo:new THREE.SphereGeometry(cr, 12, 10), pos:[x, y, z+0.02] });
      }
      // bangs across the forehead under the brim
      // (kept low enough that they peek out UNDER the brim instead of through it)
      for (let i=0;i<7;i++){ const x = (i-3)*0.068; curls.push({ geo:new THREE.SphereGeometry(0.066 - Math.abs(i-3)*0.005, 12, 10), pos:[x, 0.085 - Math.abs(x)*0.22, -0.255 + Math.abs(x)*0.2], scale:[1,0.8,0.7] }); }
      if (isFemale){
        // long curly locks falling past the shoulders, both sides + back
        // two staggered columns per lock so each reads as a fat ringlet, not a bead string
        // (in the Level 100 tee her curls are swept forward over the shoulders, so the
        //  LEVEL 100 lettering across the back of the shirt isn't hidden under them)
        (isTee ? [[-1,0],[1,0],[-0.95,-0.25],[0.95,-0.25]] : [[-1,0],[1,0],[-0.6,0.8],[0.6,0.8],[-0.25,1],[0.25,1]]).forEach(([dx,dz],k)=>{
          for (let j=0;j<6;j++){
            const r = 0.082 - j*0.006;
            const wob = (j%2 ? 1 : -1)*0.03;
            const bx = dx*(0.25+j*0.012), bz = -0.02 + dz*0.2 + (k<2? 0.05:0);
            curls.push({ geo:new THREE.SphereGeometry(r, 12, 10), pos:[bx+wob, -0.1 - j*0.075, bz] });
            curls.push({ geo:new THREE.SphereGeometry(r*0.8, 10, 8), pos:[bx-wob*0.9, -0.137 - j*0.075, bz + dz*0.03 + (dz?0:0.035)] });
          }
        });
      }
      part(headGroup, mergeParts(curls), toon(hairCol), { outline:0.012 });

      // ---- Hat ----
      if (cfg.hat && cfg.hat.kind === 'level100Hat'){
        // The Level 100 Witch Hat: wide flat brim, a band of golden bats, and a squat cone
        // with LEVEL 100 embroidered on the front, its tip curled over.
        const hatGroup = new THREE.Group(); hatGroup.position.set(0, HEAD_R*0.62, 0.02); hatGroup.rotation.x = -0.12; headGroup.add(hatGroup);
        const velvet = '#4a1c5c', lip = '#6c3a8c';
        const brimR = 0.6;
        const brimGeo = new THREE.CylinderGeometry(brimR, brimR, 0.035, 72, 1);
        const bp = brimGeo.attributes.position;
        for (let i=0;i<bp.count;i++){ const r = Math.hypot(bp.getX(i), bp.getZ(i)); bp.setY(i, bp.getY(i) - Math.pow(r/brimR, 2)*0.03); }
        brimGeo.computeVertexNormals();
        part(hatGroup, brimGeo, toon('#ffffff', { map: l100Tex('brim') }), { outline:0.012 });
        part(hatGroup, new THREE.TorusGeometry(brimR*0.985, 0.016, 8, 72), toon(velvet), { pos:[0,-0.03,0], rot:[Math.PI/2,0,0], outline:0.006 });
        const H = 0.66, r0 = 0.24;
        const cprof = [];
        for (let i=0;i<=14;i++){
          const t = i/14;
          const k = t < 0.78 ? (1 - 0.55*t) : (1 - 0.55*0.78)*Math.pow(Math.max(0, 1 - (t-0.78)/0.22), 0.8);
          cprof.push(new THREE.Vector2(Math.max(0.006, r0*k), t*H));
        }
        const coneGeo = new THREE.LatheGeometry(cprof, 48);
        const cpp = coneGeo.attributes.position;
        for (let i=0;i<cpp.count;i++){
          const t = cpp.getY(i)/H;
          cpp.setZ(i, cpp.getZ(i) + 0.17*Math.pow(t, 2.8));     // the tip flops over to one side
          cpp.setX(i, cpp.getX(i) + 0.27*Math.pow(t, 3.2));
          cpp.setY(i, cpp.getY(i) - 0.09*Math.pow(t, 3));
        }
        coneGeo.computeVertexNormals();
        part(hatGroup, coneGeo, toon('#ffffff', { map: l100Tex('cone', !isFemale) }), { pos:[0,0.075,0], outline:0.012 });   // sits on top of the band, so LEVEL 100 is never hidden
        part(hatGroup, new THREE.CylinderGeometry(r0*1.05, r0*1.1, 0.095, 48, 1, true), toon('#ffffff', { map: l100Tex('band', !isFemale), side:THREE.DoubleSide }), { pos:[0,0.048,0], outline:0.008 });
        part(hatGroup, new THREE.TorusGeometry(r0*1.06, 0.012, 8, 48), toon(lip), { pos:[0,0.096,0], rot:[Math.PI/2,0,0], outline:0.004 });
        part(hatGroup, new THREE.TorusGeometry(r0*1.1, 0.012, 8, 48), toon(lip), { pos:[0,0.004,0], rot:[Math.PI/2,0,0], outline:0.004 });
        root.userData.hat = hatGroup;
      } else if (cfg.hat){
        const hatColor = cfg.hat.color || '#4a2f6b', hatTrim = cfg.hat.trim || '#ffb347';
        const witch = cfg.hat.kind === 'witchHat';
        const hatGroup = new THREE.Group(); hatGroup.position.set(0, HEAD_R*0.62, 0.02); hatGroup.rotation.x = -0.12; headGroup.add(hatGroup);
        // wavy, drooping brim
        const brimR = witch ? 0.56 : 0.44;
        const brimGeo = new THREE.CylinderGeometry(brimR, brimR, 0.03, 64, 1);
        const bp = brimGeo.attributes.position;
        for (let i=0;i<bp.count;i++){
          const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x,z), a = Math.atan2(z,x);
          const f = Math.pow(r/brimR, 2);
          bp.setY(i, bp.getY(i) - f*(witch ? 0.07 : 0.035)*(0.7 + 0.3*Math.sin(a*3 + 0.6)));
        }
        brimGeo.computeVertexNormals();
        part(hatGroup, brimGeo, toon(hatColor), { outline:0.012 });
        // tall cone, bent back at the tip (classic crumpled witch hat)
        const H = witch ? 0.78 : 0.5, r0 = witch ? 0.235 : 0.22;
        const cprof = []; for (let i=0;i<=12;i++){ const t = i/12; cprof.push(new THREE.Vector2(Math.max(0.006, r0*(1-t)*(1-0.12*Math.sin(t*Math.PI*3))), t*H)); }
        const coneGeo = new THREE.LatheGeometry(cprof, 32);
        const cpp = coneGeo.attributes.position;
        for (let i=0;i<cpp.count;i++){
          const t = cpp.getY(i)/H;
          cpp.setZ(i, cpp.getZ(i) + (witch ? 0.34 : 0.12)*Math.pow(t, 2.4));
          cpp.setX(i, cpp.getX(i) + (witch ? 0.10 : 0.03)*Math.pow(t, 3));
          cpp.setY(i, cpp.getY(i) - (witch ? 0.12 : 0.03)*Math.pow(t, 3));
        }
        coneGeo.computeVertexNormals();
        part(hatGroup, coneGeo, toon('#ffffff', { map: makeHatTexture(hatColor, hatTrim) }), { outline:0.012 });
        part(hatGroup, new THREE.CylinderGeometry(r0*1.0, r0*1.03, 0.07, 32, 1, true), toon(hatTrim, { side:THREE.DoubleSide }), { pos:[0,0.045,0], outline:0.008 });
        part(hatGroup, new THREE.BoxGeometry(0.07, 0.06, 0.02), buckleMat, { pos:[0,0.045,-r0-0.01], outline:0.004 });
        if (witch){ const hb = makeBat(0.09); hb.position.set(0.3, 0.03, -0.2); hb.rotation.set(0.2, 0.6, 0.15); hatGroup.add(hb); root.userData.hatBat = hb; }
        root.userData.hat = hatGroup;
        tryLoadRealModel(cfg.hat, headGroup);
      }

      // ---- Staff: gnarled wood with a hanging jack-o'-lantern (right hand = +X) ----
      if (cfg.accessory && cfg.accessory.kind === 'staff'){
        const staff = new THREE.Group(); staff.position.set(0.36, 0, -0.05); body.add(staff);
        const pts = [ [0,0.02],[0.012,0.35],[-0.01,0.7],[0.01,1.05],[-0.008,1.35],[0.02,1.6],[0.09,1.72],[0.17,1.7],[0.2,1.62] ].map(([x,y])=> new THREE.Vector3(x,y,0));
        const curve = new THREE.CatmullRomCurve3(pts);
        part(staff, new THREE.TubeGeometry(curve, 48, 0.024, 8, false), toon(cfg.accessory.color || '#6b4a2f'), { outline:0.008 });
        [0.5, 0.95, 1.3].forEach(y=> part(staff, new THREE.SphereGeometry(0.032, 8, 6), toon('#5a3d24'), { pos:[0.005, y, 0], outline:0.005 }));
        const hang = new THREE.Group(); hang.position.set(0.2, 1.62, 0); staff.add(hang);
        part(hang, new THREE.CylinderGeometry(0.005, 0.005, 0.12, 4), toon('#3a3a3a'), { pos:[0,-0.06,0], outline:0 });
        const orbCol = cfg.accessory.orb || '#ff8a3d';
        const warm = orbCol === '#ff8a3d';
        const lantern = makeJackOLantern(0.13, warm ? '#ffd76a' : '#d6ffcf');
        lantern.position.y = -0.25; hang.add(lantern);
        // soft halo of candle-light around it (camera-facing, additive) — the lit-lantern
        // glow from the reference art
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map:getLanternHaloTexture(), color: warm ? 0xff8a30 : 0x8affb0,
          transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0.6 }));
        halo.scale.set(0.8, 0.8, 1); halo.position.y = -0.25; hang.add(halo);
        // (No real point light here on purpose: MeshToonMaterial looks lights up through
        // a ramp with a lifted floor, so a light *inside* the lantern lit its own shell
        // from point-blank range and blew it out to yellow. The halo sells the glow.)
        root.userData.lanternHalo = halo;
        root.userData.lanternHang = hang;
        rightArm.rotation.z = 0.55;   // right hand reaches out to the staff
      }

      // ---- Candy basket in the left hand (-X) ----
      const basket = makeBasket();
      basket.position.set(0, -0.48, 0.02); leftArm.add(basket);
      leftArm.rotation.z = -0.38;

      // ---- Male look keeps its little shoulder cat from its own reference sheet ----
      if (!isFemale){
        const cat = makeCatCompanion(cfg.hat && cfg.hat.color); cat.scale.setScalar(1.6);
        // in the Level 100 tee the cat sits a little forward so its tail doesn't cover LEVEL 100 on the back
        cat.position.set(-0.27, SHOULDER_Y+0.02, isTee ? -0.11 : 0.0); cat.rotation.y = isTee ? 0.9 : 0.25; body.add(cat);
      }
      // His sheet is the mirror image of hers (staff in the left hand, cat on the right
      // shoulder) — mirror the whole figure rather than duplicating every placement.
      if (!isFemale) body.scale.x = -1;

      tryLoadRealModel(cfg.top, root);
      root.userData.parts = { leftLeg, rightLeg, leftArm, rightArm, robe: coat, body, headGroup };
      root.userData.armRest = { l: leftArm.rotation.z, r: rightArm.rotation.z };
      return root;
    }

    function animatePlayerModel(group, t, walking){
      const p = group.userData.parts;
      if (!p) return;
      const ud = group.userData;
      const dt = Math.min(0.1, Math.max(0, t - (ud.lastT || t))); ud.lastT = t;
      // Facing: idle she turns to face the camera (the reference pose); walking she turns
      // away and heads "into" the map, the way a Pokémon-GO-style avatar walks.
      const target = walking ? 0 : Math.PI;
      if (ud.facing === undefined) ud.facing = target;
      ud.facing += (target - ud.facing) * Math.min(1, dt*6);
      p.body.rotation.y = ud.facing;
      const rest = ud.armRest || { l:0, r:0 };
      if (walking){
        const s = Math.sin(t*8.5);
        p.leftLeg.rotation.x = s*0.6; p.rightLeg.rotation.x = -s*0.6;
        p.leftArm.rotation.x = -s*0.35; p.rightArm.rotation.x = s*0.2;
        p.body.position.y = Math.abs(Math.cos(t*8.5))*0.04;
        p.robe.rotation.z = s*0.03;
        p.headGroup.rotation.z = s*0.03;
        p.headGroup.position.y = HEAD_Y;
      } else {
        p.leftLeg.rotation.x = 0; p.rightLeg.rotation.x = 0;
        const b = Math.sin(t*1.8);
        p.leftArm.rotation.x = b*0.04; p.rightArm.rotation.x = -b*0.03;
        p.robe.scale.set(1 - b*0.006, 1 + b*0.01, 1 - b*0.006);
        p.body.position.y = 0;
        p.headGroup.rotation.z = Math.sin(t*0.9)*0.04;
        p.headGroup.position.y = HEAD_Y + b*0.006;
      }
      p.leftArm.rotation.z = rest.l; p.rightArm.rotation.z = rest.r;
      if (ud.hat) ud.hat.rotation.z = Math.sin(t*1.3)*0.04;
      if (ud.lanternHang){ ud.lanternHang.rotation.z = Math.sin(t*(walking?6:1.6))*(walking?0.3:0.12); ud.lanternHang.rotation.x = Math.sin(t*1.1)*0.06; }
      const flicker = Math.sin(t*9)*0.5 + Math.sin(t*23)*0.3;
      if (ud.lanternHalo) ud.lanternHalo.material.opacity = 0.55 + flicker*0.07;
      if (ud.hatBat && ud.hatBat.userData.wings){ const f = Math.sin(t*3)*0.25; ud.hatBat.userData.wings[0].rotation.y = f; ud.hatBat.userData.wings[1].rotation.y = Math.PI - f; }
    }

    // Shared lighting rig for every view of the player (map marker + wardrobe preview):
    // warm key light casting a real soft shadow onto a catcher plane, a front fill, a
    // cool rim from behind for the painted-edge glow, and a sky/ground fill. The rig is
    // returned so each view can turn it with its camera — the map world spins under the
    // player when you orbit, so studio-style lighting that follows the camera keeps her
    // lit from the viewer's side at every angle instead of going dark from behind.
    function addPlayerLighting(scene){
      scene.add(new THREE.HemisphereLight(0xfff0dc, 0x3a2a55, 1.15));
      const rig = new THREE.Group(); scene.add(rig);
      const key = new THREE.DirectionalLight(0xffe2b8, 1.45);
      key.position.set(1.5, 3.8, 2.4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -1.4; key.shadow.camera.right = 1.4; key.shadow.camera.top = 2.8; key.shadow.camera.bottom = -0.6;
      key.shadow.camera.near = 0.5; key.shadow.camera.far = 9;
      key.shadow.bias = -0.0015; key.shadow.radius = 4;
      rig.add(key);
      const fill = new THREE.DirectionalLight(0xfff5e8, 0.5); fill.position.set(-1.2, 1.6, 3); rig.add(fill);
      const rim = new THREE.DirectionalLight(0xb7a2ff, 0.9); rim.position.set(-2.2, 2.4, -3); rig.add(rim);
      const catcher = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity:0.38 }));
      catcher.rotation.x = -Math.PI/2; catcher.receiveShadow = true; scene.add(catcher);
      // contact shadow right under the feet: a wide soft blob plus a tighter dark core,
      // which is what reads as "standing ON the ground" at a glance
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32),
        new THREE.MeshBasicMaterial({ map:getGroundShadowTexture(), transparent:true, depthWrite:false, opacity:0.95 }));
      blob.rotation.x = -Math.PI/2; blob.position.y = 0.004; blob.scale.set(1.35, 1.0, 1); scene.add(blob);
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32),
        new THREE.MeshBasicMaterial({ map:getGroundShadowTexture(), transparent:true, depthWrite:false, opacity:0.9 }));
      core.rotation.x = -Math.PI/2; core.position.y = 0.006; core.scale.set(1.5, 0.9, 1); scene.add(core);
      return rig;
    }
    function setupPlayerRenderer(renderer){
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    // Disposes a model's per-build GPU objects while leaving the shared cached ones
    // (outline materials, toon ramp, canvas textures) alone for the next rebuild.
    function disposePlayerModel(group){
      const shared = new Set(Object.values(outlineMatCache));
      group.traverse(o=>{
        if (o.geometry) o.geometry.dispose();
        if (o.material && !shared.has(o.material)) o.material.dispose();
      });
    }

    // (v1 capsule model removed — see the v37 PLAYER MODEL section above.)

    // ---------------- Per-canvas 3D viewport ----------------
    // A soft blob shadow drawn INTO the 3D scene itself, right under the feet, rather than
    // relying only on the separate CSS .player-shadow ellipse below the canvas — a second,
    // closer visual anchor that she's standing on something, not floating in the canvas.
    let groundShadowTex = null;
    function getGroundShadowTexture(){
      if (groundShadowTex) return groundShadowTex;
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64,64,4, 64,64,62);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      groundShadowTex = new THREE.CanvasTexture(c);
      return groundShadowTex;
    }

    // Camera framing shared by the map marker and the wardrobe preview: a slightly
    // elevated three-quarter "game camera" looking at the figure's middle. FRAME_FEET_PX
    // is how far above the canvas bottom the feet land, which the CSS uses to plant
    // them exactly on the player's ground ring (see .player-avatar.is-3d).
    const PLAYER_CANVAS_W = 138, PLAYER_CANVAS_H = 192, FRAME_FEET_PX = 13;
    const FRAME_FOV = 28, FRAME_ELEV = THREE.MathUtils.degToRad(15);
    const FRAME_VIEW_H = 2.86;   // world units visible top-to-bottom
    function placePlayerCamera(camera, orbitRad, viewH, feetPx, canvasH){
      const d = viewH / (2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2));
      // look-at height chosen so y=0 sits feetPx above the bottom edge
      const unitsPerPx = viewH / canvasH;
      const lookY = viewH/2 - feetPx*unitsPerPx;
      camera.position.set(Math.sin(orbitRad)*d*Math.cos(FRAME_ELEV), lookY + d*Math.sin(FRAME_ELEV), Math.cos(orbitRad)*d*Math.cos(FRAME_ELEV));
      camera.lookAt(0, lookY, 0);
    }

    function initPlayer3D(canvas, gender){
      const scene = new THREE.Scene();
      const rig = addPlayerLighting(scene);

      const camera = new THREE.PerspectiveCamera(FRAME_FOV, PLAYER_CANVAS_W/PLAYER_CANVAS_H, 0.1, 30);
      const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
      setupPlayerRenderer(renderer);
      // Fixed intended size (matches the .player-avatar-3d CSS) rather than measuring
      // layout — this marker never resizes, and reading clientWidth/Height here would
      // return 0 if mounted before the game screen is the active one on screen.
      renderer.setSize(PLAYER_CANVAS_W, PLAYER_CANVAS_H, false);

      let group = buildPlayerModel(gender);
      scene.add(group);

      let stopped = false;
      function frame(){
        if (stopped) return;
        requestAnimationFrame(frame);
        // Only spend GPU time while the game/map screen is actually the one showing (not
        // under a battle or a full-screen panel).
        const gameScreen = document.querySelector('.screen[data-screen="game"]');
        if (!gameScreen || !gameScreen.classList.contains('active')) return;
        if (document.querySelector('#battle-screen.active, .panel-screen.active')) return;
        const gs = window.__gameState;
        const orbitDeg = (gs && typeof gs.viewOrbit==='number') ? gs.viewOrbit : 0;
        const rad = THREE.MathUtils.degToRad(orbitDeg);
        placePlayerCamera(camera, rad, FRAME_VIEW_H, FRAME_FEET_PX, PLAYER_CANVAS_H);
        rig.rotation.y = rad;   // studio lighting follows the camera around her
        const walking = canvas.parentElement ? canvas.parentElement.classList.contains('walking') : false;
        animatePlayerModel(group, performance.now()/1000, walking);
        renderer.render(scene, camera);
      }
      requestAnimationFrame(frame);

      return {
        setGender(g){
          scene.remove(group);
          disposePlayerModel(group);
          group = buildPlayerModel(g);
          scene.add(group);
        },
        dispose(){ stopped = true; disposePlayerModel(group); renderer.dispose(); }
      };
    }

    // ---------------- Wardrobe screen's own live preview ----------------
    // A separate, bigger viewport with its own drag-to-orbit (independent of the map's
    // state.viewOrbit) for the Character Styling screen — reuses buildPlayerModel/
    // animatePlayerModel/getGroundShadowTexture rather than duplicating the model itself,
    // but keeps its own scene/camera/render-loop since it has different sizing and input
    // needs than the tiny fixed HUD marker in initPlayer3D() below.
    function initWardrobePreview3D(canvas, gender){
      const scene = new THREE.Scene();
      const rig = addPlayerLighting(scene);

      const camera = new THREE.PerspectiveCamera(FRAME_FOV, 1, 0.1, 30);
      const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
      setupPlayerRenderer(renderer);
      let ch = 260;
      function resize(){
        const w = canvas.clientWidth || 200, h = canvas.clientHeight || 260;
        ch = h;
        renderer.setSize(w, h, false);
        camera.aspect = w/h; camera.updateProjectionMatrix();
      }
      resize();
      window.addEventListener('resize', resize);

      let group = buildPlayerModel(gender);
      scene.add(group);

      // Starts at a 3/4 angle (not dead-on front) so the silhouette reads as 3D the
      // instant the panel opens, and auto-spins gently whenever the player isn't actively
      // dragging — the live-rotating preview the brief asked for, without needing the
      // player to discover the drag gesture first.
      let orbitDeg = 20, dragging = false, lastX = 0;   // idle pose faces +Z, so ~0° = front
      // Front / Back buttons glide the camera round; Spin turns slowly on its own; dragging
      // takes over. Close-ups frame the slot you're dressing (head, torso, legs, feet).
      let autoSpin = true, targetOrbit = null, focus = 'full', curH = 3.0, curCy = null;
      const FOCUS = { full:{ h:3.0, cy:null }, head:{ h:1.5, cy:1.85 }, torso:{ h:1.25, cy:0.86 }, legs:{ h:1.1, cy:0.42 }, feet:{ h:0.8, cy:0.22 } };
      canvas.addEventListener('pointerdown', e=>{ dragging = true; autoSpin = false; targetOrbit = null; lastX = e.clientX; try{canvas.setPointerCapture(e.pointerId);}catch(err){} });
      canvas.addEventListener('pointermove', e=>{ if (!dragging) return; orbitDeg += (e.clientX-lastX)*0.6; lastX = e.clientX; });
      window.addEventListener('pointerup', ()=>{ dragging = false; });
      canvas.addEventListener('pointercancel', ()=>{ dragging = false; });

      let stopped = false;
      function frame(){
        if (stopped) return;
        requestAnimationFrame(frame);
        if (targetOrbit != null){
          const d = ((targetOrbit - orbitDeg) % 360 + 540) % 360 - 180;
          orbitDeg += d*0.14; if (Math.abs(d) < 0.2) orbitDeg = targetOrbit;
        } else if (!dragging && autoSpin) orbitDeg += 0.3;
        const rad = THREE.MathUtils.degToRad(orbitDeg);
        const f = FOCUS[focus] || FOCUS.full;
        const wantCy = f.cy == null ? (3.0/2 - 20*(3.0/ch)) : f.cy;
        curH += (f.h - curH)*0.14; curCy = curCy == null ? wantCy : curCy + (wantCy - curCy)*0.14;
        const dist = curH / (2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2));
        camera.position.set(Math.sin(rad)*dist*Math.cos(FRAME_ELEV), curCy + dist*Math.sin(FRAME_ELEV), Math.cos(rad)*dist*Math.cos(FRAME_ELEV));
        camera.lookAt(0, curCy, 0);
        rig.rotation.y = rad;
        animatePlayerModel(group, performance.now()/1000, false);
        renderer.render(scene, camera);
      }
      requestAnimationFrame(frame);

      return {
        rebuild(g){
          scene.remove(group);
          disposePlayerModel(group);
          group = buildPlayerModel(g);
          scene.add(group);
        },
        setView(v){ if (v === 'spin'){ autoSpin = true; targetOrbit = null; } else { autoSpin = false; targetOrbit = v === 'back' ? 180 : 0; } },
        setFocus(name){ focus = FOCUS[name] ? name : 'full'; },
        getView(){ return { orbitDeg, focus }; },
        dispose(){ stopped = true; disposePlayerModel(group); renderer.dispose(); window.removeEventListener('resize', resize); }
      };
    }
    window.mountWardrobePreview3D = function(canvas, gender, overrides){
      if (!canvas) return;
      if (window.applyEquippedCosmetics) { try { window.applyEquippedCosmetics(overrides); } catch(e){} }
      if (canvas.__wardrobe3d) canvas.__wardrobe3d.dispose();
      canvas.__wardrobe3d = initWardrobePreview3D(canvas, gender==='male' ? 'male' : 'female');
      if (overrides && window.applyEquippedCosmetics) { try { window.applyEquippedCosmetics(); } catch(e){} }
    };
    // overrides = items being tried on (preview only — the map avatar keeps what's equipped)
    window.rebuildWardrobePreview3D = function(canvas, gender, overrides){
      if (!canvas) return;
      if (!canvas.__wardrobe3d){ window.mountWardrobePreview3D(canvas, gender, overrides); return; }
      if (window.applyEquippedCosmetics) { try { window.applyEquippedCosmetics(overrides); } catch(e){} }
      canvas.__wardrobe3d.rebuild(gender==='male' ? 'male' : 'female');
      if (overrides && window.applyEquippedCosmetics) { try { window.applyEquippedCosmetics(); } catch(e){} }
    };

    window.mountPlayer3D = function(gender){
      // Re-apply whatever's saved in state.equippedCosmetics on top of the catalog's own
      // per-gender defaults every time we (re)mount — covers both "classic script loaded
      // a profile before this module finished its async import" and "wardrobe screen just
      // changed an equip and wants the model rebuilt", with one call site either way.
      if (window.applyEquippedCosmetics) { try { window.applyEquippedCosmetics(); } catch(e){} }
      const holder = document.getElementById('player-avatar');
      if (!holder) return;
      const g = gender==='male' ? 'male' : 'female';
      if (holder.__player3d){ holder.__player3d.setGender(g); return; }
      holder.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.className = 'player-avatar-3d';
      holder.appendChild(canvas);
      holder.classList.add('is-3d');
      if (holder.parentElement) holder.parentElement.classList.add('has-3d');
      holder.__player3d = initPlayer3D(canvas, g);
    };

    // enterGame() may already have run by the time this module finished its async CDN
    // import — pick up whatever gender it stashed for us and mount right now.
    if (window.__pendingPlayer3DGender){
      window.mountPlayer3D(window.__pendingPlayer3DGender);
      window.__pendingPlayer3DGender = null;
    }
  } catch (err){
    console.warn('3D player avatar unavailable — staying on the 2D sprite marker.', err);
  }
})();

// ============================================================================
// PHASE 2 — 3D Totos on the overworld map (map only — battle's arena sprite is
// untouched).
// ----------------------------------------------------------------------------
// The classic game script above is wrapped in its own IIFE, so this layer only
// sees window.__gameState plus the live DOM it builds. It watches
// __gameState.wildTotos every frame and mounts/unmounts a 3D presence for each
// toto that's on the map — zero edits to the existing spawn/catch/prune logic.
//
// One shared full-viewport canvas + one ortho camera (not a canvas per toto:
// up to 38 can be alive and mobile browsers cap live WebGL contexts around
// 8-16). Every frame each toto's on-screen foot point and scale are read from
// its own (now invisible) DOM marker, so it rides the existing GPS/pan/zoom/
// tilt/orbit math for free.
//
// v37 presentation (matches the "creatures standing on ground rings" look):
//  - the creature stands UPRIGHT at its true proportions. The DOM marker lies
//    on the CSS-tilted ground plane, so its projected rect is squashed
//    vertically; only its WIDTH is used for scale, height comes from the art's
//    own aspect ratio (the old billboard stretched the art to the squashed
//    rect, which is what made creatures read as flat paintings).
//  - feet are planted on the marker's foot point (all sprites are now cut out
//    cleanly and bottom-aligned, see assets/totos), on a thin perspective-
//    correct ground ring (ellipse ratio measured from the tilt) with a soft
//    contact shadow, instead of the old floating tilted dais that was anchored
//    under the labels rather than under the creature.
//  - labels move to a small DOM overlay under the ring so the upright creature
//    never covers them, and taps on the drawn creature are hit-tested back to
//    the toto's own marker (same tryStartEncounter path as before).
// ============================================================================
(async () => {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return;
    const canvas = document.getElementById('toto3d-canvas');
    const mapView = document.getElementById('map-view');
    if (!canvas || !mapView) return;

    const THREE = await import('three');

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 0, 1, 1, 2000);
    camera.position.z = 1000;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));

    // Labels live in a plain DOM layer just above the canvas (crisp text, no texture
    // re-rendering) and below the fog vignette.
    let labelLayer = document.getElementById('toto3d-labels');
    if (!labelLayer){
      labelLayer = document.createElement('div');
      labelLayer.id = 'toto3d-labels';
      canvas.insertAdjacentElement('afterend', labelLayer);
    }

    let vw = 1, vh = 1;
    function resize(){
      const r = mapView.getBoundingClientRect();
      vw = Math.max(1, Math.round(r.width)); vh = Math.max(1, Math.round(r.height));
      renderer.setSize(vw, vh, false);
      camera.left = -vw/2; camera.right = vw/2; camera.top = vh/2; camera.bottom = -vh/2;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    // Ring colors: warm cream-gold for normal (like the reference), and the same
    // rarity hues the rest of the game already uses for the rarer tiers.
    const TIER_RING = { normal:'#f6dca4', legendary:'#ffc94d', mythical:'#ff5a5a', eternal:'#ff7ae0' };
    const SIZE = 1.45;           // creatures read a bit bigger than the old flat icons
    const PLANE_IMG_W = 34;      // .bubble img is 1em wide at 34px — ground-plane units

    const spriteTexCache = {};
    function getSpriteTexture(src){
      let tex = spriteTexCache[src];
      if (tex) return tex;
      tex = new THREE.TextureLoader().load(src);
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      spriteTexCache[src] = tex;
      return tex;
    }
    function radialTexture(stops){
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64,64,0, 64,64,64);
      stops.forEach(([o,col])=> g.addColorStop(o,col));
      ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      return new THREE.CanvasTexture(c);
    }
    const shadowTex = radialTexture([[0,'rgba(0,0,0,0.62)'],[0.55,'rgba(0,0,0,0.35)'],[1,'rgba(0,0,0,0)']]);
    const glowTex = radialTexture([[0,'rgba(255,255,255,0.55)'],[0.45,'rgba(255,255,255,0.18)'],[1,'rgba(255,255,255,0)']]);

    // Shared geometry — every toto is just a few transforms of these.
    const GEO_RING = new THREE.RingGeometry(0.9, 1.0, 64);
    const GEO_DISC = new THREE.CircleGeometry(1, 48);
    const GEO_SPRITE = new THREE.PlaneGeometry(1, 1); GEO_SPRITE.translate(0, 0.5, 0); // origin at the feet
    function mat(opts){ return new THREE.MeshBasicMaterial(Object.assign({ transparent:true, depthTest:false, depthWrite:false }, opts)); }

    // ---------------- Map prop art (SVG, drawn once into textures) ----------------
    // Every piece is authored with its ground line on the bottom edge of the viewBox so the
    // sprite's feet sit exactly on the map point. Halloween-village palette: cool slate
    // walls, dark shingled roofs, warm candle-lit windows.
    const PROP_ART = (function(){
      const O = '#1a1222';
      const glowDefs = '<filter id="gl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>'
        + '<linearGradient id="wa" x1="0" x2="1"><stop offset="0" stop-color="#635b84"/><stop offset="1" stop-color="#3e3759"/></linearGradient>'
        + '<linearGradient id="wb" x1="0" x2="1"><stop offset="0" stop-color="#7a5852"/><stop offset="1" stop-color="#4b3331"/></linearGradient>'
        + '<linearGradient id="wc" x1="0" x2="1"><stop offset="0" stop-color="#6d6a80"/><stop offset="1" stop-color="#47445c"/></linearGradient>'
        + '<linearGradient id="ra" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4c3d6b"/><stop offset="1" stop-color="#261d38"/></linearGradient>'
        + '<linearGradient id="rb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6e3a34"/><stop offset="1" stop-color="#3a1c1c"/></linearGradient>'
        + '<radialGradient id="wg"><stop offset="0" stop-color="#fff0a8"/><stop offset="0.55" stop-color="#ffc45a"/><stop offset="1" stop-color="#ff9026"/></radialGradient>';
      const svg = (w, h, body)=> '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="'+(w*2)+'" height="'+(h*2)+'"><defs>'+glowDefs+'</defs>'+body+'</svg>';
      // a lit window: blurred glow behind, warm pane, dark mullions
      const win = (x, y, w, h, arched)=> '<rect x="'+(x-4)+'" y="'+(y-4)+'" width="'+(w+8)+'" height="'+(h+8)+'" fill="#ff9a2a" opacity="0.75" filter="url(#gl)"/>'
        + (arched ? '<path d="M'+x+' '+(y+h)+' V'+(y+w/2)+' A'+(w/2)+' '+(w/2)+' 0 0 1 '+(x+w)+' '+(y+w/2)+' V'+(y+h)+' Z" fill="url(#wg)" stroke="'+O+'" stroke-width="3.5"/>'
                  : '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="2" fill="url(#wg)" stroke="'+O+'" stroke-width="3.5"/>')
        + '<path d="M'+(x+w/2)+' '+(y+2)+' V'+(y+h-1)+' M'+(x+1)+' '+(y+h*0.5)+' H'+(x+w-1)+'" stroke="'+O+'" stroke-width="2.5"/>';
      const darkWin = (x, y, w, h)=> '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="2" fill="#2a2338" stroke="'+O+'" stroke-width="3.5"/><path d="M'+(x+w/2)+' '+y+' V'+(y+h)+'" stroke="'+O+'" stroke-width="2"/>';
      // shingle rows clipped to a triangular roof (left eave, right eave, apex)
      const roofLines = (xl, xr, xa, ya, yb, step)=>{ let d=''; for (let y=ya+step; y<yb-3; y+=step){ const f=(y-ya)/(yb-ya); d+='M'+(xa-(xa-xl)*f+4).toFixed(1)+' '+y+' H'+(xa+(xr-xa)*f-4).toFixed(1)+' '; } return '<path d="'+d+'" stroke="#1a1222" stroke-opacity="0.38" stroke-width="2"/>'; };
      const pumpkin = (cx, cy, r)=> '<circle cx="'+cx+'" cy="'+cy+'" r="'+(r*1.6)+'" fill="#ff8a2a" opacity="0.55" filter="url(#gl)"/>'
        + '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+(r*1.15)+'" ry="'+r+'" fill="#f07a20" stroke="'+O+'" stroke-width="2.5"/>'
        + '<path d="M'+(cx-r*0.45)+' '+(cy-r*0.15)+' l'+(r*0.2)+' '+(-r*0.3)+' l'+(r*0.2)+' '+(r*0.3)+'Z M'+(cx+r*0.05)+' '+(cy-r*0.15)+' l'+(r*0.2)+' '+(-r*0.3)+' l'+(r*0.2)+' '+(r*0.3)+'Z M'+(cx-r*0.55)+' '+(cy+r*0.25)+' Q'+cx+' '+(cy+r*0.75)+' '+(cx+r*0.55)+' '+(cy+r*0.25)+' Q'+cx+' '+(cy+r*0.45)+' '+(cx-r*0.55)+' '+(cy+r*0.25)+'Z" fill="#ffe27a"/>'
        + '<rect x="'+(cx-2)+'" y="'+(cy-r-5)+'" width="4" height="7" fill="#3f6b2a"/>';
      const stoneBase = (x0, x1, y)=> '<rect x="'+x0+'" y="'+(y-10)+'" width="'+(x1-x0)+'" height="10" fill="#3a3346" stroke="'+O+'" stroke-width="3"/>';

      const A = {};
      // --- cosy cottage ---
      A.house1 = { w:200, h:200, svg: svg(200,200,
          '<rect x="128" y="34" width="18" height="46" fill="#3b3249" stroke="'+O+'" stroke-width="4"/><rect x="124" y="30" width="26" height="8" fill="#2c2438" stroke="'+O+'" stroke-width="3"/>'
        + '<path d="M44 104 H156 V196 H44 Z" fill="url(#wa)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + '<path d="M22 114 L100 28 L178 114 Z" fill="url(#ra)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + roofLines(22, 178, 100, 28, 114, 13)
        + '<path d="M22 114 L100 28 L178 114" fill="none" stroke="#6a5a8a" stroke-width="2" stroke-opacity="0.6"/>'
        + win(88, 70, 24, 24, true)
        + win(56, 124, 30, 30)
        + '<path d="M112 196 V150 Q126 134 140 150 V196 Z" fill="#3d2416" stroke="'+O+'" stroke-width="4"/><circle cx="134" cy="174" r="2.6" fill="#ffb347"/>'
        + stoneBase(44,156,196)
        + pumpkin(102, 186, 9) )};
      // --- two-storey gabled house with porch ---
      A.house2 = { w:200, h:220, svg: svg(200,220,
          '<path d="M46 84 H154 V216 H46 Z" fill="url(#wc)" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M30 92 L100 22 L170 92 Z" fill="url(#rb)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + roofLines(30, 170, 100, 22, 92, 12)
        + win(88, 50, 24, 26, true)
        + win(58, 104, 26, 28) + darkWin(116, 104, 26, 28)
        + '<path d="M38 160 L100 140 L162 160 Z" fill="#2c2438" stroke="'+O+'" stroke-width="4" stroke-linejoin="round"/>'
        + '<path d="M48 160 V206 M152 160 V206" stroke="#e8dcc8" stroke-width="4"/>'
        + win(60, 170, 22, 24)
        + '<rect x="88" y="166" width="26" height="40" rx="3" fill="#3d2416" stroke="'+O+'" stroke-width="4"/><circle cx="108" cy="188" r="2.4" fill="#ffb347"/>'
        + '<rect x="126" y="170" width="20" height="22" fill="#2a2338" stroke="'+O+'" stroke-width="3"/>'
        + stoneBase(40,160,216)
        + pumpkin(74, 206, 8) + pumpkin(130, 207, 7) )};
      // --- crooked witch cottage ---
      A.house3 = { w:200, h:210, svg: svg(200,210,
          '<path d="M52 108 Q48 160 50 206 H152 Q156 160 150 108 Z" fill="url(#wb)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + '<path d="M60 130 q8 -6 16 0 M90 120 q8 -6 16 0 M120 136 q8 -6 16 0 M70 170 q8 -6 16 0 M112 182 q8 -6 16 0" stroke="#2e1d1c" stroke-width="2.5" fill="none" opacity="0.6"/>'
        + '<path d="M28 118 Q70 92 92 40 Q100 18 128 10 Q112 30 116 52 Q140 92 176 116 Z" fill="url(#ra)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + '<path d="M60 102 Q86 80 98 54 M120 70 Q140 96 160 110" stroke="#6a5a8a" stroke-width="2" fill="none" opacity="0.7"/>'
        + '<circle cx="128" cy="11" r="5" fill="#ffd27a" stroke="'+O+'" stroke-width="2.5"/>'
        + '<circle cx="78" cy="146" r="17" fill="#ff9a2a" opacity="0.75" filter="url(#gl)"/><circle cx="78" cy="146" r="14" fill="url(#wg)" stroke="'+O+'" stroke-width="4"/><path d="M78 133 V159 M65 146 H91" stroke="'+O+'" stroke-width="2.5"/>'
        + '<path d="M110 206 V162 Q122 146 136 160 L138 206 Z" fill="#2f1c12" stroke="'+O+'" stroke-width="4"/><circle cx="130" cy="184" r="2.4" fill="#ffb347"/>'
        + '<path d="M50 206 Q60 196 70 206 M140 206 Q148 198 154 206" fill="#3f6b3a" stroke="'+O+'" stroke-width="2"/>'
        + pumpkin(96, 198, 8) )};
      // --- haunted manor with twin towers ---
      A.manor = { w:260, h:240, svg: svg(260,240,
          '<path d="M24 110 H74 V236 H24 Z M186 110 H236 V236 H186 Z" fill="url(#wc)" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M16 116 L49 30 L82 116 Z M178 116 L211 30 L244 116 Z" fill="url(#ra)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + '<path d="M49 30 V14 M211 30 V14" stroke="'+O+'" stroke-width="3"/><path d="M49 14 l10 4 l-10 4 Z M211 14 l10 4 l-10 4 Z" fill="#ff8a2a" stroke="'+O+'" stroke-width="1.5"/>'
        + '<path d="M70 104 H190 V236 H70 Z" fill="url(#wa)" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M60 110 L130 50 L200 110 Z" fill="url(#ra)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + roofLines(60, 200, 130, 50, 110, 11)
        + win(118, 70, 24, 26, true)
        + win(36, 130, 26, 30, true) + darkWin(198, 132, 26, 28) + win(198, 180, 26, 28, true) + darkWin(36, 182, 26, 28)
        + win(84, 124, 24, 28) + darkWin(152, 124, 24, 28)
        + '<path d="M112 236 V184 Q130 164 148 184 V236 Z" fill="#3d2416" stroke="'+O+'" stroke-width="4"/><path d="M130 172 V236" stroke="'+O+'" stroke-width="2.5"/>'
        + '<rect x="100" y="230" width="60" height="8" fill="#3a3346" stroke="'+O+'" stroke-width="3"/>'
        + stoneBase(18,242,240)
        + pumpkin(96, 228, 8) + pumpkin(166, 229, 7) )};
      // --- shop / commercial block with an awning ---
      A.shop = { w:260, h:190, svg: svg(260,190,
          '<path d="M14 40 H246 V186 H14 Z" fill="url(#wb)" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M8 30 H252 V44 H8 Z" fill="#2c2438" stroke="'+O+'" stroke-width="4"/>'
        + '<rect x="70" y="50" width="120" height="22" rx="4" fill="#2a1f33" stroke="'+O+'" stroke-width="3"/><path d="M84 61 H176" stroke="#ffb347" stroke-width="4" stroke-dasharray="10 5"/>'
        + win(28, 52, 30, 26) + win(202, 52, 30, 26)
        + '<path d="M20 98 H240 L232 120 H28 Z" fill="#ff8a2a" stroke="'+O+'" stroke-width="4" stroke-linejoin="round"/>'
        + '<path d="M48 98 L44 120 M76 98 L72 120 M104 98 L100 120 M132 98 L132 120 M160 98 L162 120 M188 98 L192 120 M216 98 L220 120" stroke="#5a2a7a" stroke-width="10"/>'
        + win(30, 128, 80, 46) + win(150, 128, 80, 46)
        + '<rect x="114" y="128" width="32" height="58" rx="2" fill="#3d2416" stroke="'+O+'" stroke-width="4"/>'
        + stoneBase(10,250,190)
        + pumpkin(70, 182, 7) + pumpkin(192, 182, 7) )};
      // --- school / town hall ---
      A.hall = { w:280, h:210, svg: svg(280,210,
          '<path d="M20 80 H260 V206 H20 Z" fill="url(#wc)" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M70 82 L140 26 L210 82 Z" fill="url(#ra)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + '<circle cx="140" cy="60" r="13" fill="#f2e6c8" stroke="'+O+'" stroke-width="3.5"/><path d="M140 60 V50 M140 60 L147 64" stroke="'+O+'" stroke-width="2.5"/>'
        + '<path d="M12 80 H268 V92 H12 Z" fill="#2c2438" stroke="'+O+'" stroke-width="4"/>'
        + win(34, 104, 26, 30) + darkWin(70, 104, 26, 30) + win(184, 104, 26, 30) + win(220, 104, 26, 30)
        + win(34, 152, 26, 30) + win(70, 152, 26, 30) + darkWin(184, 152, 26, 30) + win(220, 152, 26, 30)
        + '<path d="M108 98 V206 M124 98 V206 M156 98 V206 M172 98 V206" stroke="#e8dcc8" stroke-width="7"/>'
        + '<path d="M128 206 V160 Q140 148 152 160 V206 Z" fill="#3d2416" stroke="'+O+'" stroke-width="4"/>'
        + stoneBase(14,266,210) )};
      // --- chapel with steeple ---
      A.church = { w:200, h:270, svg: svg(200,270,
          '<path d="M40 150 H160 V266 H40 Z" fill="url(#wc)" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M28 158 L100 104 L172 158 Z" fill="url(#ra)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + '<path d="M80 110 H120 V170 H80 Z" fill="url(#wc)" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M72 114 L100 30 L128 114 Z" fill="url(#ra)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + '<path d="M100 30 V8 M92 16 H108" stroke="#d8c08a" stroke-width="4" stroke-linecap="round"/>'
        + win(90, 124, 20, 24, true)
        + '<circle cx="100" cy="188" r="18" fill="#ff9a2a" opacity="0.8" filter="url(#gl)"/><circle cx="100" cy="188" r="15" fill="url(#wg)" stroke="'+O+'" stroke-width="4"/><path d="M100 173 V203 M85 188 H115 M89 177 L111 199 M111 177 L89 199" stroke="'+O+'" stroke-width="2"/>'
        + win(52, 186, 18, 34, true) + win(130, 186, 18, 34, true)
        + '<path d="M86 266 V226 Q100 210 114 226 V266 Z" fill="#3d2416" stroke="'+O+'" stroke-width="4"/>'
        + stoneBase(34,166,270) )};
      // --- apartment block ---
      A.apartment = (function(){
        let b = '<path d="M30 30 H170 V266 H30 Z" fill="url(#wa)" stroke="'+O+'" stroke-width="5"/><path d="M24 22 H176 V34 H24 Z" fill="#2c2438" stroke="'+O+'" stroke-width="4"/>'
          + '<rect x="120" y="4" width="30" height="20" fill="#3b3249" stroke="'+O+'" stroke-width="3"/><path d="M124 4 V-2 M146 4 V-2" stroke="'+O+'" stroke-width="3"/>';
        const lit = [1,0,1,1, 0,1,1,0, 1,1,0,1, 0,1,1,1];
        for (let r=0;r<4;r++) for (let c=0;c<4;c++){
          const x = 42+c*32, y = 46+r*44, k = lit[r*4+c];
          b += k ? win(x, y, 22, 30) : darkWin(x, y, 22, 30);
        }
        b += '<rect x="84" y="226" width="32" height="40" rx="2" fill="#3d2416" stroke="'+O+'" stroke-width="4"/>' + stoneBase(24,176,270);
        return { w:200, h:270, svg: svg(200,270,b) };
      })();
      // --- garden shed ---
      A.shed = { w:140, h:120, svg: svg(140,120,
          '<path d="M24 50 H116 V116 H24 Z" fill="url(#wb)" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M38 54 V116 M54 54 V116 M86 54 V116 M102 54 V116" stroke="#2e1d1c" stroke-width="2" opacity="0.5"/>'
        + '<path d="M12 56 L70 18 L128 56 Z" fill="url(#ra)" stroke="'+O+'" stroke-width="5" stroke-linejoin="round"/>'
        + '<rect x="56" y="70" width="28" height="46" fill="#3d2416" stroke="'+O+'" stroke-width="4"/><path d="M56 70 L84 116 M84 70 L56 116" stroke="'+O+'" stroke-width="2.5"/>' )};
      // --- spooky oak (dark teal canopy) ---
      A.tree = { w:180, h:210, svg: svg(180,210,
          '<path d="M80 206 Q84 160 74 128 Q60 112 46 104 M96 206 Q92 164 104 130 Q118 116 134 108 M86 206 V120" stroke="'+O+'" stroke-width="22" stroke-linecap="round" fill="none"/>'
        + '<path d="M80 206 Q84 160 74 128 Q60 112 46 104 M96 206 Q92 164 104 130 Q118 116 134 108 M86 206 V120" stroke="#4a3426" stroke-width="15" stroke-linecap="round" fill="none"/>'
        // outline pass first, fill pass on top: the four lobes merge into one canopy silhouette
        + '<g fill="'+O+'"><circle cx="54" cy="88" r="41"/><circle cx="126" cy="86" r="43"/><circle cx="90" cy="56" r="49"/><circle cx="92" cy="104" r="37"/></g>'
        + '<g><circle cx="54" cy="88" r="38" fill="#2c5446"/><circle cx="126" cy="86" r="40" fill="#2a5044"/><circle cx="92" cy="104" r="34" fill="#28493e"/><circle cx="90" cy="56" r="46" fill="#336052"/></g>'
        + '<g fill="#4b8068" opacity="0.8"><circle cx="76" cy="40" r="14"/><circle cx="110" cy="64" r="10"/><circle cx="44" cy="72" r="10"/><circle cx="130" cy="70" r="11"/></g>'
        + '<circle cx="66" cy="86" r="4" fill="#ffb347"/><circle cx="118" cy="100" r="3" fill="#ffb347"/>' )};
      // --- dead twisted tree ---
      A.deadtree = { w:180, h:210, svg: svg(180,210,
          '<g fill="none" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M90 206 Q84 160 92 120 Q98 90 86 60 M92 120 Q118 104 140 70 Q148 56 164 50 M88 150 Q60 130 40 96 Q34 82 18 76 M86 60 Q72 40 76 18 M140 70 Q132 48 138 30 M40 96 Q48 74 40 60" stroke="'+O+'" stroke-width="16"/>'
        + '<path d="M90 206 Q84 160 92 120 Q98 90 86 60 M92 120 Q118 104 140 70 Q148 56 164 50 M88 150 Q60 130 40 96 Q34 82 18 76 M86 60 Q72 40 76 18 M140 70 Q132 48 138 30 M40 96 Q48 74 40 60" stroke="#3e3046" stroke-width="9"/>'
        + '<path d="M90 206 Q84 160 92 120" stroke="#5a4866" stroke-width="3" opacity="0.6"/></g>'
        + '<path d="M120 92 q6 -10 12 0 q-6 4 -12 0Z" fill="#1a1222"/>' )};
      // --- dark pine ---
      A.pine = { w:120, h:210, svg: svg(120,210,
          '<rect x="52" y="168" width="16" height="40" fill="#4a3426" stroke="'+O+'" stroke-width="4"/>'
        + '<g stroke="'+O+'" stroke-width="5" stroke-linejoin="round"><path d="M10 176 L60 96 L110 176 Z" fill="#1f4034"/><path d="M18 134 L60 54 L102 134 Z" fill="#244a3c"/><path d="M28 92 L60 14 L92 92 Z" fill="#2b5646"/></g>'
        + '<path d="M60 18 L44 84 M60 58 L36 126 M60 100 L28 168" stroke="#4b8068" stroke-width="3" opacity="0.55"/>' )};
      // --- tombstone ---
      A.tomb = { w:90, h:110, svg: svg(90,110,
          '<path d="M16 106 V44 Q16 10 45 10 Q74 10 74 44 V106 Z" fill="#7a7488" stroke="'+O+'" stroke-width="5"/>'
        + '<path d="M22 100 V46 Q22 18 45 16" stroke="#a7a1b4" stroke-width="3" fill="none" opacity="0.7"/>'
        + '<path d="M45 30 V70 M33 42 H57" stroke="#3c3648" stroke-width="5" stroke-linecap="round"/>'
        + '<path d="M10 106 Q30 94 46 104 Q64 94 82 106 Z" fill="#3f6b3a" stroke="'+O+'" stroke-width="3"/>' )};
      // --- jack-o'-lantern ---
      A.pumpkin = { w:100, h:90, svg: svg(100,90,
          '<circle cx="50" cy="56" r="44" fill="#ff8a2a" opacity="0.5" filter="url(#gl)"/>'
        + '<g stroke="'+O+'" stroke-width="4"><ellipse cx="30" cy="58" rx="20" ry="28" fill="#e86e18"/><ellipse cx="70" cy="58" rx="20" ry="28" fill="#e86e18"/><ellipse cx="50" cy="56" rx="24" ry="31" fill="#f58223"/></g>'
        + '<path d="M50 26 Q48 14 56 8" stroke="#3f6b2a" stroke-width="6" fill="none" stroke-linecap="round"/>'
        + '<path d="M30 48 l8 -12 l8 12 Z M54 48 l8 -12 l8 12 Z M28 64 Q50 86 72 64 L64 66 L58 60 L50 68 L42 60 L36 66 Z" fill="#ffe27a" stroke="#ff9a2a" stroke-width="1"/>' )};
      return A;
    })();

    // Textures are built lazily per kind from the SVG above (rasterised by the browser at
    // 2x the viewBox, so they stay crisp when you zoom in). One shared material per kind.
    const propTex = {};
    // PumpkinStops are painted art (PNG), lit when you can spin and cooled-down purple after
    PROP_ART.pstop = { w:256, h:542, src:'assets/stops/stop.png' };
    PROP_ART.pstop_rest = { w:256, h:542, src:'assets/stops/stop-rest.png' };
    function getPropTex(kind){
      if (propTex[kind]) return propTex[kind];
      const art = PROP_ART[kind]; if (!art) return null;
      const rec = { mat:null, aspect: art.w/art.h };
      const img = new Image();
      img.onload = ()=>{
        const t = new THREE.Texture(img);
        if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4; t.needsUpdate = true;
        rec.mat = mat({ map:t });
      };
      img.src = art.src || ('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(art.svg));
      propTex[kind] = rec;
      return rec;
    }

    // ---- world-plane -> screen projection ----
    // The map is a flat plane run through several stacked CSS 3D transforms (tilt, pan,
    // rotate, zoom, perspective). Rather than re-deriving that chain, four invisible marker
    // points are parked on the plane around the player and their real on-screen positions
    // are read back each frame — a plane seen in perspective maps to the screen by a
    // homography, and four point pairs pin one down exactly. Every prop is then projected
    // with plain arithmetic (no per-prop layout reads), however many there are.
    const MK = 300;
    let markerBox = null, markerEls = [], markerCenter = null, Hm = null;
    function ensureMarkers(pos){
      const world = document.getElementById('world'); if (!world || !pos) return false;
      if (!markerBox || !markerBox.isConnected){
        markerBox = document.createElement('div'); markerBox.id = 'proj-markers';
        markerBox.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;';
        markerEls = [0,1,2,3].map(()=>{ const d = document.createElement('div'); d.style.cssText = 'position:absolute;width:2px;height:2px;margin:-1px 0 0 -1px;'; markerBox.appendChild(d); return d; });
        world.appendChild(markerBox); markerCenter = null;
      }
      if (!markerCenter || Math.hypot(pos.x-markerCenter.x, pos.y-markerCenter.y) > 120){
        markerCenter = { x:pos.x, y:pos.y };
        [[-1,-1],[1,-1],[1,1],[-1,1]].forEach((o,i)=>{ markerEls[i].style.left = (pos.x+o[0]*MK)+'px'; markerEls[i].style.top = (pos.y+o[1]*MK)+'px'; });
      }
      return true;
    }
    function solveHomography(src, dst){
      const A = [], b = [];
      for (let i=0;i<4;i++){
        const x=src[i][0], y=src[i][1], u=dst[i][0], v=dst[i][1];
        A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u);
        A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v);
      }
      for (let c=0;c<8;c++){
        let piv=c; for (let r=c+1;r<8;r++) if (Math.abs(A[r][c])>Math.abs(A[piv][c])) piv=r;
        if (Math.abs(A[piv][c])<1e-9) return null;
        if (piv!==c){ const ta=A[c]; A[c]=A[piv]; A[piv]=ta; const tb=b[c]; b[c]=b[piv]; b[piv]=tb; }
        for (let r=0;r<8;r++){ if (r===c) continue; const f=A[r][c]/A[c][c]; if (!f) continue; for (let k=c;k<8;k++) A[r][k]-=f*A[c][k]; b[r]-=f*b[c]; }
      }
      return b.map((v,i)=> v/A[i][i]);
    }
    const _hp = [0,0,0];
    function hmap(x, y){
      const X=(x-markerCenter.x)/MK, Y=(y-markerCenter.y)/MK;
      const w = Hm[6]*X + Hm[7]*Y + 1;
      _hp[0] = (Hm[0]*X + Hm[1]*Y + Hm[2])/w; _hp[1] = (Hm[3]*X + Hm[4]*Y + Hm[5])/w; _hp[2] = w;
      return _hp;
    }

    // ---- pooled prop meshes near the player ----
    const propMeshes = new Map();
    let propVer = -1, propSyncT = 0, propCenter = null;
    const PROP_RADIUS = 1400, PROP_CAP = 420;
    let propShadowMat = null;
    function syncProps(pos, now){
      const mp = window.__mapProps; if (!mp || !pos) return;
      const moved = !propCenter || Math.hypot(pos.x-propCenter.x, pos.y-propCenter.y) > 80;
      if (mp.version===propVer && !moved && now-propSyncT < 3) return;
      propVer = mp.version; propSyncT = now; propCenter = { x:pos.x, y:pos.y };
      const R2 = PROP_RADIUS*PROP_RADIUS;
      let cand = [];
      mp.groups.forEach((list, gk)=> list.forEach((pr, i)=>{ const dx=pr.x-pos.x, dy=pr.y-pos.y, d2=dx*dx+dy*dy; if (d2<R2) cand.push([gk+'#'+i, pr, d2]); }));
      if (cand.length > PROP_CAP){ cand.sort((a,b)=>a[2]-b[2]); cand = cand.slice(0, PROP_CAP); }
      const want = new Map(cand.map(c=>[c[0], c[1]]));
      propMeshes.forEach((m,k)=>{ if (want.get(k)!==m.p){ scene.remove(m.group); propMeshes.delete(k); } });
      if (!propShadowMat) propShadowMat = mat({ map:shadowTex, opacity:0.85 });
      want.forEach((pr,k)=>{
        if (propMeshes.has(k)) return;
        const rec = getPropTex(pr.stop && (window.__stopRestingUntil||0) > Date.now() ? 'pstop_rest' : pr.kind); if (!rec) return;
        const group = new THREE.Group();
        const shadow = new THREE.Mesh(GEO_DISC, propShadowMat);
        const sprite = new THREE.Mesh(GEO_SPRITE, rec.mat || propShadowMat);
        sprite.visible = !!rec.mat;
        group.add(shadow, sprite); scene.add(group);
        propMeshes.set(k, { group, shadow, sprite, rec, p:pr, sway:(pr.seed%1000)/1000*Math.PI*2 });
      });
    }
    function updateProps(now){
      const stopsResting = (window.__stopRestingUntil||0) > Date.now();
      propMeshes.forEach(m=>{
        const pr = m.p;
        if (pr.stop){
          const want = getPropTex(stopsResting ? 'pstop_rest' : 'pstop');
          if (want && want.mat && m.rec !== want){ m.rec = want; m.sprite.material = want.mat; }
        }
        const q = hmap(pr.x, pr.y); const sx = q[0], sy = q[1], w = q[2];
        if (w <= 0.05 || sx < -260 || sx > vw+260 || sy < -60 || sy > vh+420){ m.group.visible = false; m.hit = null; return; }
        const qx = hmap(pr.x+1, pr.y); const ax = qx[0]-sx, ay = qx[1]-sy;
        const qy = hmap(pr.x, pr.y+1); const bx = qy[0]-sx, by = qy[1]-sy;
        const T = ax*ax+ay*ay+bx*bx+by*by, D = ax*by-ay*bx, disc = Math.sqrt(Math.max(0, T*T-4*D*D));
        const sMax = Math.sqrt((T+disc)/2), sMin = Math.sqrt(Math.max(0,(T-disc)/2));
        const k = Math.max(0.22, Math.min(0.6, sMin/(sMax||1)));
        if (m.rec.mat && m.sprite.material !== m.rec.mat){ m.sprite.material = m.rec.mat; m.sprite.visible = true; }
        m.group.visible = true;
        const W = pr.w*sMax, H = W/m.rec.aspect;
        m.group.position.set(sx - vw/2, vh/2 - sy, 0);
        m.sprite.scale.set(W, H, 1);
        // trees sway a touch in the night breeze; buildings stay put
        m.sprite.rotation.z = (pr.kind==='tree'||pr.kind==='pine'||pr.kind==='deadtree') ? Math.sin(now*0.9+m.sway)*0.018 : 0;
        m.shadow.scale.set(W*0.56, W*0.56*k, 1);
        if (pr.stop) m.hit = { x0:sx - W*0.46, x1:sx + W*0.46, y0:sy - H*0.97, y1:sy + 8, depth:sy };
        const order = Math.round(sy)*6;
        m.shadow.renderOrder = order; m.sprite.renderOrder = order+3;
      });
    }

    const mounts = new Map(); // toto id -> mount record

    function tryMountToto(t){
      const bubbleEl = t._node.querySelector('.bubble');
      const img = bubbleEl && bubbleEl.querySelector('img.creature-img');
      if (!bubbleEl || !img) return null; // no art to borrow — leave the 2D marker alone
      const ringCol = TIER_RING[t.tier] || TIER_RING.normal;
      const group = new THREE.Group();
      const fill = new THREE.Mesh(GEO_DISC, mat({ color:ringCol, opacity:0.10 }));
      const ring = new THREE.Mesh(GEO_RING, mat({ color:ringCol, opacity:0.85 }));
      const shadow = new THREE.Mesh(GEO_DISC, mat({ map:shadowTex }));
      let glow = null;
      if (t.tier && t.tier !== 'normal'){
        glow = new THREE.Mesh(GEO_SPRITE, mat({ map:glowTex, color:ringCol, blending:THREE.AdditiveBlending, opacity:0.9 }));
        group.add(glow);
      }
      const sprite = new THREE.Mesh(GEO_SPRITE, mat({ map:getSpriteTexture(img.src) }));
      group.add(fill, ring, shadow, sprite);
      scene.add(group);
      t._node.classList.add('is-3d-mounted');

      const label = document.createElement('div');
      label.className = 't3-label';
      label.innerHTML = '<span class="t3-pwr"></span><span class="t3-dist"></span>';
      labelLayer.appendChild(label);

      return { group, fill, ring, shadow, glow, sprite, bubbleEl, img, label,
               pwrEl: label.querySelector('.t3-pwr'), distEl: label.querySelector('.t3-dist'),
               lastSrc: img.src, lastPwr: null, lastDist: null,
               seed: Math.random()*Math.PI*2, hit: null };
    }

    function updateMount(t, m, now, canvasRect){
      if (m.img.src !== m.lastSrc){
        m.sprite.material.map = getSpriteTexture(m.img.src);
        m.sprite.material.needsUpdate = true;
        m.lastSrc = m.img.src;
      }
      const r = m.img.getBoundingClientRect();
      if (!r.width || !r.height){ m.group.visible = false; m.label.style.display = 'none'; m.hit = null; return; }
      const fx = r.left + r.width/2 - canvasRect.left;
      const fy = r.bottom - canvasRect.top;
      // Off-screen culling (with margin so creatures don't pop at the edges).
      if (fx < -120 || fx > vw+120 || fy < -40 || fy > vh+260){ m.group.visible = false; m.label.style.display = 'none'; m.hit = null; return; }
      m.group.visible = true;

      const s = r.width / PLANE_IMG_W;                                    // screen px per ground unit here
      // Ground foreshortening, measured from the tilt — capped so the ring always reads as
      // an ellipse lying on the ground (even at the map's flattest, near top-down zoom
      // levels) rather than a circle standing up behind the creature like a halo.
      const k = Math.max(0.22, Math.min(0.42, (r.height / r.width) / 1.2));
      const tex = m.sprite.material.map;
      const aspect = (tex && tex.image && tex.image.width) ? tex.image.width / tex.image.height : (300/360);
      const W = PLANE_IMG_W * s * SIZE, H = W / aspect;
      const R = W * 0.5;

      const gx = fx - vw/2, gy = vh/2 - fy;
      m.group.position.set(gx, gy, 0);
      const order = Math.round(fy) * 6;

      m.fill.scale.set(R, R*k, 1);   m.fill.renderOrder = order;
      m.ring.scale.set(R, R*k, 1);   m.ring.renderOrder = order + 1;
      m.ring.material.opacity = 0.7 + 0.15*Math.sin(now*2 + m.seed);
      m.shadow.scale.set(W*0.36, W*0.36*k, 1); m.shadow.renderOrder = order + 2;

      // Idle life: a gentle breathe (squash/stretch from the feet) and a slight sway —
      // anchored at the feet so the creature never lifts off its ring.
      const breathe = Math.sin(now*2.2 + m.seed);
      const sway = Math.sin(now*1.3 + m.seed*1.7) * 0.035;
      m.sprite.scale.set(W*(1 - breathe*0.012), H*(1 + breathe*0.022), 1);
      m.sprite.rotation.z = sway;
      m.sprite.position.set(0, -1.5*k, 0);       // sink the feet a hair into the ground line
      m.sprite.renderOrder = order + 4;
      if (m.glow){
        m.glow.scale.set(W*1.35, H*1.15, 1);
        m.glow.position.set(0, -H*0.06, 0);
        m.glow.material.opacity = 0.55 + 0.25*Math.sin(now*1.6 + m.seed);
        m.glow.renderOrder = order + 3;
      }

      // Hit box for taps on the drawn creature (viewport coords).
      m.hit = { x0: canvasRect.left + fx - W*0.42, x1: canvasRect.left + fx + W*0.42,
                y0: canvasRect.top + fy - H*0.95,   y1: canvasRect.top + fy + R*k, depth: fy };

      // Label pill just under the ring.
      const pwr = 'PWR ' + (t.cp != null ? t.cp : '?');
      const dist = t._distEl ? t._distEl.textContent : '';
      if (pwr !== m.lastPwr){ m.pwrEl.textContent = pwr; m.lastPwr = pwr; }
      if (dist !== m.lastDist){ m.distEl.textContent = dist; m.lastDist = dist; }
      const catchable = !!(t._distEl && t._distEl.classList.contains('catchable'));
      if (catchable !== m.lastCatchable){ m.distEl.classList.toggle('catchable', catchable); m.lastCatchable = catchable; }
      const ls = Math.max(0.8, Math.min(1.15, s));
      m.label.style.display = '';
      m.label.style.transform = 'translate(' + fx.toFixed(1) + 'px,' + (fy + R*k + 3).toFixed(1) + 'px) translateX(-50%) scale(' + ls.toFixed(2) + ')';
      m.label.style.zIndex = String(1000 + Math.round(fy));
    }

    function disposeMount(m){
      scene.remove(m.group);
      [m.fill, m.ring, m.shadow, m.sprite, m.glow].forEach(o=>{ if (o) o.material.dispose(); });
      if (m.label && m.label.parentNode) m.label.parentNode.removeChild(m.label);
    }

    // where a creature is drawn on screen (the tutorial points at it)
    window.__toto3dHitBox = id=>{ const m = mounts.get(id); return m && m.hit && m.group.visible ? m.hit : null; };
    // where a PumpkinStop is drawn on screen (viewport coords)
    window.__stopHitBox = id=>{
      const cr = canvas.getBoundingClientRect();
      for (const m of propMeshes.values()){
        if (m.p.stop && m.p.stop.id === id && m.hit && m.group.visible) return { x0:m.hit.x0+cr.left, x1:m.hit.x1+cr.left, y0:m.hit.y0+cr.top, y1:m.hit.y1+cr.top };
      }
      return null;
    };
    // Taps on the drawn creature (which can extend above its invisible DOM marker now
    // that it stands upright) are routed back to that toto's own marker click.
    let downAt = null;
    mapView.addEventListener('pointerdown', e=>{ downAt = { x:e.clientX, y:e.clientY }; }, true);
    mapView.addEventListener('click', e=>{
      if (e.target.closest && e.target.closest('.toto-node, .gym-node, .map-controls, .dpad, button')) return;
      if (downAt && Math.hypot(e.clientX-downAt.x, e.clientY-downAt.y) > 10) return; // that was a drag
      let best = null, bestT = null;
      const gs = window.__gameState;
      (gs && gs.wildTotos || []).forEach(t=>{
        const m = mounts.get(t.id);
        if (!m || !m.hit) return;
        const h = m.hit;
        if (e.clientX >= h.x0 && e.clientX <= h.x1 && e.clientY >= h.y0 && e.clientY <= h.y1){
          if (!best || h.depth > best.depth){ best = h; bestT = t; }
        }
      });
      // PumpkinStops: whichever drawn thing is in front wins
      const cr = canvas.getBoundingClientRect(), cx = e.clientX - cr.left, cy = e.clientY - cr.top;
      let bestStop = null;
      propMeshes.forEach(m=>{
        const h = m.hit; if (!m.p.stop || !h || !m.group.visible) return;
        if (cx >= h.x0 && cx <= h.x1 && cy >= h.y0 && cy <= h.y1 && (!best || h.depth > best.depth) && (!bestStop || h.depth > bestStop.hit.depth)) bestStop = m;
      });
      if (bestStop && window.__openPumpkinStop){ window.__openPumpkinStop(bestStop.p); return; }
      if (bestT && bestT._node) bestT._node.click();
    });

    function syncFrame(){
      requestAnimationFrame(syncFrame);
      const gameScreen = document.querySelector('.screen[data-screen="game"]');
      if (!gameScreen || !gameScreen.classList.contains('active')) return;
      // the map is fully covered during a battle or a full-screen panel: don't draw it
      if (document.querySelector('#battle-screen.active, .panel-screen.active')) return;
      const gs = window.__gameState;
      const list = gs && Array.isArray(gs.wildTotos) ? gs.wildTotos : [];

      const mr = mapView.getBoundingClientRect();
      if (Math.round(mr.width) !== vw || Math.round(mr.height) !== vh) resize();
      const canvasRect = canvas.getBoundingClientRect();

      const now = performance.now()/1000;
      const liveIds = new Set();
      list.forEach(t=>{
        if (!t._node || !t._node.isConnected) return;
        liveIds.add(t.id);
        let m = mounts.get(t.id);
        if (!m){
          m = tryMountToto(t);
          if (!m) return;
          mounts.set(t.id, m);
        }
        updateMount(t, m, now, canvasRect);
      });
      mounts.forEach((m, id)=>{
        if (!liveIds.has(id)){ disposeMount(m); mounts.delete(id); }
      });
      // standing map props (houses, trees, tombstones…)
      const ppos = gs && gs.playerWorldPos;
      if (ppos && ensureMarkers(ppos)){
        const dst = markerEls.map(d=>{ const r = d.getBoundingClientRect(); return [r.left+r.width/2-canvasRect.left, r.top+r.height/2-canvasRect.top]; });
        Hm = solveHomography([[-1,-1],[1,-1],[1,1],[-1,1]], dst);
        if (Hm){ syncProps(ppos, now); updateProps(now); }
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(syncFrame);
  } catch (err){
    console.warn('3D map Totos unavailable — staying on the 2D sprite markers.', err);
  }
})();
