# 統一版（space-war-battle）架構

入口：`gadget/space-war-battle.html`；程式在 `assets/space-war/battle/`。舊的兩款（`space-war.html` 戰術版、`space-war-fpv.html` 飛行員版）保留為「經典版」。

## 模式 × 角色
| | 劇本模式（5:00） | 自由模式（無限） |
|---|---|---|
| **指揮官** | 框選／移動／衝鋒／固守／集火；鐵墓血條、字幕、毀滅結局 | 同左，無時間限制，波次無限 |
| **飛行員** | 6 自由度飛行、雷射、飛彈、T 鎖定、C 集火／G 衝鋒、U 預警機指派、無線電 | 同左 |

Tab 隨時切換：指揮官 → 飛行員時可選「回原機」或「從 HSS 重新起飛」；飛行員 → 指揮官時，戰機交給 AI 當僚機。

## 檔案（經典 script，共用全域詞法作用域，依序載入）
| 檔案 | 內容 |
|---|---|
| `battle-core.js` | 常數、艦艇資料表 `DEF`、劇本時間軸 `T`、台詞 `CUES`、介面文字 `STR`、無線電台詞 `RADIO`、呼號生成、全域狀態 `G` |
| `battle-render.js` | 場景、星空、後處理、相機（飛行員／指揮官軌道／末日過場）、鐵墓、巨劍與衝擊波視覺 |
| `battle-sim.js` | 模擬：艦艇、AI、命令、預警機資料鏈、彈道與傷害、玩家飛行、角色切換、劇本導演（閃白、巨劍、衝擊波、結尾） |
| `battle-ui.js` | 介面：字幕、播報、無線電面板、選單、飛行員 HUD、指揮官 HUD／框選／小地圖、輸入 |
| `battle-main.js` | 載入、主迴圈、`battleDebug` 除錯介面 |
共用：`sw-assets.js`（模型）、`sw-fleet.js`（InstancedMesh）、`sw-fx.js`（光束與爆炸）、`sw-env.js`、`fpv-audio.js`、`fpv-post.js`。

## 關鍵設計
- **單位公尺**：戰機 14 m，大艦 0.1～2 km，鐵墓 8 km 高在 15.5 km 外。艦艇速度刻意放慢（無畏艦 4.5 m/s、HSS 3.5 m/s），戰機仍是 100+ m/s。
- **命令系統**：`unit.order = { type: 'move'|'charge'|'hold'|'focus'|'tomb', ..., until? }`，AI（`aiFighter`／`aiCapital`）每幀讀取。飛行員的支援呼叫用同一套機制（帶 30 秒期限）。
- **預警機（Sentinel，NPC 艦）**：每 2 秒做一次目標分配（威脅分數、避免超額集火），廣播給資料鏈內單位；感測分享延伸飛行員雷達；被擊毀則降級為各自為戰，60～90 秒後補一架新機並以字幕／播報宣告。
- **資料鏈支援呼叫**：T 鎖定 → C（集火）／G（衝鋒）。只有「目標在自己射程內、且在資料鏈範圍內」的友軍響應，上限依預警機是否在線（12／6），有冷卻。
- **無線電**：飛行員模式右側，隨機呼號＋20 句台詞（鎖定、追擊、中彈、最後通訊、擊落），雙語。
- **劇本**：REVEAL 12 s → 戰鬥 → FLASH 236（白閃，來古士「第四時刻」）→ DOOM 256（巨劍）→ IMPACT 268（衝擊波，所有艦艇依距離被抹除）→ WHITE 286 → END 300（字卡）。音樂循環播放。鐵墓血條有 80% 的下限。
- **語言**：預設英文，標題畫面可切中文（字幕、播報、無線電、介面一起切換）。

## 除錯
`window.battleDebug`：`start(mode, role)`、`warp(sec)`、`setRole()`、`killShip()`、`callSupport()`、`orderXxx()`…（見 `battle-main.js`）。Playwright 測試腳本放在各自的 scratchpad，不在 repo 內。

## 後續可做
- 手機／觸控（雙搖桿、點選指令）。
- 更多單位種類（魚雷艇、補給艦）與預警機的專屬對話。
- 指揮官模式的編隊與路徑點。
- 真機效能驗證（高畫質 bloom 與數百單位）。

## v2 combat/visual update

- **Formation**: allies spawn in a 360° 3D ring around the Irontomb (`ringPos`/`mkRing` in battle-sim.js); the arena is centred on `TOMB_POS`. Enemy waves emerge from a sphere around the tomb.
- **Speeds**: capital ships ≈ 20% of fighter speed (see `DEF` in battle-core.js).
- **Weapons**: main firepower is blue (allied) / red (Legion) beam cannons (`d.beam`, `fireBeamCannon`); rapid-fire guns remain as anti-fighter flak (`d.flak`). Screwllum moons launch area-bombardment bubbles (`launchBubble` / `detonateBubble` / `stepBubbles`).
- **FX**: `SWFx.create({pro:true})` enables noise-shader billboard fire/smoke, spark streaks and small debris (`proExplode` in sw-fx.js). Classic pages keep the old behaviour.
- **Lighting**: stronger key/rim contrast; tomb albedo darkened with a Fresnel red rim (`darkenTomb`) and a red point light at its centre.

## v3 tweaks

- **Formation**: allies hold one side of the tomb as a spherical cap (`SIDE_AZ`, mixed pitch layers) so the fleet spreads across X/Y/Z; waves emerge from the ally-facing side.
- **Beam cannons**: sustained ~2 s (`beams[]`, `fireBeamCannon`/`stepBeams`), damage ticks every 0.2 s, impact point emits coloured sparks, orange fire and smoke.
- **Gun hits** (`impact`): flash, spark fan and small fire puff. **Missile hits** add a smoke cloud (`smokeCloud`).
