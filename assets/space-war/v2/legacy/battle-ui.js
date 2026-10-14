/* battle-ui.js — 介面層：字幕與訊息、無線電、選單、飛行員 HUD、指揮官介面與輸入、劇本事件的畫面反應
 * 依賴 battle-core / render / sim 的全域。
 */
'use strict';
const L = () => STR[G.lang];
const logEl = $('#b-log'), briefEl = $('#b-brief'), objEl = $('#b-obj'), centerEl = $('#b-center'), flashEl = $('#b-flash'), veil = $('#b-veil'), radioEl = $('#b-radio'), bossEl = $('#b-boss'), topEl = $('#b-top'), cmdEl = $('#b-cmdbar'), hintEl = $('#b-hint');

/* ═════════ 訊息與字幕 ═════════ */
function say(en, zh, warn, brief) {   // 左上角播報：brief＝故事局勢概況（獨立區塊、停留較久）；其餘為艦隊流水訊息
  const host = brief ? briefEl : logEl, d = document.createElement('div'); d.dataset.en = en; d.dataset.zh = zh; d.textContent = G.lang === 'zh' ? zh : en; if (warn) d.className = 'warn'; host.appendChild(d);
  const life = brief ? 16000 : 7000; setTimeout(() => d.classList.add('out'), life); setTimeout(() => d.remove(), life + 1200); while (host.children.length > (brief ? 4 : 5)) host.firstChild.remove();
}
let objOn = false;
function setObjective(on) { if (on === objOn) return; objOn = on; objEl.classList.toggle('on', on); if (on) objEl.innerHTML = '<span class="b-obj-l">' + L().objLabel + '</span><b>' + L().objText + '</b>'; }
let centerOn = false, centerKey = '';
function setCenter(key, on) { if (on !== centerOn || (on && centerKey !== key)) { centerKey = key; centerEl.textContent = on ? L()[key] : ''; centerEl.classList.toggle('on', on); centerOn = on; } }
let flashT = 0;
function flash(a, blue) { flashEl.style.background = blue ? 'radial-gradient(ellipse at center, transparent 45%, rgba(60,160,255,.6) 100%)' : 'radial-gradient(ellipse at center, transparent 40%, rgba(255,40,70,.75) 100%)'; flashEl.style.opacity = a; clearTimeout(flashT); flashT = setTimeout(() => { flashEl.style.opacity = 0; }, 90); }
function setVeil(color, opacity, sec) { veil.style.transition = 'opacity ' + sec + 's linear'; veil.style.background = color; veil.style.opacity = opacity; }
function flashVeil(color, opacity, sec) { veil.style.transition = 'none'; veil.style.background = color; veil.style.opacity = opacity; void veil.offsetWidth; veil.style.transition = 'opacity ' + sec + 's ease-out'; veil.style.opacity = 0; }

const subs = {};
['cen', 'sub'].forEach((k) => { const el = $('#b-' + k); subs[k] = { el, who: el.querySelector('.b-who'), txt: el.querySelector('.b-txt'), cur: null, n: -1 }; });
const typed = (txt, p) => { const n = Math.ceil(txt.length * p); return txt.slice(0, n) + '<span class="b-ghost">' + txt.slice(n) + '</span>'; };
function updateSubs(t) {
  for (const k of ['center', 'sub']) {
    const S = subs[k === 'center' ? 'cen' : 'sub'], cur = CUES.find((c) => c.box === k && t >= c.t && t < c.t + c.dur) || null;
    if (cur !== S.cur) { S.cur = cur; S.n = -1; if (cur) { const w = WHO[cur.who]; S.who.textContent = G.lang === 'zh' ? w.zh + ' · ' + w.en : w.en; S.who.style.color = w.c; S.el.classList.add('on'); } else S.el.classList.remove('on'); }
    if (cur) { const p = clamp((t - cur.t) / cur.type, 0, 1), n = Math.ceil(p * 200); if (n !== S.n) { S.n = n; S.txt.innerHTML = typed(G.lang === 'zh' ? cur.zh : cur.en, p); } }
  }
}
let tickIdx = 0;
function uiScriptTick() {
  const t = G.t;
  if (t >= T.REVEAL && !G.revealed) { G.revealed = true; setVeil('#000', 0, 1.6); hudShow(true); }
  while (tickIdx < TICKS.length && t >= TICKS[tickIdx][0] && t < T.FLASH) { say(TICKS[tickIdx][2], TICKS[tickIdx][1], false, true); tickIdx++; }
  updateSubs(t);
  if (!objOn) { const oc = CUES.find((c) => c.obj); if (oc && t >= oc.t + oc.dur) setObjective(true); }   // 黑塔台詞淡出後，任務目標釘在左上角
}
function uiFlashStart() { flashVeil('#fff', 1, 0.35); setTimeout(() => { setVeil('#000', 1, 0.8); hudShow(false); }, 380); }
function uiDoomStart() { hudShow(false); setVeil('#000', 0, 1.6); FPVAudio.lance(); }
function uiImpact() { flashVeil('#ffd2dc', 0.9, 0.9); hurtK = 0.8; }
function uiWhite() { setVeil('#fff', 1, 4.5); }
function uiEnd() { setVeil('#000', 1, 2.2); FPVAudio.music(false); const e = $('#b-end'); e.classList.add('on'); const lines = e.querySelectorAll('.b-end-line'); lines.forEach((x, i) => setTimeout(() => x.classList.add('on'), 1200 + i * 3300)); }
function hudShow(on) { document.body.classList.toggle('hud-off', !on); }

