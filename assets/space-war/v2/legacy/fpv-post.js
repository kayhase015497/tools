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
    'uniform sampler2D tDiffuse, tCin; uniform float uTime, uExposure, uCA, uVig, uGrain, uSpeed, uHurt, uSat, uContrast, uCinema;',
    'varying vec2 vUv;',
    'vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }',
    'float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }',
    'vec3 enc(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }',
    'void main(){',
    '  vec2 uv = vUv, c = uv - 0.5; float r2 = dot(c, c);',
    '  float ca = uCA * (0.35 + r2 * 3.2) * (1.0 + uHurt * 2.5);',
    '  vec2 dir = c * (uSpeed * 0.07);',
    '  vec3 acc = vec3(0.0);',
    '  if (uSpeed > 0.001) {',                                                                 // 速度徑向模糊（戰鬥頁已關閉；關閉時只取樣 3 次）
    '    for (int i = 0; i < 5; i++) {',
    '      float k = float(i) / 4.0; vec2 u = uv - dir * k;',
    '      acc += vec3(texture2D(tDiffuse, u - c * ca).r, texture2D(tDiffuse, u).g, texture2D(tDiffuse, u + c * ca).b);',
    '    }',
    '    acc /= 5.0;',
    '  } else acc = vec3(texture2D(tDiffuse, uv - c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + c * ca).b);',
    '  if (uCinema > 0.001) acc += texture2D(tCin, uv).rgb * uCinema;',                       // 電影感疊加（來自 1/4 解析度小圖）
    '  vec3 col = acc * uExposure;',
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

  /* 電影感（體積光＋橫向拉絲光＋鏡頭鬼影）：全部在 1/4 解析度的小張貼圖上算（像素數只有 1/16），
     先把畫面降採樣成小圖，再於小圖上做光柱、橫向拉絲與鬼影，最後由最終合成 pass 以雙線性放大疊回——全解析度只多 1 次取樣。 */
  const CIN_DOWN_FS = [
    'uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;',
    'void main(){ vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.5, -1.5)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.5, -1.5)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(-1.5, 1.5)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.5, 1.5)).rgb;',
    '  gl_FragColor = vec4(min(c * 0.25, vec3(40.0)), 1.0); }'
  ].join('\n');
  const CIN_FS = [
    'uniform sampler2D tSmall; uniform vec2 uLight, uTexS; uniform float uInt, uStreak, uGhost, uAspect, uThrG, uThrS, uThrR; uniform vec3 uTint; varying vec2 vUv;',
    'vec3 bt(vec2 uv, float t){ vec3 c = texture2D(tSmall, uv).rgb; float l = dot(c, vec3(0.3, 0.55, 0.15)); return c * smoothstep(t, t + 2.0, l); }',
    'void main(){',
    '  vec3 add = vec3(0.0);',
    '  if (uInt > 0.001) {                                                       // 體積光：朝光源方向做徑向取樣',
    '    vec2 d = uLight - vUv; float dist = length(d); vec2 stp = d / 28.0 * 0.92; vec2 p = vUv; float w = 1.0; vec3 acc = vec3(0.0);',
    '    for (int i = 0; i < 28; i++) { p += stp; acc += bt(p, uThrR) * w; w *= 0.93; }',
    '    acc /= 28.0; add += uTint * dot(acc, vec3(0.3, 0.55, 0.15)) * 2.2 * uInt * exp(-dist * 1.6);',
    '  }',
    '  if (uStreak > 0.001) {                                                    // 藍色橫向拉絲光',
    '    vec3 s = vec3(0.0); float ws = 0.0;',
    '    for (int i = -12; i <= 12; i++) { float f = float(i); float wg = exp(-abs(f) * 0.2); s += bt(vUv + vec2(f * uTexS.x * 1.5, 0.0), uThrS) * wg; ws += wg; }',
    '    s /= ws; add += (vec3(0.35, 0.6, 1.0) * dot(s, vec3(0.3, 0.55, 0.15)) + s * 0.35) * uStreak * 2.2;',
    '  }',
    '  if (uGhost > 0.001) {                                                     // 鏡頭鬼影',
    '    vec2 c = vUv - 0.5; vec3 g = vec3(0.0);',
    '    for (int i = 1; i <= 3; i++) { float k = -0.4 * float(i); vec2 uv = 0.5 + c * k; float edge = smoothstep(0.55, 0.15, length((uv - 0.5) * vec2(uAspect, 1.0)));',
    '      vec3 col = i == 1 ? vec3(0.5, 0.7, 1.0) : i == 2 ? vec3(1.0, 0.5, 0.45) : vec3(0.5, 1.0, 0.7); g += bt(uv, uThrG) * col * edge * (0.55 / float(i)); }',
    '    add += g * uGhost * 1.4;',
    '  }',
    '  gl_FragColor = vec4(add, 1.0);',
    '}'
  ].join('\n');
  class CinemaPass extends THREE.Pass {
    constructor(w, h, o) {
      super(); this.needsSwap = false; this.div = 4;
      const mk = () => new THREE.WebGLRenderTarget(Math.max(1, (w / this.div) | 0), Math.max(1, (h / this.div) | 0), { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      this.rtSmall = mk(); this.rtOut = mk();
      this.down = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: VS, fragmentShader: CIN_DOWN_FS, depthTest: false, depthWrite: false });
      this.comp = new THREE.ShaderMaterial({ uniforms: { tSmall: { value: this.rtSmall.texture }, uLight: { value: new THREE.Vector2(0.5, 0.5) }, uTexS: { value: new THREE.Vector2() }, uInt: { value: 0 }, uStreak: { value: o.streak != null ? o.streak : 0.4 }, uGhost: { value: o.ghost != null ? o.ghost : 0.3 }, uAspect: { value: w / h }, uThrG: { value: 4.5 }, uThrS: { value: 2.6 }, uThrR: { value: 1.3 }, uTint: { value: new THREE.Vector3(1.0, 0.35, 0.5) } }, vertexShader: VS, fragmentShader: CIN_FS, depthTest: false, depthWrite: false });
      this.quadDown = new THREE.FullScreenQuad(this.down); this.quadComp = new THREE.FullScreenQuad(this.comp); this.u = this.comp.uniforms; this.setSize(w, h);
    }
    setSize(w, h) {
      const sw = Math.max(1, (w / this.div) | 0), sh = Math.max(1, (h / this.div) | 0);
      this.rtSmall.setSize(sw, sh); this.rtOut.setSize(sw, sh); this.down.uniforms.uTexel.value.set(1 / w, 1 / h); this.comp.uniforms.uTexS.value.set(1 / sw, 1 / sh); this.comp.uniforms.uAspect.value = w / h;
    }
    render(renderer, writeBuffer, readBuffer) {
      this.down.uniforms.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(this.rtSmall); this.quadDown.render(renderer);
      renderer.setRenderTarget(this.rtOut); this.quadComp.render(renderer);
    }
  }

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
    const cinema = o.cinema ? new CinemaPass(w, h, o) : null;     // 電影感追加（選用）：在泛光之後、最終合成之前
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), o.strength != null ? o.strength : 0.75, o.radius != null ? o.radius : 0.7, o.threshold != null ? o.threshold : 0.9);
    composer.addPass(bloom);
    if (cinema) composer.addPass(cinema);
    const final = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uExposure: { value: 1.0 }, uCA: { value: 0.0011 }, uVig: { value: 0.42 }, uGrain: { value: 0.03 }, uSpeed: { value: 0 }, uHurt: { value: 0 }, uSat: { value: 1.12 }, uContrast: { value: 1.07 }, tCin: { value: null }, uCinema: { value: cinema ? 1 : 0 } },
      vertexShader: VS, fragmentShader: FS
    }, 'tDiffuse');
    if (cinema) final.uniforms.tCin.value = cinema.rtOut.texture;   // ShaderPass 會複製 uniforms（連貼圖都 clone），所以要在建立之後重新指回真正的渲染目標貼圖
    composer.addPass(final);
    composer.setSize(w, h);
    return { composer, bloom, cockpit, final, cinema, u: final.uniforms, setSize(W, H) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); } };
  }
  global.FPVPost = { create };
})(window);
