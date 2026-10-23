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
var pause_menu: Control
var pause_rows := {}
var pause_tabs: TabContainer
var _pause_busy := false
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
	_build_pause()

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
	lbl["legal"].text = str(S("legal")).replace("<br/>", "\n") + "\nGodot build %d" % battle.BUILD
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

# ───────────── ESC 選單（暫停＋設定）─────────────
# 每列：[設定鍵, 顯示名稱, 類型, 參數]；類型 enum＝下拉選單（參數＝選項）、bool＝開關、slider＝滑桿（參數＝[最小, 最大, 間距, 顯示格式]）
const PAUSE_SPEC := {
	"GRAPHICS": [
		["preset", "Preset", "enum", ["High", "Balanced", "Low", "Custom"]],
		["res_scale", "Render scale", "slider", [0.55, 1.0, 0.05, "%d%%", 100.0]],
		["dyn_res", "Dynamic resolution", "bool", null],
		["aa", "Anti-aliasing", "enum", ["Off", "FXAA", "TAA", "MSAA 2x", "MSAA 4x"]],
		["vsync", "VSync", "bool", null],
		["fps_cap", "FPS limit", "enum", ["Unlimited", "30", "60", "120", "144", "240"]],
		["shadows", "Shadows", "enum", ["Off", "Medium", "High"]],
		["lighting_v1", "Sky reflections + fill light", "bool", null],
		["bloom", "Bloom", "bool", null],
		["bloom_strength", "Bloom strength", "slider", [0.2, 1.6, 0.05, "%d%%", 100.0]],
	],
	"EFFECTS": [
		["explosion_budget", "Explosion budget (limit simultaneous)", "bool", null],
		["explosion_max", "Max simultaneous full explosions", "slider", [3, 24, 1, "%d", 1.0]],
		["particle_density", "Particle density", "slider", [0.25, 1.0, 0.05, "%d%%", 100.0]],
		["engine_glow", "Engine glow", "bool", null],
		["wreck_max", "Wreck groups", "slider", [0, 20, 1, "%d", 1.0]],
		["wreck_life", "Wreck lifetime (s)", "slider", [5, 90, 5, "%d s", 1.0]],
	],
	"AUDIO": [
		["music", "Music", "slider", [0.0, 1.0, 0.05, "%d%%", 100.0]],
		["sfx", "Sound effects", "slider", [0.0, 1.0, 0.05, "%d%%", 100.0]],
		["voice", "Voice", "slider", [0.0, 1.0, 0.05, "%d%%", 100.0]],
	],
	"CONTROLS": [
		["mouse_sens", "Mouse sensitivity", "slider", [0.3, 3.0, 0.1, "x%.1f", 1.0]],
		["invert_y", "Invert pitch", "bool", null],
		["radar", "Radar", "bool", null],
	],
}

func _build_pause() -> void:
	pause_menu = Control.new()
	pause_menu.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_menu.mouse_filter = Control.MOUSE_FILTER_STOP
	pause_menu.visible = false
	add_child(pause_menu)
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.01, 0.02, 0.04, 0.82)
	pause_menu.add_child(bg)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_menu.add_child(cc)
	var vb := VBoxContainer.new()
	vb.custom_minimum_size = Vector2(820, 0)
	vb.add_theme_constant_override("separation", 12)
	cc.add_child(vb)
	var ttl := _label("PAUSED · SETTINGS", 28, CYAN)
	vb.add_child(ttl)
	pause_tabs = TabContainer.new()
	pause_tabs.custom_minimum_size = Vector2(820, 430)
	vb.add_child(pause_tabs)
	for tab in PAUSE_SPEC.keys():
		var sc := ScrollContainer.new()
		sc.name = tab
		var col := VBoxContainer.new()
		col.add_theme_constant_override("separation", 8)
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sc.add_child(col)
		pause_tabs.add_child(sc)
		for spec in PAUSE_SPEC[tab]:
			col.add_child(_pause_row(spec))
	# GAME 頁：語言／配音／回標題／結束
	var gsc := ScrollContainer.new()
	gsc.name = "GAME"
	var gcol := VBoxContainer.new()
	gcol.add_theme_constant_override("separation", 10)
	gcol.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gsc.add_child(gcol)
	pause_tabs.add_child(gsc)
	gcol.add_child(_game_option("Language", ["English", "中文", "日本語", "한국어"], ["en", "zh", "ja", "ko"], func(): return battle.lang, func(v): battle.lang = v; sel_lang = v; _refresh_text()))
	gcol.add_child(_game_option("Voice", ["Same as UI", "English", "中文", "日本語", "한국어", "Off"], ["follow", "en", "zh", "ja", "ko", "off"], func(): return battle.voice_sel, func(v): battle.voice_sel = v))
	var btns := HBoxContainer.new()
	btns.add_theme_constant_override("separation", 12)
	for spec in [["Resume", func(): battle.resume_game()], ["Back to title", func(): battle.save_settings(); get_tree().reload_current_scene()], ["Quit game", func(): battle.save_settings(); get_tree().quit()]]:
		var b := Button.new()
		b.text = spec[0]
		b.custom_minimum_size = Vector2(180, 44)
		b.add_theme_font_size_override("font_size", 17)
		b.pressed.connect(spec[1])
		btns.add_child(b)
	gcol.add_child(btns)
	var note := _label("Settings are saved automatically (user://settings.cfg).   Esc = resume.", 12, Color(0.6, 0.72, 0.78))
	vb.add_child(note)

