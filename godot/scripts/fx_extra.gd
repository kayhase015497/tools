extends Node3D
## 戰場特效（Build 18）：引擎尾焰、護盾泡、受損艦／飛彈的持續煙、熱扭曲環。
## 由 battle.gd 建立並呼叫：begin_trails() → add_trail()… → end_trails()（每幀）、update(dt)、shield_hit()、shield_break()、heat_ring()。

var battle   # battle.gd
var trail_mm: MultiMesh
var trail_n := 0
var shields: Array = []
var shield_i := 0
var emitters: Array = []
var heats: Array = []
var heat_i := 0
const SHIELD_POOL := 20
const EMITTERS := 16
const HEAT_POOL := 10

func _ready() -> void:
	trail_mm = MultiMesh.new()
	trail_mm.transform_format = MultiMesh.TRANSFORM_3D
	trail_mm.use_colors = true
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	var tm := ShaderMaterial.new()
	tm.shader = load("res://shaders/trail.gdshader")
	q.material = tm
	trail_mm.mesh = q
	trail_mm.instance_count = 3000
	trail_mm.visible_instance_count = 0
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = trail_mm
	mi.custom_aabb = AABB(Vector3(-40000, -40000, -40000), Vector3(80000, 80000, 80000))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	# 護盾泡：球殼池
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 48
	sm.rings = 24
	for i in range(SHIELD_POOL):
		var n := MeshInstance3D.new()
		n.mesh = sm
		var m := ShaderMaterial.new()
		m.shader = load("res://shaders/shield.gdshader")
		n.material_override = m
		n.visible = false
		n.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(n)
		shields.append({"n": n, "m": m, "age": 1.0, "speed": 1.4, "on": false})
	# 持續煙發射器池（受損艦、飛彈）
	Explosion.prep_public()
	for i in range(EMITTERS):
		var mat := Explosion._smoke_mat.duplicate() as ShaderMaterial
		mat.set_shader_parameter("fire_glow", 0.15)
		mat.set_shader_parameter("radius", 60.0)
		var p := Explosion._quad_particles(mat, 26, 3.2, 8.0, 1.0, 0.0, 3.0, [Vector2(0, 0.3), Vector2(0.3, 0.9), Vector2(1, 1.5)])
		p.one_shot = false
		p.explosiveness = 0.0
		p.randomness = 0.4
		p.emitting = false
		p.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH
		add_child(p)
		emitters.append({"p": p, "mat": mat, "size": -1.0})
	# 熱扭曲環
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	for i in range(HEAT_POOL):
		var n2 := MeshInstance3D.new()
		n2.mesh = qm
		var m2 := ShaderMaterial.new()
		m2.shader = load("res://shaders/heat.gdshader")
		n2.material_override = m2
		n2.visible = false
		n2.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(n2)
		heats.append({"n": n2, "m": m2, "t": 1.0, "dur": 1.0, "on": false})

# ───────────── 尾焰／尾跡 ─────────────
func begin_trails() -> void:
	trail_n = 0

# from_pos＝引擎端；dir＝船首方向（尾跡向後拉）；length／width 單位公尺
func add_trail(from_pos: Vector3, dir: Vector3, length: float, width: float, col: Color) -> void:
	if trail_n >= trail_mm.instance_count:
		return
	var center := from_pos - dir * length * 0.5
	var up := Vector3.UP if absf(dir.y) < 0.99 else Vector3.RIGHT
	trail_mm.set_instance_transform(trail_n, Transform3D(Basis(dir * length, up * width, Vector3.BACK), center))
	trail_mm.set_instance_color(trail_n, col)
	trail_n += 1

func end_trails() -> void:
	trail_mm.visible_instance_count = trail_n

# ───────────── 護盾泡 ─────────────
func shield_hit(s, world_pos: Vector3, power: float = 1.0, speed: float = 1.5) -> void:
	var e: Dictionary = shields[shield_i]
	shield_i = (shield_i + 1) % SHIELD_POOL
	var n: MeshInstance3D = e["n"]
	n.visible = true
	n.global_transform = Transform3D(Basis.IDENTITY * (s.rad * 1.12), s.pos)
	var m: ShaderMaterial = e["m"]
	m.set_shader_parameter("hit_dir", (world_pos - s.pos).normalized())
	m.set_shader_parameter("age", 0.0)
	m.set_shader_parameter("power", power)
	m.set_shader_parameter("shield_color", Vector3(0.4, 0.7, 1.0) if s.side == 0 else Vector3(0.7, 0.4, 1.0))
	e["age"] = 0.0
	e["speed"] = speed
	e["on"] = true
	e["ship"] = s

