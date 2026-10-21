extends Node3D
## 階段 1 驗證小專案：只有畫面、沒有玩法。
## 目的：在 Godot 4.6（Windows 預設 D3D12 + Forward+）上看 ① 艦艇 GLB 的材質與光照 ② 大量艦艇（MultiMesh）的幀數
##       ③ 光束＋電焊火花 ④ 泛光／體積霧／調色。操作見 README.md。
##
## 世界尺寸沿用網頁版：1 單位 ≈ 1 公尺 × 縮放（巡洋艦約 462、護衛艦 90、星槎 14）。

# kind → [GLB, 目標長度（沿 axis 軸，0=X 1=Y 2=Z）, 軸, 基本數量（×1 時）, 是否為戰機群（出現在巡洋艦附近）]
const KINDS := {
	"cruiser":    ["cruiser.glb",     462.0, 2, 14, false],
	"ipc":        ["ipc.glb",         528.0, 2, 14, false],
	"frigate":    ["frigate.glb",      90.0, 2, 48, false],
	"fighter":    ["fighter.glb",      14.0, 2, 30, true],
	"ipc_fighter":["ipc_fighter.glb",  14.0, 2, 30, true],
	"whale":      ["whale.glb",       378.0, 2, 10, false],
	"xzd":        ["xzd.glb",        2720.0, 2, 1,  false],
	"hss":        ["hss.glb",        2040.0, 2, 1,  false],
	"ipc_sid":    ["ipc_sid.glb",     528.0, 2, 1,  false],
}
const TOMB_HEIGHT := 3000.0
const MAX_MULT := 64

var fleet_mult := 1
var animate := false
var kinds_data := {}           # kind → {parts:[{mi: MultiMeshInstance3D, local: Transform3D}], scale: float, count: int, xforms: Array[Transform3D], vel: Array[Vector3]}
var cam: Camera3D
var hud: Label
var yaw := PI                # 預設朝 +Z（艦隊在鐵墓的 -Z 側，鏡頭在艦隊後方看向鐵墓）
var pitch := -0.08
var fly_speed := 900.0
var hud_t := 0.0
var bench_t := 0.0
var bench_log: Array[String] = []
var auto_bench := false
var bench_steps := [1, 2, 4, 8, 16]
var bench_idx := 0
var bench_clock := 0.0
var bench_samples: Array[float] = []
var beams: Array[Dictionary] = []
var rng := RandomNumberGenerator.new()
var auto_boom := false
var boom_t := 0.0
var demo_explode := false

