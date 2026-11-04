class_name SpaceDust
extends Node3D
# Build 27：太空塵（速度感）。固定在世界座標的一箱微塵，繞著鏡頭循環；移動越快，每粒拉成越長的亮線。
# 靜止時幾乎看不到，只在加速／高速掠過時出現；Low 檔位關閉。
const N := 360
const BOX := 700.0
var mm := MultiMesh.new()
var mmi := MultiMeshInstance3D.new()
var mat := StandardMaterial3D.new()
var base: PackedVector3Array = PackedVector3Array()

func _init() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for i in range(N):
		base.append(Vector3(rng.randf(), rng.randf(), rng.randf()) * BOX)
	var bm := BoxMesh.new()
	bm.size = Vector3(0.12, 0.12, 1.0)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.albedo_color = Color(0.75, 0.85, 1.0, 1.0)
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	bm.material = mat
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = bm
	mm.instance_count = N
	mm.visible_instance_count = 0
	mmi.multimesh = mm
	mmi.custom_aabb = AABB(Vector3(-4000, -4000, -4000), Vector3(8000, 8000, 8000))
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	top_level = true

func update(cam_pos: Vector3, vel: Vector3, on: bool) -> void:
	var spd := vel.length()
	if not on or spd < 25.0:
		mm.visible_instance_count = 0
		return
	var dir := vel / spd
	var up := Vector3.UP if absf(dir.y) < 0.95 else Vector3.RIGHT
	var bx := dir.cross(up).normalized()
	var by := dir.cross(bx).normalized()
	var len_k := clampf(spd * 0.04, 1.0, 30.0)   # 線長（公尺）
	var thick := clampf(0.8 + spd * 0.001, 0.8, 1.8)
	mat.albedo_color = Color(0.75, 0.85, 1.0, 1.0) * clampf((spd - 25.0) / 400.0, 0.12, 0.9)
	var half := Vector3.ONE * BOX * 0.5
	for i in range(N):
		var p: Vector3 = base[i] - cam_pos + half
		p = Vector3(fposmod(p.x, BOX), fposmod(p.y, BOX), fposmod(p.z, BOX)) - half
		var b := Basis(bx * thick, by * thick, dir * len_k)
		mm.set_instance_transform(i, Transform3D(b, cam_pos + p))
	mm.visible_instance_count = N
