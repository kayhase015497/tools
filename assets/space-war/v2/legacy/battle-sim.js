/* battle-sim.js — 模擬層：艦艇資料、AI、命令、預警機資料鏈、彈道與傷害、玩家飛行、角色切換、劇本導演
 *
 * 模擬層只保存純資料，畫面由 SWFleet／SWFx 負責；介面（HUD、輸入、字幕、無線電）在 battle-ui.js。
 * 與介面的接口：say(en, zh, warn)、radioSay(unit, category)、flash(a, blue)、setCenter(msg, on)、uiFlash(...)。
 */
'use strict';
const player = { ship: null, orig: null, q: new THREE.Quaternion(), pos: new THREE.Vector3(0, 80, 3400), vel: new THREE.Vector3(), w: new THREE.Vector3(),
  thr: 0.45, boost: false, energy: 100, heat: 100, shield: 300, shieldMax: 300, hull: 400, hullMax: 400, missiles: 8, mslT: 0, lastHit: -99, assist: true, invert: false,
  target: null, suggest: null, fireCd: 0, mslCd: 0, supCd: 0, dead: false, respawn: 0, kills: 0 };
const input = { keys: {}, mx: 0, my: 0, lmb: false, rmb: false };
let nameN = 0, ironDmg = 0, nextWave = 8, nextReinf = 25, nextLaunch = 6, reinfN = 0, lastAlloc = 0, allocN = 0;
const IRON_K = 1.4e6;
G.waveR = 0; G.impacted = false; G.flashed = false; G.awacsPending = 0; G.enemyHp = 1; G.enemyDmg = 1;
const TOMB_T = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rad: 700, hp: 1e9, hpMax: 1e9, dead: false, isTomb: true, d: { hp: 1e9, name: 'Irontomb', cls: 'cap' }, kind: 'tomb' };
const FWD = (s, out) => { const cp = Math.cos(s.p); return out.set(Math.sin(s.h) * cp, Math.sin(s.p), Math.cos(s.h) * cp); };

/* ═════════ 艦艇與生成 ═════════ */
function mkShip(kind, x, y, z, h, o) {
  const d = DEF[kind], s = Object.assign({ kind, d, side: d.side, hp: d.hp, hpMax: d.hp, x, y, z, h: h || 0, p: 0, roll: 0, sx: 1, ph: rnd(0, 100), thr: 0.6,
    scale: d.sc * (o && o.k ? o.k : 1), rad: d.rad * (o && o.k ? o.k : 1), vx: 0, vy: 0, vz: 0, cd: rnd(0, d.cd || 1), hx: x, hy: y, hz: z, tgt: null, mode: 0, mt: 0, id: ++nameN, cs: makeCallsign(kind), order: null, awTgt: null, sh: d.shield || 0, shMax: d.shield || 0, shT: -99, shDown: 0, shBreakT: -99, hits: [], dmgFx: rnd(0, 1) }, o || {});
  (d.side === 'a' ? allies : enemies).push(s); return s;
}
/* 聯軍集中在鐵墓的同一側對陣（球冠形立體分布：方位角 ±SIDE_AZ、俯仰各層錯開，不擺在同一平面）；敵軍自鐵墓外圍湧出 */
const SIDE_AZ = 1.0;
function ringPos(r, az, pitch) { return [TOMB_POS.x + r * Math.cos(pitch) * Math.sin(az), TOMB_POS.y + r * Math.sin(pitch), TOMB_POS.z + r * Math.cos(pitch) * Math.cos(az)]; }
function faceTomb(s) { const dx = TOMB_POS.x - s.x, dy = TOMB_POS.y - s.y, dz = TOMB_POS.z - s.z; s.h = Math.atan2(dx, dz); s.p = Math.atan2(dy, Math.hypot(dx, dz)); }
function mkFighter(kind, x, y, z, h) { const s = mkShip(kind, x, y, z, h); s.spd = DEF[kind].spd * rnd(0.85, 1.1); s.vx = Math.sin(h) * s.spd; s.vz = Math.cos(h) * s.spd; if (kind === 'fly') { s.hp = s.hpMax = s.d.hp * G.enemyHp; } return s; }
function mkRing(kind, r, az, pitch, o) { const q = ringPos(r, az, pitch), s = kind === 'fgt' ? mkFighter(kind, q[0], q[1], q[2], 0) : mkShip(kind, q[0], q[1], q[2], 0, o); faceTomb(s); if (kind === 'fgt') { FWD(s, V); s.vx = V.x * s.spd; s.vy = V.y * s.spd; s.vz = V.z * s.spd; } s.hx = s.x; s.hy = s.y; s.hz = s.z; return s; }
const FSC = () => G.fleetScale || 1;   // v2：艦隊規模倍率（F9 切換 ×1~×5；初始艦隊需重新開始才會套用，增援與敵軍波次即時生效）
function spawnFleet() {
  const S = FSC();
  mkRing('hss', 8200, 0, 0.05, { cd: 1.5 });
  mkRing('xzd', 8900, 0.4, -0.06, { cd: 2 });   // 仙舟聯盟的無畏艦：比黑塔空間站更大，停在空間站側翼
  [[-0.85, 0.35], [0.8, -0.3], [0.05, 0.62]].forEach((m) => mkRing('moon', 9500, m[0], m[1]));
  for (let i = 0; i < 6 + (S - 1) * 3; i++) mkRing('cap', 7200 + (i >= 6 ? rnd(-600, 900) : 0), -0.9 + (i + 0.5) * (1.8 / (6 + (S - 1) * 3)), (i % 2 ? -1 : 1) * rnd(0.1, 0.45));
  for (let i = 0; i < 10 * S; i++) mkRing(i % 2 ? 'ipc' : 'cruis', rnd(5800, 8400), -SIDE_AZ + (i + 0.5) * (2 * SIDE_AZ / (10 * S)) + rnd(-0.1, 0.1), rnd(-0.7, 0.7));
  for (let i = 0; i < 24 * S; i++) mkRing('frig', rnd(5200, 9000), rnd(-SIDE_AZ, SIDE_AZ), rnd(-0.8, 0.8));
  const caps = allies.filter((s) => s.d.hp > 1000);
  for (let i = 0; i < 30 * S; i++) { const c = caps[i % caps.length], f = mkFighter('fgt', c.x + rnd(-700, 700), c.y + rnd(-500, 500), c.z + rnd(-700, 700), 0); faceTomb(f); FWD(f, V); f.vx = V.x * f.spd; f.vy = V.y * f.spd; f.vz = V.z * f.spd; f.hx = f.x; f.hy = f.y; f.hz = f.z; }
  mkRing('awacs', 10800, 0.1, 0.15);
  // 玩家的初始戰機（指揮官模式下由 AI 駕駛）：HSS 旁
  const o = mkRing('fgt', 7400, 0.25, 0.05); o.thr = 0.5; player.orig = player.ship = o; o.isOrig = true;
}
function halton(i, b) { let f = 1, r = 0; i = i + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
/* 反物質軍團的「黑洞閃現」：虛空中先撕開一個黑色漩渦（深黑煙團＋紫色吸積環＋向內捲入的紫色火星與光束），約 0.6~0.9 秒後艦艇從中擠出，紫白閃光與衝擊環爆開 */
function voidIn(make, x, y, z, big) {
  const R = big ? 1500 : 360, T1 = big ? 0.95 : 0.6, nIn = big ? 46 : 9;
  for (let k = 0; k < (big ? 5 : 1); k++) fx.smoke(x + rnd(-0.08, 0.08) * R, y + rnd(-0.08, 0.08) * R, z + rnd(-0.08, 0.08) * R, 0, 0, 0, R * 0.12, R * rnd(0.55, 0.85), T1 + 0.55, [0.01, 0.0, 0.025], 0, 3.0);   // 黑洞本體
  fx.emit(x, y, z, 0, 0, 0, 0.7, 0.25, 1.0, R * (big ? 1.5 : 2.2), T1 + 0.1, 0, 2, 1.1);                                  // 紫色吸積環（外擴的環）
  if (big) fx.emit(x, y, z, 0, 0, 0, 0.5, 0.12, 0.9, R * 0.9, T1, 0, 0, 0.3);                               // 淡淡的紫色光暈（只有大型艦）
  for (let i = 0; i < nIn; i++) {                                                                           // 向內捲入的粒子：從球面朝中心加速收斂
    const a = rnd(0, TAU), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), rr = R * rnd(1.1, 2.0), px = Math.cos(a) * c, py = u, pz = Math.sin(a) * c, life = T1 * rnd(0.65, 0.95), tw = 0.9;
    fx.emit(x + px * rr, y + py * rr, z + pz * rr, -px * rr / life + -pz * rr * tw / life, -py * rr / life, -pz * rr / life + px * rr * tw / life, 0.7, 0.3, 1.0, Math.max(2.5, R * 0.018), life, 0);
  }
  if (big) for (let i = 0; i < 10; i++) { const a = rnd(0, TAU), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), L = R * rnd(2.2, 3.6); fx.beam(x + Math.cos(a) * c * L, y + u * L, z + Math.sin(a) * c * L, x, y, z, { color: [0.65, 0.25, 1], width: R * 0.012, dur: T1 * 0.9, len: L * 0.4 }); }   // 光束匯聚
  fx.later(T1, () => {
    const s = make(); if (!s) return;
    fx.emit(x, y, z, 0, 0, 0, 0.9, 0.7, 1, R * 1.6, 0.45, 0, 0, 1.3);                                      // 紫白閃光
    fx.emit(x, y, z, 0, 0, 0, 0.75, 0.3, 1, R * 2.2, 0.7, 0, 2, 5.5);                                       // 衝擊環
    if (fx.fire) fx.fire(x, y, z, 0, 0, 0, R * 0.2, R * 0.9, 0.5, [0.7, 0.25, 1.0], 0, 0.9);
    if (big) { boomLight(x, y, z, 5, [0.7, 0.35, 1]); } else if (Math.random() < 0.2) boomLight(x, y, z, 1.2, [0.7, 0.35, 1]);
    for (let i = 0; i < (big ? 18 : 3); i++) { const a = rnd(0, TAU), u = rnd(-1, 1), c = Math.sqrt(1 - u * u), sp = R * rnd(0.6, 1.8); fx.emit(x, y, z, Math.cos(a) * c * sp, u * sp, Math.sin(a) * c * sp, 0.75, 0.4, 1, Math.max(2, R * 0.015), rnd(0.4, 0.9), 1.5); }
  });
}
function spawnWave() {
  G.wave++;
  const w = G.wave, S = FSC(), nW = Math.round((Math.min(2 + Math.floor(w / 2), 8) + (G.mode === 'free' ? Math.min(4, Math.floor(w / 3)) : 0)) * (1 + (S - 1) * 0.8)), nF = Math.round((Math.min(14 + w * 4, 70) + (G.mode === 'free' ? Math.min(30, w * 2) : 0)) * S);
  const live = enemies.filter((e) => e.kind === 'whale').length, liveF = enemies.length - live;
  // v2：敵軍增援均勻分布在「鐵墓與聯軍陣線之間」的整個正面空間，Halton 序列（低差異點）保證不會擠成一團，高度（Y 軸）從 -0.85 到 +0.85 弧度都用上
  const off = (Math.random() * 1000) | 0, hss0 = allies.find((a) => a.kind === 'hss' && !a.dead), fx0 = hss0 ? hss0.x : 0, fy0 = hss0 ? hss0.y : TOMB_POS.y, fz0 = hss0 ? hss0.z : TOMB_POS.z + 8200;
  const spot = (i, r0, r1) => {
    const az = -1.2 + 2.4 * halton(off + i, 2), pit = -0.85 + 1.7 * halton(off + i, 3), r = r0 + (r1 - r0) * halton(off + i, 5), q = ringPos(r, az, pit);
    return { x: q[0], y: q[1], z: q[2], h: Math.atan2(fx0 - q[0], fz0 - q[2]) };
  };
  const nWmax = (G.mode === 'free' ? 22 : 16) * (1 + (S - 1) * 0.8), nFmax = (G.mode === 'free' ? 140 : 110) * S;
  for (let i = 0; i < nW && live + i < nWmax; i++) { const q = spot(i, 3400, 7600); voidIn(() => { const s = mkShip('whale', q.x, q.y, q.z, q.h, { k: rnd(0.8, 1.5) }); s.hp = s.hpMax = s.d.hp * (s.scale / s.d.sc) * G.enemyHp; return s; }, q.x, q.y, q.z, true); }
  for (let i = 0; i < nF && liveF + i < nFmax; i++) { const q = spot(i + 500, 3200, 7800); voidIn(() => { const s = mkFighter('fly', q.x, q.y, q.z, q.h); s.mode = 0; return s; }, q.x, q.y, q.z, false); }
  say('Antimatter Legion wave ' + w + ' tearing through the void', '反物質軍團第 ' + w + ' 波撕裂虛空而來', true);
}
function cnt(k) { let n = 0; for (let i = 0; i < allies.length; i++) if (allies[i].kind === k && !allies[i].dead) n++; return n; }
/* 折躍進場：一道白線自後方高速劃過，到達處閃光爆開，艦艇才現身（類似星戰的超光速躍出） */
function warpIn(make, x, y, z, big) {
  V.set(x - TOMB_POS.x, y - TOMB_POS.y, z - TOMB_POS.z).normalize();   // 從背離鐵墓的後方來
  const dx = V.x, dy = V.y, dz = V.z;
  const L = big ? 9000 : 6000, sx = x + dx * L, sy = y + dy * L + rnd(-300, 300), sz = z + dz * L, dur = big ? 0.55 : 0.4;
  fx.beam(sx, sy, sz, x, y, z, { color: [0.75, 0.88, 1], width: big ? 26 : 9, dur, len: L * 0.7 });
  fx.beam(sx, sy, sz, x, y, z, { color: [1, 1, 1], width: big ? 9 : 3, dur, len: L * 0.5 });
  fx.later(dur * 0.85, () => {
    const s = make(); if (!s) return;
    const R = big ? 2600 : 700;
    fx.emit(x, y, z, 0, 0, 0, 1, 1, 1, R * 2.4, 0.6, 0, 0, 1.4);                          // 躍出的白閃
    fx.emit(x, y, z, 0, 0, 0, 0.6, 0.8, 1, R * 1.1, 0.5, 0, 1);
    fx.emit(x, y, z, 0, 0, 0, 0.7, 0.85, 1, R * 0.6, 0.7, 0, 2, 7);                         // 擴散的衝擊環
    boomLight(x, y, z, big ? 6 : 2, [0.7, 0.85, 1]);
    if (big) FPVAudio.respawn();
    s.vx = -dx * s.d.spd * 2.5; s.vy = -dy * s.d.spd * 2.5; s.vz = -dz * s.d.spd * 2.5;   // 帶著衝勢滑入，再減速
    s.boostUntil = G.t + 15;
  });
}
/* 增援的集結點：就近挑一艘螺絲咕姆行星艦或黑塔空間站，在它周圍待命；折躍落點在它的後方（背離鐵墓） */
function rallyPoint(kind) {
  const anchors = allies.filter((a) => !a.dead && (a.kind === 'moon' || a.kind === 'hss'));
  if (!anchors.length) { const q = ringPos(rnd(6000, 8000), rnd(-SIDE_AZ, SIDE_AZ), rnd(-0.5, 0.5)); return { home: q, arrive: ringPos(12000, rnd(-SIDE_AZ, SIDE_AZ), rnd(-0.4, 0.4)) }; }
  const t = anchors[(Math.random() * anchors.length) | 0], rr = t.rad * 1.3 + (kind === 'fgt' ? rnd(300, 900) : rnd(500, 1500));
  const u = rnd(-0.5, 0.5), a = rnd(0, TAU), c = Math.sqrt(1 - u * u);
  const home = [t.x + Math.cos(a) * c * rr, t.y + u * rr, t.z + Math.sin(a) * c * rr];
  V.set(t.x - TOMB_POS.x, t.y - TOMB_POS.y, t.z - TOMB_POS.z).normalize();
  const back = t.rad + rnd(2800, 4200);
  return { home, arrive: [t.x + V.x * back + rnd(-600, 600), t.y + V.y * back + rnd(-600, 600), t.z + V.z * back + rnd(-600, 600)] };
}
function reinforce() {
  reinfN++; const S = FSC();
  const edge = (kind, big) => {
    const rp = rallyPoint(kind), q = rp.arrive, h = rp.home;
    warpIn(() => { const s = mkShip(kind, q[0], q[1], q[2], 0); faceTomb(s); s.hx = h[0]; s.hy = h[1]; s.hz = h[2]; s.rally = G.t + 30; return s; }, q[0], q[1], q[2], big);
  };
  if (reinfN % 2 === 0 && cnt('cruis') + cnt('ipc') < 22 * S) { for (let k = 0; k < S; k++) { edge('cruis', true); edge('ipc', true); } say('Cruiser squadron warping in, rallying to the Screwllum fleet and the station', '巡洋艦中隊折躍進場，向螺絲咕姆與空間站靠攏', false); }
  if (reinfN % 4 === 0 && cnt('cap') < 10 + (S - 1) * 4) { for (let k = 0; k < Math.max(1, S - 1); k++) edge('cap', true); say('Dreadnought warping in behind the line', '無畏艦自後方折躍馳援', false); }
  if (cnt('frig') < 46 * S) { for (let k = 0; k < 3 * S; k++) edge('frig', false); say('Alliance reinforcements warping in', '聯軍增援折躍抵達', false); }
  if (reinfN % 2 === 1 && allies.filter((u) => u.kind === 'fgt' && !u.dead && !u.isPlayer).length < 56 * S) {   // 一個戰機中隊
    const rp = rallyPoint('fgt');
    for (let k = 0; k < 6 * S; k++) { const q = [rp.arrive[0] + rnd(-500, 500), rp.arrive[1] + rnd(-400, 400), rp.arrive[2] + rnd(-500, 500)]; warpIn(() => { const f = mkFighter('fgt', q[0], q[1], q[2], 0); faceTomb(f); FWD(f, V3); f.vx = V3.x * f.spd * 2.5; f.vy = V3.y * f.spd * 2.5; f.vz = V3.z * f.spd * 2.5; f.thr = 0.8; return f; }, q[0], q[1], q[2], false); }
    say('Fighter wing warping in', '戰機中隊折躍進場', false);
  }
}
function launchFighters() {   // 從 HSS 機庫起飛的戰機：聯軍的空中戰力持續補充
  const live = allies.filter((s) => s.kind === 'fgt' && !s.dead && !s.isPlayer).length, hss = allies.find((s) => s.kind === 'hss' && !s.dead);
  if (!hss || live >= 36 * FSC()) return;
  V.set(hss.x - TOMB_POS.x, hss.y - TOMB_POS.y, hss.z - TOMB_POS.z).normalize();   // 機庫在 HSS 背向鐵墓的一側
  for (let k = 0; k < 3; k++) { const f = mkFighter('fgt', hss.x + V.x * 700 + rnd(-120, 120), hss.y + V.y * 700 + rnd(-60, 60), hss.z + V.z * 700 + rnd(-120, 120), 0); faceTomb(f); f.thr = 0.8; }
}

