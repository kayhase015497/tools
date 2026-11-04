# Godot 聲光第二階段升級規劃（2026-11，Claude Sonnet 5.5 起草、Opus 5.5 顧問審閱）

給接手的 Sonnet：照本文件由上而下線性執行，每批一個 build 號。專案目標見 `CLAUDE.md`（以網頁 v2 為基礎大幅提升畫質；Claude 自行實作、驗證、合併；使用者只試玩回報）。

## 0. 先讀這三點
1. **雲端無音訊裝置、無真實 GPU**：音訊只能驗證腳本無錯誤；GPU 效能完全不可驗。所以音訊項目盡量**併成一批**，減少使用者的試聽輪數。
2. **GPU 成本已經累積**：build 25~27（鐵墓材質、天空 fbm、太空塵）都沒有真實 GPU 量測，使用者先前就反映過 Godot 偏慢。**新的 GPU 重度特效必須等使用者回報 FPS／`lookdev.bat` 數字**；每個新視覺特效都要有 ESC 選單開關、Low 檔位預設關。
3. 不要做的事（被擋住）：HSS 旗艦模型（等使用者提供新的 TRIPO 模型）、V5 檔位定案（等真機數字）、網頁 v2 一律不動。

## 1. 現況盤點（build 17~27 已完成，別重做）
- 特效：引擎光暈（glow）、尾焰／飛彈尾跡（trail）、護盾泡＋漣漪、受損煙、熱扭曲、莫比烏斯環、太空塵、天空星雲（fbm）、垂直冷發射、爆炸／斷片（Explosion／Breakup）。
- 後製：`post.gdshader`（調色、色差、橫向光芒、暗角）、Environment glow／ACES。**V4 的 Compositor／動態模糊沒做**（改用畫布層 post）；仍想要的話列在第 5 節。
- 材質：`materials.json` 推導 PBR、HSS 近距離面板、鐵墓外殼（暗金屬＋紅輪廓光＋裂光）。
- 光照：`lighting.gd`／`lighting.json`（陰影預設只在 High、F5 A/B）。
- 聲音：`assets/sfx/*.mp3`（雷射、砲、爆炸 小／中／大、護盾、命中、flyby、鎖定、飛彈發射、alarm、afterburner、bgm）＋ 劇本語音；build 24 補了飛彈／護盾破裂／flyby。
- 尚未做：音訊匯流排、音訊品質處理（見 §3）；V3 flipbook 爆炸；真機效能定案。

## 2. 實測到的音訊缺口（`battle.gd` `_load_sfx`／`sfx_play`）
- 完全沒有 AudioBus：沒有 Music／SFX／Voice 分匯流排，沒有 Master 限幅器，電台／劇本語音不會壓低音樂與音效。
- `sfx_play(pos == null)` 每次新建一個 `AudioStreamPlayer` 再 `queue_free`；玩家高速連射會狂建節點。
- 3D 池固定 28 個，滿了就**直接丟掉新音效**；大戰（77+ 艦）時近處爆炸可能輸給遠處的。
- 沒有距離低通、都卜勒、駕駛艙內悶聲、遠近兩層爆炸。

## 3. 批次計畫（每批 = 一個 build 號，結尾更新 `BUILD`、`docs/space-war/GODOT-VISUAL-PLAN.md` 進度、`FEEDBACK-CHECKLIST.md`）

### Build 28 — 音訊基礎建設（零 GPU 成本）
- 建 AudioBus：Master（Limiter）→ Music／SFX／Voice／UI；ESC 選單 AUDIO 頁音量滑桿改控制各匯流排（`opt` 的 sfx／music／voice 鍵沿用）。
- Ducking：電台／劇本語音播放時 Music −8 dB、SFX −4 dB（淡入淡出 0.2／0.6 s）。可用 `AudioEffectCompressor` sidechain 或程式內 tween 匯流排音量（較簡單，優先）。
- 2D 音效改小池（8 個播放器輪流用），不再每次 new。
- 3D 池優先權：池滿時依「距離＋重要性（大爆炸>中>小>槍聲）」搶占最不重要的一個，不再丟新音效。
- 驗收：`--headless --import` 無錯；`cloud_render.sh` 跑 `--demo-cam --auto-start=free --bigstep` 無 SCRIPT ERROR。**不可驗：實際聽感、ducking 時機。**

