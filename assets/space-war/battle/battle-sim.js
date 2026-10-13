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
    scale: d.sc * (o && o.k ? o.k : 1), rad: d.rad * (o && o.k ? o.k : 1), vx: 0, vy: 0, vz: 0, cd: rnd(0, d.cd || 1), hx: x, hy: y, hz: z, tgt: null, mode: 0, mt: 0, id: ++nameN, cs: makeCallsign(kind), order: null, awTgt: null }, o || {});
  (d.side === 'a' ? allies : enemies).push(s); return s;
}
function mkFighter(kind, x, y, z, h) { const s = mkShip(kind, x, y, z, h); s.spd = DEF[kind].spd * rnd(0.85, 1.1); s.vx = Math.sin(h) * s.spd; s.vz = Math.cos(h) * s.spd; if (kind === 'fly') { s.hp = s.hpMax = s.d.hp * G.enemyHp; } return s; }
function spawnFleet() {
  mkShip('hss', 0, 150, -1500, Math.PI, { cd: 1.5 });
  [[-4300, 300, -3200], [4400, -250, -3900], [100, 2400, -4800]].forEach((p) => mkShip('moon', p[0], p[1], p[2], Math.PI));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.4; mkShip('cap', Math.cos(a) * 2300, Math.sin(a * 1.7) * 650, -3600 + Math.sin(a) * 1700, Math.PI); }
  for (let i = 0; i < 10; i++) mkShip('cruis', rnd(-1700, 1700), rnd(-500, 500), rnd(-5000, -2400), Math.PI + rnd(-0.1, 0.1));
  for (let i = 0; i < 24; i++) mkShip('frig', rnd(-2600, 2600), rnd(-700, 700), rnd(-6000, -3000), Math.PI + rnd(-0.1, 0.1));
  for (let i = 0; i < 30; i++) mkFighter('fgt', rnd(-900, 900), rnd(-300, 300), rnd(-4600, -2400), Math.PI);
  mkShip('awacs', 300, 700, -600, Math.PI);
  allies.forEach((s) => { if (s.d.hp > 1000) { s.hx = s.x; s.hy = s.y; s.hz = s.z - 1500; } });
  // 玩家的初始戰機（指揮官模式下由 AI 駕駛）
  const o = mkFighter('fgt', 2300, 380, 300, Math.PI); o.thr = 0.5; player.orig = player.ship = o; o.isOrig = true;
}
function spawnWave() {
  G.wave++;
  const w = G.wave, nW = Math.min(2 + Math.floor(w / 2), 8), nF = Math.min(14 + w * 4, 70);
  const live = enemies.filter((e) => e.kind === 'whale').length, liveF = enemies.length - live;
  const ox = rnd(-2500, 2500), oy = rnd(-600, 900), oz = w <= 2 ? -8300 : -10800;   // 開場兩波直接壓上來，之後從鐵墓方向湧出
  for (let i = 0; i < nW && live + i < 16; i++) { const s = mkShip('whale', ox + rnd(-1800, 1800), oy + rnd(-500, 500), oz + rnd(-1200, 400), 0, { k: rnd(0.8, 1.5) }); s.hp = s.hpMax = s.d.hp * (s.scale / s.d.sc) * G.enemyHp; }
  for (let i = 0; i < nF && liveF + i < 110; i++) { const s = mkFighter('fly', ox + rnd(-2200, 2200), oy + rnd(-700, 700), oz + rnd(-1500, 600), 0); s.mode = 0; }
  say('Antimatter Legion wave ' + w + ' emerging from the Irontomb', '反物質軍團第 ' + w + ' 波自鐵墓外圍湧出', true);
}
function cnt(k) { let n = 0; for (let i = 0; i < allies.length; i++) if (allies[i].kind === k && !allies[i].dead) n++; return n; }
function reinforce() {
  reinfN++;
  if (reinfN % 2 === 0 && cnt('cruis') < 10) { const s = mkShip('cruis', rnd(-2000, 2000), rnd(-500, 500), 2600, Math.PI); s.hx = rnd(-1800, 1800); s.hy = rnd(-500, 500); s.hz = rnd(-5500, -3000); s.vz = -8; say('Cruiser squadron joining the line', '巡洋艦中隊加入戰線', false); }
  if (reinfN % 5 === 0 && cnt('cap') < 6) { const s = mkShip('cap', rnd(-2000, 2000), rnd(-400, 400), 3200, Math.PI); s.hx = rnd(-2400, 2400); s.hy = rnd(-500, 500); s.hz = rnd(-5000, -3500); s.vz = -5; say('Dreadnought reinforcing the front', '無畏艦馳援前線', false); }
  if (cnt('frig') < 26) { const s = mkShip('frig', rnd(-2200, 2200), rnd(-500, 500), 2400, Math.PI); s.hx = rnd(-2600, 2600); s.hy = rnd(-600, 600); s.hz = rnd(-6500, -3500); s.vz = -12; say('Alliance reinforcements arriving', '聯軍增援抵達', false); }
}
function launchFighters() {   // 從 HSS 機庫起飛的戰機：聯軍的空中戰力持續補充
  const live = allies.filter((s) => s.kind === 'fgt' && !s.dead && !s.isPlayer).length, hss = allies.find((s) => s.kind === 'hss' && !s.dead);
  if (!hss || live >= 36) return;
  for (let i = 0; i < 3; i++) { const f = mkFighter('fgt', hss.x + rnd(-120, 120), hss.y + rnd(-60, 60), hss.z + 700, Math.PI); f.thr = 0.8; }
}

