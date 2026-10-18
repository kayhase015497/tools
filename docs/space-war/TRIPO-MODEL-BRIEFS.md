# Tripo 3D 建模簡報：星穹鐵道・翁法羅斯終章 太空戰（同人）

用途：把下面每艘艦艇／戰機的**文字描述**，連同你手上的參考圖（影片截圖／美術圖）一起丟給 Tripo（Image-to-3D 或 Text+Image），產出可替換遊戲內程序化模型的 GLB。

> **以圖為準**：標示 ⚠ 的條目，外觀細節是我依目前遊戲內模型補的，沒有對照美術圖。你的參考圖和文字不一致時，請以圖為準，並把 Prompt 裡對應的描述刪掉或改掉。
> 目前遊戲模型由 `tools-src/blender/space-war/build_ships.py` 生成，輸出在 `assets/space-war/models/*.glb`。

---

## 0. 共通規格（每一艘都適用）

| 項目 | 要求 |
|---|---|
| 格式 | GLB（glTF 2.0 binary），單一物件，材質 ≤ 4 種 |
| 朝向 | **艦首朝 +Z，艦頂朝 +Y**（Y-up）。Tripo 輸出方向不同時，先在 Blender 旋轉並 Apply Transform |
| 原點 | 艦體幾何中心，縮放 = 1 |
| 對稱 | 左右鏡像對稱 |
| 面數 | 戰機 ≤ 8k tris；護衛艦／巡洋艦 ≤ 20k；無畏艦／旗艦 ≤ 50k（遊戲用實例化大量繪製，面數要克制） |
| 貼圖 | 顏色＋金屬粗糙度即可；**發光處（窗列、引擎、描邊）請輸出 Emissive**，遊戲會加強自發光並加 bloom |
| 不要 | 底座／展示台、背景、文字商標、過度細碎的管線、半透明玻璃 |
| 風格 | 硬表面科幻、偏遊戲低中模、**遠看剪影要好辨識** |

### 遊戲內尺寸關係（建模只需保持**比例**，遊戲載入時會自動縮放到下表長度）

| 艦種 | 遊戲內長度（約） |
|---|---|
| 截擊機（戰機） | 14 m |
| 反物質軍團蝶翼機 | 12 m |
| 護衛艦 | 85 m |
| 仙舟／IPC 巡洋艦 | 230–260 m |
| 反物質軍團母艦 | 380 m |
| 無畏艦 | 1,040 m |
| 黑塔空間站 HSS | 2,040 m |
| 仙舟無畏艦 | 2,720 m（全場最大，比 HSS 長約 30%） |
| 螺絲咕姆行星艦 | 約 1,500 m（球徑） |

### 錨點（Hardpoints）

Tripo 不會產生，匯入 Blender 後手動加 Empty，名稱如下（順序無關，只看開頭）：

| 名稱 | 用途 |
|---|---|
| `HP_ENGINE_1..n` | 引擎噴口（光暈、尾跡） |
| `HP_GUN_1..n` | 砲口（光束起點，遊戲輪流使用） |
| `HP_MSL_1`／`HP_MSL_2` | 飛彈發射陣列（僅仙舟無畏艦） |
| `HP_COCKPIT` | 第一人稱視角位置（僅戰機） |
| `HP_CORE` | 鐵墓胸口核心 |

### 陣營色與光束顏色

| 陣營 | 艦體主色 | 發光／武器色 |
|---|---|---|
| 仙舟聯盟 | 深青藍 `#1c3358` ＋ 銀白裝甲 `#b9c6e0` | 金色窗列／描邊 `#ffd98a`，引擎淡藍，**藍色光束** |
| 黑塔空間站（旗艦） | 金黃／米白＋暗色骨架 | 橘紅燈，金色光束 |
| 星際和平公司 IPC | 炭黑 `#2a2124` ＋ 灰褐裝甲 | 赤橙發光線條 `#ff7a3a`，**紅色光束** |
| 螺絲咕姆 | 金黃行星 | 橘色環帶、光球 |
| 反物質軍團 | 紫黑、圓潤有機曲面 | 金色窗列、藍紫符文，**紫色**光束與引擎 |

---

## 1. 仙舟聯盟無畏艦（Xianzhou Alliance Dreadnought）⭐ 最大艦

- **定位**：全場唯一一艘，比黑塔空間站還大；負責大量光束砲、飛彈齊射與密集機砲。
- **比例**：長 : 寬 : 高 ≈ **80 : 26 : 12**，細長扁平的長矛／劍形。
- **剪影**：
  - 艦首尖銳，帶一條金色刀刃狀脊線。
  - 中後段有**多層寶塔式艦橋**（7 層，逐層縮小，金色窗列）。
  - 尾部有向後掃的**弧形大尾翼**，翼尖有紅色航行燈。
  - 兩側有較細的**舷側副艦體**，以橫樑連接，內有機庫（暗色凹槽＋金色燈帶）。