func _ready() -> void:
	rng.seed = 42
	_make_environment()
	_make_tomb()
	_load_kinds()
	_layout_fleet()
	_make_beams()
	_make_camera_and_hud()
	auto_bench = "--benchmark" in OS.get_cmdline_user_args()
	demo_explode = "--explode-demo" in OS.get_cmdline_user_args() or "--explode-demo-purple" in OS.get_cmdline_user_args() or "--explode-demo-shift" in OS.get_cmdline_user_args()
	if demo_explode:   # 腳本化示範：鏡頭貼近一艘巡洋艦，在它旁邊引爆（檢查爆炸光對艦體金屬的照明）
		var P: Vector3 = (kinds_data["cruiser"]["xf"][0] as Transform3D).origin
		cam.position = P + Vector3(650.0, 160.0, -120.0)
		var dv := (P - cam.position).normalized()
		yaw = atan2(-dv.x, -dv.z)
		pitch = asin(dv.y)
		get_tree().create_timer(0.3).timeout.connect(func(): Explosion.spawn(self, P + Vector3(120.0, 140.0, -80.0), 120.0, (1 if "--explode-demo-purple" in OS.get_cmdline_user_args() else (2 if "--explode-demo-shift" in OS.get_cmdline_user_args() else 0))))
	if "--break-demo" in OS.get_cmdline_user_args():   # 鏡頭對著第 0 艘巡洋艦，0.4 秒後斷裂
		var P3: Vector3 = (kinds_data["cruiser"]["xf"][0] as Transform3D).origin
		cam.position = P3 + (Vector3(130.0, 50.0, -150.0) if "--close" in OS.get_cmdline_user_args() else Vector3(300.0, 120.0, -380.0))
		var dv3 := (P3 - cam.position).normalized()
		yaw = atan2(-dv3.x, -dv3.z)
		pitch = asin(dv3.y)
		if not ("--no-break" in OS.get_cmdline_user_args()):
			get_tree().create_timer(0.4).timeout.connect(func(): _break_index("cruiser", 0, 1 if "--purple" in OS.get_cmdline_user_args() else 0))
	if "--hull-demo" in OS.get_cmdline_user_args():   # 鏡頭貼近一艘巡洋艦看艦體材質（POM）
		var hk := "cruiser"
		for a_ in OS.get_cmdline_user_args():
			if a_.begins_with("--kind="): hk = a_.substr(7)
		var P2: Vector3 = (kinds_data[hk]["xf"][0] as Transform3D).origin
		var hl: float = float(KINDS[hk][1])
		cam.position = P2 + Vector3(0.35, 0.15, -0.45) * hl
		var dv2 := (P2 - cam.position).normalized()
		yaw = atan2(-dv2.x, -dv2.z)
		pitch = asin(dv2.y)
		if "--no-pom" in OS.get_cmdline_user_args():
			_toggle_pom()
	if "--explode-gallery" in OS.get_cmdline_user_args():   # 3 種顏色 × 8 種變體的展示牆（橘／紫／先橘後紫 各一列）
		var C := Vector3(20000.0, 0.0, 0.0)
		Explosion.budget_enabled = false
		cam.position = C + Vector3(0.0, 0.0, 2300.0)
		yaw = 0.0
		pitch = 0.0
		for row in range(3):
			for col in range(8):
				var gp := C + Vector3((col - 3.5) * 330.0, (1 - row) * 330.0, 0.0)
				get_tree().create_timer(0.3).timeout.connect(func(): Explosion.spawn(self, gp, 85.0, row, col))
	if auto_bench:
		fleet_mult = bench_steps[0]
		_apply_mult()
	print("[spike] ready · adapter=", RenderingServer.get_video_adapter_name(), " api=", RenderingServer.get_video_adapter_api_version())

# ───────────── 環境：天空、光、發光、體積霧、調色 ─────────────
func _make_environment() -> void:
	var sky_mat := ShaderMaterial.new()
	sky_mat.shader = load("res://shaders/sky.gdshader")
	var sky := Sky.new()
	sky.sky_material = sky_mat
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.22
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.0
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_bloom = 0.1
	env.glow_hdr_threshold = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	env.volumetric_fog_enabled = false
	env.volumetric_fog_density = 0.00003
	env.volumetric_fog_albedo = Color(0.35, 0.28, 0.5)
	env.volumetric_fog_emission = Color(0.0, 0.0, 0.0)
	env.volumetric_fog_length = 6000.0
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.1
	env.adjustment_contrast = 1.08
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var key := DirectionalLight3D.new()   # 主光（恆星方向）
	key.light_color = Color(0.85, 0.92, 1.0)
	key.light_energy = 1.15
	key.rotation_degrees = Vector3(-35, 140, 0)
	key.shadow_enabled = false
	add_child(key)
	var rim := DirectionalLight3D.new()   # 側後方粉紅補光（弱）
	rim.light_color = Color(1.0, 0.45, 0.6)
	rim.light_energy = 0.3
	rim.rotation_degrees = Vector3(25, -40, 0)
	add_child(rim)

func _make_tomb() -> void:
	var ps := load("res://assets/models/irontomb.glb") as PackedScene
	var root := ps.instantiate() as Node3D
	add_child(root)
	var aabb := _merged_aabb(root)
	var s := TOMB_HEIGHT / maxf(aabb.size.y, 0.001)
	root.scale = Vector3.ONE * s
	root.position = Vector3(0, -aabb.position.y * s - TOMB_HEIGHT * 0.5, 0)
	var l := OmniLight3D.new()   # 鐵墓的紅光：有衰減（網頁版就是少了這個，整支艦隊被染紅）
	l.light_color = Color(1.0, 0.16, 0.27)
	l.light_energy = 4.0
	l.position = Vector3(0, 400, -1400)   # 放在鐵墓前方，避免光源埋在模型裡把鐵墓照成一片白
	l.omni_range = 14000.0
	l.omni_attenuation = 1.6
	l.shadow_enabled = false
	add_child(l)