/* ═════════ 彈道、傷害、爆炸 ═════════ */
function fire(src, ox, oy, oz, dx, dy, dz, spd, dmg, w, len, col, life) {
  DBG.fired[src.kind] = (DBG.fired[src.kind] || 0) + 1;
  shots.push({ x: ox, y: oy, z: oz, vx: dx * spd, vy: dy * spd, vz: dz * spd, life: life || 3, dmg: src.side === 'e' ? dmg * G.enemyDmg : dmg, side: src.side, w, len, col, src, spd });
}
function impact(x, y, z, big, col) {
  if (!fx) return; const c = col || [1, 0.8, 0.5];
  fx.emit(x, y, z, 0, 0, 0, c[0], c[1], c[2], big * 14, 0.18, 0, 1);
  for (let i = 0; i < 4; i++) fx.emit(x, y, z, rnd(-1, 1) * big * 6, rnd(-1, 1) * big * 6, rnd(-1, 1) * big * 6, 1, 0.7, 0.3, big * 1.4, rnd(0.3, 0.7), 1.2);
}
function damage(s, dmg, x, y, z, src) {
  if (s.dead) return;
  if (s.isPlayer) { hurtPlayer(dmg); return; }
  if (src) { const k = src.kind + '>' + s.kind; DBG.hits[k] = (DBG.hits[k] || 0) + 1; DBG.dmg[k] = (DBG.dmg[k] || 0) + dmg; }
  if (s.d.hp > 1000 && src && src.kind === 'fgt') dmg *= dmg > 100 ? 10 : 6;   // 戰機武器針對艦艇的反艦倍率
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
function hitTest(sx, sy, sz, ex, ey, ez, side) {   // 線段與敵對艦艇球體相交（回傳最近者與命中點）
  const list = side === 'a' ? enemies : allies; let best = null, bt = 2;
  const dx = ex - sx, dy = ey - sy, dz = ez - sz, L2 = dx * dx + dy * dy + dz * dz || 1;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]; if (s.dead) continue;
    const rr = s.rad * (s.d.hp > 1000 ? 0.9 : 1), ox = s.x - sx, oy = s.y - sy, oz = s.z - sz;
    let tt = (ox * dx + oy * dy + oz * dz) / L2; tt = clamp(tt, 0, 1);
    const px = sx + dx * tt - s.x, py = sy + dy * tt - s.y, pz = sz + dz * tt - s.z;
    if (px * px + py * py + pz * pz < rr * rr && tt < bt) { bt = tt; best = s; }
  }
  return best ? { s: best, t: bt } : null;
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
function ironFrac() {
  if (G.mode !== 'script') return 1;
  const drip = Math.max(0, G.t - T.REVEAL) * 9000;
  return 0.8 + 0.2 * Math.exp(-(ironDmg + drip) / IRON_K);
}
function stepShots(dt) {
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
    if (dist < tg.rad + 14) { impact(m.x, m.y, m.z, 8, [1, 0.8, 0.4]); fx.explode(m.x, m.y, m.z, 1.4, true, 1); boomLight(m.x, m.y, m.z, 1.4, [1, 0.7, 0.4]); FPVAudio.explode(1.4, m); damage(tg, m.dmg, m.x, m.y, m.z, m.src); return false; }
  } else { m.spd = Math.min(m.spd + 330 * dt, 340); m.vx = m.fx * m.spd; m.vy = m.fy * m.spd; m.vz = m.fz * m.spd; }
  m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
  fx.emit(m.x, m.y, m.z, rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), 1, 0.7, 0.35, 5, 0.7, 1.5);
  fx.emit(m.x, m.y, m.z, 0, 0, 0, 1, 1, 0.9, 4, 0.05, 0, 0);
  return m.life > 0;
}