- **武裝外觀**：背部縱列 **8 座雙聯裝砲塔**；兩側各 **5 組飛彈發射陣列**（每組 3 管）；沿舷線白金色發光描邊、兩層窗列。
- **引擎**：艦尾 **5 具**圓形主引擎（淡藍光），中央最大。
- **錨點**：`HP_GUN_1..8`、`HP_MSL_1`／`HP_MSL_2`、`HP_ENGINE_1..5`。

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
Negative：`organic, bird wings, text, logo, stand, background, broken geometry`

---

## 2. 仙舟聯盟巡洋艦（Xianzhou Cruiser，`cruiser`）

- **定位**：聯軍中型主力艦，常見 10–20 艘。
- **比例**：長 : 寬 : 高 ≈ **21 : 7 : 3.5**，與無畏艦同系列的縮小版。
- **特徵**：深藍細長艦體、4 層寶塔艦橋在後 1/3、背部 2 座雙聯裝砲塔、兩側小舷翼各帶雙管、向後掃的弧形尾翼、3 具引擎。
- **錨點**：`HP_GUN_1..4`、`HP_ENGINE_1..3`。

```
A Xianzhou Alliance cruiser, slim elongated deep teal-blue hull, silver armor plating,
glowing gold window rows along both sides, a four-tier pagoda bridge near the stern,
two twin-barrel dorsal turrets, small side wings with barrels, swept-back curved tail fins,
three blue engine nozzles. Hard-surface sci-fi game asset, symmetrical, no base.
```

---

## 3. 星際和平公司巡洋艦（IPC Cruiser，`ipc`）

- **定位**：聯軍盟友，使用**紅色光束砲**；外觀走粗獷工業風，與仙舟的優雅細長區隔。
- **比例**：長 : 寬 : 高 ≈ **24 : 8 : 4**，厚實的長方體艦體。
- **特徵**：炭黑艦體＋灰褐裝甲板；**赤橙發光線條**沿舷側與背脊延伸（像發熱的熔爐）；背部隆起的發光脊線；艦首方形鈍頭，雙砲口突出；矮的 2 層方塊艦橋；無尾翼；艦尾引擎橘紅光。
- **錨點**：`HP_GUN_1..5`（含艦首兩口）、`HP_ENGINE_1..3`。

```
An Interastral Peace Corporation cruiser, blocky industrial warship, charcoal black hull
with rust-brown armor plates, glowing orange-red heat lines along the dorsal spine and
flanks like molten metal, a thick blunt bow with two protruding cannon barrels, a low
two-tier box bridge, no tail fins, orange-red engine glow at the stern.
Hard-surface sci-fi, symmetrical, game asset, no base.
```

---

## 4. 黑塔空間站旗艦 HSS（Herta Space Station）

- **定位**：聯軍指揮旗艦；任務目標「保護黑塔空間站」。
- **比例**：長 : 寬 : 高 ≈ **68 : 18 : 14**。
- **剪影**（取自美術圖）：長矛形；**艦首是長方形突刺，帶藍色箭頭（>>）紋**；中段層疊裝甲，嵌橘色與紅色燈；**船尾是巨大的輪輻圓環**（外圈弧框上有圓形發射節點），並有放射狀天線。
- **顏色**：金黃／米白為主，暗色骨架，橘紅燈。
- **錨點**：`HP_GUN_1..n`（艦首與背部）、`HP_ENGINE_1..3`、`HP_COCKPIT`（艦橋）。

```
The Herta Space Station flagship, a long spear-shaped capital ship, rectangular stabbing bow
with blue chevron arrow markings, layered gold and cream armor plates with orange and red
lights along the midsection, a large spoked ring structure at the stern with circular
emitter nodes on its outer rim and radial antennas, dark skeletal frame.
Hard-surface sci-fi, game asset, symmetrical, no base.
```

---

## 5. 螺絲咕姆行星級戰艦（Screwllum Planetary Warship）

- **定位**：月球大小的黃色行星，主砲是「巨型光束泡」（範圍轟炸）；遊戲內 3 顆。
- **比例**：近似**球體**（直徑 : 高 ≈ 1 : 1）。
- **特徵**：金黃色岩質表面，有隕坑；**赤道有一圈橘紅色發光環帶**；球面前方有大型圓形發射口；表面嵌少量金屬建築。
- **錨點**：`HP_GUN_1`（發射口，球面正前方）、`HP_ENGINE_1`（球後方）。

