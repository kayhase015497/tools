extends "res://scripts/spike.gd"
## 戰場（階段 2 第一版）：把網頁版 battle-sim.js 的玩法搬到 Godot——飛行員／自由模式。
## 繼承 spike.gd 只為了沿用艦體材質轉換（POM）、環境、鐵墓、爆炸與斷裂的呼叫；_ready／_input／_process 全部改寫。
## 世界單位＝公尺，座標與網頁版相同：鐵墓在 (0, 1500, -15500)，聯軍集中在鐵墓朝 +Z 的一側。
## 艦艇資料表 DEF、AI（戰機／主力艦）、武器（機炮、光束砲、飛彈、光束泡）、護盾、傷害、增援、預警機資料鏈皆依網頁版移植。

const TOMB_POS := Vector3(0, 1500, -15500)
const TOMB_SCALE_W := 34.0
const TOMB_AURA := 4200.0
const ARENA_R := 15000.0
const SIDE_AZ := 1.0
# 鐵墓命中球（模型座標，乘 TOMB_SCALE_W 為世界尺寸）：[x, y, z, 半徑]
const TOMB_PARTS := [[0, 86, 0, 22], [0, 40, 0, 22], [-34, 86, 0, 14], [34, 86, 0, 14], [-46, 86, 0, 12], [46, 86, 0, 12], [-105, 86, 0, 14], [105, 86, 0, 14], [-47, 10, 0, 10], [47, 10, 0, 10], [0, 14, 0, 30], [0, -45, 0, 24], [0, -100, 0, 12]]

# side 0＝聯軍、1＝反物質軍團。col 為光束／彈道顏色。
const DEF := {
	"fgt":   {"side": 0, "name": "Interceptor", "hp": 150.0, "spd": 105.0, "rad": 8.0, "turn": 1.7, "boom": 0.8, "cls": "fgt"},
	"frig":  {"side": 0, "name": "Frigate", "hp": 3000.0, "shield": 500.0, "spd": 28.0, "turn": 0.20, "rad": 40.0, "range": 1500.0, "boom": 4.0, "cls": "ship",
		"flak": {"cd": 0.5, "dmg": 40.0, "w": 1.2, "len": 30.0, "bs": 900.0, "col": Color(0.3, 0.7, 1.0)}, "beam": {"cd": 4.0, "n": 1, "dmg": 260.0, "w": 5.0, "col": Color(0.35, 0.7, 1.0)}},
	"cruis": {"side": 0, "name": "Cruiser", "hp": 9000.0, "shield": 1800.0, "spd": 24.0, "turn": 0.14, "rad": 95.0, "range": 1900.0, "boom": 6.0, "cls": "ship",
		"flak": {"cd": 0.45, "dmg": 60.0, "w": 1.6, "len": 40.0, "bs": 900.0, "col": Color(0.3, 0.7, 1.0)}, "beam": {"cd": 3.5, "n": 1, "dmg": 600.0, "w": 9.0, "col": Color(0.3, 0.65, 1.0)}},
	"cap":   {"side": 0, "name": "Dreadnought", "hp": 42000.0, "shield": 8000.0, "spd": 21.0, "turn": 0.09, "rad": 340.0, "range": 2600.0, "boom": 12.0, "cls": "cap",
		"flak": {"cd": 0.4, "dmg": 90.0, "w": 2.2, "len": 60.0, "bs": 900.0, "col": Color(0.35, 0.75, 1.0)}, "beam": {"cd": 3.0, "n": 2, "dmg": 1500.0, "w": 16.0, "col": Color(0.25, 0.6, 1.0)}},
	"hss":   {"side": 0, "name": "HSS", "hp": 160000.0, "shield": 30000.0, "spd": 20.0, "turn": 0.06, "rad": 700.0, "range": 3200.0, "boom": 20.0, "cls": "cap",
		"flak": {"cd": 0.3, "dmg": 140.0, "w": 3.0, "len": 80.0, "bs": 900.0, "col": Color(1.0, 0.9, 0.5)}, "beam": {"cd": 2.6, "n": 3, "dmg": 3000.0, "w": 28.0, "col": Color(1.0, 0.85, 0.45)}},
	"ipc":   {"side": 0, "name": "IPC Cruiser", "hp": 10000.0, "shield": 1800.0, "spd": 25.0, "turn": 0.14, "rad": 105.0, "range": 2000.0, "boom": 6.0, "cls": "ship",
		"flak": {"cd": 0.4, "dmg": 60.0, "w": 1.6, "len": 40.0, "bs": 900.0, "col": Color(1.0, 0.25, 0.22)}, "beam": {"cd": 3.2, "n": 2, "dmg": 700.0, "w": 10.0, "col": Color(1.0, 0.1, 0.16)}},
	"xzd":   {"side": 0, "name": "Xianzhou Dreadnought", "hp": 420000.0, "shield": 80000.0, "spd": 18.0, "turn": 0.04, "rad": 1000.0, "range": 3800.0, "boom": 26.0, "cls": "cap",
		"flak": {"cd": 0.1, "dmg": 110.0, "w": 2.6, "len": 70.0, "bs": 900.0, "col": Color(0.3, 0.7, 1.0)}, "beam": {"cd": 2.2, "n": 6, "dmg": 2600.0, "w": 24.0, "col": Color(0.2, 0.55, 1.0)}, "msl": {"cd": 3.6, "n": 8, "dmg": 900.0}},
	"moon":  {"side": 0, "name": "Screwllum Moon", "hp": 260000.0, "shield": 50000.0, "spd": 16.0, "turn": 0.03, "rad": 740.0, "range": 3400.0, "cd": 5.0, "boom": 24.0, "cls": "cap", "bubble": true,
		"flak": {"cd": 0.4, "dmg": 90.0, "w": 2.2, "len": 60.0, "bs": 900.0, "col": Color(0.35, 0.75, 1.0)}, "beam": {"cd": 3.0, "n": 2, "dmg": 1500.0, "w": 16.0, "col": Color(0.25, 0.6, 1.0)}},
	"awacs": {"side": 0, "name": "Sentinel AWACS", "hp": 9000.0, "shield": 1500.0, "spd": 40.0, "turn": 0.2, "rad": 75.0, "boom": 6.0, "cls": "ship", "noGun": true},
	"fly":   {"side": 1, "name": "Legion Fighter", "hp": 90.0, "spd": 112.0, "rad": 7.0, "turn": 1.5, "boom": 0.8, "cls": "fgt"},
	"whale": {"side": 1, "name": "Legion Carrier", "hp": 30000.0, "shield": 6000.0, "spd": 20.0, "turn": 0.08, "rad": 170.0, "range": 1700.0, "boom": 9.0, "cls": "cap",
		"flak": {"cd": 0.6, "dmg": 45.0, "w": 1.8, "len": 50.0, "bs": 800.0, "col": Color(0.62, 0.22, 1.0)}, "beam": {"cd": 3.2, "n": 1, "dmg": 700.0, "w": 14.0, "col": Color(0.65, 0.2, 1.0)}},
}
# 網頁版 kind → [Godot 模型, 目標長度(公尺), 斷裂檔前綴（空字串＝沒有斷片）, 實例容量]
const KMODEL := {
	"frig": ["frigate", 85.5, "frigate", 140], "cruis": ["cruiser", 231.0, "cruiser", 70], "cap": ["ipc_sid", 1040.0, "ipc_sid", 24],
	"hss": ["hss", 2040.0, "hss", 3], "xzd": ["xzd", 2720.0, "", 3], "ipc": ["ipc", 264.0, "ipc", 70], "moon": ["moon", 1530.0, "", 6],
	"whale": ["whale", 378.0, "whale", 40], "fgt": ["fighter", 14.0, "", 220], "fly": ["butterfly", 12.0, "", 320], "awacs": ["fighter", 90.0, "", 8],
}
const SHIP_KINDS := ["frig", "cruis", "ipc", "cap", "xzd", "hss", "moon", "awacs"]

class BShip:
	var kind := ""
	var d: Dictionary
	var side := 0
	var hp := 1.0
	var hp_max := 1.0
	var pos := Vector3.ZERO
	var vel := Vector3.ZERO
	var h := 0.0
	var p := 0.0
	var roll := 0.0
	var q := Quaternion.IDENTITY   # 玩家用四元數姿態
	var k := 1.0
	var rad := 1.0
	var cd := 0.0
	var home := Vector3.ZERO
	var tgt: BShip = null
	var aw_tgt: BShip = null
	var mode := 0
	var mt := 0.0
	var id := 0
	var order := {}
	var sh := 0.0
	var sh_max := 0.0
	var sh_t := -99.0
	var sh_down := 0.0
	var dead := false
	var is_player := false
	var is_orig := false
	var is_tomb := false
	var spd := 0.0
	var thr := 0.6
	var bcd := -1.0
	var bmcd := -1.0
	var mcd := -1.0
	var rally := 0.0
	var bpos := Vector3.ZERO
	var threat := 0.0
	var load_n := 0
	var cs := ""
	var hit_called := false
	var pursued := -99.0
	var fx_t := 0.0
	var set_home := false
	var shield_fx_t := -9.0

class BShot:
	var pos := Vector3.ZERO
	var vel := Vector3.ZERO
	var fwd := Vector3.FORWARD
	var life := 2.0
	var dmg := 1.0
	var side := 0
	var w := 1.0
	var len := 20.0
	var col := Color.WHITE
	var src: BShip = null
	var spd := 1.0
	var homing := false
	var big := false
	var tgt: BShip = null

var allies: Array = []
var enemies: Array = []
var shots: Array = []
var bbeams: Array = []      # 光束砲：{s, tg, spec, age, tick, off, vis}
var bubbles: Array = []
var fleets := {}            # 網頁版 kind → {parts, sc, center, cap}
var gt := 0.0               # 遊戲時間
var kills := 0
var deaths := 0
var wave := 0
var ship_n := 0
var next_wave := 6.0
var next_reinf := 25.0
var next_launch := 6.0
var reinf_n := 0
var last_alloc := -9.0
var tomb_t: BShip
var iron_dmg := 0.0
var bpaused := false
var cam_mode := 0           # 0 追尾、1 駕駛艙視點
var log_lines: Array = []   # [{t, text, warn}]
var hud_note_text := ""
var hud_note_t := -9.0
var hurt_k := 0.0
var cam_shake := 0.0
var cam_pos_s := Vector3.ZERO
var radar_on := true
var bhud: Control
var shot_mm: MultiMesh
var shot_inst: MultiMeshInstance3D
var flash_pool: Array = []
var flash_i := 0
var beam_pool: Array = []
var grid := [{}, {}]        # 每陣營一份空間格（小型艦艇）；大艦走 big_list
var big_list := [[], []]
const CELL := 700.0
const SMALL_MAX_RAD := 300.0
var mouse_dx := 0.0
var mouse_dy := 0.0
var pl := {}                # 玩家狀態
var autoplay := false
var sfx := {}              # 名稱 → [AudioStream]
var sfx_pool: Array = []
var sfx_last := {}
var sfx2d: AudioStreamPlayer
var bgm: AudioStreamPlayer
var music_on := true
var big_step := false
var stats_t := 0.0

