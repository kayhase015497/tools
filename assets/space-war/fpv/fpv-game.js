/* fpv-game.js — 第一人稱戰機版：星際聯軍 vs 反物質軍團，鐵墓遠在天邊
 *
 * 尺度：1 單位 = 1 公尺。戰機 14 m；護衛艦 ~85 m；巡洋艦 ~230 m；無畏艦 ~1 km；HSS ~2 km；
 *       月球艦 ~1.5 km；鐵墓高約 6.5 km，位於 15 km 外。時間流速刻意放慢，才看得出「靈活的戰機 vs 巨大的艦隊」。
 *
 * 結構（單檔，但分段清楚，之後要拆檔很容易）：
 *   1 常數與資料表   2 場景與渲染   3 艦艇資料與生成   4 彈道與傷害   5 AI   6 玩家飛行與武器
 *   7 鐵墓與事件   8 HUD   9 輸入   10 主迴圈   11 除錯介面
 * 模擬層只保存純資料，畫面由 SWFleet（InstancedMesh）負責，與主遊戲（game.js）共用同一套模型與特效。
 */
(function () {
'use strict';
const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;

/* ═════════ 1. 常數與資料表 ═════════ */
const FOV = 70;
const TOMB_POS = new THREE.Vector3(0, 1500, -15500), TOMB_SCALE = 34, TOMB_AURA = 4200;
const ARENA_R = 11000;
// 命中球（鐵墓模型座標，單位同模型 248 高；乘以 TOMB_SCALE 後為世界尺寸）：[x, y, z, 半徑]
const TOMB_PARTS = [[0, 86, 0, 22], [0, 40, 0, 22], [-34, 86, 0, 14], [34, 86, 0, 14], [-46, 86, 0, 12], [46, 86, 0, 12], [-105, 86, 0, 14], [105, 86, 0, 14], [-47, 10, 0, 10], [47, 10, 0, 10], [0, 14, 0, 30], [0, -45, 0, 24], [0, -100, 0, 12]];

// side: 'a' 聯軍 / 'e' 反物質軍團。sc = 模型縮放（模型已正規化為其 MANIFEST 長度）。
const DEF = {
  fgt:   { side: 'a', name: 'Interceptor',  hp: 150,    spd: 110, sc: 1,    rad: 8,    turn: 1.7, boom: 0.8 },
  frig:  { side: 'a', name: 'Frigate',      hp: 3000,   spd: 14,  sc: 9,    rad: 40,   range: 1500, cd: 1.3, dmg: 85,  w: 2.5, len: 70,  bs: 760, col: [0.5, 0.9, 1.0], boom: 4 },
  cruis: { side: 'a', name: 'Cruiser',      hp: 9000,   spd: 10,  sc: 11,   rad: 95,   range: 1900, cd: 1.0, dmg: 150, w: 4.5, len: 110, bs: 720, col: [0.5, 0.9, 1.0], boom: 6 },
  cap:   { side: 'a', name: 'Dreadnought',  hp: 42000,  spd: 5,   sc: 20,   rad: 340,  range: 2600, cd: 0.9, dmg: 420, w: 10,  len: 260, bs: 620, col: [0.85, 0.97, 1.0], boom: 12 },
  hss:   { side: 'a', name: 'HSS',          hp: 160000, spd: 2.5, sc: 30,   rad: 700,  range: 3200, cd: 1.0, dmg: 900, w: 20,  len: 480, bs: 560, col: [1.0, 0.85, 0.3], boom: 20 },
  moon:  { side: 'a', name: 'Screwllum Moon', hp: 260000, spd: 1.2, sc: 45, rad: 740,  range: 3400, cd: 6.0, dmg: 0,   w: 0,   len: 0,   bs: 400, col: [1.0, 0.85, 0.3], boom: 24, bubble: 1 },
  fly:   { side: 'e', name: 'Legion Fighter', hp: 90,   spd: 120, sc: 1.5,  rad: 7,    turn: 1.5, boom: 0.8 },
  whale: { side: 'e', name: 'Legion Carrier', hp: 30000, spd: 8,  sc: 14,   rad: 170,  range: 1700, cd: 1.1, dmg: 120, w: 5,   len: 150, bs: 520, col: [0.8, 0.5, 1.0], boom: 9 }
};

/* ═════════ 2. 場景與渲染 ═════════ */
const cv = $('#fpv-canvas'), hudCv = $('#fpv-hud'), hx = hudCv.getContext('2d');
const coarse = matchMedia('(pointer: coarse)').matches;
const QUALITY = Q.get('q') || (coarse ? 'low' : 'high');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: QUALITY === 'high' && !coarse });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY === 'high' ? 2 : 1.25));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03050c);
const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 60000);
const sky = SWEnv.makeSky(30000, { linear: true }); scene.add(sky);
SWEnv.makeEnvironment(renderer, scene);
const lights = SWEnv.addLights(scene, { hemi: 0.85, key: 3.4, rim: 1.1 });
let W = 1, H = 1, post = null, hurtK = 0, fovCur = FOV, speedFx = 0;

// 駕駛艙疊加層：獨立的場景＋相機（近平面極近），畫在主場景之後，不會被艦艇穿插
const cockScene = new THREE.Scene(), cockCam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);
cockCam.rotation.y = Math.PI;
const cockRoot = new THREE.Group(); cockScene.add(cockRoot);
cockScene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a1030, 1.5));
const cockKey = new THREE.DirectionalLight(0xd8e8ff, 2.2); cockKey.position.set(0.4, 1, -0.6); cockScene.add(cockKey);

// 恆星與鐵墓背光
function glowTex() {   // 高斯式平滑衰減：線性管線下，邊緣必須平順歸零，否則提亮後會出現可見的圓盤邊界
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
const tombGlow = glowSprite(0xff2a4a, 16000, 0.6, 1.1); tombGlow.position.copy(TOMB_POS).add(new THREE.Vector3(0, 300, -400)); scene.add(tombGlow);
const tombLight = new THREE.PointLight(0xff3050, 2.2, 22000, 1.2); tombLight.position.copy(TOMB_POS).add(new THREE.Vector3(0, 0, 3000)); scene.add(tombLight);

// 太空塵：以視差表現速度感（著色器內以相機位置取模，永遠包圍玩家）
const DUST = 900;
const dustGeo = new THREE.BufferGeometry(); const dp = new Float32Array(DUST * 3); for (let i = 0; i < dp.length; i++) dp[i] = Math.random();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
const dustMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uCam: { value: new THREE.Vector3() }, uBox: { value: 700 }, uScale: { value: 500 }, uVel: { value: new THREE.Vector3() } },
  vertexShader: 'uniform vec3 uCam; uniform float uBox; uniform float uScale; varying float vA; void main(){ vec3 p = mod(position * uBox - uCam, uBox) - uBox * 0.5; vec4 mv = viewMatrix * vec4(p + uCam, 1.0); float d = length(p); vA = smoothstep(uBox*0.5, uBox*0.15, d); gl_PointSize = clamp(uScale * 1.1 / max(1.0, -mv.z), 1.0, 3.2); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.75,0.85,1.0) * smoothstep(0.5, 0.1, d) * vA * 0.8, 1.0); }' });
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);

// 星空：數千顆不同色溫與亮度的恆星（亮星為 HDR，會帶出 bloom 星芒）
const STARS = 7000, stP = new Float32Array(STARS * 3), stC = new Float32Array(STARS * 3), stS = new Float32Array(STARS);
const STAR_TINT = [[1, 0.82, 0.66], [0.78, 0.86, 1], [1, 1, 1], [1, 0.66, 0.5], [0.7, 0.8, 1]];
for (let i = 0; i < STARS; i++) {
  const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u), b = Math.pow(Math.random(), 7) * 6 + 0.18, c = pick(STAR_TINT);
  stP[i * 3] = Math.cos(a) * r * 24000; stP[i * 3 + 1] = u * 24000; stP[i * 3 + 2] = Math.sin(a) * r * 24000;
  stC[i * 3] = c[0] * b; stC[i * 3 + 1] = c[1] * b; stC[i * 3 + 2] = c[2] * b; stS[i] = 1 + Math.min(4, b) * 0.9;
}
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(stP, 3)); starGeo.setAttribute('aCol', new THREE.BufferAttribute(stC, 3)); starGeo.setAttribute('aSize', new THREE.BufferAttribute(stS, 1));
const starMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uPR: { value: 1 } },
  vertexShader: 'attribute vec3 aCol; attribute float aSize; uniform float uPR; varying vec3 vC; void main(){ vC = aCol; gl_PointSize = aSize * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * a, 1.0); }' });
const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; stars.renderOrder = -9; scene.add(stars);