/* ═════════ 彈道、傷害、爆炸 ═════════ */
function fire(src, ox, oy, oz, dx, dy, dz, spd, dmg, w, len, col, life) {
  DBG.fired[src.kind] = (DBG.fired[src.kind] || 0) + 1;
  shots.push({ x: ox, y: oy, z: oz, vx: dx * spd, vy: dy * spd, vz: dz * spd, life: life || 3, dmg: src.side === 'e' ? dmg * G.enemyDmg : dmg, side: src.side, w, len, col, src, spd });
}
function impact(x, y, z, big, col) {
  if (!fx) return; const c = col || [1, 0.8, 0.5];
  fx.emit(x, y, z, 0, 0, 0, 1, 0.95, 0.85, big * 5, 0.09, 0, 0, 1.3);                      // 命中瞬間的亮閃
  fx.emit(x, y, z, 0, 0, 0, c[0], c[1], c[2], big * 14, 0.18, 0, 1);
  const n = 6 + Math.min(10, Math.floor(big));
  for (let i = 0; i < n; i++) { const sp = rnd(0.5, 1) * big * 9; fx.emit(x, y, z, rnd(-1, 1) * sp, rnd(-1, 1) * sp, rnd(-1, 1) * sp, i % 3 ? c[0] : 1, i % 3 ? c[1] : 0.7, i % 3 ? c[2] : 0.3, big * rnd(0.5, 1.1), rnd(0.25, 0.8), 1.4); }
  if (fx.fire && big >= 2) fx.fire(x, y, z, rnd(-1, 1) * big, rnd(-1, 1) * big, rnd(-1, 1) * big, big * 0.8, big * 2.2, 0.35, [1, 0.55, 0.15], 2, 0.8);
}
/* 飛彈爆炸的濃煙：深色、緩慢翻騰擴散的煙團，從火球中心往外冒 */
function smokeCloud(x, y, z, R, n) {
  if (!fx || !fx.smoke) return;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), u = rnd(-0.6, 1), c = Math.sqrt(1 - u * u), sp = R * rnd(0.12, 0.45), off = R * rnd(0, 0.5), dl = rnd(0.05, 0.6), black = i % 3 !== 0;   // 三分之二是濃黑煙，其餘帶火光的橘褐煙
    fx.later(dl, () => fx.smoke(x + Math.cos(a) * c * off, y + u * off, z + Math.sin(a) * c * off, Math.cos(a) * c * sp, u * sp + R * 0.06, Math.sin(a) * c * sp, R * rnd(0.6, 1.0), R * rnd(2.2, 3.8), rnd(4.5, 8.0), black ? [0.03, 0.02, 0.02] : [1.0, 0.5, 0.2], 0.5, black ? 1.6 : 1.25));
  }
}
/* 能量護盾：傷害先由護盾吸收；被擊中時記下命中點供護盾泡泡顯示漣漪，護盾歸零後 7 秒內無法恢復，之後閒置 5 秒開始回充 */
function shieldAbsorb(s, dmg, x, y, z) {
  const take = Math.min(s.sh, dmg); s.sh -= take; s.shT = G.t;
  s.hits.push({ x: x - s.x, y: y - s.y, z: z - s.z, t: G.t }); if (s.hits.length > 3) s.hits.shift();
  if (G.t - (s.shSnd || -9) > 0.32) { s.shSnd = G.t; FPVAudio.play('shield_hit', { pos: { x, y, z }, vol: 0.75, wet: 0.2 }); }
  if (s.sh <= 0.5) { s.sh = 0; s.shDown = G.t + 7; s.shBreakT = G.t; fx.emit(s.x, s.y, s.z, 0, 0, 0, 0.7, 0.85, 1, s.rad * 5, 0.5, 0, 0, 1.4); if (s.side === 'a' && G.doom === 0 && s.d.hp >= 8000) say(s.d.name + ' shields down', s.d.name + ' 護盾失效', true); }
  return dmg - take;
}
function stepShields(dt) {
  const f = (list) => { for (let i = 0; i < list.length; i++) { const s = list[i]; if (s.dead || !s.shMax || s.sh >= s.shMax) continue; if (G.t > s.shT + 5 && G.t > s.shDown) s.sh = Math.min(s.shMax, s.sh + s.shMax * 0.05 * dt); } };
  f(allies); f(enemies);
}
/* 艦體損傷：受損的主力艦冒煙、噴火花、起火，重傷時偶爾發生小型二次爆炸（艦體的焦黑與裂縫發光在 sw-fleet 的材質裡） */
let dmgFxBudget = 0;
function stepDamageFx(dt) {
  if (!fx.smoke || G.lite) return;
  dmgFxBudget = 0;   // 每幀最多讓 6 艘受損艦冒煙起火（體積煙霧填充成本高，離鏡頭遠的不處理）
  const f = (list) => {
    for (let i = 0; i < list.length; i++) {
      const s = list[i]; if (s.dead || s.d.hp < 2500 || s.isPlayer) continue;
      const dm = 1 - s.hp / s.hpMax; if (dm < 0.3) continue;
      if (Math.abs(s.x - camera.position.x) > 9000 || Math.abs(s.z - camera.position.z) > 9000 || Math.abs(s.y - camera.position.y) > 9000) continue;
      if (++dmgFxBudget > 6) return;
      const k = clamp((dm - 0.3) / 0.7, 0, 1), R = s.rad * 0.8;
      if (Math.random() < dt * (0.5 + 1.2 * k)) {                              // 傷口冒煙
        const u = rnd(-0.5, 0.8), a = rnd(0, TAU), c = Math.sqrt(1 - u * u);
        fx.smoke(s.x + Math.cos(a) * c * R, s.y + u * R, s.z + Math.sin(a) * c * R, s.vx * 0.2 + rnd(-8, 8), s.vy * 0.2 + rnd(6, 20), s.vz * 0.2 + rnd(-8, 8), R * 0.1, R * rnd(0.3, 0.55), rnd(2.5, 4.5), [0.04, 0.03, 0.03], 0.4, 1.3);
      }
      if (k > 0.35 && Math.random() < dt * (0.6 + 2.0 * k)) {                       // 火舌與火花
        const u = rnd(-0.5, 0.8), a = rnd(0, TAU), c = Math.sqrt(1 - u * u), px = s.x + Math.cos(a) * c * R, py = s.y + u * R, pz = s.z + Math.sin(a) * c * R;
        fx.fire(px, py, pz, rnd(-6, 6), rnd(4, 16), rnd(-6, 6), R * 0.06, R * rnd(0.12, 0.22), rnd(0.4, 0.9), s.side === 'e' ? [0.75, 0.3, 1.0] : [1.0, 0.5, 0.12], 1.2, 1);
        for (let j = 0; j < 3; j++) fx.emit(px, py, pz, rnd(-1, 1) * R * 0.3, rnd(-0.2, 1) * R * 0.3, rnd(-1, 1) * R * 0.3, 1, rnd(0.5, 0.8), 0.25, Math.max(2, R * 0.015), rnd(0.5, 1.4), 1.2);
      }
      if (k > 0.7 && Math.random() < dt * 0.12 * k) {                           // 重傷：小型二次爆炸
        const a = rnd(0, TAU), px = s.x + Math.cos(a) * R * 0.7, pz = s.z + Math.sin(a) * R * 0.7, py = s.y + rnd(-0.3, 0.5) * R;
        fx.explode(px, py, pz, clamp(s.d.boom * 0.12, 0.8, 2.2), s.side === 'e', clamp(R / 160, 1, 6)); FPVAudio.explode(2, { x: px, y: py, z: pz });
      }
    }
  };
  f(allies); f(enemies);
}
function damage(s, dmg, x, y, z, src) {
  if (s.dead) return;
  if (s.isPlayer) { hurtPlayer(dmg); return; }
  if (src) { const k = src.kind + '>' + s.kind; DBG.hits[k] = (DBG.hits[k] || 0) + 1; DBG.dmg[k] = (DBG.dmg[k] || 0) + dmg; }
  if (s.d.hp > 1000 && src && src.kind === 'fgt') dmg *= dmg > 100 ? 10 : 6;   // 戰機武器針對艦艇的反艦倍率
  if (s.sh > 0) { dmg = shieldAbsorb(s, dmg, x, y, z); if (dmg <= 0) return; }
  s.hp -= dmg; s.hitT = G.t;
  if (s.side === 'a' && s.hp > 0 && s.hp < s.hpMax * 0.5 && !s.hitCalled) { s.hitCalled = true; radioSay(s, 'hit'); }
  if (s.hp <= 0) killShip(s, src);
}
function killShip(s, src) {
  if (s.dead) return; s.dead = true; s.hidden = false;
  const d = s.d, big = d.boom >= 3;
  if (s.side === 'e' && src && src.side === 'a') { G.kills++; if (src === player.ship) player.kills++; else if (src.kind === 'fgt' && Math.random() < 0.4) radioSay(src, 'kill'); }
  const U = big ? clamp(s.scale * 0.55, 3, 22) : 0.8;
  fx.explode(s.x, s.y, s.z, d.boom, s.side === 'e', U);
  boomLight(s.x, s.y, s.z, d.boom, s.side === 'e' ? [1, 0.55, 0.3] : [0.55, 0.8, 1]);
  if (big) {
    const n = Math.min(14, 3 + Math.floor(d.boom / 2));
    for (let i = 0; i < n; i++) { const dx = rnd(-1, 1) * s.rad, dy = rnd(-0.5, 0.5) * s.rad, dz = rnd(-1, 1) * s.rad; fx.later(0.2 + i * rnd(0.15, 0.4), () => fx.explode(s.x + dx, s.y + dy, s.z + dz, d.boom * rnd(0.3, 0.8), s.side === 'e', U * 0.7)); }
    if (G.doom === 0) say(d.name + ' destroyed' + (s.side === 'a' ? ' · ' + s.cs : ''), d.name + ' 被擊毀' + (s.side === 'a' ? ' · ' + s.cs : ''), s.side === 'a');
  }
  FPVAudio.explode(d.boom, s);
  if (s.side === 'a' && !s.isPlayer && G.doom === 0) radioSay(s, 'final');
  if (s.kind === 'awacs' && G.doom === 0) { say('Sentinel lost — datalink degraded, units on local control', '預警機失去聯繫——資料鏈降級，各單位改為自主作戰', true); G.awacsPending = G.t + rnd(55, 80); for (const u of allies) u.awTgt = null; player.suggest = null; }
  if (s === player.ship) { if (s.isPlayer) return; }
  if (player.target === s) player.target = null;
  if (s.isOrig) player.orig = null;
}
/* 空間格網：每個模擬步驟把兩邊的艦艇依位置放進 1200 m 的格子（半徑 ≥ 600 的巨艦另外放在小清單裡），
   子彈碰撞只檢查線段附近的格子——艦艇數量 ×4 時，碰撞檢查不再是 O(子彈 × 艦艇) */