### Build 29 — 空間音效與臨場感（零 GPU 成本，一次給使用者試聽）
- 距離低通：`AudioStreamPlayer3D.attenuation_filter_cutoff_hz`／`attenuation_filter_db`（API 名稱以 Godot 4.7 文件為準，先查證再用）。
- 都卜勒：玩家鏡頭與 3D 播放器的 `doppler_tracking`（飛彈、戰機掠過最明顯）。
- 駕駛艙內悶聲：駕駛艙視角時 SFX 匯流排加 LowPass（約 6 kHz），外部視角恢復。
- 遠近兩層爆炸：同一爆炸同時播「近層（短、高頻）＋遠層（低頻、延遲 = 距離/音速縮放）」。
- 引擎低頻隨油門／加速變化（用 afterburner 音檔 pitch／音量對 `pl["thr"]`）；低血量警報（`alarm.mp3`）與 HUD 紅邊同步。
- 驗收同上；**不可驗：全部聽感**。新增項目列入 `FEEDBACK-CHECKLIST.md` 讓使用者一次試聽回報。

### Build 30 — 戰鬥手感（極低 GPU 成本）
- 受擊回饋：護盾漣漪時的螢幕邊緣短暫色調、命中停頓（hit-stop 0.03 s，僅玩家被擊中）、鏡頭震動曲線分級。
- 加速 FOV 拉伸＋邊緣速度線（可用現有 post 的 streak 或 `space_dust` 參數，不新增全螢幕 pass）。
- 雷射／砲口閃光的短命點光源（每秒上限，池化）、命中火花粒子。
- 驗收：`--demo-cam` 與一般駕駛畫面截圖；**不可驗：手感、FOV 拉伸的舒適度**。

### Build 31+ — GPU 重度項目（先等使用者的 FPS／lookdev 數字，沒有數字不要開工）
1. V3 flipbook 爆炸（Blender 無頭烘焙序列圖 → 圖集貼圖，取代部分程序式 fireball；需評估貼圖記憶體）。
2. 鐵墓／月球周圍的體積光（God rays）或 Environment 體積霧（目前 `volumetric_fog_enabled=false`）。
3. 動態模糊（只在高速／加速時、低成本版本）。
4. 自動曝光或場景亮度自適應（爆炸白閃後暗部恢復）。
5. SSAO／SSR 是否值得（艦隊多、距離遠，通常收益低；先拍對照圖再決定）。
- 每一項：ESC 選單開關＋Low 檔位預設關＋`FEEDBACK-CHECKLIST.md` 項目；效能數字回來前保持關閉預設。

## 4. 操作手冊（沙盒重置後要重做，否則白白重來）
1. 下載 Godot：`curl -sSL -o g.zip https://github.com/godotengine/godot-builds/releases/download/4.7-stable/Godot_v4.7-stable_linux.x86_64.zip && unzip g.zip`（放 `/tmp/gd/`，變數 `GODOT` 可覆寫）。
2. 軟體 Vulkan：`apt-get update && apt-get install -y mesa-vulkan-drivers`（xvfb 已存在）。
3. 截圖：`godot/tools/cloud_render.sh <out.png> <frames> --demo-cam --auto-start=free --bigstep`；40 幀約 1.5 分鐘。其他旗標：`--ship-demo=<kind>`、`--tomb-demo`、`--mobius-demo`、`--vls-demo`、`--commander`、`--pause-demo`、`--cockpit`。
4. 新增 `class_name` 後先跑 `godot --headless --path godot --import`，否則解析失敗；匯入後 `git checkout -- godot/assets`（避免改寫 `.import`）。
5. 提交 Godot 自動產生的 `.uid` 檔（否則使用者本機 `git pull` 會因 untracked 衝突失敗）。
6. 推送：**不要 `-f`**。流程：`git fetch origin <branch>` → `git merge -s ours origin/<branch>` → 一般 `git push`。squash 合併遇衝突時：`git merge -s ours origin/main` 再推。
7. 每批：`BUILD` +1（`battle.gd`）、進度寫入 `GODOT-VISUAL-PLAN.md`、`FEEDBACK-CHECKLIST.md` 追加項目、開 PR → squash 合併 → 回報使用者 build 號。
8. 使用者 Windows 更新：關 Godot → `git checkout -- godot` → `git clean -fd godot/scripts` → `git pull origin main`。

## 5. 待決／選配
- V4 Compositor 版後製是否仍要（目前畫布層 post 已涵蓋調色／色差／光芒）。
- 網頁 v3 的聲光是否要同步（網頁 v2 為基準，v3 只在使用者要求時動）。
- 真機數字：請使用者回報各檔位 FPS 與 `lookdev.bat` 毫秒，據此決定 Build 31+ 的預設值。