# ───────────── 啟動 ─────────────
func _ready() -> void:
	rng.seed = Time.get_ticks_msec()
	randomize()
	_make_environment()
	_make_tomb_b()
	_load_fleets()
	_make_shot_render()
	_make_pools()
	_make_cam_hud()
	_make_audio()
	tomb_t = BShip.new()
	tomb_t.is_tomb = true
	tomb_t.d = {"hp": 1e9, "name": "Irontomb", "cls": "cap", "side": 1}
	tomb_t.side = 1
	tomb_t.rad = 700.0
	tomb_t.hp = 1e9
	tomb_t.hp_max = 1e9
	_init_world()
	for a_ in OS.get_cmdline_user_args():
		if a_.begins_with("--timescale="): Engine.time_scale = float(a_.substr(12))
	if "--demo-cam" in OS.get_cmdline_user_args():   # 測試用：不鎖滑鼠
		pass
	else:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	autoplay = "--autoplay" in OS.get_cmdline_user_args()
	big_step = "--bigstep" in OS.get_cmdline_user_args()
	print("[battle] ready allies=", allies.size(), " enemies=", enemies.size())

func _make_tomb_b() -> void:
	var ps := load("res://assets/models/irontomb.glb") as PackedScene
	var root := ps.instantiate() as Node3D
	add_child(root)
	var aabb := _merged_aabb(root)
	var s := (248.0 * TOMB_SCALE_W) / maxf(aabb.size.y, 0.001)
	root.scale = Vector3.ONE * s
	root.position = TOMB_POS
	var l := OmniLight3D.new()
	l.light_color = Color(1.0, 0.16, 0.27)
	l.light_energy = 4.0
	l.position = TOMB_POS + Vector3(0, 400, 1400)
	l.omni_range = 14000.0
	l.omni_attenuation = 1.6
	l.shadow_enabled = false
	add_child(l)

func _load_fleets() -> void:
	for kind in KMODEL.keys():
		var spec: Array = KMODEL[kind]
		var model: String = spec[0]
		var ps := load("res://assets/models/" + model + ".glb") as PackedScene
		if ps == null:
			push_warning("missing model " + model)
			continue
		var root := ps.instantiate() as Node3D
		add_child(root)
		var parts_src: Array = []
		_collect_meshes(root, root, parts_src)
		var aabb := _merged_aabb(root)
		var sc := float(spec[1]) / maxf(aabb.size.z, 0.001)
		var center := aabb.get_center()
		root.queue_free()
		var cap: int = int(spec[3])
		var parts: Array = []
		for p in parts_src:
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = p["mesh"]
			mm.use_custom_data = true
			mm.instance_count = cap
			_convert_materials(mm.mesh, model)
			mm.visible_instance_count = 0
			var mmi := MultiMeshInstance3D.new()
			mmi.multimesh = mm
			mmi.custom_aabb = AABB(Vector3(-40000, -40000, -40000), Vector3(80000, 80000, 80000))
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(mmi)
			parts.append({"mm": mm, "local": p["local"]})
		fleets[kind] = {"parts": parts, "sc": sc, "center": center, "cap": cap}

func _make_shot_render() -> void:
	shot_mm = MultiMesh.new()
	shot_mm.transform_format = MultiMesh.TRANSFORM_3D
	shot_mm.use_colors = true
	var bm := BoxMesh.new()
	bm.size = Vector3(1, 1, 1)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.vertex_color_use_as_albedo = true
	m.albedo_color = Color(3.5, 3.5, 3.5, 1.0)
	bm.material = m
	shot_mm.mesh = bm
	shot_mm.instance_count = 3000
	shot_mm.visible_instance_count = 0
	shot_inst = MultiMeshInstance3D.new()
	shot_inst.multimesh = shot_mm
	shot_inst.custom_aabb = AABB(Vector3(-40000, -40000, -40000), Vector3(80000, 80000, 80000))
	shot_inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(shot_inst)

func _make_pools() -> void:
	var sm := SphereMesh.new()
	sm.radius = 0.5
	sm.height = 1.0
	sm.radial_segments = 12
	sm.rings = 6
	for i in range(64):
		var mi := MeshInstance3D.new()
		mi.mesh = sm
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		mi.material_override = m
		mi.visible = false
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		flash_pool.append({"n": mi, "m": m, "t": 0.0, "dur": 0.1, "size": 1.0, "col": Color.WHITE, "on": false})
	var bmat := ShaderMaterial.new()
	bmat.shader = load("res://shaders/beam.gdshader")
	for i in range(24):
		var node := Node3D.new()
		add_child(node)
		var quads: Array = []
		for k in range(2):
			var q := MeshInstance3D.new()
			var qm := QuadMesh.new()
			qm.size = Vector2(1.0, 1.0)
			q.mesh = qm
			var m := bmat.duplicate() as ShaderMaterial
			q.material_override = m
			q.rotation.z = PI * 0.5
			q.rotation.y = k * PI * 0.5
			q.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			node.add_child(q)
			quads.append(m)
		var sp := _make_sparks(Color.WHITE)
		sp.emitting = false
		add_child(sp)
		node.visible = false
		beam_pool.append({"node": node, "mats": quads, "sparks": sp, "used": false})

func _make_cam_hud() -> void:
	cam = Camera3D.new()
	cam.far = 80000.0
	cam.near = 1.0
	cam.fov = 70.0
	add_child(cam)
	var layer := CanvasLayer.new()
	add_child(layer)
	bhud = load("res://scripts/battle_hud.gd").new()
	bhud.battle = self
	bhud.set_anchors_preset(Control.PRESET_FULL_RECT)
	bhud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(bhud)


# ───────────── 音效（取樣檔與網頁版相同，由 tools-src/audio/build_sfx.py 合成） ─────────────
func _make_audio() -> void:
	for nm in ["blaster", "enemy_blaster", "cannon", "explosion_small", "explosion_med", "explosion_big", "hit_hull", "shield_hit", "flyby"]:
		var arr: Array = []
		for i in range(1, 4):
			var path := "res://assets/sfx/%s_%d.mp3" % [nm, i]
			if ResourceLoader.exists(path):
				arr.append(load(path))
		sfx[nm] = arr
	for nm in ["lance", "lock_acquired", "lock_tick", "missile_launch", "respawn", "alarm", "afterburner"]:
		var path2 := "res://assets/sfx/%s.mp3" % nm
		if ResourceLoader.exists(path2):
			sfx[nm] = [load(path2)]
	for i in range(28):
		var pl3 := AudioStreamPlayer3D.new()
		pl3.max_distance = 9000.0
		pl3.unit_size = 300.0
		pl3.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		add_child(pl3)
		sfx_pool.append(pl3)
	sfx2d = AudioStreamPlayer.new()
	add_child(sfx2d)
	var ms = load("res://assets/sfx/bgm.mp3")
	if ms != null:
		ms.loop = true
		bgm = AudioStreamPlayer.new()
		bgm.stream = ms
		bgm.volume_db = -11.0
		add_child(bgm)
		bgm.play()

# 播放音效：pos 為空＝非空間音效（玩家自己的聲音）；rate_gap＝同名音效最短間隔（秒）
func sfx_play(nm: String, pos: Variant = null, vol_db: float = 0.0, rate_gap: float = 0.0, unit: float = 300.0) -> void:
	if not sfx.has(nm) or (sfx[nm] as Array).is_empty():
		return
	if rate_gap > 0.0:
		if gt - float(sfx_last.get(nm, -9.0)) < rate_gap:
			return
		sfx_last[nm] = gt
	var st: AudioStream = (sfx[nm] as Array)[randi() % (sfx[nm] as Array).size()]
	if pos == null:
		var p2 := AudioStreamPlayer.new()
		p2.stream = st
		p2.volume_db = vol_db
		add_child(p2)
		p2.finished.connect(p2.queue_free)
		p2.play()
		return
	for p in sfx_pool:
		var pp := p as AudioStreamPlayer3D
		if not pp.playing:
			pp.stream = st
			pp.volume_db = vol_db
			pp.unit_size = unit
			pp.pitch_scale = randf_range(0.93, 1.07)
			pp.global_position = pos
			pp.play()
			return

# ───────────── 小工具 ─────────────
func rr(a: float, b: float) -> float:
	return randf_range(a, b)

func say(en: String, zh: String, warn: bool = false) -> void:
	log_lines.append({"t": gt, "text": en + "  ·  " + zh, "warn": warn})
	if log_lines.size() > 6:
		log_lines.pop_front()

func note(text: String) -> void:
	hud_note_text = text
	hud_note_t = gt

func fwd_of(s: BShip) -> Vector3:
	if s.is_player:
		return Basis(s.q).z
	var cp := cos(s.p)
	return Vector3(sin(s.h) * cp, sin(s.p), cos(s.h) * cp)

func basis_of(s: BShip) -> Basis:
	if s.is_player:
		return Basis(s.q)
	var cy := cos(s.h)
	var sn := sin(s.h)
	var cp := cos(s.p)
	var sp := sin(s.p)
	var c0 := Vector3(cy, 0.0, -sn)
	var c1 := Vector3(-sn * sp, cp, -cy * sp)
	var c2 := Vector3(sn * cp, sp, cy * cp)
	if s.roll != 0.0:
		var cr := cos(s.roll)
		var sr := sin(s.roll)
		var a := c0 * cr + c1 * sr
		c1 = -c0 * sr + c1 * cr
		c0 = a
	return Basis(c0, c1, c2)

func mk_ship(kind: String, pos: Vector3, h: float = 0.0, k: float = 1.0) -> BShip:
	var d: Dictionary = DEF[kind]
	var s := BShip.new()
	s.kind = kind
	s.d = d
	s.side = int(d["side"])
	s.hp = float(d["hp"])
	s.hp_max = s.hp
	s.pos = pos
	s.home = pos
	s.h = h
	s.k = k
	s.rad = float(d["rad"]) * k
	s.cd = randf() * float(d.get("cd", 1.0))
	s.sh = float(d.get("shield", 0.0))
	s.sh_max = s.sh
	ship_n += 1
	s.id = ship_n
	s.cs = "%s-%02d" % [kind.to_upper(), s.id % 100]
	if s.side == 0:
		allies.append(s)
	else:
		enemies.append(s)
	return s

func ring_pos(r: float, az: float, pitch: float) -> Vector3:
	return TOMB_POS + Vector3(r * cos(pitch) * sin(az), r * sin(pitch), r * cos(pitch) * cos(az))

func face_tomb(s: BShip) -> void:
	var d := TOMB_POS - s.pos
	s.h = atan2(d.x, d.z)
	s.p = atan2(d.y, Vector2(d.x, d.z).length())

func mk_fighter(kind: String, pos: Vector3, h: float = 0.0) -> BShip:
	var s := mk_ship(kind, pos, h)
	s.spd = float(s.d["spd"]) * rr(0.85, 1.1)
	if kind == "fly":
		s.hp = s.d["hp"] * 0.8
		s.hp_max = s.hp
	s.vel = fwd_of(s) * s.spd
	return s

