# 戰機駕駛艙版（space-war-fpv）設計與路線

## 現況（第一版）
- 入口：`gadget/space-war-fpv.html`；程式：`assets/space-war/fpv/fpv-game.js`、`fpv-audio.js`。與主遊戲共用模型（Blender 腳本產生）、`sw-fleet`（InstancedMesh）、`sw-fx`（光束／爆炸）、`sw-env`（天空、環境光、bloom）。
- 尺度：1 單位 = 1 公尺。戰機 14 m、護衛艦 ~85 m、巡洋艦 ~230 m、無畏艦 ~1 km、HSS ~2 km、月球艦 ~1.5 km、鐵墓高 ~8 km（15 km 外）。速度刻意放慢（大艦 2–14 m/s，戰機 110–170 m/s，加力 ×2.4）。
- 無時間限制：反物質軍團每 ~30–50 秒一波（越打越多），聯軍定期增援；鐵墓每 35–60 秒以巨型光矛點名一艘聯軍艦。玩家死亡 5 秒後從 HSS 機庫重生。
- 鐵墓：遠景巨人，可被轟擊但毫無效果（完整度顯示 100.000000%）；靠近 4.2 km 內會被威壓推開並持續掉盾。
- 飛行：6 自由度四元數，滑鼠給目標角速度＋慣性平滑；W/S 油門、A/D 與 R/F 平移、Q/E 翻滾、Shift 加力、X 急停、Z 關閉飛行輔助（純慣性）。
- 武器：四挺脈衝雷射（鎖定目標時有提前量輔助）、追蹤飛彈（需鎖定）；戰機武器對艦艇有反艦倍率。
- 駕駛艙：`cockpit.glb` 以第二個場景疊畫（近平面 0.05），不會被艦艇穿插；依角速度微晃。
- HUD：Canvas 2D（準星、速度向量、目標框＋血條、提前量圈、螢幕外箭頭、雷達、盾／甲／雷射容量／加力、鐵墓方位）。

## 已知限制
- 僅鍵鼠操作；手機未適配（需要雙搖桿＋按鈕）。
- 真機效能未驗證：桌機預設開 bloom；`?q=low` 關閉。
- 音效由 `tools-src/audio/build_sfx.py`（numpy／scipy）合成的多層取樣（爆裂＋重擊＋雜訊主體＋殘響），音樂沿用 `assets/irontomb-bgm.mp3`。
- 鐵墓在主場景內（遠平面 60 km）；若日後要更遠、更大，請改為「遠景場景＋獨立相機」兩階段渲染。

## 下一步建議
1. 任務結構：開場空降、護航、擊落指定旗艦、護送 HSS 等；把 `spawnWave` 抽成任務腳本。
2. 武器與裝備：魚雷（反艦）、護盾分配（類 Elite 的 SYS/ENG/WEP 電力分配）、可升級的機體（Everspace 式 roguelite）。
3. 友軍指令：僚機編隊、集火；與 `game.js` 的戰術視角共用同一份艦隊資料，做成「戰術視角 ↔ 駕駛艙」切換。
4. 大艦內部細節：炮塔可被擊毀（子系統）、機庫入口、可穿越的 HSS 環形結構。
5. 手機：雙虛擬搖桿＋自動瞄準。

## 若要升級成原生遊戲：引擎建議
| 引擎 | 費用 | 平台／API | 適合度 |
|---|---|---|---|
| **Unreal Engine 5** | 免費，營收超過 100 萬美元後 5% 權利金 | Windows：DX12（也有 DX11／Vulkan）；macOS：Metal（Apple Silicon 原生編輯器） | 畫面上限最高：Niagara 特效、Nanite（大量高面數艦艇）、大世界座標（LWC，雙精度）正好解決「公里級場景」的浮點誤差。缺點：很吃資源，Mac 上 Nanite／Lumen 支援受限，以較低畫質為主 |
| **Unity 6** | Personal 免費（有營收門檻），無執行時費用 | DX12／Vulkan／Metal，皆原生支援 Apple Silicon | 折衷選擇：VFX Graph、URP／HDRP、C# 開發快；超大場景要自己做浮動原點 |
| **Godot 4** | 完全免費（MIT） | Vulkan、Metal（Mac 原生）、DX12（實驗性）；可編譯雙精度版 | 最輕量、迭代最快，但特效與大量艦隊的上限低於 UE5 |
| O3DE | 免費（Apache 2.0） | DX12／Vulkan／Metal | 功能強但生態與文件較少，不建議作為首選 |

建議：**要 DX12 級特效且主要在 Windows 上遊玩 → Unreal Engine 5**；**要 Mac 開發體驗順、迭代快 → Unity 6 或 Godot 4**。目前的 Blender 腳本可改成輸出 FBX／glTF 直接匯入任一引擎；`HP_*` 空物件對應引擎裡的 Socket／錨點。

## 開源／免費音效工具與素材來源（授權請逐一確認）
- 製作與編輯：**Audacity**（剪輯）、**Ardour**（DAW）、**LMMS**、**Vital** 或 **Surge XT**（免費合成器，做引擎低頻與雷射音）、**VCV Rack**（模組合成，做外星感音效）、**sfxr／jsfxr／ChipTone**（快速產生音效）。
- 免費素材：**Freesound.org**（CC0／CC-BY，需標示者要標示）、**Kenney.nl**（CC0，含 Sci-Fi 音效包）、**OpenGameArt.org**、**Sonniss GameAudioGDC**（歷年免費可商用大包）。
- 遊戲內音訊中介：**FMOD**／**Wwise**（營收門檻以下免費）；Godot 與 UE5 內建音訊也夠用。空間音效可用 **Steam Audio**（免費）。

## 畫面與音效管線（v2）
- **線性色彩管線**：材質顏色載入時由 sRGB 轉線性，燈光在線性空間計算；`fpv-post.js` 的最終合成 pass 負責 ACES 色調映射、色彩分級（陰影偏青、高光偏暖）、暈邊、顆粒、徑向速度模糊、受傷色差，最後才編成 sRGB。低畫質（`?q=low`）改用 renderer 內建的 ACES＋sRGB，沒有 bloom 與最終 pass。
- **頂點 AO**：Blender 腳本在匯出時以 BVH 光線投射把環境遮蔽烘進 `COLOR_0`，凹槽與接縫自然變暗（`shiplib.py: bake_ao`）。
- **程序化面板接縫**：硬表面材質以模型空間座標在著色器裡畫出面板線與色差（`prepMaterial`），不需要貼圖。
- **其他**：7000 顆星空、恆星鏡頭光暈與鬼影、爆炸瞬間的點光源閃光、戰機尾焰、加力時 FOV 拉伸＋徑向模糊。
- **音效**：`fpv-audio.js` 取樣播放，3D 空間化（距離衰減、越遠越悶、聲速延遲、左右聲道依方向）、殘響匯流排、動態壓縮。想換成真實素材（Freesound、Sonniss…），以相同檔名覆蓋 `assets/space-war/fpv/sfx/*.mp3` 即可；重新合成執行 `python tools-src/audio/build_sfx.py --out assets/space-war/fpv/sfx`。
