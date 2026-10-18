/* battle-render.js — 場景、相機（飛行員／指揮官／過場）、後處理、鐵墓與末日視覺
 * 依賴：battle-core.js 的全域；three.js r128、SWEnv、SWFx、SWFleet、FPVPost。
 */
'use strict';
const cv = $('#b-canvas'), hudCv = $('#b-hud'), hx = hudCv.getContext('2d');
const coarse = matchMedia('(pointer: coarse)').matches;
let QUALITY = window.SW2.QUALITY;          // 由 boot.js 決定（與 v1 相同的規則）
const renderer = window.SW2.renderer;      // WebGPURenderer（不支援時自動退回 WebGL2），已在 boot.js 初始化完成
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY === 'high' ? 1.5 : 1.25));
renderer.setClearColor(0x000000, 0);      // 駕駛艙疊層以 alpha 0 當背景
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03050c);
const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 60000);
const sky = SWEnv.makeSky(30000, { linear: true }); scene.add(sky);
SWEnv.makeEnvironment(renderer, scene);
const lights = SWEnv.addLights(scene, { hemi: 0.2, key: 1.5, rim: 0.55 });   // v2：主光 3.0 → 1.5，艦艇不再被照到發白   // 低環境光＋強主光：明暗反差大
let W = 1, H = 1, post = null, hurtK = 0, fovCur = FOV, speedFx = 0;

// 駕駛艙疊加層：獨立的場景＋相機（近平面極近），畫在主場景之後
const cockScene = new THREE.Scene(), cockCam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);
cockCam.rotation.y = Math.PI;
const cockRoot = new THREE.Group(); cockScene.add(cockRoot);
cockScene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a1030, 1.5));
const cockKey = new THREE.DirectionalLight(0xd8e8ff, 2.2); cockKey.position.set(0.4, 1, -0.6); cockScene.add(cockKey);

/* ── 恆星、鐵墓背光、星空、太空塵 ── */
function glowTex() {   // 高斯式平滑衰減：線性管線下，邊緣必須平順歸零
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  const e0 = Math.exp(-6.5);
  for (let i = 0; i <= 16; i++) { const r = i / 16, a = Math.max(0, (Math.exp(-6.5 * r * r) - e0) / (1 - e0)); gr.addColorStop(r, 'rgba(255,255,255,' + a.toFixed(4) + ')'); }
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
}
const GT = glowTex();
function glowSprite(color, size, op, gain) { const c = new THREE.Color(color); if (gain) c.multiplyScalar(gain); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GT, color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.scale.set(size, size, 1); return s; }
const sun = glowSprite(0xfff1d6, 5200, 0.95, 2.6); sun.position.set(26000 * 0.55, 26000 * 0.7, 26000 * 0.4).normalize().multiplyScalar(26000); scene.add(sun);
const sunCore = glowSprite(0xffffff, 1500, 1, 9); sunCore.position.copy(sun.position); scene.add(sunCore);
lights.key.position.copy(sun.position).normalize().multiplyScalar(500);
const SUN_DIR = sun.position.clone().normalize();
const tombGlow = glowSprite(0xff2040, 9500, 0.42, 1.5); tombGlow.position.copy(TOMB_POS).add(new THREE.Vector3(0, 300, 0)); scene.add(tombGlow);
const tombGlow2 = glowSprite(0xff5a30, 4200, 0.38, 2.0); tombGlow2.position.copy(TOMB_POS); scene.add(tombGlow2);
// 紅光從鐵墓體內向外照：艦隊被染成血紅，而鐵墓自己的表面背向光源，反而是陰暗的剪影
const tombLight = new THREE.PointLight(0xff2a45, 6.0, 26000, 1.05); tombLight.position.copy(TOMB_POS); scene.add(tombLight);

const DUST = 900;
const dp = new Float32Array(DUST * 3); for (let i = 0; i < dp.length; i++) dp[i] = Math.random();
const dustGeo = window.SW2.nodes.quadGeometry(DUST, { aPos: new THREE.InstancedBufferAttribute(dp, 3) });
const dustMat = window.SW2.nodes.dustMaterial();
const dust = new THREE.Mesh(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);

const STARS = 7000, stP = new Float32Array(STARS * 3), stC = new Float32Array(STARS * 3), stS = new Float32Array(STARS);
const STAR_TINT = [[1, 0.82, 0.66], [0.78, 0.86, 1], [1, 1, 1], [1, 0.66, 0.5], [0.7, 0.8, 1]];
for (let i = 0; i < STARS; i++) {
  const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u), b = Math.pow(Math.random(), 7) * 6 + 0.18, c = pick(STAR_TINT);
  stP[i * 3] = Math.cos(a) * r * 24000; stP[i * 3 + 1] = u * 24000; stP[i * 3 + 2] = Math.sin(a) * r * 24000;
  stC[i * 3] = c[0] * b; stC[i * 3 + 1] = c[1] * b; stC[i * 3 + 2] = c[2] * b; stS[i] = 1 + Math.min(4, b) * 0.9;
}
const starGeo = window.SW2.nodes.quadGeometry(STARS, { aPos: new THREE.InstancedBufferAttribute(stP, 3), aCol: new THREE.InstancedBufferAttribute(stC, 3), aSize: new THREE.InstancedBufferAttribute(stS, 1) });
const starMat = window.SW2.nodes.starMaterial();   // 深度測試開啟＋深度壓到遠平面：星星只會畫在「沒有任何東西」的地方，不會透過艦體顯示
const stars = new THREE.Mesh(starGeo, starMat); stars.frustumCulled = false; stars.renderOrder = -9; scene.add(stars);

