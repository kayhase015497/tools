# Space War 自動化測試腳本

在 repo 根目錄先啟動靜態伺服器：`python3 -m http.server 8765`，再於本目錄執行（需要 Node + Playwright、Python + Pillow/numpy）。

| 腳本 | 用途 |
|---|---|
| `v2t.js [low\|high] [頁面名]` | 開頁面、等遊戲就緒，回報 JS 錯誤／警告 |
| `parity.js <low\|high> <v1\|v2>` | 以固定亂數種子拍 6 個固定場景（`par/` 目錄），用來比對 v1 與 v2 的畫面一致性 |
| `pdiff.py <low\|high>` | 比對 `par/` 內 v1 與 v2 的截圖：平均差異、亮度，並輸出並排圖 `cmp_*.png` |
| `gpu.js` | 檢查無頭瀏覽器能否使用 WebGPU（SwiftShader 軟體後端，慢但可用） |

> v1 頁面使用 CDN 的 Three.js r128；沙盒連不到 CDN 時，需自備 `three.min.js` 並用 Playwright 的 `route` 提供（參考 parity.js 內 v1 分支）。