func mk_ring(kind: String, r: float, az: float, pitch: float, k: float = 1.0) -> BShip:
	var pos := ring_pos(r, az, pitch)
	var s: BShip = mk_fighter(kind, pos, 0.0) if kind == "fgt" else mk_ship(kind, pos, 0.0, k)
	face_tomb(s)
	if kind == "fgt":
		s.vel = fwd_of(s) * s.spd
	s.home = s.pos
	return s

# ───────────── 開局編成 ─────────────
func _init_world() -> void:
	mk_ring("hss", 8200.0, 0.0, 0.05)
	mk_ring("xzd", 8900.0, 0.4, -0.06)
	for m in [[-0.85, 0.35], [0.8, -0.3], [0.05, 0.62]]:
		mk_ring("moon", 9500.0, m[0], m[1])
	var cp := [0.38, -0.3, 0.12, -0.42, 0.3, -0.1]
	for i in range(6):
		mk_ring("cap", 7200.0, -0.8 + i * 0.32, cp[i])
	for i in range(10):
		mk_ring("ipc" if i % 2 == 1 else "cruis", rr(6000, 8000), -SIDE_AZ + (i + 0.5) * (2.0 * SIDE_AZ / 10.0) + rr(-0.1, 0.1), rr(-0.65, 0.65))
	for i in range(24):
		mk_ring("frig", rr(5400, 8600), rr(-SIDE_AZ, SIDE_AZ), rr(-0.75, 0.75))
	var caps: Array = []
	for a in allies:
		if a.d["hp"] > 1000.0:
			caps.append(a)
	for i in range(30):
		var c: BShip = caps[i % caps.size()]
		var f := mk_fighter("fgt", c.pos + Vector3(rr(-700, 700), rr(-500, 500), rr(-700, 700)))
		face_tomb(f)
		f.vel = fwd_of(f) * f.spd
	mk_ring("awacs", 10800.0, 0.1, 0.15)
	# 玩家的戰機：HSS 旁
	var o := mk_ring("fgt", 7400.0, 0.25, 0.05)
	o.thr = 0.5
	o.is_orig = true
	_seize(o)
	for i in range(2):
		_spawn_wave()
	next_wave = gt + 28.0
	say("Welcome aboard. The fleet is engaging the Antimatter Legion.", "歡迎上艦。艦隊正與反物質軍團交火。")

func _seize(s: BShip) -> void:
	pl = {"ship": s, "orig": s, "pos": s.pos, "vel": fwd_of(s) * 60.0, "w": Vector3.ZERO, "thr": 0.45, "boost": false, "energy": 100.0, "heat": 100.0,
		"shield": 300.0, "shield_max": 300.0, "hull": 400.0, "hull_max": 400.0, "missiles": 8, "last_hit": -99.0, "assist": true, "invert": false,
		"target": null, "suggest": null, "fire_cd": 0.0, "msl_cd": 0.0, "sup_cd": 0.0, "dead": false, "respawn": 0.0, "need_supply": false, "res_t": 0.0, "kills": 0}
	var f := fwd_of_hp(s)
	s.is_player = true
	s.q = Quaternion(Basis.looking_at(-f, Vector3.UP))   # looking_at 讓 -Z 對準參數，所以傳 -f，基底的 +Z 就朝向 f
	pl["vel"] = f * 60.0
	s.vel = pl["vel"]
	cam_pos_s = s.pos - f * 30.0

func fwd_of_hp(s: BShip) -> Vector3:
	var cp := cos(s.p)
	return Vector3(sin(s.h) * cp, sin(s.p), cos(s.h) * cp)

func _spawn_player(at_hss: bool) -> void:
	var hss: BShip = null
	for a in allies:
		if a.kind == "hss" and not a.dead:
			hss = a
	var pos: Vector3
	if at_hss and hss != null:
		var away := (hss.pos - TOMB_POS).normalized()
		pos = hss.pos + away * 760.0 + Vector3(rr(-200, 200), rr(-100, 100), rr(-200, 200))
	else:
		pos = ring_pos(7400.0, 0.25, 0.05)
	var s := mk_ship("fgt", pos)
	s.spd = 100.0
	face_tomb(s)
	_seize(s)
	if pl["orig"] == null or (pl["orig"] as BShip).dead:
		pl["orig"] = s
		s.is_orig = true
	if deaths > 0:
		note("REDEPLOYED")
		sfx_play("respawn", null, -3.0)

func _spawn_wave() -> void:
	wave += 1
	var w := wave
	var n_w := mini(2 + w / 2, 8) + mini(4, w / 3)
	var n_f := mini(14 + w * 4, 70) + mini(30, w * 2)
	var live := 0
	for e in enemies:
		if e.kind == "whale" and not e.dead:
			live += 1
	var live_f := enemies.size() - live
	var az := rr(-0.5, 0.5)
	for i in range(n_w):
		if live + i >= 22:
			break
		var q := _spot(rr(3300, 4000), 0.9, az)
		var k := rr(0.8, 1.5)
		var s := mk_ship("whale", q[0], q[1], k)
		s.hp = s.d["hp"] * k * 0.8
		s.hp_max = s.hp
	for i in range(n_f):
		if live_f + i >= 140:
			break
		var q2 := _spot(rr(3000, 4200), 1.1, az)
		mk_fighter("fly", q2[0], q2[1])
	say("Antimatter Legion wave %d emerging from the Irontomb" % w, "反物質軍團第 %d 波自鐵墓外圍湧出" % w, true)

func _spot(r: float, spread: float, az: float) -> Array:
	var a := az + rr(-spread, spread)
	var u := rr(-0.6, 0.6)
	var c := sqrt(1.0 - u * u)
	return [TOMB_POS + Vector3(sin(a) * c * r, u * r, cos(a) * c * r), a]

func cnt(kind: String) -> int:
	var n := 0
	for a in allies:
		if a.kind == kind and not a.dead:
			n += 1
	return n

func _flash(pos: Vector3, size: float, dur: float, col: Color) -> void:
	var f: Dictionary = flash_pool[flash_i]
	flash_i = (flash_i + 1) % flash_pool.size()
	f["t"] = 0.0
	f["dur"] = dur
	f["size"] = size
	f["col"] = col
	f["on"] = true
	var n: MeshInstance3D = f["n"]
	n.visible = true
	n.global_position = pos
	n.scale = Vector3.ONE * size

func _step_flashes(dt: float) -> void:
	for f in flash_pool:
		if not f["on"]:
			continue
		f["t"] += dt
		var k: float = f["t"] / f["dur"]
		if k >= 1.0:
			f["on"] = false
			(f["n"] as MeshInstance3D).visible = false
			continue
		var c: Color = f["col"]
		var a := (1.0 - k) * (1.0 - k)
		(f["m"] as StandardMaterial3D).albedo_color = Color(c.r * 3.0 * a, c.g * 3.0 * a, c.b * 3.0 * a, 1.0)
		(f["n"] as MeshInstance3D).scale = Vector3.ONE * float(f["size"]) * (0.5 + k)

func _warp_in(kind: String, pos: Vector3, big: bool, home: Vector3) -> void:
	_flash(pos, 2400.0 if big else 700.0, 0.7, Color(0.75, 0.88, 1.0))
	var s := mk_ship(kind, pos)
	face_tomb(s)
	s.home = home
	s.rally = gt + 30.0
	if kind == "fgt":
		s.spd = float(s.d["spd"]) * rr(0.85, 1.1)
		s.vel = fwd_of(s) * s.spd * 2.5
	else:
		s.vel = fwd_of(s) * float(s.d["spd"]) * 2.5

func _rally_point(kind: String) -> Array:
	var anchors: Array = []
	for a in allies:
		if not a.dead and (a.kind == "moon" or a.kind == "hss"):
			anchors.append(a)
	if anchors.is_empty():
		return [ring_pos(rr(6000, 8000), rr(-SIDE_AZ, SIDE_AZ), rr(-0.5, 0.5)), ring_pos(12000.0, rr(-SIDE_AZ, SIDE_AZ), rr(-0.4, 0.4))]
	var t: BShip = anchors[randi() % anchors.size()]
	var rrad := t.rad * 1.3 + (rr(300, 900) if kind == "fgt" else rr(500, 1500))
	var u := rr(-0.5, 0.5)
	var a := rr(0.0, TAU)
	var c := sqrt(1.0 - u * u)
	var home := t.pos + Vector3(cos(a) * c * rrad, u * rrad, sin(a) * c * rrad)
	var away := (t.pos - TOMB_POS).normalized()
	var back := t.rad + rr(2800, 4200)
	return [home, t.pos + away * back + Vector3(rr(-600, 600), rr(-600, 600), rr(-600, 600))]

func _reinforce() -> void:
	reinf_n += 1
	if reinf_n % 2 == 0 and cnt("cruis") + cnt("ipc") < 22:
		for kk in ["cruis", "ipc"]:
			var rp := _rally_point(kk)
			_warp_in(kk, rp[1], true, rp[0])
		say("Cruiser squadron warping in", "巡洋艦中隊折躍進場")
	if reinf_n % 4 == 0 and cnt("cap") < 10:
		var rp2 := _rally_point("cap")
		_warp_in("cap", rp2[1], true, rp2[0])
		say("Dreadnought warping in behind the line", "無畏艦自後方折躍馳援")
	if cnt("frig") < 46:
		for i in range(3):
			var rp3 := _rally_point("frig")
			_warp_in("frig", rp3[1], false, rp3[0])
		say("Alliance reinforcements warping in", "聯軍增援折躍抵達")
	if reinf_n % 2 == 1:
		var nf := 0
		for a in allies:
			if a.kind == "fgt" and not a.dead and not a.is_player:
				nf += 1
		if nf < 56:
			var rp4 := _rally_point("fgt")
			for k in range(6):
				_warp_in("fgt", rp4[1] + Vector3(rr(-500, 500), rr(-400, 400), rr(-500, 500)), false, rp4[0])
			say("Fighter wing warping in", "戰機中隊折躍進場")

func _launch_fighters() -> void:
	var hss: BShip = null
	var live := 0
	for a in allies:
		if a.dead:
			continue
		if a.kind == "hss":
			hss = a
		elif a.kind == "fgt" and not a.is_player:
			live += 1
	if hss == null or live >= 36:
		return
	var away := (hss.pos - TOMB_POS).normalized()
	for k in range(3):
		var f := mk_fighter("fgt", hss.pos + away * 700.0 + Vector3(rr(-120, 120), rr(-60, 60), rr(-120, 120)))
		face_tomb(f)
		f.thr = 0.8

# ───────────── 彈道、傷害、爆炸 ─────────────
func fire_shot(src: BShip, o: Vector3, dir: Vector3, spd: float, dmg: float, w: float, len: float, col: Color, life: float) -> void:
	if shots.size() > 2900:
		return
	var b := BShot.new()
	b.pos = o
	b.vel = dir * spd
	b.fwd = dir
	b.life = life
	b.dmg = dmg * (0.75 if src.side == 1 else 1.0)
	b.side = src.side
	b.w = w
	b.len = len
	b.col = col
	b.src = src
	b.spd = spd
	shots.append(b)

func impact(pos: Vector3, big: float, col: Color) -> void:
	_flash(pos, big * 6.0, 0.18, Color(1.0, 0.95, 0.85))
	if big >= 4.0 and randf() < 0.5:
		_flash(pos, big * 12.0, 0.3, col)