/* ── 爆炸閃光燈（固定 3 盞）、材質處理 ── */
const BL = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffaa66, 0, 1500, 1.4); scene.add(l); BL.push({ l, k: 0, size: 1 }); }
let bli = 0;
function boomLight(x, y, z, size, col) { const p = BL[bli++ % 3]; p.l.position.set(x, y, z); p.l.color.setRGB(col[0], col[1], col[2]); p.k = 1; p.size = size; p.l.distance = 300 + size * 240; }
function updateBoomLights(dt) { for (const p of BL) { p.k *= Math.exp(-dt * 4.2); p.l.intensity = p.k * (4 + p.size * 7); } }

const LINEARIZED = new Map();
function prepMaterial(m, panelK) {   // sRGB 顯示色 → 線性；轉成節點材質；硬表面加程序化面板接縫
  if (LINEARIZED.has(m)) return LINEARIZED.get(m);
  if (m.color) { m.color.convertSRGBToLinear(); if (!(m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01)) m.color.multiplyScalar(0.78); }   // v2：非發光面（裝甲）反照率 ×0.78
  const emissive = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01;
  if (m.emissive) m.emissive.convertSRGBToLinear();
  const nm = window.SW2.nodes.toNode(renderer, m);
  if (panelK && !emissive) window.SW2.nodes.panelize(nm, panelK);
  LINEARIZED.set(m, nm); return nm;
}
function prepAsset(a, panelK) { a.parts.forEach((p) => { p.material = prepMaterial(p.material, panelK); }); }

let fx = null, fleet = null, assets = null, tombMeshes = null, tombArms = null;

/* ── 指揮官地面格線與鐵墓禁區圈 ── */
const gridMesh = new THREE.GridHelper(36000, 72, 0x2a4a8a, 0x15264a); gridMesh.material.transparent = true; gridMesh.material.opacity = 0.45; gridMesh.material.depthWrite = false; gridMesh.position.set(TOMB_POS.x, TOMB_POS.y, TOMB_POS.z); gridMesh.visible = false; scene.add(gridMesh);
const auraLine = (function () { const pts = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * TAU; pts.push(new THREE.Vector3(Math.cos(a) * TOMB_AURA, 0, Math.sin(a) * TOMB_AURA)); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.7, depthWrite: false })); l.position.set(TOMB_POS.x, TOMB_POS.y, TOMB_POS.z); l.visible = false; scene.add(l); return l; })();

/* ── 翁法羅斯的莫比烏斯環：一圈高亮的扭轉光帶，環心在鐵墓大腿中段，半徑約等於鐵墓的手臂展幅 ── */
const MOBIUS_A = 6200, MOBIUS_CY = TOMB_POS.y - 55 * TOMB_SCALE;   // ∞ 的半寬；環心高度在鐵墓大腿中段
const MOBIUS_OFF = 1800;   // 紐帶中心往聯軍（HSS／玩家）方向挪出的距離：鐵墓不是插在環心，而是站在紐帶之後、離聯軍較遠
const mobius = (function () {
  const grp = new THREE.Group(), U = 480, V = 2;
  // 中心線是一條橫躺的 ∞（伯努利雙紐線），所在平面的法線朝向 HSS（+Z），所以從聯軍陣線看過去就是完整的 ∞；
  // 光帶沿中心線扭轉 3 個半圈（奇數 → 仍是真正的莫比烏斯帶），扭到側面時光帶收成一條細線，扭轉一目了然
  const mkGeo = (w) => {
    const pos = [], uv = [], idx = [], A = MOBIUS_A, C = (t) => { const d = 1 + Math.sin(t) ** 2; return [A * Math.cos(t) / d, A * Math.sin(t) * Math.cos(t) / d]; };
    for (let i = 0; i <= U; i++) {
      const t = i / U * TAU, p = C(t), q = C(t + 1e-3), tx = q[0] - p[0], ty = q[1] - p[1], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, th = 1.5 * t, cs = Math.cos(th), sn = Math.sin(th);
      for (let j = 0; j <= V; j++) { const v = j / V * 2 - 1, h = v * w / 2; pos.push(p[0] + nx * cs * h, p[1] + ny * cs * h, sn * h); uv.push(i / U, v); }
    }
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) { const a = i * (V + 1) + j, b = a + V + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  };
  const mat = (halo) => window.SW2.nodes.mobiusMaterial(halo);
  const strip = new THREE.Mesh(mkGeo(1300), mat(false)), halo = new THREE.Mesh(mkGeo(2900), mat(true));
  strip.frustumCulled = halo.frustumCulled = false; strip.renderOrder = 3; halo.renderOrder = 2; grp.add(halo, strip);
  grp.position.set(TOMB_POS.x, MOBIUS_CY, TOMB_POS.z + MOBIUS_OFF); grp.rotation.set(0, 0, 0); scene.add(grp); grp.userData.mats = [strip.material, halo.material]; return grp;
})();
// 紐帶中心（∞ 的交叉點）：超亮的藍白光核
const ringCore = glowSprite(0x8fc8ff, 6200, 0.85, 3.2), ringCore2 = glowSprite(0xffffff, 1500, 1, 10);
ringCore.position.copy(mobius.position); ringCore2.position.copy(mobius.position); scene.add(ringCore, ringCore2);