// 爆炸瞬間的閃光：3 盞循環使用的點光源（數量固定，避免著色器重新編譯）
const BL = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffaa66, 0, 1500, 1.4); scene.add(l); BL.push({ l, k: 0, size: 1 }); }
let bli = 0;
function boomLight(x, y, z, size, col) { const p = BL[bli++ % 3]; p.l.position.set(x, y, z); p.l.color.setRGB(col[0], col[1], col[2]); p.k = 1; p.size = size; p.l.distance = 300 + size * 240; }
function updateBoomLights(dt) { for (const p of BL) { p.k *= Math.exp(-dt * 4.2); p.l.intensity = p.k * (4 + p.size * 7); } }

// 材質：sRGB 顯示色 → 線性；硬表面加上程序化面板接縫（以模型空間座標計算，不需要貼圖）
const LINEARIZED = new Set();
function prepMaterial(m, panelK) {
  if (LINEARIZED.has(m)) return; LINEARIZED.add(m);
  if (m.color) m.color.convertSRGBToLinear();
  const emissive = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01;
  if (m.emissive) m.emissive.convertSRGBToLinear();
  if (!panelK || emissive) return;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vLoc;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLoc = position;');
    sh.fragmentShader = ('varying vec3 vLoc;\nfloat ph3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\n' + sh.fragmentShader).replace('#include <color_fragment>', `#include <color_fragment>
      vec3 pq = vLoc * ${panelK.toFixed(4)};
      vec3 pd = 0.5 - abs(fract(pq) - 0.5);
      vec3 pw = fwidth(pq);
      vec3 pm = 1.0 - smoothstep(vec3(0.0), vec3(0.03) + pw * 1.5, pd);
      float pl = max(pm.x, max(pm.y, pm.z)) * (1.0 - smoothstep(0.25, 0.55, max(pw.x, max(pw.y, pw.z))));
      float ph = ph3(floor(pq + 0.001));
      diffuseColor.rgb *= (0.86 + 0.28 * ph) * (1.0 - 0.5 * pl);`);
  };
  m.customProgramCacheKey = () => 'panel' + panelK.toFixed(3);
}
function prepAsset(a, panelK) { a.parts.forEach((p) => prepMaterial(p.material, panelK)); }

let fx = null, fleet = null, assets = null, tombMeshes = null;
const sw = { assetsReady: false };

function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false); camera.aspect = cockCam.aspect = W / H; camera.updateProjectionMatrix(); cockCam.updateProjectionMatrix();
  const pr = renderer.getPixelRatio(); hudCv.width = W * pr; hudCv.height = H * pr; hx.setTransform(pr, 0, 0, pr, 0, 0);
  const ps = (H * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2)); dustMat.uniforms.uScale.value = ps;
  if (fx) fx.setPixelScale(ps); if (fleet) fleet.setPixelScale(ps);
  if (post) post.setSize(W, H); starMat.uniforms.uPR.value = renderer.getPixelRatio() * 1.0;
}
addEventListener('resize', resize);

/* ═════════ 3. 艦艇資料與生成 ═════════ */
const allies = [], enemies = [];
let t = 0, kills = 0, deaths = 0, wave = 0, started = false, paused = true, nextWave = 8, nextLance = 30, nextReinf = 25, nameN = 0;
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), QT = new THREE.Quaternion(), QT2 = new THREE.Quaternion();
const AXX = new THREE.Vector3(1, 0, 0), AXY = new THREE.Vector3(0, 1, 0), AXZ = new THREE.Vector3(0, 0, 1);

function mkShip(kind, x, y, z, h, o) {
  const d = DEF[kind], s = Object.assign({ kind, d, side: d.side, hp: d.hp, hpMax: d.hp, x, y, z, h: h || 0, p: 0, roll: 0, sx: 1, ph: rnd(0, 100), thr: 0.6,
    scale: d.sc * (o && o.k ? o.k : 1), rad: d.rad * (o && o.k ? o.k : 1), vx: 0, vy: 0, vz: 0, cd: rnd(0, d.cd || 1), hx: x, hy: y, hz: z, tgt: null, mode: 0, mt: 0, id: ++nameN }, o || {});
  (d.side === 'a' ? allies : enemies).push(s); return s;
}
const FWD = (s, out) => { const cp = Math.cos(s.p); return out.set(Math.sin(s.h) * cp, Math.sin(s.p), Math.cos(s.h) * cp); };

function spawnFleet() {
  mkShip('hss', 0, 150, 900, Math.PI, { cd: 1.5 });
  [[-4300, 300, -1500], [4400, -250, -2300], [100, 2400, -3300]].forEach((p) => mkShip('moon', p[0], p[1], p[2], Math.PI));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.4; mkShip('cap', Math.cos(a) * 2300, Math.sin(a * 1.7) * 650, -1800 + Math.sin(a) * 1700, Math.PI); }
  for (let i = 0; i < 10; i++) mkShip('cruis', rnd(-1700, 1700), rnd(-500, 500), rnd(-2900, -400), Math.PI + rnd(-0.1, 0.1));
  for (let i = 0; i < 24; i++) mkShip('frig', rnd(-2600, 2600), rnd(-700, 700), rnd(-3700, -1000), Math.PI + rnd(-0.1, 0.1));
  for (let i = 0; i < 18; i++) mkFighter('fgt', rnd(-500, 500), rnd(-200, 200), rnd(1500, 2500), Math.PI);
  allies.forEach((s) => { if (s.d.hp > 1000) s.hx = s.x; });
}
function mkFighter(kind, x, y, z, h) { const s = mkShip(kind, x, y, z, h); s.spd = DEF[kind].spd * rnd(0.85, 1.1); s.vx = Math.sin(h) * s.spd; s.vz = Math.cos(h) * s.spd; return s; }

function spawnWave() {
  wave++;
  const nW = Math.min(2 + Math.floor(wave / 2), 8), nF = Math.min(10 + wave * 3, 50);
  const live = enemies.filter((e) => e.kind === 'whale').length, liveF = enemies.length - live;
  const ox = rnd(-2500, 2500), oy = rnd(-600, 900), oz = -9500;
  for (let i = 0; i < nW && live + i < 14; i++) { const s = mkShip('whale', ox + rnd(-1800, 1800), oy + rnd(-500, 500), oz + rnd(-1200, 400), 0, { k: rnd(0.8, 1.5) }); s.hp = s.hpMax = s.d.hp * (s.scale / s.d.sc); }
  for (let i = 0; i < nF && liveF + i < 90; i++) { const s = mkFighter('fly', ox + rnd(-2200, 2200), oy + rnd(-700, 700), oz + rnd(-1500, 600), 0); s.mode = 0; }
  log('Antimatter Legion wave ' + wave + ' emerging from the Irontomb', true);
}