func _shield_absorb(s: BShip, dmg: float, pos: Vector3) -> float:
	var take: float = minf(s.sh, dmg)
	s.sh -= take
	s.sh_t = gt
	if gt - s.shield_fx_t > 0.25 and s.rad > 30.0:
		s.shield_fx_t = gt
		_flash(pos, clampf(s.rad * 0.35, 8.0, 240.0), 0.3, Color(0.45, 0.7, 1.0) if s.side == 0 else Color(0.7, 0.4, 1.0))
	if s.sh <= 0.5:
		s.sh = 0.0
		s.sh_down = gt + 7.0
		_flash(s.pos, s.rad * 3.0, 0.5, Color(0.7, 0.85, 1.0))
		if s.side == 0 and s.d["hp"] >= 8000.0:
			say(str(s.d["name"]) + " shields down", str(s.d["name"]) + " 護盾失效", true)
	return dmg - take

func _step_shields(dt: float) -> void:
	for list in [allies, enemies]:
		for s in list:
			if s.dead or s.sh_max <= 0.0 or s.sh >= s.sh_max:
				continue
			if gt > s.sh_t + 5.0 and gt > s.sh_down:
				s.sh = minf(s.sh_max, s.sh + s.sh_max * 0.05 * dt)

func damage(s: BShip, dmg: float, pos: Vector3, src: BShip) -> void:
	if s.dead:
		return
	if s.is_player:
		_hurt_player(dmg)
		return
	if float(s.d["hp"]) > 1000.0 and src != null and src.kind == "fgt":
		dmg *= 10.0 if dmg > 100.0 else 6.0   # 戰機武器針對艦艇的反艦倍率
	if s.sh > 0.0:
		dmg = _shield_absorb(s, dmg, pos)
		if dmg <= 0.0:
			return
	s.hp -= dmg
	if s.hp <= 0.0:
		_kill(s, src)

func _kill(s: BShip, src: BShip) -> void:
	if s.dead:
		return
	s.dead = true
	var length := float(KMODEL[s.kind][1]) * s.k if KMODEL.has(s.kind) else 100.0
	if s.side == 1 and src != null and src.side == 0:
		kills += 1
		if src.is_player:
			pl["kills"] += 1
	var style := 1 if s.side == 1 else 0
	var size := clampf(length * 0.35, 25.0, 300.0)
	var frag: String = KMODEL[s.kind][2] if KMODEL.has(s.kind) else ""
	if frag != "":
		var f: Dictionary = fleets[s.kind]
		var bs := basis_of(s) * float(f["sc"]) * s.k
		var xf := Transform3D(bs, s.pos - bs * (f["center"] as Vector3))
		Breakup.spawn(self, frag, xf, s.vel, style, _hull_by_name)
	Explosion.spawn(self, s.pos, size, style, -1, s.d["boom"] >= 3.0)
	var bm_: float = s.d["boom"]
	sfx_play("explosion_big" if bm_ >= 9.0 else ("explosion_med" if bm_ >= 3.0 else "explosion_small"), s.pos, 2.0 if bm_ >= 9.0 else 0.0, 0.05, 700.0 if bm_ >= 3.0 else 200.0)
	if float(s.d["boom"]) >= 3.0:
		say(str(s.d["name"]) + " destroyed" + (" · " + s.cs if s.side == 0 else ""), str(s.d["name"]) + " 被擊毀", s.side == 0)
	if s.kind == "awacs":
		say("Sentinel lost — datalink degraded", "預警機失去聯繫——資料鏈降級，各單位改為自主作戰", true)
		for u in allies:
			u.aw_tgt = null
		pl["suggest"] = null
	if s.is_player:
		return
	if pl.has("target") and pl["target"] == s:
		pl["target"] = null
	if s.is_orig:
		pl["orig"] = null

func _hurt_player(dmg: float) -> void:
	if pl["dead"]:
		return
	pl["last_hit"] = gt
	cam_shake = minf(1.6, cam_shake + dmg * 0.02 + 0.2)
	if pl["shield"] > 0.0:
		sfx_play("shield_hit", null, -3.0, 0.1)
		var a: float = minf(pl["shield"], dmg)
		pl["shield"] -= a
		dmg -= a
		hurt_k = minf(1.0, hurt_k + 0.06)
	if dmg > 0.0:
		sfx_play("hit_hull", null, -2.0, 0.1)
		pl["hull"] -= dmg
		hurt_k = minf(1.0, hurt_k + 0.3 + dmg * 0.01)
		if pl["hull"] <= 0.0:
			_player_die()

func _player_die() -> void:
	var s: BShip = pl["ship"]
	pl["dead"] = true
	pl["respawn"] = 5.0
	deaths += 1
	s.dead = true
	Explosion.spawn(self, s.pos, 60.0, 0)
	say("Pilot lost. Re-deploying from the HSS hangar…", "飛行員陣亡，正從 HSS 機庫重新部署…", true)
	if s.is_orig:
		pl["orig"] = null

# ───────────── 空間格與命中判定 ─────────────
func _cell(p: Vector3) -> Vector3i:
	return Vector3i(floori(p.x / CELL), floori(p.y / CELL), floori(p.z / CELL))

func _build_grid() -> void:
	for side in range(2):
		grid[side] = {}
		big_list[side] = []
	for list in [allies, enemies]:
		for s in list:
			if s.dead:
				continue
			if s.rad >= SMALL_MAX_RAD:
				big_list[s.side].append(s)
			else:
				var c := _cell(s.pos)
				if not (grid[s.side] as Dictionary).has(c):
					grid[s.side][c] = []
				grid[s.side][c].append(s)

# 線段 a→b 對敵對陣營（side 為射手陣營）的最近命中；回傳 [ship, t] 或空陣列
func _hit_test(a: Vector3, b: Vector3, side: int) -> Array:
	var foe := 1 - side
	var best: BShip = null
	var bt := 2.0
	var d := b - a
	var l2 := maxf(d.length_squared(), 0.0001)
	var lo := Vector3(minf(a.x, b.x), minf(a.y, b.y), minf(a.z, b.z)) - Vector3.ONE * SMALL_MAX_RAD
	var hi := Vector3(maxf(a.x, b.x), maxf(a.y, b.y), maxf(a.z, b.z)) + Vector3.ONE * SMALL_MAX_RAD
	var c0 := _cell(lo)
	var c1 := _cell(hi)
	var g: Dictionary = grid[foe]
	var cand: Array = []
	if not g.is_empty():
		for x in range(c0.x, c1.x + 1):
			for y in range(c0.y, c1.y + 1):
				for z in range(c0.z, c1.z + 1):
					var key := Vector3i(x, y, z)
					if g.has(key):
						cand.append_array(g[key])
	cand.append_array(big_list[foe])
	for s in cand:
		var sh: BShip = s
		if sh.dead:
			continue
		var rrad := sh.rad * (0.9 if float(sh.d["hp"]) > 1000.0 else 1.0)
		var t := clampf((sh.pos - a).dot(d) / l2, 0.0, 1.0)
		var pp := a + d * t - sh.pos
		if pp.length_squared() < rrad * rrad and t < bt:
			bt = t
			best = sh
	if best == null:
		return []
	return [best, bt]

func _tomb_part_pos(i: int) -> Vector3:
	var P: Array = TOMB_PARTS[i]
	return TOMB_POS + Vector3(P[0], P[1], P[2]) * TOMB_SCALE_W

func _tomb_hit(a: Vector3, b: Vector3) -> bool:
	var d := b - a
	var l2 := maxf(d.length_squared(), 0.0001)
	for i in range(TOMB_PARTS.size()):
		var c := _tomb_part_pos(i)
		var r: float = float(TOMB_PARTS[i][3]) * TOMB_SCALE_W
		var t := clampf((c - a).dot(d) / l2, 0.0, 1.0)
		if (a + d * t - c).length_squared() < r * r:
			return true
	return false

func _tomb_target(from: Vector3) -> BShip:
	var bi := 0
	var bd := 1e18
	for i in range(TOMB_PARTS.size()):
		var d2 := _tomb_part_pos(i).distance_squared_to(from)
		if d2 < bd:
			bd = d2
			bi = i
	tomb_t.pos = _tomb_part_pos(bi)
	tomb_t.rad = float(TOMB_PARTS[bi][3]) * TOMB_SCALE_W
	return tomb_t

func _step_shots(dt: float) -> void:
	var i := shots.size() - 1
	while i >= 0:
		var b: BShot = shots[i]
		if b.homing:
			if not _step_missile(b, dt):
				shots.remove_at(i)
			i -= 1
			continue
		var prev := b.pos
		b.pos += b.vel * dt
		b.life -= dt
		var dead := b.life <= 0.0
		var h := _hit_test(prev, b.pos, b.side)
		if not h.is_empty():
			var hs: BShip = h[0]
			var hp := prev + (b.pos - prev) * float(h[1])
			b.pos = hp
			impact(hp, clampf(b.w * 1.4, 1.0, 14.0), b.col)
			damage(hs, b.dmg, hp, b.src)
			dead = true
		elif b.side == 0 and _tomb_hit(prev, b.pos):
			impact(b.pos, 22.0, Color(1, 0.3, 0.4))
			iron_dmg += b.dmg
			dead = true
		if dead:
			shots.remove_at(i)
		i -= 1

func _step_missile(m: BShot, dt: float) -> bool:
	var tg := m.tgt
	if tg != null and not tg.dead:
		var to := tg.pos - m.pos
		var dist := to.length()
		var dir := to / maxf(dist, 0.001)
		var sp := minf(m.spd + 330.0 * dt, 340.0)
		var v := m.vel.normalized().lerp(dir, minf(1.0, 2.6 * dt)).normalized()
		m.spd = sp
		m.vel = v * sp
		m.fwd = v
		if dist < tg.rad + 14.0:
			Explosion.spawn(self, m.pos, 40.0 if m.big else 28.0, m.side, 0, false)
			damage(tg, m.dmg, m.pos, m.src)
			return false
	else:
		m.spd = minf(m.spd + 330.0 * dt, 340.0)
		m.vel = m.fwd * m.spd
	m.pos += m.vel * dt
	m.life -= dt
	return m.life > 0.0

# ───────────── AI ─────────────
func nearest(from: Vector3, list: Array, max_d: float, filt: Callable = Callable()) -> BShip:
	var best: BShip = null
	var bd := max_d * max_d
	for e in list:
		var s: BShip = e
		if s.dead or (filt.is_valid() and not filt.call(s)):
			continue
		var d := s.pos.distance_squared_to(from)
		if d < bd:
			bd = d
			best = s
	return best

func random_target(from: Vector3, foes: Array, range_: float, filt: Callable = Callable()) -> BShip:
	var pick_: BShip = null
	var n := 0
	var r2 := range_ * range_
	for e in foes:
		var s: BShip = e
		if s.dead or s.is_player or (filt.is_valid() and not filt.call(s)):
			continue
		if s.pos.distance_squared_to(from) < r2:
			n += 1
			if randf() * n < 1.0:
				pick_ = s
	return pick_

