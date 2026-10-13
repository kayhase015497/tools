/* game.js — 太空戰本體（模擬、操作、導演、UI、音效）。
 * 依賴：three.js r128、sw-assets.js、sw-env.js（見 gadget/space-war.html 的載入順序）。
 * 架構說明見 docs/space-war/ARCHITECTURE.md */
(function () {
'use strict';

/* ───────── 小工具 ───────── */
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (t) => t * t * (3 - 2 * t);
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const fmtClock = (t) => 'T+ ' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const COARSE = window.matchMedia && matchMedia('(pointer: coarse)').matches;

/* ───────── 時間軸與台詞 ───────── */
const MUSIC_URL = '../assets/irontomb-bgm.mp3', MUSIC_OFFSET = 30; // 從曲子 0:30 起播：安靜段對上開場黑幕與「第四時刻」黑幕
const T = { REVEAL: 12, CONTROL: 20, FLASH: 140, DOOM: 152, IMPACT: 159, WHITE: 170, END: 178 };

const WHO = {
  lyc:    { zh: '來古士', en: 'Lygus',       c: '#ff6a8a' },
  herta:  { zh: '黑塔',   en: 'Herta',       c: '#ffd98a' },
  cyrene: { zh: '昔漣',   en: 'Cyrene',      c: '#ffb3d1' },
  dan:    { zh: '丹恆',   en: 'Dan Heng',    c: '#7fd6ff' },
  march:  { zh: '三月七', en: 'March 7th',   c: '#ff9ad5' },
  tb:     { zh: '開拓者', en: 'Trailblazer', c: '#ffe08a' }
};
const CUES = [
  { t: 1.5,  dur: 9.5, type: 4.2, box: 'center', who: 'lyc',
    en: 'Bear witness, monarch of myriad machines, my ridiculous creation.',
    zh: '敬請見證，萬機之王，我荒謬的造物。' },
  { t: 12.4, dur: 6.5, type: 2.8, box: 'sub', who: 'lyc',
    en: 'The instant in your calculations bears the name Destruction.',
    zh: '你計算中的時刻，名為「毀滅」。' },
  { t: 20.5, dur: 4.6, type: 1.8, box: 'sub', who: 'herta',
    en: 'Who said you could speak, "senior"?',
    zh: '誰允許你發言了？前輩。' },
  { t: 26.5, dur: 7.8, type: 3.4, box: 'sub', who: 'herta',
    en: 'Watch closely. See how your chaos ends at the hands of your juniors.',
    zh: '給我看仔細了，你這收拾不完的爛攤子如何被後進了結。' },
  { t: 35.5, dur: 5.2, type: 2.2, box: 'sub', who: 'cyrene',
    en: "Don't get too worked up. Take a deep breath.",
    zh: '別太激動。深呼吸。' },
  { t: 42.5, dur: 5.8, type: 2.4, box: 'sub', who: 'dan',
    en: "There's not a trace of life in that ominous shell.",
    zh: '那具不祥的空殼裡，沒有一絲生命的氣息。' },
  { t: 49.8, dur: 5.4, type: 2.4, box: 'sub', who: 'march',
    en: "We're not going to lose to a hollow husk, right?",
    zh: '我們不會輸給一具空殼的，對吧？' },
  { t: 57.0, dur: 7.0, type: 3.2, box: 'sub', who: 'tb',
    en: "In the name of trailblazing, we'll reject this false answer.",
    zh: '以開拓之名，我們將否定這個虛假的答案。' },
  { t: 143.2, dur: 8.6, type: 3.6, box: 'center', who: 'lyc',
    en: 'The "Fourth Instant" of the cosmos… is the coronation of Irontomb!',
    zh: '宇宙的「第四時刻」……就是鐵墓的加冕！' }
];
const TICKS = [
  [14,  '反鐵墓宇宙聯軍已完成集結，各艦隊就位。', 'Anti-Irontomb Cosmic Alliance assembled. All fleets in position.'],
  [18,  '旗艦：黑塔太空站（HSS）已進入指揮位置。', 'Flagship: Herta Space Station (HSS) in command position.'],
  [23,  '外線任務：攔截鐵墓的外溢威脅，掩護居民撤離。', 'External front: contain the overflow, cover the evacuation.'],
  [26,  '鐵墓周圍已劃定禁區，艦艇不得進入其能量場。', 'Exclusion zone marked around the Irontomb. No vessel may enter its energy field.'],
  [31,  '螺絲咕姆行星級艦隊已加入戰線，巨型光束泡充能完畢。', "Screwllum's planetary fleet joins the line. Beam bubbles charged."],
  [38,  '預估外溢範圍：五個鄰近星系。', 'Projected spillover: five neighboring star systems.'],
  [66,  '星穹列車已自內部切入，嘗試瓦解鐵墓核心。', 'The Astral Express is breaching the core from within.'],
  [86,  '反物質軍團持續自鐵墓外圍湧出。', 'Antimatter Legion forces keep pouring from the Irontomb.'],
  [104, '警告：鐵墓能量讀數持續攀升。', 'Warning: Irontomb energy readings climbing.'],
  [118, '聯軍損失正在擴大。', 'Alliance losses are mounting.'],
  [129, '能量讀數超出量表。', 'Readings are off the scale.']
];

/* ───────── 音效（Web Audio 合成） ───────── */
const Snd = (function () {
  let ctx = null, master = null, noise = null, drone = null, lastZap = 0, boomCount = 0, boomWin = 0, muted = false;
  function init() {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
    const n = ctx.sampleRate * 2; noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    const g = ctx.createGain(); g.gain.value = 0; f.connect(g); g.connect(master);
    [[55, 'sawtooth'], [55.8, 'sawtooth'], [110.3, 'sine'], [27.5, 'sine']].forEach(([fr, ty]) => {
      const o = ctx.createOscillator(); o.type = ty; o.frequency.value = fr; o.connect(f); o.start();
    });
    drone = { g, f };
    tension(0.1);
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05); }
  function tension(v) {
    if (!drone) return;
    drone.g.gain.setTargetAtTime(0.02 + 0.06 * v, ctx.currentTime, 0.6);
    drone.f.frequency.setTargetAtTime(120 + 900 * v, ctx.currentTime, 0.6);
  }
  function env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }
  function zap(big) {
    if (!ctx) return; const t = ctx.currentTime; if (t - lastZap < 0.055) return; lastZap = t;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = big ? 'sawtooth' : 'square';
    const f0 = big ? rnd(420, 560) : rnd(900, 1500);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.25, t + (big ? 0.35 : 0.13));
    env(g, t, 0.005, big ? 0.05 : 0.018, big ? 0.35 : 0.12);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.5);
  }
  function boom(size) {
    if (!ctx) return; const t = ctx.currentTime;
    if (t - boomWin > 1) { boomWin = t; boomCount = 0; }
    if (++boomCount > 9 && size < 3) return;
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = rnd(0.7, 1.1);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400 / Math.sqrt(size + 0.3);
    const g = ctx.createGain(); env(g, t, 0.004, 0.22 * Math.min(size, 6), 0.35 + size * 0.22);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, rnd(0, 0.8), 1.4 + size * 0.2);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(95 + 10 * size, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5 + size * 0.15);
    env(og, t, 0.006, 0.28 * Math.min(size, 6), 0.45 + size * 0.2);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 1.8 + size * 0.2);
  }
  function riser(dur) {
    if (!ctx) return; const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(150, t); f.frequency.exponentialRampToValueAtTime(5000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.2);
  }
  function swell(dur) {
    if (!ctx) return; const t = ctx.currentTime;
    [261.6, 392, 523.2, 784].forEach((fr, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = fr * (1 + i * 0.002);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 3);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 3.2);
    });
  }
  // 配樂：以 <audio> 串進 Web Audio，方便統一靜音與淡出
  let mus = null, musGain = null, musDone = false;
  function musicLoad(url, offset, cb) {
    if (!ctx) { cb(false); return; }
    const a = new Audio(); a.preload = 'auto'; a.src = url; mus = a; musDone = false;
    try { const src = ctx.createMediaElementSource(a); musGain = ctx.createGain(); musGain.gain.value = 0; src.connect(musGain); musGain.connect(master); } catch (e) { musGain = null; }
    let seeked = false, ready = false, done = false;
    const go = () => { if (done) return; done = true; cb(true); };
    a.addEventListener('loadedmetadata', () => { try { a.currentTime = offset; } catch (e) { seeked = true; } });
    a.addEventListener('seeked', () => { seeked = true; if (ready) go(); });
    a.addEventListener('canplaythrough', () => { ready = true; if (seeked) go(); });
    a.addEventListener('error', go);
    setTimeout(go, 9000);
    a.load();
  }
  function musicPlay() {
    if (!mus || musDone) return;
    mus.play().catch(() => {});
    if (musGain) { const t = ctx.currentTime; musGain.gain.cancelScheduledValues(t); musGain.gain.setValueAtTime(0, t); musGain.gain.linearRampToValueAtTime(0.85, t + 1.6); }
  }
  function musicFade(sec) {
    if (!mus || musDone) return; musDone = true;
    if (musGain) musGain.gain.setTargetAtTime(0, ctx.currentTime, sec / 3);
    setTimeout(() => { try { mus.pause(); } catch (e) {} }, sec * 1000);
  }
  function musicSync(pos) { if (mus && !musDone && !mus.paused && Math.abs(mus.currentTime - pos) > 0.7) { try { mus.currentTime = pos; } catch (e) {} } }
  function musicHold(on, pos) {
    if (!mus || musDone) return;
    if (on) { try { mus.pause(); } catch (e) {} } else { try { mus.currentTime = pos; } catch (e) {} mus.play().catch(() => {}); }
  }
  function musicInfo() { return mus ? { pos: mus.currentTime, paused: mus.paused, ready: mus.readyState, done: musDone } : null; }
  function silence(sec) {
    if (!ctx) return;
    drone.g.gain.setTargetAtTime(0, ctx.currentTime, sec / 3);
  }
  return { init, resume, setMuted, tension, zap, boom, riser, swell, silence, musicLoad, musicPlay, musicFade, musicSync, musicHold, musicInfo, get hasMusic() { return !!mus; }, get on() { return !!ctx; } };
})();

/* ───────── three.js 場景 ───────── */
const cv = $('#sw-canvas');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
const BG_NORMAL = new THREE.Color(0x070a16), BG_DOOM = new THREE.Color(0x1c0612);
const scene = new THREE.Scene();
scene.background = BG_NORMAL.clone();
const camera = new THREE.PerspectiveCamera(48, 1, 1, 4500);
const cam = { az: 0.35, pol: 1.25, dist: 1200, tx: 0, tz: 0, shake: 0, locked: true }; // 戰術視角狀態（由操作層修改）

