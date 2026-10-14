/* sw-assets.js — 太空戰資源載入器（需先載入 three.js 與 GLTFLoader）
 *
 * SWAssets.MANIFEST   各模型的檔名與遊戲內目標長度（沿前方 +Z）
 * SWAssets.loadAll()  → Promise<{ [name]: { parts, anchors, size, length } }>
 *   parts   : [{ geometry, material }]  已烘進節點矩陣與縮放，前方為 +Z、原點為建模時的樞紐
 *   anchors : { HP_COCKPIT: Vector3, HP_ENGINE_1: Vector3, ... }  已套用同一縮放
 *   size    : Vector3 (x 寬, y 高, z 長)
 *
 * 模型由 tools-src/blender/space-war/build_ships.py 產生；錨點命名見 shiplib.py。
 */
(function (global) {
  'use strict';
  const MANIFEST = {
    frigate:   { file: 'frigate.glb',   length: 9.5 },
    cruiser:   { file: 'cruiser.glb',   length: 21 },
    dread:     { file: 'dread.glb',     length: 52 },
    hss:       { file: 'hss.glb',       length: 68 },
    xzd:       { file: 'xzd.glb',       length: 80, fpv: true },    // 仙舟聯盟無畏艦（統一版專用）
    ipc:       { file: 'ipc.glb',       length: 24, fpv: true },    // 星際和平公司巡洋艦（統一版專用）
    moon:      { file: 'moon.glb',      length: 34 },
    whale:     { file: 'whale.glb',     length: 27 },
    butterfly: { file: 'butterfly.glb', length: 8 },
    debris:    { file: 'debris.glb',    length: 3 },
    irontomb:  { file: 'irontomb.glb',  length: 248, axis: 'y' },   // 以高度（+Y）正規化
    fighter:   { file: 'fighter.glb',   length: 14, fpv: true },    // FPV 專用：預設 loadAll 不載入
    sentinel:  { file: 'sentinel.glb',  length: 120, fpv: true },   // 預警機
    cockpit:   { file: 'cockpit.glb',   length: 1, raw: true, fpv: true }   // 駕駛艙內裝：不縮放，公尺為單位
  };

  function loadOne(loader, base, key) {
    const m = MANIFEST[key];
    return new Promise((resolve, reject) => {
      loader.load(base + m.file, (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const parts = [], anchors = {};
        const box = new THREE.Box3();
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            const g = o.geometry.clone();
            g.applyMatrix4(o.matrixWorld);
            g.computeBoundingBox();
            box.union(g.boundingBox);
            parts.push({ geometry: g, material: o.material, name: o.name });
          } else if (o.name && o.name.indexOf('HP_') === 0) {
            anchors[o.name] = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
          }
        });
        const size = box.getSize(new THREE.Vector3());
        const s = m.raw ? 1 : m.length / Math.max(m.axis === 'y' ? size.y : size.z, 1e-4);
        parts.forEach((p) => { p.geometry.scale(s, s, s); p.geometry.computeBoundingSphere(); });
        Object.keys(anchors).forEach((k) => anchors[k].multiplyScalar(s));
        resolve({ parts, anchors, size: size.multiplyScalar(s), length: m.raw ? size.z : m.length });
      }, undefined, reject);
    });
  }

  function loadAll(base, onProgress, only) {
    base = base || '../assets/space-war/models/';
    const loader = new THREE.GLTFLoader();
    const keys = only || Object.keys(MANIFEST).filter((k) => !MANIFEST[k].fpv);
    const out = {};
    let done = 0;
    return Promise.all(keys.map((k) => loadOne(loader, base, k).then((r) => {
      out[k] = r; done++; if (onProgress) onProgress(done, keys.length, k);
    }))).then(() => out);
  }

  global.SWAssets = { MANIFEST, loadAll };
})(window);
