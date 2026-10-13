/* sw-player.js — 玩家飛行控制器（第一人稱飛船的原型／預留介面）
 *
 * 介面約定：艦艇資料上的 ship.ctrl 若存在，模擬層會在每幀呼叫 ship.ctrl.update(ship, dt, t, api)，
 * 並略過內建 AI 的移動與開火。ctrl 自行更新 ship.h（航向）、ship.p（俯仰）、ship.roll、ship.x/y/z。
 * api 由 game.js 提供：{ fireBolt(ship, targetShip), hitscan(ship, rangeMax, coneRad), enemies }。
 *
 * 目前不在 UI 中開放；開發者可在瀏覽器主控台輸入：
 *     swDebug.fpv()            自動挑一艘聯軍護衛艦，切換第一人稱並接手控制
 *     swDebug.fpv(false)       退出，回到戰術視角（艦艇交還 AI）
 * 操作：W/S 油門，A/D 偏航，↑/↓ 俯仰，Q/E 翻滾，空白鍵或滑鼠左鍵開火。
 *
 * 後續正式導入時要補的東西（見 docs/space-war/ARCHITECTURE.md）：
 *   飛行模型（慣性、推力、速度上限）、瞄準與彈道、駕駛艙內部模型與 HUD、受損狀態、手機虛擬搖桿、
 *   聯軍／敵方 AI 對玩家艦艇的目標處理。
 */
(function (global) {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function createFlight(keys) {
    const ctrl = { throttle: 0.5, yawRate: 0, pitchRate: 0, fireCd: 0, type: 'flight' };
    ctrl.update = function (s, dt, t, api) {
      const d = s.d, spd = d.spd * (0.3 + 1.6 * ctrl.throttle);
      if (keys.KeyW) ctrl.throttle = clamp(ctrl.throttle + dt * 0.6, 0, 1);
      if (keys.KeyS) ctrl.throttle = clamp(ctrl.throttle - dt * 0.6, 0, 1);
      const yawIn = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0), pitchIn = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0), rollIn = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
      ctrl.yawRate += (yawIn * 1.2 - ctrl.yawRate) * Math.min(1, dt * 4);
      ctrl.pitchRate += (pitchIn * 0.9 - ctrl.pitchRate) * Math.min(1, dt * 4);
      s.h += ctrl.yawRate * dt; s.p = clamp(s.p + ctrl.pitchRate * dt, -1.3, 1.3);
      s.roll = (s.roll || 0) + ((ctrl.yawRate * 0.6 + rollIn * 0.8) - (s.roll || 0)) * Math.min(1, dt * 3);
      const cp = Math.cos(s.p);
      s.x += Math.sin(s.h) * cp * spd * dt; s.y = clamp(s.y + Math.sin(s.p) * spd * dt, -380, 380); s.z += Math.cos(s.h) * cp * spd * dt;
      ctrl.fireCd -= dt;
      if ((keys.Space || ctrl.mouseDown) && ctrl.fireCd <= 0) { ctrl.fireCd = d.cd; api.hitscan(s, d.range * 1.4, 0.07); }
    };
    return ctrl;
  }
  global.SWPlayer = { createFlight };
})(window);
