/* post.js — v2 後處理管線（TSL RenderPipeline）
 *
 *   主場景 → 駕駛艙疊層 → 泛光 → 電影感（體積光＋橫向拉絲光＋鏡頭鬼影，1/4 解析度）→ 最終合成
 *   最終合成：色差 → ACES → 色彩分級 → 暈邊 → 受傷紅暈 → 底片顆粒 → sRGB 編碼
 *
 * 介面與 v1 的 FPVPost.create 相同（battle-render 幾乎不用改）：
 *   post.composer.render() / post.cockpit.enabled / post.bloom.enabled / post.cinema.enabled / post.cinema.u.* / post.u.* / post.setSize(W,H)
 */
import * as W from 'three/webgpu';
import { pass, rtt, uniform, uv, vec2, vec3, vec4, float, Fn, Loop, mix, smoothstep, clamp, max, min, abs, exp, dot, length, pow, step, fract, select, oneMinus, viewportSize, luminance } from 'three/tsl';
import { bloom as bloomNode } from 'three/addons/tsl/display/BloomNode.js';

const LUMW = vec3(0.3, 0.55, 0.15);
const aces = Fn(([x]) => { const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp(x.mul(x.mul(a).add(b)).div(x.mul(x.mul(c).add(d)).add(e)), 0.0, 1.0); });
const enc = Fn(([c_]) => { const c = max(c_, 0.0); return mix(c.mul(12.92), pow(c, vec3(1.0 / 2.4)).mul(1.055).sub(0.055), step(0.0031308, c)); });
const hash = Fn(([p_]) => { const p = fract(p_.mul(vec2(443.897, 441.423))).toVar(); p.addAssign(dot(p, p.yx.add(19.19))); return fract(p.x.add(p.y).mul(p.x)); });

