extends Control
## 戰場介面層（標題選單、字幕、遮幕、結尾字卡）。HUD 的準星／雷達／血條在 battle_hud.gd。
## 選單：模式（劇本 5 分鐘／自由無限）、角色（飛行員；指揮官尚未移植）、介面語言（英／中／日／韓）、配音（跟隨／英／中／日／韓／關）。
## 字幕：兩個框——center（畫面中央，來古士的大段台詞）、sub（下方，其他角色）；逐字浮現，時間依語音長度。

var battle   # battle.gd
var menu: Control
var veil: ColorRect
var veil_tw: Tween
var subs := {}
var end_box: VBoxContainer
var end_labels: Array = []
var sel_mode := "script"
var sel_role := "pilot"
var sel_lang := "en"
var sel_voice := "follow"
var lbl := {}
var groups := {}
const CYAN := Color(0.56, 0.9, 1.0)
const LANGS := [["en", "English"], ["zh", "中文"], ["ja", "日本語"], ["ko", "한국어"]]
const VOICES := [["follow", ""], ["en", "English"], ["zh", "中文"], ["ja", "日本語"], ["ko", "한국어"], ["off", ""]]

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	veil = ColorRect.new()   # 遮幕在最底層：字幕與結尾字卡要畫在黑幕／白幕之上
	veil.set_anchors_preset(Control.PRESET_FULL_RECT)
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	veil.color = Color(0, 0, 0, 0)
	add_child(veil)
	_build_subs()
	_build_end()
	_build_menu()

func _process(_dt: float) -> void:
	position = Vector2.ZERO
	size = get_viewport_rect().size

func S(key: String) -> Variant:
	var d: Dictionary = battle.data["str"][sel_lang]
	return d.get(key, battle.data["str"]["en"].get(key, ""))

# ───────────── 選單 ─────────────
func _label(text: String, size: int, col: Color = Color.WHITE, align: int = HORIZONTAL_ALIGNMENT_CENTER) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = align
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l

func _build_menu() -> void:
	menu = Control.new()
	menu.set_anchors_preset(Control.PRESET_FULL_RECT)
	menu.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(menu)
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.02, 0.03, 0.06, 0.78)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	menu.add_child(bg)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	menu.add_child(cc)
	var vb := VBoxContainer.new()
	vb.custom_minimum_size = Vector2(760, 0)
	vb.add_theme_constant_override("separation", 12)
	cc.add_child(vb)
	lbl["title"] = _label("", 34, CYAN)
	vb.add_child(lbl["title"])
	lbl["sub"] = _label("", 16, Color(0.7, 0.78, 0.85))
	vb.add_child(lbl["sub"])
	vb.add_child(Control.new())
	_group(vb, "mode", [["script", ""], ["free", ""]], sel_mode)
	_group(vb, "role", [["pilot", ""], ["commander", ""]], sel_role)
	_group(vb, "lang", LANGS, sel_lang)
	_group(vb, "voice", VOICES, sel_voice)
	_group(vb, "gfx", [["0", "High"], ["1", "Balanced"], ["2", "Low"]], "1")
	lbl["hint"] = _label("", 14, Color(0.75, 0.85, 0.9))
	vb.add_child(lbl["hint"])
	var go := Button.new()
	go.custom_minimum_size = Vector2(260, 52)
	go.add_theme_font_size_override("font_size", 22)
	go.pressed.connect(_on_go)
	lbl["go"] = go
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_child(go)
	vb.add_child(hb)
	lbl["keys"] = _label("", 13, Color(0.6, 0.75, 0.8))
	vb.add_child(lbl["keys"])
	lbl["legal"] = _label("", 11, Color(0.5, 0.58, 0.65))
	vb.add_child(lbl["legal"])
	_refresh_text()

func _group(parent: Control, key: String, opts: Array, cur: String) -> void:
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_theme_constant_override("separation", 8)
	var title := _label("", 14, Color(0.56, 0.9, 1.0, 0.8), HORIZONTAL_ALIGNMENT_RIGHT)
	title.custom_minimum_size = Vector2(110, 0)
	hb.add_child(title)
	var bg := ButtonGroup.new()
	var btns := {}
	for o in opts:
		var b := Button.new()
		b.toggle_mode = true
		b.button_group = bg
		b.custom_minimum_size = Vector2(120, 36)
		b.add_theme_font_size_override("font_size", 15)
		b.button_pressed = (o[0] == cur)
		b.text = str(o[1])
		var id: String = o[0]
		b.pressed.connect(func(): _pick(key, id))
		hb.add_child(b)
		btns[id] = b
	parent.add_child(hb)
	groups[key] = {"title": title, "btns": btns, "opts": opts}

func _pick(key: String, id: String) -> void:
	match key:
		"mode": sel_mode = id
		"role":
			if id == "commander":   # 指揮官模式尚未移植：維持飛行員
				(groups["role"]["btns"]["pilot"] as Button).button_pressed = true
				return
			sel_role = id
		"lang": sel_lang = id
		"voice": sel_voice = id
		"gfx": battle.apply_quality(int(id))
	_refresh_text()