func shield_break(s) -> void:
	shield_hit(s, s.pos + Vector3(0, s.rad, 0), 2.5, 0.8)

# ───────────── 熱扭曲 ─────────────
func heat_ring(pos: Vector3, size: float) -> void:
	var e: Dictionary = heats[heat_i]
	heat_i = (heat_i + 1) % HEAT_POOL
	var n: MeshInstance3D = e["n"]
	n.visible = true
	n.global_position = pos
	n.scale = Vector3.ONE * size * 4.0
	e["t"] = 0.0
	e["dur"] = clampf(0.5 + size * 0.004, 0.6, 1.6)
	e["on"] = true
	(e["m"] as ShaderMaterial).set_shader_parameter("strength", clampf(0.012 + size * 0.0001, 0.012, 0.035))

# ───────────── 每幀 ─────────────
func update(dt: float) -> void:
	for e in shields:
		if not e["on"]:
			continue
		e["age"] += dt * float(e["speed"])
		if e["age"] >= 1.0:
			e["on"] = false
			(e["n"] as MeshInstance3D).visible = false
			continue
		(e["m"] as ShaderMaterial).set_shader_parameter("age", e["age"])
		var s = e.get("ship")
		if s != null and not s.dead:
			(e["n"] as MeshInstance3D).global_position = s.pos   # 護盾泡跟著艦艇
	for e in heats:
		if not e["on"]:
			continue
		e["t"] += dt / float(e["dur"])
		if e["t"] >= 1.0:
			e["on"] = false
			(e["n"] as MeshInstance3D).visible = false
			continue
		(e["m"] as ShaderMaterial).set_shader_parameter("t", e["t"])
	_update_smoke()

func _update_smoke() -> void:
	var cam_pos: Vector3 = battle.cam.global_position
	var cands: Array = []   # [優先度（距離越小越優先）, 位置, 尺寸, 強度]
	for list in [battle.allies, battle.enemies]:
		for s in list:
			if s.dead or s.is_player or float(s.d["hp"]) < 2500.0:
				continue
			var dm: float = 1.0 - s.hp / s.hp_max
			if dm < 0.35:
				continue
			var dist: float = cam_pos.distance_to(s.pos)
			if dist > 14000.0:
				continue
			cands.append([dist, s.pos + Vector3(0, s.rad * 0.15, 0), s.rad * 0.22, clampf(dm, 0.3, 1.0), s.side])
	for b in battle.shots:
		if b.homing:
			var dist2: float = cam_pos.distance_to(b.pos)
			if dist2 < 7000.0:
				cands.append([dist2 * 0.5, b.pos, 3.0 if not b.big else 6.0, 1.0, b.side, true])
	cands.sort_custom(func(a, b): return a[0] < b[0])
	var budget := int(EMITTERS * clampf(float(battle.opt.get("particle_density", 1.0)), 0.25, 1.0))
	for i in range(EMITTERS):
		var e: Dictionary = emitters[i]
		var p: GPUParticles3D = e["p"]
		if i >= budget or i >= cands.size():
			p.emitting = false
			continue
		var c: Array = cands[i]
		var sz: float = c[2]
		p.global_position = c[1]
		if absf(sz - float(e["size"])) > 0.01:
			e["size"] = sz
			var pm := p.process_material as ParticleProcessMaterial
			pm.scale_min = sz * 0.55
			pm.scale_max = sz * 1.05
			pm.initial_velocity_max = maxf(sz * 0.4, 1.0)
			pm.emission_sphere_radius = maxf(sz * 0.2, 0.3)
			p.lifetime = 2.2 if c.size() > 5 else 3.6
		p.amount_ratio = float(c[3])
		(e["mat"] as ShaderMaterial).set_shader_parameter("center", c[1])
		(e["mat"] as ShaderMaterial).set_shader_parameter("radius", maxf(sz * 6.0, 20.0))
		p.emitting = true