const GRID_CS = 1200, GRID_BIG_R = 600;
const gridA = { cells: new Map(), big: [] }, gridE = { cells: new Map(), big: [] };
function gridKey(ix, iy, iz) { return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512); }
function buildGrid(g, list) {
  g.cells.clear(); g.big.length = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]; if (s.dead) continue;
    if (s.rad >= GRID_BIG_R) { g.big.push(s); continue; }
    const k = gridKey(Math.floor(s.x / GRID_CS), Math.floor(s.y / GRID_CS), Math.floor(s.z / GRID_CS)); let c = g.cells.get(k); if (!c) { c = []; g.cells.set(k, c); } c.push(s);
  }
}
function hitOne(s, sx, sy, sz, dx, dy, dz, L2, st) {
  const rr = s.rad * (s.d.hp > 1000 ? 0.9 : 1), ox = s.x - sx, oy = s.y - sy, oz = s.z - sz;
  let tt = (ox * dx + oy * dy + oz * dz) / L2; tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
  const px = sx + dx * tt - s.x, py = sy + dy * tt - s.y, pz = sz + dz * tt - s.z;
  if (px * px + py * py + pz * pz < rr * rr && tt < st.bt) { st.bt = tt; st.best = s; }
}
const _hs = { bt: 2, best: null };
function hitTest(sx, sy, sz, ex, ey, ez, side) {   // 線段與敵對艦艇球體相交（回傳最近者與命中點）
  const g = side === 'a' ? gridE : gridA, dx = ex - sx, dy = ey - sy, dz = ez - sz, L2 = dx * dx + dy * dy + dz * dz || 1, st = _hs; st.bt = 2; st.best = null;
  for (let i = 0; i < g.big.length; i++) { const s = g.big[i]; if (!s.dead) hitOne(s, sx, sy, sz, dx, dy, dz, L2, st); }
  const R = 360, x0 = Math.floor((Math.min(sx, ex) - R) / GRID_CS), x1 = Math.floor((Math.max(sx, ex) + R) / GRID_CS), y0 = Math.floor((Math.min(sy, ey) - R) / GRID_CS), y1 = Math.floor((Math.max(sy, ey) + R) / GRID_CS), z0 = Math.floor((Math.min(sz, ez) - R) / GRID_CS), z1 = Math.floor((Math.max(sz, ez) + R) / GRID_CS);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 64) { const list = side === 'a' ? enemies : allies; for (let i = 0; i < list.length; i++) { const s = list[i]; if (!s.dead && s.rad < GRID_BIG_R) hitOne(s, sx, sy, sz, dx, dy, dz, L2, st); } }
  else for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) { const c = g.cells.get(gridKey(ix, iy, iz)); if (!c) continue; for (let i = 0; i < c.length; i++) { const s = c[i]; if (!s.dead) hitOne(s, sx, sy, sz, dx, dy, dz, L2, st); } }
  return st.best ? { s: st.best, t: st.bt } : null;
}
function tombPartPos(i, out) { const P = TOMB_PARTS[i]; return out.set(TOMB_POS.x + P[0] * TOMB_SCALE, TOMB_POS.y + P[1] * TOMB_SCALE, TOMB_POS.z + P[2] * TOMB_SCALE); }
function tombHit(sx, sy, sz, ex, ey, ez) {
  for (let i = 0; i < TOMB_PARTS.length; i++) {
    const P = TOMB_PARTS[i], cx = TOMB_POS.x + P[0] * TOMB_SCALE, cy = TOMB_POS.y + P[1] * TOMB_SCALE, cz = TOMB_POS.z + P[2] * TOMB_SCALE, r = P[3] * TOMB_SCALE;
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, L2 = dx * dx + dy * dy + dz * dz || 1;
    const tt = clamp(((cx - sx) * dx + (cy - sy) * dy + (cz - sz) * dz) / L2, 0, 1);
    const px = sx + dx * tt - cx, py = sy + dy * tt - cy, pz = sz + dz * tt - cz;
    if (px * px + py * py + pz * pz < r * r) return true;
  }
  return false;
}
function tombTarget(from) {   // 最靠近 from 的鐵墓部位，包成「像艦艇一樣的目標」：AI 可以接近、瞄準、開火
  let bi = 0, bd = 1e18;
  for (let i = 0; i < TOMB_PARTS.length; i++) { tombPartPos(i, V3); const d2 = (V3.x - from.x) ** 2 + (V3.y - from.y) ** 2 + (V3.z - from.z) ** 2; if (d2 < bd) { bd = d2; bi = i; } }
  tombPartPos(bi, V3); TOMB_T.x = V3.x; TOMB_T.y = V3.y; TOMB_T.z = V3.z; TOMB_T.rad = TOMB_PARTS[bi][3] * TOMB_SCALE; return TOMB_T;
}
const IRON_FREE_DMG = 6e5, IRON_LOCK = 0.6;   // 自由模式：累積 60 萬點傷害後降到 60%，之後鎖血（不會再低於 60%）
function ironFrac() {
  if (G.mode !== 'script') return Math.max(IRON_LOCK, 1 - (1 - IRON_LOCK) * ironDmg / IRON_FREE_DMG);
  const drip = Math.max(0, G.t - T.REVEAL) * 9000;
  return 0.8 + 0.2 * Math.exp(-(ironDmg + drip) / IRON_K);
}
function stepShots(dt) {
  buildGrid(gridA, allies); buildGrid(gridE, enemies);
  for (let i = shots.length - 1; i >= 0; i--) {
    const b = shots[i];
    if (b.homing) { if (!stepMissile(b, dt)) shots.splice(i, 1); continue; }
    const px = b.x, py = b.y, pz = b.z;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
    let dead = b.life <= 0;
    const h = hitTest(px, py, pz, b.x, b.y, b.z, b.side);
    if (h) {
      const hx_ = px + (b.x - px) * h.t, hy_ = py + (b.y - py) * h.t, hz_ = pz + (b.z - pz) * h.t;
      b.x = hx_; b.y = hy_; b.z = hz_; impact(hx_, hy_, hz_, clamp(b.w * 1.4, 1, 14), b.col);
      damage(h.s, b.dmg, hx_, hy_, hz_, b.src); dead = true;
    } else if (b.side === 'a' && tombHit(px, py, pz, b.x, b.y, b.z)) {
      impact(b.x, b.y, b.z, 22, [1, 0.3, 0.4]); ironDmg += b.dmg; dead = true;
    }
    if (dead) { shots.splice(i, 1); continue; }
    const L = b.len, inv = 1 / (b.spd || 1);
    fx.beam(b.x - b.vx * inv * L, b.y - b.vy * inv * L, b.z - b.vz * inv * L, b.x, b.y, b.z, { color: b.col, width: b.w, dur: Math.max(dt * 1.6, 0.03), len: 0 });
  }
}
function stepMissile(m, dt) {
  const tg = m.tgt;
  if (tg && !tg.dead) {
    V.set(tg.x - m.x, tg.y - m.y, tg.z - m.z); const dist = V.length(); V.divideScalar(dist || 1);
    V2.set(m.vx, m.vy, m.vz); const sp = Math.min(m.spd + 330 * dt, 340); V2.normalize();
    V2.lerp(V, Math.min(1, 2.6 * dt)).normalize(); m.spd = sp; m.vx = V2.x * sp; m.vy = V2.y * sp; m.vz = V2.z * sp;
    if (dist < tg.rad + 14) { impact(m.x, m.y, m.z, 8, [1, 0.8, 0.4]); fx.explode(m.x, m.y, m.z, 1.4, m.side === 'e', 1); smokeCloud(m.x, m.y, m.z, 48, 22); boomLight(m.x, m.y, m.z, 1.4, [1, 0.7, 0.4]); FPVAudio.explode(1.4, m); damage(tg, m.dmg, m.x, m.y, m.z, m.src); return false; }
  } else { m.spd = Math.min(m.spd + 330 * dt, 340); m.vx = m.fx * m.spd; m.vy = m.fy * m.spd; m.vz = m.fz * m.spd; }
  m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
  const mk = m.big ? 6 : 1;   // 艦載飛彈體型大，拖尾與彈頭光點跟著放大才看得見
  fx.emit(m.x, m.y, m.z, rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), 1, 0.7, 0.35, 5 * mk, 0.7 + (mk > 1 ? 0.8 : 0), 1.5);
  fx.emit(m.x, m.y, m.z, 0, 0, 0, 1, 1, 0.9, 4 * mk, 0.05, 0, 0);
  return m.life > 0;
}

