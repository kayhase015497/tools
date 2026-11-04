shader_type sky;
// 深色太空天空：細小星點＋幾團星雲（紅／紫／藍）。只用於驗證階段，之後可換成貼圖天空盒。
uniform vec3 nebula_red : source_color = vec3(0.85, 0.12, 0.3);
uniform vec3 nebula_purple : source_color = vec3(0.45, 0.2, 0.85);
uniform vec3 nebula_blue : source_color = vec3(0.15, 0.35, 0.9);
uniform float doom = 0.0;   // 劇本末日：星空壓暗、整體染深紅
// V1 光照：只在反射／環境光用的立方體貼圖裡加「主光方向的柔光」與冷色底，讓金屬有東西可反射；看得到的背景不變
uniform float refl_lobe = 0.0;
uniform float refl_power = 5.0;
uniform vec3 refl_floor = vec3(0.0);

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
uniform float nebula_detail = 1.0;   // Build 26：雲氣結構（0＝關，Low 檔位）

float vnoise3(vec3 p) {
	vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	float a = hash13(i), b = hash13(i + vec3(1, 0, 0)), c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
	float e = hash13(i + vec3(0, 0, 1)), g = hash13(i + vec3(1, 0, 1)), h = hash13(i + vec3(0, 1, 1)), k = hash13(i + vec3(1, 1, 1));
	return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float fbm3(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise3(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }

void sky() {
	vec3 d = normalize(EYEDIR);
	vec3 col = vec3(0.004, 0.006, 0.016);
	col += nebula_red * 0.75 * exp(-pow(acos(clamp(dot(d, normalize(vec3(-0.7, -0.25, -0.65))), -1.0, 1.0)), 2.0) / 0.25);
	col += nebula_purple * 0.6 * exp(-pow(acos(clamp(dot(d, normalize(vec3(0.1, 0.9, -0.3))), -1.0, 1.0)), 2.0) / 0.36);
	col += nebula_blue * 0.55 * exp(-pow(acos(clamp(dot(d, normalize(vec3(0.9, -0.1, 0.2))), -1.0, 1.0)), 2.0) / 0.25);
	if (nebula_detail > 0.0) {
		// 雲氣：用 fbm 把三團色塊撕成絲狀結構，並疊一條銀河帶與暗塵帶
		float cl = fbm3(d * 3.2);
		float fil = fbm3(d * 7.5 + cl * 1.7);
		float lum = dot(col, vec3(0.3, 0.55, 0.15));
		col *= mix(1.0, 0.35 + 1.5 * smoothstep(0.25, 0.8, fil), nebula_detail);
		float band = exp(-pow(dot(d, normalize(vec3(0.25, 0.9, -0.35))) * 3.2, 2.0));
		float dust = smoothstep(0.45, 0.75, fbm3(d * 5.0 + 3.0));
		col += vec3(0.16, 0.14, 0.24) * band * (0.3 + 0.9 * fil) * (1.0 - 0.75 * dust) * 0.55 * nebula_detail;
	}
	vec3 g = floor(d * 380.0);
	float h = hash13(g);
	float star = step(0.9965, h) * (0.4 + 2.2 * hash13(g + 7.0));
	if (AT_CUBEMAP_PASS) {
		col += refl_floor * (0.65 + 0.35 * d.y);
		if (LIGHT0_ENABLED) {
			col += LIGHT0_COLOR * refl_lobe * pow(max(dot(d, LIGHT0_DIRECTION), 0.0), refl_power);
		}
	} else {
		vec3 tint = mix(vec3(1.0, 0.75, 0.6), vec3(0.65, 0.8, 1.0), hash13(g + 3.0));   // 星點色溫差異
		col += mix(vec3(0.85, 0.9, 1.0), tint, 0.7) * star;
	}
	col = mix(col, col * 0.35 + vec3(0.22, 0.015, 0.04) * (0.6 + 0.4 * (1.0 - abs(d.y))), doom);
	COLOR = col;
}
