class_name Explosion
extends Node3D
## 艦艇爆炸（Squadron 42 風）：多團花椰菜火球（錯時冒出）＋短命暖光源＋火花雨＋逆光碎片剪影＋濃煙＋餘燼。
## 用法：Explosion.spawn(parent, 世界座標, 尺寸)   尺寸≈船長的一半（巡洋艦約 200、護衛艦約 45）。
const Lighting = preload("res://scripts/lighting.gd")

static var _fire_mat: ShaderMaterial
static var _smoke_mat: ShaderMaterial
static var _spark_mat: StandardMaterial3D
static var _debris_mat: StandardMaterial3D

# ───────────── 效能保護 ─────────────
# 1) 距離降級：離鏡頭越遠，粒子數量越少（遠到看不見細節時只留一團火球）
# 2) 同時爆炸上限：超過上限時新爆炸降級成輕量版（火球＋少量火花，不放煙／碎片／光源）
# 3) 動態光源上限：同時最多 MAX_LIGHTS 盞爆炸光源，且只有靠近鏡頭的爆炸才配光源
# 4) 連爆的子爆炸不再連鎖，且在預算吃緊時被取消
static var MAX_ACTIVE_PUB := 14
static var density := 1.0   # 設定選單的「粒子密度」：乘在距離降級係數上
const MAX_LIGHTS := 6
const LOD_NEAR := 6000.0
const LOD_FAR := 24000.0
static var active_count := 0
static var budget_enabled := false   # 預設關閉（想要大混戰更混亂）；按 P 切換。展示牆也會暫時關閉
static var light_count := 0
static var shadow_max := 0     # 由 Lighting 依畫質設定：最近的幾盞爆炸光源投出艦體陰影（貴，所以限量）
static var shadow_count := 0

static func _lod_for(parent: Node, pos: Vector3, size: float) -> float:
	var cam := parent.get_viewport().get_camera_3d() if parent.get_viewport() else null
	if cam == null:
		return 1.0
	var d := cam.global_position.distance_to(pos) / maxf(size / 120.0, 0.6)   # 大爆炸可以在更遠處仍保持細節
	return clampf(1.0 - (d - LOD_NEAR) / (LOD_FAR - LOD_NEAR), 0.4, 1.0)

static func prep_public() -> void:
	_prep()

static func _prep() -> void:
	if _fire_mat != null:
		return
	_fire_mat = ShaderMaterial.new()
	_fire_mat.shader = load("res://shaders/fireball.gdshader")
	_smoke_mat = ShaderMaterial.new()
	_smoke_mat.shader = load("res://shaders/smoke.gdshader")
	_spark_mat = StandardMaterial3D.new()
	_spark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_spark_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_spark_mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	_spark_mat.vertex_color_use_as_albedo = true
	_spark_mat.albedo_color = Color(4.0, 4.0, 4.0, 1.0)
	_debris_mat = StandardMaterial3D.new()
	_debris_mat.albedo_color = Color(0.05, 0.05, 0.06)
	_debris_mat.metallic = 0.7
	_debris_mat.roughness = 0.5

static func _curve(points: Array) -> CurveTexture:
	var c := Curve.new()
	for p in points:
		c.add_point(p as Vector2)
	var t := CurveTexture.new()
	t.curve = c
	return t

static func _quad_particles(mat: Material, amount: int, life: float, size: float, radius: float, vel_min: float, vel_max: float, grow: Array, dir: Vector3 = Vector3.ZERO, spread: float = 180.0) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.one_shot = true
	p.explosiveness = 0.35
	p.randomness = 0.6
	p.local_coords = false
	p.emitting = false
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = radius
	pm.direction = dir
	pm.spread = spread
	pm.initial_velocity_min = vel_min
	pm.initial_velocity_max = vel_max
	pm.gravity = Vector3.ZERO
	pm.damping_min = 2.0
	pm.damping_max = 6.0
	pm.scale_min = size * 0.55
	pm.scale_max = size * 1.05
	pm.scale_curve = _curve(grow)
	p.process_material = pm
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	qm.material = mat
	p.draw_pass_1 = qm
	return p

