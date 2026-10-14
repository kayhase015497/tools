# Tripo 3D 建模簡報：星穹鐵道・翁法羅斯終章 太空戰（同人）

用途：搭配你手上的參考圖（影片截圖／美術圖），把下面每艘艦艇的**文字描述**一起丟給 Tripo（Image-to-3D 或 Text+Image），產出可替換遊戲內程序化模型的 GLB。
遊戲目前的模型由 `tools-src/blender/space-war/build_ships.py` 生成，輸出到 `assets/space-war/models/*.glb`。

---

## 0. 共通規格（每一艘都適用）

| 項目 | 要求 |
|---|---|
| 格式 | GLB（glTF 2.0 binary），單一物件，材質 ≤ 4 種 |
| 朝向 | **艦首朝向 +Z**，艦頂朝向 +Y（Y-up）。若 Tripo 輸出方向不同，匯入 Blender 旋轉後再匯出 |
| 原點 | 艦體幾何中心（Blender 套用 Apply Transform，縮放 = 1） |
| 對稱 | 左右鏡像對稱（戰機、巡洋艦以上尤其重要） |
| 面數 | 戰機 ≤ 8k tris；護衛艦／巡洋艦 ≤ 20k；無畏艦／旗艦 ≤ 50k（遊戲用實例化大量繪製，面數要克制） |
| 貼圖 | 顏色＋金屬粗糙度即可，可烘焙 AO；**發光處（窗列、引擎、描邊）請輸出 Emissive 貼圖**，遊戲會放大自發光並加 bloom |
| 不要 | 底座／展示台、背景、文字商標、過度細碎的管線、半透明玻璃（遊戲不處理折射） |
| 風格 | 硬表面科幻（hard-surface sci-fi）、偏遊戲低中模、剪影辨識度高（遊戲內多半從遠處看） |

### 遊戲內的尺寸關係（建模時請保持**長寬高比例**，絕對大小遊戲會縮放）

| 艦種 | 遊戲內長度（約） | 備註 |
|---|---|---|
| 戰機 | 14 m | 數十架同時出現 |
| 護衛艦 | 85 m | |
| 巡洋艦（仙舟／IPC） | 230–260 m | |
| 無畏艦 | 1,040 m | |
| 黑塔空間站 HSS | 2,040 m | 旗艦 |
| 仙舟無畏艦 | 2,720 m | 全場最大的艦，比 HSS 長約 30% |
| 螺絲咕姆行星艦 | 1,500 m（球徑） | 月球大小的行星 |
| 反物質軍團母艦 | 380 m | |

### 錨點（Hardpoints）——Tripo 不會產生，匯入 Blender 後手動加 Empty

| 名稱 | 用途 |
|---|---|
| `HP_ENGINE_1..n` | 艦尾引擎噴口位置（引擎光暈、尾跡） |
| `HP_GUN_1..n` | 光束砲／機砲砲口（光束起點）。遊戲會輪流使用 |
| `HP_MSL_1`、`HP_MSL_2` | 飛彈發射陣列（右／左，僅仙舟無畏艦用） |
| `HP_COCKPIT` | 第一人稱視角位置（僅戰機） |

> 順序無關，只要名稱以 `HP_GUN_` / `HP_ENGINE_` 開頭即可；位置放在模型座標中即可，遊戲載入時會一起縮放。

### 陣營色與光束顏色（發光顏色請對應）

| 陣營 | 艦體主色 | 發光／武器色 |
|---|---|---|
| 仙舟聯盟 | 深青藍 `#1c3358`＋銀白裝甲 `#b9c6e0` | 金色窗列／描邊 `#ffd98a`，引擎淡藍，**藍色光束** |
| 黑塔空間站（聯軍旗艦） | 金黃／米白＋暗色骨架 | 橘紅燈、金色光束 |
| 星際和平公司 IPC | 炭黑 `#2a2124`＋灰褐裝甲 | 赤橙發光線條 `#ff7a3a`，**紅色光束** |
| 螺絲咕姆 | 金黃色行星 | 橘色環帶、光球 |
| 反物質軍團 | 紫黑＋圓潤有機曲面，金色窗列、藍紫符文 | **紫色**光束與引擎 |

