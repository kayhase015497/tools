/* sw-camera.js — 攝影機機架（CameraRig）
 *
 * 三種模式：
 *   'tactical'  戰術俯視（預設）。狀態在 rig.state：{ az, pol, dist, tx, ty, tz, shake, locked }，由 game.js 的操作層修改。
 *   'chase'     跟隨艦艇後方（第三人稱）。
 *   'cockpit'   第一人稱：攝影機放在艦艇模型的 HP_COCKPIT 錨點，朝向與艦艇一致，並隱藏該艦的模型。
 *
 *   rig.setMode('cockpit', ship)   切換模式；ship 為模擬層的艦艇資料
 *   rig.apply()                    每幀呼叫：依模式擺放 three.js 的 camera
 *
 * 未來的第一人稱飛船：只要把玩家艦艇交給 setMode('cockpit', ship)，
 * 並由 sw-player.js 的 FlightController 控制該艦即可，不需要動模擬層與渲染層。
 */
(function (global) {
  'use strict';
  function create(camera, o) {
    const rig = { mode: 'tactical', ship: null, state: o.state, fleet: o.fleet, fovTactical: camera.fov };
    const tmp = new THREE.Vector3(), look = new THREE.Vector3(), e = new THREE.Euler(0, 0, 0, 'YXZ'), qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const chasePos = new THREE.Vector3();
    let chaseInit = false;

    rig.setMode = function (mode, ship) {
      if (rig.ship) rig.ship.hidden = false;
      rig.mode = mode; rig.ship = ship || null; chaseInit = false;
      camera.fov = mode === 'cockpit' ? 74 : mode === 'chase' ? 55 : rig.fovTactical;
      camera.updateProjectionMatrix();
      if (mode === 'cockpit' && ship) ship.hidden = true;
      if (mode === 'tactical') camera.up.set(0, 1, 0);
    };

    rig.apply = function (dt) {
      const c = rig.state, s = rig.ship;
      if (rig.mode === 'tactical' || !s || s.dead) {
        if (rig.mode !== 'tactical' && (!s || s.dead)) rig.setMode('tactical');
        const sp = Math.sin(c.pol), cp = Math.cos(c.pol);
        const D = c.dist * (camera.aspect < 1.3 ? Math.min(2.0, 1.15 / camera.aspect) : 1); // 窄螢幕自動拉遠
        const ty = c.ty || 0;
        camera.position.set(c.tx + D * sp * Math.sin(c.az), ty + D * cp, c.tz + D * sp * Math.cos(c.az));
        if (c.shake > 0.01) camera.position.add(tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(c.shake));
        camera.lookAt(c.tx, ty, c.tz);
        return;
      }
      if (rig.mode === 'cockpit') {
        rig.fleet.anchorWorld(s, 'HP_COCKPIT', tmp); camera.position.copy(tmp);
        e.set(-s.p, s.h, s.roll || 0); camera.quaternion.setFromEuler(e).multiply(qFlip);
        if (c.shake > 0.01) camera.position.add(look.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(c.shake * 0.3));
        return;
      }
      // chase
      const L = (rig.fleet.kinds[s.kind] && rig.fleet.kinds[s.kind].length) || 10, cp2 = Math.cos(s.p);
      const fx = Math.sin(s.h) * cp2, fy = Math.sin(s.p), fz = Math.cos(s.h) * cp2;
      tmp.set(s.x - fx * L * 1.6, s.y - fy * L * 1.6 + L * 0.45, s.z - fz * L * 1.6);
      if (!chaseInit) { chasePos.copy(tmp); chaseInit = true; } else chasePos.lerp(tmp, Math.min(1, (dt || 0.016) * 4));
      camera.position.copy(chasePos);
      if (c.shake > 0.01) camera.position.add(look.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(c.shake));
      camera.lookAt(s.x + fx * L * 2, s.y + fy * L * 2, s.z + fz * L * 2);
    };
    return rig;
  }
  global.SWCamera = { create };
})(window);