# ───────────── 艦艇：載入 GLB → 每個網格零件一個 MultiMesh ─────────────
func _collect_meshes(n: Node, root: Node3D, out: Array) -> void:
	if n is MeshInstance3D and (n as MeshInstance3D).mesh:
		out.append({"mesh": (n as MeshInstance3D).mesh, "local": root.global_transform.affine_inverse() * (n as MeshInstance3D).global_transform})
	for c in n.get_children():
		_collect_meshes(c, root, out)

func _merged_aabb(root: Node3D) -> AABB:
	var parts: Array = []
	_collect_meshes(root, root, parts)
	var box := AABB()
	var first := true
	for p in parts:
		var a: AABB = (p["local"] as Transform3D) * (p["mesh"] as Mesh).get_aabb()
		box = a if first else box.merge(a)
		first = false
	return box

func _load_kinds() -> void:
	for kind in KINDS.keys():
		var spec: Array = KINDS[kind]
		var ps := load("res://assets/models/" + (spec[0] as String)) as PackedScene
		if ps == null:
			push_warning("missing model " + str(spec[0])); continue
		var root := ps.instantiate() as Node3D
		add_child(root)                       # 要先進場景樹才有 global_transform
		var parts_src: Array = []
		_collect_meshes(root, root, parts_src)
		var aabb := _merged_aabb(root)
		var axis_len := aabb.size[int(spec[2])]
		var sc := float(spec[1]) / maxf(axis_len, 0.001)
		var center := aabb.get_center()
		root.queue_free()
		var cap := int(spec[3]) * MAX_MULT
		var parts: Array = []
		for p in parts_src:
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = p["mesh"]
			mm.use_custom_data = true   # 每艘艦的燃燒度（x）與亂數種子（y），斷裂後的斷面燃燒餘燼用；要在設 instance_count 之前開啟
			mm.instance_count = cap
			_convert_materials(mm.mesh, kind)
			mm.visible_instance_count = 0
			var mmi := MultiMeshInstance3D.new()
			mmi.multimesh = mm
			mmi.custom_aabb = AABB(Vector3(-30000, -30000, -30000), Vector3(60000, 60000, 60000))
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(mmi)
			parts.append({"mm": mm, "local": p["local"]})
		kinds_data[kind] = {"parts": parts, "scale": sc, "center": center, "cap": cap, "base": int(spec[3]), "count": 0,
			"xf": [] as Array[Transform3D], "vel": [] as Array[Vector3], "fighter": spec[4]}

# ───────────── 艦體材質：換成 POM 版（高度圖由底色貼圖推導，見 tools-src/godot/make_heightmaps.py） ─────────────
var _hull_shader: Shader
var pom_on := true
var _hull_mats: Array[ShaderMaterial] = []
var _hull_by_name := {}   # 材質名 → POM 材質（斷片外表沿用，與完整艦一致）

func _tex_sibling(tex: Texture2D, suffix: String) -> Texture2D:
	if tex == null or tex.resource_path == "":
		return null
	var path := tex.resource_path.get_basename() + suffix
	return load(path) as Texture2D if ResourceLoader.exists(path) else null