// 畫質：high＝泛光後處理＋多重取樣；low＝無後處理（手機預設）。可用 ?q=low 或標題畫面的按鈕切換
let QUALITY = (function () { let q = null; try { q = new URLSearchParams(location.search).get('q') || localStorage.getItem('sw-q'); } catch (e) {} return q === 'low' || q === 'high' ? q : (COARSE ? 'low' : 'high'); })();
const sky = SWEnv.makeSky(3200); scene.add(sky);
SWEnv.makeEnvironment(renderer, scene);
const LIGHTS = SWEnv.addLights(scene, { tombLight: true });
let bloomFx = null, fleet = null, fx = null;                       // 資源載入後才建立（見檔案末端 setupWorld）
const rig = SWCamera.create(camera, { state: cam, fleet: null });   // 攝影機機架：tactical／chase／cockpit
let frameDt = 0.016;
function applyCam() { rig.apply(frameDt); }

let W = 1, H = 1;
function pixelScale() { return (H * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); }
function refreshScale() { const sc = pixelScale(); if (fx) fx.setPixelScale(sc); if (fleet) fleet.setPixelScale(sc); }
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY === 'high' ? (COARSE ? 1.5 : 2) : (COARSE ? 1.25 : 1.5)));
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  if (QUALITY === 'high') { if (!bloomFx) bloomFx = SWEnv.makeComposer(renderer, scene, camera, { width: W, height: H }); bloomFx.setSize(W, H); }
  refreshScale();
}

/* 貼圖：柔光 */
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTex();
function mkGlow(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(size, size, 1); return s;
}
const addMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/* 背景：星空、網格、軌道、鄰近星系 */
const SYSTEMS = [];
(function buildBackdrop() {
  const n = 1600, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 2200, s = Math.sqrt(1 - u * u);
    p.set([r * s * Math.cos(a), Math.abs(r * u) * 0.8 + 40, r * s * Math.sin(a)], i * 3);
    const b = rnd(0.35, 1); c.set([b * 0.8, b * 0.85, b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false })));

  const grid = new THREE.GridHelper(1600, 64, 0x2a3f7a, 0x1a2a55);
  grid.material.transparent = true; grid.material.opacity = 0.45; grid.position.y = -0.2; scene.add(grid);

  const ringMat = new THREE.LineBasicMaterial({ color: 0x4a5fa0, transparent: true, opacity: 0.55 });
  const dashMat = new THREE.LineDashedMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0.5, dashSize: 3, gapSize: 5 });
  [[130, false], [210, true], [330, false], [470, true]].forEach(([r, dash]) => {
    const pts = []; for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dash ? dashMat : ringMat);
    if (dash) l.computeLineDistances(); scene.add(l);
  });

  // 五個鄰近星系
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5, r = 560, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const grp = new THREE.Group(); grp.position.set(x, 0, z);
    const pts = []; for (let k = 0; k <= 40; k++) { const t = k / 40 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * 22, 0, Math.sin(t) * 22)); }
    grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.6 })));
    const pin = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 34, 0)]), new THREE.LineBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.7 }));
    grp.add(pin);
    const star = mkGlow(0xcfe0ff, 26, 0.9); star.position.y = 34; grp.add(star);
    scene.add(grp); SYSTEMS.push({ x, z, hit: false, glow: star });
  }
})();

/* 鐵墓：熔岩裂紋＋菲涅耳紫光的球殼 */
const TOMB_VS = 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }';
const TOMB_FS = [
  'uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;',
  'float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
  'float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);',
  '  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
  '             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }',
  'float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }',
  'void main(){',
  '  vec3 p = normalize(vP);',
  '  float n = fbm(p*3.2 + vec3(uTime*0.02, 0.0, 0.0));',
  '  float cr = smoothstep(0.03, 0.0, abs(n-0.5) - 0.010);',
  '  float n2 = fbm(p*7.5 - vec3(0.0, uTime*0.04, 0.0));',
  '  float cr2 = smoothstep(0.02, 0.0, abs(n2-0.52) - 0.006);',
  '  vec3 base = vec3(0.022,0.010,0.040) + vec3(0.05,0.02,0.09) * fbm(p*5.0);',
  '  float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.6);',
  '  float pulse = 0.8 + 0.4*sin(uTime*1.7 + p.y*6.0);',
  '  vec3 lava = vec3(1.0,0.26,0.12) * (cr + 0.7*cr2) * pulse;',
  '  gl_FragColor = vec4(base + lava*1.7 + vec3(0.55,0.2,1.0)*fres*0.95, 1.0);',
  '}'
].join('\n');
/* 鐵墓 */
let ZONE = 135; // 禁區半徑：聯軍艦艇不得進入（距鐵墓中心）
const TOMB = { x: 0, y: 0, z: 0, r: 27, labelY: 62, numY: 30, parts: null, body: null, group: new THREE.Group() };
const TOMB_MODE = new URLSearchParams(location.search).get('tomb') === 'sphere' ? 'sphere' : 'model';
(function buildTomb() {
  const g = TOMB.group; g.position.set(TOMB.x, TOMB.y, TOMB.z);
  TOMB.core = new THREE.Mesh(new THREE.SphereGeometry(TOMB.r, 48, 32), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, vertexShader: TOMB_VS, fragmentShader: TOMB_FS }));
  g.add(TOMB.core);
  TOMB.wire1 = new THREE.Mesh(new THREE.IcosahedronGeometry(TOMB.r + 0.6, 3), new THREE.MeshBasicMaterial({ color: 0x7a46ff, wireframe: true, transparent: true, opacity: 0.55 }));
  TOMB.wire2 = new THREE.Mesh(new THREE.IcosahedronGeometry(TOMB.r + 6, 1), new THREE.MeshBasicMaterial({ color: 0xff2a4a, wireframe: true, transparent: true, opacity: 0.3 }));
  g.add(TOMB.wire1, TOMB.wire2);
  TOMB.glowS = 150; TOMB.glow = mkGlow(0xff2244, 150, 0.8); g.add(TOMB.glow);
  // 腳下的威脅區
  const flat = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = -TOMB.y + 0.1; return m; };
  TOMB.zone = flat(new THREE.CircleGeometry(72, 96), addMat(0xff1f45, 0.14));
  TOMB.zoneRing = flat(new THREE.RingGeometry(70, 73, 128), addMat(0xff3b5c, 0.8));
  TOMB.zoneRing2 = flat(new THREE.RingGeometry(ZONE - 0.8, ZONE + 0.8, 160), addMat(0xff3b5c, 0.55));
  TOMB.zoneSphere = new THREE.Mesh(new THREE.IcosahedronGeometry(ZONE, 2), new THREE.MeshBasicMaterial({ color: 0xff5a7a, wireframe: true, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(TOMB.zone, TOMB.zoneRing, TOMB.zoneRing2, TOMB.zoneSphere);
  // 無限符號
  const pts = [], cols = [], N = 220;
  for (let i = 0; i < N; i++) {
    const t = i / N * Math.PI * 2, d = 1 + Math.sin(t) * Math.sin(t);
    pts.push(new THREE.Vector3(34 * Math.cos(t) / d, 34 * Math.sin(t) * Math.cos(t) / d, 0));
    const k = Math.abs(Math.cos(t)); cols.push(0.35 + 0.65 * k, 0.6 + 0.4 * k, 1);
  }
  const lg = new THREE.BufferGeometry().setFromPoints(pts); lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  TOMB.inf = new THREE.Group();
  TOMB.inf.add(new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })));
  const core = mkGlow(0xffffff, 26, 0.9); TOMB.inf.add(core);
  TOMB.inf.position.y = 50; TOMB.inf.rotation.x = -0.75; g.add(TOMB.inf);
  scene.add(g);
})();

/* 特效（光束／粒子／爆炸／碎片）：實作在 sw-fx.js，資源載入完成後才建立（見 setupWorld） */
const BEAM_STYLE = {   // 舊的材質名 → 光束外觀（顏色、曳光彈長度與速度，或瞬發光束的持續時間）
  cyan: { c: [0.45, 0.92, 1.0], bolt: 9, spd: 380, wk: 0.55 }, violet: { c: [0.75, 0.5, 1.0], bolt: 14, spd: 300, wk: 0.8 }, pink: { c: [1.0, 0.38, 0.8], bolt: 6, spd: 300, wk: 0.9 },
  white: { c: [0.85, 0.97, 1.0], dur: 0.22, wk: 1 }, yellow: { c: [1.0, 0.86, 0.35], dur: 0.38, wk: 1 }, red: { c: [1.0, 0.2, 0.3], dur: 0.55, wk: 1 }
};
/** 發射光束／曳光彈，回傳「抵達目標所需時間」，供呼叫端安排命中火花 */
function fireBeam(ax, ay, az, bx, by, bz, mat, w, life) {
  if (!fx) return 0;
  const st = BEAM_STYLE[mat] || BEAM_STYLE.cyan;
  if (st.bolt) { const dist = Math.hypot(bx - ax, by - ay, bz - az), dur = Math.max(0.05, dist / st.spd); fx.beam(ax, ay, az, bx, by, bz, { color: st.c, width: w * st.wk, dur, len: st.bolt }); return dur; }
  const dur = st.dur || life || 0.2; fx.beam(ax, ay, az, bx, by, bz, { color: st.c, width: w * st.wk, dur }); return Math.min(dur, 0.08);
}
const emit = (...a) => { if (fx) fx.emit(...a); };
const explode = (x, y, z, k, enemy) => { if (fx) fx.explode(x, y, z, k, enemy); };
const _mv = new THREE.Vector3();
/** 砲口位置：取自模型的 HP_GUN_* 錨點；模型未載入時退回艦艇中心 */
function muzzle(s) { if (fleet) return fleet.gunWorld(s, _mv); return _mv.set(s.x, s.y, s.z); }
/** 大型艦的引擎尾跡 */
const TRAIL = { cap: [0.9, [0.6, 0.88, 1.0], 4.5], hss: [0.9, [1.0, 0.85, 0.4], 7], whale: [0.45, [0.7, 0.4, 1.0], 4], cruis: [0.25, [0.6, 0.88, 1.0], 2.8] };
function engineTrails(dt) {
  if (!fleet || !fx) return;
  for (const list of [allies, enemies]) for (const s of list) {
    const c = TRAIL[s.kind]; if (!c || s.dead || s.hidden || Math.random() > c[0] * dt * 30) continue;
    fleet.anchorWorld(s, 'HP_ENGINE_1', _mv); const cp = Math.cos(s.p);
    fx.emit(_mv.x, _mv.y, _mv.z, -Math.sin(s.h) * cp * 6, -Math.sin(s.p) * 6, -Math.cos(s.h) * cp * 6, c[1][0], c[1][1], c[1][2], c[2], rnd(0.5, 0.9), 0.8);
  }
}