/* ═════════ 無線電（飛行員模式，右側）：隨機呼號與台詞 ═════════ */
const radioLast = {}; let radioGate = 0;
function radioSay(u, cat, force) {
  if (G.role !== 'pilot' || !G.started || G.doom > 0 || !player.ship) return;
  const P = player, dist = Math.hypot(u.x - P.pos.x, u.y - P.pos.y, u.z - P.pos.z);
  if (!force && dist > (u.d.cls === 'fgt' ? 7000 : 9000)) return;
  const now = performance.now() / 1000;
  if (!force) { if (now < radioGate) return; if (radioLast[u.id] && now - radioLast[u.id] < 6) return; if ((cat === 'lock' || cat === 'pursue' || cat === 'kill') && Math.random() > 0.35) return; }
  radioGate = now + 0.9; radioLast[u.id] = now;
  const line = pick(RADIO[cat]), d = document.createElement('div'); d.className = 'rd ' + cat;
  d.innerHTML = '<b></b><span></span>'; d.children[0].textContent = u.cs; d.children[1].textContent = line[G.lang === 'zh' ? 1 : 0];
  if (cat === 'final') d.children[0].textContent = '✕ ' + u.cs;
  d.dataset.en = line[0]; d.dataset.zh = line[1];
  radioEl.appendChild(d); while (radioEl.children.length > 6) radioEl.firstChild.remove();
  setTimeout(() => d.classList.add('out'), cat === 'final' ? 11000 : 8000); setTimeout(() => d.remove(), cat === 'final' ? 12400 : 9400);
}

/* ═════════ 語言、選單、狀態列 ═════════ */
let selMode = 'script', selRole = 'pilot', musicOn = true;
function applyLang(l) {
  G.lang = l; try { localStorage.setItem('sw-lang', l); } catch (e) {}
  document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en'; document.title = STR[l].title;
  document.querySelectorAll('[data-i]').forEach((el) => { el.textContent = STR[l][el.dataset.i]; });
  $('#b-sub-t').textContent = STR[l].sub; $('#b-hint-t').textContent = selMode === 'script' ? STR[l].hintScript : STR[l].hintFree;
  $('#b-legal').innerHTML = STR[l].legal; renderKeys(); setQLabel();
  document.querySelectorAll('#b-log div, #b-brief div, #b-radio div').forEach((d) => { if (d.dataset.en) { const sp = d.querySelector('span'); (sp || d).textContent = l === 'zh' ? d.dataset.zh : d.dataset.en; } });
  const endLines = $('#b-end').querySelectorAll('.b-end-line'); STR[l].endA.forEach((x, i) => { if (endLines[i]) endLines[i].textContent = x; });
}
function renderKeys() { const keys = selRole === 'pilot' ? L().keysPilot : L().keysCmd; $('#b-keys').innerHTML = keys.map((k) => '<span>' + k + '</span>').join(''); }
function setQLabel() { const b = $('#b-q'); if (b) b.textContent = QUALITY === 'high' ? L().qHigh : L().qLow; }
function setSel(btnGroup, val) { document.querySelectorAll(btnGroup + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === val)); }
document.querySelectorAll('#b-mode button').forEach((b) => b.addEventListener('click', () => { selMode = b.dataset.v; setSel('#b-mode', selMode); $('#b-hint-t').textContent = selMode === 'script' ? L().hintScript : L().hintFree; }));
document.querySelectorAll('#b-rolesel button').forEach((b) => b.addEventListener('click', () => { selRole = b.dataset.v; setSel('#b-rolesel', selRole); renderKeys(); }));
$('#b-lang').addEventListener('click', () => applyLang(G.lang === 'en' ? 'zh' : 'en'));
$('#b-q').addEventListener('click', () => { QUALITY = QUALITY === 'high' ? 'low' : 'high'; try { localStorage.setItem('sw-q', QUALITY); } catch (e) {} setQLabel(); });
function uiRoleChanged() {
  document.body.classList.toggle('role-cmd', G.role === 'commander'); document.body.classList.toggle('role-pilot', G.role === 'pilot');
  if (G.role === 'commander') { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); selected.length = 0; const o = player.orig; if (o && !o.dead) { ccT.tx = o.x; ccT.tz = o.z; ccT.ty = 0; } else { ccT.tx = 0; ccT.tz = -3500; } ccT.dist = 9000; chooseEl.classList.remove('on'); }
  else { cv.requestPointerLock && cv.requestPointerLock(); selected.length = 0; setCenter('', false); }
  hintEl.innerHTML = G.role === 'pilot' ? L().toCmd : L().toPilot;
}

/* ═════════ 飛行員 HUD（Canvas） ═════════ */
function bracket(x, y, r, col, lw) { hx.strokeStyle = col; hx.lineWidth = lw || 1.5; const c = Math.max(5, r * 0.35); hx.beginPath();
  hx.moveTo(x - r, y - r + c); hx.lineTo(x - r, y - r); hx.lineTo(x - r + c, y - r); hx.moveTo(x + r - c, y - r); hx.lineTo(x + r, y - r); hx.lineTo(x + r, y - r + c);
  hx.moveTo(x + r, y + r - c); hx.lineTo(x + r, y + r); hx.lineTo(x + r - c, y + r); hx.moveTo(x - r + c, y + r); hx.lineTo(x - r, y + r); hx.lineTo(x - r, y + r - c); hx.stroke(); }
