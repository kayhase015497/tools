class_name Explosion
extends Node3D
## 艦艇爆炸（Squadron 42 風）：多團花椰菜火球（錯時冒出）＋短命暖光源＋火花雨＋逆光碎片剪影＋濃煙＋餘燼。
## 用法：Explosion.spawn(parent, 世界座標, 尺寸)   尺寸≈船長的一半（巡洋艦約 200、護衛艦約 45）。

static var _fire_mat: ShaderMaterial
static var _smoke_mat: ShaderMaterial
static var _spark_mat: StandardMaterial3D
static var _debris_mat: StandardMaterial3D

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

static func _quad_particles(mat: Material, amount: int, life: float, size: float, radius: float, vel_min: float, vel_max: float, grow: Array) -> GPUParticles3D:
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
	pm.direction = Vector3(0, 0, 0)
	pm.spread = 180.0
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

## style 0＝橘色火焰（聯軍艦艇被擊毀）、1＝紫色焰（反物質軍團艦艇被擊毀）、2＝先橘後紫（聯軍飛彈命中反物質軍團艦艇）
static func spawn(parent: Node, pos: Vector3, size: float, style: int = 0) -> Node3D:
	_prep()
	var purple := style == 1
	var shift := 1.0 if style == 2 else 0.0
	var root := Node3D.new()
	root.position = pos
	parent.add_child(root)
	# 1) 火團：多團，錯時冒出
	var fire_mat := _fire_mat.duplicate() as ShaderMaterial
	if purple:
		fire_mat.set_shader_parameter("cool_color", Vector3(0.22, 0.04, 0.45))
		fire_mat.set_shader_parameter("mid_color", Vector3(0.62, 0.22, 1.0))
		fire_mat.set_shader_parameter("hot_color", Vector3(2.0, 1.55, 2.4))
	fire_mat.set_shader_parameter("shift", shift)
	var fire := _quad_particles(fire_mat, 12, 1.1, size * 1.5, size * 0.6, 0.0, size * 0.25, [Vector2(0, 0.35), Vector2(0.2, 1.0), Vector2(1, 0.7)])
	root.add_child(fire)
	fire.emitting = true
	# 2) 濃煙：大、慢、壽命長
	var sm_mat := _smoke_mat.duplicate() as ShaderMaterial
	sm_mat.set_shader_parameter("center", pos)
	sm_mat.set_shader_parameter("radius", size * 2.5)
	if purple:
		sm_mat.set_shader_parameter("fire_color", Vector3(0.62, 0.25, 1.0))
		sm_mat.set_shader_parameter("smoke_color", Vector3(0.03, 0.02, 0.05))
	sm_mat.set_shader_parameter("shift", shift)
	var smoke := _quad_particles(sm_mat, 42, 5.5, size * 1.75, size * 0.65, 0.0, size * 0.5, [Vector2(0, 0.25), Vector2(0.25, 0.85), Vector2(1, 1.6)])
	smoke.explosiveness = 0.55
	smoke.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH   # 煙需要依深度排序，才不會前後互相穿透
	root.add_child(smoke)
	smoke.emitting = true
	# 3) 火花雨：速度差很大的細長亮點（橘黃＋粉紫兩種色系）
	for k in range(2):
		var sp := GPUParticles3D.new()
		sp.amount = 320
		sp.lifetime = 1.6
		sp.one_shot = true
		sp.explosiveness = 0.9
		sp.local_coords = false
		sp.transform_align = GPUParticles3D.TRANSFORM_ALIGN_Y_TO_VELOCITY
		var pm := ParticleProcessMaterial.new()
		pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
		pm.emission_sphere_radius = size * 0.4
		pm.direction = Vector3(0, 0, 0)
		pm.spread = 180.0
		pm.initial_velocity_min = size * 0.4
		pm.initial_velocity_max = size * 3.2
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
		qm.size = Vector2(size * 0.006, size * 0.07)
		qm.material = _spark_mat
		sp.draw_pass_1 = qm
		root.add_child(sp)
		if style == 2 and k == 1:   # 先橘後紫：紫色火花晚 0.35 秒才噴出
			get_tree_delay(root, 0.35, func(): sp.emitting = true)
		else:
			sp.emitting = true
	# 3b) 餘燼：慢速、飄很久的小亮點（太空中不會立刻熄滅）
	var em := GPUParticles3D.new()
	em.amount = 160
	em.lifetime = 4.5
	em.one_shot = true
	em.explosiveness = 0.8
	em.local_coords = false
	var ep := ParticleProcessMaterial.new()
	ep.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	ep.emission_sphere_radius = size * 0.6
	ep.direction = Vector3(0, 0, 0)
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
	root.add_child(em)
	em.emitting = true
	# 4) 碎片：黑色薄片，慢速翻滾（逆光剪影；被火光短暫照亮）
	var deb := GPUParticles3D.new()
	deb.amount = 90
	deb.lifetime = 10.0
	deb.one_shot = true
	deb.explosiveness = 1.0
	deb.local_coords = false
	var dm := ParticleProcessMaterial.new()
	dm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	dm.emission_sphere_radius = size * 0.5
	dm.direction = Vector3(0, 0, 0)
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
	root.add_child(deb)
	deb.emitting = true
	# 5) 暖色短命光源：照亮附近艦體金屬（朝向火球的面變亮）
	var l := OmniLight3D.new()
	l.light_color = Color(0.7, 0.32, 1.0) if purple else Color(1.0, 0.55, 0.2)
	l.omni_range = size * 7.0
	l.omni_attenuation = 1.2
	l.light_energy = 0.0
	root.add_child(l)
	if style == 2:   # 光色也由橘轉紫
		var ct := root.create_tween()
		ct.tween_interval(0.25)
		ct.tween_property(l, "light_color", Color(0.7, 0.32, 1.0), 0.6)
	var tw := root.create_tween()
	# 光源強度單位：Godot 點光源是線性衰減、數值要很大才打得亮數百單位外的金屬（實測 300 在 190 單位外才開始明顯）
	tw.tween_property(l, "light_energy", size * 14.0, 0.06)
	tw.tween_property(l, "light_energy", size * 5.0, 0.35).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(l, "light_energy", 0.0, 1.4).set_trans(Tween.TRANS_QUAD)
	# 清理
	var t := root.get_tree().create_timer(14.0)
	t.timeout.connect(root.queue_free)
	return root

static func get_tree_delay(node: Node, sec: float, fn: Callable) -> void:
	node.get_tree().create_timer(sec).timeout.connect(fn)
