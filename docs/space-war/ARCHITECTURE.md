# Space War 架構與第一人稱擴充路線

## 資源管線
`tools-src/blender/space-war/*.py`（bpy）→ `assets/space-war/models/*.glb` → `sw-assets.js`（MANIFEST 正規化尺寸、烘進節點矩陣、收集 `HP_*` 錨點）→ `sw-fleet.js`（每種艦艇一個 InstancedMesh）。
Irontomb 以高度正規化（`axis:'y'`，248），`?tomb=sphere` 或載入失敗時退回球體 shader。

## 模組
| 檔案 | 職責 |
|---|---|
| `game.js` | 模擬（艦艇純資料）、導演時間軸、HUD、操作 |
| `sw-fleet.js` | 把資料寫入實例矩陣；`anchorWorld / gunWorld` |
| `sw-fx.js` | 光束、粒子、爆炸、碎片 |
| `sw-env.js` | 天空、環境光、bloom composer |
| `sw-camera.js` | CameraRig：tactical / chase / cockpit |
| `sw-player.js` | 第一人稱飛行控制原型 |

## 第一人稱接入點
- 艦艇資料 `{kind,x,y,z,h,p,roll,...}`；設定 `ship.ctrl = { update(ship,dt,t,API) }` 即可接管該艦。
- `API.hitscan(origin, dir, range)` 提供命中判定；`fleet.gunWorld` 取砲口。
- `rig.mode = 'cockpit'` 使用 `HP_COCKPIT`，隱藏自身網格，FOV 74。
- 除錯：`swDebug.fpv()`。操作：W/S 油門、A/D 偏航、↑/↓ 俯仰、Q/E 翻滾、空白鍵／滑鼠開火。

## 後續路線
1. 飛行模型（慣性、推力、邊界與禁區迴避）與瞄準輔助。
2. 駕駛艙內裝模型（依艦橋美術：六角面板、藍色霓虹結構）與 HUD。
3. 受損模型（護盾／艙段）、友軍 AI 與玩家艦的分工。
4. 行動裝置虛擬搖桿；效能（實例數、bloom）自適應。