```
A moon-sized golden-yellow planet turned into a warship, cratered rocky surface with
metal fortress structures embedded, a glowing orange-red equatorial ring band,
a large circular cannon aperture on the front side. Stylized sci-fi game asset, no base.
```

---

## 6. 聯軍護衛艦（Frigate，`frigate`）—— 改用官方影片「大型星槎」

- **定位**：比 Starskiff 大、比仙舟巡洋艦小的護衛艦，數量最多。遊戲內 `length 10`、`sc 9`（約 Starskiff 的 6 倍長、巡洋艦的 1/5）。
- **參考**：官方影片金色線框投影的大型星槎（`images/33.webp`）。
- **比例**：長 : 寬（含飄帶）: 高 ≈ **10 : 7 : 3**。主艦體是狹長的**匕首／三角翼形**，艦首極尖，後半段加寬、背部隆起一道稜脊。
- **特徵**：
  1. 艦首尖銳，主體像斜切的長楔形，兩側有後掠的薄片尖翼。
  2. 艦尾兩側各拖兩三條**扭轉的飄帶狀長鰭**（帶狀、末端收尖、略彎曲，像星槎的絲帶尾翼），左右對稱，不要糾成一團。
  3. 艦背中段與艦尾各有一個**圓環形開口**（炮口／引擎環），環內凹陷。
- **顏色**：與星槎一致，金色／香檳金投影質感；可在稜脊與飄帶邊緣加**少量**仙舟巡洋艦那種藍色發光飾條（點綴，不超過表面積約 5%）。
- **錨點**：`HP_GUN_1`、`HP_GUN_2`（背部圓環與艦首附近）、`HP_ENGINE_1`、`HP_ENGINE_2`（艦尾圓環）、`HP_COCKPIT`；艦首朝 glTF +Z。

```
A large sci-fi starskiff escort ship, long narrow dagger-shaped wedge hull with a very sharp
prow and swept thin side blades, a raised ridge along the back, two or three twisted ribbon-like
fins trailing from each side of the stern (flat curved bands tapering to points), a circular
ring-shaped aperture on the mid back and another at the rear. Elegant, flowing,
gold and champagne metallic hull, symmetrical, hard-surface game asset, no base.
```

### 交辦 Desktop（TRIPO 匯出後）
1. 對稱整平、清掉浮渣與破面；飄帶若互穿，微調分開。三角面 ≤ 20k，貼圖 2048（法線可 1024）。
2. 長度（Z）縮放到 10、中心置於原點、艦首朝 +Z。
3. 上色比照 `models/starskiff_user.glb` / `fighter.glb` 的金色材質；稜脊與飄帶邊緣加少量藍色發光飾條（參考仙舟巡洋艦 `cruiser.glb`），藍色勿過亮。
4. 擺好 5 個錨點（Empty）。
5. 存成 `frigate_new.glb` 交回。

---

## 7. 聯軍截擊機（Interceptor，`fighter`，玩家機）⚠

- **定位**：玩家駕駛／AI 友軍戰機，30–50 架。
- **比例**：長 : 翼展 : 高 ≈ **12 : 9 : 2.5**。
- **特徵**：流線尖頭機身、後掠主翼、小型垂直尾翼、**雙引擎**（尾部左右各一）、機翼前緣有機砲管、深色座艙罩（以不透明深色表現）。
- **顏色**：深藍機身＋白色細線，淡藍發光描邊。
- **錨點**：`HP_GUN_1..4`、`HP_ENGINE_1`、`HP_ENGINE_2`、`HP_COCKPIT`。

```
A sleek sci-fi space interceptor fighter, pointed nose, swept main wings with small
wingtip gun barrels, twin rear engines glowing pale blue, dark canopy, deep blue hull with
thin white panel lines and cyan glowing edge accents. Hard-surface game asset,
symmetrical, no base.
```

---

## 8. Sentinel 預警機（AWACS，`sentinel`）⚠

- **定位**：單機，負責資料鏈與目標分配，無武器。
- **比例**：長 : 翼展 : 高 ≈ **12 : 8 : 4**（含雷達罩）。
- **特徵**：機身背負**大型圓盤雷達罩**，寬厚機翼，四具引擎（左右各兩具）。
- **顏色**：淡灰藍機身，雷達罩帶青色發光環。
- **錨點**：`HP_ENGINE_1..4`。

