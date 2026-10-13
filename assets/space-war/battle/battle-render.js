/* battle-render.js — 場景、相機（飛行員／指揮官／過場）、後處理、鐵墓與末日視覺
 * 依賴：battle-core.js 的全域；three.js r128、SWEnv、SWFx、SWFleet、FPVPost。
 */
'use strict';
const cv = $('#b-canvas'), hudCv = $('#b-hud'), hx = hudCv.getContext('2d');
const coarse = matchMedia('(pointer: coarse)').matches;
let QUALITY = Q.get('q') || (coarse ? 'low' : 'high');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: QUALITY === 'high' && !coarse });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY === 'high' ? 2 : 1.25));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03050c);
const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 60000);
const sky = SWEnv.makeSky(30000, { linear: true }); scene.add(sky);
SWEnv.makeEnvironment(renderer, scene);
const lights = SWEnv.addLights(scene, { hemi: 0.34, key: 5.2, rim: 0.8 });   // 低環境光＋強主光：明暗反差大
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
const tombGlow = glowSprite(0xff2040, 9500, 0.62, 1.5); tombGlow.position.copy(TOMB_POS).add(new THREE.Vector3(0, 300, 0)); scene.add(tombGlow);
const tombGlow2 = glowSprite(0xff5a30, 4200, 0.5, 2.0); tombGlow2.position.copy(TOMB_POS); scene.add(tombGlow2);
// 紅光從鐵墓體內向外照：艦隊被染成血紅，而鐵墓自己的表面背向光源，反而是陰暗的剪影
const tombLight = new THREE.PointLight(0xff2a45, 6.0, 26000, 1.05); tombLight.position.copy(TOMB_POS); scene.add(tombLight);

const DUST = 900;
const dustGeo = new THREE.BufferGeometry(); const dp = new Float32Array(DUST * 3); for (let i = 0; i < dp.length; i++) dp[i] = Math.random();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
const dustMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uCam: { value: new THREE.Vector3() }, uBox: { value: 700 }, uScale: { value: 500 } },
  vertexShader: 'uniform vec3 uCam; uniform float uBox; uniform float uScale; varying float vA; void main(){ vec3 p = mod(position * uBox - uCam, uBox) - uBox * 0.5; vec4 mv = viewMatrix * vec4(p + uCam, 1.0); float d = length(p); vA = smoothstep(uBox*0.5, uBox*0.15, d); gl_PointSize = clamp(uScale * 1.1 / max(1.0, -mv.z), 1.0, 3.2); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.75,0.85,1.0) * smoothstep(0.5, 0.1, d) * vA * 0.8, 1.0); }' });
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);

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

/* ── 爆炸閃光燈（固定 3 盞）、材質處理 ── */
const BL = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffaa66, 0, 1500, 1.4); scene.add(l); BL.push({ l, k: 0, size: 1 }); }
let bli = 0;
function boomLight(x, y, z, size, col) { const p = BL[bli++ % 3]; p.l.position.set(x, y, z); p.l.color.setRGB(col[0], col[1], col[2]); p.k = 1; p.size = size; p.l.distance = 300 + size * 240; }
function updateBoomLights(dt) { for (const p of BL) { p.k *= Math.exp(-dt * 4.2); p.l.intensity = p.k * (4 + p.size * 7); } }

