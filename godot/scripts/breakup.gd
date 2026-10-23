class_name Breakup
extends Node3D
## 艦艇斷裂：血量歸零後，用 Blender 預先切好的斷片 GLB（tools-src/blender/space-war/fracture_ships.py）取代完整艦。
## 每塊以簡單積分運動（初速＝艦速＋由艦心向外的分離速度，亂數角速度），斷面（break_face 材質）燃燒餘燼 1→0（約 7 秒），
## 沿斷面放餘燼粒子；餘燼顏色依陣營（聯軍橘、軍團紫）。
## 用法：Breakup.spawn(parent, ship_kind, ship_xform_without_center_offset, ship_velocity, style, hull_materials)
##   hull_materials：{材質名: ShaderMaterial}（艦隊已轉成 POM 的材質），斷片外表沿用，與完整艦一致。
const Lighting = preload("res://scripts/lighting.gd")

const FRAG_DIR := "res://assets/models/frag/"
static var _break_mat: ShaderMaterial
static var _plans := {}

class Chunk:
	var node: Node3D
	var vel: Vector3
	var ang: Vector3

# ───── 殘骸效能保護 ─────
# 同時存在的斷裂組數上限（超過時最舊的一組在 1.2 秒內縮小消失）；離鏡頭很遠的斷裂組直接略過餘燼／火焰／煙；
# 存活 20 秒後最後 4 秒縮小淡出，大戰後不會到處飄著殘骸。
static var MAX_ACTIVE := 14
static var active: Array = []
const LIFETIME := 60.0
const FAR_NO_FX := 16000.0
const FAR_REMOVE := 40000.0

var chunks: Array[Chunk] = []
var age := 0.0
var killed := -1.0
var fx_nodes: Array = []
var fx_on := true

static func _get_break_material(ember: Color) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/ship_break.gdshader")
	m.set_shader_parameter("albedo_color", Color(0.04, 0.035, 0.035))
	m.set_shader_parameter("height_tex", load("res://assets/models/frag/break_height.png"))
	m.set_shader_parameter("roughness", 0.95)
	m.set_shader_parameter("metallic", 0.25)
	m.set_shader_parameter("parallax_depth", 0.09)
	m.set_shader_parameter("lod_distance", 6000.0)
	m.set_shader_parameter("wear", 0.9)
	m.set_shader_parameter("bump_strength", 1.8)
	m.set_shader_parameter("ember_color", Vector3(ember.r, ember.g, ember.b))
	m.set_shader_parameter("ember_gain", 4.5)
	m.set_shader_parameter("burn_override", 1.0)
	return m

static func _collect(n: Node, out: Array) -> void:
	if n is MeshInstance3D:
		out.append(n)
	for c in n.get_children():
		_collect(c, out)