/* ═════════ 4. 彈道、傷害與爆炸 ═════════ */
const shots = [];            // 子彈：{x,y,z,vx,vy,vz,life,dmg,side,w,len,col,src,homing}
const NAMES = {};
function fire(src, ox, oy, oz, dx, dy, dz, spd, dmg, w, len, col, life) {
  shots.push({ x: ox, y: oy, z: oz, vx: dx * spd, vy: dy * spd, vz: dz * spd, life: life || 3, dmg, side: src.side, w, len, col, src, spd });
}
const SPLASH = { sparks: 0 };
function impact(x, y, z, big, col) {
  if (!fx) return; const c = col || [1, 0.8, 0.5];
  fx.emit(x, y, z, 0, 0, 0, c[0], c[1], c[2], big * 14, 0.18, 0, 1);
  for (let i = 0; i < 4; i++) fx.emit(x, y, z, rnd(-1, 1) * big * 6, rnd(-1, 1) * big * 6, rnd(-1, 1) * big * 6, 1, 0.7, 0.3, big * 1.4, rnd(0.3, 0.7), 1.2);
}
function damage(s, dmg, x, y, z, src) {
  if (s.dead) return;
  if (s === player.ship) { hurtPlayer(dmg); return; }
  if (s.d.hp > 1000 && src && src.kind === 'fgt') dmg *= dmg > 100 ? 10 : 6;   // 戰機武器針對艦艇的反艦倍率
  s.hp -= dmg; s.hitT = t;
  if (s.hp <= 0) killShip(s, src);
}
function killShip(s, src) {
  if (s.dead) return; s.dead = true; s.hidden = false;
  const d = s.d, big = d.boom >= 3;
  if (s.side === 'e' && src && src.side === 'a') { kills++; if (src === player.ship) player.kills++; }
  const U = big ? clamp(s.scale * 0.55, 3, 22) : 0.8;
  fx.explode(s.x, s.y, s.z, d.boom, s.side === 'e', U);
  boomLight(s.x, s.y, s.z, d.boom, s.side === 'e' ? [1, 0.55, 0.3] : [0.55, 0.8, 1]);
  if (big) {
    const n = Math.min(14, 3 + Math.floor(d.boom / 2));
    for (let i = 0; i < n; i++) { const dx = rnd(-1, 1) * s.rad, dy = rnd(-0.5, 0.5) * s.rad, dz = rnd(-1, 1) * s.rad; fx.later(0.2 + i * rnd(0.15, 0.4), () => fx.explode(s.x + dx, s.y + dy, s.z + dz, d.boom * rnd(0.3, 0.8), s.side === 'e', U * 0.7)); }
    log(d.name + ' destroyed', s.side === 'a');
  }
  const dist = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
  FPVAudio.explode(d.boom, s);
  if (s === player.ship) return;
  if (player.target === s) player.target = null;
}
function hitTest(sx, sy, sz, ex, ey, ez, side) {
  // 線段與敵對艦艇球體相交（回傳最近者與命中點）
  const list = side === 'a' ? enemies : allies; let best = null, bt = 2;
  const dx = ex - sx, dy = ey - sy, dz = ez - sz, L2 = dx * dx + dy * dy + dz * dz || 1;
  const pl = null;   // 玩家艦艇本身就在 allies 陣列中
  for (let pass = 0; pass < 2; pass++) {
    const arr = pass === 0 ? list : pl; if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i]; if (s.dead) continue;
      const rr = s.rad * (s.d.hp > 1000 ? 0.9 : 1), ox = s.x - sx, oy = s.y - sy, oz = s.z - sz;
      let tt = (ox * dx + oy * dy + oz * dz) / L2; tt = clamp(tt, 0, 1);
      const px = sx + dx * tt - s.x, py = sy + dy * tt - s.y, pz = sz + dz * tt - s.z;
      if (px * px + py * py + pz * pz < rr * rr && tt < bt) { bt = tt; best = s; }
    }
  }
  return best ? { s: best, t: bt } : null;
}
function tombHit(sx, sy, sz, ex, ey, ez) {
  for (let i = 0; i < TOMB_PARTS.length; i++) {
    const P = TOMB_PARTS[i], cx = TOMB_POS.x + P[0] * TOMB_SCALE, cy = TOMB_POS.y + P[1] * TOMB_SCALE, cz = TOMB_POS.z + P[2] * TOMB_SCALE, r = P[3] * TOMB_SCALE;
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, L2 = dx * dx + dy * dy + dz * dz || 1;
    const tt = clamp(((cx - sx) * dx + (cy - sy) * dy + (cz - sz) * dz) / L2, 0, 1);
    const px = sx + dx * tt - cx, py = sy + dy * tt - cy, pz = sz + dz * tt - cz;
    if (px * px + py * py + pz * pz < r * r) return true;
  }
  return false;
}
let ironDmg = 0;
function stepShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const b = shots[i];
    if (b.homing) { if (!stepMissile(b, dt)) { shots.splice(i, 1); } continue; }
    const px = b.x, py = b.y, pz = b.z;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
    let dead = b.life <= 0;
    const h = hitTest(px, py, pz, b.x, b.y, b.z, b.side);
    if (h) {
      const hx_ = px + (b.x - px) * h.t, hy_ = py + (b.y - py) * h.t, hz_ = pz + (b.z - pz) * h.t;
      b.x = hx_; b.y = hy_; b.z = hz_; impact(hx_, hy_, hz_, clamp(b.w * 1.4, 1, 14), b.col);
      damage(h.s, b.dmg, hx_, hy_, hz_, b.src); dead = true;
    } else if (b.side === 'a' && b.src === player.ship && tombHit(px, py, pz, b.x, b.y, b.z)) {
      impact(b.x, b.y, b.z, 22, [1, 0.3, 0.4]); ironDmg += b.dmg; dead = true;
    }
    if (dead) { shots.splice(i, 1); continue; }
    const L = b.len, inv = 1 / (b.spd || 1);
    fx.beam(b.x - b.vx * inv * L, b.y - b.vy * inv * L, b.z - b.vz * inv * L, b.x, b.y, b.z, { color: b.col, width: b.w, dur: Math.max(dt * 1.6, 0.03), len: 0 });
  }
}
function stepMissile(m, dt) {
  const tg = m.tgt;
  if (tg && !tg.dead) {
    V.set(tg.x - m.x, tg.y - m.y, tg.z - m.z); const dist = V.length(); V.divideScalar(dist || 1);
    V2.set(m.vx, m.vy, m.vz); const sp = Math.min(m.spd + 330 * dt, 340); V2.normalize();
    V2.lerp(V, Math.min(1, 2.6 * dt)).normalize(); m.spd = sp; m.vx = V2.x * sp; m.vy = V2.y * sp; m.vz = V2.z * sp;
    if (dist < tg.rad + 14) { impact(m.x, m.y, m.z, 8, [1, 0.8, 0.4]); fx.explode(m.x, m.y, m.z, 1.4, true, 1); boomLight(m.x, m.y, m.z, 1.4, [1, 0.7, 0.4]); FPVAudio.explode(1.4, m); damage(tg, m.dmg, m.x, m.y, m.z, m.src); return false; }
  } else { m.spd = Math.min(m.spd + 330 * dt, 340); m.vx = m.fx * m.spd; m.vy = m.fy * m.spd; m.vz = m.fz * m.spd; }
  m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
  fx.emit(m.x, m.y, m.z, rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), 1, 0.7, 0.35, 5, 0.7, 1.5);
  fx.emit(m.x, m.y, m.z, 0, 0, 0, 1, 1, 0.9, 4, 0.05, 0, 0);
  return m.life > 0;
}

/* ═════════ 5. AI ═════════ */
function nearest(s, list, maxD, filter) {
  let best = null, bd = maxD * maxD;
  for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.dead || (filter && !filter(e))) continue; const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = e; } }
  return best;
}
function leadPoint(src, tgt, spd, out) {
  const dx = tgt.x - src.x, dy = tgt.y - src.y, dz = tgt.z - src.z, vx = tgt.vx - (src.vx || 0) * 0.0, vy = tgt.vy, vz = tgt.vz;
  const a = vx * vx + vy * vy + vz * vz - spd * spd, b = 2 * (dx * vx + dy * vy + dz * vz), c = dx * dx + dy * dy + dz * dz;
  let tt = 0; if (Math.abs(a) < 1e-4) tt = -c / (b || 1); else { const disc = b * b - 4 * a * c; if (disc >= 0) { const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a); tt = Math.min(r1 > 0 ? r1 : 1e9, r2 > 0 ? r2 : 1e9); if (tt > 1e8) tt = Math.sqrt(c) / spd; } else tt = Math.sqrt(c) / spd; }
  tt = clamp(tt, 0, 6); return out.set(tgt.x + vx * tt, tgt.y + vy * tt, tgt.z + vz * tt);
}
function turnToward(s, tx, ty, tz, dt, rate) {
  const dx = tx - s.x, dy = ty - s.y, dz = tz - s.z, hd = Math.atan2(dx, dz), pd = Math.atan2(dy, Math.hypot(dx, dz));
  let dh = hd - s.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); const dp_ = pd - s.p;
  const mh = clamp(dh, -rate * dt, rate * dt), mp = clamp(dp_, -rate * 0.8 * dt, rate * 0.8 * dt);
  s.h += mh; s.p = clamp(s.p + mp, -1.25, 1.25); s.roll += (clamp(-mh / dt * 0.45, -1.1, 1.1) - s.roll) * Math.min(1, dt * 4);
  return Math.abs(dh) + Math.abs(dp_);
}
function moveFwd(s, spd, dt) { FWD(s, V); s.vx = V.x * spd; s.vy = V.y * spd; s.vz = V.z * spd; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; }

