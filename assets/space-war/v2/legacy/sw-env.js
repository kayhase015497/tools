/* sw-env.js — 太空戰共用的場景環境：星雲天空、環境光照（PMREM）、燈光、泛光後處理
 *
 * 遊戲本體與模型檢視頁共用，確保「在檢視頁看到的就是遊戲裡看到的」。
 */
(function (global) {
  'use strict';

  /** 天空：星雲只在啟動時烘焙成立方體貼圖，之後每幀只取樣一次（v1 每幀對全螢幕算 30 次噪聲）。 */
  function makeSky(radius, opts) {
    const V = window.SW2; if (!V.skyTex) V.skyTex = V.nodes.bakeSkyCube(V.renderer, V.isGPU ? 1024 : 512);
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius || 3200, 40, 28), V.nodes.skyMaterial(V.skyTex));
    m.frustumCulled = false; m.renderOrder = -10;
    return m;
  }

  /** 以「頂點著色的漸層球」建立 PMREM 環境貼圖：星雲色塊＋一顆恆星亮點，讓金屬面有反射與高光。 */
  function makeEnvironment(renderer, scene) {
    try {
      const geo = new THREE.SphereGeometry(50, 48, 24), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      const blobs = [ // [方向, 顏色, 角度寬度, 強度]
        [[0.55, 0.78, 0.62], [0.95, 0.97, 1.0], 0.035, 7.0],   // 恆星（對應主光方向）
        [[-0.7, -0.25, -0.65], [0.85, 0.12, 0.3], 0.5, 0.75],  // 緋紅星雲
        [[0.1, 0.9, -0.3], [0.45, 0.2, 0.85], 0.6, 0.6],       // 紫色星雲
        [[0.9, -0.1, 0.2], [0.15, 0.35, 0.9], 0.5, 0.55],      // 藍色星雲
        [[-0.2, 0.3, 0.9], [0.5, 0.45, 0.8], 0.8, 0.28]        // 銀河帶
      ].map((b) => { const d = new THREE.Vector3(b[0][0], b[0][1], b[0][2]).normalize(); return { d, c: b[1], w: b[2], k: b[3] }; });
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        let r = 0.018, g = 0.022, b = 0.05 + 0.03 * (v.y * 0.5 + 0.5);
        blobs.forEach((bl) => { const a = Math.acos(Math.max(-1, Math.min(1, v.dot(bl.d)))), f = Math.exp(-(a * a) / (bl.w * bl.w)) * bl.k; r += bl.c[0] * f; g += bl.c[1] * f; b += bl.c[2] * f; });
        col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const es = new THREE.Scene();
      es.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const pm = new THREE.PMREMGenerator(renderer);
      const rt = pm.fromScene(es, 0.03, 1, 200);
      scene.environment = rt.texture; window.SW2.envTex = rt.texture;
      pm.dispose();
      return rt.texture;
    } catch (e) { console.warn('PMREM 環境建立失敗', e); return null; }
  }

  function addLights(scene, opts) {
    opts = opts || {};
    const L = {};
    L.hemi = new THREE.HemisphereLight(0x9fb4ff, 0x3a1030, opts.hemi != null ? opts.hemi : 0.45); scene.add(L.hemi);
    L.key = new THREE.DirectionalLight(0xd8e8ff, opts.key != null ? opts.key : 1.25); L.key.position.set(260, 340, 300); scene.add(L.key);
    L.rim = new THREE.DirectionalLight(0xff6a8a, opts.rim != null ? opts.rim : 0.55); L.rim.position.set(-240, -120, -260); scene.add(L.rim);
    if (opts.tombLight) {
      L.tomb = new THREE.PointLight(0xff2a4a, 2.6, 520, 1.5); L.tomb.position.set(0, 0, 0); scene.add(L.tomb);
    }
    return L;
  }

  /** 泛光後處理（桌機預設開啟；手機與低畫質關閉） */
  function makeComposer(renderer, scene, camera, o) {
    o = o || {};
    const w = o.width || innerWidth, h = o.height || innerHeight, pr = renderer.getPixelRatio();
    let rt = null;
    if (renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
      rt = new THREE.WebGLMultisampleRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, format: THREE.RGBAFormat });
      rt.samples = 4;
    }
    const composer = new THREE.EffectComposer(renderer, rt || undefined);
    composer.setPixelRatio(pr);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), o.strength != null ? o.strength : 0.85, o.radius != null ? o.radius : 0.55, o.threshold != null ? o.threshold : 0.8);
    composer.addPass(bloom);
    composer.setSize(w, h);
    return { composer, bloom, setSize(W, H) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); } };
  }

  global.SWEnv = { makeSky, makeEnvironment, addLights, makeComposer };
})(window);
