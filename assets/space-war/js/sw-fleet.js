/* sw-fleet.js — 艦隊渲染層（InstancedMesh）
 *
 * 模擬層（game.js）的艦艇只是一包資料：{ kind, x, y, z, h(航向), p(俯仰), roll, sx, dead, hidden, sel }。
 * 這一層負責把它們畫出來：每一種艦艇、每一個材質各一個 InstancedMesh，全部共用同一份 instanceMatrix。
 * 數百艘艦艇只需約二十次繪製。
 *
 * 錨點（hardpoint）來自 GLB 內的 HP_* 節點，這裡提供查詢：
 *   fleet.anchorWorld(ship, 'HP_COCKPIT', out)   取得艦上某個錨點的世界座標
 *   fleet.gunWorld(ship, out)                    輪流取得砲口位置（光束起點）
 *   fleet.hasAnchor(kind, name)
 * 第一人稱駕駛艙攝影機（sw-camera.js）就是用 HP_COCKPIT 來定位。
 */
(function (global) {
  'use strict';

  const KIND_MODEL = { frig: 'frigate', cruis: 'cruiser', cap: 'dread', hss: 'hss', moon: 'moon', whale: 'whale', fly: 'butterfly', fgt: 'fighter', awacs: 'sentinel' };
  const CAPACITY = { frig: 380, cruis: 80, cap: 12, hss: 2, moon: 4, whale: 100, fly: 1000, fgt: 400, awacs: 8 };
  // 引擎光暈：[大小, [r,g,b]]
  const ENGINE = {
    frig: [3.4, [0.55, 0.85, 1.0]], cruis: [5.5, [0.55, 0.85, 1.0]], cap: [10, [0.6, 0.88, 1.0]], hss: [15, [1.0, 0.85, 0.4]],
    whale: [8, [0.7, 0.4, 1.0]], fgt: [2.6, [0.55, 0.85, 1.0]], awacs: [2.4, [0.6, 0.88, 1.0]], fly: [2.6, [0.4, 0.7, 1.0]], moon: [0, [1, 1, 1]]
  };

  const GLOW_VS = 'attribute float size; attribute vec3 aColor; uniform float scale; varying vec3 vC; void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * scale / max(1.0, -mv.z), 1.0, 160.0); gl_Position = projectionMatrix * mv; }';
  const GLOW_FS = 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a = a * a * 1.3 + exp(-d * d * 120.0) * 0.8; gl_FragColor = vec4(vC * a, 1.0); }';

  function writeMat(arr, o, x, y, z, h, p, roll, sx, sy, sz) {
    const cy = Math.cos(h), sn = Math.sin(h), cp = Math.cos(p), sp = Math.sin(p);
    let c0x = cy, c0y = 0, c0z = -sn, c1x = -sn * sp, c1y = cp, c1z = -cy * sp;
    if (roll) {
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const ax = c0x * cr + c1x * sr, ay = c0y * cr + c1y * sr, az = c0z * cr + c1z * sr;
      c1x = -c0x * sr + c1x * cr; c1y = -c0y * sr + c1y * cr; c1z = -c0z * sr + c1z * cr;
      c0x = ax; c0y = ay; c0z = az;
    }
    arr[o] = c0x * sx; arr[o + 1] = c0y * sx; arr[o + 2] = c0z * sx; arr[o + 3] = 0;
    arr[o + 4] = c1x * sy; arr[o + 5] = c1y * sy; arr[o + 6] = c1z * sy; arr[o + 7] = 0;
    arr[o + 8] = sn * cp * sz; arr[o + 9] = sp * sz; arr[o + 10] = cy * cp * sz; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }

  /** 以四元數 (qx,qy,qz,qw) 寫入矩陣（FPV 的 6 自由度戰機用，不受歐拉角萬向鎖影響） */
  function writeQuat(arr, o, x, y, z, qx, qy, qz, qw, sc) {
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz, xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
    arr[o] = (1 - (yy + zz)) * sc; arr[o + 1] = (xy + wz) * sc; arr[o + 2] = (xz - wy) * sc; arr[o + 3] = 0;
    arr[o + 4] = (xy - wz) * sc; arr[o + 5] = (1 - (xx + zz)) * sc; arr[o + 6] = (yz + wx) * sc; arr[o + 7] = 0;
    arr[o + 8] = (xz + wy) * sc; arr[o + 9] = (yz - wx) * sc; arr[o + 10] = (1 - (xx + yy)) * sc; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }
  const _v = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  /** 把艦上局部座標點轉成世界座標（支援 s.q 四元數或 h/p/roll 歐拉） */
  function localToWorld(s, a, out) {
    const sc = s.scale || 1, ax = a.x * sc, ay = a.y * sc, az = a.z * sc;
    if (s.q) { _v.set(ax, ay, az).applyQuaternion(s.q); return out.set(s.x + _v.x, s.y + _v.y, s.z + _v.z); }
    const cy = Math.cos(s.h), sn = Math.sin(s.h), cp = Math.cos(s.p), sp = Math.sin(s.p);
    return out.set(s.x + cy * ax - sn * sp * ay + sn * cp * az, s.y + cp * ay + sp * az, s.z - sn * ax - cy * sp * ay + cy * cp * az);
  }

  /** 模型載入失敗時的備援：用簡單幾何代替，讓遊戲仍可進行 */
  function fallbackAssets() {
    const out = {}, mats = {};
    Object.keys(global.SWAssets.MANIFEST).forEach((k) => {
      if (k === 'irontomb') return;
      const L = global.SWAssets.MANIFEST[k].length;
      const g = new THREE.ConeGeometry(L * 0.18, L, 6).rotateX(Math.PI / 2);
      const m = mats[k] = new THREE.MeshStandardMaterial({ color: k === 'whale' || k === 'butterfly' ? 0x5b4cc0 : k === 'moon' || k === 'hss' ? 0xd9b132 : 0x8fa8d8, metalness: 0.4, roughness: 0.5 });
      out[k] = { parts: [{ geometry: g, material: m }], anchors: { HP_ENGINE_1: new THREE.Vector3(0, 0, -L * 0.5) }, size: new THREE.Vector3(L * 0.36, L * 0.36, L), length: L };
    });
    return out;
  }

  function create(opts) {
    const scene = opts.scene, assets = opts.assets;
    const fleet = { kinds: {} }, _o = new THREE.Vector3();

    Object.keys(KIND_MODEL).forEach((kind) => {
      const a = assets[KIND_MODEL[kind]]; if (!a) return;
      const cap = CAPACITY[kind];
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16).setUsage(THREE.DynamicDrawUsage);
      const meshes = a.parts.map((p) => {
        const m = p.material;
        if (m.emissive) m.emissiveIntensity = 1.7;
        m.envMapIntensity = 0.9;
        const im = new THREE.InstancedMesh(p.geometry, m, cap);
        im.instanceMatrix = attr; im.frustumCulled = false; im.count = 0; scene.add(im);
        return im;
      });
      const engines = [], guns = [];
      Object.keys(a.anchors).sort().forEach((n) => { if (n.indexOf('HP_ENGINE') === 0) engines.push(a.anchors[n]); else if (n.indexOf('HP_GUN') === 0) guns.push(a.anchors[n]); });
      fleet.kinds[kind] = { cap, attr, meshes, n: 0, anchors: a.anchors, engines, guns, length: a.length, size: a.size };
    });

    /* 引擎光暈（全艦隊合併成一個 Points） */
    const EN = 4200;
    const ePos = new Float32Array(EN * 3), eSize = new Float32Array(EN), eCol = new Float32Array(EN * 3);
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3).setUsage(THREE.DynamicDrawUsage));
    eGeo.setAttribute('size', new THREE.BufferAttribute(eSize, 1).setUsage(THREE.DynamicDrawUsage));
    eGeo.setAttribute('aColor', new THREE.BufferAttribute(eCol, 3).setUsage(THREE.DynamicDrawUsage));
    const eMat = new THREE.ShaderMaterial({ uniforms: { scale: { value: 500 } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ePoints = new THREE.Points(eGeo, eMat); ePoints.frustumCulled = false; ePoints.renderOrder = 4; scene.add(ePoints);
    eGeo.setDrawRange(0, 0);
    fleet.setPixelScale = (v) => { eMat.uniforms.scale.value = v; };

    /* 選取環 */
    const RC = 420;
    const ringAttr = new THREE.InstancedBufferAttribute(new Float32Array(RC * 16), 16).setUsage(THREE.DynamicDrawUsage);
    const ringMesh = new THREE.InstancedMesh(new THREE.RingBufferGeometry(0.94, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), RC);
    ringMesh.instanceMatrix = ringAttr; ringMesh.frustumCulled = false; ringMesh.count = 0; scene.add(ringMesh);

    /* 每幀：把模擬層的艦艇寫進實例矩陣 */
    fleet.update = function (listA, listB) {
      const ks = fleet.kinds; let ne = 0, nr = 0;
      for (const k in ks) ks[k].n = 0;
      const proc = (ships) => {
        for (let i = 0; i < ships.length; i++) {
          const s = ships[i]; if (s.dead || s.hidden) continue;
          const K = ks[s.kind]; if (!K || K.n >= K.cap) continue;
          const sc = s.scale || 1;
          if (s.q) writeQuat(K.attr.array, K.n * 16, s.x, s.y, s.z, s.q.x, s.q.y, s.q.z, s.q.w, sc); else writeMat(K.attr.array, K.n * 16, s.x, s.y, s.z, s.h, s.p, s.roll || 0, (s.sx || 1) * sc, sc, sc);
          K.n++;
          const en = ENGINE[s.kind];
          if (en && en[0] > 0 && K.engines.length) {
            for (let e = 0; e < K.engines.length && ne < EN; e++) {
              localToWorld(s, K.engines[e], _o);
              ePos[ne * 3] = _o.x; ePos[ne * 3 + 1] = _o.y; ePos[ne * 3 + 2] = _o.z;
              eSize[ne] = en[0] * sc * (s.thr != null ? 0.35 + 0.9 * s.thr : 1) * (0.85 + 0.3 * Math.sin((s.ph || 0) * 3 + s.x * 0.05));
              eCol[ne * 3] = en[1][0]; eCol[ne * 3 + 1] = en[1][1]; eCol[ne * 3 + 2] = en[1][2];
              ne++;
            }
          }
          if (s.sel && s.ring && nr < RC) { writeMat(ringAttr.array, nr * 16, s.x, s.y, s.z, 0, 0, 0, s.d.rad * 1.25, 1, s.d.rad * 1.25); nr++; }
        }
      };
      proc(listA); if (listB) proc(listB);
      for (const k in ks) { const K = ks[k]; K.attr.needsUpdate = true; K.meshes.forEach((m) => { m.count = K.n; }); }
      eGeo.setDrawRange(0, ne);
      eGeo.attributes.position.needsUpdate = true; eGeo.attributes.size.needsUpdate = true; eGeo.attributes.aColor.needsUpdate = true;
      ringMesh.count = nr; ringAttr.needsUpdate = true;
    };

    /* 錨點查詢 */
    fleet.hasAnchor = (kind, name) => !!(fleet.kinds[kind] && fleet.kinds[kind].anchors[name]);
    fleet.anchorWorld = function (s, name, out) {
      const K = fleet.kinds[s.kind], a = K && K.anchors[name]; out = out || new THREE.Vector3();
      if (!a) return out.set(s.x, s.y, s.z);
      return localToWorld(s, a, out);
    };
    fleet.gunWorld = function (s, out) {
      const K = fleet.kinds[s.kind]; out = out || new THREE.Vector3();
      if (!K || !K.guns.length) return out.set(s.x, s.y, s.z);
      s.gi = ((s.gi || 0) + 1) % K.guns.length;
      return localToWorld(s, K.guns[s.gi], out);
    };
    return fleet;
  }

  global.SWFleet = { create, fallbackAssets, KIND_MODEL };
})(window);
