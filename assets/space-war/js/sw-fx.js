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

  const PART_VS = [
    'attribute vec4 aColor; attribute float size; attribute float aType; uniform float scale; varying vec4 vC; varying float vT;',
    'void main(){ vC = aColor; vT = aType; vec4 mv = modelViewMatrix * vec4(position, 1.0);',
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
    'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }'
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
    '  vec3 hot = vec3(1.0, 0.93, 0.78) * 5.5, mid = vC * 2.6, cool = vC * vec3(0.55, 0.14, 0.08) * 0.8;',
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
    const NB = 4096;
    const base = new THREE.PlaneBufferGeometry(1, 1);
    const bg = new THREE.InstancedBufferGeometry();
    bg.index = base.index; bg.setAttribute('position', base.attributes.position); bg.setAttribute('uv', base.attributes.uv);
    const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(NB * n), n).setUsage(THREE.DynamicDrawUsage);
    const aA = mk(3), aB = mk(3), aC = mk(3), aP = mk(4);
    bg.setAttribute('aA', aA); bg.setAttribute('aB', aB); bg.setAttribute('aColor', aC); bg.setAttribute('aP', aP);
    bg.instanceCount = NB;
    // 預設全部為「過期」狀態
    for (let i = 0; i < NB; i++) { aP.array[i * 4] = -1e6; aP.array[i * 4 + 1] = 0.01; }
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
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
    const PN = 9000;
    const pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pCol = new Float32Array(PN * 4), pBase = new Float32Array(PN * 4);
    const pSize = new Float32Array(PN), pSize0 = new Float32Array(PN), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pDrag = new Float32Array(PN);
    const pType = new Float32Array(PN), pGrow = new Float32Array(PN);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 4));
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
    pGeo.setAttribute('aType', new THREE.BufferAttribute(pType, 1));
    const partMat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 500 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: PART_VS, fragmentShader: PART_FS
    });
    const points = new THREE.Points(pGeo, partMat); points.frustumCulled = false; points.renderOrder = 6; scene.add(points);
    let pi = 0;
    fx.emit = function (x, y, z, vx, vy, vz, r, g, b, size, life, drag, type, grow) {
      const i = (pi++) % PN;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
      pBase[i * 4] = r; pBase[i * 4 + 1] = g; pBase[i * 4 + 2] = b; pBase[i * 4 + 3] = 1;
      pSize0[i] = size; pSize[i] = size; pLife[i] = pMax[i] = life; pDrag[i] = drag || 0; pType[i] = type || 0; pGrow[i] = grow || 0;
    };
    function updateParticles(dt) {
      for (let i = 0; i < PN; i++) {
        const l = pLife[i];
        if (l <= 0) { if (pCol[i * 4 + 3] !== 0) { pCol[i * 4 + 3] = 0; pSize[i] = 0; } continue; }
        pLife[i] = l - dt;
        const k = Math.max(0, pLife[i]) / pMax[i], dr = Math.max(0, 1 - pDrag[i] * dt);
        pVel[i * 3] *= dr; pVel[i * 3 + 1] *= dr; pVel[i * 3 + 2] *= dr;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        pCol[i * 4] = pBase[i * 4]; pCol[i * 4 + 1] = pBase[i * 4 + 1]; pCol[i * 4 + 2] = pBase[i * 4 + 2];
        const ty = pType[i];
        pCol[i * 4 + 3] = ty > 1.5 ? k : k * k;
        pSize[i] = pGrow[i] ? pSize0[i] * (0.25 + pGrow[i] * (1 - k)) : pSize0[i] * (0.4 + 0.6 * k);
      }
      pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aColor.needsUpdate = true; pGeo.attributes.size.needsUpdate = true;
      pGeo.attributes.aType.needsUpdate = true;
    }

    /* ── 碎片（實體，會翻滾） ── */
    const DN = 360;
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
    function makePuffSystem(N, fs, blending, order) {
      const base = new THREE.PlaneBufferGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
      g.index = base.index; g.setAttribute('position', base.attributes.position);
      const aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
      const aD = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const aC = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aPos', aPos); g.setAttribute('aD', aD); g.setAttribute('aC', aC); g.instanceCount = N;
      const m = new THREE.ShaderMaterial({ vertexShader: VOL_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = order; scene.add(mesh);
      return { N, i: 0, aPos, aD, aC, vel: new Float32Array(N * 3), age: new Float32Array(N), life: new Float32Array(N).fill(0), s0: new Float32Array(N), s1: new Float32Array(N), drag: new Float32Array(N), amp: new Float32Array(N), seed: new Float32Array(N) };
    }
    const fireSys = pro ? makePuffSystem(900, FIRE_FS, THREE.AdditiveBlending, 7) : null, smokeSys = pro ? makePuffSystem(700, SMOKE_FS, THREE.NormalBlending, 3) : null;
    function puff(sys, x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp) {
      const i = (sys.i++) % sys.N;
      sys.aPos.array.set([x, y, z], i * 3); sys.vel[i * 3] = vx; sys.vel[i * 3 + 1] = vy; sys.vel[i * 3 + 2] = vz;
      sys.age[i] = 0; sys.life[i] = life; sys.s0[i] = s0; sys.s1[i] = s1; sys.drag[i] = drag || 0; sys.amp[i] = amp || 1; sys.seed[i] = Math.random() * 50;
      sys.aC.array.set(col, i * 3); sys.aD.array[i * 4 + 1] = s0;
    }
    function updatePuffs(sys, dt) {
      if (!sys) return;
      const P = sys.aPos.array, D = sys.aD.array;
      for (let i = 0; i < sys.N; i++) {
        const l = sys.life[i];
        if (l <= 0) { if (D[i * 4 + 1] !== 0) D[i * 4 + 1] = 0; continue; }
        sys.age[i] += dt; const a = sys.age[i] / l;
        if (a >= 1) { sys.life[i] = 0; D[i * 4 + 1] = 0; continue; }
        const dr = Math.max(0, 1 - sys.drag[i] * dt);
        sys.vel[i * 3] *= dr; sys.vel[i * 3 + 1] *= dr; sys.vel[i * 3 + 2] *= dr;
        P[i * 3] += sys.vel[i * 3] * dt; P[i * 3 + 1] += sys.vel[i * 3 + 1] * dt; P[i * 3 + 2] += sys.vel[i * 3 + 2] * dt;
        const e = 1 - Math.pow(1 - a, 2.2);
        D[i * 4] = a; D[i * 4 + 1] = sys.s0[i] + (sys.s1[i] - sys.s0[i]) * e; D[i * 4 + 2] = sys.seed[i]; D[i * 4 + 3] = sys.amp[i];
      }
      sys.aPos.needsUpdate = sys.aD.needsUpdate = sys.aC.needsUpdate = true;
    }
    fx.fire = (x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp) => { if (fireSys) puff(fireSys, x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp); };
    fx.smoke = (x, y, z, vx, vy, vz, s0, s1, life, col, drag, amp) => { if (smokeSys) puff(smokeSys, x, y, z, vx, vy, vz, s0, s1, life, col || [0.3, 0.12, 0.05], drag, amp); };

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
      fx.emit(x, y, z, 0, 0, 0, 1, 0.95, 0.85, R * 3.2, 0.2, 0, 0, 1.2);                     // 瞬間白閃（柔光）
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

    /* ── 每幀 ── */
    fx.update = function (dt) {
      fx.time += dt;
      beamMat.uniforms.uTime.value = fx.time;
      if (beamDirty) { aA.needsUpdate = aB.needsUpdate = aC.needsUpdate = aP.needsUpdate = true; beamDirty = false; }
      updateParticles(dt); updateDebris(dt); updatePuffs(fireSys, dt); updatePuffs(smokeSys, dt);
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].t <= fx.time) { const f = queue[i].fn; queue.splice(i, 1); f(); }
    };
    fx.setPixelScale = (v) => { partMat.uniforms.scale.value = v; };
    return fx;
  }

  global.SWFx = { create };
})(window);