const seg3 = (list) => { const a = new Float32Array(list.length * 6); list.forEach((s, i) => a.set(s, i * 6)); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g; };
const DEF = {
  frig:  { side: 'a', hp: 750,  spd: 13,  range: 122, cd: 0.45, dmg: [33, 47],    w: 0.7,  beam: 'cyan',   mat: 'ally',  rad: 4.3, sc: 1.45, boom: 1 },
  cruis: { side: 'a', hp: 2100, spd: 9.5, range: 134, cd: 0.72, dmg: [85, 115],   w: 1.1,  beam: 'cyan',   mat: 'ally',  rad: 7.7, sc: 1.4,  boom: 2,   eng: 1, glow: 0xa0e8ff, gs: 11 },
  cap:   { side: 'a', hp: 7000, spd: 6,   range: 165, cd: 1.1,  dmg: [280, 360],  w: 2.2,  beam: 'white',  mat: 'white', rad: 14,  sc: 1.8,  boom: 4.5, eng: 1, glow: 0xdff8ff, gs: 26 },
  hss:   { side: 'a', hp: 30000, spd: 3.5, range: 235, cd: 1.3,  dmg: [650, 850],  w: 3.4,  beam: 'yellow', mat: 'hss',   rad: 26,  sc: 1.9,  boom: 7,   eng: 1, glow: 0xffd21f, gs: 40 },
  moon:  { side: 'a', hp: 40000, spd: 2.6, range: 215, cd: 5.2,  dmg: [0, 0],      w: 0,    beam: 'yellow', rad: 17,  sc: 1,    boom: 8,   bubble: 1 },
  whale: { side: 'e', hp: 15000, spd: 5.5, range: 110, cd: 0.8,  dmg: [24, 36],    w: 1.3,  beam: 'violet', mat: 'whale', rad: 10.8, sc: 1.35, boom: 3.5, eng: 1, glow: 0xa77bff, gs: 16 },
  fly:   { side: 'e', hp: 800,  spd: 17,  range: 70,  cd: 0.45, dmg: [6, 10],     w: 0.5,  beam: 'pink',   mat: 'fly',   rad: 3.6, sc: 1.8,  boom: 0.7 }
};
const RING_GEO = new THREE.RingGeometry(0.94, 1, 40);
/* ───────── 戰場狀態 ───────── */
const allies = [], enemies = [];
let kills = 0, ironDmg = 0, ghostPct = 100;
const ironFrac = () => 0.8 + 0.2 * Math.exp(-ironDmg / 900000);

const NS = 1; // 艦隊數量倍率（手機也維持全量；若跑不動可改成 0.65）
const LABELS = [];
function mkLabel(text, cls, ship, dy) {
  const el = document.createElement('div'); el.className = 'sw-label ' + cls; el.textContent = text; $('#sw-hud').appendChild(el);
  LABELS.push({ el, ship, dy });
}
let HSS = null;
function xform() { /* 艦艇姿態由 sw-fleet.js 每幀寫入 InstancedMesh；此處保留給呼叫端 */ }
function mkShip(kind, x, y, z, h, p) {
  const d = DEF[kind];
  const s = { kind, d, side: d.side, hp: d.hp, max: d.hp, cd: Math.random() * d.cd, x, y, z, h: h || 0, p: p || 0, roll: 0, sx: 1, tx: x, ty: y, tz: z, order: null, sel: false, ring: false, dead: false, hidden: false, ph: Math.random() * 6, str: Math.random() < 0.5 ? 1 : -1, nf: null, nt: Math.random() * 0.3, hold: rnd(6, 6 + d.range * 0.3), ctrl: null, gi: 0 };
  (d.side === 'a' ? allies : enemies).push(s);
  return s;
}
function aim(s) { s.h = Math.atan2(-s.x, -s.z); s.p = Math.atan2(-s.y, Math.hypot(s.x, s.z)); xform(s); }
const fibDirs = (n) => { const o = []; for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996; o.push([Math.cos(a) * r, y, Math.sin(a) * r]); } return o; };
const inSphere = (R) => { const r = R * Math.cbrt(Math.random()), v = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, c = Math.sqrt(1 - v * v); return [r * c * Math.cos(a), r * v, r * c * Math.sin(a)]; };
function spawnAllies() {
  // 360 度立體包圍鐵墓：艦隊以小隊形式分布在一個球殼上
  HSS = mkShip('hss', 90, 75, 265); aim(HSS); mkLabel('HSS', 'hss', HSS, 52);
  [0, 1, 2].forEach((k) => { const a = k * 2.0944 + 0.5, m = mkShip('moon', Math.cos(a) * 215, [40, -60, 85][k], Math.sin(a) * 215); aim(m); mkLabel('SCREWLLUM', 'moon', m, 30); });
  fibDirs(6).forEach((dir) => { const c = mkShip('cap', dir[0] * 262, dir[1] * 262, dir[2] * 262); aim(c); });
  const G = 14, dirs = fibDirs(G), nFrig = Math.round(260 * NS), nCr = Math.round(40 * NS);
  let f = 0, c = 0;
  dirs.forEach((dir, gi) => {
    const r = rnd(285, 320), bx = dir[0] * r, by = dir[1] * r, bz = dir[2] * r;
    const wantF = Math.round(nFrig * (gi + 1) / G) - f, wantC = Math.round(nCr * (gi + 1) / G) - c;
    for (let i = 0; i < wantF; i++) { const o = inSphere(30); aim(mkShip('frig', bx + o[0], by + o[1], bz + o[2])); }
    for (let i = 0; i < wantC; i++) { const o = inSphere(24); aim(mkShip('cruis', bx + o[0] * 0.9, by + o[1] * 0.9, bz + o[2] * 0.9)); }
    f += wantF; c += wantC;
  });
}
function spawnEnemies(init) {
  if (!init) return;
  const nw = Math.round(18 * NS), nf = Math.round(280 * NS);
  fibDirs(nw).forEach((dir) => { const r = rnd(110, 215); const s = mkShip('whale', dir[0] * r, dir[1] * r, dir[2] * r); aim(s); s.h += Math.PI * 0.5 * s.str; xform(s); });
  for (let i = 0; i < nf; i++) { const dir = inSphere(1), l = Math.hypot(dir[0], dir[1], dir[2]) || 1, r = rnd(105, 235); aim(mkShip('fly', dir[0] / l * r, dir[1] / l * r, dir[2] / l * r)); }
}
function spawnWave(whale) {
  if (enemies.length > 760) return;
  const dir = inSphere(1), l = Math.hypot(dir[0], dir[1], dir[2]) || 1, nf = Math.round(56 * NS);
  const bx = dir[0] / l * 150, by = dir[1] / l * 150, bz = dir[2] / l * 150;
  for (let i = 0; i < nf; i++) { const o = inSphere(30); const s = mkShip('fly', bx + o[0], by + o[1], bz + o[2]); aim(s); explode(s.x, s.y, s.z, 0.3, true); }
  if (whale) for (let k = 0; k < 3; k++) { const o = inSphere(24); const s = mkShip('whale', -bx + o[0], -by + o[1], -bz + o[2]); aim(s); explode(s.x, s.y, s.z, 1.2, true); }
}

/* 傷害數字 */
const NUMS = [], numsEl = $('#sw-nums');
for (let i = 0; i < 40; i++) { const el = document.createElement('div'); el.className = 'sw-dmg'; numsEl.appendChild(el); NUMS.push({ el, on: false, x: 0, y: 0, z: 0, age: 0, life: 1, big: false }); }
let numLive = 0;
function dmgNum(x, y, z, val, big) {
  if (!big && numLive > 24) return;
  const n = NUMS.find((q) => !q.on); if (!n) return; numLive++;
  n.on = true; n.x = x + rnd(-3, 3); n.y = y; n.z = z + rnd(-3, 3); n.age = 0; n.life = big ? 0.95 : 0.7; n.big = big;
  n.el.className = 'sw-dmg' + (big ? ' big' : ''); n.el.textContent = Math.round(val);
}
const _p = new THREE.Vector3();
function toScreen(x, y, z) { _p.set(x, y, z).project(camera); return { x: (_p.x * 0.5 + 0.5) * W, y: (-_p.y * 0.5 + 0.5) * H, ok: _p.z < 1 && _p.z > -1 }; }
function updateNums(dt) {
  for (const n of NUMS) {
    if (!n.on) continue;
    n.age += dt; if (n.age >= n.life) { n.on = false; numLive--; n.el.style.opacity = 0; continue; }
    const s = toScreen(n.x, n.y, n.z);
    if (!s.ok) { n.el.style.opacity = 0; continue; }
    const k = n.age / n.life;
    n.el.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + (s.y - k * 34).toFixed(1) + 'px) translate(-50%,-50%) scale(' + (1 + (1 - k) * (n.big ? 0.4 : 0.15)) + ')';
    n.el.style.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
  }
}
const tombLabel = document.createElement('div'); tombLabel.className = 'sw-tomb-label'; tombLabel.textContent = 'IRONTOMB · 行星級'; $('#sw-hud').appendChild(tombLabel);

/* 指令標記 */
const MARKS = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(RING_GEO, addMat(0x66ffcc, 0.9)); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); MARKS.push({ m, life: 0 }); }
let markIdx = 0;
function mark(x, y, z, col) { const k = MARKS[markIdx++ % MARKS.length]; k.m.material.color.set(col || 0x66ffcc); k.m.position.set(x, y + 0.3, z); k.life = 0.9; k.m.visible = true; }
function updateMarks(dt) { for (const k of MARKS) { if (k.life <= 0) continue; k.life -= dt; if (k.life <= 0) { k.m.visible = false; continue; } const p = 1 - k.life / 0.9; k.m.scale.setScalar(4 + p * 16); k.m.material.opacity = (1 - p) * 0.9; } }

