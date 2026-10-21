# Space War Native — 階段 1 驗證小專案（Godot 4.7）

只有畫面、沒有玩法。目的是在 **Windows / D3D12 / Forward+** 上確認：艦艇 GLB 的材質光照、大量艦艇幀數、光束＋電焊火花、泛光／體積霧／調色，是否明顯勝過網頁版。

## 在你的電腦上執行
1. 下載 Godot **4.7（Standard 版，不是 .NET）**：https://godotengine.org/download/windows/ ，解壓縮後直接執行 `Godot_v4.7-stable_win64.exe`。
2. 專案管理員 → Import → 選這個 repo 的 `godot/project.godot` → 開啟（第一次會花一些時間匯入 GLB）。
3. 按 **F5** 執行。右上角標題列／左上角 HUD 會顯示顯卡名稱與 FPS。
4. 確認使用的是 D3D12：專案設定已指定 `rendering_device/driver.windows = d3d12`，HUD 第一行會顯示顯卡。

## 操作
| 鍵 | 功能 |
|---|---|
| 右鍵＋滑鼠 | 轉動視角 |
| W A S D / Q E | 前後左右／下上 |
| Shift | 加速 |
| PageUp / PageDown（或 `]` `[`） | 艦隊數量 ×2／÷2（×1 ≈ 網頁版開場兵力，最高 ×64） |
| M | 讓艦艇移動（在 GDScript 端逐艘更新，量 CPU 成本；正式版會改用 C#） |
| F3 | 3D 解析度縮放 100% ⇄ 75% |
| F2 | 把 FPS 紀錄存到 `user://bench.csv`（HUD 不顯示路徑，在終端機／輸出視窗會印出） |

## 自動壓力測試
命令列：`Godot_v4.7-stable_win64.exe --path godot -- --benchmark`
依序量 ×1、×2、×4、×8、×16 艦隊，每段 10 秒，結果寫入 `user://bench.csv`（Windows：`%APPDATA%\Godot\app_userdata\Space War Native (Spike)\bench.csv`），完成後自動關閉。

## 回報給 Claude
請把 `bench.csv` 的內容，加上同一視角的截圖（跟網頁版對比），貼回來；我會據此判斷要不要進階段 2（移植玩法）。

## 資料夾
- `assets/models/`：由 `tools-src/godot/sync_models.sh` 從網頁版同步的 GLB（含鐵墓）。
- `shaders/`：天空（星點＋星雲）、光束。
- `scripts/spike.gd`：整個驗證場景（全程用程式建立，方便在雲端無頭驗證）。

## 引擎版本
- 目前以 **Godot 4.7 穩定版**為準（雲端已用 4.6／4.7／4.8-beta1 三個版本驗證：匯入、執行、軟體渲染畫面都正常，專案不需要修改）。
- Godot **4.8 目前只有 beta**（4.8-beta1）：可以試，但正式開發建議等 4.8 穩定版再升級（升級方式：換成新版執行檔開啟同一個專案，把 `project.godot` 的 `config/features` 版本號改成 4.8 即可）。
- 之後要寫玩法模擬時需要 **.NET 版**（C#）；那時再下載 .NET 版 Godot，並新增 C# 專案檔。

## 爆炸展示牆
命令列加上 `-- --explode-gallery`：在鏡頭前排出 3 列（橘色／紫色／先橘後紫）× 5 欄（5 種變體）的爆炸，方便比較。平常遊玩時，每次爆炸會從 5 種變體中亂數挑一種，並對顏色、尺寸做小幅亂數。