func _convert_materials(mesh: Mesh, kind: String = "") -> void:
	if _hull_shader == null:
		_hull_shader = load("res://shaders/ship_hull.gdshader")
	for si in range(mesh.get_surface_count()):
		var src := mesh.surface_get_material(si)
		if not (src is BaseMaterial3D):
			continue
		var b := src as BaseMaterial3D
		if kind == "cruiser" and b.resource_name == "trim":   # 仙舟巡洋艦的飾帶：淡淡的螢光（取代原本偏深的藍色發光）
			var tm := StandardMaterial3D.new()
			tm.albedo_color = Color(0.22, 0.36, 0.38)
			tm.roughness = 0.4
			tm.emission_enabled = true
			tm.emission = Color(0.45, 0.9, 0.85)
			tm.emission_energy_multiplier = 0.5
			tm.resource_name = "trim"
			mesh.surface_set_material(si, tm)
			_hull_by_name["trim"] = tm
			continue
		var hmap := _tex_sibling(b.albedo_texture, "_height.png")
		if hmap == null:
			continue   # 沒有貼圖的純色材質（飾條等）維持原樣
		var sm := ShaderMaterial.new()
		sm.shader = _hull_shader
		sm.set_shader_parameter("albedo_tex", b.albedo_texture)
		sm.set_shader_parameter("albedo_color", b.albedo_color)
		sm.set_shader_parameter("height_tex", hmap)
		var rmap := _tex_sibling(b.albedo_texture, "_rough.png")
		if rmap != null:
			sm.set_shader_parameter("rough_tex", rmap)
			sm.set_shader_parameter("use_rough_tex", true)
		sm.set_shader_parameter("roughness", maxf(b.roughness, 0.35))
		sm.set_shader_parameter("metallic", clampf(b.metallic + (0.45 if kind != "hss" else 0.0), 0.0, 0.85))
		if b.normal_enabled and b.normal_texture != null:
			sm.set_shader_parameter("normal_tex", b.normal_texture)
			sm.set_shader_parameter("use_normal_tex", true)
		if b.emission_enabled:
			sm.set_shader_parameter("emission_color", Vector3(b.emission.r, b.emission.g, b.emission.b))
			sm.set_shader_parameter("emission_energy", b.emission_energy_multiplier)
			if b.emission_texture != null:
				sm.set_shader_parameter("emission_tex", b.emission_texture)
				sm.set_shader_parameter("use_emission_tex", true)
		if kind == "cruiser":
			sm.set_shader_parameter("wood", 1.0)
			sm.set_shader_parameter("metallic", 0.0)
			sm.set_shader_parameter("wear", 0.3)
		elif kind == "hss":
			sm.set_shader_parameter("ceramic", 0.7)
			sm.set_shader_parameter("metallic", 0.0)
			sm.set_shader_parameter("wear", 0.2)
			sm.set_shader_parameter("roughness", 0.5)
		mesh.surface_set_material(si, sm)
		_hull_mats.append(sm)
		_hull_by_name[b.resource_name] = sm

func _break_nearest(kind: String, style: int) -> void:
	var d: Dictionary = kinds_data[kind]
	var best := -1
	var bd := 1e18
	var fwd := -cam.global_transform.basis.z
	for i in range(int(d["count"])):
		var xf: Transform3D = d["xf"][i]
		var to := xf.origin - cam.global_position
		var dist := to.length()
		if dist < 1.0 or to.normalized().dot(fwd) < 0.5:
			continue
		if dist < bd:
			bd = dist
			best = i
	if best < 0:
		return
	_break_index(kind, best, style)

func _break_index(kind: String, best: int, style: int) -> void:
	var d: Dictionary = kinds_data[kind]
	var xf: Transform3D = d["xf"][best]
	var sc: float = d["scale"]
	var center: Vector3 = d["center"]
	var spawn_xf := Transform3D(xf.basis, xf.origin - xf.basis * center)
	Breakup.spawn(self, kind, spawn_xf, (d["vel"][best] as Vector3), style, _hull_by_name)
	var hidden := xf
	hidden.basis = Basis.IDENTITY * 0.0001
	for part in d["parts"]:
		(part["mm"] as MultiMesh).set_instance_transform(best, hidden)
	if not ("--no-boom" in OS.get_cmdline_user_args()):
		Explosion.spawn(self, xf.origin, 160.0, style, 0 if style == 0 else 1)

func _toggle_pom() -> void:
	pom_on = not pom_on
	for m in _hull_mats:
		m.set_shader_parameter("lod_distance", 3200.0 if pom_on else 0.0)
		m.set_shader_parameter("bump_strength", 1.2 if pom_on else 0.0)
		m.set_shader_parameter("wear", 0.55 if pom_on else 0.0)

func _random_in_cap(r0: float, r1: float) -> Vector3:
	var az := rng.randf_range(-1.0, 1.0)
	var el := rng.randf_range(-0.7, 0.7)
	var r := rng.randf_range(r0, r1)
	return Vector3(sin(az) * cos(el), sin(el), -cos(az) * cos(el)) * r   # 艦隊位在鐵墓的 -Z 側（球冠）

