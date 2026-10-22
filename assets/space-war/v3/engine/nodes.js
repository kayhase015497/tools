/* nodes.js — v2 的材質工廠（TSL 節點材質）
 *
 * v1 的每個 `ShaderMaterial`（GLSL）在這裡都有對應的 TSL 版本，介面保持相容：
 *   · 每個材質有 `mat.uniforms`，內容是 uniform 節點（`.value` 可直接讀寫，和 v1 相同）
 *   · 實例化資料沿用 v1 的屬性名稱（aA / aB / aP / aVel / aT / aS / aPos / aD / aC …）
 * 這樣 v1 的模擬與特效程式幾乎不用改，只要把「建立材質」那幾行換成這裡的工廠。
 */
import * as W from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, attribute, varying, positionLocal, positionView, normalView, cameraPosition, cameraViewMatrix, cameraProjectionMatrix,
  modelViewMatrix, uv, mix, smoothstep, exp, pow, length, normalize, cross, dot, clamp, max, min, abs, select, sin, cos, acos, asin, atan, fract, floor, mod,
  Discard, If, materialColor, materialEmissive, cubeTexture, oneMinus, fwidth, step, viewportSize
} from 'three/tsl';
import { hash3, fbm3, fbm2, vn2, pointSpriteClip } from './tsl-lib.js';

const ADD = W.AdditiveBlending;
function fxMaterial(o) {
  const m = new W.MeshBasicNodeMaterial(Object.assign({ transparent: true, depthWrite: false, blending: ADD, side: W.DoubleSide, fog: false }, o || {}));
  m.toneMapped = false; return m;
}
/** 實例化的公告板幾何：平面 + 一組實例屬性 */
export function quadGeometry(count, attrs) {
  const g = new W.InstancedBufferGeometry(), p = new W.PlaneGeometry(1, 1);
  g.index = p.index; g.setAttribute('position', p.attributes.position); g.setAttribute('uv', p.attributes.uv);
  for (const k in attrs) g.setAttribute(k, attrs[k]);
  g.instanceCount = count; return g;
}

/* ───────── 光束（對應 v1 的 BEAM_VS / BEAM_FS） ───────── */
export function beamMaterial() {
  const aA = attribute('aA', 'vec3'), aB = attribute('aB', 'vec3'), aColor = attribute('aColor', 'vec3'), aP = attribute('aP', 'vec4');
  const uTime = uniform(0);
  const age = uTime.sub(aP.x), u = clamp(age.div(aP.y), 0.0, 1.0);
  const dirRaw = aB.sub(aA), L = length(dirRaw), dir = dirRaw.div(max(L, 1e-4));
  const trav = aP.w.greaterThan(0.0), head = u.mul(L.add(aP.w)), tail = head.sub(aP.w);
  const s = select(trav, aA.add(dir.mul(clamp(tail, 0.0, L))), aA), e = select(trav, aA.add(dir.mul(clamp(head, 0.0, L))), aB);
  const alpha = select(trav, float(1.0), oneMinus(u).mul(oneMinus(u)));
  const mid = s.add(e).mul(0.5), toCam = cameraPosition.sub(mid), w = max(aP.z, length(toCam).mul(0.0022));
  const side = normalize(cross(dir, toCam).add(1e-5)).mul(w), v = positionLocal.y.add(0.5);
  const p = mix(s, e, v).add(side.mul(positionLocal.x.mul(2.0)));
  const clip = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(p, 1.0)));
  const m = fxMaterial();
  m.vertexNode = select(age.lessThan(0.0).or(age.greaterThan(aP.y)), vec4(2.0, 2.0, 2.0, 1.0), clip);
  const vU = varying(positionLocal.x.add(0.5), 'vBU'), vV = varying(v, 'vBV'), vCol = varying(aColor, 'vBC'), vA = varying(alpha, 'vBA');
  m.colorNode = Fn(() => {
    const a = abs(vU.sub(0.5)).mul(2.0), core = exp(a.mul(a).mul(-7.0)), glow = exp(a.mul(a).mul(-1.6)).mul(0.55);
    const along = smoothstep(0.0, 0.12, vV).mul(smoothstep(1.0, 0.88, vV));
    const c = mix(vCol, vec3(1.0), core.mul(0.3)).mul(core.mul(1.25).add(glow.mul(0.9))).mul(along).mul(vA);
    return vec4(c, 1.0);
  })();
  m.uniforms = { uTime }; return m;
}