function aiFighter(s, dt) {
  const foes = s.side === 'a' ? enemies : allies, d = s.d;
  s.mt -= dt;
  if (!s.tgt || s.tgt.dead || s.mt <= 0 && s.mode === 0 && Math.random() < 0.02) {
    if (s.side === 'a') s.tgt = nearest(s, foes, 6000, (e) => e.kind === 'fly') || nearest(s, foes, 9000);
    else { const pf = player.ship && !player.ship.dead && Math.random() < 0.18 ? player.ship : null; s.tgt = pf || (Math.random() < 0.45 ? nearest(s, allies, 4000, (e) => e.kind === 'fgt') : null) || nearest(s, allies, 9000, (e) => e.d.hp > 1000) || nearest(s, allies, 12000); }
    s.mt = rnd(4, 9);
  }
  const tg = s.tgt; let spd = s.spd || d.spd;
  if (!tg) { turnToward(s, s.x + Math.sin(s.h) * 500, s.y, s.z + Math.cos(s.h) * 500, dt, 0.5); moveFwd(s, spd * 0.7, dt); return; }
  const dx = tg.x - s.x, dy = tg.y - s.y, dz = tg.z - s.z, dist = Math.hypot(dx, dy, dz), big = tg.d.hp > 1000;
  if (s.mode === 1) {                                  // 突破後脫離：朝隨機方向拉開再回頭
    turnToward(s, s.bx, s.by, s.bz, dt, d.turn); moveFwd(s, spd * 1.1, dt); s.mt -= dt;
    if (Math.hypot(s.bx - s.x, s.by - s.y, s.bz - s.z) < 300 || s.mt < -5) { s.mode = 0; s.mt = 0; }
    return;
  }
  const aimP = leadPoint(s, tg, big ? 760 : 1300, V3);
  const err = turnToward(s, aimP.x, aimP.y, aimP.z, dt, d.turn);
  moveFwd(s, dist < 260 ? spd * 0.9 : spd, dt);
  s.cd -= dt;
  const range = big ? 1100 : 900;
  if (s.cd <= 0 && err < 0.1 && dist < range) {
    s.cd = s.side === 'a' ? 0.18 : 0.32; FWD(s, V2);
    const gun = fleet.gunWorld(s, V); const dmg = s.side === 'a' ? 10 : (tg === player.ship ? 7 : 9);
    fire(s, gun.x, gun.y, gun.z, V2.x + rnd(-0.012, 0.012), V2.y + rnd(-0.012, 0.012), V2.z + rnd(-0.012, 0.012), 1300, dmg, 0.35, 28, s.side === 'a' ? [0.4, 0.9, 1] : [1, 0.35, 0.8], 1.6);
    FPVAudio.fire(s.side === 'a' ? 'ally' : 'enemy', gun);
  }
  if (dist < (big ? tg.rad * 0.7 + 90 : 120)) { s.mode = 1; s.bx = s.x + rnd(-1, 1) * 900 + V2.x * 500; s.by = s.y + rnd(-1, 1) * 500; s.bz = s.z + rnd(-1, 1) * 900; s.mt = 0; }
}

function aiCapital(s, dt) {
  const d = s.d, foes = s.side === 'a' ? enemies : allies;
  s.mt -= dt;
  if (s.side === 'a') {   // 聯軍：保持陣型（緩慢漂移），船首略朝向最近的敵人
    const hx_ = s.hx + Math.sin(t * 0.03 + s.id) * 90, hz_ = s.hz + Math.cos(t * 0.025 + s.id) * 90, hy_ = s.hy + Math.sin(t * 0.02 + s.id * 2) * 40;
    const dx = hx_ - s.x, dy = hy_ - s.y, dz = hz_ - s.z, dd = Math.hypot(dx, dy, dz);
    if (s.mt <= 0) { s.tgt = nearest(s, foes, 6500, (e) => e.d.hp > 1000) || null; s.mt = 5; }
    if (s.tgt && !s.tgt.dead) turnToward(s, s.tgt.x, s.tgt.y, s.tgt.z, dt, 0.045); else turnToward(s, s.x, s.y, s.z - 1000, dt, 0.03);
    const sp = Math.min(d.spd, dd * 0.3); s.vx = dx / (dd || 1) * sp; s.vy = dy / (dd || 1) * sp; s.vz = dz / (dd || 1) * sp;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.p *= 0.99;
  } else {                // 反物質軍團：朝最近的聯軍大艦推進，接近後環繞
    if (s.mt <= 0) { s.tgt = nearest(s, allies, 14000, (e) => e.d.hp > 1000) || null; s.mt = 6; }
    const tg = s.tgt && !s.tgt.dead ? s.tgt : null;
    if (tg) { const dist = Math.hypot(tg.x - s.x, tg.y - s.y, tg.z - s.z); turnToward(s, tg.x, tg.y, tg.z, dt, 0.06); moveFwd(s, dist > 1500 ? d.spd : d.spd * 0.3, dt); } else moveFwd(s, d.spd * 0.5, dt);
  }
  s.cd -= dt;
  if (s.cd <= 0) {
    s.cd = d.cd * rnd(0.7, 1.3);
    let tg = nearest(s, foes, d.range);
    if (!tg && s.side === 'e' && player.ship && !player.ship.dead && Math.hypot(player.ship.x - s.x, player.ship.y - s.y, player.ship.z - s.z) < d.range) tg = player.ship;
    if (!tg) return;
    if (d.bubble) { launchBubble(s, tg); return; }
    if (!tg.vx && tg.vx !== 0) tg.vx = tg.vy = tg.vz = 0;
    const gun = fleet.gunWorld(s, V); const aim = leadPoint(gun2(gun), tg, d.bs, V3);
    aim.x += rnd(-1, 1) * tg.rad * 0.5; aim.y += rnd(-1, 1) * tg.rad * 0.4; aim.z += rnd(-1, 1) * tg.rad * 0.5;
    V2.set(aim.x - gun.x, aim.y - gun.y, aim.z - gun.z).normalize();
    fire(s, gun.x, gun.y, gun.z, V2.x, V2.y, V2.z, d.bs, d.dmg, d.w, d.len, d.col, d.range / d.bs + 0.5);
    FPVAudio.cannon(gun);
  }
}
const _g2 = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }; function gun2(g) { _g2.x = g.x; _g2.y = g.y; _g2.z = g.z; return _g2; }
function launchBubble(s, tg) {   // 螺絲咕姆月球艦：巨型光束泡，抵達後範圍爆炸
  const gx = s.x + rnd(-1, 1) * 200, gy = s.y + rnd(-1, 1) * 200, gz = s.z + rnd(-1, 1) * 200, aim = leadPoint({ x: gx, y: gy, z: gz }, tg, s.d.bs, V3), ax = aim.x, ay = aim.y, az = aim.z;
  const dist = Math.hypot(ax - gx, ay - gy, az - gz), T = dist / s.d.bs;
  fx.beam(gx, gy, gz, ax, ay, az, { color: [1, 0.85, 0.35], width: 90, dur: T, len: 260 }); FPVAudio.cannon({ x: gx, y: gy, z: gz });
  fx.later(T, () => {
    fx.explode(ax, ay, az, 5, true, 14); boomLight(ax, ay, az, 6, [1, 0.8, 0.4]); FPVAudio.explode(10, { x: ax, y: ay, z: az });
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.dead) continue; const dd = Math.hypot(e.x - ax, e.y - ay, e.z - az); if (dd < 520 + e.rad) damage(e, 9000 * (1 - dd / (700 + e.rad)) + 800, e.x, e.y, e.z, s); }
  });
}

/* ═════════ 6. 玩家飛行與武器 ═════════ */
const cam = { x: 0, y: 0, z: 0, mode: 'cockpit', pos: new THREE.Vector3(), shake: 0 };
const player = { ship: null, q: new THREE.Quaternion(), pos: new THREE.Vector3(0, 80, 3400), vel: new THREE.Vector3(), w: new THREE.Vector3(),
  thr: 0.45, boost: false, energy: 100, heat: 100, shield: 300, shieldMax: 300, hull: 400, hullMax: 400, missiles: 8, mslT: 0, lastHit: -99, assist: true, invert: false,
  target: null, fireCd: 0, mslCd: 0, dead: false, respawn: 0, kills: 0, strafe: new THREE.Vector3(), roll: 0 };
const DBG = { aim: false };
const input = { keys: {}, mx: 0, my: 0, lmb: false, rmb: false };