func lead_point(src: Vector3, tgt: BShip, spd: float) -> Vector3:
	var d := tgt.pos - src
	var v := tgt.vel
	var a := v.length_squared() - spd * spd
	var b := 2.0 * d.dot(v)
	var c := d.length_squared()
	var tt := 0.0
	if absf(a) < 1e-4:
		tt = -c / (b if b != 0.0 else 1.0)
	else:
		var disc := b * b - 4.0 * a * c
		if disc >= 0.0:
			var r1 := (-b - sqrt(disc)) / (2.0 * a)
			var r2 := (-b + sqrt(disc)) / (2.0 * a)
			tt = minf(r1 if r1 > 0.0 else 1e9, r2 if r2 > 0.0 else 1e9)
			if tt > 1e8:
				tt = sqrt(c) / spd
		else:
			tt = sqrt(c) / spd
	tt = clampf(tt, 0.0, 6.0)
	return tgt.pos + v * tt

func turn_toward(s: BShip, t: Vector3, dt: float, rate: float) -> float:
	var d := t - s.pos
	var hd := atan2(d.x, d.z)
	var pd := atan2(d.y, Vector2(d.x, d.z).length())
	var dh := hd - s.h
	dh = atan2(sin(dh), cos(dh))
	var dp_ := pd - s.p
	var mh := clampf(dh, -rate * dt, rate * dt)
	var mp := clampf(dp_, -rate * 0.8 * dt, rate * 0.8 * dt)
	s.h += mh
	s.p = clampf(s.p + mp, -1.25, 1.25)
	s.roll += (clampf(-mh / maxf(dt, 0.0001) * 0.45, -1.1, 1.1) - s.roll) * minf(1.0, dt * 4.0)
	return absf(dh) + absf(dp_)

func move_fwd(s: BShip, spd: float, dt: float) -> void:
	s.vel = fwd_of(s) * spd
	s.pos += s.vel * dt

func active_order(s: BShip) -> Dictionary:
	if s.order.is_empty():
		return s.order
	if s.order.has("until") and gt > float(s.order["until"]):
		s.order = {}
		return s.order
	if s.order["type"] == "focus" and (s.order["tgt"] == null or (s.order["tgt"] as BShip).dead):
		s.order = {}
	return s.order

func exclude(s: BShip, lim: float) -> void:
	var t := s.pos - TOMB_POS
	var td := t.length()
	if td < lim:
		s.pos = TOMB_POS + t * (lim / maxf(td, 0.001))

func gun_pos(s: BShip) -> Vector3:
	var b := basis_of(s)
	return s.pos + b.z * s.rad * 0.6 + b.x * (randf_range(-1, 1) * minf(s.rad * 0.25, 40.0))

func fighter_fire(s: BShip, tg: BShip, dt: float) -> void:
	s.cd -= dt
	if s.cd <= 0.0:
		s.cd = 0.18 if s.side == 0 else 0.32
		var f := fwd_of(s) + Vector3(rr(-0.012, 0.012), rr(-0.012, 0.012), rr(-0.012, 0.012))
		var dmg := 10.0 if s.side == 0 else (7.0 if tg.is_player else 9.0)
		var gp_ := gun_pos(s)
		fire_shot(s, gp_, f.normalized(), 1300.0, dmg, 0.35, 28.0, Color(0.3, 0.72, 1) if s.side == 0 else Color(0.62, 0.22, 1), 1.6)
		if gp_.distance_squared_to(cam.global_position) < 2500.0 * 2500.0:
			sfx_play("blaster" if s.side == 0 else "enemy_blaster", gp_, -8.0, 0.06, 160.0)

func ai_fighter(s: BShip, dt: float) -> void:
	var foes: Array = enemies if s.side == 0 else allies
	var d := s.d
	var o: Dictionary = active_order(s) if s.side == 0 else {}
	s.mt -= dt
	var tg := s.tgt
	var spd := s.spd if s.spd > 0.0 else float(d["spd"])
	if not o.is_empty() and (o["type"] == "focus" or o["type"] == "tomb"):
		tg = (_tomb_target(s.pos) if o["type"] == "tomb" else o["tgt"])
		s.tgt = tg
	elif not o.is_empty() and o["type"] == "charge":
		if tg == null or tg.dead or s.mt <= 0.0:
			tg = nearest(s.pos, foes, 14000.0, func(e): return e.d["hp"] > 1000.0)
			if tg == null:
				tg = nearest(s.pos, foes, 14000.0)
			s.tgt = tg
			s.mt = rr(3, 6)
	elif tg == null or tg.dead or (s.mt <= 0.0 and s.mode == 0 and randf() < 0.02):
		if s.side == 0:
			tg = s.aw_tgt if (s.aw_tgt != null and not s.aw_tgt.dead) else null
			if tg == null:
				tg = nearest(s.pos, foes, 6000.0, func(e): return e.kind == "fly")
			if tg == null:
				tg = nearest(s.pos, foes, 9000.0)
		else:
			var pf: BShip = null
			if not pl.is_empty() and not pl["dead"] and randf() < 0.18:
				pf = pl["ship"]
			tg = pf
			if tg == null and randf() < 0.12:
				tg = _awacs_unit()
			if tg == null and randf() < 0.45:
				tg = nearest(s.pos, allies, 4000.0, func(e): return e.kind == "fgt")
			if tg == null:
				tg = nearest(s.pos, allies, 9000.0, func(e): return e.d["hp"] > 1000.0)
			if tg == null:
				tg = nearest(s.pos, allies, 12000.0)
		s.tgt = tg
		s.mt = rr(4, 9)
	if tg == null:
		turn_toward(s, s.pos + Vector3(sin(s.h), 0, cos(s.h)) * 500.0, dt, 0.5)
		move_fwd(s, spd * 0.7, dt)
		return
	var dist := s.pos.distance_to(tg.pos)
	var big: bool = tg.is_tomb or float(tg.d["hp"]) > 1000.0
	if s.mode == 1:   # 突破後脫離：朝隨機方向拉開再回頭
		turn_toward(s, s.bpos, dt, float(d["turn"]))
		move_fwd(s, spd * 1.1, dt)
		s.mt -= dt
		if s.pos.distance_to(s.bpos) < 300.0 or s.mt < -5.0:
			s.mode = 0
			s.mt = 0.0
		if s.side == 0:
			exclude(s, TOMB_AURA - 300.0)
		return
	var aim := lead_point(s.pos, tg, 760.0 if big else 1300.0)
	var err := turn_toward(s, aim, dt, float(d["turn"]))
	move_fwd(s, spd * 0.9 if dist < 260.0 else spd, dt)
	if s.side == 0:
		exclude(s, TOMB_AURA - 300.0)
	if err < 0.1 and dist < (1100.0 if big else 900.0):
		fighter_fire(s, tg, dt)
	else:
		s.cd -= dt
	if dist < (tg.rad * 0.7 + 90.0 if big else 120.0):
		s.mode = 1
		s.bpos = s.pos + Vector3(rr(-1, 1) * 900.0, rr(-1, 1) * 500.0, rr(-1, 1) * 900.0) + fwd_of(s) * 500.0
		s.mt = 0.0

func ally_cap_target(s: BShip) -> BShip:
	if s.aw_tgt != null and not s.aw_tgt.dead and s.pos.distance_to(s.aw_tgt.pos) < 12000.0:
		return s.aw_tgt
	var t := nearest(s.pos, enemies, 12000.0, func(e): return e.d["hp"] > 1000.0)
	if t == null:
		t = nearest(s.pos, enemies, 12000.0)
	return t