/* 螺絲咕姆的巨型光束泡 */
const BUBS = [], BLASTS = [];
for (let i = 0; i < 16; i++) {
  const o = mkGlow(0xffd84a, 30, 0.9), c = mkGlow(0xffffff, 13, 1); o.visible = c.visible = false; scene.add(o, c);
  BUBS.push({ o, c, on: false, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, tomb: false, age: 0 });
}
for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), addMat(0xffe45a, 0.9)); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); BLASTS.push({ m, life: 0, max: 0.7 }); }
let blastIdx = 0;
function blast(x, y, z) { const b = BLASTS[blastIdx++ % BLASTS.length]; b.m.position.set(x, y, z); b.life = b.max; b.m.visible = true; }
function launchBubble(s, tx, ty, tz, tomb) {
  const b = BUBS.find((q) => !q.on); if (!b) return;
  b.on = true; b.x = s.x; b.y = s.y; b.z = s.z; b.tx = tx; b.ty = ty; b.tz = tz; b.tomb = tomb; b.age = 0; b.o.visible = b.c.visible = true;
  explode(s.x, s.y, s.z, 0.5, false); Snd.zap(true);
}
function detonate(b) {
  const x = b.x, y = b.y, z = b.z;
  blast(x, y, z); explode(x, y, z, 4.5, false); Snd.boom(3.5);
  for (let i = 0; i < 46; i++) { const a = rnd(0, Math.PI * 2), sp = rnd(25, 60), u = rnd(-0.6, 0.6); emit(x, y, z, Math.cos(a) * sp, u * sp, Math.sin(a) * sp, 1, rnd(0.8, 1), rnd(0.3, 0.7), rnd(3, 7), rnd(0.5, 1.1), 1.8); }
  if (b.tomb) { hitIron(9000, true); return; }
  dmgNum(x, y + 12, z, 1700 * rnd(0.9, 1.1), true);
  for (const e of enemies) { if (e.dead) continue; if (Math.hypot(e.x - x, e.y - y, e.z - z) < 38) { e.hp -= 1700; if (e.hp <= 0) killShip(e); } }
}
function updateBubbles(dt) {
  for (const b of BUBS) {
    if (!b.on) continue;
    b.age += dt;
    const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z, d = Math.hypot(dx, dy, dz) || 1, stop = b.tomb ? TOMB.r + 5 : 3, sp = 95;
    if (d <= stop + sp * dt) { detonate(b); b.on = false; b.o.visible = b.c.visible = false; continue; }
    b.x += dx / d * sp * dt; b.y += dy / d * sp * dt; b.z += dz / d * sp * dt;
    b.o.position.set(b.x, b.y, b.z); b.c.position.set(b.x, b.y, b.z);
    b.o.scale.setScalar(30 + 5 * Math.sin(b.age * 22));
    emit(b.x, b.y, b.z, rnd(-4, 4), rnd(-3, 3), rnd(-4, 4), 1, rnd(0.75, 0.95), 0.3, rnd(5, 9), 0.5, 2);
  }
  for (const k of BLASTS) { if (k.life <= 0) continue; k.life -= dt; if (k.life <= 0) { k.m.visible = false; continue; } const p = 1 - k.life / k.max; k.m.scale.setScalar(5 + p * 36); k.m.material.opacity = (1 - p) * 0.9; }
}

/* 艦艇的垂直參考線（立體位置一目了然） */
const DROP = (function () {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 6), 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x78c4e6, transparent: true, opacity: 0.22 })); l.frustumCulled = false; scene.add(l); return l;
})();
function updateDrops() {
  const a = DROP.geometry.attributes.position.array; let n = 0;
  for (const s of allies) { if (s.dead || s.d.rad < 6 || n >= 120) continue; a.set([s.x, s.y, s.z, s.x, 0, s.z], n * 6); n++; }
  DROP.geometry.setDrawRange(0, n * 2); DROP.geometry.attributes.position.needsUpdate = true;
}

/* ───────── 戰鬥邏輯 ───────── */
function killShip(s) {
  if (s.dead) return; s.dead = true;
  const quiet = doom.on && doom.impacted;
  explode(s.x, s.y, s.z, s.d.boom * (quiet ? 0.45 : 1), s.side === 'e'); if (!quiet || Math.random() < 0.2) Snd.boom(s.d.boom);
  if (s.side === 'e') kills++;
}
function hitIron(dmg, big) {
  ironDmg += dmg;
  if (Math.random() < (big ? 1 : 0.1)) dmgNum(TOMB.x + rnd(-14, 14), TOMB.y + TOMB.numY + rnd(0, 10), TOMB.z + rnd(-14, 14), dmg * rnd(0.9, 1.4), true);
}
function tombPoint(fx, fy, fz) {
  if (TOMB.parts) { // 真實模型：從身體各部位的命中球挑一個，取朝向攻擊者的那一面
    const P = TOMB.parts[(Math.random() * TOMB.parts.length) | 0], cx = TOMB.x + P[0], cy = TOMB.y + P[1], cz = TOMB.z + P[2];
    let dx = fx - cx, dy = fy - cy, dz = fz - cz; const l = Math.hypot(dx, dy, dz) || 1;
    dx = dx / l + rnd(-0.3, 0.3); dy = dy / l + rnd(-0.3, 0.3); dz = dz / l + rnd(-0.3, 0.3); const m = Math.hypot(dx, dy, dz) || 1;
    return [cx + dx / m * P[3], cy + dy / m * P[3], cz + dz / m * P[3]];
  }
  let dx = fx - TOMB.x, dy = fy - TOMB.y, dz = fz - TOMB.z; const l = Math.hypot(dx, dy, dz) || 1;
  dx = dx / l + rnd(-0.25, 0.25); dy = dy / l + rnd(-0.25, 0.25); dz = dz / l + rnd(-0.25, 0.25); const m = Math.hypot(dx, dy, dz) || 1;
  return [TOMB.x + dx / m * TOMB.r, TOMB.y + dy / m * TOMB.r, TOMB.z + dz / m * TOMB.r];
}
function nearest(s, foes) {
  let best = 1e12, f = null;
  for (let i = 0; i < foes.length; i++) { const o = foes[i]; if (o.dead) continue; const dx = o.x - s.x, dy = o.y - s.y, dz = o.z - s.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < best) { best = d2; f = o; } }
  return [f, Math.sqrt(best)];
}
function moveShip(s, dx, dy, dz, k, dt) {
  const hd = Math.hypot(dx, dz), wantH = Math.atan2(dx, dz), wantP = clamp(Math.atan2(dy, hd || 1e-6), -1.1, 1.1), dh = wrapPi(wantH - s.h);
  s.h += dh * Math.min(1, dt * 3.2); s.p += (wantP - s.p) * Math.min(1, dt * 3);
  s.roll += (clamp(-dh * 0.9, -0.55, 0.55) - s.roll) * Math.min(1, dt * 2.5); // 轉彎時機身傾斜
  const f = Math.max(0, Math.cos(dh)) * k * s.d.spd * dt, cp = Math.cos(s.p);
  s.x += Math.sin(s.h) * cp * f; s.y = clamp(s.y + Math.sin(s.p) * f, -380, 380); s.z += Math.cos(s.h) * cp * f;
}
function faceTo(s, x, y, z, dt) {
  const dx = x - s.x, dz = z - s.z;
  s.h += wrapPi(Math.atan2(dx, dz) - s.h) * Math.min(1, dt * 2.5);
  s.p += (clamp(Math.atan2(y - s.y, Math.hypot(dx, dz) || 1e-6), -1.1, 1.1) - s.p) * Math.min(1, dt * 2.5);
}