```
A sci-fi AWACS command aircraft, broad stubby wings, a large circular radar dome mounted
on top of the fuselage with a glowing cyan ring, four engines (two on each wing),
pale grey-blue hull with cyan accent lights, no weapons. Hard-surface game asset,
symmetrical, no base.
```

---

## 9. 反物質軍團母艦（Legion Carrier，`whale`）

- **定位**：敵方主力，紫色光束與機砲。
- **比例**：長 : 寬 : 高 ≈ **27 : 18 : 7**，寬扁圓潤。
- **特徵**（取自美術圖）：**圓潤的鯨／魟形艦體**，兩側**鰓狀鰭片**，艦身排列**金色窗列**與**藍紫色符文**發光；頭部雙砲口，尾部單一大型引擎。
- **顏色**：紫黑主體、金色窗、藍紫符文、紫色引擎光。
- **錨點**：`HP_GUN_1..4`、`HP_ENGINE_1`。

```
An alien antimatter legion carrier, rounded whale- or manta-ray-shaped hull, deep
purple-black with glowing gold window rows and blue-violet rune glyphs, gill-like fins on
both flanks, two cannon ports on the head, one large violet engine at the tail.
Biomechanical sci-fi game asset, symmetrical, no base.
```

---

## 10. 反物質軍團蝶翼機（Butterfly Fighter，`butterfly`）

- **定位**：敵方小型戰機，數量最多（常同時 50–140 架），**面數請壓到最低**。
- **比例**：長 : 翼展 : 厚 ≈ **8 : 10 : 1**。
- **特徵**：小機身＋兩片**大型蝶翼**（深紫底、藍紫發光紋路），尾部單引擎，前方雙砲口。
- **錨點**：`HP_GUN_1`、`HP_GUN_2`、`HP_ENGINE_1`。

```
A small alien butterfly-winged fighter, tiny central body with two large angular butterfly
wings, deep purple with glowing blue-violet vein patterns, twin small gun ports at the
front, one engine at the rear. Low-poly stylized sci-fi game asset, symmetrical, no base.
```

---

## 11. 鐵墓 Irontomb（Boss，選用）

- **定位**：行星級巨人，遊戲內高度約 8,400 m；**不會攻擊聯軍**，是被攻擊的目標。
- **剪影**（依美術設定圖，T 字站姿、正面）：
  - **高聳尖頂的盾形兜帽**，兜帽內是層層紫光百葉，正中一顆洋紅菱形核心。
  - **十字平舉的主臂**：沙漏形肩段 → 帶 T 形棘刺的齒輪環 → 長前臂 → 骨骼狀手掌。
  - 肩胛碎片、頸椎串、胸前骨板、紫色縫隙光；第二對細臂垂在身側。
  - 腰間一圈棘刺環，腰下垂多對細長多節的手臂；下半身為逐漸收尖的碎片裙擺，中央有紫光縫。
- **顏色**：暗骨白與深灰金屬。遊戲內會被紅光壓暗，只留邊緣紅色輪廓光；發光處為洋紅／紫。
- **錨點**：`HP_CORE`（胸口核心）。
- **備註**：遊戲內另有一圈高亮的「莫比烏斯環」繞在鐵墓大腿中段，那是獨立特效，不需要建進鐵墓模型。

```
A colossal gothic mechanical giant standing in a T-pose, towering pointed shield-shaped hood
with layered glowing purple louvers and a magenta diamond core, long horizontal arms with
hourglass shoulders, spiked gear rings and bony hands, a thin second pair of arms at the
sides, a spiked ring at the waist, many long segmented tendril arms hanging below, a tapering
shard-like skirt with a purple glowing seam, bone-white and dark gunmetal, eerie menacing
silhouette. Hard-surface sci-fi boss asset, symmetrical, no base.
```

---

## 12. 使用流程

1. **一艘一艘做**：圖片（你的截圖）＋ 上面的 Prompt。先拿最簡單的戰機／護衛艦試水溫，確認方向與比例，再做大型艦。
2. **Blender 後處理**：旋轉到 +Z 前進、Y 向上 → Apply Transform → 加 Empty 錨點 → 必要時用 Decimate 降面。
3. **覆蓋檔案** `assets/space-war/models/<檔名>.glb`。遊戲依 `sw-assets.js` 的 `MANIFEST` 長度自動縮放，所以只要比例與方向正確即可：

| 艦種 | 檔名 | MANIFEST 長度 |
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

4. **材質太亮或太反光**：在 Blender 把金屬度降到 0.5–0.7、粗糙度 ≥ 0.4 後再匯出。
5. 成品 GLB 交給我，我可以檢查方向、縮放、錨點，並接進遊戲測試。