/* ═════════ AI 與命令 ═════════ */
function nearest(s, list, maxD, filter) {
  let best = null, bd = maxD * maxD;
  for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.dead || (filter && !filter(e))) continue; const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = e; } }
  return best;
}
function randomTarget(s, foes, range, filter) {   // 射程內的敵艦隨機挑一個：火力分散到整個戰線
  let pick_ = null, n = 0;
  for (let i = 0; i < foes.length; i++) { const e = foes[i]; if (e.dead || e.isPlayer || (filter && !filter(e))) continue; const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z; if (dx * dx + dy * dy + dz * dz < range * range && Math.random() * ++n < 1) pick_ = e; }
  return pick_;
}
function leadPoint(src, tgt, spd, out) {
  const dx = tgt.x - src.x, dy = tgt.y - src.y, dz = tgt.z - src.z, vx = tgt.vx || 0, vy = tgt.vy || 0, vz = tgt.vz || 0;
  const a = vx * vx + vy * vy + vz * vz - spd * spd, b = 2 * (dx * vx + dy * vy + dz * vz), c = dx * dx + dy * dy + dz * dz;
  let tt = 0; if (Math.abs(a) < 1e-4) tt = -c / (b || 1); else { const disc = b * b - 4 * a * c; if (disc >= 0) { const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a); tt = Math.min(r1 > 0 ? r1 : 1e9, r2 > 0 ? r2 : 1e9); if (tt > 1e8) tt = Math.sqrt(c) / spd; } else tt = Math.sqrt(c) / spd; }
  tt = clamp(tt, 0, 6); return out.set(tgt.x + vx * tt, tgt.y + vy * tt, tgt.z + vz * tt);
}
function turnToward(s, tx, ty, tz, dt, rate) {
  const dx = tx - s.x, dy = ty - s.y, dz = tz - s.z, hd = Math.atan2(dx, dz), pd = Math.atan2(dy, Math.hypot(dx, dz));
  let dh = hd - s.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); const dp_ = pd - s.p;
  const mh = clamp(dh, -rate * dt, rate * dt), mp = clamp(dp_, -rate * 0.8 * dt, rate * 0.8 * dt);
  s.h += mh; s.p = clamp(s.p + mp, -1.25, 1.25); s.roll += (clamp(-mh / dt * 0.45, -1.1, 1.1) - s.roll) * Math.min(1, dt * 4);
  return Math.abs(dh) + Math.abs(dp_);
}
function moveFwd(s, spd, dt) { FWD(s, V); s.vx = V.x * spd; s.vy = V.y * spd; s.vz = V.z * spd; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; }
function activeOrder(s) {
  const o = s.order; if (!o) return null;
  if (o.until && G.t > o.until) { s.order = null; return null; }
  if ((o.type === 'focus') && (!o.tgt || o.tgt.dead)) { s.order = null; return null; }
  return o;
}
function issueOrder(units, order) { for (const u of units) { if (u.dead || u.isPlayer) continue; u.order = Object.assign({}, order); u.mt = 0; } }
const _g2 = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }; function gun2(g) { _g2.x = g.x; _g2.y = g.y; _g2.z = g.z; return _g2; }
function awacsUnit() { for (let i = 0; i < allies.length; i++) if (allies[i].kind === 'awacs' && !allies[i].dead) return allies[i]; return null; }
function exclude(s, lim) { const tx = s.x - TOMB_POS.x, ty = s.y - TOMB_POS.y, tz = s.z - TOMB_POS.z, td = Math.hypot(tx, ty, tz); if (td < lim) { const f = lim / td; s.x = TOMB_POS.x + tx * f; s.y = TOMB_POS.y + ty * f; s.z = TOMB_POS.z + tz * f; } }