func ai_capital(s: BShip, dt: float) -> void:
	var d := s.d
	var foes: Array = enemies if s.side == 0 else allies
	var o: Dictionary = active_order(s) if s.side == 0 else {}
	s.mt -= dt
	var fire_target: BShip = null
	if s.side == 0:
		var want := Vector3.ZERO
		var sp := float(d["spd"])
		var face_pos := Vector3.ZERO
		var has_face := false
		if s.mt <= 0.0:
			s.tgt = ally_cap_target(s)
			s.mt = rr(2.5, 4.5)
		var auto: BShip = s.tgt if (s.tgt != null and not s.tgt.dead) else null
		var lat := float((s.id % 7) - 3) * 160.0
		if s.rally > 0.0 and o.is_empty() and gt < s.rally and s.pos.distance_to(s.home) > 450.0:   # 增援剛抵達：先靠攏到螺絲咕姆／空間站身邊
			var dd := s.home - s.pos
			var l := dd.length()
			want = dd / maxf(l, 0.001)
			sp = minf(sp * 1.3, l * 0.4 + 2.0)
			face_pos = auto.pos if auto != null else s.home
			has_face = true
		elif not o.is_empty():
			var tg: BShip = _tomb_target(s.pos) if o["type"] == "tomb" else (o["tgt"] if o["type"] == "focus" else auto)
			if tg != null:
				var dv := tg.pos - s.pos
				var dist := maxf(dv.length(), 0.001)
				var engage := float(d["range"]) * (0.4 if o["type"] == "charge" else 0.6) + tg.rad * 0.5
				if o["type"] == "tomb" and (s.pos - TOMB_POS).length() < TOMB_AURA + s.rad * 0.5 + 60.0:
					sp = 0.0
				elif dist > engage:
					want = dv / dist + Vector3(-dv.z, 0, dv.x) / dist * lat / dist
					if o["type"] == "charge":
						sp *= 1.25
				else:
					var side := 1.0 if s.id % 2 == 1 else -1.0
					want = Vector3(-dv.z / dist * side, (engage - dist) / engage * 0.5, dv.x / dist * side)
					sp *= 0.35
				face_pos = tg.pos
				has_face = true
				fire_target = tg
		elif auto != null:   # 預設：主動前壓，到有效射程後繞著目標側移
			var dv2 := auto.pos - s.pos
			var dist2 := maxf(dv2.length(), 0.001)
			var engage2 := float(d["range"]) * 0.55 + auto.rad * 0.6
			if dist2 > engage2:
				want = dv2 / dist2 + Vector3(-dv2.z, 0, dv2.x) / dist2 * lat / dist2
			else:
				var side2 := 1.0 if s.id % 2 == 1 else -1.0
				want = Vector3(-dv2.z / dist2 * side2, (engage2 - dist2) / engage2 * 0.5, dv2.x / dist2 * side2)
				sp *= 0.35
			face_pos = auto.pos
			has_face = true
		else:
			var hv := s.home - s.pos
			var hl := maxf(hv.length(), 0.001)
			want = hv / hl
			sp = minf(sp, hl * 0.3)
			var tt := nearest(s.pos, enemies, 1e9)
			face_pos = tt.pos if tt != null else TOMB_POS
			has_face = true
		if has_face:
			turn_toward(s, face_pos, dt, float(d["turn"]))
		var kk := 1.0 - exp(-dt * 0.5)
		s.vel += (want * sp - s.vel) * kk
		s.pos += s.vel * dt
		s.p *= 0.99
		exclude(s, TOMB_AURA + s.rad * 0.5)
	else:   # 反物質軍團：朝最近的聯軍大艦推進，接近後減速
		if s.mt <= 0.0:
			s.tgt = nearest(s.pos, allies, 14000.0, func(e): return e.d["hp"] > 1000.0)
			s.mt = 6.0
		var tg2 := s.tgt if (s.tgt != null and not s.tgt.dead) else null
		if tg2 != null:
			var dist3 := s.pos.distance_to(tg2.pos)
			turn_toward(s, tg2.pos, dt, float(d["turn"]))
			move_fwd(s, float(d["spd"]) if dist3 > 1500.0 else float(d["spd"]) * 0.3, dt)
		else:
			move_fwd(s, float(d["spd"]) * 0.5, dt)
	if d.get("noGun", false):
		return
	var is_fgt := func(e): return e.d["cls"] == "fgt"
	var is_big := func(e): return e.d["cls"] != "fgt"
	# 光束砲／光束泡
	s.bcd = (randf() * 2.0 if s.bcd < 0.0 else s.bcd) - dt
	if d.get("bubble", false) and s.bcd <= 0.0:
		s.bcd = float(d["cd"]) * rr(0.8, 1.2)
		var bt: BShip = fire_target if (fire_target != null and fire_target.is_tomb) else _bubble_target(s, float(d["range"]) * 1.15)
		if bt != null:
			_launch_bubble(s, bt)
	s.bmcd = (randf() * 2.0 if s.bmcd < 0.0 else s.bmcd) - dt
	if d.has("beam") and s.bmcd <= 0.0:
		var spec: Dictionary = d["beam"]
		s.bmcd = float(spec["cd"]) * rr(0.8, 1.25)
		var range_ := float(d["range"]) * 1.25
		for v in range(int(spec["n"])):
			var tg3: BShip = null
			if fire_target != null and fire_target.d["cls"] != "fgt" and s.pos.distance_to(fire_target.pos) < range_:
				tg3 = fire_target
			if tg3 == null and not (not o.is_empty() and (o["type"] == "focus" or o["type"] == "tomb")):
				if s.aw_tgt != null and not s.aw_tgt.dead and s.aw_tgt.d["cls"] != "fgt" and randf() < 0.6 and s.pos.distance_to(s.aw_tgt.pos) < range_:
					tg3 = s.aw_tgt
				else:
					tg3 = random_target(s.pos, foes, range_, is_big)
				if tg3 == null and s.side == 0:
					var tt2 := _tomb_target(s.pos)
					if s.pos.distance_to(tt2.pos) < range_:
						tg3 = tt2
			if tg3 != null:
				_fire_beam(s, tg3, spec)
	# 飛彈齊射（仙舟無畏艦）
	if d.has("msl"):
		s.mcd = (randf() * 3.0 if s.mcd < 0.0 else s.mcd) - dt
		if s.mcd <= 0.0:
			var ms: Dictionary = d["msl"]
			s.mcd = float(ms["cd"]) * rr(0.8, 1.2)
			var rg := float(d["range"]) * 1.4
			var tg4: BShip = null
			if fire_target != null and fire_target.d["cls"] != "fgt" and not fire_target.is_tomb and s.pos.distance_to(fire_target.pos) < rg:
				tg4 = fire_target
			if tg4 == null:
				if s.aw_tgt != null and not s.aw_tgt.dead and s.aw_tgt.d["cls"] != "fgt" and s.pos.distance_to(s.aw_tgt.pos) < rg:
					tg4 = s.aw_tgt
				else:
					tg4 = random_target(s.pos, foes, rg, is_big)
			if tg4 != null:
				_fire_ship_missiles(s, tg4, ms)
	# 速射砲：只打戰機
	s.cd -= dt
	if s.cd <= 0.0 and d.has("flak"):
		var fl: Dictionary = d["flak"]
		s.cd = float(fl["cd"]) * rr(0.7, 1.3)
		var tg5 := random_target(s.pos, foes, 1700.0, is_fgt)
		if tg5 == null and s.side == 1 and not pl.is_empty() and not pl["dead"] and s.pos.distance_to((pl["ship"] as BShip).pos) < 1700.0:
			tg5 = pl["ship"]
		if tg5 != null:
			var gp := gun_pos(s)
			var aim := lead_point(gp, tg5, float(fl["bs"])) + Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)) * 30.0
			fire_shot(s, gp, (aim - gp).normalized(), float(fl["bs"]), float(fl["dmg"]), float(fl["w"]), float(fl["len"]), fl["col"], 2.2)
			if gp.distance_squared_to(cam.global_position) < 4000.0 * 4000.0:
				sfx_play("blaster" if s.side == 0 else "enemy_blaster", gp, -6.0, 0.08, 400.0)

func _awacs_unit() -> BShip:
	for a in allies:
		if a.kind == "awacs" and not a.dead:
			return a
	return null

func ai_awacs(s: BShip, dt: float) -> void:
	var base := TOMB_POS + Vector3(0, 0, 8200)
	for a in allies:
		if a.kind == "hss" and not a.dead:
			base = a.pos
	var away := (base - TOMB_POS).normalized()
	var t := base + away * 2600.0 + Vector3(sin(gt * 0.03 + s.id) * 900.0, 300.0, cos(gt * 0.03 + s.id) * 900.0)
	var near := nearest(s.pos, enemies, 3000.0)
	if near != null:
		t = s.pos + (s.pos - near.pos).normalized() * 2000.0
	turn_toward(s, t, dt, float(s.d["turn"]))
	move_fwd(s, float(s.d["spd"]) * (1.2 if near != null else 0.6), dt)

func _separate_caps() -> void:
	var L: Array = []
	for list in [allies, enemies]:
		for s in list:
			if not s.dead and float(s.d["hp"]) > 1000.0:
				L.append(s)
	for i in range(L.size()):
		for j in range(i + 1, L.size()):
			var a: BShip = L[i]
			var b: BShip = L[j]
			var dv := b.pos - a.pos
			var mn := (a.rad + b.rad) * 0.85
			var d2 := dv.length_squared()
			if d2 < mn * mn and d2 > 1.0:
				var dd := sqrt(d2)
				var push := (mn - dd) * 0.12 / dd
				a.pos -= dv * push
				b.pos += dv * push

# ───────────── 光束砲、飛彈、光束泡 ─────────────
func _fire_beam(s: BShip, tg: BShip, spec: Dictionary) -> void:
	var away := (s.pos - tg.pos).normalized()
	var rrad := maxf(tg.rad, 10.0) * 0.75
	var off := away * rrad + Vector3(rr(-1, 1) * rrad * 0.45, rr(-1, 1) * rrad * 0.4, rr(-1, 1) * rrad * 0.45)
	var vis := -1
	for i in range(beam_pool.size()):
		if not beam_pool[i]["used"]:
			vis = i
			break
	if vis >= 0:
		beam_pool[vis]["used"] = true
		var col: Color = spec["col"]
		for m in beam_pool[vis]["mats"]:
			(m as ShaderMaterial).set_shader_parameter("beam_color", Vector3(col.r, col.g, col.b))
		var sp: GPUParticles3D = beam_pool[vis]["sparks"]
		var grad := ((sp.process_material as ParticleProcessMaterial).color_ramp as GradientTexture1D).gradient
		grad.set_color(1, Color(col.r, col.g, col.b, 0.0))
		sp.emitting = true
		(beam_pool[vis]["node"] as Node3D).visible = true
	bbeams.append({"s": s, "tg": tg, "spec": spec, "age": 0.0, "tick": 0.0, "off": off, "vis": vis})
	_flash(gun_pos(s), float(spec["w"]) * 7.0, 0.4, spec["col"])
	sfx_play("cannon", s.pos, 0.0, 0.12, 900.0)

const BEAM_DUR := 2.0
const BEAM_TICK := 0.2

func _step_beams(dt: float) -> void:
	var i := bbeams.size() - 1
	while i >= 0:
		var b: Dictionary = bbeams[i]
		var s: BShip = b["s"]
		var tg: BShip = b["tg"]
		var spec: Dictionary = b["spec"]
		var end := s.dead or (tg.dead and not tg.is_tomb) or float(b["age"]) + dt > BEAM_DUR
		if end:
			_release_beam_vis(b)
			bbeams.remove_at(i)
			i -= 1
			continue
		b["age"] += dt
		if tg.is_tomb:
			_tomb_target(s.pos)
		var tp := tg.pos + (b["off"] as Vector3)
		var gp := s.pos + basis_of(s).z * s.rad * 0.5
		var w: float = spec["w"]
		var age: float = b["age"]
		var k := age / 0.15 if age < 0.15 else (maxf(0.05, (BEAM_DUR - age) / 0.25) if age > BEAM_DUR - 0.25 else 1.0)
		var vis: int = b["vis"]
		if vis >= 0:
			var node: Node3D = beam_pool[vis]["node"]
			var dv := tp - gp
			var l := dv.length()
			var dir := dv / maxf(l, 0.001)
			node.global_position = gp + dv * 0.5
			var up := Vector3.UP if absf(dir.y) < 0.99 else Vector3.RIGHT
			node.global_transform.basis = Basis.looking_at(dir, up) * Basis(Vector3.RIGHT, PI * 0.5)
			node.scale = Vector3(w * k * (1.0 + sin(gt * 40.0 + s.id) * 0.12), l, 1.0)
			(beam_pool[vis]["sparks"] as GPUParticles3D).global_position = tp
		b["tick"] += dt
		if b["tick"] >= BEAM_TICK:
			b["tick"] -= BEAM_TICK
			var dmg := float(spec["dmg"]) * BEAM_TICK / BEAM_DUR
			if tg.is_tomb:
				iron_dmg += dmg
			else:
				damage(tg, dmg, tp, s)
		i -= 1

func _release_beam_vis(b: Dictionary) -> void:
	var vis: int = b["vis"]
	if vis < 0:
		return
	beam_pool[vis]["used"] = false
	(beam_pool[vis]["node"] as Node3D).visible = false
	(beam_pool[vis]["sparks"] as GPUParticles3D).emitting = false

func _fire_ship_missiles(s: BShip, tg: BShip, spec: Dictionary) -> void:
	for i in range(int(spec["n"])):
		get_tree().create_timer(i * 0.12).timeout.connect(func():
			if s.dead or tg.dead:
				return
			var m := BShot.new()
			var o := s.pos + basis_of(s).x * (s.rad * 0.3 * (1.0 if i % 2 == 0 else -1.0)) + Vector3(rr(-40, 40), rr(-40, 40), rr(-40, 40))
			var f := ((tg.pos - o).normalized() + Vector3(rr(-0.35, 0.35), rr(0.0, 0.5), rr(-0.35, 0.35))).normalized()
			m.pos = o
			m.fwd = f
			m.vel = f * 90.0
			m.spd = 90.0
			m.life = 16.0
			m.big = true
			m.homing = true
			m.dmg = float(spec["dmg"]) * (0.75 if s.side == 1 else 1.0)
			m.side = s.side
			m.src = s
			m.tgt = tg
			m.w = 6.0
			m.len = 40.0
			m.col = Color(1.0, 0.6, 0.25)
			shots.append(m)
			_flash(o, 70.0, 0.3, Color(1, 0.8, 0.5)))