static func spawn(parent: Node, kind: String, xf: Transform3D, ship_vel: Vector3, style: int, hull_mats: Dictionary, plan: String = "") -> Breakup:
	var plans := ["A", "B", "C"]
	if plan == "":
		plan = plans[randi() % plans.size()]
	var path := FRAG_DIR + kind + "_frag_" + plan + ".glb"
	if not ResourceLoader.exists(path):
		return null
	var ember := Color(0.72, 0.3, 1.0) if style == 1 else Color(1.0, 0.3, 0.06)
	var root := Breakup.new()
	parent.add_child(root)   # 先放在原點以模型座標處理，最後才套上艦艇的世界變換
	var sc := xf.basis.get_scale().x
	var cam := parent.get_viewport().get_camera_3d() if parent.get_viewport() else null
	if cam != null and cam.global_position.distance_to(xf.origin) > FAR_REMOVE:
		root.queue_free()
		return null
	active.append(root)
	while active.size() > MAX_ACTIVE:
		var old = active.pop_front()
		if is_instance_valid(old):
			(old as Breakup).kill()
	var scene := (load(path) as PackedScene).instantiate() as Node3D
	root.add_child(scene)
	var meshes: Array = []
	_collect(scene, meshes)
	var groups := {}
	for mi in meshes:
		var nm: String = (mi as Node).name
		var key := nm.substr(0, nm.find("_")) if nm.find("_") > 0 else nm   # FRAG0_xxx → FRAG0
		if not groups.has(key):
			groups[key] = []
		groups[key].append(mi)
	var bmat := _get_break_material(ember)
	# 以所有斷片的總 AABB 中心當作艦心
	var total := AABB()
	var first := true
	for mi in meshes:
		var a: AABB = (mi as MeshInstance3D).global_transform * (mi as MeshInstance3D).get_aabb()
		total = a if first else total.merge(a)
		first = false
	var ship_center := total.get_center()
	var span_w := maxf(total.size.length() * sc, 1.0)   # 世界尺度的艦體尺寸
	for key in groups.keys():
		var holder := Node3D.new()
		var box := AABB()
		var f2 := true
		for mi in groups[key]:
			var a2: AABB = (mi as MeshInstance3D).global_transform * (mi as MeshInstance3D).get_aabb()
			box = a2 if f2 else box.merge(a2)
			f2 = false
		var cen := box.get_center()
		root.add_child(holder)
		holder.position = cen
		for mi in groups[key]:
			var mnode := mi as MeshInstance3D
			var gt := mnode.global_transform
			mnode.get_parent().remove_child(mnode)
			holder.add_child(mnode)
			mnode.transform = Transform3D(Basis.IDENTITY, -cen) * gt
			var mesh := mnode.mesh.duplicate() as Mesh
			for si in range(mesh.get_surface_count()):
				var sm := mesh.surface_get_material(si)
				var nm2: String = sm.resource_name if sm != null else ""
				if nm2 == "break_face":
					mesh.surface_set_material(si, bmat)
				elif hull_mats.has(nm2):
					mesh.surface_set_material(si, hull_mats[nm2])
			mnode.mesh = mesh
		var c := Chunk.new()
		c.node = holder
		var out_dir := (cen - ship_center)
		var span := span_w
		var vw := ship_vel + (xf.basis * out_dir).normalized() * span * randf_range(0.012, 0.03) + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * span * 0.004
		c.vel = xf.basis.inverse() * vw   # 世界速度 → 模型座標（父節點有縮放）
		c.ang = Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * randf_range(0.12, 0.45)
		root.chunks.append(c)
		# 斷面餘燼粒子：由塊質心向外飄，持續 ~3 秒
		var ep := GPUParticles3D.new()
		ep.amount = 70
		ep.lifetime = 3.2
		ep.explosiveness = 0.0
		ep.local_coords = false
		var pm := ParticleProcessMaterial.new()
		pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		pm.emission_box_extents = box.size * sc * 0.35
		pm.direction = Vector3.ZERO
		pm.spread = 180.0
		pm.initial_velocity_min = span * 0.002
		pm.initial_velocity_max = span * 0.012
		pm.gravity = Vector3.ZERO
		pm.scale_min = 0.5
		pm.scale_max = 1.3
		var g := Gradient.new()
		g.set_color(0, Color(ember.r, ember.g + 0.25, ember.b + 0.1, 1.0))
		g.set_color(1, Color(ember.r * 0.5, ember.g * 0.1, ember.b * 0.5, 0.0))
		var gt := GradientTexture1D.new()
		gt.gradient = g
		pm.color_ramp = gt
		ep.process_material = pm
		var qm := QuadMesh.new()
		qm.size = Vector2(span * 0.006, span * 0.006)
		var sm := StandardMaterial3D.new()
		sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		sm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		sm.vertex_color_use_as_albedo = true
		sm.albedo_color = Color(4, 4, 4, 1)
		qm.material = sm
		ep.draw_pass_1 = qm
		holder.add_child(ep)
		ep.emitting = true
		root.fx_nodes.append(ep)
		# 火焰：斷面持續噴出的小火舌（用爆炸的火球著色器，聯軍橘／軍團紫），前 ~4 秒
		var fmat := Explosion._fire_mat.duplicate() as ShaderMaterial if Explosion._fire_mat != null else null
		if fmat == null:
			Explosion._prep()
			fmat = Explosion._fire_mat.duplicate() as ShaderMaterial
		if style == 1:
			fmat.set_shader_parameter("cool_color", Vector3(0.22, 0.04, 0.45))
			fmat.set_shader_parameter("mid_color", Vector3(0.62, 0.22, 1.0))
			fmat.set_shader_parameter("hot_color", Vector3(2.0, 1.55, 2.4))
		fmat.set_shader_parameter("intensity", 1.6)
		var flame := Explosion._quad_particles(fmat, 14, 1.1, span * 0.09, box.size.length() * sc * 0.18, 0.0, span * 0.012, [Vector2(0, 0.4), Vector2(0.3, 1.0), Vector2(1, 0.2)])
		flame.one_shot = false
		flame.explosiveness = 0.0
		flame.randomness = 0.8
		holder.add_child(flame)
		flame.emitting = true
		root.fx_nodes.append(flame)
		get_tree_delay_node(root, 13.0, func(): if is_instance_valid(flame): flame.emitting = false)
		# 細煙尾跡：黑色細煙，跟著斷片
		var smat := Explosion._smoke_mat.duplicate() as ShaderMaterial
		smat.set_shader_parameter("center", cen)
		smat.set_shader_parameter("radius", span * 0.5)
		if style == 1:
			smat.set_shader_parameter("fire_color", Vector3(0.62, 0.25, 1.0))
			smat.set_shader_parameter("smoke_color", Vector3(0.03, 0.02, 0.05))
		smat.set_shader_parameter("shift", 0.0)
		var trail := Explosion._quad_particles(smat, 12, 4.0, span * 0.1, box.size.length() * sc * 0.1, 0.0, span * 0.006, [Vector2(0, 0.3), Vector2(0.4, 1.0), Vector2(1, 1.4)])
		trail.one_shot = false
		trail.explosiveness = 0.0
		trail.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH
		holder.add_child(trail)
		trail.emitting = true
		root.fx_nodes.append(trail)
	root.transform = xf
	Lighting.mark_caster(root)   # 斷片投影（粒子不受影響）
	# 斷面燃燒餘燼：1 → 0（約 7 秒）
	var tw := root.create_tween()
	tw.tween_method(func(v: float): bmat.set_shader_parameter("burn_override", v), 1.0, 0.0, 21.0).set_trans(Tween.TRANS_SINE)
	return root