## 8 種爆焰變體（每種顏色都有）：0 經典、1 連爆、2 噴流、3 閃爆、4 悶燒、5 環形衝擊、6 花瓣（5 道放射火舌）、7 延遲爆（先悶光後炸開）。（原「串燒」「碎片風暴」已依使用者要求刪除）
const VARIANTS := [
	{"fire_n": 12, "fire_life": 1.1, "fire_size": 1.5, "fire_r": 0.6, "fire_v": 0.25, "spark_n": 320, "spark_sp": 1.0, "spark_len": 1.0, "smoke_n": 42, "smoke_size": 1.75, "smoke_life": 5.5, "smoke_v": 0.5, "ember_n": 160, "deb_n": 90, "light": 1.0, "chain": 0, "jet": false},
	{"fire_n": 8, "fire_life": 1.0, "fire_size": 1.15, "fire_r": 0.5, "fire_v": 0.25, "spark_n": 220, "spark_sp": 1.0, "spark_len": 0.9, "smoke_n": 30, "smoke_size": 1.5, "smoke_life": 5.0, "smoke_v": 0.45, "ember_n": 120, "deb_n": 70, "light": 0.9, "chain": 3, "jet": false},
	{"fire_n": 14, "fire_life": 1.0, "fire_size": 1.05, "fire_r": 0.25, "fire_v": 1.3, "spark_n": 440, "spark_sp": 1.7, "spark_len": 1.3, "smoke_n": 34, "smoke_size": 1.45, "smoke_life": 5.0, "smoke_v": 0.9, "ember_n": 110, "deb_n": 80, "light": 1.0, "chain": 0, "jet": true},
	{"fire_n": 6, "fire_life": 0.7, "fire_size": 2.2, "fire_r": 0.4, "fire_v": 0.3, "spark_n": 700, "spark_sp": 1.5, "spark_len": 1.2, "smoke_n": 16, "smoke_size": 1.25, "smoke_life": 3.2, "smoke_v": 0.5, "ember_n": 90, "deb_n": 50, "light": 1.8, "chain": 0, "jet": false},
	{"fire_n": 16, "fire_life": 1.9, "fire_size": 1.25, "fire_r": 0.7, "fire_v": 0.2, "spark_n": 170, "spark_sp": 0.75, "spark_len": 0.9, "smoke_n": 52, "smoke_size": 2.0, "smoke_life": 6.0, "smoke_v": 0.35, "ember_n": 340, "deb_n": 140, "light": 0.8, "chain": 0, "jet": false},
	# 5 環形衝擊：火球與火花排成向外擴張的環，中央較小
	{"fire_n": 8, "fire_life": 1.0, "fire_size": 1.2, "fire_r": 0.3, "fire_v": 0.2, "spark_n": 260, "spark_sp": 1.0, "spark_len": 1.0, "smoke_n": 34, "smoke_size": 1.6, "smoke_life": 5.0, "smoke_v": 0.5, "ember_n": 140, "deb_n": 80, "light": 1.1, "chain": 0, "jet": false, "ring": true},
	# 7 花瓣：5 道細火舌向四面八方放射
	{"fire_n": 10, "fire_life": 1.0, "fire_size": 1.2, "fire_r": 0.35, "fire_v": 0.6, "spark_n": 160, "spark_sp": 1.3, "spark_len": 1.3, "smoke_n": 36, "smoke_size": 1.55, "smoke_life": 5.2, "smoke_v": 0.6, "ember_n": 120, "deb_n": 80, "light": 1.0, "chain": 0, "jet": false, "jets": 5},
	# 8 延遲爆：先一小團悶光，約 0.4 秒後才整個炸開（強光＋大量火花）
	{"fire_n": 14, "fire_life": 1.1, "fire_size": 1.8, "fire_r": 0.6, "fire_v": 0.35, "spark_n": 520, "spark_sp": 1.3, "spark_len": 1.1, "smoke_n": 44, "smoke_size": 1.8, "smoke_life": 5.5, "smoke_v": 0.55, "ember_n": 180, "deb_n": 100, "light": 1.4, "chain": 0, "jet": false, "delay": 0.4},
]

