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