function stepShip(s, dt, t) {
  const d = s.d, ally = s.side === 'a', foes = ally ? enemies : allies;
  if (s.ctrl) { s.cd -= dt; s.ctrl.update(s, dt, t, API); return; } // 玩家（或其他外部）接手：略過內建 AI
  s.cd -= dt; s.nt -= dt;
  if (s.nt <= 0 || !s.nf || s.nf.dead) { s.nf = nearest(s, foes)[0]; s.nt = rnd(0.2, 0.45); }
  const nf = s.nf, nd = nf ? Math.hypot(nf.x - s.x, nf.y - s.y, nf.z - s.z) : 1e9;
  let tgt = null, tombShot = false;
  const cTomb = Math.hypot(s.x - TOMB.x, s.y - TOMB.y, s.z - TOMB.z), dTomb = cTomb - TOMB.r;
  if (ally) {
    const o = s.order;
    if (o && o.type === 'iron' && dTomb <= d.range) { if (nf && nd <= d.range && Math.random() < 0.45) tgt = nf; else tombShot = true; }
    else if (nf && nd <= d.range) tgt = nf;
    else if (dTomb <= d.range * 0.92 && ((!o && !nf) || (o && o.type !== 'move'))) tombShot = true;
    // 移動
    let mx = 0, my = 0, mz = 0, mv = false, k = 1;
    if (o && o.type === 'move') { mx = s.tx - s.x; my = s.ty - s.y; mz = s.tz - s.z; if (Math.hypot(mx, my, mz) > 3) mv = true; else s.order = null; }
    else if (o && o.type === 'iron') { if (cTomb > ZONE + s.hold) { mx = TOMB.x - s.x; my = TOMB.y - s.y; mz = TOMB.z - s.z; mv = true; } }
    else if (o && o.type === 'charge') { if (nf && nd > d.range * 0.7) { mx = nf.x - s.x; my = nf.y - s.y; mz = nf.z - s.z; mv = true; } else if (!nf) s.order = { type: 'iron' }; }
    else if (nf && nd < 210 && nd > d.range * 0.7) { mx = nf.x - s.x; my = nf.y - s.y; mz = nf.z - s.z; mv = true; k = 0.6; }
    if (mv) moveShip(s, mx, my, mz, k, dt);
    else if (tgt || tombShot) { // 交戰中的艦艇緩緩繞行，不會死死定在原地
      const tx = tgt ? tgt.x : TOMB.x, ty = tgt ? tgt.y : TOMB.y, tz = tgt ? tgt.z : TOMB.z;
      moveShip(s, -(tz - s.z) * s.str, Math.sin(t * 0.4 + s.ph) * 20, (tx - s.x) * s.str, 0.22, dt);
    }
  } else {
    if (nf && nd <= d.range) tgt = nf;
    if (nf && nd < 240) {
      const dx = nf.x - s.x, dy = nf.y - s.y, dz = nf.z - s.z;
      if (nd > d.range * 0.72) moveShip(s, dx, dy, dz, 1, dt);
      else if (s.kind === 'fly') moveShip(s, -dz * s.str, dy * 0.3, dx * s.str, 0.8, dt);
      else faceTo(s, nf.x, nf.y, nf.z, dt);
    } else {
      const r = Math.hypot(s.x, s.z) || 1, rr = Math.hypot(s.x, s.y, s.z) || 1;
      moveShip(s, -s.z / r + (s.x / rr) * (165 - rr) * 0.04, -s.y * 0.02, s.x / r + (s.z / rr) * (165 - rr) * 0.04, 0.45, dt);
    }
  }
  if (s.kind === 'fly') s.sx = 0.82 + 0.2 * Math.sin(t * 9 + s.ph); // 蝶翼拍動
  // 開火
  if (s.cd <= 0 && (tgt || tombShot)) {
    s.cd = d.cd * rnd(0.85, 1.15);
    const dmg = rnd(d.dmg[0], d.dmg[1]);
    if (d.bubble) { if (tombShot) launchBubble(s, TOMB.x, TOMB.y, TOMB.z, true); else launchBubble(s, tgt.x, tgt.y, tgt.z, false); return; }
    const mp = muzzle(s);
    if (tombShot) {
      const q = tombPoint(s.x, s.y, s.z), dur = fireBeam(mp.x, mp.y, mp.z, q[0], q[1], q[2], d.beam, d.w, 0.16);
      hitIron(dmg, s.kind === 'cap' || s.kind === 'hss');
      if (fx && Math.random() < 0.35) fx.later(dur, () => fx.explode(q[0], q[1], q[2], 0.3, false));
    } else {
      const dur = fireBeam(mp.x, mp.y, mp.z, tgt.x, tgt.y, tgt.z, d.beam, d.w, 0.14);
      tgt.hp -= dmg;
      if (ally && Math.random() < 0.05) dmgNum(tgt.x, tgt.y + 8, tgt.z, dmg * rnd(0.9, 1.5), false);
      if (fx) { const hx = tgt.x, hy = tgt.y, hz = tgt.z, big = s.kind === 'cap' || s.kind === 'hss'; fx.later(dur, () => fx.emit(hx, hy, hz, rnd(-8, 8), rnd(2, 9), rnd(-8, 8), 1, 0.8, 0.5, big ? 9 : 4.5, 0.35, 1, 1)); }
      if (tgt.hp <= 0) killShip(tgt);
    }
    Snd.zap(s.kind === 'cap' || s.kind === 'whale' || s.kind === 'hss');
  }
}
function separate(arr, ally) {
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i]; if (a.dead) continue;
    for (let j = i + 1; j < arr.length; j++) {
      const b = arr[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, m = (a.d.rad + b.d.rad) * 0.85;
      if (Math.abs(dx) > m || Math.abs(dy) > m || Math.abs(dz) > m) continue;
      const d2 = dx * dx + dy * dy + dz * dz; if (d2 >= m * m || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), p = (m - d) * 0.5 / d;
      a.x -= dx * p; a.y -= dy * p; a.z -= dz * p; b.x += dx * p; b.y += dy * p; b.z += dz * p;
    }
    // 禁區：聯軍不得進入鐵墓周圍的球形禁區；敵方只是不能穿進本體
    const cx = a.x - TOMB.x, cy = a.y - TOMB.y, cz = a.z - TOMB.z, cd = Math.hypot(cx, cy, cz), lim = ally ? ZONE : TOMB.r + a.d.rad + 2;
    if (cd < lim && cd > 0.01) { const k = lim / cd; a.x = TOMB.x + cx * k; a.y = TOMB.y + cy * k; a.z = TOMB.z + cz * k; }
  }
}

/* 鐵墓的反擊 */
let lanceT = 0, ringT = 0;
function lanceTarget(t) {
  const pool = allies.filter((s) => !s.dead && (t > 120 || (s.kind !== 'cap' && s.kind !== 'hss' && s.kind !== 'moon')));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
function tombAct(dt, t) {
  lanceT -= dt; ringT -= dt;
  if (t > 22 && lanceT <= 0) {
    lanceT = lerp(2.6, 0.8, clamp((t - 22) / 115, 0, 1)) * rnd(0.7, 1.3);
    for (let k = t > 115 ? 2 : 1; k > 0; k--) {
      const s = lanceTarget(t);
      if (s) {
        const q = tombPoint(s.x, s.y, s.z); fireBeam(q[0], q[1], q[2], s.x, s.y, s.z, 'red', 2.4, 0.5);
        s.hp = 0; killShip(s); Snd.boom(1.5);
        cam.shake = Math.max(cam.shake, 0.35);
      }
    }
  }
  if (ringT <= 0) { ringT = 5.5; pulses.push({ age: 0 }); }
}
const pulses = [];
const pulseMesh = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 128), addMat(0xff3b5c, 0.6)); pulseMesh.rotation.x = -Math.PI / 2; pulseMesh.position.y = 0.2; pulseMesh.visible = false; scene.add(pulseMesh);
const pulseMeshes = [pulseMesh];
function updatePulses(dt) {
  for (let i = 0; i < pulses.length; i++) { pulses[i].age += dt; }
  while (pulses.length > 1 && pulses[0].age > 4) pulses.shift();
  const p = pulses[pulses.length - 1];
  if (p && p.age < 4) { pulseMesh.visible = true; const k = p.age / 4; pulseMesh.scale.setScalar(72 + k * 260); pulseMesh.material.opacity = (1 - k) * 0.55; } else pulseMesh.visible = false;
}

/* ───────── 末日演出 ───────── */
const doom = { on: false, sword: null, wave: null, waveDisc: null, bolts: null, boltT: 0, waveR: 0, impacted: false, waveT: 0 };
function buildDoom() {
  const sw = new THREE.Group();
  const outline = [[0, 0], [3, 24], [1.4, 60], [3.4, 105], [1.3, 180], [0, 262]];
  const segs = [];
  for (const sg of [1, -1]) for (let i = 0; i < outline.length - 1; i++) segs.push([sg * outline[i][0], outline[i][1], 0, sg * outline[i + 1][0], outline[i + 1][1], 0]);
  segs.push([0, 0, 0, 0, 262, 0]); [60, 105, 150].forEach((y) => { segs.push([-3.4, y, 0, 3.4, y, 0]); });
  const lg = seg3(segs), lm = new THREE.LineBasicMaterial({ color: 0xffb0c0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const l1 = new THREE.LineSegments(lg, lm), l2 = l1.clone(); l2.rotation.y = Math.PI / 2; sw.add(l1, l2);
  const core = new THREE.Mesh(new THREE.BoxGeometry(4.2, 262, 4.2), addMat(0xff2a4a, 0.8)); core.position.y = 131; sw.add(core);
  const white = new THREE.Mesh(new THREE.BoxGeometry(1.5, 262, 1.5), addMat(0xffffff, 0.95)); white.position.y = 131; sw.add(white);
  const tip = mkGlow(0xff4a68, 190, 0.95); sw.add(tip); sw.userData.tip = tip;
  sw.scale.set(2.4, 1, 2.4); sw.position.set(0, 560, 0); sw.visible = false; scene.add(sw); doom.sword = sw;
  const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), addMat(0xff2a4a, 0.12)); disc.visible = false; scene.add(disc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 160), addMat(0xffe0e8, 0.95)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; ring.visible = false; scene.add(ring);
  doom.waveDisc = disc; doom.wave = ring;
  const NB = 26, bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB * 8 * 6), 3));
  doom.bolts = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xff7a92, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  doom.bolts.frustumCulled = false; doom.bolts.visible = false; scene.add(doom.bolts); doom.NB = NB;
}
function regenBolts(sx, sy, sz, R) {
  const pos = doom.bolts.geometry.attributes.position.array; let o = 0;
  for (let b = 0; b < doom.NB; b++) {
    const a = rnd(0, Math.PI * 2), r = R > 5 ? rnd(0.15, 1) * Math.min(R, 520) : rnd(20, 60);
    const ex = sx + Math.cos(a) * r, ez = sz + Math.sin(a) * r;
    let px = sx, py = sy, pz = sz;
    for (let i = 1; i <= 8; i++) {
      const k = i / 8, nx = lerp(sx, ex, k) + (i < 8 ? rnd(-14, 14) : 0), ny = lerp(sy, 2, k) + (i < 8 ? rnd(-10, 10) : 0), nz = lerp(sz, ez, k) + (i < 8 ? rnd(-14, 14) : 0);
      pos[o++] = px; pos[o++] = py; pos[o++] = pz; pos[o++] = nx; pos[o++] = ny; pos[o++] = nz; px = nx; py = ny; pz = nz;
    }
  }
  doom.bolts.geometry.attributes.position.needsUpdate = true;
}
function updateDoom(dt, t) {
  const sw = doom.sword;
  const p = clamp((t - T.DOOM) / (T.IMPACT - T.DOOM), 0, 1);
  if (!doom.impacted) {
    sw.visible = true; sw.position.y = lerp(560, TOMB.parts ? 60 : 22, Math.pow(p, 2.4));
    if (p > 0.15) { emit(rnd(-1.5, 1.5), sw.position.y + rnd(0, 120), rnd(-1.5, 1.5), 0, -40, 0, 1, 0.3, 0.45, rnd(6, 14), 0.9, 0.5); }
    cam.shake = p * p * 1.4;
    scene.background.lerp(BG_DOOM, dt * 0.35); sky.material.uniforms.uDoom.value = Math.min(1, sky.material.uniforms.uDoom.value + dt * 0.18);
    TOMB.glow.material.opacity = 0.8 + p * 0.2;
  }
  if (!doom.impacted && t >= T.IMPACT) {
    doom.impacted = true; doom.waveT = 0;
    doom.waveDisc.visible = doom.wave.visible = doom.bolts.visible = true;
    cam.shake = 5; Snd.boom(8); flashDom('#ffd2dc', 0.9, 0.9);
    for (let i = 0; i < 140; i++) { const a = rnd(0, Math.PI * 2), s = rnd(40, 160); emit(0, rnd(2, 30), 0, Math.cos(a) * s, rnd(5, 60), Math.sin(a) * s, 1, rnd(0.3, 0.8), rnd(0.35, 0.8), rnd(6, 14), rnd(1, 2.4), 1.2); }
  }
  if (doom.impacted) {
    doom.waveT += dt; const tt = doom.waveT, R = 48 * tt + 15 * tt * tt;
    const wasR = doom.waveR; doom.waveR = R;
    doom.waveDisc.scale.setScalar(Math.max(R, 1)); doom.wave.scale.setScalar(Math.max(R, 1));
    doom.waveDisc.material.opacity = Math.max(0.03, 0.12 - tt * 0.008);
    cam.shake = Math.max(0, cam.shake - dt * 1.0);
    doom.boltT -= dt; if (doom.boltT <= 0) { doom.boltT = 0.07; regenBolts(0, 80, 0, R); }
    // 衝擊波掃過就摧毀
    for (const arr of [allies, enemies]) for (const s of arr) { const rr = Math.hypot(s.x, s.y, s.z); if (!s.dead && rr <= R + 6 && rr >= wasR - 40) { if (Math.random() < 0.55 || rr < R - 20) { s.hp = 0; killShip(s); } } }
    for (const sy of SYSTEMS) if (!sy.hit && Math.hypot(sy.x, sy.z) <= R) { sy.hit = true; explode(sy.x, 34, sy.z, 7, false); Snd.boom(3); sy.glow.material.color.set(0xff3050); }
    // 閃爍的紅光
    if (Math.random() < 0.3) emit(rnd(-300, 300), rnd(0, 120), rnd(-300, 300), rnd(-20, 20), rnd(0, 20), rnd(-20, 20), 1, 0.4, 0.5, rnd(8, 18), 1.2, 1);
  }
  cam.az += dt * 0.025;
  cam.dist = lerp(cam.dist, 680, dt * 0.4); cam.pol = lerp(cam.pol, 0.85, dt * 0.4);
  cam.tx = lerp(cam.tx, 0, dt * 0.5); cam.tz = lerp(cam.tz, 0, dt * 0.5);
}

