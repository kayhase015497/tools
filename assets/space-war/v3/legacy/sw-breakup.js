/* sw-breakup.js — v3 艦艇斷裂殘骸（移植自 Godot 版 breakup.gd）
 *
 * 艦艇被擊毀時，以 Blender 預先切好的斷片 GLB（assets/space-war/models/frag/<艦>_frag_<A|B|C>.glb，由 tools-src/blender/space-war/fracture_ships.py 產生）
 * 取代完整艦：2~4 塊大塊，每塊以簡單積分運動（初速＝艦速＋由艦心向外的分離速度、亂數角速度），
 * 斷面（break_face 材質）燃燒熔融：餘燼熱點＋自發光，由 1 降到 0（7 秒）；沿斷面放火焰（4.5 秒）、餘燼與細黑煙尾。
 * 外表沿用完整艦的材質（與艦隊一致），並帶一點燒焦（aDmg）。
 * 效能保護：同時最多 7 組、存活 20 秒（最後 4 秒縮小淡出）、遠離鏡頭（>7 km）不放特效、>22 km 直接略過（Godot 最早布建的設置）。
 * 斷片檔第一次用到時才載入（約 0.5~1.8 MB），載入完成前先只有爆炸；每種艦隨機從 A／B／C 三個方案挑一個。
 * 全域介面：SWBreakup.spawn(ship, style)  style 0＝聯軍（橘色餘燼）、1＝軍團（紫色餘燼）
 */