---

## 1. 仙舟聯盟無畏艦（Xianzhou Alliance Dreadnought）⭐ 最大艦

- **定位**：聯軍主力重艦，全場唯一一艘，比黑塔空間站還大，負責大量光束砲、飛彈齊射與密集機砲。
- **尺寸比例**：長 : 寬 : 高 ≈ **80 : 26 : 12**（細長、扁平的長矛／劍形）。
- **剪影**：
  - 艦首尖銳，帶一條金色刀刃狀脊線；艦體向後略為加寬。
  - 艦體中後段有**多層寶塔式艦橋**（7 層，逐層縮小，帶金色窗列）。
  - 尾部有向後掃的**弧形大尾翼**（上下各兩對），翼尖有紅色航行燈。
  - 兩側有**舷側延伸艙**（較細的副艦體）以橫樑連接，內有機庫（暗色凹槽＋內部金色燈帶）。
- **武裝外觀**：
  - 背部縱向排列 **8 座雙聯裝砲塔**（圓形基座＋方形炮塔＋雙管）。
  - 兩側舷各 **5 組飛彈發射陣列**（每組 3 管），放在副艦體外側。
  - 沿舷線有白金色發光描邊，兩層窗列。
- **引擎**：艦尾 **5 具**圓形主引擎（淡藍光），中央最大。
- **顏色**：深青藍艦體、銀白裝甲板、金色窗與描邊、艦首刃脊發金光。
- **錨點**：`HP_GUN_1..8`（背部砲塔口）、`HP_MSL_1`／`HP_MSL_2`（兩側飛彈陣列）、`HP_ENGINE_1..5`。

**Tripo Prompt（英文）**
```
A colossal Xianzhou Alliance dreadnought, long slender sword-shaped capital warship,
dark teal-blue hull with silver-white armor plates and gold glowing trim lines,
a seven-tier pagoda-style bridge tower on the rear dorsal spine,
eight twin-barrel turrets lined along the top, two side pods connected by struts
each with five missile launcher arrays, a hangar bay with warm gold lights,
gracefully swept-back curved tail fins with small red nav lights,
five large round engine nozzles at the stern glowing pale blue,
a golden blade-like ridge on the bow. Hard-surface sci-fi, symmetrical, game asset,
clean silhouette, no base, no text.
```
**Negative**：`organic, wings like a bird, text, logo, stand, background, broken geometry`

---

## 2. 仙舟聯盟巡洋艦（Xianzhou Cruiser，遊戲內 `cruiser`）

- **定位**：聯軍中型主力艦，數量約 10–20 艘。
- **比例**：長 : 寬 : 高 ≈ **21 : 7 : 3.5**，與無畏艦同系列的縮小版。
- **特徵**：深藍細長艦體、4 層寶塔艦橋位於後 1/3、背部 2 座雙聯裝砲塔、兩側小舷翼各帶雙管、向後掃的弧形尾翼、3 具引擎。
- **顏色**：與無畏艦相同（深青藍＋銀白＋金窗）。
- **錨點**：`HP_GUN_1..4`、`HP_ENGINE_1..3`。

**Tripo Prompt**
```
A Xianzhou Alliance cruiser, slim elongated deep teal-blue hull, silver armor plating,
glowing gold window rows along both sides, a four-tier pagoda bridge near the stern,
two twin-barrel dorsal turrets, small side wings with barrels, swept-back curved tail fins,
three blue engine nozzles. Hard-surface sci-fi game asset, symmetrical, no base.
```

---

## 3. 星際和平公司巡洋艦（IPC Cruiser，遊戲內 `ipc`）