const LINEARIZED = new Set();
function prepMaterial(m, panelK) {   // sRGB 顯示色 → 線性；硬表面加程序化面板接縫
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

/* ── 指揮官地面格線與鐵墓禁區圈 ── */
const gridMesh = new THREE.GridHelper(36000, 72, 0x2a4a8a, 0x15264a); gridMesh.material.transparent = true; gridMesh.material.opacity = 0.45; gridMesh.material.depthWrite = false; gridMesh.position.set(TOMB_POS.x, TOMB_POS.y, TOMB_POS.z); gridMesh.visible = false; scene.add(gridMesh);
const auraLine = (function () { const pts = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * TAU; pts.push(new THREE.Vector3(Math.cos(a) * TOMB_AURA, 0, Math.sin(a) * TOMB_AURA)); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.7, depthWrite: false })); l.position.set(TOMB_POS.x, TOMB_POS.y, TOMB_POS.z); l.visible = false; scene.add(l); return l; })();

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
  const waveMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); vec3 c = mix(vec3(4.0, 0.7, 1.0), vec3(8.0, 7.0, 7.0), f); gl_FragColor = vec4(c * (0.05 + f * 1.1) * uA, 1.0); }' });
  const ws = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), waveMat); ws.visible = false; ws.frustumCulled = false; scene.add(ws);
  const wr = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1.4, 2), transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  wr.rotation.x = -Math.PI / 2; wr.visible = false; wr.frustumCulled = false; scene.add(wr);
  doomObj.sword = sw; doomObj.light = L; doomObj.waveS = ws; doomObj.waveR = wr;
}
const SWORD_TOP = TOMB_POS.y + 13000, SWORD_END = TOMB_POS.y + 1300;
function updateDoomVisuals(dt) {
  const D = doomObj; if (!D.sword) return;
  if (G.mode === 'script' && G.t >= T.DOOM) {
    const p = clamp((G.t - T.DOOM) / (T.IMPACT - T.DOOM), 0, 1), e = Math.pow(p, 2.2);
    D.sword.visible = G.t < T.IMPACT + 6; D.sword.position.set(TOMB_POS.x, lerp(SWORD_TOP, SWORD_END, e), TOMB_POS.z + 400);
    D.light.position.copy(D.sword.position); D.light.intensity = 3 + e * 14;
    sky.material.uniforms.uDoom.value = Math.min(1, sky.material.uniforms.uDoom.value + dt * 0.12);
    tombGlow.material.opacity = 0.6 + 0.4 * e;
    if (G.t >= T.IMPACT) {
      const r = G.waveR; D.waveS.visible = D.waveR.visible = true; D.waveS.position.set(TOMB_POS.x, SWORD_END, TOMB_POS.z); D.waveR.position.copy(D.waveS.position);
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
    camera.position.set(2600 - pa * 500, 3800 - pd * 1200 + pa * 500, TOMB_POS.z + 9500 + pa * 600); camera.up.set(0, 1, 0);
    camera.lookAt(0, lerp(9500, 4300, smooth(pd)) - pa * 800, TOMB_POS.z); fovT = 64;
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
    post.cockpit.enabled = cockOn; const u = post.u; u.uTime.value = performance.now() / 1000; u.uSpeed.value = G.role === 'pilot' ? speedFx : 0; u.uHurt.value = hurtK;
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
  updateDoomVisuals(dt); updateBubbleViz();
}

/* 鐵墓：本體壓暗、環境反射降到最低，只保留邊緣的紅色輪廓光（菲涅爾），像被體內的紅光逆光照亮的巨大剪影 */
function darkenTomb(m) {
  if (m.color) m.color.multiplyScalar(0.34);
  const emissive = m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01; if (emissive) m.emissiveIntensity = 1.5;
  m.envMapIntensity = 0.22;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    if (prev) prev(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float tRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.4); totalEmissiveRadiance += vec3(3.0, 0.12, 0.24) * tRim * 0.85;');
  };
  m.customProgramCacheKey = () => 'tomb' + (m.color ? m.color.getHex() : 0);
}

/* ── 螺絲咕姆的光束泡與爆炸衝擊球 ── */
const bubViz = [], blastViz = [];
(function () {
  for (let i = 0; i < 8; i++) { const o = glowSprite(0xffd84a, 500, 0.9, 2.6), c = glowSprite(0xffffff, 220, 1, 4); o.visible = c.visible = false; scene.add(o, c); bubViz.push({ o, c }); }
  const mat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(vec3(5.0, 3.6, 1.0) * (0.06 + f * 1.0) * uA, 1.0); }' });
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
  fleet = SWFleet.create({ scene, assets: a });
  if (a.irontomb) {
    tombMeshes = new THREE.Group();
    a.irontomb.parts.forEach((p) => { const m = p.material; darkenTomb(m); const me = new THREE.Mesh(p.geometry, m); me.frustumCulled = false; tombMeshes.add(me); });
    tombMeshes.position.copy(TOMB_POS); tombMeshes.scale.setScalar(TOMB_SCALE); scene.add(tombMeshes);
  }
  if (a.cockpit) a.cockpit.parts.forEach((p) => { const m = p.material; if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01) m.emissiveIntensity = 2.2; const me = new THREE.Mesh(p.geometry, m); me.frustumCulled = false; cockRoot.add(me); });
  Object.keys(fleet.kinds).forEach((k) => fleet.kinds[k].meshes.forEach((me) => { if (me.material.emissive && me.material.emissive.r + me.material.emissive.g + me.material.emissive.b > 0.01) me.material.emissiveIntensity = 2.6; me.material.envMapIntensity = 0.7; }));
  if (QUALITY === 'high') { post = FPVPost.create(renderer, scene, camera, cockScene, cockCam, { width: innerWidth, height: innerHeight, strength: 1.0, threshold: 1.3, radius: 0.75 }); post.u.uContrast.value = 1.15; post.u.uVig.value = 0.5; post.u.uSat.value = 1.15; }
  else { renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; }
  buildDoomVisuals(); resize();
}
