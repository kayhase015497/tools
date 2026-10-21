/* tsl-lib.js — 共用的 TSL（Three.js 著色語言）積木：雜訊、fbm、公告板
 * TSL 會依後端自動轉成 WGSL（WebGPU）或 GLSL（WebGL2 備援），所以同一份程式兩邊都能跑。 */
import { Fn, float, vec2, vec3, vec4, floor, fract, mix, dot, Loop, abs, max, min, clamp, smoothstep, length, cameraProjectionMatrix, viewportSize, positionLocal, modelViewMatrix } from 'three/tsl';

export const hash3 = Fn(([p_]) => {
  const p = fract(p_.mul(0.3183099).add(0.1)).toVar(); p.mulAssign(17.0);
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
});
export const vnoise3 = Fn(([x]) => {
  const i = floor(x), f = fract(x).toVar(); f.assign(f.mul(f).mul(float(3).sub(f.mul(2.0))));
  const h = (o) => hash3(i.add(o));
  return mix(
    mix(mix(h(vec3(0, 0, 0)), h(vec3(1, 0, 0)), f.x), mix(h(vec3(0, 1, 0)), h(vec3(1, 1, 0)), f.x), f.y),
    mix(mix(h(vec3(0, 0, 1)), h(vec3(1, 0, 1)), f.x), mix(h(vec3(0, 1, 1)), h(vec3(1, 1, 1)), f.x), f.y), f.z);
});
export const fbm3 = Fn(([p_]) => {
  const p = p_.toVar(), a = float(0.5).toVar(), s = float(0).toVar();
  Loop(5, () => { s.addAssign(a.mul(vnoise3(p))); p.assign(p.mul(2.03).add(vec3(1.7, 9.2, 3.1))); a.mulAssign(0.5); });
  return s;
});

export const h21 = Fn(([p_]) => { const p = fract(p_.mul(vec2(123.34, 456.21))).toVar(); p.addAssign(dot(p, p.add(45.32))); return fract(p.x.mul(p.y)); });
export const vn2 = Fn(([p]) => {
  const i = floor(p), f = fract(p).toVar(); f.assign(f.mul(f).mul(float(3).sub(f.mul(2.0))));
  return mix(mix(h21(i), h21(i.add(vec2(1, 0))), f.x), mix(h21(i.add(vec2(0, 1))), h21(i.add(vec2(1, 1))), f.x), f.y);
});
export const fbm2 = Fn(([p_]) => {
  const p = p_.toVar(), a = float(0.5).toVar(), s = float(0).toVar();
  Loop(4, () => { s.addAssign(a.mul(vn2(p))); p.assign(p.mul(2.03).add(vec2(1.7, 9.2))); a.mulAssign(0.5); });
  return s;
});

/** 螢幕像素大小 → 裁切空間偏移：回傳 clip 座標（粒子／光暈用，行為等同 gl_PointSize 的「方形點精靈」）
 *  viewPos = 視圖空間中心點，sizePx = 直徑（像素），quad = 平面座標（-0.5~0.5） */
export const pointSpriteClip = Fn(([viewPos, sizePx, quad]) => {
  const clip = cameraProjectionMatrix.mul(vec4(viewPos, 1.0)).toVar();
  const off = quad.mul(sizePx).mul(2.0).div(viewportSize);
  clip.xy.addAssign(off.mul(clip.w));
  return clip;
});
