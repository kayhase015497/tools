/* boot.js — Space War Battle v2 啟動器
 *
 *  1. 建立 WebGPURenderer（瀏覽器不支援 WebGPU 時自動退回 WebGL2；`?r=gl` 可強制退回，`?r=gpu` 強制 WebGPU）
 *  2. 把新版 Three.js 包成 v1 看得懂的 `THREE`（相容層），讓 v1 的模擬／UI 程式幾乎原封不動
 *  3. 載入 v1 腳本（v2/legacy/）；其中所有「著色器」已換成 TSL 節點材質（v2/engine/）
 *
 * 相容層處理的差異（r128 → r186）：
 *   · 色彩管理：關閉 ColorManagement（v1 自己處理 sRGB↔線性）
 *   · 燈光單位：r155 起是物理單位，v1 的強度要 ×π（點光源距離衰減指數設 0，只保留截止距離）
 *   · *BufferGeometry 改名、renderer.outputEncoding、BufferAttribute.updateRange
 */
import * as W from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as nodes from './engine/nodes.js';
import { createPost } from './engine/post.js';

W.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search), coarse = matchMedia('(pointer: coarse)').matches;
const QUALITY = Q.get('q') || (coarse ? 'low' : 'high');
const wantGPU = Q.get('r') === 'gl' ? false : !!navigator.gpu;

const canvas = document.getElementById('b-canvas');
let renderer = new W.WebGPURenderer({ canvas, antialias: false, forceWebGL: !wantGPU, powerPreference: 'high-performance' });
try { await renderer.init(); } catch (e) {
  console.warn('WebGPU 初始化失敗，改用 WebGL2 備援', e);
  if (wantGPU) { const u = new URL(location.href); u.searchParams.set('r', 'gl'); location.replace(u.href); await new Promise(() => {}); }
}
const isGPU = !!(renderer.backend && renderer.backend.isWebGPUBackend);
if (isGPU && renderer.backend.device) {
  renderer.backend.device.lost.then((info) => {   // 顯示卡裝置遺失（驅動崩潰等）：自動改用 WebGL2 重新載入一次
    console.error('WebGPU device lost:', info.message);
    const u = new URL(location.href); if (u.searchParams.get('r') !== 'gl') { u.searchParams.set('r', 'gl'); location.replace(u.href); }
  });
}

const PI = Math.PI;
// 注意：不能用 class extends——渲染器依「建構子」查燈光節點，子類別會找不到。改成工廠函式，回傳原生的燈光物件。
const DirectionalLight = function (c, i) { return new W.DirectionalLight(c, (i == null ? 1 : i) * PI); };
const HemisphereLight = function (a, b, i) { return new W.HemisphereLight(a, b, (i == null ? 1 : i) * PI); };
const AmbientLight = function (c, i) { return new W.AmbientLight(c, (i == null ? 1 : i) * PI); };
const PointLight = function (c, i, d) { return new W.PointLight(c, (i == null ? 1 : i) * PI, d || 0, 0); };   // decay 0：沿用 v1 的「只有截止距離」衰減
// 舊版寫法 `attr.updateRange.offset = a; attr.updateRange.count = b; attr.needsUpdate = true` → 新版 addUpdateRange
Object.defineProperty(W.BufferAttribute.prototype, 'updateRange', { get() { return this._urProxy || (this._urProxy = { offset: 0, count: -1 }); }, configurable: true });
const _nu = Object.getOwnPropertyDescriptor(W.BufferAttribute.prototype, 'needsUpdate');
Object.defineProperty(W.BufferAttribute.prototype, 'needsUpdate', {
  set(v) { if (v && this._urProxy && this._urProxy.count >= 0) { this.clearUpdateRanges(); this.addUpdateRange(this._urProxy.offset, this._urProxy.count); this._urProxy.count = -1; } _nu.set.call(this, v); },
  get() { return _nu.get ? _nu.get.call(this) : undefined; }, configurable: true
});

const THREE = Object.assign({}, W, {
  DirectionalLight, HemisphereLight, AmbientLight, PointLight,
  PlaneBufferGeometry: W.PlaneGeometry, RingBufferGeometry: W.RingGeometry, SphereBufferGeometry: W.SphereGeometry, CylinderBufferGeometry: W.CylinderGeometry, BoxBufferGeometry: W.BoxGeometry,
  sRGBEncoding: 3001, LinearEncoding: 3000, GLTFLoader
});
window.THREE = THREE;
window.SW2 = { W, THREE, renderer, QUALITY, isGPU, backend: isGPU ? 'WebGPU' : 'WebGL2', nodes, createPost, envTex: null, skyTex: null };
window.FPVPost = { create: (...a) => createPost(...a) };
console.info('[v2] backend:', window.SW2.backend, '· quality:', QUALITY);