func _game_option(title: String, labels: Array, ids: Array, getter: Callable, setter: Callable) -> Control:
	var hb := HBoxContainer.new()
	var l := _label(title, 16, Color.WHITE, HORIZONTAL_ALIGNMENT_LEFT)
	l.custom_minimum_size = Vector2(300, 0)
	hb.add_child(l)
	var ob := OptionButton.new()
	ob.custom_minimum_size = Vector2(220, 36)
	for i in range(labels.size()):
		ob.add_item(labels[i], i)
	ob.item_selected.connect(func(i): setter.call(ids[i]))
	pause_rows["game_" + title] = {"ctrl": ob, "get": getter, "ids": ids}
	hb.add_child(ob)
	return hb

func _pause_row(spec: Array) -> Control:
	var key: String = spec[0]
	var kind: String = spec[2]
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 12)
	var l := _label(str(spec[1]), 16, Color.WHITE, HORIZONTAL_ALIGNMENT_LEFT)
	l.custom_minimum_size = Vector2(380, 0)
	hb.add_child(l)
	if kind == "enum":
		var ob := OptionButton.new()
		ob.custom_minimum_size = Vector2(240, 34)
		var items: Array = spec[3]
		for i in range(items.size()):
			ob.add_item(str(items[i]), i)
		ob.item_selected.connect(func(i): _opt_changed(key, i))
		pause_rows[key] = {"ctrl": ob, "kind": kind}
		hb.add_child(ob)
	elif kind == "bool":
		var cb := CheckButton.new()
		cb.toggled.connect(func(v): _opt_changed(key, v))
		pause_rows[key] = {"ctrl": cb, "kind": kind}
		hb.add_child(cb)
	else:
		var pr: Array = spec[3]
		var sl := HSlider.new()
		sl.custom_minimum_size = Vector2(260, 30)
		sl.min_value = float(pr[0])
		sl.max_value = float(pr[1])
		sl.step = float(pr[2])
		var vl := _label("", 15, CYAN, HORIZONTAL_ALIGNMENT_LEFT)
		vl.custom_minimum_size = Vector2(80, 0)
		sl.value_changed.connect(func(v):
			vl.text = str(pr[3]) % (v * float(pr[4]))
			_opt_changed(key, v))
		pause_rows[key] = {"ctrl": sl, "kind": kind, "vl": vl, "fmt": pr}
		hb.add_child(sl)
		hb.add_child(vl)
	return hb

func _opt_changed(key: String, v: Variant) -> void:
	if _pause_busy:
		return
	if key == "preset":
		if int(v) < 3:
			battle.apply_quality(int(v))
			refresh_pause()
		else:
			battle.opt["preset"] = 3
		return
	battle.opt[key] = v
	if key == "preset" or battle.opt["preset"] != 3:
		battle.opt["preset"] = 3   # 任何單項調整都變成「自訂」
		_set_ctrl("preset", 3)
	battle.apply_settings()

func _set_ctrl(key: String, v: Variant) -> void:
	_pause_busy = true
	var r: Dictionary = pause_rows[key]
	var c: Control = r["ctrl"]
	if c is OptionButton:
		(c as OptionButton).select(int(v))
	elif c is CheckButton:
		(c as CheckButton).button_pressed = bool(v)
	elif c is HSlider:
		(c as HSlider).value = float(v)
		var pr: Array = r["fmt"]
		(r["vl"] as Label).text = str(pr[3]) % (float(v) * float(pr[4]))
	_pause_busy = false

func refresh_pause() -> void:
	for key in battle.opt.keys():
		if pause_rows.has(key):
			_set_ctrl(key, battle.opt[key])
	for k in pause_rows.keys():
		if str(k).begins_with("game_"):
			var r: Dictionary = pause_rows[k]
			(r["ctrl"] as OptionButton).select((r["ids"] as Array).find((r["get"] as Callable).call()))

func show_pause(on: bool) -> void:
	pause_menu.visible = on
	if on:
		refresh_pause()