/* ───────── GPU 粒子（對應 v1 的 PART_VS / PART_FS；實例化方形精靈，因為 WebGPU 的點只有 1 像素） ───────── */
export function particleMaterial() {
  const aPos = attribute('aPos', 'vec3'), aVel = attribute('aVel', 'vec3'), aColor = attribute('aColor', 'vec4'), aT = attribute('aT', 'vec4'), aS = attribute('aS', 'vec2');
  const uTime = uniform(0), scale = uniform(500);
  const age = uTime.sub(aT.x), k = oneMinus(age.div(aT.y)), dr = aT.z;
  const travel = select(dr.greaterThan(0.001), oneMinus(exp(dr.negate().mul(age))).div(max(dr, 1e-4)), age);
  const pw = aPos.add(aVel.mul(travel)), size = select(aT.w.greaterThan(0.0), aS.x.mul(float(0.25).add(aT.w.mul(oneMinus(k)))), aS.x.mul(float(0.4).add(k.mul(0.6))));
  const mv = modelViewMatrix.mul(vec4(pw, 1.0)), px = clamp(size.mul(scale).div(max(1.0, mv.z.negate())), 0.0, 420.0);
  const m = fxMaterial();
  m.vertexNode = select(age.lessThan(0.0).or(age.greaterThan(aT.y)), vec4(2.0, 2.0, 2.0, 1.0), pointSpriteClip(mv.xyz, px, positionLocal.xy));
  const vC = varying(vec4(aColor.rgb, select(aS.y.greaterThan(1.5), k, k.mul(k))), 'vPC'), vT = varying(aS.y, 'vPT');
  m.colorNode = Fn(() => {
    const q = uv().sub(0.5), d = length(q);
    const soft = smoothstep(0.5, 0.0, d), a0 = soft.mul(soft).mul(1.4);
    const core = exp(d.mul(d).mul(-90.0)), hh = exp(abs(q.y).mul(-70.0)).mul(exp(abs(q.x).mul(-8.0))), vv = exp(abs(q.x).mul(-70.0)).mul(exp(abs(q.y).mul(-8.0)));
    const a1 = core.mul(1.5).add(hh).add(vv);
    const r = d.mul(2.0), t = r.sub(0.82), a2 = exp(t.mul(t).mul(-220.0)).mul(smoothstep(1.0, 0.9, r));
    const a = select(vT.lessThan(0.5), a0, select(vT.lessThan(1.5), a1, a2));
    return vec4(vC.rgb.mul(vC.a).mul(a), 1.0);
  })();
  m.uniforms = { uTime, scale }; return m;
}