function fighterFire(s, tg, dt) {
  s.cd -= dt;
  if (s.cd <= 0) {
    s.cd = s.side === 'a' ? 0.18 : 0.32; FWD(s, V2);
    const gun = fleet.gunWorld(s, V); const dmg = s.side === 'a' ? 10 : (tg.isPlayer ? 7 : 9);
    fire(s, gun.x, gun.y, gun.z, V2.x + rnd(-0.012, 0.012), V2.y + rnd(-0.012, 0.012), V2.z + rnd(-0.012, 0.012), 1300, dmg, 0.35, 28, s.side === 'a' ? [0.3, 0.72, 1] : [0.62, 0.22, 1], 1.6);
    FPVAudio.fire(s.side === 'a' ? 'ally' : 'enemy', gun);
  }
}
function aiFighter(s, dt) {
  const foes = s.side === 'a' ? enemies : allies, d = s.d, o = s.side === 'a' ? activeOrder(s) : null;
  s.mt -= dt;
  let tg = s.tgt, spd = (s.spd || d.spd) * (s.boostUntil && G.t < s.boostUntil ? 3 : 1);   // 折躍進場後 15 秒內移動速度 ×3
  if (o && o.type === 'move' || o && o.type === 'hold') {          // 移動／固守：前往集結點，在附近巡邏並攔截 2.5 km 內的敵機
    const wx = o.type === 'hold' ? s.hx : o.x, wy = o.type === 'hold' ? s.hy : o.y, wz = o.type === 'hold' ? s.hz : o.z;
    if (o.type === 'hold' && !o.set) { o.set = 1; s.hx = s.x; s.hy = s.y; s.hz = s.z; }
    const near = nearest({ x: wx, y: wy, z: wz }, foes, 2500);
    if (near) { tg = s.tgt = near; } else if (tg && (tg.dead || Math.hypot(tg.x - wx, tg.y - wy, tg.z - wz) > 3200)) tg = s.tgt = null;
    if (!tg) { const dist = Math.hypot(wx - s.x, wy - s.y, wz - s.z); if (dist > 700) { turnToward(s, wx, wy, wz, dt, d.turn); moveFwd(s, spd, dt); } else { s.h += 0.45 * dt; s.roll += (-0.5 - s.roll) * dt * 2; moveFwd(s, spd * 0.7, dt); } return; }
  } else if (o && (o.type === 'focus' || o.type === 'tomb')) { tg = s.tgt = o.type === 'tomb' ? tombTarget(s) : o.tgt;
  } else if (o && o.type === 'charge') { if (!tg || tg.dead || s.mt <= 0) { tg = s.tgt = nearest(s, foes, 14000, (e) => e.d.hp > 1000) || nearest(s, foes, 14000); s.mt = rnd(3, 6); }
  } else if (!tg || tg.dead || (s.mt <= 0 && s.mode === 0 && Math.random() < 0.02)) {
    const old = tg;
    if (s.side === 'a') tg = s.tgt = (s.awTgt && !s.awTgt.dead ? s.awTgt : null) || nearest(s, foes, 6000, (e) => e.kind === 'fly') || nearest(s, foes, 9000);
    else { const pf = player.ship && !player.ship.dead && player.ship.isPlayer && Math.random() < 0.18 ? player.ship : null, aw = Math.random() < 0.12 ? awacsUnit() : null;
      tg = s.tgt = pf || aw || (Math.random() < 0.45 ? nearest(s, allies, 4000, (e) => e.kind === 'fgt') : null) || nearest(s, allies, 9000, (e) => e.d.hp > 1000) || nearest(s, allies, 12000); }
    s.mt = rnd(4, 9);
    if (s.side === 'a' && tg && tg !== old && !s.isPlayer) radioSay(s, 'lock');
  }
  if (!tg) { turnToward(s, s.x + Math.sin(s.h) * 500, s.y, s.z + Math.cos(s.h) * 500, dt, 0.5); moveFwd(s, spd * 0.7, dt); return; }
  const dx = tg.x - s.x, dy = tg.y - s.y, dz = tg.z - s.z, dist = Math.hypot(dx, dy, dz), big = (tg.d && tg.d.hp > 1000) || tg.isTomb;
  if (s.mode === 1) {                                  // 突破後脫離：朝隨機方向拉開再回頭
    turnToward(s, s.bx, s.by, s.bz, dt, d.turn); moveFwd(s, spd * 1.1, dt); s.mt -= dt;
    if (Math.hypot(s.bx - s.x, s.by - s.y, s.bz - s.z) < 300 || s.mt < -5) { s.mode = 0; s.mt = 0; }
    if (s.side === 'a') exclude(s, TOMB_AURA - 300);
    return;
  }
  const aimP = leadPoint(s, tg, big ? 760 : 1300, V3);
  const err = turnToward(s, aimP.x, aimP.y, aimP.z, dt, d.turn);
  moveFwd(s, dist < 260 ? spd * 0.9 : spd, dt);
  if (s.side === 'a') exclude(s, TOMB_AURA - 300);
  if (err < 0.1 && dist < (big ? 1100 : 900)) { fighterFire(s, tg, dt); if (!s.pursued || G.t - s.pursued > 14) { s.pursued = G.t; if (s.side === 'a' && !s.isPlayer) radioSay(s, 'pursue'); } } else s.cd -= dt;
  if (dist < (big ? tg.rad * 0.7 + 90 : 120)) { s.mode = 1; s.bx = s.x + rnd(-1, 1) * 900 + V2.x * 500; s.by = s.y + rnd(-1, 1) * 500; s.bz = s.z + rnd(-1, 1) * 900; s.mt = 0; }
}
function allyCapitalTarget(s) {
  if (s.awTgt && !s.awTgt.dead && Math.hypot(s.awTgt.x - s.x, s.awTgt.y - s.y, s.awTgt.z - s.z) < 12000) return s.awTgt;
  return nearest(s, enemies, 12000, (e) => e.d.hp > 1000) || nearest(s, enemies, 12000) || null;
}
function aiCapital(s, dt) {
  const d = s.d, foes = s.side === 'a' ? enemies : allies, o = s.side === 'a' ? activeOrder(s) : null;
  s.mt -= dt;
  let fireTarget = null;
  if (s.side === 'a') {
    let wx = 0, wy = 0, wz = 0, sp = d.spd * (s.boostUntil && G.t < s.boostUntil ? 3 : 1), face = null;   // 折躍進場後 15 秒內移動速度 ×3
    if (s.mt <= 0) { s.tgt = allyCapitalTarget(s); s.mt = rnd(2.5, 4.5); }
    const auto = s.tgt && !s.tgt.dead ? s.tgt : null;
    if (s.rally && !o && G.t < s.rally && Math.hypot(s.hx - s.x, s.hy - s.y, s.hz - s.z) > 450) {   // 增援剛抵達：先靠攏到螺絲咕姆／空間站身邊
      wx = s.hx - s.x; wy = s.hy - s.y; wz = s.hz - s.z; const l = Math.hypot(wx, wy, wz) || 1; wx /= l; wy /= l; wz /= l; sp = Math.min(sp * 1.3, l * 0.4 + 2);
      face = auto || { x: s.hx, y: s.hy, z: s.hz };
    } else if (o && o.type === 'move') {
      wx = o.x - s.x; wy = o.y - s.y; wz = o.z - s.z; const l = Math.hypot(wx, wy, wz) || 1;
      if (l > 140) { wx /= l; wy /= l; wz /= l; sp = Math.min(sp, l * 0.3 + 1); face = auto && Math.hypot(auto.x - s.x, auto.y - s.y, auto.z - s.z) < d.range * 1.1 ? auto : { x: o.x, y: o.y, z: o.z }; } else { wx = wy = wz = 0; sp = 0; face = auto; }
    } else if (o && o.type === 'hold') { wx = wy = wz = 0; sp = 0; face = auto;
    } else if (o && (o.type === 'focus' || o.type === 'tomb' || o.type === 'charge')) {
      const tg = o.type === 'tomb' ? tombTarget(s) : o.type === 'focus' ? o.tgt : auto;
      if (tg) {
        const dx = tg.x - s.x, dy = tg.y - s.y, dz = tg.z - s.z, dist = Math.hypot(dx, dy, dz) || 1, engage = d.range * (o.type === 'charge' ? 0.4 : 0.6) + tg.rad * 0.5, lat = ((s.id % 7) - 3) * 160;
        if (o.type === 'tomb') { V.set(s.x - TOMB_POS.x, s.y - TOMB_POS.y, s.z - TOMB_POS.z); if (V.length() < TOMB_AURA + s.rad * 0.5 + 60) { wx = wy = wz = 0; sp = 0; } else if (dist > engage) { wx = dx / dist; wy = dy / dist; wz = dz / dist; } else { wx = wy = wz = 0; sp = 0; } }
        else if (dist > engage) { wx = dx / dist + (-dz / dist) * lat / dist; wy = dy / dist; wz = dz / dist + (dx / dist) * lat / dist; if (o.type === 'charge') sp *= 1.25; }
        else { const side = s.id % 2 ? 1 : -1; wx = -dz / dist * side; wy = (engage - dist) / engage * 0.5; wz = dx / dist * side; sp *= 0.35; }
        face = tg; fireTarget = tg;
      }
    } else if (auto) {     // 預設：主動前壓，到有效射程後繞著目標側移
      const dx = auto.x - s.x, dy = auto.y - s.y, dz = auto.z - s.z, dist = Math.hypot(dx, dy, dz) || 1, engage = d.range * 0.55 + auto.rad * 0.6, lat = ((s.id % 7) - 3) * 160;
      if (dist > engage) { wx = dx / dist + (-dz / dist) * lat / dist; wy = dy / dist; wz = dz / dist + (dx / dist) * lat / dist; }
      else { const side = s.id % 2 ? 1 : -1; wx = -dz / dist * side; wy = (engage - dist) / engage * 0.5; wz = dx / dist * side; sp *= 0.35; }
      face = auto;
    } else {
      wx = s.hx - s.x; wy = s.hy - s.y; wz = s.hz - s.z; const l = Math.hypot(wx, wy, wz) || 1; wx /= l; wy /= l; wz /= l; sp = Math.min(sp, l * 0.3);
      { const tt = nearest(s, enemies, 1e9); face = tt || TOMB_POS; }
    }
    if (face) turnToward(s, face.x, face.y, face.z, dt, d.turn || 0.06);
    const k = 1 - Math.exp(-dt * 0.5);
    s.vx += (wx * sp - s.vx) * k; s.vy += (wy * sp - s.vy) * k; s.vz += (wz * sp - s.vz) * k;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.p *= 0.99;
    exclude(s, TOMB_AURA + s.rad * 0.5);
  } else {                // 反物質軍團：朝最近的聯軍大艦推進，接近後減速
    if (s.mt <= 0) { s.tgt = nearest(s, allies, 14000, (e) => e.d.hp > 1000) || null; s.mt = 6; }
    const tg = s.tgt && !s.tgt.dead ? s.tgt : null;
    if (tg) { const dist = Math.hypot(tg.x - s.x, tg.y - s.y, tg.z - s.z); turnToward(s, tg.x, tg.y, tg.z, dt, d.turn || 0.06); moveFwd(s, dist > 1500 ? d.spd : d.spd * 0.3, dt); } else moveFwd(s, d.spd * 0.5, dt);
  }
  if (d.noGun) return;
  const isFgt = (e) => e.d.cls === 'fgt', isBig = (e) => e.d.cls !== 'fgt';
  // 主力光束砲（藍：聯軍／紅：反物質軍團）：瞬發的粗光束，優先打大型目標；月球艦改發範圍轟炸的光束泡
  s.bcd = (s.bcd == null ? rnd(0, 2) : s.bcd) - dt;
  if (d.bubble && s.bcd <= 0) { s.bcd = d.cd * rnd(0.8, 1.2); const tg = fireTarget && fireTarget.isTomb ? fireTarget : bubbleTarget(s, d.range * 1.15); if (tg) launchBubble(s, tg); }   // 螺絲咕姆的範圍轟炸
  s.bmcd = (s.bmcd == null ? rnd(0, 2) : s.bmcd) - dt;
  if (d.beam && s.bmcd <= 0) {
    s.bmcd = d.beam.cd * rnd(0.8, 1.25);
    const range = d.range * 1.25;
    for (let v = 0; v < d.beam.n; v++) {
      let tg = fireTarget && isBig(fireTarget) && Math.hypot(fireTarget.x - s.x, fireTarget.y - s.y, fireTarget.z - s.z) < range ? fireTarget : null;
      if (!tg && !(o && (o.type === 'focus' || o.type === 'tomb'))) {
        tg = (s.awTgt && !s.awTgt.dead && isBig(s.awTgt) && Math.random() < 0.6 && Math.hypot(s.awTgt.x - s.x, s.awTgt.y - s.y, s.awTgt.z - s.z) < range) ? s.awTgt : randomTarget(s, foes, range, isBig);
        if (!tg && s.side === 'a') { const tt = tombTarget(s); if (Math.hypot(tt.x - s.x, tt.y - s.y, tt.z - s.z) < range) tg = tt; }   // 射程內只剩鐵墓時，自主開火
      }
      if (tg) fireBeamCannon(s, tg, d.beam);
    }
  }
  // 飛彈齊射（仙舟無畏艦）：成串的追蹤飛彈，從舷側發射陣列射出
  if (d.msl) {
    s.mcd = (s.mcd == null ? rnd(0, 3) : s.mcd) - dt;
    if (s.mcd <= 0) {
      s.mcd = d.msl.cd * rnd(0.8, 1.2); const range = d.range * 1.4;
      let tg = fireTarget && isBig(fireTarget) && !fireTarget.isTomb && Math.hypot(fireTarget.x - s.x, fireTarget.y - s.y, fireTarget.z - s.z) < range ? fireTarget : null;
      if (!tg) tg = (s.awTgt && !s.awTgt.dead && isBig(s.awTgt) && Math.hypot(s.awTgt.x - s.x, s.awTgt.y - s.y, s.awTgt.z - s.z) < range) ? s.awTgt : randomTarget(s, foes, range, isBig);
      if (tg) fireShipMissiles(s, tg, d.msl);
    }
  }
  // 速射砲（艦上的防空火網）：高射速的小口徑曳光彈，只打戰機與來襲飛彈
  s.cd -= dt;
  if (s.cd <= 0 && d.flak) {
    const fl = d.flak; s.cd = fl.cd * rnd(0.7, 1.3);
    let tg = randomTarget(s, foes, 1700, isFgt);
    if (!tg && s.side === 'e' && player.ship && player.ship.isPlayer && !player.dead && Math.hypot(player.ship.x - s.x, player.ship.y - s.y, player.ship.z - s.z) < 1700) tg = player.ship;
    if (tg) {
      if (!tg.vx && tg.vx !== 0) tg.vx = tg.vy = tg.vz = 0;
      const gun = fleet.gunWorld(s, V); const aim = leadPoint(gun2(gun), tg, fl.bs, V3);
      aim.x += rnd(-1, 1) * 30; aim.y += rnd(-1, 1) * 30; aim.z += rnd(-1, 1) * 30;
      V2.set(aim.x - gun.x, aim.y - gun.y, aim.z - gun.z).normalize();
      fire(s, gun.x, gun.y, gun.z, V2.x, V2.y, V2.z, fl.bs, fl.dmg, fl.w, fl.len, fl.col, 2.2);
      FPVAudio.fire(s.side === 'a' ? 'ally' : 'enemy', gun);
    }
  }
}
/** 艦載飛彈：一串追蹤飛彈自發射陣列依序射出（帶散布），沿用玩家飛彈的追蹤與爆炸 */
function fireShipMissiles(s, tg, spec) {
  const hasA = fleet.hasAnchor(s.kind, 'HP_MSL_1');
  for (let i = 0; i < spec.n; i++) {
    fx.later(i * 0.12, () => {
      if (s.dead || tg.dead) return;
      if (hasA) fleet.anchorWorld(s, 'HP_MSL_' + (1 + (i % 2)), V); else fleet.gunWorld(s, V);
      V2.set(tg.x - V.x, tg.y - V.y, tg.z - V.z).normalize();
      const sx = V.x + rnd(-40, 40), sy = V.y + rnd(-40, 40), sz = V.z + rnd(-40, 40), fxx = V2.x + rnd(-0.35, 0.35), fyy = V2.y + rnd(0.0, 0.5), fzz = V2.z + rnd(-0.35, 0.35), l = Math.hypot(fxx, fyy, fzz);
      shots.push({ homing: true, x: sx, y: sy, z: sz, vx: fxx / l * 90, vy: fyy / l * 90, vz: fzz / l * 90, fx: fxx / l, fy: fyy / l, fz: fzz / l, spd: 90, life: 16, big: true, dmg: s.side === 'e' ? spec.dmg * G.enemyDmg : spec.dmg, side: s.side, src: s, tgt: tg });
      fx.emit(sx, sy, sz, 0, 0, 0, 1, 0.8, 0.5, 70, 0.3, 0, 0, 1);
    });
  }
  FPVAudio.missile();
}
/** 光束砲：持續照射目標約 2 秒、每 0.2 秒結算一次傷害；命中點持續噴出同色粒子與橘色熔融火光 */
const beams = [], BEAM_DUR = 2.0, BEAM_TICK = 0.2;
function fireBeamCannon(s, tg, spec) {
  V2.set(s.x - tg.x, s.y - tg.y, s.z - tg.z).normalize();
  const rr = (tg.rad || 10) * 0.75;
  // 命中點記成相對目標中心的偏移，目標移動時光束會跟著
  beams.push({ s, tg, spec, age: 0, tick: 0, ox: V2.x * rr + rnd(-1, 1) * rr * 0.45, oy: V2.y * rr + rnd(-1, 1) * rr * 0.4, oz: V2.z * rr + rnd(-1, 1) * rr * 0.45 });
  const gun = fleet.gunWorld(s, V); fx.emit(gun.x, gun.y, gun.z, 0, 0, 0, spec.col[0], spec.col[1], spec.col[2], spec.w * 2.2, 0.35, 0, 1);
  FPVAudio.cannon({ x: gun.x, y: gun.y, z: gun.z });
}
function stepBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i], s = b.s, tg = b.tg, sp = b.spec;
    if (s.dead || (tg.dead && !tg.isTomb)) { beams.splice(i, 1); continue; }
    b.age += dt; if (b.age > BEAM_DUR) { beams.splice(i, 1); continue; }
    const tx = tg.x + b.ox, ty = tg.y + b.oy, tz = tg.z + b.oz;
    if (tg.isTomb) { tombTarget(s); }
    const gun = fleet.gunWorld(s, V), gx = gun.x, gy = gun.y, gz = gun.z, col = sp.col, w = sp.w;
    const k = b.age < 0.15 ? b.age / 0.15 : b.age > BEAM_DUR - 0.25 ? Math.max(0.05, (BEAM_DUR - b.age) / 0.25) : 1;   // 開火漸強、收束漸弱
    const fl = 1 + Math.sin(G.t * 40 + s.id) * 0.12;
    fx.beam(gx, gy, gz, tx, ty, tz, { color: col, width: w * k * fl, dur: Math.max(dt * 1.8, 0.04), len: 0 });
    fx.beam(gx, gy, gz, tx, ty, tz, { color: [col[0] * 0.5 + 0.5, col[1] * 0.5 + 0.5, col[2] * 0.5 + 0.5], width: w * 0.16 * k, dur: Math.max(dt * 1.8, 0.04), len: 0 });
    // 命中點：同色粒子噴濺 + 橘色火光（燒熔感）
    // v2：不再在命中點放大塊柔光（那就是畫面上一團團大光芒的來源）；只噴與光束同色的熔渣與火花
    // v2：命中點改成「火花噴濺」——從受擊表面朝射手方向噴出的一束細小火花（高速、有阻力、很快熄滅），加少量慢速熔渣；不再冒大團火球
    V3.set(s.x - tx, s.y - ty, s.z - tz).normalize();                    // 表面外法線的近似：朝向射手
    const nsp = Math.max(2, Math.round(10 * dt * 60 / 3));              // 每幀約 3~6 顆（與幀率無關）
    for (let j = 0; j < nsp; j++) {
      const sp0 = w * rnd(10, 34), sx = V3.x + rnd(-0.75, 0.75), sy = V3.y + rnd(-0.75, 0.75), sz = V3.z + rnd(-0.75, 0.75), hot = j % 3 === 0;
      fx.emit(tx, ty, tz, sx * sp0, sy * sp0, sz * sp0, hot ? col[0] * 0.5 + 0.5 : col[0] * 0.85 + 0.15, hot ? col[1] * 0.5 + 0.5 : col[1] * 0.85 + 0.15, hot ? col[2] * 0.5 + 0.5 : col[2] * 0.85 + 0.15, Math.max(1.0, w * rnd(0.06, 0.14)), rnd(0.25, 0.65), 2.2);
    }
    if (Math.random() < dt * 22) fx.emit(tx, ty, tz, V3.x * w * 3 + rnd(-1, 1) * w * 2, V3.y * w * 3 + rnd(-1, 1) * w * 2, V3.z * w * 3 + rnd(-1, 1) * w * 2, col[0] * 0.8 + 0.2, col[1] * 0.8 + 0.2, col[2] * 0.8 + 0.2, Math.max(1.5, w * rnd(0.08, 0.16)), rnd(0.8, 1.6), 0.8);   // 慢速熔渣（與光束同色、小顆）
    if (fx.smoke && !G.lite && Math.random() < dt * 1.5) fx.smoke(tx, ty, tz, V3.x * w, V3.y * w + w * 0.5, V3.z * w, w * 0.8, w * 2.2, 1.8, [0.1, 0.085, 0.08], 0.6, 0.6);
    b.tick += dt;
    if (b.tick >= BEAM_TICK) {
      b.tick -= BEAM_TICK; const dmg = sp.dmg * BEAM_TICK / BEAM_DUR;
      if (tg.isTomb) ironDmg += dmg; else damage(tg, dmg, tx, ty, tz, s);
    }
  }
}
/* 螺絲咕姆的範圍轟炸：緩慢飛行的巨型光束泡，抵達後引爆成大範圍衝擊球（經典版的招牌武器） */
const bubbles = [], blasts = [];
function bubbleTarget(s, range) {   // 挑「周圍敵艦最密集」的大型敵艦，轟炸才划算
  let best = null, bs = -1;
  for (let k = 0; k < 14; k++) {
    const e = enemies[(Math.random() * enemies.length) | 0]; if (!e || e.dead) continue;
    const dd = Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z); if (dd > range) continue;
    let n = 0; for (let i = 0; i < enemies.length; i++) { const q = enemies[i]; if (!q.dead && Math.hypot(q.x - e.x, q.y - e.y, q.z - e.z) < 900) n += q.d.cls === 'fgt' ? 1 : 4; }
    if (n > bs) { bs = n; best = e; }
  }
  return best;
}
function launchBubble(s, tg) {
  const lp = leadPoint(s, tg, 300, V3), b = { x: s.x, y: s.y, z: s.z, tx: lp.x, ty: lp.y, tz: lp.z, tomb: !!tg.isTomb, spd: 300, age: 0, src: s, r: 950, dmg: 15000 };
  bubbles.push(b); fx.emit(s.x, s.y, s.z, 0, 0, 0, 1, 0.85, 0.35, 600, 0.5, 0, 0, 1); FPVAudio.cannon({ x: s.x, y: s.y, z: s.z });
}
function detonateBubble(b) {
  const x = b.x, y = b.y, z = b.z;
  fx.explode(x, y, z, 7, true, 16); boomLight(x, y, z, 8, [1, 0.8, 0.4]); FPVAudio.explode(11, { x, y, z }); blasts.push({ x, y, z, age: 0, r: b.r });
  for (let i = 0; i < 60; i++) { const a = rnd(0, TAU), sp = rnd(120, 420), u = rnd(-0.7, 0.7); fx.emit(x, y, z, Math.cos(a) * sp, u * sp, Math.sin(a) * sp, 1, rnd(0.8, 1), rnd(0.3, 0.7), rnd(10, 22), rnd(0.6, 1.4), 1.6); }
  if (b.tomb) { ironDmg += 9000; return; }
  for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.dead) continue; const dd = Math.hypot(e.x - x, e.y - y, e.z - z); if (dd < b.r + e.rad) damage(e, b.dmg * (1 - dd / (b.r + e.rad)) + 900, e.x, e.y, e.z, b.src); }
}
function stepBubbles(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.age += dt;
    const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z, d = Math.hypot(dx, dy, dz) || 1;
    if (d <= b.spd * dt + 20) { detonateBubble(b); bubbles.splice(i, 1); continue; }
    b.x += dx / d * b.spd * dt; b.y += dy / d * b.spd * dt; b.z += dz / d * b.spd * dt;
    fx.emit(b.x, b.y, b.z, rnd(-30, 30), rnd(-30, 30), rnd(-30, 30), 1, rnd(0.75, 0.95), 0.3, rnd(70, 130), 0.5, 2);
    if (b.age > 40) bubbles.splice(i, 1);
  }
  for (let i = blasts.length - 1; i >= 0; i--) { blasts[i].age += dt; if (blasts[i].age > 1.6) blasts.splice(i, 1); }
}
function aiAwacs(s, dt) {   // 預警機：待在環形陣的外側盤旋，敵人逼近就往外後撤
  const hss = allies.find((a) => a.kind === 'hss' && !a.dead), base = hss || { x: TOMB_POS.x, y: TOMB_POS.y, z: TOMB_POS.z + 8200 };
  V3.set(base.x - TOMB_POS.x, base.y - TOMB_POS.y, base.z - TOMB_POS.z).normalize();
  let tx = base.x + V3.x * 2600 + Math.sin(G.t * 0.03 + s.id) * 900, ty = base.y + V3.y * 2600 + 300, tz = base.z + V3.z * 2600 + Math.cos(G.t * 0.03 + s.id) * 900;
  const near = nearest(s, enemies, 3000);
  if (near) { V.set(s.x - near.x, s.y - near.y, s.z - near.z).normalize(); tx = s.x + V.x * 2000; ty = s.y + V.y * 2000; tz = s.z + V.z * 2000; }
  turnToward(s, tx, ty, tz, dt, s.d.turn); moveFwd(s, s.d.spd * (near ? 1.2 : 0.6), dt);
}
function separateCaps() {   // 大艦互相排斥，避免前壓時疊在一起
  const L = [];
  for (let i = 0; i < allies.length; i++) { const s = allies[i]; if (!s.dead && s.d.hp > 1000) L.push(s); }
  for (let i = 0; i < enemies.length; i++) { const s = enemies[i]; if (!s.dead && s.d.hp > 1000) L.push(s); }
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, min = (a.rad + b.rad) * 0.85, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < min * min && d2 > 1) { const dd = Math.sqrt(d2), push = (min - dd) * 0.12 / dd; a.x -= dx * push; a.y -= dy * push; a.z -= dz * push; b.x += dx * push; b.y += dy * push; b.z += dz * push; }
  }
}
/* ═════════ 預警機資料鏈：目標分配、感測分享、飛行員建議目標 ═════════ */
function allocateTargets() {
  const A = awacsUnit(); allocN++;
  if (!A) { for (const u of allies) u.awTgt = null; player.suggest = null; return; }
  const hvt = allies.filter((a) => !a.dead && (a.kind === 'hss' || a.kind === 'moon' || a.kind === 'awacs'));
  for (const e of enemies) {
    if (e.dead) continue; e.load = 0;
    let near = 1e9; for (const h of hvt) near = Math.min(near, Math.hypot(e.x - h.x, e.y - h.y, e.z - h.z));
    e.threat = (e.kind === 'whale' ? 45 : 12) + 40 * clamp(1 - near / 5000, 0, 1) + (e.tgt && e.tgt.d && e.tgt.d.hp > 10000 ? 10 : 0);
  }
  const units = allies.filter((u) => !u.dead && !u.isPlayer && u.kind !== 'awacs' && !activeOrder(u));
  for (let i = units.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const tmp = units[i]; units[i] = units[j]; units[j] = tmp; }
  for (const u of units) {
    const rng = u.kind === 'fgt' ? 2600 : u.d.range * 1.3; let best = null, bs = -1e9;
    for (const e of enemies) {
      if (e.dead) continue; const dist = Math.hypot(e.x - u.x, e.y - u.y, e.z - u.z); if (dist > rng) continue;
      const capacity = Math.max(1, Math.ceil(e.hp / (u.kind === 'fgt' ? 400 : 4000))), score = e.threat * 0.6 - dist / rng * 20 - (e.load / capacity) * 25 - (u.kind === 'fgt' && e.d.hp > 1000 ? 15 : 0);
      if (score > bs) { bs = score; best = e; }
    }
    u.awTgt = best; if (best) best.load++;
  }
  // 給飛行員的建議目標：玩家附近威脅最高者
  const P = player; let best = null, bs = -1e9;
  for (const e of enemies) { if (e.dead) continue; const dist = Math.hypot(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z); if (dist > 5200) continue; const sc = e.threat - dist / 80; if (sc > bs) { bs = sc; best = e; } }
  P.suggest = best;
}
function datalinkRange() { return awacsUnit() ? 20000 : 6000; }
function awacsLifecycle() {
  if (!awacsUnit() && G.awacsPending && G.t >= G.awacsPending && G.doom === 0) {
    G.awacsPending = 0; const s = mkShip('awacs', rnd(-800, 800), 700, 3600, Math.PI);
    say(s.cs + ' online — datalink restored, taking over target allocation', s.cs + ' 上線——資料鏈恢復，接管目標分配', false);
  }
}