const fmtD = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
function bar(x, y, w, h, v, col, label) { hx.fillStyle = 'rgba(8,16,32,.7)'; hx.fillRect(x, y, w, h); hx.fillStyle = col; hx.fillRect(x + 1, y + 1, (w - 2) * clamp(v, 0, 1), h - 2); hx.strokeStyle = 'rgba(143,230,255,.35)'; hx.strokeRect(x, y, w, h); hx.fillStyle = '#9fb4cc'; hx.font = '10px "Space Mono", monospace'; hx.textAlign = 'left'; hx.fillText(label, x, y - 4); }
let hudMsg = '', hudMsgT = 0, hudMsgCol = '#8fe6ff';
function hudNote(txt, col) { hudMsg = txt; hudMsgT = 3.2; hudMsgCol = col || '#8fe6ff'; }
function drawFlare() {
  camera.getWorldDirection(V); const d = V.dot(SUN_DIR); if (d < 0.25) return;
  const sp = toScreen(cam.x + SUN_DIR.x * 20000, cam.y + SUN_DIR.y * 20000, cam.z + SUN_DIR.z * 20000); if (!sp.ok) return;
  const k = clamp((d - 0.25) / 0.75, 0, 1), cx = W / 2, cy = H / 2, R = Math.min(W, H);
  hx.save(); hx.globalCompositeOperation = 'lighter';
  const g = hx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R * 0.45); g.addColorStop(0, 'rgba(255,240,215,' + (0.55 * k) + ')'); g.addColorStop(0.25, 'rgba(255,200,150,' + (0.14 * k) + ')'); g.addColorStop(1, 'rgba(255,170,120,0)'); hx.fillStyle = g; hx.fillRect(0, 0, W, H);
  const ghosts = [[-0.35, 0.05, '120,170,255', 0.10], [0.45, 0.09, '255,170,110', 0.08], [0.9, 0.03, '150,255,200', 0.10], [1.35, 0.16, '255,120,170', 0.05], [-0.8, 0.07, '255,230,150', 0.06]];
  for (const q of ghosts) { const x = sp.x + (cx - sp.x) * (1 + q[0]), y = sp.y + (cy - sp.y) * (1 + q[0]), r = R * q[1], gg = hx.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'rgba(' + q[2] + ',' + (q[3] * k) + ')'); gg.addColorStop(0.7, 'rgba(' + q[2] + ',' + (q[3] * k * 0.5) + ')'); gg.addColorStop(1, 'rgba(' + q[2] + ',0)'); hx.fillStyle = gg; hx.beginPath(); hx.arc(x, y, r, 0, TAU); hx.fill(); }
  hx.restore();
}
/* 飛彈補給導引：琥珀色閃爍標記指向最近的補給艦（HSS／無畏艦），靠近後顯示 2 秒補給進度 */
function drawSupplyGuide(sc, cx, cy, S) {
  const P = player, T2 = P.supplyTgt; if (!P.needSupply || !T2 || T2.dead) return;
  const dd = Math.hypot(T2.x - P.pos.x, T2.y - P.pos.y, T2.z - P.pos.z), on = toScreen(T2.x, T2.y, T2.z), bl = 0.8 + 0.2 * Math.sin(G.t * 8), col = 'rgba(255,200,70,' + bl + ')';
  const name = T2.kind === 'hss' ? 'HSS' : T2.kind === 'xzd' ? 'XIANZHOU' : 'DREADNOUGHT';
  hx.textAlign = 'center'; hx.font = '14px "Space Mono"'; const msg = S.resupply + ' ' + name + ' · ' + fmtD(dd), tw = hx.measureText(msg).width + 24; hx.fillStyle = 'rgba(30,18,0,.7)'; hx.fillRect(cx - tw / 2, cy - 150 * sc - 12, tw, 24); hx.fillStyle = col; hx.fillText(msg, cx, cy - 150 * sc);
  const inside = on.ok && on.x > 0 && on.x < W && on.y > 0 && on.y < H;
  if (inside) {
    const r = clamp(T2.rad / Math.max(dd, 1) * pixelsPerRad(), 16, 140); hx.strokeStyle = col; hx.lineWidth = 2; hx.beginPath(); hx.moveTo(on.x, on.y - r); hx.lineTo(on.x + r, on.y); hx.lineTo(on.x, on.y + r); hx.lineTo(on.x - r, on.y); hx.closePath(); hx.stroke();
    hx.font = '11px "Space Mono"'; hx.fillStyle = col; hx.fillText('RESUPPLY', on.x, on.y - r - 10);
  } else {
    V.set(T2.x - P.pos.x, T2.y - P.pos.y, T2.z - P.pos.z); V.applyQuaternion(QT.copy(P.q).invert()); let ax = -V.x, ay = -V.y; const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m;
    const px = cx + ax * Math.min(W, H) * 0.4, py = cy + ay * Math.min(W, H) * 0.4; hx.fillStyle = col; hx.beginPath(); hx.moveTo(px + ax * 16, py + ay * 16); hx.lineTo(px - ay * 10 - ax * 8, py + ax * 10 - ay * 8); hx.lineTo(px + ay * 10 - ax * 8, py - ax * 10 - ay * 8); hx.fill();
  }
  if (P.resT > 0.01) {
    const bw = 170 * Math.max(0.7, sc), bx = cx - bw / 2, by = cy + 120 * sc, k = clamp(P.resT / RESUPPLY_TIME, 0, 1);
    hx.fillStyle = 'rgba(255,190,60,.25)'; hx.fillRect(bx, by, bw, 7); hx.fillStyle = '#ffbe3c'; hx.fillRect(bx, by, bw * k, 7);
    hx.font = '11px "Space Mono"'; hx.fillStyle = '#ffd98a'; hx.textAlign = 'center'; hx.fillText(S.resupplying + ' ' + Math.round(k * 100) + '%', cx, by - 8);
  }
}
function drawPilotHud(dt) {
  const P = player, cx = W / 2, cy = H / 2, sc = Math.min(W, H) / 720, S = L();
  hx.font = '11px "Space Mono", monospace'; hx.textBaseline = 'middle';
  if (P.dead) { hx.fillStyle = 'rgba(255,255,255,.8)'; hx.textAlign = 'center'; hx.font = '16px "Space Mono"'; hx.fillText(S.youLost + ' ' + Math.ceil(Math.max(0, P.respawn)), cx, cy); return; }
  hx.strokeStyle = 'rgba(143,255,230,.85)'; hx.lineWidth = 1.5; hx.beginPath(); hx.arc(cx, cy, 14 * sc, 0, TAU); hx.moveTo(cx - 24 * sc, cy); hx.lineTo(cx - 8 * sc, cy); hx.moveTo(cx + 8 * sc, cy); hx.lineTo(cx + 24 * sc, cy); hx.moveTo(cx, cy - 24 * sc); hx.lineTo(cx, cy - 8 * sc); hx.stroke();
  if (P.vel.length() > 8) { V.copy(P.vel).normalize().multiplyScalar(500).add(P.pos); const v = toScreen(V.x, V.y, V.z); if (v.ok) { hx.strokeStyle = 'rgba(255,230,120,.9)'; hx.beginPath(); hx.arc(v.x, v.y, 6 * sc, 0, TAU); hx.moveTo(v.x - 12 * sc, v.y); hx.lineTo(v.x - 6 * sc, v.y); hx.moveTo(v.x + 6 * sc, v.y); hx.lineTo(v.x + 12 * sc, v.y); hx.moveTo(v.x, v.y - 6 * sc); hx.lineTo(v.x, v.y - 12 * sc); hx.stroke(); } }
  const cand = []; for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.dead) continue; const d = Math.hypot(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z); if (d < 5500) cand.push({ e, d }); }
  cand.sort((a, b) => a.d - b.d); let n = 0; const pxr = pixelsPerRad();
  for (const c of cand) {
    const e = c.e, s = toScreen(e.x, e.y, e.z); if (!s.ok) continue; const isT = e === P.target, isS = e === P.suggest;
    const r = clamp(e.rad / c.d * pxr, 7, 160), col = isT ? '#ffd24a' : 'rgba(255,90,110,.85)';
    if (n++ > 24 && !isT && !isS) continue; bracket(s.x, s.y, r, col, isT ? 2 : 1.2);
    if (isS && !isT) { hx.strokeStyle = '#7dffb0'; hx.beginPath(); hx.moveTo(s.x, s.y - r - 12); hx.lineTo(s.x + 7, s.y - r - 5); hx.lineTo(s.x, s.y - r + 2); hx.lineTo(s.x - 7, s.y - r - 5); hx.closePath(); hx.stroke(); hx.fillStyle = '#7dffb0'; hx.textAlign = 'center'; hx.fillText(S.tasking, s.x, s.y - r - 20); }
    if (isT || r > 30) { hx.fillStyle = col; hx.textAlign = 'left'; hx.fillText(e.d.name + ' · ' + fmtD(c.d), s.x + r + 6, s.y - 4); hx.fillStyle = 'rgba(255,90,110,.25)'; hx.fillRect(s.x + r + 6, s.y + 5, 60, 4); hx.fillStyle = col; hx.fillRect(s.x + r + 6, s.y + 5, 60 * clamp(e.hp / e.hpMax, 0, 1), 4); if (e.shMax) { hx.fillStyle = 'rgba(90,170,255,.25)'; hx.fillRect(s.x + r + 6, s.y + 11, 60, 3); hx.fillStyle = e.sh > 0 ? '#5aaaff' : 'rgba(255,255,255,.35)'; hx.fillRect(s.x + r + 6, s.y + 11, 60 * clamp(e.sh / e.shMax, 0, 1), 3); } }
  }
  const T_ = P.target;
  if (T_ && !T_.dead) {
    const lp = leadPoint(P.pos, { x: T_.x, y: T_.y, z: T_.z, vx: T_.vx, vy: T_.vy, vz: T_.vz }, 1900 + P.vel.length() * 0.3, V3), l = toScreen(lp.x, lp.y, lp.z), t0 = toScreen(T_.x, T_.y, T_.z);
    if (l.ok) { hx.strokeStyle = '#ffd24a'; hx.beginPath(); hx.arc(l.x, l.y, 8 * sc, 0, TAU); hx.stroke(); }
    if (!t0.ok || t0.x < 0 || t0.x > W || t0.y < 0 || t0.y > H) {
      V.set(T_.x - P.pos.x, T_.y - P.pos.y, T_.z - P.pos.z); V.applyQuaternion(QT.copy(P.q).invert()); let ax = -V.x, ay = -V.y; const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m;
      const px = cx + ax * Math.min(W, H) * 0.38, py = cy + ay * Math.min(W, H) * 0.38; hx.fillStyle = '#ffd24a'; hx.beginPath(); hx.moveTo(px + ax * 14, py + ay * 14); hx.lineTo(px - ay * 8 - ax * 6, py + ax * 8 - ay * 6); hx.lineTo(px + ay * 8 - ax * 6, py - ax * 8 - ay * 6); hx.fill();
    }
  }
  allies.forEach((a) => {   // 友軍旗艦、月球艦、預警機的標記
    if (a.dead || (a.kind !== 'hss' && a.kind !== 'moon' && a.kind !== 'xzd' && a.kind !== 'awacs')) return; const s = toScreen(a.x, a.y, a.z); if (!s.ok) return; const d = Math.hypot(a.x - P.pos.x, a.y - P.pos.y, a.z - P.pos.z); if (d < a.rad * 1.2) return;
    hx.fillStyle = a.kind === 'awacs' ? 'rgba(143,230,255,.85)' : 'rgba(255,217,138,.8)'; hx.textAlign = 'center'; hx.fillText(a.kind === 'hss' ? 'HSS' : a.kind === 'moon' ? 'SCREWLLUM' : a.kind === 'xzd' ? 'XIANZHOU' : a.cs, s.x, s.y - 14); hx.fillStyle = 'rgba(255,255,255,.5)'; hx.fillText(fmtD(d), s.x, s.y); });
  drawSupplyGuide(sc, cx, cy, S);
  const tp = toScreen(TOMB_POS.x, TOMB_POS.y + 800, TOMB_POS.z), td = P.pos.distanceTo(TOMB_POS);
  if (tp.ok) { hx.fillStyle = 'rgba(255,90,120,.9)'; hx.textAlign = 'center'; hx.fillText('IRONTOMB · ' + fmtD(td), tp.x, tp.y - 6); if (G.mode === 'free') { hx.fillStyle = 'rgba(255,170,190,.7)'; hx.fillText(S.integrity + ' ' + (100 - ironDmg / 1e9).toFixed(6) + '%', tp.x, tp.y + 10); } }
  const bx = 18, by = H - 92, bw = 170 * Math.max(0.7, sc); bar(bx, by, bw, 8, P.shield / P.shieldMax, '#4aa8ff', 'SHIELD'); bar(bx, by + 24, bw, 8, P.hull / P.hullMax, P.hull / P.hullMax < 0.35 ? '#ff4466' : '#7dffb0', 'HULL');
  bar(bx, by + 48, bw, 6, P.heat / 100, '#ffd24a', 'LASER CAP'); bar(bx + bw + 20, by + 48, 80, 6, P.energy / 100, '#ff9a4a', 'BOOST');
  const aw = awacsUnit(); hx.textAlign = 'left'; hx.fillStyle = aw ? '#7dffb0' : '#ffb04a'; hx.fillText(aw ? S.awacsOn + ' · ' + aw.cs : S.awacsOff, bx, by - 22);
  if (P.supCd > 0) { hx.fillStyle = '#9fb4cc'; hx.fillText('COMMS ' + Math.ceil(P.supCd) + 's', bx + bw + 20, by - 22); }
  hx.fillStyle = '#cfe9ff'; hx.textAlign = 'right'; hx.font = '12px "Space Mono"'; const spd = P.vel.length();
  hx.fillText('SPD ' + Math.round(spd) + ' m/s' + (P.boost ? '  AB' : '') + (P.assist ? '' : '  FA-OFF'), W - 18, H - 92); hx.fillText('THR ' + Math.round(P.thr * 100) + '%', W - 18, H - 74);
  if (P.needSupply) hx.fillStyle = 'rgba(255,' + Math.round(170 + 60 * Math.sin(G.t * 8)) + ',60,1)';   // 剩 2 發以下：飛彈欄位閃爍
  hx.fillText('MSL ' + P.missiles + '/8  KILLS ' + P.kills + '  FLEET ' + allies.filter((s) => s.d.hp > 1000).length + '  HOSTILE ' + enemies.length, W - 18, H - 56);
  hx.fillText(G.mode === 'script' ? 'T+' + Math.floor(Math.max(0, G.t - T.REVEAL) / 60) + ':' + String(Math.floor(Math.max(0, G.t - T.REVEAL) % 60)).padStart(2, '0') : 'WAVE ' + G.wave + '  T+' + Math.floor(G.t / 60) + ':' + String(Math.floor(G.t % 60)).padStart(2, '0'), W - 18, H - 38);
  if (hudMsgT > 0) { hudMsgT -= dt; hx.textAlign = 'center'; hx.fillStyle = hudMsgCol; hx.font = '13px "Space Mono"'; hx.fillText(hudMsg, cx, cy + 90 * sc); }
  // 雷達（機身座標的球形投影；有預警機時視距大幅延伸）
  const rr = 62 * Math.max(0.8, sc), rx = W - rr - 20, ry = 20 + rr, RANGE = aw ? 12000 : 4500; hx.fillStyle = 'rgba(6,14,28,.6)'; hx.beginPath(); hx.arc(rx, ry, rr, 0, TAU); hx.fill(); hx.strokeStyle = 'rgba(143,230,255,.35)'; hx.beginPath(); hx.arc(rx, ry, rr, 0, TAU); hx.arc(rx, ry, rr * 0.5, 0, TAU); hx.moveTo(rx - rr, ry); hx.lineTo(rx + rr, ry); hx.moveTo(rx, ry - rr); hx.lineTo(rx, ry + rr); hx.stroke();
  QT2.copy(P.q).invert();
  const blip = (e, col, sz) => { V.set(e.x - P.pos.x, e.y - P.pos.y, e.z - P.pos.z).applyQuaternion(QT2); const d = V.length(); if (d > RANGE) return; const k = Math.sqrt(d / RANGE) / (d || 1); const x = rx - V.x * k * rr, y = ry - V.z * k * rr; hx.fillStyle = col; hx.fillRect(x - sz / 2, y - sz / 2, sz, sz); if (Math.abs(V.y) > 80) hx.fillRect(x, y, 1, V.y > 0 ? -5 : 5); };
  allies.forEach((a) => { if (!a.dead && !a.isPlayer) blip(a, a.kind === 'awacs' ? '#7dffb0' : 'rgba(120,220,255,.9)', a.d.hp > 1000 ? 4 : 2); });
  enemies.forEach((e) => { if (!e.dead) blip(e, e === P.target ? '#ffd24a' : '#ff5a6e', e.d.hp > 1000 ? 4 : 2); });
  hx.fillStyle = '#fff'; hx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
}

