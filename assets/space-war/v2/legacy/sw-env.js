/* sw-env.js — 太空戰共用的場景環境：星雲天空、環境光照（PMREM）、燈光、泛光後處理
 *
 * 遊戲本體與模型檢視頁共用，確保「在檢視頁看到的就是遊戲裡看到的」。
 */
(function (global) {
  'use strict';

  const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const SKY_FS = [
    'varying vec3 vDir; uniform float uTime; uniform float uDoom;',
    'float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
    'float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
    '             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }',
    'float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }',
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  vec3 col = mix(vec3(0.010,0.014,0.036), vec3(0.030,0.020,0.070), d.y*0.5+0.5);',
    '  float n1 = fbm(d*1.7 + vec3(0.0, uTime*0.002, 0.0)), n2 = fbm(d*3.4 + 7.3);',
    '  float neb = smoothstep(0.45,0.85,n1) * smoothstep(0.35,0.8,n2);',
    '  vec3 nc = mix(vec3(0.42,0.10,0.55), vec3(0.78,0.12,0.26), smoothstep(0.3,0.9,fbm(d*2.1+3.0)));',
    '  nc = mix(nc, vec3(0.10,0.28,0.78), smoothstep(0.55,0.85,fbm(d*1.3+11.0)));',
    '  col += nc * neb * 0.55;',
    '  vec3 bn = normalize(vec3(0.3,0.8,0.5)); float bt = dot(d,bn)*5.0; float band = exp(-bt*bt); float dust = fbm(d*6.0+2.0);',
    '  col += vec3(0.50,0.45,0.70) * band * (0.10 + 0.35*dust*dust) * 0.9;',
    '  col = mix(col, col * vec3(1.7, 0.45, 0.55) + vec3(0.07, 0.0, 0.02), uDoom);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /** opts.linear：場景走線性色彩管線時，天空色從顯示色轉為線性（FPV 版使用） */
  function makeSky(radius, opts) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDoom: { value: 0 } }, vertexShader: SKY_VS, fragmentShader: opts && opts.linear ? SKY_FS.replace('gl_FragColor = vec4(col, 1.0);', 'gl_FragColor = vec4(pow(col, vec3(2.2)) * 1.25, 1.0);') : SKY_FS,
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius || 3200, 40, 28), mat);
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
      scene.environment = rt.texture;
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