/* ── 能量護盾泡泡：被擊中的艦艇罩上一層六角格能量球，命中點擴散漣漪，護盾破裂時整顆閃白 ── */
const SHIELD_K = 12, shieldGeo = new THREE.IcosahedronGeometry(1, 4);
const shieldViz = [];
for (let i = 0; i < SHIELD_K; i++) {
  const m = window.SW2.nodes.shieldMaterial();
  const me = new THREE.Mesh(shieldGeo, m); me.frustumCulled = false; me.visible = false; me.matrixAutoUpdate = false; me.renderOrder = 3; scene.add(me); shieldViz.push(me);
}
const _sc0 = new THREE.Vector3(), _sc1 = new THREE.Vector3(), _sc2 = new THREE.Vector3();
function insideShield(s) {
  const K = fleet && fleet.kinds[s.kind], sz = K ? K.size : null, sc = s.scale || 1, rx = Math.max(sz ? sz.x * sc * 0.62 : 0, s.rad * 0.95), ry = Math.max(sz ? sz.y * sc * 0.8 : 0, s.rad * 0.85), rz = Math.max(sz ? sz.z * sc * 0.58 : 0, s.rad * 1.05);
  const cy = Math.cos(s.h), sn = Math.sin(s.h), cp = Math.cos(s.p), sp = Math.sin(s.p), dx = camera.position.x - s.x, dy = camera.position.y - s.y, dz = camera.position.z - s.z;
  const lx = (dx * cy - dz * sn) / rx, ly = (dx * -sn * sp + dy * cp + dz * -cy * sp) / ry, lz = (dx * sn * cp + dy * sp + dz * cy * cp) / rz;
  return lx * lx + ly * ly + lz * lz < 1.02;
}
function shieldColor(s) { return s.side === 'e' ? [0.62, 0.28, 1.0] : s.kind === 'ipc' ? [1.0, 0.28, 0.25] : [0.3, 0.65, 1.0]; }
function updateShieldViz() {
  if (G.lite) { for (let i = 0; i < SHIELD_K; i++) shieldViz[i].visible = false; return; }
  const cand = []; const f = (list) => { for (let i = 0; i < list.length; i++) { const s = list[i]; if (!s.dead && s.shMax && !s.hidden && G.t - s.shT < 1.35) cand.push(s); } }; f(allies); f(enemies);
  cand.sort((a, b) => b.shT - a.shT);
  for (let i = 0; i < SHIELD_K; i++) {
    const me = shieldViz[i], s = cand[i]; if (!s) { me.visible = false; continue; }
    if (insideShield(s)) { me.visible = false; continue; }   // 鏡頭在護盾球裡面時不畫，免得整個畫面都是六角格
    const K = fleet && fleet.kinds[s.kind], sz = K ? K.size : null, sc = s.scale || 1;
    const rx = Math.max(sz ? sz.x * sc * 0.62 : 0, s.rad * 0.95), ry = Math.max(sz ? sz.y * sc * 0.8 : 0, s.rad * 0.85), rz = Math.max(sz ? sz.z * sc * 0.58 : 0, s.rad * 1.05);
    const cy = Math.cos(s.h), sn = Math.sin(s.h), cp = Math.cos(s.p), sp = Math.sin(s.p);
    _sc0.set(cy, 0, -sn); _sc1.set(-sn * sp, cp, -cy * sp); _sc2.set(sn * cp, sp, cy * cp);
    me.matrix.makeBasis(_sc0.clone().multiplyScalar(rx), _sc1.clone().multiplyScalar(ry), _sc2.clone().multiplyScalar(rz)); me.matrix.setPosition(s.x, s.y, s.z); me.matrixWorldNeedsUpdate = true; me.visible = true;
    const u = me.material.uniforms, col = shieldColor(s); u.uCol.value.set(col[0], col[1], col[2]); u.uTime.value = G.t;
    const age = G.t - s.shT; u.uFade.value = (0.45 + 0.55 * (s.sh / s.shMax)) * Math.min(1, (1.35 - age) / 0.5) * 1.5;
    u.uBreak.value = Math.max(0, 1 - (G.t - s.shBreakT) / 0.7);
    [u.uH0, u.uH1, u.uH2].forEach((uh, k) => { const h = s.hits[s.hits.length - 1 - k]; if (!h) { uh.value.set(0, 0, 1, -1); return; }
      const wx = h.x, wy = h.y, wz = h.z, lx = (wx * _sc0.x + wy * _sc0.y + wz * _sc0.z) / rx, ly = (wx * _sc1.x + wy * _sc1.y + wz * _sc1.z) / ry, lz = (wx * _sc2.x + wy * _sc2.y + wz * _sc2.z) / rz, l = Math.hypot(lx, ly, lz) || 1;
      uh.value.set(lx / l, ly / l, lz / l, h.t); });
  }
}