- **定位**：聯軍盟友，使用**紅色光束砲**。外觀與仙舟不同——更粗獷、工業感。
- **比例**：長 : 寬 : 高 ≈ **24 : 8 : 4**，厚實的長方體艦體。
- **特徵**：
  - 炭黑艦體＋灰褐裝甲板，**赤橙色發光線條**沿舷側與背脊延伸（像熔爐般發熱）。
  - 背部有一條隆起的**發光脊線**，艦首是方形的厚重鈍頭，雙砲口突出（紅色光束出口）。
  - 艦橋矮、2 層方塊式，無尾翼。
  - 艦尾引擎噴口發橘紅光。
- **錨點**：`HP_GUN_1..5`（含艦首兩口）、`HP_ENGINE_1..3`。

**Tripo Prompt**
```
An Interastral Peace Corporation cruiser, blocky industrial warship, charcoal black hull
with rust-brown armor plates, glowing orange-red heat lines along the dorsal spine and
flanks like molten metal, a thick blunt bow with two protruding cannon barrels, a low
two-tier box bridge, no tail fins, orange-red engine glow at the stern.
Hard-surface sci-fi, symmetrical, game asset, no base.
```

---

## 4. 黑塔空間站旗艦 HSS（Herta Space Station flagship）

- **定位**：聯軍指揮旗艦，任務目標「保護黑塔空間站」。
- **比例**：長 : 寬 : 高 ≈ **68 : 18 : 14**。
- **剪影**：長矛形——**艦首是長方形突刺，帶藍色箭頭（>>）紋**；中段是層疊裝甲，嵌橘色與紅色燈；**船尾是一個巨大的輪輻圓環**（外圈弧框上有圓形發射節點），並有放射狀天線。
- **顏色**：金黃／米白為主，暗色骨架，橘紅燈；環面帶金色光暈。
- **錨點**：`HP_GUN_1..n`（艦首與背部）、`HP_ENGINE_1..3`、`HP_COCKPIT`（艦橋）。

**Tripo Prompt**
```
The Herta Space Station flagship, a long spear-shaped capital ship, rectangular stabbing bow
with blue chevron arrow markings, layered gold and cream armor plates with orange and red
lights along the midsection, a large spoked ring structure at the stern with circular
emitter nodes on its outer rim and radial antennas, dark skeletal frame.
Hard-surface sci-fi, game asset, symmetrical, no base.
```

---

## 5. 螺絲咕姆行星級戰艦（Screwllum Planetary Warship）

- **定位**：月球大小的黃色行星，主砲為「**巨型光束泡**」（範圍轟炸）。遊戲內共 3 顆。
- **比例**：近似**球體**（直徑 : 高 ≈ 1 : 1）。
- **特徵**：金黃色岩質行星表面，有隕坑；**赤道有一圈橘紅色發光環帶／軌道環**；表面某處有大型發射口（光束泡出口）；表面嵌著少量金屬建築。
- **顏色**：金黃＋橘紅環帶，暗部偏深橘。
- **錨點**：`HP_GUN_1`（發射口，位於球面正前方）、`HP_ENGINE_1`（球後方）。

**Tripo Prompt**
```
A moon-sized golden-yellow planet turned into a warship, cratered rocky surface with
metal fortress structures embedded, a glowing orange-red equatorial ring band,
a large circular cannon aperture on the front side. Stylized sci-fi game asset, no base.
```

---

## 6. 聯軍護衛艦（Alliance Frigate，`frigate`）

- **定位**：小型飛鏢艦，數量最多（20–50 艘）。
- **比例**：長 : 寬 : 高 ≈ **9.5 : 5 : 1.5**（扁平三角飛鏢形）。
- **特徵**：箭頭形艦體，尖銳艦首，兩側小翼，翼端各一具引擎；單一艦首砲口。
- **顏色**：深藍＋淡藍發光描邊，引擎淡藍。
- **錨點**：`HP_GUN_1`、`HP_GUN_2`（翼前端）、`HP_ENGINE_1`、`HP_ENGINE_2`、`HP_COCKPIT`。