/* ═════════ 玩家：飛行、武器、支援呼叫、重生 ═════════ */
function spawnPlayer(where) {   // 'front'：環形陣上的 HSS 旁｜'hss'：從 HSS 機庫起飛
  const P = player, hss = allies.find((s) => s.kind === 'hss' && !s.dead);
  if (where === 'hss' && hss) { V.set(hss.x - TOMB_POS.x, hss.y - TOMB_POS.y, hss.z - TOMB_POS.z).normalize(); P.pos.set(hss.x + V.x * 760 + rnd(-200, 200), hss.y + V.y * 760 + rnd(-100, 100), hss.z + V.z * 760 + rnd(-200, 200)); }
  else { const q = ringPos(7400, 0.25, 0.05); P.pos.set(q[0], q[1], q[2]); }
  V.set(TOMB_POS.x - P.pos.x, TOMB_POS.y - P.pos.y, TOMB_POS.z - P.pos.z).normalize(); P.q.setFromUnitVectors(AXZ, V); P.vel.copy(V).multiplyScalar(60); P.w.set(0, 0, 0);
  P.thr = 0.45; P.shield = P.shieldMax; P.hull = P.hullMax; P.energy = 100; P.heat = 100; P.missiles = 8; P.needSupply = false; P.resT = 0; P.resting = false; P.dead = false; P.target = null;
  if (G.deaths > 0 || where === 'hss') FPVAudio.respawn();
  const s = mkShip('fgt', P.pos.x, P.pos.y, P.pos.z, 0); s.isPlayer = true; s.q = P.q; s.hidden = cam.mode === 'cockpit'; P.ship = s; if (!P.orig || P.orig.dead) { P.orig = s; s.isOrig = true; }
}
function hurtPlayer(dmg) {
  if (player.dead) return; player.lastHit = G.t; cam.shake = Math.min(1.6, cam.shake + dmg * 0.02 + 0.2);
  if (player.shield > 0) { const a = Math.min(player.shield, dmg); player.shield -= a; dmg -= a; FPVAudio.shield(); flash(0.35, true); hurtK = Math.min(1, hurtK + 0.06); }
  if (dmg > 0) { player.hull -= dmg; hurtK = Math.min(1, hurtK + 0.3 + dmg * 0.01); FPVAudio.hit(); flash(0.9); if (player.hull <= 0) playerDie(); }
}
function playerDie() {
  const P = player, s = P.ship; P.dead = true; P.respawn = 5; s.dead = true; s.hidden = true; G.deaths++;
  fx.explode(s.x, s.y, s.z, 1.6, false, 1.3); FPVAudio.explode(3); say('Pilot lost. Re-deploying from the HSS hangar…', '飛行員陣亡，正從 HSS 機庫重新部署…', true);
  const i = allies.indexOf(s); if (i >= 0) allies.splice(i, 1);
  if (s.isOrig) P.orig = null;
}
function stepPlayer(dt) {
  const k = input.keys, P = player;
  if (G.role !== 'pilot') return;
  if (P.dead) { if (G.impacted) return; P.respawn -= dt; if (P.respawn <= 0) spawnPlayer('hss'); return; }
  const live = G.control;
  const sens = 0.0016, inv = P.invert ? -1 : 1;
  let tx = live ? clamp(input.my * sens / dt * inv, -1.7, 1.7) : 0, ty = live ? clamp(-input.mx * sens / dt, -1.5, 1.5) : 0;
  if (live) { tx += ((k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0)) * -1.2 * inv; ty += ((k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)) * 1.1; }
  const tz = live ? ((k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0)) * 2.0 : 0;
  input.mx = input.my = 0;
  const kk = 1 - Math.exp(-dt * 7); P.w.x += (tx - P.w.x) * kk; P.w.y += (ty - P.w.y) * kk; P.w.z += (tz - P.w.z) * kk;
  QT.setFromAxisAngle(AXX, P.w.x * dt); P.q.multiply(QT); QT.setFromAxisAngle(AXY, P.w.y * dt); P.q.multiply(QT); QT.setFromAxisAngle(AXZ, P.w.z * dt); P.q.multiply(QT); P.q.normalize();
  if (live) { if (k.KeyW) P.thr = Math.min(1, P.thr + dt * 0.5); if (k.KeyS) P.thr = Math.max(0, P.thr - dt * 0.5); if (k.KeyX) P.thr = Math.max(0, P.thr - dt * 2.5); }
  const wasBoost = P.boost; P.boost = live && !!k.ShiftLeft && P.energy > 4 && P.thr > 0.05; if (P.boost && !wasBoost) FPVAudio.boost(); P.energy = clamp(P.energy + (P.boost ? -26 : 11) * dt, 0, 100);
  const vmax = 170, vt = P.thr * vmax * (P.boost ? 2.4 : 1);
  const sx = live ? ((k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0)) * 55 : 0, sy = live ? ((k.KeyR ? 1 : 0) - (k.KeyF ? 1 : 0)) * 55 : 0;   // 本地 +X 為艦左
  V.set(sx, sy, vt).applyQuaternion(P.q);
  if (P.assist) { const a = 1 - Math.exp(-dt * (k.KeyX ? 2.4 : 1.1)); P.vel.lerp(V, a); }
  else { V.set(sx * 0.6, sy * 0.6, (P.thr * 90 * (P.boost ? 2.4 : 1))).applyQuaternion(P.q); P.vel.addScaledVector(V, dt); if (P.vel.length() > 420) P.vel.setLength(420); }
  if (DBG.aim && P.target && !P.target.dead) { V.set(P.target.x - P.pos.x, P.target.y - P.pos.y, P.target.z - P.pos.z).normalize(); QT.setFromUnitVectors(AXZ, V); P.q.copy(QT); }
  P.pos.addScaledVector(P.vel, dt);
  const dc = P.pos.distanceTo(TOMB_POS); let msg = '';
  if (dc > ARENA_R) { P.vel.addScaledVector(V.copy(P.pos).sub(TOMB_POS).normalize(), -140 * dt); msg = 'leave'; }
  const dt_ = V.copy(P.pos).sub(TOMB_POS).length();
  if (dt_ < TOMB_AURA) { P.vel.addScaledVector(V.copy(P.pos).sub(TOMB_POS).normalize(), 220 * dt); msg = 'zone'; }
  setCenter(msg, !!msg);
  if (G.t - P.lastHit > 4) P.shield = Math.min(P.shieldMax, P.shield + 55 * dt);
  if (P.hull < P.hullMax * 0.35) FPVAudio.alarm();
  P.heat = clamp(P.heat + 24 * dt, 0, 100); P.fireCd -= dt; P.mslCd -= dt; P.supCd -= dt; P.mslT += dt; stepResupply(dt);
  const s = P.ship; s.x = P.pos.x; s.y = P.pos.y; s.z = P.pos.z; s.vx = P.vel.x; s.vy = P.vel.y; s.vz = P.vel.z; s.thr = P.thr + (P.boost ? 0.5 : 0); s.q = P.q;
  if (live && (input.lmb || k.Space) && P.fireCd <= 0 && P.heat > 8) playerFire();
  if (live && (input.rmb || k.ControlLeft) && P.mslCd <= 0) playerMissile();
  cam.shake *= Math.exp(-dt * 5);
}
let gunSide = 0;
function playerFire() {
  const P = player, s = P.ship; P.fireCd = 0.11; P.heat -= 3.2; gunSide = (gunSide + 1) % 4;
  fleet.gunWorld(s, V); s.gi = gunSide - 1; const gun = fleet.gunWorld(s, V);
  V2.set(0, 0, 1).applyQuaternion(P.q);
  let tx_ = P.pos.x + V2.x * 900, ty_ = P.pos.y + V2.y * 900, tz_ = P.pos.z + V2.z * 900;
  const T_ = P.target;
  if (T_ && !T_.dead) { const l = leadPoint({ x: gun.x, y: gun.y, z: gun.z }, T_, 1900, V3); const ang = V3.clone().sub(P.pos).normalize().dot(V2); if (ang > 0.985) { tx_ = l.x; ty_ = l.y; tz_ = l.z; } }
  V3.set(tx_ - gun.x, ty_ - gun.y, tz_ - gun.z).normalize();
  fire(s, gun.x, gun.y, gun.z, V3.x, V3.y, V3.z, 1900 + P.vel.length() * 0.3, 16, 0.5, 34, [0.3, 0.72, 1], 2.1);
  FPVAudio.fire('player', { pan: gunSide < 2 ? -0.35 : 0.35 });
}
/* 飛彈補給：剩 2 發以下開始亮 HUD 並導引到最近的補給艦（HSS／無畏艦／仙舟無畏艦），靠近停留 2 秒補滿 */
const RESUPPLY_TIME = 2.0, SUPPLY_KINDS = ['hss', 'cap', 'xzd'];
function supplyShip() {
  let best = null, bd = 1e18; const P = player;
  for (const a of allies) { if (a.dead || SUPPLY_KINDS.indexOf(a.kind) < 0) continue; const d = Math.hypot(a.x - P.pos.x, a.y - P.pos.y, a.z - P.pos.z); if (d < bd) { bd = d; best = a; } }
  return best;
}
function stepResupply(dt) {
  const P = player;
  if (P.missiles > 2 && !P.needSupply) { P.resT = 0; P.supplyTgt = null; return; }
  if (P.missiles <= 2) P.needSupply = true;
  const sh = supplyShip(); P.supplyTgt = sh; if (!sh) { P.resT = 0; return; }
  const d = Math.hypot(sh.x - P.pos.x, sh.y - P.pos.y, sh.z - P.pos.z);
  if (d < sh.rad + 450) {
    P.resT += dt; P.resting = true;
    if (P.resT >= RESUPPLY_TIME) { P.missiles = 8; P.needSupply = false; P.resT = 0; P.resting = false; P.supplyTgt = null; FPVAudio.lock(true); say('Missiles resupplied', '飛彈補給完成', false); hudNote(L().resupplied, '#7dffb0'); }
  } else { P.resT = Math.max(0, P.resT - dt * 2); P.resting = false; }
}
function playerMissile() {
  const P = player; if (P.missiles <= 0 || !P.target || P.target.dead) return;
  P.mslCd = 0.8; P.missiles--; V2.set(0, 0, 1).applyQuaternion(P.q);
  shots.push({ homing: true, x: P.pos.x + V2.x * 12, y: P.pos.y - 3, z: P.pos.z + V2.z * 12, vx: P.vel.x, vy: P.vel.y, vz: P.vel.z, fx: V2.x, fy: V2.y, fz: V2.z, spd: Math.max(150, P.vel.length()), life: 9, dmg: 420, side: 'a', src: P.ship, tgt: P.target });
  FPVAudio.missile();
}
function cycleTarget(mode) {
  const prev = player.target, P = player;
  if (mode === 'awacs') { if (P.suggest && !P.suggest.dead) P.target = P.suggest; FPVAudio.lock(P.target && P.target !== prev); return; }
  const list = enemies.filter((e) => !e.dead && Math.hypot(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z) < 6000); if (!list.length) { P.target = null; return; }
  V2.set(0, 0, 1).applyQuaternion(P.q);
  if (mode === 'reticle') { let b = null, bs = -2; list.forEach((e) => { V.set(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z); const dist = V.length(); const sc = V.normalize().dot(V2) - dist * 0.00002 + (e.d.hp > 1000 ? 0.0 : 0.02); if (sc > bs) { bs = sc; b = e; } }); P.target = b; }
  else { list.sort((a, b) => Math.hypot(a.x - P.pos.x, a.y - P.pos.y, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.y - P.pos.y, b.z - P.pos.z)); const i = list.indexOf(P.target); P.target = list[(i + 1) % list.length]; }
  FPVAudio.lock(P.target && P.target !== prev);
}
/** 飛行員呼叫支援（空軍資料鏈）：只有「目標在自己射程內、且在資料鏈範圍內」的友軍才會響應。 */
function callSupport(type) {
  const P = player, tg = P.target; if (!tg || tg.dead) return { ok: false, why: 'noTarget' };
  if (P.supCd > 0) return { ok: false, why: 'cooling' };
  const R = datalinkRange(), cap = awacsUnit() ? 12 : 6, list = [];
  for (const u of allies) {
    if (u.dead || u.isPlayer || u.kind === 'awacs') continue;
    if (Math.hypot(u.x - P.pos.x, u.y - P.pos.y, u.z - P.pos.z) > R) continue;
    const reach = u.kind === 'fgt' ? 2600 : u.d.range * 1.15, dd = Math.hypot(u.x - tg.x, u.y - tg.y, u.z - tg.z);
    if (dd <= reach) list.push({ u, dd });
  }
  if (!list.length) return { ok: false, why: 'noOne' };
  list.sort((a, b) => a.dd - b.dd); const chosen = list.slice(0, cap), n = { fgt: 0, ship: 0, cap: 0 };
  chosen.forEach((c) => { n[c.u.d.cls === 'fgt' ? 'fgt' : c.u.d.cls === 'cap' ? 'cap' : 'ship']++; });
  issueOrder(chosen.map((c) => c.u), { type: type === 'focus' ? 'focus' : 'charge', tgt: tg, until: G.t + 30 });
  P.supCd = awacsUnit() ? 8 : 16;
  chosen.slice(0, 2).forEach((c, i) => fx.later(0.8 + i * 0.9, () => { if (!c.u.dead) radioSay(c.u, i ? 'pursue' : 'lock', true); }));
  return { ok: true, n, total: chosen.length };
}