/* ── 鐵墓的兩隻主臂（最上面那一對）：獨立零件，繞肩膀轉動——末日時雙臂舉起、握住巨劍、向下刺 ──
 * 轉軸：先繞「前後軸」把手臂由水平舉到頭頂（雙手在頭頂中線相會握劍柄），再繞「左右軸」往前下壓。 */
function buildTombArms(parts) {
  const pitch = new THREE.Group(), out = { pitch, arm: {}, grip: {} };
  for (const k of ['L', 'R']) {
    const ms = parts[k]; if (!ms.length) return null;
    const sg = k === 'L' ? 1 : -1, bb = new THREE.Box3(); ms.forEach((m) => { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); });
    const px = sg > 0 ? bb.min.x : bb.max.x, th = ms.find((m) => /thorn/.test(m.material.name || '')) || ms[0], py = (th.geometry.boundingBox.min.y + th.geometry.boundingBox.max.y) / 2, sc = Math.abs(px) / 17;   // 肩關節＝最靠近身體的一端；高度取荊棘環中心；sc＝模型縮放
    const g = new THREE.Group(); g.position.set(px, 0, 0); ms.forEach((m) => { m.position.set(-px, -py, 0); g.add(m); });
    const grip = new THREE.Object3D(); grip.position.set(sg * 83 * sc, 0, 0); g.add(grip);   // 掌心位置（距肩 83 單位）
    out.arm[k] = g; out.grip[k] = grip; pitch.add(g); pitch.position.set(0, py, 0);
  }
  return out;
}
const ARM_RAISE = THREE.MathUtils.degToRad(99.7), ARM_THRUST = THREE.MathUtils.degToRad(40);   // 舉起角（雙手在頭頂相會）、下刺時前傾角
function poseTombArms(raise, thrust) {
  if (!tombArms) return;
  tombArms.arm.L.rotation.z = ARM_RAISE * raise; tombArms.arm.R.rotation.z = -ARM_RAISE * raise; tombArms.pitch.rotation.x = ARM_THRUST * thrust;
}