**Tripo Prompt**
```
A small flat dart-shaped sci-fi frigate, sharp arrowhead hull, deep blue with pale cyan
glowing edge lines, two small swept wings each with a rear engine, a forward gun port.
Hard-surface game asset, symmetrical, no base.
```

---

## 7. 聯軍截擊機（Interceptor Fighter，`fighter`，玩家機）

- **定位**：玩家駕駛／AI 友軍戰機，數量 30–50 架。
- **比例**：長 : 翼展 : 高 ≈ **12 : 9 : 2.5**。
- **特徵**：流線尖頭機身、前掠或後掠主翼、小型垂直尾翼、**雙引擎**（尾部左右各一）、機翼前緣各 1–2 管機砲；座艙罩為深色玻璃（以不透明深色表現）。
- **顏色**：深藍機身＋白色細線，發光描邊淡藍，引擎淡藍。
- **錨點**：`HP_GUN_1..4`（機翼前緣）、`HP_ENGINE_1`、`HP_ENGINE_2`、`HP_COCKPIT`（座艙正中）。

**Tripo Prompt**
```
A sleek sci-fi space interceptor fighter, pointed nose, swept main wings with small
wingtip gun barrels, twin rear engines glowing pale blue, dark canopy, deep blue hull with
thin white panel lines and cyan glowing edge accents. Hard-surface game asset,
symmetrical, no base.
```

---

## 8. Sentinel 預警機（AWACS）

- **定位**：資料鏈指揮機，單機，負責分配友軍目標。
- **比例**：長 : 翼展 : 高 ≈ **12 : 8 : 4**（含雷達罩）。
- **特徵**：機身中段**大型圓盤雷達罩**（背負式），寬厚機翼，四具引擎（機翼左右各兩具），無武器。
- **顏色**：淡灰藍機身，雷達罩帶青色發光環。
- **錨點**：`HP_ENGINE_1..4`。

**Tripo Prompt**
```
A sci-fi AWACS command aircraft, broad stubby wings, a large circular radar dome mounted
on top of the fuselage with a glowing cyan ring, four engines (two on each wing),
pale grey-blue hull with cyan accent lights, no weapons. Hard-surface game asset,
symmetrical, no base.
```

---

## 9. 反物質軍團母艦（Legion Carrier，`whale`）

- **定位**：敵方主力，鯨形／魟形，紫色光束與機砲。
- **比例**：長 : 寬 : 高 ≈ **27 : 18 : 7**（寬扁、圓潤）。
- **特徵**：**圓潤的鯨／魟形艦體**，兩側有**鰓狀鰭片**，艦身排列**金色窗列**與**藍紫色符文**發光，頭部有雙砲口，尾部單一大型引擎。
- **顏色**：紫黑色主體，金色窗，藍紫符文，引擎紫光。
- **錨點**：`HP_GUN_1..4`（頭部與兩側）、`HP_ENGINE_1`。

**Tripo Prompt**
```
An alien antimatter legion carrier, rounded whale- or manta-ray-shaped hull, deep
purple-black with glowing gold window rows and blue-violet rune glyphs, gill-like fins on
both flanks, two cannon ports on the head, one large violet engine at the tail.
Biomechanical sci-fi game asset, symmetrical, no base.
```

---

## 10. 反物質軍團蝶翼機（Butterfly Fighter，`butterfly`）

- **定位**：敵方小型戰機，數量最多（常同時 50–140 架）。**面數請壓到最低。**
- **比例**：長 : 翼展 : 厚 ≈ **8 : 10 : 1**。
- **特徵**：小型機身＋兩片**大型蝶翼**（半透明感以深紫色加亮藍紫發光紋表現），尾部單引擎，前方雙砲口。
- **顏色**：深紫＋藍紫發光紋路。
- **錨點**：`HP_GUN_1`、`HP_GUN_2`、`HP_ENGINE_1`。