/* ═════════ 角色切換：指揮官 ⇄ 飛行員 ═════════ */
function releaseToAI(s) {   // 玩家離開座艙：戰機交給 AI 當僚機
  if (!s || s.dead) return;
  V.set(0, 0, 1).applyQuaternion(player.q); s.h = Math.atan2(V.x, V.z); s.p = Math.asin(clamp(V.y, -1, 1)); s.roll = 0; s.q = null; s.isPlayer = false; s.hidden = false;
  s.spd = Math.max(95, player.vel.length()); s.vx = player.vel.x; s.vy = player.vel.y; s.vz = player.vel.z; s.mode = 0; s.mt = 0; s.order = null; s.thr = 0.6;
}
function seizeControl(s) {   // 玩家接手一架戰機
  const P = player; P.ship = s; s.isPlayer = true; s.q = P.q; s.order = null; s.tgt = null;
  P.pos.set(s.x, s.y, s.z); FWD(s, V); P.q.setFromUnitVectors(AXZ, V); const sp = Math.max(60, Math.hypot(s.vx, s.vy, s.vz)); P.vel.copy(V).multiplyScalar(sp); P.w.set(0, 0, 0); P.thr = clamp(sp / 170, 0.2, 0.8);
  P.dead = false; P.shield = P.shieldMax; P.hull = Math.max(P.hullMax * 0.6, s.hp / s.hpMax * P.hullMax); s.hidden = cam.mode === 'cockpit'; P.target = null;
}
function setRole(role, choice) {   // choice（切到飛行員時）：'orig' 回原機｜'hss' 從 HSS 重新起飛
  if (G.role === role && !choice) return;
  const P = player;
  if (role === 'commander') {
    if (P.ship && !P.dead && P.ship.isPlayer) releaseToAI(P.ship);
    G.role = 'commander'; FPVAudio.setScale(6);
  } else {
    G.role = 'pilot'; FPVAudio.setScale(1);
    if (choice === 'orig' && P.orig && !P.orig.dead) seizeControl(P.orig);
    else spawnPlayer('hss');
    cam.mode = cam.mode || 'cockpit'; chaseInit = false;
  }
  uiRoleChanged();
}

