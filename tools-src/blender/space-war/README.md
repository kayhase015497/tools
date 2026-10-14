# Space War — Blender 建模腳本

所有艦艇與 Irontomb 的 GLB 都由這裡的 Python 腳本程序化生成，輸出到 `assets/space-war/models/`。

## 執行
- 無頭（CI／雲端）：`pip install bpy`（Python 3.11），然後
  `python -I build_ships.py --out ../../../assets/space-war/models [frigate cruiser dread xzd ipc hss moon whale butterfly debris irontomb]`
- Blender GUI／Blender MCP：在 Scripting 或透過 MCP `execute_blender_code` 載入 `shiplib.py` 與 `build_ships.py`，呼叫 `BUILDERS[name](out_dir)`。

## 約定
- 建模座標：x 右、y 前、z 上；匯出時繞 Z 轉 180°，使前方 = glTF +Z（與遊戲一致）。
- 錨點以 Empty 匯出：`HP_COCKPIT`、`HP_ENGINE_n`、`HP_GUN_n`、`HP_NAV_n`、`HP_CORE`（Irontomb）。
- 顏色以顯示值撰寫（遊戲不做 sRGB 轉換、無 tone mapping）。
- 新增模型：在 `build_ships.py` 寫 builder → 加進 `BUILDERS` → 在 `sw-assets.js` 的 `MANIFEST` 登記目標長度。