/* ───────── 鏡頭與操作 ───────── */
let control = false, selCount = 0;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tombSphere = new THREE.Sphere(new THREE.Vector3(TOMB.x, TOMB.y, TOMB.z), 32);
function pickRay(cx, cy) { ndc.set(cx / W * 2 - 1, -(cy / H) * 2 + 1); ray.setFromCamera(ndc, camera); }
let cmdY = 0; // 指令平面高度（Y 軸）
const cmdPlane = (function () {
  const pts = []; for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 340, 0, Math.sin(a) * 340)); }
  const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.4 })); l.visible = false; scene.add(l); return l;
})();
function setCmdY(v) { cmdY = clamp(v, -200, 200); cmdPlane.position.y = cmdY; cmdPlane.visible = cmdY !== 0; $('#sw-cmdy').textContent = (cmdY > 0 ? '+' : '') + cmdY; }
function groundPoint(cx, cy) { pickRay(cx, cy); const o = ray.ray.origin, d = ray.ray.direction; if (Math.abs(d.y) < 1e-4) return null; const k = (cmdY - o.y) / d.y; if (k < 0) return null; return [o.x + d.x * k, o.z + d.z * k]; }
function selected() { return allies.filter((s) => s.sel && !s.dead); }
function setSel(list) {
  const few = list.length <= 50; // 大量選取時，只替大型艦畫選取環，避免畫面被圈圈淹沒
  for (const s of allies) { s.sel = false; s.ring = false; }
  for (const s of list) { s.sel = true; s.ring = few || s.d.rad > 9; }
}
function orderMove(list, px, py, pz) {
  if (!list.length) return;
  const n = list.length, R = Math.max(14, Math.cbrt(n) * 10), sorted = list.slice().sort((a, b) => b.d.rad - a.d.rad);
  sorted.forEach((s, i) => {
    const u = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - u * u), a = i * 2.39996, k = Math.cbrt((i + 0.5) / n) * R;
    let x = px + Math.cos(a) * r * k, y = py + u * k * 0.8, z = pz + Math.sin(a) * r * k;
    const dx = x - TOMB.x, dy = y - TOMB.y, dz = z - TOMB.z, dd = Math.hypot(dx, dy, dz) || 1, lim = ZONE + 8; // 目標點不得落在禁區內
    if (dd < lim) { const kk = lim / dd; x = TOMB.x + dx * kk; y = TOMB.y + dy * kk; z = TOMB.z + dz * kk; }
    s.order = { type: 'move' }; s.tx = x; s.ty = y; s.tz = z;
  });
  mark(px, py, pz);
}
function orderIron(list) { if (!list.length) return; list.forEach((s) => { s.order = { type: 'iron' }; }); mark(TOMB.x, TOMB.y, TOMB.z, 0xff4466); }
function orderCharge(list) { list.forEach((s) => { s.order = { type: 'charge' }; }); }
function clickCommand(cx, cy, additive) {
  if (!control) return;
  // 點選單艦
  let best = null, bd = 22;
  for (const s of allies) { if (s.dead) continue; const p = toScreen(s.x, s.y, s.z); if (!p.ok) continue; const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = s; } }
  if (best && (selected().length === 0 || additive)) { if (!additive) setSel([]); setSel(selected().concat(best)); return; }
  pickRay(cx, cy);
  if (ray.ray.intersectSphere(tombSphere, new THREE.Vector3())) { orderIron(selected()); return; }
  const g = groundPoint(cx, cy); if (g) orderMove(selected(), g[0], cmdY, g[1]);
}
function boxSelect(x1, y1, x2, y2, additive) {
  const xa = Math.min(x1, x2), xb = Math.max(x1, x2), ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  const out = additive ? selected() : [];
  for (const s of allies) { if (s.dead) continue; const p = toScreen(s.x, s.y, s.z); if (p.ok && p.x >= xa && p.x <= xb && p.y >= ya && p.y <= yb && !out.includes(s)) out.push(s); }
  setSel(out);
}
function panBy(dx, dy) {
  const sc = cam.dist * 0.0016, r = [Math.cos(cam.az), -Math.sin(cam.az)], f = [-Math.sin(cam.az), -Math.cos(cam.az)];
  cam.tx = clamp(cam.tx - dx * sc * r[0] + dy * sc * f[0], -520, 520); cam.tz = clamp(cam.tz - dx * sc * r[1] + dy * sc * f[1], -520, 520);
}
const box = document.createElement('div'); box.className = 'sw-box'; $('#sw-root').appendChild(box);
const ptr = new Map(); let mode = null, sx = 0, sy = 0, moved = false, pinch = null, shiftKey = false;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  if (cam.locked) return;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); shiftKey = e.shiftKey;
  if (ptr.size === 1) { sx = e.clientX; sy = e.clientY; moved = false; mode = e.pointerType === 'mouse' ? (e.button === 0 ? 'select' : e.button === 2 ? 'orbit' : 'pan') : 'tap'; }
  else if (ptr.size === 2) { const [a, b] = [...ptr.values()]; mode = 'pinch'; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; }
});
cv.addEventListener('pointermove', (e) => {
  const p = ptr.get(e.pointerId); if (!p || cam.locked) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (mode === 'select') {
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) moved = true;
    if (moved && control) { box.style.display = 'block'; box.style.left = Math.min(sx, e.clientX) + 'px'; box.style.top = Math.min(sy, e.clientY) + 'px'; box.style.width = Math.abs(e.clientX - sx) + 'px'; box.style.height = Math.abs(e.clientY - sy) + 'px'; }
  } else if (mode === 'orbit') { cam.az -= dx * 0.005; cam.pol = clamp(cam.pol + dy * 0.004, 0.25, 1.4); }
  else if (mode === 'pan') panBy(dx, dy);
  else if (mode === 'tap') { if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) moved = true; if (moved) panBy(dx, dy); }
  else if (mode === 'pinch' && ptr.size === 2) {
    const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    cam.dist = clamp(cam.dist * pinch.d / Math.max(d, 1), 70, 1300); cam.az -= wrapPi(ang - pinch.ang); pinch.d = d; pinch.ang = ang;
  }
});
function endPtr(e) {
  if (!ptr.has(e.pointerId)) return;
  if (!cam.locked) {
    if (mode === 'select') { if (!moved) clickCommand(e.clientX, e.clientY, e.shiftKey); else if (control) boxSelect(sx, sy, e.clientX, e.clientY, e.shiftKey); box.style.display = 'none'; }
    else if (mode === 'tap' && !moved) clickCommand(e.clientX, e.clientY, false);
  }
  ptr.delete(e.pointerId); if (ptr.size === 0) mode = null; else if (ptr.size === 1) mode = 'tap';
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', (e) => { box.style.display = 'none'; ptr.delete(e.pointerId); if (!ptr.size) mode = null; });
cv.addEventListener('wheel', (e) => { if (cam.locked) return; e.preventDefault(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.001), 70, 1300); }, { passive: false });
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!control) return;
  if (e.code === 'Digit1') cmd('all'); else if (e.code === 'Digit2') cmd('charge'); else if (e.code === 'Digit3') cmd('iron'); else if (e.code === 'KeyR') cmd('up'); else if (e.code === 'KeyF') cmd('down');
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
function updateKeys(dt) {
  if (cam.locked) return;
  const sp = cam.dist * 0.9 * dt;
  let fx = 0, fz = 0;
  if (keys.KeyW || keys.ArrowUp) { fx += 1; } if (keys.KeyS || keys.ArrowDown) { fx -= 1; }
  if (keys.KeyD || keys.ArrowRight) { fz += 1; } if (keys.KeyA || keys.ArrowLeft) { fz -= 1; }
  if (fx || fz) {
    cam.tx = clamp(cam.tx + (-Math.sin(cam.az) * fx + Math.cos(cam.az) * fz) * sp, -520, 520);
    cam.tz = clamp(cam.tz + (-Math.cos(cam.az) * fx - Math.sin(cam.az) * fz) * sp, -520, 520);
  }
  if (keys.KeyQ) cam.az += dt * 1.1; if (keys.KeyE) cam.az -= dt * 1.1;
}
function cmd(c) {
  if (!control) return;
  if (c === 'all') { setSel(allies.filter((s) => !s.dead)); }
  else if (c === 'charge') { if (!selected().length) setSel(allies.filter((s) => !s.dead)); orderCharge(selected()); }
  else if (c === 'iron') { if (!selected().length) setSel(allies.filter((s) => !s.dead)); orderIron(selected()); }
  else if (c === 'up') setCmdY(cmdY + 25); else if (c === 'down') setCmdY(cmdY - 25);
}
document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => cmd(b.dataset.cmd)));