## style 0＝橘色火焰（聯軍艦艇被擊毀）、1＝紫色焰（反物質軍團艦艇被擊毀）、2＝先橘後紫（聯軍飛彈命中反物質軍團艦艇）
## variant：0~4 指定變體，-1＝隨機；每次還會對顏色、尺寸做小幅亂數，所以同一種也不會長得一樣。
static func spawn(parent: Node, pos: Vector3, size: float, style: int = 0, variant: int = -1, allow_chain: bool = true) -> Node3D:
	_prep()
	var purple := style == 1
	var shift := 1.0 if style == 2 else 0.0
	var lod := clampf(_lod_for(parent, pos, size) * density, 0.15, 1.0)
	var lite := budget_enabled and active_count >= MAX_ACTIVE_PUB
	if lite:
		lod = minf(lod, 0.3)
	var vi := variant if variant >= 0 else randi() % VARIANTS.size()
	var V: Dictionary = VARIANTS[vi].duplicate()
	for key in ["fire_n", "spark_n", "smoke_n", "ember_n", "deb_n"]:
		V[key] = maxi(int(float(V[key]) * (lod if key != "fire_n" else maxf(lod, 0.5))), 2)
	if lite:
		V["smoke_n"] = 0
		V["deb_n"] = 0
		V["ember_n"] = 0
	active_count += 1
	size *= randf_range(0.88, 1.15)
	var jd := Vector3(randf_range(-1, 1), randf_range(-0.6, 1), randf_range(-1, 1)).normalized()   # 噴流方向
	var jet: bool = V["jet"]
	var ring: bool = V.get("ring", false)
	var jets: int = V.get("jets", 0)
	var delay: float = V.get("delay", 0.0)
	var root := Node3D.new()
	root.position = pos
	parent.add_child(root)
	# 1) 火團：多團，錯時冒出（顏色小幅亂數）
	var fire_mat := _fire_mat.duplicate() as ShaderMaterial
	if purple:
		fire_mat.set_shader_parameter("cool_color", Vector3(randf_range(0.15, 0.3), 0.04, randf_range(0.35, 0.55)))
		fire_mat.set_shader_parameter("mid_color", Vector3(randf_range(0.5, 0.75), randf_range(0.15, 0.3), randf_range(0.9, 1.0)))
		fire_mat.set_shader_parameter("hot_color", Vector3(randf_range(1.8, 2.2), randf_range(1.4, 1.7), 2.4))
	else:
		fire_mat.set_shader_parameter("cool_color", Vector3(randf_range(0.45, 0.65), randf_range(0.06, 0.14), 0.04))
		fire_mat.set_shader_parameter("mid_color", Vector3(1.0, randf_range(0.28, 0.55), randf_range(0.04, 0.12)))
	fire_mat.set_shader_parameter("shift", shift)
	var fire := _quad_particles(fire_mat, V["fire_n"], V["fire_life"], size * V["fire_size"], size * V["fire_r"], 0.0, size * V["fire_v"], [Vector2(0, 0.35), Vector2(0.2, 1.0), Vector2(1, 0.7)], (jd if jet else Vector3.ZERO), (28.0 if jet else 180.0))
	root.add_child(fire)
	if delay > 0.0:
		get_tree_delay(root, delay, func(): fire.emitting = true)
		var pre := _quad_particles(fire_mat, 2, 0.5, size * 0.5, size * 0.1, 0.0, 0.0, [Vector2(0, 0.5), Vector2(1, 0.8)])   # 先出現一小團悶光
		root.add_child(pre)
		pre.emitting = true
	else:
		fire.emitting = true
	if ring:   # 環形：一圈向外擴張的火團
		var rf := _quad_particles(fire_mat, 10, 0.9, size * 0.8, size * 0.1, 0.0, 0.0, [Vector2(0, 0.4), Vector2(1, 0.9)])
		var rpm := rf.process_material as ParticleProcessMaterial
		rpm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
		rpm.emission_ring_axis = jd
		rpm.emission_ring_radius = size * 0.3
		rpm.emission_ring_inner_radius = size * 0.2
		rpm.emission_ring_height = size * 0.05
		rpm.radial_accel_min = size * 2.5
		rpm.radial_accel_max = size * 3.5
		root.add_child(rf)
		rf.emitting = true
	# 2) 濃煙：黑、厚、短命（5~6 秒）
	var sm_mat := _smoke_mat.duplicate() as ShaderMaterial
	sm_mat.set_shader_parameter("center", pos)
	sm_mat.set_shader_parameter("radius", size * 2.5)
	if purple:
		sm_mat.set_shader_parameter("fire_color", Vector3(0.62, 0.25, 1.0))
		sm_mat.set_shader_parameter("smoke_color", Vector3(0.03, 0.02, 0.05))
	sm_mat.set_shader_parameter("shift", shift)
	var smoke: GPUParticles3D = null
	if V["smoke_n"] > 0:
		smoke = _quad_particles(sm_mat, V["smoke_n"], V["smoke_life"], size * V["smoke_size"], size * 0.65, 0.0, size * V["smoke_v"], [Vector2(0, 0.25), Vector2(0.25, 0.85), Vector2(1, 1.6)], (jd if jet else Vector3.ZERO), (40.0 if jet else 180.0))
		smoke.explosiveness = 0.55
		smoke.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH
		root.add_child(smoke)
		smoke.emitting = true
	# 3) 火花雨：速度差很大的細長亮點（橘黃＋粉紫兩種色系）。每個發射器：方向、擴散角、顏色組、數量
	var emitters: Array = []
	if jets > 0:   # 花瓣：多道細火舌
		for j in range(jets):
			emitters.append({"dir": Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)).normalized(), "spread": 14.0, "k": j % 2, "amt": int(V["spark_n"] * 1.3 / jets) + 20})
	else:
		emitters.append({"dir": (jd if jet else Vector3.ZERO), "spread": (22.0 if jet else 180.0), "k": 0, "amt": int(V["spark_n"])})
		emitters.append({"dir": (jd if jet else Vector3.ZERO), "spread": (22.0 if jet else 180.0), "k": 1, "amt": int(V["spark_n"] * 0.8)})
	for em_i in range(emitters.size()):
		var E: Dictionary = emitters[em_i]
		var k: int = E["k"]
		var sp := GPUParticles3D.new()
		sp.amount = E["amt"]
		sp.lifetime = 1.6
		sp.one_shot = true
		sp.explosiveness = 0.9
		sp.local_coords = false
		sp.transform_align = GPUParticles3D.TRANSFORM_ALIGN_Y_TO_VELOCITY
		var pm := ParticleProcessMaterial.new()
		if ring and k == 0:   # 環形：火花沿一圈向外擴張
			pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
			pm.emission_ring_axis = jd
			pm.emission_ring_radius = size * 0.3
			pm.emission_ring_inner_radius = size * 0.25
			pm.emission_ring_height = size * 0.04
			pm.radial_accel_min = size * 5.0
			pm.radial_accel_max = size * 8.0
			pm.direction = Vector3.ZERO
			pm.spread = 8.0
			pm.initial_velocity_min = size * 0.3
			pm.initial_velocity_max = size * 0.8
		else:
			pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
			pm.emission_sphere_radius = size * 0.4
			pm.direction = E["dir"]
			pm.spread = E["spread"]
			pm.initial_velocity_min = size * 0.4 * V["spark_sp"]
			pm.initial_velocity_max = size * 3.2 * V["spark_sp"]
		pm.damping_min = size * 0.3
		pm.damping_max = size * 1.1
		pm.scale_min = 0.6
		pm.scale_max = 1.5
		var g := Gradient.new()
		var sp_purple := purple or (style == 2 and k == 1)
		if sp_purple:   # 紫色焰：粉紫白 + 洋紅紫
			if k == 0:
				g.set_color(0, Color(0.95, 0.8, 1.0, 1.0)); g.set_color(1, Color(0.7, 0.2, 1.0, 0.0))
			else:
				g.set_color(0, Color(1.0, 0.6, 0.95, 1.0)); g.set_color(1, Color(0.55, 0.1, 0.9, 0.0))
		elif k == 0:
			g.set_color(0, Color(1.0, 0.85, 0.5, 1.0)); g.set_color(1, Color(1.0, 0.3, 0.05, 0.0))
		else:
			g.set_color(0, Color(0.85, 0.7, 1.0, 1.0)); g.set_color(1, Color(0.5, 0.2, 1.0, 0.0))
		var gt := GradientTexture1D.new()
		gt.gradient = g
		pm.color_ramp = gt
		sp.process_material = pm
		var qm := QuadMesh.new()
		qm.size = Vector2(size * 0.006, size * 0.07 * V["spark_len"])
		qm.material = _spark_mat
		sp.draw_pass_1 = qm
		root.add_child(sp)
		var sdelay := delay + (0.35 if (style == 2 and k == 1) else 0.0)   # 先橘後紫：紫色火花晚 0.35 秒；延遲爆：整體延後
		if sdelay > 0.0:
			get_tree_delay(root, sdelay, func(): sp.emitting = true)
		else:
			sp.emitting = true
	# 3b) 餘燼：慢速、飄很久的小亮點
	var em := GPUParticles3D.new()
	em.amount = maxi(V["ember_n"], 1)
	em.lifetime = 4.5
	em.one_shot = true
	em.explosiveness = 0.8
	em.local_coords = false
	var ep := ParticleProcessMaterial.new()
	ep.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	ep.emission_sphere_radius = size * 0.6
	ep.direction = Vector3.ZERO
	ep.spread = 180.0
	ep.initial_velocity_min = size * 0.05
	ep.initial_velocity_max = size * 0.5
	ep.damping_min = 0.3
	ep.damping_max = 1.0
	ep.scale_min = 0.5
	ep.scale_max = 1.2
	var eg := Gradient.new()
	eg.set_color(0, Color(0.9, 0.5, 1.0, 1.0) if purple else Color(1.0, 0.6, 0.2, 1.0))
	eg.set_color(1, Color(0.5, 0.05, 0.9, 0.0) if purple else Color(0.9, 0.1, 0.02, 0.0))
	var egt := GradientTexture1D.new()
	egt.gradient = eg
	ep.color_ramp = egt
	em.process_material = ep
	var eq := QuadMesh.new()
	eq.size = Vector2(size * 0.03, size * 0.03)
	eq.material = _spark_mat
	em.draw_pass_1 = eq
	if V["ember_n"] > 0:
		root.add_child(em)
		em.emitting = true
	# 4) 碎片：黑色薄片，慢速翻滾
	var deb := GPUParticles3D.new()
	deb.amount = maxi(V["deb_n"], 1)
	deb.lifetime = 10.0
	deb.one_shot = true
	deb.explosiveness = 1.0
	deb.local_coords = false
	var dm := ParticleProcessMaterial.new()
	dm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	dm.emission_sphere_radius = size * 0.5
	dm.direction = Vector3.ZERO
	dm.spread = 180.0
	dm.initial_velocity_min = size * 0.15
	dm.initial_velocity_max = size * 0.9
	dm.angular_velocity_min = -220.0
	dm.angular_velocity_max = 220.0
	dm.scale_min = size * 0.025
	dm.scale_max = size * 0.12
	deb.process_material = dm
	var bm := PrismMesh.new()
	bm.size = Vector3(1.0, 0.12, 0.8)
	bm.material = _debris_mat
	deb.draw_pass_1 = bm
	if V["deb_n"] > 0:
		root.add_child(deb)
		deb.emitting = true
	# 5) 短命光源：照亮附近艦體金屬
	var l := OmniLight3D.new()
	var want_light := (light_count < MAX_LIGHTS or not budget_enabled) and lod > 0.4
	if want_light:
		light_count += 1
	l.light_color = Color(0.7, 0.32, 1.0) if purple else Color(1.0, 0.55, 0.2)
	l.omni_range = size * 7.0
	l.omni_attenuation = 1.2
	l.light_energy = 0.0
	if want_light and shadow_count < shadow_max and lod > 0.85:
		shadow_count += 1
		l.shadow_enabled = true
		l.shadow_caster_mask = Lighting.SHADOW_MASK
		l.shadow_normal_bias = 1.5
		get_tree_delay(parent, 2.2 + delay, func(): shadow_count = maxi(shadow_count - 1, 0))
	if want_light:
		root.add_child(l)
	if style == 2 and want_light:   # 光色也由橘轉紫
		var ct := root.create_tween()
		ct.tween_interval(0.25)
		ct.tween_property(l, "light_color", Color(0.7, 0.32, 1.0), 0.6)
	var lm: float = V["light"]
	var tw := root.create_tween()
	if not want_light:
		tw.kill()
	elif delay > 0.0:
		tw.tween_interval(delay)
	# Godot 點光源是線性衰減，數值要很大才打得亮數百單位外的金屬
	if want_light:
		tw.tween_property(l, "light_energy", size * 14.0 * lm, 0.06)
		tw.tween_property(l, "light_energy", size * 5.0 * lm, 0.35).set_trans(Tween.TRANS_QUAD)
		tw.tween_property(l, "light_energy", 0.0, 1.4).set_trans(Tween.TRANS_QUAD)
		get_tree_delay(root, 2.2 + delay, func(): light_count = maxi(light_count - 1, 0))
	# 連爆：接連 N 次小爆（位置散布在附近，亂數延遲）
	if allow_chain and int(V["chain"]) > 0 and not lite and lod > 0.5:
		for i in range(int(V["chain"])):
			var off := Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * size * 0.9
			var cdelay := 0.16 * (i + 1) + randf_range(0.0, 0.18)
			get_tree_delay(root, cdelay, func(): Explosion.spawn(parent, pos + off, size * 0.55, style, [0, 3][randi() % 2], false))
	# 清理
	get_tree_delay(root, 5.0, func(): active_count = maxi(active_count - 1, 0))   # 預算只算前 5 秒（爆炸最耗時的階段）
	var t := root.get_tree().create_timer(14.0)
	t.timeout.connect(root.queue_free)
	return root

static func get_tree_delay(node: Node, sec: float, fn: Callable) -> void:
	node.get_tree().create_timer(sec).timeout.connect(fn)