(function (global) {
  'use strict';
  const FRAG = { frig: 'frigate', cruis: 'cruiser', ipc: 'ipc', whale: 'whale', hss: 'hss', awacs: 'ipc_sid' };   // 艦種 → 斷片檔前綴
  const ASSET_KEY = { frig: 'frigate', cruis: 'cruiser', ipc: 'ipc', whale: 'whale', hss: 'hss', awacs: 'ipcsid' };   // 艦種 → sw-assets 的鍵
  const PLANS = { hss: ['A', 'B'] };            // hss 的 C 方案檔太大（6 MB），網頁版不用
  const MAX_ACTIVE = 7, LIFETIME = 20, BURN_TIME = 7, FLAME_TIME = 4.5, FAR_NO_FX = 7000, FAR_REMOVE = 22000;   // Godot 最早布建的設置（同時 7 組、存活 20 秒、熔融 7 秒、火焰 4.5 秒）
  const BASE = '../assets/space-war/models/frag/';
  const cache = {};        // 'cruiser_A' → Promise<{ chunks:[{ center, meshes:[{ geo, partIdx, isBreak }] }], s }>
  const active = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  let hooked = false, loader = null, uTimeNode = null;

  /* ── 斷面熔融材質（TSL）：近黑底＋餘燼熱點自發光，burn 由 1 降到 0（移植 ship_break.gdshader 的熔融部分） ── */
  function makeBreakMaterial(emberCol) {
    const nodes = window.SW2.nodes;
    if (!nodes.breakMaterial) return new THREE.MeshStandardMaterial({ color: 0x1a1210, emissive: new THREE.Color(emberCol[0], emberCol[1], emberCol[2]), emissiveIntensity: 1, roughness: 0.95, side: THREE.DoubleSide });
    return nodes.breakMaterial(emberCol);
  }

  function frameLoader() { return loader || (loader = new THREE.GLTFLoader()); }

  function loadFrag(prefix, plan, assetKey) {
    const key = prefix + '_frag_' + plan;
    if (cache[key]) return cache[key];
    const a = assets && assets[assetKey];
    return (cache[key] = new Promise((resolve, reject) => {
      frameLoader().load(BASE + key + '.glb', (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const groups = {};   // 塊編號 → { meshes: [] }
        const box = new THREE.Box3();
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          let n = o.name, p = o.parent;
          while (!/^FRAG\d+_/.test(n) && p) { n = p.name; p = p.parent; }
          const mm = /^FRAG(\d+)_(.*)$/.exec(n); if (!mm) return;
          const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
          const matName = (Array.isArray(o.material) ? o.material[0] : o.material).name || '';
          (groups[mm[1]] = groups[mm[1]] || { meshes: [] }).meshes.push({ geo: g, objName: mm[2], matName, isBreak: matName === 'break_face' });
          g.computeBoundingBox(); box.union(g.boundingBox);
        });
        // 縮放：與艦隊一致（原模型長度 ÷ 原始 Z 向長度）；斷片聯集的 Z 向長度＝整艘船的長度
        const rawZ = Math.max(box.max.z - box.min.z, 1e-4), s = a ? a.length / rawZ : 1;
        const chunks = Object.keys(groups).map((k) => {
          const gb = new THREE.Box3(); groups[k].meshes.forEach((m) => { m.geo.scale(s, s, s); m.geo.computeBoundingBox(); gb.union(m.geo.boundingBox); });
          const center = gb.getCenter(new THREE.Vector3());
          groups[k].meshes.forEach((m) => { m.geo.translate(-center.x, -center.y, -center.z); });
          return { center, meshes: groups[k].meshes, size: gb.getSize(new THREE.Vector3()) };
        });
        resolve({ chunks, s });
      }, undefined, reject);
    }).catch((e) => { console.warn('斷片載入失敗', key, e); return null; }));
  }

  function partFor(a, m) {   // 斷片物件 → 對應的完整艦零件（依零件名，找不到就用材質名，再不行用第一個）
    if (!a) return null;
    return a.parts.find((p) => p.name === m.objName) || a.parts.find((p) => p.material && p.material.name === m.matName) || a.parts[0];
  }

  function basisFor(s, out) {   // 與 sw-fleet 的 writeMat／writeQuat 一致的姿態
    if (s.q) return out.set(s.q.x, s.q.y, s.q.z, s.q.w);
    const cy = Math.cos(s.h), sn = Math.sin(s.h), cp = Math.cos(s.p), sp = Math.sin(s.p);
    let c0 = new THREE.Vector3(cy, 0, -sn), c1 = new THREE.Vector3(-sn * sp, cp, -cy * sp);
    const c2 = new THREE.Vector3(sn * cp, sp, cy * cp);
    if (s.roll) { const cr = Math.cos(s.roll), sr = Math.sin(s.roll), a = c0.clone().multiplyScalar(cr).addScaledVector(c1, sr); c1 = c1.clone().multiplyScalar(cr).addScaledVector(c0, -sr); c0 = a; }
    const m = new THREE.Matrix4().makeBasis(c0, c1, c2);
    return out.setFromRotationMatrix(m);
  }

  function ensureHook() {
    if (hooked) return; hooked = true;
    const prev = fx.onUpdate; fx.onUpdate = (dt) => { if (prev) prev(dt); update(dt); };
  }

  function spawn(ship, style) {
    const prefix = FRAG[ship.kind], assetKey = ASSET_KEY[ship.kind]; if (!prefix || !assets || !assets[assetKey]) return;
    if (camera.position.distanceTo(new THREE.Vector3(ship.x, ship.y, ship.z)) > FAR_REMOVE) return;
    if (global.G && global.G.lite && active.length >= 6) return;
    const plans = PLANS[ship.kind] || ['A', 'B', 'C'], plan = plans[(Math.random() * plans.length) | 0];
    ensureHook();
    const snap = { x: ship.x, y: ship.y, z: ship.z, vx: ship.vx || 0, vy: ship.vy || 0, vz: ship.vz || 0, scale: ship.scale || 1, q: basisFor(ship, new THREE.Quaternion()) };
    loadFrag(prefix, plan, assetKey).then((data) => { if (data) build(data, ship, style, snap, assets[assetKey]); });
  }

  function build(data, ship, style, snap, a) {
    ensureHook();
    const emberCol = style === 1 ? [0.72, 0.3, 1.0] : [1.0, 0.3, 0.06];
    const bmat = makeBreakMaterial(emberCol);
    const grp = { chunks: [], age: 0, killed: -1, bmat, style, emberCol, fxOn: true, root: new THREE.Group() };
    scene.add(grp.root);
    active.push(grp);
    while (active.length > MAX_ACTIVE) { const old = active.shift(); old.killed = old.age; pending.push(old); }   // 擠掉最舊的一組：1.2 秒內縮小消失
    const sc = snap.scale, R = snap.q;
    // 艦心 = 所有塊的質心平均
    const cen = new THREE.Vector3(); data.chunks.forEach((c) => cen.add(c.center)); cen.multiplyScalar(1 / data.chunks.length);
    let span = 0; data.chunks.forEach((c) => { span = Math.max(span, c.size.length()); });
    const spanW = Math.max(data.chunks.reduce((m, c) => m + c.size.length(), 0) * sc * 0.6, 1);
    data.chunks.forEach((c) => {
      const holder = new THREE.Group();
      const off = c.center.clone().multiplyScalar(sc).applyQuaternion(R);
      holder.position.set(snap.x + off.x, snap.y + off.y, snap.z + off.z); holder.quaternion.copy(R); holder.scale.setScalar(sc);
      c.meshes.forEach((m) => {
        const part = partFor(a, m);
        let material;
        if (m.isBreak) material = bmat;
        else material = part ? part.material : new THREE.MeshStandardMaterial({ color: 0x556677 });
        if (!m.isBreak && part && part.geometry.attributes.aDmg && !m.geo.attributes.aDmg) m.geo.setAttribute('aDmg', new THREE.BufferAttribute(new Float32Array(m.geo.attributes.position.count).fill(0.8), 1));
        const mesh = new THREE.Mesh(m.geo, material); mesh.frustumCulled = false; holder.add(mesh);
      });
      grp.root.add(holder);
      const out = off.clone().normalize();
      const vel = new THREE.Vector3(snap.vx, snap.vy, snap.vz).addScaledVector(out, spanW * rnd(0.012, 0.03)).add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(spanW * 0.004));
      grp.chunks.push({ base: sc, holder, vel, ang: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.12, 0.45)), size: c.size.length() * sc, acc: [0, 0, 0] });
    });
    grp.span = spanW;
  }
  const pending = [];   // 被擠掉、正在縮小消失的組

  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _cp = new THREE.Vector3();
  function stepGroup(g, dt) {
    g.age += dt;
    let k = 1;
    if (g.killed >= 0) k = Math.max(0, 1 - (g.age - g.killed) / 1.2); else if (g.age > LIFETIME - 4) k = Math.max(0, (LIFETIME - g.age) / 4);
    if (k <= 0) return false;
    // 斷面熔融：1 → 0（SINE 緩動，7 秒）
    const t = Math.min(1, g.age / BURN_TIME); if (g.bmat.uniforms && g.bmat.uniforms.uBurn) g.bmat.uniforms.uBurn.value = 0.5 + 0.5 * Math.cos(Math.PI * t);
    const c0 = g.chunks[0]; if (!c0) return false;
    camera.getWorldPosition(_cp);
    const d = _cp.distanceTo(c0.holder.position);
    if (d > FAR_REMOVE) return false;
    const fxOn = d < FAR_NO_FX && g.age < BURN_TIME + 1 && !(global.G && global.G.lite);
    const flame = g.age < FLAME_TIME, lodK = Math.max(0.35, Math.min(1, 1 - (d - 4000) / 12000));
    for (const c of g.chunks) {
      c.holder.position.addScaledVector(c.vel, dt);
      _q.setFromAxisAngle(_v.copy(c.ang).normalize(), c.ang.length() * dt); c.holder.quaternion.premultiply(_q);
      c.holder.scale.setScalar(c.base * k);
      if (!fxOn || k < 0.5) continue;
      const burn = 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, g.age / BURN_TIME)), r = c.size * 0.28, p = c.holder.position, ec = g.emberCol;
      // 餘燼：由斷面漂出（持續到熔融結束）
      c.acc[0] += dt * 9 * burn * lodK; while (c.acc[0] >= 1) { c.acc[0] -= 1; fx.emit(p.x + rnd(-1, 1) * r, p.y + rnd(-1, 1) * r, p.z + rnd(-1, 1) * r, rnd(-1, 1) * 4, rnd(-1, 1) * 4, rnd(-1, 1) * 4, ec[0], ec[1] * 1.6 + 0.2, ec[2] * 1.2, Math.max(0.8, c.size * 0.012), rnd(2.2, 4.5), 0.7); }
      // 火焰：前 13 秒，從斷面噴出的小火舌
      if (flame) { c.acc[1] += dt * 2.2 * burn * lodK; while (c.acc[1] >= 1) { c.acc[1] -= 1; fx.fire(p.x + rnd(-1, 1) * r, p.y + rnd(-1, 1) * r, p.z + rnd(-1, 1) * r, rnd(-1, 1) * 3, rnd(-1, 1) * 3, rnd(-1, 1) * 3, c.size * 0.04, c.size * rnd(0.1, 0.17), rnd(0.8, 1.4), g.style === 1 ? [0.72, 0.3, 1.0] : [1.0, 0.45, 0.1], 1.5, 0.8, { purple: g.style === 1 ? 1 : 0 }); } }
      // 細黑煙尾
      c.acc[2] += dt * 1.3 * lodK; while (c.acc[2] >= 1) { c.acc[2] -= 1; fx.smoke(p.x + rnd(-1, 1) * r, p.y + rnd(-1, 1) * r, p.z + rnd(-1, 1) * r, rnd(-1, 1) * 2, rnd(-1, 1) * 2, rnd(-1, 1) * 2, c.size * 0.04, c.size * rnd(0.12, 0.2), rnd(3.5, 6), g.style === 1 ? [0.62, 0.25, 1.0] : [1.0, 0.38, 0.09], 0.5, 0.55, { radius: c.size * 2, cx: p.x, cy: p.y, cz: p.z }); }
    }
    return true;
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) if (!stepGroup(active[i], dt)) { dispose(active[i]); active.splice(i, 1); }
    for (let i = pending.length - 1; i >= 0; i--) if (!stepGroup(pending[i], dt)) { dispose(pending[i]); pending.splice(i, 1); }
  }
  function dispose(g) { scene.remove(g.root); }

  global.SWBreakup = { spawn, active, update, _cache: cache };
})(window);
