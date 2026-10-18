/* battle-main.js — 啟動、載入、主迴圈、除錯介面 */
'use strict';
let lastT = 0, assetsReady = false;
const gov = { ema: 16, slow: 0, stage: 0 };
function governor(raw) {   // raw = 實際幀間隔(ms)；持續 > 42 ms（約 24 fps 以下）3 秒就降一級
  if (!G.started || G.paused || raw > 1000 || raw <= 0 || Q.get('gov') === '0') return;
  gov.ema += (raw - gov.ema) * 0.06;
  if (gov.ema > 42) gov.slow += raw / 1000; else gov.slow = Math.max(0, gov.slow - raw / 2000);
  if (gov.slow > 3 && gov.stage < 3) { gov.stage++; gov.slow = 0; gov.ema = 16; degradeQuality(gov.stage); }
}
function frame(now) {
  requestAnimationFrame(frame);
  governor(now - lastT);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  if (!assetsReady) return;
  const running = G.started && !G.paused && !G.choosing;
  if (running) {
    stepWorld(dt);
    if (G.role === 'commander' && G.doom === 0) updateCommanderCamera(dt);
    FPVAudio.engine(G.role === 'pilot' ? clamp(player.vel.length() / 300, 0, 1) : 0, G.role === 'pilot' && player.boost);
  }
  placeCamera(dt); FPVAudio.listener(camera);
  fleet.update(allies, enemies);
  for (const s of allies) { s.sel = false; s.ring = false; }
  if (G.role === 'commander') for (const s of selected) { if (!s.dead) { s.sel = true; s.ring = s.d.hp > 1000; } }
  frameUpdate(dt);
  if (G.started) { fx.update(running ? dt : 0); trails(dt, running); }
  render(); drawHud(dt);
  if (G.started) updateHudDom(dt);
}
let trT = 0;
function trails(dt, running) {   // 戰機尾焰：鏡頭附近的戰機在引擎噴口留下會擴散的光點
  if (!running) return; trT -= dt; if (trT > 0) return; trT = 0.05;
  const lists = [allies, enemies], lim = G.role === 'commander' ? 3500 : 2400;
  for (let Li = 0; Li < 2; Li++) {
    const arr = lists[Li], col = Li === 0 ? [0.35, 0.75, 1.0] : [1.0, 0.35, 0.85];
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i]; if (s.dead || s.hidden || (s.kind !== 'fgt' && s.kind !== 'ifgt' && s.kind !== 'fly')) continue;
      if (Math.abs(s.x - cam.x) > lim || Math.abs(s.z - cam.z) > lim || Math.abs(s.y - cam.y) > lim) continue;
      for (let e = 1; e <= 2; e++) { fleet.anchorWorld(s, 'HP_ENGINE_' + e, V); fx.emit(V.x, V.y, V.z, -s.vx * 0.04 + rnd(-1, 1), -s.vy * 0.04 + rnd(-1, 1), -s.vz * 0.04 + rnd(-1, 1), s.kind === 'ifgt' ? 1.0 : col[0], s.kind === 'ifgt' ? 0.45 : col[1], s.kind === 'ifgt' ? 0.25 : col[2], s.kind === 'fgt' || s.kind === 'ifgt' ? 2.6 : 2.2, 0.6, 1.4, 0, 0.6); }
    }
  }
}
const MODELS = ['frigate', 'cruiser', 'hss', 'xzd', 'ipc', 'moon', 'whale', 'butterfly', 'debris', 'irontomb', 'fighter', 'ipcfighter', 'cockpit', 'sentinel'];
function modelsLoaded(a) { setupRender(a); assetsReady = true; const go = $('#b-go'); go.disabled = false; go.textContent = L().go; go.dataset.i = 'go'; }
SWAssets.loadAll('../assets/space-war/models/', null, MODELS).then(modelsLoaded).catch((e) => { $('#b-go').textContent = 'Model load failed'; console.error(e); });

$('#b-go').addEventListener('click', () => {
  FPVAudio.init('../assets/irontomb-bgm.mp3');
  if (!G.started) {
    G.mode = selMode; G.role = selRole; G.started = true;
    document.body.classList.toggle('role-cmd', G.role === 'commander'); document.body.classList.toggle('role-pilot', G.role === 'pilot');
    initWorld(); FPVAudio.setScale(G.role === 'pilot' ? 1 : 6); FPVAudio.musicSeek(0);
    if (G.mode === 'free') { setVeil('#000', 0, 1.2); hudShow(true); G.revealed = true; setObjective(true); say('Welcome aboard. The fleet is engaging the Antimatter Legion.', '歡迎上艦。艦隊正與反物質軍團交火。', false); } else hudShow(false);
    bossEl.style.display = ''; $('#b-clock-wrap').style.display = G.mode === 'script' ? '' : 'none';
    hintEl.innerHTML = G.role === 'pilot' ? L().toCmd : L().toPilot;
    $('#b-title').classList.remove('paused');
  }
  setPaused(false);
});
requestAnimationFrame(frame);

window.battleDebug = { G, player, allies, enemies, shots, input, DBG, cc, ccT, selected,
  get ready() { return assetsReady; }, get fleet() { return fleet; }, get fx() { return fx; }, get ironFrac() { return ironFrac(); }, get ironDmg() { return ironDmg; }, bubbles, blasts, beams, THREE,
  start(mode, role) { selMode = mode || 'script'; selRole = role || 'pilot'; $('#b-go').click(); },
  warp(sec, aim) { const n = Math.round(sec / 0.05); for (let i = 0; i < n; i++) { if (aim) { if (!player.target || player.target.dead) player.target = enemies.filter((e) => e.kind === 'fly').sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) - Math.hypot(b.x - player.pos.x, b.z - player.pos.z))[0] || null; } stepWorld(0.05); fx.update(0.05); } },
  killShip, setRole, selectGroup, orderMove, orderCharge, orderHold, orderFocus, orderTomb, callSupport, cycleTarget, issueOrder, awacsUnit, allocateTargets, setCam(m) { cam.mode = m; if (player.ship) player.ship.hidden = m === 'cockpit'; } };
G.lite = true; try { G.fleetScale = Math.max(1, Math.min(5, +(Q.get('scale') || localStorage.getItem('sw2-scale') || 2) | 0)); } catch (e) { G.fleetScale = 2; }   // v2 預設：護盾泡泡、艦體損傷、受損冒煙起火全部關閉（F8 可開）
window.G = G; window.battleKnobs = { get: () => knobs, set: setKnob };   // v2：F3 面板的效能旋鈕
// 測試用：在同一個工作週期內走完一幀的「相機 → 艦隊矩陣 → 特效更新 → 繪製」（無頭瀏覽器的 requestAnimationFrame 太慢，截圖前呼叫它）
window.__frameOnce = () => { placeCamera(0.016); fleet.update(allies, enemies); for (const s of allies) { s.sel = false; s.ring = false; } frameUpdate(0.016); fx.update(0.0001); render(); drawHud(0.016); };