/* ───────── 體積火球／煙霧（對應 v1 的 VOL_VS / FIRE_FS / SMOKE_FS） ───────── */
export function puffMaterial(kind) {
  const aPos = attribute('aPos', 'vec3'), aVel = attribute('aVel', 'vec3'), aC = attribute('aC', 'vec3'), aT = attribute('aT', 'vec4'), aS = attribute('aS', 'vec2'), aSeed = attribute('aSeed', 'float');
  const aX = attribute('aX', 'vec2'), aCen = attribute('aCen', 'vec3');   // aX：火＝(先橘後紫旗標, 純紫旗標)，煙＝(先橘後紫旗標, 火光影響半徑)；aCen：爆炸中心（煙的受光方向）
  const uTime = uniform(0);
  const age = uTime.sub(aT.x), a = clamp(age.div(aT.y), 0.0, 1.0), dr = aT.z;
  const travel = select(dr.greaterThan(0.001), oneMinus(exp(dr.negate().mul(age))).div(max(dr, 1e-4)), age);
  const e = oneMinus(pow(oneMinus(a), 2.2)), size = aS.x.add(aS.y.sub(aS.x).mul(e));
  const dead = age.lessThan(0.0).or(age.greaterThan(aT.y));
  const wpos = aPos.add(aVel.mul(travel));
  const clipPos = Fn(() => {
    const mv = cameraViewMatrix.mul(vec4(wpos, 1.0)).toVar(), s = min(size, float(2.2).mul(max(1.0, mv.z.negate())).div(cameraProjectionMatrix.element(1).y));
    mv.xy.addAssign(positionLocal.xy.mul(s).mul(2.0));
    return cameraProjectionMatrix.mul(vec4(mv.xyz, 1.0));
  })();
  const isFire = kind === 'fire';
  const m = fxMaterial({ blending: isFire ? ADD : W.NormalBlending });
  m.vertexNode = select(dead, vec4(2.0, 2.0, 2.0, 1.0), clipPos);
  const vUv = varying(positionLocal.xy.mul(2.0), 'vVU'), vD = varying(vec4(a, size, aSeed, aT.w), 'vVD'), vC = varying(aC, 'vVC'), vX = varying(aX, 'vVX');
  const toC = aCen.sub(wpos), dC = length(toC), ldW = toC.div(max(dC, 0.001));
  const vL = varying(cameraViewMatrix.mul(vec4(ldW, 0.0)).xy, 'vVL'), vK = varying(exp(dC.negate().div(max(aX.y, 1.0))), 'vVK');
  m.colorNode = isFire ? Fn(() => {
    /* 火團：移植自 Godot 的 fireball.gdshader（花椰菜泡泡、黃白過曝中心、先橘後紫） */
    const r = length(vUv); If(r.greaterThan(1.0), () => { Discard(); });
    const age = vD.x, q = vUv.mul(1.6).add(vec2(vD.z, vD.z.mul(0.37)));
    const n = fbm2(q.add(vec2(0.0, age.mul(-1.6)))), n2 = fbm2(q.mul(2.3).sub(age.mul(1.1)).add(4.0)), core = oneMinus(r);
    const bubbles = smoothstep(0.35, 0.75, n.mul(0.85).add(n2.mul(0.45)));
    const dens = smoothstep(0.0, 0.45, bubbles.mul(0.9).add(core.mul(1.25)).sub(0.55).sub(age.mul(0.75)));
    If(dens.lessThan(0.01), () => { Discard(); });
    const heat = clamp(core.mul(1.2).add(n.mul(0.6)).sub(age.mul(1.25)), 0.0, 1.0);
    const sh = vX.x.mul(smoothstep(0.12, 0.5, age)), purple = max(vX.y, sh);
    const mid = mix(vC, vec3(0.62, 0.22, 1.0), sh);
    const cool = mid.mul(mix(vec3(0.55, 0.24, 0.5), vec3(0.35, 0.18, 0.45), purple)), hot = mix(vec3(2.2, 2.0, 1.55), vec3(2.0, 1.55, 2.4), purple);
    const col = mix(mix(cool, mid, smoothstep(0.1, 0.55, heat)), hot, smoothstep(0.62, 1.0, heat));
    const fade = pow(clamp(oneMinus(age), 0.0, 1.0), 1.4);
    return vec4(col.mul(dens).mul(fade).mul(1.05).mul(vD.w), 1.0);
  })() : Fn(() => {
    /* 濃煙：移植自 Godot 的 smoke.gdshader（近黑的花椰菜雲：高度場假法線、暗心亮邊、火光只染朝向爆炸中心的一側） */
    const r = length(vUv); If(r.greaterThan(1.0), () => { Discard(); });
    const age = vD.x, q = vUv.mul(1.5).add(vec2(vD.z, vD.z.mul(0.61))).add(vec2(0.0, age.mul(-0.4)));
    const base = oneMinus(r).mul(0.6), hgt = (qq) => smoothstep(0.18, 0.7, fbm2(qq).mul(1.15).add(base)), ee = 0.08;   // 純 JS 展開（不用巢狀 Fn）：WGSL 的子函式不能抓外層片段變數
    const h = hgt(q), hx = hgt(q.add(vec2(ee, 0.0))), hy = hgt(q.add(vec2(0.0, ee)));   // 前向差分：3 次取樣（原本 5 次）
    const gx = hx.sub(h).div(ee), gy = hy.sub(h).div(ee);
    const nrm = normalize(vec3(gx.negate().mul(0.9), gy.negate().mul(0.9), 1.0));
    const r2 = r.add(fbm2(q.mul(1.9).add(5.0)).sub(0.5).mul(0.7));
    const edge = smoothstep(1.0, 0.45, r2);
    const al = clamp(h.mul(1.6), 0.0, 1.0).mul(edge).mul(smoothstep(0.0, 0.05, age)).mul(oneMinus(smoothstep(0.3, 0.95, age))).mul(0.9);
    If(al.lessThan(0.015), () => { Discard(); });
    const facingFire = clamp(dot(nrm, normalize(vec3(vL, 0.55))), 0.0, 1.0);
    const fireT = pow(clamp(oneMinus(age.mul(2.6)), 0.0, 1.0), 1.6).mul(1.15).add(pow(clamp(oneMinus(age), 0.0, 1.0), 4.0).mul(0.12));
    const fire = pow(facingFire, 1.8).mul(fireT).mul(vK).mul(0.55);
    const facingKey = clamp(dot(nrm, normalize(vec3(-0.45, 0.65, 0.6))), 0.0, 1.0);
    const ao = smoothstep(0.0, 0.9, r).mul(0.65).add(0.35);
    const ember = smoothstep(0.88, 0.96, vn2(q.mul(8.0).add(age.mul(2.0)))).mul(oneMinus(age)).mul(2.0).mul(vK.add(0.4));
    const shk = vX.x.mul(smoothstep(0.1, 0.4, age)), fcol = mix(vC, vec3(0.62, 0.25, 1.0), shk);
    const col = vec3(0.012, 0.011, 0.013).mul(h.mul(1.2).add(0.8)).mul(ao).add(vec3(0.30, 0.33, 0.42).mul(pow(facingKey, 2.2)).mul(0.42).mul(smoothstep(0.0, 0.12, age))).add(fcol.mul(fire)).add(mix(vec3(1.0, 0.32, 0.06), vec3(0.62, 0.25, 1.0), shk).mul(ember));
    return vec4(col, al.mul(vD.w));
  })();
  m.uniforms = { uTime };
  return m;
}