func _layout_fleet() -> void:
	var anchors: Array[Vector3] = []
	for kind in kinds_data.keys():
		var d: Dictionary = kinds_data[kind]
		var xf: Array[Transform3D] = []
		var vel: Array[Vector3] = []
		for i in range(d["cap"]):
			var pos: Vector3
			if d["fighter"] and not anchors.is_empty():
				pos = anchors[rng.randi() % anchors.size()] + Vector3(rng.randf_range(-700, 700), rng.randf_range(-500, 500), rng.randf_range(-700, 700))
			else:
				pos = _random_in_cap(5200.0, 9000.0)
				if kind == "cruiser" or kind == "ipc":
					anchors.append(pos)
			var basis := Basis.looking_at(-pos.normalized(), Vector3.UP).scaled(Vector3.ONE * d["scale"])   # 面向鐵墓（+Z 為船首，所以朝向要反過來）
			xf.append(Transform3D(basis, pos))
			vel.append(-pos.normalized() * (105.0 if d["fighter"] else 24.0))
		d["xf"] = xf
		d["vel"] = vel
		_write_instances(d, 0, d["cap"])
	_apply_mult()

func _write_instances(d: Dictionary, from_i: int, to_i: int) -> void:
	var center: Vector3 = d["center"]
	var sc: float = d["scale"]
	for part in d["parts"]:
		var mm: MultiMesh = part["mm"]
		var local: Transform3D = part["local"]
		# 模型中心對齊原點：先平移 -center，再套零件本地變換
		var loc := Transform3D(local.basis, local.origin - center)
		for i in range(from_i, to_i):
			mm.set_instance_transform(i, (d["xf"][i] as Transform3D) * loc)

func _apply_mult() -> void:
	var total := 0
	for kind in kinds_data.keys():
		var d: Dictionary = kinds_data[kind]
		var n: int = mini(int(d["base"]) * fleet_mult, int(d["cap"]))
		d["count"] = n
		for part in d["parts"]:
			(part["mm"] as MultiMesh).visible_instance_count = n
		total += n
	print("[spike] fleet x", fleet_mult, " ships=", total)

func _total_ships() -> int:
	var t := 0
	for kind in kinds_data.keys():
		t += int(kinds_data[kind]["count"])
	return t

# ───────────── 光束＋電焊火花 ─────────────
func _make_beams() -> void:
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/beam.gdshader")
	var colors := [Color(1.0, 0.1, 0.25), Color(0.25, 0.5, 1.0), Color(0.7, 0.3, 1.0)]
	for i in range(9):
		var c: Color = colors[i % 3]
		var b := Node3D.new()
		add_child(b)
		for k in range(2):
			var q := MeshInstance3D.new()
			var qm := QuadMesh.new()
			qm.size = Vector2(1.0, 1.0)
			q.mesh = qm
			var m := mat.duplicate() as ShaderMaterial
			m.set_shader_parameter("beam_color", Vector3(c.r, c.g, c.b))
			q.material_override = m
			q.rotation.z = PI * 0.5   # 長軸沿 Y：把 quad 轉成 X→Y
			q.rotation.y = k * PI * 0.5
			q.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			b.add_child(q)
		var sp := _make_sparks(c)
		add_child(sp)
		beams.append({"node": b, "sparks": sp, "from": Vector3.ZERO, "to": Vector3.ZERO, "t": rng.randf() * 3.0, "col": c})
		_retarget_beam(beams[i])

func _make_sparks(c: Color) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = 160
	p.lifetime = 0.9
	p.explosiveness = 0.0
	p.local_coords = false
	p.transform_align = GPUParticles3D.TRANSFORM_ALIGN_Y_TO_VELOCITY
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 1.5
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 80.0
	pm.initial_velocity_min = 40.0
	pm.initial_velocity_max = 260.0
	pm.gravity = Vector3.ZERO
	pm.damping_min = 20.0
	pm.damping_max = 80.0
	pm.scale_min = 0.5
	pm.scale_max = 1.4
	var grad := Gradient.new()
	grad.set_color(0, Color(1.0, 0.95, 0.85, 1.0))
	grad.set_color(1, Color(c.r, c.g, c.b, 0.0))
	var gt := GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt
	p.process_material = pm
	var qm := QuadMesh.new()
	qm.size = Vector2(0.9, 9.0)
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	sm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	sm.vertex_color_use_as_albedo = true
	sm.albedo_color = Color(4.0, 4.0, 4.0, 1.0)
	qm.material = sm
	p.draw_pass_1 = qm
	return p

