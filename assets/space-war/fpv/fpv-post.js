/* fpv-post.js — FPV 版後處理管線（HDR 線性空間 → bloom → 電影級最終合成）
 *
 *   const post = FPVPost.create(renderer, scene, camera, cockScene, cockCam, { width, height });
 *   post.composer.render();                  // 主場景 → 駕駛艙疊層 → bloom → 最終合成
 *   post.cockpit.enabled = true/false;       // 第一人稱時才畫駕駛艙
 *   post.u.uSpeed.value / uHurt / uCA ...    // 最終合成的參數（速度徑向模糊、受傷色差與紅暈…）
 *
 * 最終合成（單一 pass）：徑向速度模糊 → 色差 → 曝光 → ACES 色調映射 → 色彩分級（陰影偏青、高光偏暖、對比與飽和）
 *                       → 暈邊 → 受傷紅暈 → 顆粒 → sRGB 編碼。
 * 所有場景材質與燈光在線性空間計算，直到這一步才轉成顯示色，這是畫面「不死白、高光有層次」的關鍵。
 */
(function (global) {
  'use strict';
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const FS = [
    'uniform sampler2D tDiffuse; uniform float uTime, uExposure, uCA, uVig, uGrain, uSpeed, uHurt, uSat, uContrast;',
    'varying vec2 vUv;',
    'vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }',
    'float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }',
    'vec3 enc(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }',
    'void main(){',
    '  vec2 uv = vUv, c = uv - 0.5; float r2 = dot(c, c);',
    '  float ca = uCA * (0.35 + r2 * 3.2) * (1.0 + uHurt * 2.5);',
    '  vec2 dir = c * (uSpeed * 0.07);',
    '  vec3 acc = vec3(0.0);',
    '  for (int i = 0; i < 5; i++) {',
    '    float k = float(i) / 4.0; vec2 u = uv - dir * k;',
    '    acc += vec3(texture2D(tDiffuse, u - c * ca).r, texture2D(tDiffuse, u).g, texture2D(tDiffuse, u + c * ca).b);',
    '  }',
    '  vec3 col = acc / 5.0 * uExposure;',
    '  col = aces(col);',
    '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(col, col * vec3(0.90, 1.0, 1.12), 1.0 - smoothstep(0.0, 0.45, l));',   // 陰影偏青
    '  col = mix(col, col * vec3(1.07, 1.0, 0.92), smoothstep(0.45, 1.0, l));',          // 高光偏暖
    '  col = mix(vec3(l), col, uSat);',
    '  col = (col - 0.5) * uContrast + 0.5;',
    '  float rr = length(c) * 1.28;',
    '  col *= 1.0 - uVig * smoothstep(0.3, 1.0, rr);',
    '  col += vec3(0.30, 0.02, 0.04) * uHurt * smoothstep(0.3, 1.0, rr);',
    '  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrain;',
    '  gl_FragColor = vec4(enc(col), 1.0);',
    '}'
  ].join('\n');

  function create(renderer, scene, camera, cockScene, cockCam, o) {
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
    const cockpit = new THREE.RenderPass(cockScene, cockCam);
    cockpit.clear = false; cockpit.clearDepth = true;          // 駕駛艙畫在最上層，不被艦艇穿插
    composer.addPass(cockpit);
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), o.strength != null ? o.strength : 0.75, o.radius != null ? o.radius : 0.7, o.threshold != null ? o.threshold : 0.9);
    composer.addPass(bloom);
    const final = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uExposure: { value: 1.0 }, uCA: { value: 0.0011 }, uVig: { value: 0.42 }, uGrain: { value: 0.03 }, uSpeed: { value: 0 }, uHurt: { value: 0 }, uSat: { value: 1.12 }, uContrast: { value: 1.07 } },
      vertexShader: VS, fragmentShader: FS
    }, 'tDiffuse');
    composer.addPass(final);
    composer.setSize(w, h);
    return { composer, bloom, cockpit, final, u: final.uniforms, setSize(W, H) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); } };
  }
  global.FPVPost = { create };
})(window);