static func get_tree_delay_node(node: Node, sec: float, fn: Callable) -> void:
	node.get_tree().create_timer(sec).timeout.connect(fn)

func kill() -> void:   # 預算超限：1.2 秒內縮小消失
	if killed < 0.0:
		killed = age

func _exit_tree() -> void:
	active.erase(self)

func _process(dt: float) -> void:
	age += dt
	var sc_fade := 1.0
	if killed >= 0.0:
		sc_fade = clampf(1.0 - (age - killed) / 1.2, 0.0, 1.0)
	elif age > LIFETIME - 6.0:
		sc_fade = clampf((LIFETIME - age) / 6.0, 0.0, 1.0)
	if sc_fade <= 0.0:
		queue_free()
		return
	# 距離略過特效（遠離鏡頭的斷裂組不放餘燼／火焰／煙）
	var cam := get_viewport().get_camera_3d() if get_viewport() else null
	if cam != null and chunks.size() > 0:
		var d := cam.global_position.distance_to(chunks[0].node.global_position)
		var want := d < FAR_NO_FX and age < 24.0
		if want != fx_on:
			fx_on = want
			for n in fx_nodes:
				if is_instance_valid(n) and not want:
					(n as GPUParticles3D).emitting = false
		if d > FAR_REMOVE:
			queue_free()
			return
	for c in chunks:
		c.node.position += c.vel * dt
		c.node.rotate(c.ang.normalized(), c.ang.length() * dt)
		c.node.scale = Vector3.ONE * sc_fade