/* ───────── 字幕／HUD／轉場 ───────── */
const subs = {};
['center', 'sub'].forEach((k) => { const el = $('#sw-' + k); subs[k] = { el, who: el.querySelector('.sw-who'), en: el.querySelector('.sw-en'), zh: el.querySelector('.sw-zh'), cur: null, n: -1 }; });
function typed(txt, p) { const n = Math.ceil(txt.length * p); return txt.slice(0, n) + '<span class="sw-ghost">' + txt.slice(n) + '</span>'; }
function updateSubs(t) {
  for (const k of ['center', 'sub']) {
    const S = subs[k], cur = CUES.find((c) => c.box === k && t >= c.t && t < c.t + c.dur) || null;
    if (cur !== S.cur) {
      S.cur = cur; S.n = -1;
      if (cur) { const w = WHO[cur.who]; S.who.textContent = LANG === 'zh' ? w.zh + ' · ' + w.en : w.en; S.who.style.color = w.c; S.el.classList.add('on'); }
      else S.el.classList.remove('on');
    }
    if (cur) {
      const p = clamp((t - cur.t) / cur.type, 0, 1), n = Math.ceil(p * 200);
      if (n !== S.n) { S.n = n; S.en.innerHTML = typed(cur.en, p); S.zh.innerHTML = typed(cur.zh, clamp(p * 1.05, 0, 1)); }
    }
  }
}
const tickerEl = $('#sw-ticker');
function pushTick(zh, en) {
  const d = document.createElement('div'); d.className = 'sw-tick';
  d.innerHTML = '<div class="sw-tick-zh"></div><div class="sw-tick-en"></div>'; d.children[0].textContent = zh; d.children[1].textContent = en;
  tickerEl.appendChild(d); while (tickerEl.children.length > 3) tickerEl.removeChild(tickerEl.firstChild);
  setTimeout(() => d.classList.add('out'), 8500); setTimeout(() => d.remove(), 9800);
}
const veil = $('#sw-veil');
function setVeil(color, opacity, sec) { veil.style.transition = 'opacity ' + sec + 's linear'; veil.style.background = color; veil.style.opacity = opacity; }
function flashDom(color, opacity, sec) {
  veil.style.transition = 'none'; veil.style.background = color; veil.style.opacity = opacity; void veil.offsetWidth;
  veil.style.transition = 'opacity ' + sec + 's ease-out'; veil.style.opacity = 0;
}
let isMuted = false;
const STR = {
  en: {
    h1: 'Amphoreus Finale · Space Battle',
    note: 'Command the Anti-Irontomb Cosmic Alliance fleet, crush the Antimatter Legion, and face the planet-sized Irontomb.<br/>About 3.5 minutes. Sound on and headphones recommended.<br/>Desktop: left-drag to box-select, click to order, right-drag to rotate, wheel to zoom. Mobile: tap to order, drag to pan, pinch to zoom.',
    go: 'Enter Battlefield', goMute: 'Enter Muted', lang: '中文版', loading: 'Loading music…', loadingModels: 'Loading models…', qHigh: 'Graphics: High', qLow: 'Graphics: Low',
    legal: 'Unofficial fan work, not affiliated with the game\'s publisher. Dialogue and settings © their respective owners.<br/>Music: "Agony Converging into River" © HOYO-MiX.',
    ships: 'Ships', kills: 'Kills', sel: 'Selected', alt: 'Alt Y',
    all: 'Select all', charge: 'Charge', up: 'Alt▲', down: 'Alt▼', iron: 'Focus Tomb',
    soundOn: 'Sound: On', soundOff: 'Sound: Off', tomb: 'IRONTOMB · PLANETARY',
    helpD: '<b>Left-drag</b> box select　<b>Left-click</b> move / click the Tomb to focus<br/><b>Right-drag</b> rotate　<b>Wheel</b> zoom　<b>WASD</b> pan<br/><b>R/F</b> command altitude (3D)　<b>1/2/3</b> shortcuts',
    helpC: '<b>Tap</b> to order　<b>Drag</b> to pan<br/><b>Pinch</b> zoom / rotate　<b>Alt▲▼</b> command altitude'
  },
  zh: {
    h1: '翁法羅斯終章・太空戰',
    note: '指揮反鐵墓宇宙聯軍的艦隊，碾壓反物質軍團，直面行星級的鐵墓。<br/>約 3 分半鐘的互動體驗，建議開啟聲音並使用耳機。<br/>桌機：左鍵框選／下令、右鍵旋轉、滾輪縮放。手機：輕點下令、拖曳平移、雙指縮放。',
    go: '進入戰場', goMute: '靜音進入', lang: 'English', loading: '載入配樂…', loadingModels: '載入模型中…', qHigh: '畫質：高', qLow: '畫質：低',
    legal: '非官方同人作品，與遊戲官方無關。劇中台詞與設定版權歸原權利人所有。<br/>配樂：《Agony Converging into River》© HOYO-MiX。',
    ships: '艦艇', kills: '擊毀', sel: '選取', alt: '高度 Y',
    all: '全選艦隊', charge: '全軍突擊', up: '高度▲', down: '高度▼', iron: '集火鐵墓',
    soundOn: '音效：開', soundOff: '音效：關', tomb: 'IRONTOMB · 行星級',
    helpD: '<b>左鍵拖曳</b> 框選　<b>左鍵點擊</b> 移動／點鐵墓集火<br/><b>右鍵拖曳</b> 旋轉　<b>滾輪</b> 縮放　<b>WASD</b> 平移<br/><b>R/F</b> 指令高度（立體戰場）　<b>1/2/3</b> 快捷指令',
    helpC: '<b>輕點</b> 下令移動／攻擊　<b>拖曳</b> 平移<br/><b>雙指</b> 縮放旋轉　<b>高度▲▼</b> 切換指令高度'
  }
};
const setQLabel = () => { const b = $('#sw-q'); if (b) b.textContent = QUALITY === 'high' ? STR[LANG].qHigh : STR[LANG].qLow; };
const setMuteLabel = () => { $('#sw-mute').textContent = isMuted ? STR[LANG].soundOff : STR[LANG].soundOn; };
function applyLang(l) {
  LANG = l; try { localStorage.setItem('sw-lang', l); } catch (e) {}
  const root = $('#sw-root'); root.classList.toggle('lang-en', l === 'en'); root.classList.toggle('lang-zh', l === 'zh');
  document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en'; document.title = l === 'zh' ? '翁法羅斯終章・太空戰' : 'Amphoreus Finale · Space Battle';
  document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = STR[l][el.dataset.i]; });
  tombLabel.textContent = STR[l].tomb; setMuteLabel(); setQLabel(); helpEl.innerHTML = COARSE ? STR[l].helpC : STR[l].helpD;
}
const hud = $('#sw-hud'), helpEl = $('#sw-help'), cmdsEl = $('#sw-cmds'), endEl = $('#sw-end');
function updateHud(t) {
  $('#sw-clock').textContent = fmtClock(Math.max(0, t - T.REVEAL));
  const f = ironFrac() * 100;
  if (ghostPct > f) ghostPct = Math.max(f, ghostPct - 0.05); else ghostPct = f;
  $('#sw-boss-fill').style.width = f + '%'; $('#sw-boss-ghost').style.width = ghostPct + '%'; $('#sw-boss-pct').textContent = f.toFixed(2) + '%';
  $('#sw-n-ally').textContent = allies.length; $('#sw-n-kill').textContent = kills; $('#sw-n-sel').textContent = selected().length;
  const on = hud.classList.contains('on');
  for (const L of LABELS) {
    const sh = L.ship, p = sh.dead ? null : toScreen(sh.x, sh.y + L.dy, sh.z);
    if (p && p.ok && on) { L.el.style.transform = 'translate(' + p.x.toFixed(0) + 'px,' + p.y.toFixed(0) + 'px) translate(-50%,-50%)'; L.el.style.opacity = 1; } else L.el.style.opacity = 0;
  }
  const s = toScreen(TOMB.x, TOMB.y + TOMB.labelY, TOMB.z);
  if (s.ok) { tombLabel.style.transform = 'translate(' + s.x.toFixed(0) + 'px,' + s.y.toFixed(0) + 'px) translate(-50%,-50%)'; tombLabel.style.opacity = hud.classList.contains('on') ? 1 : 0; } else tombLabel.style.opacity = 0;
}

/* ───────── 導演（時間軸事件） ───────── */
let LANG = 'en', lastSync = 0, t = 0, started = false, evIdx = 0, nextWave = 24, tickIdx = 0, endStage = 0;
const EVENTS = [
  [T.REVEAL, () => { cv.classList.add('on'); hud.classList.add('on'); setVeil('#000', 0, 1.2); Snd.tension(0.25); cam.locked = true; }],
  [T.CONTROL, () => { control = true; cam.locked = false; setSel(allies.filter((s) => !s.dead)); helpEl.classList.add('on'); cmdsEl.classList.add('on'); Snd.tension(0.5); pushTick('艦隊指揮權已移交至你。', 'Fleet command transferred.'); if (COARSE) pushTick('輕點下令・拖曳平移・雙指縮放旋轉', 'Tap to order · drag to pan · pinch to zoom'); }],
  [60, () => Snd.tension(0.6)],
  [100, () => Snd.tension(0.8)],
  [T.FLASH, () => { control = false; cam.locked = true; setVeil('#fff', 1, 0.35); hud.classList.remove('on'); helpEl.classList.remove('on'); cmdsEl.classList.remove('on'); Snd.boom(6); Snd.silence(1.2); box.style.display = 'none'; }],
  [T.FLASH + 0.6, () => { cv.classList.remove('on'); cv.style.transition = 'none'; setVeil('#000', 1, 0.8); }],
  [T.DOOM, () => { cv.style.transition = 'opacity 1.6s ease'; resetDoomCam(); buildDoom(); doom.on = true; cv.classList.add('on'); setVeil('#000', 0, 1.6); Snd.riser(7); Snd.tension(0.3); }],
  [T.IMPACT + 0.2, () => Snd.tension(1)],
  [T.WHITE, () => { setVeil('#fff', 1, 4.5); Snd.swell(7); }],
  [T.END, () => { setVeil('#000', 1, 2.2); Snd.silence(2); Snd.musicFade(5); endEl.classList.add('on'); }]
];
function resetDoomCam() { cam.az = 0.2; cam.pol = 0.9; cam.dist = 900; cam.tx = 0; cam.tz = 0; cam.shake = 0; setSel([]); }