export function glowPointMaterial() {   // 艦隊引擎光暈：屬性 aPos / aSize / aColor
  const aPos = attribute('aPos', 'vec3'), aSize = attribute('aSize', 'float'), aColor = attribute('aColor', 'vec3'), scale = uniform(500);
  const mv = modelViewMatrix.mul(vec4(aPos, 1.0)), px = clamp(aSize.mul(scale).div(max(1.0, mv.z.negate())), 1.0, 160.0);
  const m = fxMaterial(); m.vertexNode = pointSpriteClip(mv.xyz, px, positionLocal.xy);
  const vC = varying(aColor, 'vGC');
  m.colorNode = Fn(() => { const d = length(uv().sub(0.5)), a0 = smoothstep(0.5, 0.0, d), a = a0.mul(a0).mul(1.3).add(exp(d.mul(d).mul(-120.0)).mul(0.8)); return vec4(vC.mul(a), 1.0); })();
  m.uniforms = { scale }; return m;
}
export function starMaterial() {        // 屬性 aPos / aCol / aSize；深度壓到遠平面，只畫在「沒有東西」的地方
  const aPos = attribute('aPos', 'vec3'), aCol = attribute('aCol', 'vec3'), aSize = attribute('aSize', 'float'), uPR = uniform(1);
  const mv = modelViewMatrix.mul(vec4(aPos, 1.0)), clip = pointSpriteClip(mv.xyz, aSize.mul(uPR), positionLocal.xy);
  const m = fxMaterial({ depthTest: true }); m.vertexNode = vec4(clip.x, clip.y, clip.w.mul(0.99999), clip.w);
  const vC = varying(aCol, 'vSC');
  m.colorNode = Fn(() => { const d = length(uv().sub(0.5)), a = smoothstep(0.5, 0.0, d); return vec4(vC.mul(a).mul(a), 1.0); })();
  m.uniforms = { uPR }; return m;
}
export function dustMaterial() {        // 屬性 aPos（0~1 的隨機位置）；uniforms: uCam / uBox / uScale
  const aPos = attribute('aPos', 'vec3'), uCam = uniform(new W.Vector3()), uBox = uniform(700), uScale = uniform(500);
  const p = mod(aPos.mul(uBox).sub(uCam), uBox).sub(uBox.mul(0.5)), mv = cameraViewMatrix.mul(vec4(p.add(uCam), 1.0));
  const vA = varying(smoothstep(uBox.mul(0.5), uBox.mul(0.15), length(p)), 'vDA'), px = clamp(uScale.mul(1.1).div(max(1.0, mv.z.negate())), 1.0, 3.2);
  const m = fxMaterial(); m.vertexNode = pointSpriteClip(mv.xyz, px, positionLocal.xy);
  m.colorNode = Fn(() => { const d = length(uv().sub(0.5)); return vec4(vec3(0.75, 0.85, 1.0).mul(smoothstep(0.5, 0.1, d)).mul(vA).mul(0.8), 1.0); })();
  m.uniforms = { uCam, uBox, uScale }; return m;
}