func _refresh_text() -> void:
	lbl["title"].text = S("title")
	lbl["sub"].text = S("sub")
	lbl["hint"].text = S("hintScript") if sel_mode == "script" else S("hintFree")
	(lbl["go"] as Button).text = S("go")
	lbl["legal"].text = str(S("legal")).replace("<br/>", "\n")
	lbl["keys"].text = "Mouse steer · W/S throttle · Q/E roll · A/D/R/F strafe · Shift boost · X stop · LMB laser · RMB missile · T lock · C focus · G charge · V camera · Esc pause"
	var g: Dictionary = groups
	g["mode"]["title"].text = S("mode")
	g["role"]["title"].text = S("role")
	g["lang"]["title"].text = S("langLabel")
	g["voice"]["title"].text = S("voiceLabel")
	g["gfx"]["title"].text = "GRAPHICS"
	g["mode"]["btns"]["script"].text = S("script")
	g["mode"]["btns"]["free"].text = S("free")
	g["role"]["btns"]["pilot"].text = S("pilot")
	g["role"]["btns"]["commander"].text = str(S("commander")) + " ✕"
	(g["role"]["btns"]["commander"] as Button).tooltip_text = "Not ported to the Godot version yet"
	g["voice"]["btns"]["follow"].text = S("voiceFollow")
	g["voice"]["btns"]["off"].text = S("voiceOff")
	for o in VOICES:
		if o[1] != "":
			g["voice"]["btns"][o[0]].text = o[1]

func _on_go() -> void:
	menu.visible = false
	battle.start_game(sel_mode, sel_lang, sel_voice)

# ───────────── 字幕 ─────────────
func _build_subs() -> void:
	for k in ["center", "sub"]:
		var box := VBoxContainer.new()
		box.visible = false
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_theme_constant_override("separation", 4)
		var who := _label("", 15 if k == "sub" else 17, Color.WHITE)
		var txt := _label("", 22 if k == "sub" else 30, Color(0.95, 0.97, 1.0))
		box.add_child(who)
		box.add_child(txt)
		add_child(box)
		subs[k] = {"box": box, "who": who, "txt": txt, "tw": null}

func show_cue(k: String, who_text: String, who_col: Color, text: String, type_secs: float) -> void:
	var S_: Dictionary = subs[k]
	var box: Control = S_["box"]
	var vp := get_viewport_rect().size
	var w := vp.x * 0.7
	box.custom_minimum_size = Vector2(w, 0)
	box.size = Vector2(w, 10)
	box.position = Vector2(vp.x * 0.15, vp.y * (0.42 if k == "center" else 0.8))
	box.visible = true
	box.modulate = Color(1, 1, 1, 1)
	(S_["who"] as Label).text = who_text
	(S_["who"] as Label).add_theme_color_override("font_color", who_col)
	var t: Label = S_["txt"]
	t.text = text
	t.visible_ratio = 0.0
	if S_["tw"] != null:
		(S_["tw"] as Tween).kill()
	var tw := create_tween()
	tw.tween_property(t, "visible_ratio", 1.0, maxf(type_secs, 0.3))
	S_["tw"] = tw

func hide_cue(k: String) -> void:
	var S_: Dictionary = subs[k]
	var box: Control = S_["box"]
	if not box.visible:
		return
	var tw := create_tween()
	tw.tween_property(box, "modulate:a", 0.0, 0.5)
	tw.tween_callback(func(): box.visible = false)

func set_whiteout(on: bool) -> void:   # 全白時字幕改深色
	for k in subs.keys():
		(subs[k]["txt"] as Label).add_theme_color_override("font_color", Color(0.08, 0.08, 0.12) if on else Color(0.95, 0.97, 1.0))
		(subs[k]["txt"] as Label).add_theme_color_override("font_shadow_color", Color(1, 1, 1, 0.6) if on else Color(0, 0, 0, 0.8))

# ───────────── 遮幕 ─────────────
func set_veil(color: Color, alpha: float, secs: float) -> void:
	if veil_tw != null:
		veil_tw.kill()
	var c := Color(color.r, color.g, color.b, veil.color.a)
	veil.color = c
	veil_tw = create_tween()
	veil_tw.tween_property(veil, "color:a", alpha, maxf(secs, 0.001))

func flash_veil(color: Color, alpha: float, secs: float) -> void:
	if veil_tw != null:
		veil_tw.kill()
	veil.color = Color(color.r, color.g, color.b, alpha)
	veil_tw = create_tween()
	veil_tw.tween_property(veil, "color:a", 0.0, secs).set_ease(Tween.EASE_OUT)

# ───────────── 結尾字卡 ─────────────
func _build_end() -> void:
	end_box = VBoxContainer.new()
	end_box.add_theme_constant_override("separation", 26)
	end_box.visible = false
	end_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(end_box)

func show_end() -> void:
	for c in end_box.get_children():
		c.queue_free()
	end_labels.clear()
	var vp := get_viewport_rect().size
	end_box.custom_minimum_size = Vector2(vp.x * 0.7, 0)
	end_box.size = Vector2(vp.x * 0.7, 10)
	end_box.position = Vector2(vp.x * 0.15, vp.y * 0.3)
	end_box.visible = true
	var lines: Array = S("endA")
	for i in range(lines.size()):
		var l := _label(str(lines[i]), 26 if i < lines.size() - 1 else 22, Color(0.95, 0.97, 1.0) if i < lines.size() - 1 else Color(1.0, 0.85, 0.5))
		l.modulate.a = 0.0
		end_box.add_child(l)
		end_labels.append(l)
		var tw := create_tween()
		tw.tween_interval(1.2 + i * 3.3)
		tw.tween_property(l, "modulate:a", 1.0, 1.6)
	var btn := Button.new()
	btn.text = "↺  " + str(S("go"))
	btn.custom_minimum_size = Vector2(240, 44)
	btn.modulate.a = 0.0
	btn.pressed.connect(func(): get_tree().reload_current_scene())
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_child(btn)
	end_box.add_child(hb)
	var tw2 := create_tween()
	tw2.tween_interval(1.2 + lines.size() * 3.3 + 2.0)
	tw2.tween_property(btn, "modulate:a", 1.0, 1.0)
	tw2.tween_callback(func(): Input.mouse_mode = Input.MOUSE_MODE_VISIBLE)
