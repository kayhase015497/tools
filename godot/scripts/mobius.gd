extends Node3D
# 翁法羅斯的莫比烏斯環（移植自網頁版 battle-render.js）：一圈扭轉 3 個半圈的 ∞ 光帶，環心在鐵墓大腿中段，
# 平面法線朝向聯軍陣線（+Z）；中心（∞ 交叉點）有超亮的藍白光核。只輕微晃動，始終正對聯軍。

const A := 6200.0      # ∞ 的半寬（約等於鐵墓手臂展幅）
const U := 480
const V := 2

var mats: Array = []
var core1: MeshInstance3D
var core2: MeshInstance3D

func build(tomb_pos: Vector3, tomb_scale: float) -> void:
	position = Vector3(tomb_pos.x, tomb_pos.y - 55.0 * tomb_scale, tomb_pos.z + 1800.0)
	var sh: Shader = load("res://shaders/mobius.gdshader")
	for cfg in [[2900.0, 1.0, 2], [1300.0, 0.0, 3]]:   # [帶寬, 是否為光暈, 繪製順序]
		var mi := MeshInstance3D.new()
		mi.mesh = _strip(float(cfg[0]))
		var m := ShaderMaterial.new()
		m.shader = sh
		m.set_shader_parameter("halo", float(cfg[1]))
		m.render_priority = int(cfg[2])
		mi.material_override = m
		mi.custom_aabb = AABB(Vector3(-A * 1.2, -A, -A), Vector3(A * 2.4, A * 2.0, A * 2.0))
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		mats.append(m)
	core1 = _glow(Color(0.56, 0.78, 1.0, 1.0), 0.9)
	core2 = _glow(Color(1, 1, 1, 1), 2.2)

func _glow(tint: Color, strength: float) -> MeshInstance3D:
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/glow.gdshader")
	m.set_shader_parameter("tint", Color(tint.r * strength, tint.g * strength, tint.b * strength, 1.0))
	q.material = m
	var mi := MeshInstance3D.new()
	mi.mesh = q
	mi.custom_aabb = AABB(Vector3(-8000, -8000, -8000), Vector3(16000, 16000, 16000))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi

func _c(t: float) -> Vector2:   # 伯努利雙紐線
	var d := 1.0 + pow(sin(t), 2.0)
	return Vector2(A * cos(t) / d, A * sin(t) * cos(t) / d)

func _strip(w: float) -> ArrayMesh:
	var pos := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	for i in range(U + 1):
		var t := float(i) / U * TAU
		var p := _c(t)
		var q := _c(t + 1e-3)
		var tx := q.x - p.x
		var ty := q.y - p.y
		var l := maxf(sqrt(tx * tx + ty * ty), 1e-9)
		var nx := -ty / l
		var ny := tx / l
		var th := 1.5 * t   # 扭轉 3 個半圈（奇數 → 真正的莫比烏斯帶）
		var cs := cos(th)
		var sn := sin(th)
		for j in range(V + 1):
			var v := float(j) / V * 2.0 - 1.0
			var h := v * w * 0.5
			pos.append(Vector3(p.x + nx * cs * h, p.y + ny * cs * h, sn * h))
			uv.append(Vector2(float(i) / U, v))
	for i in range(U):
		for j in range(V):
			var a := i * (V + 1) + j
			var b := a + V + 1
			idx.append_array(PackedInt32Array([a, b, a + 1, b, b + 1, a + 1]))
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_TEX_UV] = uv
	arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return mesh

func update(t: float) -> void:
	for m in mats:
		(m as ShaderMaterial).set_shader_parameter("time", t)
	var pu := 1.0 + 0.06 * sin(t * 1.7)
	core1.scale = Vector3.ONE * 6200.0 * pu
	core2.scale = Vector3.ONE * 1500.0 * pu
	rotation.x = sin(t * 0.07) * 0.06
	rotation.y = sin(t * 0.05) * 0.08