**Tripo Prompt**
```
A small alien butterfly-winged fighter, tiny central body with two large angular butterfly
wings, deep purple with glowing blue-violet vein patterns, twin small gun ports at the
front, one engine at the rear. Low-poly stylized sci-fi game asset, symmetrical, no base.
```

---

## 11. 鐵墓 Irontomb（Boss，選用）

- **定位**：行星級巨人，遊戲內高度約 8,400 m（模型高度 248 單位），**不會攻擊聯軍**，是被攻擊的目標。
- **剪影**（T 字站姿、正面）：
  - **高聳尖頂的盾形兜帽**，兜帽內為層層疊疊的紫光百葉，正中一顆洋紅色菱形核心。
  - **十字平舉的主臂**：沙漏形肩段 → 帶 T 形棘刺的齒輪環 → 長前臂 → 骨骼狀手掌。
  - 肩胛碎片、頸椎串、胸前骨板、紫色縫隙光；第二對細臂垂在身側。
  - 腰間一圈棘刺環，腰部垂下多對細長多節的手臂；下半身為逐漸收尖的碎片裙擺，中央有紫光縫。
- **顏色**：暗色骨白與深灰金屬，**遊戲內會被紅光照得很暗**，只保留邊緣紅色輪廓光；發光處為洋紅／紫。
- **錨點**：`HP_CORE`（胸口核心）。

**Tripo Prompt**
```
A colossal gothic mechanical giant standing in a T-pose, towering pointed shield-shaped hood
with layered glowing purple louvers and a magenta diamond core, long horizontal arms with
hourglass shoulders, spiked gear rings and bony hands, a thin second pair of arms at the
sides, a spiked ring at the waist, many long segmented tendril arms hanging below, a tapering
shard-like skirt with a purple glowing seam, bone-white and dark gunmetal, eerie menacing
silhouette. Hard-surface sci-fi boss asset, symmetrical, no base.
```

---

## 12. 使用流程建議

1. 每艘分開生成：圖片（你的截圖）＋ 上面的 Prompt。先用**最簡單的戰機／護衛艦**試水溫，確認方向與比例。
2. 把輸出的 GLB 丟進 Blender：旋轉到 **+Z 前進、Y 向上**、套用縮放、加上 Empty 錨點（見 0 節）、檢查面數（Decimate 修改器可降面）。
3. 覆蓋 `assets/space-war/models/<名稱>.glb`，檔名對應：

| 艦種 | 檔名 | `sw-assets.js` 的 `MANIFEST` 長度 |
|---|---|---|
| 仙舟無畏艦 | `xzd.glb` | 80 |
| 仙舟巡洋艦 | `cruiser.glb` | 21 |
| IPC 巡洋艦 | `ipc.glb` | 24 |
| 無畏艦 | `dread.glb` | 52 |
| 黑塔空間站 | `hss.glb` | 68 |
| 螺絲咕姆 | `moon.glb` | 34 |
| 護衛艦 | `frigate.glb` | 9.5 |
| 截擊機 | `fighter.glb` | 14 |
| 預警機 | `sentinel.glb` | 120 |
| 反物質軍團母艦 | `whale.glb` | 27 |
| 蝶翼機 | `butterfly.glb` | 8 |
| 鐵墓 | `irontomb.glb` | 248（以**高度**正規化） |

   遊戲載入時會依 `MANIFEST` 的長度自動縮放，所以**只要比例正確、方向正確即可**，不用在 Blender 裡調到精確大小。
4. 如果 Tripo 的結果材質偏亮／太反光：遊戲端沒有 tone mapping 以外的調整，建議在 Blender 把金屬度降到 0.5–0.7、粗糙度 0.4 以上再匯出。

> 想把成品放進遊戲時，把 GLB 給我，我可以幫你檢查方向／縮放／錨點，並接進去測試。