function spawnPlayer() {
  player.pos.set(1900 + rnd(-100, 100), 380, 2900); player.vel.set(0, 0, -50); player.w.set(0, 0, 0);
  player.q.setFromAxisAngle(AXY, Math.PI); player.thr = 0.45; player.shield = player.shieldMax; player.hull = player.hullMax; player.energy = 100; player.heat = 100; player.missiles = 8;
  player.dead = false; player.target = null; if (deaths > 0) FPVAudio.respawn();
  if (!player.ship) { player.ship = mkShip('fgt', 0, 0, 0, 0); player.ship.isPlayer = true; player.ship.q = player.q; }
  const s = player.ship; s.dead = false; s.hidden = cam.mode === 'cockpit'; s.hp = s.hpMax;
  if (allies.indexOf(s) < 0) allies.push(s);
}
function hurtPlayer(dmg) {
  if (player.dead) return; player.lastHit = t; cam.shake = Math.min(1.6, cam.shake + dmg * 0.02 + 0.2);
  if (player.shield > 0) { const a = Math.min(player.shield, dmg); player.shield -= a; dmg -= a; FPVAudio.shield(); flash(0.35, true); hurtK = Math.min(1, hurtK + 0.06); }
  if (dmg > 0) { player.hull -= dmg; hurtK = Math.min(1, hurtK + 0.3 + dmg * 0.01); FPVAudio.hit(); flash(0.9); if (player.hull <= 0) playerDie(); }
}
function playerDie() {
  player.dead = true; player.respawn = 5; const s = player.ship; s.dead = true; s.hidden = true; deaths++;
  fx.explode(s.x, s.y, s.z, 1.6, false, 1.3); FPVAudio.explode(3); log('Pilot lost. Re-deploying from the HSS hangar…', true);
  const i = allies.indexOf(s); if (i >= 0) allies.splice(i, 1);
}
function stepPlayer(dt) {
  const k = input.keys, P = player;
  if (P.dead) { P.respawn -= dt; if (P.respawn <= 0) spawnPlayer(); return; }
  // 角速度（本地：x=俯仰, y=偏航, z=翻滾）：滑鼠給目標角速度，再以慣性平滑
  const sens = 0.0016, inv = P.invert ? -1 : 1;
  let tx = clamp(input.my * sens / dt * inv, -1.7, 1.7), ty = clamp(-input.mx * sens / dt, -1.5, 1.5);
  tx += ((k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0)) * -1.2 * inv; ty += ((k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)) * 1.1;
  const tz = ((k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0)) * 2.0;
  input.mx = input.my = 0;
  const kk = 1 - Math.exp(-dt * 7); P.w.x += (tx - P.w.x) * kk; P.w.y += (ty - P.w.y) * kk; P.w.z += (tz - P.w.z) * kk;
  QT.setFromAxisAngle(AXX, P.w.x * dt); P.q.multiply(QT); QT.setFromAxisAngle(AXY, P.w.y * dt); P.q.multiply(QT); QT.setFromAxisAngle(AXZ, P.w.z * dt); P.q.multiply(QT); P.q.normalize();
  // 推力
  if (k.KeyW) P.thr = Math.min(1, P.thr + dt * 0.5); if (k.KeyS) P.thr = Math.max(0, P.thr - dt * 0.5);
  if (k.KeyX) P.thr = Math.max(0, P.thr - dt * 2.5);
  const wasBoost = P.boost; P.boost = !!k.ShiftLeft && P.energy > 4 && P.thr > 0.05; if (P.boost && !wasBoost) FPVAudio.boost(); P.energy = clamp(P.energy + (P.boost ? -26 : 11) * dt, 0, 100);
  const vmax = 170, vt = P.thr * vmax * (P.boost ? 2.4 : 1);
  const sx = ((k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0)) * 55, sy = ((k.KeyR ? 1 : 0) - (k.KeyF ? 1 : 0)) * 55;   // 本地 +X 為艦左
  V.set(sx, sy, vt).applyQuaternion(P.q);
  if (P.assist) { const a = 1 - Math.exp(-dt * (k.KeyX ? 2.4 : 1.1)); P.vel.lerp(V, a); }
  else { V.set(sx * 0.6, sy * 0.6, (P.thr * 90 * (P.boost ? 2.4 : 1))).applyQuaternion(P.q); P.vel.addScaledVector(V, dt); if (P.vel.length() > 420) P.vel.setLength(420); }
  if (DBG.aim && P.target && !P.target.dead) { V.set(P.target.x - P.pos.x, P.target.y - P.pos.y, P.target.z - P.pos.z).normalize(); QT.setFromUnitVectors(AXZ, V); P.q.copy(QT); }
  P.pos.addScaledVector(P.vel, dt);
  // 邊界與鐵墓威壓
  const dc = P.pos.length(); if (dc > ARENA_R) { P.vel.addScaledVector(V.copy(P.pos).normalize(), -140 * dt); setCenter('LEAVING BATTLE AREA · TURN BACK', true); }
  const dt_ = V.copy(P.pos).sub(TOMB_POS).length();
  if (dt_ < TOMB_AURA) { P.vel.addScaledVector(V.copy(P.pos).sub(TOMB_POS).normalize(), 220 * dt); hurtPlayerSoft(dt * 35); setCenter('IRONTOMB PRESSURE · BACK OFF', true); } else if (dc <= ARENA_R) setCenter('', false);
  // 護盾再生與武器
  if (t - P.lastHit > 4) P.shield = Math.min(P.shieldMax, P.shield + 55 * dt);
  if (P.hull < P.hullMax * 0.35) FPVAudio.alarm();
  P.heat = clamp(P.heat + 24 * dt, 0, 100); P.fireCd -= dt; P.mslCd -= dt; P.mslT += dt; if (P.mslT > 14 && P.missiles < 8) { P.missiles++; P.mslT = 0; }
  const s = P.ship; s.x = P.pos.x; s.y = P.pos.y; s.z = P.pos.z; s.vx = P.vel.x; s.vy = P.vel.y; s.vz = P.vel.z; s.thr = P.thr + (P.boost ? 0.5 : 0); s.q = P.q;
  if ((input.lmb || k.Space) && P.fireCd <= 0 && P.heat > 8) playerFire();
  if ((input.rmb || k.ControlLeft) && P.mslCd <= 0) playerMissile();
  cam.shake *= Math.exp(-dt * 5);
}
function hurtPlayerSoft(d) { if (player.shield > 0) player.shield = Math.max(0, player.shield - d); else { player.hull -= d * 0.6; if (player.hull <= 0) playerDie(); } }
let gunSide = 0;
function playerFire() {
  const P = player, s = P.ship; P.fireCd = 0.11; P.heat -= 3.2; gunSide = (gunSide + 1) % 4;
  fleet.gunWorld(s, V); s.gi = gunSide - 1; const gun = fleet.gunWorld(s, V);   // 四挺炮輪流
  // 收斂點：目標鎖定時瞄準提前量，否則 800 m 前方
  V2.set(0, 0, 1).applyQuaternion(P.q);
  let tx_ = P.pos.x + V2.x * 900, ty_ = P.pos.y + V2.y * 900, tz_ = P.pos.z + V2.z * 900;
  const T_ = P.target;
  if (T_ && !T_.dead) { const l = leadPoint({ x: gun.x, y: gun.y, z: gun.z }, T_, 1900, V3); const ang = V3.clone().sub(P.pos).normalize().dot(V2); if (ang > 0.985) { tx_ = l.x; ty_ = l.y; tz_ = l.z; } }
  V3.set(tx_ - gun.x, ty_ - gun.y, tz_ - gun.z).normalize();
  fire(s, gun.x, gun.y, gun.z, V3.x, V3.y, V3.z, 1900 + P.vel.length() * 0.3, 16, 0.5, 34, [0.45, 0.95, 1], 2.1);
  FPVAudio.fire('player', { pan: gunSide < 2 ? -0.35 : 0.35 });
}
function playerMissile() {
  const P = player; if (P.missiles <= 0 || !P.target || P.target.dead) return;
  P.mslCd = 0.8; P.missiles--; V2.set(0, 0, 1).applyQuaternion(P.q); fleet.anchorWorld(P.ship, 'HP_ENGINE_1', V);
  shots.push({ homing: true, x: P.pos.x + V2.x * 12, y: P.pos.y - 3, z: P.pos.z + V2.z * 12, vx: P.vel.x, vy: P.vel.y, vz: P.vel.z, fx: V2.x, fy: V2.y, fz: V2.z, spd: Math.max(150, P.vel.length()), life: 9, dmg: 420, side: 'a', src: P.ship, tgt: P.target });
  FPVAudio.missile();
}
function cycleTarget(mode) {
  const prev = player.target; const P = player, list = enemies.filter((e) => !e.dead && Math.hypot(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z) < 6000); if (!list.length) { P.target = null; return; }
  V2.set(0, 0, 1).applyQuaternion(P.q);
  if (mode === 'reticle') { let b = null, bs = -2; list.forEach((e) => { V.set(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z); const dist = V.length(); const sc = V.normalize().dot(V2) - dist * 0.00002 + (e.d.hp > 1000 ? 0.0 : 0.02); if (sc > bs) { bs = sc; b = e; } }); P.target = b; }
  else { list.sort((a, b) => Math.hypot(a.x - P.pos.x, a.y - P.pos.y, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.y - P.pos.y, b.z - P.pos.z)); const i = list.indexOf(P.target); P.target = list[(i + 1) % list.length]; }
  FPVAudio.lock(P.target && P.target !== prev);
}

