/* sw-fx.js — 太空戰特效系統
 *
 *   const fx = SWFx.create({ scene, debrisParts });
 *   fx.beam(ax,ay,az, bx,by,bz, { color:[r,g,b], width, dur, len, delay })   光束／曳光彈（全部合併成 1 次繪製）
 *   fx.emit(x,y,z, vx,vy,vz, r,g,b, size, life, drag, type, grow)           單顆粒子（type 0 柔光點／1 十字星芒／2 衝擊波環）
 *   fx.explode(x,y,z, k, enemy)                                             多層爆炸（星芒＋火球＋火花＋衝擊環＋碎片）
 *   fx.later(delay, fn)                                                     延遲執行（例如曳光彈抵達目標後才冒出命中火花）
 *   fx.update(dt)                                                           每幀呼叫
 *   fx.setPixelScale(v)                                                     視窗改變時更新粒子大小換算
 *
 * 光束的出生／消失全由著色器依 uTime 計算，CPU 只在「發射當下」寫入一次資料。
 */
(function (global) {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);

  const BEAM_VS = [
    'attribute vec3 aA; attribute vec3 aB; attribute vec3 aColor; attribute vec4 aP;',
    'uniform float uTime; varying vec2 vUv; varying vec3 vCol; varying float vAlpha;',
    'void main(){',
    '  float age = uTime - aP.x;',
    '  if (age < 0.0 || age > aP.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }',
    '  float u = clamp(age / aP.y, 0.0, 1.0);',
    '  vec3 dir = aB - aA; float L = length(dir); dir /= max(L, 1e-4);',
    '  vec3 s, e;',
    '  if (aP.w > 0.0) { float head = u * (L + aP.w); float tail = head - aP.w; s = aA + dir * clamp(tail, 0.0, L); e = aA + dir * clamp(head, 0.0, L); vAlpha = 1.0; }',
    '  else { s = aA; e = aB; vAlpha = (1.0 - u) * (1.0 - u); }',
    '  vec3 mid = 0.5 * (s + e); vec3 toCam = cameraPosition - mid;',
    '  float w = max(aP.z, length(toCam) * 0.0022);',
    '  vec3 side = normalize(cross(dir, toCam) + vec3(1e-5)) * w;',
    '  float v = position.y + 0.5;',
    '  vec3 p = mix(s, e, v) + side * (position.x * 2.0);',
    '  vUv = vec2(position.x + 0.5, v); vCol = aColor;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');
  const BEAM_FS = [
    'varying vec2 vUv; varying vec3 vCol; varying float vAlpha;',
    'void main(){',
    '  float a = abs(vUv.x - 0.5) * 2.0;',
    '  float core = exp(-a * a * 7.0), glow = exp(-a * a * 1.6) * 0.55;',
    '  float along = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);',
    '  vec3 c = mix(vCol, vec3(1.0), core * 0.3) * (core * 1.25 + glow * 0.9) * along * vAlpha;',   // 以光束本色為主，只有最中心才偏白
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  /* GPU 粒子：每顆粒子只在「發射時」寫入一次初始位置／速度／顏色／壽命，之後的位移、衰減、縮放、淡出全由頂點著色器依時間解析計算——
     CPU 每幀不再逐顆更新，粒子池可放大到 4 萬顆以上 */
  const PART_VS = [
    'attribute vec3 aVel; attribute vec4 aColor; attribute vec4 aT; attribute vec2 aS; uniform float scale; uniform float uTime; varying vec4 vC; varying float vT;',
    // aT = (出生時間, 壽命, 阻力, 成長)；aS = (初始大小, 類型)
    'void main(){',
    '  float age = uTime - aT.x;',
    '  if (age < 0.0 || age > aT.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vC = vec4(0.0); vT = 0.0; return; }',
    '  float k = 1.0 - age / aT.y, dr = aT.z;',
    '  float travel = dr > 0.001 ? (1.0 - exp(-dr * age)) / dr : age;',
    '  vec3 p = position + aVel * travel;',
    '  float size = aT.w > 0.0 ? aS.x * (0.25 + aT.w * (1.0 - k)) : aS.x * (0.4 + 0.6 * k);',
    '  vC = vec4(aColor.rgb, aS.y > 1.5 ? k : k * k); vT = aS.y;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  gl_PointSize = clamp(size * scale / max(1.0, -mv.z), 0.0, 420.0); gl_Position = projectionMatrix * mv; }'
  ].join('\n');
  const PART_FS = [
    'varying vec4 vC; varying float vT;',
    'void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); float a;',
    '  if (vT < 0.5) { a = smoothstep(0.5, 0.0, d); a = a * a * 1.4; }',
    '  else if (vT < 1.5) { float core = exp(-d * d * 90.0); float h = exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 8.0); float v = exp(-abs(q.x) * 70.0) * exp(-abs(q.y) * 8.0); a = core * 1.5 + h + v; }',
    '  else { float r = d * 2.0; float t = r - 0.82; a = exp(-t * t * 220.0) * smoothstep(1.0, 0.9, r); }',
    '  gl_FragColor = vec4(vC.rgb * vC.a * a, 1.0); }'
  ].join('\n');


  /* ── 擬真爆炸：體積火球與煙霧（噪聲著色器的公告板，不需要貼圖；沒有 point sprite 的尺寸上限） ── */
  const VOL_VS = [
    'attribute vec3 aPos; attribute vec4 aD; attribute vec3 aC; varying vec2 vUv; varying vec4 vD; varying vec3 vC;',
    'void main(){ vUv = position.xy * 2.0; vD = aD; vC = aC;',
    '  vec4 mv = viewMatrix * vec4(aPos, 1.0); float s = aD.y;',
    '  s = min(s, 2.2 * max(1.0, -mv.z) / projectionMatrix[1][1]);',              // 近距離時限制在螢幕內
    '  mv.xy += position.xy * s * 2.0; gl_Position = projectionMatrix * mv; }'
  ].join('\n');
  const VOL_NOISE = [
    'varying vec2 vUv; varying vec4 vD; varying vec3 vC;',
    'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }'
  ].join('\n');
  const FIRE_FS = VOL_NOISE + [
    'void main(){',
    '  float r = length(vUv); if (r > 1.0) discard;',
    '  float age = vD.x; vec2 q = vUv * 1.5 + vec2(vD.z * 13.1, vD.z * 7.7);',
    '  float n = fbm(q + vec2(0.0, -age * 1.4)), n2 = fbm(q * 2.1 - age * 0.9 + 4.0);',
    '  float core = 1.0 - r;',
    '  float dens = smoothstep(0.0, 0.5, n * 0.9 + n2 * 0.4 + core * 1.2 - 0.5 - age * 0.6);',
    '  if (dens < 0.01) discard;',
    '  float heat = clamp(core * 1.15 + n * 0.55 - age * 1.15, 0.0, 1.0);',
    '  vec3 hot = vec3(1.0, 0.9, 0.7) * 3.3, mid = vC * 1.9, cool = vC * vec3(0.55, 0.14, 0.08) * 0.8;',
    '  vec3 col = mix(cool, mid, smoothstep(0.1, 0.55, heat)); col = mix(col, hot, smoothstep(0.62, 1.0, heat));',
    '  gl_FragColor = vec4(col * dens * pow(1.0 - age, 1.3) * vD.w, 1.0);',
    '}'
  ].join('\n');
  const SMOKE_FS = VOL_NOISE + [
    'void main(){',
    '  float r = length(vUv); if (r > 1.0) discard;',
    '  float age = vD.x; vec2 q = vUv * 1.3 + vec2(vD.z * 5.3, vD.z * 11.9);',
    '  float n = fbm(q - age * 0.4), n2 = fbm(q * 2.3 + 3.0);',
    '  float dens = smoothstep(0.05, 0.6, n * 0.9 + n2 * 0.35 + (1.0 - r) * 0.9 - 0.62);',
    '  if (dens < 0.01) discard;',
    '  float lit = 0.6 + 0.8 * n2;',
    '  vec3 col = mix(vec3(0.075, 0.07, 0.068) * lit, vC * 0.42, pow(1.0 - age, 2.2) * (1.0 - r * 0.6));',
    '  gl_FragColor = vec4(col, dens * 0.78 * pow(1.0 - age, 0.7) * vD.w);',
    '}'
  ].join('\n');

  function create(opts) {
    const scene = opts.scene, pro = !!opts.pro;
    const fx = { time: 0 };

    /* ── 光束 ── */
    const NB = 6000;
    const base = new THREE.PlaneBufferGeometry(1, 1);
    const bg = new THREE.InstancedBufferGeometry();
    bg.index = base.index; bg.setAttribute('position', base.attributes.position); bg.setAttribute('uv', base.attributes.uv);
    const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(NB * n), n).setUsage(THREE.DynamicDrawUsage);
    const aA = mk(3), aB = mk(3), aC = mk(3), aP = mk(4);
    bg.setAttribute('aA', aA); bg.setAttribute('aB', aB); bg.setAttribute('aColor', aC); bg.setAttribute('aP', aP);
    bg.instanceCount = NB;
    // 預設全部為「過期」狀態
    for (let i = 0; i < NB; i++) { aP.array[i * 4] = -1e6; aP.array[i * 4 + 1] = 0.01; }
    const beamMat = window.SW2.nodes.beamMaterial();
    const beamMesh = new THREE.Mesh(bg, beamMat); beamMesh.frustumCulled = false; beamMesh.renderOrder = 5; scene.add(beamMesh);
    let bi = 0, beamDirty = false;
    fx.beam = function (ax, ay, az, bx, by, bz, o) {
      o = o || {};
      const i = (bi++) % NB, c = o.color || [0.5, 0.9, 1.0];
      aA.array.set([ax, ay, az], i * 3); aB.array.set([bx, by, bz], i * 3); aC.array.set(c, i * 3);
      aP.array.set([fx.time + (o.delay || 0), o.dur || 0.15, o.width || 0.6, o.len || 0], i * 4);
      beamDirty = true;
    };

    /* ── 粒子 ── */
    const PN = 48000;
    const pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pCol = new Float32Array(PN * 4), pT = new Float32Array(PN * 4), pS = new Float32Array(PN * 2);
    for (let i = 0; i < PN; i++) pT[i * 4] = 1e9;                    // 預設為「尚未出生」
    const aPosA = new THREE.InstancedBufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage), aVelA = new THREE.InstancedBufferAttribute(pVel, 3).setUsage(THREE.DynamicDrawUsage), aColA = new THREE.InstancedBufferAttribute(pCol, 4).setUsage(THREE.DynamicDrawUsage),
      aTA = new THREE.InstancedBufferAttribute(pT, 4).setUsage(THREE.DynamicDrawUsage), aSA = new THREE.InstancedBufferAttribute(pS, 2).setUsage(THREE.DynamicDrawUsage);
    const pGeo = window.SW2.nodes.quadGeometry(PN, { aPos: aPosA, aVel: aVelA, aColor: aColA, aT: aTA, aS: aSA });
    const partMat = window.SW2.nodes.particleMaterial();
    const points = new THREE.Mesh(pGeo, partMat); points.frustumCulled = false; points.renderOrder = 6; scene.add(points);
    let pi = 0, dirtyLo = 1e9, dirtyHi = -1, wrapped = false;
    fx.particleCount = 0;
    fx.emit = function (x, y, z, vx, vy, vz, r, g, b, size, life, drag, type, grow) {
      const i = (pi++) % PN; if (i === 0 && pi > 1) wrapped = true;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
      pCol[i * 4] = r; pCol[i * 4 + 1] = g; pCol[i * 4 + 2] = b; pCol[i * 4 + 3] = 1;
      pT[i * 4] = fx.time; pT[i * 4 + 1] = life; pT[i * 4 + 2] = drag || 0; pT[i * 4 + 3] = grow || 0; pS[i * 2] = size; pS[i * 2 + 1] = type || 0;
      if (i < dirtyLo) dirtyLo = i; if (i > dirtyHi) dirtyHi = i; fx.particleCount++;
    };
    function updateParticles() {                                     // 只把「這一幀新發射」的那一段上傳到 GPU
      partMat.uniforms.uTime.value = fx.time;
      if (dirtyHi < 0) return;
      const lo = wrapped ? 0 : dirtyLo, n = wrapped ? PN : dirtyHi - dirtyLo + 1;
      [[aPosA, 3], [aVelA, 3], [aColA, 4], [aTA, 4], [aSA, 2]].forEach((e) => { e[0].updateRange.offset = lo * e[1]; e[0].updateRange.count = n * e[1]; e[0].needsUpdate = true; });
      dirtyLo = 1e9; dirtyHi = -1; wrapped = false;
    }

    /* ── 碎片（實體，會翻滾） ── */
    const DN = 400;
    const dPos = new Float32Array(DN * 3), dVel = new Float32Array(DN * 3), dRot = new Float32Array(DN * 3), dSpin = new Float32Array(DN * 3);
    const dLife = new Float32Array(DN), dMax = new Float32Array(DN), dScale = new Float32Array(DN);
    let debrisMeshes = [], debrisAttr = null, di = 0;
    const dummy = new THREE.Object3D();
    if (opts.debrisParts && opts.debrisParts.length) {
      debrisAttr = new THREE.InstancedBufferAttribute(new Float32Array(DN * 16), 16).setUsage(THREE.DynamicDrawUsage);
      opts.debrisParts.forEach((p) => {
        const m = new THREE.InstancedMesh(p.geometry, p.material, DN);
        m.instanceMatrix = debrisAttr; m.frustumCulled = false; m.count = DN; scene.add(m); debrisMeshes.push(m);
      });
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < DN; i++) zero.toArray(debrisAttr.array, i * 16);
    }
    fx.debris = function (x, y, z, n, speed, scale) {
      if (!debrisAttr) return;
      for (let k = 0; k < n; k++) {
        const i = (di++) % DN, a = rnd(0, Math.PI * 2), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), s = speed * rnd(0.35, 1);
        dPos.set([x, y, z], i * 3); dVel.set([Math.cos(a) * c * s, u * s, Math.sin(a) * c * s], i * 3);
        dRot.set([rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)], i * 3); dSpin.set([rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)], i * 3);
        dLife[i] = dMax[i] = rnd(1.6, 3.6); dScale[i] = (scale || 1) * rnd(0.5, 1.5);
      }
    };
    function updateDebris(dt) {
      if (!debrisAttr) return;
      for (let i = 0; i < DN; i++) {
        if (dLife[i] <= 0) continue;
        dLife[i] -= dt;
        const arr = debrisAttr.array;
        if (dLife[i] <= 0) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); dummy.matrix.toArray(arr, i * 16); continue; }
        const k = dLife[i] / dMax[i];
        dPos[i * 3] += dVel[i * 3] * dt; dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt; dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
        dRot[i * 3] += dSpin[i * 3] * dt; dRot[i * 3 + 1] += dSpin[i * 3 + 1] * dt; dRot[i * 3 + 2] += dSpin[i * 3 + 2] * dt;
        dummy.position.set(dPos[i * 3], dPos[i * 3 + 1], dPos[i * 3 + 2]); dummy.rotation.set(dRot[i * 3], dRot[i * 3 + 1], dRot[i * 3 + 2]);
        const sc = dScale[i] * Math.min(1, k * 3); dummy.scale.set(sc, sc, sc); dummy.updateMatrix(); dummy.matrix.toArray(arr, i * 16);
      }
      debrisAttr.needsUpdate = true;
    }


    /* ── 體積火球／煙霧粒子池 ── */
    /* 現在整套運動／縮放／淡出都在 GPU 頂點著色器裡以「出生時間」解析計算（和粒子一樣），CPU 只在發射時寫入一次、每幀上傳新增的那一段 */
    function makePuffSystem(N, fs, blending, order, v3) {
      const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(N * n), n).setUsage(THREE.DynamicDrawUsage);
      const A = { aPos: mk(3), aVel: mk(3), aC: mk(3), aT: mk(4), aS: mk(2), aX: mk(2), aCen: mk(3) };   // aT = (出生時間, 壽命, 阻力, 強度)；aS = (起始大小, 終點大小)；種子藏在 aVel 之外的 aC 不夠用，改放 aS 的小數運算
      A.aSeed = mk(1);
      for (let i = 0; i < N; i++) A.aT.array[i * 4] = 1e9;
      const g = window.SW2.nodes.quadGeometry(N, A);
      const m = v3 ? window.SW2.nodes.puffMaterial3('fire') : window.SW2.nodes.puffMaterial(fs === FIRE_FS ? 'fire' : 'smoke');
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = order; scene.add(mesh);
      return { N, i: 0, A, m, lo: 1e9, hi: -1, wrapped: false, isFire: fs === FIRE_FS };
    }
    const fireSys = pro ? makePuffSystem(3000, FIRE_FS, THREE.AdditiveBlending, 7) : null, fire3Sys = pro ? makePuffSystem(2200, FIRE_FS, THREE.AdditiveBlending, 8, true) : null, smokeSys = pro ? makePuffSystem(2500, SMOKE_FS, THREE.NormalBlending, 3) : null;
    function puff(sys, x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp, ex) {
      // ex（v3）：{ delay, shift, purple, radius, cx, cy, cz }——延遲出生、先橘後紫旗標、純紫旗標、煙的火光半徑與爆炸中心
      const i = sys.i++ % sys.N, A = sys.A; if (i === 0 && sys.i > 1) sys.wrapped = true;
      A.aPos.array.set([x, y, z], i * 3); A.aVel.array.set([vx, vy, vz], i * 3); A.aC.array.set(col, i * 3);
      A.aT.array.set([fx.time + (ex ? ex.delay || 0 : 0), life, drag || 0, amp || 1], i * 4); A.aS.array.set([s0, s1], i * 2); A.aSeed.array[i] = Math.random() * 50;
      A.aX.array.set(ex ? [ex.shift || 0, sys.isFire ? (ex.purple || 0) : (ex.radius || 1)] : [0, sys.isFire ? 0 : 1], i * 2);
      A.aCen.array.set(ex && ex.cx != null ? [ex.cx, ex.cy, ex.cz] : [x, y, z], i * 3);
      if (i < sys.lo) sys.lo = i; if (i > sys.hi) sys.hi = i;
    }
    function updatePuffs(sys) {
      if (!sys) return; sys.m.uniforms.uTime.value = fx.time;
      if (sys.hi < 0) return;
      const lo = sys.wrapped ? 0 : sys.lo, n = sys.wrapped ? sys.N : sys.hi - sys.lo + 1;
      for (const k in sys.A) { const at = sys.A[k]; at.updateRange.offset = lo * at.itemSize; at.updateRange.count = n * at.itemSize; at.needsUpdate = true; }
      sys.lo = 1e9; sys.hi = -1; sys.wrapped = false;
    }
    fx.fire = (x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp, ex) => { if (fireSys) puff(fireSys, x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp, ex); };
    fx.fire3 = (x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp, ex) => { if (fire3Sys) puff(fire3Sys, x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp, ex); };   // v3 火團（8 種爆焰用）
    fx.smoke = (x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp, ex) => { if (smokeSys) puff(smokeSys, x, y, z, vx, vy, vz, s0, s1, life, col || [0.3, 0.12, 0.05], drag, amp, ex); };

    /* ── 延遲事件 ── */
    const queue = [];
    fx.later = function (delay, fn) { queue.push({ t: fx.time + delay, fn }); };

    /* ── 爆炸：星芒＋火球＋火花＋衝擊環＋碎片 ── */
    fx.explode = function (x, y, z, k, enemy, U) {
      U = U || 1;   // 單位倍率：FPV 以公尺計，爆炸的尺寸與速度整體放大
      const kk = Math.max(0.3, k);
      if (pro) return proExplode(x, y, z, kk, enemy, U);
      // 十字星芒與核心閃光
      fx.emit(x, y, z, 0, 0, 0, 1, 0.95, 0.8, (26 * kk + 8) * U, 0.26, 0, 1);
      fx.emit(x, y, z, 0, 0, 0, 1, 1, 1, (10 * kk + 4) * U, 0.18, 0, 0, 1.2);
      // 火球（會膨脹的柔光團）
      const nb = Math.min(10, Math.floor(2 + 2.2 * kk));
      for (let i = 0; i < nb; i++) {
        const a = rnd(0, 6.28), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), s = rnd(1, 5) * Math.sqrt(kk) * U;
        const hot = Math.random() < 0.6;
        fx.emit(x + rnd(-1, 1) * kk * U, y + rnd(-1, 1) * kk * U, z + rnd(-1, 1) * kk * U, Math.cos(a) * c * s, u * s, Math.sin(a) * c * s,
          hot ? 1 : (enemy ? 0.7 : 0.5), hot ? rnd(0.45, 0.8) : (enemy ? 0.3 : 0.7), hot ? rnd(0.1, 0.3) : 1, rnd(5, 9) * (0.6 + 0.5 * kk) * U, rnd(0.5, 1.0), 1.2, 0, 1.8);
      }
      // 火花（像煙火般迸射、拖曳）
      const ns = Math.min(60, Math.floor(10 + 12 * kk));
      for (let i = 0; i < ns; i++) {
        const a = rnd(0, 6.28), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), s = rnd(8, 34) * Math.sqrt(kk + 0.4) * U;
        const hot = Math.random() < 0.7;
        fx.emit(x, y, z, Math.cos(a) * c * s, u * s, Math.sin(a) * c * s,
          hot ? 1 : (enemy ? 0.78 : 0.6), hot ? rnd(0.55, 0.9) : (enemy ? 0.4 : 0.85), hot ? rnd(0.15, 0.4) : 1, rnd(1.2, 2.8) * Math.sqrt(U), rnd(0.5, 1.5), 1.5);
      }
      // 衝擊波環（較大的爆炸才有）
      if (kk >= 1.8) fx.emit(x, y, z, 0, 0, 0, enemy ? 0.8 : 1, enemy ? 0.5 : 0.8, enemy ? 1 : 0.6, 18 * kk * U, 0.6, 0, 2, 5.5);
      // 實體碎片
      if (kk >= 0.9) fx.debris(x, y, z, Math.min(14, Math.floor(2 + 2.2 * kk)), (10 + 6 * Math.sqrt(kk)) * U, (0.6 + 0.35 * Math.sqrt(kk)) * U);
    };


    /* 擬真爆炸：白熱閃光 → 翻騰的火球（噪聲著色器）→ 緩慢擴散的黑煙，另有迸射的火星、衝擊環與碎片 */
    function proExplode(x, y, z, kk, enemy, U) {
      const R = (4 + 4 * Math.sqrt(kk)) * U, flame = enemy ? [0.8, 0.28, 1.0] : [1.0, 0.5, 0.12];
      fx.emit(x, y, z, 0, 0, 0, 1, 0.9, 0.75, R * 2.2, 0.16, 0, 0, 1.1);                     // 瞬間白閃（柔光）
      fx.emit(x, y, z, 0, 0, 0, 1, 0.8, 0.5, R * 2.0, 0.11, 0, 1);                          // 極短的星芒，只留一點鏡頭感
      const nf = Math.min(16, 3 + Math.floor(kk * 1.4));
      for (let i = 0; i < nf; i++) {
        const a = rnd(0, 6.28), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), sp = R * rnd(0.3, 1.1), off = R * rnd(0, 0.5);
        const life = rnd(0.7, 1.5) * (0.8 + 0.2 * Math.sqrt(kk));
        fx.fire(x + Math.cos(a) * c * off, y + u * off, z + Math.sin(a) * c * off, Math.cos(a) * c * sp, u * sp * 0.8 + R * 0.2, Math.sin(a) * c * sp, R * rnd(0.35, 0.6), R * rnd(1.0, 1.6), life, flame, 1.1, 1);
      }
      fx.fire(x, y, z, 0, 0, 0, R * 0.5, R * 1.7, 0.45, [1, 0.8, 0.5], 0, 1.4);               // 中心的高亮核心
      const ns = Math.min(12, 2 + Math.floor(kk));
      for (let i = 0; i < ns; i++) {
        const a = rnd(0, 6.28), u = rnd(-0.6, 1), c = Math.sqrt(1 - u * u), sp = R * rnd(0.12, 0.5), delay = rnd(0.05, 0.4);
        fx.later(delay, () => fx.smoke(x + Math.cos(a) * c * R * 0.3, y + u * R * 0.3, z + Math.sin(a) * c * R * 0.3, Math.cos(a) * c * sp, u * sp + R * 0.08, Math.sin(a) * c * sp, R * rnd(0.5, 0.8), R * rnd(1.5, 2.6), rnd(2.8, 5.5), flame, 0.5, 1));
      }
      const nsp = Math.min(60, Math.floor(12 + 12 * kk));                                       // 火星
      for (let i = 0; i < nsp; i++) {
        const a = rnd(0, 6.28), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), sp = rnd(8, 34) * Math.sqrt(kk + 0.4) * U;
        const hot = Math.random() < 0.7;
        fx.emit(x, y, z, Math.cos(a) * c * sp, u * sp, Math.sin(a) * c * sp, hot ? 1 : (enemy ? 0.78 : 0.6), hot ? rnd(0.55, 0.9) : (enemy ? 0.4 : 0.85), hot ? rnd(0.15, 0.4) : 1, rnd(1.2, 2.8) * Math.sqrt(U), rnd(0.6, 1.8), 1.3);
      }
      if (kk >= 1.8) fx.emit(x, y, z, 0, 0, 0, enemy ? 0.8 : 1, enemy ? 0.5 : 0.8, enemy ? 1 : 0.6, 18 * kk * U, 0.7, 0, 2, 5.5);
      // 放射狀的火星拖曳線（光束系統的短曳光）：爆炸瞬間向四面迸射，帶出電影感
      const nst = Math.min(26, Math.floor(6 + 3 * kk));
      for (let i = 0; i < nst; i++) {
        const a = rnd(0, 6.28), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), L = R * rnd(2.5, 6.5);
        fx.beam(x, y, z, x + Math.cos(a) * c * L, y + u * L, z + Math.sin(a) * c * L, { color: Math.random() < 0.5 ? [1, 0.75, 0.35] : (enemy ? [0.9, 0.5, 1] : [1, 0.55, 0.2]), width: Math.max(0.15, R * 0.025), dur: rnd(0.5, 1.2), len: L * rnd(0.25, 0.5) });
      }
      if (kk >= 0.9) fx.debris(x, y, z, Math.min(18, Math.floor(3 + 3 * kk)), (10 + 6 * Math.sqrt(kk)) * U, (0.6 + 0.35 * Math.sqrt(kk)) * U * 0.32);
    }

    /* ═════ v3 爆炸（移植自 Godot 版 explosion.gd）═════
     * 8 種變體 × 3 種配色：style 0＝橘（聯軍艦艇被擊毀）、1＝紫（軍團艦艇被擊毀）、2＝先橘後紫（聯軍飛彈命中軍團艦艇）
     * 變體：0 經典、1 連爆、2 噴流、3 閃爆、4 悶燒、5 環形衝擊、6 花瓣、7 延遲爆。size ≈ 船長的 0.35 倍（25~300 公尺）。 */
    const VARIANTS = [
      { fire_n: 12, fire_life: 1.1, fire_size: 1.5, fire_r: 0.6, fire_v: 0.25, spark_n: 320, spark_sp: 1.0, spark_len: 1.0, smoke_n: 42, smoke_size: 1.75, smoke_life: 5.5, smoke_v: 0.5, ember_n: 160, deb_n: 90, light: 1.0 },
      { fire_n: 8, fire_life: 1.0, fire_size: 1.15, fire_r: 0.5, fire_v: 0.25, spark_n: 220, spark_sp: 1.0, spark_len: 0.9, smoke_n: 30, smoke_size: 1.5, smoke_life: 5.0, smoke_v: 0.45, ember_n: 120, deb_n: 70, light: 0.9, chain: 3 },
      { fire_n: 14, fire_life: 1.0, fire_size: 1.05, fire_r: 0.25, fire_v: 1.3, spark_n: 440, spark_sp: 1.7, spark_len: 1.3, smoke_n: 34, smoke_size: 1.45, smoke_life: 5.0, smoke_v: 0.9, ember_n: 110, deb_n: 80, light: 1.0, jet: true },
      { fire_n: 6, fire_life: 0.7, fire_size: 2.2, fire_r: 0.4, fire_v: 0.3, spark_n: 700, spark_sp: 1.5, spark_len: 1.2, smoke_n: 16, smoke_size: 1.25, smoke_life: 3.2, smoke_v: 0.5, ember_n: 90, deb_n: 50, light: 1.8 },
      { fire_n: 16, fire_life: 1.9, fire_size: 1.25, fire_r: 0.7, fire_v: 0.2, spark_n: 170, spark_sp: 0.75, spark_len: 0.9, smoke_n: 52, smoke_size: 2.0, smoke_life: 6.0, smoke_v: 0.35, ember_n: 340, deb_n: 140, light: 0.8 },
      { fire_n: 8, fire_life: 1.0, fire_size: 1.2, fire_r: 0.3, fire_v: 0.2, spark_n: 260, spark_sp: 1.0, spark_len: 1.0, smoke_n: 34, smoke_size: 1.6, smoke_life: 5.0, smoke_v: 0.5, ember_n: 140, deb_n: 80, light: 1.1, ring: true },
      { fire_n: 10, fire_life: 1.0, fire_size: 1.2, fire_r: 0.35, fire_v: 0.6, spark_n: 160, spark_sp: 1.3, spark_len: 1.3, smoke_n: 36, smoke_size: 1.55, smoke_life: 5.2, smoke_v: 0.6, ember_n: 120, deb_n: 80, light: 1.0, jets: 5 },
      { fire_n: 14, fire_life: 1.1, fire_size: 1.8, fire_r: 0.6, fire_v: 0.35, spark_n: 520, spark_sp: 1.3, spark_len: 1.1, smoke_n: 44, smoke_size: 1.8, smoke_life: 5.5, smoke_v: 0.55, ember_n: 180, deb_n: 100, light: 1.4, delay: 0.4 }
    ];
    const recent = [];   // 最近幾秒的爆炸時間：同時爆炸越多，單顆越輕量（煙／餘燼／碎片依序省掉），避免大混戰時填充率爆表
    function crowd() { const now = fx.time; while (recent.length && now - recent[0] > 4) recent.shift(); recent.push(now); return recent.length; }
    const SPARK_BUDGET = 0.42;   // Godot 的火花是 GPU 粒子（幾百顆很便宜）；網頁版用光束池畫短曳光，數量打折
    function lodFor(x, y, z, size) {
      if (typeof camera === 'undefined') return 1;
      const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z) / Math.max(size / 120, 0.6);
      return Math.min(1, Math.max(0.4, 1 - (d - 6000) / 18000));
    }
    fx.explode3 = function (x, y, z, size, style, variant, o) {
      o = o || {};
      const V = VARIANTS[variant != null && variant >= 0 ? variant : (Math.random() * VARIANTS.length) | 0];
      const nCrowd = crowd(), lite = !!(window.G && window.G.lite), lod = lodFor(x, y, z, size) * (lite ? 0.5 : 1) * (nCrowd > 10 ? 0.6 : 1) * (nCrowd > 20 ? 0.6 : 1);
      const purple = style === 1, shift = style === 2 ? 1 : 0;
      size *= rnd(0.88, 1.15);
      const cnt = (n, k) => Math.max(2, Math.floor(n * (k == null ? lod : k)));
      const ja = rnd(0, Math.PI * 2), ju = rnd(-0.6, 1), jc = Math.sqrt(1 - ju * ju), jd = [Math.cos(ja) * jc, ju, Math.sin(ja) * jc];   // 噴流方向
      const delay = V.delay || 0, ring = !!V.ring, flameOnly = !!o.flameOnly;   // flameOnly：只放 8 種爆焰的火團＋火花（飛彈用；煙／體積雲／餘燼／碎片／光源走 v2 原版）
      const randDir = () => { const a = rnd(0, 6.283), u = rnd(-1, 1), c = Math.sqrt(1 - u * u); return [Math.cos(a) * c, u, Math.sin(a) * c]; };
      const coneDir = (axis, deg) => { const t = Math.tan(deg * Math.PI / 180), r = randDir(); let d = [axis[0] + r[0] * t, axis[1] + r[1] * t, axis[2] + r[2] * t]; const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
      const fireCol = purple ? [rnd(0.5, 0.75), rnd(0.15, 0.3), rnd(0.9, 1.0)] : [1.0, rnd(0.28, 0.55), rnd(0.04, 0.12)];
      const smokeFire = purple ? [0.62, 0.25, 1.0] : [1.0, 0.38, 0.09];
      const exF = (d) => ({ delay: d, shift, purple: purple ? 1 : 0 });
      // 1) 火團：多團，錯時冒出
      const nf = Math.max(5, Math.round(V.fire_n * (nCrowd > 30 ? 0.75 : 1))), fr = size * V.fire_size * 0.5;   // 火球永遠接近滿配：擁擠時只省煙／火花／餘燼／碎片（使用者：不要縮成一小坨）
      for (let i = 0; i < nf; i++) {
        const p = randDir(), off = size * V.fire_r * Math.cbrt(Math.random()), sp = size * V.fire_v * Math.random();
        const dir = V.jet ? coneDir(jd, 28) : p, born = delay + rnd(0, V.fire_life * 0.35);
        fx.fire3(x + p[0] * off, y + p[1] * off, z + p[2] * off, dir[0] * sp, dir[1] * sp, dir[2] * sp, fr * 0.33, fr * rnd(0.85, 1.05), V.fire_life * rnd(0.8, 1.1), fireCol, 2.2, 1, exF(born));
      }
      if (ring) {   // 環形：一圈向外擴張的火團
        const ax = jd, u0 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const t1 = [ax[1] * u0[2] - ax[2] * u0[1], ax[2] * u0[0] - ax[0] * u0[2], ax[0] * u0[1] - ax[1] * u0[0]], tl = Math.hypot(...t1) || 1, e1 = [t1[0] / tl, t1[1] / tl, t1[2] / tl];
        const e2 = [ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]];
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * 6.283 + rnd(-0.2, 0.2), d = [Math.cos(a) * e1[0] + Math.sin(a) * e2[0], Math.cos(a) * e1[1] + Math.sin(a) * e2[1], Math.cos(a) * e1[2] + Math.sin(a) * e2[2]], sp = size * rnd(0.8, 1.2);
          fx.fire3(x + d[0] * size * 0.25, y + d[1] * size * 0.25, z + d[2] * size * 0.25, d[0] * sp, d[1] * sp, d[2] * sp, size * 0.12, size * 0.4, 0.9, fireCol, 2.0, 1, exF(delay));
        }
      }
      if (delay > 0) fx.fire3(x, y, z, 0, 0, 0, size * 0.1, size * 0.28, 0.5, fireCol, 0, 1, exF(0));   // 先出現一小團悶光
      fx.fire3(x, y, z, 0, 0, 0, size * 0.2, size * 0.7, 0.35, [1, 0.85, 0.55], 0, 1.3, exF(delay));    // 中心的高亮核心
      // 2) 濃煙：近黑、厚、5~6 秒
      const lite2 = flameOnly || lite || nCrowd > 18 || (window.G && window.G.fxLow);   // 太擁擠：不放煙／餘燼／碎片
      const ns = flameOnly ? 0 : (lite2 ? Math.floor(V.smoke_n * 0.3 * lod) : Math.floor(cnt(V.smoke_n) * 0.55)), sr = size * V.smoke_size * 0.5;   // 煙是填充率大戶：數量打 55 折
      for (let i = 0; i < ns; i++) {
        const p = randDir(), off = size * 0.65 * Math.cbrt(Math.random()), sp = size * V.smoke_v * Math.random();
        const dir = V.jet ? coneDir(jd, 40) : p, born = delay + rnd(0, V.smoke_life * 0.28);
        fx.smoke(x + p[0] * off, y + p[1] * off, z + p[2] * off, dir[0] * sp, dir[1] * sp, dir[2] * sp, sr * 0.12, sr * rnd(0.6, 0.9), V.smoke_life * rnd(0.85, 1.1), smokeFire, 1.6, 1, { delay: born, shift, radius: size * 2.5, cx: x, cy: y, cz: z });
      }
      // 3) 火花：細長曳光（橘黃＋粉紫兩組）。花瓣：5 道窄角火舌
      const nsp = cnt(V.spark_n * SPARK_BUDGET), L0 = size * 0.07 * V.spark_len * 2.5, w0 = Math.max(0.12, size * 0.0045);
      const gold = purple ? [0.95, 0.7, 1.0] : [1.0, 0.72, 0.3], lilac = purple ? [1.0, 0.6, 0.95] : [0.85, 0.7, 1.0];
      const jets = []; for (let j = 0; j < (V.jets || 0); j++) jets.push(randDir());
      for (let i = 0; i < nsp; i++) {
        const k2 = i % 2, col = (purple || (style === 2 && k2 === 1)) ? lilac : (k2 ? lilac : gold), dd = (style === 2 && k2 === 1) ? 0.35 : 0;
        const dir = V.jets ? coneDir(jets[i % V.jets], 14) : (V.jet ? coneDir(jd, 22) : randDir());
        const dist = size * V.spark_sp * rnd(0.5, 1.7), dur = rnd(0.55, 1.3), t0 = delay + dd + rnd(0, 0.12);
        fx.beam(x, y, z, x + dir[0] * dist, y + dir[1] * dist, z + dir[2] * dist, { color: col, width: w0 * rnd(0.7, 1.4), dur, len: L0 * rnd(0.6, 1.4), delay: t0 });
      }
      // 3b) 餘燼：慢速、飄很久的小亮點
      const ne = lite2 ? 0 : cnt(V.ember_n * 0.35);
      for (let i = 0; i < ne; i++) {
        const d = randDir(), sp = size * rnd(0.05, 0.5), off = size * 0.6 * Math.cbrt(Math.random()), t0 = delay;
        if (t0 > 0) fx.later(t0, () => fx.emit(x + d[0] * off, y + d[1] * off, z + d[2] * off, d[0] * sp, d[1] * sp, d[2] * sp, purple ? 0.9 : 1.0, purple ? 0.5 : 0.6, purple ? 1.0 : 0.2, Math.max(0.8, size * 0.035), 4.5 * rnd(0.6, 1), 0.8));
        else fx.emit(x + d[0] * off, y + d[1] * off, z + d[2] * off, d[0] * sp, d[1] * sp, d[2] * sp, purple ? 0.9 : 1.0, purple ? 0.5 : 0.6, purple ? 1.0 : 0.2, Math.max(0.8, size * 0.035), 4.5 * rnd(0.6, 1), 0.8);
      }
      // 閃光與衝擊環（小爆炸不放）
      fx.emit(x, y, z, 0, 0, 0, 1, 0.9, 0.75, size * 1.4, 0.16, 0, 0, 1.1);
      if (size >= 90) fx.emit(x, y, z, 0, 0, 0, purple ? 0.8 : 1, purple ? 0.5 : 0.8, purple ? 1 : 0.6, size * 2.2, 0.7, 0, 2, 5.5);
      // 4) 碎片：黑色薄片，慢速翻滾
      if (!lite2) fx.debris(x, y, z, Math.min(24, cnt(V.deb_n * 0.2)), size * 0.5, size * 0.035);
      // 5) 光源
      if (!flameOnly && typeof boomLight === 'function') boomLight(x, y, z, Math.max(0.8, Math.min(24, size / 12)) * V.light, purple ? [0.7, 0.32, 1.0] : [1.0, 0.55, 0.2]);
      // 連爆：接連 N 次小爆（只對距離近的爆炸）
      if (V.chain && !o.noChain && lod > 0.5) {
        for (let i = 0; i < V.chain; i++) fx.later(0.16 * (i + 1) + rnd(0, 0.18), () => fx.explode3(x + rnd(-1, 1) * size * 0.9, y + rnd(-1, 1) * size * 0.9, z + rnd(-1, 1) * size * 0.9, size * 0.55, style, Math.random() < 0.5 ? 0 : 3, { noChain: true }));
      }
    };

    /* ── 每幀 ── */
    fx.update = function (dt) {
      fx.time += dt;
      beamMat.uniforms.uTime.value = fx.time;
      if (beamDirty) { aA.needsUpdate = aB.needsUpdate = aC.needsUpdate = aP.needsUpdate = true; beamDirty = false; }
      updateParticles(); updateDebris(dt); updatePuffs(fireSys); updatePuffs(fire3Sys); updatePuffs(smokeSys);
      if (fx.onUpdate) fx.onUpdate(dt);
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].t <= fx.time) { const f = queue[i].fn; queue.splice(i, 1); f(); }
    };
    fx.setPixelScale = (v) => { partMat.uniforms.scale.value = v; };
    return fx;
  }

  global.SWFx = { create };
})(window);