function step(dt) {
  t += dt;
  if (t - lastSync > 2) { lastSync = t; Snd.musicSync(MUSIC_OFFSET + t); }
  while (evIdx < EVENTS.length && t >= EVENTS[evIdx][0]) EVENTS[evIdx++][1]();
  while (tickIdx < TICKS.length && t >= TICKS[tickIdx][0] && t < T.FLASH) { pushTick(TICKS[tickIdx][1], TICKS[tickIdx][2]); tickIdx++; }
  if (t >= T.FLASH) { while (tickIdx < TICKS.length) tickIdx++; }
  updateSubs(t);

  const playing = t >= T.REVEAL && t < T.FLASH, dooming = t >= T.DOOM;
  if (t < T.REVEAL) {
    cam.az = 0.35; cam.pol = 1.25; cam.dist = 1200; cam.tx = 0; cam.tz = 0;
  }
  if (playing) {
    const p = smooth(clamp((t - T.REVEAL) / (T.CONTROL - T.REVEAL), 0, 1));
    if (t < T.CONTROL) { cam.az = lerp(0.35, 0.1, p); cam.pol = lerp(1.25, 1.0, p); cam.dist = lerp(1200, 680, p); cam.tx = 0; cam.tz = 0; }
    updateKeys(dt);
    if (t >= nextWave && t < 135) { spawnWave(Math.floor((nextWave - 24) / 8) % 2 === 1); nextWave += 8; Snd.boom(1.2); }
    for (const s of allies) if (!s.dead) stepShip(s, dt, t);
    for (const s of enemies) if (!s.dead) stepShip(s, dt, t);
    tombAct(dt, t); updatePulses(dt);
    separate(allies, true); separate(enemies, false);
    cam.shake = Math.max(0, cam.shake - dt * 1.4);
  }
  if (dooming) { updateDoom(dt, t); }
  if (playing || dooming) {
    // 清理已毀艦艇
    for (let i = allies.length - 1; i >= 0; i--) if (allies[i].dead) allies.splice(i, 1);
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
    TOMB.wire1.rotation.y += dt * 0.08; TOMB.wire2.rotation.y -= dt * 0.12; TOMB.wire2.rotation.x += dt * 0.05;
    TOMB.inf.rotation.y += dt * 0.5;
    const pu = 1 + 0.12 * Math.sin(t * 2.2);
    TOMB.zoneRing.material.opacity = 0.55 + 0.3 * Math.sin(t * 2.2); TOMB.glow.scale.set(TOMB.glowS * pu, TOMB.glowS * pu, 1);
    TOMB.core.material.uniforms.uTime.value = t; TOMB.core.rotation.y += dt * 0.02;
    if (TOMB.body) { TOMB.body.rotation.y = Math.sin(t * 0.15) * 0.12; TOMB.body.position.y = Math.sin(t * 0.4) * 1.6; }
    updateBubbles(dt); updateDrops(); updateMarks(dt); updateNums(dt); engineTrails(dt);
    if (fx) fx.update(dt);
    if (fleet) fleet.update(allies, enemies);
    updateHud(t);
  }
  endStage = endStage || 0;
  if (t >= T.END + 1.2 && endStage < 1) { endStage = 1; endEl.querySelectorAll('.sw-end-line')[0].classList.add('on'); }
  if (t >= T.END + 4.5 && endStage < 2) { endStage = 2; endEl.querySelectorAll('.sw-end-line')[1].classList.add('on'); }
  if (t >= T.END + 8.5 && endStage < 3) { endStage = 3; endEl.querySelectorAll('.sw-end-line')[2].classList.add('on'); }
}

/* ───────── 啟動與主迴圈 ───────── */
function render() { applyCam(); if (QUALITY === 'high' && bloomFx) bloomFx.composer.render(); else renderer.render(scene, camera); }
let last = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!last) last = now; const dt = Math.min(0.05, (now - last) / 1000); last = now; frameDt = dt;
  sky.material.uniforms.uTime.value = now / 1000;
  if (started) step(dt);
  render();
}
let assetsReady = false;
function begin(mute) {
  Snd.init(); Snd.setMuted(!!mute); Snd.resume();
  if (mute) { isMuted = true; setMuteLabel(); }
  const go = () => { $('#sw-title').classList.add('off'); started = true; last = 0; Snd.musicPlay(); };
  document.querySelectorAll('.sw-title .sw-btn').forEach((b) => { b.disabled = true; });
  const afterModels = () => {
    if (mute || !Snd.on) { go(); return; }
    $('#sw-go').textContent = STR[LANG].loading;
    Snd.musicLoad(MUSIC_URL, MUSIC_OFFSET, go);
  };
  if (assetsReady) { afterModels(); return; }
  $('#sw-go').textContent = STR[LANG].loadingModels;
  const wait = setInterval(() => { if (assetsReady) { clearInterval(wait); afterModels(); } }, 120);
}
$('#sw-go').addEventListener('click', () => begin(false));
$('#sw-go-mute').addEventListener('click', () => begin(true));
$('#sw-mute').addEventListener('click', () => {
  isMuted = !isMuted; Snd.setMuted(isMuted); setMuteLabel();
  if (!isMuted && Snd.on && !Snd.hasMusic && started && t < T.END) Snd.musicLoad(MUSIC_URL, MUSIC_OFFSET + t, () => Snd.musicPlay()); // 靜音進入後才開聲音：補載配樂
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (Snd.on) Snd.setMuted(true); Snd.musicHold(true); } else { Snd.setMuted(isMuted); if (started) Snd.musicHold(false, MUSIC_OFFSET + t); } });

$('#sw-lang').addEventListener('click', () => applyLang(LANG === 'en' ? 'zh' : 'en'));
$('#sw-q').addEventListener('click', () => { QUALITY = QUALITY === 'high' ? 'low' : 'high'; try { localStorage.setItem('sw-q', QUALITY); } catch (e) {} setQLabel(); resize(); });
let storedLang = 'en'; try { storedLang = localStorage.getItem('sw-lang') === 'zh' ? 'zh' : 'en'; } catch (e) {}
applyLang(storedLang);

/* ───────── 外部控制介面（第一人稱／玩家艦艇預留） ───────── */
// ship.ctrl.update(ship, dt, t, API) 由 stepShip 呼叫；API 提供給控制器使用的模擬層功能
const API = {
  enemies, allies,
  /** 沿艦艇正前方的射線攻擊：回傳命中的敵艦或 null（用於玩家開火） */
  hitscan(s, rangeMax, coneRad) {
    const cp = Math.cos(s.p), fx_ = Math.sin(s.h) * cp, fy_ = Math.sin(s.p), fz_ = Math.cos(s.h) * cp;
    const foes = s.side === 'a' ? enemies : allies; let best = null, bd = 1e9;
    for (const e of foes) {
      if (e.dead) continue;
      const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z, dist = Math.hypot(dx, dy, dz); if (dist > rangeMax || dist < 1) continue;
      const dot = (dx * fx_ + dy * fy_ + dz * fz_) / dist; if (dot < Math.cos(coneRad)) continue;
      if (dist < bd) { bd = dist; best = e; }
    }
    const mp = muzzle(s), ex = best ? best.x : s.x + fx_ * rangeMax, ey = best ? best.y : s.y + fy_ * rangeMax, ez = best ? best.z : s.z + fz_ * rangeMax;
    fireBeam(mp.x, mp.y, mp.z, ex, ey, ez, s.d.beam, s.d.w, 0.16); Snd.zap(false);
    if (best) { best.hp -= rnd(s.d.dmg[0], s.d.dmg[1]) * 2; if (best.hp <= 0) killShip(best); else if (fx) fx.emit(ex, ey, ez, 0, 0, 0, 1, 0.8, 0.5, 8, 0.3, 0, 1); }
    return best;
  }
};
const _fpvKeys = {};
function fpv(on) {
  if (on === false) {
    const s = rig.ship; if (s) { s.ctrl = null; s.hidden = false; }
    rig.setMode('tactical'); refreshScale(); cam.locked = false; return null;
  }
  const s = allies.find((q) => q.kind === 'frig' && !q.dead); if (!s) return null;
  s.ctrl = SWPlayer.createFlight(keys); s.order = null;
  rig.setMode('cockpit', s); refreshScale(); cam.locked = true; setSel([]);
  cv.addEventListener('pointerdown', () => { if (s.ctrl) s.ctrl.mouseDown = true; });
  cv.addEventListener('pointerup', () => { if (s.ctrl) s.ctrl.mouseDown = false; });
  return s;
}

/* ───────── 資源載入與世界建立 ───────── */
function setupTombModel(a) {
  const g = TOMB.group, body = new THREE.Group();
  a.parts.forEach((p) => {
    const m = p.material; if (m.emissive) m.emissiveIntensity = 1.5; m.envMapIntensity = 0.8;
    const mesh = new THREE.Mesh(p.geometry, m); mesh.frustumCulled = false; body.add(mesh);
  });
  g.add(body); TOMB.body = body;
  TOMB.core.visible = TOMB.wire1.visible = TOMB.wire2.visible = false;
  TOMB.r = 60; TOMB.labelY = 150; TOMB.numY = 60; TOMB.glowS = 330; TOMB.glow.position.y = 20;
  // 命中球：[x, y, z, 半徑]（頭罩、軀幹、雙肩、雙臂末端、腰環、裙擺）
  TOMB.parts = [[0, 88, 0, 28], [0, 30, 0, 42], [-78, 72, 0, 22], [78, 72, 0, 22], [-118, 70, 0, 14], [118, 70, 0, 14], [0, -5, 0, 52], [0, -70, 0, 38]];
  ZONE = 165; const k = ZONE / 135;
  TOMB.zone.scale.set(1.9, 1.9, 1); TOMB.zoneRing.scale.set(1.9, 1.9, 1); TOMB.zoneRing2.scale.set(k, k, 1); TOMB.zoneSphere.scale.setScalar(k);
  TOMB.inf.position.y = 150; TOMB.inf.scale.setScalar(1.3);
  tombSphere.radius = 110;
}
function setupWorld(assets) {
  if (TOMB_MODE === 'model' && assets.irontomb) setupTombModel(assets.irontomb);
  fx = SWFx.create({ scene, debrisParts: assets.debris && assets.debris.parts });
  fleet = SWFleet.create({ scene, assets });
  rig.fleet = fleet;
  resize();
  fleet.update(allies, enemies);
  assetsReady = true;
}
SWAssets.loadAll('../assets/space-war/models/').then(setupWorld).catch((e) => { console.warn('模型載入失敗，改用備援幾何', e); setupWorld(SWFleet.fallbackAssets()); });

window.addEventListener('resize', resize);
spawnAllies(); spawnEnemies(true); resize(); applyCam();
requestAnimationFrame(loop);

// 除錯／測試用：快轉到指定秒數（不影響正常遊玩）
window.swDebug = {
  warp(to) { started = true; $('#sw-title').classList.add('off'); while (t < to) step(0.05); },
  get music() { return Snd.musicInfo(); }, get t() { return t; }, allies, enemies, get kills() { return kills; }, get ironFrac() { return ironFrac(); },
  cmd, setSel, orderMove, cam, rig, fpv,
  get fleet() { return fleet; }, get fx() { return fx; }, get ready() { return assetsReady; }
};
})();