/* ───────── 天空：烘焙成立方體貼圖（只算一次），遊戲中每幀只做一次取樣 ───────── */
const skyColor = Fn(([d]) => {
  const col = mix(vec3(0.010, 0.014, 0.036), vec3(0.030, 0.020, 0.070), d.y.mul(0.5).add(0.5)).toVar();
  const n1 = fbm3(d.mul(1.7)), n2 = fbm3(d.mul(3.4).add(7.3));
  const neb = smoothstep(0.45, 0.85, n1).mul(smoothstep(0.35, 0.8, n2));
  const nc = mix(vec3(0.42, 0.10, 0.55), vec3(0.78, 0.12, 0.26), smoothstep(0.3, 0.9, fbm3(d.mul(2.1).add(3.0)))).toVar();
  nc.assign(mix(nc, vec3(0.10, 0.28, 0.78), smoothstep(0.55, 0.85, fbm3(d.mul(1.3).add(11.0)))));
  col.addAssign(nc.mul(neb).mul(0.55));
  const bt = dot(d, normalize(vec3(0.3, 0.8, 0.5))).mul(5.0), band = exp(bt.mul(bt).negate()), dust = fbm3(d.mul(6.0).add(2.0));
  col.addAssign(vec3(0.50, 0.45, 0.70).mul(band).mul(float(0.10).add(dust.mul(dust).mul(0.35))).mul(0.9));
  return pow(col, vec3(2.2)).mul(1.25);   // 線性管線：顯示色 → 線性
});
export function bakeSkyCube(renderer, size) {
  const m = new W.MeshBasicNodeMaterial({ side: W.BackSide, fog: false }); m.toneMapped = false; m.colorNode = skyColor(normalize(positionLocal));
  const s = new W.Scene(); s.add(new W.Mesh(new W.SphereGeometry(10, 48, 32), m));
  const rt = new W.CubeRenderTarget(size, { type: W.HalfFloatType }), cc = new W.CubeCamera(0.1, 100, rt);
  const prev = [renderer.getRenderTarget(), renderer.autoClear]; cc.update(renderer, s); renderer.setRenderTarget(prev[0]);
  return rt.texture;
}
export function skyMaterial(cubeTex) {
  const uDoom = uniform(0), uTime = uniform(0), c = cubeTexture(cubeTex, normalize(positionLocal));
  const m = new W.MeshBasicNodeMaterial({ side: W.BackSide, depthWrite: false, fog: false }); m.toneMapped = false;
  m.colorNode = vec4(mix(c.rgb, c.rgb.mul(vec3(1.7, 0.45, 0.55)).add(vec3(0.07, 0.0, 0.02)), uDoom), 1.0);
  m.uniforms = { uDoom, uTime }; return m;
}