func _retarget_beam(b: Dictionary) -> void:
	var cd: Dictionary = kinds_data["cruiser"]
	var a: Vector3 = (cd["xf"][rng.randi() % maxi(int(cd["count"]), 1)] as Transform3D).origin
	var tgt := Vector3(rng.randf_range(-600, 600), rng.randf_range(-300, 600), rng.randf_range(-600, 600))   # 鐵墓附近
	b["from"] = a
	b["to"] = tgt
	b["t"] = 0.0

func _update_beams(dt: float) -> void:
	for b in beams:
		b["t"] += dt
		if b["t"] > 3.0:
			_retarget_beam(b)
		var a: Vector3 = b["from"]
		var z: Vector3 = b["to"]
		var node: Node3D = b["node"]
		var d := z - a
		var l := d.length()
		node.global_position = a + d * 0.5
		node.global_transform.basis = Basis.looking_at(d.normalized(), Vector3.UP) * Basis(Vector3.RIGHT, PI * 0.5)   # Y 軸對齊光束方向
		node.scale = Vector3(6.0, l, 1.0)
		(b["sparks"] as GPUParticles3D).global_position = z

# ───────────── 攝影機、HUD、操作 ─────────────
func _make_camera_and_hud() -> void:
	cam = Camera3D.new()
	cam.far = 60000.0
	cam.near = 1.0
	cam.fov = 65.0
	add_child(cam)
	cam.position = Vector3(0, 1400, -11500)
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(12, 8)
	hud.add_theme_color_override("font_color", Color(0.6, 1.0, 0.9))
	hud.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 1))
	layer.add_child(hud)

func _input(e: InputEvent) -> void:
	if e is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		yaw -= (e as InputEventMouseMotion).relative.x * 0.0028
		pitch = clampf(pitch - (e as InputEventMouseMotion).relative.y * 0.0028, -1.5, 1.5)
	if e is InputEventKey and (e as InputEventKey).pressed and not (e as InputEventKey).echo:
		match (e as InputEventKey).keycode:
			KEY_PAGEUP, KEY_BRACKETRIGHT:
				fleet_mult = mini(fleet_mult * 2, MAX_MULT); _apply_mult()
			KEY_PAGEDOWN, KEY_BRACKETLEFT:
				fleet_mult = maxi(fleet_mult / 2, 1); _apply_mult()
			KEY_M:
				animate = not animate
			KEY_X:
				Explosion.spawn(self, cam.global_position - cam.global_transform.basis.z * 900.0, 120.0)   # 護衛艦級爆炸（鏡頭前方）
			KEY_C:
				Explosion.spawn(self, cam.global_position - cam.global_transform.basis.z * 1600.0, 260.0)   # 巡洋艦級爆炸
			KEY_V:
				Explosion.spawn(self, cam.global_position - cam.global_transform.basis.z * 900.0, 120.0, 1)   # 紫色焰（反物質軍團）小
			KEY_B:
				Explosion.spawn(self, cam.global_position - cam.global_transform.basis.z * 1600.0, 260.0, 1)   # 紫色焰 大
			KEY_U:   # 斷裂：鏡頭正前方最近的仙舟巡洋艦（聯軍，橘色餘燼）
				_break_nearest("cruiser", 0)
			KEY_I:   # 斷裂：IPC 巡洋艦（聯軍，橘色餘燼）
				_break_nearest("ipc", 0)
			KEY_O:   # 斷裂：仙舟巡洋艦，紫色餘燼（預覽軍團配色）
				_break_nearest("cruiser", 1)
			KEY_K:   # POM 材質開關（比較升級前後）
				_toggle_pom()
			KEY_P:   # 爆炸效能保護開關（預設關閉）
				Explosion.budget_enabled = not Explosion.budget_enabled
			KEY_N:
				Explosion.spawn(self, cam.global_position - cam.global_transform.basis.z * 700.0, 70.0, 2)   # 聯軍飛彈命中反物質軍團艦艇：先橘後紫
			KEY_Z:
				auto_boom = not auto_boom
			KEY_F2:
				_save_bench()
			KEY_F3:
				var s := get_viewport().scaling_3d_scale
				get_viewport().scaling_3d_scale = 1.0 if s < 1.0 else 0.75

