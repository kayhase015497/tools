shader_type sky;
// 深色太空天空：細小星點＋幾團星雲（紅／紫／藍）。只用於驗證階段，之後可換成貼圖天空盒。
uniform vec3 nebula_red : source_color = vec3(0.85, 0.12, 0.3);
uniform vec3 nebula_purple : source_color = vec3(0.45, 0.2, 0.85);
uniform vec3 nebula_blue : source_color = vec3(0.15, 0.35, 0.9);

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }

void sky() {
	vec3 d = normalize(EYEDIR);
	vec3 col = vec3(0.004, 0.006, 0.016);
	col += nebula_red * 0.75 * exp(-pow(acos(clamp(dot(d, normalize(vec3(-0.7, -0.25, -0.65))), -1.0, 1.0)), 2.0) / 0.25);
	col += nebula_purple * 0.6 * exp(-pow(acos(clamp(dot(d, normalize(vec3(0.1, 0.9, -0.3))), -1.0, 1.0)), 2.0) / 0.36);
	col += nebula_blue * 0.55 * exp(-pow(acos(clamp(dot(d, normalize(vec3(0.9, -0.1, 0.2))), -1.0, 1.0)), 2.0) / 0.25);
	vec3 g = floor(d * 380.0);
	float h = hash13(g);
	float star = step(0.9965, h) * (0.4 + 2.2 * hash13(g + 7.0));
	col += vec3(0.85, 0.9, 1.0) * star;
	COLOR = col;
}