/* ═════════ 指揮官：選取、命令、相機、HUD ═════════ */
const selected = [];   // 目前選取的友軍
const marks = [];      // 命令標記：{x,y,z,t,col}
const drag = { on: false, x0: 0, y0: 0, x1: 0, y1: 0, shift: false, rot: false, moved: false };
const cmdKeys = {};
function selectUnits(list, add) { if (!add) selected.length = 0; for (const u of list) { if (!u.dead && selected.indexOf(u) < 0) selected.push(u); } updateCmdBar(); }
function selectedAlive() { for (let i = selected.length - 1; i >= 0; i--) if (selected[i].dead) selected.splice(i, 1); return selected; }
function orderable() { return selectedAlive().filter((u) => u.kind !== 'awacs'); }
function cmdMark(x, y, z, col) { marks.push({ x, y, z, t: 0, col }); }
function orderMove(x, y, z) { const us = orderable(); if (!us.length) return; issueOrder(us, { type: 'move', x, y, z }); cmdMark(x, y, z, '#8fe6ff'); FPVAudio.lock(true); }
function orderCharge() { const us = orderable(); if (!us.length) return; issueOrder(us, { type: 'charge' }); hudNote(L().charge.toUpperCase(), '#ffb04a'); }
function orderHold() { const us = orderable(); if (!us.length) return; issueOrder(us, { type: 'hold' }); }
function orderFocus(tg) { const us = orderable(); if (!us.length) return; issueOrder(us, { type: 'focus', tgt: tg }); cmdMark(tg.x, tg.y, tg.z, '#ff5a6e'); FPVAudio.lock(true); }
function orderTomb() { const us = orderable(); if (!us.length) return; issueOrder(us, { type: 'tomb' }); cmdMark(TOMB_POS.x, TOMB_POS.y + 800, TOMB_POS.z, '#ff3b5c'); FPVAudio.lock(true); }
function updateCmdBar() { const n = selectedAlive().length; $('#b-n-sel').textContent = n; }
function pickScreen(list, mx, my, maxPx) {   // 螢幕上最接近滑鼠的單位
  let best = null, bd = maxPx * maxPx; const pxr = pixelsPerRad();
  for (const u of list) { if (u.dead) continue; const s = toScreen(u.x, u.y, u.z); if (!s.ok) continue; const d = Math.hypot(u.x - cam.x, u.y - cam.y, u.z - cam.z), r = Math.max(6, u.rad / d * pxr), dd = (s.x - mx) ** 2 + (s.y - my) ** 2, lim = Math.max(maxPx, r) ** 2; if (dd < lim && dd - r * r * 0.2 < bd) { bd = dd - r * r * 0.2; best = u; } }
  return best;
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function groundPoint(mx, my, y0) {
  ndc.set(mx / W * 2 - 1, -(my / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction; if (Math.abs(d.y) < 1e-4) return null; const t = (y0 - o.y) / d.y; if (t < 0) return null; return new THREE.Vector3(o.x + d.x * t, y0, o.z + d.z * t);
}
function tombUnderCursor(mx, my) {
  ndc.set(mx / W * 2 - 1, -(my / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  for (let i = 0; i < TOMB_PARTS.length; i++) { const P = TOMB_PARTS[i]; V3.set(TOMB_POS.x + P[0] * TOMB_SCALE, TOMB_POS.y + P[1] * TOMB_SCALE, TOMB_POS.z + P[2] * TOMB_SCALE); if (ray.ray.distanceSqToPoint(V3) < (P[3] * TOMB_SCALE * 1.15) ** 2) return true; }
  return false;
}
function cmdClick(mx, my) {
  const e = pickScreen(enemies, mx, my, 16);
  if (e) { orderFocus(e); return; }
  if (tombUnderCursor(mx, my)) { orderTomb(); return; }
  const a = pickScreen(allies, mx, my, 12);
  if (a && !a.isPlayer) { selectUnits([a], drag.shift); return; }
  const us = orderable(); if (!us.length) return;
  let y0 = 0; us.forEach((u) => { y0 += u.y; }); y0 /= us.length;
  const g = groundPoint(mx, my, y0); if (g) { const dd = Math.hypot(g.x - TOMB_POS.x, g.z - TOMB_POS.z); if (dd < TOMB_AURA + 200) { const f = (TOMB_AURA + 200) / (dd || 1); g.x = TOMB_POS.x + (g.x - TOMB_POS.x) * f; g.z = TOMB_POS.z + (g.z - TOMB_POS.z) * f; } orderMove(g.x, g.y, g.z); }
}
function boxSelect() {
  const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1), list = [];
  for (const u of allies) { if (u.dead) continue; const s = toScreen(u.x, u.y, u.z); if (s.ok && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) list.push(u); }
  selectUnits(list, drag.shift);
}
function selectGroup(n) {
  const all = allies.filter((u) => !u.dead && u.kind !== 'awacs');
  selectUnits(n === 1 ? all : n === 2 ? all.filter((u) => u.kind === 'fgt') : all.filter((u) => u.d.cls === 'cap' || u.kind === 'cruis' || u.kind === 'ipc'), false);
}
function updateCommanderCamera(dt) {
  const k = cmdKeys, sp = ccT.dist * 0.8 * dt * (k.ShiftLeft ? 2.5 : 1), f = [-Math.sin(ccT.az), -Math.cos(ccT.az)], r = [Math.cos(ccT.az), -Math.sin(ccT.az)];
  const ax = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), az = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
  ccT.tx += (r[0] * ax + f[0] * az) * sp; ccT.tz += (r[1] * ax + f[1] * az) * sp;
}
function drawIcon(x, y, kind, col, sz) {
  hx.fillStyle = col; hx.strokeStyle = col;
  if (kind === 'fgt') { hx.fillRect(x - 1, y - 1, 2.2, 2.2); return; }
  if (kind === 'cap') { hx.beginPath(); hx.arc(x, y, sz, 0, TAU); hx.fill(); return; }
  if (kind === 'awacs') { hx.beginPath(); hx.moveTo(x, y - sz); hx.lineTo(x + sz, y); hx.lineTo(x, y + sz); hx.lineTo(x - sz, y); hx.closePath(); hx.stroke(); return; }
  hx.beginPath(); hx.moveTo(x, y - sz); hx.lineTo(x + sz * 0.9, y + sz * 0.8); hx.lineTo(x - sz * 0.9, y + sz * 0.8); hx.closePath(); hx.fill();
}
function drawCommanderHud(dt) {
  const S = L(), pxr = pixelsPerRad(); hx.font = '10px "Space Mono", monospace'; hx.textBaseline = 'middle';
  const sel = new Set(selectedAlive());
  const draw = (list, enemy) => {
    for (let i = 0; i < list.length; i++) {
      const u = list[i]; if (u.dead) continue; const s = toScreen(u.x, u.y, u.z); if (!s.ok || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) continue;
      const d = Math.hypot(u.x - cam.x, u.y - cam.y, u.z - cam.z), r = u.rad / d * pxr, isSel = sel.has(u), col = enemy ? '#ff5a6e' : isSel ? '#ffffff' : '#6ad4ff';
      const kind = u.kind === 'awacs' ? 'awacs' : u.d.cls === 'fgt' ? 'fgt' : u.d.cls === 'cap' ? 'cap' : 'ship';
      if (r < 7) { drawIcon(s.x, s.y, kind, col, kind === 'cap' ? 4.5 : 3.5); }
      else if (!enemy && (isSel || u.d.hp > 1000)) bracket(s.x, s.y, Math.min(r, 90), col, isSel ? 1.8 : 1);
      else if (enemy && u.d.hp > 1000) bracket(s.x, s.y, Math.min(r, 90), '#ff5a6e', 1.2);
      if (isSel && r < 7) { hx.strokeStyle = '#fff'; hx.beginPath(); hx.arc(s.x, s.y, 7, 0, TAU); hx.stroke(); }
      if (u.hp < u.hpMax && (isSel || u.d.hp > 8000)) { const w = 22; hx.fillStyle = 'rgba(0,0,0,.5)'; hx.fillRect(s.x - w / 2, s.y + Math.max(7, r) + 3, w, 3); hx.fillStyle = enemy ? '#ff5a6e' : '#7dffb0'; hx.fillRect(s.x - w / 2, s.y + Math.max(7, r) + 3, w * clamp(u.hp / u.hpMax, 0, 1), 3); }
      if (!enemy && (u.kind === 'hss' || u.kind === 'moon' || u.kind === 'xzd' || u.kind === 'awacs' || u.isOrig)) { hx.fillStyle = u.isOrig ? '#ffd24a' : u.kind === 'awacs' ? '#7dffb0' : 'rgba(255,217,138,.9)'; hx.textAlign = 'center'; hx.fillText(u.isOrig ? 'YOU · ' + u.cs : u.kind === 'hss' ? 'HSS' : u.kind === 'moon' ? 'SCREWLLUM' : u.kind === 'xzd' ? 'XIANZHOU' : u.cs, s.x, s.y - Math.max(8, Math.min(r, 90)) - 7); }
      else if (enemy && u.kind === 'whale' && r > 4) { hx.fillStyle = 'rgba(255,120,140,.7)'; hx.textAlign = 'center'; hx.fillText('CARRIER', s.x, s.y - Math.max(8, Math.min(r, 90)) - 7); }
    }
  };
  draw(enemies, true); draw(allies, false);
  // 命令線：選取單位 → 目的地／目標
  hx.lineWidth = 1; let drawn = 0;
  for (const u of sel) { const o = u.order; if (!o || drawn > 40) continue; let tx, ty, tz, col; if (o.type === 'move') { tx = o.x; ty = o.y; tz = o.z; col = 'rgba(143,230,255,.35)'; } else if (o.type === 'focus' && o.tgt && !o.tgt.dead) { tx = o.tgt.x; ty = o.tgt.y; tz = o.tgt.z; col = 'rgba(255,90,110,.4)'; } else if (o.type === 'tomb') { tx = TOMB_POS.x; ty = TOMB_POS.y + 800; tz = TOMB_POS.z; col = 'rgba(255,60,90,.35)'; } else continue; const a = toScreen(u.x, u.y, u.z), b = toScreen(tx, ty, tz); if (a.ok && b.ok) { hx.strokeStyle = col; hx.beginPath(); hx.moveTo(a.x, a.y); hx.lineTo(b.x, b.y); hx.stroke(); drawn++; } }
  for (let i = marks.length - 1; i >= 0; i--) { const m = marks[i]; m.t += dt; if (m.t > 2.2) { marks.splice(i, 1); continue; } const s = toScreen(m.x, m.y, m.z); if (!s.ok) continue; const k = m.t / 2.2; hx.strokeStyle = m.col; hx.globalAlpha = 1 - k; hx.beginPath(); hx.arc(s.x, s.y, 8 + k * 26, 0, TAU); hx.stroke(); hx.globalAlpha = 1; }
  // 鐵墓標記
  const tp = toScreen(TOMB_POS.x, TOMB_POS.y + 800, TOMB_POS.z); if (tp.ok) { hx.fillStyle = 'rgba(255,90,120,.9)'; hx.textAlign = 'center'; hx.font = '12px "Space Mono"'; hx.fillText('IRONTOMB', tp.x, tp.y - 8); }
  // 框選
  if (drag.on && !drag.rot && drag.moved) { hx.strokeStyle = 'rgba(143,230,255,.9)'; hx.fillStyle = 'rgba(143,230,255,.08)'; const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0); hx.fillRect(x, y, w, h); hx.strokeRect(x, y, w, h); }
  // 小地圖（右下）：俯視整個戰區，點擊可移動相機
  const mw = Math.min(190, W * 0.3), mh = mw, mx0 = W - mw - 14, my0 = H - mh - 14, X0 = -13000, X1 = 13000, Z0 = TOMB_POS.z - 13000, Z1 = TOMB_POS.z + 13000;
  hx.fillStyle = 'rgba(6,14,28,.7)'; hx.fillRect(mx0, my0, mw, mh); hx.strokeStyle = 'rgba(143,230,255,.35)'; hx.strokeRect(mx0, my0, mw, mh);
  const mp = (x, z) => [mx0 + (x - X0) / (X1 - X0) * mw, my0 + (z - Z0) / (Z1 - Z0) * mh];
  const tpp = mp(TOMB_POS.x, TOMB_POS.z); hx.strokeStyle = 'rgba(255,60,90,.6)'; hx.beginPath(); hx.arc(tpp[0], tpp[1], TOMB_AURA / (X1 - X0) * mw, 0, TAU); hx.stroke();
  for (const e of enemies) { if (e.dead) continue; const p = mp(e.x, e.z); hx.fillStyle = '#ff5a6e'; hx.fillRect(p[0] - 1, p[1] - 1, e.d.hp > 1000 ? 3 : 1.5, e.d.hp > 1000 ? 3 : 1.5); }
  for (const a of allies) { if (a.dead) continue; const p = mp(a.x, a.z); hx.fillStyle = sel.has(a) ? '#fff' : a.kind === 'awacs' ? '#7dffb0' : '#6ad4ff'; hx.fillRect(p[0] - 1, p[1] - 1, a.d.hp > 1000 ? 3 : 1.5, a.d.hp > 1000 ? 3 : 1.5); }
  const cp = mp(cc.tx, cc.tz); hx.strokeStyle = '#ffd24a'; hx.strokeRect(cp[0] - 5, cp[1] - 5, 10, 10);
  MINI.x = mx0; MINI.y = my0; MINI.w = mw; MINI.h = mh; MINI.X0 = X0; MINI.X1 = X1; MINI.Z0 = Z0; MINI.Z1 = Z1;
  if (hudMsgT > 0) { hudMsgT -= dt; hx.textAlign = 'center'; hx.fillStyle = hudMsgCol; hx.font = '13px "Space Mono"'; hx.fillText(hudMsg, W / 2, H - 110); }
}
const MINI = { x: 0, y: 0, w: 0, h: 0, X0: 0, X1: 1, Z0: 0, Z1: 1 };

/* ═════════ 主 HUD 更新 ═════════ */
let ghostPct = 100;
function updateHudDom(dt) {
  const f = ironFrac() * 100; if (ghostPct > f) ghostPct = Math.max(f, ghostPct - 0.05); else ghostPct = f;
  bossEl.style.display = G.mode === 'script' ? '' : 'none';
  $('#b-boss-fill').style.width = f + '%'; $('#b-boss-ghost').style.width = ghostPct + '%'; $('#b-boss-pct').textContent = f.toFixed(2) + '%';
  const t = G.mode === 'script' ? Math.max(0, G.t - T.REVEAL) : G.t;
  $('#b-clock').textContent = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  if (G.role === 'commander') { $('#b-n-ship').textContent = allies.length; $('#b-n-kill').textContent = G.kills; updateCmdBar(); }
}
function drawHud(dt) {
  hx.clearRect(0, 0, W, H);
  if (!G.started || G.doom > 0 || document.body.classList.contains('hud-off')) return;
  drawFlare();
  if (G.role === 'pilot') drawPilotHud(dt); else drawCommanderHud(dt);
}

/* ═════════ 輸入 ═════════ */
const chooseEl = $('#b-choose');
function openChooser() {
  const o = player.orig, alive = o && !o.dead; G.choosing = true;
  $('#b-ch-orig').disabled = !alive; $('#b-ch-orig').textContent = alive ? L().chooseOrig + ' · ' + o.cs : L().chooseGone; chooseEl.classList.add('on');
}
function closeChooser(choice) { chooseEl.classList.remove('on'); G.choosing = false; if (choice) setRole('pilot', choice); }
$('#b-ch-orig').addEventListener('click', () => closeChooser('orig'));
$('#b-ch-hss').addEventListener('click', () => closeChooser('hss'));
function toggleRole() {
  if (!G.started || G.paused || !G.control || G.doom > 0) return;
  if (G.role === 'pilot') setRole('commander'); else if (G.choosing) closeChooser(null); else openChooser();
}
function setPaused(p) {
  G.paused = p; FPVAudio.suspend(p); const ti = $('#b-title'); ti.classList.toggle('off', !p);
  if (p && G.started) { $('#b-go').textContent = L().resume; ti.classList.add('paused'); if (document.pointerLockElement) document.exitPointerLock(); }
  if (!p && G.role === 'pilot' && cv.requestPointerLock) cv.requestPointerLock();
}
addEventListener('keydown', (e) => {
  const code = e.code; input.keys[code] = true; cmdKeys[code] = true;
  if (!G.started) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
  if (e.repeat) return;
  if (G.choosing) { if (code === 'Digit1') $('#b-ch-orig').click(); if (code === 'Digit2') $('#b-ch-hss').click(); if (code === 'Tab' || code === 'Escape') closeChooser(null); return; }
  if (code === 'Tab') { toggleRole(); return; }
  if (code === 'KeyM') { musicOn = !musicOn; FPVAudio.music(musicOn); }
  if (code === 'KeyP' || (code === 'Escape' && G.role === 'commander')) setPaused(!G.paused);
  if (!G.control) return;
  if (G.role === 'pilot') {
    if (code === 'KeyT') cycleTarget('reticle'); if (code === 'KeyY') cycleTarget('next'); if (code === 'KeyU') cycleTarget('awacs');
    if (code === 'KeyV') { cam.mode = cam.mode === 'cockpit' ? 'chase' : 'cockpit'; if (player.ship) player.ship.hidden = cam.mode === 'cockpit' && !player.dead; chaseInit = false; }
    if (code === 'KeyZ') player.assist = !player.assist; if (code === 'KeyI') player.invert = !player.invert;
    if (code === 'KeyC' || code === 'KeyG') { const r = callSupport(code === 'KeyC' ? 'focus' : 'charge'); if (r.ok) { hudNote((code === 'KeyC' ? L().focusFire : L().chargeCall) + ' · ' + r.total + ' ' + L().responding + '  (' + (r.n.fgt ? '✈' + r.n.fgt + ' ' : '') + (r.n.ship ? '▲' + r.n.ship + ' ' : '') + (r.n.cap ? '●' + r.n.cap : '') + ')', '#7dffb0'); FPVAudio.lock(true); } else hudNote(L()[r.why], '#ffb04a'); }
  } else {
    if (code === 'Digit1') selectGroup(1); if (code === 'Digit2') selectGroup(2); if (code === 'Digit3') selectGroup(3);
    if (code === 'KeyC') orderCharge(); if (code === 'KeyX') orderHold(); if (code === 'KeyT') orderTomb();
  }
});
addEventListener('keyup', (e) => { input.keys[e.code] = false; cmdKeys[e.code] = false; });
cv.addEventListener('mousedown', (e) => {
  if (!G.started || G.paused || G.choosing || !G.control) return;
  if (G.role === 'pilot') { if (document.pointerLockElement !== cv && cv.requestPointerLock) cv.requestPointerLock(); if (e.button === 0) input.lmb = true; if (e.button === 2) input.rmb = true; return; }
  if (e.button === 2) { drag.on = true; drag.rot = true; drag.x1 = e.clientX; drag.y1 = e.clientY; return; }
  if (e.button === 0) {
    if (e.clientX >= MINI.x && e.clientX <= MINI.x + MINI.w && e.clientY >= MINI.y && e.clientY <= MINI.y + MINI.h) { ccT.tx = MINI.X0 + (e.clientX - MINI.x) / MINI.w * (MINI.X1 - MINI.X0); ccT.tz = MINI.Z0 + (e.clientY - MINI.y) / MINI.h * (MINI.Z1 - MINI.Z0); return; }
    drag.on = true; drag.rot = false; drag.moved = false; drag.x0 = drag.x1 = e.clientX; drag.y0 = drag.y1 = e.clientY; drag.shift = e.shiftKey;
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) input.lmb = false; if (e.button === 2) input.rmb = false;
  if (G.role !== 'commander' || !drag.on) return;
  if (e.button === 2 && drag.rot) { drag.on = false; drag.rot = false; }
  if (e.button === 0 && !drag.rot) { if (drag.moved) boxSelect(); else cmdClick(e.clientX, e.clientY); drag.on = false; drag.moved = false; }
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === cv && G.role === 'pilot') { input.mx += e.movementX; input.my += e.movementY; return; }
  if (G.role !== 'commander' || !drag.on) return;
  if (drag.rot) { ccT.az -= (e.clientX - drag.x1) * 0.005; ccT.pol = clamp(ccT.pol - (e.clientY - drag.y1) * 0.004, 0.12, 1.52); drag.x1 = e.clientX; drag.y1 = e.clientY; return; }
  drag.x1 = e.clientX; drag.y1 = e.clientY; if (Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > 6) drag.moved = true;
});
cv.addEventListener('wheel', (e) => { if (G.role !== 'commander' || !G.started) return; e.preventDefault(); ccT.dist = clamp(ccT.dist * Math.exp(e.deltaY * 0.0012), 400, 45000); }, { passive: false });
document.addEventListener('pointerlockchange', () => { if (G.started && G.role === 'pilot' && document.pointerLockElement !== cv && !G.paused && !G.choosing && G.doom === 0) setPaused(true); });
$('#b-c-all').addEventListener('click', () => selectGroup(1)); $('#b-c-charge').addEventListener('click', orderCharge); $('#b-c-hold').addEventListener('click', orderHold); $('#b-c-tomb').addEventListener('click', orderTomb);
$('#b-c-pilot').addEventListener('click', toggleRole);
let storedLang = 'en'; try { storedLang = localStorage.getItem('sw-lang') === 'zh' ? 'zh' : 'en'; } catch (e) {}
applyLang(storedLang); setSel('#b-mode', selMode); setSel('#b-rolesel', selRole);
