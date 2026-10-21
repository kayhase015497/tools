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

static func spawn(parent: Node, pos: Vector3, size: float) -> Node3D:
	_prep()
	var root := Node3D.new()
	root.position = pos
	parent.add_child(root)
	# 1) 火團：多團，錯時冒出
	var fire := _quad_particles(_fire_mat, 14, 1.7, size * 1.7, size * 0.7, 0.0, size * 0.25, [Vector2(0, 0.35), Vector2(0.25, 1.0), Vector2(1, 1.25)])
	root.add_child(fire)
	fire.emitting = true
	# 2) 濃煙：大、慢、壽命長
	var smoke := _quad_particles(_smoke_mat, 18, 9.0, size * 2.2, size * 0.6, 0.0, size * 0.18, [Vector2(0, 0.3), Vector2(0.3, 0.9), Vector2(1, 1.5)])
	root.add_child(smoke)
	smoke.emitting = true
	# 3) 火花雨：速度差很大的細長亮點（橘黃＋粉紫兩種色系）
	for k in range(2):
		var sp := GPUParticles3D.new()
		sp.amount = 140
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
		if k == 0:
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
		sp.emitting = true
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
	l.light_color = Color(1.0, 0.55, 0.2)
	l.omni_range = size * 6.0
	l.omni_attenuation = 1.4
	l.light_energy = 0.0
	root.add_child(l)
	var tw := root.create_tween()
	tw.tween_property(l, "light_energy", size * 0.9, 0.06)
	tw.tween_property(l, "light_energy", size * 0.35, 0.35).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(l, "light_energy", 0.0, 1.4).set_trans(Tween.TRANS_QUAD)
	# 清理
	var t := root.get_tree().create_timer(14.0)
	t.timeout.connect(root.queue_free)
	return root