func _bubble_target(s: BShip, range_: float) -> BShip:
	var best: BShip = null
	var bs := -1
	for k in range(14):
		if enemies.is_empty():
			break
		var e: BShip = enemies[randi() % enemies.size()]
		if e.dead or s.pos.distance_to(e.pos) > range_:
			continue
		var n := 0
		for q in enemies:
			if not q.dead and q.pos.distance_to(e.pos) < 900.0:
				n += 1 if q.d["cls"] == "fgt" else 4
		if n > bs:
			bs = n
			best = e
	return best

func _launch_bubble(s: BShip, tg: BShip) -> void:
	var lp := _tomb_target(s.pos).pos if tg.is_tomb else lead_point(s.pos, tg, 300.0)
	bubbles.append({"pos": s.pos, "tgt": lp, "tomb": tg.is_tomb, "spd": 300.0, "age": 0.0, "src": s, "r": 950.0, "dmg": 15000.0, "node": _make_bubble_node()})
	_flash(s.pos, 600.0, 0.5, Color(1, 0.85, 0.35))

func _make_bubble_node() -> Node3D:
	var mi := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 50.0
	sm.height = 100.0
	mi.mesh = sm
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.albedo_color = Color(3.0, 2.2, 0.8)
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi

func _step_bubbles(dt: float) -> void:
	var i := bubbles.size() - 1
	while i >= 0:
		var b: Dictionary = bubbles[i]
		b["age"] += dt
		var dv: Vector3 = b["tgt"] - b["pos"]
		var d := dv.length()
		if d <= float(b["spd"]) * dt + 20.0:
			_detonate_bubble(b)
			(b["node"] as Node3D).queue_free()
			bubbles.remove_at(i)
			i -= 1
			continue
		b["pos"] += dv / d * float(b["spd"]) * dt
		(b["node"] as Node3D).global_position = b["pos"]
		if b["age"] > 40.0:
			(b["node"] as Node3D).queue_free()
			bubbles.remove_at(i)
		i -= 1

func _detonate_bubble(b: Dictionary) -> void:
	var p: Vector3 = b["pos"]
	Explosion.spawn(self, p, 260.0, 0, 0, false)
	_flash(p, float(b["r"]) * 2.0, 0.6, Color(1, 0.8, 0.4))
	if b["tomb"]:
		iron_dmg += 9000.0
		return
	for e in enemies:
		if e.dead:
			continue
		var dd: float = e.pos.distance_to(p)
		if dd < float(b["r"]) + e.rad:
			damage(e, float(b["dmg"]) * (1.0 - dd / (float(b["r"]) + e.rad)) + 900.0, e.pos, b["src"])

# ───────────── 預警機資料鏈 ─────────────
func _allocate_targets() -> void:
	var A := _awacs_unit()
	if A == null:
		for u in allies:
			u.aw_tgt = null
		pl["suggest"] = null
		return
	var hvt: Array = []
	for a in allies:
		if not a.dead and (a.kind == "hss" or a.kind == "moon" or a.kind == "awacs"):
			hvt.append(a)
	for e in enemies:
		if e.dead:
			continue
		e.load_n = 0
		var near := 1e9
		for h in hvt:
			near = minf(near, e.pos.distance_to(h.pos))
		e.threat = (45.0 if e.kind == "whale" else 12.0) + 40.0 * clampf(1.0 - near / 5000.0, 0.0, 1.0) + (10.0 if (e.tgt != null and e.tgt.d["hp"] > 10000.0) else 0.0)
	var units: Array = []
	for u in allies:
		if not u.dead and not u.is_player and u.kind != "awacs" and active_order(u).is_empty():
			units.append(u)
	units.shuffle()
	for u in units:
		var rng_ := 2600.0 if u.kind == "fgt" else float(u.d.get("range", 2000.0)) * 1.3
		var best: BShip = null
		var bs := -1e9
		for e in enemies:
			if e.dead:
				continue
			var dist: float = u.pos.distance_to(e.pos)
			if dist > rng_:
				continue
			var capacity := maxf(1.0, ceilf(e.hp / (400.0 if u.kind == "fgt" else 4000.0)))
			var score: float = e.threat * 0.6 - dist / rng_ * 20.0 - (e.load_n / capacity) * 25.0 - (15.0 if (u.kind == "fgt" and e.d["hp"] > 1000.0) else 0.0)
			if score > bs:
				bs = score
				best = e
		u.aw_tgt = best
		if best != null:
			best.load_n += 1
	var best2: BShip = null
	var bs2 := -1e9
	var ppos: Vector3 = (pl["ship"] as BShip).pos
	for e in enemies:
		if e.dead:
			continue
		var dist2: float = ppos.distance_to(e.pos)
		if dist2 > 5200.0:
			continue
		var sc: float = e.threat - dist2 / 80.0
		if sc > bs2:
			bs2 = sc
			best2 = e
	pl["suggest"] = best2

# ───────────── 玩家 ─────────────
func _step_player(dt: float) -> void:
	if pl.is_empty():
		return
	var P := pl
	var s: BShip = P["ship"]
	if P["dead"]:
		P["respawn"] -= dt
		if P["respawn"] <= 0.0:
			_spawn_player(true)
		return
	if autoplay:   # 測試用：自動鎖定最近敵機、對準並開火
		var tg_: BShip = P["target"]
		if tg_ == null or tg_.dead:
			_cycle_target("next")
			tg_ = P["target"]
		if tg_ != null:
			var f_ := (lead_point(s.pos, tg_, 1900.0) - s.pos).normalized()
			s.q = s.q.slerp(Quaternion(Basis.looking_at(-f_, Vector3.UP)), minf(1.0, dt * 3.0))
			P["thr"] = 0.5
	var sens := 0.0016
	var inv := -1.0 if P["invert"] else 1.0
	var tx := clampf(mouse_dy * sens / dt * inv, -1.7, 1.7)
	var ty := clampf(-mouse_dx * sens / dt, -1.5, 1.5)
	mouse_dx = 0.0
	mouse_dy = 0.0
	if Input.is_key_pressed(KEY_UP): tx += -1.2 * inv
	if Input.is_key_pressed(KEY_DOWN): tx += 1.2 * inv
	if Input.is_key_pressed(KEY_LEFT): ty += 1.1
	if Input.is_key_pressed(KEY_RIGHT): ty -= 1.1
	var tz := ((1.0 if Input.is_key_pressed(KEY_E) else 0.0) - (1.0 if Input.is_key_pressed(KEY_Q) else 0.0)) * 2.0
	var kk := 1.0 - exp(-dt * 7.0)
	var w: Vector3 = P["w"]
	w.x += (tx - w.x) * kk
	w.y += (ty - w.y) * kk
	w.z += (tz - w.z) * kk
	P["w"] = w
	var q: Quaternion = s.q
	q = q * Quaternion(Vector3.RIGHT, w.x * dt)
	q = q * Quaternion(Vector3.UP, w.y * dt)
	q = q * Quaternion(Vector3.BACK, w.z * dt)
	s.q = q.normalized()
	var bas := Basis(s.q)
	if Input.is_key_pressed(KEY_W): P["thr"] = minf(1.0, P["thr"] + dt * 0.5)
	if Input.is_key_pressed(KEY_S): P["thr"] = maxf(0.0, P["thr"] - dt * 0.5)
	if Input.is_key_pressed(KEY_X): P["thr"] = maxf(0.0, P["thr"] - dt * 2.5)
	var was_boost: bool = P["boost"]
	P["boost"] = Input.is_key_pressed(KEY_SHIFT) and P["energy"] > 4.0 and P["thr"] > 0.05
	if P["boost"] and not was_boost:
		sfx_play("afterburner", null, -4.0)
	P["energy"] = clampf(P["energy"] + (-26.0 if P["boost"] else 11.0) * dt, 0.0, 100.0)
	var vt: float = P["thr"] * 170.0 * (2.4 if P["boost"] else 1.0)
	var sx := ((1.0 if Input.is_key_pressed(KEY_A) else 0.0) - (1.0 if Input.is_key_pressed(KEY_D) else 0.0)) * 55.0
	var sy := ((1.0 if Input.is_key_pressed(KEY_R) else 0.0) - (1.0 if Input.is_key_pressed(KEY_F) else 0.0)) * 55.0
	var want: Vector3 = bas * Vector3(sx, sy, vt)
	var vel: Vector3 = P["vel"]
	if P["assist"]:
		vel = vel.lerp(want, 1.0 - exp(-dt * (2.4 if Input.is_key_pressed(KEY_X) else 1.1)))
	else:
		vel += (bas * Vector3(sx * 0.6, sy * 0.6, P["thr"] * 90.0 * (2.4 if P["boost"] else 1.0))) * dt
		if vel.length() > 420.0:
			vel = vel.normalized() * 420.0
	var pos: Vector3 = s.pos + vel * dt
	var from_tomb := pos - TOMB_POS
	if from_tomb.length() > ARENA_R:
		vel -= from_tomb.normalized() * 140.0 * dt
		P["msg"] = "LEAVING BATTLE AREA · TURN BACK"
	elif from_tomb.length() < TOMB_AURA:
		vel += from_tomb.normalized() * 220.0 * dt
		P["msg"] = "IRONTOMB EXCLUSION ZONE · TURN BACK"
	else:
		P["msg"] = ""
	P["vel"] = vel
	s.pos = pos
	s.vel = vel
	if P["hull"] < P["hull_max"] * 0.35:
		sfx_play("alarm", null, -8.0, 1.4)
	if gt - float(P["last_hit"]) > 4.0:
		P["shield"] = minf(P["shield_max"], P["shield"] + 55.0 * dt)
	P["heat"] = clampf(P["heat"] + 24.0 * dt, 0.0, 100.0)
	P["fire_cd"] -= dt
	P["msl_cd"] -= dt
	P["sup_cd"] -= dt
	_step_resupply(dt)
	var firing := Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) or Input.is_key_pressed(KEY_SPACE) or autoplay
	if firing and P["fire_cd"] <= 0.0 and P["heat"] > 8.0:
		_player_fire()
	if (Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT) or Input.is_key_pressed(KEY_CTRL)) and P["msl_cd"] <= 0.0:
		_player_missile()
	cam_shake *= exp(-dt * 5.0)

var gun_side := 0
func _player_fire() -> void:
	var P := pl
	var s: BShip = P["ship"]
	P["fire_cd"] = 0.11
	P["heat"] -= 3.2
	gun_side = (gun_side + 1) % 4
	sfx_play("blaster", null, -6.0, 0.05)
	var bas := Basis(s.q)
	var f := bas.z
	var gun := s.pos + bas.z * 8.0 + bas.x * (-3.0 if gun_side < 2 else 3.0) + bas.y * (-1.0 if gun_side % 2 == 0 else 1.0)
	var tp := s.pos + f * 900.0
	var tgt: BShip = P["target"]
	if tgt != null and not tgt.dead:
		var l := lead_point(gun, tgt, 1900.0)
		if (l - s.pos).normalized().dot(f) > 0.985:
			tp = l
	fire_shot(s, gun, (tp - gun).normalized(), 1900.0 + (P["vel"] as Vector3).length() * 0.3, 16.0, 0.5, 34.0, Color(0.3, 0.72, 1), 2.1)