export function createPost(renderer, scene, camera, cockScene, cockCam, o) {
  o = o || {};
  const u = {
    uTime: uniform(0), uExposure: uniform(1.0), uCA: uniform(0.0011), uVig: uniform(0.42), uGrain: uniform(0.03), uSpeed: uniform(0), uHurt: uniform(0), uSat: uniform(1.12), uContrast: uniform(1.07), uCinema: uniform(o.cinema ? 1 : 0)
  };
  const uCockOn = uniform(1);
  const sp = pass(scene, camera, { samples: o.samples || 0 }), cp = pass(cockScene, cockCam);
  const sceneTex = sp.getTextureNode('output'), cockTex = cp.getTextureNode('output');
  const baseAt = (uvN) => { const s = sceneTex.sample(uvN), c = cockTex.sample(uvN); return mix(s.rgb, c.rgb, c.a.mul(uCockOn)); };

  // ── 泛光：v1 的泛光暫存是 8-bit（亮度夾在 0~1），先沿用 → 階段 C 再改成 HDR ──
  const bThr = uniform(o.threshold != null ? o.threshold : 0.9);
  let bloomPass = null, bloomTexNode = vec3(0);
  if (o.bloom !== false) {
    const b0 = baseAt(uv()), lum = dot(b0, LUMW);
    const bright = b0.mul(smoothstep(bThr, bThr.add(0.01), lum)).min(1.0);
    bloomPass = bloomNode(vec4(bright, 1.0), o.strength != null ? o.strength : 0.75, o.radius != null ? o.radius : 0.7, 0.0);
    bloomTexNode = bloomPass.rgb;
  }
  const bloomStrength = bloomPass ? bloomPass.strength : null;

  // ── 電影感：全部在 1/4 解析度的小圖上算，最後以雙線性放大疊回 ──
  const cu = { uLight: uniform(new W.Vector2(0.5, 0.5)), uInt: uniform(0), uStreak: uniform(o.streak != null ? o.streak : 0.4), uGhost: uniform(o.ghost != null ? o.ghost : 0.3), uThrG: uniform(4.5), uThrS: uniform(2.6), uThrR: uniform(1.3), uTint: uniform(new W.Vector3(1.0, 0.35, 0.5)) };
  let small = null, cinRtt = null, cinNode = vec3(0);
  const cinemaState = { enabled: !!o.cinema, u: cu };
  if (o.cinema) {
    const px = renderer.getPixelRatio(), qw = Math.max(1, ((o.width || innerWidth) * px / 4) | 0), qh = Math.max(1, ((o.height || innerHeight) * px / 4) | 0);
    small = rtt(Fn(() => { const t = vec2(1.5).div(viewportSize); const g = (a, b) => baseAt(uv().add(vec2(a, b).mul(t))); return vec4(min(g(-1, -1).add(g(1, -1)).add(g(-1, 1)).add(g(1, 1)).mul(0.25), 40.0), 1.0); })(), qw, qh);
    const bt = (uvN, t) => { const c = small.sample(uvN).rgb, l = dot(c, LUMW); return c.mul(smoothstep(t, t.add(2.0), l)); };
    const aspect = uniform((o.width || innerWidth) / (o.height || innerHeight)), texS = uniform(new W.Vector2(1 / qw, 1 / qh));
    cinemaState.texS = texS; cinemaState.aspect = aspect;
    const cin = Fn(() => {
      const add = vec3(0).toVar(), vUv = uv();
      // 體積光：朝光源方向做徑向取樣
      const d = cu.uLight.sub(vUv), dist = length(d), stp = d.div(28.0).mul(0.92), p = vUv.toVar(), w = float(1.0).toVar(), acc = vec3(0).toVar();
      Loop(28, () => { p.addAssign(stp); acc.addAssign(bt(p, cu.uThrR).mul(w)); w.mulAssign(0.93); });
      add.addAssign(cu.uTint.mul(dot(acc.div(28.0), LUMW)).mul(2.2).mul(cu.uInt).mul(exp(dist.mul(-1.6))));
      // 藍色橫向拉絲光
      const s = vec3(0).toVar(), ws = float(0).toVar();
      Loop({ start: -12, end: 13, type: 'int', condition: '<' }, ({ i }) => { const f = float(i), wg = exp(abs(f).mul(-0.2)); s.addAssign(bt(vUv.add(vec2(f.mul(texS.x).mul(1.5), 0.0)), cu.uThrS).mul(wg)); ws.addAssign(wg); });
      s.divAssign(ws); add.addAssign(vec3(0.35, 0.6, 1.0).mul(dot(s, LUMW)).add(s.mul(0.35)).mul(cu.uStreak).mul(2.2));
      // 鏡頭鬼影
      const c = vUv.sub(0.5), g = vec3(0).toVar();
      const cols = [vec3(0.5, 0.7, 1.0), vec3(1.0, 0.5, 0.45), vec3(0.5, 1.0, 0.7)];
      for (let i = 1; i <= 3; i++) { const uvg = vec2(0.5).add(c.mul(-0.4 * i)), edge = smoothstep(0.55, 0.15, length(uvg.sub(0.5).mul(vec2(aspect, 1.0)))); g.addAssign(bt(uvg, cu.uThrG).mul(cols[i - 1]).mul(edge).mul(0.55 / i)); }
      add.addAssign(g.mul(cu.uGhost).mul(1.4));
      return vec4(add, 1.0);
    })();
    cinRtt = rtt(cin, qw, qh); cinNode = cinRtt.rgb;
    cinemaState.rtts = [small, cinRtt];
  }

  // ── 最終合成 ──
  const rp = new W.RenderPipeline(renderer); rp.outputColorTransform = false;
  rp.outputNode = Fn(() => {
    const vUv = uv(), c = vUv.sub(0.5), r2 = dot(c, c), ca = u.uCA.mul(float(0.35).add(r2.mul(3.2))).mul(float(1.0).add(u.uHurt.mul(2.5)));
    const acc = vec3(baseAt(vUv.sub(c.mul(ca))).r, baseAt(vUv).g, baseAt(vUv.add(c.mul(ca))).b).toVar();
    acc.addAssign(bloomTexNode); if (o.cinema) acc.addAssign(cinNode.mul(u.uCinema));
    const col = aces(acc.mul(u.uExposure)).toVar(), l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col.assign(mix(col, col.mul(vec3(0.90, 1.0, 1.12)), oneMinus(smoothstep(0.0, 0.45, l))));
    col.assign(mix(col, col.mul(vec3(1.07, 1.0, 0.92)), smoothstep(0.45, 1.0, l)));
    col.assign(mix(vec3(l), col, u.uSat));
    col.assign(col.sub(0.5).mul(u.uContrast).add(0.5));
    const rr = length(c).mul(1.28);
    col.mulAssign(oneMinus(u.uVig.mul(smoothstep(0.3, 1.0, rr))));
    col.addAssign(vec3(0.30, 0.02, 0.04).mul(u.uHurt).mul(smoothstep(0.3, 1.0, rr)));
    col.addAssign(hash(vUv.mul(viewportSize).add(fract(u.uTime).mul(91.7))).sub(0.5).mul(u.uGrain));
    return vec4(enc(col), 1.0);
  })();

  const post = {
    composer: { render() { rp.render(); } },
    bloom: { get enabled() { return bloomStrength ? bloomStrength.value > 0 : false; }, set enabled(v) { if (bloomStrength) bloomStrength.value = v ? (o.strength != null ? o.strength : 0.75) : 0; } },
    cockpit: { get enabled() { return uCockOn.value > 0; }, set enabled(v) { uCockOn.value = v ? 1 : 0; } },
    cinema: { get enabled() { return cinemaState.enabled; }, set enabled(v) { cinemaState.enabled = v; u.uCinema.value = v ? 1 : 0; }, u: cu },
    final: { uniforms: u }, u,
    setSize(Wd, Hd) {
      if (!small) return; const pr = renderer.getPixelRatio(), qw = Math.max(1, (Wd * pr / 4) | 0), qh = Math.max(1, (Hd * pr / 4) | 0);
      cinemaState.rtts.forEach((t) => t.setSize(qw, qh)); cinemaState.texS.value.set(1 / qw, 1 / qh); cinemaState.aspect.value = Wd / Hd;
    }
  };
  if (!o.cinema) post.cinema = null;
  return post;
}
