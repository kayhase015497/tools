# tools — 自製工具集

各種自製小工具，部署於 GitHub Pages。

## 部署

- **平台**：GitHub Pages，repo: `kayhase015497/tools`
- **上線網址**：`https://kayhase015497.github.io/tools/`
- **觸發條件**：push 到 `main` branch 後，CI 自動部署（約 2~5 分鐘）
- **工作流程**：`.github/workflows/static.yml`（純靜態，無 build step）

## 目錄結構

```
tools/
├── index.html          # 工具集首頁（列出所有工具的入口）
├── CLAUDE.md           # 本文件
├── gadget/             # 各工具 HTML 檔案放這裡
│   └── ...
├── .github/
│   └── workflows/
│       └── static.yml  # GitHub Pages 部署
└── assets/             # 共用圖片、字體（如有需要）
```

## 開發慣例

### Branch
- 所有新功能在 feature branch 開發，完成後 merge 到 `main`
- Claude Code session 自動分配 branch

### 頁面風格（所有 HTML 都應遵守）
- **語言**：繁體中文（zh-Hant）
- **主題**：深色（背景 `#0b0f1a`）
- **字型**：`Noto Sans TC`（中文）+ `Space Mono`（數字/標籤/code）
- **設計系統**：無框架，純 CSS + Vanilla JS
- **CSS 命名空間**：每個工具 class 加前綴（如 `.mytool-`），防止污染
- **RWD**：行動優先，用 `clamp()` 處理字型大小

### 新增工具 SOP

1. 在 `gadget/` 建立 `<tool-name>.html`
2. 採用深色主題、繁中、Space Mono 標籤
3. CSS class 加工具名稱前綴防衝突
4. 在 `index.html` 的 `#th-grid` 裡新增一張 `.th-card`（`<a>` 標籤）
5. Merge 到 `main` 觸發部署

### index.html 新增卡片範例

```html
<a class="th-card" href="gadget/my-tool.html">
  <div class="th-card-name">工具名稱</div>
  <div class="th-card-desc">一兩句說明這個工具做什麼</div>
  <div class="th-card-tags">
    <span class="th-tag">標籤</span>
  </div>
</a>
```

### 常用外部資源（CDN）
- D3.js v7：`https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js`
- Google Fonts：Noto Sans TC / Space Mono
