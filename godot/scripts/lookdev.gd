extends Node
## V0 固定鏡頭組（docs/space-war/GODOT-VISUAL-PLAN.md）：依固定亂數種子開局，依序拍固定畫面。
## 每個鏡頭拍兩次——A＝舊光照（第十五版）、B＝新光照（V1）——左右拼成一張，並量各自的 GPU／CPU 毫秒數。
## 命令列：-- --lookdev [--out=資料夾] [--only=01,05] [--q=0|1|2]；Windows 直接雙擊 godot/tools/lookdev.bat。
## 輸出：<資料夾>/NN_name.png（左 A 右 B）＋ report.csv ＋ report.txt。

const Lighting = preload("res://scripts/lighting.gd")
var SETTLE_FRAMES := 45   # 換鏡頭／切光照後等幾幀：TAA 收斂、陰影與天空反射更新
var MEASURE_FRAMES := 60
const SEED := 4242

var battle: Node
var out_dir := ""
var only: Array = []
var cam_locked := true
var vp_rid: RID
var rows: Array = []

# 鏡頭：kind／side＝挑哪一種艦；off／look＝以「艦長」為單位、艦艇本地座標（x 右、y 上、z 艦首）的鏡頭位置與注視點
const SHOTS := [
	{"id": "01", "name": "hss_hero", "kind": "hss", "side": 0, "off": [0.55, 0.16, 0.2], "look": [0.0, 0.0, -0.05], "fov": 50.0},
	{"id": "02", "name": "cruiser_close", "kind": "cruis", "side": 0, "off": [0.85, 0.28, 0.55], "look": [0.0, 0.0, 0.0], "fov": 50.0},
	{"id": "03", "name": "enemy_carrier", "kind": "whale", "side": 1, "off": [-0.9, 0.35, 0.6], "look": [0.0, 0.0, 0.0], "fov": 50.0},
	{"id": "04", "name": "fleet_wide", "fixed": true, "fov": 60.0},
	{"id": "05", "name": "explosion_near_ship", "kind": "cruis", "side": 0, "off": [1.6, 0.4, 0.9], "look": [0.2, 0.0, 0.0], "fov": 50.0, "boom": true},
	{"id": "06", "name": "irontomb", "tomb": true, "fov": 55.0},
	{"id": "07", "name": "combat_chase", "combat": 25.0},
	{"id": "08", "name": "cockpit", "cockpit": true},
]

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a.begins_with("--only="):
			only = Array(a.substr(7).split(","))
		elif a == "--fast":   # 雲端軟體渲染檢查用：少等幾幀（毫秒數無意義）
			SETTLE_FRAMES = 4
			MEASURE_FRAMES = 2
	if out_dir == "":
		out_dir = OS.get_user_data_dir().path_join("lookdev")
	DirAccess.make_dir_recursive_absolute(out_dir)
	FileAccess.open(out_dir.path_join(".gdignore"), FileAccess.WRITE).close()   # 截圖放在專案資料夾裡時，別讓編輯器去匯入它們
	vp_rid = get_viewport().get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(vp_rid, true)
	_run.call_deferred()

func _frames(n: int) -> void:
	for i in range(n):
		await get_tree().process_frame

func _measure() -> Array:
	var g := 0.0
	var c := 0.0
	for i in range(MEASURE_FRAMES):
		await get_tree().process_frame
		g += RenderingServer.viewport_get_measured_render_time_gpu(vp_rid)
		c += RenderingServer.viewport_get_measured_render_time_cpu(vp_rid) + RenderingServer.get_frame_setup_time_cpu()
	return [g / MEASURE_FRAMES, c / MEASURE_FRAMES]

func _pick(kind: String, side: int):   # 挑離大型艦（月亮、無畏艦等）最遠的一艘，避免前景被擋住
	var list: Array = battle.allies if side == 0 else battle.enemies
	var best = null
	var best_d := -1.0
	for s in list:
		if s.kind != kind or s.dead or s.is_player:
			continue
		var dmin := 1e12
		for o in battle.allies + battle.enemies:
			if o != s and not o.dead and o.rad > 250.0:
				dmin = minf(dmin, s.pos.distance_to(o.pos) - o.rad)
		if dmin > best_d:
			best_d = dmin
			best = s
	return best

func _place(shot: Dictionary) -> bool:
	var cam: Camera3D = battle.cam
	cam.fov = float(shot.get("fov", 60.0))
	cam.near = 1.0
	if shot.get("fixed", false):   # 艦隊後上方望向鐵墓（與標題選單同一個構圖）
		cam.global_position = Vector3(1800.0, 2200.0, 11500.0)
		cam.look_at(battle.TOMB_POS + Vector3(0, 900, 0), Vector3.UP)
		return true
	if shot.get("tomb", false):
		cam.global_position = battle.TOMB_POS + Vector3(2600.0, 1400.0, 9000.0)
		cam.look_at(battle.TOMB_POS + Vector3(0, 1200, 0), Vector3.UP)
		return true
	var s = _pick(shot["kind"], int(shot["side"]))
	if s == null:
		push_warning("[lookdev] no ship of kind " + str(shot["kind"]))
		return false
	var L: float = float(battle.KMODEL[s.kind][1]) * s.k
	var b: Basis = battle.basis_of(s)
	var o: Array = shot["off"]
	var lk: Array = shot["look"]
	cam.global_position = s.pos + b * (Vector3(o[0], o[1], o[2]) * L)
	cam.look_at(s.pos + b * (Vector3(lk[0], lk[1], lk[2]) * L), b.y)
	shot["_ship"] = s
	shot["_L"] = L
	return true

