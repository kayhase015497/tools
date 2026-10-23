shader_type sky;
// 深色太空天空。sky_style 0＝原本的粉紫／藍星雲；1＝參考圖風格（深灰黑底、淡褐色塵帶、細密星點），F6 切換。
uniform vec3 nebula_red : source_color = vec3(0.85, 0.12, 0.3);
uniform vec3 nebula_purple : source_color = vec3(0.45, 0.2, 0.85);
uniform vec3 nebula_blue : source_color = vec3(0.15, 0.35, 0.9);
uniform float doom = 0.0;   // 劇本末日：星空壓暗、整體染深紅
uniform int sky_style = 0;
// V1 光照：只在反射／環境光用的立方體貼圖裡加「主光方向的柔光」與冷色底，讓金屬有東西可反射；看得到的背景不變
uniform float refl_lobe = 0.0;
uniform float refl_power = 5.0;
uniform vec3 refl_floor = vec3(0.0);

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
	float s = 0.0;
	float a = 0.5;
	for (int k = 0; k < 5; k++) {
		s += a * vnoise(p);
		p = p * 2.03 + vec3(1.7, 9.2, 3.1);
		a *= 0.5;
	}
	return s;
}

float glow(vec3 d, vec3 dir, float w) {
	return exp(-pow(acos(clamp(dot(d, normalize(dir)), -1.0, 1.0)), 2.0) / w);
}

vec3 sky_classic(vec3 d) {
	vec3 col = vec3(0.004, 0.006, 0.016);
	col += nebula_red * 0.75 * glow(d, vec3(-0.7, -0.25, -0.65), 0.25);
	col += nebula_purple * 0.6 * glow(d, vec3(0.1, 0.9, -0.3), 0.36);
	col += nebula_blue * 0.55 * glow(d, vec3(0.9, -0.1, 0.2), 0.25);
	return col;
}

vec3 sky_dust(vec3 d) {   // 參考圖：深灰黑底＋一條淡褐色塵帶（有暗色塵埃紋理）＋鐵墓方向一點暗紅
	vec3 col = vec3(0.005, 0.006, 0.009);
	float b = dot(d, normalize(vec3(0.35, 1.0, 0.15)));
	float band = exp(-b * b / 0.09);
	float n = fbm(d * 3.2);
	float lanes = fbm(d * 7.5 + 5.0);
	float dust = band * smoothstep(0.32, 0.8, n);
	vec3 tint = mix(vec3(0.22, 0.15, 0.11), vec3(0.11, 0.12, 0.15), fbm(d * 1.8 + 11.0));
	col += tint * dust * 0.32 * (1.0 - 0.75 * smoothstep(0.42, 0.72, lanes));
	col += vec3(0.05, 0.06, 0.08) * fbm(d * 1.5 + 21.0) * 0.35;   // 大面積很淡的冷色霧
	col += nebula_red * 0.06 * glow(d, vec3(-0.7, -0.25, -0.65), 0.2);
	return col;
}

void sky() {
	vec3 d = normalize(EYEDIR);
	vec3 col = sky_style == 1 ? sky_dust(d) : sky_classic(d);
	if (AT_CUBEMAP_PASS) {
		col += refl_floor * (0.65 + 0.35 * d.y);
		if (LIGHT0_ENABLED) {
			col += LIGHT0_COLOR * refl_lobe * pow(max(dot(d, LIGHT0_DIRECTION), 0.0), refl_power);
		}
	} else if (sky_style == 1) {   // 細密星點：塵帶裡更多，亮度與色溫有差異
		float band = exp(-pow(dot(d, normalize(vec3(0.35, 1.0, 0.15))), 2.0) / 0.12);
		vec3 g1 = floor(d * 420.0);
		float s1 = step(0.9955 - band * 0.004, hash13(g1)) * (0.25 + 1.6 * pow(hash13(g1 + 7.0), 3.0));
		vec3 g2 = floor(d * 900.0);
		float s2 = step(0.997 - band * 0.006, hash13(g2)) * 0.22;
		vec3 sc = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash13(g1 + 3.0));
		col += sc * (s1 + s2);
	} else {
		vec3 g = floor(d * 380.0);
		float star = step(0.9965, hash13(g)) * (0.4 + 2.2 * hash13(g + 7.0));
		col += vec3(0.85, 0.9, 1.0) * star;
	}
	col = mix(col, col * 0.35 + vec3(0.22, 0.015, 0.04) * (0.6 + 0.4 * (1.0 - abs(d.y))), doom);
	COLOR = col;
}