func _player_missile() -> void:
	var P := pl
	var tgt: BShip = P["target"]
	if P["missiles"] <= 0 or tgt == null or tgt.dead:
		return
	var s: BShip = P["ship"]
	P["msl_cd"] = 0.8
	P["missiles"] -= 1
	sfx_play("missile_launch", null, -2.0)
	var f := Basis(s.q).z
	var m := BShot.new()
	m.pos = s.pos + f * 12.0 - Vector3(0, 3, 0)
	m.vel = P["vel"]
	m.fwd = f
	m.spd = maxf(150.0, (P["vel"] as Vector3).length())
	m.life = 9.0
	m.dmg = 420.0
	m.homing = true
	m.side = 0
	m.src = s
	m.tgt = tgt
	m.w = 2.0
	m.len = 14.0
	m.col = Color(1.0, 0.6, 0.25)
	shots.append(m)

func _supply_ship() -> BShip:
	var best: BShip = null
	var bd := 1e18
	var pp: Vector3 = (pl["ship"] as BShip).pos
	for a in allies:
		if a.dead or not (a.kind in ["hss", "cap", "xzd"]):
			continue
		var d: float = pp.distance_squared_to(a.pos)
		if d < bd:
			bd = d
			best = a
	return best

func _step_resupply(dt: float) -> void:
	var P := pl
	if P["missiles"] > 2 and not P["need_supply"]:
		P["res_t"] = 0.0
		return
	if P["missiles"] <= 2:
		P["need_supply"] = true
	var sh := _supply_ship()
	P["supply_tgt"] = sh
	if sh == null:
		P["res_t"] = 0.0
		return
	if (pl["ship"] as BShip).pos.distance_to(sh.pos) < sh.rad + 450.0:
		P["res_t"] += dt
		if P["res_t"] >= 2.0:
			P["missiles"] = 8
			P["need_supply"] = false
			P["res_t"] = 0.0
			note("MISSILES RESUPPLIED")
	else:
		P["res_t"] = maxf(0.0, P["res_t"] - dt * 2.0)

func _cycle_target(mode: String) -> void:
	var P := pl
	var s: BShip = P["ship"]
	if mode == "awacs":
		var sg = P["suggest"]
		if sg != null and not sg.dead:
			P["target"] = sg
		return
	var list: Array = []
	for e in enemies:
		if not e.dead and s.pos.distance_to(e.pos) < 6000.0:
			list.append(e)
	if list.is_empty():
		P["target"] = null
		return
	var f := Basis(s.q).z
	if mode == "reticle":
		var b: BShip = null
		var bs := -2.0
		for e in list:
			var v: Vector3 = e.pos - s.pos
			var sc := v.normalized().dot(f) - v.length() * 0.00002 + (0.0 if e.d["hp"] > 1000.0 else 0.02)
			if sc > bs:
				bs = sc
				b = e
		P["target"] = b
	else:
		list.sort_custom(func(a, b): return s.pos.distance_squared_to(a.pos) < s.pos.distance_squared_to(b.pos))
		var i := list.find(P["target"])
		P["target"] = list[(i + 1) % list.size()]

func _call_support(type: String) -> void:
	var P := pl
	var tg: BShip = P["target"]
	if tg == null or tg.dead:
		note("No target locked (T)")
		return
	if P["sup_cd"] > 0.0:
		note("Comms cooling down")
		return
	var ppos: Vector3 = (P["ship"] as BShip).pos
	var R := 20000.0 if _awacs_unit() != null else 6000.0
	var cap := 12 if _awacs_unit() != null else 6
	var list: Array = []
	for u in allies:
		if u.dead or u.is_player or u.kind == "awacs":
			continue
		if ppos.distance_to(u.pos) > R:
			continue
		var reach := 2600.0 if u.kind == "fgt" else float(u.d.get("range", 2000.0)) * 1.15
		var dd: float = u.pos.distance_to(tg.pos)
		if dd <= reach:
			list.append([u, dd])
	if list.is_empty():
		note("No friendly in range")
		return
	list.sort_custom(func(a, b): return a[1] < b[1])
	var n := mini(cap, list.size())
	for i in range(n):
		(list[i][0] as BShip).order = {"type": "focus" if type == "focus" else "charge", "tgt": tg, "until": gt + 30.0}
	P["sup_cd"] = 8.0 if _awacs_unit() != null else 16.0
	note(("FOCUS FIRE" if type == "focus" else "CHARGE") + " · %d responding" % n)

# ───────────── 損傷特效：重傷的大艦冒小爆炸 ─────────────
func _step_damage_fx(dt: float) -> void:
	var budget := 0
	for list in [allies, enemies]:
		for s in list:
			if s.dead or float(s.d["hp"]) < 2500.0 or s.is_player:
				continue
			var dm: float = 1.0 - s.hp / s.hp_max
			if dm < 0.3:
				continue
			if cam.global_position.distance_to(s.pos) > 12000.0:
				continue
			budget += 1
			if budget > 6:
				return
			s.fx_t -= dt
			if s.fx_t <= 0.0:
				s.fx_t = rr(1.5, 3.5) / (0.5 + dm)
				var off: Vector3 = Vector3(rr(-1, 1), rr(-0.5, 0.5), rr(-1, 1)) * (s.rad * 0.6)
				Explosion.spawn(self, s.pos + off, clampf(s.rad * 0.12, 10.0, 60.0), s.side, 0, false)

# ───────────── 主迴圈 ─────────────
func _process(delta: float) -> void:
	if bpaused:
		_update_cam(delta)
		bhud.queue_redraw()
		return
	var dt := minf(delta, 0.2 if big_step else 0.05)
	gt += dt
	if gt >= next_wave:
		next_wave = gt + maxf(13.0, 32.0 - wave * 1.8)
		_spawn_wave()
	if gt >= next_reinf:
		next_reinf = gt + 11.0
		_reinforce()
	if gt >= next_launch:
		next_launch = gt + 7.0
		_launch_fighters()
	if gt - last_alloc > 2.0:
		last_alloc = gt
		_allocate_targets()
	_build_grid()
	for s in allies:
		if s.dead or s.is_player:
			continue
		if s.kind == "fgt":
			ai_fighter(s, dt)
		elif s.kind == "awacs":
			ai_awacs(s, dt)
		else:
			ai_capital(s, dt)
	for s in enemies:
		if s.dead:
			continue
		if s.kind == "fly":
			ai_fighter(s, dt)
		else:
			ai_capital(s, dt)
	_separate_caps()
	_step_player(dt)
	_step_shots(dt)
	_step_bubbles(dt)
	_step_beams(dt)
	_step_shields(dt)
	_step_flashes(dt)
	_step_damage_fx(dt)
	allies = allies.filter(func(s): return not s.dead)
	enemies = enemies.filter(func(s): return not s.dead)
	if not pl.is_empty() and pl["target"] != null and (pl["target"] as BShip).dead:
		pl["target"] = null
	hurt_k = maxf(0.0, hurt_k - dt * 1.5)
	stats_t += dt
	if stats_t >= 10.0 and "--stats" in OS.get_cmdline_user_args():
		stats_t = 0.0
		print("[stats] t=%.0f allies=%d enemies=%d kills=%d shots=%d beams=%d wave=%d player_hull=%.0f msl=%d" % [gt, allies.size(), enemies.size(), kills, shots.size(), bbeams.size(), wave, pl["hull"], pl["missiles"]])
	_render_ships()
	_render_shots()
	_update_cam(dt)
	bhud.queue_redraw()

func _render_ships() -> void:
	var by_kind := {}
	for list in [allies, enemies]:
		for s in list:
			if s.dead or (s.is_player and (pl["dead"] or cam_mode == 1)):
				continue
			if not by_kind.has(s.kind):
				by_kind[s.kind] = []
			by_kind[s.kind].append(s)
	for kind in fleets.keys():
		var f: Dictionary = fleets[kind]
		var arr: Array = by_kind.get(kind, [])
		var n := mini(arr.size(), int(f["cap"]))
		var sc: float = f["sc"]
		var center: Vector3 = f["center"]
		for part in f["parts"]:
			var mm: MultiMesh = part["mm"]
			var local: Transform3D = part["local"]
			var loc := Transform3D(local.basis, local.origin - center)
			for i in range(n):
				var s: BShip = arr[i]
				var bs := basis_of(s) * (sc * s.k)
				mm.set_instance_transform(i, Transform3D(bs, s.pos) * loc)
			mm.visible_instance_count = n

func _render_shots() -> void:
	var n := mini(shots.size(), shot_mm.instance_count)
	for i in range(n):
		var b: BShot = shots[i]
		var dir := b.fwd if b.homing else b.vel.normalized()
		var up := Vector3.UP if absf(dir.y) < 0.99 else Vector3.RIGHT
		var bs := Basis.looking_at(dir, up)
		var bw := Basis(bs.x * b.w, bs.y * b.w, bs.z * b.len)
		shot_mm.set_instance_transform(i, Transform3D(bw, b.pos - dir * b.len * 0.5))
		shot_mm.set_instance_color(i, b.col)
	shot_mm.visible_instance_count = n

func _update_cam(dt: float) -> void:
	if pl.is_empty():
		return
	var s: BShip = pl["ship"]
	var bas := Basis(s.q)
	var target_pos: Vector3
	if cam_mode == 1:
		target_pos = s.pos + bas.z * 4.0 + bas.y * 1.2
	else:
		target_pos = s.pos - bas.z * 34.0 + bas.y * 9.0
	cam_pos_s = cam_pos_s.lerp(target_pos, 1.0 - exp(-dt * 12.0)) if cam_mode == 0 else target_pos
	var sh := Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * cam_shake * 0.4
	cam.global_transform = Transform3D(bas * Basis(Vector3.UP, PI), cam_pos_s + sh)
	cam.fov = 70.0 + (6.0 if pl["boost"] else 0.0)

# ───────────── 輸入 ─────────────
func _input(e: InputEvent) -> void:
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and not bpaused:
		mouse_dx += (e as InputEventMouseMotion).relative.x
		mouse_dy += (e as InputEventMouseMotion).relative.y
	if e is InputEventKey and (e as InputEventKey).pressed and not (e as InputEventKey).echo:
		match (e as InputEventKey).keycode:
			KEY_ESCAPE:
				bpaused = not bpaused
				Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if bpaused else Input.MOUSE_MODE_CAPTURED
			KEY_T:
				_cycle_target("reticle")
				sfx_play("lock_acquired" if pl["target"] != null else "lock_tick", null, -4.0)
			KEY_Y:
				_cycle_target("next")
			KEY_U:
				_cycle_target("awacs")
			KEY_C:
				_call_support("focus")
			KEY_G:
				_call_support("charge")
			KEY_V:
				cam_mode = 1 - cam_mode
			KEY_Z:
				pl["assist"] = not pl["assist"]
			KEY_I:
				pl["invert"] = not pl["invert"]
			KEY_N:
				radar_on = not radar_on
			KEY_M:
				music_on = not music_on
				if bgm != null:
					bgm.stream_paused = not music_on
			KEY_P:
				Explosion.budget_enabled = not Explosion.budget_enabled
			KEY_F3:
				var sc := get_viewport().scaling_3d_scale
				get_viewport().scaling_3d_scale = 1.0 if sc < 1.0 else 0.75