/* ═════════ AI 與命令 ═════════ */
function nearest(s, list, maxD, filter) {
  let best = null, bd = maxD * maxD;
  for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.dead || (filter && !filter(e))) continue; const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = e; } }
  return best;
}
function randomTarget(s, foes, range) {   // 射程內的敵艦隨機挑一個：火力分散到整個戰線
  let pick_ = null, n = 0;
  for (let i = 0; i < foes.length; i++) { const e = foes[i]; if (e.dead || e.isPlayer) continue; const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z; if (dx * dx + dy * dy + dz * dz < range * range && Math.random() * ++n < 1) pick_ = e; }
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
    fire(s, gun.x, gun.y, gun.z, V2.x + rnd(-0.012, 0.012), V2.y + rnd(-0.012, 0.012), V2.z + rnd(-0.012, 0.012), 1300, dmg, 0.35, 28, s.side === 'a' ? [0.4, 0.9, 1] : [1, 0.35, 0.8], 1.6);
    FPVAudio.fire(s.side === 'a' ? 'ally' : 'enemy', gun);
  }
}
function aiFighter(s, dt) {
  const foes = s.side === 'a' ? enemies : allies, d = s.d, o = s.side === 'a' ? activeOrder(s) : null;
  s.mt -= dt;
  let tg = s.tgt, spd = s.spd || d.spd;
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
    let wx = 0, wy = 0, wz = 0, sp = d.spd, face = null;
    if (s.mt <= 0) { s.tgt = allyCapitalTarget(s); s.mt = rnd(2.5, 4.5); }
    const auto = s.tgt && !s.tgt.dead ? s.tgt : null;
    if (o && o.type === 'move') {
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
      { const tt = nearest(s, enemies, 1e9); face = tt || { x: s.x, y: s.y, z: s.z - 1000 }; }
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
  s.cd -= dt;
  if (s.cd <= 0) {
    s.cd = d.cd * rnd(0.7, 1.3);
    const volley = d.bubble ? 1 : s.side === 'a' ? (s.kind === 'hss' ? 5 : s.kind === 'cap' ? 3 : s.kind === 'cruis' ? 2 : 1) : (s.kind === 'whale' ? 2 : 1);
    for (let v = 0; v < volley; v++) {
      let tg = fireTarget && Math.hypot(fireTarget.x - s.x, fireTarget.y - s.y, fireTarget.z - s.z) < d.range ? fireTarget : null;
      if (!tg && !(o && (o.type === 'focus' || o.type === 'tomb'))) {
        tg = (s.awTgt && !s.awTgt.dead && Math.random() < 0.5 && Math.hypot(s.awTgt.x - s.x, s.awTgt.y - s.y, s.awTgt.z - s.z) < d.range) ? s.awTgt : randomTarget(s, foes, d.range);
        if (!tg && s.side === 'a' && G.mode === 'script') { const tt = tombTarget(s); if (Math.hypot(tt.x - s.x, tt.y - s.y, tt.z - s.z) < d.range) tg = tt; }   // 射程內只剩鐵墓時，自主開火
      }
      if (!tg && s.side === 'e' && player.ship && player.ship.isPlayer && !player.dead && Math.hypot(player.ship.x - s.x, player.ship.y - s.y, player.ship.z - s.z) < d.range) tg = player.ship;
      if (!tg) return;
      if (d.bubble) { launchBubble(s, tg); return; }
      if (!tg.vx && tg.vx !== 0) tg.vx = tg.vy = tg.vz = 0;
      const gun = fleet.gunWorld(s, V); const aim = leadPoint(gun2(gun), tg, d.bs, V3);
      aim.x += rnd(-1, 1) * tg.rad * 0.5; aim.y += rnd(-1, 1) * tg.rad * 0.4; aim.z += rnd(-1, 1) * tg.rad * 0.5;
      V2.set(aim.x - gun.x, aim.y - gun.y, aim.z - gun.z).normalize();
      fire(s, gun.x, gun.y, gun.z, V2.x, V2.y, V2.z, d.bs, d.dmg, d.w, d.len, d.col, d.range / d.bs + 0.5);
      FPVAudio.cannon(gun);
    }
  }
}
function aiAwacs(s, dt) {   // 預警機：待在戰線後方盤旋，敵人逼近就後撤
  let cx = 0, cz = 0, n = 0;
  for (const a of allies) if (!a.dead && (a.kind === 'cap' || a.kind === 'hss' || a.kind === 'cruis')) { cx += a.x; cz += a.z; n++; }
  if (n) { cx /= n; cz /= n; } else { cx = 0; cz = -2000; }
  const near = nearest(s, enemies, 3000);
  let tx = cx + Math.sin(G.t * 0.03 + s.id) * 900, ty = 600 + Math.sin(G.t * 0.05) * 200, tz = cz + 2700;
  if (near) { V.set(s.x - near.x, 0, s.z - near.z).normalize(); tx = s.x + V.x * 2000; tz = s.z + V.z * 2000; }
  turnToward(s, tx, ty, tz, dt, s.d.turn); moveFwd(s, s.d.spd * (near ? 1.4 : 0.7), dt);
  if (s.z > TOMB_POS.z + 20000) s.z = TOMB_POS.z + 20000;
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
function launchBubble(s, tg) {   // 螺絲咕姆月球艦：巨型光束泡，抵達後範圍爆炸
  const gx = s.x + rnd(-1, 1) * 200, gy = s.y + rnd(-1, 1) * 200, gz = s.z + rnd(-1, 1) * 200, aim = leadPoint({ x: gx, y: gy, z: gz }, tg, s.d.bs, V3), ax = aim.x, ay = aim.y, az = aim.z;
  const dist = Math.hypot(ax - gx, ay - gy, az - gz), Tm = dist / s.d.bs;
  fx.beam(gx, gy, gz, ax, ay, az, { color: [1, 0.85, 0.35], width: 90, dur: Tm, len: 260 }); FPVAudio.cannon({ x: gx, y: gy, z: gz });
  fx.later(Tm, () => {
    fx.explode(ax, ay, az, 5, true, 14); boomLight(ax, ay, az, 6, [1, 0.8, 0.4]); FPVAudio.explode(10, { x: ax, y: ay, z: az });
    if (tg.isTomb) { ironDmg += 6000; return; }
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.dead) continue; const dd = Math.hypot(e.x - ax, e.y - ay, e.z - az); if (dd < 520 + e.rad) damage(e, 9000 * (1 - dd / (700 + e.rad)) + 800, e.x, e.y, e.z, s); }
  });
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
function spawnPlayer(where) {   // 'front' | 'hss'
  const P = player, hss = allies.find((s) => s.kind === 'hss' && !s.dead);
  if (where === 'hss' && hss) P.pos.set(hss.x + rnd(-200, 200), hss.y + rnd(-100, 100), hss.z + 760); else P.pos.set(2300 + rnd(-100, 100), 380, 300);
  P.vel.set(0, 0, -60); P.w.set(0, 0, 0); P.q.setFromAxisAngle(AXY, Math.PI); P.thr = 0.45; P.shield = P.shieldMax; P.hull = P.hullMax; P.energy = 100; P.heat = 100; P.missiles = 8; P.dead = false; P.target = null;
  if (G.deaths > 0 || where === 'hss') FPVAudio.respawn();
  const s = mkShip('fgt', P.pos.x, P.pos.y, P.pos.z, Math.PI); s.isPlayer = true; s.q = P.q; s.hidden = cam.mode === 'cockpit'; P.ship = s; if (!P.orig || P.orig.dead) { P.orig = s; s.isOrig = true; }
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
  const dc = P.pos.length(); let msg = '';
  if (dc > ARENA_R) { P.vel.addScaledVector(V.copy(P.pos).normalize(), -140 * dt); msg = 'leave'; }
  const dt_ = V.copy(P.pos).sub(TOMB_POS).length();
  if (dt_ < TOMB_AURA) { P.vel.addScaledVector(V.copy(P.pos).sub(TOMB_POS).normalize(), 220 * dt); msg = 'zone'; }
  setCenter(msg, !!msg);
  if (G.t - P.lastHit > 4) P.shield = Math.min(P.shieldMax, P.shield + 55 * dt);
  if (P.hull < P.hullMax * 0.35) FPVAudio.alarm();
  P.heat = clamp(P.heat + 24 * dt, 0, 100); P.fireCd -= dt; P.mslCd -= dt; P.supCd -= dt; P.mslT += dt; if (P.mslT > 14 && P.missiles < 8) { P.missiles++; P.mslT = 0; }
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
  fire(s, gun.x, gun.y, gun.z, V3.x, V3.y, V3.z, 1900 + P.vel.length() * 0.3, 16, 0.5, 34, [0.45, 0.95, 1], 2.1);
  FPVAudio.fire('player', { pan: gunSide < 2 ? -0.35 : 0.35 });
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
  } else if (G.t >= nextWave) { nextWave = G.t + Math.max(20, 38 - G.wave * 1.5); spawnWave(); }
  if (G.t >= nextReinf) { nextReinf = G.t + 20; reinforce(); }
  if (G.t >= nextLaunch) { nextLaunch = G.t + 7; launchFighters(); }
  if (G.t - lastAlloc > 2) { lastAlloc = G.t; allocateTargets(); }
  awacsLifecycle();
  for (let i = 0; i < allies.length; i++) { const s = allies[i]; if (s.dead || s.isPlayer) continue; if (s.kind === 'fgt') aiFighter(s, dt); else if (s.kind === 'awacs') aiAwacs(s, dt); else aiCapital(s, dt); }
  for (let i = 0; i < enemies.length; i++) { const s = enemies[i]; if (s.dead) continue; if (s.kind === 'fly') aiFighter(s, dt); else aiCapital(s, dt); }
  separateCaps(); stepPlayer(dt); stepShots(dt); flybys();
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
