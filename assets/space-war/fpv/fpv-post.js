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

  /* 體積光：從光源螢幕位置往每個像素的方向做徑向取樣，只累積「夠亮」的部分；艦艇擋住光源就會投出光柱的陰影 */
  const GOD_FS = [
    'uniform sampler2D tDiffuse; uniform vec2 uLight; uniform float uInt, uThr; uniform vec3 uTint; varying vec2 vUv;',
    'void main(){',
    '  vec4 base = texture2D(tDiffuse, vUv);',
    '  if (uInt <= 0.001) { gl_FragColor = base; return; }',
    '  vec2 d = (uLight - vUv); float dist = length(d); vec2 stp = d / 56.0 * 0.92;',
    '  vec2 p = vUv; float w = 1.0; vec3 acc = vec3(0.0);',
    '  for (int i = 0; i < 56; i++) { p += stp; vec3 c = texture2D(tDiffuse, p).rgb; float l = dot(c, vec3(0.3, 0.55, 0.15)); acc += c * smoothstep(uThr, uThr + 1.2, l) * w; w *= 0.965; }',
    '  acc /= 56.0; float fall = exp(-dist * 1.6);',
    '  float lum = dot(acc, vec3(0.3, 0.55, 0.15));',
    '  gl_FragColor = vec4(base.rgb + uTint * lum * 2.2 * uInt * fall, base.a);',
    '}'
  ].join('\n');
  /* 鏡頭光斑與橫向拉絲光（anamorphic streak）：直接取畫面中的高亮處——鐵墓紅光、爆炸、光束、引擎——自動產生鬼影與藍色橫向光條 */
  const FLARE_FS = [
    'uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uStreak, uGhost, uAspect, uThr, uThrG; varying vec2 vUv;',
    'vec3 brightT(vec2 uv, float t){ vec3 c = texture2D(tDiffuse, uv).rgb; float l = dot(c, vec3(0.3, 0.55, 0.15)); return c * smoothstep(t, t + 2.5, l); }',
    'void main(){',
    '  vec4 base = texture2D(tDiffuse, vUv); vec3 add = vec3(0.0);',
    '  if (uStreak > 0.001) {',
    '    float stride = uTexel.x * 7.0; vec3 s = vec3(0.0); float ws = 0.0;',
    '    for (int i = -18; i <= 18; i++) { float f = float(i); float wgt = exp(-abs(f) * 0.16); s += brightT(vUv + vec2(f * stride, 0.0), uThr) * wgt; ws += wgt; }',
    '    s /= ws; float l = dot(s, vec3(0.3, 0.55, 0.15)); add += (vec3(0.35, 0.6, 1.0) * l + s * 0.35) * uStreak * 2.2;',     // 藍色橫向光條
    '  }',
    '  if (uGhost > 0.001) {',
    '    vec2 c = vUv - 0.5; vec3 g = vec3(0.0);',
    '    for (int i = 1; i <= 4; i++) { float k = -0.35 * float(i); vec2 uv = 0.5 + c * k; float edge = smoothstep(0.55, 0.15, length((uv - 0.5) * vec2(uAspect, 1.0)));',
    '      vec3 col = i == 1 ? vec3(0.5, 0.7, 1.0) : i == 2 ? vec3(1.0, 0.5, 0.45) : i == 3 ? vec3(0.5, 1.0, 0.7) : vec3(0.9, 0.6, 1.0);',
    '      vec3 b = brightT(uv, uThrG); g += b * col * edge * (0.55 / float(i)); }',
    '    float halo = 0.0; vec2 dir = normalize(c + 1e-5); vec2 hv = dir * 0.42; vec3 hb = brightT(0.5 + c * -0.9, uThrG);',
    '    add += (g + hb * vec3(0.8, 0.55, 1.0) * 0.12) * uGhost * 1.4;',
    '  }',
    '  gl_FragColor = vec4(base.rgb + add, base.a);',
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
    // 電影感追加（選用）：體積光（God Rays）放在泛光之前；鏡頭光斑與橫向拉絲光放在泛光之後
    let god = null, flare = null;
    if (o.cinema) {
      god = new THREE.ShaderPass({
        uniforms: { tDiffuse: { value: null }, uLight: { value: new THREE.Vector2(0.5, 0.5) }, uInt: { value: 0 }, uTint: { value: new THREE.Vector3(1.0, 0.35, 0.5) }, uThr: { value: 1.4 } },
        vertexShader: VS, fragmentShader: GOD_FS
      }, 'tDiffuse');
      composer.addPass(god);
    }
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), o.strength != null ? o.strength : 0.75, o.radius != null ? o.radius : 0.7, o.threshold != null ? o.threshold : 0.9);
    composer.addPass(bloom);
    if (o.cinema) {
      flare = new THREE.ShaderPass({
        uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) }, uStreak: { value: o.streak != null ? o.streak : 0.55 }, uGhost: { value: o.ghost != null ? o.ghost : 0.5 }, uAspect: { value: w / h }, uThr: { value: 3.2 }, uThrG: { value: 7.0 } },
        vertexShader: VS, fragmentShader: FLARE_FS
      }, 'tDiffuse');
      composer.addPass(flare);
    }
    const final = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uExposure: { value: 1.0 }, uCA: { value: 0.0011 }, uVig: { value: 0.42 }, uGrain: { value: 0.03 }, uSpeed: { value: 0 }, uHurt: { value: 0 }, uSat: { value: 1.12 }, uContrast: { value: 1.07 } },
      vertexShader: VS, fragmentShader: FS
    }, 'tDiffuse');
    composer.addPass(final);
    composer.setSize(w, h);
    return { composer, bloom, cockpit, final, god, flare, u: final.uniforms, setSize(W, H) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); if (flare) { flare.uniforms.uTexel.value.set(1 / (W * renderer.getPixelRatio()), 1 / (H * renderer.getPixelRatio())); flare.uniforms.uAspect.value = W / H; } } };
  }
  global.FPVPost = { create };
})(window);
