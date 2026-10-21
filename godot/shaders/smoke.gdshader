shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;
// 濃煙：黑灰褐色的「花椰菜雲」，被爆炸火光從內側染橘（隨壽命褪去），內有紅橘餘燼光點；與背景星雲融合靠邊緣軟化。
uniform vec3 smoke_color : source_color = vec3(0.16, 0.15, 0.17);
uniform vec3 fire_color : source_color = vec3(1.0, 0.36, 0.08);
uniform float fire_glow = 1.0;
varying float age;
varying float seed;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }

void vertex() {
	age = INSTANCE_CUSTOM.y;
	seed = float(INSTANCE_ID) * 3.17 + INSTANCE_CUSTOM.x;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0, 0, 0), vec4(0, length(MODEL_MATRIX[1].xyz), 0, 0), vec4(0, 0, length(MODEL_MATRIX[2].xyz), 0), vec4(0, 0, 0, 1));
}

void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	float r = length(uv);
	if (r > 1.0) discard;
	vec2 q = uv * 1.3 + vec2(seed, seed * 0.61);
	float n = fbm(q + vec2(0.0, -age * 0.5));
	float lumps = smoothstep(0.3, 0.8, n * 1.1 + (1.0 - r) * 0.55);       // 圓鼓鼓的團塊
	float edge = smoothstep(1.0, 0.55, r);
	float a = lumps * edge * smoothstep(0.0, 0.08, age) * pow(clamp(1.0 - age, 0.0, 1.0), 0.8) * 0.92;
	if (a < 0.01) discard;
	// 內側被火光染橘：中心、早期最強；團塊亮面（n 高）更受光
	float lit = pow(clamp(1.0 - age, 0.0, 1.0), 4.0) * (0.3 + 0.7 * (1.0 - r)) * (0.5 + n) * fire_glow;
	// 餘燼光點：高頻噪聲的尖峰
	float ember = smoothstep(0.86, 0.95, vn(q * 7.0 + age * 2.0)) * (1.0 - age) * 2.2;
	vec3 col = smoke_color * (0.45 + 1.3 * n) + fire_color * lit + vec3(1.0, 0.3, 0.06) * ember;
	ALBEDO = col;
	ALPHA = a;
}