func _capture(shot: Dictionary, lit_on: bool) -> Array:
	Lighting.apply(battle, lit_on, battle.quality)
	await _frames(SETTLE_FRAMES)
	if shot.get("boom", false) and shot.has("_ship"):   # 爆炸：在艦側 0.35 艦長處引爆，0.6 秒後拍
		var s = shot["_ship"]
		var b: Basis = battle.basis_of(s)
		Explosion.spawn(battle, s.pos + b * (Vector3(0.45, 0.1, 0.1) * float(shot["_L"])), 70.0, 0, 0)
		await get_tree().create_timer(0.6).timeout
	var img := get_viewport().get_texture().get_image()
	var m: Array = await _measure()
	return [img, m]

func _run() -> void:
	await _frames(10)
	battle.bpaused = true
	battle._render_ships()
	var started_ms := Time.get_ticks_msec()
	for shot_c in SHOTS:
		var shot: Dictionary = (shot_c as Dictionary).duplicate()
		if not only.is_empty() and not (shot["id"] in only):
			continue
		if shot.has("combat"):   # 讓戰鬥跑一段（玩家自動開火），再凍結拍追尾視角
			cam_locked = false
			battle.autoplay = true
			battle.bpaused = false
			var t0: float = battle.gt
			while battle.gt < t0 + float(shot["combat"]):
				await get_tree().process_frame
			battle.bpaused = true
		elif shot.get("cockpit", false):
			cam_locked = false
			battle.cam_mode = 1
		else:
			cam_locked = true
			battle.cam_mode = 0
			if battle.cockpit:
				battle.cockpit.visible = false
			if not _place(shot):
				continue
		var a: Array = await _capture(shot, false)
		var bb: Array = await _capture(shot, true)
		_save_pair(shot, a, bb)
	var f := FileAccess.open(out_dir.path_join("report.csv"), FileAccess.WRITE)
	f.store_line("shot,lighting,gpu_ms,cpu_ms")
	var txt := "Space War lookdev  %s\nGPU: %s (%s)\nresolution: %s  3D scale: %.2f  quality: %d\n\n" % [Time.get_datetime_string_from_system(), RenderingServer.get_video_adapter_name(), RenderingServer.get_video_adapter_api_version(), str(get_viewport().get_visible_rect().size), get_viewport().scaling_3d_scale, battle.quality]
	txt += "%-22s %10s %10s %10s\n" % ["shot", "A old GPU", "B V1 GPU", "diff"]
	for r in rows:
		f.store_line("%s,old,%.2f,%.2f" % [r["name"], r["a"][0], r["a"][1]])
		f.store_line("%s,v1,%.2f,%.2f" % [r["name"], r["b"][0], r["b"][1]])
		txt += "%-22s %8.2fms %8.2fms %+8.2fms\n" % [r["name"], r["a"][0], r["b"][0], float(r["b"][0]) - float(r["a"][0])]
	f.close()
	txt += "\n(budget: 1080p/60fps -> GPU <= 14 ms)\nelapsed %.0f s\n" % ((Time.get_ticks_msec() - started_ms) / 1000.0)
	var f2 := FileAccess.open(out_dir.path_join("report.txt"), FileAccess.WRITE)
	f2.store_string(txt)
	f2.close()
	print(txt)
	print("[lookdev] done -> ", out_dir)
	get_tree().quit()

func _save_pair(shot: Dictionary, a: Array, b: Array) -> void:
	var ia: Image = a[0]
	var ib: Image = b[0]
	ia.convert(Image.FORMAT_RGB8)
	ib.convert(Image.FORMAT_RGB8)
	var w := ia.get_width()
	var h := ia.get_height()
	var out := Image.create(w * 2 + 8, h, false, Image.FORMAT_RGB8)
	out.fill(Color(1, 1, 1))
	out.blit_rect(ia, Rect2i(0, 0, w, h), Vector2i(0, 0))
	out.blit_rect(ib, Rect2i(0, 0, w, h), Vector2i(w + 8, 0))
	var nm := "%s_%s" % [shot["id"], shot["name"]]
	out.save_png(out_dir.path_join(nm + ".png"))
	rows.append({"name": nm, "a": a[1], "b": b[1]})
	print("[lookdev] %s  A(old) gpu=%.2fms  B(V1) gpu=%.2fms" % [nm, a[1][0], b[1][0]])
