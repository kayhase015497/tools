extends RefCounted
## V1 光照（docs/space-war/GODOT-VISUAL-PLAN.md）：主光陰影、天空反射、冷色環境光墊底、主光／補光／邊光。
## 參數全在 data/lighting.json；遊戲中 F5 切換新舊（A/B），lookdev 也用它拍對照圖。
## 用法：const Lighting = preload("res://scripts/lighting.gd")（不用 class_name：新類別名要編輯器重掃才生效，lookdev.bat 直接執行會失敗）。
## 只有第 2 層（SHADOW_LAYER）的物件會投影：艦艇、鐵墓、斷片、駕駛艙。粒子與特效不在這層，所以不會投出方塊陰影。

const SHADOW_LAYER := 2
const SHADOW_MASK := 1 << (SHADOW_LAYER - 1)

static var cfg := {}
static var enabled := true
static var quality := 1

static func load_cfg() -> void:
	var f := FileAccess.open("res://data/lighting.json", FileAccess.READ)
	if f == null:
		push_warning("lighting.json missing")
		return
	cfg = JSON.parse_string(f.get_as_text())
	f.close()

static func _col(a: Array) -> Color:
	return Color(float(a[0]), float(a[1]), float(a[2]))

static func _rot(a: Array) -> Vector3:
	return Vector3(float(a[0]), float(a[1]), float(a[2]))

## 把節點（含子節點）的網格放進投影層並打開投影（粒子不動）
static func mark_caster(n: Node) -> void:
	if n is MeshInstance3D or n is MultiMeshInstance3D:
		(n as GeometryInstance3D).layers |= SHADOW_MASK
		(n as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for c in n.get_children():
		mark_caster(c)

static func _find(root: Node, nm: String) -> Node:
	return root.get_node_or_null(nm)

static func apply(root: Node, on: bool, q: int) -> void:
	if cfg.is_empty():
		load_cfg()
	enabled = on
	quality = q
	var env: Environment = null
	for c in root.get_children():
		if c is WorldEnvironment:
			env = (c as WorldEnvironment).environment
	var key := _find(root, "KeyLight") as DirectionalLight3D
	var rim := _find(root, "RimLight") as DirectionalLight3D
	var fill := _find(root, "FillLight") as DirectionalLight3D
	if fill == null:
		fill = DirectionalLight3D.new()
		fill.name = "FillLight"
		root.add_child(fill)
	var sq: Dictionary = (cfg["shadow"]["quality"] as Array)[clampi(q, 0, 2)]
	Explosion.shadow_max = int(sq["explosion_lights"]) if on else 0
	var sky_mat: ShaderMaterial = null
	if env != null and env.sky != null:
		sky_mat = env.sky.sky_material as ShaderMaterial
	if not on:   # 舊版（第十五版）光照
		if key:
			key.light_color = Color(0.85, 0.92, 1.0)
			key.light_energy = 0.95
			key.rotation_degrees = Vector3(-35, 140, 0)
			key.shadow_enabled = false
		if rim:
			rim.light_energy = 0.3
		fill.visible = false
		if env:
			env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
			env.ambient_light_energy = 0.2
			env.ambient_light_sky_contribution = 1.0
			env.ambient_light_color = Color.BLACK
		if sky_mat:
			sky_mat.set_shader_parameter("refl_lobe", 0.0)
			sky_mat.set_shader_parameter("refl_floor", Vector3.ZERO)
		return
	var k: Dictionary = cfg["key"]
	if key:
		key.light_color = _col(k["color"])
		key.light_energy = float(k["energy"])
		key.rotation_degrees = _rot(k["rot"])
		var sh: Dictionary = cfg["shadow"]
		key.shadow_enabled = bool(sq["on"])
		key.shadow_caster_mask = SHADOW_MASK
		key.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
		key.directional_shadow_max_distance = float(sq["max_distance"])
		var sp: Array = sq["splits"]
		key.directional_shadow_split_1 = float(sp[0])
		key.directional_shadow_split_2 = float(sp[1])
		key.directional_shadow_split_3 = float(sp[2])
		key.directional_shadow_blend_splits = true
		key.directional_shadow_fade_start = float(sh["fade_start"])
		key.directional_shadow_pancake_size = float(sh["pancake"])
		key.shadow_bias = float(sh["bias"])
		key.shadow_normal_bias = float(sh["normal_bias"])
		key.shadow_blur = float(sh["blur"])
		RenderingServer.directional_shadow_atlas_set_size(int(sq["atlas"]), true)
	var r: Dictionary = cfg["rim"]
	if rim:
		rim.light_color = _col(r["color"])
		rim.light_energy = float(r["energy"])
		rim.rotation_degrees = _rot(r["rot"])
	var fl: Dictionary = cfg["fill"]
	fill.visible = true
	fill.light_color = _col(fl["color"])
	fill.light_energy = float(fl["energy"])
	fill.rotation_degrees = _rot(fl["rot"])
	fill.shadow_enabled = false
	fill.light_specular = 0.3
	var a: Dictionary = cfg["ambient"]
	var sr: Dictionary = cfg["sky_reflection"]
	if env:
		env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
		env.ambient_light_color = _col(a["color"])
		env.ambient_light_energy = float(a["energy"])
		env.ambient_light_sky_contribution = float(a["sky_contribution"])
		env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
		if env.sky:
			env.sky.radiance_size = [32, 64, 128, 256, 512, 1024].find(int(sr["radiance_size"])) as Sky.RadianceSize
	if sky_mat:
		sky_mat.set_shader_parameter("refl_lobe", float(sr["lobe"]))
		sky_mat.set_shader_parameter("refl_power", float(sr["lobe_power"]))
		var fc: Array = sr["floor"]
		sky_mat.set_shader_parameter("refl_floor", Vector3(float(fc[0]), float(fc[1]), float(fc[2])))