/* ── 末日視覺：巨劍與衝擊波 ── */
const doomObj = { sword: null, light: null, waveS: null, waveR: null };
function buildDoomVisuals() {
  const sw = new THREE.Group();
  const hot = new THREE.Color(5, 1.3, 1.8), core = new THREE.Color(9, 8, 8);
  const mk = (geo, col, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
  const blade = mk(new THREE.ConeGeometry(190, 9000, 4, 1), hot, 0.8); blade.rotation.x = Math.PI; blade.position.y = 4500; blade.rotation.y = Math.PI / 4;
  const bladeCore = mk(new THREE.ConeGeometry(60, 9000, 4, 1), core, 0.95); bladeCore.rotation.x = Math.PI; bladeCore.position.y = 4500; bladeCore.rotation.y = Math.PI / 4;
  const guard = mk(new THREE.BoxGeometry(2600, 150, 260), hot, 0.85); guard.position.y = 9100;
  const grip = mk(new THREE.CylinderGeometry(70, 70, 2400, 8), hot, 0.8); grip.position.y = 10400;
  const halo = glowSprite(0xff3a55, 6000, 0.8, 1.6); halo.position.y = 120;
  sw.add(blade, bladeCore, guard, grip, halo); sw.visible = false; scene.add(sw);
  const L = new THREE.PointLight(0xff4060, 0, 16000, 1.1); scene.add(L);
  const waveMat = window.SW2.nodes.fresnelShellMaterial('wave');
  const ws = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), waveMat); ws.visible = false; ws.frustumCulled = false; scene.add(ws);
  const wr = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1.4, 2), transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  wr.rotation.x = -Math.PI / 2; wr.visible = false; wr.frustumCulled = false; scene.add(wr);
  doomObj.sword = sw; doomObj.light = L; doomObj.waveS = ws; doomObj.waveR = wr;
}
const SWORD_END = MOBIUS_CY, WAVE_Z = TOMB_POS.z + MOBIUS_OFF;   // 衝擊中心＝紐帶中心（巨劍刺穿 ∞ 交叉點的位置）
const _hv = new THREE.Vector3(), _hv2 = new THREE.Vector3(), SWORD_GRIP = 9800;   // 巨劍組：原點在劍尖；雙手握在護手上方 +9800 處
function updateDoomVisuals(dt) {
  const D = doomObj; if (!D.sword) return;
  if (G.mode === 'script' && G.t >= T.DOOM) {
    const p = clamp((G.t - T.DOOM) / (T.IMPACT - T.DOOM), 0, 1), raise = smooth(clamp(p / 0.35, 0, 1)), th = Math.pow(clamp((p - 0.4) / 0.6, 0, 1), 2.2), grow = smooth(clamp((p - 0.15) / 0.3, 0, 1));
    poseTombArms(raise, th);   // 雙臂舉到頭頂 → 握劍往前下方刺
    D.sword.visible = p > 0.12;   // 刺下後劍留在原位，一路演到結尾
    if (tombArms) { tombMeshes.updateMatrixWorld(true); tombArms.grip.L.getWorldPosition(_hv); tombArms.grip.R.getWorldPosition(_hv2); _hv.add(_hv2).multiplyScalar(0.5); } else _hv.set(TOMB_POS.x, TOMB_POS.y + 6200, TOMB_POS.z);
    const sc = 0.25 + 0.75 * grow; D.sword.scale.setScalar(sc); D.sword.position.set(_hv.x, _hv.y - SWORD_GRIP * sc, _hv.z);   // 劍柄始終握在雙手之間
    D.light.position.copy(D.sword.position); D.light.intensity = 3 + raise * 3 + th * 11;
    sky.material.uniforms.uDoom.value = Math.min(1, sky.material.uniforms.uDoom.value + dt * 0.12);
    tombGlow.material.opacity = 0.6 + 0.4 * th;
    if (G.t >= T.IMPACT) {
      const r = G.waveR; D.waveS.visible = D.waveR.visible = true; D.waveS.position.set(TOMB_POS.x, SWORD_END, WAVE_Z); D.waveR.position.copy(D.waveS.position);
      D.waveS.scale.setScalar(Math.max(1, r)); D.waveR.scale.setScalar(Math.max(1, r)); D.waveS.material.uniforms.uA.value = clamp(1 - (G.t - T.IMPACT) / 20, 0, 1) * 0.9 + 0.1;
    }
  }
}

/* ── 解析度與像素縮放 ── */
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false); camera.aspect = cockCam.aspect = W / H; camera.updateProjectionMatrix(); cockCam.updateProjectionMatrix();
  const pr = renderer.getPixelRatio(); hudCv.width = W * pr; hudCv.height = H * pr; hx.setTransform(pr, 0, 0, pr, 0, 0);
  const ps = (H * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2)); dustMat.uniforms.uScale.value = ps;
  if (fx) fx.setPixelScale(ps); if (fleet) fleet.setPixelScale(ps);
  if (post) post.setSize(W, H); starMat.uniforms.uPR.value = renderer.getPixelRatio();
}
addEventListener('resize', resize);
/* 效能守門員：畫面持續卡頓時，依序關閉電影感後處理 → 降低解析度 → 關泛光／精簡特效，並在左上角提示 */
function degradeQuality(stage) {
  if (stage === 1) { if (post && post.cinema) { post.cinema.enabled = false; post.u.uCinema.value = 0; } else renderer.setPixelRatio(1); }
  else if (stage === 2) { renderer.setPixelRatio(1); resize(); }
  else if (stage >= 3) { if (post) post.bloom.enabled = false; G.lite = true; }
  say('Performance mode ' + stage + ': reducing effects', '效能模式 ' + stage + '：自動降低特效', true);
}
const proj = new THREE.Vector3();
function toScreen(x, y, z) { proj.set(x, y, z).project(camera); return { x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, z: proj.z, ok: proj.z < 1 && proj.z > -1 }; }
function pixelsPerRad() { return H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); }