let trT = 0;
function trails(dt) {   // 戰機尾焰：鏡頭附近的戰機每 0.05 秒在引擎噴口留下一顆會擴散的光點
  trT -= dt; if (trT > 0) return; trT = 0.05;
  const lists = [allies, enemies];
  for (let L = 0; L < 2; L++) {
    const arr = lists[L], col = L === 0 ? [0.35, 0.75, 1.0] : [1.0, 0.35, 0.85];
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i]; if (s.dead || s.hidden || (s.kind !== 'fgt' && s.kind !== 'fly')) continue;
      if (Math.abs(s.x - cam.x) > 2400 || Math.abs(s.z - cam.z) > 2400 || Math.abs(s.y - cam.y) > 2400) continue;
      for (let e = 1; e <= 2; e++) { fleet.anchorWorld(s, 'HP_ENGINE_' + e, V); fx.emit(V.x, V.y, V.z, -s.vx * 0.04 + rnd(-1, 1), -s.vy * 0.04 + rnd(-1, 1), -s.vz * 0.04 + rnd(-1, 1), col[0], col[1], col[2], s.kind === 'fgt' ? 2.6 : 2.2, 0.6, 1.4, 0, 0.6); }
    }
  }
}
function flybys() {   // 敵機貼近玩家高速掠過時的「咻」聲
  const P = player; if (P.dead) return;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (e.dead || e.kind !== 'fly' || (e.flyT || 0) > t) continue;
    const dx = e.x - P.pos.x, dy = e.y - P.pos.y, dz = e.z - P.pos.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 130 * 130) { e.flyT = t + 4; FPVAudio.flyby(e); }
  }
}
/* ═════════ 7. 鐵墓與事件 ═════════ */
function lanceStrike() {
  const tg = pick(allies.filter((s) => s.d.hp >= 3000 && s.d.hp < 100000 && !s.dead)); if (!tg) return;
  const ox = TOMB_POS.x + rnd(-1, 1) * 600, oy = TOMB_POS.y + 700, oz = TOMB_POS.z + 800;
  const dist = Math.hypot(tg.x - ox, tg.y - oy, tg.z - oz), T = dist / 3200;
  fx.beam(ox, oy, oz, tg.x, tg.y, tg.z, { color: [1, 0.2, 0.3], width: 120, dur: T + 1.2, len: 1800 });
  FPVAudio.lance(); log('Irontomb lance fired · ' + tg.d.name + ' targeted', true);
  fx.later(T + 0.3, () => { if (tg.dead) return; fx.explode(tg.x, tg.y, tg.z, 4, true, 12); damage(tg, 28000, tg.x, tg.y, tg.z, null); });
}
function reinforce() {
  const live = allies.filter((s) => s.kind === 'frig' && !s.dead).length; if (live >= 24) return;
  const s = mkShip('frig', rnd(-2200, 2200), rnd(-500, 500), 4200, Math.PI); s.hx = rnd(-2400, 2400); s.hy = rnd(-600, 600); s.hz = rnd(-3300, -1200);
  s.vz = -14; log('Alliance reinforcements arriving', false);
}
function stepWorld(dt) {
  t += dt;
  if (t >= nextWave) { nextWave = t + Math.max(26, 48 - wave * 1.5); spawnWave(); }
  if (t >= nextLance) { nextLance = t + rnd(35, 60); lanceStrike(); }
  if (t >= nextReinf) { nextReinf = t + 20; reinforce(); }
  for (let i = 0; i < allies.length; i++) { const s = allies[i]; if (s.dead || s.isPlayer) continue; if (s.kind === 'fgt') aiFighter(s, dt); else if (s.d.hp > 1000) aiCapital(s, dt); }
  for (let i = 0; i < enemies.length; i++) { const s = enemies[i]; if (s.dead) continue; if (s.kind === 'fly') aiFighter(s, dt); else aiCapital(s, dt); }
  stepPlayer(dt); stepShots(dt); flybys(); trails(dt);
  // 艦艇互撞的簡易排斥（只處理大艦與戰機）
  for (let i = allies.length - 1; i >= 0; i--) if (allies[i].dead && !allies[i].isPlayer) allies.splice(i, 1);
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
  if (player.target && player.target.dead) player.target = null;
}

/* ═════════ 8. HUD ═════════ */
const logEl = $('#fpv-log'), centerEl = $('#fpv-center'), flashEl = $('#fpv-flash');
function log(msg, warn) {
  const d = document.createElement('div'); d.textContent = msg; if (warn) d.className = 'warn'; logEl.appendChild(d);
  setTimeout(() => d.classList.add('out'), 6000); setTimeout(() => d.remove(), 7200); while (logEl.children.length > 5) logEl.firstChild.remove();
}
let centerOn = false; function setCenter(msg, on) { if (on !== centerOn || (on && centerEl.textContent !== msg)) { centerEl.textContent = msg; centerEl.classList.toggle('on', on); centerOn = on; } }
let flashT = 0; function flash(a, blue) { flashEl.style.background = blue ? 'radial-gradient(ellipse at center, transparent 45%, rgba(60,160,255,.6) 100%)' : 'radial-gradient(ellipse at center, transparent 40%, rgba(255,40,70,.75) 100%)'; flashEl.style.opacity = a; clearTimeout(flashT); flashT = setTimeout(() => { flashEl.style.opacity = 0; }, 90); }

const proj = new THREE.Vector3();
function toScreen(x, y, z) { proj.set(x, y, z).project(camera); return { x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, z: proj.z, ok: proj.z < 1 && proj.z > -1 }; }
function bracket(x, y, r, col, lw) { hx.strokeStyle = col; hx.lineWidth = lw || 1.5; const c = Math.max(5, r * 0.35); hx.beginPath();
  hx.moveTo(x - r, y - r + c); hx.lineTo(x - r, y - r); hx.lineTo(x - r + c, y - r); hx.moveTo(x + r - c, y - r); hx.lineTo(x + r, y - r); hx.lineTo(x + r, y - r + c);
  hx.moveTo(x + r, y + r - c); hx.lineTo(x + r, y + r); hx.lineTo(x + r - c, y + r); hx.moveTo(x - r + c, y + r); hx.lineTo(x - r, y + r); hx.lineTo(x - r, y + r - c); hx.stroke(); }
function fmtD(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; }
function bar(x, y, w, h, v, col, label) { hx.fillStyle = 'rgba(8,16,32,.7)'; hx.fillRect(x, y, w, h); hx.fillStyle = col; hx.fillRect(x + 1, y + 1, (w - 2) * clamp(v, 0, 1), h - 2); hx.strokeStyle = 'rgba(143,230,255,.35)'; hx.strokeRect(x, y, w, h); hx.fillStyle = '#9fb4cc'; hx.font = '10px "Space Mono", monospace'; hx.textAlign = 'left'; hx.fillText(label, x, y - 4); }