const BASE = new URL('./legacy/', import.meta.url).href;
const FILES = ['sw-assets', 'sw-env', 'sw-fx', 'sw-fleet', 'fpv-audio', 'battle-core', 'battle-render', 'battle-sim', 'battle-ui', 'battle-main'];
for (const f of FILES) {
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + f + '.js'; s.onload = res; s.onerror = () => rej(new Error('載入失敗：' + f)); document.body.appendChild(s); });
}

// 測試用：WebGPU 畫布無法被一般截圖擷取，這個函式在同一個工作週期內渲染一幀並複製成圖片
window.SW2.snap = () => {
  window.__frameOnce();
  const c = document.getElementById('b-canvas'), h = document.getElementById('b-hud'), o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const g = o.getContext('2d'); g.drawImage(c, 0, 0); g.drawImage(h, 0, 0, c.width, c.height); return o.toDataURL('image/png');
};

// F3：效能面板（後端、幀數、解析度、顯卡、粒子數）——截圖貼給我就能判斷問題
(function () {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:60;font:11px/1.5 "Space Mono",monospace;color:#9fe;background:rgba(0,10,20,.78);padding:6px 9px;border:1px solid rgba(143,230,255,.3);display:none;white-space:pre;pointer-events:none';
  document.body.appendChild(el);
  let on = false, n = 0, t0 = performance.now(), fps = 0, gpuName = '';
  navigator.gpu && navigator.gpu.requestAdapter().then((a) => { if (a) gpuName = (a.info && (a.info.description || a.info.vendor + ' ' + a.info.architecture)) || ''; }).catch(() => {});
  const RES = [0.75, 1, 1.25, 1.5, 2];
  addEventListener('keydown', (e) => {
    const K = window.battleKnobs; if (e.code === 'F3') { e.preventDefault(); on = !on; el.style.display = on ? 'block' : 'none'; return; }
    if (!on || !K) return;
    if (e.code === 'F4') { e.preventDefault(); K.set('res', RES[(RES.indexOf(K.get().res) + 1) % RES.length] || 1); }
    else if (e.code === 'F5') { e.preventDefault(); K.set('msaa', K.get().msaa ? 0 : 4); }
    else if (e.code === 'F6') { e.preventDefault(); K.set('bloom', !K.get().bloom); }
    else if (e.code === 'F7') { e.preventDefault(); K.set('cinema', !K.get().cinema); }
    else if (e.code === 'F10') { e.preventDefault(); K.set('shadow', !K.get().shadow); }
    else if (e.code === 'F9') { e.preventDefault(); const g = window.G; g.fleetScale = g.fleetScale % 5 + 1; try { localStorage.setItem('sw2-scale', g.fleetScale); } catch (x) {} }
    else if (e.code === 'F8') { e.preventDefault(); K.set('fx', !!window.G.lite); }
  });
  (function loop() {
    requestAnimationFrame(loop); n++; const t = performance.now();
    if (t - t0 > 500) { fps = n * 1000 / (t - t0); n = 0; t0 = t; if (on) {
      const D = window.battleDebug, r = window.SW2.renderer, ps = r.getPixelRatio();
      el.textContent = `v2 build 20 · ${window.SW2.backend} · ${window.SW2.QUALITY}\n${fps.toFixed(1)} fps · ${(1000 / Math.max(fps, 1)).toFixed(1)} ms\n${Math.round(innerWidth * ps)}×${Math.round(innerHeight * ps)} (×${ps})\n${gpuName || 'GPU: n/a'}\nships ${D ? D.allies.length + D.enemies.length : 0} · particles ${D && D.fx ? D.fx.particleCount : 0}\n` + (window.battleKnobs ? (k => `[F4] 解析度比例 ×${k.res}   [F5] 抗鋸齒 ${k.msaa ? k.msaa + '×' : '關'}\n[F6] 泛光 ${k.bloom ? '開' : '關'}   [F7] 體積光 ${k.cinema ? '開' : '關'}   [F8] 護盾/損傷特效 ${window.G.lite ? '關' : '開'}\n[F9] 艦隊規模 ×${window.G.fleetScale}（增援即時生效；初始艦隊需重新開始）\n[F10] 即時陰影 ${k.shadow ? '開' : '關'}`)(window.battleKnobs.get()) : '');
    } }
  })();
})();