/* ── 相機：飛行員（座艙／追尾）、指揮官（軌道）、過場（末日） ── */
const cam = { x: 0, y: 0, z: 0, mode: 'cockpit', shake: 0 };
const cc = { az: 0.45, pol: 1.0, dist: 24000, tx: 0, ty: TOMB_POS.y, tz: TOMB_POS.z };       // 指揮官相機（目前）：預設看整個環形陣
const ccT = { az: 0.45, pol: 1.0, dist: 24000, tx: 0, ty: TOMB_POS.y, tz: TOMB_POS.z };      // 指揮官相機（目標，輸入改這裡）
let chasePos = new THREE.Vector3(), chaseInit = false;
function placeCamera(dt) {
  let fovT = FOV;
  if (G.doom > 0) {            // 過場：從艦隊後上方望向鐵墓；巨劍降下時鏡頭跟著下移，衝擊後拉開看衝擊波掃來
    const pd = clamp((G.t - T.DOOM) / (T.IMPACT - T.DOOM), 0, 1), pa = clamp((G.t - T.IMPACT) / (T.WHITE - T.IMPACT), 0, 1);
    camera.position.set(2600 - pa * 500, 3800 - pd * 1200 + pa * 500, TOMB_POS.z + 10800 + pa * 600); camera.up.set(0, 1, 0);
    camera.lookAt(0, lerp(7800, 3800, smooth(pd)) - pa * 800, TOMB_POS.z + 800); fovT = 64;
  } else if (G.role === 'commander') {
    const k = 1 - Math.exp(-dt * 9);
    for (const key of ['az', 'pol', 'dist', 'tx', 'ty', 'tz']) cc[key] += (ccT[key] - cc[key]) * k;
    const sp = Math.sin(cc.pol), cp = Math.cos(cc.pol), D = cc.dist * (camera.aspect < 1.3 ? Math.min(1.8, 1.15 / camera.aspect) : 1);
    camera.position.set(cc.tx + D * sp * Math.sin(cc.az), cc.ty + D * cp, cc.tz + D * sp * Math.cos(cc.az)); camera.up.set(0, 1, 0); camera.lookAt(cc.tx, cc.ty, cc.tz); fovT = 50;
  } else {
    const P = player, s = P.ship; if (!s) return;
    const sp01 = clamp(P.vel.length() / 300, 0, 1); fovT = FOV + (P.boost ? 9 : 0) + sp01 * 3;
    speedFx += ((P.boost ? 1 : sp01 * 0.22) - speedFx) * Math.min(1, dt * 3);
    if (cam.mode === 'cockpit' && !P.dead) {
      fleet.anchorWorld(s, 'HP_COCKPIT', V); camera.position.copy(V);
      QT.copy(P.q).multiply(QT2.setFromAxisAngle(AXY, Math.PI)); camera.quaternion.copy(QT);
      cockRoot.rotation.set(-P.w.x * 0.012, -P.w.y * 0.012, -P.w.z * 0.01); cockRoot.position.set(P.w.y * 0.004, -P.w.x * 0.004, 0);
    } else {
      V2.set(0, 0, 1).applyQuaternion(P.q); V3.set(0, 1, 0).applyQuaternion(P.q);
      V.copy(P.pos).addScaledVector(V2, -42).addScaledVector(V3, 11);
      if (!chaseInit) { chasePos.copy(V); chaseInit = true; } else chasePos.lerp(V, Math.min(1, dt * 5));
      camera.position.copy(chasePos); camera.up.copy(V3); camera.lookAt(P.pos.x + V2.x * 80, P.pos.y + V2.y * 80, P.pos.z + V2.z * 80);
    }
  }
  fovCur += (fovT - fovCur) * Math.min(1, dt * 4);
  if (Math.abs(camera.fov - fovCur) > 0.05) { camera.fov = fovCur; camera.updateProjectionMatrix(); }
  if (Math.abs(cockCam.fov - camera.fov) > 0.05) { cockCam.fov = camera.fov; cockCam.updateProjectionMatrix(); }
  if (cam.shake > 0.01) camera.position.add(V.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(cam.shake * (G.role === 'commander' ? 4 : 0.4)));
  cam.x = camera.position.x; cam.y = camera.position.y; cam.z = camera.position.z;
}
function cockpitVisible() { return G.role === 'pilot' && cam.mode === 'cockpit' && !player.dead && G.started && G.doom === 0; }
function render() {
  const cockOn = cockpitVisible();
  if (post) {
    if (post.cinema) {   // 體積光的光源：鐵墓胸口的核心；轉成螢幕座標，位於鏡頭後方時關閉
      const lp = toScreen(TOMB_POS.x, TOMB_POS.y + 2890, TOMB_POS.z), lu = lp.x / W, lv = 1 - lp.y / H, off = Math.max(Math.abs(lu - 0.5), Math.abs(lv - 0.5)), cu = post.cinema.u;
      cu.uLight.value.set(lu, lv); cu.uInt.value = lp.ok ? clamp(1.6 - off * 1.6, 0, 1) * 0.45 * (G.doom > 1 ? 0.4 : 1) : 0;
    }
    { // 劇情分段調色：出征偏冷青 → 交戰漸暖 → 末日血紅（自由模式不調色）
      const g = post.u; let k = 0, r = 1, gg = 1, bb = 1;
      if (G.mode === 'script') {
        if (G.t > T.REVEAL && G.t < T.FLASH) { const p = clamp((G.t - T.REVEAL) / (T.FLASH - T.REVEAL), 0, 1); k = 0.28; r = lerp(0.9, 1.12, p); gg = 1.0; bb = lerp(1.12, 0.92, p); }
        if (G.t >= T.FLASH - 20 && G.t < T.FLASH) { const p = (G.t - (T.FLASH - 20)) / 20; k = lerp(0.28, 0.55, p); r = lerp(1.12, 1.3, p); gg = lerp(1, 0.82, p); bb = lerp(0.92, 0.78, p); }
        if (G.doom > 0) { k = 0.75; r = 1.45; gg = 0.7; bb = 0.68; }
      }
      g.uGradeK.value += (k - g.uGradeK.value) * 0.05; g.uGradeTint.value.x += (r - g.uGradeTint.value.x) * 0.05; g.uGradeTint.value.y += (gg - g.uGradeTint.value.y) * 0.05; g.uGradeTint.value.z += (bb - g.uGradeTint.value.z) * 0.05;
    }
    post.cockpit.enabled = cockOn; const u = post.u; u.uTime.value = performance.now() / 1000; u.uSpeed.value = 0; u.uHurt.value = hurtK;   // 已移除：加速時的徑向速度模糊
    post.composer.render();
  } else {
    renderer.render(scene, camera);
    if (cockOn) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(cockScene, cockCam); renderer.autoClear = true; }
  }
}
function frameUpdate(dt) {
  sky.position.copy(camera.position); stars.position.copy(camera.position); sky.material.uniforms.uTime.value = G.t; hurtK *= Math.exp(-dt * 2.6); updateBoomLights(dt);
  dustMat.uniforms.uCam.value.copy(camera.position); dust.visible = G.role === 'pilot';
  gridMesh.visible = auraLine.visible = G.role === 'commander' && G.doom === 0;
  cockRoot.visible = cockpitVisible();
  if (tombMeshes) tombMeshes.rotation.y = Math.sin(G.t * 0.05) * 0.03;
  mobius.userData.mats.forEach((m) => { m.uniforms.uTime.value = G.t; }); { const pu = 1 + 0.06 * Math.sin(G.t * 1.7); ringCore.scale.setScalar(6200 * pu); ringCore2.scale.setScalar(1500 * pu); } mobius.rotation.x = Math.sin(G.t * 0.07) * 0.06; mobius.rotation.y = Math.sin(G.t * 0.05) * 0.08;   // 只輕微晃動，始終正對聯軍陣線
  updateDoomVisuals(dt); updateBubbleViz(); updateShieldViz(); updateShadows();
}