function flybys() {   // 敵機貼近玩家高速掠過時的「咻」聲
  const P = player; if (G.role !== 'pilot' || P.dead) return;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (e.dead || e.kind !== 'fly' || (e.flyT || 0) > G.t) continue;
    const dx = e.x - P.pos.x, dy = e.y - P.pos.y, dz = e.z - P.pos.z;
    if (dx * dx + dy * dy + dz * dz < 130 * 130) { e.flyT = G.t + 4; FPVAudio.flyby(e); }
  }
}
/* ═════════ 導演：劇本事件、末日、每幀步進 ═════════ */
function doomStep(dt) {
  if (G.t >= T.FLASH && !G.flashed) { G.flashed = true; G.control = false; uiFlashStart(); }
  if (G.t >= T.DOOM && G.doom === 0) { G.doom = 1; uiDoomStart(); }
  if (G.t >= T.IMPACT && !G.impacted) { G.impacted = true; G.waveR = 0; cam.shake = 5; FPVAudio.explode(14); uiImpact(); }
  if (G.impacted) {
    G.waveR += (2300 + (G.t - T.IMPACT) * 140) * dt;
    let big = 0;
    const kill = (arr) => { for (let i = 0; i < arr.length; i++) { const s = arr[i]; if (s.dead) continue; const d = Math.hypot(s.x - TOMB_POS.x, s.y - SWORD_END, s.z - TOMB_POS.z); if (d <= G.waveR) { if (s.d.boom >= 3 && big++ > 4) continue; if (s.isPlayer) player.dead = true; killShip(s, null); } } };
    kill(allies); kill(enemies);
  }
  if (G.t >= T.WHITE && !G.white) { G.white = true; uiWhite(); }
  if (G.t >= T.END && !G.ended) { G.ended = true; uiEnd(); }
}
function stepWorld(dt) {
  G.t += dt;
  if (G.mode === 'script') {
    uiScriptTick();
    if (G.t < T.REVEAL) return;
    if (G.t >= nextWave && G.t < T.FLASH - 10) { nextWave = G.t + Math.max(12, 18 - G.wave * 0.5); spawnWave(); }
    doomStep(dt);
  } else if (G.t >= nextWave) { nextWave = G.t + Math.max(13, 32 - G.wave * 1.8); spawnWave(); }
  if (G.mode === 'free' && !G.ironLocked && ironDmg >= IRON_FREE_DMG) { G.ironLocked = true; say('Irontomb integrity locked at 60% — it cannot be destroyed', '鐵墓完整度鎖定在 60%——無法被摧毀', true); }
  if (G.t >= nextReinf) { nextReinf = G.t + 11; reinforce(); }
  if (G.t >= nextLaunch) { nextLaunch = G.t + 7; launchFighters(); }
  if (G.t - lastAlloc > 2) { lastAlloc = G.t; allocateTargets(); }
  awacsLifecycle();
  for (let i = 0; i < allies.length; i++) { const s = allies[i]; if (s.dead || s.isPlayer) continue; if (s.kind === 'fgt') aiFighter(s, dt); else if (s.kind === 'awacs') aiAwacs(s, dt); else aiCapital(s, dt); }
  for (let i = 0; i < enemies.length; i++) { const s = enemies[i]; if (s.dead) continue; if (s.kind === 'fly') aiFighter(s, dt); else aiCapital(s, dt); }
  separateCaps(); stepPlayer(dt); stepShots(dt); stepBubbles(dt); stepBeams(dt); stepShields(dt); stepDamageFx(dt); flybys();
  for (let i = allies.length - 1; i >= 0; i--) if (allies[i].dead) allies.splice(i, 1);
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
  if (player.target && player.target.dead) player.target = null;
}
function initWorld() {
  spawnFleet();
  if (G.mode === 'script') { G.enemyHp = 0.8; G.enemyDmg = 0.75; nextWave = T.REVEAL + 1; } else { nextWave = 6; }
  for (let i = 0; i < 2; i++) { spawnWave(); nextWave = G.t + 28; }
  if (G.mode === 'script') nextWave = T.REVEAL + 14;
  if (G.role === 'pilot') seizeControl(player.orig);
}