function drawFlare() {   // 恆星的鏡頭光暈與鬼影（在 HUD 畫布上以加色疊合）
  camera.getWorldDirection(V); const d = V.dot(SUN_DIR); if (d < 0.25) return;
  const sp = toScreen(cam.x + SUN_DIR.x * 20000, cam.y + SUN_DIR.y * 20000, cam.z + SUN_DIR.z * 20000); if (!sp.ok) return;
  const k = clamp((d - 0.25) / 0.75, 0, 1), cx = W / 2, cy = H / 2, R = Math.min(W, H);
  hx.save(); hx.globalCompositeOperation = 'lighter';
  const g = hx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R * 0.45); g.addColorStop(0, 'rgba(255,240,215,' + (0.55 * k) + ')'); g.addColorStop(0.25, 'rgba(255,200,150,' + (0.14 * k) + ')'); g.addColorStop(1, 'rgba(255,170,120,0)'); hx.fillStyle = g; hx.fillRect(0, 0, W, H);
  const ghosts = [[-0.35, 0.05, '120,170,255', 0.10], [0.45, 0.09, '255,170,110', 0.08], [0.9, 0.03, '150,255,200', 0.10], [1.35, 0.16, '255,120,170', 0.05], [-0.8, 0.07, '255,230,150', 0.06]];
  for (const q of ghosts) { const x = sp.x + (cx - sp.x) * (1 + q[0]) , y = sp.y + (cy - sp.y) * (1 + q[0]), r = R * q[1], gg = hx.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'rgba(' + q[2] + ',' + (q[3] * k) + ')'); gg.addColorStop(0.7, 'rgba(' + q[2] + ',' + (q[3] * k * 0.5) + ')'); gg.addColorStop(1, 'rgba(' + q[2] + ',0)'); hx.fillStyle = gg; hx.beginPath(); hx.arc(x, y, r, 0, TAU); hx.fill(); }
  hx.restore();
}
function drawHud() {
  hx.clearRect(0, 0, W, H); if (!started) return;
  drawFlare();
  const P = player, cx = W / 2, cy = H / 2, sc = Math.min(W, H) / 720;
  hx.font = '11px "Space Mono", monospace'; hx.textBaseline = 'middle';
  if (P.dead) { hx.fillStyle = 'rgba(255,255,255,.8)'; hx.textAlign = 'center'; hx.font = '16px "Space Mono"'; hx.fillText('PILOT LOST · REDEPLOY IN ' + Math.ceil(P.respawn), cx, cy); return; }
  // 準星（沿機首）與速度向量
  hx.strokeStyle = 'rgba(143,255,230,.85)'; hx.lineWidth = 1.5; hx.beginPath(); hx.arc(cx, cy, 14 * sc, 0, TAU); hx.moveTo(cx - 24 * sc, cy); hx.lineTo(cx - 8 * sc, cy); hx.moveTo(cx + 8 * sc, cy); hx.lineTo(cx + 24 * sc, cy); hx.moveTo(cx, cy - 24 * sc); hx.lineTo(cx, cy - 8 * sc); hx.stroke();
  if (P.vel.length() > 8) { V.copy(P.vel).normalize().multiplyScalar(500).add(P.pos); const v = toScreen(V.x, V.y, V.z); if (v.ok) { hx.strokeStyle = 'rgba(255,230,120,.9)'; hx.beginPath(); hx.arc(v.x, v.y, 6 * sc, 0, TAU); hx.moveTo(v.x - 12 * sc, v.y); hx.lineTo(v.x - 6 * sc, v.y); hx.moveTo(v.x + 6 * sc, v.y); hx.lineTo(v.x + 12 * sc, v.y); hx.moveTo(v.x, v.y - 6 * sc); hx.lineTo(v.x, v.y - 12 * sc); hx.stroke(); } }
  // 目標框
  const cand = []; for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.dead) continue; const d = Math.hypot(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z); if (d < 5500) cand.push({ e, d }); }
  cand.sort((a, b) => a.d - b.d); let n = 0;
  for (const c of cand) {
    const e = c.e, s = toScreen(e.x, e.y, e.z); if (!s.ok) continue; const isT = e === P.target;
    const r = clamp(e.rad / c.d * (H / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))) , 7, 160), col = isT ? '#ffd24a' : 'rgba(255,90,110,.85)';
    if (n++ > 24 && !isT) continue; bracket(s.x, s.y, r, col, isT ? 2 : 1.2);
    if (isT || r > 30) { hx.fillStyle = col; hx.textAlign = 'left'; hx.fillText(e.d.name + ' · ' + fmtD(c.d), s.x + r + 6, s.y - 4); hx.fillStyle = 'rgba(255,90,110,.25)'; hx.fillRect(s.x + r + 6, s.y + 5, 60, 4); hx.fillStyle = col; hx.fillRect(s.x + r + 6, s.y + 5, 60 * clamp(e.hp / e.hpMax, 0, 1), 4); }
  }
  const T_ = P.target;
  if (T_ && !T_.dead) {
    const lp = leadPoint(P.pos, { x: T_.x, y: T_.y, z: T_.z, vx: T_.vx - P.vel.x * 0, vy: T_.vy, vz: T_.vz }, 1900 + P.vel.length() * 0.3, V3), l = toScreen(lp.x, lp.y, lp.z), t0 = toScreen(T_.x, T_.y, T_.z);
    if (l.ok) { hx.strokeStyle = '#ffd24a'; hx.beginPath(); hx.arc(l.x, l.y, 8 * sc, 0, TAU); hx.stroke(); }
    if (!t0.ok || t0.x < 0 || t0.x > W || t0.y < 0 || t0.y > H) {   // 螢幕外箭頭
      V.set(T_.x - P.pos.x, T_.y - P.pos.y, T_.z - P.pos.z); V.applyQuaternion(QT.copy(P.q).invert()); let ax = -V.x, ay = -V.y; const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m;
      const px = cx + ax * Math.min(W, H) * 0.38, py = cy + ay * Math.min(W, H) * 0.38; hx.fillStyle = '#ffd24a'; hx.beginPath(); hx.moveTo(px + ax * 14, py + ay * 14); hx.lineTo(px - ay * 8 - ax * 6, py + ax * 8 - ay * 6); hx.lineTo(px + ay * 8 - ax * 6, py - ax * 8 - ay * 6); hx.fill();
    }
  }
  // 友軍大艦標記（僅旗艦與月球艦）
  allies.forEach((a) => { if ((a.kind !== 'hss' && a.kind !== 'moon') || a.dead) return; const s = toScreen(a.x, a.y, a.z); if (!s.ok) return; const d = Math.hypot(a.x - P.pos.x, a.y - P.pos.y, a.z - P.pos.z); if (d < a.rad * 1.2) return;
    hx.fillStyle = 'rgba(255,217,138,.8)'; hx.textAlign = 'center'; hx.fillText(a.kind === 'hss' ? 'HSS' : 'SCREWLLUM', s.x, s.y - 14); hx.fillStyle = 'rgba(255,217,138,.55)'; hx.fillText(fmtD(d), s.x, s.y); });
  // 鐵墓標記
  const tp = toScreen(TOMB_POS.x, TOMB_POS.y + 800, TOMB_POS.z), td = P.pos.distanceTo(TOMB_POS);
  if (tp.ok) { hx.fillStyle = 'rgba(255,90,120,.9)'; hx.textAlign = 'center'; hx.fillText('IRONTOMB · ' + fmtD(td), tp.x, tp.y - 6); hx.fillStyle = 'rgba(255,170,190,.7)'; hx.fillText('INTEGRITY ' + (100 - ironDmg / 1e9).toFixed(6) + '%', tp.x, tp.y + 10); }
  // 狀態條與讀數
  const bx = 18, by = H - 92; bar(bx, by, 170 * Math.max(0.7, sc), 8, P.shield / P.shieldMax, '#4aa8ff', 'SHIELD'); bar(bx, by + 24, 170 * Math.max(0.7, sc), 8, P.hull / P.hullMax, P.hull / P.hullMax < 0.35 ? '#ff4466' : '#7dffb0', 'HULL');
  bar(bx, by + 48, 170 * Math.max(0.7, sc), 6, P.heat / 100, '#ffd24a', 'LASER CAP'); bar(bx + 190 * Math.max(0.7, sc), by + 48, 80, 6, P.energy / 100, '#ff9a4a', 'BOOST');
  hx.fillStyle = '#cfe9ff'; hx.textAlign = 'right'; hx.font = '12px "Space Mono"'; const spd = P.vel.length();
  hx.fillText('SPD ' + Math.round(spd) + ' m/s' + (P.boost ? '  AB' : '') + (P.assist ? '' : '  FA-OFF'), W - 18, H - 92); hx.fillText('THR ' + Math.round(P.thr * 100) + '%', W - 18, H - 74);
  hx.fillText('MSL ' + P.missiles + '/8  KILLS ' + P.kills + '  FLEET ' + allies.filter((s) => s.d.hp > 1000).length + '  HOSTILE ' + enemies.length, W - 18, H - 56); hx.fillText('WAVE ' + wave + '  T+' + Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'), W - 18, H - 38);
  // 雷達（球形投影：以機身為準）
  const rr = 62 * Math.max(0.8, sc), rx = W - rr - 20, ry = 20 + rr; hx.fillStyle = 'rgba(6,14,28,.6)'; hx.beginPath(); hx.arc(rx, ry, rr, 0, TAU); hx.fill(); hx.strokeStyle = 'rgba(143,230,255,.35)'; hx.beginPath(); hx.arc(rx, ry, rr, 0, TAU); hx.arc(rx, ry, rr * 0.5, 0, TAU); hx.moveTo(rx - rr, ry); hx.lineTo(rx + rr, ry); hx.moveTo(rx, ry - rr); hx.lineTo(rx, ry + rr); hx.stroke();
  QT2.copy(P.q).invert(); const RANGE = 4500;
  const blip = (e, col, sz) => { V.set(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z).applyQuaternion(QT2); const d = V.length(); if (d > RANGE) return; const k = Math.sqrt(d / RANGE) / (d || 1); const x = rx - V.x * k * rr, y = ry - V.z * k * rr; hx.fillStyle = col; hx.fillRect(x - sz / 2, y - sz / 2, sz, sz); if (Math.abs(V.y) > 80) { hx.fillRect(x, y, 1, V.y > 0 ? -5 : 5); } };
  allies.forEach((a) => { if (!a.dead && !a.isPlayer && (a.d.hp > 1000 || Math.random() < 1)) blip(a, 'rgba(120,220,255,.9)', a.d.hp > 1000 ? 4 : 2); });
  enemies.forEach((e) => { if (!e.dead) blip(e, e === P.target ? '#ffd24a' : '#ff5a6e', e.d.hp > 1000 ? 4 : 2); });
  hx.fillStyle = '#fff'; hx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
  // 鐵墓方位羅盤
  V.copy(TOMB_POS).sub(P.pos).applyQuaternion(QT2); const tl = V.length(); V.divideScalar(tl); const ang = Math.atan2(-V.x, V.z);
  hx.strokeStyle = 'rgba(255,90,120,.8)'; hx.beginPath(); hx.arc(rx, ry + rr + 26, 10, 0, TAU); hx.moveTo(rx, ry + rr + 26); hx.lineTo(rx + Math.sin(ang) * 10 * (V.z > 0 ? 1 : 1), ry + rr + 26 - Math.cos(ang) * 10 * 0 - V.y * 8); hx.stroke(); hx.fillStyle = 'rgba(255,150,170,.8)'; hx.textAlign = 'center'; hx.font = '9px "Space Mono"'; hx.fillText(V.z > 0.5 ? 'TOMB AHEAD' : V.z < -0.5 ? 'TOMB BEHIND' : 'TOMB', rx, ry + rr + 44);
}