/* 鐵墓：本體壓暗、環境反射降到最低，只保留邊緣的紅色輪廓光（菲涅爾），像被體內的紅光逆光照亮的巨大剪影 */
function darkenTomb(m) {
  if (m.color) m.color.multiplyScalar(0.34);
  const emissive = m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01; if (emissive) m.emissiveIntensity = 1.5;
  m.envMapIntensity = 0.22; if (window.SW2.envTex) m.envMap = window.SW2.envTex;
  window.SW2.nodes.tombize(m, 1.0);
}

/* ── 螺絲咕姆的光束泡與爆炸衝擊球 ── */
const bubViz = [], blastViz = [];
(function () {
  for (let i = 0; i < 8; i++) { const o = glowSprite(0xffd84a, 500, 0.9, 2.6), c = glowSprite(0xffffff, 220, 1, 4); o.visible = c.visible = false; scene.add(o, c); bubViz.push({ o, c }); }
  const mat = () => window.SW2.nodes.fresnelShellMaterial('blast');
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat()); m.visible = false; m.frustumCulled = false; scene.add(m); blastViz.push(m); }
})();
function updateBubbleViz() {
  for (let i = 0; i < bubViz.length; i++) {
    const v = bubViz[i], b = bubbles[i];
    if (!b) { v.o.visible = v.c.visible = false; continue; }
    v.o.visible = v.c.visible = true; v.o.position.set(b.x, b.y, b.z); v.c.position.copy(v.o.position);
    const k = 1 + 0.1 * Math.sin(b.age * 22); v.o.scale.set(520 * k, 520 * k, 1); v.c.scale.set(230 * k, 230 * k, 1);
  }
  for (let i = 0; i < blastViz.length; i++) {
    const m = blastViz[i], b = blasts[i];
    if (!b) { m.visible = false; continue; }
    const p = clamp(b.age / 1.3, 0, 1), e = 1 - Math.pow(1 - p, 3);
    m.visible = p < 1; m.position.set(b.x, b.y, b.z); m.scale.setScalar(Math.max(1, b.r * (0.12 + 0.88 * e))); m.material.uniforms.uA.value = Math.pow(1 - p, 1.6);
  }
}