func _process(dt: float) -> void:
	# 飛行控制
	var basis := Basis.from_euler(Vector3(pitch, yaw, 0.0))
	cam.basis = basis
	var mv := Vector3.ZERO
	if Input.is_key_pressed(KEY_W): mv -= basis.z
	if Input.is_key_pressed(KEY_S): mv += basis.z
	if Input.is_key_pressed(KEY_A): mv -= basis.x
	if Input.is_key_pressed(KEY_D): mv += basis.x
	if Input.is_key_pressed(KEY_E): mv += Vector3.UP
	if Input.is_key_pressed(KEY_Q): mv -= Vector3.UP
	var spd := fly_speed * (4.0 if Input.is_key_pressed(KEY_SHIFT) else 1.0)
	cam.position += mv.normalized() * spd * dt
	_update_beams(dt)
	if auto_boom:
		boom_t -= dt
		if boom_t <= 0.0:
			boom_t = rng.randf_range(0.5, 1.4)
			var f := -cam.global_transform.basis.z
			var off := cam.global_transform.basis.x * rng.randf_range(-700, 700) + cam.global_transform.basis.y * rng.randf_range(-300, 300)
			Explosion.spawn(self, cam.global_position + f * rng.randf_range(900, 2200) + off, rng.randf_range(80, 260), [0, 1, 1, 2][rng.randi() % 4])
	if animate:
		_animate_ships(dt)
	hud_t += dt
	if hud_t > 0.25:
		hud_t = 0.0
		var fps := Engine.get_frames_per_second()
		hud.text = "%s\nFPS %d · %.1f ms · ships %d (x%d)%s\n[PgUp/PgDn] fleet x2 / x0.5   [M] move ships   [F3] 3D scale   [F2] save bench\n[X/C] ally destroyed (orange)  [V/B] Legion destroyed (purple)  [N] missile hit (orange->purple)  [Z] auto  [K] POM  [P] explosion budget  [U/I/O] ship breaks (cruiser / IPC / purple)   [RMB+mouse] look   WASD/QE fly   Shift fast" % [
			RenderingServer.get_video_adapter_name(), fps, 1000.0 / maxf(fps, 1.0), _total_ships(), fleet_mult, "  · MOVING" if animate else ""]
	bench_t += dt
	if bench_t >= 2.0:
		bench_t = 0.0
		bench_log.append("%d,%d,%d" % [Time.get_ticks_msec() / 1000, _total_ships(), Engine.get_frames_per_second()])
	if auto_bench:
		_run_auto_bench(dt)

var _anim_cursor := 0
func _animate_ships(dt: float) -> void:
	# 只在 GDScript 逐艘更新位置是刻意的：用來量「CPU 端移動大量艦艇」的成本（正式版要用 C#／GDExtension／著色器）
	for kind in kinds_data.keys():
		var d: Dictionary = kinds_data[kind]
		var n: int = d["count"]
		var step := maxi(n / 8, 1)
		var from_i: int = _anim_cursor % maxi(n, 1)
		var to_i := mini(from_i + step, n)
		for i in range(from_i, to_i):
			var xf: Transform3D = d["xf"][i]
			xf.origin += (d["vel"][i] as Vector3) * dt * 8.0
			d["xf"][i] = xf
		_write_instances(d, from_i, to_i)
	_anim_cursor += 1

func _run_auto_bench(dt: float) -> void:
	bench_clock += dt
	if bench_clock > 3.0:
		bench_samples.append(float(Engine.get_frames_per_second()))
	if bench_clock >= 10.0:
		var avg := 0.0
		for s in bench_samples: avg += s
		avg /= maxf(bench_samples.size(), 1)
		bench_log.append("BENCH x%d ships=%d avg_fps=%.1f" % [fleet_mult, _total_ships(), avg])
		print(bench_log[-1])
		bench_samples.clear()
		bench_clock = 0.0
		bench_idx += 1
		if bench_idx >= bench_steps.size():
			_save_bench()
			get_tree().quit()
		else:
			fleet_mult = bench_steps[bench_idx]
			_apply_mult()

func _save_bench() -> void:
	var f := FileAccess.open("user://bench.csv", FileAccess.WRITE)
	f.store_line("adapter," + RenderingServer.get_video_adapter_name())
	f.store_line("api," + RenderingServer.get_video_adapter_api_version())
	f.store_line("seconds,ships,fps")
	for l in bench_log: f.store_line(l)
	f.close()
	print("[spike] saved ", ProjectSettings.globalize_path("user://bench.csv"))

func _merged_dummy() -> void:
	pass