/* ═════════ 9. 輸入 ═════════ */
addEventListener('keydown', (e) => {
  if (e.repeat) { input.keys[e.code] = true; return; } input.keys[e.code] = true;
  if (!started) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyT') cycleTarget('reticle'); if (e.code === 'KeyY') cycleTarget('next');
  if (e.code === 'KeyV') setCamMode(cam.mode === 'cockpit' ? 'chase' : 'cockpit');
  if (e.code === 'KeyZ') player.assist = !player.assist; if (e.code === 'KeyI') player.invert = !player.invert;
  if (e.code === 'KeyM') { musicOn = !musicOn; FPVAudio.music(musicOn); }
  if (e.code === 'KeyP') setPaused(!paused);
});
addEventListener('keyup', (e) => { input.keys[e.code] = false; });
cv.addEventListener('mousedown', (e) => { if (!started || paused) return; if (document.pointerLockElement !== cv && cv.requestPointerLock) { cv.requestPointerLock(); } if (e.button === 0) input.lmb = true; if (e.button === 2) input.rmb = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) input.lmb = false; if (e.button === 2) input.rmb = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (document.pointerLockElement === cv) { input.mx += e.movementX; input.my += e.movementY; } });
document.addEventListener('pointerlockchange', () => { if (started && document.pointerLockElement !== cv && !paused) setPaused(true); });
let musicOn = true;
function setPaused(p) { paused = p; FPVAudio.suspend(p); const ti = $('#fpv-title'); ti.classList.toggle('off', !p); if (p && started) { $('#fpv-go').textContent = 'RESUME'; } if (!p && cv.requestPointerLock) cv.requestPointerLock(); }
function setCamMode(m) { cam.mode = m; if (player.ship) player.ship.hidden = m === 'cockpit' && !player.dead; cockRoot.visible = m === 'cockpit'; }

/* ═════════ 10. 主迴圈 ═════════ */
const clock = new THREE.Clock(); let last = 0, chasePos = new THREE.Vector3(), chaseInit = false;
function placeCamera(dt) {
  const P = player, s = P.ship;
  if (!s) return;
  const sp01 = clamp(P.vel.length() / 300, 0, 1), tf = FOV + (P.boost ? 9 : 0) + sp01 * 3;
  fovCur += (tf - fovCur) * Math.min(1, dt * 4); speedFx += ((P.boost ? 1 : sp01 * 0.22) - speedFx) * Math.min(1, dt * 3);
  if (Math.abs(camera.fov - fovCur) > 0.05) { camera.fov = fovCur; camera.updateProjectionMatrix(); }
  if (cam.mode === 'cockpit' && !P.dead) {
    fleet.anchorWorld(s, 'HP_COCKPIT', V); camera.position.copy(V);
    QT.copy(P.q).multiply(QT2.setFromAxisAngle(AXY, Math.PI)); camera.quaternion.copy(QT);
    // 駕駛艙隨角速度與過載微晃，帶出重量感
    cockRoot.rotation.set(-P.w.x * 0.012, -P.w.y * 0.012, -P.w.z * 0.01); cockRoot.position.set(P.w.y * 0.004, -P.w.x * 0.004, 0);
    if (Math.abs(cockCam.fov - camera.fov) > 0.05) { cockCam.fov = camera.fov; cockCam.updateProjectionMatrix(); }
  } else {
    V2.set(0, 0, 1).applyQuaternion(P.q); V3.set(0, 1, 0).applyQuaternion(P.q);
    V.copy(P.pos).addScaledVector(V2, -42).addScaledVector(V3, 11);
    if (!chaseInit) { chasePos.copy(V); chaseInit = true; } else chasePos.lerp(V, Math.min(1, dt * 5));
    camera.position.copy(chasePos); camera.up.copy(V3); camera.lookAt(P.pos.x + V2.x * 80, P.pos.y + V2.y * 80, P.pos.z + V2.z * 80);
  }
  if (cam.shake > 0.01) camera.position.add(V.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(cam.shake * 0.4));
  cam.x = camera.position.x; cam.y = camera.position.y; cam.z = camera.position.z;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
  if (!sw.assetsReady) return;
  if (started && !paused) { stepWorld(dt); FPVAudio.engine(clamp(player.vel.length() / 300, 0, 1), player.boost); }
  placeCamera(dt); FPVAudio.listener(camera);
  sky.position.copy(camera.position); stars.position.copy(camera.position); sky.material.uniforms.uTime.value = t; hurtK *= Math.exp(-dt * 2.6); updateBoomLights(dt); dustMat.uniforms.uCam.value.copy(camera.position);
  fleet.update(allies, enemies);
  if (tombMeshes) tombMeshes.rotation.y = Math.sin(t * 0.05) * 0.03;
  fx.update(started && !paused ? dt : 0);
  render(); drawHud();
}
function render() {
  const cockOn = cam.mode === 'cockpit' && !player.dead && started;
  if (post) {
    post.cockpit.enabled = cockOn; const u = post.u; u.uTime.value = performance.now() / 1000; u.uSpeed.value = speedFx; u.uHurt.value = hurtK;
    post.composer.render();
  } else {
    renderer.render(scene, camera);
    if (cockOn) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(cockScene, cockCam); renderer.autoClear = true; }
  }
}

/* ═════════ 11. 啟動 ═════════ */
function setup(a) {
  assets = a;
  Object.keys(a).forEach((k) => { if (k === 'debris') return; prepAsset(a[k], k === 'cockpit' || k === 'moon' ? 0 : 18 / Math.max(a[k].length, 1)); });
  fx = SWFx.create({ scene, debrisParts: a.debris && a.debris.parts });
  fleet = SWFleet.create({ scene, assets: a });
  // 鐵墓：遠方背景巨人（只有視覺與命中球，沒有生命值概念）
  if (a.irontomb) {
    tombMeshes = new THREE.Group();
    a.irontomb.parts.forEach((p) => { const m = p.material; if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01) m.emissiveIntensity = 2.4; m.envMapIntensity = 0.9; const me = new THREE.Mesh(p.geometry, m); me.frustumCulled = false; tombMeshes.add(me); });
    tombMeshes.position.copy(TOMB_POS); tombMeshes.scale.setScalar(TOMB_SCALE); scene.add(tombMeshes);
  }
  if (a.cockpit) a.cockpit.parts.forEach((p) => { const m = p.material; if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01) m.emissiveIntensity = 2.2; const me = new THREE.Mesh(p.geometry, m); me.frustumCulled = false; cockRoot.add(me); });
  Object.keys(fleet.kinds).forEach((k) => fleet.kinds[k].meshes.forEach((me) => { if (me.material.emissive && me.material.emissive.r + me.material.emissive.g + me.material.emissive.b > 0.01) me.material.emissiveIntensity = 2.6; me.material.envMapIntensity = 1.1; }));
  if (QUALITY === 'high') post = FPVPost.create(renderer, scene, camera, cockScene, cockCam, { width: innerWidth, height: innerHeight, strength: 0.85, threshold: 1.35, radius: 0.7 });
  else { renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; }
  resize(); spawnFleet(); spawnPlayer(); for (let i = 0; i < 2; i++) { nextWave = 0; stepWorldSetup(); }
  fleet.update(allies, enemies); sw.assetsReady = true;
  const go = $('#fpv-go'); go.disabled = false; go.textContent = 'ENGAGE'; $('#fpv-load').textContent = '';
}
function stepWorldSetup() { spawnWave(); nextWave = 30; }
$('#fpv-go').addEventListener('click', () => {
  FPVAudio.init('../assets/irontomb-bgm.mp3');
  if (!started) { started = true; log('Welcome aboard. Fleet engaged with the Antimatter Legion.', false); setCamMode('cockpit'); }
  setPaused(false);
});
$('#fpv-load').textContent = 'Loading models…';
SWAssets.loadAll('../assets/space-war/models/', null, ['frigate', 'cruiser', 'dread', 'hss', 'moon', 'whale', 'butterfly', 'debris', 'irontomb', 'fighter', 'cockpit'])
  .then(setup).catch((e) => { $('#fpv-load').textContent = 'Model load failed: ' + e; console.error(e); });
requestAnimationFrame(frame);

window.fpvDebug = { get ready() { return sw.assetsReady; }, player, allies, enemies, shots, cam, get t() { return t; },
  start() { started = true; setCamMode(cam.mode); paused = false; $('#fpv-title').classList.add('off'); },
  warp(sec) { started = true; paused = false; const n = Math.round(sec / 0.05); for (let i = 0; i < n; i++) { stepWorld(0.05); fx.update(0.05); } },
  setCam: setCamMode, input, DBG, get fleet() { return fleet; }, get fx() { return fx; }, cycleTarget, get kills() { return kills; }, get ironDmg() { return ironDmg; } };
})();