/* ── 模型載入完成後建立艦隊渲染、鐵墓與駕駛艙 ── */
function setupRender(a) {
  assets = a;
  Object.keys(a).forEach((k) => { if (k === 'debris') return; prepAsset(a[k], k === 'cockpit' || k === 'moon' ? 0 : 18 / Math.max(a[k].length, 1)); });
  fx = SWFx.create({ scene, debrisParts: a.debris && a.debris.parts, pro: true });
  fleet = SWFleet.create({ scene, assets: a, damageFx: true });
  if (a.irontomb) {
    tombMeshes = new THREE.Group();
    const armParts = { L: [], R: [] };
    a.irontomb.parts.forEach((p) => {
      const m = p.material; darkenTomb(m); const me = new THREE.Mesh(p.geometry, m); me.frustumCulled = false; const sd = /_a([LR])$/.exec(m.name || '');
      if (sd) armParts[sd[1]].push(me); else tombMeshes.add(me);
    });
    tombArms = buildTombArms(armParts); if (tombArms) tombMeshes.add(tombArms.pitch);
    tombMeshes.position.copy(TOMB_POS); tombMeshes.scale.setScalar(TOMB_SCALE); scene.add(tombMeshes);
  }
  if (a.cockpit) a.cockpit.parts.forEach((p) => { const m = p.material; if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01) m.emissiveIntensity = 2.2; const me = new THREE.Mesh(p.geometry, m); me.frustumCulled = false; cockRoot.add(me); });
  Object.keys(fleet.kinds).forEach((k) => fleet.kinds[k].meshes.forEach((me) => { if (me.material.emissive && me.material.emissive.r + me.material.emissive.g + me.material.emissive.b > 0.01) me.material.emissiveIntensity = 1.2; me.material.envMapIntensity = 0.28; if (window.SW2.envTex) me.material.envMap = window.SW2.envTex; }));
  // 高畫質：4× MSAA + 泛光 + 電影感；低畫質：只有最終合成（調色／暈邊／顆粒），不開泛光與電影感
  knobs.msaa = QUALITY === 'high' ? 4 : 0; knobs.bloom = QUALITY === 'high'; knobs.cinema = false;   // v2 預設：體積光關閉（F7 可開）
  rebuildPost();
  buildDoomVisuals(); resize();
}

/* ── 即時陰影（F10，預設關閉）：主光的陰影相機跟著「鏡頭前方約 1.5 km」移動，涵蓋約 ±3 km；大艦的艦橋、砲塔、尾翼會在自己的艦體上投影 ── */
function setupShadows(on) {
  renderer.shadowMap.enabled = on; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const L = lights.key; L.castShadow = on;
  if (on) { const c = L.shadow.camera; c.left = c.bottom = -3000; c.right = c.top = 3000; c.near = 1; c.far = 12000; L.shadow.mapSize.set(2048, 2048); L.shadow.bias = -0.0004; L.shadow.normalBias = 2; if (!L.target.parent) scene.add(L.target); }
  if (fleet) Object.keys(fleet.kinds).forEach((k) => fleet.kinds[k].meshes.forEach((me) => { me.castShadow = on; me.receiveShadow = on; me.material.needsUpdate = true; }));
  if (tombMeshes) tombMeshes.traverse((me) => { if (me.isMesh) { me.receiveShadow = on; me.material.needsUpdate = true; } });
}
function updateShadows() {
  if (!knobs.shadow) return; const L = lights.key;
  camera.getWorldDirection(V3); const fx_ = camera.position.x + V3.x * 1500, fy_ = camera.position.y + V3.y * 1500, fz_ = camera.position.z + V3.z * 1500;
  const q = 40; L.target.position.set(Math.round(fx_ / q) * q, Math.round(fy_ / q) * q, Math.round(fz_ / q) * q);   // 吸附到格點，移動時陰影不閃爍
  L.position.copy(L.target.position).addScaledVector(SUN_DIR, 6000); L.target.updateMatrixWorld();
}
/* ── 效能旋鈕（F3 面板顯示；F4 解析度、F5 抗鋸齒、F6 泛光、F7 體積光、F8 護盾／損傷特效） ── */
const knobs = { res: QUALITY === 'high' ? 1.5 : 1.25, msaa: 0, bloom: false, cinema: false, shadow: false };
function rebuildPost() {   // v2：拿掉拉絲光與鏡頭鬼影（座艙裡像玻璃反光，太擋畫面）；保留體積光
  post = FPVPost.create(renderer, scene, camera, cockScene, cockCam, { width: innerWidth, height: innerHeight, samples: knobs.msaa, hdrBloom: true, strength: 0.42, threshold: 1.15, radius: 0.55, bloom: knobs.bloom, cinema: knobs.cinema, streak: 0, ghost: 0 });
  post.u.uContrast.value = 1.15; post.u.uGrain.value = 0.03; post.u.uVig.value = 0.5; post.u.uSat.value = 1.15;
}
function setKnob(name, v) {
  if (name === 'res') { knobs.res = v; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, v)); resize(); rebuildPost(); }
  else if (name === 'msaa') { knobs.msaa = v; rebuildPost(); }
  else if (name === 'bloom') { knobs.bloom = v; rebuildPost(); }
  else if (name === 'cinema') { knobs.cinema = v; rebuildPost(); }
  else if (name === 'fx') { G.lite = !v; }
  else if (name === 'shadow') { knobs.shadow = v; setupShadows(v); }
}