/* ───────── 護盾泡泡（六角格 + 命中漣漪） ───────── */
const hexd = Fn(([p_]) => { const p = abs(p_); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); });
const hexLine = Fn(([uv_]) => {
  const r = vec2(1.0, 1.7320508), h = r.mul(0.5), a = mod(uv_, r).sub(h), b = mod(uv_.sub(h), r).sub(h);
  const gv = select(dot(a, a).lessThan(dot(b, b)), a, b);
  return oneMinus(smoothstep(0.0, 0.085, float(0.5).sub(hexd(gv))));
});
export function shieldMaterial() {
  const uCol = uniform(new W.Vector3(0.3, 0.6, 1)), uTime = uniform(0), uFade = uniform(0), uBreak = uniform(0);
  const uH0 = uniform(new W.Vector4(0, 0, 1, -1)), uH1 = uniform(new W.Vector4(0, 0, 1, -1)), uH2 = uniform(new W.Vector4(0, 0, 1, -1));
  const vObj = varying(positionLocal, 'vShO'), vN = varying(normalView, 'vShN'), vV = varying(positionView.negate(), 'vShV');
  const ripple = Fn(([n, hh]) => {
    const age = uTime.sub(hh.w), d = acos(clamp(dot(n, hh.xyz), -1.0, 1.0));
    const ring = exp(pow(d.sub(age.mul(2.2)).mul(5.5), 2.0).negate()).mul(oneMinus(age.div(1.2))), flash = exp(d.mul(d).mul(-9.0)).mul(max(0.0, oneMinus(age.div(0.45))));
    return select(hh.w.lessThan(0.0).or(age.lessThan(0.0)).or(age.greaterThan(1.2)), float(0.0), ring.mul(1.6).add(flash.mul(2.2)));
  });
  const m = fxMaterial();
  m.colorNode = Fn(() => {
    const n = normalize(vObj), fres = pow(oneMinus(abs(dot(normalize(vN), normalize(vV)))), 2.2);
    const uvh = vec2(atan(n.z, n.x).div(6.2832).mul(46.0), asin(clamp(n.y, -1.0, 1.0)).div(3.1416).mul(23.0)), hx = hexLine(uvh);
    const rp = ripple(n, uH0).add(ripple(n, uH1)).add(ripple(n, uH2));
    const e = fres.mul(0.55).add(hx.mul(float(0.12).add(rp.mul(1.6)))).add(rp.mul(0.5)).add(uBreak.mul(float(0.6).add(fres.mul(1.5))));
    const col = uCol.mul(e).mul(uFade);
    return vec4(mix(col, vec3(1.0).mul(e).mul(uFade), clamp(uBreak, 0.0, 1.0).mul(0.5)), 1.0);
  })();
  m.uniforms = { uCol, uTime, uFade, uBreak, uH0, uH1, uH2 }; return m;
}

/* ───────── 莫比烏斯環（光帶本體 / 外圈光暈） ───────── */
export function mobiusMaterial(halo) {
  const uTime = uniform(0), vUv = varying(uv(), 'vMU'), vD = varying(length(positionView), 'vMD');
  const m = fxMaterial();
  m.colorNode = Fn(() => {
    const a = abs(vUv.y), u = vUv.x;
    const flow = pow(sin(u.mul(6.2832 * 7.0).sub(uTime.mul(0.7))).mul(0.5).add(0.5), 6.0), flow2 = pow(sin(u.mul(6.2832 * 3.0).add(uTime.mul(0.35))).mul(0.5).add(0.5), 4.0);
    const fade = smoothstep(300.0, 2200.0, vD);
    if (halo) return vec4(vec3(0.45, 0.3, 1.0).mul(float(0.7).add(flow2.mul(0.5))).mul(exp(a.mul(a).mul(-2.2))).mul(0.11).mul(fade), 1.0);
    const edge = smoothstep(0.9, 0.99, a).add(smoothstep(0.6, 0.9, a).mul(0.25)), core = exp(a.mul(a).mul(-40.0));
    const col = mix(vec3(0.22, 0.2, 0.9), vec3(0.55, 0.3, 0.95), a).mul(float(0.3).add(flow2.mul(0.35))).add(vec3(0.9, 1.25, 2.3).mul(edge).mul(float(0.8).add(flow.mul(0.7)))).add(vec3(0.4, 0.3, 0.7).mul(core).mul(0.35));
    return vec4(col.mul(fade), 1.0);
  })();
  m.uniforms = { uTime }; return m;
}

/* ───────── 菲涅爾球殼（末日衝擊波 / 螺絲咕姆爆炸殼） ───────── */
export function fresnelShellMaterial(kind) {
  const uA = uniform(1), vN = varying(normalView, 'vFN'), vV = varying(positionView.negate(), 'vFV');
  const m = fxMaterial();
  m.colorNode = Fn(() => {
    const f = pow(oneMinus(abs(dot(normalize(vN), normalize(vV)))), kind === 'wave' ? 2.2 : 2.0);
    if (kind === 'wave') return vec4(mix(vec3(4.0, 0.7, 1.0), vec3(8.0, 7.0, 7.0), f).mul(float(0.05).add(f.mul(1.1))).mul(uA), 1.0);
    return vec4(vec3(5.0, 3.6, 1.0).mul(float(0.06).add(f)).mul(uA), 1.0);
  })();
  m.uniforms = { uA }; return m;
}

