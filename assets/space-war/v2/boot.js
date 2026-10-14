/* boot.js — Space War Battle v2 啟動器（階段 A：Three.js r186 相容層）
 *
 * v1 的程式是「全域共用」的傳統腳本、寫給 Three.js r128。這裡先用「相容層」把新版 Three.js 包成 v1 看得懂的 `THREE`，
 * 讓舊程式幾乎原封不動地跑起來，並且畫面與 v1 一致；之後的階段再把每個檔案逐步改成真正的 ES 模組與 TSL/WebGPU。
 *
 * 相容層處理的差異（r128 → r186）：
 *   · 色彩管理：關閉 ColorManagement（v1 自己處理 sRGB↔線性）
 *   · 燈光單位：r155 起是物理單位，v1 的強度要 ×π 才會一樣亮（點光源另外把距離衰減指數設為 0，只保留截止距離窗函數）
 *   · *BufferGeometry 改名、WebGLMultisampleRenderTarget 移除（改用 samples）、renderer.outputEncoding → outputColorSpace
 *   · BufferAttribute.updateRange → addUpdateRange
 */
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { MaskPass, ClearMaskPass } from 'three/addons/postprocessing/MaskPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { LuminosityHighPassShader } from 'three/addons/shaders/LuminosityHighPassShader.js';

T.ColorManagement.enabled = false;
const PI = Math.PI;

class WebGLRenderer extends T.WebGLRenderer {
  constructor(o) { super(o); this.capabilities.isWebGL2 = true; }
  set outputEncoding(v) { this.outputColorSpace = v === 3001 ? T.SRGBColorSpace : T.LinearSRGBColorSpace; }
  get outputEncoding() { return this.outputColorSpace === T.SRGBColorSpace ? 3001 : 3000; }
}
class WebGLMultisampleRenderTarget extends T.WebGLRenderTarget { constructor(w, h, o) { super(w, h, Object.assign({ samples: 4 }, o)); } }
class DirectionalLight extends T.DirectionalLight { constructor(c, i) { super(c, (i == null ? 1 : i) * PI); } }
class HemisphereLight extends T.HemisphereLight { constructor(a, b, i) { super(a, b, (i == null ? 1 : i) * PI); } }
class AmbientLight extends T.AmbientLight { constructor(c, i) { super(c, (i == null ? 1 : i) * PI); } }
class PointLight extends T.PointLight { constructor(c, i, d, decay) { super(c, (i == null ? 1 : i) * PI, d || 0, 0); } }   // decay 0：沿用 v1 的「只有截止距離」衰減
Object.defineProperty(T.BufferAttribute.prototype, 'updateRange', {
  get() { const self = this; return self._urProxy || (self._urProxy = { offset: 0, count: -1 }); },
  configurable: true
});
// 舊版寫法 `attr.updateRange.offset = a; attr.updateRange.count = b; attr.needsUpdate = true` → 轉成新版 addUpdateRange
const _nu = Object.getOwnPropertyDescriptor(T.BufferAttribute.prototype, 'needsUpdate');
Object.defineProperty(T.BufferAttribute.prototype, 'needsUpdate', {
  set(v) { if (v && this._urProxy && this._urProxy.count >= 0) { this.clearUpdateRanges(); this.addUpdateRange(this._urProxy.offset, this._urProxy.count); this._urProxy.count = -1; } _nu.set.call(this, v); },
  get() { return _nu.get ? _nu.get.call(this) : undefined; }, configurable: true
});

// v1（r128）的泛光暫存貼圖是 8-bit，亮度被夾在 0~1；r186 改成半浮點（HDR 不夾），同樣的參數會亮很多。階段 A 先沿用 8-bit 求一致，階段 C 再重新調成 HDR 泛光。
class UnrealBloomPassCompat extends UnrealBloomPass {
  constructor(...a) {
    super(...a);
    [this.renderTargetBright, ...this.renderTargetsHorizontal, ...this.renderTargetsVertical].forEach((rt) => { rt.texture.type = T.UnsignedByteType; rt.dispose(); });
  }
}
const THREE = Object.assign({}, T, {
  WebGLRenderer, WebGLMultisampleRenderTarget, DirectionalLight, HemisphereLight, AmbientLight, PointLight,
  PlaneBufferGeometry: T.PlaneGeometry, RingBufferGeometry: T.RingGeometry, SphereBufferGeometry: T.SphereGeometry, CylinderBufferGeometry: T.CylinderGeometry, BoxBufferGeometry: T.BoxGeometry, IcosahedronBufferGeometry: T.IcosahedronGeometry,
  sRGBEncoding: 3001, LinearEncoding: 3000,
  GLTFLoader, EffectComposer, RenderPass, ShaderPass, MaskPass, ClearMaskPass, Pass, FullScreenQuad, UnrealBloomPass: UnrealBloomPassCompat, CopyShader, LuminosityHighPassShader
});
window.THREE = THREE;

const BASE = new URL('./legacy/', import.meta.url).href;
const FILES = ['sw-assets', 'sw-env', 'sw-fx', 'sw-fleet', 'fpv-audio', 'fpv-post', 'battle-core', 'battle-render', 'battle-sim', 'battle-ui', 'battle-main'];
for (const f of FILES) {
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + f + '.js'; s.onload = res; s.onerror = () => rej(new Error('載入失敗：' + f)); document.body.appendChild(s); });
}
