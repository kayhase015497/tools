extends Control
## 戰場 HUD：準星、目標框、雷達、護盾／船體／能量／飛彈、通訊紀錄、暫停畫面。用 _draw 直接畫，沒有場景節點。

var battle   # battle.gd（untyped：避免循環載入）
const COL_A := Color(0.35, 0.75, 1.0)
const COL_E := Color(1.0, 0.35, 0.45)
const COL_T := Color(1.0, 0.85, 0.3)
const HUD_G := Color(0.55, 1.0, 0.85)

func _font() -> Font:
	return ThemeDB.fallback_font

func _txt(pos: Vector2, text: String, size: int = 16, col: Color = HUD_G, align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	draw_string(_font(), pos + Vector2(1, 1), text, align, width, size, Color(0, 0, 0, 0.8))
	draw_string(_font(), pos, text, align, width, size, col)

func _bar(pos: Vector2, size: Vector2, k: float, col: Color, label: String) -> void:
	draw_rect(Rect2(pos, size), Color(0, 0, 0, 0.45))
	draw_rect(Rect2(pos, Vector2(size.x * clampf(k, 0.0, 1.0), size.y)), col)
	draw_rect(Rect2(pos, size), Color(1, 1, 1, 0.35), false, 1.0)
	_txt(pos + Vector2(4, size.y - 3), label, 12, Color(1, 1, 1, 0.9))

func _project(p: Vector3) -> Variant:
	var cam: Camera3D = battle.cam
	if cam.is_position_behind(p):
		return null
	return cam.unproject_position(p)

func _draw() -> void:
	var _t0 := Time.get_ticks_usec()
	_draw_all()
	battle._pf("hud", _t0) if battle != null else null

func _draw_all() -> void:
	if battle == null or not battle.started:
		return
	if battle.role == "commander":
		if battle.hud_on:
			_draw_commander()
		return
	if battle.pl.is_empty() or not battle.hud_on:
		return
	var vp := size
	var c := vp * 0.5
	var P: Dictionary = battle.pl
	var ship = P["ship"]
	# 受傷紅暈
	if battle.hurt_k > 0.01:
		var a: float = battle.hurt_k * 0.35
		draw_rect(Rect2(0, 0, vp.x, 40), Color(1, 0, 0, a))
		draw_rect(Rect2(0, vp.y - 40, vp.x, 40), Color(1, 0, 0, a))
		draw_rect(Rect2(0, 0, 40, vp.y), Color(1, 0, 0, a))
		draw_rect(Rect2(vp.x - 40, 0, 40, vp.y), Color(1, 0, 0, a))
	if not P["dead"]:
		# 準星
		draw_arc(c, 18.0, 0, TAU, 32, Color(HUD_G, 0.6), 1.5)
		draw_line(c + Vector2(-30, 0), c + Vector2(-10, 0), Color(HUD_G, 0.7), 1.5)
		draw_line(c + Vector2(30, 0), c + Vector2(10, 0), Color(HUD_G, 0.7), 1.5)
		draw_line(c + Vector2(0, -30), c + Vector2(0, -10), Color(HUD_G, 0.7), 1.5)
		draw_line(c + Vector2(0, 30), c + Vector2(0, 10), Color(HUD_G, 0.7), 1.5)
		# 附近敵機／敵艦小標記
		var n := 0
		for e in battle.enemies:
			if e.dead:
				continue
			var dist: float = ship.pos.distance_to(e.pos)
			var big: bool = e.d["hp"] > 1000.0
			if dist > (6000.0 if big else 2200.0):
				continue
			var sp = _project(e.pos)
			if sp == null:
				continue
			n += 1
			if n > 60:
				break
			var r := 6.0 if not big else 12.0
			draw_rect(Rect2(sp - Vector2(r, r), Vector2(r, r) * 2.0), Color(COL_E, 0.6), false, 1.0)
		# 目標框
		var tg = P["target"]
		if tg != null and not tg.dead:
			var sp2 = _project(tg.pos)
			var dist2: float = ship.pos.distance_to(tg.pos)
			if sp2 != null:
				var r2 := clampf(tg.rad * 700.0 / maxf(dist2, 1.0), 14.0, 120.0)
				var rc := Rect2(sp2 - Vector2(r2, r2), Vector2(r2, r2) * 2.0)
				var k := r2 * 0.4
				for corner in [[rc.position, 1, 1], [rc.position + Vector2(rc.size.x, 0), -1, 1], [rc.position + Vector2(0, rc.size.y), 1, -1], [rc.end, -1, -1]]:
					var cp: Vector2 = corner[0]
					draw_line(cp, cp + Vector2(k * corner[1], 0), COL_T, 2.0)
					draw_line(cp, cp + Vector2(0, k * corner[2]), COL_T, 2.0)
				var lead: Vector3 = battle.lead_point(ship.pos, tg, 1900.0)
				var lp = _project(lead)
				if lp != null:
					draw_arc(lp, 7.0, 0, TAU, 16, COL_T, 1.5)
				_txt(sp2 + Vector2(r2 + 8, -r2), "%s  %.0fm" % [tg.d["name"], dist2], 14, COL_T)
				var hk: float = tg.hp / tg.hp_max
				draw_rect(Rect2(sp2 + Vector2(r2 + 8, -r2 + 4), Vector2(80, 6)), Color(0, 0, 0, 0.5))
				draw_rect(Rect2(sp2 + Vector2(r2 + 8, -r2 + 4), Vector2(80 * hk, 6)), COL_E)
				if tg.sh_max > 0.0:
					draw_rect(Rect2(sp2 + Vector2(r2 + 8, -r2 + 11), Vector2(80 * tg.sh / tg.sh_max, 4)), COL_A)
			else:
				var dir: Vector3 = battle.cam.global_transform.basis.inverse() * (tg.pos - battle.cam.global_position)
				var a2 := Vector2(dir.x, -dir.y).normalized()
				var ep := c + a2 * minf(vp.x, vp.y) * 0.42
				draw_line(ep, ep - a2 * 22.0 + a2.orthogonal() * 8.0, COL_T, 2.0)
				draw_line(ep, ep - a2 * 22.0 - a2.orthogonal() * 8.0, COL_T, 2.0)
		# 預警機建議目標
		var sg = P["suggest"]
		if sg != null and not sg.dead and sg != tg:
			var sp3 = _project(sg.pos)
			if sp3 != null:
				draw_colored_polygon(PackedVector2Array([sp3 + Vector2(0, -9), sp3 + Vector2(9, 0), sp3 + Vector2(0, 9), sp3 + Vector2(-9, 0)]), Color(COL_T, 0.35))
		# 左下：護盾／船體／能量
		var bx := 24.0
		var by := vp.y - 150.0
		_bar(Vector2(bx, by), Vector2(220, 16), P["shield"] / P["shield_max"], Color(0.3, 0.65, 1.0, 0.85), "SHIELD")
		_bar(Vector2(bx, by + 22), Vector2(220, 16), P["hull"] / P["hull_max"], Color(0.4, 1.0, 0.5, 0.85) if P["hull"] > P["hull_max"] * 0.35 else Color(1.0, 0.3, 0.3, 0.9), "HULL")
		_bar(Vector2(bx, by + 44), Vector2(220, 10), P["energy"] / 100.0, Color(1.0, 0.8, 0.3, 0.8), "")
		_bar(Vector2(bx, by + 58), Vector2(220, 10), P["heat"] / 100.0, Color(1.0, 0.5, 0.3, 0.8), "")
		var spd: float = (P["vel"] as Vector3).length()
		_txt(Vector2(bx, by + 92), "SPD %3.0f m/s   THR %3.0f%%%s" % [spd, P["thr"] * 100.0, "  BOOST" if P["boost"] else ""], 15)
		var mcol := Color(1.0, 0.7, 0.2) if (P["need_supply"] and int(battle.gt * 3.0) % 2 == 0) else HUD_G
		_txt(Vector2(bx, by + 110), "MSL %d" % P["missiles"], 15, mcol)
		if P["need_supply"]:
			var st = P.get("supply_tgt")
			var extra := ""
			if st != null:
				extra = "  → %s %.0fm" % [st.d["name"], ship.pos.distance_to(st.pos)]
			_txt(Vector2(bx + 80, by + 110), "RESUPPLY%s" % extra, 14, Color(1.0, 0.75, 0.3))
		# 雷達（右下）
		if battle.radar_on:
			_draw_radar(Vector2(vp.x - 110, vp.y - 120), 90.0, ship)
	else:
		_txt(c + Vector2(0, -10), "PILOT LOST · REDEPLOY IN %.0f" % maxf(P["respawn"], 0.0), 28, Color(1, 0.4, 0.4), HORIZONTAL_ALIGNMENT_CENTER, 0)
		draw_string(_font(), c + Vector2(-300, -10), "PILOT LOST · REDEPLOY IN %.0f" % maxf(P["respawn"], 0.0), HORIZONTAL_ALIGNMENT_CENTER, 600.0, 28, Color(1, 0.4, 0.4))
	# 上方：任務目標與狀態
	var hss_alive := false
	for a in battle.allies:
		if a.kind == "hss" and not a.dead:
			hss_alive = true
			if battle.obj_on:
				draw_rect(Rect2(c.x - 150, 40, 300, 8), Color(0, 0, 0, 0.5))
				draw_rect(Rect2(c.x - 150, 40, 300 * a.hp / a.hp_max, 8), Color(1.0, 0.85, 0.4))
				if a.sh_max > 0.0:
					draw_rect(Rect2(c.x - 150, 49, 300 * a.sh / a.sh_max, 4), COL_A)
	if battle.obj_on:
		draw_string(_font(), Vector2(0, 30), "%s · %s" % [battle.tr_("objLabel"), battle.tr_("objText")], HORIZONTAL_ALIGNMENT_CENTER, vp.x, 20, Color(1.0, 0.85, 0.4))
		if not hss_alive:
			draw_string(_font(), Vector2(0, 66), "HSS DESTROYED", HORIZONTAL_ALIGNMENT_CENTER, vp.x, 26, Color(1, 0.3, 0.3))
	if battle.game_mode == "script":   # 鐵墓血條（只降到 80%：鐵墓不會倒下）
		var bf: float = battle.iron_frac()
		draw_string(_font(), Vector2(vp.x - 330, 52), "IRONTOMB", HORIZONTAL_ALIGNMENT_RIGHT, 320.0, 13, Color(1.0, 0.45, 0.55))
		draw_rect(Rect2(vp.x - 330, 58, 320, 8), Color(0, 0, 0, 0.5))
		draw_rect(Rect2(vp.x - 330, 58, 320.0 * bf, 8), Color(1.0, 0.3, 0.4))
	var fps := Engine.get_frames_per_second()
	_txt(Vector2(vp.x - 520, 22), "GODOT build %d   FPS %d   ALLIES %d   LEGION %d   KILLS %d   WAVE %d" % [battle.BUILD, fps, battle.allies.size(), battle.enemies.size(), battle.kills, battle.wave], 14, Color(0.7, 0.95, 0.9, 0.9), HORIZONTAL_ALIGNMENT_RIGHT, 510.0)
	if not P.is_empty() and P.get("msg", "") != "":
		draw_string(_font(), Vector2(0, c.y - 150), P["msg"], HORIZONTAL_ALIGNMENT_CENTER, vp.x, 22, Color(1, 0.4, 0.3))
	if battle.gt - battle.hud_note_t < 3.0:
		var al := clampf(3.0 - (battle.gt - battle.hud_note_t), 0.0, 1.0)
		draw_string(_font(), Vector2(0, c.y + 110), battle.hud_note_text, HORIZONTAL_ALIGNMENT_CENTER, vp.x, 22, Color(0.5, 1.0, 0.7, al))
	# 通訊紀錄（左上）
	var y := 70.0
	for l in battle.log_lines:
		var age: float = battle.gt - l["t"]
		if age > 12.0:
			continue
		var a3 := clampf((12.0 - age) / 2.0, 0.0, 1.0)
		_txt(Vector2(24, y), l["text"], 14, Color(1.0, 0.55, 0.45, a3) if l["warn"] else Color(0.75, 0.95, 1.0, a3))
		y += 20.0
	# 無線電（右側，在鐵墓血條下方）
	var now := Time.get_ticks_msec() / 1000.0
	var ry := 86.0
	for rl in battle.radio_lines:
		var age: float = now - float(rl["t"])
		if age > float(rl["life"]):
			continue
		var a4 := clampf((float(rl["life"]) - age) / 1.4, 0.0, 1.0)
		var col := Color(1.0, 0.5, 0.45, a4) if rl["cat"] == "final" or rl["cat"] == "hit" else Color(0.6, 0.95, 1.0, a4)
		_txt(Vector2(vp.x - 440, ry), str(rl["cs"]), 12, Color(col, a4 * 0.85), HORIZONTAL_ALIGNMENT_RIGHT, 430.0)
		_txt(Vector2(vp.x - 440, ry + 16), str(rl["text"]), 14, col, HORIZONTAL_ALIGNMENT_RIGHT, 430.0)
		ry += 38.0
	# 按鍵提示
	_txt(Vector2(24, vp.y - 14), "Mouse steer  W/S throttle  Q/E roll  A/D/R/F strafe  Shift boost  X stop  LMB fire  RMB missile  T lock  Y next  U AWACS tgt  C focus  G charge  V cam  Z assist  N radar  Esc pause", 12, Color(0.6, 0.8, 0.8, 0.7))

func _draw_radar(ctr: Vector2, r: float, ship) -> void:
	draw_circle(ctr, r, Color(0, 0.05, 0.08, 0.55))
	draw_arc(ctr, r, 0, TAU, 48, Color(HUD_G, 0.5), 1.5)
	draw_arc(ctr, r * 0.5, 0, TAU, 32, Color(HUD_G, 0.2), 1.0)
	var inv: Basis = Basis(ship.q).inverse()
	var range_ := 6000.0
	for list in [battle.allies, battle.enemies]:
		for e in list:
			if e.dead or e == ship:
				continue
			var rel: Vector3 = inv * (e.pos - ship.pos)
			var d2 := Vector2(-rel.x, -rel.z)   # 前方在上；本地 +X 是左
			var l := d2.length()
			if l > range_:
				d2 = d2 / l * range_
			var up := rel.y > 0.0
			var pt := ctr + Vector2(d2.x, d2.y) / range_ * r
			var big: bool = e.d["hp"] > 1000.0
			var col := COL_A if e.side == 0 else COL_E
			draw_rect(Rect2(pt - Vector2(1.5, 1.5) * (2.0 if big else 1.0), Vector2(3, 3) * (2.0 if big else 1.0)), Color(col, 0.9 if up else 0.55))
	var tg = battle.pl["target"]
	if tg != null and not tg.dead:
		var rel2: Vector3 = inv * (tg.pos - ship.pos)
		var dd := Vector2(-rel2.x, -rel2.z)
		if dd.length() > range_:
			dd = dd.normalized() * range_
		draw_arc(ctr + dd / range_ * r, 5.0, 0, TAU, 12, COL_T, 1.5)
	draw_line(ctr + Vector2(0, -6), ctr + Vector2(0, 6), HUD_G, 1.5)
	draw_line(ctr + Vector2(-4, 0), ctr + Vector2(4, 0), HUD_G, 1.5)

# ───────────── 指揮官 HUD ─────────────
func _draw_commander() -> void:
	var vp := size
	var cam: Camera3D = battle.cam
	# 任務目標與血條（同飛行員模式）
	if battle.obj_on:
		draw_string(_font(), Vector2(0, 30), "%s · %s" % [battle.tr_("objLabel"), battle.tr_("objText")], HORIZONTAL_ALIGNMENT_CENTER, vp.x, 20, Color(1.0, 0.85, 0.4))
	if battle.game_mode == "script":
		var bf: float = battle.iron_frac()
		_txt(Vector2(vp.x - 330, 52), "IRONTOMB", 13, Color(1.0, 0.45, 0.55), HORIZONTAL_ALIGNMENT_RIGHT, 320.0)
		draw_rect(Rect2(vp.x - 330, 58, 320, 8), Color(0, 0, 0, 0.5))
		draw_rect(Rect2(vp.x - 330, 58, 320.0 * bf, 8), Color(1.0, 0.3, 0.4))
	_txt(Vector2(vp.x - 520, 22), "GODOT build %d   FPS %d   SHIPS %d   LEGION %d   KILLS %d   SELECTED %d" % [battle.BUILD, Engine.get_frames_per_second(), battle.allies.size(), battle.enemies.size(), battle.kills, battle.selected.size()], 14, Color(0.7, 0.95, 0.9, 0.9), HORIZONTAL_ALIGNMENT_RIGHT, 510.0)
	# 選取環
	for u in battle.selected:
		if u.dead or cam.is_position_behind(u.pos):
			continue
		var sp := cam.unproject_position(u.pos)
		var r: float = maxf(battle._screen_radius(u) * 1.15, 9.0)
		draw_arc(sp, r, 0, TAU, 28, Color(0.4, 1.0, 0.8, 0.9), 1.6)
	# 敵艦小標記（大艦＋近處的）
	var n := 0
	for e in battle.enemies:
		if e.dead or cam.is_position_behind(e.pos):
			continue
		var big: bool = e.d["hp"] > 1000.0
		var sp2 := cam.unproject_position(e.pos)
		if not Rect2(Vector2.ZERO, vp).has_point(sp2):
			continue
		n += 1
		if n > 120:
			break
		var rr := 5.0 if not big else 11.0
		draw_rect(Rect2(sp2 - Vector2(rr, rr), Vector2(rr, rr) * 2.0), Color(COL_E, 0.7), false, 1.0)
		if big:
			draw_rect(Rect2(sp2 + Vector2(-16, 14), Vector2(32.0 * e.hp / e.hp_max, 3)), Color(COL_E, 0.9))
	# 命令標記（擴散圓）
	for m in battle.cmd_marks:
		if cam.is_position_behind(m["pos"]):
			continue
		var t: float = m["t"] / 1.4
		var mp := cam.unproject_position(m["pos"])
		draw_arc(mp, 10.0 + t * 40.0, 0, TAU, 24, Color(m["col"], 1.0 - t), 2.0)
		draw_circle(mp, 3.0, Color(m["col"], 1.0 - t))
	# 框選框
	if battle.drag["on"] and not battle.drag["rot"] and battle.drag["moved"]:
		var r2 := Rect2(Vector2(minf(battle.drag["x0"], battle.drag["x1"]), minf(battle.drag["y0"], battle.drag["y1"])), Vector2(absf(battle.drag["x1"] - battle.drag["x0"]), absf(battle.drag["y1"] - battle.drag["y0"])))
		draw_rect(r2, Color(0.4, 1.0, 0.8, 0.12))
		draw_rect(r2, Color(0.4, 1.0, 0.8, 0.9), false, 1.5)
	# 小地圖（左下）：鐵墓＝紅圈，友軍藍點、敵軍紅點、鏡頭中心黃框；點擊可移動鏡頭
	var ms := 240.0
	var mr := Rect2(Vector2(20, vp.y - ms - 20), Vector2(ms, ms))
	battle.mini_rect = mr
	draw_rect(mr, Color(0.01, 0.04, 0.08, 0.7))
	draw_rect(mr, Color(0.56, 0.9, 1.0, 0.4), false, 1.0)
	var wx0: float = battle.MINI_X0
	var wx1: float = battle.MINI_X1
	var wz0: float = battle.MINI_Z0
	var wz1: float = battle.MINI_Z1
	var tomb_p := mr.position + Vector2((battle.TOMB_POS.x - wx0) / (wx1 - wx0) * ms, (battle.TOMB_POS.z - wz0) / (wz1 - wz0) * ms)
	draw_circle(tomb_p, 7.0, Color(1.0, 0.3, 0.4, 0.8))
	draw_arc(tomb_p, battle.TOMB_AURA / (wx1 - wx0) * ms, 0, TAU, 32, Color(1.0, 0.3, 0.4, 0.4), 1.0)
	for list in [battle.allies, battle.enemies]:
		for u in list:
			if u.dead:
				continue
			var p := mr.position + Vector2((u.pos.x - wx0) / (wx1 - wx0) * ms, (u.pos.z - wz0) / (wz1 - wz0) * ms)
			if not mr.has_point(p):
				continue
			var bg: bool = u.d["hp"] > 1000.0
			var col := COL_A if u.side == 0 else COL_E
			if battle.selected.has(u):
				col = Color(0.4, 1.0, 0.8)
			draw_rect(Rect2(p - Vector2(1.5, 1.5) * (2.0 if bg else 1.0), Vector2(3, 3) * (2.0 if bg else 1.0)), col)
	var cpos := mr.position + Vector2((float(battle.cc["tx"]) - wx0) / (wx1 - wx0) * ms, (float(battle.cc["tz"]) - wz0) / (wz1 - wz0) * ms)
	draw_rect(Rect2(cpos - Vector2(6, 6), Vector2(12, 12)), Color(1.0, 0.85, 0.3), false, 1.5)
	_txt(Vector2(vp.x - 440, 120), "LMB drag: box select   LMB click: move / focus enemy / Irontomb   RMB drag: rotate   Wheel: zoom   WASD: pan (Shift fast)   Tab: pilot", 12, Color(0.6, 0.8, 0.8, 0.8), HORIZONTAL_ALIGNMENT_RIGHT, 430.0)
	# 通訊紀錄（左上）
	var y := 70.0
	for l in battle.log_lines:
		var age: float = battle.gt - l["t"]
		if age > 12.0:
			continue
		var a3 := clampf((12.0 - age) / 2.0, 0.0, 1.0)
		_txt(Vector2(24, y), l["text"], 14, Color(1.0, 0.55, 0.45, a3) if l["warn"] else Color(0.75, 0.95, 1.0, a3))
		y += 20.0