/* ───────── 標準材質的擴充（面板接縫 / 艦體損傷 / 鐵墓輪廓光） ───────── */
const _conv = new Map();
export function toNode(renderer, m) {   // 把 GLB 載入的標準材質轉成節點材質（同一個只轉一次）
  if (_conv.has(m)) return _conv.get(m);
  const nm = m.isNodeMaterial ? m : renderer.library.fromMaterial(m);
  _conv.set(m, nm); return nm;
}
export function panelize(nm, panelK) {
  if (!panelK) return nm;
  const pq = positionLocal.mul(panelK), pd = vec3(0.5).sub(abs(fract(pq).sub(0.5))), pw = fwidth(pq);
  const pm = oneMinus(smoothstep(vec3(0.0), vec3(0.03).add(pw.mul(1.5)), pd));
  const pl = max(pm.x, max(pm.y, pm.z)).mul(oneMinus(smoothstep(0.25, 0.55, max(pw.x, max(pw.y, pw.z)))));
  const ph = hash3(floor(pq.add(0.001))), shade = float(0.86).add(ph.mul(0.28)).mul(oneMinus(pl.mul(0.5)));
  nm.colorNode = (nm.colorNode || materialColor).mul(vec4(shade, shade, shade, 1.0));
  return nm;
}
const dmgTime = uniform(0);
export const damageTime = dmgTime;
export function damageize(nm) {   // 每個實例的 aDmg（0~1）：艦體燒黑，裂縫發出熔岩般的橘光
  const dmg = attribute('aDmg', 'float'), vDmg = varying(dmg, 'vDmg');
  const n1 = fbm3(positionLocal.mul(0.55));
  const shade = oneMinus(smoothstep(0.05, 0.85, vDmg).mul(float(0.3).add(n1.mul(0.7))).mul(0.88));
  const cr0 = oneMinus(abs(fbm3(positionLocal.mul(0.42).add(3.1)).mul(2.0).sub(1.0)));
  const cr = smoothstep(0.9, 0.985, cr0.mul(float(0.75).add(fbm3(positionLocal.mul(1.3)).mul(0.25))));
  const pulse = sin(dmgTime.mul(5.0).add(positionLocal.x.mul(0.4))).mul(0.25).add(0.75);
  nm.colorNode = (nm.colorNode || materialColor).mul(vec4(shade, shade, shade, 1.0));
  nm.emissiveNode = (nm.emissiveNode || materialEmissive).add(vec3(3.2, 0.7, 0.1).mul(cr).mul(smoothstep(0.3, 0.8, vDmg)).mul(pulse));
  return nm;
}
export function tombize(nm, albedoK) {   // 鐵墓：本體壓暗，只留一圈紅色菲涅爾輪廓光
  const rim = pow(oneMinus(clamp(dot(normalize(normalView), normalize(positionView.negate())), 0.0, 1.0)), 3.4);
  nm.colorNode = (nm.colorNode || materialColor).mul(vec4(albedoK, albedoK, albedoK, 1.0));
  nm.emissiveNode = (nm.emissiveNode || vec3(0)).add(vec3(3.0, 0.12, 0.24).mul(rim).mul(0.85));
  return nm;
}

/* ───────── v3：艦艇斷面熔融材質（對應 Godot 的 ship_break.gdshader 熔融部分）：近黑底＋餘燼熱點自發光，uBurn 由 1 降到 0 ───────── */
export function breakMaterial(ember) {
  const uBurn = uniform(1.0);
  const m = new W.MeshStandardNodeMaterial({ color: 0x120f0e, roughness: 0.95, metalness: 0.25, side: W.DoubleSide });
  const n = fbm3(positionLocal.mul(0.9).add(vec3(3.1, 1.7, 5.3))), n2 = fbm3(positionLocal.mul(2.6).add(vec3(8.0, 8.0, 8.0)));
  const hot = smoothstep(0.42, 0.78, n.mul(0.7).add(n2.mul(0.4)));
  const flick = float(0.88).add(sin(damageTime.mul(7.0).add(n.mul(25.0))).mul(0.12));
  m.emissiveNode = vec3(ember[0], ember[1], ember[2]).mul(float(0.25).add(hot.mul(2.4))).mul(flick).mul(uBurn).mul(2.2);
  m.uniforms = { uBurn };
  return m;
}
